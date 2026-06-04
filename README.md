# Beaners v49 Stability / Reconnect / Lobby Fix

Fixes:
- Exit no longer requires finding a seat; it resolves by token/socket and exits cleanly.
- Bot add/remove no longer requires room owner.
- Seat actions send playerToken so server can identify the player reliably.
- requestRoomState uses token/socket fallback.
- Refresh button requests the latest room state.
- Reconnect requests the latest room state.
- Suppresses stale owner/seat alert popups from old handlers.
- Adds v49 markers.
