# Private VPS Operations

## Deploy

1. Install Docker Engine and the Compose plugin.
2. Clone the repository and create `.env` from `.env.example`.
3. Run `docker compose up -d --build`.
4. Register commands once with `docker compose run --rm bot node
dist/presentation/discord/register-commands.js`.

Neither Lavalink nor the health endpoint is published on the host.

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
