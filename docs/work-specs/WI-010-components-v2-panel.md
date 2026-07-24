# Work-Spec: WI-010 - Components V2 Control Panel

## Target Files

- **Production files:** `src/presentation/discord/control-panel.ts`,
  `src/presentation/discord/live-panel.ts` (edit payload), `src/presentation/discord/commands.ts`
- **Test files:** `tests/unit/presentation/control-panel.test.ts`

## Approach

Rebuild `buildControlPanel` to emit a `ContainerBuilder` holding a `SectionBuilder`
(title, author, progress) with a thumbnail accessory, a `MediaGalleryBuilder` for large
artwork when available, `SeparatorBuilder`s, and the existing action rows. Return the
component tree plus the `IsComponentsV2` flag. The live-panel manager and `/control`
command pass the flag on edit/reply. Keep custom IDs unchanged so button handlers and the
disabled-state logic are untouched.

## TDD

- **Red:** Update the control-panel test to assert the V2 container structure and that all
  `musicButtonIds` remain present and disable when idle.
- **Green:** Implement the container/section builders behind the same public function.
- **Refactor:** Verify the flag propagates through live refresh and run all gates.
