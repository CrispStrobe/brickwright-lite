// Task E8 of docs/OPEN-TASKS-2026-09-29.md: in the macOS/iOS app every `prompt()` answered
// null by itself, so nothing that asks for text could be used there.
//
// THE MECHANISM: tauri-plugin-dialog 2.7.1 does not replace `window.prompt` (its init script
// replaces alert and confirm only, task E6), so the app's prompt is the webview's own. wry 0.55.1
// installs one WKUIDelegate on macOS and iOS (src/wkwebview/mod.rs:599-602) and that delegate
// (src/wkwebview/class/wry_web_view_ui_delegate.rs:97-261) implements no
// webView:runJavaScriptTextInputPanelWithPrompt:..., so WKWebView answers every prompt with null
// at once. WebKitGTK and WebView2 show their default dialogs (wry installs no script-dialog
// handler there) and Android's RustWebChromeClient implements onJsPrompt.
//
// THE FIX: lib/native-dialog.js `promptAsync` — an in-app modal (lib/prompt-modal.jsx) whenever
// the app is detected (every platform: one behaviour), the browser's prompt elsewhere — awaited
// at every site. Python `input()` goes through Skulpt's Promise suspension; the JavaScript
// console replays its synchronous program with the answers so far (lib/replay-input.js).
//
// This file holds four things:
//   1. the helper: a string or null, the modal in the app and never `window.prompt` there;
//   2. the modal itself, rendered by React into a DOM (jsdom): focus, Enter/Escape, Tab trap,
//      focus return, EN/DE, phone width, one question at a time;
//   3. every converted call site, driven from its REAL source in a simulated app (window.prompt
//      returns null, as WKWebView's does) with the real modal: the modal is shown, its answer is
//      used, Cancel behaves as before — and the same driver with the site reverted to
//      `prompt(...)`, or with a helper that answers null without showing the modal, goes red;
//   4. a census of every prompt() call in the sources the app ships.
import assert from 'node:assert/strict';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const guiRequire = createRequire(path.join(root, 'packages/scratch-gui/package.json'));
const babel = guiRequire('@babel/core');
const presetReact = guiRequire.resolve('@babel/preset-react');
const toCommonJs = guiRequire.resolve('@babel/plugin-transform-modules-commonjs');

const HELPER = 'overlay/scratch-gui/src/lib/native-dialog.js';
const MODAL = 'overlay/scratch-gui/src/lib/prompt-modal.jsx';
const REPLAY = 'overlay/scratch-gui/src/lib/replay-input.js';
const EXT_LIBRARY = 'overlay/scratch-gui/src/containers/extension-library.jsx';
const IMPORTER = 'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx';
const DEBUG_PANEL = 'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx';
const DRAWER = 'overlay/scratch-gui/src/components/tw-pseudocode/debug-drawer.jsx';
const MONITOR = 'overlay/scratch-gui/src/containers/monitor.jsx';

// ---------------------------------------------------------------------------------------------
// The DOM: one jsdom document for the whole file, installed before react-dom loads (react-dom
// decides at load time whether it can use a DOM).
// ---------------------------------------------------------------------------------------------
const {jsdom} = guiRequire('jsdom');
const document = jsdom('<!doctype html><html><body><button id="opener">open</button></body></html>');
const win = document.defaultView;
win.requestAnimationFrame = callback => setTimeout(callback, 0);
win.cancelAnimationFrame = clearTimeout;
globalThis.window = win;
globalThis.document = document;
globalThis.requestAnimationFrame = win.requestAnimationFrame;
globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
// React's scheduler picks a MessageChannel when it sees a window, and an open MessagePort keeps
// Node's event loop alive after the last test: it is loaded with the setTimeout fallback.
const messageChannel = globalThis.MessageChannel;
globalThis.MessageChannel = undefined;
guiRequire('react-dom');
const {Simulate} = guiRequire('react-dom/test-utils');
globalThis.MessageChannel = messageChannel;
test.after(() => win.close());

const commonJs = (file, source = read(file)) => {
    const {code} = babel.transformSync(source, {
        filename: file, babelrc: false, configFile: false,
        presets: [[presetReact, {runtime: 'classic'}]], plugins: [toCommonJs]
    });
    const module = {exports: {}};
    // eslint-disable-next-line no-new-func
    new Function('module', 'exports', 'require', code)(module, module.exports, guiRequire);
    return module.exports;
};
const modal = commonJs(MODAL);
const replay = commonJs(REPLAY);

// The helper is loaded as the module it is; its lazy import of the modal is pointed at the modal
// compiled above (the one rewrite of the subject this file makes, asserted to apply).
const LAZY_IMPORT = "import(/* webpackChunkName: \"prompt-modal\" */ './prompt-modal.jsx')";
const loadHelper = async (source = read(HELPER)) => {
    assert.ok(source.includes(LAZY_IMPORT), 'the helper no longer loads ./prompt-modal.jsx lazily');
    const wired = source.replace(LAZY_IMPORT, 'Promise.resolve(globalThis.__E8_PROMPT_MODAL__)');
    return import(`data:text/javascript;charset=utf-8,${encodeURIComponent(wired)}`);
};
globalThis.__E8_PROMPT_MODAL__ = modal;

// ---------------------------------------------------------------------------------------------
// The simulated app (window.prompt is WKWebView's: null at once) and the browser.
// ---------------------------------------------------------------------------------------------
let nativePrompts = [];
const setGlobal = (key, value) => {
    win[key] = value;
    Object.defineProperty(globalThis, key, {value, configurable: true, writable: true});
};
const installApp = (confirmAnswer = 'Ok') => {
    nativePrompts = [];
    const calls = [];
    setGlobal('__TAURI__', {core: {invoke: (command, args) => {
        calls.push({command, args});
        if (command === 'plugin:dialog|message') return Promise.resolve(confirmAnswer);
        return Promise.reject(new Error(`command ${command} not found`));
    }}});
    setGlobal('prompt', (...args) => { nativePrompts.push(args); return null; });
    return calls;
};
const installBrowser = answer => {
    nativePrompts = [];
    delete win.__TAURI__;
    delete globalThis.__TAURI__;
    setGlobal('prompt', (...args) => { nativePrompts.push(args); return answer; });
    setGlobal('confirm', () => true);
};
const uninstall = () => {
    for (const key of ['__TAURI__', 'prompt', 'confirm']) { delete win[key]; delete globalThis[key]; }
};

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const openModal = () => document.querySelector('[data-bw-prompt-modal]');
const waitForModal = async (until, ms = 2000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const node = openModal();
        if (node) return node;
        if (until && until.settled) return null;
        await tick();
    }
    return null;
};
const answerModal = (dialog, answer) => {
    const input = dialog.querySelector('[data-bw-prompt-input]');
    if (answer === null) {
        Simulate.keyDown(input, {key: 'Escape'});
        return;
    }
    input.value = answer;
    Simulate.change(input);
    Simulate.click(dialog.querySelector('[data-bw-prompt-ok]'));
};
// Start `run()`, answer every modal it opens from `answers` (in order), and report what was
// asked. A run that opens no modal is reported as asking nothing.
const driveWith = async (run, answers) => {
    const state = {settled: false};
    const asked = [];
    const done = Promise.resolve().then(run).then(
        value => { state.settled = true; return {value}; },
        error => { state.settled = true; return {error}; });
    for (const answer of answers) {
        const dialog = await waitForModal(state);
        if (!dialog) break;
        asked.push({message: dialog.querySelector('p').textContent,
            value: dialog.querySelector('[data-bw-prompt-input]').value});
        answerModal(dialog, answer);
        await tick();
    }
    const outcome = await done;
    assert.equal(openModal(), null, 'a dialog was left open');
    return {...outcome, asked};
};

// ---------------------------------------------------------------------------------------------
// Real-source extraction (as in test/native-confirm.test.mjs).
// ---------------------------------------------------------------------------------------------
const parse = (source, filename) => babel.parseSync(source, {
    filename, babelrc: false, configFile: false, sourceType: 'module',
    parserOpts: {plugins: ['jsx'], errorRecovery: true}
});
const find = (file, predicate, label, source = read(file)) => {
    const found = [];
    babel.traverse(parse(source, file), {
        enter (nodePath) { if (predicate(nodePath.node, nodePath)) found.push(nodePath.node); }
    });
    assert.equal(found.length, 1, `${file}: expected exactly one ${label}, found ${found.length}`);
    return source.slice(found[0].start, found[0].end);
};
const methodSource = (file, name, source) => find(file,
    node => node.type === 'ClassMethod' && node.key.name === name, `method ${name}`, source);
// The arrow passed as onClick to the JSX element whose handler mentions `marker`.
const onClickSource = (file, marker, source) => find(file, node => node.type === 'JSXAttribute' &&
    node.name.name === 'onClick' && node.value && node.value.expression &&
    node.value.expression.type === 'ArrowFunctionExpression' &&
    (source || read(file)).slice(node.value.expression.start, node.value.expression.end).includes(marker),
`onClick mentioning ${marker}`, source).replace(/^onClick=\{/, '').replace(/\}$/, '');
const evaluate = (expression, scope) => {
    const js = babel.transformSync(`(${expression});`, {
        babelrc: false, configFile: false, presets: [[presetReact, {runtime: 'classic'}]]
    }).code.trim().replace(/;$/, '');
    // eslint-disable-next-line no-new-func
    return new Function('__scope', `with (__scope) { return ${js}; }`)(scope);
};
const asMethod = (text, scope) => {
    const name = text.replace(/^async\s+/, '').match(/^([A-Za-z_$][\w$]*)/)[1];
    return evaluate(`{${text}}`, scope)[name];
};
// An inline arrow, with `this` bound to `self` (arrows take `this` from where they are written).
const asArrow = (text, scope, self) => evaluate(`function () { return (${text}); }`, scope).call(self);

// ---------------------------------------------------------------------------------------------
// The call sites. `drive(helper, src, answers)` runs the site's real code, answering each dialog
// it opens from `answers`, and returns {asked, result}: `result` is what the site did with the
// answer. `expect(answers)` is the result the site must produce from those answers.
// `reverts`: rewrites that put a site back to the value of prompt() (mutations below).
// ---------------------------------------------------------------------------------------------
const hex8 = v => (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
const hex16 = v => (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
const SITES = [
    {
        name: 'Extension from URL tile (extension-library handleItemSelect)',
        file: EXT_LIBRARY,
        reverts: [s => s.replace("url = await promptAsync(this.msg(messages.extensionUrl), '');",
            'url = prompt(this.msg(messages.extensionUrl));')],
        answers: {ok: ['  https://example.invalid/ext.js '], cancel: [null]},
        expect: {ok: 'https://example.invalid/ext.js', cancel: null},
        async drive (helper, src, answers) {
            let loaded = null;
            const self = {
                props: {vm: {extensionManager: {
                    isTrustedExtensionURL: () => false, pinStatusFor: () => 'foreign',
                    isExtensionLoaded: () => false,
                    loadExtensionURL (url) { loaded = url; return Promise.resolve(); }
                }}, onCategorySelected () {}, onRequestClose () {}},
                msg: message => (message === 'URL' ? 'Enter the URL of the extension' : 'Run code from this address?')
            };
            const select = asMethod(methodSource(this.file, 'handleItemSelect', src), {
                promptAsync: helper.promptAsync, confirmAsync: helper.confirmAsync,
                getLegacySpikeVisible: () => true,
                messages: {extensionUrl: 'URL', unpinned: {}, untrusted: {}, loadFailed: {}}
            });
            const {asked} = await driveWith(() => select.call(self, {custom: true}), answers);
            return {asked, result: loaded};
        }
    },
    {
        name: 'MakeCode share link (pseudocode-importer openMakeCodeShare)',
        file: IMPORTER,
        reverts: [s => s.replace("const url = await promptAsync(this.L.mcSharePrompt, '');",
            "const url = window.prompt(this.L.mcSharePrompt, '');")],
        answers: {ok: [' https://makecode.com/_abc '], cancel: [null]},
        expect: {ok: 'https://makecode.com/_abc', cancel: null},
        async drive (helper, src, answers) {
            let fetched = null;
            // The network import is stopped where the method reaches it; what it would fetch
            // is the URL handed to mcFailed.
            const method = methodSource(this.file, 'openMakeCodeShare', src);
            const stopped = method.replace(
                "await import(\n                /* webpackChunkName: \"bw-makecode\" */ '../../lib/bw-makecode/index.js')",
                'await __stopImport()');
            assert.notEqual(stopped, method, 'the MakeCode import could not be stopped');
            const self = {
                props: {vm: {runtime: {getTargetForStage: () => 'owned-stage'}}},
                L: {mcSharePrompt: 'Paste a MakeCode share link', mcShareLoading: 'loading',
                    mcFailed: url => { fetched = url; return 'failed'; }},
                setState () {}
            };
            const open = asMethod(stopped, {
                promptAsync: helper.promptAsync, __stopImport: () => Promise.reject(new Error('offline'))
            });
            const {asked} = await driveWith(() => open.call(self), answers);
            return {asked, result: fetched};
        }
    },
    ...[['Debugger bookmark label (debug-panel onAddBookmark)', 'onAddBookmark', 'addDebugBookmark', 'label',
        "const label = await promptAsync('Bookmark label');", "const label = window.prompt('Bookmark label');"],
    ['Debugger annotation (debug-panel onAddAnnotation)', 'onAddAnnotation', 'addDebugAnnotation', 'annotation',
        "const annotation = await promptAsync('Annotation');", "const annotation = window.prompt('Annotation');"]
    ].map(([name, method, runnerCall, field, fixed, original]) => ({
        name,
        file: DEBUG_PANEL,
        reverts: [s => s.replace(fixed, original)],
        answers: {ok: ['loop start'], cancel: [null]},
        expect: {ok: 'loop start', cancel: null},
        async drive (helper, src, answers) {
            let added = null;
            const self = {
                selectedHistoryCursor: () => ({branchId: 'b', eventCursor: 3}),
                state: {runner: {[runnerCall]: request => {
                    assert.deepEqual(request.cursor, {branchId: 'b', eventCursor: 3});
                    added = request[field];
                    return {ok: true};
                }}},
                setState () {}
            };
            const run = asMethod(methodSource(this.file, method, src), {promptAsync: helper.promptAsync});
            const {asked} = await driveWith(() => run.call(self), answers);
            return {asked, result: added};
        }
    })),
    {
        name: 'Debugger hex address: Set PC (debug-drawer askAddress via the Set PC button)',
        file: DRAWER,
        reverts: [s => s.replace('const raw = await promptAsync(`${label} (hex)`, initial);',
            'const raw = window.prompt(`${label} (hex)`, initial);')],
        answers: {ok: ['0x1f2'], cancel: [null]},
        expect: {ok: 0x1F2, cancel: null},
        async drive (helper, src, answers) {
            let pc = null;
            const scope = {promptAsync: helper.promptAsync};
            const self = {
                tx: key => ({setPc: 'Set PC'})[key] || key,
                currentPc: () => 0x30,
                askAddress: asMethod(methodSource(this.file, 'askAddress', src), scope)
            };
            const runner = {setPc (address) { pc = address; }};
            const click = asArrow(onClickSource(this.file, "this.askAddress(this.tx('setPc'), this.currentPc())", src),
                {runner}, self);
            const {asked} = await driveWith(() => click(), answers);
            if (asked.length) assert.deepEqual(asked[0], {message: 'Set PC (hex)', value: '0030'});
            return {asked, result: pc};
        }
    },
    {
        name: 'Debugger register edit (debug-drawer editRegister)',
        file: DRAWER,
        reverts: [s => s.replace('const raw = await promptAsync(`${name}`, where.wide ? hex16(value) : hex8(value));',
            'const raw = window.prompt(`${name}`, where.wide ? hex16(value) : hex8(value));')],
        answers: {ok: ['7f'], cancel: [null]},
        expect: {ok: [['sfr', 0xE0, 0x7F]], cancel: []},
        async drive (helper, src, answers) {
            const writes = [];
            const self = {props: {runner: {writeMem: (...args) => writes.push(args)}}, forceUpdate () {}};
            const edit = asMethod(methodSource(this.file, 'editRegister', src),
                {promptAsync: helper.promptAsync, hex8, hex16});
            const {asked} = await driveWith(() => edit.call(self, 'A', 0x12, {space: 'sfr', addr: 0xE0}), answers);
            if (asked.length) assert.deepEqual(asked[0], {message: 'A', value: '12'});
            return {asked, result: writes};
        }
    },
    {
        name: 'Debugger memory byte edit (debug-drawer hex view cell)',
        file: DRAWER,
        reverts: [s => s.replace('const raw = await promptAsync(\n',
            'const raw = window.prompt(\n')],
        answers: {ok: ['A5'], cancel: [null]},
        expect: {ok: [['xram', 0x0102, 0xA5]], cancel: []},
        async drive (helper, src, answers) {
            const writes = [];
            const runner = {writeMem: (...args) => writes.push(args)};
            const click = asArrow(onClickSource(this.file, 'spec.label} ${hex16(row.addr + i)}', src), {
                promptAsync: helper.promptAsync, hex8, hex16, runner,
                spec: {id: 'xram', label: 'XRAM'}, row: {addr: 0x0100}, i: 2, b: 0x33
            }, {forceUpdate () {}});
            const {asked} = await driveWith(() => click(), answers);
            if (asked.length) assert.deepEqual(asked[0], {message: 'XRAM 0102', value: '33'});
            return {asked, result: writes};
        }
    },
    {
        name: 'List import column (monitor handleImport)',
        file: MONITOR,
        reverts: [s => s.replace('columnNumber = parseInt(await promptAsync(msg), 10);',
            'columnNumber = parseInt(prompt(msg), 10);')],
        answers: {ok: ['2'], cancel: [null]},
        // Cancel: parseInt(null) is NaN and the list is set from no column, as upstream does.
        expect: {ok: ['b', 'd'], cancel: []},
        async drive (helper, src, answers) {
            let value = null;
            let imported;
            const self = {props: {intl: {formatMessage: (m, v) => `Column (1-${v.numberOfColumns})?`},
                vm: {}, targetId: 't', id: 'list'}};
            const handle = asMethod(methodSource(this.file, 'handleImport', src), {
                promptAsync: helper.promptAsync, messages: {columnPrompt: {}},
                importCSV: () => (imported = Promise.resolve([['a', 'b'], ['c', 'd']])),
                setVariableValue: (vm, target, id, list) => { value = list; }
            });
            const {asked} = await driveWith(async () => {
                handle.call(self);
                await imported;
                for (let i = 0; i < 50 && value === null; i++) await tick();
            }, answers);
            if (asked.length) assert.equal(asked[0].message, 'Column (1-2)?');
            return {asked, result: value};
        }
    },
    {
        name: 'JavaScript console prompt() (pseudocode-importer runJsMain)',
        file: IMPORTER,
        // The replayed run, start to end markers, back to one direct run with window.prompt.
        reverts: [s => {
            const from = s.indexOf('const start = buf.length;');
            const endMarker = "}, async q => (await promptAsync(q)) || '');";
            const to = s.indexOf(endMarker, from);
            if (from < 0 || to < 0) return s;
            return s.slice(0, from) +
                "fn({log, error: log, warn: log, info: log}, (q) => window.prompt(q) || '', board, Math);" +
                s.slice(to + endMarker.length);
        }],
        answers: {ok: ['Ada', '36'], cancel: [null, null]},
        expect: {ok: 'hi Ada\nage 36\n', cancel: 'hi \nage \n'},
        async drive (helper, src, answers) {
            const buf = [];
            const self = {state: {driverMode: 'none'}, props: {}};
            const run = asMethod(methodSource(this.file, 'runJsMain', src), {
                promptAsync: helper.promptAsync, ...replay
            });
            const program = 'const name = prompt("Name?"); console.log("hi " + name);\n' +
                'const age = prompt("Age?"); console.log("age " + age);';
            const {asked, error} = await driveWith(() => run.call(self, program, buf), answers);
            if (error) throw error;
            return {asked, result: buf.join('')};
        }
    },
    {
        name: 'Python console input() (pseudocode-importer runPyMain, Skulpt)',
        file: IMPORTER,
        reverts: [s => s.replace("inputfun: async (p) => (await promptAsync(p)) || '',",
            "inputfun: (p) => window.prompt(p) || '',")],
        answers: {ok: ['Ada', '36'], cancel: [null, null]},
        expect: {ok: 'hi Ada\nage 36\n', cancel: 'hi \nage \n'},
        async drive (helper, src, answers) {
            const buf = [];
            const self = {loadSkulpt: async () => loadSkulpt()};
            const run = asMethod(methodSource(this.file, 'runPyMain', src), {promptAsync: helper.promptAsync});
            const program = 'name = input("Name?")\nprint("hi " + name)\nage = input("Age?")\nprint("age " + age)\n';
            const {asked, error} = await driveWith(() => run.call(self, program, buf), answers);
            if (error) throw error;
            return {asked, result: buf.join('')};
        }
    }
];

let skulpt = null;
const loadSkulpt = () => {
    if (!skulpt) {
        // The same two files the app injects (pseudocode-importer skulptSource), as globals.
        (0, eval)(readFileSync(guiRequire.resolve('skulpt/dist/skulpt.min.js'), 'utf8'));
        (0, eval)(readFileSync(guiRequire.resolve('skulpt/dist/skulpt-stdlib.js'), 'utf8'));
        skulpt = globalThis.Sk;
    }
    return skulpt;
};

const sourceFor = (site, revert = null) => {
    const source = read(site.file);
    if (revert === null) return source;
    const reverted = site.reverts[revert](source);
    assert.notEqual(reverted, source, `${site.name}: the revert mutation did not apply`);
    return reverted;
};

// The claim for one site, in the app (prompt is null natively) and in a browser:
//   - the app asks through the modal, never window.prompt, with the site's question, and the
//     site uses the answer typed there; Cancel (Escape) does what a null answer always did;
//   - the browser asks through window.prompt, shows no modal, and uses its answer.
const holds = async (site, helper, source) => {
    const said = value => JSON.stringify(value);
    try {
        for (const mode of ['ok', 'cancel']) {
            installApp('Ok');
            const app = await site.drive(helper, source, site.answers[mode]);
            assert.equal(app.asked.length, site.answers[mode].length,
                `${site.name}: in the app (${mode}), the dialog was shown ${app.asked.length} time(s), ` +
                `expected ${site.answers[mode].length}; window.prompt was called ${nativePrompts.length} time(s)`);
            assert.equal(nativePrompts.length, 0, `${site.name}: in the app, window.prompt was called`);
            assert.deepEqual(app.result, site.expect[mode],
                `${site.name}: in the app (${mode}), the site did ${said(app.result)}, expected ${said(site.expect[mode])}`);
        }
        for (const mode of ['ok', 'cancel']) {
            const answers = site.answers[mode];
            let index = 0;
            installBrowser(null);
            setGlobal('prompt', (...args) => { nativePrompts.push(args); return answers[index++]; });
            const browser = await site.drive(helper, source, []);
            assert.equal(browser.asked.length, 0, `${site.name}: in a browser, the in-app dialog was shown`);
            assert.equal(nativePrompts.length, answers.length,
                `${site.name}: in a browser (${mode}), window.prompt was called ${nativePrompts.length} time(s)`);
            assert.deepEqual(browser.result, site.expect[mode],
                `${site.name}: in a browser (${mode}), the site did ${said(browser.result)}, expected ${said(site.expect[mode])}`);
        }
    } finally {
        uninstall();
    }
};
const redFor = async (promise, label, reasons) => {
    await assert.rejects(promise, error => {
        assert.ok(error instanceof assert.AssertionError, `${label}: crashed instead of failing the claim: ${error.stack}`);
        reasons.push(`${label} -> ${error.message.split('\n')[0]}`);
        return true;
    }, `${label}: did not turn the driver red`);
};

// ---------------------------------------------------------------------------------------------
// 1. The helper.
// ---------------------------------------------------------------------------------------------
test('promptAsync: the modal in the app (never window.prompt), the browser prompt elsewhere', async () => {
    const {promptAsync, usesPromptModal} = await loadHelper();
    try {
        installApp();
        assert.equal(usesPromptModal(), true);
        let outcome = await driveWith(() => promptAsync('Name?', 'Ada'), ['Grace']);
        assert.deepEqual(outcome.asked, [{message: 'Name?', value: 'Ada'}]);
        assert.equal(outcome.value, 'Grace');
        outcome = await driveWith(() => promptAsync('Name?'), ['']);
        assert.equal(outcome.value, '', 'OK on an empty field is the empty string, not a Cancel');
        outcome = await driveWith(() => promptAsync('Name?', 'x'), [null]);
        assert.equal(outcome.value, null, 'Escape is a Cancel');
        outcome = await driveWith(() => promptAsync(undefined, null), ['ok']);
        assert.deepEqual(outcome.asked, [{message: '', value: ''}]);
        assert.equal(nativePrompts.length, 0, 'the app never calls window.prompt');

        // The modal cannot load: reported, and a Cancel.
        const errors = [];
        const consoleError = console.error;
        console.error = (...args) => errors.push(args);
        globalThis.__E8_PROMPT_MODAL__ = {showPromptModal: () => Promise.reject(new Error('chunk failed'))};
        try {
            assert.equal(await promptAsync('Name?'), null);
        } finally {
            globalThis.__E8_PROMPT_MODAL__ = modal;
            console.error = consoleError;
        }
        assert.equal(errors.length, 1, 'a failed dialog is reported');

        installBrowser('Ada');
        assert.equal(usesPromptModal(), false);
        assert.equal(await promptAsync('Name?', 'x'), 'Ada');
        assert.deepEqual(nativePrompts, [['Name?', 'x']]);
        assert.equal(openModal(), null);
        installBrowser(null);
        assert.equal(await promptAsync('Name?'), null);
        installBrowser('');
        assert.equal(await promptAsync('Name?'), '');
        for (const odd of [undefined, 42, {}]) {
            installBrowser(odd);
            assert.equal(await promptAsync('Name?'), null, `the answer ${JSON.stringify(odd)} is a Cancel`);
        }
        setGlobal('prompt', async () => 'from a Promise');
        assert.equal(await promptAsync('Name?'), 'from a Promise', 'a replaced prompt returning a Promise is awaited');
        setGlobal('prompt', () => { throw new Error('blocked'); });
        assert.equal(await promptAsync('Name?'), null);
        delete win.prompt;
        delete globalThis.prompt;
        assert.equal(await promptAsync('Name?'), null, 'no prompt at all: a Cancel');
    } finally {
        uninstall();
    }
});

test('the precondition: in the simulated app window.prompt answers null, as WKWebView does', async () => {
    // What every site driver relies on, and the defect: a site reading prompt() gets null.
    try {
        installApp();
        assert.equal(window.prompt('Name?'), null);
        assert.equal(globalThis.prompt('Name?'), null);
    } finally {
        uninstall();
    }
    // ...and the delegate wry 0.55.1 installs really lacks the text-input panel, when the crate
    // is on this machine (it is read, not assumed; CI's tauri job builds against the same lock).
    const lock = read('apps/tauri/src-tauri/Cargo.lock');
    assert.match(lock, /name = "wry"\nversion = "0\.55\.1"/);
    assert.match(lock, /name = "tauri-plugin-dialog"\nversion = "2\.7\.1"/);
    const home = process.env.CARGO_HOME || path.join(process.env.HOME || '', '.cargo');
    const registry = path.join(home, 'registry/src');
    const crate = existsSync(registry) && readdirSync(registry)
        .map(index => path.join(registry, index, 'wry-0.55.1')).find(existsSync);
    if (!crate) return;
    const delegate = readFileSync(path.join(crate, 'src/wkwebview/class/wry_web_view_ui_delegate.rs'), 'utf8');
    assert.match(delegate, /unsafe impl WKUIDelegate for WryWebViewUIDelegate/);
    assert.doesNotMatch(delegate, /runJavaScriptTextInputPanel/);
    const plugin = path.join(path.dirname(crate), 'tauri-plugin-dialog-2.7.1/src/init-iife.js');
    if (existsSync(plugin)) assert.doesNotMatch(readFileSync(plugin, 'utf8'), /window\.prompt/);
});

// ---------------------------------------------------------------------------------------------
// 2. The modal.
// ---------------------------------------------------------------------------------------------
test('the modal: labelled dialog, focus and selection, Enter = OK, Escape = Cancel, focus returns', async () => {
    const opener = document.getElementById('opener');
    opener.focus();
    const asked = modal.showPromptModal({message: 'Bookmark label', defaultValue: 'loop', locale: 'en'});
    const dialog = await waitForModal();
    assert.ok(dialog, 'no dialog');
    assert.equal(dialog.getAttribute('role'), 'dialog');
    assert.equal(dialog.getAttribute('aria-modal'), 'true');
    const message = dialog.querySelector('p');
    assert.equal(dialog.getAttribute('aria-labelledby'), message.id);
    assert.equal(message.textContent, 'Bookmark label');
    const input = dialog.querySelector('[data-bw-prompt-input]');
    assert.equal(input.getAttribute('aria-labelledby'), message.id);
    assert.equal(document.activeElement, input, 'the field has focus');
    assert.deepEqual([input.value, input.selectionStart, input.selectionEnd], ['loop', 0, 4], 'the default is selected');
    const buttons = [...dialog.querySelectorAll('button')].map(button => button.textContent);
    assert.deepEqual(buttons, ['Cancel', 'OK']);
    input.value = 'loop start';
    Simulate.change(input);
    Simulate.keyDown(input, {key: 'Enter'});
    assert.equal(await asked, 'loop start');
    assert.equal(openModal(), null, 'the dialog is gone');
    assert.equal(document.querySelector('[data-bw-prompt-host]'), null, 'its host node is removed');
    assert.equal(document.activeElement, opener, 'focus returns to where it was');

    const cancelled = modal.showPromptModal({message: 'Annotation', locale: 'en'});
    const second = await waitForModal();
    // A real keydown event through the DOM, not only React's simulation.
    second.querySelector('[data-bw-prompt-input]')
        .dispatchEvent(new win.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    assert.equal(await cancelled, null);

    const clicked = modal.showPromptModal({message: 'x', defaultValue: 'kept', locale: 'en'});
    Simulate.click((await waitForModal()).querySelector('[data-bw-prompt-cancel]'));
    assert.equal(await clicked, null, 'the Cancel button is a Cancel');
    const okd = modal.showPromptModal({message: 'x', defaultValue: 'kept', locale: 'en'});
    Simulate.click((await waitForModal()).querySelector('[data-bw-prompt-ok]'));
    assert.equal(await okd, 'kept', 'OK without typing answers the default');
});

test('the modal: Tab and Shift+Tab stay inside, outside focus comes back, keys stay out of the project', async () => {
    const asked = modal.showPromptModal({message: 'q', locale: 'en'});
    const dialog = await waitForModal();
    const [input, cancel, ok] = [...dialog.querySelectorAll('input, button')];
    ok.focus();
    let event = {key: 'Tab', defaultPrevented: false};
    Simulate.keyDown(ok, {key: 'Tab', preventDefault () { event.defaultPrevented = true; }});
    assert.equal(document.activeElement, input, 'Tab on the last control wraps to the field');
    assert.ok(event.defaultPrevented);
    Simulate.keyDown(input, {key: 'Tab', shiftKey: true});
    assert.equal(document.activeElement, ok, 'Shift+Tab on the field wraps to OK');
    cancel.focus();
    event = {defaultPrevented: false};
    Simulate.keyDown(cancel, {key: 'Tab', preventDefault () { event.defaultPrevented = true; }});
    assert.equal(event.defaultPrevented, false, 'Tab between inner controls is the browser\'s');
    // Something underneath grabs focus: it is handed back to the field.
    document.getElementById('opener').focus();
    await tick();
    await tick();
    assert.equal(document.activeElement, input, 'focus taken outside the dialog comes back');
    Simulate.keyDown(input, {key: 'Escape'});
    assert.equal(await asked, null);
    // Keys typed in the field are aimed at an input, which Scratch's own key handler
    // (vm-listener-hoc handleKeyDown) ignores, so they never reach "when key pressed".
    const hoc = read('packages/scratch-gui/src/lib/vm-listener-hoc.jsx');
    assert.match(hoc, /handleKeyDown \(e\) \{\s*\/\/[^\n]*\n\s*if \(e\.target !== document && e\.target !== document\.body\) return;/);
});

test('the modal: German strings, phone width, one question at a time', async () => {
    const asked = modal.showPromptModal({message: 'URL der Erweiterung eingeben', locale: 'de'});
    const dialog = await waitForModal();
    assert.deepEqual([...dialog.querySelectorAll('button')].map(b => b.textContent), ['Abbrechen', 'OK']);
    // Phone width: never wider than the window less 16px a side; 16px text (no iOS zoom on
    // focus); 44px touch targets.
    assert.equal(dialog.style.maxWidth, 'calc(100vw - 32px)');
    assert.equal(dialog.style.boxSizing, 'border-box');
    assert.equal(dialog.querySelector('input').style.fontSize, '16px');
    for (const button of dialog.querySelectorAll('button')) assert.equal(button.style.minHeight, '44px');
    // A second question waits for the first answer.
    const next = modal.showPromptModal({message: 'second', locale: 'de'});
    await tick();
    assert.equal(document.querySelectorAll('[data-bw-prompt-modal]').length, 1, 'two dialogs at once');
    Simulate.keyDown(dialog.querySelector('input'), {key: 'Escape'});
    assert.equal(await asked, null);
    const second = await waitForModal();
    assert.equal(second.querySelector('p').textContent, 'second');
    Simulate.keyDown(second.querySelector('input'), {key: 'Enter'});
    assert.equal(await next, '');
    // The locale follows the editor's store, else the browser.
    win.__brickwrightStore = {getState: () => ({locales: {locale: 'de'}})};
    try {
        assert.equal(modal.promptLocale(), 'de');
        win.__brickwrightStore = {getState: () => ({locales: {locale: 'fr'}})};
        assert.equal(modal.promptLocale(), 'en', 'an untranslated locale falls back to English');
    } finally {
        delete win.__brickwrightStore;
    }
});

test('replayed input: each run gets the answers so far, random is replayed, a swallowed question is still asked', async () => {
    const runs = [];
    const draws = [];
    const result = await replay.runWithReplayedInput(({prompt, random, run}) => {
        const first = random();
        draws.push(first);
        let caught = '';
        try { caught = prompt('a?'); } catch (error) { caught = 'swallowed'; } // a catch-all program
        runs.push([run, caught, prompt('b?')]);
    }, async question => `<${question}>`);
    assert.deepEqual(result, {runs: 3, answers: ['<a?>', '<b?>']});
    // Run 0 stopped at a? (its catch-all swallowed the stop, b? stopped it again), run 1 at b?.
    assert.deepEqual(runs, [[2, '<a?>', '<b?>']]);
    assert.equal(new Set(draws).size, 1, 'every run drew the same random number');
    await assert.rejects(replay.runWithReplayedInput(() => { throw new Error('bug'); }, async () => ''), /bug/);
    await assert.rejects(replay.runWithReplayedInput(({prompt}) => { for (;;) prompt('again?'); },
        async () => 'x', {maxQuestions: 3}), /more than 3 questions/);
    const math = replay.mathWithRandom(() => 0.5);
    assert.equal(math.random(), 0.5);
    assert.equal(math.floor(2.7), 2);
    assert.equal(math.PI, Math.PI);
});

// ---------------------------------------------------------------------------------------------
// 3. The call sites.
// ---------------------------------------------------------------------------------------------
for (const site of SITES) {
    test(`asks through the modal in the app and uses its answer: ${site.name}`, async () => {
        await holds(site, await loadHelper(), sourceFor(site));
    });
}

test('each site driver turns red when its site is reverted to prompt(...)', async t => {
    const helper = await loadHelper();
    const reasons = [];
    for (const site of SITES) {
        for (let index = 0; index < site.reverts.length; index++) {
            await redFor(holds(site, helper, sourceFor(site, index)), `${site.name} revert #${index}`, reasons);
        }
    }
    assert.equal(reasons.filter(reason => /in the app \(ok\), the dialog was shown 0 time/.test(reason)).length,
        SITES.length, reasons.join('\n'));
    for (const reason of reasons) t.diagnostic(reason);
});

test('a helper that answers null without showing the modal turns every driver red', async t => {
    const source = read(HELPER);
    const silent = source.replace('const show = await loadPromptModal();', 'return null;');
    assert.notEqual(silent, source, 'the helper mutation did not apply');
    const helper = await loadHelper(silent);
    const reasons = [];
    for (const site of SITES) await redFor(holds(site, helper, sourceFor(site)), `${site.name} (silent helper)`, reasons);
    for (const reason of reasons) t.diagnostic(reason);
});

test('every promptAsync / askAddress / editRegister answer is awaited or returned', () => {
    const offenders = [];
    let seen = 0;
    const names = ['promptAsync', 'askAddress', 'editRegister'];
    for (const file of shippedFiles()) {
        const source = read(file);
        if (!/\b(?:promptAsync|askAddress|editRegister)\s*\(/.test(source)) continue;
        babel.traverse(parse(source, file.replace(/\.js$/, '.jsx')), {
            CallExpression (nodePath) {
                const callee = nodePath.node.callee;
                const name = callee.type === 'Identifier' ? callee.name :
                    callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null;
                if (!names.includes(name)) return;
                seen++;
                const parent = nodePath.parentPath;
                const awaited = parent.isAwaitExpression() || parent.isReturnStatement() ||
                    (parent.isArrowFunctionExpression() && parent.node.body === nodePath.node) ||
                    (parent.isMemberExpression() && parent.node.property.name === 'then');
                if (!awaited) offenders.push(`${file}:${nodePath.node.loc.start.line} ${name}(...) is not awaited`);
            }
        });
    }
    assert.ok(seen >= 16, `only ${seen} awaited-question calls found`);
    assert.deepEqual(offenders, []);
});

test('scratch-blocks asks through the GUI\'s own Prompt modal (blocks.jsx sets ScratchBlocks.prompt twice)', () => {
    const file = 'overlay/scratch-gui/src/containers/blocks.jsx';
    const source = read(file);
    const installs = [];
    babel.traverse(parse(source, file), {
        AssignmentExpression (nodePath) {
            const {left, right} = nodePath.node;
            if (left.type === 'MemberExpression' && left.property.name === 'prompt' &&
                source.slice(left.object.start, left.object.end) === 'this.ScratchBlocks') {
                const method = nodePath.findParent(p => p.isClassMethod());
                installs.push(`${method && method.node.key.name}:${source.slice(right.start, right.end)}`);
            }
        }
    });
    assert.deepEqual(installs.sort(), ['componentDidMount:this.handlePromptStart', 'constructor:this.handlePromptStart']);
    // Blockly.prompt's default is `callback(window.prompt(message, defaultValue))`; both
    // compiled builds define it once and otherwise call it in callback form.
    for (const build of ['blockly_compressed_vertical.js', 'blockly_compressed_horizontal.js']) {
        const compiled = readFileSync(guiRequire.resolve(`scratch-blocks/${build}`), 'utf8');
        const uses = [...compiled.matchAll(/Blockly\.prompt\b(.{0,60})/g)].map(match => match[1]);
        assert.equal(uses.filter(rest => /^=function\(a,b,c,d,e\)\{c\(window\.prompt\(a,b\)\)\}/.test(rest)).length, 1,
            `${build}: the one definition is the default blocks.jsx replaces`);
        assert.equal(uses.filter(rest => rest.startsWith('(')).length, 2, `${build}: two callback-form calls`);
    }
});

// ---------------------------------------------------------------------------------------------
// 4. The census: every prompt() CALL in the sources the app ships (the trees and dependency
// closure of test/native-confirm.test.mjs, and the decoded CrispStrobe extension bundles).
// ---------------------------------------------------------------------------------------------
const GUI_MODULES = 'packages/scratch-gui/node_modules';
const LITE_TREES = [
    ['overlay/scratch-gui/src', 'packages/scratch-gui/src'],
    ['overlay/scratch-vm/src', `${GUI_MODULES}/scratch-vm/src`],
    ['overlay/scratch-paint/src', `${GUI_MODULES}/scratch-paint/src`]
];
const SOURCE_FILE = /\.(?:js|jsx|mjs|cjs)$/;
const NOT_SHIPPED_DIR = /\/(?:test|tests|__tests__|spec|specs|docs?|examples?|demo|playground|benchmarks?|node_modules)\//;
const walk = (dir, filter = () => true) => {
    const abs = path.join(root, dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs, {recursive: true})
        .map(file => path.join(dir, String(file)).split(path.sep).join('/'))
        .filter(file => SOURCE_FILE.test(file) && filter(file) && statSync(path.join(root, file)).isFile());
};
let shippedMemo = null;
function shippedFiles () {
    if (shippedMemo) return shippedMemo;
    const files = new Map();
    LITE_TREES.forEach(([overlay, base], tree) => {
        for (const file of walk(base)) files.set(`${tree}${file.slice(base.length)}`, file);
        for (const file of walk(overlay)) files.set(`${tree}${file.slice(overlay.length)}`, file);
    });
    shippedMemo = [...files.values()].sort();
    return shippedMemo;
}
const dependencyPackages = () => {
    const manifest = file => JSON.parse(readFileSync(path.join(root, file), 'utf8'));
    const seen = new Set(['scratch-vm', 'scratch-paint', 'cat-blocks']);
    const queue = Object.keys(manifest('packages/scratch-gui/package.json').dependencies || {});
    const found = [];
    while (queue.length) {
        const name = queue.pop();
        if (seen.has(name)) continue;
        seen.add(name);
        const pkg = `${GUI_MODULES}/${name}/package.json`;
        if (!existsSync(path.join(root, pkg))) continue;
        found.push(name);
        queue.push(...Object.keys(manifest(pkg).dependencies || {}));
    }
    return found.sort();
};
const dependencyFiles = () => dependencyPackages().flatMap(name => walk(`${GUI_MODULES}/${name}`,
    file => !NOT_SHIPPED_DIR.test(file.slice(`${GUI_MODULES}/${name}`.length))));
const QUICK_PROMPT = /\bprompt\s*\(/;
const extensionSource = source => {
    const match = source.match(/^const makeExt = require\('\.\.\/adapter'\);\nmodule\.exports = makeExt\(("(?:[^"\\]|\\.)*")\);\s*$/s);
    return match ? JSON.parse(match[1]) : null;
};
const babelParser = guiRequire('@babel/parser');
// A prompt() call is the token `prompt` followed by `(`, bare or after `<name>.`; tokens, so
// comments and strings (other than the decoded extension bundles) cannot match.
const promptCalls = (file, source) => {
    const calls = [];
    const visit = (code, where) => {
        if (!QUICK_PROMPT.test(code)) return;
        let tokens;
        try {
            ({tokens} = babelParser.parse(code, {
                sourceType: 'unambiguous', plugins: ['jsx'], errorRecovery: true, tokens: true
            }));
        } catch (error) {
            calls.push({file, where, line: 0, callee: `UNPARSED: ${error.message.split('\n')[0]}`});
            return;
        }
        const label = token => token && (token.type.label || token.type);
        tokens.forEach((token, index) => {
            if (label(token) !== 'name' || token.value !== 'prompt' || label(tokens[index + 1]) !== '(') return;
            const dotted = label(tokens[index - 1]) === '.';
            if (dotted && label(tokens[index - 2]) !== 'name' && label(tokens[index - 2]) !== 'this') {
                calls.push({file, where, line: token.loc.start.line, callee: '<expression>.prompt'});
                return;
            }
            const owner = dotted ? `${tokens[index - 2].value || 'this'}.` : '';
            const before = label(tokens[index - 1]);
            if (!dotted && (before === 'function' || (tokens[index - 1] && tokens[index - 1].value === 'function'))) return;
            calls.push({file, where, line: token.loc.start.line, callee: `${owner}prompt`});
        });
    };
    const bundled = extensionSource(source);
    if (bundled !== null) visit(bundled, 'bundled extension source');
    else visit(source, 'file');
    return calls;
};
const unitOf = file => {
    if (!file.startsWith(`${GUI_MODULES}/`)) return file;
    const rest = file.slice(GUI_MODULES.length + 1).split('/');
    return rest[0].startsWith('@') ? `${rest[0]}/${rest[1]}` : rest[0];
};

// Every prompt() call allowed to remain, each with the reason it is not a defect. Counted
// exactly: one more anywhere is a new site to convert, one fewer a ledger to shrink. No entry
// is a CrispStrobe extension bundle: none of them calls prompt() (measured 2026-10-06).
const LEDGER = [
    {unit: HELPER, callee: 'scope.prompt', count: 1,
        why: 'the helper itself: the browser branch, awaited and read as a string or null'},
    {unit: 'scratch-blocks', callee: 'window.prompt', count: 3,
        why: "Blockly.prompt's default (core/blockly.js and the two compiled builds); blocks.jsx replaces " +
            "it with the GUI's React Prompt modal (held above)"},
    {unit: 'scratch-blocks', callee: 'Blockly.prompt', count: 6,
        why: 'callback form (new/rename variable, list, broadcast) in core/variables.js and the two compiled ' +
            'builds: reaches the GUI Prompt modal'},
    {unit: 'skulpt', callee: 'window.prompt', count: 6,
        why: "Skulpt's default Sk.inputfun (dist/skulpt.js, dist/skulpt.min.js, src/env.js twice, " +
            'support/run/btestrunner.js twice). Lite configures inputfun on every run (main thread: ' +
            'promptAsync; the worker: an empty answer), so the default is never called'},
    {unit: 'google-closure-library', callee: 'window.prompt', count: 1,
        why: "goog.ui.CustomColorPalette: scratch-blocks' build input; its package main (dist/vertical.js) " +
            'loads only the compiled builds, so no closure source ships'},
    {unit: 'google-closure-library', callee: '<expression>.prompt', count: 1,
        why: 'goog.editor BasicTextFormatter: as above, never bundled'},
    ...['nqc-wasm/dist/nqc.js', 'smallerc-wasm/dist/smlrc.js', 'smallerc-wasm/dist/smlrpp.js'].map(glue => ({
        unit: `overlay/scratch-gui/src/lib/${glue}`, callee: 'window.prompt', count: 1,
        why: "Emscripten's default stdin (FS_stdin_getChar, held below): the compilers read their " +
            'source from files and never read stdin'
    })),
    // The GPL SDCC toolchain is not in this repository (.gitignore): the app downloads it from
    // CrispStrobe/sdcc-wasm when a user opts in, and CI fetches it for the Node gates, so these
    // entries count only where it is present.
    ...['cc1.js', 'sdas8051.js', 'sdcc.js', 'sdld.js'].map(glue => ({
        unit: `overlay/scratch-gui/src/lib/sdcc-wasm/dist/${glue}`, callee: 'window.prompt', count: 1,
        whenPresent: true,
        why: "Emscripten's default stdin, as above (SDCC's tools read files; held below where present)"
    }))
];

const censusVerdict = calls => {
    const counted = new Map();
    for (const call of calls) {
        const key = `${unitOf(call.file)}\t${call.callee}`;
        counted.set(key, [...(counted.get(key) || []), call]);
    }
    const problems = [];
    for (const [key, found] of counted) {
        const entry = LEDGER.find(item => `${item.unit}\t${item.callee}` === key);
        if (!entry) {
            for (const call of found) {
                problems.push(`${call.file}:${call.line} (${call.where}) uses the value of ${call.callee}(...) — ` +
                    'in the macOS/iOS app that is always null. Use `await promptAsync(...)` from ' +
                    'lib/native-dialog.js (task E8).');
            }
        } else if (found.length !== entry.count) {
            problems.push(`${key.replace('\t', ' ')}: ${found.length} calls, the ledger says ${entry.count} ` +
                `(${found.map(call => `${call.file}:${call.line}`).join(', ')})`);
        }
    }
    for (const entry of LEDGER) {
        if (entry.whenPresent && !existsSync(path.join(root, entry.unit))) continue;
        if (!counted.has(`${entry.unit}\t${entry.callee}`)) {
            problems.push(`ledger entry ${entry.unit} ${entry.callee} matches nothing: remove it`);
        }
    }
    return problems;
};

let censusMemo = null;
const census = () => {
    censusMemo = censusMemo || [...shippedFiles(), ...dependencyFiles()].flatMap(file => {
        const source = read(file);
        return QUICK_PROMPT.test(source) ? promptCalls(file, source) : [];
    });
    return censusMemo;
};

test('census: no shipped source uses the value of prompt() except the reviewed ledger', () => {
    const files = shippedFiles();
    const deps = dependencyPackages();
    assert.ok(files.length > 900, `only ${files.length} Lite shipped files found`);
    assert.ok(deps.length > 300, `only ${deps.length} dependency packages found`);
    for (const must of [EXT_LIBRARY, IMPORTER, DEBUG_PANEL, DRAWER, MONITOR, HELPER,
        'overlay/scratch-vm/src/extensions/crispstrobe/ev3dev/index.js',
        `${GUI_MODULES}/scratch-vm/src/virtual-machine.js`]) {
        assert.ok(files.includes(must), `the census does not reach ${must}`);
    }
    for (const must of ['scratch-blocks', 'skulpt', 'bw-circuit-ui', 'react']) {
        assert.ok(deps.includes(must), `the census does not reach the dependency ${must}`);
    }
    assert.ok(!files.includes('packages/scratch-gui/src/containers/monitor.jsx'),
        'a path present in overlay/ ships the overlay copy, not the packages mirror');
    // The bundles are decoded: their source mentions prompt (in comments) and calls none.
    const bundles = files.filter(file => /crispstrobe\/[^/]+\/index\.js$/.test(file) && extensionSource(read(file)) !== null);
    assert.ok(bundles.length >= 10, `only ${bundles.length} decoded extension bundles`);
    assert.ok(bundles.some(file => /\bprompt\b/.test(extensionSource(read(file)))), 'no bundle mentions prompt at all');
    assert.deepEqual(censusVerdict(census()), []);
});

test('census turns red on a new direct prompt() use, a stale count and a dead entry', () => {
    const calls = census();
    assert.deepEqual(censusVerdict(calls), []);
    const reverted = read(DEBUG_PANEL).replace("await promptAsync('Annotation')", "window.prompt('Annotation')");
    assert.match(censusVerdict(calls.concat(promptCalls(DEBUG_PANEL, reverted))).join('\n'),
        /debug-panel\.jsx:\d+ \(file\) uses the value of window\.prompt/);
    const bare = 'export const f = () => { const name = prompt("x"); go(name); };';
    assert.match(censusVerdict(calls.concat(promptCalls('overlay/scratch-gui/src/lib/new.js', bare))).join('\n'),
        /new\.js:1 \(file\) uses the value of prompt/);
    const notCalls = '// prompt("x")\nconst text = "prompt(x)"; const t = `answer = prompt(${q})`; function prompt (m) { return m; }';
    assert.deepEqual(promptCalls('overlay/scratch-gui/src/lib/new.js', notCalls), [],
        'comments, strings, templates and a declaration are not calls');
    const extension = `const makeExt = require('../adapter');\nmodule.exports = makeExt(${JSON.stringify('(function(){ const n = prompt("Hub name?"); rename(n); })();')});\n`;
    assert.match(censusVerdict(calls.concat(promptCalls('overlay/scratch-vm/src/extensions/crispstrobe/x/index.js', extension))).join('\n'),
        /x\/index\.js:1 \(bundled extension source\) uses the value of prompt/);
    const fewer = calls.filter(call => !call.file.endsWith('smlrpp.js'));
    assert.match(censusVerdict(fewer).join('\n'), /smlrpp\.js window\.prompt matches nothing/);
    const more = calls.concat(calls.filter(call => call.file.endsWith('nqc.js')));
    assert.match(censusVerdict(more).join('\n'), /nqc\.js window\.prompt: 2 calls, the ledger says 1/);
});

test('the Emscripten glue reaches window.prompt only as its default stdin', t => {
    const sdcc = ['cc1.js', 'sdas8051.js', 'sdcc.js', 'sdld.js'].map(glue => `sdcc-wasm/dist/${glue}`)
        .filter(glue => existsSync(path.join(root, 'overlay/scratch-gui/src/lib', glue)));
    t.diagnostic(`SDCC glue present: ${sdcc.length} of 4`);
    for (const glue of ['nqc-wasm/dist/nqc.js', 'smallerc-wasm/dist/smlrc.js', 'smallerc-wasm/dist/smlrpp.js', ...sdcc]) {
        const source = read(`overlay/scratch-gui/src/lib/${glue}`);
        // Inside FS_stdin_getChar: after its name, before its `return …buffer.shift()`.
        const at = source.indexOf('window.prompt(');
        const owner = source.lastIndexOf('FS_stdin_getChar', at);
        const end = source.indexOf('FS_stdin_getChar_buffer.shift()', at);
        assert.ok(owner > 0 && end > at && end - owner < 3000 &&
            !source.slice(owner, at).includes('FS_stdin_getChar_buffer.shift()'),
        `${glue}: window.prompt is not inside FS_stdin_getChar`);
        assert.equal(source.indexOf('window.prompt(', at + 1), -1);
    }
});
