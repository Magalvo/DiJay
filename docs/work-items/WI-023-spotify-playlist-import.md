# Work-Item: WI-023 - Spotify Playlist Import

## 1. Context & Problem

Importing a Spotify playlist already half-works: `/playlist add <name> <spotify-url>` hands the
URL to Lavalink, LavaSrc resolves it, and the tracks are stored. It rests entirely on LavaSrc's
anonymous-token path, which is outside Spotify's Terms of Service and currently answers
`429 QUOTA_EXCEEDED` for every request - track, album, playlist and search alike, verified
against a live Lavalink.

The official path was investigated and rejected for the same job in WI-017, because Spotify had
started requiring the developer-app owner account to hold Premium. That requirement is now met,
which reopens the question - but not the way it was framed then. Client credentials still cannot
list a playlist's tracks: Spotify answers 200 for the playlist and omits its items entirely, and
the items endpoint itself answers 401/403. Playlist contents are only readable **as the account
that owns the playlist**, which needs a user token.

So the bot gets its own Spotify client, used for exactly one thing: reading the track list of a
playlist belonging to the linked account. Everything playable is matched and stored at import
time, so playback never touches Spotify and is unaffected by its quota and token problems.

## 2. Acceptance Criteria

- [x] `/playlist import <name> <url>` fills an existing playlist from a Spotify playlist owned by
      the linked account, accepting a share link, a localised link, a `spotify:playlist:` URI or
      a bare id.
- [x] Tracks are matched by ISRC, falling back to artist and title only when Spotify has no ISRC.
      A local file's ISRC is never trusted, since it identifies no real recording.
- [x] Pagination follows Spotify's 100-item pages up to `MAX_PLAYLIST_TRACKS`, and stops
      requesting pages once the cap is reached rather than fetching and discarding.
- [x] An unmatched or transient per-track failure costs that track only; the import reports how
      many were unmatched and how many were dropped by the playlist cap.
- [x] Spotify's own refusals are reported as such: a playlist that is not the linked account's
      (403) or is Spotify-generated (404) says so in Portuguese, and a revoked refresh token is
      distinguished from an outage so the operator knows to re-authorise rather than wait.
- [x] The feature stays disabled, with a plain startup log line, until all three credentials are
      present. Its absence never affects playback or any other command.
- [x] The one-time authorisation is reproducible from the repository (`npm run spotify:authorize`)
      rather than being undocumented setup knowledge.
- [x] Verified end to end against a real playlist, not only against stubs.
