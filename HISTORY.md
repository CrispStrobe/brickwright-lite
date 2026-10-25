# Brickwright Lite history

Completed and rejected work moves here when it no longer belongs in the active
plan or roadmap. Detailed commit, CI and ownership evidence remains in Git and
`LANES.md`.

## 2026-09-08

- **The debugger-history browser proof no longer races a program that pauses
  itself** (Lite `4218ebb1e9f9c1d3d29ee0971b9e4a596189eacd`; Build
  `34266508832`, all four executing jobs green; debugger-focused
  `34266511938` green). The proof now reads the phase and dispatches Pause in
  one browser event-loop action: an already-paused program is accepted, while
  a running program is paused through the real control. Deterministic unit
  cases cover both paths and refuse a disabled control in any other phase.
- **The active-low lesson split reached Lite through the guarded sb3 corpus
  pin** (content commit `c593574367179132aa193d7f5a4477c0299e3ab3`, shipped
  pin `9173ca756a72e5be81578a084c4c783ebc5c267d`). Lessons 06,
  32, and 46 are architecture-specific and no longer advertise retargeted
  benches that erase their premise; lesson 56 provides the portable logical
  state versus electrical pin-level comparison across eleven devices. The
  production solver census, run with bw-board `bc0ae45ef899fafacbdbd22afded42784a4aeebd`
  and bw-circuit-ui `59c4dce8b92f6f0cc8dea5b7be051530b6d779f9`, caught all four
  mutations on both surfaces and now reads 745 attempted / 54 undecided / 691
  agreeing / 0 inverted for seated benches, and 674 / 49 / 625 / 0 for flat
  twins. The exact `33ab265..c593574` range changes zero `src/` files. The
  subsequent `c593574..9173ca7` range converges the already-present
  `i8086_counter` catalogue entry and adds only its upstream tests; the
  normalized catalogue delta is 0/0 and the stale Lite divergence declaration
  is retired. No emitter content rode either part of this pin move.
- **Compiler recovery now follows routed lesson URLs and SIM mode cannot open
  part properties** (bw-circuit-ui upstream `59c4dce8b92f6f0cc8dea5b7be051530b6d779f9`,
  upstream run `34242742198`; Lite `37f41c6da8b4926337076b4f5be1e472090102dd`,
  exact-head run `34246477283`, all four jobs green). The local-compiler choice
  reads the query inside a hash-routed lesson, including the empty page-query
  edge, and keeps an explicit page query authoritative. Hosted compilation and
  Settings download use separate origins, so recovery text now points to Menu →
  Settings → C Compiler → Build in this page → Download compiler. A central
  BoardCanvas edit policy blocks every property-opening path in SIM, hides its
  adjust control, clears stale editors on SIM entry, and guards dialog render.
- **One seated STC12 buzzer gained a real electrical-equivalence oracle**
  (`cd26a7e9e590cec3d5c32c593ad22c161493db2c`, exact-head run `34230601507`,
  all four jobs green). The inferred active-high fallback and an independently
  assembled reference both solve to 0/4 V and 0/40 mA at LOW/HIGH, with DC and
  200/1000/4000 Hz tone behavior checked. LED substitution, an opened ground
  jumper, and the production-source buzzer-to-LED mutation fail by name. Other
  polarities, MCUs, authored benches, and corpus surfaces remain outside it.
- **The vendor-convergence census became a finite roadmap:** 20 declared source
  forks (18 `bw-board`, one `bw-circuit-ui`, one `sb3-creator`) and 11
  downstream-created placements at `37f41c6da`. The `bw-board` dependency graph
  is one coupled ten-file unit plus eight independent files. Licence copies,
  generated manifests, sync artefacts, and Lite-only helpers are classified by
  ownership instead of being copied upstream blindly.
- **The unreachable legacy `hobby_gearmotor` package assets were retired**
  (Lite change `d21b67752480ccb17941fbb5d4c253ffb98535b2`, main
  `62c7a00c4960c48966d2ebf725ee4398b46463d5`; exact-head run `34246973382`
  green). The corrected runtime slug had already arrived from bw-circuit-ui
  `9cb48df02f0cc54e057598ce76e097bfc6906329`, upstream run `34245969165`.
  Lite deleted only the old ignored-but-partially-tracked JSON/SVG pair and now
  checks its absence, absence of stale references, and presence of the canonical
  `gearmotor` pair.

- **The GPL SDCC payload left the BSD-3 repository and became an explicit toolchain**
  (`0b79a6f23`, following CLI `fa87c0d7e` and manager `0dec905c3`). The 202
  tracked compiler files were removed and ignored. CI may fetch the compiler
  from its own origin; Node consumers either run it or skip by name when the
  optional download is absent. The CLI exercises online and local compilation,
  cancellation and resume; the Settings manager exposes mode, byte-weighted
  progress, removal, licence, and source information.
- **The i8086 example and emitter were re-synchronized through their shared pin**
  (`a9b09429b`, main later `1d849ee9b`). The single `sb3-creator` pin governs
  both gallery examples and emitted source, so every example sync must audit
  emitter changes and re-derive its reach evidence.
- **N2b established the 8086 C numeric model** (`3d84eef62`). C uses
  signed 16-bit `int` and refuses literals or initial values outside
  -32768..32767 by name; other C targets stayed byte-stable. The differential
  asserts the intentional width disagreement by value: C wraps 35000 to -30536
  while the ASM route retains its 32-bit pair.
- **P21 completed the lazy PseudocodeImporter route** (promoted series ending
  `68a726c35`). Activation, retry/state, and exact emitted-receipt gates cover
  the demand-loaded importer rather than inferring the split from source shape.
- **P22 replaced the invalid 8086 speed claim with a CPU-bound benchmark**
  (`da4d30b0c`). Hosted medians were 2.0190x desktop, 2.0192x mobile, and
  2.0220x under 4x throttle; throttled pump p95 was 7 ms and the maximum pump
  was 22.3172 ms. The earlier roughly 30x result measured guest-time jumps from
  `INT 15h AH=86h` and is superseded. Worker/JIT/batching remain deferred until
  three repeat runs measure either below 1.0x or above 8 ms pump p95.
- **LED polarity was corrected and pinned** (`f568d875a`, hosted run
  `34197832516`). The historical defect affected 174 of 792 decidable readings
  across 19 distinct examples; the corrected seated census is 792 agreeing / 0
  inverted with the denominator unchanged. The earlier “21 examples” added a
  3-example and an 18-example group that overlap in two examples.
- **TONE became audible and the polarity oracle gained the flat surface**
  (`9d55123eb`, hosted run `34200535237`, `bw-board` pin `6145e8a`). All 25
  shipped TONE readings reach a buzzer. The two separately mutation-proved LED
  surfaces read 792/0 inverted for seated benches and 714/0 for flat circuits.
  Moving the board pin also required regenerating seven artifacts that stamped
  the old SHA even though the ROM binaries were byte-identical; provenance is
  part of a pin move, not an optional afterthought.
- **History-only changes no longer launch the heavy Build workflow**
  (`e1765b83c`, hosted run `34210227378`). `HISTORY.md` is excluded beside the
  other ledger-only root documents. A named mutation-proved trigger test keeps
  history-only changes out while executable source, the governed root notice,
  and re-included documentation inputs still start the workflow.
- **N2e bounded numeric lists landed on the 8086 C route** (upstream
  `8c17dfa898f80a875e2a4bf044144564f8a4cebc`; Lite `dec11a41f`, hosted run
  `34206351591`; upstream exact/main runs `34200030761`/`34200529033`). Lists
  hold at most 32 signed-16 values and the route permits 15 lists / 990 bytes of
  static list state. The 15×32 proof emits a 1,618-byte `.COM` with 63,662 bytes
  of segment space remaining. Independent array rows cover add, insert,
  replace, delete, delete-all, item and length, including invalid-index
  no-op/zero behavior; zero-based reads and silent overflow each make the gate
  fail. Generated data and length identifiers are allocated independently, and
  length has one numeric-provenance authority. The only 281-program list
  candidate is `arduino-03-smoothing`; it remains ADC-choked, so lists add zero
  corpus reach and the honest broad total remains 46.
- **N2f measured the bounded random-plus-literal opportunity without changing
  production** (`e15c2cb8a`, hosted run `34217092106`). The honest i8086
  device-C baseline is 47 named programs, not the mixed 78 total: 31 further
  programs generate HOST C and never enter `compileC8086`. Four parsed-graph
  variants show literal-only and random-only add zero; together they expose
  exactly `arduino-sk-p11-crystal-ball` (device 47→48, mixed 78→79). The 48
  prospective device programs comprise 45 distinct C bodies, with the sole new
  baseline-to-complete body belonging to crystal-ball, and all compile in
  hosted CI. The old “empty text refusal” finding was an evidence bug:
  `_cPrintRefused` already names it, while the probe omitted that fifth bucket.
  A source-plus-runtime inventory and future-bucket mutation now guard the
  census. The proposed RNG contract is a fixed-seed 16-bit LCG with inclusive
  signed-16 bounds and multiply-high rejection; low-word modulo was rejected
  because `pick random 1 to 8` then repeats every eight draws.
- **N2f production landed with deterministic random and literal DOS output**
  (upstream `5a0d5592be4c7586864babc1e72015aa819cd128`; Lite
  `c77563dbf5e2336c7da90a8993d98415705a60d8`; exact-head run
  `34224675820`, all four jobs green). The guarded sync carries the exact
  emitter through both mirrors. Consumer helpers implement inclusive signed-16
  normal, reversed, equal, and full-span bounds with fixed seed `0x4d3d` and
  unbiased 16×16 multiply-high rejection; direct zero-terminated literals use
  DOS character output with CR/LF. All four lattice variants compile 48 device
  programs, alongside 31 HOST-C programs; body accounting is 45 per complete
  set and 48 unique bodies across the lattice. The real crystal-ball trace
  produced rows `Most likely, Ask again, Ask again, Ask again, Yes, Most likely,
  Without a doubt, No` from rolls `2,4,4,4,1,2,5,7` (1,745 steps,
  44,020,502 cycles, 500 bytes). Boundary rows `225,7,4,-25002,-1` came from
  draws `2,1,1,1,1` (482 steps, 6,403 cycles, 264 bytes). Mapping, helper,
  zero-based-read, and overflow mutations all fired. The first hosted run found
  that the profile generator treated `printText` and `random` as physical-part
  verbs; the landed fix classifies both as language/runtime controls and pins
  their non-hardware status in conformance tests.

## 2026-09-07

- **N2c reach receipt corrected by the later fail-closed numeric lowerer.** The
  exact N2c pin genuinely reported and compiled 44 programs, but `c8791ee`
  proved two were false successes: blink-without-delay and debounce compiled
  timer-derived operands as commented zero. Current pre-print reach is 42; the
  historical 44 stays labeled by its pin. N2d then adds four honest numeric
  print programs for a safety-correct current total of 46.
- **Track A source authority completed** (`60ecb4d89`, hosted run
  `34087062528`). Root tests now import owned GUI
  modules from `overlay/scratch-gui`; the registered GUI-scope hook supplies
  bare dependencies from a prepared GUI package. A mutation-tested census
  rejects executable imports from generated `packages/scratch-gui/src`, while
  preserving intentional read-only mirror and artifact checks. An explicit
  `BW_INTEGRATED_ROOT` relocates dependency and build scope only, so it cannot
  silently replace the source under test.

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
- **P16a/P16b parser representations rejected.** P16a's
  four generated validators preserved 534 validator and 122 full-parser
  comparisons but duplicated schema functions and grew initial JavaScript from
  4,543,936 to 4,573,012 bytes (`34049223633`, `34049943831`, reverted at
  `72a01c3f0`). The canonical P16b shared emitter handled cyclic refs but
  produced 315,452 raw bytes versus P16a's 284,144, so hosted runs `34050733307`
  and `34050865216` stopped before webpack and the change was reverted at
  `431d78a76`. An independent holder-based emitter preserved the same corpus
  but emitted a 4,630,154-byte GUI asset, 163,018 above the declared ceiling,
  and was discarded locally. Those results limited P16c to a structural-
  equivalence census with a 160 KiB source stop gate.
- **P16c structural validator census stopped before candidate generation.** A
  deterministic cycle-aware partition found 30 generated function nodes and 18
  exact classes, including 12 repeated pairs. Representative function bodies,
  schemas, patterns and defaults alone total 177,151 bytes, 13,311 above the
  163,840-byte ceiling before reference wiring or module overhead. The source
  gate therefore rejects canonical emission; no build or hosted run is needed.
- **P17 Sound-tab deferral completed** (`b112681f7` through `783465884`, final
  hosted run `34055549914`). The first two browser attempts showed a blank panel
  because the demand-loaded audio singleton registered its gesture listener
  after the click which loaded it. First-use initialization restored the panel;
  the retained route then prewarms on focus or hover. The final gate passed one
  retryable non-initial chunk above 20,480 encoded bytes, usable controls, a
  150 ms runner-calibrated ceiling (three unchanged-production receipts measured
  121.6–136.4 ms) from a 113.6 ms baseline, the 1 s absolute ceiling and the
  100 ms long-task ceiling. Build, corpus, both browser shards, deploy and
  deployed-GUI verification were green.
- **P18 Connection-modal deferral rejected** (eager baseline `34056846253`;
  candidate `34059625658`, head `60a4b9bb3`). The candidate reduced initial
  JavaScript from 4,351,060 to 4,224,748 bytes, but its deterministic named
  asset was 75,446 bytes: 1,354 below the fixed 76,800-byte floor. The complete
  webpack named chunk group was 128,139 bytes because DAP.js and universal-hex
  were extracted into a 52,693-byte unnamed sibling; this fact is retained in
  the receipt but did not redefine the named-asset gate. The normal modal
  reached scanning UI, while aborted-import recovery failed to show its retry
  state. The lazy wrapper, GUI changes and candidate browser workflow were
  discarded; production remains eager.
- **Pico simulator reset and rerun completed** (bw-board `435599c`; Lite Track
  1 series). The adapter exposes watchdog reset intent without pretending a
  partial core clear is a reboot. Lite replaces the complete RP2040 and USB CDC
  epoch from preserved flash, retains the external board, rejects stale and
  terminal transport reads, and uses the same install-and-reboot deployment
  path as silicon. Focused tests cover epoch ownership and failures; the hosted
  browser gate runs different GP25-high and GP24-high programs consecutively,
  observing both reset generations and USB enumerations without a page reload.
  Missing firmware still refuses clearly, while learner `machine.reset()` is
  no longer blocked by source inspection.
- **P19 scratch-storage fetch-worker deferral rejected at attribution.** Current
  webpack stats place scratch-storage's single 280,064-byte prebundled browser
  module entirely in the initial shared chunk, but most of that module is the
  storage API and direct fetch path which startup still needs. The complete
  worker-side upper bound is only 32,773 raw bytes: the escaped inline worker,
  `FetchWorkerTool`, `InlineWorker`, and even the entire `ProxyTool`. That is
  44,027 bytes below the 76,800-byte emitted floor. The package's nominal
  22,345-byte fallback worker is referenced by URL but is not emitted into the
  app, so there is no second shipped copy to recover. A checked receipt pins
  webpack hash `30fa48f7e6bfb148c743` and those exact measurements; fixture
  mutations fail closed on package, ownership, path and size drift. No
  candidate was built.
- **P20 Scratch 1 converter deferral rejected at the emitted-size gate**
  (candidate `c0893500f`, hosted run `34058754836`). Attribution found all 30
  `scratch-sb1-converter` modules in the initial shared chunk, totaling 87,364
  source bytes. The isolated candidate moved them behind the existing
  scratch-parser rejection path, but emitted only one 43,171-byte chunk (14,086
  bytes gzip), 33,629 bytes below the declared 76,800-byte floor. The exact CI
  receipt is retained and the production split was reverted before handoff.
- **Browser build-artifact reuse rejected on critical-path cost.** Four green
  runs measured the central `build` job at 5:27–5:42 and the slow browser shard
  at 6:43–9:35 in parallel. Each browser-local webpack build takes about 1:15;
  serializing both shards behind `build` therefore adds at least 4:12 before
  artifact transfer, while the current built tree is about 129 MB. Exact-byte
  identity would improve, and two local builds would disappear, but release
  wall time is the priority and would regress. The required light/heavy split
  remains unchanged.
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
  route and transport checks remained in place. The 2026-09-07 completion moved
  the grouping transform into the capability module, replaced the remaining
  JSX-parsing sentinel with an exact contract and named removal mutation, and
  added a browser equality check between the picker and the panel's full device set.


## 2026-09-09 — CI inputs and complete ULA snapshots

Lite PR 108 (`5c2c960c7`) makes vendor/compiler CI checkouts immutable and removes
the moving-tip dependency from the absent-file sync proof. CUI PR 19 and
sb3-creator PR 12 publish workflow/script input census improvements upstream.
The complete ULA snapshot contract is upstream in bw-board PR 4 and adopted at
exact green `fe523c1`; one declared source fork retires (15 → 14). All required
checks passed on `e92f6c010`: Build `34316700731`, vendor `34316700662`, debugger
`34316700640`. See `docs/CI-INPUT-ADOPTION-2026-09-09.md` for counts, scope,
unchanged ROM evidence and upstream receipts. `docs/UPSTREAM-WIP.md` explains
why agents batch deliberate pin adoption rather than chase every upstream SHA.
