# Package migration fork-preservation audit

Scope: read-only classification of copied engine/UI source removed by preserved
migration snapshot `44872243ae64a6bb1a3cad62dd05c54c51b00e69`, relative to Lite
`411828a304dd84759cd4c1fb82444e72944ffbdc`. Engine targets are `d7436dc` and
planned `7fbdfa9`; circuit UI target is `657e021`. This docs-only lane does not
modify the original migration tree or the root coordinator's takeover tree.

Initial finding: both executable divergence ledgers at the Lite base contain
zero `files`, `lineLevelOnly.files`, and `liteAuthored.files` entries. Historical
prose describes resolved work and must not be mistaken for current divergences.
Remaining declarations are two optional absent timing modules, root LICENSE
mappings, and the generated circuit-UI vendor manifest. Full byte audit follows.

## Verdict

**No current declared local behavior is lost by replacing the authoritative
overlay copies with these exact upstream packages.** This is a source-preservation
finding, not a claim that package resolution, assets, the browser build or all
runtime behavior have passed. The copied-source deletion is not evidence of
lost functionality when the identical source is installed as a package.

There are two material handoff cautions:

1. **License metadata conflict:** circuit-UI `package.json` at `657e021` says
   MIT, but its actual `LICENSE` is the complete Mozilla Public License 2.0.
   That LICENSE is byte-identical to the previously shipped overlay copy.
   The migration's statement "Both are MIT" is inaccurate and must not become
   a notice or distribution assumption. This audit records file facts, not a
   resolution of the conflicting license declarations. Engine LICENSE is MIT.
2. **Absence is not exclusion from a bundle:** npm installs the optional timing
   modules that Lite previously omitted. The injected estimator preserves the
   no-default-import behavior, but the production bundle must still demonstrate
   that the ~975 KB table is not eagerly included. Package installation size and
   application startup payload are different measurements.

## Exact inputs and method

| Repository | Exact commit |
| --- | --- |
| Lite source before migration | `411828a304dd84759cd4c1fb82444e72944ffbdc` |
| Preserved migration snapshot | `44872243ae64a6bb1a3cad62dd05c54c51b00e69` |
| Initial engine package | `d7436dc782dd1c499f0fb29ae5cfaa8ab78ec2d6` |
| Planned engine package | `7fbdfa9f575ba6c7da36e253b98c92e9093d8837` |
| Circuit-UI package | `657e0217fa14fe345ad2781ae87d7f1e9b1e42fe` |

Read both complete divergence documents as stored at the Lite source commit,
including their historical sections and executable JSON. Enumerated **all tracked
files** under each overlay and packages root with `git ls-tree -r`, compared Git
blob IDs to upstream `src/<relative-path>`, except LICENSE maps to upstream root.
This includes code, artwork, JSON and attribution files, not just JavaScript or
the paths declared in a ledger. Missing and differing files were inspected
separately. Comparison reads immutable Git objects, not potentially moving
installed worktree contents. No source was edited and no engine/UI tests were
claimed from this read-only audit.

| Base copied root | Compared upstream | Byte-identical | Different | No upstream path |
| --- | --- | ---: | ---: | ---: |
| engine overlay (189 files) | d7436dc | 186 | 3 | 0 |
| engine packages (162 files) | d7436dc | 159 | 3 | 0 |
| engine overlay (189 files) | 7fbdfa9 | 186 | 3 | 0 |
| engine packages (162 files) | 7fbdfa9 | 159 | 3 | 0 |
| circuit UI overlay (679 files) | 657e021 | 677 | 1 | 1 |
| circuit UI packages (609 files) | 657e021 | 597 | 2 | 10 |

The same three engine differences occur in both mirrors and at both target pins.
The authoritative overlay has no missing source: its only upstream-absent item
is the generated vendor manifest. Package-only leftovers are classified below.

## Every remaining executable declaration

| Declaration at411828a | Classification | Evidence / consequence |
| --- | --- | --- |
| engine `files: {}` | Already upstream | No active per-file behavior entries remain; whole-tree comparison independently checks this. |
| engine `lineLevelOnly.files: []` | Already upstream | debug-target-factory, emu8051-debug, i8086-adapter/debug, m6502-adapter and z80-adapter are exact upstream blobs. |
| engine `liteAuthored.files: {}` | Upstream or relocated | Former helper modules are present upstream or outside the deleted root; details below. |
| engine absent `i8088-cycles.js` | Equivalent default behavior; payload gate required | Generated table remains optional; no machine-module import reintroduced. It now exists in installed package storage. |
| engine absent `i8088-timing.js` | Equivalent default behavior; explicit injection retained | `enableI8088CycleTiming(on,{CycleEstimator})` is byte-identical in the existing machine and both package targets; missing estimator still refuses by name. No automatic enablement. |
| engine root-sourced LICENSE | Preserved upstream | Exact blob identity including copyright notice; not a locally authored program. |
| circuit UI `files: {}` | Already upstream | No active per-file behavior entries; exact comparisons cover all component/model files. |
| circuit UI `lineLevelOnly.files: []` | Already upstream | All historically discussed components are byte-identical; engine.js difference is documentation only. |
| circuit UI `liteAuthored.files: {}` | Already upstream | No authored code remains unique to authoritative overlay. |
| circuit UI root-sourced LICENSE | Preserved; metadata conflict remains | Full MPL-2.0 text exactly preserved in package; package manifest's MIT label disagrees. |
| circuit UI generated `.vendor-manifest.json` | Mechanism retired, not runtime regression | Per-file SHA1 baseline for the old copy sync. No runtime code depends on it; npm pin/lock/install verification must replace its operational protection. |

The separate prose-only exclusion `pin-functions.js` is also retained in intent:
it is Node-only and remains outside the browser barrel. npm may contain it as an
explicit Node subpath without selecting it for a browser. Its filesystem/sibling
requirements must not leak into the browser dependency graph.

## Historical behaviors named by the documents

These are not unresolved fork claims at the chosen base. Listing them explicitly
prevents the old incident prose being treated as a current TODO again.

| Former local feature | Current classification |
| --- | --- |
| i8086 displayRevision / lazy frame rendering, NE2000 integration and port-conflict checks | Already upstream: whole i8086-machine.js blob is identical to both package targets. |
| checkpoint envelope/topology validation and debug event structures | Already upstream: machine-checkpoint.js, instruction-debug-events.js and target-kinds.js exact blobs. The old section saying no comparison was possible is obsolete at411828a. |
| i8086 debugger checkpoint/input/video/disassembly integration | Already upstream: i8086-debug.js exact blob; no graft required. |
| Z80 cycle provider/debug/factory | Already upstream: floooh-z80-cycle-provider.js, z80-cycle-debug.js, z80-target-factory.js exact blobs. |
| W65C02 candidate provider and netlist resolver | Relocated earlier, not deleted by migration: bw-debug/w65c02-cycle-provider.js and bw-debug/resolve-netlist.js have no diff between411828a and44872243. |
| VdpScreen browser keys → IBM PC set-1 scancodes | Already upstream: VdpScreen.jsx byte-identical to657e021. |
| BoardCanvas seated potentiometer sizing/position/leg layer | Already upstream: BoardCanvas.jsx byte-identical. |
| CircuitDesigner media test hooks, demo pin animation yielding to program pins | Already upstream: CircuitDesigner.jsx byte-identical. |
| ExamplesBrowser confirm-dialog/device selection and shared intro-document extraction | Already upstream: ExamplesBrowser.jsx and intro-doc.jsx byte-identical. |
| useBoard and interaction/transform previously listed as sync conflicts | Already upstream: identical blobs; their historic refusal was against an old sync baseline. |
| board.js buzzer-edge recorder, extracted _buzzerOnPin and setTone | Already upstream: board.js is an identical blob, not a lost older implementation. |
| CortexM0Core deep dependency path rewrite | Equivalent API access through public rp2040js root; changed implementation discussed below. |

## Actual differing source

- **engine `cortex-m0-machine.js`:** the only old sync-derived rewrite changes
  the relative depth to rp2040js. The package removes the deep path entirely,
  deriving the same core class once from `Object.getPrototypeOf(new RP2040().core)`.
  This preserves the class dependency without a copied-tree location assumption.
  It adds a one-time temporary RP2040 allocation (documented 16 MiB flash buffer);
  that cost is not byte-equivalence and should remain visible in memory/perf review.
- **engine `devices/bus-memory.js`:** adds optional fifth-argument deferred writes,
  event-driven identity and transactional preview hooks for the wired adapters.
  Ordinary calls use `deferWrite = null` and retain immediate trailing-edge writes.
  No previously local behavior is removed; compatibility is covered by the
  engine's separate memory tests, not proved by this text classification alone.
- **engine `index.js`:** runtime-dependency documentation changed; exports and
  browser exclusion of Node-only pin-functions are preserved.
- **UI `engine.js`:** documentation examples use package specifiers instead of
  copied/sibling paths; no executed behavior changed.
- **UI package-only `main.jsx`:** a stale tracked standalone dev harness, absent
  from authoritative overlay. The current upstream harness has later registry,
  sweep and example setup plus npm import paths. It is not Lite's runtime entry
  and is not a local feature that must be transplanted into the package.

Between d7436dc and7fbdfa9, the additional changes are new policy/measurement
modules and experimental wired scheduling/kernel work, not modifications of the
189 existing authoritative engine-copy files beyond the three already listed.

## Package-only leftovers removed

The older `packages/` tree contains nine source/assets absent from both current
overlay and upstream, in addition to `.vendor-manifest.json`:

- `components/ExportNetlistMenu.jsx`, `components/ImportCircuitMenu.jsx`,
  `components/SnapshotPanel.jsx`.
- `parts-data/lcd_i2c.{json,svg}`, `parts-data/motor_driver_l293d.{json,svg}`,
  `parts-data/seven_segment_clock.{json,svg}`.

Fixed-string searches of both app source trees found component names only in
their own declarations and the exporter-registry's historical comments, not
live imports. The six assets are absent from the static parts-data index;
their exact obsolete kind names occur only in the orphan JSON definitions.
The current index itself is an exact upstream blob. These are stale generated
mirror remnants, not active declared local behavior. In particular, the current
export/import registry already replaced the old unrendered menu components.

## Required integration checks outside this audit

Preserve notices using real LICENSE contents; reconcile contradictory metadata.
Verify package source identity and exact pins (existence plus a lockfile URL is
not proof installed bytes are current). Re-run package/module resolution and
asset-path checks, rendering/keyboard/export/checkpoint tests, BIOS provenance,
census/matrix checks, and production-bundle payload accounting. Keep the known
circuit UI sweep interaction failure separate from source-preservation claims.
The migration can preserve every source feature while still failing a build,
runtime import or browser gate; this audit does not certify those outcomes.
