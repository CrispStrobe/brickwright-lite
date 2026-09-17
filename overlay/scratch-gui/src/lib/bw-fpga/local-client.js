/**
 * The page's half of the Yosys worker: ids, promises, and progress.
 *
 * `postMessage` is fire-and-forget, so every request needs an id and a promise
 * waiting under it. That bookkeeping is boring and is exactly where workers go
 * wrong — a reply matched to the wrong promise, or a promise nobody ever
 * settles because the worker died. Both are handled here, once, rather than at
 * each call site.
 *
 * THE WORKER IS INJECTED. `new Worker(new URL(...), {type: 'module'})` is a
 * webpack-specific incantation that only means anything inside a build, and no
 * build compiles this surface (BW_ENABLE_FPGA). Passing a factory in keeps this
 * module testable against a fake worker that routes straight to
 * worker-protocol.js — which tests the two halves TOGETHER, against the real
 * protocol, without a Worker existing. Same reason sim.js takes its engine.
 *
 * WHAT IT GUARANTEES, and each of these is a bug it exists to prevent:
 *   - one id per request, never reused, so a late reply cannot settle a newer
 *     promise
 *   - a worker error settles EVERY outstanding promise with a named refusal,
 *     rather than leaving the UI spinning on a dead worker
 *   - `state` messages are progress, not replies: they carry the id of the
 *     request that caused them and must not settle it
 *
 * @module
 */

export const CLIENT_PROTOCOL = 1;

const dead = reason => ({ok: false, code: 'worker-gone', reason});

/**
 * @param {object} opts
 * @param {Function} opts.spawn      () => a Worker-like {postMessage, terminate,
 *                                   onmessage, onerror}
 * @param {Function} [opts.onState]  progress and state, as they arrive
 */
export function createLocalClient ({spawn, onState = null} = {}) {
    let worker = null;
    let nextId = 1;
    const pending = new Map();

    const settleAll = result => {
        for (const resolve of pending.values()) resolve(result);
        pending.clear();
    };

    const ensure = () => {
        if (worker) return worker;
        worker = spawn();
        worker.onmessage = event => {
            const msg = event && event.data;
            if (!msg || msg.id === undefined) return;
            // `progress` reports on a request without answering it. It must be
            // its own type: while it shared `state` with the reply to `describe`,
            // this branch swallowed that reply and the promise never settled.
            // Distinguishing "about the state" from "answers your question" is
            // the protocol's job, not a heuristic here.
            if (msg.type === 'progress') { if (onState) onState(msg); return; }
            const resolve = pending.get(msg.id);
            if (!resolve) return;          // a reply to a request we gave up on
            pending.delete(msg.id);
            resolve(msg);
        };
        worker.onerror = e => {
            // A dead worker must not leave the UI waiting forever. Everything
            // outstanding is refused by name, and the next call respawns.
            settleAll(dead(`The local toolchain worker stopped: ${e && e.message
                ? e.message : 'no reason given'}`));
            worker = null;
        };
        return worker;
    };

    const send = (type, body = {}) => {
        const w = ensure();
        const id = nextId++;
        return new Promise(resolve => {
            pending.set(id, resolve);
            w.postMessage({id, type, ...body});
        });
    };

    return {
        init: () => send('init'),
        describe: () => send('describe'),
        // Consent is passed through as an explicit boolean rather than whatever
        // the caller had: the worker checks `=== true`, and this is the boundary
        // where a truthy string would otherwise sneak across.
        download: ({consent = false} = {}) => send('download', {consent: consent === true}),
        synthesise: ({files, top = null}) => send('synthesise', {files, top}),
        get outstanding () { return pending.size; },
        terminate: () => {
            if (worker) worker.terminate();
            worker = null;
            settleAll(dead('The local toolchain worker was stopped.'));
        }
    };
}
