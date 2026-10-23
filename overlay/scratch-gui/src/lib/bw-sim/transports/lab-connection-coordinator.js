// SPDX-License-Identifier: BSD-3-Clause
// Pane-independent connection state. Scene changes invalidate routes and stop
// execution synchronously; provider cleanup may finish later. New scene routes
// remain unavailable until that cleanup completes and Connect admits them.
import {createLabVirtualTransports} from './lab-virtual-transports.js';
import {createLabExtensionConnection} from './lab-extension-connection.js';

export const labConnectionRoutes = (scene, record) => {
    if (!scene || scene._disposed || scene.lockstep || !record?.hub) return [];
    if (record.profile === 'ev3') return ['bluetooth', 'serial', 'bridge', 'http'];
    if (record.profile === 'nxt') return ['bluetooth', 'serial', 'bridge'];
    if (record.profile === 'spike-prime') return record.hub.hubState?.data.firmwareTarget === 'legacy-v2' ?
        ['bluetooth', 'bridge'] : ['bluetooth'];
    if (record.hub.protocol === 'lwp3') return ['bluetooth', 'http'];
    if (record.hub.protocol === 'wedo2') return ['bluetooth'];
    return [];
};

const canceled = () => new DOMException('The Lab connection request was replaced.', 'AbortError');
const failureOf = errors => errors.length === 1 ? errors[0] : new AggregateError(errors, 'Lab connection cleanup failed');

/** stopProgram receives the captured old VM/scene, and must retire their program
 * and motor ownership. prepareRun commits the pane's running state; startClock
 * installs its clock. The coordinator calls the actual VM greenFlag only after
 * those async/synchronous boundaries still belong to the admitted request.
 * Callers observe returned cleanup promises, without awaiting them before
 * publishing a replacement scene. Cleanup errors also block new admission.
 */
export const createLabConnectionCoordinator = ({getVM, stopClock, stopProgram,
    startClock, prepareRun = () => {}, onState = () => {},
    host = globalThis, navigatorHost = typeof navigator === 'undefined' ? null : navigator,
    wait, routing = createLabVirtualTransports({host, navigatorHost})}) => {
    let scene = null;
    let sceneVM = null;
    let hubId = null;
    let route = 'bluetooth';
    let status = 'idle';
    let error = null;
    let revision = 0;
    let runIntent = null;
    let runCalls = 0;
    let request = null;
    let disposed = false;
    let disposal = null;
    let cleanupFailure = null;
    const pending = new Set();
    const bricks = () => (scene?.hubs || []).filter(record => labConnectionRoutes(scene, record).length);
    const target = () => scene?.hubs.find(record => record.id === hubId) || null;
    const snapshot = () => ({hubId, route, status, message: error?.message || '',
        bricks: bricks().map(record => ({id: record.id, profile: record.profile})),
        routes: labConnectionRoutes(scene, target())});
    const publish = () => onState(snapshot());
    const live = () => { if (disposed) throw new DOMException('The Lab connection view is closed.', 'InvalidStateError'); };
    const observe = action => {
        let value;
        try { value = action(); } catch (caught) { value = Promise.reject(caught); }
        const outcome = Promise.resolve(value).then(() => null, caught => {
            if (!cleanupFailure) cleanupFailure = caught;
            return {error: caught};
        });
        pending.add(outcome);
        outcome.then(() => pending.delete(outcome));
        return outcome;
    };
    const joined = tasks => Promise.all(tasks).then(results => {
        const errors = results.filter(Boolean).map(result => result.error);
        if (errors.length) throw failureOf(errors);
    });
    const drain = async current => {
        while (pending.size) {
            await Promise.all([...pending]);
            if (!current()) throw canceled();
        }
        if (cleanupFailure) throw cleanupFailure;
    };
    const invalidate = () => {
        const stamp = ++revision;
        runIntent = null;
        const previous = request;
        request = null;
        if (previous) previous.active = false;
        const oldVM = previous?.vm || sceneVM;
        const oldScene = scene;
        // Tombstones precede host callbacks: late HTTP writes cannot discover
        // a replacement brick at the same loopback address or device ID.
        const tasks = [observe(() => routing.setScene(null)),
            observe(() => stopClock?.(oldScene)), observe(() => stopProgram?.(oldVM, oldScene))];
        if (previous?.connection) tasks.push(observe(() => previous.connection.cancel()));
        return {stamp, tasks};
    };
    const configure = (stamp, tasks) => {
        if (stamp !== revision || disposed) return;
        status = 'idle'; error = null;
        if (route !== 'bluetooth') tasks.push(observe(() => routing.setEnabled(true)));
        else {
            const previous = [...pending];
            tasks.push(observe(async () => {
                await Promise.all(previous);
                if (cleanupFailure) throw cleanupFailure;
                if (stamp === revision && route === 'bluetooth' && !disposed) await routing.setEnabled(false);
            }));
        }
        if (stamp === revision && !disposed) publish();
    };
    const selectedExtension = record => {
        const vm = getVM();
        let ids;
        if (record.profile === 'ev3') ids = [route === 'http' ? 'scratchtoev3' : 'ev3comprehensive'];
        else if (record.profile === 'nxt') ids = ['legonxt'];
        else if (record.profile === 'spike-prime') ids = ['spikeprime'];
        else ids = ['legopoweredup', 'legoboostunified'];
        const id = ids.find(candidate => typeof vm?.runtime?._primitives[`${candidate}_${
            candidate === 'scratchtoev3' ? 'testConnection' : candidate === 'spikeprime' ? 'connectHubAt' : 'connect'}`] === 'function');
        if (!id) throw new Error('Load a program using the matching LEGO extension before connecting.');
        return {vm, id};
    };
    const current = ticket => !disposed && ticket.active && request === ticket && revision === ticket.revision &&
        scene === ticket.scene && !scene?._disposed && route === ticket.route && hubId === ticket.record.id &&
        scene.hubs.includes(ticket.record) && ticket.record.hub === ticket.hub && ticket.record.profile === ticket.profile &&
        ticket.hub.hubState === ticket.hubState && getVM() === ticket.vm && labConnectionRoutes(scene, ticket.record).includes(route);
    const connect = () => {
        live();
        const record = target();
        if (route === 'bluetooth' || !labConnectionRoutes(scene, record).includes(route)) {
            return Promise.reject(new Error('Select a supported virtual connection for this brick.'));
        }
        if (request && status === 'connecting' && current(request)) return request.ready;
        const selected = selectedExtension(record);
        const transition = invalidate();
        if (transition.stamp !== revision) return Promise.reject(canceled());
        const ticket = {active: true, revision, scene, record, hub: record.hub, profile: record.profile,
            hubState: record.hub.hubState, route, vm: selected.vm, id: selected.id, connection: null, ready: null};
        request = ticket;
        status = 'connecting'; error = null;
        ticket.ready = Promise.resolve().then(async () => {
            try {
                if (ticket.publicationError) throw ticket.publicationError;
                await drain(() => current(ticket));
                if (!current(ticket)) throw canceled();
                if (ticket.profile === 'spike-prime') ticket.hubState.setSimulationEnabled(true);
                if (!current(ticket)) throw canceled();
                await joined([observe(() => routing.setScene(ticket.scene, {hubId: ticket.record.id})),
                    observe(() => routing.setEnabled(true))]);
                if (!current(ticket)) throw canceled();
                ticket.connection = createLabExtensionConnection({vm: ticket.vm, extensionId: ticket.id, route: ticket.route,
                    host, wait, isCurrent: () => current(ticket)});
                await ticket.connection.ready;
                if (!current(ticket)) throw canceled();
                status = 'connected';
                publish();
                if (!current(ticket)) throw canceled();
                return {hubId: ticket.record.id, route: ticket.route, extensionId: ticket.id};
            } catch (caught) {
                const active = current(ticket);
                ticket.active = false;
                if (ticket.connection) observe(() => ticket.connection.cancel());
                if (active) {
                    request = null; status = 'failed'; error = caught;
                    observe(() => routing.setScene(null));
                    try { publish(); }
                    catch (publicationError) {
                        if (publicationError !== caught) throw new AggregateError([caught, publicationError], 'Lab connection and publication failed');
                    }
                }
                throw caught;
            }
        });
        try { publish(); }
        catch (caught) {
            const active = current(ticket);
            ticket.publicationError = caught;
            ticket.active = false;
            if (active) {
                request = null; status = 'failed'; error = caught;
                observe(() => routing.setScene(null));
            }
        }
        return ticket.ready;
    };
    return {
        snapshot,
        setScene (next, {hubId: nextId = null} = {}) {
            live();
            const transition = invalidate();
            if (transition.stamp !== revision) return joined(transition.tasks);
            scene = next?._disposed ? null : next;
            sceneVM = scene ? getVM() : null;
            const offered = bricks();
            const chosen = nextId === null ? offered[0] : offered.find(record => record.id === nextId);
            hubId = chosen?.id || null;
            if (nextId !== null && !chosen) {
                const refused = new Error('The selected brick is not in this scene.');
                status = 'failed'; error = refused; publish();
                return joined(transition.tasks).then(() => { throw refused; });
            }
            if (!labConnectionRoutes(scene, chosen).includes(route)) route = 'bluetooth';
            configure(transition.stamp, transition.tasks);
            return joined(transition.tasks);
        },
        select ({hubId: nextId = hubId, route: nextRoute = route}) {
            live();
            const chosen = bricks().find(record => record.id === nextId);
            if (!chosen || !labConnectionRoutes(scene, chosen).includes(nextRoute)) throw new TypeError('Unsupported brick or connection.');
            const transition = invalidate();
            if (transition.stamp === revision) { hubId = nextId; route = nextRoute; configure(transition.stamp, transition.tasks); }
            return joined(transition.tasks);
        },
        connect,
        async run () {
            live();
            const call = ++runCalls;
            const intent = {};
            const ready = connect();
            if (call !== runCalls) throw canceled();
            runIntent = intent;
            const ticket = request;
            await ready;
            const admitted = () => runIntent === intent && current(ticket);
            try {
                if (!admitted()) throw canceled();
                await prepareRun(ticket.scene, ticket.vm);
                if (!admitted()) throw canceled();
                startClock?.(ticket.scene, ticket.vm);
                if (!admitted()) throw canceled();
                ticket.vm.greenFlag();
                if (!admitted()) throw canceled();
            } catch (caught) {
                // A failed callback may already have installed the clock or
                // started a script. Retire those effects only while this Run
                // still owns them; reentrant replacement belongs to its caller.
                if (!admitted()) throw caught;
                const errors = [caught];
                const transition = invalidate();
                if (transition.stamp === revision && !disposed) {
                    status = 'failed'; error = caught;
                    try { publish(); } catch (publicationError) { errors.push(publicationError); }
                }
                try { await joined(transition.tasks); }
                catch (cleanupError) { errors.push(cleanupError); }
                if (errors.length === 1) throw caught;
                throw new AggregateError(errors, 'Lab execution and rollback failed');
            }
        },
        pauseRun () {
            live();
            ++runCalls;
            runIntent = null;
            stopClock?.(scene);
        },
        disconnect () {
            live();
            const transition = invalidate();
            if (transition.stamp === revision) { status = 'idle'; error = null; publish(); }
            return joined(transition.tasks);
        },
        dispose () {
            if (disposed) return disposal || Promise.resolve();
            disposed = true;
            const transition = invalidate();
            scene = null; hubId = null; status = 'idle';
            // Keep tombstones until old producers finish; restoring native
            // fetch sooner could send their late writes to a physical bridge.
            const previous = [...pending];
            transition.tasks.push(observe(async () => {
                await Promise.all(previous);
                if (cleanupFailure) throw cleanupFailure;
                await routing.dispose();
            }));
            disposal = joined(transition.tasks);
            return disposal;
        }
    };
};
