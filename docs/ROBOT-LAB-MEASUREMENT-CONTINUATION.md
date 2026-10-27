# Robot Lab measurement continuation — done and pending

Snapshot: 2026-10-27. This is the restart contract for the four-item measurement
continuation. Refresh GitHub before acting: this document records a checkpoint,
not a claim that an open pull request has landed.

## Read this distinction first

The existing live measurements, saved-definition editor and prior integration
are already on main; see [the measurement guide](ROBOT-LAB-MEASUREMENTS.md).
The floor/contact core and its associated API work landed in
[PR1445](https://github.com/CrispStrobe/brickwright-lite/pull/1445), merge
`7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`.

The next four measurement capabilities are implemented in
[PR1437](https://github.com/CrispStrobe/brickwright-lite/pull/1437) but are **not
landed at this snapshot**. Publishing this handoff does not qualify or merge
that source. Keep the four-item implementation loop open until its final
qualified normal merge.

| Item | Implemented in PR1437 | Acceptance still needed before landing |
| --- | --- | --- |
| Existing forces and dynamics | Slider motor/limit force and power, passive hinge friction, screw slip/supporting-load diagnostics, contact presence; units, unavailable states and provenance retained | Current combined-core native getter/scalar joins and browser acceptance |
| Accepted-step analysis and recording windows | Opt-in fixed-step period, phase and signed discrete motor work; bounded absolute simulated-time recording windows; existing caps and gap/overflow refusal retained | Current completed-step arithmetic, lifecycle and saved-project audits |
| Structural role packs and persistence | Typed role packs; pinned PR1336 source coverage; two actual save/reopen pilots | Current 60-source/493-pack report and both pilot source/placement/metadata joins |
| Explicit control pairs | Opt-in two-model comparison with distinct authored identities, typed mappings, units, origins and bounded persistence; ordinary comparison remains strict same-model | Current paired project before/save/reopen joins and independent original-byte audit |

No solver or dependency pin change is introduced by these measurement features.
The candidate incorporates the separately qualified floor core from main.
Contact presence is a scalar presence observation, not a contact-force vector.
Filtered screw supporting load is not signed instantaneous force. Discrete
motor work is not electrical energy or physical calibration.

## Exact source and current qualification

- Branch: `lane/robot-force-precision-pairs-20261026`.
- Published candidate: `8a8421706541f706628d9872ca86e8b7b1fe34fd`.
- Candidate tree: `29193f6c71bb0cd40895ac7178135222c92f06ef`.
- Incorporated core main: `7b4f2f84ac55e238bbb75663acbdc1e26f3d0358`.
- Current [Build run](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40446909033): all six unit shards, editor build, FPGA surface and full-CI guard passed. Remaining enabled jobs are pending or running at this snapshot.
- Current vendor and auxiliary source-controls workflows passed; their conditional skips remain declared skips.
- Seven actual Arcade lifecycle cases executed without target skips or TODOs; their standalone TAP and checkout audit passed on the complete candidate tree.
- Forty focused source controls passed without skips. These are source controls, not substitutes for actual browser/Jolt acceptance.
- Current critical jobs: `browser (light)` job `122009150417` and `browser (robotlab)` job `122009150437`. Both were running at the checkpoint; their successful original intake and audits were still pending.

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
handle/capture/count/time assertions remain unchanged. Actual acceptance of
this new user path is pending; even a pass would not establish the old failure's
cause or a general product repair. Coordinate any further edit with that owner;
do not patch the component, its dependency pin or thresholds to get green.

## Resume in this order

1. Read this file and the operator's ignored local handoff. Use an isolated
   worktree and the already merged measurement claim
   `lanes/2026-10-26-robot-force-precision-pairs.md`; read the repository lane
   protocol. Preserve all other workers' scopes. Do not reset or rewrite a
   shared tree.
2. Refresh PR1437's state, exact head, current main, all workflows, check-runs
   and legacy statuses. If it already merged, verify its actual parents/tree
   and update the handoff rather than implementing it again. If the head
   differs, audit the successor instead of borrowing this checkpoint's passes.
   Poll metadata no more than once per minute and coordinate one controller.
3. Preserve successful intake already performed: the current scope log and
   seven-case unit log have been acquired once and audited. Prior candidates'
   successful measurement archives and failed logs are also retained. Consult
   the private receipt inventory before any acquisition; if it is unavailable,
   obtain the handoff rather than redownloading or replaying an original.
4. Finish current **light** qualification. Admit terminal SUCCESS and the
   `Browser gate — circuit UX` step, acquire its original log once, bind its
   actual checkout and source, and independently audit the native-keyboard
   action/focus/input/change trace and strict final publication. Confirm all
   assigned browser gates and the unchanged native ADC summary passed.
5. Finish current **Robot Lab** qualification. Admit terminal producer SUCCESS,
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
8. Refresh main and ownership holds before landing. Prove full-tree
   preservation, exact pins/core/source inventory and the prospective ordered
   parents `[actual main, candidate]` and merge tree. Any affected executable
   combination needs fresh qualification; a proven disjoint Markdown move can
   commute under the lane protocol. Do not import an unqualified sibling lane.
9. Only then normally merge PR1437 with `--merge --match-head-commit` using its
   exact admitted head. No force push, admin override, auto-merge or branch
   deletion. Verify the actual landed parents/tree and PR state. Update public
   done/pending status and the ignored local handoff last; only then close the
   four-item loop.

The PR was opened Ready without `ci:full`; actual opened-event scope was
admitted before adding that label **once**. It remains on the PR. Do not repeat
the label, dispatch another run, or cycle Ready. Ordinary substantive source
successors trigger their own synchronize qualification.

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
