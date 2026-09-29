/**
 * The other direction for the EV3: a DEVICE EV3 project (ev3comprehensive
 * blocks) -> MakeCode for LEGO MINDSTORMS EV3 TypeScript.
 *
 * The inverse of ev3-translate.js, over the same walk as the micro:bit
 * export (export.js's Emitter): control flow, variables, procedures, arrays
 * and operators are shared; this file is the EV3 vocabulary only. What the
 * importer lowered comes back in MakeCode's own words where the lowering can
 * be recognised — a text at pxt-ev3's line grid is `brick.showString(text,
 * line)` again, `stop motor A brake` is `setBrake(true)` then `stop()`, and a
 * stop of all four motors is `motors.stopAll()`. What has no pxt-ev3 call is
 * named in `unsupported`, as everywhere else.
 *
 * @module
 */

import {Emitter, projectToMakeCodeTs} from './export.js';
import {EV3_TEXT_OFFSET, EV3_LINE_HEIGHT, EV3_CHAR_WIDTH} from './ev3-translate.js';

const EV3 = 'ev3comprehensive_';

/** The ev3comprehensive booleans (ev3Dialect.js kind 'boolean'). */
const EV3_BOOLEANS = new Set(['touchSensor', 'touchSensorBumped', 'ultrasonicListen', 'irRemoteButton', 'buttonPressed']
    .map(op => EV3 + op));

/** Names pxt-ev3 takes for itself: a program variable called one is renamed. */
const EV3_GLOBALS = new Set([
    'motors', 'sensors', 'brick', 'music', 'control', 'console', 'screen', 'image', 'images', 'moods', 'sounds',
    'loops', 'Math', 'forever', 'pause', 'pauseUntil', 'Note', 'MoveUnit', 'ButtonEvent', 'StatusLight',
    'LightIntensityMode', 'Light', 'ColorSensorColor', 'BeatFraction', 'BatteryProperty', 'String', 'Array',
    'Number', 'Boolean', 'Object', 'Buffer', 'Image', 'parseInt', 'parseFloat', 'convertToText'
]);

const LIGHT = {OFF: 'Off', GREEN: 'Green', RED: 'Red', ORANGE: 'Orange'};
const UNIT = {seconds: 'MoveUnit.Seconds', rotations: 'MoveUnit.Rotations', degrees: 'MoveUnit.Degrees'};
const BUTTON = {up: 'buttonUp', down: 'buttonDown', left: 'buttonLeft', right: 'buttonRight', enter: 'buttonEnter'};
const PAIRS = new Set(['AB', 'BC', 'CD', 'AD']);

class Ev3Emitter extends Emitter {
    constructor (blocks) {
        super(blocks);
        this.globals = EV3_GLOBALS;
        this.braked = new Map();   // port -> the brake setting last written
    }

    /**
     * Scripts after the first run beside it, as they do in the blocks: a lone
     * FOREVER is pxt-ev3's `forever` (already a fiber of its own), anything
     * else is a `control.runInParallel` (how the importer reads one back).
     */
    flagScript (hat, n) {
        const first = this.block(hat.next);
        const lines = this.stack(hat.next, 0);
        if (n === 0 || !first || (first.opcode === 'control_forever' && !first.next)) return lines;
        return ['control.runInParallel(function () {', ...lines.map(l => `    ${l}`), '})'];
    }

    isBoolean (opcode) {
        return EV3_BOOLEANS.has(opcode) || super.isBoolean(opcode);
    }

    /** A menu input's shadow value (a port letter or number), or null. */
    menu (b, name, field) {
        const input = b.inputs && b.inputs[name];
        const shadow = input && typeof input[1] === 'string' ? this.block(input[1]) : null;
        return shadow && shadow.fields && shadow.fields[field] ? String(shadow.fields[field][0]) : null;
    }

    /** `motors.largeA`, `motors.largeBC`, or null for a port set pxt-ev3 has no motor object for. */
    motor (b) {
        const port = (this.menu(b, 'PORT', 'motorPorts') || '').toUpperCase();
        if (/^[A-D]$/.test(port) || PAIRS.has(port)) return `motors.large${port}`;
        this.unsupported.push(`${b.opcode} on motor port "${port}" — pxt-ev3 has motor objects for A-D and AB, BC, CD, AD only`);
        return null;
    }

    sensor (b, kind) {
        const port = this.menu(b, 'PORT', 'sensorPorts');
        if (/^[1-4]$/.test(port || '')) return `sensors.${kind}${port}`;
        this.unsupported.push(`${b.opcode} on sensor port "${port}" — pxt-ev3 has sensors on ports 1-4`);
        return null;
    }

    /** A literal number in an input, or null. */
    literal (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        if (Array.isArray(slot) && slot[0] !== 10 && slot[0] !== 12 && Number.isFinite(Number(slot[1])) && String(slot[1]).trim() !== '') {
            return Number(slot[1]);
        }
        return null;
    }

    /**
     * The text line a Y position is, when it is on pxt-ev3's grid: a literal
     * 4 + 10k, or `(-6 + 10 * L)` as the importer writes a computed line.
     */
    lineOf (b) {
        const y = this.literal(b, 'Y');
        if (y !== null) {
            const k = (y - EV3_TEXT_OFFSET) / EV3_LINE_HEIGHT;
            return Number.isInteger(k) ? String(k + 1) : null;
        }
        const add = this.inputBlock(b, 'Y');
        if (add && add.opcode === 'operator_add' && this.literal(add, 'NUM1') === EV3_TEXT_OFFSET - EV3_LINE_HEIGHT) {
            const mul = this.inputBlock(add, 'NUM2');
            if (mul && mul.opcode === 'operator_multiply' && this.literal(mul, 'NUM1') === EV3_LINE_HEIGHT) return this.value(mul, 'NUM2');
        }
        return null;
    }

    /** The text column an X position is (1 when it is the left margin), or null. */
    columnOf (b) {
        const x = this.literal(b, 'X');
        if (x === null) return null;
        const k = (x - EV3_TEXT_OFFSET) / EV3_CHAR_WIDTH;
        return Number.isInteger(k) && k >= 0 ? k + 1 : null;
    }

    reporter (b) {
        if (!b) return '0';
        const f = name => this.field(b, name);
        const v = name => this.value(b, name);
        const refuse = why => {
            this.unsupported.push(`${b.opcode} — ${why}`);
            return '0';
        };
        switch (b.opcode) {
        case `${EV3}motorPosition`: { const m = this.motor(b); return m ? `${m}.angle()` : '0'; }
        case `${EV3}motorSpeed`: { const m = this.motor(b); return m ? `${m}.speed()` : '0'; }
        case `${EV3}touchSensor`: { const s = this.sensor(b, 'touch'); return s ? `${s}.isPressed()` : 'false'; }
        case `${EV3}touchSensorBumped`: { const s = this.sensor(b, 'touch'); return s ? `${s}.wasPressed()` : 'false'; }
        case `${EV3}colorSensor`: {
            const s = this.sensor(b, 'color');
            if (!s) return '0';
            const mode = f('MODE');
            if (mode === 'color') return `${s}.color()`;
            const intensity = {reflected: 'Reflected', ambient: 'Ambient', raw: 'ReflectedRaw'}[mode];
            return intensity ? `${s}.light(LightIntensityMode.${intensity})` : refuse(`color mode "${mode}"`);
        }
        case `${EV3}colorSensorRGB`: {
            const s = this.sensor(b, 'color');
            const i = {red: 0, green: 1, blue: 2}[f('COMPONENT')];
            return s && i !== undefined ? `${s}.rgbRaw()[${i}]` : '0';
        }
        case `${EV3}ultrasonicSensor`: {
            const s = this.sensor(b, 'ultrasonic');
            if (!s) return '0';
            return f('UNIT') === 'inch' ? `(${s}.distance() / 2.54)` : `${s}.distance()`;
        }
        case `${EV3}gyroSensor`: {
            const s = this.sensor(b, 'gyro');
            if (!s) return '0';
            if (f('MODE') === 'angle') return `${s}.angle()`;
            if (f('MODE') === 'rate') return `${s}.rate()`;
            return refuse(`gyro mode "${f('MODE')}" — pxt-ev3 reads angle and rate`);
        }
        case `${EV3}irProximity`: { const s = this.sensor(b, 'infrared'); return s ? `${s}.proximity()` : '0'; }
        case `${EV3}buttonPressed`: {
            const button = BUTTON[f('BUTTON')];
            if (!button) {
                this.unsupported.push(`${b.opcode} ${f('BUTTON')} — pxt-ev3 has no ${f('BUTTON')} button object`);
                return 'false';
            }
            return `brick.${button}.isPressed()`;
        }
        case `${EV3}batteryLevel`: return 'brick.batteryLevel()';
        case `${EV3}batteryCurrent`: return 'brick.batteryInfo(BatteryProperty.Current)';
        case `${EV3}batteryVoltage`: return 'brick.batteryInfo(BatteryProperty.Voltage)';
        case `${EV3}getVolume`: return 'music.volume()';
        case `${EV3}timerValue`: {
            const n = this.literal(b, 'TIMER');
            return Number.isInteger(n) && n >= 1 && n <= 8 ? `control.timer${n}.millis()` : refuse('a timer that is not 1-8 as written');
        }
        case `${EV3}ultrasonicListen`:
        case `${EV3}irRemoteButton`:
            this.unsupported.push(`${b.opcode} — pxt-ev3 has no call that reads it`);
            return 'false';
        case `${EV3}irBeaconHeading`:
        case `${EV3}irBeaconDistance`:
        case `${EV3}freeMemory`:
            return refuse('pxt-ev3 has no call that reads it');
        // The stage timer, which the importer reads control.millis() from.
        case 'sensing_timer': return '(control.millis() / 1000)';
        // `IF true` / `IF false` parse to 1 = 1 and 0 = 1, and Static
        // TypeScript refuses to compare two different literal types.
        case 'operator_equals': {
            // Scratch compares two literals as numbers when both read as one;
            // `true`/`false` are the dialect's 1 and 0 (`IF false` is false = "true").
            const raw = name => {
                const slot = b.inputs && b.inputs[name] && b.inputs[name][1];
                if (!Array.isArray(slot) || slot[0] === 12 || slot[0] === 13) return null;
                const text = String(slot[1]);
                return text === 'true' ? '1' : text === 'false' ? '0' : text;
            };
            const l = raw('OPERAND1');
            const r = raw('OPERAND2');
            if (l !== null && r !== null && l.trim() !== '' && r.trim() !== '' && Number.isFinite(Number(l)) && Number.isFinite(Number(r))) {
                return Number(l) === Number(r) ? 'true' : 'false';
            }
            return super.reporter(b);
        }
        default:
            return super.reporter(b);
        }
    }

    /** Write the brake setting a stop needs, when it differs from the last one written. */
    brakeFor (motor, on, push) {
        if ((this.braked.get(motor) || false) !== on) push(`${motor}.setBrake(${on})`);
        this.braked.set(motor, on);
    }

    statement (b, indent, out) {
        const pad = '    '.repeat(indent);
        const push = line => out.push(pad + line);
        const v = name => this.value(b, name);
        const f = name => this.field(b, name);
        const refuse = why => {
            this.unsupported.push(`${b.opcode} — ${why}`);
            push(`// unsupported: ${b.opcode}`);
        };
        switch (b.opcode) {
        case 'control_forever':
            push('forever(function () {');
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('})');
            return;
        case 'control_wait': {
            const d = v('DURATION');
            const n = Number(d);
            push(d.trim() !== '' && Number.isFinite(n) ? `pause(${Math.round(n * 1000 * 1000) / 1000})` : `pause(${d} * 1000)`);
            return;
        }
        case 'control_stop':
            if (this.inFunction && f('STOP_OPTION') === 'this script') {
                push('return');
                return;
            }
            push('brick.exitProgram()');
            return;

        // ── motors ─────────────────────────────────────────────────
        case `${EV3}motorRun`:
        case `${EV3}motorRunTime`:
        case `${EV3}motorRunRotations`:
        case `${EV3}motorRunDegrees`: {
            const m = this.motor(b);
            if (!m) return push(`// unsupported: ${b.opcode}`);
            const len = {
                [`${EV3}motorRunTime`]: ['TIME', 'MoveUnit.Seconds'],
                [`${EV3}motorRunRotations`]: ['ROTATIONS', 'MoveUnit.Rotations'],
                [`${EV3}motorRunDegrees`]: ['DEGREES', 'MoveUnit.Degrees']
            }[b.opcode];
            push(len ? `${m}.run(${v('POWER')}, ${v(len[0])}, ${len[1]})` : `${m}.run(${v('POWER')})`);
            return;
        }
        case `${EV3}motorStop`: {
            const port = (this.menu(b, 'PORT', 'motorPorts') || '').toUpperCase();
            const brake = f('BRAKE') !== 'coast';
            if (port === 'ABCD' && !brake) {
                push('motors.stopAll()');
                return;
            }
            const m = this.motor(b);
            if (!m) return push(`// unsupported: ${b.opcode}`);
            this.brakeFor(m, brake, push);
            push(`${m}.stop()`);
            return;
        }
        case `${EV3}motorReset`: {
            if ((this.menu(b, 'PORT', 'motorPorts') || '').toUpperCase() === 'ABCD') {
                push('motors.resetAll()');
                return;
            }
            const m = this.motor(b);
            if (m) push(`${m}.reset()`);
            else push(`// unsupported: ${b.opcode}`);
            return;
        }
        case `${EV3}motorPolarity`: {
            const m = this.motor(b);
            if (!m) return push(`// unsupported: ${b.opcode}`);
            const p = f('POLARITY');
            if (p === '0') return refuse('polarity 0 (the extension\'s "no change") has no pxt-ev3 call');
            push(`${m}.setInverted(${p === '-1'})`);
            return;
        }
        case `${EV3}tankDrive`:
            push(`motors.largeBC.tank(${v('LEFT')}, ${v('RIGHT')}, ${v('VALUE')}, ${UNIT[f('UNIT')] || 'MoveUnit.Seconds'})`);
            return;
        case `${EV3}steerDrive`:
            push(`motors.largeBC.steer(${v('STEERING')}, ${v('SPEED')}, ${v('VALUE')}, ${UNIT[f('UNIT')] || 'MoveUnit.Seconds'})`);
            return;
        case `${EV3}gyroReset`: {
            const s = this.sensor(b, 'gyro');
            push(s ? `${s}.reset()` : `// unsupported: ${b.opcode}`);
            return;
        }

        // ── the screen ─────────────────────────────────────────────
        case `${EV3}screenClear`:
            push('brick.clearScreen()');
            return;
        case `${EV3}screenText`: {
            const line = this.lineOf(b);
            const column = this.columnOf(b);
            if (line !== null && column !== null) {
                push(this.printed(b, line, column));
                return;
            }
            push(`screen.print(${this.textOperand(b, 'TEXT')}, ${v('X')}, ${v('Y')})`);
            return;
        }
        case `${EV3}screenTextLarge`:
            push(`screen.print(${this.textOperand(b, 'TEXT')}, ${v('X')}, ${v('Y')}, 1, image.font12)`);
            return;
        case `${EV3}drawPixel`:
            push(`screen.setPixel(${v('X')}, ${v('Y')}, 1)`);
            return;
        case `${EV3}drawLine`:
            push(`screen.drawLine(${v('X1')}, ${v('Y1')}, ${v('X2')}, ${v('Y2')}, 1)`);
            return;
        case `${EV3}drawCircle`:
            push(`screen.${f('FILL') === 'filled' ? 'fillCircle' : 'drawCircle'}(${v('X')}, ${v('Y')}, ${v('R')}, 1)`);
            return;
        case `${EV3}drawRectangle`:
            push(`screen.${f('FILL') === 'filled' ? 'fillRect' : 'drawRect'}(${v('X')}, ${v('Y')}, ${v('W')}, ${v('H')}, 1)`);
            return;
        case `${EV3}screenUpdate`:
            // pxt-ev3 pushes the screen to the LCD by itself after each change.
            return refuse('pxt-ev3 updates the screen by itself; there is no call to write');
        case `${EV3}screenInvert`:
            return refuse('pxt-ev3 has no whole-screen invert');

        // ── sound, lights, buttons, timers ─────────────────────────
        case `${EV3}playTone`:
            push(`music.playTone(${v('FREQ')}, ${v('DURATION')})`);
            return;
        case `${EV3}playNote`: {
            const NOTE = {C4: 262, D4: 294, E4: 330, F4: 349, G4: 392, A4: 440, B4: 494, C5: 523};
            push(`music.playTone(${NOTE[f('NOTE')] || 262}, music.beat(BeatFraction.Whole) * ${v('DURATION')})`);
            return;
        }
        case `${EV3}beep`:
            return refuse('pxt-ev3 has no beep call (a tone is `play brick tone`)');
        case `${EV3}setVolume`:
            push(`music.setVolume(${v('VOLUME')})`);
            return;
        case `${EV3}stopSound`:
            push('music.stopAllSounds()');
            return;
        case `${EV3}setLED`:
            push(`brick.setStatusLight(StatusLight.${LIGHT[f('COLOR')] || 'Off'})`);
            return;
        case `${EV3}ledAllOff`:
            push('brick.setStatusLight(StatusLight.Off)');
            return;
        case `${EV3}waitForButton`: {
            const button = BUTTON[f('BUTTON')];
            if (!button) return refuse(`pxt-ev3 has no ${f('BUTTON')} button object`);
            push(`brick.${button}.pauseUntil(ButtonEvent.Pressed)`);
            return;
        }
        case `${EV3}resetTimer`: {
            const n = this.literal(b, 'TIMER');
            if (!(Number.isInteger(n) && n >= 1 && n <= 8)) return refuse('a timer that is not 1-8 as written');
            push(`control.timer${n}.reset()`);
            return;
        }
        default:
            if (b.opcode.startsWith(EV3)) return refuse('no pxt-ev3 call for this block');
            super.statement(b, indent, out);
        }
    }

    /**
     * Text at a grid position, in pxt-ev3's own words: showValue for
     * `"name: " join value` (how the importer writes it), showNumber for a
     * number, showString / printString for text.
     */
    printed (b, line, column) {
        const at = column === 1 ? line : `${line}, ${column}`;
        const join = this.inputBlock(b, 'TEXT');
        const inner = join && join.opcode === 'operator_join' ? this.inputBlock(join, 'STRING2') : null;
        const sep = inner && inner.opcode === 'operator_join' && inner.inputs.STRING1 && Array.isArray(inner.inputs.STRING1[1]) ?
            String(inner.inputs.STRING1[1][1]) : null;
        if (sep === ': ' && column === 1) {
            return `brick.showValue(${this.textOperand(join, 'STRING1')}, ${this.value(inner, 'STRING2')}, ${line})`;
        }
        const input = b.inputs && b.inputs.TEXT;
        const slot = input && input[1];
        const isText = (Array.isArray(slot) && slot[0] === 10) || (join && ['operator_join', 'operator_letter_of'].includes(join.opcode)) ||
            (Array.isArray(slot) && slot[0] === 12 && this.textVars && this.textVars.has(this.variableName(slot[1])));
        if (!isText) return column === 1 ? `brick.showNumber(${this.value(b, 'TEXT')}, ${line})` : `brick.printNumber(${this.value(b, 'TEXT')}, ${at})`;
        return column === 1 ? `brick.showString(${this.textOperand(b, 'TEXT')}, ${line})` : `brick.printString(${this.textOperand(b, 'TEXT')}, ${at})`;
    }
}

/**
 * @param {object} project an sb3 project with ev3comprehensive blocks
 * @returns {{ts: string, unsupported: Array<string>}}
 */
export function projectToEv3Ts (project) {
    return projectToMakeCodeTs(project, {Emitter: Ev3Emitter});
}

/**
 * The project as MakeCode EV3 files. pxt-ev3's own new-project dependency is
 * the one `ev3` package, which carries every sensor library.
 *
 * @param {object} project
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @returns {{ts: string, files: object, unsupported: Array<string>}}
 */
export function exportToMakeCodeEv3 (project, opts = {}) {
    const name = opts.name || 'brickwright';
    const {ts, unsupported} = projectToEv3Ts(project);
    return {
        ts,
        unsupported,
        files: {
            'main.ts': ts,
            'main.blocks': '',
            'pxt.json': `${JSON.stringify({
                name,
                description: 'Exported from BrickWright',
                dependencies: {ev3: '*'},
                files: ['main.ts', 'main.blocks', 'pxt.json'],
                preferredEditor: 'tsprj'
            }, null, 4)}\n`
        }
    };
}

export default exportToMakeCodeEv3;
