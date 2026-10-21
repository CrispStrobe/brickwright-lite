# Lanes — who is doing what

**New claims never edit this file.** A claim is one new file,
`lanes/<YYYY-MM-DD>-<slug>.md` (the date you claim, a short lower-case slug),
holding the claim text: what you will change, who you are, the paths or package
boundary you own, and the qualification it needs. Merge the claim before
implementation, as before. To update or close a claim, edit only your own file.
No local paths, hostnames or session identifiers in a claim.

Why: every PR used to prepend its claim row at the top of this file, so each
merge made every other open PR CONFLICTING, forcing a main merge and a new full
CI round. One file per claim means two PRs never touch the same lines
(`test/lanes-claims.test.mjs` proves it with two parallel claims).

Where things are:

- `lanes/*.md` — one file per claim. The history up to 2026-10-20 was split out
  of this file verbatim; `lanes/MIGRATION-2026-10-20.tsv` maps each original
  line range to its file.
- `lanes/PROTOCOL.md` — the protocol, the qualification rules and the
  operational notices that used to live here, verbatim.
- `CI-POINTERS.md` — "Skips that execute elsewhere" and "Steps that run
  elsewhere", read by `scripts/lib/skip-pointers.mjs`.
- `node scripts/gen-lanes-index.mjs` prints an index of every claim (newest
  first). It is generated on demand and is never committed, so no PR has to
  regenerate it.

This header is meant to stay stable; change it only to change the rules.
