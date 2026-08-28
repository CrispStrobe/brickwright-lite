/**
 * The user's choice of Scratch Link carrier.
 *
 * Several carriers exist because each has failed somewhere, and the point of
 * keeping them all is that any one may be the only one that works on a machine
 * nobody has tested. So the tests here are mostly about a choice being HONEST:
 * a carrier that cannot run where you are must not be silently selected, and a
 * stored choice that stops being valid must not disable Bluetooth without
 * saying why.
 */
import {test, describe, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {resolve, dirname} from 'node:path';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const LIB = resolve(dirname(fileURLToPath(import.meta.url)), '../overlay/scratch-gui/src/lib');
const store = new Map();
const define = (n, v) => Object.defineProperty(globalThis, n, {value: v, configurable: true, writable: true});

define('localStorage', {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
});
define('navigator', {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
define('window', {__TAURI__: {}, addEventListener: () => {}});

const {TRANSPORTS, getTransport, setTransport, isApple, isNativeApp} =
    await import(`${LIB}/scratchlink-transport.js`);

beforeEach(() => store.clear());

describe('the carriers on offer', () => {
    test('all five choices exist, including the vendored original', () => {
        const ids = TRANSPORTS.map(t => t.id);
        assert.deepEqual(ids, ['auto', 'socket', 'native', 'original']);
    });

    test('every carrier explains itself', () => {
        // A list of names the user cannot tell apart is not a choice.
        for (const t of TRANSPORTS) {
            assert.ok(t.label && t.label.length > 3, `${t.id} has no label`);
            assert.ok(t.detail && t.detail.length > 20, `${t.id} does not say what it does`);
        }
    });

    test('the unavailable ones say why, so a greyed row is not a mystery', () => {
        for (const t of TRANSPORTS) {
            if (t.available()) continue;
            assert.ok(t.why, `${t.id} is unavailable and gives no reason`);
        }
    });
});

describe('choosing one', () => {
    test('auto is the default', () => {
        assert.equal(getTransport(), 'auto');
    });

    test('a valid choice is stored and returned', () => {
        assert.equal(setTransport('socket'), true);
        assert.equal(getTransport(), 'socket');
    });

    test('an unknown id is refused rather than stored', () => {
        assert.equal(setTransport('carrier-pigeon'), false);
        assert.equal(getTransport(), 'auto');
    });
});

describe('a choice that cannot run here', () => {
    test('the Apple-only carrier is offered now that it is wired', () => {
        // It spent one commit greyed out with "vendored, not wired up yet",
        // which was the honest state while the Swift had no caller. It has one
        // now (plugins/scratchlink-original), so it is selectable again — and
        // the coupling gate below is what forced this line to move with it.
        assert.ok(isNativeApp() && isApple(), 'the environment here is Apple + app');
        assert.equal(TRANSPORTS.find(t => t.id === 'original').available(), true);
    });

    test('the flag must be flipped in the commit that lands the bridge', () => {
        // A coupling gate. The day someone adds the Swift entry points, this
        // fails and points at the one line they will otherwise forget — a
        // working transport nobody can select is as useless as a dead one that
        // everyone can.
        const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
        // The marker is the PLUGIN REGISTRATION, not a command name: the
        // commands live in Swift, so lib.rs never mentions them. Watching for
        // names that can never appear is a gate that can never fire.
        const wired = ['tauri_plugin_scratchlink_original']
            .some(cmd => {
                try {
                    return readFileSync(resolve(root, 'apps/tauri/src-tauri/src/lib.rs'), 'utf8').includes(cmd);
                } catch (e) {
                    return false;
                }
            });
        const original = TRANSPORTS.find(t => t.id === 'original');
        if (wired) {
            assert.notEqual(original.available(), false,
                'the bridge exists now — make the transport selectable');
        } else {
            assert.equal(original.available(), false,
                'no bridge yet, so the transport must stay unavailable');
        }
    });

    test('and falls back to auto where it cannot run', () => {
        // The real case: a synced profile carries an iPhone-only choice to a
        // Linux desktop. Honouring it there would disable Bluetooth silently.
        store.set('bw-scratchlink-transport', 'original');
        define('navigator', {userAgent: 'Mozilla/5.0 (X11; Linux x86_64)'});
        assert.equal(getTransport(), 'auto');
        define('navigator', {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
    });

    test('the native channel is not offered outside the app', () => {
        define('window', {addEventListener: () => {}});
        assert.equal(TRANSPORTS.find(t => t.id === 'native').available(), false,
            'a web browser has no native channel; offering it would be a dead choice');
        store.set('bw-scratchlink-transport', 'native');
        assert.equal(getTransport(), 'auto');
        define('window', {__TAURI__: {}, addEventListener: () => {}});
    });

    test('iPadOS reporting as Macintosh still counts as Apple', () => {
        // iPadOS sends a Macintosh UA. Treating that as "not Apple" would hide
        // the carrier on exactly the device it was added for.
        define('navigator', {userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'});
        assert.equal(isApple(), true);
        define('navigator', {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'});
    });
});
