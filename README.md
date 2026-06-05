# Beaners v70

Built from v69 full project.

Purpose:
- Clean mobile-first button/tap system without removing existing handlers.
- Adds one capture-level pointerup action path that fires before delayed click handlers.
- Suppresses legacy click immediately after the clean pointer action.
- Applies to:
  - lobby seats / add bot / remove bot
  - Let's Beaners
  - deck pickup
  - discard pickup
  - take pile
  - bottom sort/meld/discard buttons
- Requests fresh state/hand immediately after pickup and play actions.
- Keeps persistent hand sorting from v69.
- Full project assets retained.
