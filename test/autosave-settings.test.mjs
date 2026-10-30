import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
};
const {readSettings, writeSettings, folderPickerAvailable, fixedFolder, isAndroidApp, chooseFolder} = await import('../overlay/scratch-gui/src/lib/bw-autosave.js');

test('autosave is on by default and its settings stay in safe bounds', () => {
    store.clear();
    assert.deepEqual(readSettings(), {enabled: true, intervalSec: 60, keep: 30});
    writeSettings({intervalSec: 1, keep: 100000});
    assert.deepEqual(readSettings(), {enabled: true, intervalSec: 15, keep: 200}, 'no save storm, bounded storage');
    writeSettings({enabled: false, intervalSec: 300, keep: 10});
    assert.deepEqual(readSettings(), {enabled: false, intervalSec: 300, keep: 10});
    store.set('bw-autosave-settings', '{not json');
    assert.deepEqual(readSettings(), {enabled: true, intervalSec: 60, keep: 30}, 'a corrupt setting falls back');
});

test('a folder can be chosen only where the platform offers a picker', () => {
    assert.equal(folderPickerAvailable(), false, 'plain Node has neither the app bridge nor showDirectoryPicker');
});

test('the Android app keeps in-app versions without offering an invisible native folder', async () => {
    const savedWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    const calls = [];
    try {
        globalThis.window = {__TAURI__: {core: {invoke: (...args) => { calls.push(args); }}}};
        Object.defineProperty(globalThis, 'navigator', {configurable: true,
            value: {userAgent: 'Mozilla/5.0 (Linux; Android 15; Phone)', maxTouchPoints: 5}});
        assert.equal(isAndroidApp(), true);
        assert.equal(fixedFolder(), false);
        assert.equal(folderPickerAvailable(), false);
        await assert.rejects(chooseFolder(), /Android autosaves stay inside the app/);
        assert.deepEqual(calls, [], 'the hidden private folder is never selected');
        // A real browser picker remains available independently of the native app.
        globalThis.window = {showDirectoryPicker: () => {}};
        assert.equal(isAndroidApp(), false);
        assert.equal(folderPickerAvailable(), true);
    } finally {
        if (savedWindow) Object.defineProperty(globalThis, 'window', savedWindow); else delete globalThis.window;
        if (savedNavigator) Object.defineProperty(globalThis, 'navigator', savedNavigator); else delete globalThis.navigator;
    }
});

test('the app on an iPad uses its own Files-app folder instead of a picker', () => {
    const ua = (agent, touch) => Object.defineProperty(globalThis, 'navigator',
        {value: {userAgent: agent, maxTouchPoints: touch}, configurable: true});
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
        globalThis.window = {__TAURI__: {core: {invoke: () => null}}};
        ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5);
        assert.equal(fixedFolder(), true, 'iPadOS reports as Macintosh, with touch points');
        ua('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0);
        assert.equal(fixedFolder(), false, 'the Mac app keeps its folder picker');
        globalThis.window = {};
        ua('Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 5);
        assert.equal(fixedFolder(), false, 'Safari on iPad is not the app');
    } finally {
        delete globalThis.window;
        if (saved) Object.defineProperty(globalThis, 'navigator', saved);
    }
    const rust = readFileSync(new URL('../apps/tauri/src-tauri/src/autosave.rs', import.meta.url), 'utf8');
    assert.match(rust, /document_dir\(\)[\s\S]*?\.join\("Autosave"\)/, 'mobile choose turns on Documents/Autosave');
    const plist = readFileSync(new URL('../apps/tauri/src-tauri/Info.ios.plist', import.meta.url), 'utf8');
    assert.match(plist, /<key>UIFileSharingEnabled<\/key>\s*<true\/>/, 'the Files app shows that folder');
});

test('an unsaved session is marked, and the next start offers its autosave', () => {
    const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-autosave.js', import.meta.url), 'utf8');
    assert.match(source, /if \(changed\) localStorage\.setItem\(UNCLEAN_KEY/);
    assert.match(source, /else localStorage\.removeItem\(UNCLEAN_KEY\)/);
    assert.match(source, /export const recoveryCandidate = /);
    const safety = readFileSync(new URL('../overlay/scratch-gui/src/lib/bw-project-safety.js', import.meta.url), 'utf8');
    assert.match(safety, /offerRecovery\(store\)/);
});
