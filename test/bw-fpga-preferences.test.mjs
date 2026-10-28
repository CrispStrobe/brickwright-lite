/**
 * The FPGA tab's runtime opt-in: it must persist, notify, and default OFF.
 * The tab ships hidden even when its code is bundled, so a wrong default here
 * would show an advanced surface to everyone.
 *
 * The module caches a session value once it is set, so the storage-read tests
 * run FIRST, before any set() poisons that cache.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {getFpgaEnabled, setFpgaEnabled, FPGA_ENABLED_KEY, FPGA_TOGGLE_EVENT}
    from '../overlay/scratch-gui/src/lib/bw-fpga-preferences.js';

function browser (store = {}) {
    const events = [];
    globalThis.localStorage = store === null ? undefined : {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }
    };
    globalThis.window = {dispatchEvent: e => events.push(e)};
    globalThis.CustomEvent = class { constructor (type, opts) { this.type = type; this.detail = opts && opts.detail; } };
    return events;
}

test('with no stored value the tab is OFF (reads storage, session cache unset)', () => {
    browser({});
    assert.equal(getFpgaEnabled(), false);
});

test('a value that is not exactly "1" reads as OFF', () => {
    browser({[FPGA_ENABLED_KEY]: 'true'});
    assert.equal(getFpgaEnabled(), false, 'only "1" means on; anything else is off');
});

test('setFpgaEnabled persists "1"/"0", notifies, and getFpgaEnabled round-trips', () => {
    const store = {};
    const events = browser(store);
    assert.equal(setFpgaEnabled(true), true, 'persisted to storage');
    assert.equal(store[FPGA_ENABLED_KEY], '1', 'enabled is stored as exactly "1"');
    assert.equal(getFpgaEnabled(), true);
    assert.equal(events.at(-1).type, FPGA_TOGGLE_EVENT);
    assert.deepEqual(events.at(-1).detail, {enabled: true}, 'the tab list learns the new value from the event');

    setFpgaEnabled(false);
    assert.equal(store[FPGA_ENABLED_KEY], '0');
    assert.equal(getFpgaEnabled(), false);
    assert.deepEqual(events.at(-1).detail, {enabled: false});
});

test('with storage unavailable, the toggle still notifies but reports not-persisted', () => {
    const events = browser(null);
    assert.equal(setFpgaEnabled(true), false, 'no storage means not persisted');
    assert.equal(events.at(-1).detail.enabled, true, 'but the app is still told, for this tab');
});
