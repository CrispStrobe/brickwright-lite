import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: key => store.delete(key)
};
const {readSettings, writeSettings, folderPickerAvailable} = await import('../overlay/scratch-gui/src/lib/bw-autosave.js');

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
