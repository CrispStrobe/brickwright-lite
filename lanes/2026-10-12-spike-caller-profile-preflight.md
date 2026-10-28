## SPIKE caller profile preflight — 2026-10-12

DONE candidate — Codex SPIKE integration, isolated branch
`fix/spike-profile-preflight-20261012`, base
`926901bab088464cdc39f41984ab4c28ef1426ed`.
Envelope: `overlay/scratch-vm/src/extension-support/native-renode-capability.js`,
its tracked `packages/scratch-vm` twin, focused native-capability tests,
`docs/SPIKE-STATUS-AND-LANES.md` and this ledger. Reject unknown SPIKE topology
and unsupported custom-profile/backend pairings before broker allocation
or dispatch. Keep valid requests and existing sessions unchanged; preserve opaque
native authorization failures and closed relay failure codes. Test valid profile
forwarding, local refusals, concurrent ordering and session survival, including
mutations of both guards. This is caller validation, not native authorization or
installed-package qualification. Twenty focused checks pass; removing either
guard fails its dedicated refusal check. Native authorization remains opaque; the existing MicroPython six-motor
pairing is preserved. Hosted exact-head qualification is pending. The separate
PR755 adoption/package lane and peer Arcade painter/browser repair retain their
ownership.
