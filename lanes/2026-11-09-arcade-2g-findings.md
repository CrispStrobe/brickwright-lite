# Arcade 2g: findings for the three per-slot rows (docs only)

Status: claim and change in one PR, documentation only. Owner: Arcade lane.
Base: main `4b2f5047dde6`. No source, test, pin or workflow change.

Scope: the 2g and 2h-2 rows of `lanes/2026-11-03-arcade-pending-after-1643.md` and the
four matching rows of `docs/ARCADE-888-OPEN-FAILURES.md`, plus one paragraph in
`docs/ARCADE-AGENT-HANDOFF.md`.

- Class accessors (`makecode-arcade-class-accessors`, resource-aliases): stays
  TODO by operator decision. `holder.items[0]` needs (1) the accessor `items`
  read and written through its backing field `_items`, but accessor
  getters/setters are implicit managed entries whose parameters gain no
  producer facts from class metadata (pinned by `constructor initializer
  methods accessors and Sprite updates are implicit procedure entries`), and
  (2) a field read is initialized only when every writer is a
  constructor-prefix statement; the setter writes outside the constructor.
- Array copies (`pxt-array-copy-effects-primary`): fixed separately by the
  per-slot copy facts claim (`2026-11-09-arcade-2g-array-copies.md`).
- Animation export (`fresh resource export ...`): the first export reports
  three Array-authority refusals on the frame globals plus the generated
  lookup functions' `id` String constraint. Several independent proofs are
  missing. This row is now owned by the importer lane.
- 2h-2 (argument edited to text): refused by design (operator decision
  2026-11-09). A registered stock or managed Number formal rejects text before
  any body effects (control `registered stock/managed Number rejects text
  before body effects`); a text-edited argument stays outside the roundtrip on
  purpose. No code or control change.
