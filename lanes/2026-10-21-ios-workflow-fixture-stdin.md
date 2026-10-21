# Faithful stdin in iOS workflow controls

Owner: Codex integration owner, Arcade validation. Isolated branch
`lane/ios-fixture-stdin-claim-20261021`, based on `e7d5b8ad7`.
Status: claim only; merge before the fixture correction.

Take over maintenance of the already landed
`test/ios-workflow-resource-preparation.test.mjs` command fixture for its
observed SIGPIPE failure. The authored base64 command currently emits fixture
bytes without consuming piped input. Make it faithfully drain stdin and add
a finite payload larger than a pipe buffer that checks successful workflow
ordering. Preserve pipefail, original ordering/failure assertions and timeouts.
Own this claim and that test file only.

The existing mobile workflow and packaging lane retains its release and
actual iOS qualification obligations. This fixture repair qualifies shell
control behavior, without establishing app, IPA or signing acceptance.

Run the complete focused module and retain the original failure plus a
nonvacuous producer/consumer control. Qualify the final enabled exact-head
checks with a normal matched-head merge. Use the ordinary automatic checks
without a new full-browser label or mobile build event.
