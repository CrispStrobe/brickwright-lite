## Arcade particle frame assertion investigation — 2026-10-12

CLAIMED — Codex, parent PR810 continuation. Its Build38279930848 also
failed the destroy/fire particle assertion. Check emitted source pixels against
the composed frame: aggregate fire-color counts can shrink when particles cover
the sprite. Preserve the original failure; retain positive emission, exact pixel
composition, ghost/dissolve/lifespan and cleanup assertions. No generated PXT
algorithm or random distribution change is authorized to make a test pass.
