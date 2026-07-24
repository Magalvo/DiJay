# Work-Item: WI-009 - Queue Pagination and Extended Controls

## Context

`/queue` only shows the first entries with an "and N more" suffix, so long queues are
unusable, and the control panel lacks previous-track and volume controls that members
expect. Playing a previous track requires a small playback-history buffer, since Lavalink
does not retain finished tracks.

## Acceptance Criteria

- [ ] `/queue` paginates upcoming tracks (10 per page) with next/previous buttons.
- [ ] Pagination components use stable custom IDs and enforce guild and access rules.
- [ ] The control panel gains previous-track, volume-down, and volume-up buttons.
- [ ] Volume buttons clamp to 0-150 and refresh the live panel.
- [ ] A bounded per-guild history buffer backs previous-track; an empty history disables
      the button.
- [ ] Single-page, empty, and last-page states render without errors.
- [ ] Red/Green/Refactor and all quality gates are recorded.
