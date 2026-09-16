/**
 * The hosted synthesis client — TN3's near half.
 *
 * There is NO SERVICE YET. This is the contract it will have to satisfy and the
 * client that talks to it, written now because the decisions are fresh and
 * because the licence screening belongs on this side of the wire regardless of
 * what runs on the other.
 *
 * THE RULE THIS ENFORCES, from docs/TANG-NANO.md §2.3: a GPL-licensed source is
 * refused BY NAME on the hosted route and pointed at the local tier. Compiling
 * it on our server and returning a bitstream would convey a derivative work and
 * make the service a distributor; building it on the user's own machine conveys
 * nothing. That refusal happens HERE, before anything is uploaded, so the
 * decision cannot be lost by a server that forgets it.
 *
 * WHAT IT NEVER DOES: succeed without a service. An absent endpoint is a named
 * refusal, not a stub result, not a fake bitstream. A client that pretended
 * would put an artefact in a user's hands that no toolchain produced.
 *
 * THE CONTRACT (v1), so the service and this agree before either is written:
 *
 *   POST <endpoint>
 *   {
 *     "contract": 1,
 *     "target":   {"family": "GW2A", "device": "GW2AR-LV18QN88C8/I7", "vopt": "family"},
 *     "top":      "<module name>",
 *     "files":    [{"name": "blink.v", "source": "..."}],
 *     "constraints": "IO_LOC \"led\" 73;\n..."
 *   }
 *
 *   200 {"contract":1, "ok":true,
 *        "netlist": {...},            // Yosys JSON — feeds the gate-level tier
 *        "bitstream": "<base64>",     // what goes to the board
 *        "log": "...",
 *        "toolVersions": {"yosys":"...", "nextpnr":"...", "apicula":"..."}}
 *
 *   200 {"contract":1, "ok":false, "code":"synthesis-failed", "reason":"...",
 *        "log":"..."}                 // a DESIGN error: report it, do not retry
 *
 * `vopt: "family"` is not decoration: C-grade Gowin devices need
 * `--vopt family` passed to nextpnr and gowin_pack, and a service that forgets
 * it fails in a way that reads like a broken design.
 *
 * @module
 */

import {screenForHostedSynthesis} from './licence.js';

export const CONTRACT_VERSION = 1;

/** The board this project targets. Widening this is a decision, not a parameter. */
export const TANG_NANO_20K_TARGET = Object.freeze({
    family: 'GW2A',
    device: 'GW2AR-LV18QN88C8/I7',
    vopt: 'family'
});

const refusal = (code, reason, extra = {}) =>
    ({ok: false, code, reason, ...extra});

/**
 * Validate a service response before anyone trusts it.
 * A malformed reply is a named refusal, never a partial result.
 */
export function validateResponse (body) {
    if (!body || typeof body !== 'object') {
        return refusal('bad-response', 'The synthesis service did not return an object.');
    }
    if (body.contract !== CONTRACT_VERSION) {
        return refusal('contract-mismatch',
            `The service speaks contract ${body.contract}, this client speaks `
            + `${CONTRACT_VERSION}. Refusing rather than guessing at the difference.`);
    }
    if (body.ok === false) {
        return refusal(body.code || 'synthesis-failed',
            body.reason || 'The service reported a failure without a reason.',
            {log: body.log ?? null});
    }
    if (!body.netlist || typeof body.netlist !== 'object') {
        return refusal('bad-response',
            'The service reported success but returned no netlist, so nothing can be simulated.');
    }
    return {ok: true, netlist: body.netlist, bitstream: body.bitstream ?? null,
        log: body.log ?? null, toolVersions: body.toolVersions ?? null};
}

/**
 * Synthesise on the hosted route.
 *
 * @param {object} req
 * @param {Array<{name: string, source: string}>} req.files
 * @param {string} req.constraints  the .cst text
 * @param {string} [req.top]
 * @param {string|null} [req.endpoint]  absent means no service is configured
 * @param {Function} [req.fetchImpl]    injected for tests
 * @returns {Promise<object>}
 */
export async function synthesise ({files, constraints, top = null, endpoint = null,
    target = TANG_NANO_20K_TARGET, fetchImpl = null} = {}) {

    if (!Array.isArray(files) || !files.length) {
        return refusal('no-sources', 'There is nothing to synthesise.');
    }

    // The licence screen runs BEFORE the upload, on purpose: a refusal that
    // happens after the source has left the machine has already lost.
    const screen = screenForHostedSynthesis(files);
    if (!screen.hostedAllowed) {
        return refusal('source-licence-refused',
            'One or more sources may not be built on the hosted route.',
            {refusals: screen.refusals, warnings: screen.warnings,
                alternative: 'local-tier'});
    }

    if (!endpoint) {
        return refusal('no-synthesis-service',
            'No synthesis service is configured, so nothing can be built here yet. '
            + 'This is TN3 and it is not implemented — the client, the contract and the '
            + 'licence screening exist, the service does not.',
            {warnings: screen.warnings});
    }

    const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!doFetch) {
        return refusal('no-fetch', 'This environment has no fetch implementation.');
    }

    let res;
    try {
        res = await doFetch(endpoint, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({contract: CONTRACT_VERSION, target, top,
                files, constraints: constraints ?? ''})
        });
    } catch (e) {
        return refusal('service-unreachable',
            `The synthesis service could not be reached: ${e.message}`);
    }

    if (!res || typeof res.status !== 'number' || res.status < 200 || res.status >= 300) {
        return refusal('service-error',
            `The synthesis service answered HTTP ${res && res.status}.`);
    }

    let body;
    try {
        body = await res.json();
    } catch (e) {
        return refusal('bad-response', `The service's reply was not JSON: ${e.message}`);
    }

    const validated = validateResponse(body);
    if (validated.ok) validated.warnings = screen.warnings;
    return validated;
}
