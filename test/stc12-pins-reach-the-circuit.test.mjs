/**
 * A pin block must move the CIRCUIT, not only the extension's own bag.
 *
 * WHAT WAS MEASURED. The owner reported 12-dual-blink showing its two LEDs
 * wrongly. On the live page, after the green flag: the example had compiled to
 * ten blocks including stc12_setpin, a thread was running them, the extension's
 * pin bag held `led1: 1, led2: 0` — correctly complementary, active-low applied —
 * and `runtime.circuitBoard` was attached and was the very object the renderer
 * reads. The board never received one write. `board(runtime)` in that extension
 * returns `runtime._stc12Pins`, a plain key/value bag keyed by the DECLARED NAME;
 * the circuit is a separate object keyed by the PHYSICAL PIN. Nothing joined them.
 *
 * WHAT THAT LOOKED LIKE, AND WHY IT LOOKED PLAUSIBLE. With no pin writes arriving,
 * CircuitDesigner falls back to the demo loop it runs when no external board is
 * driving — and that loop drives every pin it classified as an output from ONE
 * shared on/off value. So the LEDs blinked. On 01-blink, with a single LED, the
 * result is indistinguishable from the program working. On this example the two
 * LEDs lit together instead of alternating, which is how it was noticed.
 *
 * WHY THE CASES BELOW USE THE SHIPPED CIRCUITS. The pin a board answers to is the
 * header name, and the families spell it differently: 8051 declarations carry
 * port/bit and spell it P1.0, Arduino and Pico declarations carry `where` and
 * spell it D13 or GP15. A synthetic bench would prove the join under whatever
 * spelling this test invented. So each case reads the circuit the example
 * actually ships for that device and DERIVES the pin from the wire between the
 * MCU and the LED, which is the same fact the renderer depends on.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EX = path.join(ROOT, 'overlay/scratch-gui/examples/12-dual-blink');

const {BoardImpl} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/board.js'));
const {registerAllDevices} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-board/register-all.js'));
const {terminalsForKind} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-circuit-ui/model/circuit.js'));
registerAllDevices();

// The extension body is the template string handed to makeExt(`...`), loaded the
// way test/stc12live-write.test.mjs already loads its sibling.
const SRC = readFileSync(
    path.join(ROOT, 'overlay/scratch-vm/src/extensions/crispstrobe/stc12/index.js'), 'utf8');
const BODY = SRC.slice(SRC.indexOf('`') + 1, SRC.lastIndexOf('`'));

const loadInstance = () => {
    let inst = null;
    const Scratch = {
        extensions: {register (x) { inst = x; }, unsandboxed: true},
        translate: o => (o && o.default) || o,
        BlockType: {}, ArgumentType: {}, TargetType: {}
    };
    // eslint-disable-next-line no-new-func
    new Function('Scratch', BODY)(Scratch);
    return inst;
};

/** Build the board from a shipped circuit, and say which MCU pin each LED is on. */
const bench = file => {
    const circuit = JSON.parse(readFileSync(file, 'utf8'));
    const parts = circuit.parts.filter(p => p.kind !== 'breadboard').map(p => ({...p,
        terminals: (p.terminals && p.terminals.length) ? p.terminals
            : (p.seat ? Object.keys(p.seat.leadMap) : terminalsForKind(p.kind, p.params))}));
    const ids = new Set(parts.map(p => p.id));
    const nets = circuit.wires
        .filter(w => typeof w.to === 'string' && ids.has(w.from) && ids.has(w.to))
        .map((w, i) => ({id: `n${i}`, terminals: [
            {part: w.from, terminal: w.fromTerminal}, {part: w.to, terminal: w.toTerminal}]}));
    const board = new BoardImpl(5);
    board.setNetlist(parts, nets);

    // Which MCU terminal each LED sits on. The LED reaches the pin through its
    // series resistor, so follow one hop: LED -> resistor -> MCU.
    // The MCU is not always kind 'mcu': the board-class devices are arduino_uno,
    // pi_pico, stm32f030 and so on. Naming the PASSIVES is the stable half of
    // that distinction, and it is why this survives a new board kind.
    const PASSIVE = new Set(['breadboard', 'vcc', 'gnd', 'resistor', 'led', 'capacitor', 'wire']);
    const mcu = circuit.parts.find(p => !PASSIVE.has(p.kind));
    const mcuId = mcu && mcu.id;
    const wires = circuit.wires.filter(w => typeof w.to === 'string');
    const neighbours = id => wires.flatMap(w =>
        (w.from === id ? [{part: w.to, terminal: w.toTerminal}]
            : w.to === id ? [{part: w.from, terminal: w.fromTerminal}] : []));
    const pinOf = ledId => {
        const seen = new Set([ledId]);
        let frontier = neighbours(ledId);
        for (let hop = 0; hop < 3; hop++) {
            const direct = frontier.find(n => n.part === mcuId);
            if (direct) return direct.terminal;
            const next = [];
            for (const n of frontier) {
                if (seen.has(n.part)) continue;
                seen.add(n.part);
                next.push(...neighbours(n.part));
            }
            frontier = next;
        }
        return null;
    };
    const leds = parts.filter(p => p.kind === 'led').map(p => ({id: p.id, pin: pinOf(p.id)}));
    return {board, leds};
};

/** A runtime shaped the way the VM shapes it, carrying the two declarations. */
const runtimeFor = (board, leds, spell) => ({
    circuitBoard: board,
    stc: {
        device: 'stc12c5a60s2',
        pins: leds.map((led, i) => ({
            name: `led${i + 1}`,
            direction: 'output',
            activeLow: true,
            ...spell(led)
        }))
    }
});

// One row per way a family spells a pin. `where` is what Arduino and Pico
// declarations carry; port/bit is what an 8051 declaration carries. Both must
// reach the same board, because the board only knows header names.
const CASES = [
    ['8051 STC12, spelled port/bit', 'circuit.stc12c5a60s2.json', led => {
        const m = /^P(\d+)\.(\d+)$/i.exec(led.pin || '');
        return m ? {port: Number(m[1]), bit: Number(m[2])} : {where: led.pin};
    }],
    ['8051 STC89, spelled port/bit', 'circuit.stc89c52rc.json', led => {
        const m = /^P(\d+)\.(\d+)$/i.exec(led.pin || '');
        return m ? {port: Number(m[1]), bit: Number(m[2])} : {where: led.pin};
    }],
    ['AVR Uno, spelled where', 'circuit.arduino-uno.json', led => ({where: led.pin})],
    ['AVR Mega, spelled where', 'circuit.arduino-mega.json', led => ({where: led.pin})],
    ['RP2040 Pico, spelled where', 'circuit.pico.json', led => ({where: led.pin})],
    ['STM32, spelled where', 'circuit.stm32f030.json', led => ({where: led.pin})]
];

const lit = v => typeof v === 'number' && v > 0.01;

for (const [label, file, spell] of CASES) {
    const full = path.join(EX, file);
    test(`a pin block moves the circuit, and the pair alternates: ${label}`, {
        skip: existsSync(full) ? false : `${file} is not in this checkout`
    }, () => {
        const {board, leds} = bench(full);
        assert.equal(leds.length, 2, `${file} should wire two LEDs, found ${leds.length}`);
        for (const led of leds) {
            assert.ok(led.pin, `${led.id} is not traceable to an MCU pin in ${file}`);
        }
        const ext = loadInstance();
        const runtime = runtimeFor(board, leds, spell);

        // Phase one, exactly as the example's program writes it.
        ext.setpin.call({runtime}, {PIN: 'led1', STATE: 'on'});
        ext.setpin.call({runtime}, {PIN: 'led2', STATE: 'off'});
        board.advanceTo(board.timeNs + 50_000_000n);
        const a = {one: board.ledBrightness(leds[0].id), two: board.ledBrightness(leds[1].id)};

        // Phase two. The pair must SWAP, which is the whole point of the example
        // and the thing the demo blink can never do: it drives both from one value.
        ext.setpin.call({runtime}, {PIN: 'led1', STATE: 'off'});
        ext.setpin.call({runtime}, {PIN: 'led2', STATE: 'on'});
        board.advanceTo(board.timeNs + 50_000_000n);
        const b = {one: board.ledBrightness(leds[0].id), two: board.ledBrightness(leds[1].id)};

        // COMPLEMENTARY, not "led1 is the lit one". Only the authored 8051
        // circuit wires the LEDs the way the program declares them: the
        // generated benches for the other devices put the LED between the pin
        // and ground (ACTIVE HIGH) while the retargeted program still declares
        // ACTIVE LOW, so which LED is lit is inverted there. That is a real and
        // separate defect in the generated benches. Asserting the lit one here
        // would make this test fail for that reason instead of its own, and
        // asserting nothing would let the join break unnoticed — so it asserts
        // the property that holds under either wiring and is exactly what the
        // owner reported missing: at any moment one LED is lit and one is not,
        // and they trade places.
        assert.ok(lit(a.one) !== lit(a.two),
            `${label}: after "on/off" both LEDs read the same — led1 ${a.one}, led2 ${a.two}` +
            ' — the block wrote its own bag and the circuit never heard it');
        assert.ok(lit(b.one) !== lit(b.two),
            `${label}: after "off/on" both LEDs read the same — led1 ${b.one}, led2 ${b.two}`);
        assert.ok(lit(a.one) !== lit(b.one),
            `${label}: led1 did not change between the phases — ${a.one} then ${b.one}`);
    });
}

test('ACTIVE LOW is honoured at the circuit, not only in the bag', () => {
    // The inversion already worked in the bag; this pins it at the board, which
    // is where a learner sees it. Without the join the LED reads 0 either way,
    // and a test that only compared the two phases would still pass.
    const {board, leds} = bench(path.join(EX, 'circuit.stc12c5a60s2.json'));
    const ext = loadInstance();
    const m = /^P(\d+)\.(\d+)$/i.exec(leds[0].pin);
    const runtime = {
        circuitBoard: board,
        stc: {device: 'stc12c5a60s2', pins: [
            {name: 'led1', direction: 'output', activeLow: true, port: Number(m[1]), bit: Number(m[2])}
        ]}
    };
    ext.setpin.call({runtime}, {PIN: 'led1', STATE: 'on'});
    board.advanceTo(board.timeNs + 50_000_000n);
    const state = board.getPinState ? board.getPinState(leds[0].pin) : null;
    assert.ok(state, `no pin state for ${leds[0].pin}`);
    assert.equal(state.driveHigh, false,
        'an ACTIVE LOW pin turned on must be driven LOW at the board, which is what sinks the LED');
});

test('writepin and toggle reach the circuit too', () => {
    // setpin was the reported block. The other two writers share the same bag and
    // would have kept the same defect, one report later.
    const {board, leds} = bench(path.join(EX, 'circuit.stc12c5a60s2.json'));
    const ext = loadInstance();
    const m = /^P(\d+)\.(\d+)$/i.exec(leds[0].pin);
    const runtime = {
        circuitBoard: board,
        stc: {device: 'stc12c5a60s2', pins: [
            {name: 'led1', direction: 'output', activeLow: true, port: Number(m[1]), bit: Number(m[2])}
        ]}
    };
    ext.writepin.call({runtime}, {PIN: 'led1', VALUE: 0});   // a raw 0 drives the pin low
    board.advanceTo(board.timeNs + 50_000_000n);
    assert.ok(lit(board.ledBrightness(leds[0].id)), 'writepin 0 did not reach the board');

    ext.toggle.call({runtime}, {PIN: 'led1'});               // back to 1
    board.advanceTo(board.timeNs + 50_000_000n);
    assert.ok(!lit(board.ledBrightness(leds[0].id)), 'toggle did not reach the board');
});

test('no circuit attached is still not an error', () => {
    // Running a project with no circuit is normal and predates the join. The
    // forwarder must stay quiet, and the bag must still be written, or every
    // project without a circuit breaks to fix one that has one.
    const ext = loadInstance();
    const runtime = {stc: {device: 'stc12c5a60s2', pins: [
        {name: 'led1', direction: 'output', activeLow: true, port: 1, bit: 0}
    ]}};
    ext.setpin.call({runtime}, {PIN: 'led1', STATE: 'on'});
    assert.equal(runtime._stc12Pins.led1, 0, 'the bag must still record an ACTIVE LOW on as 0');
});

test('a board that throws mid-rebuild does not take the program down', () => {
    // The board is rebuilt whenever the circuit is edited. A write landing in
    // that window must not become an exception inside a running block.
    const ext = loadInstance();
    const runtime = {
        circuitBoard: {setPin () { throw new Error('rebuilding'); }},
        stc: {device: 'stc12c5a60s2', pins: [
            {name: 'led1', direction: 'output', activeLow: true, port: 1, bit: 0}
        ]}
    };
    ext.setpin.call({runtime}, {PIN: 'led1', STATE: 'on'});
    assert.equal(runtime._stc12Pins.led1, 0, 'the bag write must survive a throwing board');
});
