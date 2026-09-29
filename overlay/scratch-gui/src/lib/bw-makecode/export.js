/**
 * The other direction: a BrickWright project → a file MakeCode opens.
 *
 * Two halves, and the second is the surprising one.
 *
 * **Blocks → TypeScript.** A walk over the compiled project's blocks,
 * emitting the MakeCode vocabulary that microbit-translate.js reads on
 * the way in. It is the inverse of that table, which is why the two live
 * next to each other: a mapping added on one side and forgotten on the
 * other is a round trip that quietly loses a block.
 *
 * **TypeScript → a .hex MakeCode will import.** MakeCode's own importer
 * (`pxt.cpp.unpackSourceFromHexAsync`) does not care about the machine
 * code in a .hex — it scans for the source-embedding header, reads the
 * JSON meta and the project text, and opens THAT. The `compression`
 * field is optional. So a hex carrying nothing but the embed is a
 * perfectly good MakeCode project file: a few hundred bytes that
 * makecode.microbit.org opens as the project it describes.
 *
 * That is the same container embedded-source.js reads, written from the
 * other end, which is exactly how the test proves it: the export is fed
 * back through the importer.
 *
 * @module
 */

import {MICROBIT_ICONS, MICROBIT_ARROWS} from './microbit-icons.js';

const MAGIC = [0x41, 0x14, 0x0E, 0x2F, 0xB8, 0x2F, 0xA2, 0xBB];

/**
 * Pattern digits → the icon that draws them, so an exported program says
 * `basic.showIcon(IconNames.Heart)` rather than spelling out a grid the
 * reader has to decode. The lookup is exact, which keeps the round trip
 * stable: showIcon imports to those digits and exports back to showIcon.
 */
const ICON_BY_PATTERN = new Map([
    ...Object.entries(MICROBIT_ICONS).map(([name, pattern]) => [pattern, `IconNames.${name}`]),
    ...Object.entries(MICROBIT_ARROWS).map(([name, pattern]) => [pattern, `ArrowNames.${name}`])
]);

/** Where the embed sits in flash. Any page MakeCode does not use will do. */
const EMBED_ADDRESS = 0x3B400;

// ─── blocks → TypeScript ────────────────────────────────────────────────

const PIN = field => String(field || 'P0').toUpperCase();

/** MakeCode's enum spellings for the values our fields hold. */
const BUTTON = {a: 'Button.A', b: 'Button.B', ab: 'Button.AB'};
/** Reporters that already ARE a boolean, so comparing them to "true" is noise. */
const BOOLEAN_REPORTERS = new Set([
    'microbitplus_isgesture', 'microbitplus_istouch', 'microbitplus_isbutton',
    'microbitplus_ispinhigh', 'microbitplus_islogo', 'operator_and', 'operator_or', 'operator_not',
    'operator_gt', 'operator_lt', 'operator_equals', 'operator_contains',
    'sensing_keypressed', 'sensing_touchingobject',
    'microbitplus_spritetouching', 'microbitplus_spritetouchingedge', 'microbitplus_spritedeleted',
    'microbitplus_isgameover', 'microbitplus_isrunning', 'microbitplus_ispaused',
    'microbitplus_imagepixel', 'microbitplus_point'
]);

/** The dialect's sprite property word -> MakeCode's LedSpriteProperty member. */
const SPRITE_PROPERTY = {x: 'X', y: 'Y', direction: 'Direction', brightness: 'Brightness', blink: 'Blink'};

const AXIS = {x: 'Dimension.X', y: 'Dimension.Y', z: 'Dimension.Z', strength: 'Dimension.Strength'};

/**
 * The block menu's gesture label → MakeCode's enum member. The exact
 * inverse of the importer's `Gesture` table: MakeCode names the two
 * logo gestures after the logo (`LogoUp`) where the menu names them
 * after the tilt, and the two mean the same motion.
 */
const GESTURE = {
    'shake': 'Gesture.Shake', 'tilt up': 'Gesture.LogoUp', 'tilt down': 'Gesture.LogoDown',
    'face up': 'Gesture.ScreenUp', 'face down': 'Gesture.ScreenDown',
    'tilt left': 'Gesture.TiltLeft', 'tilt right': 'Gesture.TiltRight',
    'freefall': 'Gesture.FreeFall', '3g': 'Gesture.ThreeG',
    '6g': 'Gesture.SixG', '8g': 'Gesture.EightG'
};
const PULL = {up: 'PinPullMode.PullUp', down: 'PinPullMode.PullDown', none: 'PinPullMode.PullNone'};
/** `beat quarter` → BeatFraction.Quarter; `play melody … in background` → PlaybackMode.InBackground. */
const BEAT_FRACTION = {whole: 'Whole', half: 'Half', quarter: 'Quarter', eighth: 'Eighth',
    sixteenth: 'Sixteenth', double: 'Double', breve: 'Breve'};
const PLAYBACK = {'until done': 'UntilDone', 'in background': 'InBackground', 'looping in background': 'LoopingInBackground'};
/** The radio hats, and the parameter MakeCode names their packet. */
const RADIO_HATS = {
    microbitplus_whenradionum: {call: 'radio.onReceivedNumber', param: 'receivedNumber'},
    microbitplus_whenradiostr: {call: 'radio.onReceivedString', param: 'receivedString'}
};

/**
 * Names MakeCode already declares at the top level. A program variable with
 * one of these names is a redeclaration MakeCode refuses (`let light = 0`
 * against pxt-microbit's `light` namespace — census 2026-09-27), so it goes
 * across with a trailing underscore, which the importer reads back as is.
 */
const MAKECODE_GLOBALS = new Set([
    'basic', 'input', 'led', 'music', 'radio', 'pins', 'game', 'images', 'serial', 'control', 'light',
    'console', 'Math', 'power', 'loops', 'logic', 'text', 'String', 'Array', 'Number', 'Boolean', 'Object',
    'Buffer', 'Image', 'Note', 'Melodies', 'BeatFraction', 'Button', 'Gesture', 'Dimension', 'Rotation',
    'DigitalPin', 'AnalogPin', 'TouchPin', 'PinPullMode', 'IconNames', 'ArrowNames', 'randint', 'pause',
    'pauseUntil', 'parseInt', 'parseFloat', 'convertToText'
]);

/**
 * Blocks -> MakeCode TypeScript for the micro:bit. Exported so another
 * MakeCode target (export-ev3.js) can reuse the walk and override the
 * vocabulary: `isBoolean`, `reporter`, `statement` and `globals`.
 */
export class Emitter {
    constructor (blocks) {
        this.blocks = blocks;
        this.unsupported = [];
        this.arrays = new Set();   // names met on `arrays` blocks; declared by the caller
    }

    block (id) {
        return id ? this.blocks[id] : null;
    }

    /** Is this opcode a reporter whose value is already true/false? */
    isBoolean (opcode) {
        return BOOLEAN_REPORTERS.has(opcode);
    }

    field (block, name) {
        return block.fields && block.fields[name] ? block.fields[name][0] : '';
    }

    /** An input, as a TypeScript expression. */
    value (block, name, fallback = '0') {
        const input = block.inputs && block.inputs[name];
        if (!input) return fallback;
        const slot = input[1];
        if (Array.isArray(slot)) {
            const [type, text] = slot;
            // The dialect has no boolean type: truth is 1 and 0 (its own
            // conditions read `A = 0`). A bare true/false in a value slot is
            // that number, not the string MakeCode would refuse to assign to
            // a number (census: four logic-lab programs, 2026-09-25).
            if ((type === 10 || type === 11) && /^(true|false)$/.test(String(text))) return String(text) === 'true' ? '1' : '0';
            if (type === 10 || type === 11) return JSON.stringify(String(text));
            if (type === 12 || type === 13) return this.variableName(text);
            return String(text);
        }
        if (typeof slot === 'string') {
            const b = this.block(slot);
            // A boolean reporter in a VALUE slot (set A to <button A pressed>)
            // is a number here, as in the dialect; Static TypeScript will not
            // assign a boolean to a number variable or compare it with one.
            if (b && this.isBoolean(b.opcode)) return `(${this.reporter(b)} ? 1 : 0)`;
            return this.reporter(b);
        }
        return fallback;
    }

    /** The reporter's TypeScript when this input is a boolean reporter, else null. */
    booleanInput (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        const r = typeof slot === 'string' ? this.block(slot) : null;
        return r && this.isBoolean(r.opcode) ? this.reporter(r) : null;
    }

    /**
     * An input read as TEXT: a text variable or literal as it is, anything
     * else made text the way a join is (`("" + n)`), so `.length` and `[i]`
     * typecheck whatever the value was.
     */
    textOperand (b, name) {
        const value = this.value(b, name, '""');
        const input = b.inputs && b.inputs[name] && b.inputs[name][1];
        const r = typeof input === 'string' ? this.block(input) : null;
        if (/^"/.test(value)) return value;
        const variable = Array.isArray(input) && input[0] === 12 ? this.variableName(input[1]) :
            r && r.opcode === 'data_variable' ? this.variableName(r.fields.VARIABLE[0]) : null;
        if (variable && this.textVars && this.textVars.has(variable)) return value;
        if (r && r.opcode === 'operator_join') return value;
        return `("" + ${value})`;
    }

    /** An array block's VALUE, with 0 read as null when the array holds sprites or images. */
    handleValue (b) {
        const value = this.value(b, 'VALUE');
        return value === '0' && this.spriteArrays && this.spriteArrays.has(this.arrayName(b)) ? 'null' : value;
    }

    /** The block plugged into this input, or null for a literal/empty slot. */
    inputBlock (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        return typeof slot === 'string' ? this.block(slot) : null;
    }

    /** `operator_equals(operator_random(0, 1), 1)` — a coin toss. */
    isCoinToss (b) {
        const random = this.inputBlock(b, 'OPERAND1');
        return !!random && random.opcode === 'operator_random' &&
            this.numberInput(random, 'FROM') === 0 && this.numberInput(random, 'TO') === 1 &&
            this.numberInput(b, 'OPERAND2') === 1;
    }

    /** The numeric literal in this input, or null. */
    numberInput (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        if (!Array.isArray(slot)) return null;
        const n = Number(slot[1]);
        return String(slot[1]).trim() !== '' && Number.isFinite(n) ? n : null;
    }

    /**
     * `<boolean> > 0`, `<boolean> = 1`, `<boolean> = 0` — how the dialect asks
     * "is it pressed" (read button_a > 0) — as the boolean itself.
     */
    booleanCompare (b, op) {
        const bool = this.booleanInput(b, 'OPERAND1');
        const n = this.numberInput(b, 'OPERAND2');
        if (bool === null || n === null) return null;
        if ((op === '>' && n === 0) || (op === '==' && n === 1)) return bool;
        if ((op === '==' && n === 0) || (op === '<' && n === 1)) return `(!${bool})`;
        return null;
    }

    /** The sprite in this block's SPRITE (or other) input, as a receiver. */
    sprite (b, name = 'SPRITE') {
        const value = this.value(b, name);
        return /^[A-Za-z_][\w.]*(\[[^\]]*\])?$/.test(value) ? value : `(${value})`;
    }

    variableName (name) {
        const id = String(name).replace(/[^A-Za-z0-9_]/g, '_') || 'v';
        return (this.globals || MAKECODE_GLOBALS).has(id) ? `${id}_` : id;
    }

    /**
     * The identifier for an `arrays` block's NAME input.
     *
     * The extension keys its registry by an arbitrary string, and
     * TypeScript needs an identifier, so the same sanitising the variables
     * get is applied — and the name is recorded, because nothing else
     * declares it.
     */
    arrayName (b) {
        const name = this.variableName(this.value(b, 'NAME', 'liste').replace(/^["']|["']$/g, ''));
        this.arrays.add(name);
        return name;
    }

    /**
     * If this `operator_equals` is really "is this boolean reporter true",
     * the reporter's own TypeScript; otherwise null.
     */
    booleanOperand (b) {
        const other = b.inputs && b.inputs.OPERAND2;
        const literal = Array.isArray(other) && Array.isArray(other[1]) ? String(other[1][1]) : null;
        if (literal !== 'true') return null;
        const left = b.inputs.OPERAND1;
        const id = Array.isArray(left) ? left.find(part => typeof part === 'string') : null;
        const reporter = id ? this.block(id) : null;
        if (!reporter || !this.isBoolean(reporter.opcode)) return null;
        return this.reporter(reporter);
    }

    /**
     * A `procedures_call` or `procedures_prototype` as {name, args}.
     *
     * `proccode` is `zeigen %s %s`: the literal words are the name and each
     * `%s`/`%b` is one argument, in call order. `argumentids` lines up with
     * it positionally, and `inputs` is keyed by those ids — so the proccode
     * is what has to be walked, not the inputs.
     */
    procedure (b) {
        const mutation = b.mutation || {};
        const proccode = String(mutation.proccode || '');
        let ids = [];
        try {
            ids = JSON.parse(mutation.argumentids || '[]');
        } catch (e) { ids = []; }
        let i = 0;
        const args = [];
        const words = proccode.replace(/%[sbn]/g, token => {
            const input = b.inputs && b.inputs[ids[i++]];
            args.push(token === '%b' ?
                (input ? this.reporter(this.block(input[1])) : 'false') :
                (input ? this.value(b, ids[i - 1], '0') : '0'));
            return '';
        });
        return {name: this.variableName(words.trim().replace(/\s+/g, '_')), args};
    }

    /** The `procedures_prototype` inside a definition's custom-block input. */
    prototypeOf (definition) {
        // The key is `custom_block` here, lowercase — Scratch's own files
        // use CUSTOM_BLOCK, and reading only that found nothing.
        const inputs = definition.inputs || {};
        const input = inputs.custom_block || inputs.CUSTOM_BLOCK;
        const id = Array.isArray(input) ? input.find(part => typeof part === 'string') : null;
        return id ? this.block(id) : null;
    }

    /** A prototype's parameter names, in declaration order. */
    parameterNames (prototype) {
        try {
            return JSON.parse((prototype.mutation || {}).argumentnames || '[]')
                .map(n => this.variableName(n));
        } catch (e) {
            return [];
        }
    }

    /** A boolean input. */
    condition (block, name) {
        const input = block.inputs && block.inputs[name];
        if (!input) return 'false';
        const slot = input[1];
        if (typeof slot === 'string') return this.reporter(this.block(slot));
        return 'false';
    }

    reporter (b) {
        if (!b) return '0';
        const v = name => this.value(b, name);
        const f = name => this.field(b, name);
        switch (b.opcode) {
        case 'data_variable': return this.variableName(f('VARIABLE'));
        case 'operator_add': return `(${v('NUM1')} + ${v('NUM2')})`;
        case 'operator_subtract': return `(${v('NUM1')} - ${v('NUM2')})`;
        case 'operator_multiply': return `(${v('NUM1')} * ${v('NUM2')})`;
        case 'operator_divide': return `(${v('NUM1')} / ${v('NUM2')})`;
        case 'operator_mod': return `(${v('NUM1')} % ${v('NUM2')})`;
        case 'operator_round': return `Math.round(${v('NUM')})`;
        case 'operator_random': return `randint(${v('FROM')}, ${v('TO')})`;
        // `"" + …` makes it text whatever the operands are; a join whose first
        // operand is already "" needs only the one.
        case 'operator_join':
            return v('STRING1') === '""' ? `("" + ${v('STRING2')})` : `("" + ${v('STRING1')} + ${v('STRING2')})`;
        // A character of a text, and a text's length. `letter` counts from 1
        // and TypeScript's index from 0; `letter (i + 1)` — how the importer
        // reads `s[i]` — goes back as `s[i]`, so a round trip stays put.
        case 'operator_letter_of': {
            const text = this.textOperand(b, 'STRING');
            const at = this.inputBlock(b, 'LETTER');
            const slot = b.inputs && b.inputs.LETTER && b.inputs.LETTER[1];
            if (Array.isArray(slot) && /^\d+$/.test(String(slot[1]))) return `${text}[${Number(slot[1]) - 1}]`;
            const one = at && at.opcode === 'operator_add' && at.inputs.NUM2 && Array.isArray(at.inputs.NUM2[1]) &&
                String(at.inputs.NUM2[1][1]) === '1';
            return one ? `${text}[${this.value(at, 'NUM1')}]` : `${text}[${v('LETTER')} - 1]`;
        }
        case 'operator_length': return `${this.textOperand(b, 'STRING')}.length`;
        case 'operator_gt': return this.booleanCompare(b, '>') || `(${v('OPERAND1')} > ${v('OPERAND2')})`;
        case 'operator_lt': return this.booleanCompare(b, '<') || `(${v('OPERAND1')} < ${v('OPERAND2')})`;
        case 'operator_equals': {
            // `equals(<boolean reporter>, "true")` is how the compiler puts a
            // boolean reporter into a Scratch boolean slot. Rendering it
            // literally hands MakeCode `input.isGesture(…) == "true"`, and
            // Static TypeScript will not compare a boolean to a string. The
            // reporter alone says the same thing and typechecks.
            const bare = this.booleanOperand(b);
            if (bare !== null) return bare;
            // `(pick random 0 to 1) = 1` is how the importer says
            // Math.randomBoolean() in a dialect without booleans; read back,
            // it is that call again rather than a comparison MakeCode would
            // show as a different block.
            if (this.isCoinToss(b)) return 'Math.randomBoolean()';
            return this.booleanCompare(b, '==') || `(${v('OPERAND1')} == ${v('OPERAND2')})`;
        }
        case 'operator_and': return `(${this.condition(b, 'OPERAND1')} && ${this.condition(b, 'OPERAND2')})`;
        case 'operator_or': return `(${this.condition(b, 'OPERAND1')} || ${this.condition(b, 'OPERAND2')})`;
        case 'operator_not': return `(!(${this.condition(b, 'OPERAND')}))`;
        case 'operator_mathop': {
            const op = f('OPERATOR');
            const map = {abs: 'Math.abs', floor: 'Math.floor', ceiling: 'Math.ceil', sqrt: 'Math.sqrt'};
            if (map[op]) return `${map[op]}(${v('NUM')})`;
            this.unsupported.push(`${op} of …`);
            return v('NUM');
        }
        case 'microbitplus_accel': return `input.acceleration(${AXIS[f('AXIS')] || 'Dimension.X'})`;
        case 'microbitplus_pitch': return 'input.rotation(Rotation.Pitch)';
        case 'microbitplus_roll': return 'input.rotation(Rotation.Roll)';
        case 'microbitplus_compass': return 'input.compassHeading()';
        // `absolute` is the block's word for the total field, MakeCode's Strength.
        case 'microbitplus_magforce':
            return `input.magneticForce(${f('AXIS') === 'absolute' ? 'Dimension.Strength' : AXIS[f('AXIS')] || 'Dimension.X'})`;
        case 'microbitplus_light': return 'input.lightLevel()';
        case 'microbitplus_temp': return 'input.temperature()';
        case 'microbitplus_sound': return 'input.soundLevel()';
        case 'microbitplus_isbutton': return `input.buttonIsPressed(${BUTTON[String(f('BTN')).toLowerCase()] || 'Button.A'})`;
        case 'microbitplus_digitalread': return `pins.digitalReadPin(DigitalPin.${PIN(f('PIN'))})`;
        case 'microbitplus_analogread': return `pins.analogReadPin(AnalogPin.${PIN(f('PIN'))})`;
        // Inside its hat the packet is the handler's parameter; anywhere else
        // it is the last packet, which MakeCode still reads with these calls.
        case 'microbitplus_radiolastnum': return this.radioHat === 'microbitplus_whenradionum' ? 'receivedNumber' : 'radio.receivedNumber()';
        case 'microbitplus_radiolaststr': return this.radioHat === 'microbitplus_whenradiostr' ? 'receivedString' : 'radio.receivedString()';
        case 'microbitplus_beat': return `music.beat(BeatFraction.${BEAT_FRACTION[f('FRACTION')] || 'Whole'})`;
        case 'microbitplus_notefreq': return `music.noteFrequency(Note.${f('NOTE') || 'C'})`;
        case 'microbitplus_tempo': return 'music.tempo()';
        case 'microbitplus_islogo': return 'input.logoIsPressed()';
        case 'microbitplus_radiorssi': return 'radio.receivedPacket(RadioPacketProperty.SignalStrength)';
        case 'microbitplus_radiolastserial': return 'radio.receivedPacket(RadioPacketProperty.SerialNumber)';
        case 'microbitplus_deviceserial': return 'control.deviceSerialNumber()';
        // An image is MakeCode's Image; its variables and arrays are typed so
        // (imageNames).
        case 'microbitplus_createimage': return `images.createImage(\`\n${ledsOf(f('MATRIX'))}\n    \`)`;
        case 'microbitplus_imagepixel': return `${v('IMAGE')}.pixel(${v('X')}, ${v('Y')})`;
        case 'microbitplus_point': return `led.point(${v('X')}, ${v('Y')})`;
        case 'microbitplus_parsenumber': return `parseFloat(${this.textOperand(b, 'TEXT')})`;
        case 'planetemaths_pow': return `Math.pow(${v('NUM1')}, ${v('NUM2')})`;
        case 'sensing_timer': return '(input.runningTime() / 1000)';
        // Inside a DEFINE, a parameter is read through one of these.
        case 'argument_reporter_string_number':
        case 'argument_reporter_boolean': return this.variableName(f('VALUE'));
        // Added to the importer in sb3-creator#3 and never to this table,
        // which is exactly the asymmetry the round-trip gate exists to
        // catch — twelve of them in the Calliope corpus.
        // Planète Maths' min/max: the importer's spelling for Math.min/max.
        case 'planetemaths_min': return `Math.min(${v('NUM1')}, ${v('NUM2')})`;
        case 'planetemaths_max': return `Math.max(${v('NUM1')}, ${v('NUM2')})`;
        case 'microbitplus_score': return 'game.score()';
        // LED sprites: a handle is a game.LedSprite on MakeCode's side.
        case 'microbitplus_createsprite': return `game.createSprite(${v('X')}, ${v('Y')})`;
        case 'microbitplus_spriteget':
            return `${this.sprite(b)}.get(LedSpriteProperty.${SPRITE_PROPERTY[f('PROPERTY')] || 'X'})`;
        case 'microbitplus_spritetouching': return `${this.sprite(b)}.isTouching(${this.sprite(b, 'OTHER')})`;
        case 'microbitplus_spritetouchingedge': return `${this.sprite(b)}.isTouchingEdge()`;
        case 'microbitplus_spritedeleted': return `${this.sprite(b)}.isDeleted()`;
        case 'microbitplus_isgameover': return 'game.isGameOver()';
        case 'microbitplus_isrunning': return 'game.isRunning()';
        case 'microbitplus_ispaused': return 'game.isPaused()';
        case 'microbitplus_life': return 'game.life()';
        case 'microbitplus_map':
            return `pins.map(${v('VALUE')}, ${v('FROMLOW')}, ${v('FROMHIGH')}, ${v('TOLOW')}, ${v('TOHIGH')})`;
        case 'microbitplus_isgesture':
            return `input.isGesture(${GESTURE[String(f('GESTURE')).toLowerCase()] || 'Gesture.Shake'})`;
        case 'microbitplus_istouch':
            return `input.pinIsPressed(TouchPin.${PIN(f('PIN'))})`;

        // The `arrays` extension holds NAMED arrays in a registry, and it
        // indexes from 0 — which is why the importer chose it over Scratch
        // lists, and why the way back is exact rather than shifted.
        case 'arrays_get': return `${this.arrayName(b)}[${v('INDEX')}]`;
        case 'arrays_length': return `${this.arrayName(b)}.length`;
        case 'arrays_pop': return `${this.arrayName(b)}.pop()`;
        case 'arrays_indexOf': return `${this.arrayName(b)}.indexOf(${v('VALUE')})`;
        case 'arrays_contains': return `(${this.arrayName(b)}.indexOf(${v('VALUE')}) >= 0)`;
        case 'arrays_reverse': return `${this.arrayName(b)}.reverse()`;

        // MakeCode's TypeScript has the operators the pseudocode had to
        // borrow an extension for, so these go back as themselves.
        case 'bitops_and': return `(${v('NUM1')} & ${v('NUM2')})`;
        // `(a / b) bitor 0` is Math.idiv's own definition, which is how the
        // importer writes it; the way back names the call.
        case 'bitops_or': {
            const quotient = this.numberInput(b, 'NUM2') === 0 ? this.inputBlock(b, 'NUM1') : null;
            if (quotient && quotient.opcode === 'operator_divide') {
                return `Math.idiv(${this.value(quotient, 'NUM1')}, ${this.value(quotient, 'NUM2')})`;
            }
            return `(${v('NUM1')} | ${v('NUM2')})`;
        }
        case 'bitops_xor': return `(${v('NUM1')} ^ ${v('NUM2')})`;
        case 'bitops_shl': return `(${v('NUM1')} << ${v('NUM2')})`;
        case 'bitops_shr': return `(${v('NUM1')} >> ${v('NUM2')})`;
        case 'bitops_not': return `(~${v('NUM')})`;
        default:
            this.unsupported.push(`${b.opcode} as a value`);
            return '0';
        }
    }

    /**
     * One `WHEN flag clicked` script, the `n`th of its target. On the
     * micro:bit every script is written where it stands: its handlers come
     * back as basic.forever, which never blocks what follows.
     */
    flagScript (hat, n) {
        void n;
        return this.stack(hat.next, 0);
    }

    /** A stack of blocks, as TypeScript statements. */
    stack (id, indent) {
        const out = [];
        let b = this.block(id);
        while (b) {
            this.statement(b, indent, out);
            b = this.block(b.next);
        }
        return out;
    }

    substack (b, name, indent) {
        const input = b.inputs && b.inputs[name];
        const first = input && typeof input[1] === 'string' ? input[1] : null;
        return this.stack(first, indent);
    }

    statement (b, indent, out) {
        const pad = '    '.repeat(indent);
        const push = line => out.push(pad + line);
        const v = name => this.value(b, name);
        const f = name => this.field(b, name);

        switch (b.opcode) {
        case 'control_forever':
            push('basic.forever(function () {');
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('})');
            return;
        case 'control_repeat':
            push(`for (let i = 0; i < ${v('TIMES')}; i++) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('}');
            return;
        case 'control_repeat_until':
            push(`while (!(${this.condition(b, 'CONDITION')})) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('}');
            return;
        case 'control_if':
            push(`if (${this.condition(b, 'CONDITION')}) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('}');
            return;
        case 'control_if_else':
            push(`if (${this.condition(b, 'CONDITION')}) {`);
            out.push(...this.substack(b, 'SUBSTACK', indent + 1));
            push('} else {');
            out.push(...this.substack(b, 'SUBSTACK2', indent + 1));
            push('}');
            return;
        case 'control_wait': {
            // A literal duration is written as milliseconds, the way MakeCode's
            // own blocks write it — and the way the importer reads it back to the
            // same seconds, so a round trip is a fixed point.
            const d = v('DURATION');
            const n = Number(d);
            push(d.trim() !== '' && Number.isFinite(n) ?
                `basic.pause(${Math.round(n * 1000 * 1000) / 1000})` :
                `basic.pause(${d} * 1000)`);
            return;
        }
        case 'control_wait_until':
            push(`pauseUntil(() => ${this.condition(b, 'CONDITION')})`);
            return;
        // `stop this script` in a function or a radio handler is how the
        // importer writes MakeCode's `return` (see translate-base.js Return),
        // and it goes back as that.
        case 'control_stop':
            if (this.inFunction && f('STOP_OPTION') === 'this script') {
                push('return');
                return;
            }
            push('control.reset()');
            return;

        // A user-defined function. MakeCode has these natively, so the whole
        // shape survives — but the proccode is the only place the argument
        // ORDER lives, so the arguments are read out of it rather than out
        // of `inputs`, whose key order is not the call's.
        case 'procedures_call': {
            const {name, args} = this.procedure(b);
            push(`${name}(${args.join(', ')})`);
            return;
        }

        case 'data_setvariableto': {
            // A sprite variable's "none" is null on MakeCode's side, not 0.
            const name = this.variableName(f('VARIABLE'));
            const value = v('VALUE');
            const handle = (this.spriteVars && this.spriteVars.has(name)) || (this.imageVars && this.imageVars.has(name));
            push(`${name} = ${handle && value === '0' ? 'null' : value}`);
            return;
        }
        case 'data_changevariableby':
            push(`${this.variableName(f('VARIABLE'))} += ${v('VALUE')}`);
            return;

        // An array's name is an INPUT on these blocks rather than a Scratch
        // variable, so the declaration cannot come from target.variables the
        // way an ordinary one does. Each name met here is recorded, and
        // projectToMakeCodeTs emits `let <name>: number[] = []` for it.
        case 'arrays_createEmpty':
            this.arrays.add(this.arrayName(b));
            return;                                   // the declaration IS the creation
        case 'arrays_create1D': {
            // The literal's own text, not value(): value() JSON-quotes a text
            // input, and stripping only the outer quotes left `[\"cat\"]`
            // escaped — a string array MakeCode could not read.
            const slot = b.inputs && b.inputs.JSON && b.inputs.JSON[1];
            let json = Array.isArray(slot) ? String(slot[1]) : this.value(b, 'JSON', '[]').replace(/^["']|["']$/g, '');
            // A sprite array's placeholder 0 (a record's "no sprite") is
            // MakeCode's null: its array is game.LedSprite[].
            if (this.spriteArrays && this.spriteArrays.has(this.arrayName(b)) && /^\[\s*0(\s*,\s*0)*\s*\]$/.test(json)) {
                json = json.replace(/0/g, 'null');
            }
            push(`${this.arrayName(b)} = ${json}`);
            return;
        }
        case 'arrays_createRange':
            push(`${this.arrayName(b)} = []`);
            push(`for (let i = ${v('START')}; i <= ${v('END')}; i++) ` +
                `{ ${this.arrayName(b)}.push(i) }`);
            return;
        // In an array of sprites or images, 0 is "none" — MakeCode's null.
        case 'arrays_push':
            push(`${this.arrayName(b)}.push(${this.handleValue(b)})`);
            return;
        case 'arrays_set':
            push(`${this.arrayName(b)}[${v('INDEX')}] = ${this.handleValue(b)}`);
            return;
        case 'arrays_insert':
            push(`${this.arrayName(b)}.insertAt(${v('INDEX')}, ${v('VALUE')})`);
            return;
        case 'arrays_remove':
            push(`${this.arrayName(b)}.removeAt(${v('INDEX')})`);
            return;

        case 'microbitplus_showmatrix': {
            const digits = String(f('MATRIX')).replace(/[^0-9]/g, '');
            const named = ICON_BY_PATTERN.get((digits.match(/.{5}/g) || []).join(':'));
            if (named) {
                push(`basic.${named.startsWith('Arrow') ? 'showArrow' : 'showIcon'}(${named})`);
                return;
            }
            // MakeCode's LED literals are on/off; ours carry brightness.
            // Flattening 1..8 to "lit" is a real loss and gets said.
            if (/[1-8]/.test(digits)) {
                this.unsupported.push('LED brightness levels — MakeCode\'s display literals are on/off');
            }
            push(`basic.showLeds(\`${ledsOf(f('MATRIX'))}\n${pad}    \`)`);
            return;
        }
        // MakeCode's two picture calls, each as itself (they pause 400 / 600 ms).
        // A picture that is none of MakeCode's icons cannot be a showIcon; it
        // goes back as the LED grid, and says so.
        case 'microbitplus_showleds':
            push(`basic.showLeds(\`${ledsOf(f('MATRIX'))}\n${pad}    \`)`);
            return;
        case 'microbitplus_showicon': {
            const digits = String(f('MATRIX')).replace(/[^0-9]/g, '');
            const named = ICON_BY_PATTERN.get((digits.match(/.{5}/g) || []).join(':'));
            if (named) {
                push(`basic.${named.startsWith('Arrow') ? 'showArrow' : 'showIcon'}(${named})`);
                return;
            }
            this.unsupported.push('show icon with a picture that is not one of MakeCode\'s icons — sent as showLeds');
            push(`basic.showLeds(\`${ledsOf(f('MATRIX'))}\n${pad}    \`)`);
            return;
        }
        // `show number` is MakeCode's showNumber itself (it waits while shown);
        // 150 is its default interval, so it is left implicit.
        case 'microbitplus_shownumber': {
            const ms = v('MS', '150');
            push(ms === '150' ? `basic.showNumber(${v('VALUE')})` : `basic.showNumber(${v('VALUE')}, ${ms})`);
            return;
        }
        case 'microbitplus_showtext':
            push(`basic.showString(${v('TEXT', '""')})`);
            return;
        case 'microbitplus_scrolltext': {
            // MakeCode's second argument is ms per scroll step — the same
            // quantity as our `delay … ms` (MicroPython's display.scroll(delay=)).
            // It was dropped here without a word (census 2026-09-25). 150 is
            // MakeCode's own default, so it is left implicit.
            const ms = v('MS', '150');
            push(ms === '150' ? `basic.showString(${v('TEXT', '""')})` : `basic.showString(${v('TEXT', '""')}, ${ms})`);
            return;
        }
        case 'microbit_display':
            push(f('MODE') === 'text' ?
                `basic.showString(${v('VALUE', '""')})` :
                `basic.showNumber(${v('VALUE')})`);
            return;
        case 'microbitplus_cleardisplay':
            push('basic.clearScreen()');
            return;
        // `print` is the serial line (MicroPython's print() on the micro:bit).
        // writeLine takes text, so anything that is not already text is made
        // text the way a join is written — which is also how it reads back.
        case 'stc12_print': {
            const value = v('VALUE');
            const input = this.inputBlock(b, 'VALUE');
            // `print ("Accel:" join n)` is how the importer reads MakeCode's
            // serial.writeValue("Accel", n) — the same line on the wire — and
            // it goes back as that, while the value is a number: a text value
            // after the colon stays a writeLine (writeValue takes a number).
            const label = input && input.opcode === 'operator_join' ? input.inputs.STRING1 && input.inputs.STRING1[1] : null;
            const rest = input && input.opcode === 'operator_join' ? this.inputBlock(input, 'STRING2') : null;
            if (Array.isArray(label) && /^[^:]+:$/.test(String(label[1])) && rest &&
                !['operator_join', 'operator_letter_of', 'microbitplus_radiolaststr'].includes(rest.opcode)) {
                push(`serial.writeValue(${JSON.stringify(String(label[1]).slice(0, -1))}, ${this.value(input, 'STRING2')})`);
                return;
            }
            const isText = /^"/.test(value) || (input && input.opcode === 'operator_join');
            push(`serial.writeLine(${isText ? value : `("" + ${value})`})`);
            return;
        }
        case 'microbitplus_plot':
            push(`led.${f('STATE') === 'off' ? 'unplot' : 'plot'}(${v('X')}, ${v('Y')})`);
            return;

        // MakeCode's led and game calls, which the importer reads into these.
        case 'microbitplus_plotbargraph':
            push(`led.plotBarGraph(${v('VALUE')}, ${v('HIGH')})`);
            return;
        case 'microbitplus_toggle':
            push(`led.toggle(${v('X')}, ${v('Y')})`);
            return;
        case 'microbitplus_plotbrightness':
            push(`led.plotBrightness(${v('X')}, ${v('Y')}, ${v('BRIGHTNESS')})`);
            return;
        // setPixel takes a boolean; the dialect's truth is 1 and 0, and
        // `v != 0` is read back as v.
        case 'microbitplus_imagesetpixel': {
            const slot = b.inputs && b.inputs.VALUE && b.inputs.VALUE[1];
            const lit = Array.isArray(slot) ? String(slot[1]) : null;
            const truth = lit === '1' || lit === 'true' ? 'true' : lit === '0' || lit === 'false' ? 'false' :
                this.booleanInput(b, 'VALUE') || `${v('VALUE')} != 0`;
            push(`${v('IMAGE')}.setPixel(${v('X')}, ${v('Y')}, ${truth})`);
            return;
        }
        case 'microbitplus_showimage':
            push(`${v('IMAGE')}.showImage(${v('OFFSET')})`);
            return;
        case 'microbitplus_plotimage':
            push(`${v('IMAGE')}.plotImage(${v('OFFSET')})`);
            return;
        case 'microbitplus_radioserial':
            push(`radio.setTransmitSerialNumber(${f('STATE') === 'off' ? 'false' : 'true'})`);
            return;
        case 'microbitplus_soundthreshold':
            push(`input.setSoundThreshold(SoundThreshold.${f('LEVEL') === 'quiet' ? 'Quiet' : 'Loud'}, ${v('THRESHOLD')})`);
            return;
        case 'microbitplus_setbrightness':
            push(`led.setBrightness(${v('BRIGHTNESS')})`);
            return;
        case 'microbitplus_stopanimation':
            push('led.stopAnimation()');
            return;
        case 'microbitplus_addscore':
            push(`game.addScore(${v('POINTS')})`);
            return;
        case 'microbitplus_setscore':
            push(`game.setScore(${v('VALUE')})`);
            return;
        case 'microbitplus_removelife':
            push(`game.removeLife(${v('LIFE')})`);
            return;
        case 'microbitplus_gameover':
            push('game.gameOver()');
            return;
        case 'microbitplus_startcountdown':
            push(`game.startCountdown(${v('MS')})`);
            return;
        case 'microbitplus_pausegame':
            push('game.pause()');
            return;
        case 'microbitplus_resumegame':
            push('game.resume()');
            return;
        case 'microbitplus_setlife':
            push(`game.setLife(${v('VALUE')})`);
            return;
        case 'microbitplus_addlife':
            push(`game.addLife(${v('LIVES')})`);
            return;
        // LED sprites, as MakeCode's own sprite blocks write them.
        case 'microbitplus_spriteset':
        case 'microbitplus_spritechange':
            push(`${this.sprite(b)}.${b.opcode === 'microbitplus_spriteset' ? 'set' : 'change'}(` +
                `LedSpriteProperty.${SPRITE_PROPERTY[f('PROPERTY')] || 'X'}, ${v('VALUE')})`);
            return;
        case 'microbitplus_spritemove':
            push(`${this.sprite(b)}.move(${v('LEDS')})`);
            return;
        case 'microbitplus_spriteturn':
            push(`${this.sprite(b)}.turn(Direction.${f('DIRECTION') === 'left' ? 'Left' : 'Right'}, ${v('DEGREES')})`);
            return;
        case 'microbitplus_spritebounce':
            push(`${this.sprite(b)}.ifOnEdgeBounce()`);
            return;
        case 'microbitplus_spritedelete':
            push(`${this.sprite(b)}.delete()`);
            return;

        case 'microbitplus_digitalwrite':
            push(`pins.digitalWritePin(DigitalPin.${PIN(f('PIN'))}, ${f('LEVEL') === '0' ? 0 : 1})`);
            return;
        case 'microbitplus_analogwrite':
            // Ours is a percentage, MakeCode's range is 0..1023.
            push(`pins.analogWritePin(AnalogPin.${PIN(f('PIN'))}, Math.round(${v('PCT')} * 1023 / 100))`);
            return;
        case 'microbitplus_setpull':
            push(`pins.setPull(DigitalPin.${PIN(f('PIN'))}, ${PULL[f('MODE')] || 'PinPullMode.PullNone'})`);
            return;
        case 'microbitplus_servo':
            push(`pins.servoWritePin(AnalogPin.${PIN(f('PIN'))}, ${v('DEG')})`);
            return;

        // A tone with no length (-1) rings until the next one: MakeCode's ringTone.
        case 'microbitplus_playtone': {
            const ms = v('MS', '500');
            push(ms === '-1' ? `music.ringTone(${v('FREQ', '440')})` : `music.playTone(${v('FREQ', '440')}, ${ms})`);
            return;
        }
        case 'microbitplus_rest':
            push(`music.rest(${v('MS')})`);
            return;
        // MakeCode's own forms for a tone with a mode, a built-in sound and a
        // sound effect.
        case 'microbitplus_playtonemode':
            push(`music.play(music.tonePlayable(${v('FREQ')}, ${v('MS')}), music.PlaybackMode.${PLAYBACK[f('MODE')] || 'UntilDone'})`);
            return;
        case 'microbitplus_playsound':
            push(`music.play(music.builtinPlayableSoundEffect(soundExpression.${f('SOUND') || 'giggle'}), ` +
                `music.PlaybackMode.${PLAYBACK[f('MODE')] || 'UntilDone'})`);
            return;
        case 'microbitplus_playsoundeffect': {
            const W = {sine: 'Sine', sawtooth: 'Sawtooth', triangle: 'Triangle', square: 'Square', noise: 'Noise'};
            const X = {none: 'None', vibrato: 'Vibrato', tremolo: 'Tremolo', warble: 'Warble'};
            const C = {linear: 'Linear', curve: 'Curve', logarithmic: 'Logarithmic'};
            push(`music.playSoundEffect(music.createSoundEffect(WaveShape.${W[f('WAVE')] || 'Square'}, ${v('FROM')}, ${v('TO')}, ` +
                `${v('VFROM')}, ${v('VTO')}, ${v('MS')}, SoundExpressionEffect.${X[f('FX')] || 'None'}, ` +
                `InterpolationCurve.${C[f('CURVE')] || 'Linear'}), SoundExpressionPlayMode.${f('MODE') === 'in background' ? 'InBackground' : 'UntilDone'})`);
            return;
        }
        case 'microbitplus_settempo':
            push(`music.setTempo(${v('BPM')})`);
            return;
        case 'microbitplus_changetempo':
            push(`music.changeTempoBy(${v('BPM')})`);
            return;
        // What MakeCode's own "play melody" block writes.
        case 'microbitplus_playmelody':
            push(`music._playDefaultBackground(music.builtInPlayableMelody(Melodies.${f('MELODY') || 'Dadadadum'}), ` +
                `music.PlaybackMode.${PLAYBACK[f('MODE')] || 'UntilDone'})`);
            return;
        case 'microbitplus_stoptone':
            push('music.stopAllSounds()');
            return;

        case 'microbitplus_radioon':
            push(`radio.setGroup(${v('GROUP', '1')})`);
            push(`radio.setTransmitPower(${v('POWER', '6')})`);
            return;
        case 'microbitplus_radiosendnum':
            push(`radio.sendNumber(${v('NUM')})`);
            return;
        case 'microbitplus_radiosendstr':
            push(`radio.sendString(${v('TEXT', '""')})`);
            return;

        default:
            this.unsupported.push(b.opcode);
            push(`// unsupported: ${b.opcode}`);
        }
    }
}

/** Reporters whose value is text. */
const TEXT_REPORTERS = new Set(['operator_join', 'operator_letter_of', 'microbitplus_radiolaststr']);

/**
 * The variables this target only ever sets to TEXT (a quoted literal or a
 * text reporter), and never changes by a number. Anything mixed stays a
 * number, as before.
 */
function textVariables (blocks, emitter, textArrays = new Set()) {
    const kinds = new Map();
    const mark = (name, kind) => {
        const k = kinds.get(name) || new Set();
        k.add(kind);
        kinds.set(name, k);
    };
    for (const b of Object.values(blocks)) {
        if (!b || !b.fields || !b.fields.VARIABLE) continue;
        const name = emitter.variableName(b.fields.VARIABLE[0]);
        if (b.opcode === 'data_changevariableby') mark(name, 'number');
        if (b.opcode !== 'data_setvariableto') continue;
        const slot = b.inputs && b.inputs.VALUE && b.inputs.VALUE[1];
        if (Array.isArray(slot)) {
            const isText = (slot[0] === 10 || slot[0] === 11) && !/^(true|false)$/.test(String(slot[1]));
            mark(name, isText ? 'text' : 'number');
        } else {
            const r = typeof slot === 'string' ? blocks[slot] : null;
            const fromTextArray = r && r.opcode === 'arrays_get' && textArrays.has(arrayNameOf(r, blocks, emitter));
            mark(name, r && (TEXT_REPORTERS.has(r.opcode) || fromTextArray) ? 'text' : 'number');
        }
    }
    return new Set([...kinds].filter(([, k]) => k.size === 1 && k.has('text')).map(([name]) => name));
}

/** An `arrays` block's array name, sanitised as the emitter does, without recording it. */
function arrayNameOf (b, blocks, emitter) {
    const slot = b.inputs && b.inputs.NAME && b.inputs.NAME[1];
    const raw = Array.isArray(slot) ? String(slot[1]) : 'liste';
    return emitter.variableName(raw.replace(/^["']|["']$/g, ''));
}

/**
 * The variables and arrays that hold LED sprites: MakeCode types them
 * game.LedSprite / game.LedSprite[] (a sprite is a number only in the dialect).
 * A variable holds one when it is set to a new sprite or to an element of a
 * sprite array, or is used where a sprite goes; an array, when a new sprite is
 * pushed onto it or one of its elements is used where a sprite goes.
 */
function spriteNames (blocks, emitter) {
    const vars = new Set();
    const arrays = new Set();
    const slot = (b, name) => {
        const input = b.inputs && b.inputs[name];
        return input ? input[1] : null;
    };
    const block = s => (typeof s === 'string' ? blocks[s] : null);
    const varOf = s => (Array.isArray(s) && (s[0] === 12) ? emitter.variableName(s[1]) : null);
    for (let pass = 0; pass < 3; pass++) {
        for (const b of Object.values(blocks)) {
            if (!b) continue;
            for (const name of ['SPRITE', 'OTHER']) {
                if (!/^microbitplus_sprite/.test(b.opcode)) continue;
                const s = slot(b, name);
                if (varOf(s)) vars.add(varOf(s));
                const r = block(s);
                if (r && r.opcode === 'data_variable') vars.add(emitter.variableName(r.fields.VARIABLE[0]));
                if (r && r.opcode === 'arrays_get') arrays.add(arrayNameOf(r, blocks, emitter));
            }
            const value = block(slot(b, 'VALUE'));
            // pushed, or put at an index (a record's sprite field is set so)
            if (/^arrays_(push|set|insert)$/.test(b.opcode) && value && value.opcode === 'microbitplus_createsprite') {
                arrays.add(arrayNameOf(b, blocks, emitter));
            }
            if (b.opcode === 'data_setvariableto' && value && (value.opcode === 'microbitplus_createsprite' ||
                (value.opcode === 'arrays_get' && arrays.has(arrayNameOf(value, blocks, emitter))))) {
                vars.add(emitter.variableName(b.fields.VARIABLE[0]));
            }
            // `set o to item i of array "obs"` with o used as a sprite: obs holds sprites.
            if (b.opcode === 'data_setvariableto' && value && value.opcode === 'arrays_get' &&
                vars.has(emitter.variableName(b.fields.VARIABLE[0]))) arrays.add(arrayNameOf(value, blocks, emitter));
        }
    }
    return {vars, arrays};
}

/**
 * The variables and arrays that hold IMAGES (the dialect's `create image`):
 * MakeCode types them Image / Image[]. A variable holds one when it is set
 * to a new image or to an item of an image array, or is used where an image
 * goes; an array, when a new image is pushed onto it or put in it, or one of
 * its items is used where an image goes.
 */
function imageNames (blocks, emitter) {
    const vars = new Set();
    const arrays = new Set();
    const IMAGE_SLOTS = ['microbitplus_imagepixel', 'microbitplus_imagesetpixel', 'microbitplus_showimage', 'microbitplus_plotimage'];
    const slot = (b, name) => {
        const input = b.inputs && b.inputs[name];
        return input ? input[1] : null;
    };
    const block = s => (typeof s === 'string' ? blocks[s] : null);
    for (let pass = 0; pass < 3; pass++) {
        for (const b of Object.values(blocks)) {
            if (!b) continue;
            if (IMAGE_SLOTS.includes(b.opcode)) {
                const s = slot(b, 'IMAGE');
                if (Array.isArray(s) && s[0] === 12) vars.add(emitter.variableName(s[1]));
                const r = block(s);
                if (r && r.opcode === 'data_variable') vars.add(emitter.variableName(r.fields.VARIABLE[0]));
                if (r && r.opcode === 'arrays_get') arrays.add(arrayNameOf(r, blocks, emitter));
            }
            const value = block(slot(b, 'VALUE'));
            const isImage = value && (value.opcode === 'microbitplus_createimage' ||
                (value.opcode === 'arrays_get' && arrays.has(arrayNameOf(value, blocks, emitter))) ||
                (value.opcode === 'data_variable' && vars.has(emitter.variableName(value.fields.VARIABLE[0]))));
            if (/^arrays_(push|set|insert)$/.test(b.opcode) && isImage) arrays.add(arrayNameOf(b, blocks, emitter));
            if (b.opcode === 'data_setvariableto' && isImage) vars.add(emitter.variableName(b.fields.VARIABLE[0]));
        }
    }
    return {vars, arrays};
}

/** Arrays that are only ever filled with TEXT: MakeCode types them string[]. */
function textArrayNames (blocks, emitter) {
    const kinds = new Map();
    for (const b of Object.values(blocks)) {
        if (!b || !/^arrays_(push|set|insert|create1D)$/.test(b.opcode)) continue;
        const name = arrayNameOf(b, blocks, emitter);
        const k = kinds.get(name) || new Set();
        if (b.opcode === 'arrays_create1D') {
            const slot = b.inputs && b.inputs.JSON && b.inputs.JSON[1];
            let items = [];
            try { items = JSON.parse(Array.isArray(slot) ? String(slot[1]) : '[]'); } catch (e) { items = []; }
            for (const item of items) k.add(typeof item === 'string' ? 'text' : 'number');
        } else {
            const slot = b.inputs && b.inputs.VALUE && b.inputs.VALUE[1];
            k.add(Array.isArray(slot) && (slot[0] === 10 || slot[0] === 11) &&
                !/^-?\d+(\.\d+)?$/.test(String(slot[1])) ? 'text' : 'number');
        }
        kinds.set(name, k);
    }
    return new Set([...kinds].filter(([, k]) => k.size === 1 && k.has('text')).map(([name]) => name));
}

/** `09900:…` → MakeCode's `# . #` grid, one row per line. */
function ledsOf (matrix) {
    const digits = String(matrix || '').replace(/[^0-9]/g, '').padEnd(25, '0').slice(0, 25);
    const rows = [];
    for (let y = 0; y < 5; y++) {
        rows.push([...digits.slice(y * 5, (y + 1) * 5)].map(d => (d === '0' ? '.' : '#')).join(' '));
    }
    return rows.map(row => `    ${row}`).join('\n');
}

/**
 * Compile a project's blocks into MakeCode TypeScript.
 *
 * @param {object} project an sb3 project (SB3Creator.parse's output)
 * @returns {{ts: string, unsupported: Array<string>}}
 */
export function projectToMakeCodeTs (project, opts = {}) {
    const EmitterClass = opts.Emitter || Emitter;
    const targets = (project && project.targets) || [];
    const lines = [];
    const declared = new Set();
    const unsupported = [];

    for (const target of targets) {
        const blocks = target.blocks || {};
        const emitter = new EmitterClass(blocks);

        // Variables first: MakeCode is TypeScript, and TypeScript wants
        // them declared before the code that assigns them — with a TYPE. A
        // variable that only ever holds text is declared as text: `let t = 0`
        // then `t = "COLD"` is a program MakeCode refuses (census 2026-09-27).
        const textArrays = textArrayNames(blocks, emitter);
        const text = textVariables(blocks, emitter, textArrays);
        const sprites = spriteNames(blocks, emitter);
        const images = imageNames(blocks, emitter);
        emitter.spriteVars = sprites.vars;
        emitter.spriteArrays = new Set([...sprites.arrays, ...images.arrays]);
        emitter.imageVars = images.vars;
        emitter.textVars = text;
        for (const entry of Object.values(target.variables || {})) {
            const name = emitter.variableName(Array.isArray(entry) ? entry[0] : entry);
            if (declared.has(name)) continue;
            declared.add(name);
            lines.push(sprites.vars.has(name) ? `let ${name}: game.LedSprite = null` :
                images.vars.has(name) ? `let ${name}: Image = null` :
                    `let ${name} = ${text.has(name) ? '""' : '0'}`);
        }

        // The body is emitted first because an array's name is only met
        // while emitting — it is an input on the block, not a Scratch
        // variable — and TypeScript wants the declaration above the use.
        // Definitions go ABOVE the code that calls them, so they are
        // collected separately — and a DEFINE is a top-level block like a
        // hat, not something the walk reaches from the green flag.
        const definitions = [];
        const body = [];
        let flagScripts = 0;
        for (const [id, block] of Object.entries(blocks)) {
            if (!block || !block.topLevel) continue;
            if (block.opcode === 'procedures_definition') {
                const proto = emitter.prototypeOf(block);
                if (!proto) continue;
                const {name, args} = emitter.procedure(proto);
                const names = emitter.parameterNames(proto);
                emitter.inFunction = true;
                definitions.push(
                    `function ${name}(${names.map(n => `${n}: number`).join(', ')}) {`,
                    ...emitter.stack(block.next, 1),
                    '}');
                emitter.inFunction = false;
                void args;
                continue;
            }
            // A radio hat is MakeCode's handler, registered where it stands:
            // the importer reads each handler back into a hat in the same order.
            // MakeCode's onSound handler, where it stands, as the radio hats are.
            if (block.opcode === 'microbitplus_whensound') {
                const level = emitter.field(block, 'LEVEL') === 'quiet' ? 'Quiet' : 'Loud';
                emitter.inFunction = true;
                body.push(`input.onSound(DetectedSound.${level}, function () {`, ...emitter.stack(block.next, 1), '})');
                emitter.inFunction = false;
                continue;
            }
            if (RADIO_HATS[block.opcode]) {
                const {call, param} = RADIO_HATS[block.opcode];
                emitter.radioHat = block.opcode;
                emitter.inFunction = true;
                body.push(`${call}(function (${param}) {`, ...emitter.stack(block.next, 1), '})');
                emitter.inFunction = false;
                emitter.radioHat = null;
                continue;
            }
            if (block.opcode !== 'event_whenflagclicked') {
                if (/^event_|^control_start_as_clone/.test(block.opcode)) {
                    unsupported.push(`${block.opcode} — MakeCode has no equivalent hat`);
                }
                continue;
            }
            body.push(...emitter.flagScript(block, flagScripts++));
            void id;
        }
        // The importer turns MakeCode's `let x = 5` into a leading `set x to 5`
        // (a Scratch project must re-initialise on every run). Fold such leading
        // literal assignments back into the declaration, so the way back does
        // not add a line per round trip (the CLI's full-circle test found it).
        while (body.length) {
            const m = /^([A-Za-z_][A-Za-z0-9_]*) = (-?\d+(?:\.\d+)?|"[^"\\]*"|null)$/.exec(body[0]);
            if (m && m[2] === 'null') {
                // A sprite or image variable's leading `= null` is its declaration already.
                if (!lines.includes(`let ${m[1]}: game.LedSprite = null`) && !lines.includes(`let ${m[1]}: Image = null`)) break;
                body.shift();
                continue;
            }
            const decl = m && lines.findIndex(l => l === `let ${m[1]} = 0` || l === `let ${m[1]} = ""`);
            if (!m || decl < 0) break;
            lines[decl] = `let ${m[1]} = ${m[2]}`;
            body.shift();
        }
        lines.push(...definitions);
        for (const name of emitter.arrays) {
            if (declared.has(name)) continue;
            declared.add(name);
            lines.push(`let ${name}: ${sprites.arrays.has(name) ? 'game.LedSprite' : images.arrays.has(name) ? 'Image' :
                textArrays.has(name) ? 'string' : 'number'}[] = []`);
        }
        lines.push(...body);
        unsupported.push(...emitter.unsupported);
    }

    return {
        ts: `${lines.join('\n').trimEnd()}\n`,
        unsupported: [...new Set(unsupported)]
    };
}

// ─── the .hex MakeCode will import ──────────────────────────────────────

const hexRecord = (addr, type, bytes) => {
    const all = [bytes.length, (addr >> 8) & 0xFF, addr & 0xFF, type, ...bytes];
    const checksum = ((~all.reduce((a, b) => a + b, 0)) + 1) & 0xFF;
    return `:${[...all, checksum].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
};

/**
 * Wrap a project's files in the source-embedding container and write it
 * as an Intel HEX — the file format MakeCode's "Import File" accepts.
 *
 * Uncompressed on purpose: the header's `compression` field is optional,
 * and shipping an LZMA *compressor* to save a few kilobytes on a file
 * the user downloads once would be a poor trade.
 *
 * @param {Object<string, string>} files the project, e.g. {'main.ts', 'pxt.json'}
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {string} [opts.editorUrl]
 * @returns {string} Intel HEX text
 */
export function makeCodeSourceHex (files, opts = {}) {
    const text = JSON.stringify(files);
    const meta = JSON.stringify({
        name: opts.name || 'BrickWright project',
        eURL: opts.editorUrl || 'https://makecode.microbit.org/',
        eVER: opts.editorVersion || '0.0.0',
        pxtTarget: opts.target || 'microbit'
    });

    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(meta);
    const textBytes = encoder.encode(text);
    const header = new Uint8Array(16);
    header.set(MAGIC);
    header[8] = metaBytes.length & 0xFF;
    header[9] = (metaBytes.length >> 8) & 0xFF;
    header[10] = textBytes.length & 0xFF;
    header[11] = (textBytes.length >> 8) & 0xFF;
    header[12] = (textBytes.length >> 16) & 0xFF;
    header[13] = (textBytes.length >>> 24) & 0xFF;

    const body = new Uint8Array(header.length + metaBytes.length + textBytes.length);
    body.set(header);
    body.set(metaBytes, header.length);
    body.set(textBytes, header.length + metaBytes.length);

    const lines = [];
    let upper = -1;
    for (let p = 0; p < body.length; p += 16) {
        const address = EMBED_ADDRESS + p;
        const hi = address >>> 16;
        if (hi !== upper) {
            upper = hi;
            lines.push(hexRecord(0, 0x04, [(hi >> 8) & 0xFF, hi & 0xFF]));
        }
        lines.push(hexRecord(address & 0xFFFF, 0x00, [...body.subarray(p, p + 16)]));
    }
    lines.push(':00000001FF');
    return `${lines.join('\n')}\n`;
}

/**
 * A whole project, ready to hand to the browser as a download.
 *
 * @param {object} project an sb3 project
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @returns {{hex: string, ts: string, files: object, unsupported: Array<string>, filename: string}}
 */
export function exportToMakeCode (project, opts = {}) {
    const name = opts.name || 'brickwright';
    const {ts, unsupported} = projectToMakeCodeTs(project);
    const files = {
        'main.ts': ts,
        'main.blocks': '',
        'pxt.json': `${JSON.stringify({
            name,
            description: 'Exported from BrickWright',
            // MakeCode's own new-project set (its blocksprj template). It is also
            // the set pxt-microbit ships a precompiled firmware base for, so the
            // same files build a real .hex here (pxt-runtime.js) with no cloud.
            dependencies: {core: '*', radio: '*', microphone: '*'},
            files: ['main.ts', 'main.blocks', 'pxt.json'],
            preferredEditor: 'tsprj'
        }, null, 4)}\n`,
        'README.md': `# ${name}\n\nExported from BrickWright.\n`
    };
    return {
        hex: makeCodeSourceHex(files, {name, target: opts.target || 'microbit'}),
        ts,
        files,
        unsupported,
        filename: `${String(name).replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase() || 'project'}.hex`
    };
}

export default exportToMakeCode;
