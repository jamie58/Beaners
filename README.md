# Beaners v51 Lobby Stability Reset

Built from the last version that could create/enter the lobby.

Fixes:
- Clean v51-only seat events, bypassing old broken seat handlers.
- Empty seat: Sit Here + Add Bot.
- Bot seat: Remove Bot.
- Human seat: player name only.
- Seat click sends v51SeatAction.
- Add/remove bot sends v51SeatAction.
- Spin sends v51SpinStarter and uses seated players/bots only.
- Start sends v51StartGame and uses the selected starter.
- Exit sends v51ExitGame and identifies player by token/socket.
- Refresh sends v51RequestState.
- Version is centralised in public/version.js and shown as v51.

Syntax checked:
- server.js
- app.js
- start.js
- version.js
