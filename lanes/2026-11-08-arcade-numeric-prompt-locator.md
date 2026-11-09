# Arcade numeric authoring check: wait on the visible prompt

Status: DONE in the implementing PR (claim and change together).
Owner: Arcade lane (follow-up to the connected authoring check, #1674).
Base: main `af7866ab`.

`scripts/verify-arcade-numeric-authoring-gui.mjs` waited for
`getByText(question)` after the green flag. The question text is also the
`ask number` block's own label in the code area, so when the blocks are
rendered Playwright's strict mode finds two elements and the job fails
("resolved to 2 elements", seen on PR #1687's run). The wait now targets the
prompt's question label, the exact state the next step (typing the reply)
needs. No timeout, retry or assertion changed.
