## Arcade partial closure and Carnival browser repair — 2026-10-12

CLAIMED — Codex Arcade integration. Ordered closure plan covers the locked
184-input corpus (142 translated /41 partial /1 parse failure), authentic project
context, native sprite handles and events, standard APIs, custom packages, and
blocks/Code/asset authoring. Preserve originals and separate import/runtime/GUI
receipts. First envelope: docs/ARCADE-PARTIAL-CLOSURE-PLAN.md, Arcade handoff and
GUI-gap records, scripts/verify-arcade-carnival-browser.mjs and focused controls.
PR810 Build38208078539 passed build/corpus but failed both browsers. Its Carnival
screenshot visibly contains the requested block while the selector times out;
inspect the real Blockly DOM before changing any expectation. Painter and
original-screen readiness repairs remain with their declared peer owners. No
timeout increase, diagnostic suppression, invented assets or runtime bypass.
