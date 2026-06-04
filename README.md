# Beaners v44 Create Room Client Crash Fix

Fixes:
- Removes old app.js Create/Join/AddBot/FillBots direct handlers.
- Prevents missing old lobby buttons from crashing app.js.
- start.js is now the single source of truth for Create/Join.
- Forces game/lobby screen open on roomReady/joinedRoom.
- Keeps v43 missing server helper fixes.
- Adds v44 debug marker.
