# Beaners v30 Critical Turn/Reconnect Fixes

Fixes:
- Reconnect uses live room/player token first, then localStorage.
- Server re-binds socket identity to the player token before turn checks.
- Exit works by stable player token.
- Final discard is allowed when you are down and have one card left.
- Better not-your-turn resync behaviour.
