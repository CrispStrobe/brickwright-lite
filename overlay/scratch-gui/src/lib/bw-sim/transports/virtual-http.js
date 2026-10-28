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

import {createHostPropertyLeases} from './host-property-lease.js';

const endpoints = [];
const acquireFetch = createHostPropertyLeases();
const abortError = () => new DOMException('The virtual connection was closed.', 'AbortError');

const removeEndpoint = entry => {
    if (!entry.active) return;
    entry.active = false;
    const i = endpoints.indexOf(entry);
    if (i >= 0) endpoints.splice(i, 1);
    for (const cancel of [...entry.pending]) cancel();
};

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
    if (endpoint.matches !== undefined && typeof endpoint.matches !== 'function') {
        throw new TypeError('a virtual HTTP endpoint path matcher must be a function');
    }
    const entry = {endpoint, active: true, pending: new Set()};
    endpoints.push(entry);
    return () => removeEndpoint(entry);
};

export const clearVirtualHttpForTest = () => { for (const entry of [...endpoints]) removeEndpoint(entry); };

const httpEntryFor = value => {
    let url;
    try { url = new URL(String(value)); } catch { return null; }
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
    return endpoints.find(({endpoint: e}) => e.port === port && (e.host ? e.host === url.hostname : loopback(url.hostname)) &&
        (!e.protocols || e.protocols.includes(url.protocol.slice(0, -1))) && (!e.matches || e.matches(url))) || null;
};

export const httpEndpointFor = value => httpEntryFor(value)?.endpoint || null;

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

/** Wraps host.fetch. Returns a restore. */
export const installVirtualFetch = ({host = typeof window === 'undefined' ? globalThis : window} = {}) => {
    return acquireFetch(host, 'fetch', (before, active) => {
        const wrapped = async function fetch (input, init = {}) {
            const href = typeof input === 'string' || input instanceof URL ? String(input) : input && input.url;
            const entry = active() ? httpEntryFor(href) : null;
            if (!entry) {
                if (typeof before !== 'function') throw new TypeError('fetch failed');
                return before.call(host, input, init);
            }
            const endpoint = entry.endpoint;
            const signal = init && init.signal;
            if (signal && signal.aborted) throw abortError();
            const url = new URL(href);
            const body = bodyText(init && init.body);
            const request = {
                method: String((init && init.method) || 'GET').toUpperCase(),
                url, path: url.pathname, query: url.searchParams, headers: headersOf(init && init.headers), body,
                json: () => (body ? JSON.parse(body) : null)
            };
            let cancel;
            const closed = new Promise((resolve, reject) => { cancel = () => reject(abortError()); });
            entry.pending.add(cancel);
            if (signal) signal.addEventListener('abort', cancel, {once: true});
            let reply;
            try {
                const answer = Promise.resolve().then(() => {
                    if (!entry.active || signal?.aborted) throw abortError();
                    return endpoint.handle(request);
                });
                reply = await Promise.race([answer, closed]);
                if (!entry.active || signal?.aborted) throw abortError();
            } finally {
                entry.pending.delete(cancel);
                if (signal) signal.removeEventListener('abort', cancel);
            }
            const status = (reply && reply.status) || 200;
            if (reply && reply.json !== undefined) {
                return new Response(JSON.stringify(reply.json), {status, headers: {'content-type': 'application/json'}});
            }
            return new Response(reply && reply.body !== undefined ? reply.body : null, {status});
        };
        wrapped.__brickwrightVirtualHttp = true;
        return wrapped;
    });
};
