# Explicit custom procedure invocation

Status: ownership claim merged in Lite #911. Initial supplier
[sb3-creator #138](https://github.com/CrispStrobe/sb3-creator/pull/138) is merged.
The reserved typed grammar follow-up is
[PR140](https://github.com/CrispStrobe/sb3-creator/pull/140), pending supplier
qualification. Consumer evidence below is local and does not establish a main
or GUI landing.

## Defect and authoring contract

A registered procedure can have the same spelling as a built-in command.
Bare `show` currently chooses Scratch visibility even when the original source
calls its own rendering function. Definitions remain saved, while invocations
silently disappear. Translation without diagnostics does not prove that calls
were retained.

Add an unambiguous generic Code form:

```text
CALL: (show)
CALL: (draw (x) (y))
```

The reserved `CALL:` prefix selects a registered custom procedure using its actual complete
template, argument IDs and argument types. Retain the actual procedure label
and signature. Unknown procedures, missing arguments, token spill and malformed
Boolean/value slots must report errors. Bare built-in commands retain their
meaning; existing unambiguous legacy calls, including labels beginning with `call`, remain readable. Value arguments in this form must be grouped; Boolean slots use `(<condition>)` to retain the actual signature. This is a generic
Code grammar form, not a new Arcade runtime command or a fake return value.

Pseudocode decompilation of a real `procedures_call` uses the explicit form.
Arcade import emits it for ordinary custom command calls, and its ownership
scan recognizes that form when placing definitions on the calling sprite.
Managed result calls keep their separate existing runtime contract. Other
code generators preserve their own language syntax. Saved SB3 holds ordinary
Scratch procedure blocks without a new custom serialization format.

## Acceptance

Verify colliding and ordinary procedure names, zero and multiple arguments,
Boolean slots, malformed invocations and a built-in command beside the custom
call. Reparse decompiled Code and compare actual procedure mutation/input shapes.
Execute selected original source, native Code, same and fresh SB3, original
export and reimport, retaining exact calls, side effects and complete rendered
pixels. Use the unchanged Snake source as an affected corpus witness; preserve
its separate timing boundary and all earlier failed observations. Focused
procedure correctness does not qualify whole-game cadence or installed GUI.

Coordinate canonical producer versions with controller-repeat and callable
suppliers; keep generated mirror/source-manifest gates intact. Follow-up
editor help should explain the explicit form without changing Blocks labels.

## Reached qualification

Five focused producer controls pass; together with existing decompiler,
MicroPython procedure and current CPX controls, 110 regression tests pass.
The consumer retains three real calls and two definitions on their owning
sprite. Native execution, Code, same and fresh saved SB3, actual selected
MakeCode export and reimport all agree on call effects and all 19,200 background
image pixels for the authored rendering fixture. Actual source and export
compilations and observations are preserved privately.

The unchanged Snake source now draws a nonempty screen with its rendering calls
retained. At the previous 1.62-second keyboard observation its body remains
`[1796, 1797]`; native time is still `0.06` versus original `0.04`. Random food
positions also differ. This witness closes the lost-call defect; it does not
establish complete-frame equality, cadence or whole-game GUI compatibility.
Final supplier checks, normal source composition and hosted editor proof remain
required before a main landing. Canonical CPX import files are vendored as real
supplier dependencies; no CPX runtime implementation is part of this lane.

## Reserved call grammar follow-up

[Supplier PR140](https://github.com/CrispStrobe/sb3-creator/pull/140) repairs the
legacy `call numbers` regression before consumer admission. Canonical calls
use the reserved colon and complete invocation group. Typed argument groups
retain Boolean versus value slots and distinguish literal labels from
arguments independently of definition order. Malformed legacy quotes and
groups remain errors. This consumer preparation awaits all supplier
checks and normal landing before app-pin adoption or public qualification.
