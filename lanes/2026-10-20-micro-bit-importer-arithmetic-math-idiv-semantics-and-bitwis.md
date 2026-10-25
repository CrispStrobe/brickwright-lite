## micro:bit importer arithmetic: Math.idiv semantics and bitwise grouping — 2026-10-20

CLAIMED and done in one PR to main — Claude (owner decision 2026-10-20: Math.idiv imports with
real semantics). Math.idiv(a, b) imports as `(((a bitor 0) / (b bitor 0)) bitor 0)`, pxt's own
definition (both operands and the quotient truncated), and only that exact shape exports back as
Math.idiv. Bitwise words and unary minus/bitnot now group compound operands: `(v / 4) | 0` no
longer comes back as `v / (4 | 0)`, nor `-(a + b)` as `(0 - a) + b`. Files: bw-makecode
translate-base.js, microbit-translate.js, export.js. Tests:
test/makecode-arithmetic-roundtrip.test.mjs (both sides evaluated), updated idiv assertions.
