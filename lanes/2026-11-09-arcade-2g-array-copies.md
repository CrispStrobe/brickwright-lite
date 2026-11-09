# Arcade row 2g: per-slot Array facts through literal pushes and copies

Status: claim and change in one PR. Owner: Arcade lane. Base: main `298bd80b1e33`.

Scope: `array-reference-export-authority.js` (overlay + integrated copy), new
`test/makecode-arcade-array-copy-slots.test.mjs`, the `todo` marker in
`test/makecode-arcade-array-copies.test.mjs`, GUI-scope allow list, open-failures row.

Problem: `pxt-array-copy-effects-primary` exported with "requires an actual
initialized Array producer" for `specialJoined[2]` and `special[2]`. The importer
builds `[undefined,NaN,[5]]` as `[]` plus pushes on a staged temporary, so the
authority only had the union of element types (not all Arrays) and no slot facts.

Change: `slotsAt(allocation, read)` gives exact slots of ONE allocation: its
exact base (literal/JSON items, or a proved whole copy) followed by the values of
the importer's literal-expansion pushes (`__bwPxtValueN` receiver, receiver set
exactly this allocation, once-only statements, definite order after the
allocation and before the read). Every other mutation that may reach the
allocation (aliases included), every shrink and named write must come after the
read. `slice()` with both bounds omitted copies the source slots; `a.concat(b)`
is a's slots then b's, only when both operands have exact slots at the concat.
A literal-index item read of a proved slot uses that slot's types and
initialization only. User pushes keep the existing all-element-writer policy.

Verification: the target case passes (todo removed); new file has 3 accepted and
8 refused cases (slot overwritten, alias write, function write, conditional push,
non-Array slot, user push, bounded slice, unshift). Mutations: dropping the slot
rule fails 4 tests; dropping the literal-push restriction fails 3 existing
refusal tests. Array/roundtrip sweep (46 files): 341 pass, 0 fail, 1 unrelated todo.

Follow-up (same PR):
- Staged-literal pushes are recognised structurally, not by the
  `__bwPxtValueN` name (the importer accepts user locals with that name). The
  local is written once with a fresh empty list. Every read of it is either the
  receiver of a push of an inert constant or of another staged list, or its
  single store.
- The separate push-opcode check was removed. It could never trigger, because
  every read of a staged list is a push receiver or its store.
- The push-before-read order check is kept. A new concat test fails without it.
- Fixed a slip in the first commit: an item read without a proven slot again
  checks every source's initialization. Without it, the existing
  borrowed-initialization refusal was hidden.
- New refusals: user `__bwPxtValue7` with a non-literal push, a call-result
  push, or two stores; a conditional push before a definite one; a conditional
  push before concat.
- Mutations that now fail tests: name-based recognition (2 tests), any value
  treated as inert (1), multiple stores allowed (1), no order check (1), no
  slot rule (5).
