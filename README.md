# Beaners v40 Create/Join RoomReady Fallback

Fixes:
- Server now emits a dedicated roomReady event after create/join.
- Client listens for roomReady and force-enters the lobby.
- start.js displays connection/create/join status under the buttons.
- If the button greys out and no room appears, the status text will now say whether the server responded.
- v40 added to splash/start debug.
