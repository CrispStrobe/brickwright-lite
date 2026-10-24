# CLI instrument regression

Status reconciled 2026-10-24: **existing TestFlight delivery verified; fixed
312-case CLI campaign independently accepted; bounded scope-display consumer
qualification in progress**. This is a bounded follow-up to the qualified circuit CLI, not a
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

1. **Release prerequisite: verified.** The read-only
   [audit 40048235422](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40048235422)
   observed v0.1.26 on both iOS and macOS: valid, unexpired, matching English and
   German notes, both groups linked, review approved, and both internal/external
   states `IN_BETA_TESTING`. Independent readback of the retained original
   recomputed complete availability. This is the existing immutable release
   `6d78f7e107752497ed96b30b03e985386916fc59`, not a new application build.
   No recovery write or upload was needed; the earlier metadata-wait failure
   remains preserved separately. This is a finite observation, not a continuing
   distribution guarantee.
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

## Executed campaign — 2026-10-24

[Run 40057471489](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40057471489)
executed the fixed manifest at Lite `20f5ade6dda10616a3f51d5230496415c6e6b2f4`,
Board `b5650092695643622a53bcc40008133760e2d8a2` and CUI
`17fd4afb0bf27015b099ca67c9cca05919084654`, using Node 22.23.3 and ngspice 42.
All **312 attempted, executed and comparable cases passed**: **264 ngspice**
and **48 nominal analytic**, with zero failed, refused, noncomparable or not-run
cases. The nine required retained-record perturbations were detected without
replaying an original experiment. These are 12 authored topologies, not 312
imported schematics or validation of the historical corpus.

Independent readers checked all **4,448 retained files** and recomputed
**87,488 numerical checks**, agreeing on all 312 cases. Observed coverage was
**2,024 measurement locations**, **704 waveform channels / 68,480 waveform
points**, **960 static observations** and **26,760 meter-window observations**.
All 240 waveform receipts and 72 static command records join the admitted
installed package identities. Independently reconstructed source fingerprints
match the recorded CLI/engine fingerprints. This matrix uses JavaScript MNA;
package-byte checks of unrelated Wasm payloads do not establish native execution.
Transitive dependencies were not independently reconstructed; this is not a
hermetic-execution certificate.

The official original archive SHA-256 is
`1456d0437b78c55b06b90dfa0b2b8ef60992a7ebd729184e6f08624d691a9828`.
Input definitions and tolerances remained frozen at definition SHA-256
`063ee3e41c26a30ae2fbf9e6435d0423215c62a8b738e5b4c8385f233c6a0304`.
The archive and job log were acquired once; independent audit did not rerun
CLI, engine or oracle. No model defect was demonstrated in this matrix, so no
numerical patch or tolerance change is justified. Existing unrelated producer
and audio work remains separately scoped. The remaining ordered task is the
bounded scope-display improvement and actual built-consumer proof below.

This result does not establish physical LM741/ADP7118 accuracy, missing device
physics, analog front-end/ADC fidelity, hardware behavior, or a newer signed
TestFlight application. Later package adoption must preserve this historical
receipt rather than relabel it with unmeasured sources.

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

After harness qualification and merge, dispatch **Fixed CLI instrument regression**
once with `release_run: 40048235422`. It checks that exact official run/attempt/
job/source metadata and that the admitted release source is an ancestor.
Its categorical release snapshot is bound to the independently read original:
summary SHA-256 `5f3b7d92ede237ab656d79e2a1d9812474f33197e8dd337f0b95b143ce35510e`;
original log SHA-256
`734373adbf58a5763860f558e8568ac82b8a173ad90f00cbee8cc8da38502bdb`,
24,622 bytes. The raw original was acquired once and retained; the campaign
does not download it again or publish a raw-log copy. The snapshot contains no
private resource IDs. A different observation requires a reviewed provenance
update; an arbitrary successful run or pending review cannot open the gate.

The manual workflow installs the locked consumer and ngspice on the hosted
runner, fetches the two exact source commits, and invokes `--run` with explicit
installed-root, source, admitted release observation and fresh output paths. The runner
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

The bounded scope-display implementation is upstream
[PR117](https://github.com/CrispStrobe/bw-circuit-ui/pull/117). It exposes actual
capture mode, interval, capacity, retained/displayed counts, origin and ring wrap.
Only point-sampled spectra receive a Nyquist value. Viewport-overrange warnings
refer to the drawn range, not physical clipping; absence of an analogue
anti-alias filter or ADC model is explicit. HOLD freezes the last drawn caption
and picture while capture can continue. Raw samples, CSV, solver and electrical
probe loading are unchanged. No ADC noise, resolution, filtering or hardware
accuracy is invented.

The upstream real-browser qualification passed all 71 scenarios, including
actual vertical warning/clear controls with byte-identical CSV, prefix/wrap,
HOLD with a changed requested viewport, visible redraw on RUN, and the separate
sample-series metadata. An earlier proof failed because it inspected a queued
Step before cooperative work completed. The forward evidence waits for the
actual clock, capture count and ready state; it preserves the original failure
and does not change production behavior, expected counts or timing budgets.

Lite adoption remains separately qualified under the
[consumer claim](../lanes/2026-10-24-scope-display-consumer.md). Its actual built
GUI proof retains the two original CSV downloads, observed circuit, scalar
capture/clock/readout records and HOLD/resume canvases in the collected browser
artifact. A changed package identity requires a new numerical campaign; the
historical result above keeps its original sources. Neither browser source nor
web deployment evidence qualifies a newer signed TestFlight binary.

Stop after these bounded tasks and report unresolved physics and evidence
limits. Do not turn "fix failures" into implementing every device model or
automatically starting another corpus-wide campaign. Check existing owners
before taking a follow-up; release, runtime and other simulator lanes remain
independently owned.
