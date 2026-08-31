# TFT 8051 generated-program recovery

Owner: `fab-tft-compile` (claimed 2026-08-31)

Budget: 3–5 hours across five independently pushed checkpoints. The work closes
the one generated 8051 example still rejected by both native and browser SDCC,
then turns the compiler recovery's one-off corpus measurement into a maintained
producer-to-consumer contract.

Agents may isolate or audit bounded pieces. The owner reviews every proposed
change, writes or revises the contract-bearing tests, integrates across repos,
and personally runs the accepted generated-C, compiler, vendor, and browser
proofs. Heavy local work runs only after `scripts/check-system-load.mjs`; CI is
used for consolidated checkpoints rather than interactive experiments.

## Checkpoint 1 — reproduce and specify the TFT ABI (45–75 minutes)

- Generate C from `51-tft-pixels/program.bw` at the current sb3-creator tip.
- Capture the exact native-SDCC error and reduce it to the mismatched helper
  declaration/call without changing the example.
- Compare every TFT helper and call site across 8051, AVR, and ARM generation,
  plus C-to-pseudocode round trips, before choosing the ABI.

Definition of done: a focused regression fails on the current producer, names
the helper and expected arity/ordering, covers a neighboring valid call, and
has a demonstrated mutation red. The intended ABI is explained in the test,
not inferred from whichever string happens to compile.

## Checkpoint 2 — repair sb3-creator and prove generated semantics (45–75 minutes)

- Fix the producer at the narrowest shared boundary.
- Assert the complete generated TFT driver: init commands, address window,
  RGB565 byte ordering, rectangle/pixel calls, and target-specific pin lvalues.
- Prove pseudocode → C → pseudocode faithfulness for the example's operations.

Definition of done: focused TFT and generator suites pass; the exact example C
passes native SDCC; mutations to arity, argument order, or command/data choice
fail; sb3-creator `main` is pushed with no generated gallery drift.

## Checkpoint 3 — close the 44-program compiler corpus (45–75 minutes)

- Run all generated 8051 examples through native SDCC and the accepted WASM
  four-stage pipeline, bounded to avoid VPS load spikes.
- Promote the former 43/44 result into an executable acceptance manifest with
  no silent skip-on-compile-failure and byte identity where both outputs exist.
- Keep source generation in the producer so pasted C cannot go stale.

Definition of done: 44/44 applicable generated programs compile under both
toolchains, Intel HEX payloads agree under the established normalizer, the
comparison gate is mutation-proven, and one consolidated upstream CI run keeps
the evidence/artifact.

## Checkpoint 4 — re-vendor and prove the application (45–60 minutes)

- Pin the accepted sb3-creator commit and sync the complete producer/gallery
  tree through the normal lite scripts.
- Add a real-WASM regression generated from `51-tft-pixels/program.bw`, including
  symbols when the program uses cooperative tasks.
- Verify overlay/package mirrors and preserve unrelated lockfile/translations.

Definition of done: lite compiles the freshly generated TFT example locally to
  Intel HEX with no hosted request; vendor freshness, mirror integrity, routing,
  toolchain provenance, and focused generator/compiler tests pass; lite `main`
  is pushed.

## Checkpoint 5 — production browser and ledger closure (45–60 minutes)

- Load `51-tft-pixels` from the production gallery, compile it through the
  shipped local toolchain with external compiler POSTs blocked, and attach or
  run the resulting image far enough to prove the TFT path is live.
- Retain a screenshot and structured failure evidence in CI.
- Reconcile the 43/44 caveats in LANES, BUILD-INFO, and recovery documents.

Definition of done: the production bundle proves zero hosted compiler requests,
the expected STC target and TFT program compile successfully, the TFT surface
receives observable pixel/command activity (not merely a successful compiler
return), no page error occurs, the gate is workflow-wired, and both relevant
default branches match their GitHub remotes.
