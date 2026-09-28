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
    // MakeCode names these for the LOGO; the block menu names them for the
    // tilt, and the two mean the same motion. `LogoUp` is the logo pointing
    // up, which the menu calls "tilt up" and MicroPython calls "up".
    Gesture: {
        Shake: 'shake', LogoUp: 'tilt up', LogoDown: 'tilt down',
        ScreenUp: 'face up', ScreenDown: 'face down',
        TiltLeft: 'tilt left', TiltRight: 'tilt right', FreeFall: 'freefall',
        ThreeG: '3g', SixG: '6g', EightG: '8g'
    },
    PinPullMode: {PullUp: 'up', PullDown: 'down', PullNone: 'none'},
    // `beat quarter` and friends: the dialect's words for MakeCode's fractions.
    BeatFraction: {
        Whole: 'whole', Half: 'half', Quarter: 'quarter', Eighth: 'eighth',
        Sixteenth: 'sixteenth', Double: 'double', Breve: 'breve'
    },
    PlaybackMode: {UntilDone: 'until done', InBackground: 'in background', LoopingInBackground: 'looping in background'}
};

/**
 * MakeCode's Note enum by member name — the dialect's `frequency of note X`
 * takes the member itself (Note.FSharp5 is `frequency of note FSharp5`), so
 * nothing is renamed on the way in or out. The list is pxt-microbit 9.1.1's.
 */
export const MAKECODE_NOTES = [
    'C', 'CSharp', 'D', 'Eb', 'E', 'F', 'FSharp', 'G', 'GSharp', 'A', 'Bb', 'B',
    ...['3', '4', '5'].flatMap(o => ['C', 'CSharp', 'D', 'Eb', 'E', 'F', 'FSharp', 'G', 'GSharp', 'A', 'Bb', 'B'].map(n => n + o))
];
/** MakeCode's built-in Melodies (libs/core/melodies.ts). */
export const MAKECODE_MELODIES = [
    'Dadadadum', 'Entertainer', 'Prelude', 'Ode', 'Nyan', 'Ringtone', 'Funk', 'Blues', 'Birthday', 'Wedding',
    'Funeral', 'Punchline', 'Baddy', 'Chase', 'BaDing', 'Wawawawaa', 'JumpUp', 'JumpDown', 'PowerUp', 'PowerDown'
];

/** LedSpriteProperty member -> the dialect's property word. */
const SPRITE_PROPERTY = {X: 'x', Y: 'y', Direction: 'direction', Brightness: 'brightness', Blink: 'blink'};
/** The methods only a sprite has, so a call of one on an object field IS a sprite call. */
const SPRITE_ONLY = new Set(['isTouchingEdge', 'ifOnEdgeBounce', 'isDeleted', 'setBlink', 'changeBlinkBy',
    'changeXBy', 'changeYBy', 'turnRight', 'turnLeft', 'changeDirectionBy', 'changeBrightnessBy']);
/** game.LedSprite's methods (pxt-microbit 9.1.1 libs/core/game.ts). */
const SPRITE_METHODS = new Set([
    'get', 'set', 'change', 'x', 'y', 'direction', 'brightness', 'blink', 'isTouching', 'isTouchingEdge', 'isDeleted',
    'setX', 'setY', 'setDirection', 'setBrightness', 'setBlink', 'on', 'off', 'changeXBy', 'changeYBy',
    'changeDirectionBy', 'changeBrightnessBy', 'changeBlinkBy', 'goTo', 'move', 'turn', 'turnRight', 'turnLeft',
    'ifOnEdgeBounce', 'delete'
]);

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

    /** `Note.C` wherever a value is read: its frequency, by name. */
    expr (node) {
        if (node && node.type === 'Member' && node.object && node.object.type === 'Identifier' &&
            node.object.name === 'Note' && MAKECODE_NOTES.includes(node.name)) {
            return `frequency of note ${node.name}`;
        }
        return super.expr(node);
    }

    /** `music.builtInPlayableMelody(Melodies.X)`'s X, or null. */
    melody (node) {
        const inner = node && node.type === 'Call' && /^music\.builtIn(Playable)?Melody$/.test(this.path(node.callee) || '') ?
            node.args[0] : null;
        return inner && inner.type === 'Member' && MAKECODE_MELODIES.includes(inner.name) ? inner.name : null;
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
        return super.isBooleanValue(value) ||
            /^read button_/.test(value) ||
            / happening$/.test(value) ||
            / touched$/.test(value) ||
            /^sprite .+ (touching sprite .+|touching edge|deleted)$/.test(value) ||
            /^game is (over|running|paused)$/.test(value) ||
            value === 'false';
    }

    /**
     * A coin toss as a CONDITION is asked as a comparison, which the export
     * reads back as Math.randomBoolean(). Parenthesised because `pick
     * random` is read before operators and would otherwise take `1 = 1` as
     * its upper bound.
     */
    condition (node) {
        if (node && node.type === 'Call' && this.path(node.callee) === 'Math.randomBoolean') {
            return '(pick random 0 to 1) = 1';
        }
        return super.condition(node);
    }

    // ── LED sprites ─────────────────────────────────────────────────
    //
    // A sprite is a numbered handle in a variable or an array (sb3-creator's
    // micro:bit+ sprite words), so what has to be known is which expressions
    // HOLD one: a name assigned game.createSprite() or declared LedSprite, an
    // array filled with them, an element of such an array, a loop variable
    // over one. claimSprites() finds them before the walk.

    /** Record every name that holds a sprite, and every array of them. */
    claimSprites (ast) {
        this.sprites = new Set();
        this.spriteArrays = new Set();
        const isCreate = n => n && n.type === 'Call' && this.path(n.callee) === 'game.createSprite';
        const isProperty = n => n && n.type === 'Member' && n.object && n.object.type === 'Identifier' &&
            n.object.name === 'LedSpriteProperty';
        const holds = (name, value) => {
            if (!name || !value) return;
            if (isCreate(value)) this.sprites.add(name);
            else if (value.type === 'Index' && value.object.type === 'Identifier' && this.spriteArrays.has(value.object.name)) {
                this.sprites.add(name);
            }
        };
        const walk = node => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }
            if (node.type === 'Declaration') {
                for (const d of node.decls || []) {
                    if (/LedSprite/.test(d.typeName || '')) (/\[\]|Array/.test(d.typeName) ? this.spriteArrays : this.sprites).add(d.name);
                    if (d.init && d.init.type === 'Array' && d.init.items.some(isCreate)) this.spriteArrays.add(d.name);
                    holds(d.name, d.init);
                }
            }
            if (node.type === 'Assignment' && node.op === '=' && node.left.type === 'Identifier') holds(node.left.name, node.right);
            if (node.type === 'ForOf' && node.iterable && node.iterable.type === 'Identifier' &&
                this.spriteArrays.has(node.iterable.name)) this.sprites.add(node.name);
            if (node.type === 'Call' && node.callee && node.callee.type === 'Member') {
                const receiver = node.callee.object;
                // `obstacles.push(game.createSprite(4, y))`
                if (node.callee.name === 'push' && receiver.type === 'Identifier' && isCreate(node.args[0])) {
                    this.spriteArrays.add(receiver.name);
                }
                // `hero.get(LedSpriteProperty.X)`: only a sprite has these.
                if (/^(get|set|change)$/.test(node.callee.name) && isProperty(node.args[0])) {
                    if (receiver.type === 'Identifier') this.sprites.add(receiver.name);
                    if (receiver.type === 'Index' && receiver.object.type === 'Identifier') this.spriteArrays.add(receiver.object.name);
                }
            }
            for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
        };
        // Twice: a loop variable is only known once its array is.
        walk(ast);
        walk(ast);
    }

    /** Does this expression hold a sprite (a handle)? */
    isSprite (node) {
        if (!node || !this.sprites) return false;
        if (node.type === 'Identifier') return this.sprites.has(node.name);
        if (node.type === 'Index') return node.object.type === 'Identifier' && this.spriteArrays.has(node.object.name);
        if (node.type === 'Call') {
            if (this.path(node.callee) === 'game.createSprite') return true;
            const c = node.callee;
            return c && c.type === 'Member' && /^(removeAt|pop|shift)$/.test(c.name) &&
                c.object.type === 'Identifier' && this.spriteArrays.has(c.object.name);
        }
        return false;
    }

    /** A sprite as the dialect's sprite slot takes it: one token or parenthesised. */
    spriteRef (node) {
        return this.operand(node);
    }

    /**
     * A method call on a sprite as the dialect's words, or null when it is not
     * one. `asValue` picks the reporters; the commands go to `push`.
     */
    spriteCall (node, push) {
        const callee = node.callee;
        if (!callee || callee.type !== 'Member' || !SPRITE_METHODS.has(callee.name)) return null;
        const receiver = callee.object;
        if (!this.isSprite(receiver)) {
            // A sprite kept in an object's field (`client.sprite.setBlink(0)`):
            // the handles live in variables and arrays, and an object has no
            // form here, so the call is named with that reason.
            if (receiver && receiver.type === 'Member' && (/sprite/i.test(receiver.name) || SPRITE_ONLY.has(callee.name))) {
                const what = `${this.path(callee) || callee.name}() — a sprite kept in an object field; ` +
                    'sprites are handles in variables and arrays here, and objects have no form';
                return push ? push(this.note(what)) || true : (this.unsupported.push(what), '0');
            }
            return null;
        }
        const a = node.args || [];
        // `obstacles.removeAt(0).delete()`: delete the element, then remove it.
        const removal = push && receiver.type === 'Call' && receiver.callee.name === 'removeAt' ? receiver : null;
        const s = removal ? `(item ${this.expr(removal.args[0])} of ${this.arrayRef(removal.callee.object.name)})` :
            this.spriteRef(receiver);
        const prop = n => (n && n.type === 'Member' && SPRITE_PROPERTY[n.name]) || null;
        const val = i => this.operand(a[i]);
        if (!push) {
            switch (callee.name) {
            case 'get': return prop(a[0]) ? `${prop(a[0])} of sprite ${s}` : null;
            case 'x': case 'y': case 'direction': case 'brightness': case 'blink':
                return `${callee.name} of sprite ${s}`;
            case 'isTouching': return this.isSprite(a[0]) || a[0] ? `sprite ${s} touching sprite ${this.spriteRef(a[0])}` : null;
            case 'isTouchingEdge': return `sprite ${s} touching edge`;
            case 'isDeleted': return `sprite ${s} deleted`;
            default: return null;
            }
        }
        const target = s;
        const set = (p, v) => push(`set sprite ${target} ${p} to ${v}`);
        const change = (p, v) => push(`change sprite ${target} ${p} by ${v}`);
        switch (callee.name) {
        case 'set': if (!prop(a[0])) return null; set(prop(a[0]), val(1)); break;
        case 'change': if (!prop(a[0])) return null; change(prop(a[0]), val(1)); break;
        case 'setX': set('x', val(0)); break;
        case 'setY': set('y', val(0)); break;
        case 'setDirection': set('direction', val(0)); break;
        case 'setBrightness': set('brightness', val(0)); break;
        case 'setBlink': set('blink', val(0)); break;
        case 'on': set('brightness', '255'); break;
        case 'off': set('brightness', '0'); break;
        case 'changeXBy': change('x', val(0)); break;
        case 'changeYBy': change('y', val(0)); break;
        case 'changeDirectionBy': change('direction', val(0)); break;
        case 'changeBrightnessBy': change('brightness', val(0)); break;
        case 'changeBlinkBy': change('blink', val(0)); break;
        case 'goTo': set('x', val(0)); set('y', val(1)); break;
        case 'move': push(`move sprite ${target} by ${val(0)}`); break;
        case 'turn': {
            const dir = a[0] && a[0].type === 'Member' && a[0].name === 'Left' ? 'left' : 'right';
            push(`turn sprite ${target} ${dir} by ${val(1)} degrees`);
            break;
        }
        case 'turnRight': push(`turn sprite ${target} right by ${val(0)} degrees`); break;
        case 'turnLeft': push(`turn sprite ${target} left by ${val(0)} degrees`); break;
        case 'ifOnEdgeBounce': push(`bounce sprite ${target} if on edge`); break;
        case 'delete': push(`delete sprite ${target}`); break;
        default: return null;
        }
        if (removal) push(`remove item ${this.expr(removal.args[0])} of ${this.arrayRef(removal.callee.object.name)}`);
        return true;
    }

    /** Reporter calls: MakeCode's sensors and maths in our spelling. */
    callExpression (node) {
        const sprite = this.spriteCall(node, null);
        if (sprite) return sprite;
        const name = this.path(node.callee);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);
        switch (name) {
        case 'input.buttonIsPressed': return `read button_${this.enumToken(a[0]) || 'a'}`;
        case 'input.acceleration': return `read accel ${this.enumToken(a[0]) || 'x'}`;
        case 'input.rotation': return `read ${this.enumToken(a[0]) || 'pitch'}`;
        // The block's menu word for the total field is `absolute`; MakeCode's
        // is Dimension.Strength. `read magforce strength` matched no rule and
        // became a VARIABLE of that name.
        case 'input.magneticForce': {
            const axis = this.enumToken(a[0]) || 'x';
            return `read magforce ${axis === 'strength' ? 'absolute' : axis}`;
        }
        case 'input.compassHeading': return 'read compass';
        case 'input.lightLevel': return 'read light';
        case 'input.temperature': return 'read temperature';
        case 'input.soundLevel': return 'read sound';
        case 'input.runningTime': return 'timer * 1000';
        // Readable since sb3-creator b4a8129 closed the round trip: these
        // two spellings came out of the decompiler and had no rule going
        // back in, so writing them used to compile to silence.
        case 'input.isGesture': return `${this.enumToken(a[0]) || 'shake'} happening`;
        case 'input.pinIsPressed': return `pin ${this.pin(a[0]) || 'P0'} touched`;
        case 'pins.digitalReadPin': return `pin ${this.pin(a[0]) || 'P0'} digital`;
        case 'pins.analogReadPin': return `analog value of pin ${this.pin(a[0]) || 'P0'}`;
        case 'radio.receivedNumber': return 'read last radio number';
        case 'radio.receivedString': return 'read last radio text';
        // MakeCode's music reporters, as the blocks they are. music.beat was
        // read as its 120 bpm length (a number), which ran — until the program
        // changed the tempo — and then went back to MakeCode as that number,
        // losing the call (census 2026-09-27: twelve apps).
        case 'music.beat': return `beat ${this.enumToken(a[0]) || 'whole'}`;
        case 'music.tempo': return 'music tempo';
        case 'music.noteFrequency': {
            const note = a[0] && a[0].type === 'Member' && a[0].object && a[0].object.name === 'Note' ? a[0].name : null;
            if (note && MAKECODE_NOTES.includes(note)) return `frequency of note ${note}`;
            // A computed "note" is already a frequency: noteFrequency is the identity.
            return this.expr(a[0]);
        }
        case 'Math.randomRange':
        case 'randint': return `pick random ${arg(0)} to ${arg(1)}`;
        case 'Math.random': return 'pick random 0 to 1';
        // `abs of` and friends bind TIGHTER than the operators (the grammar
        // keeps `abs of vx * -1` as `(abs of vx) * -1`), so a compound
        // argument has to be parenthesised: Math.abs(a - b) written as
        // `abs of a - b` computed |a| - b.
        case 'Math.abs': return `abs of ${this.operand(a[0])}`;
        case 'Math.floor': return `floor of ${this.operand(a[0])}`;
        case 'Math.ceil': return `ceiling of ${this.operand(a[0])}`;
        case 'Math.sqrt': return `sqrt of ${this.operand(a[0])}`;
        case 'Math.round': return `round ${this.operand(a[0])}`;
        // Planète Maths' min/max, which the dialect already reads and every
        // backend already lowers. These kept only the FIRST argument, which
        // runs and is wrong — the census found it in 10 of MakeCode's apps.
        case 'Math.min': return `min of ${this.operand(a[0])} and ${this.operand(a[1])}`;
        case 'Math.max': return `max of ${this.operand(a[0])} and ${this.operand(a[1])}`;
        // pins.map and Math.map are the same function; the block is MakeCode's
        // pins.map, word for word.
        case 'pins.map':
        case 'Math.map':
            return `map ${this.operand(a[0])} from low ${this.operand(a[1])} high ${this.operand(a[2])} ` +
                `to low ${this.operand(a[3])} high ${this.operand(a[4])}`;
        // Math.idiv(a, b) is DEFINED as (a / b) | 0 — truncation toward zero,
        // which `floor of` is not for a negative quotient. The bitwise-or
        // with 0 is the definition, so that is what is written, and the
        // export reads the same shape back as Math.idiv.
        case 'Math.idiv':
            this.usesBitops = true;
            return `((${this.operand(a[0])} / ${this.operand(a[1])}) bitor 0)`;
        // A coin toss AS A VALUE: the dialect's truth is the number 1 or 0,
        // so it is `pick random 0 to 1` itself. Not the comparison
        // condition() writes: `set b to (pick random 0 to 1) = 1` does not
        // parse as a comparison at all — it stores that TEXT, silently.
        case 'Math.randomBoolean': return 'pick random 0 to 1';
        // MakeCode's game score, not a variable called `score`: that
        // variable was never set by addScore, so every score read 0.
        case 'game.score': return 'game score';
        // LED sprites: a new sprite is its handle.
        case 'game.createSprite': return `create sprite at x ${this.operand(a[0])} y ${this.operand(a[1])}`;
        case 'game.isGameOver': return 'game is over';
        case 'game.isRunning': return 'game is running';
        case 'game.isPaused': return 'game is paused';
        case 'game.life': return 'game life';
        // An image is a value here, and the only thing our display can be
        // handed is a pattern, so that is what it becomes: `"0101…"`. It
        // survives being stored in an array, which is how these programs
        // actually use them (`uhrbilder[i].showImage(0)`).
        case 'images.createImage': return `"${ledPattern(a[0])}"`;
        case 'images.iconImage':
        case 'images.arrowImage': {
            const table = name === 'images.arrowImage' ? MICROBIT_ARROWS : MICROBIT_ICONS;
            const member = a[0] && a[0].type === 'Member' ? a[0].name : null;
            const pattern = member ? table[member] : null;
            if (pattern) return `"${pattern}"`;
            this.unsupported.push(`${name}(${member || '…'}) — not an icon we have a pattern for`);
            return '0';
        }
        default:
            if (CALLIOPE_ONLY[name]) {
                this.unsupported.push(`${name}() — ${CALLIOPE_ONLY[name]}`);
                return '0';
            }
            return super.callExpression(node);
        }
    }


    /** Command calls: the ones that DO something. */
    command (node, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        if (this.spriteCall(node, push)) return;
        const name = this.path(node.callee);
        const a = node.args || [];
        const arg = i => this.expr(a[i]);

        switch (name) {
        // ── display ────────────────────────────────────────────────
        // `show text` takes a literal only, but `display`/`scroll` take a
        // full expression — which is what showNumber(count) needs. The
        // literal spellings are kept where they apply because they carry
        // the scroll delay the device blocks model.
        // `show number`, which WAITS while the number is shown, as MakeCode's
        // does (a digit 750 ms, "42" 2550 ms at the default interval). It was
        // `display`, lite's own word, which scrolls and moves on, so a program
        // that showed a count ran ahead of MakeCode's (owner's decision
        // 2026-09-28: its own word; `display` keeps its meaning). The interval
        // is MakeCode's optional second argument.
        case 'basic.showNumber':
            push(a[1] ? `show number ${this.expr(a[0])} delay ${this.operand(a[1])} ms` :
                `show number ${this.expr(a[0])}`);
            return;
        case 'basic.showString': {
            const literal = this.literalString(a[0]);
            if (literal === null) {
                // `show text`, which takes any expression and goes back as
                // showString. `scroll X` is the NUMBER display and went back as
                // showNumber, which MakeCode refuses for a string (census:
                // three apps did not recompile).
                push(`show text ${this.expr(a[0])}`);
                return;
            }
            // The interval (ms per scroll step) is MakeCode's optional second
            // argument; 150 is its default. Always writing 150 lost a chosen one.
            push(`scroll text "${literal}" delay ${a[1] ? this.expr(a[1]) : '150'} ms`);
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
            // `show icon`, not `show pattern`: showIcon pauses 600 ms after
            // drawing and showLeds 400, and the way back has to know which.
            push(`show icon ${pattern}`);
            return;
        }
        case 'basic.showLeds':
            push(`show leds ${ledPattern(a[0])}`);
            return;
        case 'basic.clearScreen':
            push('clear display');
            return;
        // The serial console. `print` is the dialect's serial line on every
        // board (MicroPython's print() on the micro:bit), and it goes back as
        // serial.writeLine — the census found it refused in two apps, and
        // lite's own STC programs' `print` unexportable in 41.
        case 'serial.writeLine': {
            const literal = a[0] && a[0].type === 'String' ? this.literalString(a[0]) : null;
            push(literal !== null ? `print "${literal}"` : `print ${this.expr(a[0])}`);
            return;
        }
        // The rest of `led` and `game` that MakeCode's own apps use (census
        // 2026-09-25: plotBarGraph 15 apps, addScore 11, setBrightness 9,
        // stopAnimation 6, gameOver 5, toggle 3, removeLife 2). The spellings
        // are sb3-creator's; the MicroPython behind them is written from
        // MakeCode's source (bar graph centred and auto-scaling, score
        // clamped at 0, the third life lost is game over).
        //
        // plotBarGraph's optional third argument only echoes the value to
        // the serial console; the display is the same either way.
        case 'led.plotBarGraph':
            push(`plot bar graph of ${this.operand(a[0])} up to ${a[1] ? this.operand(a[1]) : '0'}`);
            return;
        case 'led.toggle':
            push(`toggle x ${this.operand(a[0])} y ${this.operand(a[1])}`);
            return;
        case 'led.setBrightness':
            push(`set display brightness to ${this.operand(a[0])}`);
            return;
        case 'led.stopAnimation':
            push('stop animation');
            return;
        case 'game.addScore':
            push(`change game score by ${this.operand(a[0])}`);
            return;
        case 'game.setScore':
            push(`set game score to ${this.operand(a[0])}`);
            return;
        case 'game.removeLife':
            push(`remove game life ${this.operand(a[0])}`);
            return;
        case 'game.gameOver':
            push('game over');
            return;
        case 'game.startCountdown':
            push(`start countdown ${this.operand(a[0])} ms`);
            return;
        case 'game.pause':
            push('pause game');
            return;
        case 'game.resume':
            push('resume game');
            return;
        case 'game.setLife':
            push(`set game life to ${this.operand(a[0])}`);
            return;
        case 'game.addLife':
            push(`add game life ${this.operand(a[0])}`);
            return;
        // A sprite made and not kept is still made (it is drawn).
        case 'game.createSprite': {
            const temp = `_mc${++this.temps}`;
            this.declared.add(temp);
            push(`set ${temp} to create sprite at x ${this.operand(a[0])} y ${this.operand(a[1])}`);
            return;
        }
        case 'basic.pause':
            push(`wait ${seconds(a[0], this)} seconds`);
            return;
        case 'control.waitMicros':
            push(`wait ${a[0] && a[0].type === 'Number' ? num(Number(a[0].value) / 1e6) : '0'} seconds`);
            return;
        case 'led.plot':
        case 'led.unplot': {
            // X and Y are inputs on the block, so a computed coordinate is
            // fine — but only since sb3-creator#4. Before that the grammar
            // read two literals and `plot x col y row on` matched no rule at
            // all, producing no block, so this used to be refused.
            const x = this.literalNumber(a[0]) ?? this.expr(a[0]);
            const y = this.literalNumber(a[1]) ?? this.expr(a[1]);
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
        // Both slots of `play tone` take an expression, so the frequency and
        // the length go across as written: noteFrequency(Note.C) and
        // beat(Quarter), not 262 and a length frozen at 120 bpm. ringTone is
        // the tone with no length — it rings until the next one (it was held
        // at 500 ms, which cut every held note short).
        case 'music.playTone':
            push(`play tone ${this.operand(a[0])} hz for ${this.operand(a[1])} ms`);
            return;
        case 'music.ringTone':
            push(`play tone ${this.operand(a[0])} hz`);
            return;
        // A rest is silence, not only a wait: whatever rings stops.
        case 'music.rest':
            push(`rest for ${this.operand(a[0])} ms`);
            return;
        case 'music.setTempo':
            push(`set music tempo to ${this.operand(a[0])}`);
            return;
        case 'music.changeTempoBy':
            push(`change music tempo by ${this.operand(a[0])}`);
            return;
        // What MakeCode's "play melody … until done / in background" block
        // writes, and the older music.play() form of the same thing.
        case 'music._playDefaultBackground':
        case 'music.play': {
            const tune = this.melody(a[0]);
            const mode = this.enumToken(a[1] && a[1].type === 'Member' ? {...a[1], object: {type: 'Identifier', name: 'PlaybackMode'}} : null);
            if (tune) {
                push(`play melody ${tune} ${mode || 'until done'}`);
                return;
            }
            push(this.note(`${name}() — only MakeCode's built-in melodies have a block here`));
            return;
        }
        case 'music.stopAllSounds':
            push('stop buzzer');
            return;

        // ── radio ──────────────────────────────────────────────────
        // Our one statement sets BOTH group and power; MakeCode sets each alone.
        // A lone call used to reset the other to a default — `setGroup(5)` then
        // `setTransmitPower(3)` came out as group 5, then GROUP 1 — a program on
        // the wrong radio channel. So the last-set values are carried, and a pair
        // of adjacent calls folds into one statement (what the export writes).
        case 'radio.setGroup':
        case 'radio.setTransmitPower': {
            const value = this.single(a[0], out, pad);
            if (name === 'radio.setGroup') this.radioGroup = value;
            else this.radioPower = value;
            const line = `${pad}radio on group ${this.radioGroup || '1'} power ${this.radioPower || '6'}`;
            const last = this.radioLine;
            if (last && last.out === out && last.index === out.length - 1 && last.pad === pad) out[last.index] = line;
            else out.push(line);
            this.radioLine = {out, index: out.length - 1, pad};
            return;
        }
        case 'radio.sendNumber':
            push(`radio send number ${this.single(a[0], out, pad)}`);
            return;
        // The number goes; the NAME cannot — the radio blocks send a number or
        // a text, not a pair. Said, rather than sending the bare number as if
        // that were the same packet.
        case 'radio.sendValue':
            this.unsupported.push('radio.sendValue() — the name is not sent; the radio block sends the number alone');
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
            if (CALLIOPE_ONLY[name]) {
                push(this.note(`${name}() — ${CALLIOPE_ONLY[name]}`));
                return;
            }
            if (node.callee && node.callee.type === 'Member' &&
                (node.callee.name === 'showImage' || node.callee.name === 'plotImage')) {
                const image = this.expr(node.callee.object);
                const literal = /^"([0-9:]+)"$/.exec(image);
                if (literal) {
                    push(`show pattern ${literal[1]}`);
                    return;
                }
                // MATRIX is a FIELD on the block, not an input, so a
                // computed pattern cannot be put there at all — this is a
                // limit of the block, not a gap in the grammar.
                push(this.note(`${image}.showImage() — the display block takes a fixed pattern, ` +
                    'so an image chosen at runtime cannot be shown'));
                return;
            }
            super.command(node, indent, out);
        }
    }
}

/**
 * Calliope-only API, named rather than merely refused.
 *
 * The Calliope mini runs the micro:bit's API plus its own hardware, and
 * the extra hardware is genuinely not on the board we model. A report
 * that says `basic.setLedColor()` teaches nothing; one that says which
 * piece of hardware it wanted, and what the nearest thing we have is,
 * tells the reader what to do next.
 */
const CALLIOPE_ONLY = {
    'basic.setLedColor': 'the Calliope RGB LED — the micro:bit display we model is single-colour',
    'basic.setLedColors': 'the Calliope RGB LED — the micro:bit display we model is single-colour',
    'basic.turnRgbLedOff': 'the Calliope RGB LED — the micro:bit display we model is single-colour',
    'basic.rgb': 'the Calliope RGB LED colour helper',
    'basic.rgbw': 'the Calliope RGB LED colour helper',
    'motors.dualMotorPower': 'the Calliope on-board motor driver — no motor on the micro:bit',
    'motors.motorPower': 'the Calliope on-board motor driver — no motor on the micro:bit',
    'motors.dualMotorStop': 'the Calliope on-board motor driver — no motor on the micro:bit',
    'input.loudness': 'the Calliope microphone (use `sound level` if your board has one)'
};

/** ms → seconds, computed when it is a literal so the output reads naturally. */
function seconds (node, translator) {
    if (node && node.type === 'Number') return num(Number(node.value) / 1000);
    // `pause(x * 1000)` is x seconds — read it as x, not (x * 1000) / 1000, or
    // every round trip nests one more pair (the CLI's full-circle test found it).
    if (node && node.type === 'Binary' && node.op === '*') {
        if (node.right && node.right.type === 'Number' && Number(node.right.value) === 1000) return translator.expr(node.left);
        if (node.left && node.left.type === 'Number' && Number(node.left.value) === 1000) return translator.expr(node.right);
    }
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
    // `Math.round(P * 1023 / 100)` is how the export writes `analog P %`:
    // read it back as P, not as a hoisted inverse (a round trip drifted here).
    const inner = node && node.type === 'Call' && node.callee && node.callee.type === 'Member' &&
        node.callee.object && node.callee.object.name === 'Math' && node.callee.name === 'round' && node.args[0];
    if (inner && inner.type === 'Binary' && inner.op === '/' && inner.right.type === 'Number' && Number(inner.right.value) === 100 &&
        inner.left.type === 'Binary' && inner.left.op === '*' && inner.left.right.type === 'Number' && Number(inner.left.right.value) === 1023) {
        return translator.single(inner.left.left, out, pad);
    }
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

/** Does this statement list assign `name` anywhere? */
function writes (body, name) {
    let found = false;
    const walk = node => {
        if (found || !node || typeof node !== 'object') return;
        if ((node.type === 'Assignment' && node.left && node.left.type === 'Identifier' && node.left.name === name) ||
            (node.type === 'Update' && node.argument && node.argument.type === 'Identifier' && node.argument.name === name)) {
            found = true;
            return;
        }
        for (const v of Object.values(node)) {
            if (Array.isArray(v)) v.forEach(walk);
            else if (v && typeof v === 'object') walk(v);
        }
    };
    walk(body);
    return found;
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
    },
    'input.onGesture': translator => a => {
        const gesture = translator.enumToken(a[0]) || 'shake';
        // A gesture is momentary; waiting for it to stop would hang.
        return {test: `${gesture} happening`, release: null};
    },
    'input.onPinPressed': translator => a => {
        const pin = translator.pin(a[0]) || 'P0';
        return {test: `pin ${pin} touched`, release: `pin ${pin} touched`};
    },
    'input.onPinReleased': translator => a => {
        const pin = translator.pin(a[0]) || 'P0';
        return {test: `not (pin ${pin} touched)`, release: null};
    }
};

/**
 * Handlers whose CONDITION has no reporter we can write. Reported rather
 * than approximated: a shake handler that silently never fires would be
 * worse than one the user is told about.
 */
const UNPOLLABLE_HANDLERS = {
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
    t.aliases = new Map();
    // Before anything is emitted: a variable this program has to be
    // renamed must not land on a name the program already uses.
    t.claimNames(ast);
    t.claimSprites(ast);

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

        // A radio handler is a HAT here, as it is in MakeCode. It used to be
        // polled — a FOREVER that ran the body on every pass whether or not a
        // packet came — so `clock += 1` per packet counted the loop instead
        // (census 2026-09-27: twenty apps, and the call was then lost on the
        // way back). The handler's parameter is the packet's value, which is
        // what `read last radio number` means inside the hat.
        if (callName === 'radio.onReceivedNumber' || callName === 'radio.onReceivedString') {
            const kind = callName.endsWith('Number') ? 'number' : 'text';
            const fn = call.args[call.args.length - 1];
            const param = fn && fn.params && fn.params[0];
            const reporter = `read last radio ${kind}`;
            const lines = [`WHEN radio receives ${kind}:`];
            // A body that assigns its parameter needs a variable to assign.
            if (param && writes(bodyOf(fn), param)) lines.push(`  set ${t.varName(param)} to ${reporter}`);
            else if (param) t.aliases.set(param, reporter);
            t.block(bodyOf(fn), 1, lines);
            if (param) t.aliases.delete(param);
            scripts.push(lines);
            continue;
        }

        t.statement(st, 1, main);
    }

    const out = ['DEVICE MICROBIT', ''];
    if (opts.name) {
        // The Calliope runs the same core API; the DEVICE line is the
        // closest board we model, and saying so beats implying the
        // hardware matched.
        out.push(opts.board === 'calliopemini' ?
            `# Imported from MakeCode for Calliope mini: ${opts.name}` :
            `# Imported from MakeCode: ${opts.name}`);
        if (opts.board === 'calliopemini') {
            out.push('# Translated against the micro:bit vocabulary, which the Calliope shares.');
        }
        out.push('');
    }

    const renames = t.renameNotes();
    if (renames.length) out.push(...renames, '');

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
