import {test} from 'node:test';
import assert from 'node:assert/strict';
import {I8086} from '../overlay/scratch-gui/src/lib/bw-board/i8086.js';
import {createRegisterBlockExperiment} from '../scripts/lib/i8086-block-experiment.mjs';
const state = cpu => Object.fromEntries(['ax','bx','cx','dx','sp','bp','si','di','cs','ds','es','ss','ip','flags','cycles','intShadow','halted'].map(k => [k,cpu[k]]));
function fixture(program) {
    const mem = new Uint8Array(1 << 20);
    mem.set(program, 0x100);
    const cpu = new I8086({read: a => mem[a], write: (a,v) => {mem[a] = v;}});
    cpu.cs = 0; cpu.ip = 0x100;
    return {cpu,mem};
}

test('Wasm counted loops remain inside the cycle budget and materialize identical state', () => {
    // MOV CX,500; INC AX; XOR AX,1234h; INC DX; LOOP inner; JMP start.
    const program = [0xb9,0xf4,1,0x40,0x35,0x34,0x12,0x42,0xe2,0xf9,0xeb,0xf4];
    const a = fixture(program), b = fixture(program);
    const engine = createRegisterBlockExperiment(b.cpu,b.mem,'wasm');
    for (const deadline of [10000,10001,10003,12345,50000,100000]) {
        while (a.cpu.cycles < deadline) a.cpu.step();
        engine.runUntil(deadline);
        assert.deepEqual(state(b.cpu),state(a.cpu));
    }
    assert.ok(engine.stats.loopIterations > 1000, 'must execute whole counted loops in Wasm');
});

for (const mode of ['decoded','wasm']) {
    test(`${mode} register blocks match instruction execution, including arithmetic flags`, () => {
        let seed = 8086;
        const random = () => { seed = (Math.imul(seed,1664525) + 1013904223) >>> 0; return seed; };
        for (let trial = 0; trial < 100; trial++) {
            const code = [];
            for (let i = 0; i < 16; i++) {
                const pick = random() % 6, reg = random() & 7;
                if (pick === 0) code.push(0xb8 | reg, random() & 255, random() & 255);
                if (pick === 1) code.push(0x40 | reg);
                if (pick === 2) code.push(0x48 | reg);
                if (pick === 3) code.push([5,0x35,0x3d][random()%3], random() & 255, random() & 255);
                if (pick === 4) code.push([1,3,0x31,0x33,0x39,0x3b,0x89,0x8b][random()&7], 0xc0 | random() & 63);
                if (pick === 5) code.push(0x90);
            }
            code.push(0xeb, (-code.length - 2) & 255);
            const a = fixture(code), b = fixture(code);
            for (const name of ['ax','bx','cx','dx','sp','bp','si','di','flags']) a.cpu[name] = b.cpu[name] = random() & (name === 'flags' ? 0xfeff : 65535);
            const engine = createRegisterBlockExperiment(b.cpu,b.mem,mode);
            while (a.cpu.cycles < 10000) a.cpu.step();
            engine.runUntil(10000);
            assert.deepEqual(state(b.cpu), state(a.cpu));
            assert.ok(engine.stats.blocks > 0);
            if (mode === 'wasm') assert.ok(engine.stats.compilations > 0, 'must exercise generated code, not only fallback');
        }
    });

    test(`${mode} validates direct code mutations and exits to the traced interpreter`, () => {
        const a = fixture([0xb8,1,0,0x40,0x90,0xeb,0xf9]), b = fixture([0xb8,1,0,0x40,0x90,0xeb,0xf9]);
        const engine = createRegisterBlockExperiment(b.cpu,b.mem,mode);
        for (const deadline of [10000,20000,30000]) {
            a.mem[0x101]++; b.mem[0x101]++;
            while (a.cpu.cycles < deadline) a.cpu.step();
            engine.runUntil(deadline);
            assert.deepEqual(state(b.cpu),state(a.cpu));
        }
        assert.ok(engine.stats.invalidations > 0);
        a.cpu.busTrace = []; b.cpu.busTrace = [];
        while (a.cpu.cycles < 31000) a.cpu.step();
        engine.runUntil(31000);
        assert.deepEqual(state(b.cpu),state(a.cpu));
        assert.deepEqual(b.cpu.busTrace,a.cpu.busTrace);
    });
}
