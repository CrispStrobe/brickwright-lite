import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createI8086DosBench} from '../overlay/scratch-gui/src/lib/bw-debug/i8086-dos-bench.js';
import {demo, load} from '../overlay/scratch-gui/src/lib/bw-286-lab/runtime.js';

test('existing 8086 DOS bench runs an owned COM that prints and terminates', async () => {
    // MOV AH,09; MOV DX,010C; INT 21; MOV AX,4C00; INT 21; "Hi\r\n$".
    const bytes = Uint8Array.from([0xb4,9,0xba,0x0c,1,0xcd,0x21,0xb8,0,0x4c,0xcd,0x21,72,105,13,10,36]);
    let output = '';
    const bench = await createI8086DosBench({format: 'com', bytes, onChar: ch => { output += ch; }});
    for (let i = 0; i < 1000 && !bench.dos.terminated; i++) bench.step();
    assert.equal(bench.dos.terminated, true);
    assert.equal(bench.dos.exitCode, 0);
    assert.equal(output, 'Hi\r\n');
    assert.deepEqual(bench.dos.report().unsupported, []);
});

test('wired 286 subset refuses INT 21 rather than pretending to provide DOS', () => {
    const recipe = demo(); recipe.rom.splice(0x100, 3, 0xcd, 0x21, 0xf4);
    const session = load(recipe); session.initialize();
    assert.throws(() => session.run(), /UNSUPPORTED_OPCODE: 0xcd/);
    assert.equal(session.inspect().status, 'faulted');
    assert.equal(session.inspect().retired, 1, 'only the reset far jump retired');
});
