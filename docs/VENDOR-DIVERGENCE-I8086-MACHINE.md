# `bw-board/i8086-machine.js` has diverged BOTH WAYS

Discovered 2026-09-04 while trying to vendor the NE2000 into lite.

    lite has that upstream does not:   165 lines
    upstream has that lite does not:    84 lines

**`npm run sync:bwboard` would DELETE the 165.** The tool says so itself and
refuses to guess — *"A difference can mean the vendored copy is BEHIND
upstream, or AHEAD of it, and this comparison cannot tell which."* It is right,
and this file is the case it was warning about.

## What each side has

**Lite-only — a host-renderer optimisation nobody has upstreamed.**
`displayRevision`, a monotonic token bumped on visible VRAM and CRTC-register
writes rather than on every instruction, so the renderer can skip repaints. It
is real work, it is not in bw-board, and **a sync deletes it silently** — the
machine still constructs, the screen just repaints on every frame again and
nobody notices until someone profiles.

**Upstream-only — three things, all landed on master today.**
The NE2000 chip kind and its `REGS` entry; the port-conflict check; and
lego-a4's expanded comment on why the advance schedule must stay lazy.

## What was done, and what was not

**Grafted by hand into lite:** the NE2000 wiring and the port-conflict check.
Both are small, purely additive, and were written by the person doing the
grafting — which is the only reason it was acceptable. Verified afterwards that
`displayRevision` survived, that an NE2000 constructs, and that a conflicting
board is refused.

**NOT done: the reconciliation.** `displayRevision` should be upstreamed to
bw-board so this file can be synced normally again. I did not do it because **I
do not know why it diverged** — whether it is finished, whether the renderer
contract it serves is settled, or whether bw-board's other machines want the
same token. Guessing at someone else's design in a shared file is how the
divergence got here.

## Until then

- **Do not run a plain `sync:bwboard` on this file.** Use `--check` and read
  the direction first. The tool will not stop you; it will only tell you it
  cannot tell.
- **Anything landing in bw-board's `i8086-machine.js` has to be grafted**, by
  someone who knows what the hunk does. That cost compounds: it was four lines
  today and it will not stay four lines.
- **This is the second file in this shape.** `CircuitDesigner.jsx` is 19 ahead
  and 46 behind (see `VENDOR-DIVERGENCE-BW-CIRCUIT-UI.md`). Two is a pattern:
  vendored trees acquire local edits, and nothing warns until someone tries to
  sync.

## The general shape, for whoever meets the third one

A vendored file that is *behind* is an inconvenience — sync it. A vendored file
that is *ahead* is a fork nobody declared. A file that is **both** cannot be
resolved by any tool, because the tool has no way to know which of two changes
was the intended one. The only repair is a person who understands both sides,
and the only prevention is upstreaming local edits while they are still small
enough to remember.

---

# The allow-list below is executable

Updated 2026-09-05. Everything above this line is prose, and prose is what
let this file rot for a day: it recorded a divergence accurately and then had
no way to notice when the numbers changed. They had. It said lite was behind
on three upstream items; all three have since been grafted, and the counts it
quotes (165/84) are now 173/229.

**A document that describes a divergence cannot detect one.** So the list
below is not a description — `test/vendor-identity-i8086-machine.test.mjs`
parses this JSON block and asserts it. Editing the prose changes nothing;
editing this block changes what is enforced.

The technique is one the kerotakis lane put more sharply than I had it:
**assert an invariant BETWEEN two things, never a property OF each.** Two
copies each passing their own suite proves both are self-consistent and says
exactly nothing about whether they are the same, which is the only question
here. The disease is not too few tests on either half; it is that no test
fails unless it touched both.

## What each entry means

- `id` — stable name, quoted by the failure message.
- `why` — why lite has this and upstream does not. Read it before deleting.
- `falsifiable` — **the one sentence a non-programmer could check.** The
  kerotakis lane's rule, and the counter to "green to green, nobody thanks
  you": state the defect in terms of the WORLD, not the diff. "The discount
  was applied per-call" is unrewarding; "the bench says the volcano gets
  warm" is a thing a person can disprove with a finger on the beaker. Same
  change, and only one of them is a story. **If you cannot write this
  sentence, the entry is probably ambient and you have found another gate
  that cannot fail.** If you can, you have both the bug report and the test
  name.
- `contains` — a regex asserted to MATCH the vendored copy and NOT MATCH
  upstream. Containment-style, not a character window: see
  GATES-THAT-CANNOT-FAIL.md on why proximity is not governance.

## What fails, and what that means

- **A sync deleted lite-only work** → the entry's `contains` stops matching
  the vendored copy. Names the `id`. This is the 173-line silent loss the
  prose above warned about, made loud.
- **Upstream converged** → `contains` starts matching upstream too. The entry
  is obsolete; delete it from this block. The doc cannot go stale in this
  direction either, because agreeing with upstream is now a failure.
- **The two vendored copies drifted** → `overlay/` and `packages/` are
  dual-tracked in this repo; both are checked. I created a divergence between
  them once by not force-adding an ignored path.

```json
{
  "upstream": {"repo": "bw-board", "path": "src/i8086-machine.js"},
  "vendored": [
    "overlay/scratch-gui/src/lib/bw-board/i8086-machine.js",
    "packages/scratch-gui/src/lib/bw-board/i8086-machine.js"
  ],
  "liteOnly": [
    {
      "id": "display-revision-token",
      "falsifiable": "The screen redraws on every frame even when nothing on it changed, so the fan spins up on a program that is just sitting at a prompt.",
      "why": "Host-renderer optimisation: a monotonic token bumped on visible VRAM and CRTC writes so the renderer can skip repaints. Never upstreamed. A sync deletes it and NOTHING FAILS -- the machine constructs, the screen just repaints every frame until someone profiles.",
      "contains": "this\\.displayRevision = 0;"
    },
    {
      "id": "display-revision-bump-vram",
      "falsifiable": "Same as above: the picture is right, the machine is just working far harder than it needs to.",
      "why": "The bump must stay GOVERNED by the VRAM address test. Hoisting it out bumps on every write and destroys the optimisation while still reading as present.",
      "contains": "if \\(addr >= 0xa0000 && addr <= 0xbffff\\) \\{?[^}]*?this\\.displayRevision = \\(this\\.displayRevision \\+ 1\\)"
    },
    {
      "id": "display-revision-bump-crtc",
      "falsifiable": "Switching video modes does not refresh the screen, or refreshes it constantly.",
      "why": "Same, governed by the CRTC port range.",
      "contains": "if \\(port >= 0x3b0 && port <= 0x3df\\) \\{?[^}]*?this\\.displayRevision = \\(this\\.displayRevision \\+ 1\\)"
    },
    {
      "id": "display-revision-bump-block",
      "falsifiable": "Loading an image into video memory does not make it appear until something else happens to trigger a repaint.",
      "why": "Same, governed by the block-write overlap test.",
      "contains": "if \\(base <= 0xbffff && base \\+ bytes\\.length > 0xa0000\\) \\{?[^}]*?this\\.displayRevision = \\(this\\.displayRevision \\+ 1\\)"
    },
    {
      "id": "on-instruction-hook",
      "falsifiable": "The debugger will not single-step: you press Step and nothing moves.",
      "why": "Per-instruction hook carrying pcBefore/pcAfter and the cycle delta. The debugger's single-step and the trace view are both built on it.",
      "contains": "if \\(this\\.hooks\\.onInstruction\\) \\{?[^}]*?pcBefore"
    },
    {
      "id": "checkpoint-topology-snapshot",
      "falsifiable": "You save a program on one board, load it on a board wired differently, and it runs as nonsense instead of refusing.",
      "why": "A checkpoint restored into a DIFFERENT machine topology is silent corruption -- same registers, different wiring. The snapshot makes restore refuse rather than half-work.",
      "contains": "_snapshotTopology\\(\\)"
    },
    {
      "id": "checkpoint-refuses-incomplete-state",
      "falsifiable": "You save, reload, and the machine comes back subtly wrong -- a sound still playing, a chip mid-transfer -- instead of telling you it could not save.",
      "why": "canCheckpoint() refuses rather than saving a machine whose components lack a complete state API. THIS IS THE ABSENT-HARDWARE RULE APPLIED TO SAVE STATE: a partial checkpoint restores to a plausible-looking wrong machine, which is worse than no checkpoint.",
      "contains": "canCheckpoint\\(\\)"
    },
    {
      "id": "checkpoint-component-state-api",
      "falsifiable": "A saved file changes by itself after you save it, because it shares memory with the running machine.",
      "why": "getState/saveState dual-API bridge with deep clone, so a checkpoint does not alias live device buffers.",
      "contains": "static _cloneCheckpointValue\\(value\\)"
    },
    {
      "id": "checkpoint-component-bridge",
      "falsifiable": "Saving works on one board and produces a file that will not load on the same board, with no explanation of which part failed.",
      "why": "_saveComponent and _loadComponent name the failing component in the error ('component X has no state API', 'X state API is incompatible') rather than throwing from inside a generic loop. ADDED 2026-09-05 BECAUSE THE DERIVED COVERAGE CHECK FOUND THEM UNEXPLAINED -- the pinned >=8 floor had never noticed, because 8 entries is 8 entries whatever they cover.",
      "contains": "static _saveComponent\\(name, component\\)"
    }
  ],
  "graftedFromUpstream": [
    {"id": "ne2000-chip-kind", "contains": "ne2000"},
    {"id": "port-conflict-check", "contains": "both claim"}
  ]
}
```
