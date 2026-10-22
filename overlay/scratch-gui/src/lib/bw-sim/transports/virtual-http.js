// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
//
// A virtual HTTP endpoint: a `fetch` double that answers the requests an extension sends to a brick
// or a bridge on the network (ev3dev's on-brick server, the Powered Up / BOOST HTTP bridge), from a
// handler in the page, so the Robot Lab's virtual brick is what answers. Every other URL goes to the
// fetch that was there before.
//
// The CrispStrobe extensions call `Scratch.fetch`, which lite's adapter forwards to the global fetch
// (overlay/scratch-vm/src/extensions/crispstrobe/adapter.js), so the double is installed on the host's
// `fetch`. It honours an AbortSignal (ev3dev's fetchWithTimeout aborts after its timeout).

const endpoints = [];

const loopback = host => ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host);

/**
 * @param {{host?: string, port: number, protocols?: string[],
 *          handle: (request: {method: string, url: URL, path: string, query: URLSearchParams,
 *                             headers: object, body: string|null, json: () => any}) => any}} endpoint
 *   host defaults to loopback; handle returns {status?, json?, body?} (or a Promise of one)
 * @returns {() => void} the removal
 */
export const registerVirtualHttp = endpoint => {
    if (!endpoint || !Number.isInteger(endpoint.port) || typeof endpoint.handle !== 'function') {
        throw new TypeError('a virtual HTTP endpoint needs a port and handle()');
    }
    endpoints.push(endpoint);
    return () => {
        const i = endpoints.indexOf(endpoint);
        if (i >= 0) endpoints.splice(i, 1);
    };
};

export const clearVirtualHttpForTest = () => { endpoints.length = 0; };

export const httpEndpointFor = value => {
    let url;
    try { url = new URL(String(value)); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return endpoints.find(e => e.port === port && (e.host ? e.host === url.hostname : loopback(url.hostname)) &&
        (!e.protocols || e.protocols.includes(url.protocol.slice(0, -1)))) || null;
};

const headersOf = headers => {
    if (!headers) return {};
    if (typeof headers.forEach === 'function' && !Array.isArray(headers)) {
        const out = {};
        headers.forEach((v, k) => { out[k.toLowerCase()] = v; });
        return out;
    }
    return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), String(v)]));
};

const bodyText = body => {
    if (body === undefined || body === null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof Uint8Array || body instanceof ArrayBuffer) return new TextDecoder().decode(body);
    return String(body);
};

const abortError = () => {
    const e = new Error('The operation was aborted.');
    e.name = 'AbortError';
    return e;
};

/** Wraps host.fetch. Returns a restore. */
export const installVirtualFetch = ({host = typeof window === 'undefined' ? globalThis : window} = {}) => {
    const before = host.fetch;
    if (before && before.__brickwrightVirtualHttp) return () => {};
    const wrapped = async function fetch (input, init = {}) {
        const href = typeof input === 'string' || input instanceof URL ? String(input) : input && input.url;
        const endpoint = httpEndpointFor(href);
        if (!endpoint) {
            if (typeof before !== 'function') throw new TypeError('fetch failed');
            return before.call(host, input, init);
        }
        const signal = init && init.signal;
        if (signal && signal.aborted) throw abortError();
        const url = new URL(href);
        const body = bodyText(init && init.body);
        const request = {
            method: String((init && init.method) || 'GET').toUpperCase(),
            url, path: url.pathname, query: url.searchParams, headers: headersOf(init && init.headers), body,
            json: () => (body ? JSON.parse(body) : null)
        };
        const answer = Promise.resolve().then(() => endpoint.handle(request));
        const reply = await (signal ? new Promise((resolve, reject) => {
            const onAbort = () => reject(abortError());
            signal.addEventListener('abort', onAbort, {once: true});
            answer.then(v => { signal.removeEventListener('abort', onAbort); resolve(v); },
                e => { signal.removeEventListener('abort', onAbort); reject(e); });
        }) : answer);
        const status = (reply && reply.status) || 200;
        if (reply && reply.json !== undefined) {
            return new Response(JSON.stringify(reply.json), {status, headers: {'content-type': 'application/json'}});
        }
        return new Response(reply && reply.body !== undefined ? reply.body : null, {status});
    };
    wrapped.__brickwrightVirtualHttp = true;
    host.fetch = wrapped;
    return () => { if (host.fetch === wrapped) host.fetch = before; };
};
