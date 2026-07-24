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

## Voice recognition (optional)

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
