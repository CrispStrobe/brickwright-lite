# SAMD engine adoption handoff — updated 2026-10-29

**Software acceptance passed; final CI and normal landing remain open.** Continue
[PR1533](https://github.com/CrispStrobe/brickwright-lite/pull/1533), branch
`lane/samd-release-adoption-20261028`. It contains the complete SPIKE change from
closed PR1547; both original source branches and failures remain retained.
Firmware57 and Runtime66 merged normally. Keep final PR checks on the fast tier
without ci:full. Do not replay successful guests or create another consumer lane.

The full [source run40783464522](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40783464522)
and [native run40803428616](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40803428616)
passed on consumer `48df0f93f9b6b642238c13448e6f075d8871eb83`. Independent original
archive/source audit joined all 8,563 frontend files, 184 native sources and
binary `b1e644b68b203e196f25203ed2424220b2fcff15766f31cee32ba245b45c8a38`.
Compile defaults and qualified original inputs remained unchanged.

**Both actual game realms passed:** Chromium in
[40826297334](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40826297334),
installed Tauri/WebKit in
[40828345515](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40828345515).
Each ran three fresh instances and retained 51 RGB frames. Independent decoding
confirmed eight targets, ball motion, eight-pixel press displacement and stopped
movement after release in all six instances. Original source/frontend/executable,
observer/transport and engine/profile/firmware identities joined exactly.

| Realm | Sample wall seconds | RSS observations | Maximum observed summed RSS |
| --- | --- | --- | --- |
| Chromium | 165.3971 / 164.9345 / 164.3794 | 496 | 1,059,164,160 bytes |
| Installed Tauri/WebKit | 157.864 / 154.202 / 153.912 | 470 | 1,487,085,568 bytes |

RSS is a one-second process-tree sum including observer processes and shared
pages per process; it is not PSS or a continuous peak. These functional results
do not establish real-time playability, physical capture or a normal SAMD GUI
compile/import/export route.

The installed result uses observer
`e859cecd3adcfa001c9311b585ffe6983db49c76`, the original consumer above,
frontend40783464522, native40803428616, producer40699886470 and producer head
`8ea3767903d5135f4bd1e74914e25663b530d502`. Observer and HTTP transport hashes
are retained in its original result. Reuse the original artifacts for review.

Preserved failures and bounded repairs:

- Run40826003752 stopped before guests: current gh refused ANSI-bearing job
  logs. The reader captures raw responses into buffers/files and records its
  own source/hash separately from the exact guest checkout.
- The installed job in40826297334 lacked Tauri's resource directory. The same
  admitted binary is now installed in a local usr/bin plus usr/lib/Brickwright
  prefix. SAMD uses embedded frontend assets; no private SPIKE resources were
  added to this qualification.
- Installed40827218429 reached the game RPC before Node fetch's implicit
  300-second header cutoff aborted it. The node:http transport honors the
  existing 4,900-second RPC and 4,800-second script deadlines. Guest frame/input
  budgets, startup limits, picture assertions and workflow deadline remain.
  Twelve metadata/archive/RGB/memory/HTTP controls passed. The successful
  installed game exceeds five minutes without changing these declared limits.
- Native40827224550 retained a real timing failure: fastest exchange 3.12547 ms
  exceeded the unchanged 2.5 ms bound. Maintainer commit
  `fb43bdf543c6bb8b54cddc2aeaa6775cff5a7b46` repairs only mock JSON-line writes,
  with identical wire bytes/order, all 1,000 exchanges and original assertions.
  Production prefixes are byte-identical. Hosted40828350448 passed 275 standard
  native tests (11 existing ignored) plus nine explicit ignored-suite controls.
  Final-head checks still gate landing; the original failure is not waived.

- Fast run40830119499 passed five unit shards and build, but shard2 correctly
  rejected the installed gate's unrecognized reader/scripts invocation. The
  workflow now uses working-directory reader and the canonical node scripts
  command. All six observer/input/output paths resolve identically. The observer,
  game, arguments, budgets and successful originals are unchanged. Twenty-three
  coverage/census controls and45 related workflow/budget/skip controls passed;
  the failed original remains retained. No successful guest is replayed.

The separate composed private SPIKE package passed all 13 installed lifecycle
cases, including view switching, exact owned-process loss and natural session
expiry at 120.14 seconds with fresh-session recovery. Independent audit joined
one installed image, binary, firmware, source/helper identities, zero exits and
unchanged CPU/memory/network bounds across all 13 cases. See
[the delivery record](SPIKE-CURRENT-RUNTIME-DELIVERY-2026-10-28.md). Its existing
redistribution false marker remains; it is separate from official SAMD input
admission and makes no external MicroPython or physical-silicon claim.

## Completed supplier work

Core [PR262](https://github.com/CrispStrobe/labwired-core/pull/262) merged as
`3b655aef4085082152129c84849d4e2ad5004a7f` after fleet, selected guest and CLI
qualification. BW [PR711](https://github.com/CrispStrobe/bw-board/pull/711) merged
as `1f92a1aa85e808827a4c28b219bf11a572f07882` after all 12 enabled checks succeeded;
reviewed parents and landed tree were verified.

The [locked release](https://github.com/CrispStrobe/bw-board/releases/tag/labwired-wasm-3b655aef-locked)
has API `immutable: true`; all nine publisher digests match retained qualified
originals. The earlier unlocked tag remains preserved and is not the proposed pin.
Producer [40699886470](https://github.com/CrispStrobe/bw-board/actions/runs/40699886470)
passed two builds, determinism, 125 existing tests and three game samples.
Independent review checked 565 files and 51 RGB frames. Motion remains deferred.
Keep component notices and the narrow Node 22 inlining workaround documented by
the [producer handoff](https://github.com/CrispStrobe/bw-board/blob/master/docs/SAMD-ENGINE-RELEASE-HANDOFF.md).
Infrastructure [PR1456](https://github.com/CrispStrobe/brickwright-lite/pull/1456)
merged as `dea504b32a9a4bd43a2a9d25b587590a0ac9763f`. The package owner released
the former PR1318-first hold for this exact adoption and its claimed repairs;
no general package boundary is open.

## Retained prerequisite identity evidence

PR1533 updates web engine/glue/profile identity in `scripts/sync-labwired-wasm.mjs`
and matching Node identity in `.github/workflows/target-performance.yml`.
No board/compiler/CUI package pin, native producer or compile default changes.

- All 88 focused Node 22 controls passed without skips. All six hosted unit shards
  now passed. Shard6 reports 1,885 passes, zero failures, one existing TurboWarp
  checkout skip and four existing Arcade TODOs; keep their documented limits in
  [ARCADE-888-OPEN-FAILURES.md](ARCADE-888-OPEN-FAILURES.md).
- [Tauri40783464531](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40783464531)
  passed full Rust tests (273 passed, zero failed, 11 existing ignored) and E2E.
  Vendor, GUI infrastructure and historical-study controls passed. The separate
  actual historical study is correctly skipped on this event.
- The official frontend
  [producing job123176209089](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40783464522/job/123176209089)
  succeeded. Artifact12866901737 was acquired once after metadata admission.
  Independent review hashed all 8,563 emitted files (298,288,470 bytes) and verified
  actual checkout `5b6d453136967e943fd36ef29c3c8054a295a1fb`, its parents/tree,
  source stamp and complete inventory. Its only difference from the reviewed
  head is `docs/EDITOR-WORKSPACE-UX-HANDOFF.md`.
- Emitted assets exactly match the locked release: glue
  `a29729658f267617e7d2539d756bd4dbe0662b25768348ecaeab723a9b032e1f`,
  Wasm `1ad2947b99df8a13fce29c9240a79c61fb66e4d57ede26ca50880f141f3e3978`,
  profile `0fe1e72ae684153696efbca5874d2633007b92a9c9144f38cd62fdd28d030750`.
  This proves byte binding, not successful overall source CI or actual guests.
- [Native40803428616](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40803428616)
  uses this reviewed consumer, frontend40783464522 and the unchanged closed
  `compile_pins` object from the reviewed
  [qualification profile](https://github.com/CrispStrobe/brickwright-lite/blob/48df0f93f9b6b642238c13448e6f075d8871eb83/scripts/native-installed-qualification-profile.json).
  Both producing jobs succeeded. Its official originals were acquired once;
  independent audit joined 184 native source files, all 8,563 frontend files and
  executable SHA256 `b1e644b68b203e196f25203ed2424220b2fcff15766f31cee32ba245b45c8a38`.
  Compile defaults are unchanged. This is an identity audit, not installed-game
  acceptance; the remaining source workflow is still pending.

The retained [five-target benchmark](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40730146231)
passed its unchanged floor at source `317c069003803f9e8bfbe570ca7c371da6e52c10`.
Its inputs are unchanged; do not repeat it. Core-loop ceilings do not qualify
active-game or hardware speed.

## Preserved failures and bounded repairs

Original [Build40734487998](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40734487998)
failed historical-study controls. Its successful producing job also minified the
verified 153,114-byte glue to 51,263 bytes. Strict byte admission refused that
frontend. Preserve both failures; this quarantined original must never feed
native or actual-game acceptance.

Both webpack configurations now preserve only the exact runtime glue through
the existing copy hook. Broker proof rules and unrelated minification remain
intact. The source owner's released three-path study repair seals four complete
historical inputs and preserves the exact historical UI manifest. Original
experiment pins, identity sources, thresholds, captures and intent are unchanged.
Current-pin/never-pinned guards remain strict. Do not import the supplier's
entire PR. Hosted shard6 now passes all four sealed historical-role controls.

Original [Tauri40765450230](https://github.com/CrispStrobe/brickwright-lite/actions/runs/40765450230)
reported 269 passed, one failed and11 ignored: the owner-crash test observed a
child surviving its existing three-second bound. Its original fixture/test
matched commit `3d77472b518ae4e9a57fd8cfb154e31ecba1b432`; SAMD had changed no
Rust. The original cause remains unknown, not a proven flake or engine regression.
The original log is retained once; do not rerun the unchanged failure.

Test-only successor: the
[Linux observation claim](../lanes/2026-10-28-linux-owner-death-observation.md)
owns only the supervisor's test module; production bytes remain unchanged.
The candidate binds parent/group identity and a held process descriptor, requires
complete PID publication, retains bounded failure snapshots and signals only the
admitted child. The original three-second assertion stays intact. The original immediate-crash
case remains; the100 ms live-owner case uses a separate fresh fixture. A negative
fixture observes the actual supervisor's kill signal before deliberately
clearing it and requiring survival through the same window, then exact cleanup.
Private extracted-method controls and three adversarial cuts passed; their
explicit synthetic supervisor boundary is not full Rust or guest qualification.
Full hosted Rust CI now passes these cases, as recorded above. Actual SAMD
acceptance remains pending; the original failure is not reclassified as a flake.
Production bytes and the original assertion are unchanged. Preserve other owners'
MicroPython manifest hunks and old dirty worktrees.

## Remaining work, in order

1. Finish every enabled final-head fast/native/product check. Keep ci:full off;
   its administrative reminder is intentionally red on an unlabelled code PR.
   Preserve and diagnose any real failure before changing source.
2. Refresh Main and review composition with both scoped acceptance records.
   Merge normally with matched-head protection and verify predicted/landed tree
   and parents. Update this handoff, adoption guide and both claims with the
   actual merge. Inspect post-merge alarms and pull the owned clean checkouts.

Normal project compile/import/export and GUI-route adoption remain separate,
scoped work in [the adoption guide](SAMD-NATIVE-GAME-ADOPTION.md). No current
result claims hardware capture, panel accuracy, active-game performance or motion
qualification. Keep private paths, raw logs and operational details out of Git.
