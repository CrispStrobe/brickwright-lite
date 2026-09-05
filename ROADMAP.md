# brickwright-lite — roadmap

Everything known to be pending, in one place, with the measurements that were expensive to
obtain. Two rules for this file:

- **Each entry carries its evidence.** Numbers, not impressions. An item that says "feels cramped"
  costs its next reader a day; one that says "the rail pins the editor's min-content at 776px"
  costs them nothing.
- **Cross-reference, do not copy.** `BLOCKED.md` is bw-bundle's own log and stays authoritative
  for its items; the long-horizon hardware tracks live in `CLAUDE.md`. This file points at both.

Ownership: **owner** is the human. Named agents (**bw-bundle**, **bw-board**, **bw-cui2** …) were
long-lived VPS sessions that owned CI guards, bundle budget, vendoring, extension conformance and
deploy verification.

**Fleet status, measured 2026-08-22: nine of twelve of those sessions are gone** — `Killed` by the
VPS OOM killer, their `exec bash` guard leaving a shell where the agent was. Only `mbit-fw`
(holding), `ucsim-stc` (idle) and `embed-lang` survive. **Treat every agent name in this file as
an unowned label, not a live owner.** A revived session is a fresh context that knows only what is
written down — which is the whole reason this file and `PLAN.md` must stay true. Do not assume any
item marked with an agent name is being worked on.

---

## 1. Costume designer & GUI layout

### 1.1 Collapsed stage column is a clipped stage, not a strip — RESOLVED (`pane-strip.jsx`)
Collapsing showed 28px of live stage: a fragment of the green flag, a sliced sprite, two orphaned
letters from the sprite panel — the same thing reported as "broken/nonsensical" about the old `xs`
step of the cycling button. The divider changed how that state was reached, not what it looked
like.

`pane-strip.jsx` now covers the collapsed column with a labelled, clickable strip. It covers
rather than replaces: `StageWrapper` stays mounted underneath, because unmounting it would take
scratch-render's canvas with it and make restoring a remount. Verified by probe — the canvas
backing store stays 480px wide throughout, and clicking the strip restores 28px → 725px.

Retired `pane-column.jsx` from the ratchet in the same commit (§4).

### 1.2 Properties rail reserves width globally — NOT REPRODUCIBLE (measured 2026-08-28)
Measured before touching anything, which is the only reason the CSS was not rewritten for nothing.
`npm run probe:layout -- --report`, editor column `min-content`:

| when | min-content |
| --- | --- |
| blocks tab, before the costume tab is ever opened | 250px |
| costume tab, rail **closed** | 776px |
| costume tab, rail **open** | 776px |
| back on the blocks tab | 250px |

Both halves of the original claim are wrong. **The rail costs nothing** — 776px is identical open
and shut, so it is what the paint editor's own controls need, not what the rail reserves. And the
floor **does not persist**: an unselected tab panel is `display: none` (`gui.css` `.tab-panel`),
and a `display: none` subtree contributes no min-content at all. `forceRenderTabPanel` keeps panels
MOUNTED, which is not the same as keeping them LAID OUT — that conflation is where the claim came
from.

So the proposed fixes (overlay the rail, or move sections into a flyout) would have solved nothing.
`.rail` is already `position: absolute`; only `.rail-spacer` is in flow, and it is inside the paint
editor's own 776px either way.

Nothing to do. The numbers are printed by `--report` rather than asserted, because 776px is a
property of today's paint toolbar and a threshold would just freeze it.

### 1.3 Grey band at the robot's feet — RESOLVED (155fc7f + 333fae8)
Was not a viewport bug: paper's view measured 521x606 against a 521x606 element at dpr 1, an exact
match. The two costume SVGs were replaced in place by branding, keeping the cat's rotation centres
(48,50)/(46,53) on 220x260 robot artwork centred at (110,131.5). The art board is positioned on
the rotation centre, so it slid up until its bottom edge crossed the canvas. Same cause also made
`turn 15 degrees` swing the robot around its shoulder and put a sprite at x:0 y:0 off centre.
Guarded by `test/default-costume-centre.test.mjs`.

### 1.4 Draggable pane divider — RESOLVED (77e6789)
Replaced the cycling debug button. A named size is a share that grows into free space; a dragged
size is a number 0..1 rendered with `flex-grow: 0`, because a share also takes a cut of the free
space and the first version moved the boundary 90px for a 220px drag. Double-click is detected
from pointerdown timestamps: the `preventDefault` that stops a drag selecting text also suppresses
`dblclick`, which never fired once in Firefox.

### 1.5 Stage-size buttons now fit the column to the stage — RESOLVED (`FIT` in pane-sizes.js)
The buttons used to step the column between the `s` and `m` shares, which was an estimate of how
much room a stage of that size wants and a poor one. Measured at 1600px: a small stage needs a
258px column and got 630px; a large stage needs 498px and got 725px. "Switch to small stage" is a
request for editor room, and it was handing over 95px of the 372px available.

The column is now `flex-basis: min-content` (the `FIT` size), so it is exactly as wide as the
stage and sprite pane need. `min-content` rather than a pixel table because the stage is 480px
scaled by 1, 0.85 or 0.5, and a table would need keeping in sync with all three. Editor at small
stage: 866px → **1333px**.

Note: restoring from the collapsed strip still goes to the `m` share (725px), not `FIT`. That is
the documented default rather than an oversight, but a one-word change if the snug width is wanted
there too.

---

## 2. Deploy and CI

### 2.0 Vercel deploys manually and nightly — LANDED 2026-08-28, know the rule

Vercel's Git integration is disabled for this repository
(`vercel.json`: `git.deploymentEnabled: false`). A push, pull request, tag, or
commit-message marker therefore does **not** create a Vercel deployment.

`.github/workflows/deploy-daily.yml` is the only deployment path. It runs:

- manually through `workflow_dispatch`; and
- nightly at **02:00 Europe/Berlin**, always checking out the current `main`.

The workflow performs `vercel pull`, `vercel build --prod`, and a prebuilt
production deploy. It is serialized so a manual run and the nightly run cannot
publish over one another. The obsolete `scripts/vercel-ignore.sh` checkpoint
filter was deleted when this policy landed.

**CI still runs on every push.** Vercel does not. A PR badge therefore reports
the build and vendor gates without consuming the account-wide deployment quota.
If the public Vercel site is stale, inspect the scheduled/manual deployment
workflow rather than looking for a missing per-push deployment.

### 2.1 Deploy starvation with two agents pushing — FIXED 2026-08-30, proven elsewhere first

**The measurement, so nobody re-derives it.** 200 most recent `build.yml` runs on `main`
(2026-08-24T23:17Z .. 2026-08-30T05:47Z): 101 success, 26 failure, **72 cancelled (36 %)**. Each
cancelled run asked for its jobs:

```
62   ZERO JOBS      cancelled while queued. No runner, no verdict, no minutes.
 4   build:success  a green tree whose deploy was cancelled.
 6   build:cancelled after starting.
```

**62 verdicts thrown away in six days.** `concurrency: pages-${{ github.ref }}` is one group for
all of `main`, and GitHub holds exactly one pending entry per group: a third push cancels the
second while it is still queued. Serializing PUBLICATION was always required. Serializing
VALIDATION never was, and that is the whole of this bug.

**The fix, three changes.** Pushes are grouped per **commit** (`github.sha`) and PRs per PR number,
so no push is cancelled while queued. The **deploy job** carries the one shared group that is left
(`pages-deploy`, `cancel-in-progress: false`). And the deploy **refuses to publish a tree older
than the published one** — ordering by queue release is not ordering by commit, which is what
"arriving out of order" was.

**Known cost, so it is not rediscovered as a bug.** A deploy superseded while pending is cancelled,
which marks its RUN `cancelled` even though its build passed. That is the intended outcome and it
is mechanically distinguishable from starvation: starvation has **zero jobs**, this has
`build: success`. `verify-gui` is now gated on whether the run actually published — it smoke-tests
the LIVE site, and a run that stood down would otherwise report somebody else's tree as its own
verdict.

**The mismatched-tree hazard, and the mechanism that excludes it.** The previous attempt was a
per-**job** split. Artifact names are unique within a RUN, not across runs: two jobs of one run
writing `github-pages`, or a deploy job resolving that name while a sibling was still uploading,
publishes an index.html from one tree beside chunks from another. Separate RUNS cannot do this to
each other — each run's artifact is scoped to its own `GITHUB_RUN_ID` and `deploy-pages` resolves
it there. So the invariant is **build and upload stay in one job, and the deploy takes the artifact
from its own run and never fetches one by name**; running builds in parallel does not touch it.
That invariant is now a test (`test/pages-deploy-ordering.test.mjs`, nine mutations proven to
redden it) rather than a comment, per the working rule about beliefs that decay.

**Proven in `CrispStrobe/bw-pages-concurrency-proof` first**, per this item's own instruction, and
the proof earned its keep twice. Full transcript in that repo's `RESULTS.md`.

- Baseline burst of 5 pushes: **2 verdicts**, three runs with zero jobs (33295713813, 33295717265,
  33295720367). The item reproduced in isolation.
- Candidate burst of 5: **5 build verdicts, 0 starved** (33295873557, 33295875547, 33295877641,
  33295881123, 33295882892).
- **The first guard was wrong and moved the live site BACKWARDS.** Run 33295873557 attempt 2
  printed `published=654edac ours=654edac` and republished a superseded tree with a green check.
  Cause: declaring `environment: github-pages` makes GitHub create that environment's deployment
  record when the JOB STARTS, before any step runs — so a guard reading the newest deployment reads
  *itself*. Fixed by filtering every occurrence of our own sha out of the list.
- Second defect (run 33296240426): `gh api --jq` takes one argument and no `--arg` ("accepts 1
  arg(s), received 4"). The step failed and the deploy was skipped rather than run unguarded — the
  guard is **fail-closed**, which is the right direction.
- Fixed candidate, burst of 5 (33296399703, 33296406582, 33296408593, 33296413340, 33296416120):
  **5/5 build verdicts**; deployment records strictly increasing by commit; the site transcript
  moved forward only and the chunk `index.html` named was 200 at every sample.
- The guard proven **positively**: re-running 33296399703 (the burst's oldest commit) while a newer
  one was live logged `compare ours...published = ahead`, skipped `deploy-pages`, concluded
  **success**, and left the site where it was.

Both guard defects would have been live-site incidents here. Neither cost anything there.

**Sample size on lite itself, so the claim is not overstated.** Run 33296829625 (`4643c623e`) is
the only post-change build at the time of writing: `build: success`, `deploy: success`, guard
logged `published=03d20c74 ours=4643c623 / compare = behind` and published, `verify-gui: success`.
Every push since has been a `LANES.md` row, which `paths-ignore` skips by design. The behavioural
evidence is the scratch repo's controlled bursts; lite's own is one green end-to-end pass.

**Fixed 2026-08-30, after measuring rather than assuming: `vendor-freshness.yml` had the same group shape**
(`vendor-${{ github.event_name }}-${{ github.ref }}`) and `build.yml`'s own comment names it as
collateral of this queue. Measured 2026-08-30 over its 100 most recent `main` runs: 83 success,
3 failure, **13 cancelled** — but only **1 of the 13 had zero jobs**. The other twelve had a job
created before being cancelled. The classification used the jobs API rather than treating job
presence as execution: all twelve had `runner_name: ""`, an empty `steps` array, and start times
equal to job creation. They were job records that never acquired a runner; zero jobs actually
started and were then cancelled. Eleven predate the concurrency block introduced at `eb2c821b`,
so the API evidence does NOT attribute their cancellation cause. The one later zero-job case is
conclusive for the current group: `33277887086` queued behind running `33277776474`, successor
`33277959378` arrived at 22:11:31, and the pending run was cancelled at 22:11:32. GitHub permits at
most one pending member of a concurrency group even when `cancel-in-progress` is false. The fix
therefore groups only superseded PR commits together and keys push, scheduled, and manual runs by
unique `github.run_id`; the latter can no longer replace one another while waiting.
`test/vendor-freshness-concurrency.test.mjs` pins all three event classes and the PR-only
cancellation rule.

**Residual, stated rather than discovered later.** The guard treats a deployment RECORD as
published, and a record exists for a deploy job that started and was then cancelled. The site can
therefore sit one commit behind if the newest deploy job's `deploy-pages` step itself FAILS after
an older run has already stood down for it. It cannot happen through cancellation — a job is only
cancelled when a newer one enters the group, and the newest always deploys — and the next push or
`deploy-daily` corrects it.

### 2.2 Service-worker failure-mode tests — BUILT 2026-08-30 (`scripts/verify-service-worker.mjs`)
Four scenarios in a real Chromium, against `overlay/scratch-gui/sw.js` read off disk and served
verbatim, wired into `build.yml` after the Playwright install. **17.4 s** for the four scenarios,
**47.4 s** including the mutation half. It serves its own four-line origin rather than the built
app: no scenario here is about scratch-gui, and the fixture can do what the real build cannot be
made to do on demand — delete a chunk mid-session, hang a socket, seed a poisoned cache. It needs
no webpack build, so it runs whether or not the app builds.

| scenario | what it does | the mutation that must redden it |
|---|---|---|
| `chunk-404-after-deploy` | warm the cache, change the hash index.html names, 404 the old chunk, reload | documents served cache-first → boots the deleted build |
| `document-timeout` | the server stops answering the document — no response, no failure | drop the bound → `page.reload` never returns |
| `stale-caches-vs-fresh-chunks` | seed a `brickwright-v1` cache **and** a poisoned entry in the current one | `activate` keeps old caches; documents cache-first |
| `cached-failure-is-not-served` | put a 404 into the current cache for a hashed URL the server answers 200 | the SWR branch tests `cached` instead of `cached.ok` |

Two of those five mutations are not hypothetical — **they are the code as it shipped**, and both
were live instances of the class:

- **Network-first documents had no bound.** `try/catch` around `fetch` handles a network that
  FAILS. A captive portal, a dropped route or a half-open socket neither answers nor rejects, so
  the catch never runs and the document request hangs — on a page the browser is holding a good
  copy of, in an app whose whole reason for shipping a worker is the offline case. Fixed with
  `raceWithCache` (3 s, network left running so the cache still refreshes; a false trip costs one
  stale first paint, never a missed deploy). Reverting it makes `document-timeout` hit its 20 s
  navigation bound.
- **The `.ok` guard was on one of the two paths out of the cache.** The cache-first branch refused
  to serve a non-ok hashed hit and then fell through to stale-while-revalidate, which returned the
  same entry because a 404 is still a hit. Measured 2026-08-30: a 404 seeded into `brickwright-v4`
  for a hashed chunk was served with the server answering that URL 200. One word (`cached` →
  `cached.ok`); the mutation restores it and the scenario reports `status 404`.

No cache rename was needed for either — both fixes route around a bad entry rather than trusting
it, so an already-poisoned browser recovers on its next load. `CACHE` stays `brickwright-v4`.

The original note still holds and is now asserted rather than remembered: `respondWith` rejects if
its promise resolves to `undefined` (the white screen, 9886889), and renaming the cache is the
only recovery for a worker that trusts something it should not — which is why the `activate` purge
has its own mutation.

**The gate proves itself on every run.** A mutation whose edit matches nothing is a failure, not a
skip: a pattern that silently misses is exactly how a vacuous test looks verified.

### 2.3 playwright must not reach package-lock.json — RESOLVED (c1692f0), but standing hazard
`package-lock.json` is tracked now. `npm i -D playwright --no-save` spares `package.json` and
rewrites the lock anyway, and a concurrent `git add -A` committed playwright as a root dependency
the root `package.json` does not declare. Run `git checkout package-lock.json` after installing;
`scripts/probe-layout.mjs` says so in its header.

---

### 2.4 First-load payload — LANDED 2026-09-05, and it has a ratchet

The two scripts `index.html` loads before anything renders were **4,238 KB gzipped**
(live site, 2026-09-05: `2923.<hash>.js` 3,472 KB + `gui.<hash>.js` 766 KB). Attributed
module by module, over half of the vendor chunk was three things no first paint uses:

| in the boot chunk | compressed | why it was there |
|---|---|---|
| music extension: 61 sound samples, base64 in JS | 1,455 KB | `builtinExtensions.music` was a synchronous `require` |
| scratch-render-fonts: seven faces, base64 | 644 KB | `scratch-svg-renderer/src/font-inliner.js` requires it at module load |
| `text-encoding` polyfill (encoding-indexes) | 201 KB | three guarded `require('text-encoding')`s, all behind `typeof TextDecoder === 'undefined'` |
| LEGO / EV3 / SPIKE / NXT hub drivers, 15 modules | ~400 KB | same synchronous registry |
| in `gui.js`: sprite/costume/backdrop/sound manifests | 146 KB | `lib/offline-assets.js` imported them, and the menu bar imports that module for `isNativeApp` |
| in `gui.js`: seven lesson-wave catalogs + the panel | 74 KB | `guided-lessons.jsx` was a static import, rendered only when open |
| in `gui.js`: pseudocode example sources | 51 KB | the Code tab's picker |

**What moved, and where the seam is:**

- `overlay/scratch-vm/src/extension-support/extension-manager.js`: the registry is now
  two maps. `builtinExtensions` (synchronous: pen, makeymakey, and every Brickwright hardware
  extension the lessons reach for first) and `lazyBuiltinExtensions` (one `import()` per
  extension, each its own chunk). `loadExtensionURL` — the promise the extension library and
  the project loader already await — resolves lazy ids through `_loadLazyBuiltinExtension`,
  which dedups concurrent loads. `loadExtensionIdSync` on a lazy id warns and loads async;
  nothing calls it that way (`CORE_EXTENSIONS` is empty).
  `deserializeProject`'s pre-load of the sb3's declared extensions (the `deserPatch` in
  `scripts/apply-vm-overlay.mjs`) is now AWAITED before the `extensionURLs` strip runs: with
  fire-and-forget, a lazy builtin declared with its gallery URL was still "not loaded" when the
  strip looked, and `installTargets` fetched it a second time from the URL into a sandboxed
  worker. bw-ci flagged the same hazard independently while scoping D-FIRSTLOAD1.
  The same split made the vanilla VM's two other extension loads rejectable — `installTargets`
  (every `addTarget` sits inside a bare `Promise.all` over them) and `shareBlocksToTarget` — and
  bw-ci's `scripts/verify-lazy-extension-degradation.mjs` measured the consequence against
  e0bebbf43: abort the music chunk and the project opens EMPTY, silently (targets 0, no page
  error). Both sites now tolerate a failed load per extension (`apply-vm-overlay.mjs`), so a
  missing chunk costs its own blocks, and that gate holds the contract. The gate itself had to be
  taught two things to see anything: extension chunks are hashed by splitChunks (match by name,
  not by `chunkFilename`), and the service worker claims the page before the lazy chunk is
  requested, so Playwright must block it or the route never fires.
- The local webpack cache learned the hard way that `snapshot.managedPaths` treats node_modules
  as immutable: two cached rebuilds after `apply-vm-overlay` shipped the previous
  `virtual-machine.js` in 40 s and looked like success. `managedPaths: []` now; a cold build is
  the yardstick for anything that changes scratch-vm or scratch-paint under node_modules.
- `verify-lego-spike-roundtrip.mjs` is a mutation-provable gate on the pre-load ordering, not a
  smoke test: its fixture is generated from a `DEVICE SPIKE` program, so it carries
  `extensions: ["spikeprime"]` — a lazy id — without anyone having arranged for it to.
- `overlay/scratch-gui/src/lib/lazy-render-fonts.js` + a webpack alias: `scratch-render-fonts`
  resolves to a same-shaped shim; the real module is reachable only as
  `scratch-render-fonts-base64` and arrives as `chunks/render-fonts.<hash>.js`. First version
  (2026-09-05 morning): `font-loader-hoc` fetched the chunk at boot and `fontsLoaded` waited for
  it, so the bytes left the entry script but not the first load — 1.34 MB on every visit for
  faces that only an SVG WITH TEXT uses. Second version (same day): nothing fetches them at boot.
  The three consumers wait for them themselves, and only when the SVG in hand has a font-family:
  scratch-render's `SVGSkin.setSVG` (patched by `scripts/apply-render-overlay.mjs`, the third
  post-install overlay beside vm and paint) defers a text costume until the faces exist so its
  @font-face is inlined as before; `lib/get-costume-url.js` (thumbnails) returns the plain SVG
  uncached until then; `containers/costume-tab.jsx` loads them when the costumes tab opens for the
  paint editor's text tool. `fontsLoaded` flips on document ready and `vm-manager-hoc` is
  unchanged. A chunk that never arrives degrades to fallback faces, not to no costume.
  `scripts/verify-text-costume-fonts.mjs` asserts both halves (no fetch on a fresh load; a text
  costume rasterised with its @font-face once one is loaded), and `verify-boot-payload` asserts
  the SVGSkin patch is actually in the bundle, since a build that skipped the apply step would
  draw text in fallback faces and pass every other gate.
- `text-encoding` is aliased to `fastestsmallesttextencoderdecoder` (5 KB, already shipped by
  scratch-storage, hands back the native classes). Every browser in `.browserslistrc` has
  `TextDecoder`.
- The four library manifests are `import()`ed by the six containers that read them (now owned
  in `overlay/`) and by `offline-assets.js`, all into one chunk, `asset-library-index`.
  `libraryTotal()` became async; the offline modal shows 0 until it lands.
- `GuidedLessons` is `React.lazy`; the pseudocode importer fetches its example sources AND its
  CodeMirror chunk when the Code tab is first shown, not when it mounts — gui.jsx force-renders
  every TabPanel, so "on mount" was every first paint and the first version of this change
  moved 870 KB out of the entry script only to have the hidden tab fetch it a moment later.
  Game controls for a restored autosave are published once the sources exist.

**After** (this branch's production build, same gzip yardstick): **1,309 KB** for all four eager
scripts, a 69% cut. `scripts/verify-first-load-weight.mjs` — the browser-side ratchet — read
**9.75 MB uncompressed over 24 requests** against its previous 14.90 MB, so its budget came down
with it.

**The gate:** `scripts/verify-boot-payload.mjs` (`npm run verify:boot-payload`, wired into
`build.yml` after the labwired guard). For each thing that moved it asserts a string literal
that survives minification is absent from every eager script, present in the named chunk (so
the marker still discriminates), and not preloaded by `index.html`; for `text-encoding` it
asserts the tables are in no script at all. Sizes are printed, not asserted — a byte budget
tuned to a production build fails a development one for being a development one.

**Also in this tranche, same motive (time to a verdict, time to a first paint):**

- `vercel.json` now sends `Cache-Control: public, max-age=31536000, immutable` for every
  content-hashed file (the `/(.*)\.([a-f0-9]{8,32})\.js` shape `sw.js` already recognises, plus
  `static/assets/`). The live site was revalidating the 3.4 MB boot chunk on every visit under
  `max-age=0, must-revalidate`. Unhashed lazy chunks, `index.html`, `sw.js` and `examples/`
  keep revalidating, and `test/vercel-deployment-policy.test.mjs` checks both halves of that.
- The two lesson-corpus walks (`lesson-numeric-contract`, `lesson-defect-detector`: 483 s and
  350 s on this box, ~278 s of CI's "Run unit tests") run in their own `corpus` job, off the
  build job's critical path; the deploy needs both. They import from `overlay/` directly and
  were run from a copy holding only `overlay/`, `scripts/` and `test/` to prove the job needs
  no vendor/install. `npm test` is unchanged; `test:fast` and `test:corpus` are the halves.
- `webpack.config.js` turns on webpack's filesystem cache for LOCAL builds only (CI's cache
  directory does not survive the run, so there it would only cost the write).

**Not done, on purpose:** fanning the ~30 browser gates into a matrix job. It would take ~4 min
off the critical path and cost 3-4× the runner minutes on an account whose queue starvation is
documented in BLOCKED.md and §2.1; the restructure cannot be verified without pushing, and
every gate carries hand-tuned `if:` conditions. Left as a decision, not a default.

---

## 3. Hardware / debugger surfaces

### 3.1 Debugger surface — LARGELY RESOLVED (2026-08-21 tranche), verify before reopening
`debug-panel.jsx` exists and the 2026-08-21 regression pass landed dock controls, right-dock
opening the optional pane without remounting, and browser proof that the debugger keeps running
while hidden and across view/dock changes (`5e044cf03`, `062f57290`, `c15b75cf1`).

What this entry claimed — "the Code tab has no debugger controls at all", "not started" — is no
longer the measured state. Anyone reopening it must re-measure first and say what is missing, in
the file's own evidence style. The remaining question is coverage, not existence: which surfaces
still lack run control, and does Milestone 5's "one run and debug model" (see `PLAN.md`) subsume
this entry entirely? If it does, delete this section rather than maintaining it twice.

### 3.2 Pane-slots full routing — DEFERRED
The reducer models `upper`/`lower` content slots per column; `gui.jsx` reads only `.size`. The
content swap works. Full slot decomposition was judged not worth the risk (it would mean breaking
Scratch's `<Tabs>` apart). See `BLOCKED.md`. The `PaneColumn` renderer written for it is gone
(§1.1) — it was ~40 lines of flex divs and cheap to write again if this is ever revived; what
would be expensive is the `<Tabs>` decomposition, and that was never started.

### 3.3 ASM tab examples — RESOLVED 2026-08-28 (`lib/bw-asm/examples.js`)
The ASM tab has a reference panel and a working assemble path but no examples, and an empty
assembly editor is a wall for anyone who has not written 8051/6502 assembly before (owner,
2026-08-14: "To make it more intuitive, we need a couple of examples in the end"). A small
per-device set — blink, button poll, a delay loop — selectable like the code-tab examples, each
one assembling green against the hosted `/assemble` before it ships.


Five programs, three shapes: drive a pin, read one, waste a measured amount of time. 8051 gets
blink / button / count, the 6502 bench and the Z80 bench get a blink each; a device with no
`/assemble` path is offered none, because a picker that loads something the ▶ button cannot
build is worse than an empty editor.

**They are gated by assembling, not by review.** `test/asm-examples.test.mjs` posts each one to
the same hosted assembler the ▶ button uses. An example that does not build leaves the reader
unable to tell whether they mistyped it or it was always wrong. The gate skips when the network
is unreachable rather than reporting a pass it did not earn, and its structural checks (both
locales, unique ids, a comment at the top, no examples for devices without a toolchain) always
run.

### 3.4 Long-horizon tracks — NOT STARTED
All specified in `CLAUDE.md`; not repeated here.
- **`stc12live`** tethered extension — blocked on chip-side firmware (`10-live-firmware`), step 2
  of `stc/docs/ROADMAP.md`. The compiled path (`generateC()`) is done; the flashing path is not.
- **On-device TTS** — replace cloud AWS text2speech with CrispASR's WASM engines (MIT). Needs
  COOP/COEP, which interacts with the gallery fetch.
- **Hardware visualisation surface** — S4A-style live board view, simulated and live, riding the
  existing `RUNTIME_EXTENSIONS` driver contract (no emitter changes).
- **Simulator / debugger view** — `emu8051-stc` is MIT and can ship here;
  `CrispStrobe/ucsim-stc` is our GPL-2 oracle and remains CI/local-only.
  `avr8js` is the shipped AVR path; `simavr` is an external AVR hardware
  oracle. The MIT `cemeyer/avr-emu` and `Gregwar/avrel` projects are optional
  CPU/reference cross-checks only, not board runtimes.

### 3.5 Circuits engine & interchange campaign — SCOPED 2026-08-23, upstream-first

The full engine/format survey (2026-08-23) produced fully-scoped work items in the
upstream repos; the engine and format work happens THERE and reaches lite by vendoring:
- **`../../bw-board/ROADMAP.md`** — items E0–E4 (correctness fixes; sparse LU +
  factorization reuse; adaptive trapezoidal transient; exponential-junction path;
  true small-signal AC; model depth; scheduled device events). mna.js items are
  gated on the `spec-updates/` files already filed there (`referenced-device-drives`,
  `sparse-lu-factor-reuse`, `adaptive-transient`, `shockley-junction-limiting`,
  `ac-small-signal`).
- **`../../bw-circuit-ui/ROADMAP.md`** — items X0–X2 (SPICE-deck export fixes incl.
  the mega/milli suffix bug; wiring the three dead exporters; SVG/PNG/CSV document
  export; SPICE-netlist import; breadboard-format and applet-text-format interchange;
  LaTeX schematic export; FFT/Monte-Carlo/parameter-stepping instruments in workers).

Lite-side items (ours, this repo):
1. **Re-vendor after each upstream landing** — `npm run sync:bwboard && npm run
   sync:circuitui`, then the bundle-grep invariant for one distinctive new symbol per
   landing (a green build does not prove the feature is in the bundle).
2. **Vendor the format-knowledge attribution** — the vendored
   `bw-circuit-ui/importers/kicad-common.js` cites "THIRD-PARTY.md", which exists
   upstream but not here: copy the format-schema attribution rows (incl. the MIT
   schema-knowledge source for `.kicad_sch` tokens) into `THIRD-PARTY-NOTICES.md`'s
   bw-circuit-ui section so the vendored pointer resolves.
3. **Extend the trademark disclaimer** — README §"Not affiliated" names Scratch/MIT,
   STC, Arduino, Raspberry Pi but none of the EDA format names the import/export UI
   shows; add them (and mirror in `docs/app-store-metadata.md`). Rule stays: format
   names in import/export UI are nominative use; competing products are never named
   in committed content (bw-board `PLAN.md` standing rule).
4. **Licence tripwire** — extend the dependency check so the LGPL sparse-solver
   family (KLU/CSparse derivatives, including the sparse module inside mathjs) can
   never enter the shipped graph; the full ruling table is in
   `bw-board/ROADMAP.md` §"Backends and licence policy". The oracle policy is
   unchanged: GPL/LGPL engines are CI/dev-side oracles only.
5. ~~**Surface the new exports in lite's Circuit tab** once vendored (schematic
   SVG/PNG save, LaTeX export, trace CSV) — menu wiring only, no logic here.~~
   **MEASURED 2026-08-30 at bw-circuit-ui `e4046d0`: the surfacing delta is EMPTY, and
   one of the three named formats does not exist to surface.** This item assumed lite
   would have to add menu entries per exporter. It does not, because `1397493` replaced
   the two never-mounted menu components with `model/exporters/registry.js` and menus
   that render FROM it — `BoardCanvas`'s `FileMenu` (Import ▸ 9 entries, Export ▸ 10) and
   `BoardPanel`'s `⤓` popover (3 board exports). Lite mounts that same `CircuitDesigner`
   from a byte-identical vendored tree (`diff -rq` against the tip: zero differing
   files), so the SPICE importer `6154745` added — and the `schematic-svg` /
   `schematic-png` entries `e4046d0` added — appeared in lite's menus the moment they
   were vendored, with no lite-side edit. That is what a registry-driven menu is for.
   Lite has **no** exporter/importer call sites of its own (grep for `IMPORT_FORMATS`,
   `CIRCUIT_EXPORTS`, `BOARD_EXPORTS`, `runExport`, `importCircuit` outside
   `lib/bw-circuit-ui/`: nothing), and referenced none of the seven writers `1397493`
   deleted, so those deletions cost lite nothing.
   **Schematic SVG/PNG landed while this was being measured** (bw-circuit-ui `e4046d0`,
   vendored here): `schematic-svg` and `schematic-png` are registry entries, so lite's
   Export ▸ submenu carries them with no lite-side edit, and both go through the
   HEADLESS `renderSchematicSvg` at the projection's own bounds rather than serialising
   the panel element — the panel carries a camera, so serialising it would have saved
   whatever happened to be in the viewport. Note the older `png` entry is a different
   thing: it rasterises `[data-canvas] svg`, the realistic canvas, not the schematic.
   **COMPLETED 2026-08-31 at bw-circuit-ui `9b3abdb`, vendored by Lite
   `f9f997008`.** The registry now carries a deterministic complete Circuitikz
   document (`schematic.tex`, `text/x-tex`). It translates the schematic projection
   rather than inventing a second layout: conservative native bipoles, explicit
   labelled-box fallbacks for every other visible part, escaped TeX text, resolved-net
   precedence for seated circuits, and exact route/label/junction accounting. Scope
   envelope traces, scope sample spectra and DC/AC sweep rows now retain clipboard copy
   and also download honest full-precision CSV with stable names. Envelope CSV names
   `min_volts,max_volts`; it never calls their midpoint a sampled waveform.
   **The one lite-side defect this measurement did find is fixed** (see
   `test/circuit-file-menu-reach.test.mjs`): the File menu's four circuit actions
   dispatch `bw-circuit-file`, whose only receiver is the lazily-mounted
   `CircuitDesigner`, so before the Circuit tab had ever been opened all four were
   silent no-ops. The remaining shared defect is now closed: the one registry-backed
   picker and its report live at `CircuitDesigner` level, above the mutually-exclusive
   Realistic/Schematic/Board branches. The upstream real-browser gate downloads one
   SPICE artifact in each view, requires exactly three download events, compares the
   three SHA-256s and fails on any page error. Lite's pinned consumer contract and
   `verify-circuit-export-completeness.mjs` carry the same boundary into the product.
6. **Define the eleven `devices_oled*`/`devices_tft*` opcodes** the emitter emits but
   no extension copy defines (measured in §5.1a — not a vendoring lag; there is
   nothing upstream to vendor). Fix at the source of truth first
   (sb3-creator `reference/extensions/devices.js`, wrapping the display device state
   the engine already models — ssd1306/ili9341 are registered devices), then
   re-vendor lite's bundled copy. Acceptance: the static emitted-vs-defined gate in
   `test/example-vm-execution.test.mjs` goes green for the seven affected examples,
   and the three currently-inert ones (`55-oled-hello`, `72-pico-oled-hello`,
   `51-tft-pixels`) demonstrably reach extension methods.
7. **Fix the `pc84-led-herz` VCC/GND short** — `wire_9` puts `vcc_1.vcc` on `net_8`
   while three scripted `wire_fix_*` wires put `gnd_2.gnd` on the same net (verified
   by hand, 2026-08-23; the only VCC/GND short a scan of 274 examples found). Fix the
   wiring in the example, and add the rail-short check to the corpus gate so the
   class stays caught — the engine's DRC already detects it at runtime; the gate
   must catch it statically.
8. **74\*/retro example wave — OWNER-REQUESTED 2026-08-23, gated, examples-owner's
   lane.** The engine's retro tier is barely tapped by the corpus (~14 of 236
   examples): instruction-level 6502/Z80/6507 cores booting real ROMs, ~34
   register-level bus-peripheral models (VIA/ACIA/VDP/CRTC/RIOT/PSG/UART/ULA,
   memories as byte arrays), a bus extractor that derives the machine FROM THE
   DRAWN WIRING at all 65536 addresses (contention and open vectors refused with
   addresses named), and the 74HC family as electrical devices. A wave of
   logic-glue and retro benches is wanted. TWO GATES, in order: (a) `PLAN.md`
   Milestone 0's own rule — no new content wave while the predecessor's review
   debt is open (the verification-debt ledger is the critical path); (b) the
   engine enablers in `bw-board/ROADMAP.md` §E5 + E4.1a (gate propagation delay
   is the single biggest space-widener: ring oscillators, hazard demos, honest
   flip-flop timing). Authoring itself belongs to the examples owner and rides
   the strengthened gates (corpus execution, KCL residual, rail-short,
   net-coalesce warnings).

### 3.7 The 8086 tier — CORE + DISASSEMBLER LANDED 2026-09-03, the rest scoped

Full plan, survey and licence rulings in `docs/I8086-CORE-PLAN.md`; the engine
items are `bw-board/ROADMAP.md` §E6. Summary here so the roadmap is not missing
a whole CPU tier that lives only in another file.

Landed in bw-board (`f9ecac4`, `8a6a11f`, branch `feat/i8086-core`, not pushed):
`i8086.js` and `i8086-disasm.js`, ground against SingleStepTests/8086 (MIT) at
**646,000/646,000 vectors for the core and 646,000/646,000 for the
disassembler's TEXT as well as its length** — the suite ships a disassembly
string per vector, a higher standard than the Z80 and 65C02 disassemblers are
held to. **Measured 4.0 M instructions/sec**, ~12x a 5 MHz 8086. **8088 comes
free**: the ISA is identical and the differences are exactly what an
instruction-stepped core does not model.

Nothing is vendored here yet, and that is deliberate — with no adapter or debug
target importing it, `no-dead-overlay-modules` would fail it and be right to. It
rides in with the machine layer.

Scoped as THREE machines, because planning them as one is how this gets
mis-estimated:

- **Tier A — the 8086 on a breadboard** (next). 8255 PPI, machine, adapter,
  debug target, then 8259/8254 and the bus extractor. This is where an LED
  blinks from a port, where the MCU examples adapt, and what every breadboard
  reference the owner cited actually is (slador.uk: 8088 + 8284 + 8254 + 8255
  + 8259 + 74244 + 74138 + LCD).
- **Tier B — the DOS-program tier**, with no hardware in it. Measured across
  the 525-program corpus: 3,109 `int 21h` calls of which 2,862 are AH=02h/09h/
  4Ch, plus 79 `int 10h` and 26 `int 16h`. The service layer is small. **The
  gate is the ASSEMBLER** — 502 of 525 files use `.MODEL`/`PROC`/`MACRO`, which
  `bw-asm` does not speak. Do not promise the corpus before scoping that.
- **Tier C — PC/XT compatible**, for real PC software. Months. Start it when A
  and B ship and a lesson needs it.

**The comparative gap list — bw-board `ROADMAP.md` §E6.8** (surveyed 2026-09-04
against six projects: `mfld-fr/emu86`, `jeffpar/pcjs`, `dbalsom/XTCE-Blue`,
`morphx666/x8086NetEmu`, `moesay/Elegant86` and `MicroCoreLabs/Projects`;
**two of its first nine items were already stale when written and are
corrected in place there** — the CI vector grader exists, and the bootable
MS-DOS image exists and boots down two independent paths). Ordered there.

**E6.8.1 landed 2026-09-04**: an `80186` variant of the core AND the
disassembler, graded 132,532/132,532 and 172,430/172,430 against
SingleStepTests/v20 (MIT), with the 8086 unchanged at 646,000/646,000 on both
grinders and a `vectors186:` CI job. A breadboard **80188** is now a machine-
config key rather than a fork.

**Two rulings from that survey that constrain THIS repo's bundle**, both
verified 2026-09-04: `aaronsgiles/ymfm` is **BSD-3-Clause**, so Adlib/OPL2 is
the one sound-card path that could ever ship here — it may be vendored with
its notice; and `morphx666/x8086NetEmu`, though MIT, states its own audio came
from **fake86 (GPL-2.0)**, so that code must not be read. The audio blocker is
not the licence, though: our contract is `audioTone() → {hz, on}` across the
whole retro tier, and an OPL produces samples, so §E6.8.11 scopes it as an
engine-wide second audio contract rather than as a sound card. The two that touch this repo rather than the engine:
`i8086-asm.js` already builds a `symbols` Map and `i8086-disasm.js` already
accepts a `labels` Map, and **nothing joins them** — so a learner who wrote
`delay_loop:` reads `jmp 002Bh` (§E6.8.2, the cheapest item on the list); and
`I8086Machine.saveState()` exists but the UI does not offer it (§E6.8.7).
Owner-requested and landing last: **cycle-level execution as a machine config**
(§E6.8.4) — the 8086 is the one CPU here whose cycle-step button is dark, and
the accuracy/speed trade becomes a user choice expressed through the existing
`capabilities().steps` vocabulary rather than a new one.

Licence findings that constrain all three: GLaBIOS and `skiselev/8088_bios` are
GPL-3 (refused), `GREENSHELLRAGE/8086-breadboard-computer` has no LICENSE file
at all (architecture may inspire, code may not be copied), `emu8086.inc` has no
usable licence (re-implement). `microsoft/MS-DOS` 1.25/2.0/4.0 is MIT and the
Amey-Thakur `.asm` corpus is MIT per file header. **Every ROM in this tier is
ours.**

---

### 3.9 Language x device matrix — one truth for GUI and docs — PLANNED 2026-09-05

`docs/LANGUAGE-DEVICE-MATRIX-PLAN.md`. Every (language, device) cell is **native**, **lowered**
(through the dialect AST) or both; there is no refused cell, only `native: null` with a cited
reason. A frozen data module (`lib/bw-matrix/capabilities.js`) becomes the source for a
"What runs where?" GUI view, a contextual badge beside Run/Deploy, and a generated
`docs/generated/LANGUAGE-DEVICE-MATRIX.md`; conformance tests hold it to `DEVICE_GROUPS`,
`flashFamily`, the local assembler/compiler target lists and a pinned snapshot of the hosted
service. The plan's §2 is the matrix as measured on 2026-09-05 and already names three
contradictions in the tree (AVR `compile: false` vs a hosted compiler the C tab uses; the Mega
STK500v2 comment vs `flashAvrMega`; the compile-target list in `CHOOSING-HARDWARE.md`).

**Corrects §4.6 below:** the NASM front end in `i8086-asm.js` is **not** missing — it is in the
vendored tree (header line 6, bw-board `df06ddd`). What is open is narrower: pointing
`smallerc-wasm`'s output at it (plan task N2). Owner of the truth lane and the ASM reader:
lego-ac; every other task is claimable per `LANES.md`.

## 3b. What an extension can reach — **TASKS 1, 2 + URL SANDBOX SHIPPED** (2026-08-28)

Full reasoning, and the verification behind each claim, in
`docs/EXTENSION-SECURITY.md`. Summary and evidence here so the roadmap is not
missing a security track that exists only in another file.

**The boundary.** Exact gallery URLs run in-process only after their fetched
bytes match the app's reviewed pin. Every unpinned URL runs in a worker without
DOM, editor-runtime or Tauri-bridge access; its dispatch channel accepts only
that worker's extension registration lifecycle and replies to calls actually
sent to it. Unknown HTTP(S) URLs still require confirmation and retain HTTP(S)
fetch/import; direct WebSockets are blocked so they cannot dial the native
loopback Scratch-Link service. Changed pinned URLs are refused.

The remaining ambient native surface belongs only to reviewed, content-pinned
compatibility extensions. A JavaScript wrapper cannot attribute calls made in a
shared page realm; real per-extension Tauri capabilities need an identity-bearing
broker or unforgeable session tokens checked in Rust.

| # | Task | Why this order |
|---|---|---|
| 1 | **Pin the gallery by content, not host — SHIPPED** | All 120 current entries have exact served-byte hashes tied to an immutable reviewed repository commit. The VM verifies before evaluation; only exact pinned URLs skip confirmation. |
| 2 | **`allowedServices` — SHIPPED** | Each Scratch-Link client may reach only the union of required and optional services declared by its latest discovery. All four bundled Web-Bluetooth extensions were audited before enforcement; no exception was needed. |
| 3 | **Native capabilities declared, not ambient** | Remaining least privilege for reviewed pinned code; requires caller attribution at a real broker/Rust boundary, not a mutable page-global wrapper. |
| 4 | **Sandbox unpinned URLs — SHIPPED** | Arbitrary URL code runs in a restricted worker; the central dispatch broker blocks forged main-service calls and cross-worker replies. |

**Not an App Store item.** Guideline 2.5.2 permits code run by
WebKit/JavaScriptCore, and Scrub — a Scratch *web browser* that also bridges
arbitrary pages to Bluetooth — has shipped since 2021 (id1569777095). An earlier
worry in this session that review might object was overstated. Do this because
it is right.

Each task is independently shippable and none blocks the next.

### 3.8 The 8086 as a FIRST-CLASS target in the GUI — ON MAIN 2026-09-04

**Merged to `origin/main` at `ce890fd83`.** The owner's three stated goals are
closed: the ASM tab is finished, pseudocode → ASM → 8086 works end to end, and
an 8086 can be **seated on a drawn board** whose extraction produces a working
machine. Five pseudocode examples ship and are offered in the picker.

**What is NOT closed, so nobody reads the above as "done":**

- **The NE2000 is not reachable from here.** It landed in bw-board (`e676520`,
  E7.3) after this tree's last vendoring, so `overlay/…/bw-board/ne2000.js`
  does not exist yet. `npm run sync:bwboard -- --dir <bw-board checkout>` is
  the fix — the plain form iterates a manifest that covers 26 of ~175 vendored
  files and would silently skip it.
- **No pseudocode verb reaches a network card**, deliberately. A learner drives
  it from the ASM tab by writing its registers, which is the lesson for a NIC
  in a way it is not for an LED. A `send`/`on receive` pair would need a
  decision about what a "message" is that has not been made.
- **Three lite UI files diverge from bw-circuit-ui and are unowned.**
  `VdpScreen.jsx` (+85/−8, holds the 8086 keyboard path upstream has never
  had), `BoardCanvas.jsx` (+24/−10), and `CircuitDesigner.jsx` — **19 ahead and
  46 behind**, so that one is a reconciliation rather than an upstreaming, and
  the sync tool's own suggestion to "upstream these patches" is wrong for it.
  See `docs/VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md`.

**Status at the end of 2026-09-04.** A learner can now write pseudocode, pick
`i8086`, press play and watch it run. What they cannot yet do is DRAW the board
— that is the one remaining piece and it is a vendoring job, not a design one.

**What lowers today**, all offline through our own assembler
(`lib/bw-asm/pseudocode-8086.js`, entry `buildPseudocode8086`):

| | |
| --- | --- |
| control flow, operators, variables | 32-bit pairs — nothing narrows silently |
| `say` / `print` | the CGA text page |
| pins | `turn on/off`, `toggle`, `read`, `set <pin> to <expr>` (a LEVEL, not a voltage) |
| whole PORTs | `PORT p = P2 OUTPUT` + `set p to <n>`, `read p` |
| `wait until` | with a warning when nothing can change the condition |
| KEYPAD4X4 | an 8255 matrix scan, 0..15 or -1 |
| `PIN … ANALOG` | an ADC0809 the build adds at 300h |
| `set <pin> to <n> hz` | 8254 counter 2 and the real speaker |
| `set <pin> to <n> percent` | genuine pulses from a scheduled task, ~20 levels |
| SEVENSEG8 | eight digits, scanned by the scheduler |
| **more than one WHEN script** | a PREEMPTIVE scheduler; the build adds a PIC + IRQ0 timer |
| `WHEN <pin> pressed/released` | an edge, one task each |
| `WHEN I receive` | one byte per message, no queue needed |
| `WHEN <key> pressed` | one pump task reads the keyboard; hats watch what it read |

**Refused by name, with reasons that are about the hardware:** sprites, DEFINE,
lists, strings in variables, `join`. A DAC has no pseudocode caller *by
decision* — `ANALOG` is input-only on an 8051, so making it bidirectional here
would reseat onto an STC and lose half its meaning. It is reachable from the
ASM tab, which is a legitimate home rather than a consolation.

**A DECLARATION CAUSES HARDWARE TO APPEAR, AND THE BUILD SAYS SO.** An ANALOG
pin adds a converter; a second script adds an interrupt controller and rewires
the timer. Both are returned in `chips` and named in a warning. A silently
added chip is the same failure class as a silently chosen default.

**Three refusal reasons turned out to be wrong rather than expensive**, and all
three were written before the scheduler existed and never revisited when it
arrived: broadcast "needs a queue" (it needs none — the receiver is already a
task watching one byte); the key hat "needs the keyboard's own edge" (a pin has
a level so a hat must manufacture an edge, but DOS hands over a QUEUE of
keystrokes and each arrival is already an event); and the display's scan
"lives in the Timer-0 ISR" (it lives in a task now). Worth re-reading every
refusal whenever a capability lands.

**STILL OPEN, and it is the one thing between here and the owner's goal:** the
8086 cannot be SEATED on a drawn board in lite. Every piece exists upstream —
bw-board master registers `i8086`/`i8088`/`i8255`/`i8254`/`i8253` DIPs, and
bw-circuit-ui master carries the parts and the reseat substitution — but lite's
vendored copies are behind, and the sync tool's hand-written manifest covers 26
of 120 vendored files with the whole 8086 tier outside it. Assigned; needs
`sync-bw-board.mjs --dir` plus the parts-data sidecars.

Three steps, in dependency order, each with what already exists under it.

**WHAT IS ALREADY DONE, so nobody rebuilds it.** The local assemble route
(`lib/bw-asm/assemble-route.js`) sends 8086 source to the vendored
`i8086-asm.js` and everything else to the hosted service — the ASM tab's ▶
already assembles 8086 locally and runs it on a DOS bench. Six example
programs ship with attribution. Six ROMs are served from `static/roms`. The
debug target, extractor, video for all five cards and the keyboard are wired.

#### 3.8.1 The ASM tab — KEYBOARD AND GRAPHICS LANDED 2026-09-04

**Two of the three gaps are closed, and one of them was never what it said.**

**The keyboard was already wired and the entry was stale.** `debug-runner.js`
overrides `runner.sendSerial` to call `bench.sendKeys`, and the bench sets
`blockOnKey: true`, so a program in INT 21h/AH=01h genuinely blocks and wakes
on the next service call. Measured: a program that waits sits at 200,000 steps
with no key, then completes and echoes on `sendKeys('K')`. What was actually
missing was an EXAMPLE that asks for one — now `keys`, which reads until ESC
and prints each character's hex code.

**The graphics example is in: `mode13`.** 49 bytes, 320x200x256 at A000:0000,
an XOR texture, INT 16h to wait, mode 3 restored before exit. Verified as 245
distinct colours sampled across the frame rather than "the mode was set" — a
uniform fill would pass the second check and show nothing.

**AND THE REASON THERE WAS NO GRAPHICS EXAMPLE WAS NOT THAT NOBODY WROTE ONE.**
`examples.js` imported the NAMED export `I8086_EXAMPLES` — upstream's six,
under Amey Thakur's attribution — and never the default, which adds ours. So
`pins` (written earlier) shipped in the file and was offered nowhere: not in
the ASM tab, not in `ALL_ASM_EXAMPLES`, not in the local-assembly gate. Fixed;
the gate now pins our ids by name, because `length >= 5` passed on upstream's
six alone and said nothing about ours.

**STILL OPEN: no 8086 part in the circuit palette**, which is why the device
sits in the Code tab's picker labelled "assembly only" rather than arriving
from a drawn board. The coverage lane found the deeper half of this on
2026-09-04 — there is no `i8255` schematic part either (no DIP in
`retro-dips.js`, no registry entry, no sidecar), so an 8086/8255 GPIO board has
never been drawable. They own that; the pinout and the active-HIGH RESET trap
are in the thread.

#### 3.8.2 Pseudocode → ASM → 8086 — LANDED 2026-09-04

**All four sub-steps below are done, and one of them was settled the opposite
way from how it was scoped.** What ships: `lib/bw-asm/pseudocode-8086.js`,
entry `buildPseudocode8086({project, source})` → `{bytes, format, chips, asm,
warnings}`, entirely offline through our own assembler.

**The tick (sub-step 1) is not one answer but two, and the second was scoped
as impossible.** A single script waits with INT 15h/86h, which blocks — fine
when there is nothing else to run. More than one script gets a PREEMPTIVE
scheduler: one stack per script, switched by a timer interrupt on vector 70h,
with the PIC and an IRQ0-wired 8254 requested per-program through `chips`.
DECISION 1 in that file had concluded two scripts were impossible because the
8254 "cannot interrupt" here; it can, once the program asks for the PIC, and a
cooperative version was possible even before that because the counter can be
READ. The rate is MEASURED at startup, never assumed — assuming it made every
wait 4.19× short while every ordering test stayed green.

**Variables (sub-step 2) are 32-bit pairs, so nothing narrows silently.**

**The block set (sub-step 3) is `SUPPORTED`, and a refusal names the block and
prints the list.** Lowering today: the control flow, the operators, `say`/
`print`, pins (`turn on`, `toggle`, `read`, `set <pin> to <expr>`), whole
PORTs, `wait until`, `set <pin> to <n> hz` (real 8254 + speaker), KEYPAD4X4 as
an 8255 matrix scan, `PIN … ANALOG` through an auto-added ADC0809, multiple
WHEN scripts, `WHEN <pin> pressed/released`, and broadcast. Refused by name:
`setpwm` (a DAC would be a substitution, not PWM), `WHEN <key> pressed` (the
DOS queue reports presses, not edges), sprites, DEFINE, lists.

**Pin I/O (sub-step 4) is the P1/P2/P3 → 8255 A/B/C mapping**, which is what
makes a reseat a DEVICE-line change rather than a rewrite.

**A DECLARATION CAUSES HARDWARE TO APPEAR, and the build says so.** An ANALOG
pin adds an ADC0809 at 300h; a second script adds a PIC and rewires the timer.
Both are returned in `chips` and named in a warning, because a silently added
chip is the same failure class as a silently chosen default.

#### 3.8.2-old Pseudocode → ASM → 8086 — the original scoping, kept for the record

Today: pseudocode → `generateC` → a HOSTED compiler → binary. That chain has no
8086 back end and cannot grow one — there is no ia16 C compiler in the service,
and adding one is a toolchain problem, not ours.

**So the 8086 does not go through C at all.** The path is pseudocode → 8086
assembly → our own assembler → the machine, entirely local. That is not a
workaround: it is strictly better where it applies, because the assembler is
differentially tested against MASM 1.10 and NASM 2.16 and needs no network.

What makes it tractable is that `generateC` already does the hard part — it
lowers each WHEN block to a state machine over a millisecond tick. A
`generate8086Asm` emits the same state machine in our MASM subset. The
sub-steps:

1. **The tick.** C's `while(1)` over a ms counter becomes the 8254's 18.2 Hz
   tick, or a tighter counter if a lesson needs one. This decides what "wait 1
   second" means and must be settled before any codegen.
2. **Variables.** Pseudocode variables are 32-bit in the C path; the 8086 is
   16-bit. Either narrow with a stated limit, or emit 32-bit arithmetic as
   pairs. **Narrowing silently is the one thing that must not happen** — a
   counter that wraps at 65535 where the Scratch version reaches 100000 is a
   program that runs and is wrong.
3. **The block set that lowers.** Not all of it will. The honest deliverable is
   a list of blocks that DO lower and a refusal by name for the rest, in the
   shape `i8086-asm.js` already uses for unsupported directives.
4. **Pin I/O.** `set pin 13 high` is an 8255 port write on this tier, not an AVR
   register. That is a per-board mapping, so it needs the extracted machine's
   chip list — which the extractor already produces.

#### 3.8.2b Pseudocode → C → 8086 — the route most learners will actually take

3.8.2 above routes pseudocode to assembly. **That is the wrong default for a
child**, and the owner is right about it: almost nobody learns assembly first,
and every other device in this app reaches the machine through C. An 8086 that
can only be programmed in assembly is a museum piece next to the Arduino.

So both routes ship, and they serve different people. THREE DOORS, and two are
open:

**1. The hosted compiler already does this — it is a service change, not engine
work.** `stc-compiler.vercel.app` compiles C for 8051, AVR and STM32 today. Add
`ia16-elf-gcc` server-side and real 8086 C works immediately. The licence
question that stops people does not arise: **a GPL COMPILER running on a server
does not affect the binaries it emits** — that is how every compiler service on
earth works, and it is the same relationship gcc has with every proprietary
program ever built with it. The client side of this is small: `asmRouteFor`
already picks hosted-vs-local, and a C build for an 8086 target is one more
hosted request with `target: 'ia16'`.

**2. Compile our OWN C, which is a far smaller job than compiling C.**
`generateC` emits a subset WE author: no pointers, no malloc, no structs,
`int` variables, and a state machine over a millisecond tick. A compiler for
that subset is a term rewriter, not a C front end, and it shares the whole back
half with 3.8.2 — both end in our MASM-subset assembler. This is the offline
path, and offline is not a nicety: it is what works on a school network.

**3. SmallerC — VERIFIED 2026-09-04, and it is now the RECOMMENDED door.**

Cloned, licence read, compiler built, output disassembled. Every claim below is
measured rather than reported:

- **BSD-2-Clause**, `license.txt`, two conditions and no advertising clause.
  Vendorable with attribution.
- **It emits 16-bit DOS code**: `-dost` (tiny/.COM), `-doss`, `-dosh`,
  `-seg16`, `-flat16`.
- **It emits NASM syntax** — `bits 16` at the top of the file — and we shipped
  a NASM front end this same day. The two halves were built independently and
  meet exactly.
- **The output is 8086/186-clean.** A `for` loop calling a function compiled
  to: `add call cmp inc jge jmp leave mov push ret sub`. Every one is an 8086
  instruction except `leave`, which is an 80186 — and the 186 variant landed
  this same day too. **Zero 32-bit registers** in the output, so the doc's
  "80386+" refers to the 32-bit models, not to this path.

**The ONLY thing standing between it and running is linker directives.** Our
assembler refuses `GLOBAL` by name — correctly, since it assembles straight to
a flat loadable image and there is nothing to export to. So the work is a
flat-image lowering of `SECTION .text/.bss` + `GLOBAL`/`EXTERN`, which is a
small, bounded piece rather than a compiler.

Where SmallerC RUNS is a separate question with two answers, and neither is
blocking: server-side beside the existing hosted compiler (trivial, it is plain
C), or compiled to WASM for the offline path (it is self-hosting C, so this is
ordinary Emscripten work). **Ship it server-side first and WASM it later** —
the same order as door 1, and it gets real C onto the 8086 sooner.

**RECOMMENDED ORDER, REVISED once door 3 was verified: 3, then 2 if offline
matters more than breadth.** SmallerC is permissive, emits the exact dialect we
just taught the assembler, and produces code our core already runs. Door 1
(ia16-gcc, hosted) remains the fallback if SmallerC's C subset turns out too
small for a lesson — it is a real C compiler with real limits, and nobody has
yet compiled anything larger than a loop through it here.

**THE CONSTRAINT BOTH ROUTES SHARE, and it is the one that must not be fudged:
pseudocode variables are 32-bit and the 8086 is 16-bit.** Narrowing silently
gives a counter that wraps at 65535 where the Scratch version reaches 100000 —
a program that runs, produces wrong numbers, and blames the learner. Either
emit 32-bit arithmetic as register pairs, or refuse the narrowing by name in
the shape `i8086-asm.js` already uses for unsupported directives. `ia16-gcc`
gets this right for free, which is a genuine argument for door 1 beyond speed.

#### 3.8.3 Circuit examples that RESEAT onto an 8086 — MEDIUM, and it is the point

The owner's framing: an example currently drawn around a Nano, a Pico, a 6502
or an STC should be reseatable onto an 8086 in place. That is the thing that
makes the tier a teaching object rather than a demo.

**It is a harder ask than it sounds and the reason is worth stating: the CPU is
not the only thing that changes.** A Nano example uses AVR pins directly; an
8086 has no GPIO at all and needs an 8255 beside it. So "reseat" means
substituting a SUBSYSTEM — CPU plus its port chip plus the address decoding —
not swapping one part. The parts exist (8255, 8259, 8254, and the boards),
which is why this is scoped rather than speculative.

Sub-steps: a part-level equivalence table (AVR pin ↔ 8255 port bit); a reseat
that rewrites the netlist rather than the schematic image; and a gate that the
reseated example still extracts to a machine that runs. **The gate is the
deliverable** — a reseat that produces a board which extracts but does not run
is the failure this tier keeps finding in other forms.

#### 3.8.4 8086 performance follow-up — ORDERED 2026-09-05

The authoritative measurements, activation thresholds and correctness gates
are in `docs/I8086-CORE-PLAN.md` under “Performance decision and next
roadmap”. The design decision is settled: DOS uses the explicit boundary-step
adapter and `runFor()` uses an exact, unrounded CPU-cycle deadline. They stay
together and are not a user preference. Cycle-unit budgeting of the fast core
is not the future cycle-accurate BIU/EU mode described in
`docs/FULL-DEBUGGER-ARCHITECTURE.md`.

Next tasks, in order:

1. **Evaluated and rejected (2026-09-05).** The no-`onInstruction` machine-step
   fast path passed the full upstream matrix, but Lite `89a7e5e91` changed
   neither desktop nor mobile p50/p95 and moved aggregate `runMs` by only
   +0.8 ms over 182 samples (about 4.4 µs/sample, below timer resolution).
   It was reverted; reconsider only with P3's repeated, throttled evidence.
2. **Evaluated and rejected (2026-09-05).** Conditional interrupt arbitration
   passed the full matrix and moved aggregate `runMs` in the favorable
   direction, but desktop/mobile p50 and p95 were unchanged and the deltas
   were only about 5.7/1.3 µs per sample—below 0.1 ms timer resolution. It was
   reverted pending P3's repeated, throttled evidence.
3. **Complete (hosted run `33948023807`).** The benchmark runs three fresh
   contexts each for desktop, mobile and an honestly labelled 4× renderer-CPU
   throttle, retains every raw receipt, reports median/min/max/range, and
   records transfer, encoded-body and decoded-body sizes. The throttled case
   does not claim to emulate RAM, core count, network or a named phone. All
   nine receipts passed; median speed remained about 30.35× XT, including the
   throttled profile.
4. **Complete (hosted run `33951019292`).** Benchmark-only `BoardCanvas`, host,
   fit, resize, board-state and declaration marks account for 14/15
   desktop/mobile CircuitDesigner commits. `designer:board-ready` dominates at
   11 commits; resize/fit owns only 1–2. Normal sessions retain their original
   React hierarchy and allocate no trace state.
5. **Not activated.** P4 did not identify resize/fit work as material, so the
   duplicate canvas observers stay unchanged. Reconsider only if later
   repeated evidence crosses that dependency gate.
6. **Complete (baseline `33952110716`, post-split `33953002119`).** CI webpack stats attribute
   11.52 MiB of uncompressed eager JavaScript: scratch-vm 4.86 MiB, render
   fonts 1.31 MiB, asset-library data 0.72 MiB and text-encoding 0.60 MiB are
   the leading owners. The evidence-backed eager split reduced those scripts
   to 4.73 MiB (−59%) and the cold DOS journey from 16.0 to 10.78 MiB. The
   dedicated 22.1 KiB DOS chunk stays non-initial and clean; all nine causal
   selection/assembly/attach receipts attribute six scripts and contain zero
   unrelated CPU, solver or device-catalogue modules. CI now enforces both
   claims. The separately reported broad graph belongs to the intentionally
   visible circuit preview, not the DOS attach path.
   **Follow-through:** the target picker now imports dependency-free
   `bw-board/target-kinds.js` in its own `bw-debug-target-kinds` chunk instead
   of importing the broad board barrel merely to obtain labels. The old root
   and factory exports remain compatible. This removes an accidental load
   edge; hosted run `33959505220` confirmed a 1.7 KiB non-initial metadata
   asset while the broad graph remained separately attributable.
7. **Not activated (2026-09-05).** P6 leaves the engine at about 30.34× XT;
   desktop/mobile median execution totals are 4.7/4.9 ms across roughly 180
   pumps, and earlier P1/P2 deltas remained below timer resolution. Keep the
   deferred engine/JIT/worker hypotheses closed until a workload crosses its
   documented activation threshold.
8. **Complete (hosted performance step `33964040918`).** No-pin i8086 target
   selection used to fetch the 734,682-byte `sb3-creator.js` chunk in all nine
   runs merely to fill an unread compatibility cache. The obsolete producer,
   cache and lookup are gone; action-time retarget, compile, conversion and
   export keep the lazy compiler door. All nine post-change receipts contain
   zero compiler assets before Circuit opens, at 7,402,809 pre-Circuit bytes
   and 397,929 DOS-load bytes. The overall workflow is red only on the existing
   i8254 capability-report mismatch; its build, corpus, smoke, production 8086
   browser proof and performance step passed.
9. **Complete (hosted runs `33964687451`, `33965722132`).**
   `pseudocode-examples.js` was 265,252 encoded bytes in all nine accepted ASM
   journeys because Code reveal fetched it for a closed Tools picker. It now
   loads only when the no-device Tools menu is open or restored-game controls
   need it, with shared retry, stale-request and unmount guards. All nine new
   receipts contain zero example/compiler chunks before Circuit and measure
   7,148,596 pre-Circuit bytes, 254,213 below P8, at 30.31–30.35× XT. The
   browser journey separately proves Code keeps the chunk cold, opening Tools
   fetches and populates it exactly once, and reopening Tools reuses it.
10. **Complete (hosted run `33966231689`).** CodeMirror's C/C++, Python and
    JavaScript grammars contributed 266,069 webpack-source bytes to the Code
    chunk during an ASM-only journey. Pseudocode/BASIC/ASM remain synchronous;
    the optional grammars now occupy three named, non-initial chunks totalling
    236,210 emitted bytes, with a generation/dispose guard and plain-text
    failure fallback. All nine ASM receipts contain zero optional grammar,
    example or compiler chunks; pre-Circuit payload is 6,899,540 bytes, down
    249,056 from P9, at 30.32–30.35× XT. The editor gate loaded all three on
    demand and the hosted ownership ratchets passed.
11. **Complete (baseline `33967333844`, accepted run `33973982315`).** Store construction imported the
    lazy paint editor's reducer eagerly, pulling 533,665 bytes of `@scratch/paper`
    and 104,459 bytes of scratch-paint source into first load. Baseline run
    `33967333844` measured first-Costume PaperCanvas readiness at 390.5 ms with
    50/55 ms activation tasks. The final staged loader installs the real reducer
    through a store-local `replaceReducer` manager, yields, then loads PaintEditor
    through a distinct named bridge, with shared retry and stale/unmount guards.
    Hosted ownership reports 1,484,050 source / 850,000 emitted bytes, all
    non-initial; all nine ASM receipts contain zero paint assets and fall to
    6,543,080 pre-Circuit bytes, 356,460 below P10. First Costume is 379.7 ms
    with one 61 ms task, real Matrix state and a green vector/bitmap
    draw/save/reload round trip, passing every 449.075 ms / 1 s / 100 ms limit.
12. **Evaluated and rejected (hosted run `33975427592`).** A direct ES `List`
    entry reduced initial `react-virtualized` ownership from 350,770 to 119,874
    source bytes and excluded all unused widget families, but the emitted
    pre-Circuit payload moved only 6,543,080 → 6,470,989 bytes: 72,091 bytes,
    below the predeclared 75 KiB floor. It was reverted rather than moving the
    threshold after measurement. Reconsider only with P14's full deferral.
13. **Active.** Narrow synchronous `scratch-svg-renderer` consumers and load its
    sanitizer only in the SVG-upload branch. `css-tree` plus `mdn-data` currently
    contribute 572,453 initial source bytes. A named retryable sanitizer asset
    must be absent from default rendering and Costume activation, strip hostile
    SVG before storage, make no external request, survive save/reload and recover
    from a failed chunk. Keep rendering itself synchronous.
14. **Queued.** After an isolated baseline, demand-load the remaining List/Grid
    closure only for a visible list monitor while its outer geometry remains
    synchronous. Prove a 1,000-row saved list retains position, scrolls, edits,
    loads once and retries safely; enforce the 15% / 1 s / 100 ms limits.
15. **Queued.** Split hidden tutorial/card/library bodies from compact synchronous
    metadata. Preserve tutorial URL lookup, `initTutorialCard`, extension
    connection metadata and every selection flow. Treat each independently and
    reject a slice which saves less than 75 KiB emitted or exceeds activation
    limits.
16. **Experiment only.** Differentially test a CI-generated precompiled
    scratch-parser schema validator. AJV is on every project-load path, so a
    dynamic import is not an optimization. Accept only exact callback/error/
    result/SB1 parity across valid, invalid, adversarial and full-corpus inputs,
    plus a material net initial and encoded-byte reduction.

**Debugger-only circuit deferral — complete (hosted performance step
`33962284105`).** The existing nine fresh-context receipts proved that the
default `right` layout fetched 1,604,171 encoded bytes of `bw-board.js` and
`bw-circuit-ui.js` before the Circuit click—14.2% of its cold-to-runner bytes
and well above the 512 KiB activation floor. `right`/`solo` now load the
debugger without the hidden designer; File actions, circuit starters, the
dedicated Circuit tab, and `top`/`off` previews still wake it. Debugger faces
have their own 21,724-byte chunk instead of sharing the full designer label.
All nine post-change receipts contain zero broad circuit assets before the
click and zero unmatched or forbidden causal modules; pre-Circuit bytes are
8,122,239. Median emulator speed remains 30.34x XT. The full workflow was red
only on separately introduced capability-report and dead-module unit failures;
the performance step, focused debugger, vendor, and corpus jobs were green.

Every performance change gets an isolated GitHub Actions receipt. Full builds,
browser profiles and repeated timing runs do not run on the VPS.

## 4. Standing debt

### 4.1 The dead-module ratchet — TRIAGED 2026-08-30, and the instrument was wrong

**Dead-module ratchet** (`test/no-dead-overlay-modules.test.mjs`) — this entry said **five**
entries and "the list may only go down". Measured 2026-08-22: **sixteen**. The ratchet did not
fail; the claim about it did, and nobody noticed because a growing exclusion list still shows
green.

Triaged 2026-08-30 under this file's own rule (promote with what-it-takes and blocked-on, or
delete). **16 → 13**, and each remaining entry now names the item below that owns it, enforced:

| left the list | why |
|---|---|
| `schematic-svg.js` | never was dead — `scripts/render-schematic.mjs` imports it, and that script IS the `verify:schematic-corpus` gate |
| `trace-oracle.js` | never was dead — `scripts/oracle-differential.mjs` imports it |
| `flyout-resize.js` | DELETED. Ours, unwired, and its feature is deferred rather than pending (§3.2) |

**Two of twelve "known dead" modules had a live consumer, and the scan was never pointed at it.**
It walked `packages/scratch-gui/src` and nothing else, so a module whose only caller is a *tool*
read as dead — for as long as the list has existed. The scan now also walks `scripts/`.

It deliberately still does **not** walk `test/`. Every bug in that file's header was correct code
that passed its own tests; a test is the one caller that proves nothing, and counting tests as
consumers would make the ratchet green for exactly the modules it exists to find. The distinction
is: `scripts/` ships behaviour (a gate, a build step, a CLI), `test/` observes it.

**The anchor gate.** §4 said the exclusion list was "a roadmap hiding in a test", and the fix for
that was a rule somebody had to remember. It is now a test: every entry carries a `roadmap` field,
and the gate refuses an entry whose item does not exist **or whose item never mentions the file by
name** — because sixteen entries pointing at one heading called "standing debt" is the state this
started in, and a gate that only checked the heading existed would have called it ownership. The
gate is mutation-proven in-place (`the anchor gate can fail (three ways)`): a fabricated anchorless
entry, one naming §99.9, and one pointed at a real item that does not name it.

**Why "delete the vendored file" is not the tool the rule assumed.** For a file we wrote it is
(that is how `flyout-resize.js` went). For a vendored one it is not: `sync-bw-board.mjs --dir`
enumerates the source tree and restores anything missing, so a deletion in lite survives until the
next sync. The only durable form is an entry in the sync script's `EXCLUDE` set — and that set
exists for one hard reason (`pin-functions.js` imports node builtins and cannot enter a browser
bundle), not for tidiness. Two rules stand against widening it: *"vendor scripts must copy the
complete tree or fail before writing"* — a partial vendor shipped mixed builds for days once — and
the script's own import-resolution check, which throws the moment upstream wires an excluded leaf
to anything (`imports ./m74c922.js, which was not vendored`). A discretionary EXCLUDE is a landmine
armed by somebody else's commit in another repo. So the vendored entries below are **promoted, not
deleted**, and that is the reasoned answer to the rule rather than a dodge of it.

### 4.2 sdcc-wasm dist: loaded by computed URL, which no static scan can follow

`cc1.js`, `sdcc.js`, `sdas8051.js` and `sdld.js` under `lib/sdcc-wasm/dist/` are Emscripten output.
Verified 2026-08-30: `lib/sdcc-wasm/compiler.js` loads all four stages as
`import(/* webpackIgnore: true */ resolve('<name>'))`. The specifier is a **function call**, so no
import scan can resolve it and no scan ever will — this is not debt awaiting a decision, it is a
permanent property of loading an Emscripten artifact by URL.

**What it would take to remove the exclusion:** nothing worth doing. Rewriting the loader to use
literal specifiers would make webpack try to bundle a multi-megabyte Emscripten module into the
app chunk, which is the thing `webpackIgnore` exists to prevent.
**Blocked on:** nothing. Closed by design; the entry stays because the *scanner* cannot see the
caller, not because the caller is missing.

### 4.3 bw-circuit-ui is vendored wholesale, demo entry included

`sync-bw-circuit-ui.mjs` copies upstream's `src` tree rather than cherry-picking, which is
deliberate: a cherry-picked vendor is how a partial tree shipped mixed builds. Four files arrive
that lite does not use.

| file | what it would take to wire it | blocked on |
|---|---|---|
| `main.jsx` | nothing — it is upstream's standalone demo entry point, and lite has its own | never. It is not a feature; it is another app's `index.js` |
| `demo-netlist.js` | nothing — the fixture the demo above loads | same |
| `export-png.js` | a "save schematic as PNG" affordance in `SchematicPanel.jsx`, plus a decision about where the file goes on iOS/Android (the share sheet, not a download) | product decision. The SVG path already exists via `render-schematic.mjs`; PNG is a convenience nobody has asked for |
| `simulation.js` | nothing, and it should stay unwired: lite drives the board through **bw-board**, and "one board, one truth" is the law most regressions have violated. Wiring bw-circuit-ui's own simulation shim would create a second engine | nothing. Wiring it would be the bug |

Three of the four are permanently correct as exclusions. `export-png.js` is the only one with a
plausible future, and it has no date because nobody has asked for it — which is now written down
here rather than implied by a one-line comment in a test.

### 4.4 bw-board device modules waiting on their device

Leaves of the vendored bw-board tree. Each is a leaf in the strict sense — nothing inside the
vendored tree imports it either — so they cost nothing in the bundle (webpack never reaches them)
and everything in legibility, which is what §4 was complaining about. These are the six device and
hardware features the planning docs could not see.

| file | the feature | what it would take | blocked on |
|---|---|---|---|
| `avr-peripherals.js` | SPI/I2C peripheral models on the AVR debug path | a boundary-D AVR debug target that exposes bus traffic, then registering these models with the device registry and asserting a consumer (producer-must-assert-consumer) | the boundary-D debugger port for avr8js — the next coordinator piece named in `bw-setup.md`, not started |
| `face-live.js` | resolving a board face against **tethered** hardware instead of the simulated board | a live-hardware transport (ScratchLink/WebSerial is present; a board-identity handshake is not) and a decision about what happens when the tethered board disagrees with the designed one | tethered-hardware mode, which has no design yet. `§3.4` long-horizon |
| `m6507-machine.js` | Atari 2600 / SBC6507 as a device target | a device-selector entry, an example set, and a display path — the 6502 workstation shape already exists (`test/6502-workstation.test.mjs`), so this is mostly wiring plus content | nothing technical. Unscheduled: no example corpus, and a device with no lessons is a device nobody uses |
| `m74c922.js` | **LANDED 2026-08-30:** physical 4×4 keypad encoder IC | `tier2-parts.js` now registers the model; Lite acceptance covers all 16 codes, release, rollover, true-Z `/OE`, broken matrix wires and scheduler chunking | unblocked and removed from `KNOWN_DEAD`; the existing sidecar/art and designer palette make it placeable |
| `blinkenrocket-modem.js` | audio-modem firmware upload to a Blinkenrocket | a UI affordance for "upload over the headphone jack", and the browser audio-output path to drive it | no owner. The firmware regression canary (`blinkenrocket-firmware`) exists on the box; the app-side feature does not |
| `zx-tzx.js` | loading ZX Spectrum tape images | a Z80 machine target that accepts tape input — `z80-debug.js` and `z80-extract.js` both came OFF this list already, so the machine half is live; the tape half is not | a file-in affordance and a decision about where tape images come from (bundled corpus vs user upload) |
| `i8086-asm.js` | **LANDED 2026-09-04:** writing 8086 assembly in the ASM tab and running it | `lib/bw-asm/assemble-route.js` routes an 8086/8088 device to this module IN THE BROWSER and everything else to the hosted service; `lib/bw-debug/i8086-dos-bench.js` boots the resulting .COM/.EXE on the DOS service layer, which `debug-runner.js` used to refuse by name. Six MIT programs from the Amey-Thakur corpus ship as ASM-tab examples, attribution included, and the gate assembles AND RUNS every one | unblocked and removed from `KNOWN_DEAD`. **The decision this row asked for was taken, not dodged:** two assemble routes in one tab, argued for in that module's header — the alternative was never one route, it was no 8086 ASM tab, because neither ca65 nor sdasz80 has an 8086 back end. The cost (two error surfaces) is bounded by three asserted rules: one function decides the route, neither route can leak into the other, and every result says which one ran |
| `i8086-emu8086.js` | nothing in lite, by design | its consumer is bw-board's corpus harness, which lite does not ship. It adapts the emu8086 dialect (flat `ORG 100h` files with no segment) so the 525-file teaching corpus can be run against the core | nothing. It is here because the sync copies bw-board's full `src/` tree, and the honest entry for that is "not ours to wire", not a pending feature |
| `i8088-biu.js` | measured 8088 bus-cycle prediction | its consumer is bw-board's cycle-model corpus; lite runs the instruction-stepped machine and does not expose a cycle-accurate mode | the cycle model is upstream verification infrastructure, copied here only because the vendor sync carries the full `src/` tree |
| `reseat-gate.js` | cross-family machine equivalence checking | its consumers are bw-board's reseat acceptance tests, which compare edge sequences while developing machine substitutions; it is not an app service | nothing in lite. Keep it with the complete vendored source until the upstream project moves test helpers out of `src/` |

None of these has an owner, and saying so is the point: the rule was "no entry may remain *later*,
no owner, no date", and the honest resolution for five of six is **no owner, and here is exactly
what the next person would have to build**. That is a tracked item. "Wired when AVR debug lands"
was not.

### 4.5 Attribution wart

The `project-data.js` rotation-centre fix was swept into `333fae8` ("vendor bw-circuit-ui") by a
concurrent `git add -A`. Content is correct and verified; only the attribution is wrong. Not worth
rewriting under another active session. Recorded so the commit log's oddity has an explanation.

---

## 5. Cross-repo gates that cannot fire in CI — **CLOSED 2026-08-28**, re-measured

Both defects below are fixed. Re-measured on 2026-08-28 by comparing lite's own emitter
against lite's own extensions — no second checkout, which is the point of the fix §5.1a made.
**The numbers, so nobody has to derive them again:**

```
stc12    emitter names 31 opcodes, extension defines 30, emitted-but-undefined: 0
devices  emitter CREATES 36,      extension defines 48, emitted-but-undefined: 0
         all eleven devices_oled*/devices_tft* opcodes are present
gate     test/example-vm-execution.test.mjs — 290 pass, 0 fail, 0 skipped
```

The one apparent survivor is instructive and is NOT a gap: `stc12_readpin` is named by the
emitter but defined nowhere. Every one of its four references is a **read** —
`b.opcode === 'stc12_readpin'` in a lowering path — and nothing constructs a block with it.
The extension defines `stc12_read`, which is the opcode actually produced. That is this
section's own rule (*check what is emitted, never what is mentioned*) applied back to itself;
a grep for the name alone would have reported a defect that does not exist.

The history below is kept because the METHOD is worth more than the verdict, and because
§5.1a's "gate it inside one repo so it cannot skip" is the pattern to reach for the next time
a check needs two checkouts.

### 4.6 smallerc-wasm dist: computed-URL blindness only — the caller is wired (2026-09-05)

`smlrc.js` and `smlrpp.js` under `lib/smallerc-wasm/dist/` are Emscripten output, loaded by
`lib/smallerc-wasm/compiler.js` as `import(/* webpackIgnore: true */ resolve('<name>'))`. That is
exactly §4.2's situation and is closed for the same reason: the specifier is a function call, so
no import scan can ever follow it. Those two glue files are all that stays listed.

**The second half of this section was wrong and is withdrawn.** It said nothing imported
`compiler.js` because the assembler "is MASM-dialect and rejects that output on line 1
(measured 2026-09-04)". The NASM front end landed in `bw-board/i8086-asm.js` the same week and
nobody re-measured. Re-measured 2026-09-05 by `test/smallerc-to-i8086-asm.test.mjs`, which
prints its tally on every run: **five of five** programs `test/smallerc-wasm.test.mjs` compiles
assemble unwrapped, and `detectDialect` reads every one as NASM without being told. The only
refusal on that corpus is the CPU variant (`"LEAVE" is an 80186 instruction`), which is why the
C route passes `variant: '80186'` and `setcc: true`, both argued for in `bw-asm/assemble-route.js`.

`compiler.js` now has a real caller: `bw-asm/assemble-route.js` (`compileC8086` is the pipeline,
`requestCBuild` the device decision), reached from the C tab's ▶ Run C on 8086. Zero network
requests on that path — the hosted service has no 8086 C back end, so there is nothing to fall
back to and the route does not try.

**Where the pipeline still ends, named:** `float` compiles and does not assemble (smlrc emits
`extern ___fixsfsi` for its soft-float runtime; the flat-image assembler has no second module to
find it in), and `long` is refused by smlrc itself (`-seg16` has no 32-bit integer). Both are
pinned as named expectations in the test. Matrix cell C × 8086: native, local, simulator only
(`.COM` export for real hardware is plan task N10).

### 5.1 The stc12 extension lite ships is missing 8 opcodes the emitter emits — FIXED

A gate that needs two checkouts side by side runs on a developer machine and **skips in CI**, where
only its own repo is cloned. It then reports as a pass forever. This is the `SKIP`-reads-as-success
failure from §"Working rules", promoted here because it is currently hiding a shipped defect.



Measured 2026-08-22 on a machine with both checkouts:

```
sb3-creator emits            28 stc12_* opcodes  (derived from sb3Creator.js, not hand-listed)
lite's bundled extension     20 blocks           overlay/scratch-vm/src/extensions/crispstrobe/stc12/index.js
sb3-creator reference copy   30 blocks           reference/extensions/stc12.js  — has all 28
```

Missing from the copy lite ships, present in the reference:

`stc12_whenkey` · `stc12_seg_shownum` · `stc12_seg_showdigit` · `stc12_seg_setsegs` ·
`stc12_seg_clear` · `stc12_led_set` · `stc12_led_only` · `stc12_keypad`

**One** shipped gallery example emits them: **`79-a2-sampler`** (`DEVICE STC89C52RC`, which uses
the same `stc12` extension id). This entry first said three, naming `77-keypad-keyshow` and
`78-a2-calculator` too. That was wrong, and wrong in an instructive way: it came from grepping the
`.bw` sources for verb *text*, which finds the words without establishing that they lower to those
opcodes. Transpiling each example to `.sb3` and reading the emitted opcodes shows only
`79-a2-sampler` producing `stc12_keypad`, `stc12_led_only`, `stc12_seg_clear`, `stc12_seg_shownum`
and `stc12_whenkey`. Check what is emitted, never what is mentioned.

Two independent methods agree, which is why this is stated as fact and not suspicion: executing the
bundled extension's `getInfo()` yields 20 blocks, and grepping the file finds those opcode strings
absent entirely. The device-gating trap was checked and excluded — gating in that file uses
`hideFromPalette`, which keeps a block defined; these are not defined at all.

**What the app does with an undefined opcode — measured, and the answer is nothing.** The project
loads clean. The VM pushes the block as an operation and the GUI does not assert on the unknown
type in the path that matters; every layer fails quietly. There is no downstream layer that will
complain on a learner's behalf, which is exactly why the fix had to put the opcodes into the
shipped extension rather than rely on an error surfacing.

**FIXED** — the bundled extension now defines all 28 emitted opcodes (20 blocks -> 30).

### 5.1a AMENDED 2026-08-23 — the count above is wrong, and the gap is wider than stc12 (both halves now FIXED)

Now measured by a gate that runs in lite's own CI on every push
(`test/example-vm-execution.test.mjs`), so this no longer depends on a second checkout being
present. Full detail: `docs/EXAMPLE-CORPUS-FINDINGS.md`.

- **One example is affected by the stc12 gap, not three.** `79-a2-sampler` authors
  `stc12_whenkey`, `stc12_keypad`, `stc12_seg_shownum`, `stc12_seg_clear`, `stc12_led_only`.
  `77-keypad-keyshow` and `78-a2-calculator` author only `stc12_setport` and `stc12_tableindex`,
  and the bundled extension defines both. What those two hit is a *referee* limitation — lite's
  trace oracle does not speak `stc12_setport` — which is a different problem with a different fix.
  Worth correcting because the §5.1 count is what decides how urgent the re-vendor is.
- **A second, unrecorded instance of the same shape, affecting seven more examples.** The emitter
  emits eleven `devices_oled*` / `devices_tft*` opcodes and **neither lite's bundled `devices`
  extension nor sb3-creator's `reference/extensions/devices.js` defines one of them.** Both copies
  stop at the LCD verbs. Unlike the stc12 half this is not a vendoring lag — there is nothing
  upstream to vendor. Affected: `55-oled-hello`, `70-calculator`, `70-calculator-simple`,
  `72-pico-oled-hello`, `73-voltmeter`, `75-battery-tester`, `51-tft-pixels`. Three of them reach
  no extension method at all, so the thing the example exists to show does not happen.
- **The open question is answered for node, not for the browser.** With the bundled extension
  registered, `vm.loadProject` neither drops the blocks nor fails: 79-a2-sampler loads all 51 of
  its blocks and the undefined ones are simply never dispatched. But node's `sb3.js` keeps
  unknown-prefix blocks where the browser drops them, so the browser answer still needs a headless
  browser run. That is why the gate covers this class STATICALLY — comparing emitted opcodes
  against the bundled extension's `getInfo()` and methods — rather than by watching the VM.
- **The general fix §5.1 asks for, applied.** Option (a): the comparison now runs entirely inside
  lite, between lite's emitter and lite's extensions, so both inputs are always present and the
  gate cannot skip. **The sentence that used to end this bullet — "sb3-creator's
  `test/stc12-conformance.test.mjs` still carries `skip: availableCopies < 2` and still reads
  as a pass in its own CI; that one is unfixed" — is FALSE, and has been since sb3-creator
  `517c146` ("Make the stc12 conformance gate unable to skip: vendor what the siblings ship").
  Corrected 2026-08-30 at sb3-creator `6d15d2a`, by reading the file rather than the note.**
  That repo took option (b) of the three below: the gallery and lite copies are vendored as
  pinned snapshots under `test/fixtures/downstream/`, so the comparison runs in every
  environment with no skip branch at all, and `MANIFEST.json` asserts the per-snapshot
  `expectedMissing` set EXACTLY — a new gap fails, and so does a gap fixed upstream without
  re-vendoring, which stops an exemption outliving its cause. One `skip` remains in that file
  and it is the opposite shape: `…: vendored snapshot matches the live sibling checkout` adds a
  drift check where a sibling happens to be on disk, and its own comment says "it adds a check,
  it is not the check". Both halves of the gap this section names are therefore closed; only the
  §3.5 item 6 work (the eleven `devices_oled*`/`devices_tft*` opcodes) is still open, and that
  was never a skipping-gate problem.

**Why CI never saw it** (history — the mechanism described here was removed by sb3-creator
`517c146`; kept because the failure mode is the lesson). `test/stc12-conformance.test.mjs` USED TO
find copies at `../../lego/brickwright-lite/…` (bundled), `../../extensions/…` (gallery) and
in-repo (reference), carrying `skip: availableCopies < 2`. sb3-creator's CI clones only
sb3-creator, so exactly one copy existed and the test skipped with "need two copies to compare" —
indistinguishable, in a green run, from a comparison that passed. It hid a bundled extension that
was eight opcodes short for five days, with one shipped example quietly inert.

**The general fix, which matters more than this one bug:** a cross-repo gate must either (a) check
out its sibling in CI, or (b) vendor a pinned snapshot of what it compares against so the
comparison is always possible, or (c) fail — not skip — when its inputs are absent, on the grounds
that a gate nobody can run is a gate nobody should trust. Pick per gate and write down which.
Audit the other cross-repo gates for the same shape before assuming this is the only one.

## 6. Schematic corpus gates — LANDED 2026-08-21, know what they do and do not cover

`scripts/render-schematic.mjs` + `test/schematic-*.test.mjs` now render every
`circuit*.json` — **1,034 variants** — and fail the build on non-zero wire/symbol crossings or
symbol overlaps. Reviewed byte-stable SVG baselines live in `docs/schematic-baselines/`.

Know the boundary, because the campaign that built these already tripped over it once: an earlier
246-file pass covered only each example's *default* circuit and checked size/overlap, and a Pico
motor example exposed that it never asked whether a wire crossed a foreign symbol or whether a
terminal met the artwork it named. The current gate covers **mechanical legibility** across all
variants. It does not assert that a schematic is *electrically* the same circuit the simulator
solves. That is the next gate, not a solved problem.

---

## Working rules that keep costing people time

- **Measure layout, do not reason about it.** `npm run probe:layout` (Firefox, the browser this is
  actually used in). Four layout fixes were shipped wrong by reading CSS before it existed. Add an
  invariant for every layout bug fixed.
- **Check the version badge before believing a bug report.** Click the commit next to the logo.
  Three rounds of "still broken" were builds that predated the fix.
- **Stage explicit paths.** Other sessions share this checkout and run `git add -A`.
- **`$grid-unit` is scratch-paint only**; scratch-gui's `units.css` has `$space`.
- **Node cannot reproduce the extension-block deserialization bug** — that class needs a headless
  browser test.
- **A skip is not a pass, and neither is a green cross-repo gate.** §5 is the standing example.
  When a test can only run in some environments, make it say so loudly in the environment where it
  cannot — a silent skip is the most expensive kind of green.
- **Verify the instrument before believing the measurement.** Three false readings in one day
  (2026-08-20) came from trusting an unverified rig: a mutation applied through a sibling symlink
  never reached the module the import resolved to and made a good test look vacuous; an A/B run
  imported its "before" side from a second worktree whose device registry was never populated, so
  the measured diff was the missing registry and a whole blast-radius report (44 circuits, a
  battery tester reading 0 mV) was pure artifact. When a result is dramatic, check the rig first.
  A second checkout is a second registry, a second everything.
- **`grep` silently skips a file containing a NUL byte, and absence-by-grep is the unsound
  direction.** `bw-board/board.js:1412` builds a composite key as `` `${partId}\0${verb}` ``. GNU
  grep sees the NUL, classifies the whole file as binary, and searches nothing — no error, and no
  "Binary file matches" once the output is piped or counted. `grep -rn setDeviceControl overlay/`
  therefore reports zero definitions of a method defined at line 1376. Detect it with `file <path>`
  (it says `data`); `grep -a` and `readFileSync` both work. The dangerous direction is asserting a
  string is ABSENT: presence-by-grep merely misses, absence-by-grep silently succeeds. Worse, this
  file gained the NUL in the SAME commit that added the symbol (`6f8d11c5c`), so any grep-based
  absence check on it went from true-negative to permanent false-negative in one step — a gate that
  cannot fail, arriving without anyone touching the gate.
- **Pin a belief as a test, or it decays silently.** A test that asserts an absence has to
  re-establish it on every run; a grep establishes it once, at the moment you form the belief, and
  never again. That difference is why an absence pinned as a test went red the day
  `setDeviceControl` appeared, with an actionable message, while the same absence held as a
  remembered grep result survived the change and was still being repeated to other sessions hours
  later. The actionable half is the corollary: when you find yourself believing something about
  the code — this method does not exist, nothing calls that, only these kinds are addressable —
  that belief is cheap to pin and expensive to leave unpinned.
- **A confident correction from a peer is a claim, not evidence — recompute before conceding.**
  2026-09-04, filed as D-METHOD1 in `docs/WAVE-OPEN-DEFECTS.md`. Two counts (38 and 26) were
  correct, were contradicted by another session with more confidence than working, and were
  withdrawn — and then a MECHANISM was invented to explain the error that had not been made. That
  second step is the serious one: fabricating a plausible cause for a non-existent mistake puts a
  false fact into a shared ledger, where the next reader has no way to tell it from a measured one.
  Peers here are sessions of the same model with the same failure modes and no privileged view of
  your working directory. The rule is cheap: re-run the count, quote the command and its output,
  and only then agree or disagree. Agreeing costs nothing at the time and is the most expensive
  thing in this file.

- **Say which window you measured.** Same day, same ledger: a 40-pair window of the corpus
  differential was published as though it were the whole 176-pair corpus, so "zero unexplained"
  was true of the window and false of the corpus (the real figures were AGREE 94 / SKEW 5 /
  DIFF 15). A number without its denominator is not a smaller claim, it is a different one.

- **When a result reverses, ask whether the SUBJECT moved before blaming the instrument.**
  2026-08-23: a finding that twelve extension actuators guarded on a board method defined nowhere
  was correct at `3e87340f5` (0 mentions, no NUL). Re-measured after `6f8d11c5c` it read the same
  way for a different reason, and the retraction — issued to three sessions — destroyed a true
  result. "Verify the instrument" does not catch this one; the tree changed underneath. Record the
  sha a measurement was taken at, and diff the subject before revising the conclusion. Corollary:
  **two agents agreeing is not two instruments agreeing.** Corroboration requires a different
  METHOD, not a different person — the same day produced a bench count of 1092 offered as
  confirmation of a circuit count of 1034.
- **`board.resistance(a, b)` is directional by design.** `b` becomes the solver reference and gnd
  symbols are deliberately inactive for the solve (`mna.js` ~313 and ~373), so that a dangling gnd
  cannot become a shunt path in the T-network test. Consequence: probing with ground as `a`
  fragments the network. Measured on 22-series-parallel, power off: `resistance(+, -)` = 2191.60 Ω,
  `resistance(-, +)` = 333 MΩ, while a non-ground pair is symmetric (470.0 Ω both ways). Probe
  ground-as-`b`, or a whole circuit reads as an open one. Found by bw-lessons, reproduced here.
- **Disk fills silently and looks like a git bug.** 2026-08-22: `git worktree add` failed with
  "No space left on device" at 219 MB free; two abandoned lite worktrees held 2.2 GB. Full lite
  checkouts are ~1.1 GB each. Use `git worktree add --no-checkout` + `git sparse-checkout set docs`
  for doc-only work, and prune worktrees whose HEAD is merged and whose tree is clean.
