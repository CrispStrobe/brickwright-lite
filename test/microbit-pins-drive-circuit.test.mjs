/**
 * A micro:bit program can light an LED in a Circuit.
 *
 * These blocks began as a VOCABULARY. `set pin P0 to 1` existed so the
 * emitter had something to lower to MicroPython or C, and the extension
 * method behind it was `digitalwrite() {}` — empty, because the code was
 * going to run on real hardware, not here. In the editor the block did
 * nothing at all.
 *
 * That was invisible rather than obviously broken, because everything
 * AROUND it already worked: the `microbit` part is in the parts library
 * with terminals p0/p1/p2/3v/gnd, you can wire it to an LED, the solver
 * runs. Only the one hop from the block to the board was missing, so the
 * whole thing read as "the simulation does not work" rather than "this
 * verb is a no-op".
 *
 * `board.setPin` is the board's own documented Boundary A (McuToBoard) —
 * the same entry point the Arduboy console drives — so this is a wiring
 * job, not a new mechanism.
 */

import {test} from 'node:test';
import assert from 'node:assert/strict';

import {loadExtensionClass, stubRuntime} from './helpers/bw-extensions.mjs';

/** A Board that records what the MCU did to it. */
const recordingBoard = (readings = {}) => {
    const calls = [];
    return {
        calls,
        setPin (pin, mode, driveHigh) { calls.push({pin, mode, driveHigh}); },
        readPin (pin) { return readings[pin] === undefined ? 0 : readings[pin]; },
        readPinVoltage (pin) { return readings[`${pin}:v`] || 0; }
    };
};

/** The extension, constructed against a runtime holding `board`. */
const withBoard = board => {
    const Extension = loadExtensionClass('microbitplus');
    const runtime = stubRuntime();
    runtime.circuitBoard = board;
    return new Extension(runtime);
};

test('setting a pin reaches the board', () => {
    const board = recordingBoard();
    const ext = withBoard(board);

    ext.digitalwrite({PIN: '0', LEVEL: '1'});
    ext.digitalwrite({PIN: '1', LEVEL: '0'});

    assert.deepEqual(board.calls, [
        {pin: 'p0', mode: 'pushpull', driveHigh: true},
        {pin: 'p1', mode: 'pushpull', driveHigh: false}
    ]);
});

test('the menu says 0 and the part says p0, so both are accepted', () => {
    // The gpio menu offers '0'..'16'; the part's terminals are named p0,
    // p1, p2. A reporter dropped into the slot can produce either.
    const board = recordingBoard();
    const ext = withBoard(board);
    ext.digitalwrite({PIN: '2', LEVEL: '1'});
    ext.digitalwrite({PIN: 'P2', LEVEL: '1'});
    ext.digitalwrite({PIN: ' p2 ', LEVEL: '1'});
    assert.deepEqual(board.calls.map(c => c.pin), ['p2', 'p2', 'p2']);
});

test('reading a pin declares it an input first', () => {
    // Left as whatever it was, the solver sees a terminal nothing
    // declared — and a pin previously driven high would read back its own
    // drive rather than the circuit.
    const board = recordingBoard({p1: 1});
    const ext = withBoard(board);

    assert.equal(ext.digitalread({PIN: '1'}), 1);
    assert.deepEqual(board.calls, [{pin: 'p1', mode: 'input', driveHigh: false}]);
    assert.equal(ext.ispinhigh({PIN: '1'}), true);
    assert.equal(ext.ispinhigh({PIN: '0'}), false);
});

test('analog read reports the block\'s 0..1023, not the solver\'s volts', () => {
    // The board works in volts against a 3.3 V rail. Leaking that through
    // a block whose documented range is 0..1023 is how a lesson's numbers
    // stop matching its own text.
    const ext = withBoard(recordingBoard({'p0:v': 3.3, 'p1:v': 1.65, 'p2:v': 0}));
    assert.equal(ext.analogread({PIN: '0'}), 1023);
    assert.equal(ext.analogread({PIN: '1'}), 512);
    assert.equal(ext.analogread({PIN: '2'}), 0);
});

test('a nonsense voltage reads zero rather than NaN', () => {
    const board = recordingBoard();
    board.readPinVoltage = () => NaN;
    assert.equal(withBoard(board).analogread({PIN: '0'}), 0);
});

test('pull mode reaches the board as a pull mode', () => {
    const board = recordingBoard();
    const ext = withBoard(board);
    ext.setpull({PIN: '0', MODE: 'up'});
    ext.setpull({PIN: '0', MODE: 'down'});
    ext.setpull({PIN: '0', MODE: 'none'});
    assert.deepEqual(board.calls.map(c => c.mode),
        ['input-pullup', 'input-pulldown', 'input']);
    assert.equal(board.calls[0].driveHigh, true, 'a pull-up holds the pin high');
});

test('analog write is a threshold, and says so', () => {
    // There is no PWM in the solver — a duty cycle is a time average and
    // the board is solved per instant. Driving high above half is right at
    // both ends of the range and wrong in the middle; the test pins the
    // behaviour so nobody later reads it as dimming.
    const board = recordingBoard();
    const ext = withBoard(board);
    for (const pct of [0, 49, 50, 100]) ext.analogwrite({PIN: '0', PCT: pct});
    assert.deepEqual(board.calls.map(c => c.driveHigh), [false, false, true, true]);
});

test('with no circuit open, the blocks are quiet and do not throw', () => {
    // The ordinary case: someone is writing a micro:bit program with no
    // Circuit tab. Every one of these has to be a no-op, not an error.
    const ext = withBoard(null);
    assert.doesNotThrow(() => {
        ext.digitalwrite({PIN: '0', LEVEL: '1'});
        ext.analogwrite({PIN: '0', PCT: 100});
        ext.setpull({PIN: '0', MODE: 'up'});
    });
    assert.equal(ext.digitalread({PIN: '0'}), 0);
    assert.equal(ext.analogread({PIN: '0'}), 0);
    assert.equal(ext.ispinhigh({PIN: '0'}), false);
});

test('the board is re-read per call, because the host rebuilds it', () => {
    // circuit-tab rebuilds the Board whenever the netlist changes, so an
    // extension that captured one at construction would drive a board that
    // is no longer on screen — silently, since the old object still works.
    const Extension = loadExtensionClass('microbitplus');
    const runtime = stubRuntime();
    const first = recordingBoard();
    runtime.circuitBoard = first;
    const ext = new Extension(runtime);
    ext.digitalwrite({PIN: '0', LEVEL: '1'});

    const second = recordingBoard();
    runtime.circuitBoard = second;
    ext.digitalwrite({PIN: '0', LEVEL: '1'});

    assert.equal(first.calls.length, 1, 'the first board kept receiving writes');
    assert.equal(second.calls.length, 1, 'the rebuilt board never received one');
});

// ── the whole way through, with no mock anywhere ────────────────────────

test('a micro:bit block lights a real LED through the real solver', async () => {
    // Everything above uses a recording Board, which proves the extension
    // calls the right method and nothing else. This builds the circuit a
    // learner would draw — micro:bit P0, 220R, red LED, ground — hands it
    // to the actual MNA solver, and drives it from the BLOCK.
    const B = '../packages/scratch-gui/src/lib/bw-board';
    const {BoardImpl} = await import(`${B}/index.js`);
    const {registerAllDevices} = await import(`${B}/register-all.js`);
    registerAllDevices();

    const board = new BoardImpl(3.3);
    board.setNetlist([
        // The solver takes a generic `mcu`; `microbit` is the parts-library
        // name the circuit editor uses, and its terminals become pins.
        {id: 'mb', kind: 'mcu', terminals: ['p0', 'gnd']},
        {id: 'r1', kind: 'resistor', params: {ohms: 220}, terminals: ['a', 'b']},
        {id: 'd1', kind: 'led', params: {color: 'red'}, terminals: ['anode', 'cathode']},
        {id: 'g1', kind: 'gnd', terminals: ['gnd']}
    ], [
        {id: 'n1', terminals: [{part: 'mb', terminal: 'p0'}, {part: 'r1', terminal: 'a'}]},
        {id: 'n2', terminals: [{part: 'r1', terminal: 'b'}, {part: 'd1', terminal: 'anode'}]},
        {id: 'n3', terminals: [
            {part: 'd1', terminal: 'cathode'},
            {part: 'g1', terminal: 'gnd'},
            {part: 'mb', terminal: 'gnd'}
        ]}
    ]);

    const Extension = loadExtensionClass('microbitplus');
    const runtime = stubRuntime();
    runtime.circuitBoard = board;
    const ext = new Extension(runtime);

    ext.digitalwrite({PIN: '0', LEVEL: '0'});
    assert.equal(board.ledBrightness('d1'), 0, 'the LED was lit with the pin low');

    ext.digitalwrite({PIN: '0', LEVEL: '1'});
    const brightness = board.ledBrightness('d1');
    assert.ok(brightness > 0.1, `pin high left the LED at ${brightness}`);

    // And the current is right, which is the part a wiring bug cannot fake:
    // 3.3 V across 220R and a red LED's ~2.2 V forward drop is about 5 mA.
    const mA = board.branchCurrent('d1', 'anode') * 1000;
    assert.ok(mA > 4 && mA < 6.5, `${mA.toFixed(2)} mA is not a 220R red LED at 3.3 V`);
});
