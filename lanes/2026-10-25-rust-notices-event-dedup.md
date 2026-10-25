# Avoid duplicate branch-push and PR Rust notices checks

CLAIMED — Codex x86/CI owner, coordinated with the current package-adoption
owner. This documentation-only scope must merge before implementation.
Own only this claim, `.github/workflows/rust-notices.yml` and
`test/rust-notices-generator.test.mjs`. The same owner's earlier pending
[V8 tag test](2026-10-25-rust-notices-v8-tag-filter-test.md) and
[tag-isolation](2026-10-25-x86-gui-v8-internal-tag-isolation.md) work remain
separate; their obsolete unrestricted-push bootstrap expectation must not
undo this current mainline coverage policy. Import no pending B9 sources.

The workflow is already on the default branch. Its bootstrap feature-push
route now competes with the watched PR route in the same cancellation group,
creating an enabled cancelled check on the same source head. That head cannot
qualify. Preserve the cancellation and all earlier failures; never waive or
reclassify it as success or an absent check.

Restrict only the push route to the exact `main` branch and replace the stale
bootstrap comment. Retain all eight watched push paths, all eight PR paths,
manual dispatch, read-only permissions, the concurrency group and cancellation
setting, every job and step, action/toolchain pin, locked-metadata command and
five-minute resource bound. Change no notices, generator, Cargo input, package
pin, payload, model, CLI, browser or guest source. This repairs the ordinary
feature-branch push/PR pair; it does not promise to deduplicate an intentional
concurrent manual dispatch, whose existing semantics remain held.

Replace the obsolete test prohibition on a push branch filter with executable
coverage checks against the actual workflow header. For every watched input,
require exactly one automatic route for an ordinary feature-branch PR update,
PR coverage, and retained main-push coverage. Check nested Cargo inputs,
unrelated paths, tag pushes and manual dispatch. Prove that the old header
admits the duplicate, and detect removed, wildcard or wrong branch filters,
missing PR/manual/input coverage and changed held pins or bounds. Preserve
all existing bounded-writer and licence-table assertions. Use no new parser
or package dependency and no compiler or guest build for local controls.

Qualify the final combined source head with every enabled exact-head check
successful before any main merge. Keep any already selected independent
instrument experiment bound to its original source and raw evidence; do not
redispatch or relabel it as a new-head run. A separate applicability bridge
needs explicit proof that its complete producer, model and CLI boundary is
unchanged, with both source identities visible. This workflow/test repair
itself grants no experiment, F7/V8, guest, release or landing authority.
