# Every wait in the browser gates: what bounds it, and what nobody counted

2026-08-24, branch `probe/lite-timeout-thresholds`, from `main` at `c552d9332`.

The lite half of the campaign in `sb3-creator/docs/MEASURED-THRESHOLDS.md`. That sweep asks,
of every number that bounds a verdict, **who measured it** — and it stops at lite's browser
gates with a stated reason:

> `brickwright-lite`'s 118 timeouts are almost all Playwright/puppeteer waits in
> `scripts/verify-*.mjs`, which need a built editor and a browser. They are listed and left;
> probing them is a lane of its own.

This is that lane. It reaches two conclusions the individual-probe plan would not have, and
both were available before a browser was ever started.

---

## 1. Why not probe them one at a time

`threshold-probe.mjs` binary-searches a threshold's flip point, and the flip point *is* the
measurement. That is the right instrument for a floor under a corpus: cheap, exact, repeatable.

It is the wrong instrument for a browser wait. Each probe needs a built editor, a browser and a
full page load, so bisecting 119 of them is on the order of **600 browser runs** to learn
something **one run already contains**: how long the thing actually took.

A bound's evidence is the observed duration under it. So: instrument one sweep, and every
literal it reaches gets a number.

`scripts/observe-timeouts.mjs` is a Node module-resolution hook that redirects `playwright` to a
wrapper proxying Browser / Page / Locator. Every awaited call is timed and attributed to the
**caller's `file:line`** — the same key `threshold-inventory.mjs` reports a literal under, so
the two join with no mapping for anyone to maintain. **No call site is edited**, and a run
without `--import` behaves exactly as before (verified by running one gate both ways and getting
the same failure at the same line).

```
OBSERVE_OUT=/tmp/obs.jsonl PROOF_URL=http://localhost:8619/ \
  node --import ./scripts/observe-timeouts.mjs scripts/verify-editor.mjs
node scripts/aggregate-timeouts.mjs --observed /tmp/obs.jsonl
```

---

## 2. The census, and the population nobody counts

`scripts/aggregate-timeouts.mjs --census` — static, no browser, acorn not grep.

|  | bounds (`timeout: N`) | fixed sleeps (`waitForTimeout(N)`) | sleeping per run |
|---|---|---|---|
| run by CI | 26 | 64 | **61.9 s** |
| runnable, not in CI | 53 | 130 | 192.2 s |
| `_tmp-` scratch | 40 | 55 | 155.5 s |
| **total** | **119** | **249** | **409.6 s** |

The 119 agrees **exactly** with `sb3-creator/scripts/threshold-inventory.mjs`, which was written
independently and by someone else. That agreement is what makes the 249 believable, because the
249 is a population that inventory does not collect at all.

### Finding A — 40 of the 119 are in files named `_tmp-`

Ten tracked scripts whose names say they are temporary hold **a third of the entire "unmeasured
timeouts" population**, plus 155.5 s of sleeps. Nothing runs them: not CI, not `npm test`, not
`package.json`.

So a third of the population costs nothing to leave unmeasured, and saying so is worth more than
measuring it. `test/wait-census.test.mjs` ratchets the count so they cannot multiply. Deleting
them is somebody else's call — several may still be useful probes — but a file named `_tmp-`
that outlives its afternoon is not temporary, it is debt with a misleading name.

### Finding B — the sleeps outnumber the bounds two to one, and no inventory sees them

The threshold inventory counts `timeout: N` and not `waitForTimeout(N)`. **That is correct by
its own definition** — a fixed sleep bounds nothing and decides no verdict. But *correct by
definition* is not *not worth counting*, and the definition is precisely why nobody has ever had
to justify one.

A fixed sleep is a guess about how long the app needs, and it is the one kind of guess that
**cannot be checked by watching**: it costs exactly what it was given, every time. Timing it
returns the literal back.

- too short → a flake nobody can reproduce;
- too long → wall-clock on every CI run, forever.

Neither shows up anywhere. The five CI browser gates spend **61.9 s asleep per run by
construction**, before the app is asked to do anything.

An outside observer cannot measure these. It can refuse to let the total grow silently, which is
what `test/wait-census.test.mjs` does — ceilings at the measured values with zero headroom, and
a stated procedure for moving them (down freely, up only with a reason).

---

## 3. What the instrument had to survive to be trusted

Three ways this could have reported a clean sweep over nothing, all three hit for real:

**The wrapper wrapped nothing.** The first two versions keyed on `constructor.name`. Playwright
ships bundled, so the runtime names are neither stable nor documented: a Browser reported
`Browser2` through one path and `''` through another, and a Page is `_Page`. Matching `Page`
wrapped the Browser and nothing below it — **two calls recorded out of hundreds**, and a summary
table would have called that a sweep. It duck-types now: what the object *does*, not what it is
called. That is the grep-hit mistake in miniature — a name found by inspection is not a
contract, and three spellings of one class are indistinguishable from three classes.

**The hook might not install at all**, which produces an empty file — and an empty file is what a
broken instrument and a clean sweep look like alike. Every run writes an `installed` marker
before any browser exists, and the aggregator refuses a file without one, and refuses one with
zero bounded observations.

**The "run by CI" bucket could be too small.** The first draft of that resolution scanned the
workflows for `node scripts/x.mjs` only, and I wrote a comment claiming the `npm run` expansion
had fixed a ~40 % undercount. It had not: `grep -rn 'npm run verify' .github/workflows/` returns
nothing, CI spells all five browser gates the literal way, and adding the expansion moved the
counts by **zero**. The claim was written before it was checked. The expansion stays as cheap
insurance and the comment now says it currently earns nothing.

And one in the ratchet itself: the first ceiling was `61_900`, read off the report's rounded
"61.9 s". The true total is `61_930`, so the gate went red **on the very tree it was measured
against**. A threshold whose evidence is a formatting decision is not measured — and it fails in
the direction that looks like a real finding.

Mutation-proved 4/4 (`node --test test/wait-census.test.mjs` after each edit):

```
+9 s of sleep in a CI gate ............................ RED
a new _tmp- script carrying a wait .................... RED
the sleep detector edited to match nothing ............ RED  (instrument test)
the census's parse-yield guard disabled ............... RED, exit 1
```

---

## 4. The observed sweep

**Status: queued, not run.** The sweep needs a built editor, and this repo's own guard
(`scripts/check-system-load.mjs`) reports **6.1 load per CPU against an allowed 1.5** on a box
running several agents at once. It refuses the build, and it is right to: a p90 measured there
is a number about the box, not about the app — the same discrimination the CI timeout
discriminator makes, for the same reason.

What the instrument produces, from the one gate run so far (`verify-view-buttons` against an
existing build, for wiring validation only — see the caveat below):

| site | literal | observed | headroom |
|---|---|---|---|
| `verify-view-buttons.mjs:33` `page.goto` | 60,000 ms | 223 ms | **269×** |
| `verify-view-buttons.mjs:41` `page.reload` | 60,000 ms | 182 ms | **329×** |
| `verify-view-buttons.mjs:67` `locator.getAttribute` | *(none — inherits 30 s)* | 30,022 ms, **timed out** | — |

The third row is the most informative kind of observation there is, and it is also the caveat:
that gate **fails against the build available on this box while passing in CI**, so this run is
evidence that the instrument works and is *not* evidence about those two thresholds. The
measured p90s will come from a sweep against a build made in this worktree, named by its commit.
Publishing the first two numbers as the answer would be the exact defect this campaign is about:
a well-formed measurement of the wrong thing.

---

## 6. Found by accident, and bigger than this lane: a suite that cannot be built reads as green

`test/wait-census.test.mjs` shells out to `aggregate-timeouts.mjs`, which imported `acorn` —
present on a developer box that ran a root `npm install`, absent in CI, which installs into
`packages/scratch-gui` and never at the root. So in run **32779945069** the `describe` body threw
while the suite was being **constructed**, and the runner printed:

```
not ok 662 - the wait census: fixed sleeps are counted, and may only shrink
    failureType: 'testCodeFailure'
    error: Cannot find package 'acorn' …
# tests 1014   # pass 1013   # fail 0   # skipped 1
```

**`# fail 0`, and the step went green.** The build failed later, at my own measurement step, for
the same missing import — which is the only reason this was noticed at all. Had the aggregator
been called from nowhere but the test, the run would have been entirely green with a gate that
never ran.

A construction failure is the worst kind to lose. A gate that failed found something; a gate
that could not be *built* found nothing and cannot have, and a green line says it did. This repo
has already found five gates that could not fail. This is one that could not be assembled.

What is established, and by what:

| claim | evidence |
|---|---|
| CI printed `not ok`, counted `# fail 0`, and the step concluded `success` | run 32779945069 log + `gh run view --json jobs` step conclusion, node 22.23.2 |
| the same shape exits **1** on node 20.20.2 | minimal repro (a `describe` whose body throws, plus one passing test) run locally |
| so the miscount is version-independent; the **exit code** is not | both of the above — I had no node 22 to test on directly, and say so |

The fix is not to trust the summary. `build.yml`'s unit-test step now tees the TAP stream and
fails on any `^not ok ` line the summary did not count, with the reason in the error. Proved
both ways against the minimal repro (caught 1 / clean), and against the archived log of the run
that produced it: exactly 1 line, exactly the right one.

Two dependency fixes came with it: the aggregator now resolves `acorn` from the copy webpack
already commits under `packages/scratch-gui/node_modules`, so it needs no install anywhere, and
that is verified by deleting the root install and re-running.

---

## 5. Reproducing

```bash
node scripts/aggregate-timeouts.mjs --census          # findings A and B, no browser
node --test test/wait-census.test.mjs                 # the ratchet

# the sweep, once the load guard passes
npm run integrate && (cd packages/scratch-gui && NODE_ENV=production npm run build)
(cd packages/scratch-gui/build && python3 -m http.server 8619 &)
for g in verify-circuit-ux verify-circuit-rendering verify-view-buttons verify-editor verify-debug-dock; do
  OBSERVE_OUT=/tmp/obs.jsonl PROOF_URL=http://localhost:8619/ \
    node --import ./scripts/observe-timeouts.mjs scripts/$g.mjs
done
node scripts/aggregate-timeouts.mjs --observed /tmp/obs.jsonl
```
