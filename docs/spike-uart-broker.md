# MicroPython byte operations through the native broker

The closed vocabulary adds `renode.spike.micropython.uart.read`, `.write` and
`.close`, scoped to the owned `renode/spike-prime` session. All requests require
a positive safe-integer generation. Read accepts maxBytes 1–4096; write accepts
1–32 integer bytes 0–255; close accepts generation only. Extra keys are refused.
There is no attach, endpoint, file, monitor or route argument. Close detaches the
program UART while retaining the state connection; session close remains separate.

The debugger delegates to the shared state feed, which checks MicroPython image
identity, ready attachment, stable generation and exact request-correlated result
data. The response contains that validated data and the fresh shared snapshot.
Policy retains the isolated broker caller, fixed resource and one-use lease.
Neither generation nor operation names provide authentication by themselves.

Validation: 44 Node broker/adapter tests and 86 actual Rust module tests pass;
nine package-dependent tests are ignored in the offline harness. Clippy with
warnings denied passes using the repository Rust 1.77 setting. A compiled mutation
bypassing read argument validation fails the policy test. These tests do not claim
an app-level MicroPython launch: owned image startup, profile packaging, GUI
selection and robot Python bindings are still required. Prior real firmware
execution tests qualified the state feed separately. Complete transcripts,
mutation output and harness evidence are private. New validator code is BSD-3-Clause.
