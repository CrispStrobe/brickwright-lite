// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A virtual HTTP BLE bridge: the local helper that legopoweredup's and legoboostunified's "bridge"
// connection type talks to (their BridgeAdapter), served by the Robot Lab's radio hubs instead of a
// helper program with a Bluetooth adapter. Served over virtual-http.js.
//
// The requests are the adapter's, field for field (default base URL http://localhost:8080):
//   POST /scan                                -> [{id, name}]       (the adapter takes devices[0].id)
//   POST /connect   {deviceId}                -> {}                 (2xx is all it checks)
//   POST /write     {deviceId, characteristic, data: [bytes]}       (one GATT write; LWP3 0x1624)
//   GET  /notifications?deviceId=<id>         -> [{data: [bytes]}]  (polled every 100 ms; drained)
//   POST /disconnect {deviceId}
// A real bridge subscribes to the hub's notifications when it connects (the hub then reports its
// attached I/O, LWP3 §3.8); this one does the same, through the peripheral's own onStartNotifications.
//
// The peripherals are the GATT records lab-ble-peripherals.js makes (Lwp3Peripheral, Wedo2Peripheral):
// every write goes to the hub's own protocol, every notification comes from it.

/**
 * @param {() => object[]} getPeripherals the GATT peripherals the bridge can see now
 * @param {{notifyUuid?: (peripheral) => string|null}} [options] the characteristic subscribed on
 *   connect (default: the peripheral's first characteristic)
 * @returns {(request) => object} a virtual-http.js handler
 */
export const createVirtualBleBridge = (getPeripherals, {notifyUuid = null} = {}) => {
    const connected = new Map();
    let disposed = false;
    const fail = (status, error) => ({status, json: {error}});
    const find = id => (getPeripherals() || []).find(p => p && p.id === id) || null;
    const body = request => {
        try { return request.json() || {}; } catch { return null; }
    };
    const close = c => {
        if (!c.active) return;
        c.active = false;
        if (connected.get(c.peripheral.id) === c) connected.delete(c.peripheral.id);
        c.queue.length = 0;
        try { c.peripheral.setNotificationSink(null); }
        finally { c.peripheral.disconnect(); }
    };
    const current = id => {
        const c = connected.get(id);
        if (c && find(id) !== c.peripheral) { close(c); return null; }
        return c || null;
    };
    const handle = request => {
        if (disposed) return fail(503, 'the virtual BLE bridge is closed');
        const {method, path} = request;
        if (method === 'POST' && path === '/scan') {
            return {json: (getPeripherals() || []).filter(Boolean).map(p => ({id: p.id, name: p.name}))};
        }
        if (method === 'POST' && path === '/connect') {
            const b = body(request);
            const p = b && find(b.deviceId);
            if (!p) return fail(404, `no device ${b && b.deviceId}`);
            const previous = current(p.id);
            if (previous) return {json: {}};
            if (p.connected) return fail(409, 'the virtual peripheral is already connected');
            const queue = [];
            const connection = {peripheral: p, queue, active: true};
            connected.set(p.id, connection);
            const assertCurrent = () => {
                if (disposed || !connection.active || connected.get(p.id) !== connection || find(p.id) !== p) {
                    throw new Error('the virtual BLE connection was closed');
                }
            };
            try {
                p.connect();
                assertCurrent();
                p.setNotificationSink((uuid, bytes) => {
                    if (!disposed && connection.active && connected.get(p.id) === connection) {
                        queue.push({characteristic: uuid, data: Array.from(bytes)});
                    }
                });
                assertCurrent();
                const uuid = notifyUuid ? notifyUuid(p) : p.services[0].characteristics[0].uuid;
                if (uuid && typeof p.onStartNotifications === 'function') p.onStartNotifications(uuid);
                assertCurrent();
            } catch (error) {
                try { close(connection); }
                catch (cleanupError) { throw new AggregateError([error, cleanupError], 'virtual BLE connect and cleanup failed'); }
                throw error;
            }
            return {json: {}};
        }
        if (method === 'POST' && path === '/write') {
            const b = body(request);
            const c = b && current(b.deviceId);
            if (!c) return fail(404, 'not connected');
            if (!Array.isArray(b.data) || b.data.some(v => !Number.isInteger(v) || v < 0 || v > 255)) return fail(400, 'data must be bytes');
            try {
                c.peripheral.onWrite(String(b.characteristic).toLowerCase(), Uint8Array.from(b.data));
            } catch (e) {
                return fail(400, String(e && e.message));
            }
            return {json: {}};
        }
        if (method === 'GET' && path === '/notifications') {
            const c = current(request.query.get('deviceId'));
            if (!c) return fail(404, 'not connected');
            return {json: c.queue.splice(0, c.queue.length)};
        }
        if (method === 'POST' && path === '/disconnect') {
            const b = body(request);
            const c = b && connected.get(b.deviceId);
            if (c) close(c);
            return {json: {}};
        }
        return fail(404, `${method} ${path}`);
    };
    handle.dispose = () => {
        if (disposed) return;
        disposed = true;
        const errors = [];
        for (const c of [...connected.values()]) {
            try { close(c); } catch (error) { errors.push(error); }
        }
        if (errors.length) throw new AggregateError(errors, 'virtual BLE bridge cleanup failed');
    };
    return handle;
};
