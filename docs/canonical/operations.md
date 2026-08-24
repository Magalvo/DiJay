# Private VPS Operations

## Deploy

1. Install Docker Engine and the Compose plugin.
2. Clone the repository and create `.env` from `.env.example`.
3. Run `docker compose up -d --build`.
4. Register commands once with `docker compose run --rm bot node
dist/presentation/discord/register-commands.js`.

Neither Lavalink nor the health endpoint is published on the host.

## Self-heal

Both the main bot and the DiJayMic (voice-listener) sidecar carry a self-heal watchdog: if a
process is alive but stuck — most commonly a zombied Discord gateway connection that stops
receiving data without ever cleanly disconnecting or reconnecting — for longer than
`SELF_HEAL_GRACE_PERIOD_SECONDS` (default 180s), it logs a full diagnostic and exits with a
non-zero code. `restart: unless-stopped` in `compose.yml`/`compose.voice-listener.yml` then
recovers it automatically.

This exists because a plain Docker `HEALTHCHECK` does **not** restart a running-but-unhealthy
container on its own — the `restart` policy only triggers once the process actually exits.
`healthcheck:` blocks in the compose files are for observability (`docker compose ps`); the
actual recovery mechanism is each process detecting its own stuck state and exiting.

The watchdog only starts counting after the process has successfully become healthy at least
once, so a slow cold boot (e.g. waiting on Lavalink to come up) is never mistaken for "stuck".

Look for `"Self-heal: unhealthy past the grace period, exiting so the container restarts"` in
`docker compose logs bot` / `docker compose logs voice-listener` to confirm a restart was
self-heal-triggered rather than a crash; the same log line reports which check was failing
(`discord`/`lavalink` for the bot, `discordReady` for the sidecar) and for how long.

Tune or disable in `.env` (applies to both processes):

```
SELF_HEAL_ENABLED=true
SELF_HEAL_GRACE_PERIOD_SECONDS=180
```

Set `SELF_HEAL_ENABLED=false` during a known, prolonged outage (e.g. a sustained Discord
incident) where repeated restarts would not help and would just add log noise.

## Spotify (LavaSrc)

Spotify links resolve through the LavaSrc plugin, which reads Spotify metadata and mirrors
playback through YouTube. The old Spotify Client Credentials setup is no longer documented here:
Spotify now requires the developer-app owner account to have Premium before that API path works.
DiJay instead uses LavaSrc's anonymous-token path through the optional `spotify-tokener` sidecar.

1. Keep `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` out of `.env`. `lavalink/application.yml`
   intentionally does not reference them, so a later accidental credential value cannot switch
   LavaSrc back to the Premium-gated path.
2. Set the country code and the descriptive startup-log flag in `.env`:

   ```
   SPOTIFY_ENABLED=true
   SPOTIFY_COUNTRY_CODE=PT
   ```

   `SPOTIFY_ENABLED` is read only by the bot startup log. It does not gate playback; Lavalink
   owns Spotify resolution.

3. Start Lavalink with the tokener overlay:

   `docker compose -f compose.yml -f compose.spotify-tokener.yml up -d --build`

4. Confirm both services are healthy:

   `docker compose -f compose.yml -f compose.spotify-tokener.yml ps`

This mechanism is unofficial and outside Spotify's Terms of Service. No personal Spotify account,
cookie, or token is used; the sidecar fetches a fully anonymous token through Spotify's web-player
flow. The realistic failure mode is Spotify changing that internal web-player token schema, which
would break Spotify resolution until `spotify-tokener` is updated upstream.

Spotify-generated and algorithmic playlists, including ids starting with `37i9dQZ` such as
Discover Weekly and Daily Mix, remain permanently unresolvable with anonymous tokens. Regular
tracks, albums, and user-created/shared playlists are the supported Spotify targets.

If the tokener overlay is not deployed, unreachable, or broken, Spotify links should fail
gracefully while other Lavalink sources keep working.

## Playback smoke check (early warning)

Both failure modes below are silent: nothing errors, `/play` still answers normally, and the
breakage is usually discovered when someone complains. This check is the early warning.

It runs on a schedule, plays a real track at volume 0 in a chosen voice channel, and confirms
the playback position advanced. That last step is the point — search resolving proves nothing,
since the common failure keeps search working while the stream dies. A run that cannot reach
the stream stage reports `skipped`, never `passed`.

Enable it in `.env`:

```
PLAYBACK_CHECK_ENABLED=true
PLAYBACK_CHECK_VOICE_CHANNEL_ID=<a voice channel the bot may join>
PLAYBACK_CHECK_ALERT_CHANNEL_ID=<text channel for alerts>
PLAYBACK_CHECK_INTERVAL_MINUTES=30
```

Behaviour worth knowing:

- **It never interrupts anyone.** If a player already exists for the guild (someone is
  listening), the run skips itself.
- **It alerts on transitions, not on every run**: one message when playback breaks, one when
  it recovers. Without an alert channel the result stays in the logs.
- **Without `PLAYBACK_CHECK_VOICE_CHANNEL_ID`** it can only verify search, so it reports
  `skipped` and logs a warning at startup. Treat that as "unverified", not "healthy".
- **`/diag`** runs the same check on demand and replies privately with the stage reached.
  Register commands after deploying, since `/diag` is new.

Read the verdict as: `passed` → audio really flowed; `failed` → the `reachedStage` field says
which layer broke (`node`, `resolve`, or `stream`); `skipped` → nothing was proven.

A `failed` at the `stream` stage is the signature of the second failure mode below.

## Troubleshooting: YouTube playback breaks

YouTube tightens its anti-bot/anti-scraper measures periodically, breaking `youtube-plugin` in
one of two distinct ways — check the Lavalink logs to tell them apart, since the fix differs:

**Resolution fails** (`/play` replies "Não encontrei nenhuma faixa", the bot never joins):
Lavalink logs show `ScriptExtractionException: Must find sig function`. YouTube changed its
player script and the plugin's own scraping is outdated. Deciphering is delegated to the
`yt-cipher` sidecar precisely so this class of breakage is absorbed there — see the section
below before reaching for a plugin bump.

**Resolution succeeds but playback is silent** (a track title shows, the bot joins, no audio):
Lavalink logs show a `TrackExceptionEvent` with something like `This video requires login` or
`No supported audio streams available` — the track's metadata loaded fine, but every configured
client failed to fetch a playable stream. YouTube is treating the request as needing a real
signed-in account, not just an outdated scraper. As of `youtube-plugin` 1.18.2 (the latest
release), **no client streams YouTube unauthenticated** — verified against `TV`,
`TVHTML5_SIMPLY`, `IOS`, `MWEB`, `ANDROID`, `ANDROID_MUSIC`, `ANDROID_VR`, `WEB` and
`WEBEMBEDDED`: each fails with "This video requires login", "Sign in to confirm you're not a
bot", or — for `WEB` — "No supported audio streams available", now that YouTube serves it
SABR-only formats. Search keeps working throughout, because it only reads metadata. Go straight
to the OAuth steps below; a version bump cannot fix this one.

For a resolution failure, start with a plugin update — cheap and often enough on its own:

1. Bump `dev.lavalink.youtube:youtube-plugin` in `lavalink/application.yml` to the latest
   release (see <https://github.com/lavalink-devs/youtube-source/releases>).
2. Recreate Lavalink so it downloads the new plugin (the file is volume-mounted, no image
   rebuild needed):

   `docker compose up -d --force-recreate lavalink`

### The plugin is pinned to a snapshot, not a release

`lavalink/application.yml` pins `youtube-plugin` to a `main`-branch commit with `snapshot: true`,
because a release carrying the fix does not exist yet. Around 2026-08-18 YouTube began rejecting
Cobalt-family User-Agents on the TVHTML5 player endpoint, answering `UNPLAYABLE` /
"The page needs to be reloaded." `TV` is the only OAuth-capable client, so that killed
authenticated playback outright even with a valid refresh token — bot joins, announces, silence.
Upstream [issue #226](https://github.com/lavalink-devs/youtube-source/issues/226), fixed by
[#233](https://github.com/lavalink-devs/youtube-source/pull/233) (PlayStation 4 User-Agent),
merged 2026-08-19; 1.18.2 predates it.

Move back to a released version once one ships the fix (>= 1.18.3), so the deployment is not
tracking an unreleased build indefinitely. Snapshot versions are commit SHAs, listed at
<https://maven.lavalink.dev/snapshots/dev/lavalink/youtube/youtube-plugin/maven-metadata.xml>.

Only Lavalink needs recreating after a plugin change — the file is volume-mounted:

`docker compose up -d --force-recreate lavalink`

**Changes to the bot's own code need an image rebuild.** `--force-recreate lavalink` restarts
Lavalink alone, and `docker compose up -d bot` reuses the existing image, so a `git pull` that
touched `src/` is not live until:

`docker compose up -d --build bot`

Check `docker compose ps` — the `CREATED` column shows the image age. A bot container created
long before the last deploy is running old code.

### The yt-cipher sidecar

`compose.yml` runs `yt-cipher`, which deciphers YouTube's signature and n-parameter challenges
on Lavalink's behalf (`plugins.youtube.remoteCipher` in `application.yml`). It is not optional.
The plugin's own regex-based extraction fails on the current player script:

`Must find sig function from script: /s/player/<id>/player_embed.vflset/<locale>/base.js`

which lands on the very last step of playback — OAuth working, the client accepted, formats
listed, and then no stream. Upstream's standing answer to that error is a remote cipher server
rather than a plugin fix; the maintainer says so directly in
[issue #225](https://github.com/lavalink-devs/youtube-source/issues/225).

`OVERRIDE_PLAYER_VARIANT: IAS` in `compose.yml` matters: upstream reports only the IAS variant
works consistently, and `player_embed` — the one the plugin asks for — is exactly the one that
fails. Forcing IAS is what makes the failure go away.

Set `YT_CIPHER_PASSWORD` in `.env` to any value; both sides read the same variable, so it only
has to match. Generate one with `openssl rand -hex 32`. Empty disables auth on the sidecar,
which is survivable only because it is never published off the private Docker network. It is
not a Google credential and has nothing to do with the OAuth token.

The image has no healthcheck because it is a compiled Deno binary on distroless — no shell,
curl, nc or deno CLI to run one with. If it is down, Lavalink logs a cipher error per track.

### Completing the YouTube OAuth login

`plugins.youtube.oauth` is enabled in `lavalink/application.yml`, but it does nothing until an
account is linked: the plugin needs a refresh token, and `YOUTUBE_OAUTH_REFRESH_TOKEN` starts
empty. OAuth is the plugin's own recommendation over the narrower WEB/WEBEMBEDDED-only poToken
option.

> **Use a burner Google account.** The plugin prints `DO NOT AUTHORISE WITH YOUR MAIN ACCOUNT`
> for a reason: the linked account carries the ban risk if YouTube decides the traffic is
> automated.

1. With `YOUTUBE_OAUTH_REFRESH_TOKEN` empty, `docker compose up -d --force-recreate lavalink`,
   then watch `docker compose logs -f lavalink`. Within a minute it prints a device code:

   `OAUTH INTEGRATION: To give youtube-source access to your account, go to https://www.google.com/device and enter code XXX-XXX-XXXX`

2. Open <https://www.google.com/device> in a browser, enter that code, and sign in with the
   burner account.
3. Lavalink prints a refresh token to the logs once the login completes. Set
   `YOUTUBE_OAUTH_REFRESH_TOKEN` to that value in `.env` — **never** paste it into
   `application.yml`, which is committed to the repo — then
   `docker compose up -d --force-recreate lavalink` once more so it persists across restarts
   without redoing the device login.

The `clients:` list must keep `TV` for any of this to matter. OAuth is only ever applied to a
client whose `supportsOAuth()` returns true, and in the plugin's source `TV` is the only one
that overrides the default `false` — none of `MUSIC`/`ANDROID_VR`/`WEB`/`WEBEMBEDDED` ever send
the token. Drop `TV` and a fully authenticated setup has zero effect: Lavalink logs `OAuth has
been enabled without registering any OAuth-compatible clients` at startup and "This video
requires login" persists identically.

**The identifier is `TV`, not `TVHTML5`.** Lavalink _logs_ the resolved client as `TVHTML5`, so
the wrong name reads as correct, but `ClientProvider` cannot resolve it — it emits one `Failed
to resolve TVHTML5 into a Client` WARN and silently drops the entry, leaving OAuth inert with no
other symptom. After editing the list, check the startup line:

`YouTube source initialised with clients: WEB_REMIX, TVHTML5, ANDROID_VR, WEB, WEB_EMBEDDED_PLAYER`

If `TVHTML5` is absent from it, the entry did not take.

Even with OAuth correctly applied, success is not guaranteed for every video — YouTube's own
age/region gating can still refuse a request regardless of account.

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
server's soundboard, and the **listener** bot needs both the **Speak** and **Use Soundboard**
permissions and to be unmuted (the sidecar joins unmuted for this). Discord requires both
permissions together for a soundboard sound to actually be heard by others — `Use Soundboard`
alone is not enough: the REST call to trigger the sound still succeeds and logs "Soundboard sound
played" with only `Use Soundboard`, because permission enforcement for that request happens at
Discord's voice/media layer, not at the REST layer, so a missing `Speak` fails silently instead of
erroring. Same-server sounds need no "Use External Sounds". If the sound still is not heard with
both permissions granted, check each listener's own client setting (User Settings, Voice & Video,
"Play soundboard sounds"), which silences all soundboard audio for that user regardless of bot
configuration. Get the sound id from the Discord API (the soundboard is not surfaced in the
client UI id copy). Leave empty to disable.

Language toggle (WI-016): switch PT/EN at runtime with `/settings voice-language` — no restart.
The choice is stored per guild; the listener polls the main bot and reloads the model within a
few seconds. For this to work, download BOTH models into `./models` and set both
`VOICE_STT_MODEL_PATH_PT` and `VOICE_STT_MODEL_PATH_EN` in `.env`; with only one model, the
toggle to the missing language is a logged no-op. `VOICE_LANGUAGE` remains the initial language
at boot. A relative model path works in Docker (it resolves under `/app` via the `./models`
mount) and locally. (The main bot's in-process `/listen`, if used instead of the sidecar, still
follows `VOICE_LANGUAGE` and needs a restart to change.)

Voice toggles: three independent per-guild switches, same live poll as the language toggle (a
few seconds to take effect, no restart).

- `/settings voice-commands <enabled>` — the "dj \<command\>" playback control path (hands-free
  and `/listen`). Turning it off replies to `/listen` with a clear message instead of capturing,
  and hands-free mode simply stops forwarding recognized commands.
- `/settings voice-sounds <enabled>` — spoken-phrase audio-action clips and the native
  soundboard triggers above (both share this one switch, since they are both self-contained
  "hear the word, play the thing" triggers with no `dj` prefix). Hands-free mode only.
  **Does not** cover the join greetings below — those are a different mechanism (see next).
- `/settings voice-join-greeting <enabled>` — the member-join greetings from the "Audio actions"
  section below: `voice_member_join` (main bot, via Lavalink) and `voice_listener_member_join`
  (DiJayMic sidecar). Both play on a **person** entering the voice channel the bot is already
  active in, not on recognizing speech, which is why they get their own switch instead of
  sharing `voice-sounds`. **Does not** cover `voice_listener_join` (DiJayMic's own greeting when
  _it_ auto-joins a channel, not a person) — disable that one by removing its entry from
  `actions.json` instead.

All three default to enabled and are independent: keep `voice-sounds` on for "gelado"/"leite"
while turning `voice-commands` off (e.g. to stop accidental "dj stop" mid-party), turn off
`voice-join-greeting` on its own to stop the welcome sound without touching the others, etc.

Privacy and limits: nothing is persisted and no transcript is logged. Hands-free mode
transcribes channel speech continuously in the listener process — a deliberate CPU/privacy
trade-off, off by default. Discord voice receive is officially unsupported; acceptable for a
private server.

## Audio actions

Audio actions use `audio-actions/actions.json` as the shared manifest for short local clips.
Main-bot actions play through Lavalink and are queued in the existing music player. DiJayMic
actions play through the listener sidecar's current `@discordjs/voice` connection. Neither path
joins voice only to play a clip.

1. Create the host directory and add your clip:

   ```
   mkdir -p audio-actions
   cp greeting.mp3 audio-actions/greeting.mp3
   cp gelado.mp3 audio-actions/gelado.mp3
   ```

2. Create `audio-actions/actions.json`:

   ```json
   {
     "actions": [
       {
         "id": "voice_join_greeting",
         "target": "main_bot",
         "trigger": "voice_member_join",
         "file": "greeting.mp3",
         "message": "Viva, sou o DJ do server. Se quiseres ouvir musica ou pausar, usa os comandos do canal de musica.",
         "cooldownSeconds": 86400
       },
       {
         "id": "mic_greeting",
         "target": "voice_listener",
         "trigger": "voice_listener_join",
         "file": "greeting.mp3",
         "cooldownSeconds": 86400
       },
       {
         "id": "member_greeting",
         "target": "voice_listener",
         "trigger": "voice_listener_member_join",
         "file": "greeting.mp3",
         "cooldownSeconds": 0
       },
       {
         "id": "gelado",
         "target": "voice_listener",
         "trigger": "spoken_phrase",
         "phrases": { "pt": ["gelado"], "en": ["gelado"] },
         "file": "gelado.mp3",
         "cooldownSeconds": 10
       }
     ]
   }
   ```

3. Enable it in `.env`:

   ```
   AUDIO_ACTIONS_ENABLED=true
   AUDIO_ACTIONS_DIR=/app/audio-actions
   AUDIO_ACTIONS_MANIFEST=/app/audio-actions/actions.json
   AUDIO_ACTIONS_BASE_URL=http://bot:3000/audio-actions
   ```

4. Rebuild/recreate the services that consume the manifest:

   `docker compose -f compose.yml -f compose.spotify-tokener.yml -f compose.voice-listener.yml up -d --build --force-recreate bot voice-listener`

Only relative `.mp3`, `.ogg`, and `.wav` files are accepted in the manifest. If the manifest is
invalid, the consuming process logs the error and disables manifest audio actions without
affecting music playback, wake-word listening, soundboard triggers, or IPC.

Notes:

- `voice_member_join` is for the main DiJay bot and only fires when DiJay already has an active
  Lavalink player in that voice channel. The clip is queued next, not overlaid perfectly over the
  music.
- `voice_listener_join` is for DiJayMic when it auto-joins in hands-free mode.
- `voice_listener_member_join` is for DiJayMic when another non-bot member joins or moves into
  the voice channel where DiJayMic is already connected. Use `cooldownSeconds: 0` to greet every
  time, or a larger value such as `86400` to greet each user once per day.
- `voice_member_join` and `voice_listener_member_join` are both toggled together per guild by
  `/settings voice-join-greeting` (see "Voice-listener sidecar" above); `voice_listener_join` is
  not covered by that toggle and is disabled by removing it from the manifest instead.
- `spoken_phrase` is for DiJayMic local clips. Matching uses normalized whole phrases/tokens, so
  `gelado` does not fire on `congelado`.
- New local DiJayMic clips should be added to the manifest, not to new env vars.

### DiJayMic legacy greeting

`VOICE_GREETING_*` still works as a temporary compatibility fallback when no
`voice_listener_join` manifest action exists:

```
VOICE_WAKE_WORD_ENABLED=true
VOICE_GREETING_ENABLED=true
VOICE_GREETING_FILE=/app/audio-actions/greeting.mp3
VOICE_GREETING_COOLDOWN_SECONDS=86400
```

Prefer the manifest for new deployments because it also feeds the Vosk grammar and keeps clips in
one place.

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
