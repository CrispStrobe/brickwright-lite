## bw-circuit-ui adoption 873f68b — taken over from A13 — 2026-10-17

CLAIMED — Claude (Lite Code tab lane, H7), branch `lane/cui-pin-873f68b-20261017`,
at the owner's direction while the A13 Codex lane is paused. Adopts
bw-circuit-ui master 873f68b: A13's merged CPX live face (bw-circuit-ui #85),
the STM32F030 chip body that replaces the LED-dimmer example's ghost outline
(#88), and B20 ledger entries. bw-circuit-ui's dependencies are unchanged, so
this is the same 16-surface SHA swap as earlier adoptions; history docs keep
their recorded pins. A13's own Lite wiring (circuit-tab.jsx cpxState and
onCpxInput) stays with A13 and is not part of this adoption.

Composition receipts: claim PR1016 merged before implementation. All thirteen
conflicts resolved without changing original assertions or supplier runtime;
canonical package/lock/notice writers retain CUI1db, Boardf84 and SBCa13.
Installed root and GUI provenance, metadata, notices and mirrored facts pass.
Focused affected controls: 78 passed; the one source-identity skip was separately
rerun against an isolated SBC checkout at a13 and passed all four controls with
zero skips. Thirteen x86 reach/compiler/mutation controls also pass. The exact
Board census, language matrix, 8086 report and part-profile readers pass; the
matrix writer corrected a stale abbreviated Board label. The generic SBC sync
check refuses an intentionally pinned checkout behind current supplier main;
the exact-pin 19-file vendor-identity gate passes instead, with no bypass or pin
expansion. The standard GUI build passes; explicit production build and browser
qualification are in progress. All enabled final-head CI remains a landing gate.
Original PR975 head rechecked unchanged at 943d540c7 before this candidate commit.

STM32 composition reconciliation (2026-10-16): previous head7a82a14f passed
every enabled hosted check in run38945321982. Current main6f2993d6b adds the
qualified iOS packaging and independent Sim Lab slice, plus claims. Original
PR975 advanced to4d0cabe24: its matrix label is already present; its register
reader fix is incorporated with the explanatory comment while retaining this
386-only gate's strict edi assertion and existing timeout, per the merged claim.
Normal merges preserve both histories and all newer main changes. This changed
combined head requires fresh exact-head CI before landing.

Final integration reconciliation includes main8a63ad26f, preserving merged
CPX1009, SPIKE pending-stop990 and the Arcade owner's new claim. The only
conflict is ledger placement; keep this lane's receipts within its own section
to avoid collisions with other appended claims. No supplier, assertion or
workflow changes. Fresh exact-head full CI remains required on this composition.

Implementation after claimPR1039 merged as8999ced4d: the new direct command
`node scripts/verify-sim-physics.mjs` parses the actual reference LDraw model,
compiles unchanged metadata, drives the unchanged hub/core and runs the actual
physics-worker entry through a Node-only message adapter and original client.
The two-second reference run moves0.491813m, with measured opposing encoders
and negligible yaw. The worker advances100 fixed steps and returns measured
wheel rotation. Unknown models/options fail with no successful output; all
worker/core resources and clock ownership are released. Both original failing
guards now pass without any allowlist or assertion change. Build includes only
the missing governed plan path.

Broader execution exposed an existing worker fixture's unlabelled root-to-GUI
resolution. The original worker determinism test now uses the same adapter to
the actual integrated worker, preserving every byte-identical snapshot assertion
and protocol. This resolves through the GUI's native dependency scope, without
new scope exemptions or suppressed diagnostics. All88 affected controls pass,
zero skips/failures/raw stdout; the unchanged GUI boundary checker also passes.
Retain original hosted failures and initial boundary log; final TAP+census are
`local worktree/receipt (see ignored local handoff)`. Installed-source verification
is in progress; final source-head CI still gates the integration merge.

Main reconciliation (2026-10-17): compose the qualified Sim Lab GUI PR1030
and release ownership claim PR1011 from main e2225bb05. Preserve both histories,
all simulator runtime and browser controls, and the release owner's contract.
The worker test keeps main's explicit test identity while exercising the actual
integrated worker. Remove only the two newly added KNOWN_DEAD worker/client
exceptions: the real headless command now consumes both, as the unchanged
stale-exception assertion requires. Main already supplies the governed plan
trigger, so retain its single entry rather than duplicating it. The original
trigger and dead-module guards pass all14 controls, zero skips. Combined
simulator execution and the fresh source-head qualification remain pending.

Final reconciled controls: 100 passed, zero failures/skips/raw stdout; GUI
dependency boundary passes. Fresh canonical dependency preparation and installed
root/GUI exact-source provenance plus single-engine resolution pass. Retain
`local worktree/receipt (see ignored local handoff)` and the
provenance log. Internal npm scratch exhaustion was repaired using task-specific
external npm cache/temporary directories; package pins and assertions unchanged.
All enabled checks on this final composed source head remain required to land.
