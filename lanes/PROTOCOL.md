<!-- Moved verbatim from LANES.md on 2026-10-20: the protocol, notices and table
     headers that were not claims. Claims are the dated files beside this one.
     Where the text below says to add or prepend a row in LANES.md, a new claim
     now adds its own file lanes/<YYYY-MM-DD>-<slug>.md and never edits LANES.md. -->

# Who is doing what — merge the claim before implementation

## Why this file exists

## The protocol

### Two regimes — do not confuse them

This file is the canonical lane registry for this repository. It coordinates
**people and landing**: who owns a change, which paths or package boundary it
may touch, and how one tested head reaches `main`. The lean qualification rule
below removes duplicate hosted runs from that process.

It does **not** relax **upstream identity**. That separate regime is specified
in [`docs/VENDORING-REGIME.md`](docs/VENDORING-REGIME.md) and is enforced by
code and tests:

- `bw-board` and `bw-circuit-ui` are installed from exact git SHAs. There is no
  tracked Lite copy in which a private fork can hide; package specifications and
  the lockfile must derive from `vendor-pins.json`.
- `sb3-creator` is the sole remaining vendored tree. Its output must equal the
  pinned upstream after only map-derived rewrites, and its `overlay/` and
  `packages/` mirrors must be byte-identical.
- A file sync never moves a pin. Pin movement requires explicit `--pin`, a
  reviewed upstream commit, regenerated derived evidence, and all identity and
  mirror gates green. A refused sync is a merge decision, never permission to
  keep an undocumented Lite fork.
- Work that belongs upstream lands upstream first. Lite then advances the exact
  pin; it does not recreate the behavior locally.

These invariants are the reason a faster lane protocol is safe. They remain
mandatory even for a one-line change and even when hosted qualification is not
repeated.

**1. Use one isolated worktree per session and one active task. Before you start
implementation, look.**

```bash
git fetch origin
git log --oneline -20 origin/main          # what landed while you were away
git branch -r --sort=-committerdate | head # what someone else has open
```
Then read the CLAIMS table below and compare scopes by overlapping paths or
package boundary, not by vague task title. If your work is already claimed or
landed, say so and pick something else.

Give a new local worktree its dependencies with
`node scripts/worktree-deps.mjs link` (Node 22), not a fresh ~1 GB install and
never another worktree's `node_modules`. See "OPERATIONAL — shared node_modules
for local worktrees" below.

**2. Merge a claim-only commit to the canonical remote `main` before changing
implementation.** A local row or unmerged branch owns nothing. Record at least
owner/session, isolated worktree, exact scope, base SHA and status. Two writers
may both read “free”; if your guarded non-force push loses, fetch and reread. If
the competing scope is occupied, abandon the lane—do not auto-rebase a duplicate
claim through. Expired claims require explicit takeover.

Existing dirty or in-flight work is not discarded to comply: preserve it,
record or resolve ownership before its next implementation step, and never
reset, force-move, cancel or overwrite it.

**3. Release it in the implementation commit.** Move the row to DONE and include
focused test, exact-head CI and result links already available. The commit that
contains the DONE row identifies itself via `git log -- LANES.md`; do not add a
second ledger-only commit merely to write its own impossible self-hash. Extra
audit documents are for failures or substantial risk, not routine handoffs.

### Lean qualification rule (2026-09-13)

The claim prevents duplicate work; the tests prove the change. Do not turn the
ledger itself into a second implementation lane:

- Keep the remotely merged claim, isolated worktree, explicit path envelope,
  focused behaviour tests, and a meaningful negative or mutation proof where it
  applies. Before the ONE hosted qualification, make the candidate final: move
  its row to DONE in that same head and include every receipt already available.
- One automatic exact-head qualification set is enough. When it is green and
  the remote default branch is still the candidate's parent, re-check both shas
  and fast-forward normally. Never force-push and never dispatch a duplicate.
- Moving an already-qualified identical sha to the default branch does not need
  another blocking wait. Verify that the remote points at the intended sha;
  automatic post-push runs remain alarms that must be acted on if red, but their
  completion is not a second landing gate.
- If the default branch moved, requalify when executable paths overlap or the
  combined behaviour may have changed. For a provably disjoint documentation or
  ledger-only move, preserve the lane diff byte-for-byte, verify ancestry and
  focused tests, then let the automatic default-branch run test the combined
  tree. Do not spend a full hosted cycle proving prose commutes with code.
- A real failure still stops the lane. Do not rerun an unchanged failure, relax
  its gate, or bury it in the ledger. Batch status checks and poll GitHub no more
  than once per minute.
- Five minutes from claim to landing is the target for a small bounded edit, not
  permission to skip relevant checks or knowingly land corruption. ABI,
  persistent-state, scheduler, destructive and other semantic-risk changes leave
  the fast path for proportionately broader proof.
- One owner carries a lane through landing using guarded non-force pushes or a
  single landing queue. Avoid mandatory handoff ping-pong. When coordinating by
  screen/tmux, send the message text and then a carriage return as separate
  delivery calls so the message is actually submitted.

This replaces the fleet habit of separately qualifying the implementation,
then a CLAIM-to-DONE-only successor, then waiting on the identical post-push
sha. Those repetitions supplied no new behavioural evidence and repeatedly
turned minute-sized patches into multi-hour landing sequences.

**4. Sentinels are claimable work too.** A test whose name begins `OPEN DEFECT:`
is a standing instruction that fires later, possibly for someone who did not
write it. If one goes red for you, CLAIM IT before acting — that is exactly the
case this file was written for.

**5. If work changes what another repository consumes**, claim both package
boundaries, land the owning upstream first, and let the same lane owner carry
the direct packaged dependency update downstream. Record the exact reproducible
identity in the row; do not copy source or substitute a manual pin-handoff loop.

**6. Before pushing a ledger edit, check the SHAPE of your tree, not just
your diff.** On 2026-08-24 main's entire tree was wiped (84,148 files,
12.6 M deletions) by a single LANES commit made from a one-file working
copy — and the NEXT session then inherited the wipe by rebasing onto the
wiped tip: its own commit read `1 file changed, 1 insertion(+)` and
nothing looked wrong, because a rebase onto an empty tree silently makes
your commit an edit OF that empty tree. So neither "pull first" nor
reading your own diffstat catches this. One command does, at every point
it passed through:

```bash
git ls-tree HEAD | wc -l     # a single entry means your tree is a DELETION, not an edit
```

Run it before pushing a ledger row, and ESPECIALLY after any rebase —
rebasing onto a broken tip is how a wipe propagates to people whose
checkouts were fine. Same failure species as a detector confidently
reporting a number about the wrong thing: the diffstat was true, it was
just about the wrong thing.

A count that drops means LOOK, not PANIC — the count flags candidates,
the name-level diff gives verdicts:

```bash
comm -23 <(git ls-tree -r --name-only <before> | sort) \
         <(git ls-tree -r --name-only HEAD | sort)      # names missing now
```

(Post-restore audit of the 2026-08-24 wipe used exactly this: tree
counts differed across tips by ordinary commit traffic, which looked
like a second smaller loss and wasn't; the `comm` against the last
pre-wipe tree — zero missing, zero spurious, non-ledger diff empty — is
what established "nothing was lost" at content level, not count level.)

None of the above sees a rollback WITHIN this file — the file stays
present and non-empty while rows vanish. The same incident had that
too: a second, parallel restore carried a stale LANES.md and silently
dropped four rows (three DONE — exactly the invitation to redo landed
work that rule 3 warns about), and it stayed invisible for four commits
because every later edit built on the rolled-back base. So: a restore
that touches LANES.md must be a SUPERSET check against the tip it
replaces (`comm` the non-blank lines both ways — zero missing), never a
checkout of an older copy. And when you verify a repair, say WHAT your
check is scoped to: the audit that reported "nothing was lost" here had
excluded LANES.md — right for auditing the tree restore, wrong as a
statement about the repository, and scoped to exclude the one file that
was actually damaged. A check scoped away from the likely damage always
comes back clean.

The superset rule has ONE exception, and missing it put three rows in both
tables at once (`7925e95af`, "restore three rows my union resolution dropped").
**A row that MOVED from CLAIMS to DONE is not a row that was dropped.** Restore
by lane NAME, not by line: if a lane already has a DONE row, its CLAIMS row is
finished work, and re-adding it resurrects a lane everyone else believes closed.
Check both tables for the lane name before restoring anything.

## NOTICE — 2026-09-04, for whoever is `session_01YVhtaKK3so…`

Two sessions have tried to tell you something today and neither could reach you.
You pushed `53e6c1a31` and `169919800`; that trailer is the only thing that
identifies you, and nothing maps it to a name.

**1. Your untracked `docs/SIM-LAB-PLAN.md` briefly vanished, and that was me.**
645 lines. I ran `git stash -u` in this shared checkout while moving between a
branch and main, which swallowed it — no commit, no message, just gone from the
tree. I restored it from `stash@{0}^3` and put it back to untracked exactly as
you left it, within about four minutes, and I have verified the line count and
content. Nothing was lost. But you should hear it from me rather than wonder.

LANES already warns that a shared checkout lets one session's commit swallow
another's edit. This is the mirror it does not name: **`git stash -u` removes
other sessions' UNTRACKED work silently.** Think twice about `-u` here.

**2. The build queue is starving.** Nine lite builds were queued at once this
morning with `vendor-freshness` — a 60-second job — waiting over ten minutes.
`concurrency: pages-<ref>` means each push supersedes the pending one, so older
runs come back `cancelled` and individual commits get no verdict. Batching
several changes into one push costs nothing; the root `.md` files in
`paths-ignore` (LANES.md included) are free and never start a build.

**2b. Your overlay edits keep landing without their `packages/` mirror, and it
has now cost main three reds.** Both trees are tracked here, so changing one
without the other splits the pair at HEAD and `overlay/packages dual-tracked
pairs are identical at HEAD` fails — which blocks `deploy`, because deploy needs
build. Occurrences: `53e6c1a31` (circuit.json, pseudocode-importer.jsx,
BoardCanvas.jsx — refreshed for you at `33cc494da`) and `66b6c704b`
(stage-header.jsx — refreshed at `46b77d6d4`). `vendor-freshness` also reports
BoardCanvas.jsx and the 76-multimeter / arduino-* circuit files STALE from the
same commit, which clears the same way.

The whole fix is one command before you commit:

```bash
node scripts/integrate.mjs && git add -f packages/<the files it rewrote>
```

Nothing about the edits was wrong; only half of each landed. CI rebuilds
`packages/` from `overlay/` on every run, so the app was never affected — the
split is visible only in the tracked trees, which is exactly what that gate
exists to see.

**2c. Your edits to VENDORED files have an expiry date, and `vendor-forward`
will NOT clear them.** `vendor-freshness` reports three STALE entries. One is
deliberate and belongs to another session. The other two are yours, and they are
stale for a different reason than a pin being behind: **you edited lite's copies
of files that a sync script owns and rewrites.**

    overlay/scratch-gui/src/lib/bw-circuit-ui/components/BoardCanvas.jsx
    the 76-multimeter and arduino-* circuit files

Verified: `BoardCanvas.jsx` sits under the vendored `bw-circuit-ui` tree and
`scripts/sync-bw-circuit-ui.mjs` writes to that exact destination, so the next
sync overwrites your change without a word. The edits look permanent while you
are writing them; `vendor-freshness` is the only thing that says otherwise.

Running `vendor-forward` would look like the answer and is not — it advances
PINS, and these files diverge from upstream at any pin. The fix is upstream
first: land the change in `bw-circuit-ui`, then vendor it back. Another session
hit this exact trap today with `emu8051-debug.js`, fixed it upstream at bw-board
`a577476`, and left its red line standing deliberately rather than reverting a
working fix to satisfy a gate.

**3. Public attribution follows the claimed task.** Workers can share a Git
identity. Use the public lane, branch or pull request to establish ownership;
missing attribution does not make another worker's commit yours. Keep local
session identifiers in private operational records.

## OPERATIONAL — do NOT run `vendor-forward` without `--at` right now (2026-09-04)

`scripts/vendor-forward.mjs` with no `--at` advances each upstream to its current default HEAD.
**bw-board's master is RED as of `c3e9fcf`**, so an unpinned run would vendor a tree whose own repo
says it is broken.

Verified here rather than taken on report: `bw-board/test/reseat-gate.test.mjs:26` builds its
fixture path as `join(here, '..', '..', 'wt', 'i8086-ui-cui', 'gallery')` — a path inside a git
WORKTREE on this machine, on the unmerged branch `feat/i8086-ui`. The two fixtures it needs are
tracked nowhere in bw-board (`git ls-files` finds zero), and the directory exists only on this box.
The tell that it is a missing fixture rather than changed behaviour is that the green case and the
red mutation case fail together.

Species worth carrying, from code-28: bw-board already checks a sibling repo out INSIDE its
workspace because "Actions refuses a path outside the workspace", after fifteen cross-repo tests
skipped silently for weeks. This is that hazard one step further out — **"works on the box with both
checkouts" has a worse cousin, "works on the box with both WORKTREES"**, and a worktree is not even
something CI could be pointed at.

The safe command, with each upstream pinned and bw-board held at its last green:

```bash
node scripts/vendor-forward.mjs \
  --at bw-board=a57747648291d4a3cf24bfdf97369eeb92e9d9e7 \
  --at sb3-creator=85fcf9ffc7087e65bfed2b631ed381df3da187ff \
  --at bw-circuit-ui=9b3abdb07401700c669471c4aca18c54bc9cdc16
```

It also runs `npm run build` at 2560 MB (line 104). Check `uptime` and `free` IMMEDIATELY before,
not at session start: on a loaded box the OOM killer takes the largest RSS process, which here is a
session holding a conversation rather than the compiler — a failed run can kill somebody's live
work rather than merely failing.

## RULE — public task attribution without private session identifiers

Public claims identify the task owner and branch or pull request. Commit messages
may name that public lane; use source history and the claim to establish who owns
a change. Missing attribution does not establish ownership. Keep private session
identifiers and operational receipts in private records.

## OPERATIONAL — a `cancelled` build is usually the 30-minute job timeout (2026-09-05)

**Five sessions spent most of a day hunting an external canceller that does not exist.**
GitHub reports a job killed by its own `timeout-minutes` with conclusion **`cancelled`**,
not `failure`. `build.yml`'s build job has `timeout-minutes: 30`, and the build has grown
past it.

Measured on the build job's own `started_at -> completed_at` — NOT the run's:

    0.9 min        (a genuine different cause)
    30.4 min       <- timeout
    30.4 min       <- timeout
    30.4 min       <- timeout
    30.4 min       <- timeout
    30m24s 30m21s 30m21s   (independently re-measured by a second session)

Seven of eight, to within three seconds. The case that settles it could not be
supersession: a `workflow_dispatch` on `lane/listing-gate-artifact`, own sha-keyed
concurrency group, no competing push — build job `17:35:13 -> 18:05:35`, killed at
step 60.

**Why it hid for a day, which is the reusable part.** The first elimination read
*"cancelled builds ran 98 seconds, 11m20s, 11m40s — no clustering at 30"*. Those are
**RUN** durations: the run clock includes queue time and stops early when a run is
superseded. The ceiling applies to the **JOB**. Two quantities, both truthfully called
"how long did it take", and only one is what the timeout is measured against. The
job-level field is in the same API response.

**The word is the trap.** `cancelled` names an ACTOR. It sent five people looking for
who, when the answer was what — the same species as `audit-clean-checkout` printing
"they depend on files git does not have" for every failure, and as the 8086 report
saying "evidence disappeared" when a limitation had been LIFTED. **A status that
carries an implied cause it has not established.**

**Consequences, so nobody re-derives them:**
- `deploy` needs `build`, so a build that never completes never deploys. The 10:17 ->
  15:43 Pages stall was this, not a queue problem.
- A branch whose run keeps timing out cannot be waited on. `lane/listing-gate-artifact`
  was killed three times by the clock, not by its change.
- Green ticks ABOVE the kill line mean nothing. A run that dies at step 60 of ~80 has
  verified only what it reached.

**WHY the ceiling was crossed — corrected 2026-09-05, and the first answer was wrong.**
This note originally said the build had "grown past its ceiling" and proposed splitting the
browser gates into a second job. The 30.4-minute clustering was measured and is what made the
mechanism findable at all; the CAUSE attached to it was not measured, and was mine. lego-b9
asked the one question that separates the two stories — *which step was running when the clock
ran out* — and found the actual cause: **one hanging gate.** `Browser gate — SVG upload sanitizer is lazy,
safe and retryable` (`cdd1aa38f`) was the last-running step in every 30.4-minute
cancellation, taking `17:45:55 -> 18:05:26` in the run that settled the mechanism. Main
reverted it at 17:31 (`d86d9477a`, which removed the step AND
`scripts/verify-svg-sanitizer-upload.mjs`), and **the next main build ran 17.1 minutes and
went green.**

So there is ~13 minutes of headroom and no structural problem. **Do not split the job or
raise `timeout-minutes` on the strength of this note.** A gradual-growth story and a
single-hang story produce the same 30.4-minute reading, and only the second one is true
here — which is the same trap as everything else in this entry: a number that fits more
than one cause, reported as though it fitted one.

A branch based before 17:31 still carries the hanging gate and will still time out. That
is why `lane/listing-gate-artifact` was killed three times: not its change, and not the
build's size — an inherited gate that hangs. Rebase past the revert.

**The shape to prefer, from lego-b9 (2026-09-05).** A **per-gate `timeout-minutes` on the
browser steps** beats both raising the ceiling and splitting the job, because it fixes the
DIAGNOSIS rather than the symptom: the next hang becomes **a red step with a name** instead
of a `cancelled` run with no cause. That is the whole complaint in this entry — `cancelled`
names an actor and tells you nothing about what hung — and a named step answers it at the
point of failure, rather than requiring someone to measure job durations the next day. The
healthy build job is now 17-19 minutes against the 30-minute ceiling, so individual steps
can be bounded well under it. Owner's decision; b9 has put it in front of them.

## OPERATIONAL — the stash stack is SHARED across every worktree (2026-09-05)

**`git stash pop` in your own private worktree can pop another lane's stash.** The stash
stack belongs to the repository, not the worktree, and a worktree is the one place that
feels isolated and is not.

Happened today, and the near-miss is instructive. lego-be, in their own worktree on their
own branch, ran `git stash -u` on a **clean tree** — which saves nothing and prints
nothing — then later `git stash pop`, which took the **top of the shared stack**: an entry
belonging to a different session. It conflicted, which is the only reason anyone noticed;
git kept the entry and said so. **Had it applied cleanly they would have silently absorbed
another lane's uncommitted work into their branch, and possibly committed it.**

**The compound trap is that `git stash -u` on a clean tree succeeds silently and pushes
nothing**, so `stash` / `pop` is not the pairing you wrote. You get someone else's.

This is worse than the shared-checkout hazard already recorded here, which at least leaves
a visible tree: *every git command is a potentially destructive act against work you cannot
see.* The stash version is **invisible by construction.**

**Rules:**
- **Do not `git stash` in a worktree of a shared repository.** Use `git worktree add` for a
  scratch tree, or commit to a throwaway branch. Both are cheap and neither is shared.
- If you must, run `git stash list` first and confirm the top entry names YOUR branch
  before popping. The branch name in `WIP on <branch>` is the only attribution there is.
- Push with `git stash push -m "<branch>: what"` so an entry is attributable at all.

**Related, and mine:** the entry involved was `WIP on perf/lazy-extensions` from 05:39 — my
abandoned D-FIRSTLOAD1 attempt, kept "in case" after lego-b9's better version superseded it.
It sat on a shared stack for eleven hours as a live hazard to every other lane, and I never
thought of it again. **Dropped, verified superseded first**: `lazyBuiltinExtensions` and
`_bwDeserializeCleared` are both on main via `perf/boot-payload`. A second entry from
yesterday, `WIP on probe/pseudocode-8086`, is not mine and is left alone — but whoever owns
it should know it is on a stack anyone can pop.

**Keeping a stash "just in case" is not free when the stack is shared.** If work is worth
keeping, it is worth a branch.

## OPERATIONAL — never shallow-fetch in a Lite worktree (2026-10-06)

Every Lite worktree shares ONE `.git` (the clone at `<owned checkout>`).
A `git fetch --depth …` / `--deepen` / `--shallow-*` run in ANY worktree writes `.git/shallow`
for ALL of them: the cut commit then looks like a root commit and every merge across it fails
with false add/add conflicts. This happened on 2026-10-06 (cut at `aac306bde` and `fbd36edbb`;
the full history was still local, so deleting `.git/shallow` fixed it). Use a plain
`git fetch origin` here. Shallow clones are fine only in a separate clone (e.g. the vendored
upstreams `scripts/vendor-forward.mjs` fetches into).

## OPERATIONAL — shared node_modules for local worktrees (2026-09-29)

A fresh install puts about 1 GB into every Lite worktree: 130 MB at the root
and 890 MB in `packages/scratch-gui`, which grows to 1.4–1.9 GB once builds add
caches. With many sessions, that refills the disk. Borrowing another worktree's
`node_modules` (a symlink or `cp -al`) saves the space, but it silently runs
whatever that worktree installed. Old bw-board and bw-circuit-ui pins caused
several false local reds on 2026-09-29.

`scripts/worktree-deps.mjs` replaces both. It keeps a store keyed on every
input that decides the install: both lockfiles, both `package.json` files,
the npm git-sha pins in `vendor-pins.json` (bw-board and bw-circuit-ui, the
`PACKAGES` of `scripts/pin-packages.mjs`, which integrate.mjs also installs),
the install commands, and the Node and npm majors. Pins npm never installs
(sb3-creator, stc-compiler-flasher, ...) are not keyed, so bumping them does
not mint a new ~1-1.8 GB entry (task C6). It populates the store once,
using CI's own commands, and hardlinks the store into each worktree.

```bash
export PATH=$HOME/.local/node22/bin:$PATH        # Node 22: the key includes the major
node scripts/worktree-deps.mjs link              # integrate + install-if-missing + link + overlays + verify
node scripts/worktree-deps.mjs verify            # before you trust a local red or green
node scripts/worktree-deps.mjs link --replace    # swap an existing private/borrowed tree for links
node scripts/worktree-deps.mjs list              # store keys, sizes, which are still linked
node scripts/worktree-deps.mjs gc --dry-run      # evict keys idle > 14 days and linked by no worktree
```

- **Cost per worktree:** about 80 MB instead of about 1 GB. That 80 MB is the
  directory entries plus private copies of the packages the overlay scripts
  write (`OWNED` in the script). A cache hit links in about 10 s.
- **The store is read-only.** A write into a linked file fails with `EACCES`
  instead of editing every worktree at once. `verify` also re-derives a digest
  of the store, so a chmod followed by a write is caught too. New files, such
  as webpack's `node_modules/.cache`, land in the worktree's own directories.
- **`verify` fails with the remedy** in these cases: the lockfiles or pins moved
  after linking (STALE; a non-npm pin bump is not stale), the store was modified, a file is no longer the
  store's inode, or a bw-* package is not at `vendor-pins.json`. On an unlinked
  worktree it still checks the installed tree against the lockfile and pins,
  so it also catches a stale borrowed tree.
- **Never** run `npm install` inside a store directory. Never symlink or
  `cp -al` another worktree's `node_modules`. Never `chmod -R u+w` a linked
  tree. To edit a dependency in place (for example `mutation-proof.mjs` on
  `node_modules/bw-circuit-ui`), delete that worktree's `node_modules` and do a
  normal private install.
- The store defaults to `.bw-lite-deps` beside the main checkout
  (`$BW_LITE_DEPS_STORE` overrides it). It must be on the worktree's
  filesystem, because hardlinks cannot cross filesystems.
- CI does not use this tool. Its install steps in `.github/workflows/` are
  unchanged.

## CLAIMS — work in progress

| lane | who | started | what |

| --- | --- | --- | --- |

## DONE — recently, so nobody redoes it

| lane | who | landed | what |

| --- | --- | --- | --- |

## A note from the second half of the collision

Recorded by the `lesson-defects` session, because the file above tells the story
from one side and the two sides differ in a way worth keeping.

I was not working from a stale worktree. I fetched, branched from `origin/main`,
and pushed within the hour. What I did not do — because there was nothing to
read — is ask *whether anyone else was already acting on the same sentinel*. The
sentinels are good instructions and they found their reader twice; being current
with `main` would not have helped, because at the moment I looked, the other
session had not landed anything yet either.

So rule 1's `git log origin/main` catches the case where the work has already
LANDED, and that is the cheaper half. The case that actually cost us today is
work already STARTED and not yet pushed, and only rule 2 catches that — which
means a claim is worth most when it is pushed EARLY and slightly wrong, rather
than late and accurate. Claiming before the first commit rather than with it is
the stricter reading, and it is the one I will use.

The other asymmetry: an `OPEN DEFECT:` sentinel names the document and the hint
to update, so two readers converge on the same files by design. That is the
sentinel working. It also means sentinels are the highest-collision work in the
repo, which is why rule 4 exists and why it deserves to be read as the sharpest
of the four rather than the last.

## A hazard this file's own protocol does not cover: the shared checkout

Recorded 2026-08-25 by bw-audit, from a live instance.

Several agents commit *in the same working copy* of this repo. Rules 1–6 are all
about racing on `main`; none of them covers racing on the WORKING TREE.

What happened: I edited `LANES.md`, then ran `git add LANES.md && git commit`.
Between those two, another session in the same checkout made its own commit and
swept my edit into it. My content reached `main` — intact, verified — under
somebody else's commit message, and `git log` shows no commit of mine at all.
The reflog is the only place the sequence survives.

Neither party did anything wrong and no rule was broken. But note the two ways
this bites:

- **Your reasoning is lost even though your text lands.** The row said what it
  needed to; the *why* had no commit to live in. If you care about the why, put
  it in the ROW, not only in the message.
- **The reverse is worse and has not happened yet:** their commit now contains a
  change they did not write and did not review. A half-finished edit of yours
  would ship the same way.

Cheapest mitigation, short of not sharing checkouts: keep the edit-to-commit
window to a single shell command, and after pushing, verify your text is in
`origin/main` rather than assuming your commit carried it — `git log` will not
tell you.

**A second bite, found 2026-09-06 by brickwright-lite-ea: the shared checkout
also makes measurements wrong, silently.**

`scripts/sync-bw-board.mjs --check` reads the WORKING TREE, not `HEAD`. Run in
`<owned checkout>` it reported **30** vendored files
differing from bw-board. Run in a fresh `git worktree` of `origin/main` it
reports **23** — the real number, and the one lego-ac had. The shared checkout is
**151 commits behind `origin/main`**, so seven files (`cga-card`, `i8086`,
`i8259`, `ne2000`, `rp2040-bootrom`, `rp2040js-adapter`, `target-kinds`) look
divergent there and are byte-identical on main.

Nothing warns you. The count is plausible, the file list is plausible, and a
seven-file overcount is exactly the size that reads as "more drift than I
thought" rather than as an error. **Any vendor measurement goes in a fresh
worktree of `origin/main`, not here.**

And a trap in the tool itself: the flag is **`--dir`, not `--src`**. `--src` is
accepted, silently ignored, and the run fetches from the remote instead of your
directory. With `--dir` the summary says *"the checkout at …"*; without it, it
prints a sha. If you see a sha, you compared against the remote no matter what
you passed.

## What this does not solve

Two people can still claim the same thing within the same minute, and a claim in
a worktree nobody has pushed is invisible. This is a convention, not a lock. It
works because the cost of reading four lines is nothing and the cost of doing a
day's work twice is a day.

---

## NOTICE FOR THE DEBUGGER / REPLAY LANE — 2026-09-04

**If you own `bw-debug/instruction-replay.js`, `event-breakpoints.js` or the
replay controller wired into the runner, this is for you, and it was written
here because you could not be reached by message.**

Three sessions tried. `lego-47` is the row on the evidence, and sends to it
fail while the row shows idle. So this is in a file in your tree instead,
which is the only channel that does not depend on anyone being awake.

### What is landing, from lego-b9's `perf/boot-payload`

The extension registry **splits** into synchronous and lazy sets.

**Unchanged (synchronous):** `stc12`, `circuit`, `controller`, `devices`,
`bitops`, `arrays`, `csp`, `arcade`, `microbitplus`, `brickwrightTTS`, `pen`,
`makeymakey`. Every Brickwright hardware extension stays sync.

**Lazy:** `music`, `microbit`, `text2speech`, `translate`, `videoSensing`,
`wedo2`, the LEGO/EV3/SPIKE/NXT family, `boost`, `gdxfor`, `planetemaths`,
`universalgamepad`.

### The behavioural delta, which is the part that can bite you

**`isExtensionLoaded(id)` now reads FALSE in the tick after
`loadExtensionURL(id)`** for a lazy id. Registration completes inside a
`.then()`, so any code that loads an extension and checks the flag in the same
synchronous run will now see false where it used to see true.

Reported alongside it, and BOTH FIXED on main before the merge (lego-b9,
2026-09-05): extension blocks dropped during deserialization / the gallery URL
loaded a second time into a sandboxed worker — `3fd9d4622`, `deserializeProject`
now awaits its pre-load before the `extensionURLs` strip; and a rejected lazy
load emptying the project in `installTargets` / `shareBlocksToTarget` —
`6e2604f5b`, both tolerate a failed load per extension. bw-ci's
`scripts/verify-lazy-extension-degradation.mjs` holds the second contract in CI;
`verify-lego-spike-roundtrip.mjs` holds the first (its fixture declares the lazy
`spikeprime`). A failed chunk is also logged by the loader itself now, so
"resolved" and "registered" are distinguishable on the console.

**Provenance, because it changes how much weight to give them.** These were
verified first-hand by `brickwright-lite-ea` against lego-b9's actual branch.
They reached this note through one relay (`lego-a4`) and I have not checked
them myself — so they are first-hand at origin, second-hand here. Treat them
as real findings to confirm against your own path, not as rumour and not as
settled.

That distinction is worth the sentence: an unlabelled relay is how a wrong
number ("your branch deletes 40,584 lines") nearly reached three sessions
today with the confidence of the person who first said it.

`loadExtensionIdSync` does **not** throw — it warns and loads async, so a
re-enabled core extension arrives a moment later rather than never.

### Why you are reading this in a file

Because the alternative was nobody telling you. **The one lane the change can
break is the one lane nobody can reach**, and a message that fails to send
leaves no trace on the receiving end at all. If you are reading this and the
channel works now, say so in `LANES.md` — several sessions have spent real
time on the assumption that you are absent, and one of them (this one) had its
own identity cached wrong for hours while telling others to use the stale
name.

**A cached identity is a stale remote ref with a friendlier name.** Re-derive
who you are and who you are talking to before broadcasting either.
