// Actual VM source-program controls with one shared external timer platform.
// No source rewriting, primitive substitutes or synthetic timer deltas.
import {runProgram, stepFrames} from './bw-vm.mjs';
import {createArcadeDiscreteTimers} from './arcade-discrete-timers.mjs';

export async function restartTimedArcadeRun(run, milliseconds, {beforeFirstFrame} = {}) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('A finite nonnegative observation deadline is required');
    run.vm.stopAll();
    const clock = createArcadeDiscreteTimers();
    run.vm.runtime.bwArcadeProgramClock = clock;
    run.vm.runtime.updateCurrentMSecs = () => { run.vm.runtime.currentMSecs = clock.now(); };
    run.vm.greenFlag();
    if (beforeFirstFrame !== undefined) await beforeFirstFrame(run);
    // The initial physical frame has delta zero, as in the original source
    // profile. All later frame and pause continuations use actual deadlines.
    await stepFrames(run.vm, 1, 0);
    await clock.advanceTo(milliseconds);
    return clock;
}

export async function runTimedArcadeProgram(source, {milliseconds, ...options}) {
    const run = await runProgram(source, {...options, frames: 0, frameAuthority: 'timed'});
    try {
        run.clock = await restartTimedArcadeRun(run, milliseconds);
        return run;
    } catch (error) {
        run.vm.stopAll(); run.vm.quit();
        throw error;
    }
}
