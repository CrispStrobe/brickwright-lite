import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {extract6502Machine} from '../overlay/scratch-gui/src/lib/bw-board/m6502-extract.js';
import {createM6502Adapter} from '../overlay/scratch-gui/src/lib/bw-board/m6502-adapter.js';
import {PS2Keyboard} from '../overlay/scratch-gui/src/lib/bw-board/ps2.js';
import {ControllerPanel} from '../overlay/scratch-gui/src/lib/bw-board/controller.js';
import {bindPanelToBoard} from '../overlay/scratch-gui/src/lib/bw-board/controller-binding.js';
import {registerAllDevices} from '../overlay/scratch-gui/src/lib/bw-board/register-all.js';
import {BoardImpl} from '../overlay/scratch-gui/src/lib/bw-board/board.js';
import {terminalsForKind} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/circuit.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = resolve(root, 'overlay/scratch-gui/examples/aurora65-workstation');
const circuit = JSON.parse(readFileSync(`${base}/circuit.json`, 'utf8'));
const rom = new Uint8Array(readFileSync(`${base}/rom.bin`));

test('Aurora-65 circuit physically wires OLED, 8-bit PS/2 capture, CA1 and VGA bank/bus', () => {
  const wired = (a, at, b, bt) => circuit.wires.some(w =>
    ((w.from === a && w.fromTerminal === at && w.to === b && w.toTerminal === bt) ||
     (w.from === b && w.fromTerminal === bt && w.to === a && w.toTerminal === at)));
  assert.ok(wired('via', 'pb1', 'oled1', 'sda'));
  assert.ok(wired('via', 'pb2', 'oled1', 'scl'));
  for (let i = 0; i < 8; i++) assert.ok(wired('via', `pa${i}`, 'kbd', `d${i}`));
  assert.ok(wired('via', 'ca1', 'kbd', 'da'));
  assert.ok(wired('via', 'pb0', 'vga', 'bank'));
  assert.ok(wired('cpu', 'd0', 'vga', 'bus'));
  const ex = extract6502Machine(circuit);
  assert.equal(ex.ok, true, ex.reasons.join('; '));
  assert.deepEqual(ex.peripherals[0], {kind:'ps2', name:'kbd', via:'via', port:'a', control:'ca1'});
  assert.ok(ex.chips.some(c => c.kind === 'simplevga' && c.name === 'vga'));
});

test('shipped ROM boots the VGA card and consumes a real PS/2 scan-code frame through VIA CA1', () => {
  const ex = extract6502Machine(circuit);
  const kbd = new PS2Keyboard();
  const videoState = {_video:null, videoFrame() { return this._video?.videoFrame() || null; }};
  const board = {
    parts: circuit.parts,
    nets: circuit.wires.filter(w => typeof w.to === 'string').map((w, i) => ({id:`n${i}`, terminals:[
      {part:w.from, terminal:w.fromTerminal}, {part:w.to, terminal:w.toTerminal},
    ]})),
    getDeviceState(id) { return id === 'kbd' ? {_kbd:kbd} : id === 'vga' ? videoState : null; },
    setPin() {}, readPin() { return 0; }, advanceTo() {},
  };
  const adapter = createM6502Adapter({config:{clockHz:1_000_000, regions:ex.regions, chips:ex.chips}, rom});
  adapter.attachBoard(board);
  adapter.advanceNs(4_000_000_000);
  const card = adapter.machine.chips.vga;
  assert.equal(card.signal(), true, 'ROM wrote valid VGA sync timing');
  assert.ok(videoState.videoFrame()?.rgba?.some(v => v !== 0), 'physical part exposes the machine frame');
  const before = card.writes;
  kbd.keyDown('a'); kbd.keyUp('a');
  adapter.advanceNs(500_000_000);
  assert.ok(card.writes > before, 'firmware consumed PS/2 bytes and drew their colour trail');
});

test('shipped ROM bit-bangs the drawn VIA nets into actual SSD1306 GDDRAM', () => {
  registerAllDevices();
  const parts = circuit.parts.filter(p => p.kind !== 'breadboard').map(p => ({
    ...p,
    terminals: p.seat ? Object.keys(p.seat.leadMap) : terminalsForKind(p.kind, p.params),
  }));
  const ids = new Set(parts.map(p => p.id));
  const nets = circuit.wires.filter(w => typeof w.to === 'string' && ids.has(w.from) && ids.has(w.to))
    .map((w, i) => ({id:`n${i}`, terminals:[
      {part:w.from, terminal:w.fromTerminal}, {part:w.to, terminal:w.toTerminal},
    ]}));
  const board = new BoardImpl(5);
  board.setNetlist(parts, nets);
  const ex = extract6502Machine(circuit);
  const adapter = createM6502Adapter({config:{clockHz:1_000_000, regions:ex.regions, chips:ex.chips}, rom});
  adapter.attachBoard(board);
  adapter.advanceNs(4_000_000_000);
  const oled = board.getDeviceState('oled1');
  assert.equal(oled.displayOn, true);
  assert.ok(oled.fb.some(byte => byte !== 0), 'real I2C decoder received visible GDDRAM bytes');
});

test('part-bound keyboard widget sends text through PS/2 device control', () => {
  const panel = new ControllerPanel();
  panel.addWidget('keys', 'keyboard');
  panel.bindToPart('keys', 'kbd');
  const calls = [];
  const binding = bindPanelToBoard(panel, {setDeviceControl(...args) { calls.push(args); return true; }});
  panel.pushKeyboardKey('keys', 65);
  assert.deepEqual(calls, [['kbd', 'type', 'A']]);
  binding.dispose();
});

test('circuit keyboard face exposes all 74 clickable scan-code keys', () => {
  const src = readFileSync(resolve(root, 'overlay/scratch-gui/src/lib/bw-circuit-ui/components/BoardCanvas.jsx'), 'utf8');
  const face = src.slice(src.indexOf("case 'ps2':"), src.indexOf("case 'ps2':") + 7000);
  const keys = [...face.matchAll(/,\s*'([a-z0-9]+)'\]/g)].map(m => m[1]);
  assert.equal(new Set(keys).size, 74, `expected the labelled 74-key face, found ${new Set(keys).size}`);
  assert.match(face, /data-ps2-key=\{code\}/);
});
