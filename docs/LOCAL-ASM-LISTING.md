# Local 8051 assembly-listing progression

Owner: `fab-asm-local` (claimed 2026-08-31)

Budget: 3–5 hours across five independently pushed checkpoints. This closes D12
for the generated-listing path used by `languages-protocols` and
`machines-source-asm`. Editable handwritten assembly remains a separate
assembler workflow and must not be silently relabelled as compiler output.

Agents may audit bounded pieces, but the owner reviews and integrates every
change, runs the real compiler and browser proofs, and pushes each accepted
checkpoint directly to the relevant default branch. Heavy work is guarded by
`scripts/check-system-load.mjs`; GitHub CI receives consolidated commits.

## Checkpoint 1 — specify listing semantics (35–55 minutes)

- Trace Source and Listing modes from the Code tab through compiler responses.
- Decide which existing local artifact is the honest listing: SDCC source ASM,
  assembler LST, or linked disassembly. Record their address/source guarantees.
- Pin the separation between editable ASM source and generated read-only output.

Definition of done: contract tests fail on the current hosted-only path, name
the response shape and mapping guarantees, distinguish source ASM from linked
addresses, and include mutation reds for swapped or falsely labelled modes.

## Checkpoint 2 — expose a local listing contract (45–70 minutes)

- Extend the four-stage WASM compiler result with the chosen listing and a
  deterministic source/address map derived from artifacts it already creates.
- Keep ordinary compile payload compatibility and avoid loading a second
  toolchain instance for one request.
- Return explicit unsupported-target and missing-artifact errors.

Definition of done: a real generated program returns Intel HEX plus a non-empty
listing and valid monotonically ordered mappings; release and debug compilation
remain green; malformed artifacts fail by name; focused tests are mutation-
proved and pushed to `main`.

## Checkpoint 3 — wire the Code tab locally (45–70 minutes)

- Route supported 8051 Listing mode directly through the local compiler module.
- Preserve the explicit hosted route for unsupported targets and editable ASM
  assembly; never fall back to the network after a supported local failure.
- Cache by source, target, clock, and listing-contract version.

Definition of done: component/contract tests prove supported listings make zero
fetches, unsupported targets make exactly one named hosted request, cache keys
cannot cross devices or clocks, and a local failure is rendered without network
escape. Overlay and integrated package copies agree.

## Checkpoint 4 — production offline browser proof (50–75 minutes)

- Load a real 8051 example, open Code → ASM → Listing, and block external
  compiler requests before they leave Chromium.
- Prove the listing belongs to the current generated program using source lines,
  target-specific instructions/symbols, and linked addresses where promised.
- Exercise cache invalidation by changing the source and requesting a new list.

Definition of done: the production build shows two distinct non-empty listings
for two source hashes, exactly zero hosted compiler requests, correct read-only
mode/status, no page errors, and retained screenshots plus structured failure
evidence. The gate is workflow-wired only after a watched green run.

## Checkpoint 5 — lesson and ledger closure (35–50 minutes)

- Update both affected lessons in English and German and bump their content
  versions with the new offline boundary stated precisely.
- Convert the D12 open-defect sentinel into positive local-listing coverage.
- Reconcile PLAN, Wave 3, Wave 7, and the open-defect ledger.

Definition of done: focused lesson, language-matrix, compiler, mirror, gate-
coverage, l10n, and production-browser suites pass; mutation of either lesson
copy or the local route fails; unrelated generated translations/lockfile remain
untouched; `brickwright-lite/main` matches its GitHub remote.
