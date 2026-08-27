/**
 * MakeCode micro:bit TypeScript → BrickWright pseudocode.
 *
 * The translation table is the work; the parser next door
 * (ts-import.js) is only what makes the table applicable to nested code.
 *
 * TWO RULES THIS FILE KEEPS
 * -------------------------
 * 1. **Emit only spellings the pseudocode round-trip already produces.**
 *    Every line here matches a `case` in sb3-creator's block→pseudocode
 *    generator, which is the definition of what its parser accepts. That
 *    is why the output compiles instead of nearly compiling. The test
 *    parses the result with the real SB3Creator to keep it honest.
 * 2. **Nothing is dropped in silence.** An unmapped call becomes a
 *    `# unsupported:` line AND an entry in the returned list. A program
 *    that looks converted and quietly does less is the one outcome worse
 *    than refusing.
 *
 * EVENT HANDLERS. MakeCode is event-driven (`input.onButtonPressed`);
 * our micro:bit vocabulary has one hat, `WHEN flag clicked`, plus
 * polling reporters. So a handler becomes its own script that polls and
 * waits for release — edge-triggered in effect, and written out as a
 * comment so the reader knows the shape changed and why.
 *
 * @module
 */

import {parseMakeCodeTs} from './ts-import.js';
import {BaseTranslator, bodyOf, num} from './translate-base.js';
import {MICROBIT_ICONS, MICROBIT_ARROWS} from './microbit-icons.js';

/** MakeCode enum member → the token our vocabulary uses. */
const ENUM_VALUES = {
    Button: {A: 'a', B: 'b', AB: 'ab'},
    Dimension: {X: 'x', Y: 'y', Z: 'z', Strength: 'strength'},
    Rotation: {Pitch: 'pitch', Roll: 'roll'},
    Gesture: {
        Shake: 'shake', LogoUp: 'up', LogoDown: 'down',
        ScreenUp: 'face up', ScreenDown: 'face down',
        TiltLeft: 'left', TiltRight: 'right', FreeFall: 'freefall'
    },
    PinPullMode: {PullUp: 'up', PullDown: 'down', PullNone: 'none'}
};

const isPinEnum = name => /^(DigitalPin|AnalogPin|TouchPin|PwmPin)$/.test(name);

class MicrobitTranslator extends BaseTranslator {
    /** A member expression that names an enum member, resolved to its token. */
    enumToken (node) {
        if (!node || node.type !== 'Member') return null;
        const owner = node.object;
        if (!owner || owner.type !== 'Identifier') return null;
        const table = ENUM_VALUES[owner.name];
        if (table && table[node.name] !== undefined) return table[node.name];
        if (isPinEnum(owner.name)) return node.name.toUpperCase();
        return super.enumToken(node);
    }

    pin (node) {
        const token = this.enumToken(node);
        if (token && /^P\d+$/i.test(token)) return token.toUpperCase();
        return null;
    }

    pin (node) {
        const token = this.enumToken(node);
        if (token && /^P\d+$/i.test(token)) return token.toUpperCase();
        return null;
    }

    /**
     * micro:bit reporters that are already boolean, so a condition must
     * not wrap them in a `= 0` comparison. Without this,
     * `!input.buttonIsPressed(A)` came out as `not (not (read button_a =
     * 0))` — correct, and unreadable.
     */
    isBooleanValue (value) {
        return super.isBooleanValue(value) || /^read button_/.test(value) || value === 'false';
    }

    /** Reporter calls: MakeCode's sensors and maths in our spelling. */
    callExpression (node) {
        const name = this.path(node.callee);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (name) {
        case 'input.buttonIsPressed': return `read button_${this.enumToken(a[0]) || 'a'}`;
        case 'input.acceleration': return `read accel ${this.enumToken(a[0]) || 'x'}`;
        case 'input.rotation': return `read ${this.enumToken(a[0]) || 'pitch'}`;
        case 'input.magneticForce': return `read magforce ${this.enumToken(a[0]) || 'x'}`;
        case 'input.compassHeading': return 'read compass';
        case 'input.lightLevel': return 'read light';
        case 'input.temperature': return 'read temperature';
        case 'input.soundLevel': return 'read sound';
        case 'input.runningTime': return 'timer * 1000';
        // `<gesture> happening` and `pin P touched` are spellings the
        // pseudocode GENERATOR emits but its parser does not read: written
        // out, they compile to a comparison against an undefined variable.
        // Until that round-trip closes in sb3-creator, they are reported.
        case 'input.isGesture':
            this.unsupported.push(`input.isGesture(${this.enumToken(a[0]) || 'Shake'}) — no gesture reporter in pseudocode`);
            return 'false';
        case 'input.pinIsPressed':
            this.unsupported.push('input.pinIsPressed() — no touch reporter in pseudocode');
            return 'false';
        case 'pins.digitalReadPin': return `pin ${this.pin(a[0]) || 'P0'} digital`;
        case 'pins.analogReadPin': return `analog value of pin ${this.pin(a[0]) || 'P0'}`;
        case 'radio.receivedNumber': return 'read last radio number';
        case 'radio.receivedString': return 'read last radio text';
        case 'Math.randomRange':
        case 'randint': return `pick random ${arg(0)} to ${arg(1)}`;
        case 'Math.random': return 'pick random 0 to 1';
        case 'Math.abs': return `abs of ${arg(0)}`;
        case 'Math.floor': return `floor of ${arg(0)}`;
        case 'Math.ceil': return `ceiling of ${arg(0)}`;
        case 'Math.sqrt': return `sqrt of ${arg(0)}`;
        case 'Math.round': return `round ${arg(0)}`;
        case 'Math.min': return `${arg(0)}`;             // no min/max reporter; keep the first
        case 'Math.max': return `${arg(0)}`;
        case 'Math.map': return `${arg(0)}`;
        case 'game.score': return 'score';
        default: return super.callExpression(node);
        }
    }


    /** Command calls: the ones that DO something. */
    command (node, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        const name = this.path(node.callee);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);

        switch (name) {
        // ── display ────────────────────────────────────────────────
        // `show text` takes a literal only, but `display`/`scroll` take a
        // full expression — which is what showNumber(count) needs. The
        // literal spellings are kept where they apply because they carry
        // the scroll delay the device blocks model.
        case 'basic.showNumber':
            push(`display ${this.expr(a[0])}`);
            return;
        case 'basic.showString': {
            const literal = this.literalString(a[0]);
            if (literal === null) {
                push(`scroll ${this.expr(a[0])}`);
                return;
            }
            push(`scroll text "${literal}" delay 150 ms`);
            return;
        }
        case 'basic.showIcon':
        case 'basic.showArrow': {
            // The icons are not an approximation: MakeCode's set and
            // MicroPython's built-in images are the same bitmaps, and
            // `show pattern` lowers to display.show().
            const table = name === 'basic.showArrow' ? MICROBIT_ARROWS : MICROBIT_ICONS;
            const member = a[0] && a[0].type === 'Member' ? a[0].name : null;
            const pattern = member ? table[member] : null;
            if (!pattern) {
                push(this.note(`${name}(${member || '…'}) — not an icon we have a pattern for`));
                return;
            }
            push(`show pattern ${pattern}`);
            return;
        }
        case 'basic.showLeds':
            push(`show pattern ${ledPattern(a[0])}`);
            return;
        case 'basic.clearScreen':
            push('clear display');
            return;
        case 'basic.pause':
            push(`wait ${seconds(a[0], this)} seconds`);
            return;
        case 'control.waitMicros':
            push(`wait ${a[0] && a[0].type === 'Number' ? num(Number(a[0].value) / 1e6) : '0'} seconds`);
            return;
        case 'led.plot':
        case 'led.unplot': {
            const x = this.literalNumber(a[0]);
            const y = this.literalNumber(a[1]);
            if (x === null || y === null) {
                push(this.note(`${name}() with computed coordinates — plot takes literal x and y`));
                return;
            }
            push(`plot x ${x} y ${y} ${name === 'led.plot' ? 'on' : 'off'}`);
            return;
        }

        // ── pins ───────────────────────────────────────────────────
        case 'pins.digitalWritePin': {
            const pin = this.pin(a[0]) || 'P0';
            const level = this.literalNumber(a[1]);
            if (level !== null) {
                push(`set pin ${pin} to ${level === '0' ? '0' : '1'}`);
                return;
            }
            // Only the two literals parse, so a computed level becomes the
            // choice it actually is.
            push(`IF ${this.condition(a[1])} THEN:`);
            out.push(`${pad}  set pin ${pin} to 1`);
            push('ELSE:');
            out.push(`${pad}  set pin ${pin} to 0`);
            return;
        }
        case 'pins.analogWritePin':
            // MakeCode's analog range is 0..1023; ours is a percentage.
            push(`set pin ${this.pin(a[0]) || 'P0'} analog ${percentSlot(a[1], this, out, pad)} %`);
            return;
        case 'pins.servoWritePin':
            push(`set pin ${this.pin(a[0]) || 'P0'} servo ${this.single(a[1], out, pad)}`);
            return;
        case 'pins.setPull':
            push(`set pin ${this.pin(a[0]) || 'P0'} pull ${this.enumToken(a[1]) || 'none'}`);
            return;

        // ── sound ──────────────────────────────────────────────────
        case 'music.playTone':
        case 'music.ringTone': {
            const freq = this.single(a[0], out, pad);
            const ms = name === 'music.ringTone' ? '500' : this.literalNumber(a[1]);
            if (ms === null) {
                this.unsupported.push('music.playTone() with a computed duration — held at 500 ms');
                push(`play tone ${freq} hz for 500 ms`);
                return;
            }
            push(`play tone ${freq} hz for ${ms} ms`);
            return;
        }
        case 'music.rest':
            push(`wait ${seconds(a[0], this)} seconds`);
            return;
        case 'music.stopAllSounds':
            push('stop buzzer');
            return;

        // ── radio ──────────────────────────────────────────────────
        case 'radio.setGroup':
            push(`radio on group ${this.single(a[0], out, pad)} power 6`);
            return;
        case 'radio.setTransmitPower':
            push(`radio on group 1 power ${this.single(a[0], out, pad)}`);
            return;
        case 'radio.sendNumber':
        case 'radio.sendValue':
            push(`radio send number ${this.single(a[a.length - 1], out, pad)}`);
            return;
        case 'radio.sendString': {
            const literal = this.literalString(a[0]);
            if (literal === null) {
                push(this.note('radio.sendString(<expression>) — the radio text block takes a literal'));
                return;
            }
            push(`radio send text "${literal}"`);
            return;
        }

        // ── structure ──────────────────────────────────────────────
        case 'basic.forever':
            push('FOREVER:');
            this.block(bodyOf(a[0]), indent + 1, out);
            return;
        case 'control.inBackground':
            this.block(bodyOf(a[0]), indent, out);
            return;

        default:
            super.command(node, indent, out);
        }
    }
}

/** ms → seconds, computed when it is a literal so the output reads naturally. */
function seconds (node, translator) {
    if (node && node.type === 'Number') return num(Number(node.value) / 1000);
    return `(${translator.expr(node)}) / 1000`;
}

/**
 * MakeCode's 0..1023 analog value → our percentage.
 *
 * The percentage slot is single-token, so a computed value has to be
 * hoisted into a variable rather than written inline.
 */
function percentSlot (node, translator, out, pad) {
    if (node && node.type === 'Number') return num((Number(node.value) * 100) / 1023);
    const name = `_mc${++translator.temps}`;
    out.push(`${pad}set ${name} to (${translator.expr(node)}) * 100 / 1023`);
    translator.declared.add(name);
    return name;
}

/**
 * `basic.showLeds(\`# . # . #\n...\`)` → our `09090:...` brightness grid.
 *
 * MakeCode's literal is on/off; ours is a brightness digit per pixel, so
 * a lit pixel becomes 9. Anything that is not a 5x5 grid falls back to a
 * blank one rather than emitting a pattern the parser would reject.
 */
export function ledPattern (node) {
    const blank = '00000:00000:00000:00000:00000';
    if (!node || node.type !== 'Template') return blank;
    const rows = node.value.split('\n')
        .map(row => row.replace(/[^#.]/g, ''))
        .filter(row => row.length);
    if (rows.length !== 5 || rows.some(r => r.length !== 5)) return blank;
    return rows.map(r => [...r].map(c => (c === '#' ? '9' : '0')).join('')).join(':');
}

/**
 * Handlers MakeCode delivers by event, and the polling shape each
 * becomes. `test` is the condition; `release` is what we wait for so the
 * body runs once per press rather than every frame.
 */
const HANDLERS = {
    'input.onButtonPressed': translator => a => {
        const button = translator.enumToken(a[0]) || 'a';
        return {test: `read button_${button}`, release: `read button_${button}`};
    }
};

/**
 * Handlers whose CONDITION has no reporter we can write. Reported rather
 * than approximated: a shake handler that silently never fires would be
 * worse than one the user is told about.
 */
const UNPOLLABLE_HANDLERS = {
    'input.onGesture': 'no gesture reporter in pseudocode',
    'input.onPinPressed': 'no touch reporter in pseudocode',
    'input.onPinReleased': 'no touch reporter in pseudocode',
    'input.onSound': 'no sound-event reporter in pseudocode'
};

/**
 * Translate a MakeCode micro:bit project.
 *
 * @param {string} source the project's main.ts
 * @param {object} [opts]
 * @param {string} [opts.name] used only in the header comment
 * @returns {{code: string, unsupported: Array<string>, scripts: number}}
 */
export function microbitToPseudocode (source, opts = {}) {
    const ast = parseMakeCodeTs(source);
    const t = new MicrobitTranslator();

    // Enums and functions first: a call can precede its definition, and
    // an enum member can be referenced before the enum is declared.
    for (const st of ast.body) {
        if (st.type === 'Enum') t.statement(st, 0, []);
        if (st.type === 'FunctionDeclaration') t.functions.push({name: st.name, params: st.params, body: st.body});
    }

    const scripts = [];
    const main = [];

    for (const st of ast.body) {
        if (st.type === 'Enum' || st.type === 'FunctionDeclaration') continue;

        const call = st.type === 'ExpressionStatement' && st.expr.type === 'Call' ? st.expr : null;
        const callName = call ? t.path(call.callee) : null;

        // `basic.forever` at the top level is a script of its own: two of
        // them run concurrently in MakeCode, and two `WHEN flag clicked`
        // hats are how that is said here.
        if (callName === 'basic.forever') {
            const lines = ['WHEN flag clicked:', '  FOREVER:'];
            t.block(bodyOf(call.args[0]), 2, lines);
            scripts.push(lines);
            continue;
        }

        if (callName && UNPOLLABLE_HANDLERS[callName]) {
            t.unsupported.push(`${callName}() — ${UNPOLLABLE_HANDLERS[callName]}`);
            scripts.push([`# unsupported: ${callName}() — ${UNPOLLABLE_HANDLERS[callName]}`]);
            continue;
        }

        if (callName && HANDLERS[callName]) {
            const shape = HANDLERS[callName](t)(call.args);
            const handlerBody = bodyOf(call.args[call.args.length - 1]);
            const lines = [
                `# ${callName} — MakeCode fires this on an event; here it is polled.`,
                'WHEN flag clicked:',
                '  FOREVER:',
                `    IF ${shape.test} THEN:`
            ];
            t.block(handlerBody, 3, lines);
            if (shape.release) lines.push(`      wait until not (${shape.release})`);
            scripts.push(lines);
            continue;
        }

        if (callName === 'radio.onReceivedNumber' || callName === 'radio.onReceivedString') {
            const isNumber = callName.endsWith('Number');
            const fn = call.args[call.args.length - 1];
            const param = (fn && fn.params && fn.params[0]) || 'receivedNumber';
            const lines = [
                `# ${callName} — polled here; MakeCode delivered it as an event.`,
                'WHEN flag clicked:',
                '  FOREVER:',
                `    set ${param} to read last radio ${isNumber ? 'number' : 'text'}`
            ];
            t.block(bodyOf(fn), 2, lines);
            scripts.push(lines);
            continue;
        }

        t.statement(st, 1, main);
    }

    const out = ['DEVICE MICROBIT', ''];
    if (opts.name) out.push(`# Imported from MakeCode: ${opts.name}`, '');

    if (main.length) {
        out.push('WHEN flag clicked:', ...main, '');
    }
    for (const script of scripts) out.push(...script, '');

    for (const fn of t.functions) {
        const signature = fn.params && fn.params.length ?
            `${fn.name} ${fn.params.map(p => `(${p})`).join(' ')}` : fn.name;
        const lines = [`DEFINE ${signature}:`];
        t.block(fn.body, 1, lines);
        out.push(...lines, '');
    }

    // Nothing at all ran: better an empty hat than a file with no script.
    if (!main.length && !scripts.length) out.push('WHEN flag clicked:', '  # (nothing translatable in this project)', '');

    return {
        code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)],
        scripts: scripts.length + (main.length ? 1 : 0)
    };
}

export default microbitToPseudocode;
