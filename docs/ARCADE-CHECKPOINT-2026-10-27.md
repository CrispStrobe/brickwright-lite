# Arcade checkpoint and fresh-agent continuation — 27 October 2026

Read this file first, then the checkpoint branch’s
[detailed handoff](https://github.com/CrispStrobe/brickwright-lite/blob/lane/arcade-source-entry-image-banks-20261026/docs/ARCADE-AGENT-HANDOFF.md) and
[GUI ledger](https://github.com/CrispStrobe/brickwright-lite/blob/lane/arcade-source-entry-image-banks-20261026/docs/CONVERSION-CAPABILITIES-AND-GUI-GAPS.md). Follow `LANES.md` and
`lanes/PROTOCOL.md`. Operational paths and retained-original locations belong in
ignored local Markdown; none are required to understand the public tasks below.

## Where the code is

The complete source checkpoint is on
[`lane/arcade-source-entry-image-banks-20261026`](https://github.com/CrispStrobe/brickwright-lite/tree/lane/arcade-source-entry-image-banks-20261026).
The implementation checkpoints are
[`71d6e5e`](https://github.com/CrispStrobe/brickwright-lite/commit/71d6e5edacf78265a0172a5cef95596f0b234421)
(readonly Number operands) and
[`35acab7`](https://github.com/CrispStrobe/brickwright-lite/commit/35acab7c9d6b134305a293df13be7443a94a1e7f)
(finite conditional Array readiness and literal local-reset prefixes).
Use the complete branch, including its earlier integration history; taking only
these two commits loses earlier Array, Image, callable, frame-delta, accessor,
controller, loader and pin-policy repairs documented in the handoff.

This is a **source checkpoint, not a merged or runtime-qualified release**.
At the checkpoint, [PR #1128](https://github.com/CrispStrobe/brickwright-lite/pull/1128)
still has its older `aa04bfff` head and seven failed checks. The source branch
has not yet replaced that head. The separate owner of
[PR #1437](https://github.com/CrispStrobe/brickwright-lite/pull/1437) retains its
CI originals, repair and merge; its broader checks were still pending. Refresh
both PRs and remote main before acting. Do not push to the other owner's branch
or acquire originals it already retained.

## Implemented and measured

- Readonly startup Number operands: real cell/writer/dependency identities,
  entry order and all callers supply only an arithmetic-occurrence fact. Direct
  and JSON export agree. Emitted local/formal/SDK/helper collisions refuse;
  annotations, arbitrary variables and Array initialization receive no loan.
- Finite conditional Array entry: actual literal updates, selected branches and
  zero-argument ordinary calls establish an inventoried publication frontier.
  Existing producer and all-writer checks remain. Paint registration is the
  terminal direct startup statement. Unknown effects and broader entries refuse.
- Reexported local captures: a separate effect proof crosses only exact numeric-
  literal additions before the real overwrite. Null assignments and all other
  statements remain emitted. Opaque coercion, bad frame keys, malformed graphs
  and observed mutation/restoration cannot borrow the proof.

Validation: 44 combined source tests pass without skips (13 new Array groups,
24 Number groups and seven math groups); 41 existing reset/private-prefix tests
pass separately. Five Array guard cuts and three Number guard cuts trigger
meaningful assertions, with exact source restored. Counts overlap earlier runs;
they are not app-completion counts.

The raw 184-input census remains **147 translated / 36 partial / one parse
failure**. These are importer/Creator source results. The unchanged snake now
has four export refusal families instead of six: Array item, indexOf, mutation
and native addition. Its two math queries pass; the new finite Array profile
has not removed the remaining four. No new app is reported complete.

## Ordered tasks

1. **Publish and qualify the complete integration.** Once #1437's owner lands
   its qualified result, normally merge latest main into the checkpoint branch,
   preserving both histories. Refresh #1128's exact head and advance its branch
   with one normal fast-forward push of the complete candidate. Keep the
   existing CI scope; do not add a full-CI label, duplicate dispatch, Ready cycle
   or unchanged retry. Inspect every enabled exact-head result. Preserve original
   failures and terminal numeric intake before any successor. Merge only after
   every enabled check succeeds or has its declared skip; use matched head and
   verify predicted/reviewed/landed tree and ordered parents. Never substitute
   the source tests above for SDK/native/browser qualification.
2. **Qualify the new representative programs.** Run the hosted-only
   `test/makecode-startup-number-roundtrip.test.mjs` and
   `test/makecode-conditional-array-roundtrip.test.mjs` with the pinned original
   SDK and actual Lite VM. Each covers both equal export routes, three native
   generations, callback-only witnesses and same/fresh VM SB3 reopen. They are
   written and syntax checked, not yet hosted passes. Retain original SDK/native
   observations and diagnose failures without changing expected values/budgets.
3. **Extend SDK effect framing.** Claim the boundary before adding new files.
   Integrate explicit effects with `project-conditional-array-entry.js`, keeping
   runtime implementations unchanged. Screen operations mutate Image/renderer
   state but require owned receivers and closed arguments. Music can yield and
   report errors. Splash pushes scenes, runs scene handlers and suspends for
   input; cancellation can resolve waits. Game over can stop and restart the
   program, invalidating Array epochs. Model normal/abrupt/suspended continuation,
   callback interference and ownership. Do not merely whitelist these opcodes or
   carry a prior Array certificate across a restart.
4. **Add ordinary value/parameter calls.** The actual retained helpers include
   `encode`, `inSnake` and `isEdge`. Work in the conditional-entry module and its
   actual authority bridge. Validate definition/call/prototype and linked
   argument identities, evaluate arguments in original order, bind fresh formal
   cells, and propagate explicit normal returns. Existing call records establish
   identity, not argument domains. Parameter annotations, metadata, dormant
   callers and provisional recursion must not supply values or initialization.
5. **Prove loop and repeated-publication preservation.** Establish a genuine
   startup constructor base, then an independent every-path invariant for later
   writers and normal loop continuations. Include zero iterations, exceptions,
   aliases, callbacks, Stop and changed epochs. Do not relax the current stable-
   writer guard on the strength of inferred Array types or an `initialized()`
   recursion shortcut. Reobserve the complete unchanged snake after each repair.
6. **Prove element presence and native addition separately.** Array readiness
   does not establish `items[0]` or `items[1]`. Model real unshift/pop order and
   every shrink/writer before transporting primitive head values into addition.
   Preserve Undefined/object/BigInt/coercion and mixed-writer refusals; retain the
   original expression evaluation. A successful source export is not a game.
7. **Close connected editor acceptance.** In Blocks and Code, author and edit
   the same startup dependencies, branch, calls and Array operations; inspect
   diagnostics at their real blocks. Run and steer an actual game through the
   controller pane, edit its imported artwork, export/reimport, and save/reopen
   in a fresh context. Use the GUI ledger for remaining graphics, tiles, assets
   and authoring gaps. General hygienic local/formal allocation is still a
   separate formatter task; the current issuer refuses ambiguous spellings.
8. **Reassess corpus completions.** Keep all original bytes and the denominator.
   Measure recovered complete contexts separately from raw snippets; never invent
   missing assets, dependencies or source. Preserve original compiler rejections
   of invalid/incomplete inputs. Count a completion only after genuine conversion,
   original/native execution and required roundtrips, retaining what was and was
   not observed. Then continue the handoff's ordinary-callee, map/Throw and other
   remaining work packages.

## Working rules for the successor

Use an isolated owned worktree; never reset, stash, clean or force-push another
worker's tree. Check current claims and collaborators first. Complete the existing
candidate within its merged scopes; claim broader implementation boundaries
before editing them. Batch related source fixes, run bounded focused tests and
nonvacuous guard cuts, and preserve failures. Source tests use real importer,
Creator, immutable snapshots and current public export APIs. SDK/native/browser
work belongs in the approved hosted qualification environment, not a heavy local
build. Acquire each admitted official log/artifact once and reuse saved originals.
Do not weaken assertions, thresholds, source-currentness fences or diagnostics.
Keep implementation, runtime, visible-editor and corpus-completion results
separate. No physical-accuracy, hardware, release or licensing conclusion follows
from this checkpoint. The overall compatibility goal remains unfinished.
