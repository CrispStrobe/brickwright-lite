import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';

// Native-only fixtures have no compiled targets or runnable hat threads. They
// still implement Scratch Runtime.startHats and record actual dispatch requests.
export function createArcadeRuntimeMock() {
    const runtime = new EventEmitter();
    // Actual Scratch Runtime always owns a targets array. Native-only tests
    // deliberately contain no compiled targets; empty is explicit, not a
    // production fallback for malformed targets or invalid source preludes.
    runtime.targets = [];
    runtime.hatRequests = [];
    runtime.startHats = (...args) => {
        assert.equal(typeof args[0], 'string');
        runtime.hatRequests.push(args);
        return [];
    };
    return runtime;
}

export function startArcadeProject(runtime) {
    const before = runtime.hatRequests.length;
    runtime.emit('PROJECT_START');
    assert.deepEqual(runtime.hatRequests.slice(before), [['arcade_whenSourceStarts']],
        'a real PROJECT_START must request the Arcade source startup hat exactly once');
}
