# Compatibility + GUI delivery wrap-up (2026-10-31 → 2026-11-03): what landed, what is pending, how to do it

DONE (handoff only; no code in this PR). Written for a fresh agent: read this file, then
`lanes/PROTOCOL.md`, then the per-topic handoffs linked below. Everything listed as pending
below is unclaimed unless a newer lane file claims it, so check `lanes/` and the open PRs first.

## State at hand-off

Main is green through `8e2ea48c` (#1637, all browser shards). Later merges, oldest first: #1642
(Circuit German, `003289f7`) and #1644 (micro:bit gaps, `b12ebc27`). Their main Build was still
queued at write time, and #1642's own browser shards were superseded by #1644's run.
**First pending step: confirm main's Build for `b12ebc27` (or later) is green, including
`browser (light)` and `browser (heavy)`.**

Merged in this delivery (Lite):
- **Arcade:** #1590, #1593, #1595, #1597, #1601, #1604, #1605, #1608 (MakeCode-ordered palette),
  #1611, #1613, #1614 (tilemap API), #1621, #1630 (palette dedupe A: 9 duplicate blocks hidden),
  #1632 (dedupe B: `math [OP] of`, one `play [PLAYABLE] mode [MODE]`).
- **micro:bit:** #1592, #1599, #1602, #1619, #1644 (namespace members 211 → 264 of 291).
- **Combined PRs:** #1596 (#1592 + #1594) and #1603 (#1599 + #1601).
- **GUI:**
  - #1598: Vercel builds the MakeCode runtime.
  - #1600: Safari game-console flicker.
  - #1606/#1607: FPGA tab overhaul.
  - #1612/#1615/#1616: Code tab, one scrolling toolbar row with device-scoped actions; the
    paint-editor bottom bar moved into the top bar.
  - #1633: Circuit tab follows Robot Lab conventions.
  - #1637: DRC gate reads the portalled popover.
  - #1642: Circuit designer in German.
- **Release:** #1617, #1620, #1623–#1626 (macOS TestFlight distribution). v0.1.31 reached
  TestFlight on iOS and macOS, both submitted for external beta review.

Upstream merges:
- sb3-creator #168–#182
- extensions #70–#79
- bw-circuit-ui #134, #136
- renode-spike-prime #68

Lite pins on main:
- sb3-creator `a7b8c394`
- bw-circuit-ui `15416c7e`
- microbitplus `3dc13332`

Results (anonymous counts; the corpora stay private):
- **Arcade differential:** 139/139 of the corpus programs that compile in original PXT behave
  identically, once #1646 lands (138/139 on main before it). 45 corpus programs do not compile
  in original PXT and are out of scope.
- **micro:bit corpus:** 215 preserved / 0 partial / 0 loss, in both round-trip directions.
- **micro:bit namespace probe:** 264/291 on main; 281/291 with arguments MakeCode itself
  accepts.

## Pending, in recommended order

### P1. Land #1646 (Arcade: last divergence, tilemap APIs, flaky test) — ready

What it contains:
- The last differential divergence: cleared-tilemap lookups now fault like PXT.
- `tiles.removeEventListener`, TileMapData `scale` setter, `getTileset()`, `Location.tileMap`.
- The `update(dt)` roundtrip tests no longer depend on a 40 ms pause.
- sb3-creator pin `a7b8c394` → `8e53c162` (contains #181 and #182), with the approved x86
  re-stamp.

How to land it:
1. When its PR CI is green and main's Build for the commit before it is green, merge with a
   merge commit and `--match-head-commit`.
2. Watch main's `browser (light)`/`browser (heavy)`.
3. If another PR moves a pin first, rebase: take main's versions of
   `docs/receipts/frozen-control-pin-admissions.json`, the two `scripts/*i80386-hdd-gui*.py`
   files and `test/pin-move-chain.test.mjs`, then re-run the pin-move re-stamp tooling on top.
   Never hand-edit conflict markers in those files.
4. Stage before running `test/pin-move-chain.test.mjs`; it compares against staged blobs.

CI: on head `ce2eb896`, `unit (3/6)` and `unit (6/6)` hit the 30-minute job limit (6/6 twice;
no test failed). The cause was a stale shard-timings table (2026-10-28): files added since were
placed by name hash. The fix is commit `524b736c` on #1646, which regenerates
`scripts/data/unit-test-timings.json` with `scripts/gen-unit-test-timings.mjs` from main run
41586247225. The estimated per-shard load goes from 26–60 to 38 summed test-minutes on every
shard. If shards drift again later, repeat that step from the latest full green main run:
`gh run download <id> -p 'unit-shard-*' -D <dir>`, then
`node scripts/gen-unit-test-timings.mjs <dir> <id>`.

Overlap: #1643 (another session) edits `arcade-translate.js` and
`array-reference-export-authority.js` in different hunks. Whichever lands second rebases.

### P2. TestFlight 0.1.32 (iOS + macOS) — ready after P1

v0.1.31 predates the Arcade dedupe, the Circuit tab, Circuit German, the micro:bit gaps and #1646.

The release recipe (see `lanes/2026-11-02-release-0-1-29.md` for the shape):
1. Open a version-bump PR that touches:
   - `apps/tauri/src-tauri/tauri.conf.json`, `Cargo.toml`, `Cargo.lock`
   - the regenerated `docs/generated/spike-linux-crate-inventory.json`
     (`scripts/gen-spike-linux-crate-inventory.mjs`)
   - EN and DE "What to Test — 0.1.32" sections in `docs/app-store-metadata.md`, each 500–4000
     characters
   - a lane file
2. After the merge, push the lightweight tag `v0.1.32` on the merge commit.
3. `mobile.yml` (iOS) and `release.yml` (macOS) both trigger on the tag, and each runs
   `push-tester-notes` and `testflight-submit --platform IOS|MAC_OS`.
4. Check BOTH workflows' logs for "UPLOAD SUCCEEDED" and "submitted, WAITING_FOR_REVIEW". A tag
   carries its own workflow files, so a workflow fix needs a new version.

### P3. ResizeObserver loop error — blocked on the owner

The owner reported a "ResizeObserver loop" error. No repro yet: which tab, which steps, which
browser, the console stack. Do not guess-fix it. Ask for those, then reproduce.

Likely suspects are components that set their own size inside a ResizeObserver callback:
- the new scrolling toolbar rows (#1612, bw-circuit-ui #134)
- the Robot Lab canvas
- the paint editor

The usual fix is deferring the size write to `requestAnimationFrame`, or guarding against an
unchanged size.

### P4. Arcade: known limits left by #1646 — doable

Each needs a PXT comparison test written from your own minimal program:
- Images pushed directly onto the `getTileset()` array do not feed back into the map. Edits to
  existing images and `setTileAt` additions do.
- Changing `scale` on the currently loaded map does not re-crop its tiles until it is loaded
  again (PXT behaves the same way for the grid; check the cropping against PXT).
- TileMapData members beyond `data`, `scale`, `enabled`, `areaWidth()`, `areaHeight()` and
  `getTileIndex` are refused by name.

Also open:
- The Arcade TODO rows in `docs/ARCADE-888-OPEN-FAILURES.md` (group A: five rows; G/F stay
  refused by decision). The source-import census on `5956c6ab` is 156 translated / 27 partial /
  1 parse failure of 184.
- See `docs/ARCADE-AGENT-HANDOFF.md` (top section) for method and decisions.

Owner decision 2026-11-03: the three `animation asset [X] …` reporters stay as three blocks. Do
not merge them.

### P5. micro:bit: the 10 remaining refusals — mostly not doable faithfully

Each one has its reason in the import message:
- `eventTimestamp` / `pulseDuration` outside a handler: no global last event in Lite's polled
  handlers. This is doable only by adding one global "last event" record to the runtime.
- `programHash` / `programName`: written by MakeCode's compiler into its binary.
- `gcStats`: CODAL garbage collector counters.
- `setInterval` / `clearInterval`: run-time task ids. This is doable only with a dynamic task
  table in the MicroPython runtime.
- `music.onEvent`, `waitForMelodyEnd`, `setPlayTone`: hooks in MakeCode's melody player.

Also refused:
- sound, playable and log-column values used as data (printed, stored, passed)
- data logs with more than three columns

Tests live in `test/microbit-namespace-gaps.test.mjs`. Probe the same calls as the #1602 table.

### P6. Circuit designer: English left with German selected — doable upstream

These are in bw-circuit-ui unless noted. Use the same approach as #136: `src/i18n/` tables, the
`lang` prop, English byte-identical.
- PCB board-view DRC findings and fabrication-check labels: a separate checker.
- Part-number descriptions in the Parts list (these are also ordering names; translate the
  description only).
- The LED colour value inside the part label.
- CSV export headers (decide whether to localise them; spreadsheet users may expect English).
- Bus-extractor reasons and engine-refusal reasons. These come from other packages (bw-board),
  so they need a change there first.

Process:
1. Merge bw-circuit-ui with a merge commit.
2. Pin the lane commit whose only parent is the current pin, as #1633 and #1642 did, so that
   ESP32-S040 work on bw-circuit-ui master is not adopted unqualified.
3. Re-stamp `LIVE_X86_CUI`, `HISTORICAL_X86_SOURCE_PROFILES` and the two x86 receipt rows.

Unconfirmed: clicking a Warnings-panel row to expand it did not respond in a headless
screenshot run (#1642). Check by hand before calling it a bug.

### P7. Circuit toolbar and ESP32-S040 — owned elsewhere

#1622 (ESP32-S3/S040, draft, another owner) will need a rebase onto the bw-circuit-ui pin from
#1642. bw-circuit-ui #135 (S040 display clearing) is open upstream. Leave both to their owner.

### P8. Small hygiene items — doable

- `scripts/sync-sb3creator.mjs` printed "STALE GALLERY"; suggests `npm run sync:examples`. Neither
  #1644 nor #1646 ran it. Check whether the gallery should be regenerated, in its own PR.
- The `*-native` Arcade test files stop at their first line unless `BW_ARRAY_NUMBER_VALUE_SOURCE`
  is set. Find which workflow sets it, and document or default it.
- macOS-only local failures, not CI defects:
  - `verify-circuit-ux` "installed ideal ADC complete consumer journey" (ArrowDown in a dropdown)
  - `conversion-audit-core` "physical symlink input"
- A heavy-lock helper must release only a lock it took itself. On 2026-11-03 one agent deleted
  another's lock. See the lock README in the shared work directory described in the local
  handoff.

## Rules that applied throughout (keep them)

- No `ci:full` label on PRs. Merge GUI/runtime PRs one at a time and watch main's browser shards;
  a superseded main run skips them.
- Pin moves: upstream first, then `vendor-pins.json`. The owner's standing re-stamp approval
  covers exactly:
  - the two x86 rows of `docs/receipts/frozen-control-pin-admissions.json` (sha256/gitBlob only)
  - `LIVE_X86_SB3` / `LIVE_X86_CUI`
  - `HISTORICAL_X86_SOURCE_PROFILES`
  - `FINITE_V10_PINS`
  - the SPIKE pin assertion in `test/lego-spike-roundtrip.test.mjs`

  Any other sealed receipt: stop and ask.
- Merging into CrispStrobe/extensions needs the owner's approval.
- The compat corpora are private: report anonymous counts only, never program text, names or
  file lists, and write tests from your own minimal programs.
- Before pushing, check the CI-only gates statically: the GUI-scope allow-list, and no
  `console.log` in tests.
- First-load JS (P17): limit 4,476,352 bytes. Main measured 4,463,880 on `cb878669`, so about
  12 KB of headroom. #1646 adds 115 bytes. Keep new UI lazy.
