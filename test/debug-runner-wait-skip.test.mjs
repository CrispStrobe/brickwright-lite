/**
 * D-EMU-BP2 — a pause point on a `repeat` loop top never fired.
 *
 * The breakpoint was armed, the emulator halted on it on the very first frame,
 * and the runner threw the halt away. The culprit was one predicate that
 * absorbs the thousands of re-entries a pause point on a `wait` collects while
 * the dispatch loop revisits its `case` label. That suppression is right and
 * has to stay; it was asking the wrong question:
 *
 *   - it looped over EVERY task and returned true if ANY was waiting, while
 *     its own doc comment said "the task we stopped in"; and
 *   - it applied to every breakpoint, not only to pause points that ARE a
 *     wait — so a `repeat` loop top, which has no deadline of its own, was
 *     tested against someone else's.
 *
 * With two scripts running and one sitting in a `wait 1 seconds`, that
 * swallowed every breakpoint in the project for as long as it waited.
 *
 * These assertions are the reason the predicate is exported: the live gate
 * that caught this (`npm run smoke:debugger`) exits 2 and is SKIPPED in CI for
 * want of SDCC, so a closure-private version would have left the fix with no
 * gate that runs anywhere.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const {waitStillPending} = await import(
    path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js'));

/** The shape `target.position()` reports and a halt carries. */
const halt = (tasks) => ({cause: 'breakpoint', bp: 1, tasks});

const REPEAT = {task: 'bw_task1', state: 1, kind: 'repeat'};
const WAIT1 = {task: 'bw_task1', state: 2, kind: 'wait'};

test('the exact defect: a repeat loop top is NOT swallowed by another task’s wait', () => {
    // Taken from the failing run: task0 mid-wait (until 150, now 0), the halt
    // in task1 at its `repeat`. This returned true and ate the breakpoint.
    const why = halt([
        {task: 'bw_task0', state: 2, until: 150},
        {task: 'bw_task1', state: 1}
    ]);
    assert.equal(waitStillPending({why, blockYield: REPEAT, bwMs: 0}), false,
        'a repeat loop top has no deadline of its own and must stop on the first pass');
});

test('a repeat loop top is not tested against its OWN task’s leftover deadline', () => {
    // The generated C never clears `<task>_until` when a task leaves the wait
    // that set it, and `positionOf()` reports the variable whenever it is
    // non-zero — so a task sitting in a `repeat` still carries a deadline that
    // may be in the future. Only the block's KIND can tell the two apart, which
    // is why the guard is not merely an optimisation: without it this halt is
    // swallowed by a wait the task has already finished.
    const why = halt([{task: 'bw_task1', state: 1, until: 900}]);
    assert.equal(waitStillPending({why, blockYield: REPEAT, bwMs: 600}), false,
        'the mark is on a repeat; a leftover wait deadline is not its business');
});

test('a pause point on a wait still absorbs its own re-entries — the reason this exists', () => {
    const why = halt([{task: 'bw_task1', state: 2, until: 900}]);
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: 600}), true,
        'mid-wait, the dispatch loop re-enters this case label every pass; swallow it');
});

test('and stops on the pass where that wait is over', () => {
    const why = halt([{task: 'bw_task1', state: 2, until: 900}]);
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: 900}), false,
        'deadline reached is exactly the moment the user means by "pause here"');
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: 1200}), false);
});

test('a wait pause point is judged by ITS OWN task, not by whoever else is waiting', () => {
    const why = halt([
        {task: 'bw_task0', state: 2, until: 5000},   // a long wait, elsewhere
        {task: 'bw_task1', state: 2, until: 100}     // ours: already elapsed
    ]);
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: 900}), false,
        'task0 waiting says nothing about a pause point that lives in task1');
});

test('the 16-bit compare stays wraparound-safe', () => {
    // bw_ms is a 16-bit counter: 0xFFF0 -> 0x0010 is +32ms, not -65500.
    const why = halt([{task: 'bw_task1', state: 2, until: 0x0010}]);
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: 0xFFF0}), true,
        'still 32 ms to go across the wrap');
    const why2 = halt([{task: 'bw_task1', state: 2, until: 0xFFF0}]);
    assert.equal(waitStillPending({why: why2, blockYield: WAIT1, bwMs: 0x0010}), false,
        'the deadline is 32 ms behind us across the wrap');
});

test('a task with no deadline is never still waiting', () => {
    const why = halt([{task: 'bw_task1', state: 2}]);
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: 900}), false,
        '`until` absent is how the target reports a task that is not waiting');
});

test('missing inputs refuse rather than guess — erring towards stopping', () => {
    const why = halt([{task: 'bw_task1', state: 2, until: 900}]);
    assert.equal(waitStillPending({why, blockYield: undefined, bwMs: 600}), false,
        'a halt whose block cannot be resolved must stop, not vanish');
    assert.equal(waitStillPending({why, blockYield: WAIT1, bwMs: undefined}), false,
        'no clock means no evidence of waiting');
    assert.equal(waitStillPending({why: null, blockYield: WAIT1, bwMs: 600}), false);
    assert.equal(waitStillPending({why: {cause: 'breakpoint', bp: 1}, blockYield: WAIT1, bwMs: 600}), false,
        'no task list means nothing to compare against');
});
