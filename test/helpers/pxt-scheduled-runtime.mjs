// Execute a finite core fixture using the ORIGINAL PXT Runtime and scheduler.
// No simulator instruction, shim, action implementation or emitted source is rewritten.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {performance} from 'node:perf_hooks';
import process from 'node:process';
import {setTimeout as hostTimeout, clearTimeout as hostClearTimeout,
    setInterval as hostInterval, clearInterval as hostClearInterval,
    setImmediate as hostImmediate} from 'node:timers';
import {compile, STATIC} from '../../scripts/lib/pxt-node.mjs';

export async function runPxtScheduled(source, {timeoutMs = 5000} = {}) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000)
        throw new Error('PXT scheduled fixture requires a bounded timeout');
    const files = {'main.ts': source};
    files['pxt.json'] = JSON.stringify({name: 'bw-scheduled-language-oracle',
        dependencies: {core: '*'}, files: ['main.ts']});
    const built = await compile('arcade', files);
    if (!built.success) throw new Error(JSON.stringify(built.diagnostics));
    const timeouts = new Set(), intervals = new Set();
    const setTimeoutOwned = (callback, delay, ...args) => {
        let handle;
        handle = hostTimeout(function (...values) {
            timeouts.delete(handle);
            return Reflect.apply(callback, this, values);
        }, delay, ...args);
        timeouts.add(handle); return handle;
    };
    const clearTimeoutOwned = handle => {timeouts.delete(handle); hostClearTimeout(handle);};
    const setIntervalOwned = (callback, delay, ...args) => {
        const handle = hostInterval(callback, delay, ...args);
        intervals.add(handle); return handle;
    };
    const clearIntervalOwned = handle => {intervals.delete(handle); hostClearInterval(handle);};
    const context = {console, TextEncoder, TextDecoder, performance,
        setTimeout: setTimeoutOwned, clearTimeout: clearTimeoutOwned,
        setInterval: setIntervalOwned, clearInterval: clearIntervalOwned,
        window: {addEventListener () {}}, document: {}, navigator: {}};
    vm.createContext(context);
    let runtime, fiberDescriptor, fiberInstalled = false, primary, hasPrimary = false;
    const errors = [], cleanupErrors = [];
    let mainCompleted = false, started = 0, completed = 0, pending = 0, result;
    const realmPromise = vm.runInContext('Promise', context, {timeout: 2000});
    const rejectionObserver = (reason, promise) => {
        // Original U.nextTick creates VM-realm Promises. Its callback can throw
        // before Runtime.loop routes errors, leaving the fiber Promise pending.
        if (promise instanceof realmPromise) errors.push(reason);
        else throw reason; // never suppress an unrelated process rejection
    };
    process.on('unhandledRejection', rejectionObserver);
    try {
        vm.runInContext(fs.readFileSync(path.join(STATIC, 'arcade/sim/pxtsim.js'), 'utf8'),
            context, {timeout: 2000});
        const original = context.pxsim;
        if (typeof original.Runtime !== 'function' || typeof original.initBareRuntime !== 'function')
            throw new Error('Original PXT Runtime/bare board is unavailable');
        // Select the actual original bare/core board initializer; never invent shims.
        original.initCurrentRuntime = original.initBareRuntime;
        const message = {type: 'run', id: 'bw-native-array-export-oracle',
            code: built.outfiles['binary.js'], breakOnStart: false};
        runtime = new original.Runtime(message);
        runtime.errorHandler = error => {errors.push(error);};
        await runtime.board.initAsync(message);
        const originalFiber = runtime.runFiberAsync;
        fiberDescriptor = Object.getOwnPropertyDescriptor(runtime, 'runFiberAsync');
        Object.defineProperty(runtime, 'runFiberAsync', {configurable: true, writable: true,
            value: function (...args) {
                started++; pending++;
                let promise;
                try {promise = Reflect.apply(originalFiber, this, args);}
                catch (error) {pending--; errors.push(error); throw error;}
                promise.then(() => {completed++; pending--;}, error => {pending--; errors.push(error);});
                // The real original Promise/receiver/arguments remain unchanged.
                return promise;
            }});
        fiberInstalled = true;
        context.__bwRuntime = runtime;
        context.__bwMainDone = () => {mainCompleted = true;};
        const deadline = performance.now() + timeoutMs;
        vm.runInContext('__bwRuntime.run(__bwMainDone)', context, {timeout: 2000});
        const idle = () => mainCompleted && pending === 0 && runtime.otherFrames.length === 0 &&
            runtime.loopLock === null && runtime.loopLockWaitList.length === 0 &&
            runtime.timeoutsScheduled.length === 0 && timeouts.size === 0;
        while (true) {
            if (errors.length) throw errors[0];
            if (performance.now() >= deadline) throw new Error('Original PXT scheduler did not complete its finite fixture');
            if (idle()) {
                const observedStarted = started;
                await new Promise(resolve => hostImmediate(resolve));
                await new Promise(resolve => hostImmediate(resolve));
                if (errors.length) throw errors[0];
                if (idle() && started === observedStarted) break;
            }
            await new Promise(resolve => hostTimeout(resolve, 1));
        }
        if (started !== completed) throw new Error('Original PXT child fiber completion differs');
        result = {globals: Object.fromEntries(Object.entries(runtime.globals)
            .map(([key, value]) => [key.replace(/___\d+$/, ''), value])),
        scheduler: {mainCompleted, childFibersStarted: started, childFibersCompleted: completed,
            pendingChildFibers: pending, suspendedFrames: runtime.otherFrames.length,
            observedErrors: errors.length, initializer: 'original initBareRuntime'}};
    } catch (error) {primary = error; hasPrimary = true;}
    finally {
        const attempt = action => {try {action();} catch (error) {cleanupErrors.push(error);}};
        if (runtime && fiberInstalled) attempt(() => {
            if (fiberDescriptor) Object.defineProperty(runtime, 'runFiberAsync', fiberDescriptor);
            else delete runtime.runFiberAsync;
        });
        // Constructor failure can still publish its actual runtime before throwing.
        const ownedRuntime = runtime || context.pxsim?.runtime;
        if (ownedRuntime) {
            attempt(() => ownedRuntime.kill());
            if (ownedRuntime.board) attempt(() => ownedRuntime.board.kill());
        }
        for (const handle of timeouts) attempt(() => hostClearTimeout(handle));
        for (const handle of intervals) attempt(() => hostClearInterval(handle));
        timeouts.clear(); intervals.clear();
        attempt(() => process.removeListener('unhandledRejection', rejectionObserver));
        if (result) result.scheduler.cleanup = {runtimeKillReturned: cleanupErrors.length === 0,
            ownedTimeouts: timeouts.size, ownedIntervals: intervals.size,
            cleanupErrorCount: cleanupErrors.length};
    }
    if (hasPrimary) throw primary; // preserve the actual original error identity
    if (cleanupErrors.length) throw cleanupErrors[0];
    return result;
}
