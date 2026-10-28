/**
 * The bundled CrispStrobe extensions' "are you sure?" questions wait for a real answer in the
 * desktop/iOS app (task E7).
 *
 * In the app `window.confirm` returns a Promise (tauri-plugin-dialog 2.7.1; see
 * lib/native-dialog.js), always truthy, so these three went ahead without asking:
 *   ev3dev      upload-and-run  "N sound(s) failed to upload … Continue running script anyway?"
 *   ev3dev      script manager  "Delete <script>?"
 *   spikeprime  deleteScriptOnHub "Delete <file> from hub?"
 * CrispStrobe/extensions #33 made each ask through askYesNo(): `Scratch.BWConfirm` when the host
 * offers it, else the browser's confirm, awaited, only `true` is a yes. Lite offers it: the
 * adapter's Scratch shim exposes BWConfirm whenever `runtime.confirmAsync` is a function, and
 * lib/extension-confirm-hook.js (installed by vm-manager-hoc) sets that to E6's confirmAsync.
 *
 * Each site runs here from the VENDORED bundle, through the adapter, with the GUI's hook
 * installed on the runtime, in a simulated app (the plugin's init script: `confirm` is an async
 * function whose Promise rejects, `plugin:dialog|message` is the native box) and in a browser.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {installExtensionConfirm} from '../overlay/scratch-gui/src/lib/extension-confirm-hook.js';

const require = createRequire(import.meta.url);
const bundle = id => require(path.join(INTEGRATED, `node_modules/scratch-vm/src/extensions/crispstrobe/${id}`));

const tick = async () => {
    for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
};

// A DOM just big enough for the ev3dev script manager: elements remember children and handlers.
const element = tag => ({
    tagName: tag, children: [], style: {}, innerHTML: '', textContent: '',
    appendChild (child) {
        this.children.push(child);
        return child;
    },
    addEventListener () {}, remove () {}
});
const fakeDocument = () => ({
    createElement: element, body: element('body'), head: element('head'),
    getElementById: () => null, querySelector: () => null
});

const GLOBALS = ['window', '__TAURI__', 'confirm', 'alert', 'document', 'localStorage',
    'addEventListener', 'removeEventListener'];
const saved = {};
const setGlobals = values => {
    for (const key of GLOBALS) {
        if (!(key in saved)) saved[key] = Object.getOwnPropertyDescriptor(globalThis, key);
        delete globalThis[key];
    }
    globalThis.window = globalThis;
    globalThis.document = fakeDocument();
    globalThis.localStorage = {getItem: () => null, setItem () {}, removeItem () {}};
    globalThis.alert = () => {};
    globalThis.addEventListener = () => {};
    globalThis.removeEventListener = () => {};
    Object.assign(globalThis, values);
};
// The extensions start pollers when they load (hub status, the ev3dev stream): they are stopped
// after each test, or they would hold this file's process open.
const realSetInterval = globalThis.setInterval;
const pollers = new Set();
globalThis.setInterval = (...args) => {
    const handle = realSetInterval(...args);
    pollers.add(handle);
    return handle;
};
const restoreGlobals = () => {
    for (const handle of pollers) clearInterval(handle);
    pollers.clear();
    for (const key of GLOBALS) {
        delete globalThis[key];
        if (saved[key]) Object.defineProperty(globalThis, key, saved[key]);
    }
};

/**
 * The app: the plugin's init script and a native box whose answer the test releases.
 * @returns {{log: Array, answer: function(string)}} what was asked, and the user's click
 */
const app = () => {
    const log = [];
    let release = null;
    const invoke = (command, args) => {
        log.push({command, args});
        if (command === 'plugin:dialog|message') return new Promise(resolve => { release = resolve; });
        return Promise.reject(new Error(`command ${command} not found`)); // 2.7.1 has no confirm
    };
    setGlobals({
        __TAURI__: {core: {invoke}},
        confirm (message) {
            const answer = (async () => await invoke('plugin:dialog|confirm', {message: String(message)}))();
            answer.catch(() => {}); // a site that drops it should FAIL here, not crash the run
            return answer;
        }
    });
    return {log, answer: value => release(value)};
};
const browser = value => {
    const log = [];
    setGlobals({confirm: message => { log.push({command: 'window.confirm', args: {message}}); return value; }});
    return {log};
};

/**
 * Build the extension the way the VM does (`new Cls(runtime)`), with the GUI's hook installed
 * on the runtime as vm-manager-hoc does.
 * @param {string} id bundle directory
 * @param {boolean} hook install lib/extension-confirm-hook.js
 * @returns {object} the extension wrapper and the bundle's own instance
 */
const build = (id, hook = true) => {
    const runtime = new EventEmitter();
    runtime.targets = [];
    if (hook) assert.equal(installExtensionConfirm({runtime}), true);
    const Ext = bundle(id);
    const ext = new Ext(runtime);
    return {ext, inst: ext._inst, runtime};
};

const SITES = [
    {
        name: 'ev3dev upload-and-run: some sounds failed, continue?',
        id: 'ev3dev',
        question: /^2 sound\(s\) failed to upload:[\s\S]*Continue running script anyway\?$/,
        drive (hook) {
            const {ext, inst} = build(this.id, hook);
            const ran = [];
            inst.validateScriptName = name => String(name);
            inst.transpileProject = () => { inst.pythonCode = "print('hi')"; };
            inst.extractSoundAssets = () => Promise.resolve({a: 1, b: 2});
            inst.uploadScriptCode = () => Promise.resolve();
            inst.uploadSoundFiles = () => Promise.resolve({
                results: [], errors: [{fileName: 'a.wav', error: 'x'}, {fileName: 'b.wav', error: 'y'}]
            });
            inst.runScriptByName = args => { ran.push(args.NAME); return Promise.resolve(7); };
            return {run: () => ext.uploadAndRunScript({NAME: 'prog.py'}), acted: () => ran.length > 0};
        }
    },
    {
        name: 'ev3dev script manager: delete script?',
        id: 'ev3dev',
        question: /^Delete prog\.py\?$/,
        drive (hook) {
            const {inst} = build(this.id, hook);
            const deleted = [];
            inst.getEV3URL = p => `http://ev3${p}`;
            inst.fetchWithTimeout = () => Promise.resolve({
                ok: true, json: () => Promise.resolve({status: 'ok', scripts: ['prog.py'], running: []})
            });
            inst.deleteScript = args => { deleted.push(args.NAME); return Promise.resolve(); };
            const container = element('div');
            const find = node => (node.textContent === 'Delete' && node.onclick ? node :
                (node.children || []).map(find).find(Boolean) || null);
            return {
                run: async () => {
                    await inst.refreshScriptManagerUI(container);
                    const button = find(container);
                    assert.ok(button, 'the script manager rendered a Delete button');
                    inst.fetchWithTimeout = () => Promise.resolve({ok: false, status: 0});
                    return button.onclick();
                },
                acted: () => deleted.length > 0
            };
        }
    },
    {
        name: 'spikeprime: delete file from hub?',
        id: 'spikeprime',
        question: /^Delete prog\.py from hub\?$/,
        drive (hook) {
            const {ext, inst} = build(this.id, hook);
            const sent = [];
            inst._peripheral = {
                isConnected: () => true,
                sendPythonCommand: code => { sent.push(code); return Promise.resolve(); }
            };
            return {
                run: () => ext.deleteScriptOnHub({NAME: 'prog.py'}),
                acted: () => sent.some(code => code.includes('uos.remove("prog.py")'))
            };
        }
    }
];

test('the adapter offers Scratch.BWConfirm only while runtime.confirmAsync exists, read per question', () => {
    // The shim the bundle sees: capture it from a bundle that registers through it.
    const runtime = new EventEmitter();
    const Ext = require(path.join(INTEGRATED, 'node_modules/scratch-vm/src/extensions/crispstrobe/adapter.js'))(
        'Scratch.extensions.register({getInfo: () => ({id: "probe", blocks: []}), shim: () => Scratch});');
    const shim = new Ext(runtime).shim();
    assert.equal(shim.BWConfirm, undefined, 'no hook, no field: the extension falls back to its own confirm');
    // Installed AFTER the extension loaded, as a host may: the next question sees it.
    assert.equal(installExtensionConfirm({runtime}), true);
    assert.equal(typeof shim.BWConfirm, 'function');
    assert.equal(installExtensionConfirm({runtime}), false, 'idempotent, never overwrites');
});

for (const site of SITES) {
    test(`${site.name} — app, Cancel: nothing happens, asked natively once`, async () => {
        try {
            const world = app();
            const s = site.drive(true);
            const done = Promise.resolve(s.run());
            await tick();
            assert.deepEqual(world.log.map(entry => entry.command), ['plugin:dialog|message'],
                'asked once, through the native box (never the plugin\'s rejecting confirm)');
            assert.equal(world.log[0].args.buttons, 'OkCancel');
            assert.match(world.log[0].args.message, site.question);
            world.answer('Cancel');
            await done;
            assert.equal(s.acted(), false, 'on Cancel in the app, it went ahead');
        } finally {
            restoreGlobals();
        }
    });

    test(`${site.name} — app, OK: acts, and only after the answer`, async () => {
        try {
            const world = app();
            const s = site.drive(true);
            const done = Promise.resolve(s.run());
            await tick();
            assert.equal(s.acted(), false, 'it went ahead before the user answered');
            world.answer('Ok');
            await done;
            assert.equal(s.acted(), true, 'on OK in the app, nothing happened');
        } finally {
            restoreGlobals();
        }
    });

    for (const value of [false, true]) {
        test(`${site.name} — browser, confirm answers ${value}`, async () => {
            try {
                const world = browser(value);
                const s = site.drive(true);
                await s.run();
                assert.equal(world.log.length, 1, 'asked once');
                assert.match(world.log[0].args.message, site.question);
                assert.equal(s.acted(), value);
            } finally {
                restoreGlobals();
            }
        });
    }

    test(`${site.name} — app without the hook: fails closed (never a Promise read as yes)`, async () => {
        try {
            app();
            const s = site.drive(false);
            await s.run();
            assert.equal(s.acted(), false);
        } finally {
            restoreGlobals();
        }
    });
}

test('the GUI installs the hook on the VM before any extension loads (vm-manager-hoc)', async () => {
    const {readFileSync} = await import('node:fs');
    const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/vm-manager-hoc.jsx', import.meta.url), 'utf8');
    assert.match(source, /^import installExtensionConfirm from '\.\/extension-confirm-hook\.js';$/m);
    // In componentDidMount, beside the RCX compiler hook and ahead of the project load.
    const mount = source.slice(source.indexOf('componentDidMount ()'), source.indexOf('if (!this.props.vm.initialized)'));
    assert.match(mount, /^\s+installExtensionConfirm\(this\.props\.vm\);$/m);
});
