/**
 * TN6a: synthesising in the browser, and everything that must happen before it.
 *
 * §8e proved the chain runs. This is the part that decides WHETHER to start it,
 * and the ordering of those decisions is the whole design:
 *
 *   1. can this runtime run it at all?   wasm-capabilities.js, BEFORE any fetch
 *   2. has the user agreed to the fetch? 78 MB is not a thing to start quietly
 *   3. is it downloaded?                 a synthesise() that silently fetches
 *                                        78 MB is the same mistake as (2)
 *
 * Each of those is a NAMED REFUSAL rather than a `false`, for the reason
 * backends.js gives: a user told "unavailable" can only guess, and a user told
 * "this browser has no WasmGC" or "the toolchain has not been downloaded" knows
 * what to do next. The refusal shapes match backends.js on purpose so the tab
 * renders them with one branch.
 *
 * WHAT IT DELIBERATELY CANNOT DO: produce a bitstream. TN6a is Yosys alone —
 * Verilog to a NETLIST, which is what the gate-level tier consumes. Place and
 * route is another 183 MB (§8e) and the §8c rule stands: no local bitstream is
 * offered until the app can run the whole chain with the download consented to.
 * So `bitstream` is not an optional field that happens to be missing here, it is
 * a named refusal — `bitstreamRefusal()` — because a field that is sometimes
 * absent invites a caller to check for it and hope.
 *
 * WHY THE ENGINE IS INJECTED, same reason as sim.js and more sharply. Node 20
 * cannot load @yowasp/yosys at all: `invalid value type 'noexternref'`. A module
 * that imported it could not be tested on this box, and its REFUSAL paths — the
 * ones that matter most, since they are what the unsupported browser sees —
 * would be exercised by nobody. So this holds the policy and no third-party
 * import, and the single call site that knows which build it is on passes the
 * runner in.
 *
 * @module
 */

import {detectWasmCapabilities, localToolchainRefusal} from './wasm-capabilities.js';

/** Measured from the npm registry 2026-09-15, and re-measured in §8e's run. */
export const YOSYS_DOWNLOAD_BYTES = 77449666;

export const STATES = Object.freeze(
    ['unsupported', 'not-downloaded', 'downloading', 'ready', 'failed']);

const refusal = (code, reason, extra = {}) =>
    Object.freeze({ok: false, code, reason, ...extra});

/**
 * Why a local bitstream is not on offer. Exported because the ANSWER is the
 * product here: callers must be able to say this to a user, and must not be
 * able to mistake it for a missing feature nobody thought about.
 */
export function bitstreamRefusal () {
    return refusal('local-bitstream-unavailable',
        'This tier synthesises to a netlist. Producing a bitstream also needs place '
        + 'and route, which is a further 183 MB download that is not offered yet. '
        + 'The netlist can be simulated here; the bitstream comes from the hosted route.',
        {alternative: 'hosted'});
}

/**
 * The local tier's state and the transitions it allows.
 *
 * @param {object} opts
 * @param {Function} opts.runYosys        injected: (args, files, options) => Promise<Tree>
 * @param {object}   [opts.capabilities]  injected so refusal paths are testable anywhere
 * @param {Function} [opts.onState]       called with ({state, ...}) on every change
 */
export function createLocalToolchain ({runYosys, capabilities = null, onState = null} = {}) {
    const caps = capabilities || detectWasmCapabilities();
    // wasm-capabilities returns {code, reason} with no `ok`, because backends.js
    // adds its own. Normalised here instead of at each return below: a refusal
    // whose shape depends on WHICH refusal it is makes `r.ok === false` work by
    // luck (undefined is falsy) until someone writes `if (r.ok !== false)`.
    const capRaw = localToolchainRefusal(caps);
    const capRefusal = capRaw ? refusal(capRaw.code, capRaw.reason) : null;

    let state = capRefusal ? 'unsupported' : 'not-downloaded';
    let progress = null;
    let failure = null;
    let inFlight = null;          // the ONE download, shared by concurrent callers

    const set = (next, detail = {}) => {
        state = next;
        if (onState) onState({state, progress, failure, ...detail});
    };

    /** What a picker should show, refusal and all. Never throws. */
    const describe = () => {
        if (capRefusal) return {state, available: false, ...capRefusal};
        if (state === 'ready') return {state, available: true, ok: true,
            reason: 'The toolchain is downloaded and can synthesise here.'};
        if (state === 'downloading') return {state, available: false,
            code: 'downloading', progress,
            reason: `Downloading the toolchain — ${progress === null ? 'starting' : `${progress}%`}.`};
        if (state === 'failed') return {state, available: false, ...failure};
        return {state, available: false, code: 'not-downloaded',
            reason: `This browser can run the local toolchain. It has not been downloaded `
                + `yet (${Math.round(YOSYS_DOWNLOAD_BYTES / 1e6)} MB, once).`};
    };

    /**
     * Fetch the toolchain. Requires `consent: true` — not as ceremony, but
     * because this is the one call in the module that spends someone's data
     * allowance, and a default-true flag is a default nobody chose.
     */
    const download = async ({consent = false} = {}) => {
        if (capRefusal) return capRefusal;
        if (!consent) {
            return refusal('download-not-consented',
                `The toolchain is ${Math.round(YOSYS_DOWNLOAD_BYTES / 1e6)} MB and is not `
                + 'downloaded without asking. Nothing has been fetched.',
                {bytes: YOSYS_DOWNLOAD_BYTES});
        }
        if (state === 'ready') return {ok: true, code: 'already-downloaded',
            reason: 'The toolchain is already here.'};
        // Two clicks must not mean two downloads of 78 MB.
        if (inFlight) return inFlight;

        progress = null;
        failure = null;
        set('downloading');
        inFlight = (async () => {
            try {
                // Running the smallest possible job IS the download: the YoWASP
                // packages fetch their resources on first run, so there is no
                // separate "fetch" to call and no way to warm the cache except
                // by using it. -V is the cheapest thing Yosys will do.
                await runYosys(['-V'], {}, {
                    stdout: null, stderr: null,
                    fetchProgress: e => {
                        progress = e.totalLength
                            ? Math.floor(100 * e.doneLength / e.totalLength)
                            : null;
                        if (onState) onState({state: 'downloading', progress, failure: null});
                    }
                });
                set('ready');
                return {ok: true, code: 'downloaded', reason: 'The toolchain is ready.'};
            } catch (e) {
                failure = {code: 'download-failed',
                    reason: `The toolchain could not be downloaded or started: ${e.message}`};
                set('failed');
                return refusal(failure.code, failure.reason);
            } finally {
                inFlight = null;
            }
        })();
        return inFlight;
    };

    /**
     * Synthesise to a netlist. Refuses rather than downloading: a call that
     * quietly spends 78 MB is the mistake `download` exists to prevent, and
     * moving it one function over does not fix it.
     */
    const synthesise = async ({files, top = null} = {}) => {
        if (capRefusal) return capRefusal;
        if (!Array.isArray(files) || !files.length) {
            return refusal('no-sources', 'There is nothing to synthesise.');
        }
        if (state !== 'ready') {
            return refusal('not-downloaded',
                'The toolchain has not been downloaded, so nothing can be synthesised here '
                + 'yet. Nothing was fetched by this call.');
        }
        const topName = top || 'top';
        const tree = Object.fromEntries(files.map(f => [f.name, f.source]));
        const script = `read_verilog ${files.map(f => f.name).join(' ')}; `
            + `synth_gowin -top ${topName} -json design.json`;
        let out;
        try {
            out = await runYosys(['-q', '-p', script], tree, {stdout: null, stderr: null});
        } catch (e) {
            // A design that does not compile is an ANSWER, not an outage: the
            // same rule bw-synth states for its HTTP layer.
            return refusal('synthesis-failed',
                `Yosys could not synthesise this design: ${e.message}`);
        }
        const raw = out && out['design.json'];
        if (!raw) {
            return refusal('no-netlist',
                'Yosys ran but produced no netlist, which means the script did not do what '
                + 'this module thinks it does — a bug here, not in the design.');
        }
        let netlist;
        try {
            netlist = typeof raw === 'string' ? JSON.parse(raw)
                : JSON.parse(new TextDecoder().decode(raw));
        } catch (e) {
            return refusal('netlist-unreadable', `The netlist did not parse: ${e.message}`);
        }
        return {ok: true, code: 'synthesised', netlist, top: topName};
    };

    return {
        get state () { return state; },
        get capabilities () { return caps; },
        describe,
        download,
        synthesise,
        bitstream: bitstreamRefusal
    };
}
