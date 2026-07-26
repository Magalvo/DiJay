# Work-Item: WI-017 - Spotify Metadata Without a Premium Owner Account

## Context

WI-011 wired Spotify metadata through LavaSrc's Client Credentials flow (`clientId`/`clientSecret`
in `lavalink/application.yml`). In practice, every metadata call — a single track included —
returns HTTP 403 `Active premium subscription required for the owner of the app`. Spotify now
requires the developer-app **owner account** to hold an active Premium subscription before the
Web API answers at all; this was confirmed by replaying LavaSrc's own token + metadata requests
directly against Spotify's API with the project's real credentials. The `.env.example` comment
claiming "a free Spotify account is enough" is stale and traces back to this requirement change.

Members want Spotify links to keep working without paying for Premium on the credentials-owning
account. LavaSrc (v4.8.3, the version pinned in `lavalink/application.yml`) already resolves this
without any code change, confirmed by reading its actual source at that tag:

- `SpotifySourceManager.getJson()` — the method behind every track/album/playlist/artist/search
  call — always requests a token via `tokenTracker.getAccessToken(false)`. That method only uses
  the Client Credentials flow (the one returning 403 for us) when `clientId`/`clientSecret` are
  both present and valid; **otherwise it falls back automatically to an anonymous access token**,
  the same kind of token the Spotify web player itself uses and that libraries like
  [`tr1ckydev/spotifly`](https://github.com/tr1ckydev/spotifly) obtain by mimicking the web
  client. Simply leaving `clientId`/`clientSecret` empty is enough to switch every metadata call
  to the anonymous path — no sidecar required for that alone.
- LavaSrc's _own_ anonymous-token acquisition works by scraping a secret out of Spotify's web
  player JS bundle, which is exactly the kind of thing that periodically breaks when Spotify
  changes that bundle (LavaSrc's own docs note the default endpoint "might not work"). This is
  what `customTokenEndpoint` is for: an override so LavaSrc fetches the anonymous token from an
  externally maintained source instead of its own fragile built-in scraping.

The plan is to run the companion sidecar
[`topi314/spotify-tokener`](https://github.com/topi314/spotify-tokener) — maintained by the
LavaSrc author for exactly this purpose — and point `customTokenEndpoint` at it. Reading its
source confirms it does not reimplement anything: it drives a persistent headless Chrome
(`chromedp`, `chromedp/headless-shell` image) to `open.spotify.com` and relays Spotify's _own_
token response verbatim, so its output shape is guaranteed to match what LavaSrc parses. This
keeps Spotify resolution entirely inside Lavalink: the bot is unaffected and continues to only
call `poru.resolve()`, and DiJay's own code never talks to Spotify or holds scraping logic.

One hard limit either way (confirmed in `SpotifySourceManager.getPlaylist`): **Spotify-generated
playlists** (Discover Weekly, Daily Mix, and other algorithmic playlists — ids starting
`37i9dQZ`) are explicitly rejected for anonymous tokens by LavaSrc itself
(`"Spotify generated playlists are no longer accessible via anonymous tokens."`). Regular
user-created/shared playlists, albums, and tracks are unaffected by this restriction.

This mechanism is **unofficial**: it is not a Spotify-sanctioned integration path and is outside
their Terms of Service regardless of server size, though practical enforcement risk for a small
private Discord is low (no personal Spotify account is used or put at risk — the token is fully
anonymous, not tied to a cookie). The realistic failure mode is Spotify changing the internal
web-player token schema, breaking the tokener until it is updated upstream — not an account ban.
This trade-off is accepted knowingly, not silently.

## Acceptance Criteria

- [ ] `spotify-tokener` (`ghcr.io/topi314/spotify-tokener:master`) runs as a new service on the
      existing private Docker network (`dijay-private`), never published, alongside `lavalink`
      and `bot`, with an explicit `mem_limit` sized for its persistent headless-Chrome process
      (heavier than the other sidecars in this repo; size and verify empirically, not guessed).
- [ ] `lavalink/application.yml`'s `plugins.lavasrc.spotify.customTokenEndpoint` points at the
      sidecar's `/api/token` (confirmed field name and prefix from `SpotifyConfig.java` at the
      pinned LavaSrc tag `4.8.3`).
- [ ] `clientId`/`clientSecret` are left empty in this deployment (confirmed sufficient on its
      own to switch metadata calls to the anonymous path; `customTokenEndpoint` makes that path
      resilient instead of relying on LavaSrc's own fragile built-in scraping).
- [ ] With the tokener configured, Spotify track, album, and regular (non-algorithmic) playlist
      URLs resolve through `/play` and `/playlist add` exactly as WI-011 specified — this is the
      acceptance test for the whole work item.
- [ ] Spotify-generated/algorithmic playlists (ids starting `37i9dQZ`, e.g. Discover Weekly)
      remain unresolvable — this is a hard limit of anonymous tokens in LavaSrc itself, not a
      bug; the user-facing failure for these must still degrade gracefully (skipped/reported),
      not crash `/play` or `/playlist add`.
- [ ] Nothing regresses for a deployment with no Spotify configuration at all — WI-011's
      graceful-degradation guarantee (Spotify links simply unresolved, all other sources
      unaffected) still holds when `spotify-tokener` itself isn't deployed.
- [ ] If the tokener sidecar is unreachable or fails, Spotify links fail gracefully (skipped /
      reported, never fatal) and every other source keeps working — consistent with WI-011.
- [ ] No Spotify account credentials, cookies, or personal tokens are used anywhere in this
      setup; the token obtained is fully anonymous and not tied to any account.
- [ ] The unofficial nature of this mechanism, its failure mode (breaks if Spotify changes the
      web-player token schema, requiring an upstream `spotify-tokener` update), and the fact that
      it sits outside Spotify's Terms of Service are documented in `docs/canonical/operations.md`
      — not left implicit.
- [ ] The stale `.env.example` comment ("a free Spotify account is enough") is corrected to
      reflect the actual Premium-owner requirement of the Client Credentials path and the
      tokener-based alternative.
- [ ] Red/Green/Refactor and all quality gates are recorded for any bot-side code touched; this
      work item is primarily Lavalink/Docker configuration, so most of it has no `src`/`tests`
      surface — the acceptance test is the live resolution behavior above.

## Resolved Decisions

- **Mechanism:** LavaSrc's built-in `customTokenEndpoint` + the `spotify-tokener` sidecar, not
  `spotifly` embedded in the bot. Both achieve the same anonymous-token bypass, but this keeps
  Spotify resolution and its matching pipeline (ISRC → `ytsearch`, playlist/album expansion)
  entirely inside Lavalink — nothing to duplicate or maintain in this repository's own code.
- **Risk acceptance:** unofficial and outside Spotify's ToS regardless of scale; accepted for a
  small private server given the low practical enforcement risk and the absence of any
  account-level exposure (no personal cookie is used).
- **`customTokenEndpoint` config shape** — confirmed against the actual `4.8.3` source
  (`SpotifyConfig.java`, `@ConfigurationProperties(prefix = "plugins.lavasrc.spotify")`): a single
  `customTokenEndpoint: "http://spotify-tokener:8080/api/token"` string alongside the existing
  `countryCode`/`playlistLoadLimit`/etc. keys already in `application.yml`. No other new keys.
- **`clientId`/`clientSecret` fate** — leave both empty rather than keep them as a "legacy
  fallback": confirmed from source that an empty/invalid pair is exactly what makes LavaSrc use
  the anonymous path for every call (`getAccessToken` checks `hasValidCredentials()`), so keeping
  them serves no purpose once `customTokenEndpoint` is set, and an unexpectedly-valid pair would
  silently revert to the broken Client-Credentials 403 path.
- **`spotify-tokener` maintenance/resources** — confirmed from source (`main.go`/`Dockerfile`): a
  single persistent headless-Chrome process (`chromedp/headless-shell` base image) shared across
  requests, not spawned per call; no built-in health endpoint besides `/api/token` itself; config
  via `SPOTIFY_TOKENER_ADDR` (default `0.0.0.0:8080`) and `SPOTIFY_TOKENER_LOG_LEVEL` env vars.
  Needs its own `mem_limit` (headless Chrome is heavier than this repo's other sidecars) —
  to be sized empirically at implementation time rather than guessed.
- **Healthcheck tool** — confirmed from `chromedp/headless-shell`'s own build (`debian:trixie-slim`
  - `libnspr4 libnss3 libexpat1 libfontconfig1 libuuid1 socat`): `nc`/`curl` are **not** present,
    but `socat` is. The healthcheck must use `socat` for a port check, not `nc -z` like Lavalink's.
    Hitting `/api/token` itself for the healthcheck was rejected: it would trigger a real Chrome
    navigation to Spotify on every check interval, adding load/risk for no operational benefit over
    a plain port check.

## Open Decisions

- Concrete `mem_limit`/resource allocation for the `spotify-tokener` service — the spec proposes
  a starting value, but it is not verified against actual memory usage; measure on the VPS
  (`docker stats`) and adjust.
- Confirm the VPS's outbound network rules permit the sidecar reaching `open.spotify.com` (same
  class of outbound access Lavalink's `ytsearch` source already requires, so expected to be fine).
- User-facing message when a Spotify-generated/algorithmic playlist is queued (now a confirmed,
  permanent limitation, not a bug) — reuse the existing "unresolvable, skipped" messaging from
  WI-011 or make it explicit that generated playlists specifically are unsupported.
