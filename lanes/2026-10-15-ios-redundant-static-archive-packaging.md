## iOS redundant static archive packaging — 2026-10-15

DONE — Codex, isolated `fix/ios-static-archive-resources-20261015`, base `86daec14c`. User requested shrinking the
current iPad app. Measured signed bundle: 371.43 MiB, including 151.98 MiB
`libapp.a` copied as a resource despite already being linked into the executable.

Envelope: this ledger, `apps/tauri/scripts/prepare-ios-device-build.mjs`, and
`test/ios-device-build-command.test.mjs`. Remove only `libapp.a in Resources`
build-file and resource-phase references from the generated project; preserve
its Frameworks/linking entry. Exercise actual preparation on an Xcode fixture,
including an already-anchored project. Verify the smaller signed app and iPad
installation/launch. No feature, frontend asset or native code is removed.
Claim landed as `139c01fe4` before implementation. Four preparation tests pass;
the new real-script fixture fails on the prior implementation. The 219.45 MiB
signed app (41% reduction) installed and launched on the paired iPad over Wi-Fi.
All 41 executable sections remain byte-identical after removing the redundant
archive; signature verification passes.
