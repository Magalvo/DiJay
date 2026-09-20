# Work-Spec: Implementation Plan for WI-022

## 1. Target Files

- **Files to modify:** `src/domain/playlists/playlist.ts`,
  `src/infrastructure/sqlite/sqlite-playlist-repository.ts`,
  `src/presentation/discord/user-messages.ts`, `src/presentation/discord/commands.ts`
- **Test files to modify:** `tests/integration/sqlite/repositories.test.ts`,
  `tests/unit/presentation/user-messages.test.ts`

## 2. Proposed Technical Approach

`MAX_PLAYLIST_TRACKS` moves from a private constant in the SQLite repository to an exported one
in `src/domain/playlists/playlist.ts`, and the repository, the `PLAYLIST_FULL` message and the
import overflow notice all import it. The cap is a domain rule, not a storage detail: the
presentation layer already had to know it, and knowing it by copying the number is what let the
three copies drift.

The value is 600 because that is LavaSrc's own ceiling for one Spotify playlist -
`playlistLoadLimit: 6` pages of 100 items in `lavalink/application.yml`. Matching them means an
import stores everything that was resolved, instead of the storage layer quietly truncating what
the source layer already fetched. The two numbers are coupled, so the constant's doc comment
names the config key: changing `playlistLoadLimit` without revisiting the cap reintroduces the
silent truncation this work item removes.

No schema change. Existing playlists are unaffected; only the ceiling moves.

### Cost of the new cap on `/playlist play`

`PlaylistService.play` re-resolves every stored track through Lavalink one at a time, so the cap
directly bounds how long that command runs. Measured from this deployment's own Lavalink logs
(22 Aug 2026, VPS), time from `Got request to load` to `Loaded`:

| Identifier                                                 | Latency |
| ---------------------------------------------------------- | ------- |
| `ytsearch:d`                                               | 943 ms  |
| `ytsearch:danco`                                           | 451 ms  |
| `ytsearch:dancon`                                          | 550 ms  |
| `ytsearch:dancing on my`                                   | 448 ms  |
| `https://www.youtube.com/watch?v=CcNo07Xp8aQ` (direct URI) | 941 ms  |

`play` takes the direct-URI path when a track has a `uri` and the search path otherwise, so
roughly 0.45-0.95 s per track. A full 600-track playlist therefore takes about **5 to 9.5
minutes** to finish queueing, against a Discord deferred-reply token valid for 15 minutes. It
fits, with the worst case leaving around 1.6x headroom.

What this does _not_ delay: playback. The first track is queued in about a second and starts
immediately; the rest fill in behind it. Only the final "N faixas adicionadas" summary waits for
the loop. If the token ever did expire, the summary edit fails and `CommandRegistry` logs it -
the queue is still correct.

The real fix is to stop re-resolving at all: Lavalink returns an `encoded` track blob that can be
enqueued directly, so storing it alongside the metadata would turn those minutes into a single
round trip. That is a schema change and a separate work item; it is what should happen before the
cap is raised any further.

## 3. Testing Strategy (TDD)

- **Initial Failing Test (Red):** `tests/unit/presentation/user-messages.test.ts` asserts that
  `musicErrorMessages.PLAYLIST_FULL` contains `String(MAX_PLAYLIST_TRACKS)`. Before the change it
  fails with `Received: "A playlist já atingiu o limite de 100 faixas."` against a constant of
  600 - the drift itself, caught by a test. The integration tests fail alongside it, since they
  now express the boundary in terms of the constant instead of a literal 100.
- **Expected Input Data:** an import of `MAX_PLAYLIST_TRACKS + 2` tracks into an empty playlist;
  a playlist already filled to `MAX_PLAYLIST_TRACKS` receiving one more `addTrack`.
- **Expected Output/Behavior:** the import stores `MAX_PLAYLIST_TRACKS` and reports
  `skipped: 2`, positions running 1..cap; the single add past a full playlist rejects with
  `PLAYLIST_FULL`. A further test asserts the cap is a whole multiple of 100 and at least 600, so
  a future edit cannot leave it truncating a LavaSrc page mid-way.
