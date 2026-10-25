# Arcade source condition polling

Status: bounded development implementation, 2026-10-15. Consumer adoption and
visible editor qualification remain separate gates.

## Behavior and representation

Imported `pauseUntil` and `control.waitUntil` keep a connected ordinary
`control_wait_until` block and its actual predicate. Pseudocode retains
`wait until <condition>`. Code, saved projects and current MakeCode export keep
that editable graph; no original-source restoration supplies execution.

The source runtime evaluates the condition optimistically. A false result parks
the actual caller and enrolls it in the shared poll queue. Independent scene
updates and timer workers can then advance. Queue polling retains its zero and
50 millisecond phases; a true sample resumes the caller once without evaluating
the predicate a third time during delivery. Actual managed helper calls may
suspend while independent workers progress. Capture cells remain live.

This scheduling belongs to managed Arcade source callers. Ordinary Scratch
green-flag waits retain stock yielding. Normal hat enumeration does not require
a sequencer execution loan. Actual source waits and their managed descendants
still validate their current graph, cached operand routing and caller lifetime
before predicate effects. Stop, disposal, reload, ownership loss and errors
retire pending work without resuming an obsolete caller.

Implementation entry points:

- `overlay/scratch-vm/src/util/bw-source-condition-waits.js`
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/frame-phase.js`
- `overlay/scratch-vm/src/extensions/crispstrobe/arcade/poll-events.js`
- `scripts/lib/primitive-owner-hooks.mjs`

## Evidence and retained failures

The initial implementation intercepted ordinary startup hats and caused real
startup failures. The correction narrows ingress before applying wait-specific
checks. Its affected runtime run passed 52 of 53 cases. The remaining test
incorrectly moved source scalar declarations under a green flag and failed
before reaching its wait assertion. A genuine ordinary Scratch fixture then
passed separately, with product bytes unchanged. These are two observed runs,
not one fresh 53-case pass. Earlier 28 poll, scene, execution-owner and hook
controls remain separate evidence. Listener warnings are retained.

The affected files are `test/makecode-arcade-frame-phase.test.mjs`,
`test/makecode-arcade-source-condition-waits.test.mjs` and
`test/makecode-arcade-source-timer-lifecycle.test.mjs`. Controls cover real scene
progress, optimistic and repeated predicate effects, captured locals,
asynchronous helpers, independent waiters, graph/cache changes and cancellation.

## Remaining source and GUI gaps

- The optional timeout argument is explicitly refused on import. It needs a
  genuine source, Blocks, Code, persistence and export contract; ignoring it or
  silently replacing it with an unbounded wait is not support.
- Qualify visible editing of the connected predicate, including a managed
  helper, while independent scene workers run. Check Code feedback, save and
  fresh reopen, changed current export and actual controller-pane input.
- A predicate awaiting its own serial poll fiber can depend on that same fiber.
  These controls do not establish general deadlock freedom or all-game parity.

Authentic project results belong in the
[project ledger](arcade-authentic-project-qualification.md), independently of
these minimal runtime controls.
