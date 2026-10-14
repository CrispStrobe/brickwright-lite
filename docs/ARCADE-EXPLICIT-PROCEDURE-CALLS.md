# Explicit custom procedure invocation

Status: proposed claim; no product implementation before merge.

## Defect and authoring contract

A registered procedure can have the same spelling as a built-in command.
Bare `show` currently chooses Scratch visibility even when the original source
calls its own rendering function. Definitions remain saved, while invocations
silently disappear. Translation without diagnostics does not prove that calls
were retained.

Add an unambiguous generic Code form:

```text
CALL show
CALL draw (x) (y)
```

The prefix selects a registered custom procedure using its actual complete
template, argument IDs and argument types. Retain the actual procedure label
and signature. Unknown procedures, missing arguments, token spill and malformed
Boolean/value slots must report errors. Bare built-in commands retain their
meaning; existing unambiguous legacy calls remain readable. This is a generic
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
