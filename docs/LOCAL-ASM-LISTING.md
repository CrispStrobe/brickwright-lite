# Local 8051 assembly-listing progression

Owner: `fab-asm-local` (claimed 2026-08-31)

Budget: 3–5 hours across five independently pushed checkpoints. This closes the
generated-listing half of D12 for the STC/8051 `languages-protocols` lesson.
`machines-source-asm` is a 6502 lesson, outside the bundled SDCC target set, and
its listing remains explicitly hosted. Editable handwritten assembly is also a
separate hosted assembler workflow and must not be silently relabelled as
compiler output. D12 therefore shrinks from two affected lessons to one; it is
not honestly closed by this progression.

Agents may audit bounded pieces, but the owner reviews and integrates every
change, runs the real compiler and browser proofs, and pushes each accepted
checkpoint directly to the relevant default branch. Heavy work is guarded by
`scripts/check-system-load.mjs`; GitHub CI receives consolidated commits.

## Checkpoint 1 — specify listing semantics (35–55 minutes)

Status: shipped in `eb24d16f4`. The linked `main.rst` is the only existing SDCC
artifact combining final addresses, bytes, and C source markers; raw compiler
ASM has no final addresses and the assembler LST is still relocatable.

- Trace Source and Listing modes from the Code tab through compiler responses.
- Decide which existing local artifact is the honest listing: SDCC source ASM,
  assembler LST, or linked disassembly. Record their address/source guarantees.
- Pin the separation between editable ASM source and generated read-only output.

Definition of done: contract tests fail on the current hosted-only path, name
the response shape and mapping guarantees, distinguish source ASM from linked
addresses, and include mutation reds for swapped or falsely labelled modes.

## Checkpoint 2 — expose a local listing contract (45–70 minutes)

Status: shipped in `eb24d16f4` with real four-stage WASM tests.

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

Status: shipped in `71b41aae0`; the gate scaffold and its cache-invalidation
proof followed in `067bb1240` and `5d957d6fe`.

- Route supported 8051 Listing mode directly through the local compiler module.
- Preserve the explicit hosted route for unsupported targets and editable ASM
  assembly; never fall back to the network after a supported local failure.
- Cache by source, target, clock, and listing-contract version.

Definition of done: component/contract tests prove supported listings make zero
fetches, unsupported targets make exactly one named hosted request, cache keys
cannot cross devices or clocks, and a local failure is rendered without network
escape. Overlay and integrated package copies agree.

## Checkpoint 4 — production offline browser proof (50–75 minutes)

Status: watched green against the `71b41aae0` production `github-pages`
artifact (Actions run `33368101931`): 8/8 checks, two source-distinct
listings, 49 source mappings, a 37,410-byte `program.lst`, immutable editor,
zero hosted requests, and zero page errors. Wired into the normal build after
that watched run.

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

Status: complete. `languages-protocols` is version 3 in English and German;
the positive sentinel pins the local linked-listing route and UI disclosure.
Wave 7's 6502 hosted boundary remains unchanged, and D12 is recorded as one
remaining lesson rather than struck through.

- Update the affected 8051 lesson in English and German and bump its content
  version with the new offline boundary stated precisely. Keep the 6502
  lesson's hosted boundary explicit.
- Convert the D12 open-defect sentinel into positive local-listing coverage.
- Reconcile PLAN, Wave 3, Wave 7, and the open-defect ledger.

Definition of done: focused lesson, language-matrix, compiler, mirror, gate-
coverage, l10n, and production-browser suites pass; mutation of either lesson
copy or the local route fails; unrelated generated translations/lockfile remain
untouched; `brickwright-lite/main` matches its GitHub remote.
