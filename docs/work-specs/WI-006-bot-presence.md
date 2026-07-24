# Work-Spec: WI-006 - Bot Presence and Deployment Hardening

## Target Files

- **Production files:** `src/config/env.ts`, `src/bootstrap.ts`, `.env.example`,
  `compose.yml`
- **Test files:** `tests/unit/config/env.test.ts`

## Approach

Expose a bounded `BOT_STATUS_TEXT` configuration value and publish it through the
Discord client after the ready event. Keep the presence type fixed as `Listening` so
configuration remains simple. Replace the authenticated Lavalink HTTP probe with an
internal TCP probe and let the image manage its own plugin directory.

## TDD

- **Red:** Configuration tests require the default and an explicit activity text.
- **Green:** Parse the new setting and apply it to the ready Discord client.
- **Refactor:** Validate all code gates and the fully rendered Compose model.

## Execution Record

- **Red:** The focused environment test failed because no activity setting existed.
- **Green:** The configured/default activity text is parsed and published on Discord ready.
- **Refactor:** All 32 tests and the format, type, lint, build, Compose, and image
  build gates passed.
