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
    const fail = (status, error) => ({status, json: {error}});
    const find = id => (getPeripherals() || []).find(p => p && p.id === id) || null;
    const body = request => {
        try { return request.json() || {}; } catch { return null; }
    };
    return request => {
        const {method, path} = request;
        if (method === 'POST' && path === '/scan') {
            return {json: (getPeripherals() || []).filter(Boolean).map(p => ({id: p.id, name: p.name}))};
        }
        if (method === 'POST' && path === '/connect') {
            const b = body(request);
            const p = b && find(b.deviceId);
            if (!p) return fail(404, `no device ${b && b.deviceId}`);
            const queue = [];
            connected.set(p.id, {peripheral: p, queue});
            p.connect();
            p.setNotificationSink((uuid, bytes) => queue.push({characteristic: uuid, data: Array.from(bytes)}));
            const uuid = notifyUuid ? notifyUuid(p) : p.services[0].characteristics[0].uuid;
            if (uuid && typeof p.onStartNotifications === 'function') p.onStartNotifications(uuid);
            return {json: {}};
        }
        if (method === 'POST' && path === '/write') {
            const b = body(request);
            const c = b && connected.get(b.deviceId);
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
            const c = connected.get(request.query.get('deviceId'));
            if (!c) return fail(404, 'not connected');
            return {json: c.queue.splice(0, c.queue.length)};
        }
        if (method === 'POST' && path === '/disconnect') {
            const b = body(request);
            const c = b && connected.get(b.deviceId);
            if (c) {
                connected.delete(b.deviceId);
                c.peripheral.disconnect();
            }
            return {json: {}};
        }
        return fail(404, `${method} ${path}`);
    };
};
