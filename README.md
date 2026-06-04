# Beaners v38 Create/Join Hard Fix

Fixes:
- Repairs lobby/playingControls markup from the lobby rewrite.
- Rebuilds the start screen with known-good Create Room and Join Room buttons.
- Replaces createRoom and joinRoom server handlers with known-good versions.
- Binds create/join buttons after DOMContentLoaded.
- Adds v38 to the loading screen.
- Syntax-checks server.js and app.js before packaging.
