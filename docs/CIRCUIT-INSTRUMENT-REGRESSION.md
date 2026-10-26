# CLI instrument regression

## Current sequence — 2026-10-25

The [five-item contract](../lanes/2026-10-25-imported-circuit-instrument-campaign.md)
has reached its bounded consumer acceptance endpoint: current-consumer baseline;
a source-admitted distinct imported-circuit cohort; demonstrated recurring-cause
repairs; one existing part's reference assessment; one deterministic modeled
instrument effect. The remaining reference and model limits stay explicit. All source patches
remain in operator-owned CrispStrobe repositories. Stop only after the fifth
accepted step. The previous sequence and receipts below remain complete and
retain their own identities.

### Current supplier and consumer boundary

Step3 is adopted by Lite PR1397 at `7f9edea2cc648d7139d1f57099d5121361d48a01`:
CUI `408c179a9bf5ffc28a4626e9ff5a78fc35cdc671`, unchanged Board761153ff.
The actual built consumer passed both signed PMOS bulk-wiring journeys. The
retained 307-input affected recheck left previous native observations identical;
this does not convert unknown reference eligibility into physical validation.

For step4, the authored LM741 assessment used eleven related requests across
**two topologies**, not eleven distinct imported designs. Endpoints around
±0.999989289V and 20us continuous means around ±0.732945462V describe different
quantities. A 150kΩ external rail load draws 0.0001A, but that does not supply a
missing LM741 quiescent-current law. The demonstrated false supply-current zero
is repaired by Board PR704: absent/nonfinite represented branch current refuses
by name while genuine finite zero/signs remain valid. Its selected qualified
consumer target is `836867513c3e7fac420ddaa32c17e1c7b6d3e513`.

For step5, CUI PR122 landed `1bc233c9297e03abb9b7eb603e045b4e92b0bb40`.
[CI40226023234](https://github.com/CrispStrobe/bw-circuit-ui/actions/runs/40226023234)
passed all three jobs: 3,349 unit passes with 17 declared optional skips,
168 source-precision controls,17 SPICE checks and83 browser scenarios. The
ADC uses explicitly requested primary voltage point samples and an ideal
uniform reconstruction grid. The raw default, original measurements and meter
means remain authoritative. Modeled trace/trigger/readout, HOLD, clipping,
paired CSV and externally expected receipt settings are separately observable.
Supplier arithmetic/served-UI mutations are distinct from consumer acceptance.
The original failed source heads remain failed; later greens do not relabel them.

The [joint consumer lane](../lanes/2026-10-25-meter-adc-package-adoption.md)
landed through PR1413 as `b26ae0aedde4e53a254b0bc48c83b156be7cb026`.
No private cohort replay, physical certificate, signed release or deployment
is part of this closeout.

### Accepted joint consumer and protected numerical result — 2026-10-26

[Build40264899201](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40264899201)
qualified source `02ef9419443bbc3154b7a94ace8e35616df31750` with all five
workflows successful: 36 successful checks and six source-declared skips.
Independent original-log readback accepted 10 new browser checks, six preserved
browser checks and three required unit checks. The actual checkout
`41aa713874cccb5457007a8b6d10f67a347c6634` and reviewed source share tree
`922580819a699958a0003f4cab050a4dbd36067e`, also verified at the matched merge.
The accepted journey includes meter unavailable/represented-current recovery,
ideal ADC reconstruction/trigger/CSV/HOLD, reset/rearm and failed-source refusal.
Pinned-package verification reports were observed; the independent reader did
not re-execute npm-pack verification or audit a compiled artifact body.

The separate fixed recheck
[Run40237367378](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40237367378)
ran once at `1f967949ffc16a0ff792e493c1343e7fe88a6e2e` with Board83686751
and CUI1bc233c9. Independent readers accepted 312 cases and 87,488 checks:
264 ngspice cases and 48 explicitly nominal cases across 12 authored topologies.
All 240 raw waveform CSVs match baseline40172711900 byte-for-byte. Its numerical
source closure remains unchanged in the accepted consumer; the experiment was
not repeated or relabelled as a numerical run on source02ef. The original1f
whole-head qualification remains rejected because an enabled Rust check was
cancelled; the accepted numerical result does not waive that failure.

The earlier mode-publication timeout and point-rearm failure remain unresolved
causal observations. This later successful hosted journey qualifies this run;
it does not identify either intermittent cause or establish a product fix.
The [unclaimed follow-ons](../ROADMAP.md#scoped-follow-ons-after-consumer-acceptance)
cover that attribution, long captures, broader admitted references and physical
part/instrument modeling. No further lane is started by this closeout.

### Step 1 accepted: current package baseline

[Run40172711900](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40172711900)
executed once at `4c416bcfe1a219faaec371ac638f607628f347a7` on the frozen
`lane/circuit-instrument-baseline-20261025` reference, with Board
`761153ff92d521c01107ee7b32922ba7adc10ee2` and CUI
`91d8434a79d373cef2837c137ab356356f1a3b44`. Node 22.23.3 and ngspice42 were
observed in the retained runtime/version records, not inferred from the old run.
Readers, case intent and source fingerprints were frozen before dispatch.

All 312 cases passed independent readback: 264 ngspice and 48 explicitly nominal
analytic, across 12 authored topologies. Independent readers admitted 4,448
files and recomputed 87,488 numerical checks, with zero failed, refused,
noncomparable or missing cases. Coverage remains 2,024 measurement locations,
704 waveform channels / 68,480 points, 960 static observations and 26,760 meter
windows. The unchanged case-definition SHA-256 is
`063ee3e41c26a30ae2fbf9e6435d0423215c62a8b738e5b4c8385f233c6a0304`.
All 240 retained waveform CSVs equal the preceding run40077158320 byte-for-byte;
this informational comparison did not replay either experiment or replace the
frozen independent numerical acceptance criteria. Nine retained producer
perturbations were detected; independent pre-run controls additionally rejected
eight common-mode definition corruptions, 20 invalid acquisition contracts and
11 wrong runtime/path/oracle identities.

The selected engine source fingerprint covers 321 JS/JSON files and is
`7663f7e174247a075e965cbfa7273cdf4aa13e60a10e890f8ec31264dc95fbb8`;
the selected CLI fingerprint covers 433 files and is
`25ede8e0dce25a7eb7cf6b642c874303165fb29f43f5446e20d934744d7df6c1`.
All 240 waveform receipts and 72 static command records join the admitted
installed package/runtime identities. The actual original archive is
14,265,673 bytes, SHA-256
`b7f0b3e83f0452ffe04f299ef1c7616aecd03745e99a8d5bd189ed26a2d61679`;
the original job log is 267,987 bytes, SHA-256
`9845bafdffc1597f163e0b75c945c0141ac44ad39e7fd1f4784b2bc50b1a5191`.
Both were acquired once after terminal metadata admission. Independent readers
use the originals, without importing the producer helpers or replaying CLI,
engine or oracle. This is JavaScript MNA and stated nominal-reference agreement,
not native execution, full transitive-dependency reconstruction, physical part/
ADC calibration, full-corpus validation or a newer signed release receipt.

### Step 2 evidence: imported structures and actual CLI

The frozen offline research cohort contains 307 graph-distinct structures:
299 OP-only and8 OP/AC source inputs,with 278 containing MOS devices. Exact
labelled connection-graph isomorphism preserves ground,directed terminals and
model polarity; device retargets,value changes,formats and analysis choices do
not inflate the design count. Sources are small (at most 13 parts / 14 nodes),
not a balanced inventory of op-amp/regulator/teaching circuits. Private input
rights do not become public redistribution clearance.

At the same qualified Board/CUI package commits as step1,with Node 22.23.2 and
ngspice 42, the unchanged comparison contract reports:

| Imported source outcome | Inputs |
| --- | ---: |
| Pass | 67 |
| Partial | 8 |
| Numerical disagreement | 4 |
| Not-run/refused or unavailable comparison | 228 |
| Total requested | 307 |

There are 350 compared numerical observations:339 agree and11 disagree; no
missing,extra or nonfinite compared values. These counts are not350 circuits.
The first oracle sandbox failure remains retained. Repairing its temporary-file
boundary reruns only the failed oracle work and reuses all307 byte-identical
original native responses. Original raw SPICE bytes,generated decks,streams,
source/runtime hashes and every failed/incomplete invocation are independently
reconciled. Three extra invocations are explained FAILED fallback trials and
never rescue a result. Numerical bounds and original failures are unchanged.

An actual installed-CLI study uses 32 of those inputs,not 32 additional designs.
It runs 32 `op` and 32 `op --kcl --json` commands. Twenty OP calls succeed;19
also provide complete conservation diagnostics. Independent readback of 190
terminal observations recomputes 169 net/part checks,all passing,and 81
descriptive oracle comparisons (58 voltages/23 signed source currents) agree.
Reference-method eligibility remains unknown for those 19 cases; agreement is
not a device-accuracy certificate. Refusals include time-varying sources,
DC-floating networks,semantic loss and unsupported PMOS representations.
A genuine implicit-NMOS-body mapping gap explains the additional KCL refusal.
The audit accounts separately for six expected intrinsic NPN collector nodes
and authored external nodes; arbitrary unexplained nodes are not ignored.
This does not add a new public/diagnostic-node CLI output format.

Two unchanged original RC inputs separately request5ms/1MHz watch acquisition
with5,000 samples,ideal differential source/R/C channels and signed meter
queries. The current product refuses passive precision watch before creating
CSV/receipt artifacts. Both conditional transient references remain NOT-RUN.
These are observed acquisition refusals,not successful traces or completion
of the source's5,001-point analysis. The CLI reserves captureSamples+2,so this
request also proves no ring wrap. Existing312-case time-domain evidence stays
separate. Static OP current is INTO-terminal; the meter uses OUT-of-terminal
current. A5ms meter window covers0..t and is not an arithmetic sample mean.

### Step 3 source repair and remaining endpoint

[CUI claim PR119](https://github.com/CrispStrobe/bw-circuit-ui/pull/119)
bounds exact PMOS bulk wiring (88 refused inputs),strict implicit-NMOS-body
conservation,and authored-step-aware preflight. Preserve the fourth PMOS
connection and all unsupported-model refusals; never drop bulk current or raise
the default20k work cap. Require nonzero-body-current/wrong-ground/missing-wire
controls,actual CLI/SPICE checks,affected browser proof and all enabled
exact-head checks before qualified consumer adoption. A four-terminal SPICE
representation does not assert a new physical package face.

The four numerical mismatches reduce to weakly anchored cutoff/common-mode
witnesses. Retain them and their original bounds; successful SPICE execution
alone is not a robust unique physical reference,and normal device physics must
not be tuned to a convenient root. Long passive-watch support is a separate
capability: an additive domain/profile design must bound whole-capture work,
distinguish report callbacks from all acquired samples,preserve the original
failed request,and handle meter history plus accepted-solve quadrature. Do not
rename200 samples as5000 or reset limits at each report.

Step 4 still needs an independent lawful LM741 reference across rails, load,
saturation,frequency and slew. Step 5 still audits existing effects and qualifies
one genuinely missing deterministic measurement-chain effect with ideal/raw
preserved. Aperture/audio is already adopted; do not reimplement it. Only owned
CrispStrobe source repositories are patched. No new release upload or physical/
full-corpus accuracy claim follows from these studies. The five-item loop stays
open until the fifth accepted step.

## Previous completed sequence — 2026-10-24


Status reconciled 2026-10-24: **existing TestFlight delivery verified; fixed
312-case CLI campaigns independently accepted; bounded scope-display consumer
adopted and actual built-GUI originals independently accepted**. This is a bounded follow-up to the qualified circuit CLI, not a
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
and audio work remains separately scoped. The fifth ordered task is also
complete; its separate consumer identities and built-browser proof appear below.

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

The first consumer source-controls job
[40072171188](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40072171188)
reported 66/67: the tracked GUI manifests and current x86 browser
controller/reader still selected the preceding CUI pin. An initial census of
materialized sparse files had omitted them. The forward repair derives the
complete dependency closure from the Git index, updates only current identity
bindings, regenerates GUI metadata and notice source URLs, and preserves every
guest/reader assertion and disabled actual-execution guard. All 67 local source
controls pass; the original failure is retained. The final hosted controls job
also passed all 67 on the qualified consumer head. Historical originals keep their original reader
revision and measured sources.

Lite adoption [PR1334](https://github.com/CrispStrobe/brickwright-lite/pull/1334)
is qualified under the
[consumer claim](../lanes/2026-10-24-scope-display-consumer.md). Its evidence
was acquired once and read independently, without replaying the CLI, engine,
oracle or browser. Historical originals above retain their original identities.

### New-consumer numerical result

[Run 40077158320](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40077158320)
executed once on branch `lane/scope-display-adoption-20261024`, exact head
`75c95bea9b34b08d0dc1014c41df551c1451b10f`: Board
`b5650092695643622a53bcc40008133760e2d8a2`, CUI
`420f3e15bd0064119416386853bd35713347c252`, Node 22.23.3, ngspice 42.
The existing workflow accepts this branch; this was not a default-branch run.
The unchanged definition SHA-256 is
`063ee3e41c26a30ae2fbf9e6435d0423215c62a8b738e5b4c8385f233c6a0304`.

All 312 cases passed: 264 ngspice and 48 explicitly nominal analytic, across
12 topologies. Independent readers admitted 4,448 files and recomputed 87,488
numerical checks, with zero failed, refused, noncomparable or missing cases.
The measured coverage remains 2,024 locations, 704 channels, 68,480 waveform
points, 960 static values and 26,760 meter windows. All 240 waveform CSVs are
byte-identical to the retained preceding campaign; none was replayed.
All 240 waveform and 72 static receipts bind the observed runtime and packages.
Nine retained perturbations were detected.

Original archive: 14,265,211 bytes, SHA-256
`33d69d284ffe2b75fe6d7e475845b14b628a075a51a2636cf75b11e1f17e38d4`.
Original job log: 261,846 bytes, SHA-256
`1b5acf3f86c83c8cc4a073f64e8f5c4da95293694b3f31c70f64d7c06026a9ef`.
These are JavaScript MNA and stated analytic comparisons, not native/Wasm,
transitive-dependency reconstruction, hardware or full-corpus qualification.

### Actual built-browser result

[Build 40074942830](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40074942830)
qualified the same consumer. Light browser job `120819548000` passed its actual
Instruments checks. The original checkout
`5070169cc275ec5035b81bcc6c5545dfb8cdef60` has parents
`ab7c288fe7bf82ed34cb5c1d28219961a14bde78` and the candidate above; its tree
`03785084571a28c1184563b7587bb49df1c26d9f` equals the candidate tree exactly.
The original log proves installed package payload checks in both root and GUI
scopes, single-engine resolution, editor build and serving that built editor.

Adoption landed as `b0b9b3d55eaac812484018f7856089c71bed775d` after all
34 enabled candidate checks succeeded; six conditional jobs were skipped and
the superseded branch-push Rust run was replaced by its successful PR run.
Main advanced during qualification by 21 disjoint CI-reporting and native-
qualification tooling paths. The merge preserved them: every tracked byte
outside those paths equals the qualified candidate, including application
inputs, pins, case definitions and browser producer. The actual merge parents
and predicted tree were verified. This is consumer-input equivalence, not a
claim that the new whole-repository tree was the earlier browser checkout or
that the native qualification tooling was exercised by this browser proof.

The real RC example uses the actual 100 Hz sine source, amplitude/offset 2.5 V.
Six retained observations join capture clocks to displayed mode, interval,
counts, capacity and origin. They cover the 5,000-point prefix, 10,000-point
wrapped envelope, HOLD while acquisition advances, RUN redraw, a separate
500-point sample capture and viewport warning/clear. The disclosed sampling
limits are actual UI text; overrange describes the viewport, not hardware
clipping. Three decoded canvas controls confirm HOLD stays unchanged and RUN
redraws. Both 5,000-row CSV downloads are exactly 225,269 bytes and have SHA-256
`3832bae83cecc5f7ce1633fdf60d7b0577e9f06e98744d599833d22a8066ac77`.

Original Instruments artifact `12555357324`: 559,808 bytes, SHA-256
`87d271539f0d2ed03e2a501bd41b3ffdecc12c0443670d210184f1af804997ca`.
Original light-browser log: 394,057 bytes, SHA-256
`2eecb25256f76e8628d2bbe23a3c9d3e2055e04dbe9a928b66e7ab70719fb8b3`.
The archive retains both CSV downloads, observed circuit, capture/clock/readout
records, warning text and canvases. Independent readers use the originals,
not producer imports or a browser replay. Neither this built web application
nor its package provenance qualifies a newer native or signed TestFlight binary.

Stop after these bounded tasks and report unresolved physics and evidence
limits. Do not turn "fix failures" into implementing every device model or
automatically starting another corpus-wide campaign. Check existing owners
before taking a follow-up; release, runtime and other simulator lanes remain
independently owned.

## Work beyond this bounded endpoint

These are follow-ups, not evidence that the fixed matrix covers them. Refresh
ownership and source state before claiming one; do not begin another campaign
as an automatic continuation of this five-item sequence.

- **Imported-corpus measurements:** select a frozen, licensed inventory and a
  stratified set of supported circuits with meaningful probe locations. Record
  actual attempted/comparable/refused denominators and explicit model assumptions.
  Retain input decks, raw captures and independent SPICE results. Acceptance is
  per supported topology and measurement; it is not a count of files that parse.
- **Part-specific model accuracy:** choose one actual op-amp or regulator and a
  lawful independent reference. Specify rails, loading, temperature, startup and
  bandwidth limits before measurement. The 48 nominal analytic cases establish
  agreement with their stated approximations, not vendor or hardware accuracy.
  Repair only a demonstrated cause upstream, then adopt one reviewed pin batch.
- **Physical instrument behavior:** separately scope probe loading, bandwidth,
  anti-alias filtering or ADC behavior with explicit parameters and independent
  time-domain expectations. Preserve the ideal/raw acquisition path and identify
  each modeled effect in CLI receipts and GUI labels. Disclosure alone does not
  implement these effects, and invented noise cannot serve as validation.
- **Aperture/audio acquisition:** respect the existing upstream aperture/audio
  and Lite supplier-adoption claims. Their sampling, filtering and playback work
  is separate from the additive display metadata in this lane.
