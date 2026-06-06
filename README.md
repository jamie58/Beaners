# Beaners v83

Built from v82/v80 full project.

Purpose:
- Fix excessive WebSocket bandwidth usage.
- Removes aggressive reconnect traffic:
  - no 10-second heartbeat
  - no watchdog polling
  - no repeated automatic room/hand refresh loop
- Keeps simple low-bandwidth reconnect:
  - one reconnect/rejoin/refresh on app resume/focus/pageshow
  - manual refresh button as backup
  - 4-second cooldown to prevent reconnect storms
  - red status delayed for 5 seconds
- Keeps wrapped run support from v80.
- Keeps v79 gameplay rules where present.
- Full project assets retained.
