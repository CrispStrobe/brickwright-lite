# Require hosted own-firmware lockstep and embedded Python qualification

CLAIMED — Codex hub-coverage owner, sequential WP6 continuation of #1230.
Base `f925c08c9`. This claims the source work identified by the read-only audit;
the coverage matrix's firmware partial/gap remain open until real runs pass.

Own a dedicated public hosted workflow and bounded input/build/receipt helpers;
required-input mode in `scripts/verify-sim-lab-renode-lockstep.mjs`; Python
acceptance through the same actual Lab route; `bw-sim/routes/renode-lockstep/`
only for mutually exclusive own-NuttX `pythonSource` validation/upload using the
existing canonical encodePython/NuttXProgramClient. Keep READY-before-lockstep,
serialized deferred START/STOP, ownership and existing bounds. Add source/refusal
controls and update the coverage matrix/handoff. No shared arena-session, native
broker, firmware, upstream raw-REPL or pane Run edits; preserve #1224's installed
qualification and #1226's ownership. Coordinate before any expansion.

Explicit input graph proposed for review and real qualification (no silent pin
substitution): firmware `91cf0c07784441ac114b85a1705737327db2d9f8`, its NuttX
`a67efb31cf4f236e456882589b91862f04594528` and apps
`55f0bc216565ccab8dee600a88f4485c7693bf8b`; Runtime
`7d4a79a21e3a71586545f588b1336a9beb1ddd4b` and its paired Infrastructure gitlink
`181d9d45567d9afc66a47b57255d34aa51b5ffdd`. Newer Infra main is not automatically
admitted. Retain exact firmware simulation source/image TI-free, resource,
compiler archive/link-map, addressed-sensor and offline fingerprint gates.

Hosted runner builds from exact sources, stages through the existing producer,
requires all inputs and executes both existing timed/degrees acceptance without
changing their thresholds. Require real embedded Python RUNNING/COMPLETE and
bounded untruncated output, physical world/motor/sensor observations, Stop during
sleep, stopped demand, retained restart and distinct-source recovery/FAULT
controls. No in-process fake substitutes for actual guest results. Preserve
failures; missing-input SKIP is failure in required mode. Firmware stays local
to the runner; publish no binaries/reference media, only bounded qualification
receipts. Acquire each admitted official original once. No heavy local build or
guest run, no hardware or broad physical/performance/native-app claim.

Source candidate now adds mutually exclusive Python upload and a required-input
mode. Source controls preserve the existing compiled-program lifecycle. The new
hosted job retains the exact simulation baseline gates, builds both own sources,
and runs timed/degrees and embedded-Python acceptance. Support resources remain
at the existing installer pin `14b80cde0a136b684f316eb7f6a31aeaae0684bf`, with
`--skip-fetch` on both Runtime build commands. No moving resources fetch.

Real hosted results remain pending. This is not a closure or guest-success claim;
the matrix's two firmware cells stay partial/gap until independently read results.

The first hosted original built firmware and Runtime successfully but failed
before timed/degrees acceptance: the state service did not listen within 600 s.
Its bounded receipts and original job log are retained; Python never ran.
The workflow now explicitly stages `--compiled-models` for the matched source
Runtime, and startup failures retain a bounded output tail and stop their own
child. The original discarded that tail, so its precise boot error is unknown.
Python controls also drain the first frame, resume the unmanaged guest between
cases and require actual interpreter/motor progress on retained restart. These
source repairs need fresh hosted guest qualification; no timeout or acceptance
threshold was relaxed.

Source review found another controller-lifetime defect: the Runtime's original
shell launcher starts a dotnet descendant without exec. Direct shell cleanup
can leave that descendant holding the output pipes. The qualification package
now binds its own `exec dotnet` launcher to the same reviewed binaries. Both
controllers await bounded direct-child cleanup and report cleanup failures;
the timed controller no longer forces process exit over retained handles.
PID/argument/pipe-closure and TERM-resistant/idempotent cleanup controls pass,
and removing exec is detected. This qualifies the controller only; it does not
establish what the still-running original guest checks observed.

Original run 39873733132 failed before the firmware build: Docker reported a
broken output pipe from `make --version | head` under pipefail. Version
reporting now drains the complete bounded version output for both compiler
and make, preserving their real exit status. The failed log and input receipt
are retained; no guest result is inferred from that run.

Original run 39874390028 built both sources and booted in about ten seconds,
then received a matching first-step result without a fresh streamed snapshot.
The original transport discarded the result's acceptance/error while waiting;
its underlying refusal or stream failure remains unknown. The transport now
reports refusals immediately, preserves bounded missing-frame reply details,
and checks result/stream sequence and lockstep data agreement. Twenty-nine
focused controls pass, including five synthetic protocol boundaries; prefix
discard, omitted refusal handling and omitted stream agreement mutations are
detected. These controls do not substitute for fresh hosted guest acceptance.

Run 39876709958 passed real timed/degrees acceptance and its first embedded
Python case, including computation, physical motor motion and retained restart.
The next case failed before upload: the reconnected telnet monitor did not
redraw a prompt, so the controller never sent Start. Matched AntShell source
redraws the existing empty line on Enter without executing a command. The
controller now sends one empty newline, waits for the prompt, then sends one
Start and still requires its explicit acknowledgement and final prompt. The
30-second limit is unchanged. Both real-TCP reconnect/refused-ack controls and
omitted-wake/prompt-only-ack mutations distinguish this boundary. All 31
focused controls pass; fresh combined-main guest qualification remains required.
