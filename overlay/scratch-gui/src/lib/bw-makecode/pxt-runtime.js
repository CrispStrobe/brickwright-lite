/**
 * MakeCode's own compiler, run here: an imported (or exported) MakeCode project
 * compiled by pxt itself, with no makecode.com.
 *
 * WHY THE REAL COMPILER. The rest of bw-makecode TRANSLATES MakeCode into our
 * dialect, and says out loud what does not survive (tilemaps, physics, music…).
 * This is the other road: keep the program as MakeCode wrote it, compile it with
 * MakeCode's compiler (pxt-core, MIT) against MakeCode's target (pxt-microbit /
 * pxt-arcade, MIT), and run it in MakeCode's simulator — nothing is lost, because
 * nothing is converted. For the micro:bit it also produces the REAL firmware: a
 * universal .hex that flashes a board.
 *
 * WHERE THE RUNTIME COMES FROM. scripts/sync-makecode-runtime.mjs fetches the
 * pinned npm tarballs and serves the files under static/makecode/<target>/:
 * target.json (the target bundle: libraries + compiler config), pxtworker.js
 * (the compiler), the simulator, and for the micro:bit the precompiled CODAL
 * firmware bases (hexcache/<sha>.hex) that a program is linked onto.
 *
 * HOW. pxtworker.js is the script MakeCode's editor runs in a Web Worker. The
 * glue below runs inside that same worker (or, in Node tests, inside a vm
 * sandbox with the same globals) and calls pxt's "simple compile" entry points —
 * the sequence Microsoft's makecode CLI (pxt-mkc, MIT) uses, minus its package
 * downloader, cache and project folder. Every network hook refuses and is
 * counted, so "offline" is a measured property, not an assumption: the spike
 * compiled with zero attempts, and a .hex byte-identical to the CLI's.
 *
 * THE ONE HARD LIMIT. A native build needs a precompiled firmware base for the
 * project's exact set of C++ packages. pxt-microbit ships those for its default
 * set (core + radio + microphone); pxt-arcade ships none. Anything else would
 * need MakeCode's cloud C++ compiler — refused here by name (NO_BASE_HEX) rather
 * than sent to the network. Simulation has no such limit.
 *
 * @module
 */

/**
 * The MakeCode targets whose runtime sync-makecode-runtime serves, by pxt
 * target id (the `pxtTarget` a MakeCode file names), and what each builds.
 * `firmware` is the file a native build produces, or null where no firmware
 * base ships yet (Arcade: simulator only; native is refused by name).
 */
export const MAKECODE_BOARDS = Object.freeze({
    microbit: {label: 'micro:bit', firmware: 'hex'},
    calliopemini: {label: 'Calliope mini', firmware: 'hex'},
    ev3: {label: 'LEGO MINDSTORMS EV3', firmware: 'uf2'},
    adafruit: {label: 'Circuit Playground Express', firmware: 'uf2'},
    arcade: {label: 'Arcade', firmware: null}
});
export const MAKECODE_TARGETS = Object.freeze(Object.keys(MAKECODE_BOARDS));

/** Where a target's runtime is served, relative to the app. */
export const runtimeBase = target => `static/makecode/${target}/`;

/**
 * The code that runs inside the pxt worker, after `pxtTargetBundle` is set and
 * pxtworker.js has loaded. Plain script (no modules): it is evaluated in a Web
 * Worker in the browser and in a vm context in tests, the same text in both.
 */
export const PXT_GLUE_JS = `
var bwMakeCode = {
    netAttempts: [],
    configured: false,
    configure: function () {
        if (bwMakeCode.configured) return;
        pxt.setupSimpleCompile({
            cacheGet: function () { return Promise.resolve(null); },
            cacheSet: function () { return Promise.resolve(); },
            httpRequestAsync: function (o) {
                bwMakeCode.netAttempts.push(o && o.url);
                return Promise.reject(new Error('offline: ' + (o && o.url)));
            },
            pkgOverrideAsync: function () { return Promise.resolve(null); }
        });
        // The package config is fetched from the cloud on every compile otherwise.
        pxt.packagesConfigAsync = function () { return Promise.resolve({}); };
        pxt.setupWebConfig({cdnUrl: 'https://offline.invalid'});
        bwMakeCode.configured = true;
    },
    compile: async function (files, opts) {
        opts = opts || {};
        bwMakeCode.configure();
        var before = bwMakeCode.netAttempts.length;
        var cfg = JSON.parse(files['pxt.json']);
        cfg.binaryonly = true;
        files = Object.assign({}, files, {'pxt.json': JSON.stringify(cfg, null, 4)});
        if (files['main.ts'] === undefined) files['main.ts'] = '';
        if (pxt.simpleInstallPackagesAsync) await pxt.simpleInstallPackagesAsync(files);
        pxt.setHwVariant('');
        var copts = await pxt.simpleGetCompileOptionsAsync(files, {native: !!opts.native});
        if (opts.native && copts.extinfo && copts.extinfo.sha) {
            var infos = [copts.extinfo].concat((copts.otherMultiVariants || []).map(function (v) { return v.extinfo; }));
            for (var i = 0; i < infos.length; i++) {
                var hex = await opts.getBaseHex(infos[i].sha);
                if (!hex) {
                    var e = new Error('no precompiled firmware base for this package set (' + infos[i].sha + ')');
                    e.code = 'NO_BASE_HEX';
                    e.sha = infos[i].sha;
                    throw e;
                }
                infos[i].hexinfo = {hex: hex.split(/\\r?\\n/)};
            }
        }
        if (opts.native && opts.embedSource) {
            // The project, embedded the way MakeCode's editor embeds it, so the
            // .hex opens as this PROJECT in makecode.microbit.org (and in our own
            // importer). binaryonly above stops pxt doing it from the package;
            // the compiler still places it — in flash when it fits, else as
            // records after the image. Uncompressed: pxt's importer accepts that.
            copts.embedMeta = JSON.stringify({
                name: opts.embedSource.name || 'project',
                eURL: opts.embedSource.editorUrl || '',
                eVER: (pxt.appTarget.versions && pxt.appTarget.versions.target) || '',
                pxtTarget: pxt.appTarget.id
            });
            copts.embedBlob = ts.pxtc.encodeBase64(ts.pxtc.Util.toUTF8(JSON.stringify(opts.embedSource.files)));
        }
        var res = pxtc.service.performOperation('compile', {options: copts});
        return {
            success: !!res.success,
            outfiles: res.outfiles || {},
            diagnostics: (res.diagnostics || []).map(function (d) {
                var m = d.messageText;
                while (m && typeof m === 'object') m = m.messageText;
                return {file: d.fileName, line: d.line, column: d.column, message: String(m || '')};
            }),
            netAttempts: bwMakeCode.netAttempts.slice(before)
        };
    }
};
`;

/**
 * The worker's message loop, around the glue. pxtworker.js is itself written as a
 * worker script and installs ITS OWN self.onmessage when it loads, so the handler
 * is re-installed after importScripts — otherwise every message after 'init'
 * goes to pxt's handler, which never answers in this format, and a compile hangs
 * (measured: the first browser run did exactly that).
 */
const WORKER_JS = `${PXT_GLUE_JS}
var bwOnMessage = async function (e) {
    var m = e.data;
    try {
        if (m.op === 'init') {
            var r = await fetch(m.base + 'target.json');
            if (!r.ok) throw Object.assign(new Error('target.json: HTTP ' + r.status), {code: 'NO_RUNTIME'});
            self.pxtTargetBundle = await r.json();
            importScripts(m.base + 'pxtworker.js');
            self.onmessage = bwOnMessage;
            postMessage({id: m.id, ok: true});
        } else if (m.op === 'compile') {
            var out = await bwMakeCode.compile(m.files, {
                native: m.native,
                embedSource: m.embedSource,
                getBaseHex: async function (sha) {
                    var h = await fetch(m.base + 'hexcache/' + sha + '.hex');
                    return h.ok ? h.text() : null;
                }
            });
            postMessage({id: m.id, ok: true, result: out});
        }
    } catch (err) {
        postMessage({id: m.id, ok: false, error: {message: String(err && err.message || err), code: err && err.code, sha: err && err.sha}});
    }
};
self.onmessage = bwOnMessage;
`;

/** A MakeCode failure, with a code the UI can name: NO_RUNTIME, NO_BASE_HEX, UNSUPPORTED_TARGET, COMPILE. */
export class MakeCodeError extends Error {
    constructor (message, code, extra = {}) {
        super(message);
        this.name = 'MakeCodeError';
        this.code = code;
        Object.assign(this, extra);
    }
}

const workers = new Map();

/** One worker per target, initialised once (the target bundle is large). */
function workerFor (target, base) {
    if (workers.has(target)) return workers.get(target);
    const url = URL.createObjectURL(new Blob([WORKER_JS], {type: 'application/javascript'}));
    const worker = new Worker(url);
    let next = 0;
    const pending = new Map();
    worker.onmessage = e => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.ok) p.resolve(e.data.result);
        else p.reject(new MakeCodeError(e.data.error.message, e.data.error.code || 'COMPILE', {sha: e.data.error.sha}));
    };
    const call = msg => new Promise((resolve, reject) => {
        const id = ++next;
        pending.set(id, {resolve, reject});
        worker.postMessage(Object.assign({id, base}, msg));
    });
    const entry = {call, ready: call({op: 'init'})};
    entry.ready.catch(() => workers.delete(target));   // a failed init is retried next time
    workers.set(target, entry);
    return entry;
}

/**
 * Compile a MakeCode project in the browser.
 *
 * @param {object} args
 * @param {string} args.target 'microbit' or 'arcade'
 * @param {Object<string,string>} args.files the project, {filename: contents}, pxt.json included
 * @param {boolean} [args.native] build the firmware (.hex) instead of simulator JS
 * @param {{files: object, name: string, editorUrl?: string}} [args.embedSource] embed the
 *   project in the .hex, as MakeCode's editor does, so MakeCode opens it as a project
 * @param {string} [args.baseUrl] where static/ is served from (default: the page's base)
 * @returns {Promise<{success: boolean, outfiles: object, diagnostics: object[], netAttempts: string[]}>}
 */
export async function compileMakeCode ({target, files, native = false, embedSource = null, baseUrl} = {}) {
    if (!MAKECODE_TARGETS.includes(target)) {
        throw new MakeCodeError(`MakeCode ${target || 'unknown'} is not a target this build carries ` +
            `(${MAKECODE_TARGETS.join(', ')})`, 'UNSUPPORTED_TARGET');
    }
    if (!files || !files['pxt.json']) throw new MakeCodeError('a MakeCode project needs its pxt.json', 'COMPILE');
    const base = new URL(runtimeBase(target), baseUrl || document.baseURI).href;
    const w = workerFor(target, base);
    await w.ready;
    return w.call({op: 'compile', files, native, embedSource});
}

/**
 * The C++ packages MakeCode's editor adds to a new micro:bit project; a project
 * whose package set is this one links onto a shipped firmware base. Exported so
 * a project WE write (the blocks export) uses the set that has a base.
 */
export const MICROBIT_DEFAULT_DEPENDENCIES = Object.freeze({core: '*', radio: '*', microphone: '*'});
