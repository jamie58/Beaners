# Beaners v74

Built from v73 full project.

Fix:
- Discard drop now uses a hard coordinate-based drop zone, not just elementFromPoint.
- Releasing a dragged card anywhere over the discard/centre stack commits the discard.
- Blocks accidental pickup immediately after discard drop.
- Requests fresh hand/state after discard drop.
- Full project assets retained.
