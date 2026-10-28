/**
 * The native BLE transport, as seen from the web side.
 *
 * The Brickwright app runs a Scratch-Link-compatible WebSocket server in-process
 * (`apps/tauri/src-tauri/src/scratchlink/`), which is how the stock Scratch
 * hardware extensions already reach real hubs inside the app: scratch-vm's
 * `io/ble.js` dials `ws://127.0.0.1:20111/scratch/ble` without knowing it is
 * talking to us. This module is the same protocol for OUR code — the Web
 * Bluetooth shim and the diagnostics panel — plus two methods only our server
 * has (`getStatus`, `getServices`; see the Rust module header).
 *
 * One session for the whole app, because there is one radio and the native side
 * tracks exactly one connected peripheral. A second concurrent session would
 * fight the first over the same hub.
 */

import {bleLog} from './ble-diagnostics.js';

/**
 * Assembled rather than written out, so the fetch-pinning census and a casual
 * grep both see a local loopback endpoint for what it is, and so the port lives
 * next to the Rust constant it must match (`SCRATCH_LINK_ADDR`).
 */
const HOST = '127.0.0.1';
const PORT = 20111;
export const bleEndpoint = () => `ws://${HOST}:${PORT}/scratch/ble`;

/**
 * Nothing here can work outside the native app; a browser has no local server.
 * @returns {boolean} true inside the Tauri shell.
 */
export const isNativeApp = () =>
    typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';

const OPEN_TIMEOUT_MS = 8000;
const REQUEST_TIMEOUT_MS = 20000;

class BleSession {
    constructor () {
        this._ws = null;
        this._opening = null;
        this._nextId = 1;
        this._pending = new Map();
        this._handlers = new Map();
    }

    /**
     * Open the socket, or reuse the one already open.
     * @returns {Promise} resolves with this session; concurrent callers share one attempt.
     */
    open () {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) return Promise.resolve(this);
        if (this._opening) return this._opening;
        this._opening = new Promise((resolve, reject) => {
            const url = bleEndpoint();
            bleLog('info', 'ble', 'opening', url);
            let ws;
            try {
                ws = new WebSocket(url);
            } catch (e) {
                this._opening = null;
                bleLog('error', 'ble', 'WebSocket constructor threw', e);
                return reject(new Error(`cannot reach the built-in Bluetooth service: ${e.message}`));
            }
            const timer = setTimeout(() => {
                bleLog('error', 'ble', 'connect timed out', url);
                try {
                    ws.close();
                } catch (e) { /* already dead */ }
                this._opening = null;
                reject(new Error(
                    'the built-in Bluetooth service did not answer. ' +
                    'It runs inside the Brickwright app — this will not work in a web browser.'
                ));
            }, OPEN_TIMEOUT_MS);

            ws.onopen = () => {
                clearTimeout(timer);
                this._ws = ws;
                this._opening = null;
                bleLog('info', 'ble', 'connected to the built-in Bluetooth service');
                resolve(this);
            };
            ws.onerror = () => {
                // `onerror` carries no detail by design; `onclose` follows and
                // the timeout above covers the case where it does not.
                bleLog('error', 'ble', 'socket error', url);
            };
            ws.onclose = event => {
                clearTimeout(timer);
                const wasOpen = this._ws === ws;
                this._ws = null;
                this._opening = null;
                bleLog(wasOpen ? 'warn' : 'error', 'ble',
                    'socket closed', `code=${event.code} reason=${event.reason || '(none)'}`);
                // Fail every request still in flight, or their callers hang.
                this._pending.forEach(p => p.reject(new Error('Bluetooth connection closed')));
                this._pending.clear();
                this._emit('sessionDidClose', {code: event.code});
                if (!wasOpen) {
                    reject(new Error('the built-in Bluetooth service refused the connection'));
                }
            };
            ws.onmessage = event => this._onMessage(event.data);
        });
        return this._opening;
    }

    _onMessage (data) {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (e) {
            bleLog('error', 'ble', 'unparseable frame', String(data).slice(0, 200));
            return;
        }
        if (typeof msg.id !== 'undefined' && this._pending.has(msg.id)) {
            const {resolve, reject, method} = this._pending.get(msg.id);
            this._pending.delete(msg.id);
            if (msg.error) {
                // JSON-RPC puts the CATEGORY in `message` ("Method Not Found")
                // and the detail in `data`. Reporting `message` alone would
                // show the user a category where a sentence belongs, so prefer
                // the detail — and carry the code, so callers can branch on it
                // instead of reading our prose.
                const detail = msg.error.data || msg.error.message || 'Bluetooth request failed';
                bleLog('error', 'ble', `◀ ${method} failed`, detail);
                const err = new Error(detail);
                err.code = msg.error.code;
                reject(err);
            } else {
                bleLog('debug', 'ble', `◀ ${method}`, msg.result);
                resolve(msg.result);
            }
            return;
        }
        if (msg.method) {
            // characteristicDidChange is per-notification and would drown the
            // log; everything else is rare and worth a line.
            if (msg.method !== 'characteristicDidChange') {
                bleLog('info', 'ble', `◀ ${msg.method}`, msg.params);
            }
            this._emit(msg.method, msg.params);
        }
    }

    _emit (method, params) {
        const set = this._handlers.get(method);
        if (!set) return;
        set.forEach(fn => {
            try {
                fn(params);
            } catch (e) {
                bleLog('error', 'ble', `handler for ${method} threw`, e);
            }
        });
    }

    /**
     * Subscribe to a native notification.
     * @param {string} method the JSON-RPC notification name.
     * @param {Function} fn called with the notification's params.
     * @returns {Function} call it to unsubscribe.
     */
    on (method, fn) {
        if (!this._handlers.has(method)) this._handlers.set(method, new Set());
        this._handlers.get(method).add(fn);
        return () => this._handlers.get(method).delete(fn);
    }

    async request (method, params) {
        await this.open();
        const id = this._nextId++;
        bleLog('debug', 'ble', `▶ ${method}`, params);
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._pending.delete(id);
                reject(new Error(`Bluetooth request "${method}" timed out`));
            }, REQUEST_TIMEOUT_MS);
            this._pending.set(id, {
                method,
                resolve: v => {
                    clearTimeout(timer);
                    resolve(v);
                },
                reject: e => {
                    clearTimeout(timer);
                    reject(e);
                }
            });
            try {
                this._ws.send(JSON.stringify({jsonrpc: '2.0', id, method, params}));
            } catch (e) {
                clearTimeout(timer);
                this._pending.delete(id);
                reject(e);
            }
        });
    }

    close () {
        if (this._ws) {
            bleLog('info', 'ble', 'closing session');
            this._ws.close();
        }
    }

    get isOpen () {
        return !!this._ws && this._ws.readyState === WebSocket.OPEN;
    }
}

let session = null;

/**
 * The one shared session — there is one radio, and the native side tracks one
 * connected peripheral, so a second session would only fight the first.
 * @returns {BleSession} reopened transparently if the socket dropped.
 */
export const getSession = () => {
    if (!session) session = new BleSession();
    return session;
};

/**
 * Adapter permission + power, from CoreBluetooth on Apple platforms. Returns
 * `null` when the peer is a real Scratch Link rather than our server (it answers
 * `getStatus` with method-not-found), which is a missing feature and not a
 * failure.
 */
export const getNativeStatus = async () => {
    try {
        return await getSession().request('getStatus', {});
    } catch (e) {
        // getStatus is OURS, not part of Scratch Link's protocol, so a real
        // Scratch Link answers "method not found" and that is not an error —
        // it means "this peer is the stock implementation". -32601 is the
        // spec's code for it; the string check stays for any peer that only
        // says it in prose.
        if (e.code === -32601 || /unknown method|method not found/i.test(e.message)) return null;
        throw e;
    }
};

/**
 * Everything the diagnostics panel needs, in one call, with each step's failure
 * reported rather than collapsed into "it didn't work".
 */
/** LEGO Boost's GATT service — the filter the extension actually scans with. */
const BOOST_SERVICE = '00001623-1212-efde-1623-785feabcd123';

/**
 * Walk the SCRATCH LINK route the way the extension does, on its OWN socket.
 *
 * This is the half the rest of the self-test cannot see. Everything above runs
 * on the shim's shared session; the extension opens an INDEPENDENT WebSocket to
 * the same service and speaks JSON-RPC to it directly. If a second concurrent
 * client is refused, or its `discover` is never answered, that is invisible to
 * a test that reuses the one socket already open — and it is exactly the shape
 * of "set connection to Scratch Link, press connect, nothing happens".
 *
 * Deliberately stops before `connect`: this must be safe to run with no hub
 * present and must not seize a hub the user already has connected.
 * @returns {Promise<object>} one key per step, each saying what happened.
 */
export const scratchLinkRouteReport = () => new Promise(resolve => {
    const out = {};
    const url = bleEndpoint();
    let ws;
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        try { ws && ws.close(); } catch (e) { /* already gone */ }
        resolve(out);
    };
    // Whole-probe cap. A step that never answers is the finding, so the timer
    // must report rather than hang: an unresolved promise here would freeze the
    // diagnostics panel, which is the one thing that must keep working.
    // SHORT on purpose. This runs inside the self-test, which a person is
    // watching a button for — and the CI gate waits on that report too, which
    // is how a 15s cap here was caught: the whole self-test stopped rendering
    // within the time anyone waits for it.
    //
    // The diagnosis needs "did the socket open and was discover answered",
    // which a local service answers in milliseconds. Finding a hub is a bonus,
    // and the chooser is where someone actually looks for one.
    const overall = setTimeout(() => {
        out['second socket'] = out['second socket'] || 'TIMED OUT before it opened';
        finish();
    }, 5000);

    try {
        ws = new WebSocket(url);
    } catch (e) {
        out['second socket'] = `constructor threw — ${e.message}`;
        clearTimeout(overall);
        return finish();
    }

    ws.onerror = () => { out['second socket'] = out['second socket'] || 'ERROR before open'; };
    ws.onclose = event => {
        if (!out['second socket']) out['second socket'] = `closed before open (code ${event.code})`;
        clearTimeout(overall);
        finish();
    };
    ws.onopen = () => {
        out['second socket'] = 'open — a concurrent client is accepted';
        ws.send(JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'discover',
            params: {filters: [{services: [BOOST_SERVICE]}]}
        }));
        out['discover request'] = 'sent';
        // The extension waits for didDiscoverPeripheral notifications, not for
        // discover's reply — which is null by design. Both are reported, because
        // "which of the two never arrived" is the whole diagnosis.
        setTimeout(() => {
            out['discover reply'] = out['discover reply'] || 'NO REPLY within 3s';
            out['devices seen'] = out['devices seen'] ||
                'none yet (3s is long enough to prove the route works, not to find a hub)';
            clearTimeout(overall);
            finish();
        }, 3000);
    };
    ws.onmessage = event => {
        let msg;
        try { msg = JSON.parse(event.data); } catch (e) { return; }
        if (msg.id === 1) {
            out['discover reply'] = msg.error
                ? `ERROR — ${msg.error.message || JSON.stringify(msg.error)}`
                : 'accepted (result is null by design)';
        } else if (msg.method === 'didDiscoverPeripheral') {
            const n = (msg.params && msg.params.name) || 'unnamed';
            out['devices seen'] = out['devices seen'] === undefined || String(out['devices seen']).startsWith('none')
                ? n : `${out['devices seen']}, ${n}`;
        } else if (msg.method === 'discoverDidFinish') {
            out['scan finished'] = `${(msg.params && msg.params.count) || 0} device(s)`;
        }
    };
});

export const selfTestReport = async () => {
    const report = {};
    report['native app'] = isNativeApp() ? 'yes' : 'no — Bluetooth needs the installed app';
    report.endpoint = bleEndpoint();
    const s = getSession();
    try {
        await s.open();
        report['local Bluetooth service'] = 'reachable';
    } catch (e) {
        report['local Bluetooth service'] = `UNREACHABLE — ${e.message}`;
        return report;
    }
    try {
        const pong = await s.request('ping', {});
        report.ping = pong === 42 ? 'ok' : `unexpected reply: ${JSON.stringify(pong)}`;
    } catch (e) {
        report.ping = `FAILED — ${e.message}`;
    }
    try {
        const status = await getNativeStatus();
        if (status) {
            report.platform = status.platform;
            report['bluetooth permission'] = status.authorization;
            report['adapter power'] = status.powerState;
            report['radio usable'] = status.usable ? 'yes' : 'NO';
            report['native handler'] = status.handler ? 'initialised' : 'FAILED TO INITIALISE';
            report.connected = status.connected ? 'a hub is connected' : 'no hub connected';
            if (status.advice) report['what to do'] = status.advice;
        } else {
            report.adapter = 'not reported (talking to a stock Scratch Link)';
        }
    } catch (e) {
        report.adapter = `FAILED — ${e.message}`;
    }
    // The extension's own route, on its own socket. Last, because it takes up
    // to 8 seconds and everything above should already be on screen if it hangs.
    try {
        const route = await scratchLinkRouteReport();
        for (const k of Object.keys(route)) report[`Scratch Link · ${k}`] = route[k];
    } catch (e) {
        report['Scratch Link route'] = `FAILED — ${e.message}`;
    }
    return report;
};
