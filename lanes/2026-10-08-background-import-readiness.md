### Background import readiness — 2026-10-08

Root claims `lane/arcade-background-readiness-20261008`, stacked on namespace augmentation. Reproduce the retained original-assets light-browser PNG import failure, identify whether product decoding or test readiness is wrong, preserve failures, and qualify the complete visible background-authoring/native-export journey without loosening pixel assertions.

Background readiness result: test-only source `b42374d30` waits for uploaded PNG pixels before opening More. The unmodified local journey already passed (CI race not locally reproduced); corrected journey passes all7 phases,19,200 original-PXT pixel comparisons,0 differences/page errors.21 gate contracts pass. Consumer remains namespace build `gui.4530654c.js`; no product build change. Hosted exact-head qualification is still required before clearing PR711. [Receipt](docs/receipts/2026-10-08-arcade-background-readiness.json).
