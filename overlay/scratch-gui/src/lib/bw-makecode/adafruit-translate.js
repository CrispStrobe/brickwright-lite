/**
 * Pinned MakeCode Circuit Playground Express -> DEVICE CPX.
 *
 * The vocabulary is the existing cpxDialect.js table, not a second device
 * implementation. CPX event hats retain the device world's input dispatch;
 * unsupported APIs and calls hidden inside refused constructs stay named.
 * Enum spellings follow pxt-adafruit 1.6.8 (MIT, Microsoft Corporation).
 * Firmware, external strips, storage, networking and HID are not simulated here.
 */
import {parseMakeCodeTs} from './ts-import.js';
import {BaseTranslator, bodyOf, num} from './translate-base.js';

const lowerFirst = s => s.charAt(0).toLowerCase() + s.slice(1);
const BUTTONS = {buttonA: 'A', buttonB: 'B', buttonsAB: 'A+B'};
const EVENTS = {Click: 'click', LongClick: 'longClick', Up: 'up', Down: 'down'};
const GESTURES = Object.fromEntries(['Shake', 'TiltUp', 'TiltDown', 'TiltLeft', 'TiltRight',
    'FaceUp', 'FaceDown', 'FreeFall', 'TwoG', 'ThreeG', 'SixG', 'EightG'].map(n => [n, lowerFirst(n)]));
const ANIMATIONS = Object.fromEntries(['rainbow', 'runningLights', 'comet', 'sparkle', 'theaterChase', 'colorWipe']
    .map(n => [`${n}Animation`, n]));
const SOUNDS = Object.fromEntries(['PowerUp', 'PowerDown', 'JumpUp', 'JumpDown', 'BaDing', 'Wawawawaa',
    'MagicWand', 'Siren'].map(n => [n, lowerFirst(n)]));
// This target has music.pewPew as a Melody, but no Sounds.PewPew enum member.
const MELODIES = [...Object.values(SOUNDS), 'pewPew'];
const BEATS = Object.fromEntries(['Whole', 'Half', 'Quarter', 'Eighth', 'Sixteenth', 'Double', 'Breve']
    .map(n => [n, n.toLowerCase()]));
const COLORS = {Red: 0xff0000, Orange: 0xffa500, Yellow: 0xffff00, Green: 0x00ff00, Blue: 0x0000ff,
    Indigo: 0x4b0082, Violet: 0x8a2be2, Purple: 0xff00ff, Pink: 0xff007f, White: 0xffffff, Black: 0};
const NOTES = /^(C|CSharp|D|Eb|E|F|FSharp|G|GSharp|A|Bb|B)(3|4|5)?$/;

const REFUSED = {
    light: 'external strips, photon and strip configuration have no CPX device word',
    input: 'this input operation has no CPX device word',
    music: 'this sound operation has no CPX device word',
    network: 'IR and cable networking have no CPX device word',
    keyboard: 'USB HID is not a CPX device-world service',
    mouse: 'USB HID is not a CPX device-world service',
    gamepad: 'USB HID is not a CPX device-world service',
    storage: 'persistent storage has no CPX device word',
    datalogger: 'data logging has no CPX device word',
    settings: 'persistent settings have no CPX device word',
    pins: 'raw pin, I2C, SPI and pulse APIs are not CPX device-world words',
    servos: 'external servos have no CPX device word',
    control: 'this runtime/event-bus operation has no CPX device word'
};
const NON_YIELDING = new Set([
    'light.setAll', 'light.setBrightness', 'light.setPixelColor', 'light.setGradient', 'light.graph',
    'light.clear', 'light.stopAllAnimations', 'light.rgb', 'light.hsv', 'light.fade', 'light.colors', 'light.pixelColor',
    'input.switchRight', 'input.lightLevel', 'input.soundLevel', 'input.temperature', 'input.acceleration', 'input.rotation',
    'input.setLightThreshold', 'input.setLoudSoundThreshold', 'music.setTempo', 'music.changeTempoBy', 'music.setVolume',
    'music.stopAllSounds', 'music.tempo', 'music.beat', 'music.noteFrequency', 'music.sounds', 'control.millis', 'randint'
]);

function walk (node, visit) {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const value of Object.values(node)) {
        if (Array.isArray(value)) value.forEach(n => walk(n, visit));
        else if (value && typeof value === 'object') walk(value, visit);
    }
}

class AdafruitTranslator extends BaseTranslator {
    constructor (ast) {
        super();
        this.aliases = new Map();
        this.visitedCalls = new WeakSet();
        this.shadowed = new Set();
        walk(ast, n => {
            if (n.type === 'Declaration') for (const d of n.decls) this.shadowed.add(d.name);
            if (n.type === 'FunctionDeclaration') this.shadowed.add(n.name);
            if (['FunctionDeclaration', 'FunctionExpression', 'Arrow'].includes(n.type)) {
                for (const p of n.params || []) this.shadowed.add(p);
            }
        });
    }

    note (what, line) {
        const text = String(what).replace(/[\r\n]/g, ' ');
        return super.note(text.includes(' — ') ? text : `${text} — no CPX translation for this construct`, line);
    }

    member (node, owner, values, fallback = null) {
        if (!node) return fallback;
        node = this.resolveConst(node);
        if (node.type === 'Member' && this.path(node.object) === owner && !this.shadowed.has(owner)) {
            return Object.hasOwn(values, node.name) ? values[node.name] : null;
        }
        return null;
    }

    enumToken (node) {
        const color = this.member(node, 'Colors', COLORS);
        return color === null ? super.enumToken(node) : String(color);
    }

    expr (node) {
        const n = node && this.resolveConst(node);
        if (n && n.type === 'Member' && this.path(n.object) === 'Note' &&
            !this.shadowed.has('Note') && NOTES.test(n.name)) return `cpx note ${n.name}`;
        return super.expr(node);
    }

    animation (node) {
        let picker = null;
        if (node && node.type === 'Call' && this.path(node.callee) === 'light._animationPicker') {
            picker = node;
            node = node.args[0];
        }
        const animation = this.member(node, 'light', ANIMATIONS);
        if (picker && animation) this.visitedCalls.add(picker);
        return animation;
    }

    sound (node) {
        if (!node || node.type !== 'Call' || this.path(node.callee) !== 'music.sounds' || this.shadowed.has('music')) return null;
        const sound = this.member(node.args[0], 'Sounds', SOUNDS);
        if (sound) this.visitedCalls.add(node);
        return sound;
    }

    refuse (node, reason) {
        return this.note(`${this.path(node.callee) || 'dynamic call'}() — ${reason}`);
    }

    reason (node) {
        const name = this.path(node.callee) || '';
        const root = name.split('.')[0];
        return this.shadowed.has(root) ? `the ${root} binding is declared by this program, not the target API`
            : /^input\..*\.onEvent$|^input\.on/.test(name) ? 'only statically declared top-level CPX event handlers are translated'
            : REFUSED[root] || 'no CPX translation for this operation';
    }

    callbackBody (node) {
        if (node && node.type === 'FunctionExpression' && !(node.params || []).length) return bodyOf(node);
        const matches = node && node.type === 'Identifier' ? this.functions.filter(f => f.source === node.name) : [];
        if (matches.length === 1 && !(matches[0].params || []).length) {
            return [{type: 'ExpressionStatement', expr: {type: 'Call', callee: node, args: []}}];
        }
        return null;
    }

    mayYield (statement) {
        let result = false;
        walk(statement, node => {
            if (['For', 'While', 'ForOf', 'DoWhile', 'New'].includes(node.type)) result = true;
            if (node.type === 'Call') {
                const name = this.path(node.callee) || '';
                if (!NON_YIELDING.has(name) && !name.startsWith('Math.')) result = true;
            }
        });
        return result;
    }

    statementInner (st, indent, out) {
        // An expression-bodied callback returns the command's void value.
        // Returning from the generated handler procedure still executes it.
        if (st.type === 'Return' && st.value && st.value.type === 'Call' && this.returnable && !this.returnable.result) {
            this.command(st.value, indent, out);
            out.push(`${'  '.repeat(indent)}stop this script`);
            return;
        }
        super.statementInner(st, indent, out);
    }

    callExpression (node) {
        this.visitedCalls.add(node);
        const name = this.path(node.callee);
        const a = node.args || [];
        const value = (i, fallback) => a[i] ? this.operand(a[i]) : String(fallback);
        if (name && this.shadowed.has(name.split('.')[0]) && REFUSED[name.split('.')[0]]) {
            this.refuse(node, this.reason(node));
            return '0';
        }
        const button = /^input\.(buttonA|buttonB|buttonsAB)\.(isPressed|wasPressed)$/.exec(name || '');
        if (button) return `cpx button ${BUTTONS[button[1]]} ${button[2] === 'isPressed' ? 'is' : 'was'} pressed`;
        const touch = /^input\.pin(A[1-7])\.isPressed$/.exec(name || '');
        if (touch) return `cpx touch ${touch[1]} is pressed`;
        switch (name) {
        case 'light.colors': return this.expr(a[0]);
        case 'light.rgb': return `cpx red ${value(0, 0)} green ${value(1, 0)} blue ${value(2, 0)}`;
        case 'light.hsv': return `cpx hue ${value(0, 0)} sat ${value(1, 255)} val ${value(2, 255)}`;
        case 'light.fade': return `cpx fade ${value(0, 0)} by ${value(1, 0)}`;
        case 'light.pixelColor': return `cpx pixel color at ${value(0, 0)}`;
        case 'input.switchRight': return 'cpx switch right';
        case 'input.lightLevel': return 'cpx light level';
        case 'input.soundLevel': return 'cpx sound level';
        case 'input.temperature': {
            const unit = this.member(a[0], 'TemperatureUnit', {Celsius: 'C', Fahrenheit: 'F'}, 'C');
            if (unit) return `cpx temperature in ${unit}`;
            break;
        }
        case 'input.acceleration': {
            const axis = this.member(a[0], 'Dimension', {X: 'x', Y: 'y', Z: 'z', Strength: 'strength'});
            if (axis) return `cpx acceleration ${axis}`;
            break;
        }
        case 'input.rotation': {
            const axis = this.member(a[0], 'Rotation', {Pitch: 'pitch', Roll: 'roll'});
            if (axis) return `cpx rotation ${axis}`;
            break;
        }
        case 'music.noteFrequency': return this.expr(a[0]);
        case 'music.tempo': return 'cpx tempo';
        case 'music.beat': {
            const beat = this.member(a[0], 'BeatFraction', BEATS, 'whole');
            if (beat) return `cpx ${beat} beat`;
            break;
        }
        case 'control.millis': return 'timer * 1000';
        default:
            if (!REFUSED[(name || '').split('.')[0]]) return super.callExpression(node);
        }
        this.refuse(node, this.reason(node));
        return '0';
    }

    isBooleanValue (value) {
        return super.isBooleanValue(value) || /^cpx (button|touch) .+ (is|was) pressed$|^cpx switch right$/.test(value);
    }

    command (node, indent, out) {
        this.visitedCalls.add(node);
        const name = this.path(node.callee);
        const a = node.args || [];
        const push = s => out.push(`${'  '.repeat(indent)}${s}`);
        const value = (i, fallback) => a[i] ? this.operand(a[i]) : String(fallback);
        if (name && this.shadowed.has(name.split('.')[0]) && REFUSED[name.split('.')[0]]) {
            push(this.refuse(node, this.reason(node)));
            return;
        }
        const templates = {
            'light.setAll': () => `set all pixels to ${value(0, 0)}`,
            'light.setBrightness': () => `set pixel brightness to ${value(0, 0)}`,
            'light.setPixelColor': () => `set pixel ${value(0, 0)} to ${value(1, 0)}`,
            'light.setGradient': () => `set gradient from ${value(0, 0)} to ${value(1, 0)}`,
            'light.graph': () => `graph ${value(0, 0)} up to ${value(1, 0)}`,
            'light.showRing': () => `show ring ${value(0, '""')}`,
            'light.clear': () => 'clear pixels',
            'light.stopAllAnimations': () => 'stop all animations',
            'music.playTone': () => `play tone ${value(0, 0)} Hz for ${value(1, 0)} ms`,
            'music.ringTone': () => `ring tone ${value(0, 0)} Hz`,
            'music.rest': () => `rest for ${value(0, 0)} ms`,
            'music.setTempo': () => `set tempo to ${value(0, 120)} bpm`,
            'music.changeTempoBy': () => `change tempo by ${value(0, 0)} bpm`,
            'music.setVolume': () => `set board volume to ${value(0, 0)}`,
            'music.stopAllSounds': () => 'stop all board sounds',
            'input.setLoudSoundThreshold': () => `set loud sound threshold to ${value(0, 0)}`
        };
        if (Object.hasOwn(templates, name)) { push(templates[name]()); return; }
        if (['pause', 'loops.pause'].includes(name)) {
            push(`wait ${a[0] && a[0].type === 'Number' ? num(Number(a[0].value) / 1000) : `(${value(0, 0)} / 1000)`} seconds`);
            return;
        }
        if (['forever', 'loops.forever'].includes(name)) {
            const body = this.callbackBody(a[0]);
            if (!body) { push(this.refuse(node, 'the callback must be a statically declared zero-argument function')); return; }
            push('FOREVER:');
            this.block(this.leavable(body, 'forever'), indent + 1, out);
            return;
        }
        if (name === 'light.showAnimation' || name === 'light.showAnimationFrame') {
            const animation = this.animation(a[0]);
            if (animation) {
                push(name.endsWith('Frame') ? `show frame of animation ${animation}`
                    : `show animation ${animation} for ${value(1, 0)} ms`);
                return;
            }
        }
        if (name === 'music.playSound' || name === 'music.playSoundUntilDone') {
            const sound = this.sound(a[0]);
            if (sound) { push(`play board sound ${sound}${name.endsWith('UntilDone') ? ' until done' : ''}`); return; }
        }
        const melody = /^music\.(\w+)\.(play|playUntilDone)$/.exec(name || '');
        if (melody && MELODIES.includes(melody[1]) && !a.length) {
            push(`play board sound ${melody[1]}${melody[2] === 'playUntilDone' ? ' until done' : ''}`);
            return;
        }
        if (name === 'input.setLightThreshold') {
            const condition = this.member(a[0], 'LightCondition', {Dark: 'dark', Bright: 'bright'});
            if (condition) { push(`set ${condition} light threshold to ${value(1, 0)}`); return; }
        }
        if (REFUSED[(name || '').split('.')[0]]) { push(this.refuse(node, this.reason(node))); return; }
        super.command(node, indent, out);
    }

    handler (node) {
        const name = this.path(node.callee) || '';
        if (this.shadowed.has(name.split('.')[0])) return null;
        const a = node.args || [];
        const button = /^input\.(buttonA|buttonB|buttonsAB)\.onEvent$/.exec(name);
        const touch = /^input\.pin(A[1-7])\.onEvent$/.exec(name);
        if (button || touch) {
            const event = this.member(a[0], 'ButtonEvent', EVENTS);
            if (event) return button ? `when button ${BUTTONS[button[1]]} ${event}` : `when touch ${touch[1]} ${event}`;
        }
        if (name === 'input.onGesture') {
            const gesture = this.member(a[0], 'Gesture', GESTURES);
            if (gesture) return `when gesture ${gesture}`;
        }
        if (name === 'input.onSwitchMoved') {
            const direction = this.member(a[0], 'SwitchDirection', {Left: 'left', Right: 'right'});
            if (direction) return `when switch moved ${direction}`;
        }
        if (name === 'input.onLightConditionChanged') {
            const condition = this.member(a[0], 'LightCondition', {Dark: 'dark', Bright: 'bright'});
            if (condition) return `when light ${condition}`;
        }
        if (name === 'input.onLoudSound') return 'when loud sound';
        if (name === 'input.onTemperatureConditionChanged') {
            const condition = this.member(a[0], 'TemperatureCondition', {Hot: 'hot', Cold: 'cold'});
            const unit = this.member(a[2], 'TemperatureUnit', {Celsius: 'C', Fahrenheit: 'F'}, 'C');
            if (condition && unit && a[1]) return `when temperature ${condition} at ${this.operand(a[1])} ${unit}`;
        }
        return null;
    }
}

export function adafruitToPseudocode (source, opts = {}) {
    const ast = parseMakeCodeTs(source);
    const t = new AdafruitTranslator(ast);
    t.claimNames(ast);
    t.claimRecords(ast);
    for (const st of ast.body) {
        if (st.type === 'Enum') t.statement(st, 0, []);
        if (st.type === 'FunctionDeclaration') {
            const fn = {name: t.procName(st.name), source: st.name, params: st.params,
                paramTypes: st.paramTypes, returnType: st.returnType, body: st.body, scope: st.name};
            const returnsValue = node => {
                if (!node || typeof node !== 'object' ||
                    ['FunctionDeclaration', 'FunctionExpression', 'Arrow'].includes(node.type)) return false;
                if (node.type === 'Return' && node.value) return true;
                return Object.values(node).some(v => Array.isArray(v) ? v.some(returnsValue) : returnsValue(v));
            };
            if (st.body.some(returnsValue)) {
                let result = `${fn.name}_result`;
                while (t.taken.has(result)) result += '_';
                t.taken.add(result);
                fn.result = result;
            }
            t.functions.push(fn);
        }
    }
    const main = [];
    const scripts = [];
    let yieldedInitialization = false;
    for (const st of ast.body) {
        if (st.type === 'Enum' || st.type === 'FunctionDeclaration') continue;
        const call = st.type === 'ExpressionStatement' && st.expr.type === 'Call' ? st.expr : null;
        const name = call && t.path(call.callee);
        if (call && ['forever', 'loops.forever'].includes(name)) {
            t.visitedCalls.add(call);
            const body = t.callbackBody(call.args[0]);
            if (!body) { scripts.push([t.refuse(call, 'the callback must be a statically declared zero-argument function')]); continue; }
            const lines = ['WHEN flag clicked:', '  FOREVER:'];
            t.block(t.leavable(body, 'forever'), 2, lines);
            scripts.push(lines);
            continue;
        }
        const hat = call && t.handler(call);
        if (hat) {
            t.visitedCalls.add(call);
            if (yieldedInitialization) {
                scripts.push([t.refuse(call, 'registration follows potentially yielding initialization; late registration is not preserved by CPX project hats')]);
                continue;
            }
            const body = t.callbackBody(call.args[call.args.length - 1]);
            if (!body) { scripts.push([t.refuse(call, 'the callback must be a statically declared zero-argument function')]); continue; }
            const lines = [`${hat}:`];
            t.block(t.leavable(body, name), 1, lines);
            scripts.push(lines);
            continue;
        }
        yieldedInitialization ||= t.mayYield(st);
        t.statement(st, 1, main);
    }
    const defines = [];
    t.inProcedure = true;
    for (const fn of t.functions) {
        if (fn.generic || (fn.params || []).some(p => fn.paramTypes && fn.paramTypes[p] && fn.paramTypes[p].isArray)) continue;
        const signature = [fn.name, ...(fn.params || []).map(p => `(${t.varName(p)})`)].join(' ');
        const lines = [`DEFINE ${signature}:`];
        t.scope = fn.scope;
        t.arrayAliases = fn.arrayAliases || null;
        if (fn.record) { t.selfRecord = fn.record; t.aliases.set('this', 'self'); }
        t.returnable = {result: fn.result || null};
        t.block(fn.body, 1, lines);
        t.scope = null;
        t.arrayAliases = null;
        t.selfRecord = null;
        t.aliases.delete('this');
        t.returnable = null;
        defines.push(...lines, '');
    }
    // A refused enclosing construct must not hide a nested call. Visit by
    // node identity, so translating one use cannot cover a dropped second use.
    walk(ast, node => {
        if (node.type === 'Call' && !t.visitedCalls.has(node)) {
            t.refuse(node, 'inside a construct that has no CPX translation');
        }
    });
    const unsupported = [...new Set(t.unsupported.map(reason => {
        const text = String(reason).replace(/[\r\n]/g, ' ');
        return text.includes(' — ') ? text : `${text} — no CPX translation for this construct`;
    }))];
    const out = ['DEVICE CPX', ''];
    if (opts.name) out.push(`# Imported Circuit Playground Express project: ${String(opts.name).replace(/[\r\n]/g, ' ')}`, '');
    out.push(...unsupported.map(s => `# unsupported: ${s}`), ...t.renameNotes());
    const prelude = t.recordPrelude().map(s => `  ${s}`);
    if (prelude.length) main.unshift(...prelude);
    if (main.length) out.push('WHEN flag clicked:', ...main, '');
    for (const script of scripts) out.push(...script, '');
    out.push(...defines);
    if (!main.length && !scripts.length) out.push('WHEN flag clicked:', '  # (nothing translatable in this project)', '');
    return {code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`, unsupported,
        scripts: scripts.length + (main.length ? 1 : 0)};
}

export default adafruitToPseudocode;
