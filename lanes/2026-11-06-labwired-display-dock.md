# LabWired display and debugger visibility

Status: CLAIMED, 2026-11-06. Owner: Circuit and debugger integration.

Investigate and repair the interaction between LabWired display mirroring and
the persistent debugger pane. In the S040 consumer candidate, the MakeCode
micro:bit V2 journey failed with the controller dock selected and no visible
debugger panel. The shared mirror currently requests the controller dock when
it begins; establish the actual causal path before claiming this is the only
failure.

Scope: the machine-video mirror's presentation request in the GUI and its
normal mirror, the LabWired debugger caller and its normal mirror, focused
ownership/visibility tests, and this claim. Preserve the existing default for
machine callers that request a visible controller, the actual video stream,
keyboard/mouse ownership, teardown, serial output, S040 circuit-face ownership
and refusal behavior. Any new choice to keep the debugger visible must leave
the controller display available on demand. Do not alter the engine, source
pins, timing limits or existing browser acceptance criteria.

Qualify with nonvacuous source-level behavior tests and a fresh official
MakeCode micro:bit V2 browser journey that observes an actual running guest and
complete serial line; also retain the machine Widgets browser check and the
S040 display/touch journey. Do not claim physical-device fidelity or a passing
guest from mocked tests. Coordinate this work with the S040 continuation, and
merge this claim before implementation.
