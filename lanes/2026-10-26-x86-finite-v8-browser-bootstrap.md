# X86 finite V8 inventory and browser mirror bootstrap — 2026-10-26

Status: CLAIMED; merge this documentation scope before implementation.
Owner: existing x86 GUI source owner, coordinated with the historical-role gate owner.
Base: main `2318dd8e26ae7c41b928b4d8a537d42f929f1412`.

## Preserved failure and bounded repair

The once-selected [finite V7 run](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40352829291)
failed in trusted package/Chromium setup. Source admission and setup-node passed;
npm reported successful installation, but the Chromium dependency setup reached
its existing timeout while Ubuntu mirror downloads stalled. The inventory
observation did not run. Conditional failure-artifact upload succeeded. This
is a spent failure, not a current runtime, native-font or GUI qualification;
never retry or reinterpret that selected event.

Build already calls `scripts/prepare-playwright-apt.mjs` before browser setup.
The x86 workflow does not. Reuse that helper unchanged before trusted browser
setup in the new finite V8 route and the existing actual V8 route. It rewrites
only the known Azure Ubuntu archive URI to the official Ubuntu archive,
including the supported mirror-list indirection. Preserve suites, components,
keys, package lists, dependency identities and the existing setup deadlines.
This closes a source-policy difference; it does not prove every download or
future runner failure has the same cause.

## Owned implementation envelope

- `scripts/run-i80386-hdd-gui-actual.py` and
  `scripts/read-i80386-hdd-gui-originals.py`: distinct finite V8 template,
  event/source admission, inventory, independent positive/failure readers and
  an explicit current actual-V8 inventory-reference adapter. Retire finite V7
  live execution; retain its reader, historical functions and original meaning.
- `.github/workflows/i80386-hdd-gui-actual.yml`: new finite-inventory-eight job
  and the unchanged helper invocation before new finite V8 and actual V8 setup;
  retire the finite V7 job. Preserve all unrelated job bodies and guard values.
- `test/i80386-hdd-gui-actual.test.mjs` and new
  `test/i80386-hdd-gui-browser-setup.test.mjs`: connected inventory/reader and
  x86-only bootstrap ordering, source-binding and failure controls.
- `test/pin-move-chain.test.mjs` and
  `lanes/2026-10-25-x86-historical-cui-role-gate.md`: only separately reviewed
  fixed whole-body profiles and truthful status for the coordinated source
  changes. No caller-supplied profile, automatic refresh or broad exemption.
- `CI-POINTERS.md`, `docs/generated/ci-step-census.json`, this claim,
  `lanes/2026-10-25-x86-gui-finite-v7-cui408-inventory.md`,
  `docs/I80386-GUI.md`, `docs/X86-USER-PATHS.md` and
  `docs/X86-NEXT-LANES.md`: exact new route/step attribution and scoped status.

Bind the unchanged helper through a finite-V8-specific typed Git and workspace
`bootstrapSource` sidecar, carried by the new template, guard, result, metadata
admission and versioned inventory reference. The fresh, unselected actual-V8
guard must admit that reference and helper identity before trusted setup.
Preserve the historical global SOURCE21 declaration, packets and proofs; do not
widen them or accept an unattested helper. No new actual-V9 route is proposed.
This lane imports no package, pin, lockfile, generator, CPU, model, media or GUI
behavior change. The Arcade-owned helper and `test/ci-playwright-setup.test.mjs`, Build
and Tauri workflows remain outside this envelope. Coordinate one writer per
shared x86 source/profile path. Existing [finite V7 ownership](2026-10-25-x86-gui-finite-v7-cui408-inventory.md)
and [historical-role scope](2026-10-25-x86-historical-cui-role-gate.md) remain intact.

## New wire and acceptance

Use distinct finite-V8 schemas, CLI routes, canonical template, two repository
variables, SHA-only body marker, label, job and artifact namespace. Preserve
every consumed earlier value, label, marker, artifact, failure and reader.
New finite V8 guards start false; any arming needs its own reviewed source
commit. Finite V7 execution becomes false while its independent reader remains
enabled. Preserve the current actual-V8 guards without treating them as event
approval. Current supplier identities, eighteen Git-derived witnesses, four
package roots, six critical roles, row/byte/archive/transport/time/resource
caps, zero-byte/alias rules and raw first/secondary failures stay held. Keep the
existing 15-minute job, 10-minute setup and 4-minute collector bounds and every
pinned Action unchanged.

Require meaningful controls for unchanged-helper ordering before dependency
installation, omitted/wrong helper or source, current versus historical
inventory and coherent cross-version substitutions, malformed body/variables,
partial setup and first-error preservation. Removing the source or bootstrap
guard must fail. Keep all existing GUI, debugger, historical and disabled-route
controls, then independently review final source bodies before profile updates.

Qualify the final owned open ready PR head with every actually enabled
exact-head check, only source-declared skips, and its separately admitted Build
checkout/source. A fresh finite V8 event requires independent request/body/
variables/namespace and source review before one selection. Admit official
run/job/full numbered steps/artifact metadata before acquiring each original
once; grade retained bytes with the independent reader. No failed or partial
inventory authorizes actual V8. Only a separately admitted complete current
inventory and native/runtime joins can precede the distinct actual-V8 GUI
export/reload and forward-debug acceptance. Preserve the consumed V7 event.
No physical accuracy, whole OS, performance, release or broad licence claim.
