# Work-Spec: WI-002 - Private Lifecycle

## Approach

Introduce a guild access policy and an idle-player scheduler as independently testable
application services. Enforce the policy at the interaction registry and Discord guild
events. Parse private lifecycle defaults once at startup.

## TDD

- **Red:** Missing guild ID, unauthorized guild, timer cancellation, and default parsing tests fail.
- **Green:** Add the policy, scheduler, configuration, and bootstrap wiring.
- **Refactor:** Centralize interaction validation and verify all existing commands.

## Execution Record

- **Red:** Configuration, policy, and idle-manager suites failed before implementation.
- **Green:** Private allowlist, defaults, and timer behavior passed.
- **Refactor:** Policy was centralized in the interaction registry and Discord guild events.
