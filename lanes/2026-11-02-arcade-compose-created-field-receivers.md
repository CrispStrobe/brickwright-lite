# Compose the prepared Arcade created-field receiver branch onto main

Status: IN PROGRESS in the implementing PR (claim and change together).
Owner: Arcade lane (operator-approved TODO closure, 2026-11-02).
Base: main `bc39104bd536c0eafb410a6d520f0be3d450fcc6`; merged branch
`lane/arcade-created-field-receivers-20261029` at `648f1f78110b`.

## Scope

Normal merge of the prepared branch. Conflicts resolved keeping main's later
work: the nullable Array read channel and the general inert global store stay;
the branch's mutation effects through nullable aliases, its stricter
conditional-branch reset rule, its closed private prefix rules (tried first,
general store as fallback) and its `charCodeAt` Number proof are added.
Branch refusal tests that main's later proofs now admit were checked against
original PXT and changed only where the admission is sound, each with its
reason; `test/arcade-reset-prefix-store-pxt.test.mjs` compares the shape with
original PXT. ARCADE-888 G/F rows record the PXT single-runtime finding.

## Qualification

Full exact-head CI (`ci:full`); every enabled check must succeed.
