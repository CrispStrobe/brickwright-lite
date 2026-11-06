# S040 consumer integration continuation

Owner: Circuit integration maintainer, continuing the operator-requested S040
consumer delivery. Status: CLAIMED, 2026-11-05. Base: 7aed127e9f66db6ed272aa8c6d85a82176c1c2f3.

Continue the already claimed ESP32-4848S040 consumer work in Lite PR1622 from
its preserved head `d2b083e4e877b6be24c08a4847d41fca4f94321a`, without rewriting
its history or silently replacing its original owner evidence. The existing
owner has been informed of the operator-directed continuation; stop and
coordinate if an active overlapping writer is identified. Prepare an isolated normal merge with current main,
resolve the documented 26 conflicts and publish a reviewed forward candidate.

Own only the S040 firmware loader, display/touch binding, the existing S040
browser/native qualification and their tests/claims/docs as already described
in `lanes/2026-11-01-esp32-4848s040-binding.md` and the related firmware lane;
the package pin/lock and generated-notice/census changes necessary to adopt the
qualified Board and CUI suppliers; and narrowly necessary conflict resolution
in current Circuit mirrors and live package-adoption controls. Preserve current
main's unrelated package pins, other owners' source, all historical x86/study
identities, sealed evidence, original failures, thresholds and assertions.
Resolve historical files only to retain their independently established roles,
never to make a stale identity pass by broad exemption. No unrelated model,
compiler, GUI, firmware or CI-policy change is authorized.

Require exact supplier range and installed package identity, mirror and generator
checks, all enabled exact-head CI, actual firmware-to-screen/touch/Stop/restart
browser evidence, and the existing affected installed-native qualifications.
Compare the resulting tree and parents; use normal pushes and a matched-head
merge. Only after qualification may the existing guarded production workflow
publish, followed by version and live-behavior verification. Do not infer a
physical board, arbitrary firmware or timing-fidelity claim. Keep any existing
consumer branch intact until coordination is complete.

## Forward integration candidate

The continuation merges the preserved PR1622 head into the current application
history. The selected Board is `cda9d13b3e5b4a3e40854f45e04d110ab2a57ef3`;
the selected Circuit UI is the independently qualified descendant
`9d7a9a260d00d3c26a77e749aec55ceddbe29a52`, which includes the S040 face
lifetime and circuit file-restoration corrections. Existing unrelated supplier
pins are preserved. Both lockfiles are generated on hosted CI from those exact
manifests and checked against the pinned identities; this is metadata evidence,
not installed-package or application qualification.

The earlier PR1622 Build `41390865042` remains a failure: the S040 browser
journey timed out while waiting for circuit loading, the device registry omitted
the new S040 host, and the Circuit dock contract expected an obsolete source
expression. The same run had separate machine-widgets and MakeCode browser
failures. The candidate adds the S040 host classification and preserves the
dock contract with explicit circuit/device selection controls. All these
behaviors still require fresh exact-head hosted verification. The shared
LabWired engine change also requires its own fresh SAMD browser and installed
native acceptance; the supplier result does not establish that acceptance.

The next forward candidate publishes the S040 IDs from each newly published
simulation board to the persistent debugger panel, updating only when those
IDs change. This addresses the observed selector missing the board after a
successful file load. The focused source test covers add, remove, same-count
replacement and repeated publication; the actual firmware journey and all
other failed browser gates remain pending fresh hosted qualification.
