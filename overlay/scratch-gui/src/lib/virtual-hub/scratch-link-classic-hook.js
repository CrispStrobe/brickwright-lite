// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// The boot half of the Scratch Link Bluetooth-Classic plumbing: the URL test, base64, the
// socket claims and the ONE window.WebSocket wrapper that serves them. It is all the first
// load carries. SPIKE 2.x's REPL simulation (spike-classic-scratch-link.js) claims through it
// at boot; the virtual peripheral registry (bt-classic-registry.js, its JSON-RPC socket double)
// lives in the Robot Lab chunk and adds its claim, LAST, when that chunk loads. Until then — and
// whenever no claim takes a URL — a Scratch Link BT URL reaches the real WebSocket.

export const CLASSIC_MESSAGE_MAX_BYTES = 64 * 1024;

/** Whether a URL is Scratch Link's BT endpoint on this machine (loopback only, as Scratch Link listens). */
export const isClassicScratchLink = value => {
    let url;
    try { url = new URL(String(value)); } catch (_) { return false; }
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    return loopback && ['ws:', 'wss:'].includes(url.protocol) && ['20110', '20111'].includes(url.port) &&
        (/^\/bt(?:\/|$)/.test(url.pathname) || /^\/scratch\/bt(?:\/|$)/.test(url.pathname));
};

export const encodeBase64 = bytes => {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
};

export const decodeBase64 = text => {
    if (typeof text !== 'string' || text.length > Math.ceil(CLASSIC_MESSAGE_MAX_BYTES / 3) * 4) {
        throw new RangeError('virtual Classic message is too large');
    }
    const binary = atob(text);
    if (binary.length > CLASSIC_MESSAGE_MAX_BYTES) throw new RangeError('virtual Classic message is too large');
    return Uint8Array.from(binary, character => character.charCodeAt(0));
};

/**
 * Socket claims, in priority order: (url) => a socket, or null to pass. SPIKE's 2.x REPL
 * simulation claims first while it is enabled, as it always did; a `fallback` claim (the
 * registry's) is asked only after every ordinary one, whenever it was added.
 */
const claims = [];
const fallbacks = [];

/** Adds a claim (`{fallback: true}`: after every ordinary claim); returns its removal. */
export const addClassicSocketClaim = (claim, {fallback = false} = {}) => {
    const list = fallback ? fallbacks : claims;
    list.push(claim);
    return () => {
        const i = list.indexOf(claim);
        if (i >= 0) list.splice(i, 1);
    };
};

/**
 * Wraps window.WebSocket once: a Scratch Link BT URL goes to the first claim that takes it (SPIKE's
 * REPL simulation, then the registry once the Robot Lab loaded it), anything else — and a BT URL
 * nobody claims — to the real WebSocket. `host` and `NativeWebSocket` are for tests.
 */
export const installVirtualClassicScratchLink = ({host = typeof window === 'undefined' ? null : window,
    NativeWebSocket = host ? host.WebSocket : null} = {}) => {
    if (!host || typeof NativeWebSocket !== 'function') return 'unavailable';
    if (host.WebSocket && host.WebSocket.__brickwrightVirtualClassic) return 'already installed';
    const Wrapped = function WebSocket (url, protocols) {
        if (isClassicScratchLink(url)) {
            for (const claim of [...claims, ...fallbacks]) {
                const socket = claim(url);
                if (socket) return socket;
            }
        }
        return protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    };
    Wrapped.prototype = NativeWebSocket.prototype;
    for (const key of ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']) Wrapped[key] = NativeWebSocket[key];
    Wrapped.__brickwrightVirtualClassic = true;
    // The name SPIKE's installer used to check; kept so an older caller still sees "installed".
    Wrapped.__brickwrightVirtualSpikeClassic = true;
    host.WebSocket = Wrapped;
    return 'installed';
};
