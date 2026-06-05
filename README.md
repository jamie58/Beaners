# Beaners v81

Built from v80 full project.

Reconnect/resume improvements:
- Automatically attempts hard reconnect when returning from another app.
- Uses visibilitychange, pageshow, and focus events.
- Manual reconnect/status button remains as backup.
- Rejoins room, requests room state, requests hand, and sends heartbeat after reconnect.
- Status turns green once room/hand state returns.
- Watchdog attempts rejoin if visible app has not received fresh state for 20 seconds.
- Keeps v80 wrapped run rules and reconnect stability.
- Full project assets retained.
