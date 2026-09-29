/**
 * A Scratch project -> MakeCode Arcade TypeScript: the way back from
 * arcade-translate.js, and the way OUT for a game made here.
 *
 * TWO MODELS. Scratch runs scripts that belong to one sprite each, on a 480x360
 * stage centred on 0,0 with y up. Arcade runs one program that holds its
 * sprites in variables, on a 160x120 screen with the origin top-left and y
 * down. So:
 *   - every sprite is a global `Sprite`, created from its CURRENT COSTUME
 *     turned into palette pixels (pixel-image.js: exact for pixel-art costumes,
 *     palette-matched for anything else — and said so);
 *   - every script becomes code acting on its own sprite's variable;
 *   - coordinates convert where they are USED: x_arcade = x / 3 + 80,
 *     y_arcade = 60 - y / 3, and back — the inverse of arcade-translate, so a
 *     round trip lands on the same numbers;
 *   - `when flag clicked` scripts run side by side (control.runInParallel),
 *     after every sprite exists; key hats become controller events;
 *     `touching` becomes overlapsWith; a variable named `score` is Arcade's.
 *   - broadcasts are a dispatch function that starts every receiver and
 *     returns what it started, so `broadcast and wait` waits for exactly those;
 *     a receiver started again while it runs restarts (Scratch's rule);
 *   - costumes are an Image[] per sprite (sprite.setImage), backdrops an
 *     Image[] for the scene (scene.setBackgroundImage) that also fires
 *     `when backdrop switches to`;
 *   - a sprite that is ever cloned gets its own SpriteKind; every script of it
 *     runs on a `self` sprite, so its clones (sprites.create of that kind) run
 *     the same code, and `delete this clone` is sprite.destroy();
 *   - lists are arrays with Scratch's 1-based, out-of-range-reads-"" rules;
 *   - pen lines go on a transparent layer sprite under the others;
 *   - a sound that is one steady tone is music.playTone; notes, rests and
 *     tempo are music calls.
 * What has no Arcade counterpart is NAMED in `unsupported` and becomes a
 * comment where it stood — nothing vanishes in silence (the census rule).
 * docs/ARCADE-COMPAT-PLAN.md is the construct-by-construct matrix.
 *
 * @module
 */
import {svgToPixels, quantizeRgba, toImgLiteral, remapPalette, nearestIndex} from './pixel-image.js';
import {ARCADE_PALETTE, imageToSvg} from './arcade-assets.js';
import {helperSource, analyseTone} from './arcade-runtime.js';

/**
 * Why the mouse stays a refusal: Arcade hardware has a d-pad and A/B, no
 * pointer. pxt-arcade's browser-events package reads a mouse, but only in the
 * browser simulator — a game using it would do nothing on a device, so the
 * export names the loss instead of shipping a program that only half works.
 */
export const MOUSE_WHY = 'Arcade has no pointer (a d-pad and A/B; browser-events works only in the simulator)';

const isPalette = palette => Array.isArray(palette) && palette.length === 16 && palette[0] === null &&
    palette.slice(1).every(colour => /^#[0-9a-f]{6}$/i.test(colour));
const samePalette = (left, right) => left.every((colour, index) =>
    String(colour).toLowerCase() === String(right[index]).toLowerCase());

const KEY_BUTTON = {
    'left arrow': 'controller.left', 'right arrow': 'controller.right',
    'up arrow': 'controller.up', 'down arrow': 'controller.down',
    space: 'controller.A', a: 'controller.A', z: 'controller.A', b: 'controller.B', x: 'controller.B'
};

const ident = name => {
    const s = String(name || 'v').replace(/[^A-Za-z0-9_]/g, '_');
    return /^[0-9]/.test(s) ? `_${s}` : s;
};

const RESERVED = new Set(['score', 'life', 'info', 'game', 'scene', 'sprites', 'controller', 'Math', 'function', 'let', 'var',
    'if', 'else', 'while', 'for', 'return', 'true', 'false', 'null', 'new', 'this', 'pause', 'forever']);

class ArcadeEmitter {
    constructor (project, opts) {
        this.project = project;
        this.opts = opts;
        this.unsupported = [];
        this.warnings = [];
        this.sprites = project.targets.filter(t => !t.isStage);
        this.spriteVar = new Map(this.sprites.map(t => [t.name, `${ident(t.name)}Sprite`]));
        this.globals = new Map();       // Scratch variable id|name -> TS name
        this.fnNames = new Map();       // `${target}:${proccode}` -> TS name
        this.target = null;
        this.blocks = null;
        this.kinds = new Map();         // TS variable -> Set('number'|'string')
        this.usedNa = false;
        this.helpers = new Set();       // arcade-runtime.js helpers the program uses
        this.lists = new Map();         // TS list name -> initial items
        this.listKeys = new Map();      // `${target}:${name}` -> TS list name
        this.receivers = new Map();     // lower-case message -> [{fn, sprite}]
        this.backdropHats = new Map();  // lower-case backdrop name -> [{fn, sprite}]
        this.cloneScripts = new Map();  // sprite name -> [fn]
        this.cloneVars = new Map();     // sprite name -> Map(data key -> initial value), per-clone variables
        this.generated = [];            // generated functions (receivers, clone scripts, ...)
        this.guards = [];               // conditions that end the current script at a yield
        this.scriptSeq = 0;
        this.soundCache = new Map();
        this.analyse();
        const palettes = this.sprites.map(target => {
            const costume = target.costumes[target.currentCostume || 0];
            const palette = costume && opts.costumePalette?.(target, costume);
            return isPalette(palette) ? palette : ARCADE_PALETTE;
        });
        this.palette = palettes.find(palette => !samePalette(palette, ARCADE_PALETTE)) || ARCADE_PALETTE;
    }

    /** Record what kind of value a variable is given, for its declaration. */
    assign (tsName, expr) {
        if (!this.kinds.has(tsName)) this.kinds.set(tsName, new Set());
        // A list item can be text or a number: the variable holding it is `any`.
        if (/^_item\(/.test(expr)) {
            this.kinds.get(tsName).add('number').add('string');
            return;
        }
        const kind = /^"|^\("" \+|^_listText\(|Names\[/.test(expr) ? 'string' : 'number';
        this.kinds.get(tsName).add(kind);
    }

    /**
     * The value standing in for something with no Arcade counterpart: a
     * variable, not the literal 0, because Static TypeScript narrows a literal
     * and then refuses `0 == 2` (census: two games).
     */
    na () {
        this.usedNa = true;
        return '_na';
    }

    note (what) {
        if (!this.unsupported.includes(what)) this.unsupported.push(what);
        return what;
    }

    warn (what) {
        if (!this.warnings.includes(what)) this.warnings.push(what);
    }

    /** A switch to a name the project does not have: Scratch does nothing, and so does this. */
    missing (push, what) {
        this.warn(`${what} — it does nothing, as in Scratch`);
        push(`// ${what} — it does nothing, as in Scratch`);
    }

    volumeWarning () {
        this.warn('volume is one setting for the whole game in Arcade (Scratch keeps one per sprite)');
    }

    /** A helper from arcade-runtime.js, recorded as used; returns its name for chaining. */
    use (name, what = '') {
        this.helpers.add(name);
        return what;
    }

    /**
     * Which sprites are ever cloned, which use costumes, backdrops or the pen:
     * all decided before the first line is written, because each changes how
     * EVERY script of that sprite is emitted (a cloned sprite's scripts act on
     * `self`, a pen sprite's moves draw).
     */
    analyse () {
        this.clonable = new Set();
        this.costumeUsers = new Set();
        this.penUsers = new Set();
        this.usesBackdrops = false;
        this.usesPen = false;
        const names = new Set(this.sprites.map(t => t.name));
        for (const t of this.project.targets) {
            const blocks = t.blocks || {};
            for (const b of Object.values(blocks)) {
                if (!b || !b.opcode) continue;
                if (b.opcode === 'control_create_clone_of') {
                    const input = b.inputs && b.inputs.CLONE_OPTION;
                    const menu = input && input[0] === 1 && typeof input[1] === 'string' ? blocks[input[1]] : null;
                    const what = menu && menu.fields && menu.fields.CLONE_OPTION ? menu.fields.CLONE_OPTION[0] : '';
                    if (what === '_myself_' && !t.isStage) this.clonable.add(t.name);
                    else if (names.has(what)) this.clonable.add(what);
                }
                if (/^looks_(switchcostumeto|nextcostume|costumenumbername)$/.test(b.opcode) && !t.isStage) this.costumeUsers.add(t.name);
                if (/^looks_(switchbackdropto|switchbackdroptoandwait|nextbackdrop|backdropnumbername)$|^event_whenbackdropswitchesto$/.test(b.opcode)) {
                    this.usesBackdrops = true;
                }
                if (/^pen_/.test(b.opcode) && !/_menu_|Menu$/.test(b.opcode)) {
                    this.usesPen = true;
                    if (!t.isStage) this.penUsers.add(t.name);
                }
            }
        }
    }

    isClonable (target = this.target) {
        return !!target && !target.isStage && this.clonable.has(target.name);
    }

    kindOf (name) { return `_kind_${ident(name)}`; }

    allOf (name) { return `_all_${ident(name)}()`; }

    costumeSet (target) { return `${ident(target.name)}Costumes`; }

    costumeNames (target) { return `${ident(target.name)}CostumeNames`; }

    /** The reporter obscuring a menu input, as an expression — null when the menu itself is set. */
    dynamicInput (b, name) {
        const input = b.inputs && b.inputs[name];
        if (!input || (input[0] !== 2 && input[0] !== 3)) return null;
        if (Array.isArray(input[1])) return input[1][0] === 12 || input[1][0] === 13 ? this.value(b, name) : null;
        if (typeof input[1] !== 'string') return null;
        const r = this.block(input[1]);
        return r && !r.shadow ? this.value(b, name) : null;
    }

    /** The raw literal of an input, when it is one (list indices "last", "all", ...). */
    literal (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        if (Array.isArray(slot) && slot[0] !== 12 && slot[0] !== 13) return String(slot[1]);
        if (typeof slot === 'string') {
            const r = this.block(slot);
            if (r && r.shadow && r.fields) {
                const f = Object.values(r.fields)[0];
                if (f) return String(f[0]);
            }
        }
        return null;
    }

    /** A yield point: end this script here if it was restarted, or its clone deleted. */
    guardLine () {
        return this.guards.length ? [`if (${this.guards.join(' || ')}) return`] : [];
    }

    // ── lists ────────────────────────────────────────────────────────────
    listName (b) {
        const f = b.fields && b.fields.LIST;
        const name = f ? f[0] : 'list';
        const stage = this.project.targets.find(t => t.isStage) || this.target;
        const local = Object.values(this.target.lists || {}).some(l => l[0] === name) && !this.target.isStage;
        const owner = local ? this.target : stage;
        const key = `${owner.isStage ? '' : owner.name}:${name}`;
        if (this.listKeys.has(key)) return this.listKeys.get(key);
        let ts = `${ident(owner.isStage ? name : `${owner.name}_${name}`)}List`;
        if (RESERVED.has(ts)) ts = `${ts}_`;
        const decl = Object.values(owner.lists || {}).find(l => l[0] === name);
        this.listKeys.set(key, ts);
        this.lists.set(ts, decl && Array.isArray(decl[1]) ? decl[1] : []);
        if (local && this.isClonable(owner)) {
            this.note(`list "${name}" of cloned sprite ${owner.name}: one list shared by the sprite and its clones (Scratch gives each clone a copy)`);
        }
        this.use('list');
        return ts;
    }

    /** A 1-based list index input, with Scratch's words for the ends. */
    listIndex (b, list, name = 'INDEX') {
        const lit = this.literal(b, name);
        if (lit === 'last') return `${list}.length`;
        if (lit === 'random' || lit === 'any') return `randint(1, ${list}.length)`;
        return this.value(b, name);
    }

    listStmt (b, push) {
        const v = n => this.value(b, n, '""');
        const list = this.listName(b);
        switch (b.opcode) {
        case 'data_addtolist': push(`${list}.push(${v('ITEM')})`); return true;
        case 'data_deletealloflist': push(`_clearList(${list})`); return true;
        case 'data_deleteoflist':
            if (this.literal(b, 'INDEX') === 'all') push(`_clearList(${list})`);
            else push(`_delItem(${list}, ${this.listIndex(b, list)})`);
            return true;
        case 'data_insertatlist': {
            const lit = this.literal(b, 'INDEX');
            if (lit === 'last') push(`${list}.push(${v('ITEM')})`);
            else push(`_insItem(${list}, ${lit === 'random' || lit === 'any' ? `randint(1, ${list}.length + 1)` : this.value(b, 'INDEX')}, ${v('ITEM')})`);
            return true;
        }
        case 'data_replaceitemoflist': push(`_setItem(${list}, ${this.listIndex(b, list)}, ${v('ITEM')})`); return true;
        default: return false;
        }
    }

    // ── sounds ───────────────────────────────────────────────────────────
    /** The steady tone a sound is, or why it is not one. */
    soundTone (name) {
        const target = this.target;
        const key = `${target.name}:${name}`;
        if (this.soundCache.has(key)) return this.soundCache.get(key);
        const sound = (target.sounds || []).find(x => x.name === name);
        let r;
        if (!sound) r = {reason: 'no such sound'};
        else {
            const bytes = this.opts.soundData ? this.opts.soundData(target, sound) : null;
            r = bytes ? analyseTone(bytes) : {reason: 'its audio was not available to the export'};
        }
        this.soundCache.set(key, r);
        return r;
    }

    // ── names ────────────────────────────────────────────────────────────
    varName (target, name) {
        const key = `${target.isStage ? '' : target.name}:${name}`;
        if (this.globals.has(key)) return this.globals.get(key);
        // A variable named `score` is Arcade's own score (info); others are
        // globals, prefixed with their sprite when sprite-local.
        let ts = ident(target.isStage || this.isGlobalVar(name) ? name : `${target.name}_${name}`);
        if (RESERVED.has(ts)) ts = `${ts}_`;
        this.globals.set(key, ts);
        return ts;
    }

    isGlobalVar (name) {
        const stage = this.project.targets.find(t => t.isStage);
        return !!(stage && Object.values(stage.variables || {}).some(v => v[0] === name));
    }

    lookupVar (name) {
        // A read resolves sprite-local first, then global (Scratch's rule).
        const local = Object.values(this.target.variables || {}).some(v => v[0] === name);
        // A cloned sprite's own variable lives in each instance's data, so
        // every clone has its copy (made from its parent's when it is cloned).
        if (local && this.isClonable() && !this.isGlobalVar(name)) {
            const key = `v:${name}`;
            if (!this.cloneVars.has(this.target.name)) this.cloneVars.set(this.target.name, new Map());
            const init = Object.values(this.target.variables).find(v => v[0] === name)[1];
            this.cloneVars.get(this.target.name).set(key, init);
            return `self.data[${JSON.stringify(key)}]`;
        }
        return local ? this.varName(this.target, name) : this.varName(this.project.targets.find(t => t.isStage) || this.target, name);
    }

    self () {
        if (this.isClonable()) return 'self';
        return this.spriteVar.get(this.target.name) || null;
    }

    // ── inputs ───────────────────────────────────────────────────────────
    block (id) { return id ? this.blocks[id] : null; }

    field (b, name) { return b.fields && b.fields[name] ? b.fields[name][0] : ''; }

    value (b, name, fallback = '0') {
        const input = b.inputs && b.inputs[name];
        if (!input) return fallback;
        const slot = input[1];
        if (Array.isArray(slot)) {
            const [type, text] = slot;
            if (type === 12 || type === 13) return this.lookupVar(text);
            const s = String(text);
            if (type >= 4 && type <= 8) return s.trim() === '' ? '0' : String(Number(s));
            if (/^(true|false)$/.test(s)) return s === 'true' ? '1' : '0';
            if (s.trim() !== '' && Number.isFinite(Number(s))) return String(Number(s));
            return JSON.stringify(s);
        }
        if (typeof slot === 'string') {
            const r = this.block(slot);
            // A shadow holding one field (a note, a menu) is a literal.
            if (r && r.shadow && r.fields && !Object.keys(r.inputs || {}).length && Object.keys(r.fields).length === 1) {
                const s = String(Object.values(r.fields)[0][0]);
                return s.trim() !== '' && Number.isFinite(Number(s)) ? String(Number(s)) : JSON.stringify(s);
            }
            if (r && this.isBoolean(r)) return `(${this.expr(r)} ? 1 : 0)`;
            return this.expr(r);
        }
        return fallback;
    }

    condition (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        if (typeof slot !== 'string') return 'false';
        const r = this.block(slot);
        return this.isBoolean(r) ? this.expr(r) : `(${this.expr(r)} != 0)`;
    }

    isBoolean (b) {
        return !!b && ['operator_and', 'operator_or', 'operator_not', 'operator_gt', 'operator_lt', 'operator_equals',
            'sensing_touchingobject', 'sensing_keypressed', 'sensing_mousedown', 'data_listcontainsitem'].includes(b.opcode);
    }

    menuField (b, input, field) {
        const i = b.inputs && b.inputs[input];
        const m = i && typeof i[1] === 'string' ? this.block(i[1]) : null;
        return m ? this.field(m, field) : '';
    }

    // ── expressions ──────────────────────────────────────────────────────
    expr (b) {
        if (!b) return '0';
        const v = n => this.value(b, n);
        const c = n => this.condition(b, n);
        const me = this.self();
        switch (b.opcode) {
        case 'data_variable': return this.lookupVar(this.field(b, 'VARIABLE'));
        case 'argument_reporter_string_number':
        case 'argument_reporter_boolean': return ident(this.field(b, 'VALUE'));
        case 'operator_add': return `(${v('NUM1')} + ${v('NUM2')})`;
        case 'operator_subtract': return `(${v('NUM1')} - ${v('NUM2')})`;
        case 'operator_multiply': return `(${v('NUM1')} * ${v('NUM2')})`;
        case 'operator_divide': return `(${v('NUM1')} / ${v('NUM2')})`;
        case 'operator_mod': return `(${v('NUM1')} % ${v('NUM2')})`;
        case 'operator_round': return `Math.round(${v('NUM')})`;
        case 'operator_random': return `randint(${v('FROM')}, ${v('TO')})`;
        // Planète Maths: the importer's spelling of Math.min/max/pow (they
        // kept only their first argument before, on the way in).
        case 'planetemaths_min': return `Math.min(${v('NUM1')}, ${v('NUM2')})`;
        case 'planetemaths_max': return `Math.max(${v('NUM1')}, ${v('NUM2')})`;
        case 'planetemaths_pow': return `Math.pow(${v('NUM1')}, ${v('NUM2')})`;
        case 'operator_join':
            return v('STRING1') === '""' ? `("" + ${v('STRING2')})` : `("" + ${v('STRING1')} + ${v('STRING2')})`;
        case 'operator_length': return `("" + ${v('STRING')}).length`;
        case 'operator_gt': return `(${v('OPERAND1')} > ${v('OPERAND2')})`;
        case 'operator_lt': return `(${v('OPERAND1')} < ${v('OPERAND2')})`;
        case 'operator_equals': {
            // A bare variable is compared as `any`: TypeScript narrows a `let`
            // to the literal it was last given (x = 1; ... x == 0 is then a
            // compile error), and a costume name may meet a number. `as` is
            // compile-time only; the comparison itself is unchanged.
            const loose = x => (/^[A-Za-z_]\w*$/.test(x) && x !== '_na' ? `(${x} as any)` : x);
            return `(${loose(v('OPERAND1'))} == ${loose(v('OPERAND2'))})`;
        }
        case 'operator_and': return `(${c('OPERAND1')} && ${c('OPERAND2')})`;
        case 'operator_or': return `(${c('OPERAND1')} || ${c('OPERAND2')})`;
        case 'operator_not': return `(!${c('OPERAND')})`;
        case 'operator_mathop': {
            const op = this.field(b, 'OPERATOR');
            const n = v('NUM');
            const map = {abs: `Math.abs(${n})`, floor: `Math.floor(${n})`, ceiling: `Math.ceil(${n})`,
                sqrt: `Math.sqrt(${n})`, sin: `Math.sin(${n} * Math.PI / 180)`, cos: `Math.cos(${n} * Math.PI / 180)`,
                tan: `Math.tan(${n} * Math.PI / 180)`, asin: `(Math.asin(${n}) * 180 / Math.PI)`,
                acos: `(Math.acos(${n}) * 180 / Math.PI)`, atan: `(Math.atan(${n}) * 180 / Math.PI)`,
                ln: `Math.log(${n})`, exp: `Math.exp(${n})`, log: `(Math.log(${n}) / Math.LN10)`, '10 ^': `Math.pow(10, ${n})`,
                'e ^': `Math.exp(${n})`};
            if (map[op]) return map[op];
            this.note(`${op} of …`);
            return this.na();
        }
        case 'motion_xposition': return me ? `((${me}.x - 80) * 3)` : '0';
        case 'motion_yposition': return me ? `((60 - ${me}.y) * 3)` : '0';
        case 'motion_direction': this.note('direction'); return this.na();
        case 'sensing_of': {
            const prop = this.field(b, 'PROPERTY');
            const other = this.spriteVar.get(this.menuField(b, 'OBJECT', 'OBJECT'));
            if (other && prop === 'x position') return `((${other}.x - 80) * 3)`;
            if (other && prop === 'y position') return `((60 - ${other}.y) * 3)`;
            this.note(`${prop} of another sprite`);
            return this.na();
        }
        case 'sensing_touchingobject': {
            const what = this.menuField(b, 'TOUCHINGOBJECTMENU', 'TOUCHINGOBJECTMENU');
            if (!me) return 'false';
            if (what === '_edge_') return `(${me}.left < 0 || ${me}.right > 160 || ${me}.top < 0 || ${me}.bottom > 120)`;
            // A cloned sprite is touched through the sprite OR any of its clones.
            if (this.clonable.has(what)) return this.use('touching', `_touching(${me}, ${this.allOf(what)})`);
            const other = this.spriteVar.get(what);
            if (other) return `${me}.overlapsWith(${other})`;
            if (what === '_mouse_') this.note(`touching mouse-pointer: ${MOUSE_WHY}`);
            else this.note(`touching ${what || 'the mouse pointer'}`);
            return 'false';
        }
        case 'sensing_mousex': this.note(`mouse x: ${MOUSE_WHY}`); return this.na();
        case 'sensing_mousey': this.note(`mouse y: ${MOUSE_WHY}`); return this.na();
        case 'sensing_mousedown': this.note(`mouse down?: ${MOUSE_WHY}`); return 'false';
        case 'sensing_distanceto':
            if (this.menuField(b, 'DISTANCETOMENU', 'DISTANCETOMENU') === '_mouse_') {
                this.note(`distance to mouse-pointer: ${MOUSE_WHY}`);
                return this.na();
            }
            this.note('sensing_distanceto as a value');
            return this.na();
        // ── costumes and backdrops ──
        case 'looks_costumenumbername': {
            if (!me) return this.na();
            this.use('costume');
            return this.field(b, 'NUMBER_NAME') === 'name' ?
                `${this.costumeNames(this.target)}[_costume(${me})]` : `(_costume(${me}) + 1)`;
        }
        case 'looks_backdropnumbername':
            return this.field(b, 'NUMBER_NAME') === 'name' ? '_backdropNames[_bd]' : '(_bd + 1)';
        // ── lists ──
        case 'data_itemoflist': {
            const list = this.listName(b);
            return `_item(${list}, ${this.listIndex(b, list)})`;
        }
        case 'data_itemnumoflist': return `_findItem(${this.listName(b)}, ${this.value(b, 'ITEM', '""')})`;
        case 'data_lengthoflist': return `${this.listName(b)}.length`;
        case 'data_listcontainsitem': return `(_findItem(${this.listName(b)}, ${this.value(b, 'ITEM', '""')}) > 0)`;
        case 'data_listcontents': return `_listText(${this.listName(b)})`;
        // ── sound ──
        case 'sound_volume': this.volumeWarning(); return 'Math.round(music.volume() / 2.55)';
        case 'music_getTempo': return this.use('music', '_tempo');
        case 'sensing_keypressed': {
            const key = this.menuField(b, 'KEY_OPTION', 'KEY_OPTION');
            const btn = KEY_BUTTON[key];
            if (btn) return `${btn}.isPressed()`;
            this.note(`key "${key}" pressed (Arcade has arrows, A and B)`);
            return 'false';
        }
        case 'sensing_timer': return '(game.runtime() / 1000)';
        default:
            this.note(`${b.opcode} as a value`);
            return this.na();
        }
    }

    // ── statements ───────────────────────────────────────────────────────
    stmts (id, depth, out) {
        let b = this.block(id);
        while (b) {
            this.stmt(b, depth, out);
            b = this.block(b.next);
        }
    }

    substack (b, name, depth, out) {
        const input = b.inputs && b.inputs[name];
        if (input && typeof input[1] === 'string') this.stmts(input[1], depth, out);
    }

    stmt (b, depth, out) {
        const pad = '    '.repeat(depth);
        const push = line => out.push(pad + line);
        const v = n => this.value(b, n);
        const me = this.self();
        const pen = !!me && this.penUsers.has(this.target.name);
        if (/^data_(addtolist|deletealloflist|deleteoflist|insertatlist|replaceitemoflist)$/.test(b.opcode) && this.listStmt(b, push)) return;
        if (this.newStmt(b, push, me, depth, out)) return;
        switch (b.opcode) {
        case 'data_setvariableto': {
            const name = this.lookupVar(this.field(b, 'VARIABLE'));
            const val = v('VALUE');
            this.assign(name, val);
            push(`${name} = ${val}`);
            return;
        }
        case 'data_changevariableby': push(`${this.lookupVar(this.field(b, 'VARIABLE'))} += ${v('VALUE')}`); return;
        case 'control_wait':
            push(`pause(${v('DURATION')} * 1000)`);
            this.guardLine().forEach(push);
            return;
        case 'control_if':
            push(`if (${this.condition(b, 'CONDITION')}) {`);
            this.substack(b, 'SUBSTACK', depth + 1, out);
            push('}');
            return;
        case 'control_if_else':
            push(`if (${this.condition(b, 'CONDITION')}) {`);
            this.substack(b, 'SUBSTACK', depth + 1, out);
            push('} else {');
            this.substack(b, 'SUBSTACK2', depth + 1, out);
            push('}');
            return;
        case 'control_repeat':
            push(`for (let i${depth} = 0; i${depth} < ${v('TIMES')}; i${depth}++) {`);
            this.substack(b, 'SUBSTACK', depth + 1, out);
            this.guardLine().forEach(line => push(`    ${line}`));
            push('}');
            return;
        case 'control_repeat_until':
            push(`while (!${this.condition(b, 'CONDITION')}) {`);
            this.substack(b, 'SUBSTACK', depth + 1, out);
            push('    pause(20)');
            this.guardLine().forEach(line => push(`    ${line}`));
            push('}');
            return;
        case 'control_wait_until':
            push(`pauseUntil(() => ${this.condition(b, 'CONDITION')})`);
            this.guardLine().forEach(push);
            return;
        case 'control_forever':
            // One frame per pass (Scratch redraws once per loop iteration too).
            push('while (true) {');
            this.substack(b, 'SUBSTACK', depth + 1, out);
            push('    pause(20)');
            this.guardLine().forEach(line => push(`    ${line}`));
            push('}');
            return;
        case 'control_stop': push('game.over(false)'); return;
        // A sprite that draws moves through _penTo, which draws the line it moved along.
        case 'motion_changexby':
            if (me && pen) push(this.use('pen', `_penTo(${me}, ${me}.x + ${v('DX')} / 3, ${me}.y)`));
            else if (me) push(`${me}.x += ${v('DX')} / 3`);
            return;
        case 'motion_changeyby':
            if (me && pen) push(this.use('pen', `_penTo(${me}, ${me}.x, ${me}.y - ${v('DY')} / 3)`));
            else if (me) push(`${me}.y -= ${v('DY')} / 3`);
            return;
        case 'motion_setx':
            if (me && pen) push(this.use('pen', `_penTo(${me}, ${v('X')} / 3 + 80, ${me}.y)`));
            else if (me) push(`${me}.x = ${v('X')} / 3 + 80`);
            return;
        case 'motion_sety':
            if (me && pen) push(this.use('pen', `_penTo(${me}, ${me}.x, 60 - ${v('Y')} / 3)`));
            else if (me) push(`${me}.y = 60 - ${v('Y')} / 3`);
            return;
        case 'motion_gotoxy':
            if (me) push(`${pen ? this.use('pen', `_penTo(${me}, `) : `${me}.setPosition(`}${v('X')} / 3 + 80, 60 - ${v('Y')} / 3)`);
            return;
        case 'motion_goto': {
            const to = this.menuField(b, 'TO', 'TO');
            const other = this.spriteVar.get(to);
            const place = pen ? this.use('pen', `_penTo(${me}, `) : `${me}.setPosition(`;
            if (me && other) push(`${place}${other}.x, ${other}.y)`);
            else if (me && to === '_random_') push(`${place}randint(0, 160), randint(0, 120))`);
            else if (to === '_mouse_') push(`// ${this.note(`go to mouse-pointer: ${MOUSE_WHY}`)}`);
            else push(`// ${this.note(`go to ${to || '…'}`)}`);
            return;
        }
        case 'motion_ifonedgebounce': if (me) push(`${me}.setBounceOnWall(true)`); return;
        case 'looks_show': if (me) push(`${me}.setFlag(SpriteFlag.Invisible, false)`); return;
        case 'looks_hide': if (me) push(`${me}.setFlag(SpriteFlag.Invisible, true)`); return;
        case 'looks_sayforsecs': if (me) push(`${me}.sayText(${v('MESSAGE', '""')}, ${v('SECS')} * 1000, true)`); return;
        case 'looks_say': if (me) push(`${me}.sayText(${v('MESSAGE', '""')})`); return;
        case 'procedures_call': {
            const code = b.mutation && b.mutation.proccode;
            const fn = this.fnNames.get(`${this.target.name}:${code}`) || this.fnNames.get(`:${code}`);
            const ids = b.mutation ? JSON.parse(b.mutation.argumentids || '[]') : [];
            const args = ids.map(a => this.value(b, a));
            if (this.isClonable()) args.unshift('self');
            if (fn) push(`${fn}(${args.join(', ')})`);
            else push(`// ${this.note(`call ${code}`)}`);
            return;
        }
        default:
            push(`// ${this.note(b.opcode)}`);
        }
    }

    /**
     * The constructs this exporter maps beyond motion and control: broadcasts,
     * costumes, backdrops, clones, pen, sound and music, list monitors. Returns
     * whether it wrote the block (a refusal written as a comment counts).
     */
    newStmt (b, push, me, depth, out) {
        const v = n => this.value(b, n);
        const refuse = what => push(`// ${this.note(what)}`);
        switch (b.opcode) {
        // ── broadcasts ──
        case 'event_broadcast':
        case 'event_broadcastandwait': {
            const input = b.inputs && b.inputs.BROADCAST_INPUT;
            const slot = input && input[1];
            this.use('wait');
            this.usesBroadcast = true;
            const msg = Array.isArray(slot) && slot[0] === 11 ? JSON.stringify(String(slot[1]).toLowerCase()) :
                `("" + ${this.value(b, 'BROADCAST_INPUT', '""')}).toLowerCase()`;
            if (b.opcode === 'event_broadcast') push(`_broadcast(${msg})`);
            else {
                push(`_await(_broadcast(${msg}))`);
                this.guardLine().forEach(push);
            }
            return true;
        }
        // ── costumes ──
        case 'looks_switchcostumeto':
        case 'looks_nextcostume': {
            if (!me) return false;
            this.use('costume');
            const set = this.costumeSet(this.target);
            if (b.opcode === 'looks_nextcostume') {
                push(`_setCostume(${me}, ${set}, _costume(${me}) + 1)`);
                return true;
            }
            const dyn = this.dynamicInput(b, 'COSTUME');
            if (dyn) {
                this.use('pick');
                push(`_setCostume(${me}, ${set}, _pick(${this.costumeNames(this.target)}, ${dyn}, _costume(${me})))`);
                return true;
            }
            const name = this.menuField(b, 'COSTUME', 'COSTUME');
            const index = this.target.costumes.findIndex(c => c.name === name);
            if (index >= 0) push(`_setCostume(${me}, ${set}, ${index})`);
            else if (name === 'next costume') push(`_setCostume(${me}, ${set}, _costume(${me}) + 1)`);
            else if (name === 'previous costume') push(`_setCostume(${me}, ${set}, _costume(${me}) - 1)`);
            else if (name === 'random costume') push(`_setCostume(${me}, ${set}, randint(0, ${set}.length - 1))`);
            else if (name.trim() !== '' && Number.isFinite(Number(name))) push(`_setCostume(${me}, ${set}, ${Math.round(Number(name)) - 1})`);
            else this.missing(push, `switch costume to "${name}": ${this.target.name} has no such costume`);
            return true;
        }
        // ── backdrops ──
        case 'looks_switchbackdropto':
        case 'looks_switchbackdroptoandwait':
        case 'looks_nextbackdrop': {
            this.use('wait');
            const wait = b.opcode === 'looks_switchbackdroptoandwait';
            const call = index => {
                push(wait ? `_await(_setBackdrop(${index}))` : `_setBackdrop(${index})`);
                if (wait) this.guardLine().forEach(push);
            };
            if (b.opcode === 'looks_nextbackdrop') {
                call('_bd + 1');
                return true;
            }
            const dyn = this.dynamicInput(b, 'BACKDROP');
            if (dyn) {
                this.use('pick');
                call(`_pick(_backdropNames, ${dyn}, _bd)`);
                return true;
            }
            const stage = this.project.targets.find(t => t.isStage);
            const name = this.menuField(b, 'BACKDROP', 'BACKDROP');
            const index = stage ? stage.costumes.findIndex(c => c.name === name) : -1;
            if (index >= 0) call(String(index));
            else if (name === 'next backdrop') call('_bd + 1');
            else if (name === 'previous backdrop') call('_bd - 1');
            else if (name === 'random backdrop') call('randint(0, _backdrops.length - 1)');
            else this.missing(push, `switch backdrop to "${name}": the stage has no such backdrop`);
            return true;
        }
        // ── clones ──
        case 'control_create_clone_of': {
            const dyn = this.dynamicInput(b, 'CLONE_OPTION');
            const what = this.menuField(b, 'CLONE_OPTION', 'CLONE_OPTION');
            if (dyn) refuse('create clone of a computed sprite name (Arcade needs to know which sprite at export)');
            else if (what === '_myself_' && me) push(`_clone_${ident(this.target.name)}(${me})`);
            else if (this.clonable.has(what)) push(`_clone_${ident(what)}(${this.spriteVar.get(what)})`);
            else refuse(`create clone of ${what || '…'}: no such sprite`);
            return true;
        }
        case 'control_delete_this_clone':
            if (this.isClonable()) {
                push(`if (self.kind() == ${this.kindOf(this.target.name)}) {`);
                push('    self.destroy()');
                push('    return');
                push('}');
            } else {
                push(`// delete this clone: ${this.target.name} is never cloned, so there is nothing to delete (as in Scratch)`);
            }
            return true;
        // ── pen ──
        case 'pen_clear': this.use('pen'); push('_penLayer.image.fill(0)'); return true;
        case 'pen_penDown':
            if (!me) return false;
            this.use('pen');
            push(`${me}.data["_pd"] = 1`);
            push(`_penDot(${me}, ${me}.x, ${me}.y)`);
            return true;
        case 'pen_penUp': if (!me) return false; this.use('pen'); push(`${me}.data["_pd"] = 0`); return true;
        case 'pen_stamp':
            if (!me) return false;
            this.use('pen');
            push(`_penLayer.image.drawTransparentImage(${me}.image, ${me}.left, ${me}.top)`);
            return true;
        case 'pen_setPenColorToColor': {
            if (!me) return false;
            const input = b.inputs && b.inputs.COLOR;
            const slot = input && input[1];
            const hex = Array.isArray(slot) ? String(slot[1]) : this.literal(b, 'COLOR');
            const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || '');
            if (!m || (input[0] !== 1 && typeof slot === 'string' && !this.block(slot)?.shadow)) {
                refuse('set pen color to a computed colour (Arcade pens use the 16-colour palette, chosen at export)');
                return true;
            }
            this.use('pen');
            push(`${me}.data["_pc"] = ${nearestIndex([parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)], this.palette)}`);
            return true;
        }
        case 'pen_setPenSizeTo':
            if (!me) return false;
            this.use('pen');
            push(`${me}.data["_ps"] = Math.clamp(1, 1200, ${v('SIZE')})`);
            return true;
        case 'pen_changePenSizeBy':
            if (!me) return false;
            this.use('pen');
            push(`${me}.data["_ps"] = Math.clamp(1, 1200, (${me}.data["_ps"] ? ${me}.data["_ps"] : 1) + ${v('SIZE')})`);
            return true;
        case 'pen_setPenColorParamTo':
        case 'pen_changePenColorParamBy':
        case 'pen_setPenHueToNumber':
        case 'pen_changePenHueBy':
        case 'pen_setPenShadeToNumber':
        case 'pen_changePenShadeBy':
            refuse(`${b.opcode.replace(/^pen_/, 'pen ')}: pen hue, saturation, brightness and transparency (Arcade pens are one of 16 palette colours)`);
            return true;
        // ── sound ──
        case 'sound_play':
        case 'sound_playuntildone': {
            const dyn = this.dynamicInput(b, 'SOUND_MENU');
            const name = dyn ? null : (this.menuField(b, 'SOUND_MENU', 'SOUND_MENU') || this.literal(b, 'SOUND_MENU') || '');
            if (dyn) {
                refuse('play sound chosen by a reporter (Arcade tones are chosen at export)');
                return true;
            }
            const tone = this.soundTone(name);
            if (tone.reason) {
                refuse(`play sound "${name}": sampled audio — ${tone.reason} (Arcade plays tones only)`);
                return true;
            }
            const call = `music.playTone(${tone.freq}, ${tone.ms})`;
            if (b.opcode === 'sound_playuntildone') {
                push(call);
                this.guardLine().forEach(push);
            } else {
                push(`control.runInParallel(function () { ${call} })`);
            }
            return true;
        }
        case 'sound_stopallsounds': push('music.stopAllSounds()'); return true;
        case 'sound_setvolumeto': this.volumeWarning(); push(`music.setVolume(Math.round(${v('VOLUME')} * 2.55))`); return true;
        case 'sound_changevolumeby':
            this.volumeWarning();
            push(`music.setVolume(music.volume() + Math.round(${v('VOLUME')} * 2.55))`);
            return true;
        case 'sound_seteffectto':
        case 'sound_changeeffectby':
        case 'sound_cleareffects':
            refuse(`${b.opcode}: pitch and pan effects (Arcade tones have neither)`);
            return true;
        case 'music_playNoteForBeats':
            this.use('music');
            push(`music.playTone(_hz(${v('NOTE')}), _beats(${v('BEATS')}))`);
            this.guardLine().forEach(push);
            return true;
        case 'music_restForBeats':
            this.use('music');
            push(`pause(_beats(${v('BEATS')}))`);
            this.guardLine().forEach(push);
            return true;
        case 'music_playDrumForBeats':
            // The drum is lost (named); its time is kept, so what follows stays in step.
            this.use('music');
            push(`pause(_beats(${v('BEATS')}))  // ${this.note('play drum: sampled percussion (Arcade plays tones) — kept as a rest of the same length')}`);
            return true;
        case 'music_setTempo': this.use('music'); push(`_tempo = Math.clamp(20, 500, ${v('TEMPO')})`); return true;
        case 'music_changeTempo': this.use('music'); push(`_tempo = Math.clamp(20, 500, _tempo + ${v('TEMPO')})`); return true;
        case 'music_setInstrument':
            refuse('set instrument: Arcade plays one tone voice');
            return true;
        // ── lists and the mouse ──
        case 'data_showlist':
        case 'data_hidelist':
            refuse(`${b.opcode === 'data_showlist' ? 'show' : 'hide'} list: Arcade has no list monitors`);
            return true;
        case 'motion_pointtowards':
            if (this.menuField(b, 'TOWARDS', 'TOWARDS') !== '_mouse_') return false;
            refuse(`point towards mouse-pointer: ${MOUSE_WHY}`);
            return true;
        case 'motion_glideto':
            if (this.menuField(b, 'TO', 'TO') !== '_mouse_') return false;
            refuse(`glide to mouse-pointer: ${MOUSE_WHY}`);
            return true;
        default:
            return false;
        }
    }

    // ── images ───────────────────────────────────────────────────────────
    /** A costume as palette pixels: exact for pixel art, palette-matched otherwise. */
    image (target, costume = target.costumes[target.currentCostume || 0], index = target.currentCostume || 0) {
        const svg = costume && this.opts.costumeSvg ? this.opts.costumeSvg(target, costume) : null;
        const candidate = costume && this.opts.costumePalette?.(target, costume);
        const sourcePalette = isPalette(candidate) ? candidate : ARCADE_PALETTE;
        if (svg) {
            const px = svgToPixels(svg, sourcePalette);
            if (px) {
                if (samePalette(sourcePalette, this.palette)) return px;
                this.warnings.push(`${target.name}: costume palette mapped to the Arcade project palette`);
                return remapPalette(px, sourcePalette, this.palette);
            }
        }
        const raster = costume && this.opts.costumeRgba ? this.opts.costumeRgba(target, costume) : null;
        if (raster) {
            // A Scratch costume is drawn 3x larger than its Arcade sprite (the stage
            // is 3x the screen); palette-matched, and named, because that is lossy.
            this.warnings.push(`${target.name}: costume "${costume.name}" converted to palette pixels`);
            return quantizeRgba(raster.rgba, raster.width, raster.height,
                Math.max(1, Math.round(raster.width / 3)), Math.max(1, Math.round(raster.height / 3)),
                this.palette);
        }
        if (target.isStage) return null;
        this.warnings.push(`${target.name}: no costume image available — a placeholder square`);
        const w = 8;
        // Each costume's placeholder has its own colour, so a costume switch still shows.
        const px = new Uint8Array(w * w).fill(((target.name.length + index) % 14) + 1);
        return {width: w, height: w, pixels: px};
    }

    /** A backdrop as a 160x120 image expression: its pixels, or a plain fill (named). */
    backdrop (stage, costume, index) {
        const custom = this.opts.stageBackground && index === (stage.currentCostume || 0) ? this.opts.stageBackground(stage, costume) : null;
        const img = custom || this.image(stage, costume, index);
        if (img) return toImgLiteral(img);
        this.warnings.push(`backdrop "${costume.name}": no image available — a plain colour`);
        this.helpers.add('plain');
        return `_plain(${(index % 14) + 1})`;
    }

    // ── scripts ──────────────────────────────────────────────────────────
    /** Emit one script body with the guards a yield must check. */
    body (firstId, guards, preamble = []) {
        const saved = this.guards;
        this.guards = guards;
        const script = [...preamble];
        this.stmts(firstId, 1, script);
        this.guards = saved;
        return script;
    }

    /** A named function for a hat's script; `self` is its sprite when cloned. */
    scriptFunction (prefix, hat, restartable) {
        const t = this.target;
        const n = this.scriptSeq++;
        const fn = `_${prefix}_${ident(t.isStage ? 'stage' : t.name)}_${n}`;
        const clonable = this.isClonable();
        const guards = [];
        const pre = [];
        if (clonable) {
            this.use('gone');
            guards.push('_gone(self)');
        }
        if (restartable) {
            // Started again while it runs, a Scratch script restarts: the
            // older run ends at its next yield.
            this.use('gen');
            if (clonable) {
                pre.push(`    const _g = _genBumpFor(self, "_g${n}")`);
                guards.push(`_g != _genOf(self, "_g${n}")`);
            } else {
                pre.push(`    const _g = _genBump(${n})`);
                guards.push(`_g != _gens[${n}]`);
            }
        }
        const script = this.body(hat.next, guards, pre);
        this.generated.push(`function ${fn} (${clonable ? 'self: Sprite' : ''}) {\n${script.join('\n')}\n}`);
        return {fn, sprite: clonable ? t.name : null};
    }

    /** Start `entries` (receivers) into the wait `w`, each on every instance of its sprite. */
    spawnLines (entries) {
        return entries.map(({fn, sprite}) => (sprite ?
            `        for (const s of ${this.allOf(sprite)}) _spawnFor(w, ${fn}, s)` : `        _spawn(w, ${fn})`));
    }

    dispatcher (name, table, param) {
        const lines = [`function ${name} (${param}: string): _Wait {`, '    const w = new _Wait()'];
        for (const [key, entries] of table) {
            lines.push(`    if (${param} == ${JSON.stringify(key)}) {`, ...this.spawnLines(entries), '    }');
        }
        lines.push('    return w', '}');
        return lines.join('\n');
    }

    // ── the program ──────────────────────────────────────────────────────
    emit () {
        const out = [];
        const body = [];
        const handlers = [];
        const functions = [];
        const stage = this.project.targets.find(t => t.isStage);
        // Custom blocks first, so calls can find their names.
        for (const t of this.project.targets) {
            for (const [, b] of Object.entries(t.blocks || {})) {
                if (b && b.opcode === 'procedures_prototype' && b.mutation) {
                    const code = b.mutation.proccode;
                    const base = ident(code.replace(/%[sbn]/g, '').trim()) || 'fn';
                    this.fnNames.set(`${t.isStage ? '' : t.name}:${code}`, `${t.isStage ? '' : `${ident(t.name)}_`}${base}`);
                }
            }
        }
        const register = (table, key, entry) => {
            if (!table.has(key)) table.set(key, []);
            table.get(key).push(entry);
        };
        for (const t of this.project.targets) {
            this.target = t;
            this.blocks = t.blocks || {};
            const clonable = this.isClonable();
            const sv = this.spriteVar.get(t.name);
            for (const [, b] of Object.entries(this.blocks)) {
                if (!b || !b.topLevel) continue;
                let script = [];
                if (b.opcode === 'event_whenflagclicked') {
                    // The green flag starts the ORIGINAL sprite's scripts; clones do not exist yet.
                    if (clonable) this.use('gone');
                    script = this.body(b.next, clonable ? ['_gone(self)'] : []);
                    if (script.length) {
                        body.push(`control.runInParallel(function () {\n${clonable ? `    const self = ${sv}\n` : ''}${script.join('\n')}\n})`);
                    }
                } else if (b.opcode === 'event_whenkeypressed') {
                    const key = this.field(b, 'KEY_OPTION');
                    const btn = KEY_BUTTON[key];
                    if (!btn) {
                        handlers.push(`// ${this.note(`when key "${key}" pressed (Arcade has arrows, A and B)`)}`);
                    } else if (clonable) {
                        // Every instance of a cloned sprite hears the key.
                        const {fn} = this.scriptFunction('key', b, false);
                        this.use('wait');
                        handlers.push(`${btn}.onEvent(ControllerButtonEvent.Pressed, function () {\n    const w = new _Wait()\n    for (const s of ${this.allOf(t.name)}) _spawnFor(w, ${fn}, s)\n})`);
                    } else {
                        this.stmts(b.next, 1, script);
                        handlers.push(`${btn}.onEvent(ControllerButtonEvent.Pressed, function () {\n${script.join('\n')}\n})`);
                    }
                } else if (b.opcode === 'event_whenbroadcastreceived') {
                    this.use('wait');
                    this.usesBroadcast = true;
                    register(this.receivers, String(this.field(b, 'BROADCAST_OPTION')).toLowerCase(), this.scriptFunction('on', b, true));
                } else if (b.opcode === 'event_whenbackdropswitchesto') {
                    this.use('wait');
                    register(this.backdropHats, String(this.field(b, 'BACKDROP')), this.scriptFunction('backdrop', b, true));
                } else if (b.opcode === 'control_start_as_clone') {
                    if (!clonable) {
                        handlers.push(`// when I start as a clone: ${t.name} is never cloned, so this script never runs (as in Scratch)`);
                        continue;
                    }
                    const {fn} = this.scriptFunction('cloned', b, false);
                    if (!this.cloneScripts.has(t.name)) this.cloneScripts.set(t.name, []);
                    this.cloneScripts.get(t.name).push(fn);
                } else if (b.opcode === 'procedures_definition') {
                    const proto = this.block(b.inputs && b.inputs.custom_block && b.inputs.custom_block[1]);
                    if (!proto || !proto.mutation) continue;
                    const names = JSON.parse(proto.mutation.argumentnames || '[]').map(ident);
                    const params = names.map(n => `${n}: any`);
                    if (clonable) {
                        this.use('gone');
                        params.unshift('self: Sprite');
                    }
                    script = this.body(b.next, clonable ? ['_gone(self)'] : []);
                    const fn = this.fnNames.get(`${t.isStage ? '' : t.name}:${proto.mutation.proccode}`);
                    functions.push(`function ${fn} (${params.join(', ')}) {\n${script.join('\n')}\n}`);
                } else if (/^(procedures_prototype|argument_|.*_menu$)/.test(b.opcode)) {
                    continue;
                } else if (b.opcode === 'event_whenthisspriteclicked' || b.opcode === 'event_whenstageclicked') {
                    handlers.push(`// ${this.note(`when ${b.opcode === 'event_whenstageclicked' ? 'stage' : 'this sprite'} clicked: ${MOUSE_WHY}`)}`);
                } else if (/^event_|^control_start_as_clone/.test(b.opcode)) {
                    handlers.push(`// ${this.note(`${b.opcode} script`)}`);
                } else if (!b.parent) {
                    continue;                               // a loose block: not a script
                }
            }
        }
        const pre = [];                                     // kinds, costume and backdrop sets
        const generated = [];                               // clone, broadcast and backdrop machinery
        // Declarations: every variable the program touched, then the sprites.
        const decls = [...new Set(this.globals.values())];
        for (const n of decls) {
            const kinds = this.kinds.get(n) || new Set(['number']);
            // A variable given both text and numbers is `any` — Scratch's own
            // variables are untyped, and that is the honest translation.
            out.push(kinds.size > 1 ? `let ${n}: any = 0` : kinds.has('string') ? `let ${n} = ""` : `let ${n} = 0`);
        }
        for (const [n, items] of this.lists) {
            const lit = items.map(x => (typeof x === 'number' || (String(x).trim() !== '' && Number.isFinite(Number(x))) ?
                String(Number(x)) : JSON.stringify(String(x))));
            out.push(`let ${n}: any[] = [${lit.join(', ')}]`);
        }
        if (this.usedNa) out.push('let _na = 0  // stands in for values with no Arcade counterpart (see comments)');
        if (this.usesPen) out.push('_penInit()');
        const penColour = nearestIndex([0, 0, 255], this.palette);      // Scratch's pen starts blue
        for (const t of this.sprites) {
            const s = this.spriteVar.get(t.name);
            const current = t.currentCostume || 0;
            if (this.costumeUsers.has(t.name)) {
                const set = this.costumeSet(t);
                pre.push(`let ${set}: Image[] = [\n${t.costumes.map((c, i) => toImgLiteral(this.image(t, c, i))).join(',\n')}\n]`);
                pre.push(`let ${this.costumeNames(t)}: string[] = ${JSON.stringify(t.costumes.map(c => c.name))}`);
                out.push(`let ${s} = sprites.create(${set}[${current}], SpriteKind.Player)`);
                out.push(`${s}.data["_c"] = ${current}`);
            } else {
                const img = toImgLiteral(this.image(t));
                out.push(`let ${s} = sprites.create(${img}, SpriteKind.Player)`);
            }
            out.push(`${s}.setPosition(${Number(t.x || 0)} / 3 + 80, 60 - ${Number(t.y || 0)} / 3)`);
            if (t.visible === false) out.push(`${s}.setFlag(SpriteFlag.Invisible, true)`);
            if (this.penUsers.has(t.name)) out.push(`${s}.data["_pc"] = ${penColour}`);
            for (const [key, init] of this.cloneVars.get(t.name) || []) {
                const num = typeof init === 'number' || (String(init).trim() !== '' && Number.isFinite(Number(init)));
                out.push(`${s}.data[${JSON.stringify(key)}] = ${num ? String(Number(init)) : JSON.stringify(String(init))}`);
            }
        }
        for (const name of this.clonable) {
            const id = ident(name);
            const kind = this.kindOf(name);
            pre.push(`const ${kind} = SpriteKind.create()`);
            const keys = ['_c', '_pd', '_pc', '_ps', ...(this.cloneVars.get(name) || new Map()).keys()];
            generated.push([
                `function _all_${id} (): Sprite[] {`,
                `    return [${this.spriteVar.get(name)}].concat(sprites.allOfKind(${kind}))`,
                '}',
                // A clone starts as a copy of its parent: place, visibility,
                // layer, costume and pen; then its `when I start as a clone`
                // scripts run on it. Scratch stops at 300 clones.
                `function _clone_${id} (src: Sprite) {`,
                `    if (sprites.allOfKind(${kind}).length >= 300) return`,
                `    const c = sprites.create(src.image, ${kind})`,
                '    c.setPosition(src.x, src.y)',
                '    c.setFlag(SpriteFlag.Invisible, (src.flags & SpriteFlag.Invisible) != 0)',
                '    c.z = src.z',
                `    for (const k of ${JSON.stringify(keys)}) c.data[k] = src.data[k]`,
                ...(this.cloneScripts.get(name) || []).map(fn => `    control.runInParallel(function () { ${fn}(c) })`),
                '}'
            ].join('\n'));
        }
        if (this.usesBroadcast || this.receivers.size) {
            this.use('wait');
            generated.push(this.dispatcher('_broadcast', this.receivers, 'msg'));
        }
        if (this.usesBackdrops && stage) {
            this.use('wait');
            const current = stage.currentCostume || 0;
            pre.push(`let _backdrops: Image[] = [\n${stage.costumes.map((c, i) => this.backdrop(stage, c, i)).join(',\n')}\n]`);
            pre.push(`let _backdropNames: string[] = ${JSON.stringify(stage.costumes.map(c => c.name))}`);
            pre.push(`let _bd = ${current}`);
            generated.push([
                // Switching shows the backdrop and starts its `when backdrop switches to` scripts.
                'function _setBackdrop (i: number): _Wait {',
                '    i = Math.floor(i) % _backdrops.length',
                '    if (i < 0) i += _backdrops.length',
                '    _bd = i',
                '    scene.setBackgroundImage(_backdrops[i])',
                '    return _backdropHats(_backdropNames[i])',
                '}',
                this.dispatcher('_backdropHats', this.backdropHats, 'name')
            ].join('\n'));
            out.push('scene.setBackgroundImage(_backdrops[_bd])');
        } else if (stage && this.opts.stageBackground) {
            const bg = this.opts.stageBackground(stage);
            if (bg) out.push(`scene.setBackgroundImage(${toImgLiteral(bg)})`);
        }
        return [...helperSource(this.helpers), ...pre, ...generated, ...this.generated, ...functions,
            ...out, ...handlers, ...body].join('\n') + '\n';
    }
}

/**
 * @param {object} project a Scratch project JSON (vm.toJSON() / SB3Creator's shape)
 * @param {object} [opts]
 * @param {(target, costume) => string|null} [opts.costumeSvg] the costume's SVG text, if it is an SVG
 * @param {(target, costume) => {rgba, width, height}|null} [opts.costumeRgba] its pixels, for anything else
 * @param {(target, costume) => Array<string|null>|null} [opts.costumePalette] editable palette, if any
 * @param {(stage) => object|null} [opts.stageBackground] a 160x120 palette image for the backdrop
 * @returns {{ts: string, files: object, unsupported: string[], warnings: string[]}}
 */
export function projectToArcade (project, opts = {}) {
    const e = new ArcadeEmitter(project, opts);
    const ts = e.emit();
    const name = opts.name || 'brickwright-game';
    const files = {
        'main.ts': ts,
        'pxt.json': `${JSON.stringify({
            name, description: 'Exported from BrickWright', dependencies: {device: '*'},
            files: ['main.ts'], preferredEditor: 'tsprj',
            ...(!samePalette(e.palette, ARCADE_PALETTE) ? {palette: ['#000000', ...e.palette.slice(1)]} : {})
        }, null, 4)}\n`
    };
    return {ts, files, unsupported: e.unsupported, warnings: e.warnings};
}

/** Re-exported for callers that build a background from pixels. */
export {imageToSvg};
