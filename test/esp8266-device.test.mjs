/**
 * ESP8266 as a Lite device: DEVICE ESP8266 pseudocode -> C (vendored
 * sb3-creator) -> stc-compiler target `esp8266` (a base64 flash image) ->
 * bw-board's `esp8266` debug kind.
 *
 * The hosted compile service does not expose `esp8266` in production yet, so
 * nothing here calls it. The run case boots a checked-in image instead: the
 * bytes of bw-board's test/fixtures/esp8266/blink.bin at bw-board 3b03d226
 * (built from the esp8266js fork's own SDK-free firmware/blink.c, MIT; GPIO2
 * toggles every 500 ms and prints "blink", "on", "off"), embedded as base64 so
 * the case never depends on what the installed package ships. It is handed to
 * the factory as base64 text, the same shape the compiler's response carries.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {DEVICES, DEVICE_GROUPS, CELLS, deviceById} from '../overlay/scratch-gui/src/lib/bw-matrix/capabilities.js';
import {selectDebugTargetKind} from '../overlay/scratch-gui/src/lib/bw-debug/debug-runner.js';
import {compileTargetFor, compileFormatFor} from '../overlay/scratch-gui/src/lib/bw-debug/shipped-images.js';
import {createDebugTarget, getTargetKinds, BoardImpl, registerAllDevices} from 'bw-board';

registerAllDevices();

const BLINK_SHA256 = 'e4b90dba7f352090190432a502021df65edd8d6c202387dabf57cacbc1d6cb50';
const BLINK_BASE64 =
    '6QIAAAwAEEAAgP4/EAAAAGJsaW5rCgBvbgoAb2ZmCgAAABBAgAMAABCA/j8UgP4/eEYAQBLB8CH8/zH8/wkxDATGAQAAAEJi' +
    'ACLCBDcy9jKgAAwULQMB9v/AAAAFLAAG//8AABCA/j8wBgBgMf7/QqCIwCAAKANC1BMbIsAgACkDMfn/wCAAKANKIsAgACkD' +
    'DfAAAAC0xAQc4gBA2DkAQD0CIfz/EsHwCTEB+//AAAAIMT0CEsEQDAKR+P+gCQAAHAAAYAw3Uf7/YqB9MHcBxgQAAADAIAA4' +
    'BTAwdTc29MAgAEkHGyJCAgBWdP4N8AAARAAQQCgGAGAkBgBgBADwP4gPAECoDwBAEsHwIfr/CTEyoITAIAA5AiH4/zKgiMAg' +
    'ACgCMtMTOiIx0P8MBMAgACkDMe//DKIB8v/AAAAx7/8MRMAgACgDCDFAIiDAIAApAxLBECKkAJHr/6AJAAAAACHB/8AgACgC' +
    'DfAAACBgAA3wAAAAAAwAYM+RiJ0h/v8MBMAgADgCIfz/KjMMEjAkkw3wAAAxbndiBAwAYCgMAGAsDABgCAwAYE0CIfL/Ufn/' +
    'wCAAaAJ80leWXVH3/wwCwCAAKQVR9v9h9v/AIAApBcAgACkGxgEAAMAgACkFG0QiBABWIv9B7v/GAQAAwCAAKQQbMyIDAFYi' +
    '/zHn/wwSwCAAKQMx6P/AIAA4AwfjCTAzBHzifPQwJIMN8AAADAwAYBAMAGAx/v9B/v/AIAA4A8AgAEgEMFhBMkIAUkIBQkIE' +
    'MFD1QEhBMDh1UkICMkIDQkIFDfAgDABgJAwAYKH+/wwGKpMGCAAAAIIFAFLFAQAUQACIoULECIB3ICbEApeV58AgAHkKS2Y3' +
    'tgkMBCpWfQRG+v8AIfH/wCAAOQIN8AAAFAwAYBgMAGAcDABgjQIh/P/AIAAoAhZyBJH6/wwFxgoAwCAAqAmKZYpEDAdGBQAA' +
    'AAdAoLCRskYAi3cbZmbHBEtVxgEAZ5TnBv3/AABNAiezAU0DRzXJMez/DBTAIABJAw3wAACA/j8HgP4/C4D+PzgIAGAQAwBg' +
    'CAMAYAQDAGAioOESwdBwIhEJscmh2ZHpgflxxdb/Mfb/Qq7PwCAAKAMMDEAiEMAgACJjACHy/zKgBMAgADkCBdv/BeH/Ien/' +
    '3QwF1v8h7f/h7P/9AjKh8zJhAMXe/zIhANAiwCez8CKh9CrdDELM7MAgACkPId7/DBwF0/8G9f/AIAApDiHb/wwMBdL/BvH/' +
    'AAAAAAAAADE=';

const MS = 1_000_000;

test('ESP8266 is a picker device in its own group, with core esp8266 and the esp8266 emulator', () => {
    const d = deviceById('esp8266');
    assert.ok(d, 'esp8266 is in DEVICES');
    assert.equal(d.label, 'ESP8266');
    assert.equal(d.pickerEmulator, 'esp8266');
    assert.ok(d.sim.some(e => e.engine === 'esp8266' && e.runs.includes('bin')));
    const group = DEVICE_GROUPS.find(g => g.devices.some(x => x.id === 'esp8266'));
    assert.equal(group.core, 'esp8266');
    assert.equal(group.devices.find(x => x.id === 'esp8266').emulator, 'esp8266');
    // Until the hosted snapshot lists the target, the C cell is open and the
    // picker does not advertise compile (the conformance gate ties the two).
    assert.equal(CELLS.esp8266.c.native.where, 'hosted');
    assert.equal(d.pickerCompile, false);
    assert.equal(DEVICES.filter(x => x.id === 'esp8266').length, 1);
});

test('DEVICE ESP8266 compiles on target esp8266 as a raw bin and runs on the esp8266 debug kind', () => {
    assert.equal(compileTargetFor('esp8266'), 'esp8266');
    assert.equal(compileTargetFor('ESP8266'), 'esp8266');
    assert.equal(compileFormatFor('esp8266'), 'bin');
    assert.equal(selectDebugTargetKind('esp8266'), 'esp8266');
    assert.equal(selectDebugTargetKind('ESP8266'), 'esp8266');
    // Neighbours unchanged.
    assert.equal(selectDebugTargetKind('stm32f030'), 'stm32f0');
    assert.equal(selectDebugTargetKind('pico'), 'rp2040js');
    assert.equal(compileFormatFor('stc12c5a60s2'), 'ihx');
    assert.ok(getTargetKinds().some(k => k.kind === 'esp8266'), 'bw-board lists the esp8266 kind for the debug picker');
});

test('DEVICE ESP8266 pseudocode emits C against the esp8266js runtime API', () => {
    const c = new SB3Creator();
    c.parse('DEVICE ESP8266\nPIN led1 = GP2 OUTPUT\n\n'
        + 'WHEN flag clicked:\n  forever:\n    turn on led1\n    wait 0.5 seconds\n'
        + '    turn off led1\n    wait 0.5 seconds\n');
    const code = c.generateC(c.project, {});
    assert.match(code, /@bw device esp8266/);
    assert.match(code, /#include "Arduino\.h"/);
    assert.match(code, /pinMode\(2, OUTPUT\);/);
    assert.match(code, /digitalWrite\(2, HIGH\);/);
    assert.doesNotMatch(code, /^\s*(?:int|void) main\s*\(/m);
});

test('the ESP8266 flash image boots through bw-board and toggles GPIO2 on the board', async () => {
    const bytes = Buffer.from(BLINK_BASE64, 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), BLINK_SHA256, 'embedded fixture bytes');
    const board = new BoardImpl(3.3);
    board.setNetlist(
        [
            {id: 'ESP', kind: 'esp8266', params: {}, terminals: ['gpio2', 'gnd']},
            {id: 'R1', kind: 'resistor', params: {ohms: 220}, terminals: ['a', 'b']},
            {id: 'LED1', kind: 'led', params: {vForward: 2.0}, terminals: ['anode', 'cathode']}
        ],
        [
            {id: 'n_pin', terminals: [{part: 'ESP', terminal: 'gpio2'}, {part: 'R1', terminal: 'a'}]},
            {id: 'n_mid', terminals: [{part: 'R1', terminal: 'b'}, {part: 'LED1', terminal: 'anode'}]},
            {id: 'n_gnd', terminals: [{part: 'LED1', terminal: 'cathode'}, {part: 'ESP', terminal: 'gnd'}]}
        ]
    );
    board.setPower(true);
    const {target, adapter} = await createDebugTarget(selectDebugTargetKind('esp8266'), {image: BLINK_BASE64, board});
    assert.equal(target.kind, 'esp8266');
    let serial = '';
    adapter.onSerial(b => { serial += String.fromCharCode(b); });
    target.run();
    const lit = [];
    for (const ms of [250, 750, 1250, 1750]) {
        assert.equal(target.runFor((ms * MS) - Number(adapter.timeNs())), 'budget');
        lit.push(board.ledBrightness('LED1') > 0.1);
    }
    assert.deepEqual(lit, [false, true, false, true], 'GPIO2 off, on at 500 ms, off at 1000 ms, on at 1500 ms');
    assert.equal(serial, 'blink\non\noff\non\n');
    assert.equal(adapter.fault, null);
});
