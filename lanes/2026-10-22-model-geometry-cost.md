# Claim: bounded cost of complete model geometry validation

DONE locally / exact-head hosted qualification pending — owner: Robot Lab model delivery lane. Base: `d41b38431`.

The main unit (4/4) job exhausted its existing 30-minute limit while the complete
model solid-geometry module was still running. The original log is retained.
The same module is a long CPU-bound part of local validation. Its relative-pose
cache already exists; preserve it rather than introduce another cache.

Scope: `test/bw-sim-models-solid.test.mjs`, narrowly extracted test-only geometry
math if needed, focused equivalent-result/performance controls and this claim.
Profile the repeated three-component lengths in the exact winding-number sum;
use a bounded finite fast path with the existing robust length outside it only
if representative measurements demonstrate a useful reduction. Preserve every
model, fixture, mesh vertex/centroid, triangle, negative control, winding cutoff,
solid skin and insertion rule. No solver, model, collision-exemption, source
admission, sharding, concurrency or timeout-budget change is included.

Qualify the scalar math against the original function, retain overflow,
underflow and non-finite behavior, run the complete unchanged geometry roster
and meaningful interpenetration/insertion controls, and compare CPU cost on the
same inputs. Merge this claim before changing the shared geometry test.

The bounded three-component length and complete original winding sum are now
in a test-only helper. Exceptional magnitudes retain the robust function; near
the unchanged 0.5 membership boundary the original robust sum is recomputed.
The existing pose cache, distance/skin calculation, triangle order and complete
model/fixture/sample roster are untouched. Three scalar/boundary controls and
all eight complete geometry controls pass, including insertion/clocking
negatives. Representative official-part sums use 4.4–5.1 times less CPU in an
interleaved same-input comparison; maximum winding difference is 1.43e-13 with
identical sampled membership. The complete geometry module finishes in about
195 seconds on the validation host, compared with about 831 seconds for the
earlier unchanged checks. No timeout or concurrency allowance was increased.
