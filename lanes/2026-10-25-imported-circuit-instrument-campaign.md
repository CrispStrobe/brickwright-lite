# Current-consumer and imported-circuit measurement campaign

CLAIMED — Codex circuit/instrument owner. Initial Lite base
`23ec908232f6d4c4604ed6f7dcb23b75af19053d`; isolated branch
`lane/circuit-measurement-next-claim-20261025`. Merge this claim before
implementation or the new operational campaign. The previous five-item
sequence is closed; its results retain their original source identities.

## Repository authority and boundaries

Work only in the operator-owned CrispStrobe repositories. Here a shared source
authority means `CrispStrobe/bw-board` for electrical models/integration and
`CrispStrobe/bw-circuit-ui` for import/export and instruments. It never means
patching or contacting a third-party original. Lite consumes exact qualified
packages; do not create a local model/importer fork or silently change pins.

This claim owns the ordered campaign, its operational readback, this file and
the campaign sections of `PLAN.md`, `ROADMAP.md` and
`docs/CIRCUIT-INSTRUMENT-REGRESSION.md`. Phase 1 uses the existing manual fixed
CLI workflow, runner and independent oracle with no source or workflow edit.
Any needed harness extension, imported-case harness, model patch or instrument
implementation requires a measured exact-path envelope and the appropriate
repository's separately merged claim before those implementation edits.
Do not reserve whole repositories or take unrelated owners' paths.

Preserve release/TestFlight, model delivery, Robot Lab, x86, SPIKE and Arcade
ownership. Aperture/audio is already adopted through Lite PR1338 and CUI PR118;
retain its actual capture, browser, WAV and lifecycle proofs rather than
reimplementing it. The release owner retains v0.1.27 distribution/readback;
this campaign performs no release upload, signing, deployment or hardware flash.

## Five ordered acceptance steps

1. **Current-consumer baseline.** Freeze the exact consumer, Board
   `761153ff92d521c01107ee7b32922ba7adc10ee2` and CUI
   `91d8434a79d373cef2837c137ab356356f1a3b44`, case inputs, oracle equations,
   tolerances, reader code and expected runtime joins before measurement.
   Dispatch the existing 312-case campaign once after source admission; no
   duplicate run or old-source result relabelling. Acquire original outputs
   once after metadata admission and independently audit the 264 ngspice and
   48 explicitly nominal cases, topology/input hashes, complete traces, signed
   currents, meter windows, missing/refused cases and retained negatives.
   Preserve every original failure and correct its actual cause before moving on.
2. **Imported-circuit campaign.** Reconcile a frozen licensed inventory and
   classify the historical failure/partial groups against their exact old
   receipts before selecting about 300 distinct supported or explicit-refusal
   schematic inputs. Stratify useful resistor/filter/diode/transistor/op-amp/
   regulator circuits; distinguish unique records, topology families and
   parameter variants. Use meaningful differential-voltage and signed-current
   probes, time traces and multimeter windows with independent SPICE or
   explicitly stated analytical expectations. Freeze selection and bounds
   before execution. Publish requested, attempted, comparable, passed, failed,
   partial, refused and not-run counts without dropping inconvenient rows.
   Private originals remain private; only reviewed redistributable inputs or
   independently authored minimal reproducers may enter public repositories,
   workflows, logs or artifacts. Heavy work runs in owned hosted CI.
3. **Repair demonstrated recurring causes.** Isolate minimal reproducers and
   assign each failure to import loss, dependencies, unsupported physics,
   solver/integration, acquisition or the oracle/harness. Fix high-value shared
   causes in the appropriate owned repository, with load-bearing negative or
   mutation proof and unchanged original acceptance bounds. Recheck the affected
   strata and adopt one purposeful qualified package batch. Unsupported physics
   must refuse honestly; do not fake convergence or substitute a convenient model.
4. **One existing part's accuracy.** Start with the implemented LM741 unless
   current ownership or evidence establishes a better bounded existing part.
   Admit a lawful independent reference and specify rails, load, saturation,
   frequency response and slew limits before testing. Distinguish nominal-model
   agreement from part-specific accuracy. Correct only demonstrated deviations
   within a stated model domain, then qualify actual packaged CLI/GUI behavior.
5. **One demonstrated instrument-physics gap.** Audit existing probe loading,
   coupling, capture, bandwidth and range behavior first. Implement one missing
   deterministic measurement-chain effect justified by that audit, preserving
   ideal/raw acquisition and identifying the actual modeled effect in CLI
   receipts and GUI labels. Require analytical/SPICE time-domain controls,
   actual CLI/multimeter/scope evidence, real built-GUI lifecycle controls and
   a load-bearing negative. Do not add decorative noise or infer physical ADC
   accuracy, hardware calibration or acoustics from a display or audio filter.

## Qualification and endpoint

Maintain shared-package source identity only within these owned repositories. Require
all enabled exact-head checks, affected clean application/guest qualification
and independently admitted originals before normal matched-head merges.
Keep every original failed receipt. No threshold, deadline, row census, refusal
or required observation may be weakened merely to get green. No automatic
rerun of a completed experiment, force push, foreign-repository patch or
unsupported physical/full-corpus claim. Poll hosted status at most once per
minute, in batches, and do not run heavy builds or simulations on the workspace
host. Stop after the fifth accepted step and reconcile results, remaining
limits and narrowly scoped future work in the public handoff.

## Step 1 result / remaining ownership

ClaimPR1370 landed as `4c416bcfe1a219faaec371ac638f607628f347a7` after all
four enabled source-policy checks succeeded; only the new lane file changed.
The frozen operational branch has that exact commit. The single
[baseline40172711900](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40172711900)
passes independent original-only admission: 312/312 cases, 87,488 numerical
checks, 4,448 retained files and matching installed source/runtime identities.
All 240 waveform CSVs equal the preceding retained baseline; no original was
replayed. Full hashes and limits are in the
[result handoff](../docs/CIRCUIT-INSTRUMENT-REGRESSION.md).

Overall ownership remains CLAIMED for steps 2–5. Source/eligibility inspection
does not yet establish 300 distinct cleared analogue schematics; admit the
cohort and exact implementation paths before the next experiment. No format
twin, retargeted device bench or unsupported row is silently counted as a new
comparable design. The previous whole five-item sequence is not being reopened.
