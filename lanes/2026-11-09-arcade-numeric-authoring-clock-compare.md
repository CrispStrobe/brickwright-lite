# Arcade numeric authoring gate: elapsed controlled-clock comparison

Status: claim and change in one PR. Owner: Arcade lane. Base: main
`4b2f5047dde6`.

Scope: one assertion in `scripts/verify-arcade-numeric-authoring-gui.mjs`, new
`scripts/lib/clock-elapsed.mjs` and `test/clock-elapsed.test.mjs`. No product
change.

Problem: the gate installs the Playwright clock at time 0, so its two
`Date.now()` readings are fractional milliseconds (for example `24.1` and
`1024.1`). Their float difference is `999.9999999999999`, and the exact
`=== 1000` check failed on a correct one-second advance (seen on Lite #1686).

Change: `elapsedMatches(before, after, 1000)` accepts the difference only
within 4 units in the last place of the larger reading (about `2.3e-13` ms
near 1000 ms), the rounding the subtraction itself can introduce. It does not
round to whole milliseconds, so a fractional real error is still reported.

Evidence: the unit test reproduces the `24.1` case and rejects 999, 1001,
999.5, 1000.01, 0, 2000 and non-finite readings. Mutations: tolerance 0 (the
old exact check) fails the first test; a 1 ms tolerance fails the second.
