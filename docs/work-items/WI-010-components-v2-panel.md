# Work-Item: WI-010 - Components V2 Control Panel

## Context

Discord Components V2 (Container, Section, Media Gallery, Separator) enable an
image-forward panel layout that reads as current in 2025. discord.js 14.27 supports the
component tree and the `IsComponentsV2` message flag. This is a visual upgrade over the
embed-based panel from WI-007.

## Acceptance Criteria

- [ ] The control panel renders through Components V2 with large artwork and grouped
      controls in a container/section layout.
- [ ] The panel degrades gracefully to an idle state when nothing is playing.
- [ ] Existing button custom IDs and their handlers remain stable.
- [ ] Live-panel refresh (WI-007) keeps working with the new component tree.
- [ ] The message sets `MessageFlags.IsComponentsV2` and respects V2 content constraints.
- [ ] Red/Green/Refactor and all quality gates are recorded.
