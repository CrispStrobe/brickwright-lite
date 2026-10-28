# Adopting upstream changes during WIP

Our shared components are actively developed in our own upstream repositories:
`CrispStrobe/bw-board`, `CrispStrobe/bw-circuit-ui`, and `CrispStrobe/sb3-creator`.
Publish reusable engine, renderer and generator fixes there first. Keep
application preferences and packaging adaptations in Brickwright Lite.

A pin is the version this consumer has reviewed and adopted, not a promise to
follow the newest commit. Agents do not need to update it after every upstream
push. Batch related changes into one adoption after the upstream checks pass.
Do not let a test silently replace an unavailable SHA with HEAD.

Reconcile `LANES.md` by package boundary as well as by feature name. One owner
carries a related upstream batch through its Lite package refresh. While that
candidate is active, another lane may continue upstream work, but it must not
start a competing Lite adoption, move the same pins, or make the candidate chase
each new upstream commit. Freeze one purposeful identity, qualify it, then choose
a later batch separately.

1. Fetch and record an exact base; reconcile LANES and open branches before
   claiming work. Remote-tracking refs are shared by worktrees and can move.
2. Implement and test the complete producer/consumer contract upstream. Record
   its commit and hosted result, including skips and any unresolved failures.
3. Read the complete range since the consumer's old pin. Adopt a full 40-hex
   SHA deliberately; never substitute a branch name, short hash, or latest HEAD.
4. Update the existing authority once. Preserve corpus/fixture-derived pins
   where they bind inputs to reviewed baselines. Do not introduce another pin
   file for the same purpose. Sibling test pins and Lite's shipping pins serve
   different consumers and need not all advance together.
5. In Lite, use the delivery shape the package architecture defines:

   - For `bw-board` and `bw-circuit-ui`, update `vendor-pins.json` once and derive
     the npm git-SHA specifications and lockfile from it. There is no Lite source
     mirror to sync or fork to preserve. Regenerate every census, report, package
     notice, ROM provenance stamp, and tracked integration output affected by the
     pin, then verify installed-package identity and behavior at that exact
     candidate.
   - For `sb3-creator`, use the scoped three-way sync, its map-derived rewrite,
     and both tracked mirrors. It is the sole remaining vendored tree; a refused
     file requires an ownership/merge decision rather than a second adoption
     mechanism.
   - Treat `stc-compiler-flasher` independently. Its path-scoped pin governs the
     generated browser flasher and its two mirrors, not every artifact supplied
     by the `stc-compiler` repository.

6. Publish the candidate and its receipt. If main advances, inspect the intervening
   changes and rerun affected checks on the new candidate; do not force-push a
   shared branch or keep citing a superseded run as evidence for new code.

Workflow census gates discover new external checkout/clone sites. A new site
must have an exact reviewed input contract before it can pass. Static checks
cover recognized workflow syntax, not arbitrary dynamically constructed commands;
new syntax requires an explicit parser fixture and execution-path review.

Repository discovery and commit-graph queries are different operations from
building or executing a dependency. Keep them named, report the resolved SHA,
and never use their moving checkout as a substitute for an adoption pin. Lite's
existing fetch census records those exceptions individually.
