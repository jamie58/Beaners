# Beaners v80

Built from v79 full project.

Gameplay:
- Allows wrapped runs such as Q-K-A, K-A-2, Q-K-A-2, and J-Q-K-A-2.
- Supports Beaner placement/substitution inside wrapped runs.
- Keeps v79 Beaner set and final-discard rules.

Reconnect stability:
- Rejoin/refresh on socket reconnect.
- Rejoin/refresh when returning from background/minimized app.
- Heartbeat every 10 seconds.
- Connection status delays red state to avoid flicker during short mobile background disconnects.
- Single reconnect attempt lock prevents reconnect spam.
- Rooms stay alive longer, up to about 60 minutes where existing cleanup logic applies.
- Reconnect button remains emergency manual refresh/rejoin.

Full project assets retained.
