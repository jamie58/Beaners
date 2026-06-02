# Beaners v17

Fixes:
- If a bot is sitting in a seat, a real player can click that seat to remove the bot and take the seat.
- Seat buttons are no longer disabled for bot seats.
- Join code input strips non-numeric characters automatically.
- Server also accepts pasted values like “JOIN CODE: 1234”.
- Room-not-found message is clearer.

Note:
If everyone is using the same link and the correct code but still gets Room not found, the Render free server likely restarted/spun down and lost the in-memory room. Create a new room, or add persistent storage later.
