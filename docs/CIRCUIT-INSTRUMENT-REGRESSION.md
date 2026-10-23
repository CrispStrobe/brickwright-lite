# CLI instrument regression

Status reconciled 2026-10-23: **harness implementation in qualification; zero
campaign cases executed**. This is a bounded follow-up to the qualified circuit CLI, not a
report that the schematic corpus or physical instruments have been validated.
Use [the lane protocol](../lanes/PROTOCOL.md) and dated claims for current ownership and the
[current plan](../PLAN.md#current-circuitinstrument-campaign--2026-10-15) for order.

## What is complete and what remains

The upstream nominal LM741 six-case CLI proof and Lite adoption
[PR965](https://github.com/CrispStrobe/brickwright-lite/pull/965) are complete.
The new harness contract was traced against Board
`b5650092695643622a53bcc40008133760e2d8a2` and CUI
`17fd4afb0bf27015b099ca67c9cca05919084654`. The runner refuses a different
consumer pin until its admission and manifest have been reviewed; it never
substitutes a newer sibling or silently moves a dependency.

1. **Release prerequisite.** v0.1.26 was signed and uploaded; its original run
   failed while waiting for iOS metadata and skipped distribution. This is not
   evidence of present TestFlight availability. Follow
   [existing-release recovery](TESTFLIGHT-RECOVERY.md): audit first, recover
   notes/groups/review only if admitted, and require actual availability for
   both internal and external testing. Do not rebuild or upload blindly.
2. **Harness implementation.** Preparation is permitted in parallel with release
   recovery. The [merged claim](../lanes/2026-10-23-circuit-instrument-regression.md)
   owns the bounded implementation below. Pure controls exercise transport,
   independent equations and false-success cases; they are not an engine run.
3. **Campaign execution, after TestFlight.** Run once on the admitted installed
   consumer with the fixed manifest, independent references and original outputs.
   A clean harness unit suite is not a measurement-campaign result.
4. **Causal repairs.** Classify every demonstrated failure, repair the owning
   upstream layer, qualify it and adopt one purposeful exact-pin batch.
5. **Instrument realism.** After the numerical boundary is understood, qualify
   the display-only scope improvement below and report remaining limits before
   proposing another campaign.

## Bounded implementation

The eleven owned paths are the dated claim, campaign sections of `PLAN.md` and
`ROADMAP.md`,
`.github/workflows/circuit-instrument-regression.yml`,
`scripts/circuit-instrument-regression.mjs`,
`scripts/lib/instrument-regression-cases.mjs`,
`scripts/lib/instrument-regression-compare.mjs`,
`test/circuit-instrument-regression.test.mjs`, this document, `CI-POINTERS.md`
and the workflow's scoped `docs/generated/ci-step-census.json` entry.
The case and comparator modules are pure; neither imports a test module or
launches a process on import. Keep the workflow manual-only. Do not dispatch
the campaign while preparing the harness. No production model, GUI, existing
workflow, dependency, lock, pin or private corpus input belongs in this lane.
The pointer/census follow the release workflow's canonical bootstrap; this
lane does not change the generator or unrelated observations.

## Commands and evidence

`node scripts/circuit-instrument-regression.mjs --plan` prints the deterministic
manifest without installing, simulating or invoking an oracle. Pure controls:

```sh
node --test test/circuit-instrument-regression.test.mjs
```

After actual TestFlight completion, dispatch **Fixed CLI instrument regression**
once, supplying the successful main recovery/audit run ID. It first admits that
run's metadata, verifies its source is an ancestor, acquires its original log
once and requires a unique complete release summary. A green metadata workflow,
pending review or writer exit alone cannot open the campaign. This is a finite
availability observation, not a continuing distribution guarantee.

The manual workflow installs the locked consumer and ngspice on the hosted
runner, fetches the two exact source commits, and invokes `--run` with explicit
installed-root, source, release-run/log and fresh output paths. The runner
itself never installs dependencies. Existing output directories are refused.
Every original command/stdout/stderr, input, oracle deck/table, raw capture,
work receipt, package proof and comparison is retained. Incomplete reports and
missing prerequisites fail. The default and unit-test paths never run this job.

Ngspice retains its adaptive raw table for meter-window integration, then
produces a separately labelled equidistant reference with `linearize`. This
oracle interpolation does not alter CLI samples. The comparison rejects shifted
or incomplete time grids. Output columns use the documented
[ngspice table controls](https://ngspice.sourceforge.io/docs/ngspice-manual.pdf),
16-digit output, a single scale and explicit vector names.

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
The executable manifest freezes the concrete values, initial conditions,
selectors, integer clock grids and per-quantity tolerances before observation.
It contains **72 static DC cases and 240 waveform cases**. Its definition hash
identifies all 312 cases, not just this summary table.
Do not fit thresholds to output or silently remove refused combinations.

RC/RL proposals use 100 observations over eight time constants with the exact
same finite source ramp and zero-state assumptions in both systems. Verify
integer-nanosecond admission rather than promising all combinations succeed.
Resistive sources rise over 10us in a 100us capture. Reactive sources rise over
one tenth of a sample interval. LM741 uses ±10mV, delays of 10000/10033/10067ns,
1ns rise and 2k/10k/100k/1M loads. It stays within 20us / 2MHz and uses a loaded, phase-aware nominal reference,
not ideal unity gain. ADP7118 stays within 1.2ms / 100kHz and must include current
limit entry and release witnesses. Its loads are 100/1000/10000 ohms,
capacitances 1/10/47/100uF and input rails 6/8V. The 47uF cases require entry
and release; 100uF requires entry, without claiming release inside this window.
Those witnesses use interval currents recovered from actual prefix integrals,
not an inaccessible internal region flag. If a chosen case never enters a required
branch, do not count it as covering that branch.

For diode/NPN comparisons, match every relevant model field and the fixed
thermal point: VT=0.02585 V, TEMP and TNOM both 26.826793442075882 C. Unsupported
breakdown, temperature, charge or other physics is not a numerical pass. Do not
substitute generic transistor defaults or a current-source surrogate.

Fixed absolute/relative gates are: passive waveform 100uV/0.1%, passive means
1uV/0.01% or 1nA/0.01%; static voltage 10uV/0.1% and current 1nA/0.1%; LM741
waveform 100uV and means 2uV (current allowance 2uV/load + 1pA); ADP waveform
0.5uV, voltage/current means 1uV/1uA and package KCL 0.1nA. LM/ADP relative
allowances are zero. These gates are frozen before the first circuit output;
failure is a diagnosis input, never permission to fit the gate.

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
