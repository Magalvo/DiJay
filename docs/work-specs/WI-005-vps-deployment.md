# Work-Spec: WI-005 - VPS Deployment

## Approach

Add a small internal health server and state monitor. Package compiled code in a pinned
Node 24 image, run as the built-in non-root user, and orchestrate it with the existing
Lavalink service.

## TDD

- **Red:** Healthy/degraded/shutdown endpoint tests fail.
- **Green:** Implement monitor/server and production container definitions.
- **Refactor:** Verify shutdown ordering, image build, Compose rendering, and operations docs.

## Execution Record

- **Red:** Health endpoint had no discoverable bound port in integration testing.
- **Green:** Degraded/ready health states and server responses passed.
- **Refactor:** Production image, healthchecks, shutdown, backup, and operations were validated.
