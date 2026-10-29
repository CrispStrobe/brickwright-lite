# Twinpoint central pivot pin candidate

The Twinpoint adaptation uses the existing stock `32002.dat` frictionless
3/4 pin for `hingeP`, replacing `3673.dat`. Its origin moves 5 LDU along its
unchanged local X axis. The stock connector is at local X = -5 LDU, so its
world centre, axis and two connected thin links remain unchanged. The other
116 placed parts, the five hinges, motor ports A/B and collision exclusions
are unchanged.

Regenerate the model from its reviewed original:

```sh
node scripts/adapt-seven-machines.mjs twinpoint \
  test/fixtures/model-files/twinpoint-source/original.ldr \
  overlay/scratch-gui/static/sim-lab/models/twinpoint.ldr
node --test test/bw-sim-twinpoint-pin-clearance.test.mjs
```

The generator retains the original input hash and its existing construction
and overlap checks. Only its Twinpoint block changes. The focused controls
check repeatable regeneration, unchanged other parts, connector placement,
both complete 10 LDU hole engagements, compiled topology and deliberate
placement, stock-part and retention counterexamples. They start no physics
engine or programme VM.

## Nominal stock seating

The stock pin spans -15 to +15 LDU about the preserved connector centre.
The thin-link holes occupy [-15, -5] and [5, 15] LDU. The source profile's
6.5 LDU retaining lips seat in the outer counterbores, whose radius is 8 LDU;
they are larger than the 6 LDU through-bores. The radius-8 collar spans
[3, 7] LDU and seats in the second link's [5, 7] counterbore. These dimensions
come from `32002.dat` through `connect.dat`/`connect3.dat`, and `4586.dat`
through `peghole.dat`.

This is a nominal source-profile seating argument. It does not establish
manufacturing tolerances, clip flexibility, pull-out force, a rigid clamp
between the links or a watertight solid-fit result. Some axial play remains.
The stock catalogue is untouched: its existing 0.2 g mass and box proxy are
used as declared, rather than altering the former pin's 0.25 g mass or
shrinking a collider. The assembly's mass therefore changes with the part.

The nominal axial gap to each crank becomes 2 mm. That equals the existing
speculative-contact distance, so contact-pair processing can remain. Its
absence is not an acceptance criterion. The part substitution is a finite
construction candidate; it does not establish the cause of the old closure
failure or prove physical clearance at a contact callback.

## Qualification still required

Pure construction controls do not qualify the motion. Fresh qualification
must bind the actual candidate model, current compiler/core and adopted engine
package, run the full unchanged 90-second programme and preserve the original
0.55 mm hinge-closure limit, finite motion, hub completion and all other
existing guards. Actual native and GUI/worker/save-reopen acceptance remain
pending. Old-pin results do not qualify this model, and no physical-accuracy
or hardware result is claimed.

Landing also requires every actually enabled final-head check to succeed,
with declared skips and reviewed parents/tree. Follow the selected-fast-tier
queue policy: no `ci:full` label, dispatch or guard waiver. No compiler,
parser, catalogue, registry, dependency pin, contact policy, solver parameter,
programme, time horizon or acceptance threshold is changed by this candidate.
