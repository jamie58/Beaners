# Beaners v50 Stability Release

Focus: lobby/seat/bot/wheel/start/exit/reconnect stability.

Updates:
- Single clean start.js lobby controller.
- Token-backed player identity for seating, reconnect, refresh and exit.
- Empty seat: Sit Here + Add Bot.
- Bot seat: Remove Bot only.
- Human seat: player name only.
- Wheel uses seated players/bots only.
- Start button uses chosen wheel starter as first player.
- Version source added via /version.js, v50 across splash/name screen.

Syntax checked: server.js, app.js, start.js, version.js.
