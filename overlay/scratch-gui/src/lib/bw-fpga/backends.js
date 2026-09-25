/**
 * Choosing where synthesis runs — and refusing to choose silently.
 *
 * Decision 5 in docs/TANG-NANO.md: hosted by default, local WASM as an explicit
 * opt-in. Decision 19 makes the local tier the ONLY route for GPL-licensed
 * cores, which means the two backends are not interchangeable — the local one is
 * strictly more capable, and a user who thinks they are the same will be
 * confused by a refusal that looks arbitrary.
 *
 * So this deliberately mirrors bw-board's execution-policy.js rather than
 * inventing a second vocabulary: a reviewed catalog, availability reported by a
 * PROBE rather than assumed, a selection that names what it picked and why, and
 * NAMED REFUSALS for everything it did not pick. The rules it borrows are worth
 * restating because they are the whole point:
 *
 *   A backend nobody can reach must not be offered. target-kinds.js puts it
 *   best — a picker entry nobody can select is a lie the front end tells for us.
 *
 *   Auto may choose, but must never choose SILENTLY. The selected backend is
 *   part of the result, so a build that behaved differently than expected can
 *   be traced to where it ran.
 *
 *   An unavailable REQUEST is a refusal, not a fallback. Quietly building
 *   somewhere else than asked is how two backends that disagree become
 *   unfalsifiable bug reports.
 *
 * The catalog is written so adding a service is a config entry rather than a code
 * change, and `endpoint` is a BASE url throughout — `<base>/health` here,
 * `<base>/synth` in synthesis.js. One configured value has to reach both, which
 * is why neither module concatenates its own path inline.
 *
 * @module
 */

import {detectWasmCapabilities, localToolchainRefusal} from './wasm-capabilities.js';
import {t} from './l10n.js';

export const BACKEND_KINDS = Object.freeze(['hosted', 'local']);

/**
 * The reviewed catalog. `endpoint: null` means "declared but not configured",
 * which is different from "unavailable" and reported differently.
 */
/**
 * @param {{hostedEndpoint?: string|null, locale?: string}} [opts] `locale` is the
 *   reader's; the FPGA tab has it as a prop and passes it. Absent, the shared
 *   table falls back to English rather than rendering an empty label.
 */
export function defaultCatalog ({hostedEndpoint = null, locale} = {}) {
    return Object.freeze([
        Object.freeze({
            id: 'hosted',
            kind: 'hosted',
            label: t(locale, 'backend.hosted.label'),
            rank: 0,
            endpoint: hostedEndpoint,
            description: t(locale, 'backend.hosted.description'),
            capabilities: Object.freeze(['permissive-sources'])
        }),
        Object.freeze({
            id: 'local',
            kind: 'local',
            label: t(locale, 'backend.local.label'),
            rank: 1,
            endpoint: null,
            description: t(locale, 'backend.local.description'),
            capabilities: Object.freeze(['permissive-sources', 'copyleft-sources'])
        })
    ]);
}

/**
 * Ask each backend whether it is actually there. Omission is FAIL-CLOSED: a
 * backend that does not answer is not available, never optimistically assumed.
 *
 * @returns {Promise<{available: string[], probes: Array}>}
 */
export async function probeBackends ({catalog, fetchImpl = null, localAvailable = false,
    timeoutMs = 3000, capabilities = null} = {}) {
    const probes = [];
    const available = [];

    for (const entry of catalog || []) {
        if (entry.kind === 'local') {
            // CAPABILITY BEFORE DOWNLOAD. The toolchain's WebAssembly needs
            // WasmGC, and the audience this project names first — school
            // Chromebooks — is exactly the population most likely to be on a
            // browser without it. Finding that out AFTER 78 MB would be the
            // worst possible order, so it is checked first and the refusal
            // names the missing feature rather than saying "unsupported".
            // Injectable for the same reason fetchImpl is: a selector that can
            // only be tested on a runtime that happens to support WasmGC is a
            // selector whose refusal path is never exercised.
            const refusal = localToolchainRefusal(capabilities || detectWasmCapabilities());
            if (refusal) {
                probes.push({id: entry.id, ok: false, ...refusal});
                continue;
            }
            if (localAvailable) {
                available.push(entry.id);
                probes.push({id: entry.id, ok: true, reason: 'The toolchain is downloaded.'});
            } else {
                probes.push({id: entry.id, ok: false, code: 'not-downloaded',
                    reason: 'This browser can run the local toolchain, but it has not been '
                        + 'downloaded yet (~78 MB, once).'});
            }
            continue;
        }

        if (!entry.endpoint) {
            probes.push({id: entry.id, ok: false, code: 'not-configured',
                reason: 'No synthesis service is configured in this build. The service '
                    + 'exists (CrispStrobe/bw-synth); this build was not given its '
                    + 'address. Set BW_SYNTHESIS_ENDPOINT to its base url.'});
            continue;
        }

        const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
        if (!doFetch) {
            probes.push({id: entry.id, ok: false, code: 'no-fetch',
                reason: 'This environment has no fetch implementation.'});
            continue;
        }

        try {
            const res = await withTimeout(doFetch(healthUrl(entry.endpoint), {method: 'GET'}),
                timeoutMs);
            if (res && res.status >= 200 && res.status < 300) {
                available.push(entry.id);
                probes.push({id: entry.id, ok: true, reason: 'The service answered.'});
            } else {
                probes.push({id: entry.id, ok: false, code: 'unhealthy',
                    reason: `The service answered HTTP ${res && res.status}.`});
            }
        } catch (e) {
            probes.push({id: entry.id, ok: false, code: 'unreachable',
                reason: `The service could not be reached: ${e.message}`});
        }
    }

    return {available, probes};
}

function withTimeout (promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms))
    ]);
}

/**
 * Select a backend.
 *
 * @param {object} req
 * @param {'auto'|string} [req.backend]   'auto', or an explicit catalog id
 * @param {string[]} [req.requiredCapabilities]  e.g. ['copyleft-sources']
 * @param {string[]} req.available        ids the probe actually found
 * @param {Array} req.catalog
 */
export function selectBackend ({backend = 'auto', requiredCapabilities = [],
    available = [], catalog = []} = {}) {
    const requested = {backend, requiredCapabilities: [...requiredCapabilities]};
    const refuse = (code, reason, refusals = []) =>
        ({accepted: false, code, reason, requested, selected: null, refusals});

    const availableIds = new Set(available);
    const candidates = backend === 'auto'
        ? [...catalog].sort((a, b) => a.rank - b.rank)
        : catalog.filter(e => e.id === backend);

    if (!candidates.length) {
        return refuse('unknown-backend',
            `"${backend}" is not a synthesis backend this build knows about.`);
    }

    const refusals = [];
    for (const entry of candidates) {
        const missing = requiredCapabilities.filter(c => !entry.capabilities.includes(c));
        if (missing.length) {
            refusals.push({id: entry.id, code: 'missing-capability',
                reason: missing.includes('copyleft-sources')
                    ? `${entry.label} cannot build copyleft sources. Building them on a shared `
                        + 'server would convey a derivative work; building them here does not.'
                    : `${entry.label} does not provide: ${missing.join(', ')}.`});
            continue;
        }
        if (!availableIds.has(entry.id)) {
            refusals.push({id: entry.id, code: 'unavailable',
                reason: `${entry.label} is not available right now.`});
            continue;
        }
        return {accepted: true, code: 'selected', requested,
            selected: {...entry},
            reason: backend === 'auto'
                ? 'First available backend in reviewed rank order.'
                : 'Explicitly requested, and available.',
            refusals};
    }

    // An explicit request that cannot be honoured reports ITS OWN reason, never
    // a fallback: silently building somewhere else than asked is how two
    // backends that disagree become unfalsifiable bug reports.
    return refuse(backend === 'auto' ? 'no-backend-available' : refusals[0].code,
        backend === 'auto'
            ? 'No synthesis backend is available. Nothing can be built until one is.'
            : refusals[0].reason,
        refusals);
}

/** What a picker may show: only what was actually found. */
export function offerable (catalog, available) {
    const ids = new Set(available);
    return (catalog || []).filter(e => ids.has(e.id));
}

/**
 * The health url for a base endpoint. The sibling of `synthUrl` in synthesis.js;
 * both exported so the tab and the tests agree with the probe rather than each
 * rebuilding the string.
 */
export function healthUrl (endpoint) {
    return `${String(endpoint).replace(/\/+$/, '')}/health`;
}
