# Arcade numeric authoring gate: elapsed controlled-clock comparison

Status: claim and change in one PR. Owner: Arcade lane. Base: main
`4b2f5047dde6`.

Scope: one assertion in `scripts/verify-arcade-numeric-authoring-gui.mjs`, new
`scripts/lib/clock-elapsed.mjs` and `test/clock-elapsed.test.mjs`. No product
change.

Problem: the gate installs the Playwright clock at time 0, so its two
`Date.now()` readings are fractional milliseconds built up by adding timer
steps. Their float difference carries accumulated rounding: CI observed
`1000.0000000000364` for a correct one-second advance (Lite #1686, #1690), and
the exact `=== 1000` check failed.

Change: `elapsedMatches(before, after, 1000)` accepts the difference within
`1e-3` ms. Justification: Playwright's clock advances in whole milliseconds
(`runFor` and timer delays are integer ms), so a real clock error is at least
one millisecond, while rounding over at most 1000 steps at these magnitudes
(< 1e9 ms) stays below `1e-4` ms. No rounding to whole milliseconds.

Evidence: the unit test accepts the observed CI value and a `24.1`-based
reading, and rejects 999, 1001, 999.5, 1000.01, 0, 2000 and non-finite
readings. Mutations: tolerance 0 (the old exact check) fails the first test; a
1 ms tolerance fails the second.
