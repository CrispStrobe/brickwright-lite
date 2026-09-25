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
 * set (core + radio + microphone); pxt-arcade ships none, so its bases are BUILT
 * from source by scripts/build-makecode-arcade-bases.mjs (one per hardware
 * variant, default package set) and served by the sync when their sha256 is
 * pinned. Anything else would need MakeCode's cloud C++ compiler — refused here
 * by name (NO_BASE_HEX) rather than sent to the network. Simulation has no such
 * limit. An Arcade native build must name its hardware (`hwVariant`): the
 * generic default has no C++ runtime of its own, so it has no base either.
 *
 * @module
 */

import {BASE_LICENCES, emulatorBaseVerdict} from './base-licences.js';

/**
 * The MakeCode targets whose runtime sync-makecode-runtime serves, by pxt
 * target id (the `pxtTarget` a MakeCode file names), and what each builds.
 * `firmware` is the file the generic firmware download produces, or null where
 * it cannot: Arcade builds a .uf2 only for a chosen board (`hwVariant`, see
 * ARCADE_HARDWARE), and the importer's download has no board picker yet, so a
 * board-less native Arcade build stays refused by name (NO_BASE_HEX).
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
    // The EMULATOR's base check, inside the worker: the served bytes' sha256
    // must be one of the bases base-licences.js classifies 'clean' (the list
    // comes with the request). Anything else — an official base with Nordic's
    // SoftDevice in it, unknown bytes — is refused BEFORE pxt links onto it;
    // the page names the reason (emulatorBaseVerdict).
    emulatorBase: async function (text, cleanSha256s) {
        var digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        var hex = Array.prototype.map.call(new Uint8Array(digest), function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
        if ((cleanSha256s || []).indexOf(hex) < 0) {
            var e = new Error('firmware base ' + hex + ' is not a clean emulator base');
            e.code = 'BASE_REFUSED';
            e.baseSha256 = hex;
            throw e;
        }
        return text;
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
        // Arcade hardware: 'rp2040', 'samd51'... selects the hw---<variant> package
        // (and with it the C++ runtime and the firmware base). '' = the default.
        pxt.setHwVariant(opts.hwVariant || '');
        // A multi-variant target (micro:bit: mbdal = V1, mbcodal = V2) builds
        // EVERY variant into one universal .hex by default; 'mbcodal' builds only
        // that one — the emulator runs a V2 image, on a Bluetooth-free base
        // (compileMakeCodeForEmulator), and has no use for the V1 half. null = all.
        pxt.setAppTargetVariant(opts.appVariant || null);
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
                hwVariant: m.hwVariant,
                appVariant: m.appVariant,
                getBaseHex: async function (sha) {
                    // The emulator links onto its own bases (hexcache-emu/), and
                    // only onto bytes proven clean; a download, onto the official ones.
                    var h = await fetch(m.base + (m.emulator ? 'hexcache-emu/' : 'hexcache/') + sha + '.hex');
                    if (!h.ok) return null;
                    var text = await h.text();
                    return m.emulator ? bwMakeCode.emulatorBase(text, m.cleanBases) : text;
                }
            });
            postMessage({id: m.id, ok: true, result: out});
        }
    } catch (err) {
        postMessage({id: m.id, ok: false, error: {message: String(err && err.message || err), code: err && err.code, sha: err && err.sha, baseSha256: err && err.baseSha256}});
    }
};
self.onmessage = bwOnMessage;
`;

/**
 * A MakeCode failure, with a code the UI can name: NO_RUNTIME, NO_BASE_HEX,
 * UNSUPPORTED_TARGET, COMPILE — and, for the emulator, CHIP_RESTRICTED_BASE,
 * UNAUDITED_BASE, UNKNOWN_BASE (base-licences.js emulatorBaseVerdict).
 */
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
        else p.reject(new MakeCodeError(e.data.error.message, e.data.error.code || 'COMPILE', {sha: e.data.error.sha, baseSha256: e.data.error.baseSha256}));
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
 * @param {string} [args.hwVariant] Arcade hardware for a native build (ARCADE_HARDWARE)
 * @param {string} [args.baseUrl] where static/ is served from (default: the page's base)
 * @returns {Promise<{success: boolean, outfiles: object, diagnostics: object[], netAttempts: string[]}>}
 */
export async function compileMakeCode ({target, files, native = false, embedSource = null, hwVariant = '', baseUrl} = {}) {
    if (!MAKECODE_TARGETS.includes(target)) {
        throw new MakeCodeError(`MakeCode ${target || 'unknown'} is not a target this build carries ` +
            `(${MAKECODE_TARGETS.join(', ')})`, 'UNSUPPORTED_TARGET');
    }
    if (!files || !files['pxt.json']) throw new MakeCodeError('a MakeCode project needs its pxt.json', 'COMPILE');
    const base = new URL(runtimeBase(target), baseUrl || document.baseURI).href;
    const w = workerFor(target, base);
    await w.ready;
    return w.call({op: 'compile', files, native, embedSource, hwVariant});
}

/**
 * Refuse, by name, a firmware base the emulator must not run. The one check
 * every emulator path goes through (the worker's emulatorBase only sends back
 * the sha256 of what it refused). Throws MakeCodeError with the verdict's code.
 * @param {string} sha256 of the base's .hex bytes
 * @returns {object} the base's licence record, when it is clean
 */
export function assertEmulatorBase (sha256) {
    const v = emulatorBaseVerdict(sha256);
    if (!v.ok) throw new MakeCodeError(v.reason, v.code, {baseSha256: sha256});
    return v.licence;
}

/** The sha256s of the bases the emulator may run (base-licences.js: classification 'clean'). */
export const EMULATOR_CLEAN_BASES = Object.freeze(Object.keys(BASE_LICENCES).filter(k => emulatorBaseVerdict(k).ok));

/**
 * Compile a micro:bit project for the EMULATOR: the V2 variant only ('mbcodal'),
 * linked onto a Bluetooth-free base from static/makecode/microbit/hexcache-emu/
 * (scripts/build-makecode-emu-bases.mjs) — never onto the official bases, whose
 * Nordic SoftDevice may only run on a Nordic chip. A base that is not clean is
 * refused by name (assertEmulatorBase); a package set with no emulator base is
 * NO_BASE_HEX, as for a download. The result's outfiles['binary.hex'] is a plain
 * (not universal) V2 image with its vector table at 0.
 */
export async function compileMakeCodeForEmulator ({target = 'microbit', files, baseUrl} = {}) {
    if (target !== 'microbit') {
        throw new MakeCodeError(`MakeCode ${target} has no emulator firmware bases (only the micro:bit V2 does)`, 'UNSUPPORTED_TARGET');
    }
    if (!files || !files['pxt.json']) throw new MakeCodeError('a MakeCode project needs its pxt.json', 'COMPILE');
    const base = new URL(runtimeBase(target), baseUrl || document.baseURI).href;
    const w = workerFor(target, base);
    await w.ready;
    try {
        return await w.call({op: 'compile', files, native: true, appVariant: 'mbcodal', emulator: true, cleanBases: EMULATOR_CLEAN_BASES});
    } catch (e) {
        if (e && e.code === 'BASE_REFUSED') assertEmulatorBase(e.baseSha256);
        throw e;
    }
}

/**
 * The Arcade hardware a native build can target: pxt-arcade's hw---<variant>
 * packages built by pxt's CODAL engine (hw---rpi and hw---vm are Linux builds,
 * not here). `family` is the UF2 family id pxt writes (null: the build is an
 * Intel HEX, not a UF2 — the nRF52833 boards).
 */
export const ARCADE_HARDWARE = Object.freeze({
    rp2040: {name: 'Raspberry Pi Pico (RP2040)', family: 0xe48bff56},
    samd51: {name: 'SAMD51 (Adafruit PyBadge and similar, "D5")', family: 0x55114460},
    samd51adafruit: {name: 'SAMD51, Adafruit bootloader layout', family: 0x55114460},
    stm32f401: {name: 'STM32F401 ("F4", Meowbit and similar)', family: 0x57755a57},
    n3: {name: 'nRF52833 ("N3")', family: null},
    gdk: {name: 'nRF52833 Game Designer\'s Kit', family: null},
    n4: {name: 'nRF52840 ("N4", experimental)', family: 0xada52840}
});

/**
 * The flashable file in a native build's outfiles. pxt returns a UF2 as BASE64
 * text (outfiles['binary.uf2']) and a .hex as text; this gives the bytes a
 * download writes, so the caller never has to know which.
 * @returns {{name: string, bytes: Uint8Array}|null}
 */
export function firmwareFile (outfiles = {}) {
    if (outfiles['binary.uf2']) {
        const bin = atob(outfiles['binary.uf2']);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return {name: 'binary.uf2', bytes};
    }
    if (outfiles['binary.hex']) return {name: 'binary.hex', bytes: new TextEncoder().encode(outfiles['binary.hex'])};
    return null;
}

/**
 * The C++ packages MakeCode's editor adds to a new micro:bit project; a project
 * whose package set is this one links onto a shipped firmware base. Exported so
 * a project WE write (the blocks export) uses the set that has a base.
 */
export const MICROBIT_DEFAULT_DEPENDENCIES = Object.freeze({core: '*', radio: '*', microphone: '*'});
