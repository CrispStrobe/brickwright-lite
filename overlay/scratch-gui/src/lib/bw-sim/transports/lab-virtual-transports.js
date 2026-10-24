// SPDX-License-Identifier: BSD-3-Clause
// Explicit Robot Lab routing. Each binding captures its own scene and bricks;
// asynchronous transport work never looks up a replacement scene's brick.
import {installVirtualBridge, registerVirtualBridge} from './virtual-bridge.js';
import {installVirtualFetch, registerVirtualHttp} from './virtual-http.js';
import {installVirtualSerial} from './virtual-serial.js';
import {createVirtualBleBridge} from './virtual-ble-bridge.js';
import {createVirtualEv3dev} from './virtual-ev3dev.js';
import {spikeStreamPeripheral} from './virtual-spike-stream.js';
import {ev3ClassicPeripheral} from '../hubs/ev3/ev3-peripheral.js';
import {nxtClassicPeripheral} from '../hubs/nxt/nxt-peripheral.js';
import {Lwp3Peripheral} from '../../virtual-hub/lab-ble-peripherals.js';

const BLE_PATHS = new Set(['/scan', '/connect', '/disconnect', '/write', '/notifications']);
const ev3devPath = url => url.pathname === '/' || /^\/(motor|sensor|button)\//.test(url.pathname);
const bridgePath = url => url.pathname === '/';
const unavailable = () => { throw new DOMException('This virtual brick is not in the current Robot Lab scene.', 'NetworkError'); };

// Run every release even when one producer throws. Promise rejection remains
// visible to the caller, after all owned connections have been invalidated.
const releaseAll = releases => {
    const results = releases.reverse().map(release => {
        try { return Promise.resolve(release()); } catch (error) { return Promise.reject(error); }
    });
    return Promise.allSettled(results).then(settled => {
        const errors = settled.filter(r => r.status === 'rejected').map(r => r.reason);
        if (errors.length) throw new AggregateError(errors, 'Robot Lab connection cleanup failed');
    });
};

/**
 * Disabled by default: native WebSocket/fetch/serial retain their usual routes.
 * While enabled, known loopback bridge addresses belong to the Lab, including
 * a missing-brick refusal. Other addresses and unrelated paths fall through.
 * setScene/setEnabled invalidate synchronously; await their returned cleanup.
 */
export const createLabVirtualTransports = ({host = globalThis,
    navigatorHost = typeof navigator === 'undefined' ? null : navigator} = {}) => {
    let enabled = false;
    let disposed = false;
    let scene = null;
    let targetId = null;
    let binding = null;
    let transition = 0;
    let wrappers = null;
    const superseded = Symbol('superseded connection setup');
    const take = owner => {
        if (!owner) return [];
        owner.active = false;
        return owner.releases.splice(0);
    };
    const retain = (owner, acquire, isCurrent) => {
        const release = acquire();
        owner.releases.push(release);
        // A host getter or producer callback can dispose or replace the owner
        // while acquisition is returning. Its late release still belongs here.
        if (!owner.active || !isCurrent()) throw superseded;
    };
    const bind = () => {
        const captured = scene;
        const capturedTarget = targetId;
        const incarnation = {active: true, releases: []};
        binding = incarnation;
        const current = () => incarnation.active && enabled && !disposed && binding === incarnation &&
            scene === captured && targetId === capturedTarget && !captured?._disposed;
        const add = acquire => retain(incarnation, acquire, current);
        try {
            const records = (captured?.hubs || []).filter(source => capturedTarget === null || source.id === capturedTarget)
                .map(source => ({source, hub: source.hub, profile: source.profile}));
            const recordFor = profile => records.find(record => record.profile === profile);
            const hubOf = record => () => current() && record && captured.hubs.includes(record.source) &&
                record.source.hub === record.hub && record.source.profile === record.profile ? record.hub : null;
            const ev3 = ev3ClassicPeripheral(hubOf(recordFor('ev3')));
            const nxt = nxtClassicPeripheral(hubOf(recordFor('nxt')));
            const spikeRecord = recordFor('spike-prime');
            const spikeState = spikeRecord?.hub?.hubState;
            // A firmware lockstep scene does not expose a second native REPL.
            const spike = spikeStreamPeripheral(() => hubOf(spikeRecord)() && !captured?.lockstep &&
                spikeState?.data.simulationEnabled && spikeState.data.firmwareTarget !== 'official-v3' ? spikeState : null);
            const guarded = peripheral => ({...peripheral, open: link => {
                if (!current() || !peripheral.available()) return unavailable();
                return peripheral.open(link);
            }});
            const streamRoutes = [[8080, 'binary', ev3], [8765, 'base64', nxt], [8081, 'text', spike]];
            for (const [port, framing, peripheral] of streamRoutes) {
                add(() => registerVirtualBridge({port, framing, peripheral: guarded(peripheral),
                    claimUnavailable: true, matches: bridgePath,
                    onStatus: request => request?.command === 'status' ?
                        {status: current() && peripheral.available() ? 'connected' : 'unavailable', virtual: true, id: peripheral.id} : null}));
            }
            // The HTTP producers connect devices[0]. Offer only the selected LWP3
            // brick (the pane's first radio brick when no target was specified).
            // Existing WeDo producers use Bluetooth, not this HTTP protocol.
            const radioRecord = records.find(record => record.hub?.protocol === 'lwp3');
            const radio = radioRecord ? [new Lwp3Peripheral(radioRecord.hub)] : [];
            const ble = createVirtualBleBridge(() => current() ? radio.filter(peripheral =>
                records.some(record => record.hub === peripheral.hub && hubOf(record)())) : []);
            add(() => () => ble.dispose());
            add(() => registerVirtualHttp({port: 8080, matches: url => BLE_PATHS.has(url.pathname), handle: ble}));
            const ev3dev = createVirtualEv3dev(hubOf(recordFor('ev3')));
            add(() => registerVirtualHttp({port: 8080, matches: ev3devPath, handle: ev3dev}));
            const serial = [ev3, nxt].filter(peripheral => peripheral.available());
            add(() => installVirtualSerial({host: navigatorHost,
                peripherals: () => current() ? serial : [], granted: true}));
            return incarnation;
        } catch (error) {
            throw {setupFailure: true, error, owner: incarnation};
        }
    };
    const unbind = () => {
        const previous = binding;
        binding = null;
        if (!previous) return [];
        return take(previous);
    };
    const assertLive = () => {
        if (disposed) throw new DOMException('The Robot Lab connection controller is closed.', 'InvalidStateError');
    };
    const rollback = (failure, previousCleanup, request, ownWrappers = null) => {
        const error = failure?.setupFailure ? failure.error : failure;
        const failedBinding = failure?.setupFailure ? failure.owner : null;
        const releases = [...take(failedBinding), ...take(ownWrappers)];
        if (binding === failedBinding) binding = null;
        if (wrappers === ownWrappers) wrappers = null;
        if (transition === request) {
            enabled = false;
            releases.push(...take(wrappers), ...unbind());
            wrappers = null;
        }
        return Promise.allSettled([previousCleanup, releaseAll(releases)]).then(results => {
            const cleanupErrors = results.filter(r => r.status === 'rejected').map(r => r.reason);
            if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], 'Robot Lab connection setup and cleanup failed');
            if (error === superseded) return;
            throw error;
        });
    };
    return {
        get enabled () { return enabled; },
        setScene (next, {hubId = null} = {}) {
            assertLive();
            if (next?._disposed) { next = null; hubId = null; }
            if (hubId !== null && (typeof hubId !== 'string' || !next?.hubs.some(record => record.id === hubId))) {
                throw new TypeError('The selected virtual brick is not in this Robot Lab scene.');
            }
            if (scene === next && targetId === hubId) return Promise.resolve();
            const request = ++transition;
            const releases = unbind();
            scene = next;
            targetId = hubId;
            // Release old endpoints before registering the new ones, so a
            // matching URL cannot briefly find an obsolete registration.
            const cleanup = releaseAll(releases);
            if (enabled && transition === request) {
                try { bind(); } catch (error) { return rollback(error, cleanup, request); }
            }
            return cleanup;
        },
        setEnabled (next) {
            assertLive();
            if (typeof next !== 'boolean') throw new TypeError('virtual routing needs a boolean');
            if (enabled === next) return Promise.resolve();
            const request = ++transition;
            enabled = next;
            if (next) {
                const owner = {active: true, releases: []};
                wrappers = owner;
                const current = () => enabled && !disposed && wrappers === owner && transition === request;
                try {
                    retain(owner, () => installVirtualBridge({host}), current);
                    retain(owner, () => installVirtualFetch({host}), current);
                    bind();
                } catch (error) { return rollback(error, Promise.resolve(), request, owner); }
                return Promise.resolve();
            }
            const releases = [...take(wrappers), ...unbind()];
            wrappers = null;
            return releaseAll(releases);
        },
        dispose () {
            if (disposed) return Promise.resolve();
            disposed = true;
            ++transition;
            enabled = false;
            scene = null;
            targetId = null;
            const releases = [...take(wrappers), ...unbind()];
            wrappers = null;
            return releaseAll(releases);
        }
    };
};
