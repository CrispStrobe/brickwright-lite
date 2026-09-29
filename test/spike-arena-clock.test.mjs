import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VmStepClock, NOMINAL_STEP_MS, INERT_AFTER_FRAMES} from
    '../overlay/scratch-gui/src/lib/spike-arena/arena-clock.js';

/** A stand-in runtime: counts its own calls so we can prove we did not replace it. */
const fakeRuntime = (currentStepTime = 33) => ({
    currentStepTime,
    ran: 0,
    _step () { this.ran += 1; return 'original'; }
});

test('simulated time comes from steps the VM actually took, not from elapsed time', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    assert.equal(clock.install(rt), true);

    // No steps: no time. This is the whole fix — a starved VM cannot have its
    // mission budget drained by frames that keep arriving.
    assert.equal(clock.take(), 0);

    rt._step();
    rt._step();
    rt._step();
    assert.equal(clock.take(), 99);
    assert.equal(clock.take(), 0, 'take() is a withdrawal, not a reading');
});

test('the runtime keeps doing its own work — the clock counts, it does not take over', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime();
    clock.install(rt);
    assert.equal(rt._step(), 'original', 'the original return value must survive');
    rt._step();
    assert.equal(rt.ran, 2, 'the original _step must still run every time');
});

test('a second install does not make time run twice as fast', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    assert.equal(clock.install(rt), true);
    assert.equal(clock.install(rt), false, 're-entering start() must not double count');
    rt._step();
    assert.equal(clock.take(), 33);
});

test('uninstall puts the runtime back exactly as it was', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime();
    const before = rt._step;
    clock.install(rt);
    assert.notEqual(rt._step, before);
    assert.equal(clock.uninstall(), true);
    assert.equal(rt._step, before);
    rt._step();
    assert.equal(clock.take(), 0, 'an uninstalled clock must not keep accruing');
});

test('uninstall refuses to clobber a later wrapper somebody else installed', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime();
    clock.install(rt);
    const ours = rt._step;
    let outer = 0;
    rt._step = (...args) => { outer += 1; return ours.apply(rt, args); };
    // Ours is no longer the outermost: restoring would delete `outer`'s wrapper.
    assert.equal(clock.uninstall(), false);
    rt._step();
    assert.equal(outer, 1, "the other wrapper must still be in the chain");
    assert.equal(clock.installed, false, 'but this clock has stopped counting');
});

test('the nominal interval is used when the VM has not started', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(null);
    clock.install(rt);
    rt._step();
    assert.equal(clock.take(), NOMINAL_STEP_MS);
});

test('a changed step interval is honoured — turbo mode is not a different clock', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    clock.install(rt);
    rt._step();
    rt.currentStepTime = 10;
    rt._step();
    assert.equal(clock.take(), 43, 'each step is worth the interval in force when it ran');
});

test('clear() drops owed time so a resume cannot spend the pause', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    clock.install(rt);
    rt._step();
    rt._step();
    clock.clear();
    assert.equal(clock.take(), 0);
});

test('install refuses a runtime that has no _step, rather than pretending', () => {
    const clock = new VmStepClock();
    assert.equal(clock.install(null), false);
    assert.equal(clock.install({}), false);
    assert.equal(clock.installed, false);
});

// THE REGRESSION THIS REPLACES, stated as a measurement rather than prose.
// The old pane advanced by Math.min(100, now - lastFrame). Under a stalled VM
// that keeps accruing mission time; under the step clock it cannot.
test('a stalled VM drains no mission budget, where the wall clock drained 15 s of it', () => {
    const BUDGET_MS = 15000;

    // The old rule, replayed over a 50 ms-apart animation loop during which the
    // VM never stepped once. 301 frames is 300 deltas (the first is 0), which is
    // exactly the 15 s budget — the point being that the stalled VM reaches the
    // deadline on frames alone.
    const FRAMES = 301;
    let wallClockTime = 0;
    let last = null;
    for (let i = 0; i < FRAMES; i++) {
        const now = i * 50;
        const dt = last === null ? 0 : Math.min(100, now - last);
        last = now;
        wallClockTime += dt;
    }
    assert.ok(wallClockTime >= BUDGET_MS,
        `the old clock spends the whole ${BUDGET_MS} ms budget on a stalled VM (spent ${wallClockTime})`);

    // The new rule over the same frames, same stalled VM.
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    clock.install(rt);
    let steppedTime = 0;
    for (let i = 0; i < FRAMES; i++) steppedTime += clock.take();
    assert.equal(steppedTime, 0, 'the step clock spends nothing while the VM is stalled');

    // And when the VM does run, the budget is spent at exactly the nominal rate,
    // independent of how fast or slow the frames arrived.
    for (let i = 0; i < 100; i++) rt._step();
    assert.equal(clock.take(), 3300);
});

test('an installed-but-never-called hook is reported inert, not silently frozen', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    clock.install(rt);
    // Simulate upstream binding _step at start(): our reassignment is never seen.
    for (let i = 0; i < INERT_AFTER_FRAMES - 1; i++) {
        assert.equal(clock.take(), 0);
        assert.equal(clock.isInert(), false, 'a slow start is not yet evidence of inertness');
    }
    clock.take();
    assert.equal(clock.isInert(), true,
        'a clock that never counted a step must say so, or a frozen mission clock ' +
        'makes every mission pass by never timing out');
});

test('a hook that IS called is never reported inert, however long the run', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    clock.install(rt);
    rt._step();
    for (let i = 0; i < INERT_AFTER_FRAMES * 3; i++) clock.take();
    assert.equal(clock.isInert(), false);
});

test('clear() re-arms the inert detector so a fresh run is judged on its own frames', () => {
    const clock = new VmStepClock();
    const rt = fakeRuntime(33);
    clock.install(rt);
    for (let i = 0; i < INERT_AFTER_FRAMES; i++) clock.take();
    assert.equal(clock.isInert(), true);
    clock.clear();
    assert.equal(clock.isInert(), false, 'a restart must not inherit the last run s verdict');
});
