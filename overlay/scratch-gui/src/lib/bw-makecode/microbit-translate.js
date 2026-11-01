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
import {lowerNamespaceBindings} from './namespace-bindings.js';
import {lowerHandleValues} from './lower-handle-values.js';

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

/** MakeCode's Delimiters member -> the bluetooth uart blocks' menu word. */
const DELIMITERS = {NewLine: 'newline', Comma: 'comma', Dollar: 'dollar', Colon: 'colon', Fullstop: 'fullstop', Hash: 'hash',
    CarriageReturn: 'carriage return', Space: 'space', Tab: 'tab', Pipe: 'pipe', SemiColon: 'semicolon'};

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
            value === 'sound is playing' ||
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
        if (c.name === 'setPixelBrightness') {
            push(`set pixel x ${this.operand(a[0])} y ${this.operand(a[1])} of image ${this.operand(c.object)} brightness ${this.operand(a[2])}`);
            return true;
        }
        push(this.note(`${this.path(c) || c.name}() — an image method with no block here`));
        return true;
    }

    /** `serial.delimiters(Delimiters.NewLine)`'s word (a bluetooth uart delimiter), else a note and 'newline'. */
    /** A pin named by its enum member (SerialPin.P0), or the default. */
    memberPin (node, fallback) {
        return node && node.type === 'Member' && /^P\d+$/.test(node.name) ? node.name : fallback;
    }

    /** A BaudRate member (BaudRate.BaudRate115200) as its number; a number as itself. */
    baudRate (node) {
        if (node && node.type === 'Member' && /^BaudRate\d+$/.test(node.name)) return node.name.slice('BaudRate'.length);
        return node ? this.operand(node) : '115200';
    }

    delimiterWord (node) {
        const arg = node && node.type === 'Call' && this.path(node.callee) === 'serial.delimiters' ? node.args[0] : null;
        const word = arg && arg.type === 'Member' && arg.object && arg.object.name === 'Delimiters' ? DELIMITERS[arg.name] : null;
        if (!word) this.unsupported.push('bluetooth delimiter — the block takes serial.delimiters(Delimiters.X) from its menu');
        return word || 'newline';
    }

    // ── buffers ─────────────────────────────────────────────────────
    //
    // A Buffer is a byte array (`create buffer`, a bytearray on the device).
    // Its methods share names with arrays' and strings' (`slice`, `length`),
    // so which names hold a buffer is found before the walk (claimBuffers):
    // by what was assigned to them, by `: Buffer`, or by the handler that
    // receives one. A name that is ALSO given something else is not guessed at.

    /** Is this expression a Buffer (by what the program says about it)? */
    isBuffer (node) {
        if (!node || !this.bufferNames) return false;
        if (node.type === 'Identifier') return this.bufferNames.has(node.name);
        if (node.type === 'Member') return this.bufferNames.has(node.name) && node.name !== 'length';
        // An item of an array of buffers.
        if (node.type === 'Index') return !!node.object && node.object.type === 'Identifier' && this.bufferArrays.has(node.object.name);
        if (node.type === 'Call') {
            const name = this.path(node.callee);
            if (BUFFER_MAKERS.has(name)) return true;
            const c = node.callee;
            return !!c && c.type === 'Member' && c.name === 'slice' && this.isBuffer(c.object);
        }
        return false;
    }

    /** Find the names that hold Buffers (and drop the ones that also hold something else). */
    claimBuffers (ast) {
        this.bufferNames = new Set();
        this.bufferArrays = new Set();
        const other = new Set();
        const nameOf = n => (n && (n.type === 'Identifier' || n.type === 'Member') ? n.name : null);
        const note = (name, value, typeName) => {
            if (!name) return;
            if (/^(Buffer\[\]|Array<Buffer>)$/.test(String(typeName || '').replace(/\s+/g, ''))) this.bufferArrays.add(name);
            else if (/^Buffer$/.test(String(typeName || '').trim()) || (value && this.isBuffer(value))) this.bufferNames.add(name);
            else if (value && ['Array', 'String', 'Number', 'Template', 'Boolean'].includes(value.type)) other.add(name);
        };
        for (let pass = 0; pass < 3; pass++) {
            const walk = node => {
                if (!node || typeof node !== 'object') return;
                if (Array.isArray(node)) { node.forEach(walk); return; }
                if (node.type === 'Declaration') for (const d of node.decls || []) note(d.name, d.init, d.typeName);
                if (node.type === 'Assignment' && node.op === '=') note(nameOf(node.left), node.right, '');
                for (const key of ['paramTypes']) {
                    for (const [p, t] of Object.entries(node[key] || {})) if (t && /^Buffer$/.test(t.text || '')) this.bufferNames.add(p);
                }
                if (node.type === 'Class') for (const f of node.fields || []) note(f.name, f.init, f.typeName);
                // `bufs.push(buffer)` makes bufs an array of buffers; `for (const b of bufs)` makes b a buffer.
                if (node.type === 'Call' && node.callee && node.callee.type === 'Member' && node.callee.name === 'push' &&
                    node.callee.object.type === 'Identifier' && node.args && node.args[0] && this.isBuffer(node.args[0])) {
                    this.bufferArrays.add(node.callee.object.name);
                }
                if (node.type === 'ForOf' && node.iterable && node.iterable.type === 'Identifier' && this.bufferArrays.has(node.iterable.name)) {
                    this.bufferNames.add(node.name);
                }
                for (const [p, t] of Object.entries(node.paramTypes || {})) if (t && /^(Buffer\[\]|Array<Buffer>)$/.test((t.text || '').replace(/\s+/g, ''))) this.bufferArrays.add(p);
                // The destructured legacy packet handler: its `receivedBuffer` is a buffer.
                if (node.type === 'Call' && this.path(node.callee) === 'radio.onDataPacketReceived') {
                    const fn = node.args[node.args.length - 1];
                    if (fn && fn.params && fn.params.includes('receivedBuffer')) this.bufferNames.add('receivedBuffer');
                }
                if (node.type === 'Call' && this.path(node.callee) === 'radio.onReceivedBuffer') {
                    const fn = node.args[node.args.length - 1];
                    if (fn && fn.params && fn.params[0]) this.bufferNames.add(fn.params[0]);
                }
                for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
            };
            walk(ast);
        }
        for (const name of other) this.bufferNames.delete(name);
    }

    /** `NumberFormat.Int32LE` → `int32le`; null when it is not a member of NumberFormat. */
    numberFormat (node) {
        if (node && node.type === 'Member' && node.object && node.object.name === 'NumberFormat') return node.name.toLowerCase();
        this.unsupported.push('a Buffer number format that is not NumberFormat.<member> — the block takes it from its menu');
        return 'int32le';
    }

    /** A Buffer method as a value, or null when the call is not one. */
    bufferValue (node) {
        const c = node.callee;
        if (!c || c.type !== 'Member' || !this.isBuffer(c.object) || (c.object.type === 'Identifier' && MAKECODE_NAMESPACES.has(c.object.name))) return null;
        const a = node.args || [];
        const b = this.operand(c.object);
        switch (c.name) {
        case 'getNumber': return `buffer ${b} get ${this.numberFormat(a[0])} at ${this.operand(a[1])}`;
        case 'getUint8': return `buffer ${b} get uint8le at ${this.operand(a[0])}`;
        case 'toHex': return `hex of buffer ${b}`;
        case 'slice': return `slice of buffer ${b} from ${a[0] ? this.operand(a[0]) : '0'} length ${a[1] ? this.operand(a[1]) : '(-1)'}`;
        default:
            this.unsupported.push(`${this.path(c) || c.name}() — a Buffer method with no block`);
            return '0';
        }
    }

    /** A Buffer method as a statement, or false. */
    bufferStatement (node, push, out, pad) {
        const c = node.callee;
        if (!c || c.type !== 'Member' || !this.isBuffer(c.object) || (c.object.type === 'Identifier' && MAKECODE_NAMESPACES.has(c.object.name))) return false;
        const a = node.args || [];
        const b = this.operand(c.object);
        switch (c.name) {
        case 'setNumber':
            push(`set buffer ${b} ${this.numberFormat(a[0])} at ${this.single(a[1], out, pad)} to ${this.single(a[2], out, pad)}`);
            return true;
        case 'setUint8':
            push(`set buffer ${b} uint8le at ${this.single(a[0], out, pad)} to ${this.single(a[1], out, pad)}`);
            return true;
        case 'fill':
            if (a.length > 1) this.unsupported.push('Buffer.fill() with an offset or length — the block fills the whole buffer');
            push(`fill buffer ${b} with ${this.single(a[0], out, pad)}`);
            return true;
        default:
            push(this.note(`${this.path(c) || c.name}() — a Buffer method with no block`));
            return true;
        }
    }

    /** Members with a word of their own: a buffer's length, a legacy radio packet's properties. */
    memberValue (node) {
        if (!node || node.type !== 'Member') return null;
        if (node.name === 'length' && this.isBuffer(node.object)) return `length of buffer ${this.operand(node.object)}`;
        if (node.object && node.object.type === 'Identifier' && this.packetParams && this.packetParams.has(node.object.name)) {
            const word = PACKET_PROPERTIES[node.name];
            if (word) return word;
            this.unsupported.push(`${node.object.name}.${node.name} — a radio packet has no such property`);
            return '0';
        }
        return null;
    }

    /** An event-bus id or value: a number, an EventBusSource / EventBusValue member (control.eventSourceId(X) too), or a number expression. */
    eventNumber (node) {
        let member = node;
        if (node && node.type === 'Call' && /^control\.event(Source|Value)Id$/.test(this.path(node.callee) || '')) member = node.args[0];
        if (member && member.type === 'Member' && member.object && /^EventBus(Source|Value)$/.test(member.object.name)) {
            const table = member.object.name === 'EventBusSource' ? EVENT_BUS_SOURCE : EVENT_BUS_VALUE;
            if (table[member.name] !== undefined) return String(table[member.name]);
            this.unsupported.push(`${member.object.name}.${member.name} — not a member MakeCode defines`);
            return '0';
        }
        return this.operand(node);
    }

    /** Reporter calls: MakeCode's sensors and maths in our spelling. */
    callExpression (node) {
        const sprite = this.spriteCall(node, null);
        if (sprite) return sprite;
        const buffer = this.bufferValue(node);
        if (buffer !== null) return buffer;
        // `s.charCodeAt(i)`: only a string has one.
        if (node.callee && node.callee.type === 'Member' && node.callee.name === 'charCodeAt' && !this.isBuffer(node.callee.object)) {
            return `char code of ${this.operand(node.callee.object)} at ${node.args && node.args[0] ? this.operand(node.args[0]) : '0'}`;
        }
        if (this.imageMethod(node)) {
            const c = node.callee;
            const a = node.args || [];
            if (c.name === 'pixelBrightness') return `pixel brightness x ${this.operand(a[0])} y ${this.operand(a[1])} of image ${this.operand(c.object)}`;
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
        case 'input.runningTime': case 'control.millis': return 'timer * 1000';
        case 'input.runningTimeMicros': case 'control.micros': return 'timer * 1000000';
        // The older radio reporters are the same packet properties as radio.receivedPacket(...).
        case 'radio.receivedSerial': return 'last radio serial number';
        case 'radio.receivedTime': return 'read last radio time';
        case 'radio.receivedSignalStrength': return 'last radio signal strength';
        case 'radio.receiveNumber': return 'read last radio number';
        case 'radio.receiveString': return 'read last radio text';
        // Readable since sb3-creator b4a8129 closed the round trip: these
        // two spellings came out of the decompiler and had no rule going
        // back in, so writing them used to compile to silence.
        case 'input.isGesture': return `${this.enumToken(a[0]) || 'shake'} happening`;
        case 'input.pinIsPressed': return `pin ${this.pin(a[0]) || 'P0'} touched`;
        case 'pins.digitalReadPin': return `pin ${this.pin(a[0]) || 'P0'} digital`;
        case 'pins.analogReadPin': return `analog value of pin ${this.pin(a[0]) || 'P0'}`;
        case 'radio.receivedNumber': return 'read last radio number';
        case 'String.fromCharCode': return `char from code ${this.operand(a[0])}`;
        case 'game.level': return 'game level';
        case 'game.currentTime': return 'game time';
        case 'pins.pulseIn': {
            const level = a[1] && a[1].type === 'Member' && a[1].name === 'Low' ? 'low' : 'high';
            return `pulse in pin ${this.pin(a[0]) || 'P0'} ${level} timeout ${a[2] ? this.operand(a[2]) : '2000000'}`;
        }
        case 'control.createBufferFromUTF8': return `buffer from text ${this.operand(a[0])}`;
        // The USB serial console's reads (a MicroPython uart).
        case 'serial.readBuffer': return `serial read buffer ${this.operand(a[0])}`;
        case 'serial.readString': return 'serial read string';
        case 'serial.readLine': return 'serial read until newline';
        case 'serial.readUntil': return `serial read until ${this.delimiterWord(a[0])}`;
        case 'pins.i2cReadBuffer': return `i2c read buffer at ${this.operand(a[0])} size ${this.operand(a[1])}`;
        case 'pins.i2cReadNumber': return `i2c read ${this.numberFormat(a[1])} at ${this.operand(a[0])}`;
        case 'pins.sizeOf': return `size of ${this.numberFormat(a[0])}`;
        case 'pins.spiWrite': return `spi transfer ${this.operand(a[0])}`;
        case 'music.volume': return 'speaker volume';
        case 'music.isSoundPlaying': return 'sound is playing';
        case 'control.createBuffer': case 'pins.createBuffer': return `create buffer ${this.operand(a[0])}`;
        case 'led.displayMode': return 'display mode';
        case 'control.eventValue': return 'event value';
        case 'radio.receivedBuffer': return 'read last radio buffer';
        case 'radio.receivedString': return 'read last radio text';
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
            // The receive stamp stands for the send time: a MicroPython packet carries none.
            if (prop === 'Time') return 'read last radio time';
            this.unsupported.push(`radio.receivedPacket(RadioPacketProperty.${prop || '…'}) — not a property of a packet`);
            return '0';
        }
        case 'control.deviceSerialNumber': return 'device serial number';
        // MakeCode's "parse to number": the number a text spells.
        case 'parseFloat': return `number from text ${this.operand(a[0])}`;
        // 0..255, as MakeCode's; the display itself holds ten levels.
        case 'bluetooth.uartReadUntil': return `bluetooth uart read until ${this.delimiterWord(a[0])}`;
        case 'led.pointBrightness': return `point brightness x ${this.operand(a[0])} y ${this.operand(a[1])}`;
        case 'led.brightness': return 'display brightness';
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
        // Math.clamp(min, max, value) is Math.min(max, Math.max(min, value)) (pxt-helpers.ts); the
        // argument order differs from Math.constrain(value, low, high), which clamps the same way.
        case 'Math.clamp':
            return `min of ${this.operand(a[1])} and (max of ${this.operand(a[0])} and ${this.operand(a[2])})`;
        case 'Math.constrain':
            return `min of ${this.operand(a[2])} and (max of ${this.operand(a[1])} and ${this.operand(a[0])})`;
        // pins.map and Math.map are the same function; the block is MakeCode's
        // pins.map, word for word.
        case 'pins.map':
        case 'Math.map':
            return `map ${this.operand(a[0])} from low ${this.operand(a[1])} high ${this.operand(a[2])} ` +
                `to low ${this.operand(a[3])} high ${this.operand(a[4])}`;
        // Math.idiv(a, b) truncates BOTH operands to signed 32-bit integers,
        // then the quotient: pxt's simulator is ((x | 0) / (y | 0)) | 0 and the
        // device shim is C `int idiv(int x, int y)`. So Math.idiv(3.5, 0.5)
        // is 0 where (3.5 / 0.5) | 0 is 7. That whole shape is written, and
        // the export reads exactly that shape back as Math.idiv.
        case 'Math.idiv':
            this.usesBitops = true;
            return `(((${this.operand(a[0])} bitor 0) / (${this.operand(a[1])} bitor 0)) bitor 0)`;
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
        if (this.bufferStatement(node, push, out, pad)) return;
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
            push(`scroll text ${JSON.stringify(literal)} delay ${a[1] ? this.expr(a[1]) : '150'} ms`);
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
            push(`print (${JSON.stringify(`${label}:`)} join ${this.joinOperand(a[1])})`);
            return;
        }
        case 'serial.writeLine': {
            const literal = a[0] && a[0].type === 'String' ? this.literalString(a[0]) : null;
            push(literal !== null ? `print ${JSON.stringify(literal)}` : `print ${this.expr(a[0])}`);
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
        // DisplayMode.BlackAndWhite (BackAndWhite is its old, hidden spelling)
        // or Greyscale; a mode held in a variable has no word here.
        case 'led.setDisplayMode': {
            const mode = a[0] && a[0].type === 'Member' && a[0].object && a[0].object.name === 'DisplayMode' ? a[0].name : null;
            if (mode !== 'BlackAndWhite' && mode !== 'BackAndWhite' && mode !== 'Greyscale') {
                push(this.note('led.setDisplayMode(<expression>) — the block takes the mode from its menu'));
                return;
            }
            push(`set display mode to ${mode === 'Greyscale' ? 'greyscale' : 'black and white'}`);
            return;
        }
        case 'led.enable': {
            const on = a[0] && a[0].type === 'Boolean' ? a[0].value : null;
            if (on !== null) {
                push(`led enable ${on ? 'on' : 'off'}`);
                return;
            }
            push(`IF ${this.condition(a[0])} THEN:`);
            out.push(`${pad}  led enable on`);
            push('ELSE:');
            out.push(`${pad}  led enable off`);
            return;
        }
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
        // The serial console beyond writeLine: text and numbers without a newline, raw buffers.
        case 'pins.analogSetPeriod': push(`set analog period of pin ${this.pin(a[0]) || 'P0'} to ${this.operand(a[1])} us`); return;
        case 'pins.servoSetPulse': push(`servo pulse of pin ${this.pin(a[0]) || 'P0'} ${this.operand(a[1])} us`); return;
        case 'pins.touchSetMode': {
            const mode = a[1] && a[1].type === 'Member' && a[1].name === 'Resistive' ? 'resistive' : 'capacitive';
            push(`touch mode of pin ${a[0] && a[0].type === 'Member' && /^P\d+$/.test(a[0].name) ? a[0].name : 'P0'} ${mode}`);
            return;
        }
        case 'game.levelUp': push('game level up'); return;
        case 'game.startStopwatch': push('game start stopwatch'); return;
        // Nothing to do on MicroPython: the runtime has no garbage-collector flags, heap dumps, debug
        // output or performance counters of MakeCode's to switch, and the pin event mode is implicit.
        case 'control.gc': case 'control.heapDump': case 'control.heapSnapshot': case 'control.setDebugFlags': case 'control.dmesg':
        case 'control.dmesgPtr': case 'control.enablePerfCounter': case 'control.dmesgPerfCounters': case 'control.runtimeWarning':
        case 'serial.writeDmesg': case 'pins.setEvents': case 'pins.setAudioPin': case 'pins.setAudioPinEnabled':
            push(`# ${name} — MicroPython has nothing to set`);
            return;
        case 'radio.off': push('radio off'); return;
        case 'radio.setFrequencyBand': push(`radio frequency band ${this.operand(a[0])}`); return;
        case 'serial.redirect': push(`serial redirect tx ${this.memberPin(a[0], 'P0')} rx ${this.memberPin(a[1], 'P1')} baud ${this.baudRate(a[2])}`); return;
        case 'serial.setBaudRate': push(`serial baud rate ${this.baudRate(a[0])}`); return;
        case 'control.reset': push('reset micro:bit'); return;
        case 'control.panic': push(`panic with code ${this.operand(a[0])}`); return;
        case 'input.calibrateCompass': push('calibrate compass'); return;
        case 'input.setAccelerometerRange': {
            const g = a[0] && a[0].type === 'Member' ? {OneG: 1, TwoG: 2, FourG: 4, EightG: 8}[a[0].name] : null;
            if (!g) {
                push(this.note('input.setAccelerometerRange(<expression>) — the block takes 1, 2, 4 or 8 g'));
                return;
            }
            push(`set accelerometer range ${g}`);
            return;
        }
        case 'serial.writeString': push(`serial write text ${this.single(a[0], out, pad)}`); return;
        case 'serial.writeNumber': push(`serial write number ${this.single(a[0], out, pad)}`); return;
        case 'serial.writeBuffer': push(`serial write buffer ${this.single(a[0], out, pad)}`); return;
        // I2C and SPI: MicroPython's i2c and spi modules.
        case 'pins.i2cWriteBuffer': push(`i2c write buffer ${this.single(a[1], out, pad)} to ${this.single(a[0], out, pad)}`); return;
        case 'pins.i2cWriteNumber':
            push(`i2c write ${this.numberFormat(a[2])} ${this.single(a[1], out, pad)} to ${this.single(a[0], out, pad)}`);
            return;
        case 'pins.spiWrite': {
            const sink = this.freshName('_spi');
            push(`set ${sink} to spi transfer ${this.operand(a[0])}`);
            return;
        }
        case 'pins.spiTransfer': push(`spi transfer buffer ${this.single(a[0], out, pad)} into ${this.single(a[1], out, pad)}`); return;
        case 'pins.spiFrequency': push(`spi frequency ${this.single(a[0], out, pad)}`); return;
        case 'pins.spiFormat': push(`spi format ${this.single(a[0], out, pad)} mode ${this.single(a[1], out, pad)}`); return;
        case 'pins.spiPins': push(`spi pins mosi ${this.pin(a[0]) || 'P15'} miso ${this.pin(a[1]) || 'P14'} sck ${this.pin(a[2]) || 'P13'}`); return;
        // The V2 log beyond log data.
        case 'datalogger.setColumnTitles': {
            const titles = a.slice(0, 3);
            if (!titles.length || a.length > 3) {
                push(this.note('datalogger.setColumnTitles() — the block names one to three columns'));
                return;
            }
            push(`set log columns ${titles.map(t => this.operand(t)).join(' and ')}`);
            return;
        }
        case 'datalogger.deleteLog': {
            const full = a[0] && a[0].type === 'Member' && a[0].name === 'Full';
            push(full ? 'delete log fully' : 'delete log');
            return;
        }
        case 'datalogger.mirrorToSerial': {
            const on = a[0] && a[0].type === 'Boolean' ? a[0].value : null;
            if (on === null) {
                push(this.note('datalogger.mirrorToSerial(<expression>) — the block takes on or off'));
                return;
            }
            push(`log mirror ${on ? 'on' : 'off'}`);
            return;
        }
        case 'datalogger.includeTimestamp': {
            const unit = a[0] && a[0].type === 'Member' ? a[0].name.toLowerCase() : '';
            if (!/^(none|milliseconds|seconds|minutes|hours|days)$/.test(unit)) {
                push(this.note('datalogger.includeTimestamp(<format>) — the block takes none, milliseconds, seconds, minutes, hours or days'));
                return;
            }
            push(`log timestamp ${unit}`);
            return;
        }
        case 'music.setVolume': push(`set speaker volume to ${this.operand(a[0])}`); return;
        case 'music.setBuiltInSpeakerEnabled': {
            const on = a[0] && a[0].type === 'Boolean' ? a[0].value : null;
            if (on === null) {
                push(this.note('music.setBuiltInSpeakerEnabled(<expression>) — the block takes on or off'));
                return;
            }
            push(`speaker ${on ? 'on' : 'off'}`);
            return;
        }
        case 'radio.sendNumber':
            push(`radio send number ${this.single(a[0], out, pad)}`);
            return;
        case 'radio.sendBuffer':
            push(`radio send buffer ${this.single(a[0], out, pad)}`);
            return;
        // The packet's JSON on the serial port. Its "t" is the packet's send
        // time in MakeCode; a MicroPython packet carries none, so the stamp is
        // the time it was RECEIVED.
        case 'radio.writeReceivedPacketToSerial':
            push('radio write received packet to serial');
            return;
        case 'game.showScore':
            push('show game score');
            return;
        // control.raiseEvent(source, value[, mode]): the mode is how MakeCode
        // queues it; the event is raised either way.
        case 'control.raiseEvent':
            push(`raise event ${this.eventNumber(a[0])} ${this.eventNumber(a[1])}`);
            return;
        // datalogger.log(createCV("a", 1), …): up to three name/value pairs.
        case 'datalogger.log': {
            const pairs = a.filter(x => x && x.type === 'Call' && this.path(x.callee) === 'datalogger.createCV');
            if (!a.length || pairs.length !== a.length || pairs.length > 3) {
                push(this.note('datalogger.log() — the block logs one to three datalogger.createCV("name", value) pairs'));
                return;
            }
            push(`log data ${pairs.map(p => `${this.operand(p.args[0])} = ${this.single(p.args[1], out, pad)}`).join(' and ')}`);
            return;
        }
        // The number goes; the NAME cannot — the radio blocks send a number or
        // a text, not a pair. Said, rather than sending the bare number as if
        // that were the same packet.
        // radio.sendValue(name, value): the pair goes out together; the name is
        // cut to 8 characters when it is sent (MakeCode's packet has 8 bytes of it).
        case 'radio.sendValue':
            push(`radio send value ${this.operand(a[0])} = ${this.single(a[1], out, pad)}`);
            return;
        // bluetooth.*: kept as a call with its name and up to four arguments.
        // Calls with a function (the connected/disconnected/uart handlers) are
        // hats, below.
        case 'bluetooth.startUartService': case 'bluetooth.startAccelerometerService': case 'bluetooth.startButtonService':
        case 'bluetooth.startIOPinService': case 'bluetooth.startLEDService': case 'bluetooth.startTemperatureService':
        case 'bluetooth.startMagnetometerService': case 'bluetooth.uartWriteString': case 'bluetooth.uartWriteLine':
        case 'bluetooth.uartWriteNumber': case 'bluetooth.uartWriteValue': case 'bluetooth.advertiseUrl':
        case 'bluetooth.advertiseUid': case 'bluetooth.setTransmitPower': case 'bluetooth.stopAdvertising': {
            if (a.length > 4) {
                push(this.note(`${name}() — the bluetooth block takes up to four arguments`));
                return;
            }
            push(`bluetooth call ${name.slice('bluetooth.'.length)}${a.map(x => ' ' + this.operand(x)).join('')}`);
            return;
        }
        case 'radio.sendString': {
            const literal = this.literalString(a[0]);
            if (literal === null) {
                push(this.note('radio.sendString(<expression>) — the radio text block takes a literal'));
                return;
            }
            push(`radio send text ${JSON.stringify(literal)}`);
            return;
        }

        // ── structure ──────────────────────────────────────────────
        case 'basic.forever':
            push('FOREVER:');
            this.block(bodyOf(a[0]), indent + 1, out);
            return;
        case 'control.inBackground': case 'control.runInBackground': case 'control.runInParallel':
            this.block(bodyOf(a[0]), indent, out);
            return;
        // radio.on(): the radio at the group and power the program set (MakeCode's defaults: group 0).
        case 'radio.on': {
            const line = `${pad}radio on group ${this.radioGroup || '0'} power ${this.radioPower || '6'}`;
            const last = this.radioLine;
            if (last && last.out === out && last.index === out.length - 1 && last.pad === pad) out[last.index] = line;
            else out.push(line);
            this.radioLine = {out, index: out.length - 1, pad};
            return;
        }
        // MicroPython's serial console is the USB port at its fixed rate with its own buffers: these have
        // nothing to set, and are said so in a comment rather than refused.
        case 'serial.redirectToUSB': case 'serial.setRxBufferSize': case 'serial.setTxBufferSize':
        case 'serial.setWriteLinePadding':
            push(`# ${name} — MicroPython's serial console is the USB port; nothing to set`);
            return;
        // plotAll lights all 25: the same as showing a full grid.
        case 'led.plotAll':
            push('show leds 99999:99999:99999:99999:99999');
            return;

        case 'motors.dualMotorPower': {
            // A Calliope project keeps its motors; on the micro:bit the call
            // is named and refused as before (below).
            const which = a[0] && a[0].type === 'Member' ? a[0].name : null;
            const motors = {A: ['A'], B: ['B'], AB: ['A', 'B']}[which];
            if (this.board === 'calliopemini' && motors && a[1]) {
                const power = this.single(a[1], out, pad);
                for (const m of motors) push(`calliope motor ${m} power ${power} %`);
                return;
            }
            push(this.note(`${name}() — ${CALLIOPE_ONLY[name]}`));
            return;
        }

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
export const MAKECODE_NAMESPACES = new Set(['basic', 'input', 'led', 'music', 'radio', 'pins', 'game', 'images', 'serial',
    'control', 'Math', 'bluetooth', 'datalogger', 'servos', 'power', 'loops', 'logic', 'text', 'console']);

/** MakeCode's Image methods (pxt-microbit 9.1.1 libs/core/images.cpp). */
const IMAGE_METHODS = new Set(['setPixel', 'pixel', 'showImage', 'plotImage', 'scrollImage', 'clear',
    'setPixelBrightness', 'pixelBrightness', 'width', 'height', 'plotFrame', 'showFrame']);

/**
 * MakeCode calls with NO MicroPython counterpart at all — refused with the
 * reason, because "unsupported" alone reads like a gap someone forgot.
 */
const NO_MICROPYTHON = {};

/** MakeCode's EventBusSource and EventBusValue members and their numbers (pxt-microbit 9.1.1 enums.d.ts). */
const EVENT_BUS_SOURCE = {
    MICROBIT_ID_BUTTON_A: 1, MICROBIT_ID_BUTTON_B: 2, MICROBIT_ID_BUTTON_AB: 3, MICROBIT_ID_RADIO: 9, MICROBIT_ID_GESTURE: 13,
    MICROBIT_ID_ACCELEROMETER: 5, MICROBIT_ID_IO_P0: 100, MICROBIT_ID_IO_P1: 101, MICROBIT_ID_IO_P2: 102, MICROBIT_ID_IO_P3: 103,
    MICROBIT_ID_IO_P4: 104, MICROBIT_ID_IO_P5: 105, MICROBIT_ID_IO_P6: 106, MICROBIT_ID_IO_P7: 107, MICROBIT_ID_IO_P8: 108,
    MICROBIT_ID_IO_P9: 109, MICROBIT_ID_IO_P10: 110, MICROBIT_ID_IO_P11: 111, MICROBIT_ID_IO_P12: 112, MICROBIT_ID_IO_P13: 113,
    MICROBIT_ID_IO_P14: 114, MICROBIT_ID_IO_P15: 115, MICROBIT_ID_IO_P16: 116, MICROBIT_ID_IO_P19: 119, MICROBIT_ID_IO_P20: 120,
    MES_DEVICE_INFO_ID: 1103, MES_SIGNAL_STRENGTH_ID: 1101, MES_DPAD_CONTROLLER_ID: 1104, MES_BROADCAST_GENERAL_ID: 2000
};
const EVENT_BUS_VALUE = {
    MICROBIT_EVT_ANY: 0, MICROBIT_BUTTON_EVT_DOWN: 1, MICROBIT_BUTTON_EVT_UP: 2, MICROBIT_BUTTON_EVT_CLICK: 3,
    MICROBIT_BUTTON_EVT_LONG_CLICK: 4,
    MICROBIT_RADIO_EVT_DATAGRAM: 1, MICROBIT_ACCELEROMETER_EVT_DATA_UPDATE: 1, MICROBIT_PIN_EVT_RISE: 2, MICROBIT_PIN_EVT_FALL: 3,
    MICROBIT_PIN_EVT_PULSE_HI: 4, MICROBIT_PIN_EVT_PULSE_LO: 5, MES_ALERT_EVT_ALARM1: 6, MES_ALERT_EVT_ALARM2: 7,
    MES_ALERT_EVT_ALARM3: 8, MES_ALERT_EVT_ALARM4: 9, MES_ALERT_EVT_ALARM5: 10, MES_ALERT_EVT_ALARM6: 11,
    MES_ALERT_EVT_DISPLAY_TOAST: 1, MES_ALERT_EVT_FIND_MY_PHONE: 5, MES_ALERT_EVT_PLAY_RINGTONE: 4, MES_ALERT_EVT_PLAY_SOUND: 3,
    MES_ALERT_EVT_VIBRATE: 2, MES_CAMERA_EVT_LAUNCH_PHOTO_MODE: 1, MES_CAMERA_EVT_LAUNCH_VIDEO_MODE: 2,
    MES_CAMERA_EVT_START_VIDEO_CAPTURE: 4, MES_CAMERA_EVT_STOP_PHOTO_MODE: 6, MES_CAMERA_EVT_STOP_VIDEO_CAPTURE: 5,
    MES_CAMERA_EVT_STOP_VIDEO_MODE: 7, MES_CAMERA_EVT_TAKE_PHOTO: 3, MES_CAMERA_EVT_TOGGLE_FRONT_REAR: 8, MES_DEVICE_DISPLAY_OFF: 5,
    MES_DEVICE_DISPLAY_ON: 6, MES_DEVICE_GESTURE_DEVICE_SHAKEN: 4, MES_DEVICE_INCOMING_CALL: 7, MES_DEVICE_INCOMING_MESSAGE: 8,
    MES_DEVICE_ORIENTATION_LANDSCAPE: 1, MES_DEVICE_ORIENTATION_PORTRAIT: 2, MES_DPAD_BUTTON_1_DOWN: 9, MES_DPAD_BUTTON_1_UP: 10,
    MES_DPAD_BUTTON_2_DOWN: 11, MES_DPAD_BUTTON_2_UP: 12, MES_DPAD_BUTTON_3_DOWN: 13, MES_DPAD_BUTTON_3_UP: 14,
    MES_DPAD_BUTTON_4_DOWN: 15, MES_DPAD_BUTTON_4_UP: 16, MES_DPAD_BUTTON_A_DOWN: 1, MES_DPAD_BUTTON_A_UP: 2,
    MES_DPAD_BUTTON_B_DOWN: 3, MES_DPAD_BUTTON_B_UP: 4, MES_DPAD_BUTTON_C_DOWN: 5, MES_DPAD_BUTTON_C_UP: 6,
    MES_DPAD_BUTTON_D_DOWN: 7, MES_DPAD_BUTTON_D_UP: 8, MES_REMOTE_CONTROL_EVT_FORWARD: 6, MES_REMOTE_CONTROL_EVT_NEXTTRACK: 4,
    MES_REMOTE_CONTROL_EVT_PAUSE: 2, MES_REMOTE_CONTROL_EVT_PLAY: 1, MES_REMOTE_CONTROL_EVT_PREVTRACK: 5,
    MES_REMOTE_CONTROL_EVT_REWIND: 7, MES_REMOTE_CONTROL_EVT_STOP: 3, MES_REMOTE_CONTROL_EVT_VOLUMEDOWN: 9,
    MES_REMOTE_CONTROL_EVT_VOLUMEUP: 8
};

/** Buffer-making calls (their results are Buffers). */
const BUFFER_MAKERS = new Set(['control.createBuffer', 'pins.createBuffer', 'control.createBufferFromUTF8', 'radio.receivedBuffer']);

/** A legacy radio Packet's properties (radio.onDataPacketReceived) in our spelling. */
const PACKET_PROPERTIES = {
    receivedNumber: 'read last radio number', receivedString: 'read last radio text', receivedBuffer: 'read last radio buffer',
    signal: 'last radio signal strength', serial: 'last radio serial number', time: 'read last radio time'
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
    'input.onShake': () => () => ({test: 'shake happening', release: null}),
    'input.onScreenUp': () => () => ({test: 'face up happening', release: null}),
    'input.onScreenDown': () => () => ({test: 'face down happening', release: null}),
    'input.onLogoUp': () => () => ({test: 'tilt up happening', release: null}),
    'input.onLogoDown': () => () => ({test: 'tilt down happening', release: null}),
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
    // control.onEvent(source, value, body) for the sources the board itself raises (CODAL's ids and
    // values, pxt-microbit enums.d.ts): the buttons (1 A, 2 B, 3 A+B: DOWN 1 at the press, UP 2 and
    // CLICK 3 at the release, LONG_CLICK 4 when held over a second), gestures (13: the value is the
    // gesture), and pins (100+n: touch events on P0-P2, RISE 2 / FALL 3 elsewhere). The event bus is
    // POLLED here, like the other handlers. Any other source is a user's own, a hat for control.raiseEvent.
    'control.onEvent': translator => a => {
        const source = Number(translator.eventNumber(a[0]));
        // A gesture's value is the Gesture member itself (Gesture.Shake is 11).
        const gestureMember = a[1] && a[1].type === 'Member' && a[1].object && a[1].object.name === 'Gesture' ? ENUM_VALUES.Gesture[a[1].name] : null;
        const value = gestureMember ? {'shake': 11, 'tilt up': 1, 'tilt down': 2, 'face up': 5, 'face down': 6, 'tilt left': 3,
            'tilt right': 4, 'freefall': 7, '3g': 8, '6g': 9, '8g': 10}[gestureMember] : Number(translator.eventNumber(a[1]));
        if (!Number.isFinite(source) || !Number.isFinite(value)) return {fallthrough: true};
        if (source >= 1 && source <= 3) {
            const held = source === 3 ? '(read button_a) and (read button_b)' : `read button_${source === 1 ? 'a' : 'b'}`;
            if (value === 1) return {test: held, release: held};
            if (value === 2) return {test: held, wait: `not (${held})`};
            if (value === 3 || value === 4) {
                const at = translator.freshName('_held');
                return {test: held, start: `set ${at} to timer`, wait: `not (${held})`,
                    guard: value === 3 ? `(timer - ${at}) < 1` : `not ((timer - ${at}) < 1)`};
            }
            return {fallthrough: true};
        }
        if (source === 13) {
            const gesture = {11: 'shake', 1: 'tilt up', 2: 'tilt down', 5: 'face up', 6: 'face down', 3: 'tilt left', 4: 'tilt right',
                7: 'freefall', 8: '3g', 9: '6g', 10: '8g'}[value];
            return gesture ? {test: `${gesture} happening`, release: null} : {fallthrough: true};
        }
        if (source >= 100 && source <= 120) {
            const pin = `P${source - 100}`;
            const touch = source <= 102;
            if (touch && value === 1) return {test: `pin ${pin} touched`, release: `pin ${pin} touched`};
            if (touch && (value === 2 || value === 3)) return {test: `pin ${pin} touched`, wait: `not (pin ${pin} touched)`};
            if (value === 2) return {test: `pin ${pin} digital = 1`, release: `pin ${pin} digital = 1`};
            if (value === 3) return {test: `pin ${pin} digital = 1`, wait: `pin ${pin} digital = 0`};
        }
        return {fallthrough: true};
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
 * The shape the export writes for a radio packet hat (export.js): a function
 * `onRadioPacket` and, for each kind of packet, a handler that calls it first.
 * It is read back as the packet hat it came from.
 */
function liftPacketHandlers (ast) {
    const KINDS = /^radio\.onReceived(Number|String|Value|Buffer)$/;
    const calls = name => st => st && st.type === 'ExpressionStatement' && st.expr && st.expr.type === 'Call' &&
        st.expr.callee && st.expr.callee.type === 'Identifier' && st.expr.callee.name === name && !(st.expr.args || []).length;
    const handlerOf = st => {
        if (!st || st.type !== 'ExpressionStatement' || !st.expr || st.expr.type !== 'Call' || !st.expr.callee || st.expr.callee.type !== 'Member') return null;
        const c = st.expr.callee;
        return c.object && c.object.name === 'radio' && KINDS.test(`radio.${c.name}`) ? st.expr : null;
    };
    for (const fn of ast.body.filter(st => st.type === 'FunctionDeclaration' && /^onRadioPacket\d*$/.test(st.name))) {
        const handlers = ast.body.map(handlerOf).filter(Boolean);
        const mine = handlers.filter(h => {
            const body = h.args[h.args.length - 1].body || [];
            return body.length && calls(fn.name)(body[0]);
        });
        // All four kinds must call it, or it is the author's own function.
        if (mine.length < 4) continue;
        for (const h of mine) h.args[h.args.length - 1].body.shift();
        ast.body = ast.body.filter(st => {
            const h = handlerOf(st);
            return !(h && mine.includes(h) && !(h.args[h.args.length - 1].body || []).length);
        });
        const at = ast.body.indexOf(fn);
        ast.body[at] = {type: 'ExpressionStatement', expr: {type: 'Call',
            callee: {type: 'Member', object: {type: 'Identifier', name: 'radio'}, name: 'onDataPacketReceived'},
            args: [{type: 'FunctionExpression', params: [], paramTypes: {}, optionalParams: [], body: fn.body}]}};
    }
}

/**
 * Translate a MakeCode micro:bit project.
 *
 * @param {string} source the project's main.ts
 * @param {object} [opts]
 * @param {string} [opts.name] used only in the header comment
 * @returns {{code: string, unsupported: Array<string>, scripts: number}}
 */
export function microbitToPseudocode (source, opts = {}) {
    let ast = parseMakeCodeTs(source, {lowerHeritage: true});
    // Extension sources (vendored or fetched) the program uses are translated
    // with it: their namespaces become procedures, so `turtle.forward(1)` is a
    // call to one rather than an unsupported line.
    const extensionDiagnostics = [];
    if (Array.isArray(opts.extensionSources) && opts.extensionSources.length) {
        const merged = {...ast, body: [...opts.extensionSources.flatMap(e => parseMakeCodeTs(e.source).body), ...ast.body]};
        const lowered = lowerNamespaceBindings(merged);
        if (lowered.program) ast = lowered.program;
        else extensionDiagnostics.push(...lowered.unsupported.map(e => `extension source: ${e}`));
    }
    liftPacketHandlers(ast);
    // Arrays held in class fields and functions held as values (lower-handle-values.js).
    lowerHandleValues(ast, parseMakeCodeTs);
    const t = new MicrobitTranslator();
    t.board = opts.board || null;
    t.aliases = new Map();
    // Before anything is emitted: a variable this program has to be
    // renamed must not land on a name the program already uses.
    t.claimNames(ast);
    t.claimSprites(ast);
    t.claimBuffers(ast);
    // buf[i] reads and buf[i] = v writes are getUint8 / setUint8 (a buffer is bytes).
    {
        const rewrite = node => {
            if (!node || typeof node !== 'object') return node;
            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) node[i] = rewrite(node[i]);
                return node;
            }
            const store = node.type === 'Assignment' && node.left.type === 'Index' && t.isBuffer(node.left.object);
            for (const key of Object.keys(node)) {
                const v = node[key];
                if (store && key === 'left') {
                    v.object = rewrite(v.object);
                    v.index = rewrite(v.index);
                } else if (v && typeof v === 'object') node[key] = rewrite(v);
            }
            if (store && node.op === '=') {
                return {type: 'Call', callee: {type: 'Member', object: node.left.object, name: 'setUint8'}, args: [node.left.index, node.right]};
            }
            if (store) {
                const read = {type: 'Call', callee: {type: 'Member', object: node.left.object, name: 'getUint8'}, args: [node.left.index]};
                return {type: 'Call', callee: {type: 'Member', object: node.left.object, name: 'setUint8'},
                    args: [node.left.index, {type: 'Binary', op: node.op.slice(0, -1), left: read, right: node.right}]};
            }
            if (node.type === 'Index' && t.isBuffer(node.object)) {
                return {type: 'Call', callee: {type: 'Member', object: node.object, name: 'getUint8'}, args: [node.index]};
            }
            return node;
        };
        if (t.bufferNames.size || t.bufferArrays.size) rewrite(ast.body);
    }
    // Classes, interfaces and object literals, lowered to parallel arrays
    // (translate-base.js, records). Before the functions are listed: a
    // class's methods become procedures of their own.
    t.claimRecords(ast);
    // A hat that comes BEFORE a top-level array's declaration reads it all the same (a library's handler written
    // above the arrays it uses, which is also the order the export writes them in): the arrays are known up front.
    for (const st of ast.body) {
        if (st.type !== 'Declaration') continue;
        for (const d of st.decls || []) {
            if (d.isArray || (d.init && d.init.type === 'Array') || /\[\]$|^Array</.test(String(d.typeName || '').replace(/\s+/g, ''))) t.arrays.add(d.name);
        }
    }
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

        const polled = callName && HANDLERS[callName] ? HANDLERS[callName](t)(call.args) : null;
        if (polled && !polled.fallthrough) {
            const shape = polled;
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

        // loops.everyInterval(ms, body): a timed hat; the body runs, then the
        // rest of the interval is waited.
        if (callName === 'loops.everyInterval') {
            const body = t.leavable(bodyOf(call.args[call.args.length - 1]), 'everyInterval');
            const lines = [`WHEN every ${t.operand(call.args[0])} ms:`];
            t.block(body, 1, lines);
            scripts.push(lines);
            continue;
        }

        // bluetooth.onBluetoothConnected / onBluetoothDisconnected / onUartDataReceived:
        // hats that never fire in the simulator, as in MakeCode's own.
        if (callName === 'bluetooth.onBluetoothConnected' || callName === 'bluetooth.onBluetoothDisconnected' ||
            callName === 'bluetooth.onUartDataReceived') {
            const uart = callName === 'bluetooth.onUartDataReceived';
            const body = t.leavable(bodyOf(call.args[call.args.length - 1]), callName.split('.').pop());
            const lines = [uart ? `WHEN bluetooth uart receives ${t.delimiterWord(call.args[0])}:` :
                `WHEN micro:bit ${callName.endsWith('Connected') ? 'connected' : 'disconnected'}:`];
            t.block(body, 1, lines);
            scripts.push(lines);
            continue;
        }

        // radio.onReceivedBuffer((buffer) => ...) and the legacy
        // radio.onDataPacketReceived((packet) => ...) (or its destructured form):
        // hats, as the other radio handlers.
        if (callName === 'radio.onReceivedBuffer' || callName === 'radio.onDataPacketReceived') {
            const fn = call.args[call.args.length - 1];
            const params = (fn && fn.params) || [];
            const buffer = callName === 'radio.onReceivedBuffer';
            const lines = [buffer ? 'WHEN radio receives buffer:' : 'WHEN radio receives packet:'];
            const bound = [];
            if (buffer && params[0]) {
                bound.push([params[0], 'read last radio buffer']);
            } else if (!buffer && params.length && (params.length > 1 || PACKET_PROPERTIES[params[0]])) {
                // `({receivedNumber, signal}) => …`: each name is that property.
                for (const p of params) {
                    if (PACKET_PROPERTIES[p]) bound.push([p, PACKET_PROPERTIES[p]]);
                }
            } else if (!buffer && params[0]) {
                t.packetParams = new Set([params[0]]);
            }
            for (const [param, reporter] of bound) {
                if (writes(bodyOf(fn), param)) lines.push(`  set ${t.varName(param)} to ${reporter}`);
                else t.aliases.set(param, reporter);
            }
            t.returnable = {result: null};
            t.block(bodyOf(fn), 1, lines);
            t.returnable = null;
            bound.forEach(([param]) => t.aliases.delete(param));
            t.packetParams = null;
            scripts.push(lines);
            continue;
        }

        // control.onEvent(source, value, body): a hat on the event bus. The
        // body reads the event's value as control.eventValue().
        if (callName === 'control.onEvent') {
            const fn = call.args[call.args.length - 1];
            const lines = [`WHEN event ${t.eventNumber(call.args[0])} ${t.eventNumber(call.args[1])}:`];
            t.returnable = {result: null};
            t.block(bodyOf(fn), 1, lines);
            t.returnable = null;
            scripts.push(lines);
            continue;
        }

        // radio.onReceivedValue((name, value) => ...): a hat, as the other radio handlers.
        if (callName === 'radio.onReceivedValue') {
            const fn = call.args[call.args.length - 1];
            const params = (fn && fn.params) || [];
            const lines = ['WHEN radio receives name and value:'];
            const aliasOf = ['read last radio name', 'read last radio value'];
            params.slice(0, 2).forEach((param, i) => {
                if (writes(bodyOf(fn), param)) lines.push(`  set ${t.varName(param)} to ${aliasOf[i]}`);
                else t.aliases.set(param, aliasOf[i]);
            });
            t.returnable = {result: null};
            t.block(bodyOf(fn), 1, lines);
            t.returnable = null;
            params.slice(0, 2).forEach(param => t.aliases.delete(param));
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

    // A Calliope project stays a Calliope project: its motor words have no
    // meaning on the micro:bit, and MakeCode compiles it for its own board.
    const out = [opts.board === 'calliopemini' ? 'DEVICE CALLIOPEMINI' : 'DEVICE MICROBIT', ''];
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

    // Top-level code that translated to nothing but "unsupported" notes would be an empty hat:
    // the exporter writes no code for it, so it would vanish on the way back. Keep the notes as
    // plain comments and write the hat only when it holds something that runs.
    const mainRuns = main.some(line => !/^\s*#/.test(line));
    if (main.length && (mainRuns || !scripts.length)) {
        out.push('WHEN flag clicked:', ...main, '');
    } else if (main.length) {
        out.push(...main.map(line => line.trim()), '');
    }
    for (const script of scripts) out.push(...script, '');
    out.push(...defines);

    // Nothing at all ran: better an empty hat than a file with no script.
    if (!main.length && !scripts.length) out.push('WHEN flag clicked:', '  # (nothing translatable in this project)', '');

    return {
        code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set([...extensionDiagnostics, ...t.unsupported])],
        scripts: scripts.length + (main.length ? 1 : 0)
    };
}

export default microbitToPseudocode;
