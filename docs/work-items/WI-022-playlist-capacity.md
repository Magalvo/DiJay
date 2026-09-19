# Work-Item: WI-022 - Playlist Capacity Beyond 100 Tracks

## 1. Context & Problem

Saved playlists are capped at 100 tracks (`MAX_PLAYLIST_TRACKS` in
`sqlite-playlist-repository.ts`). The cap predates Spotify import (WI-011): it was sized for
playlists built one `/playlist add <query>` at a time, where reaching 100 takes deliberate
effort. Importing a Spotify playlist reaches it in a single command.

The failure is quiet in the way that matters. `addTracks` stores the first 100 and returns the
rest as `skipped`, so importing a 300-track playlist silently drops two thirds of it; the only
signal is a parenthetical in the reply. A member who imports their playlist and plays it back
gets a third of it with no indication that anything is missing after that first message.

The cap is also written out three times - the repository constant, the `PLAYLIST_FULL` message
in `user-messages.ts`, and the overflow text in `commands.ts` - so changing it means changing
the number in three places and hoping none was missed.

## 2. Acceptance Criteria

- [x] The per-playlist track cap is 600, matching what LavaSrc can actually deliver from one
      Spotify playlist (`playlistLoadLimit: 6` pages x 100 items in `lavalink/application.yml`).
      Anything LavaSrc resolves can therefore be stored in full.
- [x] The cap is defined once, in the domain, and imported everywhere else. No literal copy of
      the number survives in the repository or the presentation layer.
- [x] User-facing text reports the real cap, in both the `PLAYLIST_FULL` error and the import
      overflow notice, and cannot drift from the constant without a test failing.
- [x] Existing behaviour is unchanged otherwise: imports past the cap still store what fits and
      report the remainder as `skipped` rather than failing the whole import.
- [x] `/playlist play` on a full playlist stays within Discord's deferred-reply window; the
      measured cost is recorded in the spec rather than assumed.
