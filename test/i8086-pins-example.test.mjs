// THE SHIPPED PINS EXAMPLE — the one a learner clicks, driven the way they
// drive it.
//
// Every other 8086 example prints to the screen. This one's entire output is
// the PINS, which is what the LED panel exists to show and what half the
// device corpus does. A gate that only checked it assembles would miss the
// thing that makes it worth shipping: that flipping a switch changes what the
// lamps do.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const L = new URL('../overlay/scratch-gui/src/lib/', import.meta.url);
const EXAMPLES = (await import(new URL('bw-asm/examples-i8086.js', L).href)).default;
const { requestAssembly } = await import(new URL('bw-asm/assemble-route.js', L).href);
const { createI8086DosBench } = await import(new URL('bw-debug/i8086-dos-bench.js', L).href);

const pins = EXAMPLES.find((e) => e.id === 'pins');

test('the example ships and carries NO borrowed attribution', () => {
    // The other examples are Amey Thakur's and a blanket `.map` stamps his
    // name on everything it touches. This one is ours; riding on that map
    // would attribute our work to him, which is the same error as leaving his
    // off his.
    assert.ok(pins, 'the pins example is in the shipped list');
    assert.equal(pins.attribution, undefined,
        'ours, so no third-party attribution -- and the .map must not have reached it');
    const amey = EXAMPLES.filter((e) => e.attribution);
    assert.ok(amey.length >= 6, 'while the borrowed ones still carry theirs');
});

test('it assembles LOCALLY, with no network', async () => {
    const out = await requestAssembly({ source: pins.source, device: 'i8086' },
        {hostedFetch: () => { throw new Error('an 8086 example must never reach the network'); }});
    assert.equal(out.route, 'local');
    assert.ok(out.bytes.length > 20, `${out.bytes.length} bytes`);
});

test('THE SWITCH DECIDES WHAT THE LAMPS DO — both ways', async () => {
    const out = await requestAssembly({ source: pins.source, device: 'i8086' });
    const run = async (closed) => {
        const b = await createI8086DosBench({ bytes: out.bytes, format: out.format });
        // CLOSED pulls the line LOW, which is how a breadboard button is wired
        // and what the switch panel sends. An undriven input floats HIGH, so
        // "open" is the 1 and this program tests for zero.
        if (closed) b.target.setInput('ppi1', 'c', 0, 0);
        for (let i = 0; i < 400_000; i++) b.step();
        return b.target.outputs().find((o) => o.port === 'a');
    };
    assert.equal((await run(false)).value & 0x0f, 0b0000, 'open: the low four lamps are dark');
    assert.equal((await run(true)).value & 0x0f, 0b1111, 'closed: all four are lit');
});

test('it configures the 8255 once, and port C lower is the INPUT half', async () => {
    // 81h: mode 0, port C LOWER an input and everything else an output. A
    // second mode word would clear every latch and darken the lamps.
    const writes = pins.source.match(/MOV\s+DX,\s*PPI_CTRL/gi) || [];
    assert.equal(writes.length, 1, 'exactly one control-register write');
    assert.match(pins.source, /MOV\s+AL,\s*81H/i);
});

test('it never exits, and that is the correct behaviour', () => {
    // A panel of lamps and switches is a thing you watch. A program that
    // terminated would be the bug, and a gate that asserted termination would
    // have demanded it.
    assert.match(pins.source, /JMP\s+MAIN/i, 'the loop is unconditional');
    assert.doesNotMatch(pins.source, /MOV\s+AX,\s*4C00H/i,
        'and there is deliberately no exit call');
});
