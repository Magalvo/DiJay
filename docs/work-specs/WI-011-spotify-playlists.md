# Work-Spec: WI-011 - Spotify Playlist Import and Playback

## Target Files

- **Production files:** `lavalink/application.yml` (LavaSrc plugin + sources),
  `compose.yml` / `.env.example` (Spotify credentials), `src/config/env.ts`,
  `src/infrastructure/lavalink/poru-music-gateway.ts` (source detection),
  `src/application/playlists/playlist-service.ts` (optional import path)
- **Test files:** `tests/unit/config/env.test.ts`,
  `tests/unit/infrastructure/poru-music-gateway.test.ts`

## Approach

Add the LavaSrc plugin to Lavalink and register the `spsearch`/`sprec` sources with
Spotify client id/secret. Because the bot already routes queries through
`poru.resolve`, most changes are configuration: Poru forwards Spotify URLs to LavaSrc,
which returns playable mirrored tracks. In the adapter, detect Spotify URLs to keep the
`ytsearch` default for plain text while letting URLs resolve via the plugin. Validate the
new credentials in `env.ts` and treat them as optional so the bot still boots without
Spotify. Reuse the existing playlist storage for imports.

## TDD

- **Red:** An env test requires optional Spotify settings; a gateway test asserts a Spotify
  URL is resolved through the plugin path (mocked `resolve`).
- **Green:** Parse the settings and route URLs accordingly.
- **Refactor:** Keep the domain unaware of Spotify, document the plugin setup in
  `operations.md`, and run all gates.

## Open Decisions

- Confirm the mirror source (YouTube vs Deezer) and whether a rate-limit/backoff is needed
  for large playlists.
