# Arcade source startup and loops

MakeCode source startup imports as `WHEN arcade source starts:`. Source `while`
and `for` loops import as `arcade repeat while CONDITION:`. These are genuine
Arcade hat and loop blocks, available to Code and Blocks authoring through the
shared dialect. Ordinary Scratch green-flag and control blocks retain their
existing identities.

The source loop reevaluates its positive Boolean condition on every iteration.
It preserves changing bounds, expression initializers, multiple declarations,
omitted tests and break guards. It exports a TypeScript `while` loop without an
invented `pause(20)`. Stock Scratch loops continue to use their existing exporter.
Source startup queues after the Arcade extension resets its run state; the body
runs after the VM finishes green-flag initialization.

## Qualification boundary

Four focused controls pass, including unchanged original/native variable values,
Code decompilation, fresh SB3 reload, original compiler/runtime execution of the
export and reimport. Five importer line/decompiler checks and eight existing
legacy scroller, character-animation and SpriteKind roundtrip controls pass on
the updated consumer. The shared producer adds two explicit forms and reports
620 passing checks without skips; hosted checks are separate.

These controls establish graph structure and eventual loop results. They do not
establish exact original frame scheduling for finite loops that draw, mixed
ordinary/source threads, scene replacement, debugger suspension or the physical
GUI cadence. Those requirements belong to the
[frame scheduler lane](https://github.com/CrispStrobe/brickwright-lite/pull/881). Its diagnostic prototype
must be integrated and qualified through actual consumer, GUI and original
runtime controls before a full-game promotion. Unknown or unsupported loop
expressions remain reported rather than silently replaced.
