# CLI instrument regression: implementation handoff

Status reconciled 2026-10-17: **designed, not implemented; zero campaign cases
executed**. This is a bounded follow-up to the qualified circuit CLI, not a
report that the schematic corpus or physical instruments have been validated.
Use [LANES.md](../LANES.md) for current ownership and the
[current plan](../PLAN.md#current-circuitinstrument-campaign--2026-10-15) for order.

## What is complete and what remains

The upstream nominal LM741 six-case CLI proof and Lite adoption
[PR965](https://github.com/CrispStrobe/brickwright-lite/pull/965) are complete.
The adopted CUI revision is `1db1bb9ee565338672c7acfefec4cf94b27196e1`; the
adoption preserved Board `b4b4c87f70624dfb570a6d21391c5a2d5a40a0e8` and
sb3-creator `c9be966fc6cf2f4343ca96c1a4477c91e05854ee`. Refresh actual pins before
working: these are the adoption identities, not permission to ignore later main.

1. **Release prerequisite, existing owner.** PR1011 merged the release contract;
   it did not submit TestFlight. PR1042 covers connecting the existing packaging
   helper to the three direct iOS workflow paths. Preserve its owner and finish
   actual final-source unsigned app and signed IPA inspection, embedded offline
   frontend proof, frameworks/privacy/icons/signatures, release metadata, upload,
   Internal and External groups, and Beta App Review. An old component build or
   source CI is not final combined-package qualification. Do not move an old tag.
2. **Harness implementation, available for a fresh claim.** Preparation is
   permitted in parallel with release work. PR1043 records the scope, but this
   closing session leaves no active implementation reservation. Inspect its
   actual merge/check state and other claims; publish a fresh explicit takeover
   claim before editing code. No implementation exists to resume or assume.
3. **Campaign execution, after TestFlight.** Run once on the admitted installed
   consumer with the fixed manifest, independent references and original outputs.
   A clean harness unit suite is not a measurement-campaign result.
4. **Causal repairs.** Classify every demonstrated failure, repair the owning
   upstream layer, qualify it and adopt one purposeful exact-pin batch.
5. **Instrument realism.** After the numerical boundary is understood, qualify
   the display-only scope improvement below and report remaining limits before
   proposing another campaign.

## Bounded implementation

The proposed eight paths are `LANES.md`, `PLAN.md`,
`.github/workflows/circuit-instrument-regression.yml`,
`scripts/circuit-instrument-regression.mjs`,
`scripts/lib/instrument-regression-cases.mjs`,
`scripts/lib/instrument-regression-compare.mjs`,
`test/circuit-instrument-regression.test.mjs`, and this document.
The case and comparator modules are pure; neither imports a test module or
launches a process on import. Keep the workflow manual-only. Do not dispatch
the campaign while preparing the harness. No production model, GUI, existing
workflow, dependency, lock, pin or private corpus input belongs in this lane.
`ROADMAP.md` was updated for this documentation closeout, not added to the
future executable boundary. Coordinate any necessary expansion first.

Use Node 22 and the installed `bw-circuit-ui` CLI, not a sibling checkout's CLI
or engine override. Before numerical work, use the existing package-provenance
verifier to compare installed Board/CUI bytes against independently fetched Git
sources at the consumer's exact pins and verify single-engine resolution.
Metadata consistency alone is insufficient. Record actual CLI and oracle argv,
versions, source/tree identities, input bytes and hashes. Keep this verification
read-only; the runner must not silently install dependencies or move a pin.

## Planned matrix: freeze before observing results

| Family | Cases / templates | Parameter grid | Reference |
|---|---:|---|---|
| Resistive divider / bridge | 64 / 2 | 32 each; four signed/zero source levels, resistor scales and ratios; include a balanced bridge | ngspice, plus closed-form controls |
| RC low-pass / high-pass | 64 / 2 | R: 1k, 2k, 5k, 10k; C: 10n, 20n, 50n, 100n; two polarities | ngspice |
| RL low-pass / high-pass | 64 / 2 | R: 100, 200, 500, 1000; L: .01, .02, .05, .1 H; two polarities | ngspice |
| Two source/diode/resistor arrangements | 48 / 2 | Three signed bias cases, four resistances, two explicit IS values | matched Shockley ngspice |
| NPN common-emitter / emitter-follower | 24 / 2 | Three supplies, two base-bias values, two BF values | matched explicit DC model, ngspice |
| Nominal LM741 follower | 24 / 1 | Two signs, three source phases, four loads | independent loaded transfer function |
| ADP7118 startup | 24 / 1 | Three loads, four capacitances, two rails; include 47uF and 100uF | independent RC/current-limit envelope |

Total: **312 parameter cases, 12 authored topology templates**; **264 direct
ngspice cases and 48 analytic model cases**, reported separately. These are not
312 distinct imported schematics or a fresh count of the historical corpus.
Finalize the remaining concrete values, initial conditions, selectors, clock
grids and per-quantity absolute/relative tolerances in the executable manifest
before its first numerical run. The table is not that executable frozen manifest.
Do not fit thresholds to output or silently remove refused combinations.

RC/RL proposals use 100 observations over eight time constants with the exact
same finite source ramp and zero-state assumptions in both systems. Verify
integer-nanosecond admission rather than promising all combinations succeed.
LM741 stays within 20us / 2MHz and uses a loaded, phase-aware nominal reference,
not ideal unity gain. ADP7118 stays within 1.2ms / 100kHz and must include current
limit entry and release witnesses. If a chosen case never enters a required
branch, do not count it as covering that branch.

For diode/NPN comparisons, match every relevant model field and the fixed
thermal point: VT=0.02585 V, TEMP and TNOM both 26.826793442075882 C. Unsupported
breakdown, temperature, charge or other physics is not a numerical pass. Do not
substitute generic transistor defaults or a current-source surrogate.

## Measurements and comparisons

- Include supply, output and differential nodes, signed load/source currents,
  and terminal/net KCL where exposed. NPN observations include B/E/C; LM741
  includes actual input/output and both load terminals. ADP package-current
  checks must use actual exposed authority, never nominal quiescent current.
- Name the probe explicitly. The initial mathematical matrix uses `ideal`;
  1x/10x loading requires the same impedance in the reference. Ideal-probe
  agreement is not a physical oscilloscope front-end qualification.
- Treat clock and acquisition identity as data. Scope CSV `elapsed_seconds`
  is relative to its own `startTimeNs`, not time zero. Retain and check the
  header, interval, point count, requested window and actual timestamps. Never
  shift a later record into an earlier missing sample's position.
- Keep sign conventions explicit per channel. Static OP currents are INTO
  the terminal; multimeter currents are OUT of the part. Transform the reference
  deliberately and retain its original sign. Do not compare formatted display
  strings instead of finite SI values and units.
- `measure --current` is refused; use `--meter current:PART.TERMINAL`.
  `op --kcl --json` exposes signed static conservation, not an independent oracle.
  Plain `op --json` is not a JSON voltage API at the adopted revision. The typed
  `dc-sweep` route needs distinct endpoints and 2–501 points. Pick the actual
  supported route; do not invent one-point or equal-endpoint sweeps.
- Compare whole records and meter-window integrals, not only final values.
  Reject absent/duplicate channels, points or selectors, nonfinite data, wrong
  units, ambiguous grids, incomplete capture and failed bounded-work receipts.

Retain original input and oracle decks, CLI stdout/stderr, oracle output,
waveform CSV, manifest and work receipts, each with bytes and hashes. Input
generation alone is not oracle execution. Reconstructing a topology incorrectly
in both generators must not yield a misleading pass: add independently authored
topology/parameter controls and simple analytic witnesses.

## Required negative controls and report

Pure tests cover deterministic IDs and the 312/12 and 264/48 counts; finite,
unit-typed data; exact clock/window identity; missing/duplicate observations;
and complete denominator accounting. Detect a changed voltage, reversed
nonzero current, timestamp-only shift, wrong R/C/L, LM741 phase/pole substitution,
and omitted ADP current-limiter branch. Negative tests must reach numerical
comparison, not pass because an unrelated parser or model refused the input.
Use nonzero witnesses: flipping a genuine zero does not prove sign sensitivity.

During actual execution, repeat the relevant perturbations against retained
real outputs without replaying the guest or replacing original evidence. Report
all preselected IDs, reference class, meaningful measurement locations and
attempted/executed/comparable/pass/fail/refused/not-run counts. The partitions
must reconcile. Preserve originals on failure and exit nonzero for a failed or
incomplete campaign; unavailable ngspice is not a successful skipped campaign.

## Follow-up repair and realism lanes

For each failure, retain the smallest original reproducer and distinguish:
import loss, unsupported/model-mismatched physics, engine error, instrument or
clock/sign error, bounded-work exhaustion, and harness/oracle error. Change only
the owning layer with a load-bearing negative control. Shared engine/importer/
instrument behavior lands upstream first, then Lite adopts exact qualified
packages; do not create a local fork or move thresholds to improve a score.

The first realism lane should expose viewport overrange, actual acquisition
mode/sample interval/depth, Nyquist and absent anti-alias-filter limits. Preserve
raw samples, CSV, solver and electrical probe loading. Do not invent ADC noise,
resolution, filtering or a hardware-accuracy claim. Refresh its actual source
paths and publish a separate bounded claim. Acceptance needs real GUI controls
for overrange, prefix/ring wrap and sampling/aliasing disclosures, alongside
unchanged CLI/raw numerical records and affected built/installed-consumer proof.

Stop after these bounded tasks and report unresolved physics and evidence
limits. Do not turn "fix failures" into implementing every device model or
automatically starting another corpus-wide campaign. Check existing owners
before taking a follow-up; release, runtime and other simulator lanes remain
independently owned.
