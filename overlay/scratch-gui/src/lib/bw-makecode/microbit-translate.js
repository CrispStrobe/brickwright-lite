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
/** The V2 built-in sounds (soundExpression.X), which MicroPython's Sound.X shares. */
export const MAKECODE_SOUNDS = ['giggle', 'happy', 'hello', 'mysterious', 'sad', 'slide', 'soaring', 'spring', 'twinkle', 'yawn'];
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
        node = this.resolveConst(node);
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

    /** `soundExpression.giggle`'s name, or null. */
    builtinSound (node) {
        const name = node && node.type === 'Member' && node.object && node.object.name === 'soundExpression' ? node.name : null;
        return name && MAKECODE_SOUNDS.includes(name) ? name : null;
    }

    /**
     * createSoundEffect/createSoundExpression's eight arguments as the
     * dialect's `play sound effect …` (without its mode), or null when an
     * enum is one the block does not have.
     */
    soundEffect (args) {
        const member = (node, owner, table) => (node && node.type === 'Member' && node.object &&
            node.object.name === owner ? table[node.name] : null);
        const wave = member(args[0], 'WaveShape', {Sine: 'sine', Sawtooth: 'sawtooth', Triangle: 'triangle', Square: 'square', Noise: 'noise'});
        const fx = member(args[6], 'SoundExpressionEffect', {None: 'none', Vibrato: 'vibrato', Tremolo: 'tremolo', Warble: 'warble'});
        const curve = member(args[7], 'InterpolationCurve', {Linear: 'linear', Curve: 'curve', Logarithmic: 'logarithmic'});
        if (!wave || !fx || !curve) return null;
        const o = i => this.operand(args[i]);
        return `play sound effect ${wave} from ${o(1)} to ${o(2)} hz volume ${o(3)} to ${o(4)} for ${o(5)} ms effect ${fx} curve ${curve}`;
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
            value === 'logo touched' ||
            /^read button_/.test(value) ||
            / happening$/.test(value) ||
            / touched$/.test(value) ||
            /^point x .+ y .+$/.test(value) ||
            /^pixel x .+ of image .+$/.test(value) ||
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
        // A record's sprite field: `client.sprite` (records are lowered to
        // arrays, so the field holds the handle like any other variable).
        if (node.type === 'Member') {
            const f = this.recordField(node);
            return !!f && this.recordTypes.get(f.type).spriteFields.has(node.name);
        }
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

    // ── images ──────────────────────────────────────────────────────
    //
    // MakeCode's Image methods, on an image kept anywhere (a variable, an
    // array item, a record's field). A record whose own method has one of
    // these names is the record's, not an image's.

    /** Is this call a method of an Image (and not a record's or a sprite's)? */
    imageMethod (node) {
        const c = node && node.callee;
        if (!c || c.type !== 'Member' || !IMAGE_METHODS.has(c.name)) return false;
        if (c.object && c.object.type === 'Identifier' && MAKECODE_NAMESPACES.has(c.object.name)) return false;
        if (this.isSprite(c.object)) return false;
        const rt = this.recordTypes && this.recordTypes.get(this.recordTypeOfNode(c.object));
        return !(rt && rt.methods.has(c.name));
    }

    /** An Image method used as a statement, or false. */
    imageCommand (node, push, out, pad) {
        if (!this.imageMethod(node)) return false;
        const c = node.callee;
        const a = node.args || [];
        if (c.name === 'showImage' || c.name === 'plotImage') {
            // Made and shown on the spot: the fixed pattern it is.
            const made = c.object && c.object.type === 'Call' &&
                /^images\.(createImage|iconImage|arrowImage)$/.test(this.path(c.object.callee) || '');
            const pattern = made ? /^\(?create image ([0-9:]+)\)?$|^"([0-9:]+)"$/.exec(this.expr(c.object)) : null;
            if (pattern) {
                push(`show pattern ${pattern[1] || pattern[2]}`);
                return true;
            }
            const image = this.operand(c.object);
            const offset = a[0] ? this.operand(a[0]) : '0';
            // showImage waits its interval (400 ms unless given) after drawing.
            const interval = c.name === 'showImage' ? (a[1] ? this.literalNumber(a[1]) : '400') : null;
            if (c.name === 'plotImage' || interval === '400') {
                push(`${c.name === 'showImage' ? 'show' : 'plot'} image ${image} offset ${offset}`);
                return true;
            }
            push(`plot image ${image} offset ${offset}`);
            push(`wait ${seconds(a[1], this)} seconds`);
            return true;
        }
        if (c.name === 'setPixel') {
            // A truth value: `v != 0` is how the export writes the dialect's
            // 1/0 back, so it is read as that value again.
            let v = a[2];
            if (v && v.type === 'Binary' && v.op === '!=' && v.right.type === 'Number' && Number(v.right.value) === 0) v = v.left;
            push(`set pixel x ${this.operand(a[0])} y ${this.operand(a[1])} of image ${this.operand(c.object)} to ${this.single(v, out, pad)}`);
            return true;
        }
        push(this.note(`${this.path(c) || c.name}() — an image method with no block here`));
        return true;
    }

    /** Reporter calls: MakeCode's sensors and maths in our spelling. */
    callExpression (node) {
        const sprite = this.spriteCall(node, null);
        if (sprite) return sprite;
        if (this.imageMethod(node)) {
            const c = node.callee;
            const a = node.args || [];
            if (c.name === 'pixel') return `pixel x ${this.operand(a[0])} y ${this.operand(a[1])} of image ${this.operand(c.object)}`;
            this.unsupported.push(`${this.path(c) || c.name}() — an image method with no block here`);
            return '0';
        }
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
        case 'input.logoIsPressed': return 'logo touched';
        // Of a packet's properties, MicroPython's radio reports the signal
        // strength (receive_full); the sender's serial number and send time
        // are not in its packets at all.
        case 'radio.receivedPacket': {
            const prop = a[0] && a[0].type === 'Member' ? a[0].name : '';
            if (prop === 'SignalStrength') return 'last radio signal strength';
            // The sender's serial number rides in the packet when the sender
            // turned it on (`radio transmit serial number on`); else 0, as in MakeCode.
            if (prop === 'SerialNumber') return 'last radio serial number';
            this.unsupported.push(`radio.receivedPacket(RadioPacketProperty.${prop || '…'}) — ` +
                'a MicroPython radio packet carries no send time');
            return '0';
        }
        case 'control.deviceSerialNumber': return 'device serial number';
        // MakeCode's "parse to number": the number a text spells.
        case 'parseFloat': return `number from text ${this.operand(a[0])}`;
        case 'led.point': return `point x ${this.operand(a[0])} y ${this.operand(a[1])}`;
        // The time of the event the handler runs for, in µs. The handler is
        // POLLED here, so it is the time the poll saw the event, read into a
        // variable as the handler starts (microbitToPseudocode).
        case 'control.eventTimestamp':
            if (this.eventTime) return this.eventTime;
            this.unsupported.push('control.eventTimestamp() outside an event handler');
            return '0';
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
        // An image is a VALUE — the dialect's `create image`, which is
        // MicroPython's Image — so it can be kept in a variable, an array or a
        // record's field, changed pixel by pixel and shown at run time
        // (gameofLife, karel). An image made and shown on the spot is still
        // `show pattern` (command(), showImage).
        case 'images.createImage': return `(create image ${ledPattern(a[0])})`;
        case 'images.iconImage':
        case 'images.arrowImage': {
            const table = name === 'images.arrowImage' ? MICROBIT_ARROWS : MICROBIT_ICONS;
            const icon = this.resolveConst(a[0]);
            const member = icon && icon.type === 'Member' ? icon.name : null;
            const pattern = member ? table[member] : null;
            // An image VALUE, like createImage's (MakeCode's icon image is an
            // Image): kept in an array and shown later, it is the image blocks'.
            if (pattern) return `(create image ${pattern})`;
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
            const icon = this.resolveConst(a[0]);
            const member = icon && icon.type === 'Member' ? icon.name : null;
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
        // `wait until` goes to MakeCode as pauseUntil(() => cond) — which is
        // how every polled handler's release wait is exported — and it was not
        // read back: a second round trip dropped it (census batch 3 test).
        case 'pauseUntil': {
            const fn = a[0];
            const ret = fn && fn.type === 'FunctionExpression' && fn.body.length === 1 && fn.body[0].type === 'Return' ?
                fn.body[0].value : null;
            if (ret) {
                push(`wait until ${this.condition(ret)}`);
                return;
            }
            push(this.note('pauseUntil() with a function body — only a condition has a block here'));
            return;
        }
        // The serial console. `print` is the dialect's serial line on every
        // board (MicroPython's print() on the micro:bit), and it goes back as
        // serial.writeLine — the census found it refused in two apps, and
        // lite's own STC programs' `print` unexportable in 41.
        // `name:value` on one line, as MakeCode's writeValue writes it; the
        // export reads a `print` of a literal "name:" joined with a value
        // back as writeValue.
        case 'serial.writeValue': {
            const label = this.literalString(a[0]);
            if (label === null || !/^[^:]+$/.test(label)) {
                push(this.note('serial.writeValue() with a computed or colon-bearing name'));
                return;
            }
            push(`print ("${label}:" join ${this.joinOperand(a[1])})`);
            return;
        }
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
        case 'led.plotBrightness':
            push(`plot x ${this.operand(a[0])} y ${this.operand(a[1])} brightness ${this.operand(a[2])}`);
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
            const inner = a[0] && a[0].type === 'Call' ? this.path(a[0].callee) : null;
            const args = inner ? a[0].args || [] : [];
            if (mode === 'looping in background' && inner !== null) {
                push(this.note(`${name}(${inner}(), LoopingInBackground) — a looping sound has no block here`));
                return;
            }
            // music.play(music.tonePlayable(F, D), mode): a tone with its mode.
            if (inner === 'music.tonePlayable') {
                push(`play tone ${this.operand(args[0])} hz for ${this.operand(args[1])} ms ${mode || 'until done'}`);
                return;
            }
            if (inner === 'music.builtinPlayableSoundEffect' || inner === 'music.builtinSoundEffect') {
                const sound = this.builtinSound(args[0]);
                if (sound) {
                    push(`play sound ${sound} ${mode || 'until done'}`);
                    return;
                }
            }
            // createSoundExpression(...) is `new SoundExpression(createSoundEffect(...))`
            // in pxt-microbit (libs/core/soundexpressions.ts): the same sound.
            if (inner === 'music.createSoundExpression') {
                const effect = this.soundEffect(args);
                if (effect) {
                    push(`${effect} ${mode || 'until done'}`);
                    return;
                }
            }
            push(this.note(`${name}() — only MakeCode's built-in melodies, tones, built-in sounds and sound effects have blocks here`));
            return;
        }
        case 'music.playSoundEffect': {
            const inner = a[0] && a[0].type === 'Call' ? this.path(a[0].callee) : null;
            const effect = inner === 'music.createSoundEffect' ? this.soundEffect(a[0].args || []) : null;
            const builtin = inner === 'music.builtinSoundEffect' ? this.builtinSound((a[0].args || [])[0]) : null;
            const mode = a[1] && a[1].type === 'Member' && a[1].name === 'InBackground' ? 'in background' : 'until done';
            if (effect) {
                push(`${effect} ${mode}`);
                return;
            }
            if (builtin) {
                push(`play sound ${builtin} ${mode}`);
                return;
            }
            push(this.note('music.playSoundEffect() — only a createSoundEffect or built-in sound has a block here'));
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
        case 'radio.setTransmitSerialNumber': {
            const on = a[0] && a[0].type === 'Boolean' ? a[0].value : null;
            if (on !== null) {
                push(`radio transmit serial number ${on ? 'on' : 'off'}`);
                return;
            }
            push(`IF ${this.condition(a[0])} THEN:`);
            out.push(`${pad}  radio transmit serial number on`);
            push('ELSE:');
            out.push(`${pad}  radio transmit serial number off`);
            return;
        }
        case 'input.setSoundThreshold': {
            const level = a[0] && a[0].type === 'Member' && a[0].name === 'Quiet' ? 'quiet' : 'loud';
            push(`set ${level} sound threshold to ${this.operand(a[1])}`);
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
            if (NO_MICROPYTHON[name]) {
                push(this.note(`${name}() — ${NO_MICROPYTHON[name]}`));
                return;
            }
            if (this.imageCommand(node, push, out, pad)) return;
            super.command(node, indent, out);
        }
    }
}

/** MakeCode's namespaces: `led.clear` is not an image's clear(). */
const MAKECODE_NAMESPACES = new Set(['basic', 'input', 'led', 'music', 'radio', 'pins', 'game', 'images', 'serial',
    'control', 'Math', 'bluetooth', 'datalogger', 'servos', 'power', 'loops', 'logic', 'text', 'console']);

/** MakeCode's Image methods (pxt-microbit 9.1.1 libs/core/images.cpp). */
const IMAGE_METHODS = new Set(['setPixel', 'pixel', 'showImage', 'plotImage', 'scrollImage', 'clear',
    'setPixelBrightness', 'pixelBrightness', 'width', 'height', 'plotFrame', 'showFrame']);

/**
 * MakeCode calls with NO MicroPython counterpart at all — refused with the
 * reason, because "unsupported" alone reads like a gap someone forgot.
 */
const NO_MICROPYTHON = {
    'radio.writeReceivedPacketToSerial': 'the dump prints each packet\'s send time, and a MicroPython radio packet carries none'
};

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

/** Does this body read control.eventTimestamp()? */
const usesEventTime = body => JSON.stringify(body).includes('"object":{"type":"Identifier","name":"control"},"name":"eventTimestamp"');

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
    },
    // The V2 touch logo. Pressed and Touched both fire as the logo is
    // touched, which polling can say; Released and LongPressed need the timing
    // of the touch, which a poll does not keep — refused, by name.
    //
    // A release and a long press are what the touch's DURATION says, so for
    // those the poll waits for the release and times the touch (CODAL: on
    // release, held 1000 ms or more is LONG_CLICK, less is CLICK). When a
    // program has a long-press handler, its Pressed handler is timed too —
    // a long press must not also fire it at the touch, as MakeCode's does
    // not.
    'input.onLogoEvent': translator => a => {
        const event = a[0] && a[0].type === 'Member' ? a[0].name : 'Pressed';
        if (event === 'Touched' || (event === 'Pressed' && !translator.logoTimed)) return {test: 'logo touched', release: 'logo touched'};
        if (event === 'Released') return {test: 'logo touched', wait: 'not (logo touched)'};
        if (event === 'Pressed' || event === 'LongPressed') {
            const held = translator.freshName('_held');
            return {test: 'logo touched', start: `set ${held} to timer`, wait: 'not (logo touched)',
                guard: event === 'Pressed' ? `(timer - ${held}) < 1` : `not ((timer - ${held}) < 1)`};
        }
        return {refuse: `input.onLogoEvent(TouchButtonEvent.${event}) — no such logo event`};
    },
    // A pulse ends when the pin leaves the level: a High pulse at the fall,
    // a Low pulse at the rise — so the poll sees the level, then waits for
    // it to end, then runs the body (MakeCode's onPulsed fires as the pulse
    // ends). Its duration (pins.pulseDuration) is not kept.
    'pins.onPulsed': translator => a => {
        const pin = translator.pin(a[0]) || 'P0';
        const high = !(a[1] && a[1].type === 'Member' && a[1].name === 'Low');
        const level = `pin ${pin} digital = 0`;
        return high ? {test: `not (${level})`, wait: level} : {test: level, wait: `not (${level})`};
    }
};

/**
 * Handlers whose CONDITION has no reporter we can write. Reported rather
 * than approximated: a shake handler that silently never fires would be
 * worse than one the user is told about.
 */
const UNPOLLABLE_HANDLERS = {};

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
    // Classes, interfaces and object literals, lowered to parallel arrays
    // (translate-base.js, records). Before the functions are listed: a
    // class's methods become procedures of their own.
    t.claimRecords(ast);
    // A long-press handler on the logo makes its Pressed handler a timed one.
    t.logoTimed = JSON.stringify(ast).includes('"object":{"type":"Identifier","name":"TouchButtonEvent"},"name":"LongPressed"');

    // Enums and functions first: a call can precede its definition, and
    // an enum member can be referenced before the enum is declared.
    for (const st of ast.body) {
        if (st.type === 'Enum') t.statement(st, 0, []);
        if (st.type === 'FunctionDeclaration') {
            t.functions.push({name: t.procName(st.name), source: st.name, params: st.params, paramTypes: st.paramTypes,
                returnType: st.returnType, body: st.body, scope: st.name});
        }
    }
    // A function that returns a value hands it back in a variable of its own,
    // `<name>_result`, which its callers read after calling it.
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

        // `basic.forever` at the top level is a script of its own: two of
        // them run concurrently in MakeCode, and two `WHEN flag clicked`
        // hats are how that is said here.
        if (callName === 'basic.forever') {
            const lines = ['WHEN flag clicked:', '  FOREVER:'];
            t.block(t.leavable(bodyOf(call.args[0]), 'forever'), 2, lines);
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
            if (shape.refuse) {
                t.unsupported.push(shape.refuse);
                scripts.push([`# unsupported: ${shape.refuse}`]);
                continue;
            }
            const handlerBody = t.leavable(bodyOf(call.args[call.args.length - 1]), callName.split('.').pop());
            const lines = [
                `# ${callName} — MakeCode fires this on an event; here it is polled.`,
                'WHEN flag clicked:',
                '  FOREVER:',
                `    IF ${shape.test} THEN:`
            ];
            // control.eventTimestamp(): the time the poll saw the event.
            t.eventTime = usesEventTime(handlerBody) ? t.freshName('_evt') : null;
            if (t.eventTime) lines.push(`      set ${t.eventTime} to round (timer * 1000000)`);
            // Timed shapes (a release, a long press, a pulse): wait for the
            // event's end first, and run the body only if its guard holds.
            if (shape.start) lines.push(`      ${shape.start}`);
            if (shape.wait) lines.push(`      wait until ${shape.wait}`);
            if (shape.guard) {
                lines.push(`      IF ${shape.guard} THEN:`);
                t.block(handlerBody, 4, lines);
            } else t.block(handlerBody, 3, lines);
            if (shape.release) lines.push(`      wait until not (${shape.release})`);
            t.eventTime = null;
            scripts.push(lines);
            continue;
        }

        // MakeCode's input.onSound, a hat as in MakeCode (it has no sound-event
        // reporter to poll with).
        if (callName === 'input.onSound') {
            const level = call.args[0] && call.args[0].type === 'Member' && call.args[0].name === 'Quiet' ? 'quiet' : 'loud';
            const body = t.leavable(bodyOf(call.args[call.args.length - 1]), 'onSound');
            const lines = [`WHEN ${level} sound:`];
            t.eventTime = usesEventTime(body) ? t.freshName('_evt') : null;
            if (t.eventTime) lines.push(`  set ${t.eventTime} to round (timer * 1000000)`);
            t.block(body, 1, lines);
            t.eventTime = null;
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
            // A return in a radio hat leaves that one handler, as in MakeCode.
            t.returnable = {result: null};
            t.block(bodyOf(fn), 1, lines);
            t.returnable = null;
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

    // The procedures are translated BEFORE the scripts are assembled: a
    // method's body can be the first use of a record type, whose arrays the
    // main script then has to create.
    const defines = [];
    t.inProcedure = true;
    for (const fn of t.functions) {
        // A function that takes an array exists only as its specialisations
        // (translate-base.js, specialize), which this loop reaches as they are made.
        if (fn.generic || (!fn.specialOf && (fn.params || []).some(p => fn.paramTypes && fn.paramTypes[p] && fn.paramTypes[p].isArray))) continue;
        // A parameter is read in the body under the name the body uses for it
        // (`x` is `x_`: a bare `x` is Scratch's x position), so it is declared so.
        const signature = fn.params && fn.params.length ?
            `${fn.name} ${fn.params.map(p => `(${t.varName(p)})`).join(' ')}` : fn.name;
        const lines = [`DEFINE ${signature}:`];
        t.returnable = {result: fn.result || null};
        // A method: `this` is the instance it was called on, its first argument.
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
    // Every record array starts with index 0, "no record", before anything runs.
    const prelude = t.recordPrelude().map(line => `  ${line}`);
    if (prelude.length) main.unshift(...prelude);

    // After every body, procedures included: a rename made in one is announced too.
    const renames = t.renameNotes();
    if (renames.length) out.push(...renames, '');

    if (main.length) {
        out.push('WHEN flag clicked:', ...main, '');
    }
    for (const script of scripts) out.push(...script, '');
    out.push(...defines);

    // Nothing at all ran: better an empty hat than a file with no script.
    if (!main.length && !scripts.length) out.push('WHEN flag clicked:', '  # (nothing translatable in this project)', '');

    return {
        code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)],
        scripts: scripts.length + (main.length ? 1 : 0)
    };
}

export default microbitToPseudocode;
