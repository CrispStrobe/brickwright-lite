/**
 * The Scratch Link route, kept working when a localhost socket is not.
 *
 * WHY THIS EXISTS
 * ---------------
 * The LEGO extensions offer three connection paths on purpose — Web Bluetooth
 * direct, Scratch Link, and a user-run bridge — so that one transport failing
 * does not take the hardware with it. That only pays off if each path can
 * stand on its own, and the Scratch Link path stood entirely on
 * `ws://127.0.0.1:20111`.
 *
 * A webview cannot always open that. CodePM and Scrub drive real LEGO hardware
 * from iOS today and cannot use a localhost socket AT ALL: they load
 * `https://scratch.mit.edu`, and WebKit blocks `ws://` from an HTTPS origin as
 * mixed content. Both solve it the same way — replace the page's `WebSocket`
 * constructor and carry the identical JSON-RPC over a native channel. This is
 * that idea, over Tauri IPC, against the same `ble::dispatch` the socket route
 * uses (see src-tauri/src/scratchlink/bridge.rs).
 *
 * IT IS A FALLBACK, NOT A HIJACK
 * ------------------------------
 * The real socket is tried first and used whenever it opens, so the route that
 * works today is untouched. The bridge takes over only when the socket fails
 * before opening — the case that is currently unrecoverable and silent. An
 * option that quietly replaces a working transport is not an extra option; it
 * is a substitution, which is the opposite of why three paths exist.
 */

/**
 * Which transport the Scratch Link route should use. A FOURTH path beside the
 * extension's own three (direct / scratch link / user bridge), because the
 * whole point of having several is that any one of them may be the only one
 * that works under some condition nobody has met yet.
 *
 *   'auto'   (default) socket first, native bridge if it never opens
 *   'socket' socket only — the behaviour before this module existed
 *   'native' native bridge only, chosen deliberately
 *
 * Nothing is ever removed by picking one: 'socket' restores exactly the old
 * path, and the extension's own three menu entries are untouched throughout.
 * @returns {string} one of the three values above.
 */
export const transportPreference = () => {
    try {
        const v = localStorage.getItem('bw-scratchlink-transport');
        // `bridge` was the internal name before the Settings chooser shipped.
        // Keep reading it so a development build cannot strand a stored choice.
        if (v === 'bridge') return 'native';
        if (v === 'socket' || v === 'native' || v === 'auto') return v;
    } catch (e) { /* private mode — fall through to the default */ }
    return 'auto';
};

/** Scratch Link lives on these ports — ours on 20111, the legacy host on 20110. */
const isScratchLinkUrl = url => /:(20110|20111)\//.test(String(url));

/**
 * Which backend a Scratch Link URL is asking for. `/scratch/bt` is Bluetooth
 * Classic (EV3, NXT, legacy SPIKE over RFCOMM); everything else is BLE. Read
 * from the path exactly as the socket route reads it, so the two ways in
 * cannot disagree about what a URL means.
 * @param {string} url the URL being dialled.
 * @returns {string} 'bt' or 'ble'.
 */
const transportOf = url => (/\/bt\b|\/scratch\/bt/.test(String(url)) ? 'bt' : 'ble');

const isNativeApp = () => typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';

const tauri = () => {
    const t = window.__TAURI__;
    const invoke = t && (t.invoke || (t.core && t.core.invoke));
    const listen = t && ((t.event && t.event.listen) || t.listen);
    return invoke && listen ? {invoke, listen} : null;
};

/**
 * A WebSocket-shaped object backed by the native bridge. Only the surface
 * scratch-vm and the extensions actually use is implemented — constructing a
 * full spec-compliant WebSocket here would be inventing behaviour nobody calls.
 */
class BridgedSocket {
    /**
     * @param {string} [kind] 'ble' or 'bt' — which backend to talk to. The
     *   socket route picks this from the URL path, and the two are different
     *   backends entirely (BLE is CoreBluetooth/btleplug, BT is RFCOMM/MFi).
     *   Defaulting everything to 'ble' would work for the BLE hubs and
     *   silently break EV3 and NXT, which on iOS have no other route.
     */
    constructor (kind = 'ble') {
        this._kind = kind;
        this.readyState = 0;                 // CONNECTING
        this.onopen = null;
        this.onclose = null;
        this.onerror = null;
        this.onmessage = null;
        this._listeners = {};
        this._unlisten = null;
    }

    addEventListener (type, fn) {
        (this._listeners[type] = this._listeners[type] || []).push(fn);
    }

    removeEventListener (type, fn) {
        this._listeners[type] = (this._listeners[type] || []).filter(f => f !== fn);
    }

    _emit (type, event) {
        const handler = this[`on${type}`];
        if (typeof handler === 'function') handler.call(this, event);
        (this._listeners[type] || []).forEach(fn => fn.call(this, event));
    }

    async _start () {
        const t = tauri();
        if (!t) {
            this.readyState = 3;
            this._emit('error', new Event('error'));
            this._emit('close', {code: 1006, wasClean: false});
            return;
        }
        try {
            this._unlisten = await t.listen('scratchlink://message', event => {
                this._emit('message', {data: event.payload});
            });
            // A listen that did not hand back an unsubscribe function did not
            // register. Without it the channel is one-way: `invoke` still
            // succeeds, the socket reports itself OPEN, and then every single
            // request hangs until its 20s timeout because no reply can ever
            // arrive. Failing here turns a silent black hole into a normal
            // "this transport is unavailable".
            if (typeof this._unlisten !== 'function') {
                throw new Error('the native event channel did not register');
            }
            await t.invoke('scratchlink_bridge_open', {kind: this._kind});
            this.readyState = 1;             // OPEN
            this._emit('open', new Event('open'));
        } catch (e) {
            this.readyState = 3;
            this._emit('error', new Event('error'));
            this._emit('close', {code: 1006, wasClean: false, reason: String(e)});
        }
    }

    send (data) {
        if (this.readyState !== 1) return;
        const t = tauri();
        if (t) t.invoke('scratchlink_bridge_send', {frame: String(data)}).catch(() => {});
    }

    close () {
        if (this.readyState === 3) return;
        this.readyState = 3;
        const t = tauri();
        if (t) t.invoke('scratchlink_bridge_close').catch(() => {});
        if (this._unlisten) {
            try { this._unlisten(); } catch (e) { /* already gone */ }
            this._unlisten = null;
        }
        this._emit('close', {code: 1000, wasClean: true});
    }
}

/**
 * Try the real socket; fall back to the bridge only if it never opens.
 * @param {*} NativeWebSocket the original constructor.
 * @param {string} url the scratch-link URL being dialled.
 * @returns {object} a WebSocket-shaped object.
 */
const socketWithBridgeFallback = (NativeWebSocket, url) => {
    const facade = new BridgedSocket(transportOf(url));
    let real = null;
    let settled = false;

    const useBridge = why => {
        if (settled) return;
        settled = true;
        if (typeof console !== 'undefined') {
            console.info(`[scratchlink] ${url} did not open (${why}); using the native bridge`);
        }
        facade._start();
    };

    try {
        real = new NativeWebSocket(url);
    } catch (e) {
        useBridge(`constructor threw: ${e.message}`);
        return facade;
    }

    real.onopen = event => {
        if (settled) return;
        settled = true;
        // The socket works here: hand the facade over to it wholesale so this
        // module adds nothing but a failed-open safety net.
        facade.readyState = 1;
        facade.send = data => real.send(data);
        facade.close = () => real.close();
        real.onmessage = m => facade._emit('message', m);
        real.onclose = c => {
            facade.readyState = 3;
            facade._emit('close', c);
        };
        real.onerror = () => facade._emit('error', new Event('error'));
        facade._emit('open', event);
    };
    real.onerror = () => useBridge('socket error');
    real.onclose = event => useBridge(`closed with code ${event.code}`);

    return facade;
};

/**
 * Install the fallback. No-op outside the app, and no-op for every URL that is
 * not a Scratch Link endpoint — a project's own WebSockets are untouched.
 * @returns {string} what it did, for the diagnostics log.
 */
export default function installScratchLinkBridge () {
    if (typeof window === 'undefined') return 'no window';
    if (!isNativeApp()) return 'not the native app — the socket route is the only one';
    const NativeWebSocket = window.WebSocket;
    if (typeof NativeWebSocket !== 'function') return 'no WebSocket to wrap';
    if (NativeWebSocket.__bwScratchLinkBridge) return 'already installed';

    const Wrapped = function WebSocket (url, protocols) {
        if (!isScratchLinkUrl(url)) {
            return protocols === undefined
                ? new NativeWebSocket(url)
                : new NativeWebSocket(url, protocols);
        }
        const pref = transportPreference();
        if (pref === 'socket') {
            // Explicitly the old path, bridge never consulted.
            return protocols === undefined
                ? new NativeWebSocket(url)
                : new NativeWebSocket(url, protocols);
        }
        if (pref === 'native' || pref === 'original') {
            // Explicitly a native path, socket never attempted — useful both
            // for testing it and for a platform where the socket is known bad.
            //
            // 'original' differs only in WHICH program answers: the vendored
            // reference Scratch Link, in-process, instead of our Rust
            // dispatcher. Same JSON-RPC, same seam, same everything above this
            // line — which is what makes it a useful second opinion rather
            // than a second codebase.
            const facade = new BridgedSocket(transportOf(url), pref);
            facade._start();
            return facade;
        }
        return socketWithBridgeFallback(NativeWebSocket, url);
    };
    Wrapped.prototype = NativeWebSocket.prototype;
    ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => {
        Wrapped[k] = NativeWebSocket[k];
    });
    Wrapped.__bwScratchLinkBridge = true;
    try {
        window.WebSocket = Wrapped;
    } catch (e) {
        return `could not install: ${e.message}`;
    }
    return 'installed';
}

export {isScratchLinkUrl, transportOf, BridgedSocket};
