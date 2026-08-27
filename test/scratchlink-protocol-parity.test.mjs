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

test('the Web Bluetooth GATT blocklist is present and enforced', () => {
    // The reference refuses these for security and privacy — HID because
    // "direct access to HID devices would let web pages become keyloggers",
    // the serial number because it is a tracking id, firmware-update and
    // bootloader services because they can replace a device's software. We had
    // no blocklist at all, so any extension could reach all of them through us.
    const BLOCKED = [
        '00001812-0000-1000-8000-00805f9b34fb', // HID
        '00001530-1212-efde-1523-785feabcd123', // unsigned firmware update
        'f000ffc0-0451-4000-b000-000000000000', // TI OAD
        '00060000-0000-1000-8000-00805f9b34fb', // Cypress bootloader
        '0000fffd-0000-1000-8000-00805f9b34fb', // FIDO U2F
        '00002a02-0000-1000-8000-00805f9b34fb', // privacy flag (writes)
        '00002a03-0000-1000-8000-00805f9b34fb', // reconnection address
        '00002a25-0000-1000-8000-00805f9b34fb', // serial number
        '00002902-0000-1000-8000-00805f9b34fb', // CCCD (writes)
        '00002903-0000-1000-8000-00805f9b34fb', // SCCD (writes)
    ];
    for (const uuid of BLOCKED) {
        assert.match(BLE, new RegExp(uuid), `${uuid} is missing from the blocklist`);
    }
    // Enforced where the reference enforces it: read, write, and both
    // notification calls. A list nothing consults is decoration.
    // Count CALL SITES only. Matching `check_blocklist(params` also matched the
    // function's own definition, so removing a call still left four and the
    // test passed — it was counting the thing it was supposed to be measuring.
    const checks = BLE.match(/check_blocklist\(params,\s*(?:true|false)\)/g) || [];
    assert.equal(checks.length, 4,
        `the blocklist is consulted at ${checks.length} call sites; the reference checks read, write, startNotifications and stopNotifications`);
});

test('message encoding follows the reference, including the default', () => {
    // EncodingHelpers: an ABSENT encoding means "plain Unicode string", and
    // only "base64" means base64. We defaulted to base64, which is the
    // opposite — a plain-string write became a decode error or wrong bytes.
    assert.match(BLE, /Some\("base64"\)\s*=>/, 'base64 must be an explicit arm, not the default');
    assert.match(BLE, /None\s*=>\s*Ok\(msg\.as_bytes\(\)/,
        'an absent encoding must send the string as UTF-8 bytes');
    assert.match(BLE, /unsupported encoding/, 'anything else is refused');
});

test('the write type is chosen from the characteristic, not hardcoded', () => {
    // "If the client specified a write type, honour that. Otherwise, if the
    // characteristic claims to support writing without response, do that.
    // Otherwise, write with response." Hardcoding without-response is right for
    // the LEGO hubs and silently wrong for a characteristic that lacks it.
    assert.match(BLE, /fn choose_write_type/, 'the write type must be derived');
    assert.match(BLE, /WriteWithoutResponse/,
        'the characteristic properties decide when the client did not say');
    assert.match(BLE, /withResponse/, 'an explicit client choice still wins');
});

test('BT discovery filters by the device class the client asked for', () => {
    // BTSession requires majorDeviceClass and minorDeviceClass on a discover,
    // and EV3 sends 8/1 (toy / robot). A backend that ignores them lists every
    // bonded device — headphones, phones, keyboards — as an EV3 brick.
    const ANDROID = read('apps/tauri/src-tauri/src/scratchlink/bt_android.rs');
    assert.match(ANDROID, /majorDeviceClass/, 'android BT ignored the major class');
    assert.match(ANDROID, /minorDeviceClass/, 'android BT ignored the minor class');
    assert.match(ANDROID, /getBluetoothClass/, 'the class has to be read from the device');
    // Fail-open is deliberate: a JNI mistake must degrade to the old unfiltered
    // behaviour, never to hiding every robot on the system.
    assert.match(ANDROID, /FAILS OPEN/i,
        'the fallback direction is the whole safety argument — keep it documented');
});

test('connect is bounded by what discovery actually reported', () => {
    // The reference keeps reportedPeripherals, clears it on each discover, and
    // refuses a connect to anything not in it. Accepting any address makes the
    // discovery filter — and the GATT blocklist behind it — decorative: an
    // extension that knows a MAC reaches hardware the user never chose.
    assert.match(BLE, /static REPORTED/, 'nothing tracks what was reported');
    assert.match(BLE, /invalid peripheralId/, 'an unreported id must be refused by name');
    assert.match(BLE, /fn reset_reported/, 'a new discovery must invalidate the old set');
    // Open before the first discovery: a reconnect after a restart must still
    // work, so the boundary starts permissive and closes once a scan has run.
    assert.match(BLE, /None => true/,
        'with no discovery yet the set must not refuse everything');
});
