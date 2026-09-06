# The 8086 tier — core plan and status

Started 2026-09-03. The retro tier gains a third CPU beside the W65C02 and the
Z80, built the same way and verified to the same standard.

**Status: shipped in Lite. An independent implementation agrees with it on
480 of the 525 textbook programs. The current, mechanically checked product
surface is in `docs/generated/I8086-CAPABILITY-REPORT.md`.**

## What is built

| Piece | Where | State |
|---|---|---|
| `I8086` core | `overlay/scratch-gui/src/lib/bw-board/i8086.js` | **646,000/646,000 vectors** |
| Disassembler | `i8086-disasm.js` | **646,000/646,000 on TEXT and length** |
| 8255 PPI · 8259 · 8254 · 8251 | `i8255.js`, `i8259.js`, `i8254.js`, `i8251.js` | INTR + NMI delivered |
| Machine · adapter · debug target | `i8086-machine.js` + 2 | factory kind `i8086` |
| Bus extractor | `i8086-extract.js` | a miswired select gives a NAMED refusal |
| DIP parts | `bw-parts` `41706a7` | 7 packages, **pushed** |
| DOS/BIOS services | `i8086-dos.js` | INT 21h/10h/13h/16h/19h/1Ah/03h/15h/20h |
| Assembler | `i8086-asm.js` | **525/525 accepted** |
| emu8086 devices | `i8086-emu8086.js` | clean re-implementation, evidence-cited |
| CGA · EGA · Hercules · VGA cards | card modules + `i8086-cga.js` | selected framebuffer modes and port models |
| PC speaker | `pc-speaker.js` | `audio() → {hz, on}`, the Z80 tier's shape |
| Framebuffer renderer | `i8086-cga.js` | modes 00–06h and 13h, a pure function |
| Corpus harness | `scripts/run-i8086-corpus.mjs` | the instrument below |

## The number, and what it is not

```
Amey textbook corpus, 525 programs, against ITS OWN recorded outputs:
  480  MATCH     byte-identical to an independent implementation
    4  NOINPUT   asked for more keystrokes than the recording supplied
   17  ORACLE    their recorded output is a memory image, not a result
   16  DIFFER    every one read and explained
    8  LOOPING   infinite control loops, by design
    0  THREW     every source assembled and reached the execution harness

yousefkotp emu8086 coursework, 10 projects:  8 LOOPING, 2 THREW (repo defects)
```

**The harness has no "pass" in its vocabulary.** A clean exit that printed
nothing is `SILENT`, not a success. A program still running is `LOOPING` only
if it *did* something, else `HUNG`. An `.asm` with no assembler is counted,
not skipped — a skip reads the same as a pass in a summary line.

**`MATCH` is the strong claim.** The oracle is the corpus's own simulator: it
dispatches on mnemonic strings and never fetches an opcode byte, so it shares
no code with ours. Two unrelated implementations rarely make the same mistake.
It is *not* hardware-grounded, so a disagreement is a lead to chase from both
ends — and 17 cases are classified as oracle limitations, including its own
`$`-terminated print running
away, one dumping the interrupt vector table verbatim, which means its `SEG`
returns 0.

**Comparing fairly took three corrections, all of them mine.** Their oracle
records the *screen*; our stdout is the character *stream*, and the two differ
the moment a program clears the display. A screen is eighty columns and a
stream has no width, so a long line wraps here and not there. And a program
that asked for a key it did not get cannot be expected to agree with a run
that had one — the input is stated in their own test file, so the fix was to
reproduce it rather than invent one.

**What the oracle found that no test did**: two services of ours that reported
success unconditionally (`INT 21h/3Eh` and `/41h`), and `INT 10h/06h` clearing
the screen where it should scroll a window. None failed a test; none threw;
the tally counted all three as successes.

## What an outside pass found

A reviewer who did not build the tier re-ran the oracles rather than reading
the claims. At that checkpoint all four headline numbers reproduced: core 646,000/646,000,
disassembler 646,000/646,000 on text and length with the three documented
exclusions, 237 tests green, and 5.17 M instr/sec against a quoted 4.0 — the
figure above is conservative.

The engine-side findings and the expanded licence tables are in `bw-board`
`ROADMAP.md` §E6. Three of them change what this document promises.

**The headline numbers are maintained by the pinned `bw-board` upstream
grinders, not recomputed by Lite.** Lite byte-verifies that pin and generates
`docs/generated/I8086-CAPABILITY-REPORT.md` from its declarations, shipped
machine inventory and local integration tests. The report states which claims
are upstream vector results and which are Lite-local evidence, so an old run
cannot masquerade as a current green result.

**§6 records the now-completed vendoring decision.** The upstream CI checks out
Microsoft's MIT-licensed MS-DOS 2.0 binaries at an immutable commit and proves
the files exist before the tests run. Its system ladder then builds a 360K
FAT12 disk and follows real execution through the BIOS boot sector, IO.SYS,
SYSINIT relocation, MSDOS.SYS initialization and COMMAND.COM to two `A>`
prompts and a `DIR` read through the emulated block device. The period-utility
lane separately runs unmodified DEBUG.COM, deposits two NOPs, traces one with
the real `t` command, observes IP=0101 and quits; CHKDSK.COM passes its DOS 2.x
version gate and reaches the expected no-root-directory refusal. These are
third-party binaries this tier did not assemble itself, and the named stages
make a failure diagnostic rather than merely saying “DOS did not boot.”

**The pin is now evidence, not just provenance.** Lite release and networked
product builds run `npm run verify:bwboard-ci` before vendoring. For the exact
`bw-board` SHA in `vendor-pins.json`, it requires one successful upstream CI
run whose `test`, `vectors`, `corpus`, and `vectors186` jobs — including their
named inner proof steps — all completed successfully at that same SHA. The
current pin, `8bf9fe5cbcd64ac62462ba02b48f79bca978772c`, was accepted from
upstream run `33913237405`. Missing, partial, stale-SHA, rate-limited, or
unreachable API evidence fails the release; Lite does not duplicate the large
vector and program downloads locally.

**The product seam has its own browser gate.** The production bundle must let
a learner select 8086 ASM, assemble locally with the hosted compiler made
physically unreachable, boot the DOS bench, paint real CGA pixels, exchange a
keyboard byte, and drive/read the 8255 face. A second Playwright receipt records
desktop and phone-sized pump distributions, long tasks and heap use. CI rejects
fewer than 150 useful samples or less than 0.25x XT real time; the distributions
remain artifacts so performance work is based on measurements, not anecdotes.

### Performance pass — measured in the shipped browser route

The first production-bundle receipt showed that raw instruction throughput was
not the browser's problem. Work surrounding each instruction and each UI frame
was. The source pass now consumes each opcode/prefix with one physical fetch,
caches the attached-device advance schedule, avoids a breakpoint `Map` walk
when no code breakpoint exists, and reuses a rendered video frame until video
RAM or a display-control port changes. The runner caps each 8086 callback at
8 ms in at most 1 ms of simulated-time work at once and carries the unpaid
simulated-time debt forward, rather than changing clocks or dropping work.
Progress snapshots are limited to 4 Hz *before* registers, arrays and maps are
copied; pauses, errors, breakpoint hits, phase changes and user commands still
emit immediately. The Circuit React subtree applies the same 250 ms floor.

On the same `pins` example and production Playwright route, desktop improved
from **3.12x to 10.39x XT real time** and mobile from **2.69x to 10.27x**.
Runtime long tasks fell from **90 to 17** on desktop and **91 to 21** on mobile.
The current final receipt also records pump p95 at 0.40 ms for both profiles.
These numbers are a before/after receipt on one runner, not a promise that every
phone is 10x; the durable gate remains the deliberately low 0.25x floor above.
The next receipt measures through snapshot publication and splits every pump
into emulator execution, board advancement and debug/UI publication, including
snapshot build counts and build time. That closes the old instrument's blind
spot: it stopped its stopwatch immediately before `emitLive()`, so it could
count long tasks without attributing the work most likely to create them.
A CI receipt with that blind spot closed attributed about **88%** of pump time
to publication (about 8.5 ms per 4 Hz publish), while snapshot construction
totalled only 0.1–0.2 ms. The default right/off docks therefore no longer copy
progress-only state into `CircuitTab`, where it had no visible consumer but
reconciled the whole `CircuitDesigner`; board changes, halts and halt reasons
remain immediate, and top/solo docks retain their visible periodic status.
React 16 also batches the DebugPanel and CircuitTab consumers into one update.
The follow-up hosted receipt held throughput at **25.82x desktop / 25.89x
mobile**, cut publication from **93.9 to 5.9 ms** total on desktop and **91.1
to 6.4 ms** on mobile (a 93–94% reduction), and cut pump p95 from **6.6 to
0.6 ms** desktop and **6.8 to 0.4 ms** mobile. Execution is now the measured
pump majority; board advancement remains below the receipt's 0.1 ms resolution.

The long-task receipt now makes a second distinction the first instrument did
not: a task is owned by the setup phase in which it **started**, while clipped
overlap time records any work crossing into the first pump. Page bootstrap,
editor readiness, target selection, ASM chunk load, example selection,
assembly/attach (ending only when DebugPanel reports `running`), attached work
while hidden, Circuit first render and steady pump are separate windows;
resource timing names the slowest JavaScript chunks in the same artifact. Thus
an attach task that ends after sample zero is no longer called steady runtime
merely because the old interval-overlap filter saw its tail.

The first profiling receipt from that instrument (Lite Actions run
`33921525472`, artifact `i8086-browser-performance`) sustained **30.34x XT**
on both desktop and mobile, with pump p95 at **0.2 ms**, no steady long tasks,
and no setup task crossing into the steady window. Assembly and attach took
**149 ms desktop / 138 ms mobile** and started no long task. The larger
interactive cost is opening Circuit: **401 / 376 ms**, including three long
tasks and about **124 ms** across 15 `CircuitDesigner` commits in either
viewport. `DebugPanel` accounted for only **20 / 18 ms** before the steady
window. This makes Circuit's initial load/reconciliation the next UI target;
it is no longer defensible to infer that the old long-task count came from the
emulator pump.

The next separately attributable receipt (run `33922826841`, after replacing
the DOS whole-machine `Proxy` with an explicit boundary step and comparing
cycle deadlines directly) kept the paced result at **30.34x XT**. Across the
same 180 useful samples, measured emulator execution fell from **10.0 to 7.5
ms** on desktop and **9.6 to 8.2 ms** on mobile. The profiler still reported
15 `CircuitDesigner` commits, as expected: CPU-loop work and initial React
reconciliation are independent costs.

An explicit React-16 batch around declarative circuit loading was then tested
separately (run `33923725092`). Circuit opening measured **356 / 353 ms**, but
`CircuitDesigner` still made 15 commits in both viewports. That timing change
is not credited as a win: the stable commit count shows that this load path was
already coalesced in practice. The next change instead targets the distinct
post-layout `requestAnimationFrame` fit retry, batching its zoom/pan pair and
retaining identical pan state so an idempotent retry performs no render.

## Performance decision and next roadmap — 2026-09-05

**Keep the proxy-free boundary step and exact cycle deadline together.** They
are complementary implementation choices, not modes a learner should select.
The DOS service layer supplies `adapter.step`, while the debug target reads the
raw machine and stops `runFor()` at the unrounded cycle target. Reintroducing a
whole-machine `Proxy`, millisecond division per instruction, or a UI toggle
between the two would add cost and a second behavior surface without adding
fidelity. This is also **not cycle-accurate execution**: it budgets the current
instruction-atomic core in cycle units. A future BIU/EU/prefetch engine remains
a separate machine capability and, when it exists, is the accuracy/speed
choice exposed to users.

The next work is ordered below. Each task gets its own hosted receipt; do not
combine adjacent CPU-loop changes and then guess which one moved the number.
Heavy builds, browser profiling and repeated timing runs belong in GitHub
Actions, not on the small VPS.

| Order | Roadmap task | Required proof and stop rule |
|---|---|---|
| P1 — evaluated, rejected | **Unobserved `I8086Machine.step()` fast path.** Tested as Lite `89a7e5e91` / bw-board `1738e53`; all upstream vectors and corpus passed, but the hosted receipt showed no distribution-level improvement. Desktop and mobile p50/p95 were unchanged, while total `runMs` increased 6.2→7.0 ms and 6.5→7.3 ms across 182 samples—only about 4.4 µs/sample and below the 0.1 ms timer resolution. The change was reverted rather than retaining unproved complexity. | Reconsider only after P3 supplies repeated, CPU-throttled evidence and instruction observation itself is attributed as material. The original semantic tests remain the acceptance criteria. |
| P2 — evaluated, rejected | **Conditional interrupt arbitration.** Tested as Lite `7c26023d2` / bw-board `151dca6`; all boundary tests and the full upstream matrix passed. The hosted receipt moved aggregate `runMs` to 5.1 ms desktop and 6.2 ms mobile, but p50/p95 were unchanged. Normalized against the accepted baseline that is only about 5.7 µs/sample and 1.3 µs/sample—well below the 0.1 ms timer resolution—so the guard was reverted as unproved. | Reconsider after P3 only if repeated CPU-throttled receipts show the same direction beyond their measured spread. Preserve the NMI, IF/shadow, PIC acknowledge, HLT and simultaneous-boundary test matrix. |
| P3 — complete | **Make performance comparisons statistical.** The CI benchmark requires three fresh-context repetitions for desktop, mobile and an honestly labelled 4× CPU-throttled minimum-device proxy; it retains every raw receipt and reports median, minimum, maximum and range. Resource receipts carry `transferSize`, `encodedBodySize` and `decodedBodySize`, so cached dynamic chunks no longer appear to be zero-sized. Hosted run `33948023807` passed with all nine raw receipts (artifact `i8086-browser-performance`): median speed was 30.36× desktop, 30.37× mobile and 30.35× under 4× throttle; median `runMs` totals were 5.0, 4.9 and 12.9 ms respectively. | The benchmark keeps startup, attach, first render and steady pump as separate windows. A claimed win requires the same direction in both unthrottled viewports and must exceed run-to-run spread; otherwise record it as inconclusive. The 4× profile emulates renderer CPU scarcity, not RAM, core count, network or a named phone. |
| P4 — complete | **Attribute Circuit-open updates before more React surgery.** Hosted run `33951019292` produced all nine v3 receipts and accounted for 14/15 desktop/mobile `CircuitDesigner` commits (13/14 under 4× throttle). The dominant source was `designer:board-ready` at 11 commits in every profile; runner-state marks overlapped 8. Resize/fit accounted for only 1–2 commits. The probe remains benchmark-only and preserves the normal element hierarchy. | One unknown commit remains visible rather than guessed. The receipt named a dominant source and therefore closes the attribution gate; optimization work must follow that evidence. |
| P5 — not activated | **Merge the duplicate canvas size observers.** P4 showed resize/fit owns only 1–2 of the 14–15 Circuit-open commits, while `designer:board-ready` owns 11. Merging the observers now would target a minor source and fails this task's dependency gate. | Reconsider only if a later repeated receipt makes resize/fit material. If activated, retain the original initial-measurement, changed-dimension and auto-fit ordering tests and require fewer commits or long-task time. |
| P6 — complete (hosted runs `33953002119`, `33959505220`, `33962284105`) | **Audit and split startup chunks from evidence, not filenames.** Baseline run `33952110716` measured 11.52 MiB uncompressed eager JavaScript (`2923`: 8.65 MiB; `gui`: 2.88 MiB), led by scratch-vm 4.86 MiB, render fonts 1.31 MiB, asset-library data 0.72 MiB and text-encoding 0.60 MiB. The evidence-backed split moved optional builtin extensions, render fonts, asset manifests, lesson/example catalogs and redundant encoding tables behind demand. Post-split eager JavaScript is 4.73 MiB (`2008`: 2.92 MiB; `gui`: 1.81 MiB), a 59% reduction; the cold DOS journey fell from 16.0 to 10.78 MiB. Follow-through isolated the 1.7 KiB target metadata and debugger faces, then deferred the hidden designer in `right`/`solo`: 1,604,171 encoded broad-circuit bytes previously arrived before the Circuit click; all nine post-change receipts contain zero, with pre-Circuit bytes at 8,122,239 and speed unchanged at 30.34x XT. The dedicated 22.1 KiB `bw-debug-i8086` chunk remains non-initial and clean. | The profiling build alone emits compressed raw stats plus an owner report; the deployable production invocation is unchanged. CI enforces the dedicated chunk boundary, complete asset attribution, zero forbidden modules in the causal DOS window, and zero broad board/designer assets before the Circuit click. File actions, circuit starters, the Circuit tab and `top`/`off` previews retain their load behavior; the intentional designer graph remains reported after the click. The 11 MiB first-load network ratchet and a deliberate missing-extension-chunk gate protect both size and graceful degradation. |
| P7 — not activated (2026-09-05) | **Reassess the deferred engine changes below.** After P6, all nine hosted runs still sustain about 30.34× XT. Desktop/mobile median engine `runMs` totals are 4.7/4.9 ms across roughly 180 pumps; the 4× renderer-throttled median is 13.6 ms. P1 and P2 remained below timer resolution, and P6 removed payload rather than exposing an engine bottleneck. | Peripheral batching, word-memory fast paths, timer-listener caching, workers and JIT remain deferred hypotheses. Reopen only when a real workload crosses its table threshold or repeated profiling assigns material time to that subsystem. |
| P8 — complete (hosted run `33964040918`) | **Remove dead speculative example compatibility work.** Selecting the no-pin i8086 target loaded `sb3-creator.js` only to fill a cache whose last UI consumer had already been removed. The accepted baseline fetched that 734,682-byte asset in all nine runs; the two producer calls, cache and dead lookup are gone while every real retarget/compile/export action retains the lazy compiler door. All nine post-change receipts contain zero `sb3-creator.js`; pre-Circuit and cold-DOS bytes are 7,402,809 and DOS-load bytes are 397,929. | CI rejects the named compiler asset before Circuit opens in this ASM journey. The performance step, corpus, build, smoke test and intervening browser gates passed; the overall workflow remains red on the separately introduced i8254 capability-report mismatch, not this boundary. |
| P9 — complete (hosted runs `33964687451`, `33965722132`) | **Move bundled examples from Code reveal to their no-device Tools control.** The accepted P8 journey fetched `pseudocode-examples.js` in all nine runs: 265,252 encoded bytes for a picker that an i8086 ASM session never opens. Code reveal now loads only CodeMirror; the shared example promise starts when Tools is open with no device, or when restored-game controls actually need source identification. All nine post-change receipts contain zero example or compiler chunks before Circuit and measure 7,148,596 pre-Circuit/cold-DOS bytes, 254,213 below P8 despite intervening main changes; speed remains 30.31–30.35× XT. | The benchmark step passed in `33964687451`. Its gallery gate initially sampled the deliberate loading placeholder as an empty picker; the follow-up now proves zero requests after Code reveal, exactly one request and a populated picker after opening no-chip Tools, and no duplicate after reopening. That corrected browser gate passed in `33965722132`, whose remainder was intentionally cancelled after the required proof to conserve CI. Retry after chunk failure, unmount/stale-request guards, restored game controls and the open-hardware-to-no-device transition remain covered. |
| P10 — complete (hosted run `33966231689`) | **Split unused CodeMirror C, Python and JavaScript grammars.** Pseudocode, BASIC and ASM remain synchronous; C/C++, Python/MicroPython and JavaScript now have named demand-loaded chunks. Only the language compartment is reconfigured, with generation/dispose guards against stale arrivals and a usable plain-text fallback after load failure. Hosted ownership measured the expected 266,069 source bytes in three non-initial assets totalling 236,210 emitted bytes. All nine ASM receipts contain zero optional grammar, bundled-example or compiler assets; pre-Circuit bytes fell from 7,148,596 to 6,899,540 (249,056 bytes) while speed remained 30.32–30.35× XT. | CI enforces all three package owners, at least 250 KiB source and 100 KiB emitted isolation, non-initial ownership and zero optional grammar fetches in the ASM journey. The editor gate successfully demands all three chunks, and rapid-switch/failure tests preserve the existing document state. The performance artifact was secured and the redundant remainder was intentionally cancelled to conserve CI. |
| P11 — complete (baseline `33967333844`, accepted run `33973982315`) | **Install the scratch-paint reducer only when the Costume editor is demanded.** The existing editor component was lazy, but store construction synchronously imported its reducer and therefore put Paper/paint into initial JavaScript. A store-local reducer manager now demand-loads and installs the real reducer through `store.replaceReducer`, yields a task, then demand-loads the editor through a distinct named bridge; shared retryable requests and generation/unmount guards cover failure and rapid tab changes. Hosted ownership measures 1,484,050 source bytes and 850,000 emitted bytes in non-initial paint assets. All nine ASM receipts contain zero paint assets and measure 6,543,080 pre-Circuit bytes, 356,460 below P10, at 30.32–30.35× XT. | The measured eager baseline was 390.5 ms with 50/55 ms tasks. The accepted staged result is 379.7 ms with one 61 ms task, below the 449.075 ms relative, 1 s absolute and 100 ms task limits. The browser proves ordered `paint-reducer.js` then `paint-editor.js`, real Matrix behavior and the full vector/bitmap draw/save/reload round trip. Public `src/index.js` keeps its synchronous `guiReducers.scratchPaint` API; only the deployed playground graph is optimized. |
| P12 — evaluated, rejected (hosted run `33975427592`) | **Import only the `react-virtualized` List entry used by list monitors.** The direct entry correctly reduced initial ownership from 350,770 to 119,874 source bytes and removed unused widget families, but initial/pre-Circuit emitted payload fell only 72,091 bytes (6,543,080 → 6,470,989), below the predeclared 75 KiB stop rule. | Reverted rather than moving the threshold after measurement. The first browser proof also sampled the deliberately collapsed stage; that gate defect was identified, but no retry is warranted for a candidate already below its payload floor. Reconsider only as part of P14's measured full List/Grid deferral. |
| P13 — evaluated, rejected (baseline `33977434631`; candidate `33978075908`; narrow probes `33978936366`, `33980214089`) | **Make SVG sanitation an upload-time capability without making rendering asynchronous.** The working split removed 389,434 initial emitted bytes and 389,414 pre-Circuit bytes, retained 30.34x XT speed, and passed adversarial byte removal, no external request, visible rendering and save/reload. | First upload measured 84.9 ms with no long task against a same-probe eager 65.7 ms baseline: 29.2% slower and above the declared 75.555 ms ceiling. Narrow css-tree parser/generator/walker imports removed MDN data and shrank the lazy asset to 74,324 bytes, but twice blocked the production browser upload action. The complete P13 series was reverted through `d86d9477a`; the rejection was recorded at `2f5ebf31b`. Neither the latency limit nor correctness was relaxed. |
| P14 — evaluated, rejected (baseline `34044706850`; candidate `34045069712`) | **Demand-load the remaining List/Grid closure on the first visible list monitor.** The candidate kept the fixed shell synchronous and used a shared retryable `list-monitor-body` request with stale/unmount guards and same-size loading/error states. | Ownership moved 119,874 List/Grid source bytes to non-initial assets and reduced initial JavaScript 4,520,399 → 4,412,090 (108,309 bytes, above 75 KiB). All behavior gates passed, but first-list activation was 136.9 ms against the 101.8 ms eager baseline: 34.5% slower and above the declared 117.07 ms ceiling, despite no task over 100 ms. Reverted at `31a290564` rather than relaxing the limit. |
| P15a — evaluated, rejected (baseline `34046270772`; candidate `34047017108`) | **Split compact synchronous tutorial metadata from a demand-loaded tutorial deck, Tips and Cards runtime.** The candidate retained the exact 29-entry URL map and synchronous `initTutorialCard`, then isolated 145,612 source / 103,513 emitted bytes in one retryable `tutorial-library` chunk. | Initial JavaScript fell 4,521,229 → 4,425,177 (96,052 bytes, above 75 KiB). Hidden zero-fetch, all 29 decks, `getStarted`/`all`, navigation, dedupe, failed-request retry and stale-close without hidden Redux hydration all passed, with no long tasks or 8086 regression. The five-sample median was nevertheless 190.2 ms versus 151.3 ms eager: 25.7% slower and above the declared 173.995 ms ceiling. Reverted at `3d4bce5d5` rather than relaxing the limit. |
| P15b — not activated (dependency/size gate failed) | **Demand-load the shared asset-library modal UI and its hidden Costume, Backdrop, Sound, Sprite and Extension container bodies.** Exact graph review corrected the earlier estimate: the five movable containers plus route-private tags/icons total only about 31,131 source bytes. The roughly 46 KiB common Library/LibraryItem chain is pinned initial by eager Tips; extension connection metadata is pinned by Blocks, alerts and ConnectionModal. | A five-route chunk cannot plausibly clear the declared 76,800-byte emitted floor. Moving Tips too raises the unminified source ceiling only to roughly 79 KiB, repeats P15a's latency-sensitive tutorial path, and would serialize a new UI fetch ahead of P6's existing `asset-library-index` manifest fetch. No runtime or CI experiment was started. Reconsider only after another change removes the eager Tips consumer or ownership grows materially. |
| P16a — evaluated, rejected (baseline `34049223633`; candidate `34049943831`) | **Precompile the four scratch-parser AJV 6 roots separately.** Version/schema hashes, double-generation determinism and a vendored minimal standalone emitter removed runtime compilation without a new request. Across 534 direct validator and 122 full-parser comparisons, callback arguments, error ordering, results and mutations were exact; normal build, corpus and light-browser jobs were green. | Webpack found four generated validators and zero compiler/schema modules, but their duplicated SB2/SB3 definition closures owned 554,526 source bytes. Initial emitted JavaScript grew 4,543,936 -> 4,573,012, missing the 4,467,136 ceiling by 105,876 bytes. Reverted at `72a01c3f0`; the failed candidate was not deployed. |
| P16b — evaluated, rejected (hosted runs `34050733307`, `34050865216`) | **Emit one shared multi-root validator module.** The emitter learned AJV's index-zero self-reference and safely late-wired real cyclic `$ref` graphs; a synthetic executing cycle guards that design. Ownership also covered hoisted compiler dependencies, while the parity corpus stopped multiplying every large archive across all input representations and bounded failure artifacts. | The predeclared source gate stopped both runs before webpack or browser work. Identity interning cannot merge the structurally repeated functions AJV creates independently for each root, and cycle-safe array references add text: the shared module was 315,452 raw bytes, worse than P16a's 284,144. Reverted at `431d78a76`; no deployment was attempted. |
| P16c — evaluated, stopped at source preflight | **Measure structural equivalence before attempting validator graph deduplication.** The deterministic cycle-aware census found 30 function nodes and 18 exact classes. Representative bodies, schemas, patterns and defaults total 177,151 bytes. | The lower bound is already 13,311 bytes above the 160 KiB ceiling before reference wiring or module overhead. No canonical emitter or candidate build was started. Reconsider only with a different representation and a new measured hypothesis. |
| P17 — complete (valid eager baseline `34055140364`; accepted run `34055549914`) | **Demand-load the whole Sound tab on first selection, with intent prewarming.** One cached retryable `sound-tab.js` now owns 284,924 source / 198,558 emitted bytes across the editor, recorder, waveform/meter UI, `crispfxr-core`, audio helpers and WAV encoder. Initial JavaScript fell 4,543,936 → 4,351,060 bytes, a 192,876-byte reduction. Hover/focus starts the same request just ahead of selection without an idle or first-load fetch; late-loaded audio creates its shared context on first use. | The corrected eager gate waits for the published editing target and eight real Sound controls, not an unrelated panel or fixed delay: 113.6 ms with no long task. The accepted cold activation is 121.6 ms (+7.0%), below the 130.64 ms / 1 s / 100 ms limits, with exactly one 198,558-byte request, matching VM/Redux targets, no loading residue and no page or console errors. Ownership, retry/failure source guards, corpus, unit/build, both browser shards, deploy and post-deploy GUI verification all passed. |
| P18 — next | **Demand-load the Connection modal body only when it opens.** Current initial ownership identifies at least 159,786 source bytes in the modal UI (78,893), DAP.js (38,715), universal-hex (36,008) and micro:bit updater (6,170), before its small container/scanning closure. Keep the updater in the same chunk: importing it from the firmware button could lose WebUSB's transient user activation. Extension metadata and the native Bluetooth shim have other eager consumers and are not claimed. | Attribute one non-initial `connection-modal` asset and stop below 76,800 emitted bytes. Prove zero startup fetch, one scan after open, peripheral list/connect/connecting/connected, unavailable/refresh/cancel/disconnect and firmware result/failure/retry. Abort the chunk once and prove visible load error plus successful retry; delay it, close before resolution, and prove no stale modal or scan; reopen must reuse the module. Compare dispatch-to-usable UI with a corrected eager baseline under 115% / 1 s / 100 ms, while retaining synchronous WebUSB click handling. |
| P19 — evaluated, stopped at attribution | **Keep scratch-storage's fetch worker out of boot until a parallel remote asset batch needs it.** Webpack does place the package's single 280,064-byte prebundled module entirely in the initial shared chunk, but that number includes the required storage API and direct fetch path. | The escaped inline worker, `FetchWorkerTool`, `InlineWorker`, and the entire `ProxyTool` total only 32,773 raw bytes, 44,027 below the 76,800-byte emitted floor. The referenced 22,345-byte fallback file is not emitted by the app, so the suspected second shipped copy does not exist. No candidate was built. |
| P20 — reserve near-miss | **Demand-load `scratch-sb1-converter` only after ordinary parsing rejects an input.** The boundary is clean and protects legacy `.sb`, but current ownership is only about 87,364 source bytes and may compress below the floor. | Run attribution only after P17–P19 or when ownership grows. Stop below 76,800 emitted bytes; if viable, exact SB1 load/error behavior and `addSprite` non-regression are mandatory. |

P6 follow-through isolates the debugger target-picker metadata in
`bw-board/target-kinds.js` and a dedicated `bw-debug-target-kinds` chunk. The
picker no longer imports the full board barrel just to obtain labels, while
the factory and root exports remain source-compatible. The debugger's LEDs,
switches and video surface likewise use a focused `bw-debug-faces` chunk.
The board and full Circuit UI now arrive only after an action which can paint
or otherwise consume the designer, and the receipt reports that post-click
work separately.

The tempting next changes are deliberately deferred. These are activation
rules, so “later” has a measurable meaning:

| Candidate | Decision and activation threshold |
|---|---|
| Cycle-accurate mode | **Deferred as an accuracy mode, not a speed fix.** Start only for a named lesson or period binary that needs bus-visible timing, with an 8088 bus-trace oracle and per-opcode prefetch/BIU schedules available. The existing instruction mode remains the default. |
| Worker execution | **Deferred.** Reconsider if the production gate is below 1.0x on the minimum supported device, or pump p95 exceeds the existing 8 ms wall budget in three repeat runs after source fixes. A worker must preserve synchronous debug, pin, keyboard and breakpoint semantics. |
| Multi-instruction peripheral batching | **Deferred.** Reconsider only if a profile attributes at least 20% of pump CPU to peripheral advancement after the cached schedule, and every timer/IRQ/device deadline supplies a provable safe batch boundary. Never batch across an observable deadline. |
| Word memory fast path | **Deferred.** Reconsider if 16-bit reads/writes account for at least 10% of sampled CPU time. Any fast path must exclude offset `FFFFh`, watched/traced addresses and mapped-device pages, preserving segment wrap and bus visibility. |
| Dirty-region rendering | **Deferred; whole-frame reuse already removes unchanged renders.** Reconsider if changed-frame rasterization exceeds 20% of a profile or makes pump p95 exceed 8 ms. Dirty accounting must cover bulk loads, state restore, all video apertures and display ports. |
| Debugger-only circuit deferral | **Complete.** Run `33959505220` measured 1,604,171 encoded broad-circuit bytes before the Circuit click in every fresh desktop/mobile context, 14.2% of cold-to-runner bytes. Run `33962284105` removed both named broad assets from all nine pre-Circuit windows; the replacement 21,724-byte debugger-face chunk preserves LEDs, switches and video. File actions, starters, the Circuit tab and `top`/`off` previews remain explicit load paths. |
| DOS synthetic-timer listener cache | **Deferred.** The service currently checks whether INT 8/1Ch was hooked on each eligible step. Cache it only if a boot CPU profile attributes at least 10% to `_timerTickDue`; invalidation must cover every IVT write, image/state load and reset, and preserve the immediate first tick when a late hook appears. |
| JIT/dynamic translation | **Deferred last.** Reconsider only after the candidates above if the minimum-device gate remains below 1.0x for three runs. Entry requires differential vector/corpus gates plus invalidation for self-modifying code, breakpoints, traces and 20-bit aliasing; a benchmark win alone is insufficient. |

**The trap flag gap found by the outside pass is closed.** TF is now sampled at
instruction boundaries and covered by behavioural tests; the vector corpus
cannot verify it because none of its initial states set TF. The distinction is
kept in the core header because “modelled” and “vector-verified” are different
claims.

## 1. Why a core of our own rather than an adoption

The permissively-licensed field was surveyed first. Nothing in it drops into
this architecture:

- **x8086NetEmu** (MIT wrapper, VB.NET) is the closest thing to a peer — an
  80186-capable emulator ground against the same TomHarte suite. But its
  harness SKIPS the undocumented opcodes (`0F`, `60`-`6F`, `C0`/`C1`/`C8`/`C9`,
  `F6.7`/`F7.7`) and ignores the shift and mul/div flags, and its own README
  sources its audio from GPL-2.0 fake86 — so it is neither adoptable nor, on
  the axis this tier cares about, ahead.
- **MartyPC** (MIT, Rust) is the most accurate 8088/V20 emulation in existence
  and its author built the hardware validator that generated the tests used
  here — but it is a whole IBM 5150/5160 with an egui front end, not a
  bus-agnostic CPU.
- **PCjs** (MIT, JavaScript) has a real 8088 and a real debugger, in ~700 KB of
  ES5 spread across eight files covering 8088 through 80386 and coupled to its
  own Bus/Memory/Component globals.
- **8086tiny** (MIT) is deliberately obfuscated code golf. **v86** (BSD-2) is a
  686-class PC with a JIT. **YJDoc2/8086-Emulator** (Apache-2.0) and
  **Amey-Thakur's** browser simulator (MIT file, `CC BY 4.0` in every source
  header) both interpret *assembly text*, not machine code — neither ever
  fetches an opcode byte, so neither can run a binary, be wired to a bus, or be
  validated against vectors.
- Everything else worth having is GPL: 86Box, Faux86, Fake86, XTulator, pce,
  DOSBox, PCem, Unicorn.

**AND THAT SENTENCE IS ABOUT ADOPTION, NOT ABOUT ORACLES — a distinction this
document did not draw and which cost us a whole field of ground truth.** GPL
rules out *reading* a codebase to write our own, because the result is a
derivative work. It does not rule out RUNNING one as a black-box differential
oracle: feed both implementations the same program, compare the outputs, never
read the source and never ship it. No derivative work is created by comparing
two programs' behaviour.

`scripts/oracle-v86.mjs` states the rule correctly in its own header — *"v86 is
used ORACLE-ONLY — never shipped, never copied from; its licence would not
matter for testing even if it were GPL"* — and this document did not, so the
GPL list above read as a wall when it is a wall only in one direction.

So **86Box, Faux86, XTulator, DOSBox, PCem and pce are all available as
differential oracles**, under the same arbitration rule oracle-v86.mjs already
sets out: agreement is evidence, disagreement is a question, and the datasheet
arbitrates — never the other emulator.

**That survey asked one question — is anything adoptable as a CORE — and a
second pass on 2026-09-04 asked the other one: what do the finished projects
DO that we cannot.** Three were read end to end (`mfld-fr/emu86`, **MIT**;
`jeffpar/pcjs`, MIT; `dbalsom/XTCE-Blue`, MIT wrapper over Intel microcode).
Six projects were read in the end — the three above plus `morphx666/x8086NetEmu`
(MIT wrapper over GPL-derived audio), `moesay/Elegant86` (GPL-3.0, ~8
instructions) and `MicroCoreLabs/Projects` (**no licence at all**). The gaps,
ordered and costed, are in bw-board `ROADMAP.md` **§E6.8** — nine as
drafted, of which **two were stale within a day** (the CI vector grader and the
bootable DOS image both already existed), corrected in place there rather than
edited out, and six re-verified against `feat/i8086-tier`. The
headline is that on core correctness we lead two of the three — neither emu86
nor PCjs has a vector oracle at all — and the one that beats us, XTCE-Blue,
beats us on the axis §2 declined: cycle-level execution, which the owner has
since asked for as an eventual user-selectable machine mode.

What *was* adoptable is the ground truth: **SingleStepTests/8086** (MIT), 324
opcode files × 2,000 vectors, generated on an Intel P80C86A-2 with ArduinoX86.
That is the same kind of oracle that produced `z80.js` and `w65c02.js`, so the
method carried over unchanged and the core is ours, under BSD-3, with nothing
vendored and nothing to add to `THIRD-PARTY-NOTICES.md`.

The suite is 526 MB and lives out of the tree:

```bash
git clone --depth 1 https://github.com/SingleStepTests/8086 ~/code/8086-vectors
cd ~/code/bw-board && node scripts/grind-i8086.mjs
```

`about-data.js:176` already lists *"SingleStepTests 65x02 + Z80 — MIT — Per-instruction
CPU test vectors"* in the CI-oracle role. That entry becomes **65x02 + Z80 + 8086**
when the tier ships; the role does not change, because none of it is distributed.

## 2. What the core is

`class I8086` with the house contract: `constructor(bus)` taking
`{read, write, in, out}`, `step()` executing one instruction and returning its
cycle cost, and a throw for anything unimplemented so the grinder can score
NOT-YET and never mistake a gap for a pass.

Three things differ from every other core in the tree, and each is a bug
waiting to happen in code that assumes the Z80 shape:

- **Addresses are 20 bits.** The bus sees `(seg << 4) + off` wrapped at 1 MB.
  Every `& 0xffff` in a debug layer written for the Z80 is wrong here.
- **Offsets wrap at 16 bits *inside* the segment.** A word at offset `0xffff`
  takes its high byte from offset `0x0000` of the same segment.
- **There is no single program counter.** CS:IP is the pair. `cpu.pc` is a
  derived flat address for the debugger to anchor on and must never be written
  back.

Cycle counts are the published 8086 timings plus the EA cost. They are **not**
vector-verified and the grinder does not compare them: the suite's cycle arrays
are prefetch-queue-inclusive bus traces from real silicon, which an
instruction-stepped core has no way to reproduce. The Z80 grinder compares
cycles because that suite's counts are instruction-local. This one cannot, and
the module header says so rather than implying a tier the core does not hold.

Also not modeled, deliberately: the prefetch queue and BIU, the 8087 escape
(`D8`-`DF` read their operand and stop), INTR/NMI delivery (the machine layer's
job), and the erratum where an interrupt taken mid-`REP` loses a segment
override — with no interrupt delivery there is nothing for it to happen to.

## 3. What the vectors actually taught

Nine behaviors cost a debugging session each. They are listed here because
every one of them is invisible in the Intel manual, and three of them
contradict it outright.

1. **`PUSH SP` stores SP−2.** The register is read *after* the decrement. The
   286 changed this, and detecting the difference is how period software tells
   the two apart.
2. **DAA and DAS do not follow Intel's published pseudocode.** The manual says
   the high correction applies when the original AL exceeded `0x99`. The
   silicon applies it for `0x9a`–`0x9f` only when **AF was clear** — so `DAA`
   on AL=`0x9a` yields `0xa0` with AF set and `0x00` with AF clear, from the
   same AL and the same low correction. Carry out is then exactly "the high
   correction happened": a borrow out of the low correction does not set it,
   which `DAS` on AL=`0x00`,AF=1 proves (`0xfa`, carry clear). The published
   rule misses 17 of 2,000 DAA vectors and 37 of 2,000 DAS. The fitted rule
   misses none.
3. **A `REP` prefix on `IDIV` negates the quotient.** Not an ignored prefix —
   the sign-correction step runs an extra time. The suite prepends `REP` to a
   share of every string-capable opcode, which is the only reason this is
   visible at all.
4. **`IDIV` range-checks the magnitude,** so a quotient of exactly −128 (byte)
   or −32768 (word) faults where −127 and −32767 do not.
5. **`AAM 0` divides by zero** and, before faulting, leaves the flags of a zero
   result (ZF and PF set) while AX is untouched. `INT 0` then pushes exactly
   that.
6. **`D0`–`D3` reg=6 is `SETMO`/`SETMOC`,** an undocumented instruction that
   sets the operand to all ones — not an alias of `SHL`.
7. **Rotates touch only CF and OF.** SZP and AF survive them. Shifts set SZP.
   OF is defined only for a count of one, and a count of zero changes nothing
   at all, flags included.
8. **Shift counts are not masked.** `SHL AX, CL` with CL=33 really shifts 33
   times. The `& 31` masking is 80186 and later.
9. **The FLAGS word has hard-wired bits**: bit 1 and bits 12–15 always read 1,
   bits 3 and 5 always 0. `PUSHF` hands them straight back out, so a core that
   stores a "clean" flags word fails every vector that touches the stack.

Plus the decode facts the suite's own `metadata.json` confirms: `0x60`–`0x6f`
alias onto `0x70`–`0x7f`; `0xc0`/`0xc1`/`0xc8`/`0xc9` alias onto the returns;
`0x82` aliases `0x80`; `F6`/`F7` reg=1 is `TEST`; `FF` reg=7 is `PUSH`;
`8C`/`8E` use only two bits of the reg field; `0x0f` is `POP CS`; `0xd6` is
`SALC`; `0xf1` decodes as `LOCK`.

## 4. The one place the harness bends, and why

`DIV` and `IDIV` leave their flags undefined, and the suite says so with a
`flags-mask` in `metadata.json` — but an overflowing divide takes `INT 0`, and
`INT` pushes FLAGS **to memory**, where RAM is compared byte-exactly. Comparing
that word exactly would contradict the mask applied to the identical value in a
register a line earlier.

So the grinder applies the same mask to the pushed word, and only when the test
actually took an interrupt (SP down by six) on an opcode that declares
undefined flags. Every other pushed byte is compared exactly. This is the
suite's own undefined-flag contract followed through to where the flags landed,
not a licence to stop checking the stack.

Reproducing those bits for real would mean emulating the divide microcode's
shift-subtract loop, which is MartyPC's territory and worth nothing to a
teaching workbench: a program that reads flags after `DIV` is already broken.

## 5. The road, in three machines

The tier is not one machine and should not be planned as one. Tier A is a
breadboard computer in the shape this engine already builds; Tier B is a
service layer with no hardware in it at all; Tier C is a PC/XT. Each is
independently useful, and only Tier C is expensive. The engine-side items live
in `bw-board/ROADMAP.md` §E6; this is the product view.

**Measured before promising anything.** The original Node representative mix
(register ALU, memory read/write, taken branch, call/ret) ran at 4.0 M
instructions/sec and the outside repeat reached 5.17 M. The production browser
has now been measured too; its end-to-end result and gate are recorded in the
performance pass above rather than inferred from Node throughput.

**8088 comes free.** The ISA is identical. The differences — bus width, a
four-byte prefetch queue instead of six, cycle timings — are precisely the
things an instruction-stepped core does not model, so `I8086` *is* an 8088
except for cycle counts. `SingleStepTests/8088` (with bus data) and `/v20`
are also MIT. The V20 suite now verifies the shared 80186 additions; the 8088
bus data remains the required oracle for any future cycle-accurate mode.

### Tier A — the 8086 on a breadboard  *(DONE)*

The direct analogue of the Eater 6502 and the Searle Z80, chip for chip. This
is where an LED blinks from an 8255 port, where the MCU examples adapt, and
where the references point: slador.uk's machine is 8088 + 8284 + 8254 + 8255
+ 8259 + 74244 + 74138 + flash + text LCD, and the Proteus tutorials are its
first lesson.

**M3 — the machine.** `i8255.js` (ports A/B/C, control word, mode 0, and the
BSR bit-set/reset path; modes 1 and 2 a stated non-goal until a lesson needs
them), `i8086-machine.js` in the `m6502-machine.js` shape with the address
space widened to twenty bits and a *second* decode space for I/O ports, and
`i8086-adapter.js` on the boundary-A pin bus.

**M4 — the debug target.** `i8086-debug.js` mirroring `z80-debug.js`.
Decisions already forced by the architecture: `regs()` returns the segment
registers alongside a derived flat `pc`; **code breakpoints compare on the
linear address**, because two `seg:off` pairs can name one instruction and
only the linear form cannot be fooled; write watchpoints wrap `cpu.write` as
the Z80 target does with the mask widened to `0xfffff`; step-over needs its
own call-class test (`E8`, `9A`, `CD`, `CC`, and `FF` reg 2/3).

**M5 — interrupts and time.** `i8259.js` and `i8254.js`, plus INTR/NMI
delivery in the machine layer with the IF check and the one-instruction
inhibition after a segment-register load. The core deliberately does not
deliver interrupts itself.

**M6 — the wired machine.** `i8086-extract.js` and the extractor SELECT
entries, so an 8086 hand-wired on the drawn breadboard becomes a machine — or
a named refusal — exactly as the 6502 does. Plus our own monitor ROM.

### Tier B — the DOS-program tier  *(DONE: all 525 assemble and run in the harness)*

The 8086 textbook corpus does not want a PC. Measured across the 525 programs
of `Amey-Thakur/8086-ASSEMBLY-LANGUAGE-PROGRAMS`:

```
int 21h  3109   of which AH=02h 1347, AH=09h 1064, AH=4Ch 451
                → 2862 of 3109 in three services
int 10h    79   int 16h 26   int 1Ah 10   int 15h 8   int 33h 6
502 of 525 files use .MODEL / PROC / MACRO
```

So the DOS/BIOS service layer is a few hundred lines and covers roughly 92% of
the corpus with three functions, and no BIOS ROM or DOS is involved at all.
The assembler was the gate: these are MASM sources and 502 use `.MODEL`,
`PROC` or `MACRO`. That surface is now sufficient for all 525 to assemble;
the exact output distribution at the top, not mere termination, is pinned by
the upstream corpus job.

### Tier B′ — emu8086 compatibility  *(DONE: 8 of 10 run)*

`yousefkotp/8086-Assembly-Projects` is not DOS software. It is emu8086:
`#start=Traffic_Lights.exe#`, `out 4, ax` to a built-in traffic-light device,
`int 15h`/`AH=86h` delays, `include 'emu8086.inc'`. Running it means
emulating emu8086's virtual peripherals and **re-implementing** its macro
library — the `.inc` carries no licence we can rely on. This is the tier that
makes traffic-light, stepper and thermometer lessons possible, and it lands
after Tier B.

### Tier C — PC/XT compatible  *(DONE at the documented accuracy boundary)*

The **visible half landed early and cheaply**, because it turned out not to
need the machine at all: `i8086-cga.js` renders modes 00-06h and 13h as a
*pure function* of a read callback, so a program that writes `B800:0000` or
`A000:0000` directly is already visible. INT 10h pixel services and `INT 13h`
disk services are in, and `loadBoot()` runs a 512-byte boot sector at
`0000:7C00` with the AA55h signature checked — **a boot sector needs neither
DOS nor an assembler**, so that corpus was runnable before the assembler
existed.

**The display and sound are now done too, and they cost far less than
expected.** Three port cards — CGA, Hercules and VGA — hold raw latches and no
pixels; the renderer stays a pure function; and the debug target is the only
file that knows both vocabularies. Retrace on `3DAh` is derived from machine
time, which is what unhangs a game polling for it. The PC speaker reports
`{hz, on}`, the same shape the Z80 tier already answers with, so a UI needs no
new concept for a second CPU family.

Two refusals in there are deliberate and worth keeping: VGA planar modes
`0Dh`–`12h` and Hercules are **refused by name** rather than drawn. Hercules
lives at `B0000h` and the renderer reads `B8000h` — drawing it anyway would
not make a worse picture, it would make a picture of something else.

Storage and the software stack subsequently landed: 8237 DMA, a µPD765 FDC,
disk images, the project BIOS and the staged MS-DOS 2.0 boot described above.
“Done” here means the useful instruction-stepped PC/XT surface; it does not
promote the explicit scanline, magnetic-media or bus-cycle limits in the
generated capability report into cycle accuracy.

### Not in this lane at all

`jonasb.at/blog/breadboard-chip-8` has **no CPU**. It is 74LS181 ALUs, 74HC377
registers and microcode in flash with an FPGA GPU — a discrete-logic machine,
closer to the SAP-1 lane than to this one. Worth building someday; not here.

### Licence rulings (verified 2026-09-03)

| Source | Licence | Ruling |
| --- | --- | --- |
| SingleStepTests 8086 / 8088 / v20 | MIT | Oracle only, never shipped — the role `about-data.js` already records for the 65x02 and Z80 suites. |
| `microsoft/MS-DOS` 1.25, 2.0, 4.0 | MIT | Used by the upstream real-ROM and DOS acceptance suite. |
| Amey-Thakur `.asm` corpus | MIT, per file header | Shippable as examples **with attribution**. Note that the same repo's *simulator* sources say `CC BY 4.0` in every header while its LICENSE says MIT — take the programs, not the simulator. |
| GLaBIOS | GPL-3.0 | Refused. The best open BIOS is out of reach. |
| `skiselev/8088_bios` | GPL-3.0 | Refused. |
| `GREENSHELLRAGE/8086-breadboard-computer` | **no LICENSE file** | All rights reserved. The architecture may inspire — that is not copyrightable — but its ROM binaries and `.asm` may not be copied. |
| `emu8086.inc` | unclear | Refused. Re-implement the macros. |
| MartyPC, PCjs | MIT | Readable as reference implementations. Reading an MIT implementation ships no third-party code. |

The consequence is worth stating plainly: **every ROM in this tier is ours**,
at every tier. That is a real cost, and it is also the only reason the tier
can ship inside a BSD-3 bundle at all.

## 6. How the core is vendored into Lite

`i8086.js` lives in `bw-board`, beside `z80.js` and `w65c02.js`, and
`npm run sync:bwboard` pins and copies it into Lite's overlay with the machine,
adapter, debugger and peripheral modules that consume it. `vendor-pins.json`
records the exact upstream commit. The generated capability report reads that
pin and the shipped modules rather than repeating an uncheckable vendoring
status here.

## 7. M2, and the standard the suite made possible

The suite ships a **disassembly string** with every vector — `name`, beside
`bytes`. That is a text oracle, and it is a stronger standard than either of
the other two disassemblers in this tree is held to: `z80-disasm` and
`w65c02-disasm` have their lengths ground against vector pc-deltas and their
*formats spot-checked by hand*. `grind-i8086-disasm.mjs` checks both halves
against all 646,000, and it passes.

Matching a real disassembler rather than inventing a house style forced five
rules that each look like a bug:

- A memory operand **always** names its segment, override or not, and always
  carries `byte`/`word`/`dword` — except `lea`, which carries none, and
  `les`/`lds`, which say `dword` where `callf`/`jmpf` say `word`.
- A segment override is spelled out as a bare prefix word (`cs movsb`) **only**
  for the string primitives, whose operands are implicit. Elsewhere it lives in
  the brackets, and where there is no memory operand it is not shown at all,
  because it did nothing.
- A displacement is printed because **mod says one was encoded**, not because
  it is non-zero: `[ss:bp+si+0h]` is correct and `[ss:bp+si]` is not.
- Jump targets zero-pad to four digits and far pointers pad both halves;
  immediates pad to nothing. `jle 002Bh` and `mov bl, 2h` in one syntax.
- `rep` on `movs`/`stos`/`lods` is spelled `rep`; on `cmps`/`scas`, which read
  the zero flag, it is `repe`/`repne`. And `D2`/`D3` reg=6 is `setmoc`, not
  `setmo`: the CL-counted form is conditional and named for it.

**Two things the vectors caught that no hand-written test would have.**

*Instruction fetch wraps at the segment boundary, not the linear one.* One
vector in 646,000 starts at IP `FFFCh` and takes its fifth byte from offset
`0000h` of the same segment. Reading straight on through the linear address
disassembles a different instruction. The module now takes the real IP and
fetches through `base + ((ip + i) & 0xffff)`.

*What a relative target is measured from is a rendering choice, not a decoding
one.* The suite's disassembler measures from the instruction's own start (IP
treated as zero); a debugger pane wants the address in the segment. The module
does the useful thing by default and takes `targetBase: 0` for the suite's
convention, rather than baking a test convention into the product.

### 4b. Three vectors where the suite is wrong

`80.6 #1311`, `81.2 #1261` and `B7 #658` each sit at IP `FFFEh` or `FFFFh`,
and each one's `name` contradicts its own `bytes` — the name was rendered from
a byte that was never fetched. The `bytes` array is the capture, and the
register and memory results agree with it, so disassembling the bytes is right
and matching the name would be wrong.

They are excluded by `test_hash`, with the reason written beside each, and the
grinder still requires the right **bytes** for all three — only the text is
excused. If a regenerated suite ever agrees, the run prints `HEALED` and the
table should lose a row: an excuse that has stopped being true is worse than
no excuse.

## 8. What this tier taught, that the next one will need

Three things cost more than once, so they are written down rather than
rediscovered.

**A handler that takes CS:IP must not IRET — and this bit three times.** The
generic interrupt return restores what the INT pushed, which silently undoes
whatever the handler just set. It wiped the carry a DOS error had set and the
zero flag `INT 16h/01h` answers with (so every `jc` after an open and every
`jz` after a keyboard poll read the flags from *before* the call); it would
have dropped a rebooting machine straight back into the program that asked to
be restarted. Services now blend the status bits over the stacked flags, and a
handler can declare it owns the transfer.

**A trap needs somewhere to stand.** The first design put the interrupt
vectors at an *unmapped* segment and intercepted before the CPU could fetch.
That works for software INTs, where the service layer looks between
instructions — and cannot work once hardware interrupts exist, because the
machine delivers a pending IRQ and executes the next instruction in the same
`step()`. There is no "between". The fix is a mapped page holding `jmp $` in
every slot: the CPU may execute at a trap as often as it likes and IP does not
move, so servicing is idempotent regardless of ordering. That is a property,
not a patch.

**Two independent implementations beat one shared one.** The pixel layout is
written twice — once in the service layer, once in the renderer — and
cross-checked by a test that plots through one and renders with the other,
requiring the pixel where it was put *and its neighbour untouched*. Sharing
the code would have been less work and would have caught nothing.

And one about instruments rather than code: **three of the bugs found here
were found by the refusal histogram, not by a test.** A silently mis-encoded
`INT 21h` still printed plausible output and was already counted as a success;
what exposed it was `int 02h` appearing in a list of things asked for and not
granted. Keep the list.

The matching correction: the first diagnosis of that bug — mine — was wrong.
I disassembled the *running machine* and read a byte the program had
overwritten as a byte the assembler had emitted. The image on disk was
correct; the program was scribbling on its own code through a segment alias.
Both look identical through a debugger and only one is an assembler bug.

---

## State at the end of 2026-09-04

**The tier is consolidated on three remotes**: bw-parts `main`, bw-board
`master`, bw-circuit-ui `master`. Four sessions worked it; the merges were
textually clean and the semantic problems were all found by checks rather than
by reading.

### The core and the engine

Instruction set exact against SingleStepTests (8086 and V20/80186 variants).
The **cycle model** reached 95.6% on all 323 opcodes — with the caveat stated
in the same breath, because a score without its split is not a claim:
leave-one-out **by vector** is 95.6%, leave-one-out **by opcode** is 34.2%. Per-
opcode calibration is genuinely required; what collapsed was the cost, not the
requirement. Division is recorded as **searched-and-refused** — ten candidate
features, none beating ~60%, because the microcode loops on the quotient as it
is computed and there is no closed form. Named so nobody repeats the search.

`_advanceChips` was **89.2% of `machine.step()`**, nearly all of it a
per-instruction `Object.keys()` allocation; fixed in all three machines for a
4.5× / 3.4× / 1.12× win. The spread is the interesting part: the gain scales
with chip count and inversely with per-chip cost, so the 6502's modest 1.12× is
evidence the model is right rather than a disappointment.

The **8254 had no crystal of its own** and was being clocked at the CPU rate, so
the "18.2 Hz BIOS tick" ticked at 76.3 Hz. Found from the outside — a scheduler
whose waits came out 4.19× short — and fixed with the `advanceMs` pattern the
OPL and the AY already used.

### What a learner can do

Write pseudocode, choose `i8086`, and press play. The language reaches pins,
whole ports, a keypad, an ADC, the speaker, PWM, an eight-digit display, and
**every event hat** — multiple scripts, pin edges, broadcasts and keystrokes —
on a preemptive scheduler that adds its own interrupt controller and says so.
Four examples ship and are offered in the picker. See ROADMAP §3.8.

They can also draw the board: Lite now carries the 8086/8088 and Intel support-
chip part data and registers the matching DIP surfaces. The remaining limits
are emulator-accuracy boundaries, collected mechanically in the generated
capability report, rather than a missing editor surface.

### The lesson that cost the most

`bw-board` master went red on a test that read fixtures from a **git worktree on
one machine**. It passed here, it passed for the reviewer, and it could never
have passed in CI — the review that was meant to catch it was itself the
instance. See `GATES-THAT-CANNOT-FAIL.md`, section 2026-09-04, and the
mechanical answer: `scripts/audit-clean-checkout.mjs`, which **reproduces**
(`git archive HEAD` into a temp dir) rather than **detects**.

The first attempt at that tool was a detector, and it reported zero findings
against the file it was written to catch.
