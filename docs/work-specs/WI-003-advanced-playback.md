# Work-Spec: WI-003 - Advanced Playback

## Approach

Extend the music port with typed playback-state and queue operations. Keep validation in
`MusicService`, Poru mechanics in its adapter, and Discord rendering/interaction IDs in
the presentation layer.

## TDD

- **Red:** Validation, queue placement, adapter operation, and panel state tests fail.
- **Green:** Implement the minimum port, service, adapter, commands, and component handlers.
- **Refactor:** Share request extraction and error handling across commands and buttons.

## Execution Record

- **Red:** Advanced service methods and control-panel contracts were absent.
- **Green:** Typed controls, queue placement, commands, and stable button IDs passed.
- **Refactor:** Commands and components now share interaction context and error mapping.
