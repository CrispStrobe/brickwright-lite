import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = 'overlay/scratch-gui/src/lib/bw-circuit-ui';
const canvas = readFileSync(`${root}/components/BoardCanvas.jsx`, 'utf8');
const thumbnail = readFileSync(`${root}/components/PartThumbnail.jsx`, 'utf8');
const wrappers = readFileSync(`${root}/wokwi-wrappers/index.js`, 'utf8');
const notices = readFileSync('THIRD-PARTY-NOTICES.md', 'utf8');

test('Arduino controller faces use the declared MIT Wokwi source on canvas and palette', () => {
    for (const name of ['WokwiArduinoUno', 'WokwiArduinoNano', 'WokwiArduinoMega']) {
        assert.ok(wrappers.includes(`export const ${name}`), `${name} wrapper exists`);
        assert.ok(canvas.includes(name), `${name} is used by the canvas`);
        assert.ok(thumbnail.includes(name), `${name} is used by the Webpack-safe palette`);
    }
    assert.ok(canvas.includes("data-board-face-license={WokwiFace ? 'MIT' : 'code'}"));
    assert.match(notices, /@wokwi\/elements[\s\S]{0,300}MIT/i);
});

test('Arduino comparator bench clears the breadboard and powers the real board pins', () => {
    const circuit = JSON.parse(readFileSync(
        'overlay/scratch-gui/examples/17-comparator/circuit.arduino-uno.json', 'utf8'));
    const uno = circuit.parts.find(p => p.kind === 'arduino_uno');
    const board = circuit.parts.find(p => p.kind === 'breadboard');
    assert.ok(uno && board);
    const unoBottom = uno.y + (53.34 * 14 / 2.54) / 2;
    const breadboardTop = board.y - 310 / 2;
    assert.ok(breadboardTop - unoBottom >= 39.9, 'physical Uno face has a 40-unit clearance');
    assert.ok(uno.terminals.includes('5v'));
    assert.ok(uno.terminals.includes('gnd2'));
    const hasWire = (fromKind, terminal) => circuit.wires.some(w => {
        const from = circuit.parts.find(p => p.id === w.from);
        return from?.kind === fromKind && w.to === uno.id && w.toTerminal === terminal;
    });
    assert.ok(hasWire('vcc', '5v'), 'VCC is wired to the Uno 5V header');
    assert.ok(hasWire('gnd', 'gnd2'), 'GND is wired to the Uno GND header');
});
