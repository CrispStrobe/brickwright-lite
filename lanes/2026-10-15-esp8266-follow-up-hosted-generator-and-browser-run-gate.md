## ESP8266 follow-up: hosted generator and browser run gate — 2026-10-15

CLAIM EXTENSION — Claude, of the merged ESP8266 device claim (#932; device
work landed in #934). Branch feat/esp8266-followup-20261015,
[local path omitted]. Production stc-compiler now serves `esp8266`
(deployed e21b64c), so this also completes plan N13: refresh
docs/generated/hosted-targets.json with the repo generator against the
deployed source (taking whatever other targets it produces, unedited), mark
the ESP8266 C cell and its lowered paths shipped and set its picker compile
flag in the capabilities table (overlay and tracked twin) with the
regenerated matrix doc.

Envelope: this ledger; scripts/gen-hosted-targets.mjs (read stc-compiler's
ESP8266_TARGETS so a post-deploy refresh picks it up) with a new fixture
test; N13 in docs/LANGUAGE-DEVICE-MATRIX-PLAN.md; one new browser verify
script driving the debug runner's ESP8266 attach path end to end with bw-board's
SDK-free blink image (embedded, sha256-checked) through the user-picked .bin
route, its light-shard step in .github/workflows/build.yml with a PROVISIONAL
budget, and the companion browser-gate census entries the existing gates
require. Existing budgets, gates and thresholds stay unchanged. Merge this
extension before implementation.
