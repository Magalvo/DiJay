# Work-Spec: Implementation Plan for WI-017

## 1. Target Files

- **Production files:**
  - `lavalink/application.yml` — under `plugins.lavasrc.spotify`, remove the `clientId` and
    `clientSecret` keys and add `customTokenEndpoint`. Removing the keys (not just leaving their
    env vars empty) is deliberate: an unexpectedly-set `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`
    would otherwise silently revert LavaSrc to the broken, Premium-gated Client Credentials path
    (confirmed from `SpotifyTokenTracker.getAccessToken`: it only uses the anonymous path when
    credentials are absent or invalid). Target block:

    ```yaml
    spotify:
      # Anonymous token from the spotify-tokener sidecar (WI-017), used for every metadata call.
      # This replaces the Client Credentials flow, which now requires the credentials-owning
      # account to hold an active Premium subscription (see WI-017 for how this was confirmed).
      # Unofficial / outside Spotify's Terms of Service — see docs/canonical/operations.md.
      customTokenEndpoint: "http://spotify-tokener:8080/api/token"
      countryCode: "${SPOTIFY_COUNTRY_CODE:PT}"
      playlistLoadLimit: 6
      albumLoadLimit: 6
      resolveArtistsInSearch: true
    ```

  - `compose.yml` — on the `lavalink` service's `environment`, remove the `SPOTIFY_CLIENT_ID` and
    `SPOTIFY_CLIENT_SECRET` lines (now unused once `application.yml` no longer references them);
    keep `SPOTIFY_COUNTRY_CODE` (still used by `spotify.countryCode`).

  - `compose.spotify-tokener.yml` (**new**) — an optional overlay, mirroring the existing
    `compose.voice-listener.yml` pattern (a separate file so the base `compose.yml` stays lean
    and this stays opt-in, combined the same way voice-listener already is):

    ```yaml
    # Overlay that runs the spotify-tokener sidecar (WI-017) next to Lavalink, so Spotify
    # metadata resolves via an anonymous token instead of LavaSrc's Client Credentials flow
    # (which now requires the credentials-owning account to have an active Premium
    # subscription). Point lavalink/application.yml's customTokenEndpoint at it (already done)
    # and leave SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET out of .env entirely.
    #
    #   docker compose -f compose.yml -f compose.spotify-tokener.yml up -d --build
    #
    # Unofficial: outside Spotify's Terms of Service, and breaks if Spotify changes its
    # web-player token schema (upstream spotify-tokener would need updating). No personal
    # Spotify account or cookie is used — the token is fully anonymous. See
    # docs/canonical/operations.md for the accepted trade-off.
    #
    # Runs a persistent headless Chrome to fetch tokens (chromedp/headless-shell base image),
    # heavier than this project's other sidecars. mem_limit below is a starting point — verify
    # against actual usage (`docker stats`) on the VPS and adjust.
    services:
      spotify-tokener:
        image: ghcr.io/topi314/spotify-tokener:master
        restart: unless-stopped
        environment:
          SPOTIFY_TOKENER_LOG_LEVEL: info
        healthcheck:
          # The image (chromedp/headless-shell, debian:trixie-slim) has no nc/curl — only
          # socat — confirmed from its own build. A plain port check, not /api/token itself:
          # hitting the token endpoint would trigger a real Chrome navigation to Spotify on
          # every check interval for no operational benefit over a TCP check.
          test: ["CMD", "socat", "-u", "OPEN:/dev/null", "TCP4:127.0.0.1:8080"]
          interval: 30s
          timeout: 5s
          retries: 5
          start_period: 30s
        mem_limit: 1g
        logging:
          driver: json-file
          options:
            max-size: 10m
            max-file: "3"
        networks:
          - dijay-private
    ```

  - `.env.example` — remove `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` and the stale "a free
    Spotify account is enough" comment; keep `SPOTIFY_COUNTRY_CODE`. Add a new, purely
    descriptive `SPOTIFY_ENABLED` flag (default `false`) that the bot reads only to log an
    accurate boot message — it does not gate any behavior (Spotify resolution lives entirely in
    Lavalink/LavaSrc; the bot forwards every query blindly regardless of this flag, unchanged
    since WI-011). The operator sets it to `true` when they've also deployed
    `compose.spotify-tokener.yml`. This is a proposed design, not a WI-017 Resolved Decision — see
    §2 for the alternative considered.

  - `src/config/env.ts` — remove the `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET` zod fields and
    the `spotify.configured` derivation (`SPOTIFY_CLIENT_ID.length > 0 && SPOTIFY_CLIENT_SECRET...`);
    replace with `SPOTIFY_ENABLED: booleanFromString` (the schema already defines
    `booleanFromString`, reused as-is) and `spotify: { enabled: result.data.SPOTIFY_ENABLED }`.

  - `src/bootstrap.ts` — update the boot log (currently keyed on `config.spotify.configured`) to
    read `config.spotify.enabled` and describe the new mechanism:
    `"Spotify links enabled (anonymous token via spotify-tokener)"` /
    `"Spotify not configured; Spotify links will not resolve"`.

  - `docs/canonical/operations.md` — rewrite the "Spotify (LavaSrc)" section (currently lines
    13–34): drop the Developer Dashboard/Client-Credentials instructions, replace with
    `compose.spotify-tokener.yml` deployment steps, and document explicitly (per WI-017's
    acceptance criteria): the mechanism is unofficial and outside Spotify's Terms of Service, the
    realistic failure mode (breaks if Spotify changes its web-player token schema — not an
    account ban, since no personal account/cookie is used), and that Spotify-generated/algorithmic
    playlists (ids starting `37i9dQZ`) remain permanently unresolvable regardless.

  - `docs/work-items/WI-011-spotify-playlists.md` — **not modified**. It is the historical record
    of what WI-011 shipped (Client Credentials); WI-017 supersedes its Spotify-configuration
    approach going forward without rewriting that history, the same way WI-015/WI-016 extended
    WI-014 without editing it.

- **Test files:**
  - `tests/unit/config/env.test.ts` — replace "treats Spotify as unconfigured unless both
    credentials are present" (asserts on the now-removed `SPOTIFY_CLIENT_ID`/`_SECRET`) with a
    test for `SPOTIFY_ENABLED` defaulting to `false` and reflecting the env value when set.
  - No test exists or is added for `src/bootstrap.ts` itself — it has no dedicated test file
    today (confirmed: none in `tests/`), consistent with it being wiring code exercised live.
  - No test file changes are needed for `lavalink/application.yml`, `compose*.yml`, or
    `docs/canonical/operations.md` — these have no `src`/`tests` surface; per WI-017, the
    acceptance test is live Spotify resolution behavior on a running deployment.

## 2. Proposed Technical Approach

Nothing in the bot's own resolution path changes: `PoruMusicGateway` already forwards every
query to `poru.resolve()` unconditionally (confirmed in `src/infrastructure/lavalink/poru-music-gateway.ts`)
and has never branched on Spotify configuration. All of WI-017's substance is Lavalink/Docker
configuration: `application.yml` drops the Premium-gated Client Credentials keys in favor of
`customTokenEndpoint`, and a new optional Compose overlay (`compose.spotify-tokener.yml`) runs the
sidecar that supplies that endpoint — kept as its own overlay file, not folded into the mandatory
`compose.yml`, so a deployment can still run without accepting WI-017's unofficial-mechanism
trade-off, matching how `compose.voice-listener.yml` already keeps an optional feature separable.

Two design points introduced beyond what WI-017 already resolved:

1. **Removing `clientId`/`clientSecret` from `application.yml` entirely**, not just relying on
   empty env vars, so a later, unrelated `SPOTIFY_CLIENT_ID` being set in `.env` cannot silently
   revert Spotify resolution to the broken Premium-gated path — the failure mode would otherwise
   be confusing (metadata calls 403'ing again with no config change apparent to whoever hit it).

2. **A new `SPOTIFY_ENABLED` bot-side flag**, purely descriptive (mirrors `VOICE_ENABLED`'s
   naming). The bot has no way to know whether `spotify-tokener` is actually deployed or reachable
   — Spotify configuration now lives entirely in Lavalink, invisible to the bot — so this flag is
   operator-asserted, not verified. The alternative considered and rejected for this spec: an
   actual startup connectivity probe from the bot to the tokener sidecar. That would give a
   verified rather than asserted boot log, but adds a new kind of cross-service coupling at boot
   that nothing else in this bot does today (every other "is this configured" check in
   `env.ts` is local env-var validation, never a network call), for a benefit — catching a
   forgotten overlay — an operator would also notice within seconds of testing a `/play` with a
   Spotify link. Deferred unless this proves to be a recurring real mistake.

The `spotify-tokener` healthcheck uses `socat` for a plain TCP port check (confirmed present in
the image; `nc`/`curl` are not, per its `debian:trixie-slim`-based `Containerfile`) rather than
hitting `/api/token` — the token endpoint drives a real headless-Chrome navigation to Spotify, so
polling it every 30s for health would add load and Spotify-facing traffic for no benefit over a
port check.

## 3. Testing Strategy (TDD)

- **Red:** `tests/unit/config/env.test.ts` gets a new case asserting `SPOTIFY_ENABLED` defaults
  to `false` and parses to `true` when set — this replaces the old credentials-based test, which
  will fail to compile/pass once `SPOTIFY_CLIENT_ID`/`_SECRET` are removed from the schema.
- **Green:** Implement the `SPOTIFY_ENABLED` field and `spotify.enabled` derivation in `env.ts`,
  and the updated boot-log message in `bootstrap.ts`.
- **Refactor:** Run the full gate set (`typecheck`, `lint`, `test`, `build`) for the bot-side
  change. The Lavalink/Compose/docs changes have no automated gate — validate live per WI-017's
  acceptance criteria: a Spotify track/album/regular-playlist URL resolves through `/play` and
  `/playlist add` with `SPOTIFY_CLIENT_ID`/`_SECRET` unset and only the tokener overlay running;
  a Spotify-generated playlist (`37i9dQZ...`) fails gracefully (skipped/reported, not fatal); the
  tokener container reports healthy via its `socat` check; stopping the tokener container makes
  Spotify links fail gracefully without affecting other sources.

## Open Decisions

- Whether `SPOTIFY_ENABLED` is the right name/shape for the bot-side descriptive flag, or whether
  to drop the boot-time Spotify log entirely now that the bot has no real visibility into it.
- The proposed `mem_limit: 1g` for `spotify-tokener` is a starting point only — validate against
  `docker stats` on the VPS once running and adjust up or down.
- Whether to also add a Compose `depends_on`/ordering hint from `lavalink` to `spotify-tokener`
  (Lavalink doesn't hard-require it at boot — it degrades to LavaSrc's own, more fragile built-in
  anonymous-token scraping if the endpoint is briefly unreachable — so this is a nice-to-have for
  startup ordering, not a correctness requirement).
