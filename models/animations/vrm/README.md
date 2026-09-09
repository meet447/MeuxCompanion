# Shared VRM animations

Five idle loops, one talking loop, and seven emotes shared by all VRM models.
These are the same files shipped by Utsuwa in `static/animations/` (verified
byte-for-byte on 2026-09-09). They were already bundled with Meuxe's Utsuwa avatar
and have been moved here unchanged.

Original MIT-licensed source: [Aikeya, revision 640fd29](https://github.com/aikeyaorg/aikeya/tree/640fd29b411ed3ace5725c124eb3dbd5a467d2b2/static/animations).
See LICENSE for the full notice. No Utsuwa application code is included.

Model-specific files remain in `models/vrm/<model-id>/animations/`. Meuxe prefers
them for idle/talking and uses shared clips for missing behaviors. Mapping
choices use `animation:<name>` for model clips and
`animation:default:<name>` for explicit shared clips, avoiding name collisions.
Clips are retargeted onto each model's humanoid skeleton at load time.
