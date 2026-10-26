# Reference-qualified teaching-circuit instruments

This document defines the authored teaching-circuit study and its retained-
original readback method. Manifest counts describe candidates; actual outcomes
require an admitted run at its exact source and independent original readback.
This methods page supplies no numerical or physical qualification by itself.

## Frozen candidate scope

The manifest in `scripts/lib/reference-qualified-circuits.mjs` defines 32
independently authored BSD-3-Clause native JSON inputs. Its 31 numerical candidates have
distinct terminal-coloured topology signatures after ignoring component values,
names, positions and passive-lead orientation. Different signatures establish
different graphs, not electrical non-equivalence or physical accuracy.

| Family | Candidate designs | Route and comparison |
| --- | ---: | --- |
| Divider, loaded potentiometer, loaded bridge, summing mixer, R-2R ladder | 5 | Static strict DC transfer versus SPICE |
| Loaded RC/RL, band-pass, pi, twin-T and RLC networks | 8 | Precision scope samples and DMM means versus SPICE transient |
| Half-wave, bridge, clipper, diode OR and biased clamp | 5 | Static explicit-Shockley transfer versus SPICE |
| Common emitter/base, emitter follower, differential pair and Darlington | 5 | Static explicit transistor models versus SPICE |
| LM741 follower, inverting/non-inverting, summer, difference and Sallen-Key | 6 | Explicit nominal linear-pole captures versus a separate SPICE realization |
| Zener shunt and admitted direct-RC ADP7118 startup | 2 | Static breakdown / nominal startup-envelope comparisons |
| LT1763 precision-domain refusal | 1 control | Named refusal before capture; excluded from qualified-design counts |

Thus 16 designs request static analysis and 15 request actual precision
scope/DMM captures. A static transfer test does not establish rectifier waveforms
or instrument capture behavior. The twin-T and RLC cases exercise transient
responses; this cohort does not claim a frequency-response sweep.

All inputs, node/probe locations, source conditions, clocks, observation types,
reference decks, model parameters and tolerances are fixed before execution.
The collector preserves failed, disagreeing, refused and missing cases in the
same denominator. Acquisition completeness and numerical conformance are
separate verdicts. Requested capture-design counts, numerically passing capture
designs and recorded CLI attempts are also separate. A recorded attempt can
refuse before simulation; it does not count as a successful circuit test. A
complete failing report does not qualify its circuits.

## Source and method admission

The consumer source contract is `bw-board`
`836867513c3e7fac420ddaa32c17e1c7b6d3e513` and `bw-circuit-ui`
`1bc233c9297e03abb9b7eb603e045b4e92b0bb40`. No dependency pin changes belong to
this study. Before numerical work, the collector compares both installed npm
payloads to their exact owned Git sources, verifies that the UI resolves the
sibling engine, and checks the independently admitted JS/JSON fingerprints.
The retained UI package manifest is independently byte-bound to its own pinned
source; its declared dependency metadata and observed runtime identity remain
separate.
This is not verification of arbitrary dependencies or a hermetic-execution claim.

Before numerical work, the actual CLI must convert each native input to a
retained `loaded.json`. Its complete parts, model parameters, wires and supply
must equal the frozen authored input. Measurements use that exact retained file.
Capture receipts additionally bind its imported-graph digest. Static DC has no
receipt API: its boundary is the retained input, observed full CLI load and exact
native identity-loader source, not an internal MNA execution transcript. This
cohort establishes no foreign-format importer coverage or imported-corpus total.

The independent reference executable must identify itself as ngspice 42. Its
[version-42 manual](https://ngspice.sourceforge.io/docs/ngspice-42-manual.pdf)
documents the shared-scale, named-vector `wrdata` output used here. Raw reference
rows and uniformly sampled rows are retained separately. Static sweeps use fresh
strict operating points at every source value. Transient references use explicit
zero-state initialization, a finite source edge and a bounded maximum step.
No DC operating-point bias is substituted for the transient initial state.

Native current-source parameters are mapped explicitly to the opposite SPICE
card direction: the differential pair's tail draws current from its emitter net.

DC terminal current is positive **into** the named terminal; instrument current
is positive **out of** the part. Scope values are instantaneous samples. DMM
values are observed means over the whole declared window. The reader compares
those means to quadrature over the retained adaptive SPICE rows, with the
frozen small initial-gap extension stated in each case. That extension is not
presented as an observed time-zero sample or an independent integral certificate.

The LM741 reference includes differential input resistance, finite output
resistance and the nominal dominant-pole equation. It does not represent a
vendor transistor macromodel, input bias or rail quiescent current. The ADP7118
reference separately expresses the admitted startup/current-limit envelope;
the reference includes the model's one-sided current clamp and quiescent-current law.
The direct-RC topology is already supported; this case uses a distinct load and
SPICE/batch observation intent, and makes no new-domain or novel-topology claim.
Neither establishes
physical calibration, noise, thermal behavior or device-wide accuracy.

## Execution and retained-original readback

Printing the candidate manifest runs no simulator:

```sh
node scripts/reference-qualified-instrument-study.mjs --manifest
node --max-old-space-size=384 --test test/reference-qualified-instrument-study.test.mjs
```

Source controls use the installed locked UI manifest. An isolated checkout can
set `REFERENCE_UI_PACKAGE_JSON` to the exact pinned UI source manifest; its bytes
are checked before synthetic controls. No simulator is imported for that check.

The workflow `reference-qualified-instruments.yml` runs source controls for
changes to this harness. Only the separately admitted frozen
`study/reference-qualified-v1` push may select the actual experiment. An exact
head, intent, source/reference/reader review and one-shot event check are required
before that push. The reviewed head is recorded in the separate repository
variable
`REFERENCE_QUALIFIED_STUDY_HEAD`; a mismatched or missing value refuses before setup.
The original admission record is retained and joined by the independent reader.
Ordinary source pushes, unrelated labels and dispatches do not
run the experiment. No study is started just to populate a workflow census.

CLI and reference commands run sequentially with a 90-second CPU/wall limit, 16 MiB file limit,
8 MiB captured-output limit, and a 60-minute monotonic cohort budget checked
between commands and after each case; each subprocess receives at most the
remaining cohort wall allowance. The whole hosted job has a 75-minute
timeout, including package installation and source verification. The collector
also limits total retained bytes. Those are experiment bounds; existing engine
precision limits and refused domains are preserved. The study cannot overwrite
an earlier output directory.

The standalone `scripts/read-reference-qualified-instruments.py` reads retained
files, checks input/source/process/receipt identities, reconstructs comparisons,
and reconciles the complete denominator. It imports no producer module and runs
no engine, CLI, oracle or browser. Its external head/run arguments must come
from independently admitted official metadata, not from a report's self-claim:

```sh
python3 -I -B scripts/read-reference-qualified-instruments.py RETAINED_ORIGINALS \
  --head EXACT_STUDY_COMMIT --run OFFICIAL_RUN_ID
```

Exit 0 means complete originals and conforming comparisons; exit 2 preserves a
complete numerical disagreement or incomplete outcome; exit 3 rejects invalid
or inconsistent originals. Synthetic source controls test these distinctions,
including coherent byte-receipt mutations, wrong current signs, time grids,
DMM units/windows, source identities and changed expectations. They do not count
as simulated circuits or numerical qualification.

Observed counts, official run identity, independent readback and limits belong
to the [instrument campaign status](CIRCUIT-INSTRUMENT-REGRESSION.md). The reader
reports all 32 case verdicts, requested and passing selector locations, and
bounded failed-value examples. These selector locations are named virtual
observations, not claims of physical probe insertion or independent placements. Existing studies retain
their original identities and outcomes; they are not rerun or relabelled here.

Setup failures retain the full not-run denominator and source/event bindings.
Independent readback distinguishes this incomplete outcome from malformed
originals; it does not establish the recorded failure's cause or qualify any
measurements. A claimed setup failure cannot conceal retained case execution.
