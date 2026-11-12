# I7: pixel crop verifier waits for keyboard menu focus

Status: claim and change in one PR; landed through the I3–I6 integration PR.
Owner: browser-shard failure lane (row I7 of `docs/OPEN-TASKS-2026-09-29.md`).
Base: main `aaeb5917`.

Scope: `scripts/verify-pixel-crop.mjs` (`editMenuAction` only), row I7. No
product, gate, threshold, timeout or assertion change.

Cause: `openMenuFromKeyboard` and a submenu's ArrowRight focus their first item
in a `requestAnimationFrame` callback. The verifier focused `Frames` and pressed
ArrowRight immediately after ArrowDown on the Edit trigger; when the menu's
frame ran after that, focus jumped back to the first Edit item, `Frames` blurred
(`MenuItem` onBlur closes its submenu) and `Duplicate frame` was never shown.
This is correct product behaviour for a user, who cannot act inside one frame;
the verifier raced it.

Change: after opening the menu, wait until it owns focus; after ArrowRight,
wait until the submenu item is `aria-expanded="true"` and its submenu owns
focus. Then press the command exactly as before.
