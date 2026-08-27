/**
 * Our Scratch Link server against the OFFICIAL one, method for method.
 *
 * The owner asked five times whether we cover exactly what Swift
 * ScratchLinkKit covers. I answered from inference three times and then said I
 * could not check because Scrub vendors the implementation as an unchecked-out
 * submodule. It is a public repository. Cloning it took ten seconds and the
 * answer was NO: `stopNotifications`, `getVersion` and `pingMe` were all
 * missing.
 *
 * Source of truth, read from bricklife/scratch-link (the fork Scrub vendors,
 * itself a fork of the official LLK/scratch-link):
 *
 *   BLESession.swift   connect discover getServices read
 *                      startNotifications stopNotifications write
 *   BTSession.swift    discover connect send
 *   Session.swift      getVersion pingMe          (base — BOTH sessions inherit)
 *
 * This test pins our surface to that list so it cannot quietly fall behind
 * again. It reads the Rust rather than running it: the server needs a real
 * Bluetooth adapter, and a parity check that only runs where hardware exists
 * is a parity check that never runs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');

const BLE = read('apps/tauri/src-tauri/src/scratchlink/ble.rs');

/** Every method the official BLESession answers, plus the inherited base two. */
const OFFICIAL_BLE = [
    'connect', 'discover', 'getServices', 'read',
    'startNotifications', 'stopNotifications', 'write',
    'getVersion', 'pingMe',
];

/** BTSession's own three. Its dispatch is `method == "x"`, not a match arm. */
const OFFICIAL_BT = ['discover', 'connect', 'send'];

test('our BLE session answers every method the official one does', () => {
    const missing = OFFICIAL_BLE.filter(m => !new RegExp(`"${m}"`).test(BLE));
    assert.deepEqual(missing, [], `our BLE server does not answer: ${missing.join(', ')}`);
});

test('getVersion reports the protocol version, not ours', () => {
    // Upstream's Session declares NetworkProtocolVersion = "1.2" and returns it
    // under "protocol". Answering with the Brickwright version would be a
    // different number under the same key — the kind of wrong that reads right.
    assert.match(BLE, /"getVersion"[\s\S]{0,240}"protocol":\s*"1\.2"/,
        'getVersion must report the NETWORK PROTOCOL version 1.2');
});

test('pingMe acknowledges and then sends a ping, as upstream does', () => {
    // Upstream replies "willPing" and THEN sends the client a `ping` request.
    // Replying without sending the ping would satisfy a shallow test and leave
    // a client waiting for a frame that never comes.
    assert.match(BLE, /"pingMe"[\s\S]{0,400}"willPing"/, 'pingMe must reply willPing');
    assert.match(BLE, /"pingMe"[\s\S]{0,400}"method":\s*"ping"/,
        'pingMe must also EMIT a ping frame, not just acknowledge');
});

test('every platform BT backend answers the official three', () => {
    // iOS matters most here: Bluetooth Classic goes through MFi
    // ExternalAccessory there and EV3/NXT have no other route at all.
    for (const plat of ['macos', 'linux', 'windows', 'android', 'ios']) {
        const src = read(`apps/tauri/src-tauri/src/scratchlink/bt_${plat}.rs`);
        const missing = OFFICIAL_BT.filter(m => !new RegExp(`"${m}"`).test(src));
        assert.deepEqual(missing, [], `bt_${plat}.rs does not answer: ${missing.join(', ')}`);
    }
});

test('the notifications the VM listens for are all emitted somewhere', () => {
    // scratch-vm's io/ble.js and io/bt.js switch on these. One that is never
    // sent is a message the client is waiting for and will not get.
    const BT = ['macos', 'linux', 'windows', 'android', 'ios']
        .map(p => read(`apps/tauri/src-tauri/src/scratchlink/bt_${p}.rs`)).join('\n');
    for (const n of ['didDiscoverPeripheral', 'characteristicDidChange']) {
        assert.match(BLE, new RegExp(`"${n}"`), `BLE never emits ${n}`);
    }
    for (const n of ['didDiscoverPeripheral', 'didReceiveMessage']) {
        assert.match(BT, new RegExp(`"${n}"`), `no BT backend emits ${n}`);
    }
});

test('the discover filter honours every criterion the reference supports', () => {
    // Web Bluetooth filters may select by name, namePrefix, services or
    // manufacturerData. We honoured only `services` until 2026-08-28, and two
    // SHIPPED extensions depend on the rest:
    //   scratch3_gdx_for  → namePrefix "GDX-FOR", no services at all
    //   scratch3_boost    → the LEGO service AND manufacturerData, because the
    //                       service alone does not tell a Boost hub from a
    //                       WeDo 2.0 or Powered Up one
    for (const key of ['name', 'namePrefix', 'services', 'manufacturerData']) {
        assert.match(BLE, new RegExp(`"${key}"`), `the discover filter ignores ${key}`);
    }
    assert.match(BLE, /dataPrefix/, 'manufacturerData needs its dataPrefix');
    assert.match(BLE, /"mask"/, 'and its mask, or every byte is compared');
});

test('a malformed discover request is refused, not scanned unfiltered', () => {
    // The reference throws on missing filters, an empty array, and a filter
    // that constrains nothing. Returning "no filter" for those means offering
    // the user every BLE device in the building and calling it success.
    assert.match(BLE, /could not parse filters in discovery request/);
    assert.match(BLE, /discovery request must include filters/);
    assert.match(BLE, /discovery request includes empty filter/);
});

test('discovery scans unfiltered at the adapter and matches in software', () => {
    // The reference passes nil to scanForPeripherals and matches in software.
    // An adapter-level service filter is cheaper and wrong the moment a filter
    // selects by name or manufacturer data instead.
    assert.match(BLE, /ScanFilter::None/,
        'an adapter-level service filter would hide devices a name filter wants');
});
