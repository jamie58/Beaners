# Beaners v32 Session Stability Fix

Critical fixes:
- Exit now finds the live room by socket/token if the client room code is stale.
- Restart uses the same live-room fallback.
- Reconnect uses currentRoomCode/latestState before localStorage.
- Server binds every action to the stable player token before checking turn ownership.
- Final discard remains guaranteed when the player is down with one card left.
- Removes misleading room-not-found behaviour while the player is visibly in a room.
