# Work-Spec: WI-009 - Queue Pagination and Extended Controls

## Target Files

- **Production files:** `src/application/music/playback-history.ts` (new),
  `src/application/music/music-service.ts`, `src/presentation/discord/control-panel.ts`,
  `src/presentation/discord/music-buttons.ts`, `src/presentation/discord/embeds.ts`,
  `src/presentation/discord/commands.ts`, `src/bootstrap.ts`
- **Test files:** `tests/unit/presentation/control-panel.test.ts`,
  `tests/unit/application/playback-history.test.ts` (new)

## Approach

Add a stateless queue-page embed builder that slices upcoming tracks by page index encoded
in the button custom IDs (`queue:page:<n>`). Maintain a bounded FIFO history buffer updated
on `trackStart`; the previous-track button re-enqueues the last finished track at the front.
Extend the control panel with previous/volume-down/volume-up buttons that reuse existing
service methods and clamp volume.

## TDD

- **Red:** A control-panel test asserts the new buttons exist and disable correctly; a
  history test asserts bounded FIFO behaviour.
- **Green:** Implement the buffer, page builder, and button handlers.
- **Refactor:** Share slicing logic with the existing formatter and run all gates.
