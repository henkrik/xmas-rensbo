# Agent Guidelines

## Debug Logging
When I say "debug log", I mean logging a message to the on-screen `DebugConsole` rectangle (which is displayed when the `?debug` URL query flag is active) by calling `debugLog(message)` from [`src/core/debugConsole.ts`](src/core/debugConsole.ts) (also available globally as `globalThis.debugLog(message)`).
