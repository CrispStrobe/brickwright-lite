/**
 * MakeCode for LEGO MINDSTORMS EV3 (pxt-ev3) -> BrickWright pseudocode,
 * `DEVICE EV3`, whose words are the `ev3comprehensive` blocks.
 *
 * THE TARGET. The EV3 words are sb3-creator's ev3Dialect.js table: one word
 * per block of the unified stock-firmware EV3 extension (motors by port,
 * the five sensors by port, the brick's screen, speaker, lights, buttons,
 * battery and timers). An imported program is therefore EV3 BLOCKS in Lite,
 * which drive a real brick over direct commands; Lite has no virtual EV3 to
 * run them on (docs/LEGO-ARCHITECTURE.md: "no virtual EV3 transport, state or
 * world model"), so the proof of this importer is the round trip back to
 * MakeCode and pxt-ev3's own compiler (scripts/makecode-census.mjs).
 *
 * THE MAPPING, and where it is not one-to-one — each named in `unsupported`
 * where the program uses it, never silent:
 *
 *   motors.largeA / mediumB / largeBC      -> port A / B / BC. The extension
 *       drives both motor sizes the same way, so a medium motor comes back to
 *       MakeCode as a large one (named).
 *   .run(speed[, value, unit])             -> run motor P at S % [for V unit]
 *   .stop()                                -> stop motor P coast|brake, from
 *       the last setBrake() on that port (MakeCode's default is coast)
 *   .tank / .steer on largeBC WITH a length -> tank drive / steer (the
 *       extension's pair is B+C); WITHOUT one they run on, which the
 *       extension's pair blocks cannot, so they become two motor runs
 *       (named: the firmware's synchronisation of the pair is not kept)
 *   sensors.touch1 / color3 / ultrasonic4 / gyro2 / infrared4 -> port N
 *   handlers (onEvent, onColorDetected, ...) -> polled, as the micro:bit
 *       importer polls its handlers: MakeCode's own thresholds are written in
 *   brick.showString(text, line)           -> show brick text T at 4 Y, the
 *       pixel position pxt-ev3 draws that line at (font8, 10 px per line)
 *   screen images, moods, sound files, the console -> refused by name
 *
 * @module
 */

import {parseMakeCodeTs} from './ts-import.js';
import {BaseTranslator, bodyOf, num} from './translate-base.js';

/** pxt-ev3 libs/screen: text starts 4 px in, and a line is font8's 8 px + 2. */
export const EV3_TEXT_OFFSET = 4;
export const EV3_LINE_HEIGHT = 10;
export const EV3_CHAR_WIDTH = 6;

/** pxt-ev3 libs/music Note enum, in Hz. */
const NOTE_HZ = {
    C: 262, CSharp: 277, D: 294, Eb: 311, E: 330, F: 349, FSharp: 370, G: 392, GSharp: 415, A: 440, Bb: 466, B: 494,
    C3: 131, CSharp3: 139, D3: 147, Eb3: 156, E3: 165, F3: 175, FSharp3: 185, G3: 196, GSharp3: 208, A3: 220,
    Bb3: 233, B3: 247, C4: 262, CSharp4: 277, D4: 294, Eb4: 311, E4: 330, F4: 349, FSharp4: 370, G4: 392,
    GSharp4: 415, A4: 440, Bb4: 466, B4: 494, C5: 523, CSharp5: 555, D5: 587, Eb5: 622, E5: 659, F5: 698,
    FSharp5: 740, G5: 784, GSharp5: 831, A5: 880, Bb5: 932, B5: 988
};

/** music.beat(): 60000 / bpm at pxt-ev3's default 120 bpm, scaled by the fraction. */
const BEAT_MS = {Whole: 500, Half: 250, Quarter: 125, Eighth: 62.5, Sixteenth: 31.25, Double: 1000, Breve: 2000};

/** pxt-ev3 ColorSensorColor, which is also the EV3 color mode's own numbering. */
export const EV3_COLORS = {None: 0, Black: 1, Blue: 2, Green: 3, Yellow: 4, Red: 5, White: 6, Brown: 7};

/** pxt-ev3 StatusLight -> the extension's light words (flash and pulse have no word). */
const STATUS_LIGHT = {Off: 'off', Green: 'green', Red: 'red', Orange: 'orange'};

/** pxt-ev3's brick buttons -> the extension's button menu. */
const BUTTONS = {buttonUp: 'up', buttonDown: 'down', buttonLeft: 'left', buttonRight: 'right', buttonEnter: 'enter'};

/**
 * pxt-ev3's default thresholds (libs/core/input.ts ThresholdDetector, per
 * sensor constructor): a level at or below `low` is Low, at or above `high`
 * is High.
 */
export const EV3_THRESHOLDS = {
    color: {low: 20, high: 80},         // Light.Dark / Light.Bright, 0..100 %
    ultrasonic: {low: 10, high: 100},   // UltrasonicSensorEvent.ObjectNear, cm
    infrared: {low: 10, high: 90}       // InfraredSensorEvent.ObjectNear / ObjectDetected, 0..100
};

const SENSOR_KINDS = ['touch', 'color', 'ultrasonic', 'gyro', 'infrared'];

/** Motor calls with no block here, and why. */
const MOTOR_REFUSED = {
    setRegulated: 'the extension runs motors at power, with no speed-regulation switch',
    setPauseOnRun: 'the extension has no pause-on-run switch',
    setBrakeSettleTime: 'the extension has no brake settle time',
    ramp: 'the extension has no ramped (accelerate/decelerate) move',
    setRunPhase: 'the extension has no ramped (accelerate/decelerate) move',
    setRunSmoothness: 'the extension has no ramped (accelerate/decelerate) move',
    pauseUntilReady: 'the extension has no motor-ready reporter',
    pauseUntilStalled: 'the extension has no stall detection',
    isReady: 'the extension has no motor-ready reporter',
    isStalled: 'the extension has no stall detection'
};

/** Brick, music and console calls with no block here, and why. */
const REFUSED = {
    'brick.showImage': 'EV3 screen images are bitmaps, and the extension draws text, pixels and shapes only',
    'brick.showMood': 'a mood is a screen image, a sound and a light; the extension has no image block',
    'brick.showPorts': 'the port view is drawn by pxt-ev3\'s runtime, not a block the extension has',
    'brick.setPrintStyle': 'the extension draws black on white only',
    'music.playSoundEffect': 'EV3 sound files are not something the extension can play',
    'music.playSoundEffectUntilDone': 'EV3 sound files are not something the extension can play',
    'music.ringTone': 'the extension plays a tone for a set time only',
    'music.setTempo': 'the extension has no tempo; beats are written as milliseconds at 120 bpm',
    'music.changeTempoBy': 'the extension has no tempo; beats are written as milliseconds at 120 bpm',
    'console.log': 'the brick blocks have no console',
    'console.logValue': 'the brick blocks have no console',
    'console.sendToScreen': 'the brick blocks have no console',
    'control.runInParallel': 'a parallel start mid-script has no block; a top-level one is its own script',
    'control.raiseEvent': 'pxt-ev3\'s event bus has no block',
    'control.onEvent': 'pxt-ev3\'s event bus has no block',
    'control.waitMicros': 'the dialect waits in seconds',
    'control.panic': 'the extension has no panic',
    'control.assert': 'the extension has no assertion',
    'control.deviceSerialNumber': 'the extension does not read the brick\'s serial number'
};

class Ev3Translator extends BaseTranslator {
    constructor () {
        super();
        this.brake = new Map();   // port -> 'brake' | 'coast', from setBrake()
    }

    // ── what a receiver is ──────────────────────────────────────────────

    /** `motors.largeA` / `motors.mediumBC` -> {port, medium}, or null. */
    motorOf (node) {
        const p = this.path(node);
        const m = p && /^motors\.(large|medium)(A|B|C|D|AB|BC|CD|AD)$/.exec(p);
        return m ? {port: m[2], medium: m[1] === 'medium', name: p} : null;
    }

    /** `sensors.touch1` -> {kind, port}, or null. */
    sensorOf (node) {
        const p = this.path(node);
        const m = p && new RegExp(`^sensors\\.(${SENSOR_KINDS.join('|')})([1-4])$`).exec(p);
        return m ? {kind: m[1], port: m[2], name: p} : null;
    }

    /** `brick.buttonEnter` -> 'enter', or null. */
    buttonOf (node) {
        const p = this.path(node);
        const m = p && /^brick\.(button\w+)$/.exec(p);
        return m && BUTTONS[m[1]] ? BUTTONS[m[1]] : null;
    }

    /** The enum member a node names (`MoveUnit.Rotations` -> 'Rotations'), or null. */
    member (node, owner) {
        node = this.resolveConst(node);
        return node && node.type === 'Member' && node.object && node.object.type === 'Identifier' &&
            node.object.name === owner ? node.name : null;
    }

    /** One slot of a dialect word: a number, a name, "text", or a (group). */
    tok (node) {
        if (node && node.type === 'String') return this.expr(node);
        return this.operand(node);
    }

    /** A medium motor is driven as a large one; named once per motor. */
    noteMedium (motor) {
        if (motor.medium) {
            this.unsupported.push(`${motor.name} — driven like a large motor (the extension does not tell ` +
                'the sizes apart), and written back to MakeCode as one');
        }
    }

    // ── values ──────────────────────────────────────────────────────────

    expr (node) {
        const note = this.member(node, 'Note');
        if (note && NOTE_HZ[note]) return String(NOTE_HZ[note]);
        const color = this.member(node, 'ColorSensorColor');
        if (color && EV3_COLORS[color] !== undefined) return String(EV3_COLORS[color]);
        return super.expr(node);
    }

    isBooleanValue (value) {
        return super.isBooleanValue(value) || /^ev3 .+ (pressed|bumped|detects)$/.test(value);
    }

    /** A duration in ms written as seconds, reading `x * 1000` back as x. */
    seconds (node) {
        if (node && node.type === 'Number') return num(Number(node.value) / 1000);
        if (node && node.type === 'Binary' && node.op === '*') {
            if (node.right && node.right.type === 'Number' && Number(node.right.value) === 1000) return this.tok(node.left);
            if (node.left && node.left.type === 'Number' && Number(node.left.value) === 1000) return this.tok(node.right);
        }
        return `(${this.tok(node)} / 1000)`;
    }

    /** music.beat(BeatFraction.X) as its milliseconds at 120 bpm; anything else as it stands. */
    beatMs (node) {
        if (node && node.type === 'Call' && this.path(node.callee) === 'music.beat') {
            const fraction = this.member(node.args[0], 'BeatFraction') || 'Whole';
            this.unsupported.push('music.beat() — written as milliseconds at pxt-ev3\'s default 120 bpm');
            if (BEAT_MS[fraction] !== undefined) return num(BEAT_MS[fraction]);
        }
        return this.tok(node);
    }

    callExpression (node) {
        const c = node.callee;
        const a = node.args || [];
        const method = c && c.type === 'Member' ? c.name : null;
        const recv = c && c.type === 'Member' ? c.object : null;

        const motor = recv && this.motorOf(recv);
        if (motor) {
            this.noteMedium(motor);
            if (method === 'angle') return `ev3 motor position ${motor.port}`;
            if (method === 'speed') return `ev3 motor speed ${motor.port}`;
            if (MOTOR_REFUSED[method]) {
                this.unsupported.push(`${motor.name}.${method}() — ${MOTOR_REFUSED[method]}`);
                return '0';
            }
        }
        const sensor = recv && this.sensorOf(recv);
        if (sensor) {
            const {kind, port} = sensor;
            if (kind === 'touch' && method === 'isPressed') return `ev3 touch ${port} pressed`;
            if (kind === 'touch' && method === 'wasPressed') return `ev3 touch ${port} bumped`;
            if (kind === 'color' && method === 'color') return `ev3 color ${port} color`;
            if (kind === 'color' && method === 'reflectedLight') return `ev3 color ${port} reflected`;
            if (kind === 'color' && method === 'ambientLight') return `ev3 color ${port} ambient`;
            if (kind === 'color' && method === 'reflectedLightRaw') return `ev3 color ${port} raw`;
            if (kind === 'color' && method === 'light') {
                const mode = this.member(a[0], 'LightIntensityMode') || 'Reflected';
                return `ev3 color ${port} ${{Reflected: 'reflected', Ambient: 'ambient', ReflectedRaw: 'raw'}[mode] || 'reflected'}`;
            }
            if (kind === 'color' && method === 'isColorDetected') return `(ev3 color ${port} color) = ${this.tok(a[0])}`;
            if (kind === 'ultrasonic' && method === 'distance') return `ev3 distance ${port} cm`;
            if (kind === 'gyro' && method === 'angle') return `ev3 gyro ${port} angle`;
            if (kind === 'gyro' && method === 'rate') return `ev3 gyro ${port} rate`;
            if (kind === 'infrared' && method === 'proximity') return `ev3 infrared ${port} proximity`;
            this.unsupported.push(`${sensor.name}.${method}() — no ${kind} sensor block reads that`);
            return '0';
        }
        const button = recv && this.buttonOf(recv);
        if (button && method === 'isPressed') return `ev3 button ${button} pressed`;
        if (button) {
            this.unsupported.push(`${this.path(recv)}.${method}() — the extension reads whether a button is down now, ` +
                'not whether it was pressed since');
            return '0';
        }

        const name = this.path(c);
        const timer = name && /^control\.timer([1-8])\.(millis|seconds)$/.exec(name);
        if (timer) {
            if (timer[2] === 'millis') return `ev3 timer ${timer[1]}`;
            return `(ev3 timer ${timer[1]}) / 1000`;
        }
        switch (name) {
        case 'brick.batteryLevel': return 'ev3 battery level';
        case 'brick.batteryInfo': {
            const which = this.member(a[0], 'BatteryProperty') || 'Level';
            if (which === 'Level') return 'ev3 battery level';
            if (which === 'Current') return 'ev3 battery current';
            if (which === 'Voltage') return 'ev3 battery voltage';
            this.unsupported.push(`brick.batteryInfo(BatteryProperty.${which}) — the extension reads level, current and voltage`);
            return '0';
        }
        case 'music.volume': return 'ev3 volume';
        case 'music.beat': return this.beatMs(node);
        case 'music.noteFrequency': return this.tok(a[0]);
        // The time since the program started, off the stage timer (which the
        // green flag resets), as the micro:bit importer reads input.runningTime.
        case 'control.millis': return 'timer * 1000';
        default:
            if (REFUSED[name]) {
                this.unsupported.push(`${name}() — ${REFUSED[name]}`);
                return '0';
            }
            return super.callExpression(node);
        }
    }

    // ── commands ────────────────────────────────────────────────────────

    command (node, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        const c = node.callee;
        const a = node.args || [];
        const method = c && c.type === 'Member' ? c.name : null;
        const recv = c && c.type === 'Member' ? c.object : null;

        const motor = recv && this.motorOf(recv);
        if (motor && this.motorCommand(motor, method, a, push, indent, out)) return;
        const sensor = recv && this.sensorOf(recv);
        if (sensor && this.sensorCommand(sensor, method, a, push)) return;
        const button = recv && this.buttonOf(recv);
        if (button && method === 'pauseUntil') {
            this.waitForEvent(`ev3 button ${button} pressed`, this.member(a[0], 'ButtonEvent'), push);
            return;
        }

        const name = this.path(c);
        const timer = name && /^control\.timer([1-8])\.(reset|pauseUntil)$/.exec(name);
        if (timer && timer[2] === 'reset') {
            push(`reset brick timer ${timer[1]}`);
            return;
        }
        if (timer) {
            push(`wait until not ((ev3 timer ${timer[1]}) < ${this.tok(a[0])})`);
            return;
        }
        switch (name) {
        case 'pause':
        case 'loops.pause':
        case 'music.rest':
            push(`wait ${this.seconds(a[0])} seconds`);
            return;
        case 'pauseUntil':
            push(`wait until ${this.condition(a[0] && a[0].type === 'FunctionExpression' ? returned(a[0]) : a[0])}`);
            return;
        case 'forever':
        case 'loops.forever':
            push('FOREVER:');
            this.block(bodyOf(a[0]), indent + 1, out);
            return;
        case 'motors.stopAll':
            push('stop motor ABCD coast');
            return;
        case 'motors.resetAll':
            push('reset motor ABCD');
            return;

        // ── the screen ─────────────────────────────────────────────
        case 'brick.clearScreen':
            push('clear brick screen');
            return;
        case 'brick.showString':
        case 'brick.showNumber':
        case 'brick.printString':
        case 'brick.printNumber':
        case 'brick.showValue':
        case 'brick.printValue': {
            const isValue = /Value$/.test(name);
            const text = isValue ? this.valueText(a[0], a[1]) : this.tok(a[0]);
            const at = isValue ? 2 : 1;
            if (a[at + 2]) this.unsupported.push(`${name}() print style — the extension draws black on white only`);
            push(`show brick text ${text} at ${this.column(a[at + 1])} ${this.lineY(a[at])}`);
            return;
        }
        case 'brick.setStatusLight': {
            const light = this.member(a[0], 'StatusLight') || 'Off';
            const base = light.replace(/(Flash|Pulse)$/, '');
            if (base !== light) {
                this.unsupported.push(`brick.setStatusLight(StatusLight.${light}) — the extension's light is steady; ` +
                    `written as ${STATUS_LIGHT[base] || 'off'}`);
            }
            push(`set brick light ${STATUS_LIGHT[base] || 'off'}`);
            return;
        }
        // ── sound ──────────────────────────────────────────────────
        case 'music.playTone':
            push(`play brick tone ${this.tok(a[0])} hz for ${this.beatMs(a[1])} ms`);
            return;
        case 'music.setVolume':
            push(`set brick volume ${this.tok(a[0])}`);
            return;
        case 'music.stopAllSounds':
            push('stop brick sounds');
            return;
        case 'brick.exitProgram':
            push('stop all');
            return;
        default:
            if (REFUSED[name]) {
                push(this.note(`${name}() — ${REFUSED[name]}`));
                return;
            }
            if (/^(moods\.\w+\.show)$/.test(name || '')) {
                push(this.note(`${name}() — ${REFUSED['brick.showMood']}`));
                return;
            }
            super.command(node, indent, out);
        }
    }

    /**
     * `name: value`, as pxt-ev3's showValue writes it (the value rounded to 3
     * places there), joined as `name join (": " join value)` — a shape of its
     * own, so the way back can tell it from `showString("name: " + value)`.
     */
    valueText (nameNode, valueNode) {
        return `(${this.tok(nameNode)} join (": " join ${this.tok(valueNode)}))`;
    }

    /** The pixel row of a text line (lines count from 1). */
    lineY (node) {
        if (node && node.type === 'Number') return num(EV3_TEXT_OFFSET + EV3_LINE_HEIGHT * (Number(node.value) - 1));
        return `(${EV3_TEXT_OFFSET - EV3_LINE_HEIGHT} + ${EV3_LINE_HEIGHT} * ${this.tok(node)})`;
    }

    /** The pixel column of a text column (columns count from 1; absent is 1). */
    column (node) {
        if (!node) return String(EV3_TEXT_OFFSET);
        if (node.type === 'Number') return num(EV3_TEXT_OFFSET + EV3_CHAR_WIDTH * (Number(node.value) - 1));
        return `(${EV3_TEXT_OFFSET - EV3_CHAR_WIDTH} + ${EV3_CHAR_WIDTH} * ${this.tok(node)})`;
    }

    /**
     * A move's length as {value, unit} (unit: seconds|rotations|degrees),
     * false for none (the motor runs on), or null for a unit with no word.
     */
    length (valueNode, unitNode) {
        if (!valueNode) return false;
        const unit = unitNode ? this.member(unitNode, 'MoveUnit') : 'MilliSeconds';
        if (unit === 'Rotations') return {value: this.tok(valueNode), unit: 'rotations'};
        if (unit === 'Degrees') return {value: this.tok(valueNode), unit: 'degrees'};
        if (unit === 'Seconds') return {value: this.tok(valueNode), unit: 'seconds'};
        if (unit === 'MilliSeconds') {
            // A literal 0 is pxt-ev3's own "no length": the motor runs on.
            if (valueNode.type === 'Number' && Number(valueNode.value) === 0) return false;
            return {value: this.seconds(valueNode), unit: 'seconds'};
        }
        return null;
    }

    motorCommand (motor, method, a, push, indent, out) {
        const P = motor.port;
        const refuse = why => {
            push(this.note(`${motor.name}.${method}() — ${why}`));
            return true;
        };
        if (!['run', 'stop', 'reset', 'clearCounts', 'setBrake', 'setInverted', 'tank', 'steer'].includes(method)) {
            if (MOTOR_REFUSED[method]) return refuse(MOTOR_REFUSED[method]);
            return false;
        }
        this.noteMedium(motor);
        switch (method) {
        case 'run': {
            const len = this.length(a[1], a[2]);
            if (len === null) return refuse('a move unit the extension has no block for');
            push(`run motor ${P} at ${this.tok(a[0])} %${len ? ` for ${len.value} ${len.unit}` : ''}`);
            return true;
        }
        case 'stop':
            push(`stop motor ${P} ${this.brake.get(P) || 'coast'}`);
            return true;
        case 'setBrake': {
            const on = a[0] && a[0].type === 'Boolean' ? a[0].value : null;
            if (on === null) return refuse('a brake setting that is not true or false as written');
            // No block: the brake is how the NEXT stop of this motor stops.
            this.unsupported.push(`${motor.name}.setBrake() — no block; carried into this motor's later \`stop\` ` +
                '(the extension\'s timed moves brake at their end whatever it says)');
            for (const port of P) this.brake.set(port, on ? 'brake' : 'coast');
            this.brake.set(P, on ? 'brake' : 'coast');
            return true;
        }
        case 'reset':
            push(`reset motor ${P}`);
            return true;
        case 'clearCounts':
            this.unsupported.push(`${motor.name}.clearCounts() — written as \`reset motor\`, which also clears the counts`);
            push(`reset motor ${P}`);
            return true;
        case 'setInverted': {
            const on = a[0] && a[0].type === 'Boolean' ? a[0].value : null;
            if (on === null) return refuse('an inversion that is not true or false as written');
            push(`set motor ${P} polarity ${on ? '-1' : '1'}`);
            return true;
        }
        case 'tank':
        case 'steer': {
            if (P.length !== 2) return refuse('a pair method on a single motor');
            const len = this.length(a[2], a[3]);
            if (len === null) return refuse('a move unit the extension has no block for');
            if (len && P !== 'BC') return refuse(`the extension's ${method} drives B+C only, not ${P}`);
            if (len) {
                const {value, unit} = len;
                if (method === 'tank') push(`tank drive ${this.tok(a[0])} ${this.tok(a[1])} for ${value} ${unit}`);
                else {
                    const turn = a[0] && a[0].type === 'Number' ? Math.abs(Number(a[0].value)) :
                        a[0] && a[0].type === 'Unary' && a[0].op === '-' && a[0].argument.type === 'Number' ? Math.abs(Number(a[0].argument.value)) : 0;
                    if (turn > 100) {
                        this.unsupported.push(`${motor.name}.steer() turn ratio beyond ±100 — the extension clamps it, ` +
                            'so the inner wheel stops instead of reversing');
                    }
                    push(`steer ${this.tok(a[0])} at ${this.tok(a[1])} % for ${value} ${unit}`);
                }
                return true;
            }
            // Runs on: the two motors of the pair, each at its own speed.
            this.unsupported.push(`${motor.name}.${method}() without a length — two motor runs; the firmware's ` +
                'synchronisation of the pair is not kept');
            const [lead, follow] = P;
            if (method === 'tank') {
                push(`run motor ${lead} at ${this.tok(a[0])} %`);
                push(`run motor ${follow} at ${this.tok(a[1])} %`);
                return true;
            }
            // pxt-ev3 steer: the leader at `speed`, the follower at
            // speed * (100 - |turn|) / 100 (turn > 0 slows the follower,
            // turn < 0 the leader), as the firmware's step sync does.
            const turnNode = a[0];
            const speed = this.tok(a[1]);
            if (turnNode && turnNode.type === 'Number' || (turnNode && turnNode.type === 'Unary' && turnNode.argument.type === 'Number')) {
                const t = turnNode.type === 'Number' ? Number(turnNode.value) : -Number(turnNode.argument.value);
                const inner = /^-?\d+(\.\d+)?$/.test(speed) ? num(Number(speed) * (100 - Math.abs(t)) / 100) :
                    `(${speed} * ${num((100 - Math.abs(t)) / 100)})`;
                push(`run motor ${lead} at ${t >= 0 ? speed : inner} %`);
                push(`run motor ${follow} at ${t >= 0 ? inner : speed} %`);
                return true;
            }
            const turn = this.single(turnNode, out, '  '.repeat(indent));
            const inner = `(${speed} * (100 - (abs of ${turn})) / 100)`;
            push(`IF ${turn} < 0 THEN:`);
            push(`  run motor ${lead} at ${inner} %`);
            push(`  run motor ${follow} at ${speed} %`);
            push('ELSE:');
            push(`  run motor ${lead} at ${speed} %`);
            push(`  run motor ${follow} at ${inner} %`);
            return true;
        }
        default:
            return false;
        }
    }

    sensorCommand (sensor, method, a, push) {
        const {kind, port} = sensor;
        const refuse = why => {
            push(this.note(`${sensor.name}.${method}() — ${why}`));
            return true;
        };
        if (kind === 'gyro' && (method === 'reset' || method === 'calibrate')) {
            if (method === 'calibrate') {
                this.unsupported.push(`${sensor.name}.calibrate() — written as \`reset gyro\`; the extension ` +
                    'resets the angle and does not measure drift');
            }
            push(`reset gyro ${port}`);
            return true;
        }
        if (kind === 'gyro' && method === 'pauseUntilRotated') {
            // pxt-ev3: the angle has moved `degrees` from where it was, in that direction.
            const start = this.freshName('_gyro');
            push(`set ${start} to ev3 gyro ${port} angle`);
            const deg = this.tok(a[0]);
            push(`IF ${deg} < 0 THEN:`);
            push(`  wait until not ((ev3 gyro ${port} angle) > (${start} + ${deg}))`);
            push('ELSE:');
            push(`  wait until not ((ev3 gyro ${port} angle) < (${start} + ${deg}))`);
            if (a[1]) this.unsupported.push(`${sensor.name}.pauseUntilRotated() timeout — waited for without one`);
            return true;
        }
        if (kind === 'touch' && method === 'pauseUntil') {
            this.waitForEvent(`ev3 touch ${port} pressed`, this.member(a[0], 'ButtonEvent'), push);
            return true;
        }
        if (kind === 'color' && method === 'pauseUntilColorDetected') {
            push(`wait until (ev3 color ${port} color) = ${this.tok(a[0])}`);
            return true;
        }
        if (kind === 'color' && method === 'pauseUntilLightDetected') {
            const test = this.lightTest(port, a[0], a[1]);
            if (!test) return refuse('a light condition with no default threshold');
            push(`wait until ${test}`);
            return true;
        }
        if ((kind === 'ultrasonic' || kind === 'infrared') && method === 'pauseUntil') {
            const test = this.proximityTest(kind, port, a[0]);
            if (!test) return refuse('an event polling cannot see (movement is a change between readings)');
            push(`wait until ${test}`);
            return true;
        }
        if (method === 'setThreshold' || method === 'calibrateLight') {
            return refuse('the polled conditions keep pxt-ev3\'s default thresholds');
        }
        return refuse(`no ${kind} sensor block does that`);
    }

    /** Waiting for a button-like event: Pressed at the press, Released/Bumped at the release. */
    waitForEvent (pressed, event, push) {
        push(`wait until ${pressed}`);
        if (event === 'Released' || event === 'Bumped') push(`wait until not (${pressed})`);
    }

    /** `Light.Dark` / `Light.Bright` on a mode, at pxt-ev3's default thresholds. */
    lightTest (port, modeNode, conditionNode) {
        const mode = this.member(modeNode, 'LightIntensityMode') || 'Reflected';
        const word = {Reflected: 'reflected', Ambient: 'ambient'}[mode];
        const cond = this.member(conditionNode, 'Light');
        if (!word || !cond) return null;
        const {low, high} = EV3_THRESHOLDS.color;
        return cond === 'Dark' ? `not ((ev3 color ${port} ${word}) > ${low})` : `not ((ev3 color ${port} ${word}) < ${high})`;
    }

    /** ObjectNear on an ultrasonic or infrared sensor, at pxt-ev3's default threshold. */
    proximityTest (kind, port, eventNode) {
        const event = this.member(eventNode, kind === 'ultrasonic' ? 'UltrasonicSensorEvent' : 'InfraredSensorEvent');
        const reading = kind === 'ultrasonic' ? `ev3 distance ${port} cm` : `ev3 infrared ${port} proximity`;
        if (event === 'ObjectNear') return `not ((${reading}) > ${EV3_THRESHOLDS[kind].low})`;
        // The infrared sensor's ObjectDetected is its HIGH threshold crossing.
        if (kind === 'infrared' && event === 'ObjectDetected') return `not ((${reading}) < ${EV3_THRESHOLDS.infrared.high})`;
        return null;
    }
}

/** `() => cond` / `function () { return cond }` -> cond. */
function returned (fn) {
    const body = bodyOf(fn);
    if (fn.expression) return fn.expression;
    const r = body.find(st => st.type === 'Return');
    return r ? r.value : {type: 'Boolean', value: true};
}

/** Does this function body `return` a VALUE (not counting functions nested in it)? */
function returnsValue (body) {
    let found = false;
    const walk = node => {
        if (found || !node || typeof node !== 'object') return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.type === 'Return' && node.value) {
            found = true;
            return;
        }
        if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') return;
        for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(body);
    return found;
}

/**
 * The polled shape of an EV3 handler: `test` runs the body, then `release`
 * is waited out so the body runs once per event; `wait` is waited for BEFORE
 * the body (a release). Null when the call is no handler we know.
 */
function handlerShape (t, call) {
    const c = call.callee;
    if (!c || c.type !== 'Member') return null;
    const method = c.name;
    const a = call.args || [];
    const sensor = t.sensorOf(c.object);
    const button = t.buttonOf(c.object);
    const pressed = sensor && sensor.kind === 'touch' ? `ev3 touch ${sensor.port} pressed` :
        button ? `ev3 button ${button} pressed` : null;
    if (pressed && method === 'onEvent') {
        const event = t.member(a[0], 'ButtonEvent') || 'Pressed';
        if (event === 'Pressed') return {test: pressed, release: pressed};
        return {test: pressed, wait: `not (${pressed})`};
    }
    if (!sensor) return null;
    if (sensor.kind === 'color' && method === 'onColorDetected') {
        const test = `(ev3 color ${sensor.port} color) = ${t.tok(a[0])}`;
        return {test, release: test};
    }
    if (sensor.kind === 'color' && method === 'onLightDetected') {
        const test = t.lightTest(sensor.port, a[0], a[1]);
        return test ? {test, release: test} : {refuse: `${sensor.name}.onLightDetected() — a light condition with no default threshold`};
    }
    if ((sensor.kind === 'ultrasonic' || sensor.kind === 'infrared') && method === 'onEvent') {
        const test = t.proximityTest(sensor.kind, sensor.port, a[0]);
        return test ? {test, release: test} :
            {refuse: `${sensor.name}.onEvent(ObjectDetected) — movement is a change between readings, which polling does not see`};
    }
    return null;
}

/**
 * Translate a MakeCode EV3 project.
 *
 * @param {string} source the project's main.ts
 * @param {object} [opts]
 * @param {string} [opts.name] used only in the header comment
 * @returns {{code: string, unsupported: Array<string>, scripts: number}}
 */
export function ev3ToPseudocode (source, opts = {}) {
    const ast = parseMakeCodeTs(source);
    const t = new Ev3Translator();
    t.aliases = new Map();
    t.claimNames(ast);
    t.claimRecords(ast);

    for (const st of ast.body) {
        if (st.type === 'Enum') t.statement(st, 0, []);
        if (st.type === 'FunctionDeclaration') {
            t.functions.push({name: t.procName(st.name), source: st.name, params: st.params, paramTypes: st.paramTypes,
                returnType: st.returnType, body: st.body, scope: st.name});
        }
    }
    for (const fn of t.functions) {
        if (returnsValue(fn.body)) {
            let result = `${fn.name}_result`;
            while (t.taken && t.taken.has(result)) result += '_';
            if (t.taken) t.taken.add(result);
            fn.result = result;
        }
    }

    const scripts = [];
    const main = [];
    for (const st of ast.body) {
        if (st.type === 'Enum' || st.type === 'FunctionDeclaration') continue;
        const call = st.type === 'ExpressionStatement' && st.expr.type === 'Call' ? st.expr : null;
        const callName = call ? t.path(call.callee) : null;

        // Top-level loops and parallel starts are scripts of their own, which
        // is what two `WHEN flag clicked` hats say.
        if (callName === 'forever' || callName === 'loops.forever') {
            const lines = ['WHEN flag clicked:', '  FOREVER:'];
            t.block(t.leavable(bodyOf(call.args[0]), 'forever'), 2, lines);
            scripts.push(lines);
            continue;
        }
        if (callName === 'control.runInParallel') {
            const lines = ['# control.runInParallel — a script of its own, started with the program.', 'WHEN flag clicked:'];
            t.block(t.leavable(bodyOf(call.args[0]), 'parallel'), 1, lines);
            scripts.push(lines);
            continue;
        }
        const shape = call ? handlerShape(t, call) : null;
        if (shape) {
            if (shape.refuse) {
                t.unsupported.push(shape.refuse);
                scripts.push([`# unsupported: ${shape.refuse}`]);
                continue;
            }
            const body = t.leavable(bodyOf(call.args[call.args.length - 1]), call.callee.name);
            const lines = [
                `# ${callName} — MakeCode fires this on an event; here it is polled.`,
                'WHEN flag clicked:',
                '  FOREVER:',
                `    IF ${shape.test} THEN:`
            ];
            if (shape.wait) lines.push(`      wait until ${shape.wait}`);
            t.block(body, 3, lines);
            if (shape.release) lines.push(`      wait until not (${shape.release})`);
            scripts.push(lines);
            continue;
        }
        t.statement(st, 1, main);
    }

    // The export writes every script after the first as a parallel start, so a
    // program whose first script IS one comes back with it as the main code.
    if (!main.length && scripts.some(s => /^# control\.runInParallel/.test(s[0]))) {
        t.unsupported.push('control.runInParallel() — the program\'s first script, so it comes back to MakeCode as the main code');
    }
    const out = ['DEVICE EV3', ''];
    if (opts.name) out.push(`# Imported from MakeCode for LEGO MINDSTORMS EV3: ${opts.name}`, '');

    const defines = [];
    t.inProcedure = true;
    for (const fn of t.functions) {
        if (fn.generic || (!fn.specialOf && (fn.params || []).some(p => fn.paramTypes && fn.paramTypes[p] && fn.paramTypes[p].isArray))) continue;
        const signature = fn.params && fn.params.length ?
            `${fn.name} ${fn.params.map(p => `(${t.varName(p)})`).join(' ')}` : fn.name;
        const lines = [`DEFINE ${signature}:`];
        t.returnable = {result: fn.result || null};
        if (fn.record) {
            t.selfRecord = fn.record;
            t.aliases.set('this', 'self');
        }
        t.arrayAliases = fn.arrayAliases || null;
        t.scope = fn.scope || null;
        t.block(fn.body, 1, lines);
        t.scope = null;
        t.arrayAliases = null;
        t.selfRecord = null;
        t.aliases.delete('this');
        t.returnable = null;
        defines.push(...lines, '');
    }
    const prelude = t.recordPrelude().map(line => `  ${line}`);
    if (prelude.length) main.unshift(...prelude);
    const renames = t.renameNotes();
    if (renames.length) out.push(...renames, '');
    if (main.length) out.push('WHEN flag clicked:', ...main, '');
    for (const script of scripts) out.push(...script, '');
    out.push(...defines);
    if (!main.length && !scripts.length) out.push('WHEN flag clicked:', '  # (nothing translatable in this project)', '');

    return {
        code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)],
        scripts: scripts.length + (main.length ? 1 : 0)
    };
}

export default ev3ToPseudocode;
