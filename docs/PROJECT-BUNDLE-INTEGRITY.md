# Project bundle integrity and recovery progression

Claimed 2026-09-01. This is a six-checkpoint, greater-than-two-hour progression for the
`brickwright/state.json` sidecar carried inside `.sb3` files.

## Starting defect

The current v1 reader writes allowlisted keys one at a time and never removes content keys absent
from the incoming project. A vanilla project does nothing. Opening project B after project A can
therefore merge A's Code, Circuit, or Widgets into B and later save that inherited state. A storage
failure can also leave a half-restored project, versions are ignored, and unknown data is silently
dropped on the next save.

## Task list and definitions of done

### Checkpoint 1 — typed contract and exhaustive outcome census

**DoD**

- Define a v2 document with explicit format/version and typed Code, Circuit and Controller sections;
  retain a named v1 migration.
- Table-driven tests cover v1, v2, vanilla, malformed JSON, invalid section types, future versions,
  unknown fields and unavailable storage, with an exact fixture denominator.
- Every input returns a named outcome (`loaded`, `legacy`, `invalid`, `future`, `storage-failed`);
  generic `found:false` ambiguity is removed.
- Deleting a fixture or version branch makes a named mutation test fail.

### Checkpoint 2 — validate first, replace atomically, roll back completely

**DoD**

- Parsing and migration are pure; no storage mutation occurs until the entire known state validates.
- Replacement removes old project-content keys absent from the incoming project while preserving
  personal preferences.
- Failure on any write/remove restores the exact prior key/value snapshot; rollback failure is
  reported honestly rather than called atomic.
- A→B(code only), A→vanilla(empty), invalid-input and injected-Nth-operation-failure tests pass.
- Mutations changing replacement to merge, removing deletion, or bypassing rollback go red.

### Checkpoint 3 — bounded unknown/future preservation and compatibility report

**DoD**

- Sidecar and section sizes are bounded before untrusted data reaches storage or UI consumers.
- Unknown v2 fields survive load→save without becoming arbitrary localStorage keys.
- Future versions never mutate known project state, remain preservable as opaque bounded data, and
  return a structured compatibility report naming version and action.
- Mutations dropping passthrough data, accepting an oversized section, or coercing a future version
  through v2 each fail a named test.

### Checkpoint 4 — mounted consumers replace, including explicit empty state

**DoD**

- The uploader dispatches every successful Scratch-load sidecar outcome, including legacy/empty.
- Mounted Code, Circuit and Controller consumers clear stale project content when their section is
  absent; device choice, extension declarations, parts and widgets cannot leak from project A.
- Consumer tests prove A→B and A→legacy replacement, including empty buffers/panels.
- Restoring any current `if (raw)`/`if (found)` merge guard makes a named test fail.

### Checkpoint 5 — real archive determinism and semantic corpus

**DoD**

- Tests call the real attach and extract functions on actual ZIP archives for code-only, circuit,
  controller, SPIKE and vanilla projects.
- Fixed-clock sidecar bytes are deterministic and semantic readers recover language/device,
  circuit seat/PCB metadata, controller mode/bindings and extension declarations.
- Missing collect, metadata, binding, language or extension mutations fail named tests.

### Checkpoint 6 — live four-surface save/reopen/recovery proof

**DoD**

- Playwright edits Blocks, Code, Circuit and Widgets, saves through the real File menu, opens the
  download in a clean context, and proves all four surfaces recover.
- It then opens a vanilla project and proves Code/Circuit/Widgets are empty, with zero page errors.
- Invalid/future sidecars surface a compatibility notice and never partially replace the current
  project; one screenshot plus saved/reopened artifacts are retained by CI.
- Unit, mutation, full build and local/matching-deployment browser verdicts are recorded; the claim
  moves to DONE only when all accepted commits are on remote `main` and user-owned dirty files are
  byte-identical.

## Coordinator rule

Agents may audit bounded surfaces. The coordinator owns the format policy, reviews every diff,
runs adversarial rollback/migration tests, performs the live journey, reconciles current remote
`main` before every push, and does not infer project integrity from ZIP readability alone.

## Checkpoint evidence

- **1–2 implemented:** v2 uses typed Code/Circuit/Controller sections with a strict v1 migration.
  Eleven format fixtures have exact named outcomes. Replacement removes absent content keys,
  preserves preferences, and restores the prior byte strings after an injected write failure.
  A merge mutation makes both A→B and A→vanilla tests fail.
- **3 implemented:** the sidecar is capped at 2 MiB and known sections have narrower caps. Unknown
  v2 fields survive load→save without becoming storage keys. Future versions return an explicit
  `preserved-not-applied` report, do not mutate storage, and are reattached verbatim.
- **4 implemented:** the uploader announces every sidecar outcome, including vanilla. Mounted Code
  clears all seven language buffers, Circuit receives an explicit empty model, and Controller
  removes old widgets before optionally applying the incoming layout. Invalid/future/storage
  failures leave current auxiliary state intact and surface the compatibility outcome in Code.
