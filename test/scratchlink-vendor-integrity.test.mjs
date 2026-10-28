/**
 * The vendored Scratch Link Swift stays byte-identical to upstream.
 *
 * Its whole value is being the REFERENCE implementation: where our Rust server
 * and this disagree, this one is right by definition. A local "small fix" here
 * would quietly turn that into an opinion, and the next person to audit our
 * server against it would be auditing against us.
 *
 * If upstream must change, change the pin in the README and these hashes in the
 * same commit, with the licence of the new snapshot re-checked — Scratch
 * relicensed from BSD-3 to AGPL-3.0 on 2024-11-25, and this snapshot
 * (2022-02-18) predates that deliberately.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '../apps/tauri/src-tauri/vendor/scratch-link-swift');
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');

/** sha256 of every vendored file, as fetched from bricklife/scratch-link
 *  @ f78273b9003bc0272dbcfb8a39a5a1358de89007. */
const EXPECTED = {
    'BLESession.swift':
        '9f8662298645b3b9507b83be094ff893d5226d4c67bbd2baa6b079d3f31827f1',
    'BTSession.swift':
        '1deb0c9b770141380b65dd12bffbb74fdd09ffde8f10ca377c68ffae27da9d5a',
    'CBCentralManagerDelegateHelper.swift':
        '6771274864af0e3b0dc4bbd53782e7e66a09cd9f0c40064b6cc50ebaf097abca',
    'CBPeripheralDelegateHelper.swift':
        '9b0bbda96369ce8686af7757e97df1502d650769dad48394bacc1e263ad70eaf',
    'DispatchSemaphore.swift':
        '577667ef6198152e65ebdb44f4e887b3bbc022f35da4e8e7339c2bfd9325e15a',
    'EncodingHelpers.swift':
        '459474d4e43df88935675dd11f206bd02122aefc74de609f3586f9233c784838',
    'GATTHelpers.swift':
        'ca0eb09693477cb7cff56909e991fb44eb604e1aa86ae6c4bfcfa223efff6f82',
    'JSONRPCError.swift':
        'ef76bfc3008dad26db275b7d88f7600a42677e0863fa2c7095d034ce9a4a03ef',
    'RSSI.swift':
        '7f23cdeaa919a977d8f4a9d9cf1050d48f938e6a1026d26ba74dc739bf4233fe',
    'Session.swift':
        '43d7ecb800f18a02f125f06e8839bf76f5944704bc51ce741f4b21516c795c3c',
    'LICENSE':
        '8d7c41e0bba6db4070714002851a5d16edc08f3918ed8badb510b4ce9246da8f',
};

test('every vendored Swift source is unmodified', () => {
    for (const [name, want] of Object.entries(EXPECTED)) {
        const file = name === 'LICENSE' ? path.join(DIR, name) : path.join(DIR, 'Sources', name);
        assert.equal(sha(file), want,
            `${name} differs from upstream — the point of vendoring it is that it does not`);
    }
});

test('nothing extra has been added to Sources', () => {
    // A new file here would compile into the "reference" implementation while
    // being ours, which is the same problem as editing one.
    const actual = readdirSync(path.join(DIR, 'Sources')).filter(f => f.endsWith('.swift')).sort();
    const expected = Object.keys(EXPECTED).filter(k => k !== 'LICENSE').sort();
    assert.deepEqual(actual, expected);
});

test('the licence and its obligations are shipped with the code', () => {
    const licence = readFileSync(path.join(DIR, 'LICENSE'), 'utf8');
    assert.match(licence, /BSD|Redistribution/i);
    assert.match(licence, /Scratch Foundation/);
    assert.match(licence, /Neither the name/, 'the third clause is an obligation, not decoration');
    // Clause 3 and the trademark file are why we ship code and no branding.
    readFileSync(path.join(DIR, 'TRADEMARK'), 'utf8');
    const readme = readFileSync(path.join(DIR, 'README.md'), 'utf8');
    assert.match(readme, /f78273b9003bc0272dbcfb8a39a5a1358de89007/, 'the pin must be recorded');
    assert.match(readme, /2024-11-25|AGPL/, 'the relicence date is why this snapshot is pinned');
});

test('the patch that makes it compile is recorded, not silently applied', () => {
    // Sources/ stays byte-identical so it can be audited against. But the
    // snapshot is from 2022 and does NOT build against a modern SDK: Apple made
    // CBCharacteristic.service and CBService.peripheral weak optionals in
    // iOS 15 / macOS 12, and BLESession.swift:431 dereferences both. Compiled
    // under Swift 6.2 it is the ONE line that fails.
    //
    // So the fix lives in patches/ and is applied to a build copy. If someone
    // later "fixes" Sources/ directly, the integrity test above catches it; if
    // someone drops the patch, this one does.
    const patch = readFileSync(path.join(DIR, 'patches/0001-modern-corebluetooth-optionals.patch'), 'utf8');
    assert.match(patch, /BLESession\.swift/);
    assert.match(patch, /service\?\.peripheral\?/, 'the fix is optional-chaining');
    assert.match(patch, /iOS 15|macOS 12/, 'and must say WHY, or it reads as a style change');

    const readme = readFileSync(path.join(DIR, 'README.md'), 'utf8');
    assert.match(readme, /SerializationError/,
        'the two stub modules are load-bearing — without them the imports do not resolve');
    assert.match(readme, /IOBluetooth/,
        'BTSession is macOS-only and cannot ship on iOS; that must not be rediscovered');
});

test('the build recipe records what was verified, not what was assumed', () => {
    // Each of these cost a real experiment. Losing them means the next attempt
    // re-derives them through 20-minute CI iOS jobs, which is what this whole
    // exercise was trying to avoid.
    const readme = readFileSync(path.join(DIR, 'README.md'), 'utf8');
    assert.match(readme, /symlink/i, 'SwiftPM following a symlink is why no copy of the tree is needed');
    assert.match(readme, /BTSession\.swift/, 'excluding the macOS-only session is required');
    assert.match(readme, /tauri-plugin-share/, 'the working plugin template is in this repo');
    assert.match(readme, /didReceiveText/, 'the inbound seam must be named, or it gets reimplemented');
});
