# Robot Lab measurement continuation — done and pending

Snapshot: 2026-10-27, after PR1437 was merged. Refresh GitHub before acting.
Implementation is on main; **combined-main qualification remains pending**.
The earlier pre-merge instructions below are superseded by this checkpoint.

## Read this distinction first

The existing live measurements, saved-definition editor and prior integration
are already on main; see [the measurement guide](ROBOT-LAB-MEASUREMENTS.md).
The floor/contact core and its associated API work landed in
[PR1445](https://github.com/CrispStrobe/brickwright-lite/pull/1445), merge
`7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`.

The four measurement capabilities landed through
[PR1437](https://github.com/CrispStrobe/brickwright-lite/pull/1437) at
`cd0f7a9ae5b72e4918468e87eea487c56f9374af` on 2026-10-27. Another actor merged
the unchanged candidate after the handoff, before the required fresh combined
qualification. This records the observed landing; it does not retroactively
qualify that combination. Keep the acceptance loop open until the actual
combined-main evidence is admitted and independently audited.

| Item | Implemented in PR1437 | Acceptance needed on the new main combination |
| --- | --- | --- |
| Existing forces and dynamics | Slider motor/limit force and power, passive hinge friction, screw slip/supporting-load diagnostics, contact presence; units, unavailable states and provenance retained | New-head combined native getter/scalar joins and browser acceptance |
| Accepted-step analysis and recording windows | Opt-in fixed-step period, phase and signed discrete motor work; bounded absolute simulated-time recording windows; existing caps and gap/overflow refusal retained | New-head completed-step arithmetic, lifecycle and saved-project audits |
| Structural role packs and persistence | Typed role packs; pinned PR1336 source coverage; two actual save/reopen pilots | New-head pinned-source report and both pilot source/placement/metadata joins |
| Explicit control pairs | Opt-in two-model comparison with distinct authored identities, typed mappings, units, origins and bounded persistence; ordinary comparison remains strict same-model | New-head paired project before/save/reopen joins and independent original-byte audit |

No solver or dependency pin change is introduced by these measurement features.
The candidate incorporates the separately qualified floor core from main.
Contact presence is a scalar presence observation, not a contact-force vector.
Filtered screw supporting load is not signed instantaneous force. Discrete
motor work is not electrical energy or physical calibration.

## Actual landing and remaining combined-main qualification

The actual merge has ordered parents
`9cdbe24286b02dc7cf7cdb3d722b0eeb00c7e859` (then-main) and
`8a8421706541f706628d9872ca86e8b7b1fe34fd` (unchanged candidate), and tree
`3ebcfc034d645406dea23a571298af2566362c49`. An independent Git-object audit
confirmed the clean merge-tree result. Of the 41 changed paths against its
first parent, 39 equal the candidate; `.github/workflows/build.yml` and
`docs/ROBOT-LAB-MEASUREMENTS.md` contain the automatic combination.

Then-main included newer compiler, parts-metadata, model, registry and workflow
changes. Old candidate qualification does not establish their combined behavior.
The already-created main-push [Build run40468979773](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40468979773)
is the first evidence source for the actual merge; it was queued at this
checkpoint. Its [vendor workflow40468979711](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40468979711)
passed. Do not dispatch a duplicate run, merge PR1437 again, revert the landing
without operator authorization, or re-download old candidate originals.

Main subsequently advanced; refresh it and review any executable impact before
claiming acceptance of a later tree. Audit the actual CI checkout and exact
head. If the combined run fails, preserve its first original once and address
the demonstrated failure in an isolated, normally pushed successor within the
existing claim; coordinate any repair outside measurement scope with its owner.

## Old candidate identity and sealed qualification

- Branch: `lane/robot-force-precision-pairs-20261026`.
- Published candidate: `8a8421706541f706628d9872ca86e8b7b1fe34fd`.
- Candidate tree: `29193f6c71bb0cd40895ac7178135222c92f06ef`.
- Incorporated core main: `7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`.
- Old candidate [Build run](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40446909033): all six unit shards, editor build, FPGA surface and full-CI guard passed. The full old-candidate set completed: 42 checks, 36 SUCCESS and 6 declared skips, legacy statuses zero. These are not combined-main results.
- Current vendor and auxiliary source-controls workflows passed; their conditional skips remain declared skips.
- Seven actual Arcade lifecycle cases executed without target skips or TODOs; their standalone TAP and checkout audit passed on the complete candidate tree.
- Forty focused source controls passed without skips. These are source controls, not substitutes for actual browser/Jolt acceptance.
- Both current critical jobs passed: `browser (light)` job `122009150417` and `browser (robotlab)` job `122009150437`. Their original logs/archive were acquired once and independently audited. The light audit accepted the native-keyboard user path and all 81 assigned gates. Both Robot Lab readers accepted the native scalar, completed-step, role/pilot and paired-project joins. These passes qualify this candidate, not the newer-main combination above.

The current unit producer used synthetic checkout
`df96fd0ed0a6054dbe6a8a551eb7d150b11cc8eb`, with ordered parents core-main and
candidate above, and the same full 15,928-entry tree. Never rename an actual CI
checkout to the branch head. Read the original log and bind each current
producer honestly; later metadata can change.

## Circuit prerequisite: known failure and changed diagnostic path

An earlier candidate's actual light browser failed: the same scope selector
showed sample at input capture, envelope at change capture, and never published
sample/ADC state. The strict predicate correctly rejected it. That original is
retained. The precise restoration trigger, historical cause and a persistent
product fault remain unproved.

The Circuit owner released commit
`4ea3c00858d5e56a45e0abdbc6baecf809f95567`, now included in PR1437. Its three
paths are `scripts/verify-circuit-ux.mjs`,
`test/scope-rearm-publication.test.mjs`, and
`lanes/2026-10-26-scope-rearm-publication-proof.md`.

The forward diagnostic uses one real focus and one page-level native ArrowDown
from envelope to sample. It has no synthetic selection, retry, fallback, value
patch or timeout increase. The report now contains `action` and actual observed
before/after modes, plus passive focus/input/change provenance. The old
`selectedModeValues` parser does not describe this new report.

Require the retained focused selector, same Board and owner, unique connected
controls, zero channels, an actual precommit-negative input observation, then
committed sample mode with unchecked/enabled ADC. The original sole add,
handle/capture/count/time assertions remain unchanged. The current actual browser and independent trace audit accepted
this finite user path. That acceptance does not establish the old failure's
cause or a general product repair. Coordinate any further edit with that owner;
do not patch the component, its dependency pin or thresholds to get green.

## Resume in this order

1. Read this file, the operator's ignored local handoff and the lane protocol.
   Use an isolated worktree and existing merged measurement claim
   `lanes/2026-10-26-robot-force-precision-pairs.md`. Preserve other scopes and
   record one qualification controller; never reset or rewrite a shared tree.
2. Refresh PR1437 (already merged), actual main, the existing merge-head Build
   and vendor workflows, all paginated check-runs and legacy statuses. Preserve
   the actual landing proof above. Poll metadata no more than once per minute;
   do not start duplicate hosted runs or repeat the completed source merge.
3. Preserve successful intake already performed: the current scope and
   seven-case unit logs, light log, Robot Lab archive and producer log have all
   been acquired once and audited. Prior candidates'
   successful measurement archives and failed logs are also retained. Consult
   the private receipt inventory before any acquisition; if it is unavailable,
   obtain the handoff rather than redownloading or replaying an original.
4. For the **new combined head**, finish **light** qualification. The old
   current-head intake above is already complete; do not repeat it. Admit terminal SUCCESS and the
   `Browser gate — circuit UX` step, acquire its original log once, bind its
   actual checkout and source, and independently audit the native-keyboard
   action/focus/input/change trace and strict final publication. Confirm all
   assigned browser gates and the unchanged native ADC summary passed.
5. For the **new combined head**, finish **Robot Lab** qualification. The old
   current-head intake above is already complete; do not repeat it. Admit terminal producer SUCCESS,
   its own editor build, measurement journey and successful upload, and the
   unique `sim-lab-measurement-success` artifact metadata. Acquire that archive
   and the producer log once. Verify digest/size, CRC, safe flat file types,
   exact nine members, actual checkout/tree and source preservation. The files
   are the measurement edit SB3/JSON, runs CSV, experiments JSON, experiment
   history SB3/JSON, role-persistence JSON, dynamics JSON and paired SB3.
6. Audit saved bytes with the standalone readers below. They must not import
   producer helpers or replay a guest. Preserve every refusal and original
   failure. The model source pin for this campaign is
   `8ecbb4c116e4123fb9de18cdb71570c0dad2ceb9`; 60-source metadata/persistence
   coverage and two real pilots do not establish all-model mechanical or
   program replay.

   ```sh
   python3 scripts/read-sim-lab-measurement-artifact.py ORIGINALS --checkout ACTUAL_CHECKOUT --tree ACTUAL_TREE --require-history
   python3 scripts/read-sim-lab-dynamics-artifact.py ORIGINALS --checkout ACTUAL_CHECKOUT --tree ACTUAL_TREE
   ```

7. Require SUCCESS for **every enabled current-head check**, with only declared
   skips. A cancellation or timeout is not success. On failure, retain the
   original once, classify it and coordinate a demonstrated correction; do not
   rerun an unchanged failure, mute assertions or weaken baselines.
8. Bind the actual merge-head results and any subsequent executable changes
   honestly. Review the full combined workflow/compiler/catalog/model impact.
   If a demonstrated repair is necessary, retain failures and normally push a
   substantive successor; qualify that exact successor before a guarded normal
   PR merge, verifying predicted and landed parents/tree. No force push, admin
   override, auto-merge, silent dependency-pin change or weakened assertion.
9. Once combined acceptance and independent original-byte audits pass, reconcile
   this document, the claim status and ignored local handoff. Only then close
   the four-item acceptance loop. Source is already landed; acceptance remains
   pending until the evidence supports it.

PR1437 was opened Ready and received `ci:full` once after actual opened-scope
admission. It is now merged. Do not repeat its label, dispatch or Ready cycle.
The existing main-push run executes its own qualification under the merged
workflow; future substantive repair PRs follow the normal lane protocol.

## Boundaries and other owners

This handoff adds no physical-accuracy, hardware, native OS, deployment, release,
performance or blanket licence-clearance claim. The previously sealed native
qualification stays sealed; do not replay it for this documentation task.
Resting-frame creep issue1435 and its diagnostic claim belong to the core owner;
that is separate from these four measurement items. Model changes such as
PR1455 remain with their model owner. Preserve their claims, source and original
failures; this continuation does not authorize taking their implementation.

Raw logs, archives, private paths, machine/session identifiers and acquisition
receipts stay in ignored local notes. Public Markdown contains only public
repository paths and public GitHub identities. A documentation-only handoff
publication is not source acceptance or a release.
