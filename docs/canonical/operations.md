# Private VPS Operations

## Deploy

1. Install Docker Engine and the Compose plugin.
2. Clone the repository and create `.env` from `.env.example`.
3. Run `docker compose up -d --build`.
4. Register commands once with `docker compose run --rm bot node
dist/presentation/discord/register-commands.js`.

Neither Lavalink nor the health endpoint is published on the host.

## Spotify (LavaSrc)

Spotify links resolve through the LavaSrc plugin, which reads metadata with a free Spotify
account and mirrors playback through YouTube. Credentials are consumed by Lavalink, not the
bot.

1. Create an app at <https://developer.spotify.com/dashboard> (only the Web API is needed;
   Premium is not required) and copy the Client ID and Client Secret.
2. Add them to `.env` on the VPS:

   ```
   SPOTIFY_CLIENT_ID=...
   SPOTIFY_CLIENT_SECRET=...
   SPOTIFY_COUNTRY_CODE=PT
   ```

3. Recreate Lavalink so it downloads the plugin and picks up the credentials:

   `docker compose up -d --force-recreate lavalink`

Leaving the credentials empty keeps every other source working; Spotify links simply fail
to resolve.

## Troubleshooting: YouTube playback breaks

If `/play` finds results (autocomplete works) but tracks fail to load — the bot replies "Não
encontrei nenhuma faixa" and the Lavalink logs show
`ScriptExtractionException: Must find sig function` — YouTube changed its player script and the
`youtube-plugin` is outdated. This is recurring maintenance, not a bot bug.

1. Bump `dev.lavalink.youtube:youtube-plugin` in `lavalink/application.yml` to the latest
   release (see <https://github.com/lavalink-devs/youtube-source/releases>).
2. Recreate Lavalink so it downloads the new plugin (the file is volume-mounted, no image
   rebuild needed):

   `docker compose up -d --force-recreate lavalink`

If a version bump alone stops working, YouTube may require OAuth/poToken; configure it per the
plugin's README.

## Voice recognition — in-process (legacy)

> The **voice-listener sidecar** below is the recommended way to run voice. It does not
> interrupt playback and does not block the main bot. Use this in-process mode only for a quick
> single-bot trial.

The default image excludes the native voice/STT packages. To run `/listen` on the VPS, use
the Debian voice image and mount a Vosk model.

1. Download a Portuguese model to `./models` on the host (the small model is enough and fits
   the container memory):

   ```
   mkdir -p models
   curl -L -o /tmp/vosk-pt.zip \
     https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip
   unzip /tmp/vosk-pt.zip -d models
   ```

   The result must be `models/vosk-model-small-pt-0.3/` containing `conf/model.conf`.

2. Keep `VOICE_ENABLED` out of `.env` (the overlay sets it) or set it to `true`. Build and
   start with the voice overlay:

   `docker compose -f compose.yml -f compose.voice.yml up -d --build`

3. Register commands once (the `/listen` command must exist):

   `docker compose -f compose.yml -f compose.voice.yml run --rm bot node
dist/presentation/discord/register-commands.js`

The overlay builds `Dockerfile.voice`, mounts `./models` read-only, and enables voice. The
model path defaults to `/app/models/vosk-model-small-pt-0.3`; adjust
`VOICE_STT_MODEL_PATH` in `compose.voice.yml` if you use a different model. On startup the
bot logs `Voice recognition enabled`; a startup error prints the real cause (missing model
or library) under `err`.

Because Lavalink holds the guild voice connection while playing, `/listen` takes it over
for a short capture window.

## Voice-listener sidecar (recommended)

A dedicated second bot receives voice in its own process and forwards recognized commands to
the main bot over the private network. Because it is a separate identity it never takes the
Lavalink voice connection (playback keeps running), and because it is a separate process the
main bot is never blocked by transcription.

1. Create a **second Discord application** (its own bot) and invite it to the same server with
   only **View Channels + Connect** and the `applications.commands` scope. Copy its bot token
   (Bot tab) and its application/client id.

2. Download a Vosk model into `./models` on the host (small models are enough and fit the
   memory limit):

   ```
   mkdir -p models
   # Portuguese: vosk-model-small-pt-0.3 · English: vosk-model-small-en-us-0.15
   curl -L -o /tmp/vosk.zip https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip
   unzip /tmp/vosk.zip -d models && rm /tmp/vosk.zip
   ```

   The result must be e.g. `models/vosk-model-small-pt-0.3/` containing `conf/model.conf`.

3. Set in `.env` (the main bot enables its internal IPC endpoint automatically when the secret
   is present; the listener reaches it at `http://bot:3100`):

   ```
   VOICE_BOT_TOKEN=...            # the second bot's token
   VOICE_BOT_CLIENT_ID=...        # the second app's id
   VOICE_IPC_SECRET=...           # shared secret, >= 16 chars (openssl rand -hex 32)
   VOICE_LANGUAGE=pt              # or en
   VOICE_STT_MODEL_PATH=./models/vosk-model-small-pt-0.3   # match the language
   VOICE_WAKE_WORD_ENABLED=false  # true for hands-free "dj ..." mode
   VOICE_SOUNDBOARD_SOUNDS=       # e.g. gelado:<soundId> (see Soundboard triggers below)
   ```

4. Build and start the sidecar next to the main bot:

   `docker compose -f compose.yml -f compose.voice-listener.yml up -d --build`

   Confirm in the logs: the main bot prints `Voice command IPC server listening` and the
   listener prints `Voice listener ready`. The second bot then shows as online.

Modes:

- **Push-to-talk** (`VOICE_WAKE_WORD_ENABLED=false`): run `/listen` (registered by the second
  bot) in a voice channel and speak one command.
- **Hands-free** (`VOICE_WAKE_WORD_ENABLED=true`): the listener follows people into the channel
  and acts on any utterance beginning with the wake word `dj` (e.g. "dj skip"). The music
  changing is the only feedback — the listener has no send permission and no interaction.

Soundboard triggers (WI-015): in hands-free mode, self-triggering words play a native Discord
soundboard sound over the music, with no `dj` prefix. Map each trigger to a sound id in
`VOICE_SOUNDBOARD_SOUNDS` (comma-separated `key:soundId`, e.g. `gelado:1234567890123456789`);
the key must be a recognized trigger (currently `gelado`, `leite`). The sound must already exist in the
server's soundboard, and the **listener** bot needs the **Use Soundboard** permission and to be
unmuted (the sidecar joins unmuted for this). Same-server sounds need no "Use External Sounds".
Get the sound id from the Discord API (the soundboard is not surfaced in the client UI id copy).
Leave empty to disable.

Language toggle (WI-016): switch PT/EN at runtime with `/settings voice-language` — no restart.
The choice is stored per guild; the listener polls the main bot and reloads the model within a
few seconds. For this to work, download BOTH models into `./models` and set both
`VOICE_STT_MODEL_PATH_PT` and `VOICE_STT_MODEL_PATH_EN` in `.env`; with only one model, the
toggle to the missing language is a logged no-op. `VOICE_LANGUAGE` remains the initial language
at boot. A relative model path works in Docker (it resolves under `/app` via the `./models`
mount) and locally. (The main bot's in-process `/listen`, if used instead of the sidecar, still
follows `VOICE_LANGUAGE` and needs a restart to change.)

Privacy and limits: nothing is persisted and no transcript is logged. Hands-free mode
transcribes channel speech continuously in the listener process — a deliberate CPU/privacy
trade-off, off by default. Discord voice receive is officially unsupported; acceptable for a
private server.

## Update and rollback

- Before updating, create a backup and record the current Git revision.
- Update with `git pull`, `docker compose build --pull bot`, then
  `docker compose up -d`.
- Roll back by checking out the recorded revision and running the same build/up commands.
- Inspect health with `docker compose ps` and logs with `docker compose logs --tail=200`.

## Backup and restore

Create a consistent backup:

`docker compose exec bot npm run db:backup`

Schedule that command daily with cron. Backups are stored inside the persistent data
volume under `/app/data/backups`. Copy them off-host regularly:

`docker compose cp bot:/app/data/backups ./backups`

To restore:

1. `docker compose stop bot`
2. Ensure the selected backup is already under `/app/data/backups`, then run:
   `docker compose run --rm --entrypoint sh bot -c "cp
/app/data/backups/BACKUP.sqlite /app/data/dijay.sqlite && rm -f
/app/data/dijay.sqlite-wal /app/data/dijay.sqlite-shm"`.
3. Replace `BACKUP.sqlite` with the selected filename.
4. `docker compose start bot`

Never replace the live database while the bot container is running.
