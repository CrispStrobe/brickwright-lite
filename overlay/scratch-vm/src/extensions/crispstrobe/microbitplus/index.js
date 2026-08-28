const makeExt = require('../adapter');

// micro:bit+ — a fuller micro:bit block set than the stock extension, for the
// MicroPython path (transpile → self-hosted WASM simulator). Design + full v1
// inventory: stc/docs/MICROBIT-EXTENSION-STUDY.md. This module is the SCAFFOLD
// plus the DISPLAY group (the first block group); sensors / pins / actuators /
// radio+events land as sibling groups (fleet lanes) against this scaffold.
//
// The stock scratch3_microbit is ~9 blocks; mbit-more's envelope is ~30; our
// v1 is ~40. The display grid reuses Scratch's stock 5×5 FieldMatrix
// (ArgumentType.MATRIX) for v1 — a 25-char '0'/'1' string; the brightness-aware
// 5×5 field (modelled on FieldLed8x8) is the "later" upgrade since micro:bit
// supports per-pixel brightness 0–9.
//
// Execution model: these blocks lower to MicroPython (display.show/scroll/clear)
// and run inside the micro:bit simulator, NOT the Scratch VM stage — so the VM
// opcode methods are intentional no-ops (the stock micro:bit extension is the
// same: no device/sim connected → nothing renders in-VM). The real effect is on
// "Run on Simulator". Provenance (study §6): block ENVELOPE adapted from the MIT
// mbit-more (attribution: Koji Yokokawa, MIT); no firmware/protocol code here.
module.exports = makeExt(`// Name: micro:bit+
// ID: microbitplus
// Description: A fuller micro:bit block set — display, sensors, pins, radio — for the MicroPython simulator.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
(function (Scratch) {
  "use strict";

  const ES = "0".repeat(25);   // all-off 5x5

  class MicrobitPlus {
    constructor(runtime) {
      this._runtime = runtime;
    }

    // ---- the circuit board, if one is open ---------------------------
    //
    // These blocks began as a VOCABULARY: something for the emitter to
    // lower to MicroPython or C, with empty methods because the code was
    // going to run on real hardware, not here. That left \`set pin P0 to 1\`
    // doing literally nothing in the editor, so a micro:bit program could
    // not light an LED in a Circuit even with the \`microbit\` part — which
    // has terminals p0/p1/p2/3v/gnd — sitting on the canvas.
    //
    // Read lazily per call, exactly as the circuit extension does: the
    // host rebuilds the Board whenever the netlist changes, so anything
    // captured once goes stale. No board simply means no circuit is open,
    // which is the ordinary case and not an error.
    get board() {
      const rt = this._runtime ||
        (typeof Scratch !== 'undefined' && Scratch.vm ? Scratch.vm.runtime : null);
      return (rt && rt.circuitBoard) || null;
    }

    // The menu says '0'; the part's terminal is 'p0'. Accept either, and
    // whatever a reporter dropped in, so \`set pin (chosen) to 1\` works.
    _pinId(value) {
      const raw = String(value == null ? '' : value).trim().toLowerCase();
      return /^\\d+$/.test(raw) ? 'p' + raw : raw;
    }

    getInfo() {
      const str = (name, def) => ({ [name]: { type: Scratch.ArgumentType.STRING, defaultValue: def || '' } });
      const n = (name, def) => ({ [name]: { type: Scratch.ArgumentType.NUMBER, defaultValue: def == null ? 0 : def } });
      return {
        id: 'microbitplus',
        name: 'micro:bit+',
        color1: '#00A3A3',
        color2: '#008F8F',
        color3: '#007D7D',
        blocks: [
          // ── Display ───────────────────────────────────────────────
          { opcode: 'showmatrix', blockType: Scratch.BlockType.COMMAND,
            text: 'show pattern [MATRIX]',
            arguments: { MATRIX: { type: Scratch.ArgumentType.MATRIX, defaultValue: '0101010101100010101000100' } } },
          { opcode: 'showtext', blockType: Scratch.BlockType.COMMAND,
            text: 'show text [TEXT]', arguments: str('TEXT', 'Hi') },
          { opcode: 'scrolltext', blockType: Scratch.BlockType.COMMAND,
            text: 'scroll text [TEXT] delay [MS] ms',
            arguments: { ...str('TEXT', 'hello'), ...n('MS', 120) } },
          { opcode: 'cleardisplay', blockType: Scratch.BlockType.COMMAND,
            text: 'clear display' },
          { opcode: 'plot', blockType: Scratch.BlockType.COMMAND,
            text: 'plot x [X] y [Y] [STATE]',
            arguments: {
              ...n('X', 0), ...n('Y', 0),
              STATE: { type: Scratch.ArgumentType.STRING, defaultValue: 'on',
                menu: 'onoff' } } },

          // ── Buttons, logo, gestures (events) ─────────────────────
          '---',
          { opcode: 'whenbutton', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when button [BTN] [BTNEVENT]',
            arguments: {
              BTN: { type: Scratch.ArgumentType.STRING, defaultValue: 'A', menu: 'btn' },
              BTNEVENT: { type: Scratch.ArgumentType.STRING, defaultValue: 'pressed', menu: 'btnEvent' } } },
          { opcode: 'isbutton', blockType: Scratch.BlockType.BOOLEAN,
            text: 'button [BTN] pressed?',
            arguments: { BTN: { type: Scratch.ArgumentType.STRING, defaultValue: 'A', menu: 'btn' } } },
          { opcode: 'whenlogo', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when logo [LOGOEVENT]',
            arguments: { LOGOEVENT: { type: Scratch.ArgumentType.STRING, defaultValue: 'touched', menu: 'logoEvent' } } },
          { opcode: 'whengesture', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when [GESTURE]',
            arguments: { GESTURE: { type: Scratch.ArgumentType.STRING, defaultValue: 'shake', menu: 'gesture' } } },
          { opcode: 'isgesture', blockType: Scratch.BlockType.BOOLEAN,
            text: '[GESTURE] happening?',
            arguments: { GESTURE: { type: Scratch.ArgumentType.STRING, defaultValue: 'shake', menu: 'gesture' } } },

          // ── Motion / orientation (reporters) ─────────────────────
          '---',
          { opcode: 'accel', blockType: Scratch.BlockType.REPORTER,
            text: 'acceleration [AXIS]',
            arguments: { AXIS: { type: Scratch.ArgumentType.STRING, defaultValue: 'x', menu: 'axis' } } },
          { opcode: 'pitch', blockType: Scratch.BlockType.REPORTER, text: 'pitch (°)' },
          { opcode: 'roll', blockType: Scratch.BlockType.REPORTER, text: 'roll (°)' },
          { opcode: 'compass', blockType: Scratch.BlockType.REPORTER, text: 'compass heading (°)' },
          { opcode: 'magforce', blockType: Scratch.BlockType.REPORTER,
            text: 'magnetic force [AXIS]',
            arguments: { AXIS: { type: Scratch.ArgumentType.STRING, defaultValue: 'x', menu: 'axis' } } },

          // ── Environment (reporters) ──────────────────────────────
          '---',
          { opcode: 'light', blockType: Scratch.BlockType.REPORTER, text: 'light level' },
          { opcode: 'temp', blockType: Scratch.BlockType.REPORTER, text: 'temperature (°C)' },
          { opcode: 'sound', blockType: Scratch.BlockType.REPORTER, text: 'sound level' },

          // ── Pins / GPIO ──────────────────────────────────────────
          '---',
          { opcode: 'digitalwrite', blockType: Scratch.BlockType.COMMAND,
            text: 'set pin [PIN] digital [LEVEL]',
            arguments: {
              PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' },
              LEVEL: { type: Scratch.ArgumentType.STRING, defaultValue: '1', menu: 'digitalLevel' } } },
          { opcode: 'digitalread', blockType: Scratch.BlockType.REPORTER,
            text: 'pin [PIN] digital value',
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' } } },
          { opcode: 'ispinhigh', blockType: Scratch.BlockType.BOOLEAN,
            text: 'pin [PIN] is high?',
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' } } },
          { opcode: 'analogread', blockType: Scratch.BlockType.REPORTER,
            text: 'analog value of pin [PIN]',
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'analogIn' } } },
          { opcode: 'analogwrite', blockType: Scratch.BlockType.COMMAND,
            text: 'set pin [PIN] analog [PCT] %',
            arguments: {
              PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' },
              ...n('PCT', 50) } },
          { opcode: 'setpull', blockType: Scratch.BlockType.COMMAND,
            text: 'set pin [PIN] pull [PULL]',
            arguments: {
              PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' },
              PULL: { type: Scratch.ArgumentType.STRING, defaultValue: 'none', menu: 'pull' } } },
          { opcode: 'whentouch', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when pin [PIN] touched',
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'analogIn' } } },
          { opcode: 'istouch', blockType: Scratch.BlockType.BOOLEAN,
            text: 'pin [PIN] touched?',
            arguments: { PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'analogIn' } } },

          // ── Actuators ────────────────────────────────────────────
          '---',
          { opcode: 'playtone', blockType: Scratch.BlockType.COMMAND,
            text: 'play tone [FREQ] Hz for [MS] ms',
            arguments: { ...n('FREQ', 440), ...n('MS', 500) } },
          { opcode: 'playnote', blockType: Scratch.BlockType.COMMAND,
            text: 'play note [NOTE]',
            arguments: { NOTE: { type: Scratch.ArgumentType.STRING, defaultValue: 'C4', menu: 'note' } } },
          { opcode: 'stoptone', blockType: Scratch.BlockType.COMMAND, text: 'stop tone' },
          { opcode: 'servo', blockType: Scratch.BlockType.COMMAND,
            text: 'set pin [PIN] servo angle [DEG]',
            arguments: {
              PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' },
              ...n('DEG', 90) } },
          { opcode: 'servocont', blockType: Scratch.BlockType.COMMAND,
            text: 'set pin [PIN] continuous servo [SPD] %',
            arguments: {
              PIN: { type: Scratch.ArgumentType.STRING, defaultValue: '0', menu: 'gpio' },
              ...n('SPD', 0) } },

          // ── Radio ────────────────────────────────────────────────
          '---',
          { opcode: 'radioon', blockType: Scratch.BlockType.COMMAND,
            text: 'turn radio on group [G] power [P]',
            arguments: { ...n('G', 0), ...n('P', 6) } },
          { opcode: 'radiosendnum', blockType: Scratch.BlockType.COMMAND,
            text: 'radio send number [N]', arguments: n('N', 0) },
          { opcode: 'radiosendstr', blockType: Scratch.BlockType.COMMAND,
            text: 'radio send text [S]', arguments: str('S', 'hello') },
          { opcode: 'radiosendkv', blockType: Scratch.BlockType.COMMAND,
            text: 'radio send [KEY] = [VALUE]',
            arguments: { ...str('KEY', 'name'), ...n('VALUE', 0) } },
          { opcode: 'whenradionum', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when radio receives a number' },
          { opcode: 'radiolastnum', blockType: Scratch.BlockType.REPORTER,
            text: 'last radio number' },
          { opcode: 'whenradiostr', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when radio receives text' },
          { opcode: 'radiolaststr', blockType: Scratch.BlockType.REPORTER,
            text: 'last radio text' },

          // ── Connection ───────────────────────────────────────────
          '---',
          { opcode: 'whenconn', blockType: Scratch.BlockType.HAT, isEdgeActivated: true,
            text: 'when micro:bit [CONNSTATE]',
            arguments: { CONNSTATE: { type: Scratch.ArgumentType.STRING, defaultValue: 'connected', menu: 'connState' } } }
        ],
        menus: {
          onoff: { acceptReporters: true, items: ['on', 'off'] },
          btn: { acceptReporters: false, items: ['A', 'B', 'any'] },
          btnEvent: { acceptReporters: false, items: ['pressed', 'released'] },
          logoEvent: { acceptReporters: false, items: ['touched', 'released'] },
          gesture: { acceptReporters: false, items: [
            'shake', 'tilt up', 'tilt down', 'tilt left', 'tilt right',
            'face up', 'face down', 'freefall', '3g', '6g', '8g'] },
          axis: { acceptReporters: false, items: ['x', 'y', 'z', 'strength'] },
          gpio: { acceptReporters: true, items: ['0','1','2','8','12','13','14','15','16'] },
          analogIn: { acceptReporters: true, items: ['0','1','2'] },
          digitalLevel: { acceptReporters: true, items: ['0','1'] },
          pull: { acceptReporters: false, items: ['none', 'up', 'down'] },
          note: { acceptReporters: false, items: [
            'C4','D4','E4','F4','G4','A4','B4','C5','D5','E5','F5','G5','A5','B5'] },
          connState: { acceptReporters: false, items: ['connected', 'disconnected'] }
        }
      };
    }

    // The MicroPython path renders these on the simulator; the Scratch VM stage
    // does not host a micro:bit, so these are no-ops here (parity with the stock
    // micro:bit extension when no device/sim is attached). Methods exist so saved
    // projects load and so the compiler's opcode table stays complete.
    // ── Display (no-op — sim renders via MicroPython) ───────────
    showmatrix() {}
    showtext() {}
    scrolltext() {}
    cleardisplay() {}
    plot() {}

    // ── Events: buttons, logo, gestures ───────────────────────
    whenbutton() { return false; }
    isbutton() { return false; }
    whenlogo() { return false; }
    whengesture() { return false; }
    isgesture() { return false; }

    // ── Sensors: motion, environment ──────────────────────────
    accel() { return 0; }
    pitch() { return 0; }
    roll() { return 0; }
    compass() { return 0; }
    magforce() { return 0; }
    light() { return 0; }
    temp() { return 0; }
    sound() { return 0; }

    // ── Pins / GPIO ──────────────────────────────────────────
    digitalwrite(args) {
      const board = this.board;
      if (!board) return;
      board.setPin(this._pinId(args.PIN), 'pushpull', String(args.LEVEL) === '1');
    }

    digitalread(args) {
      const board = this.board;
      if (!board) return 0;
      // A pin being read is an input, and saying so matters: left as
      // whatever it was, the solver sees a terminal nothing declared.
      const pin = this._pinId(args.PIN);
      board.setPin(pin, 'input', false);
      return Number(board.readPin(pin)) > 0 ? 1 : 0;
    }

    ispinhigh(args) { return this.digitalread(args) === 1; }

    analogread(args) {
      const board = this.board;
      if (!board) return 0;
      const pin = this._pinId(args.PIN);
      board.setPin(pin, 'input', false);
      // The block reports the micro:bit's own 0..1023 and the board works
      // in volts against a 3.3 V rail, so the conversion belongs here —
      // leaking the simulator's units through a documented block range is
      // how a lesson's numbers stop matching its text.
      const volts = Number(board.readPinVoltage ? board.readPinVoltage(pin) : 0);
      if (!isFinite(volts)) return 0;
      return Math.max(0, Math.min(1023, Math.round((volts / 3.3) * 1023)));
    }

    analogwrite(args) {
      const board = this.board;
      if (!board) return;
      // There is no PWM in the solver: a duty cycle is a time average and
      // the board is solved per instant. So this drives high above half
      // and low below it — right at both ends of the range and wrong in
      // the middle, which is stated here rather than presented as dimming.
      const pct = Number(args.PCT);
      board.setPin(this._pinId(args.PIN), 'pushpull', isFinite(pct) && pct >= 50);
    }

    setpull(args) {
      const board = this.board;
      if (!board) return;
      const mode = String(args.MODE) === 'up' ? 'input-pullup' :
        (String(args.MODE) === 'down' ? 'input-pulldown' : 'input');
      board.setPin(this._pinId(args.PIN), mode, mode === 'input-pullup');
    }
    whentouch() { return false; }
    istouch() { return false; }

    // ── Actuators ────────────────────────────────────────────
    playtone() {}
    playnote() {}
    stoptone() {}
    servo() {}
    servocont() {}

    // ── Radio ────────────────────────────────────────────────
    radioon() {}
    radiosendnum() {}
    radiosendstr() {}
    radiosendkv() {}
    whenradionum() { return false; }
    radiolastnum() { return 0; }
    whenradiostr() { return false; }
    radiolaststr() { return ''; }

    // ── Connection ───────────────────────────────────────────
    whenconn() { return false; }
  }

  Scratch.extensions.register(new MicrobitPlus(Scratch.vm && Scratch.vm.runtime));
})(Scratch);
`);
