# Beaners v39 Create/Join Debug Fix

Fixes:
- Adds a standalone start.js controller for Create Room / Join Room.
- start.js binds after DOMContentLoaded and again after 500ms.
- Exposes the socket globally so start.js and app.js use the same connection.
- Adds server logs for createRoom and joinRoom requests.
- Adds small v39 diagnostic marker under the start buttons.
- Adds v39 to the loading screen.
- Syntax-checks server.js, app.js and start.js before packaging.
