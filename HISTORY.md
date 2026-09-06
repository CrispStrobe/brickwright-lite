# Brickwright Lite history

Completed and rejected work moves here when it no longer belongs in the active
plan or roadmap. Detailed commit, CI and ownership evidence remains in Git and
`LANES.md`.

## 2026-09-06

- **Source-test boundary completed** (`f17a8f4e8`, `fbfa7936f`). The bounded
  17-file suite runs against owned overlay sources before vendor/integration
  work, with explicit Node and dependency setup. It reports 133 passing tests
  on Node 22.23.2. Integrated-runtime tests retain an explicit prepared-GUI
  boundary.
- **Virtual SPIKE integration completed** (`d697a9093` through `c5e12d2da`).
  The simulator gained the Prime device protocol and GATT adapter, Classic
  Scratch Link, shared hub state, dashboard controls, firmware-target
  distinctions and end-to-end bundled-extension coverage. Follow-up commits
  hardened transport boundaries and isolated Classic browser globals.
- **P15a tutorial-runtime deferral rejected** (baseline `34046270772`, candidate
  `34047017108`, reverted at `3d4bce5d5`). It isolated 145,612 source and
  103,513 emitted bytes, reducing initial JavaScript by 96,052 bytes. Median
  first activation rose from 151.3 ms to 190.2 ms, exceeding the declared
  173.995 ms ceiling, so the thresholds were preserved and the change reverted.
- **P15b asset-library UI split not activated** (`9f234e755`). Exact ownership
  review reduced the movable five-route closure to about 31,131 source bytes;
  eager Tips pins the roughly 46 KiB shared library chain, and connection UI
  pins its metadata. Even adding Tips raised the source ceiling only to roughly
  79 KiB and repeated P15a's latency-sensitive path, so the candidate could not
  plausibly clear the 76,800-byte emitted floor. No runtime experiment was
  started. Reconsider only if the eager dependency disappears or ownership
  grows materially.
- **Dated worktree reconciliation closed** (`217407b1d`). Recovery refs and
  cleanup evidence were completed; its temporary hold instructions are no
  longer active.

## 2026-09-05

- **Browser acceptance split completed** (`e7410d1c6`, `c6bf1feb3`, later
  sharded). Browser gates run in a separate required heavy/light matrix job;
  deployment requires `build`, `corpus` and `browser`. The remaining exact-
  artifact work is a cost and identity improvement, not unfinished splitting.
- **Pico MicroPython simulator execution completed** (N3c series ending at
  `8661e4eab`; hosted evidence `34022076259`). The UI enters raw REPL through
  simulated USB CDC, executes the current program and observes GP25. The
  remaining N3c-1 defect is `machine.reset()` freezing rp2040js.
- **Device picker generation completed** (`eae510a33`). The Code-tab picker is
  derived from `DEVICES` plus `DEVICE_GROUP_CORE`; its equivalence proof
  preserved nine groups, 25 devices, ordering and fields while independent
  route and transport checks remained in place.
