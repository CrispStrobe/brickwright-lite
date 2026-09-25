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
 * What has no Arcade counterpart is NAMED in `unsupported` and becomes a
 * comment where it stood — nothing vanishes in silence (the census rule).
 *
 * @module
 */
import {svgToPixels, quantizeRgba, toImgLiteral} from './pixel-image.js';
import {imageToSvg} from './arcade-assets.js';

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
    }

    /** Record what kind of value a variable is given, for its declaration. */
    assign (tsName, expr) {
        const kind = /^"|^\("" \+/.test(expr) ? 'string' : 'number';
        if (!this.kinds.has(tsName)) this.kinds.set(tsName, new Set());
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
        return local ? this.varName(this.target, name) : this.varName(this.project.targets.find(t => t.isStage) || this.target, name);
    }

    self () {
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
            'sensing_touchingobject', 'sensing_keypressed', 'sensing_mousedown'].includes(b.opcode);
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
        case 'operator_join': return `("" + ${v('STRING1')} + ${v('STRING2')})`;
        case 'operator_length': return `("" + ${v('STRING')}).length`;
        case 'operator_gt': return `(${v('OPERAND1')} > ${v('OPERAND2')})`;
        case 'operator_lt': return `(${v('OPERAND1')} < ${v('OPERAND2')})`;
        case 'operator_equals': return `(${v('OPERAND1')} == ${v('OPERAND2')})`;
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
            const other = this.spriteVar.get(what);
            if (other) return `${me}.overlapsWith(${other})`;
            this.note(`touching ${what || 'the mouse pointer'}`);
            return 'false';
        }
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
        switch (b.opcode) {
        case 'data_setvariableto': {
            const name = this.lookupVar(this.field(b, 'VARIABLE'));
            const val = v('VALUE');
            this.assign(name, val);
            push(`${name} = ${val}`);
            return;
        }
        case 'data_changevariableby': push(`${this.lookupVar(this.field(b, 'VARIABLE'))} += ${v('VALUE')}`); return;
        case 'control_wait': push(`pause(${v('DURATION')} * 1000)`); return;
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
            push('}');
            return;
        case 'control_repeat_until':
            push(`while (!${this.condition(b, 'CONDITION')}) {`);
            this.substack(b, 'SUBSTACK', depth + 1, out);
            push('    pause(20)');
            push('}');
            return;
        case 'control_wait_until':
            push(`pauseUntil(() => ${this.condition(b, 'CONDITION')})`);
            return;
        case 'control_forever':
            // One frame per pass (Scratch redraws once per loop iteration too).
            push('while (true) {');
            this.substack(b, 'SUBSTACK', depth + 1, out);
            push('    pause(20)');
            push('}');
            return;
        case 'control_stop': push('game.over(false)'); return;
        case 'motion_changexby': if (me) push(`${me}.x += ${v('DX')} / 3`); return;
        case 'motion_changeyby': if (me) push(`${me}.y -= ${v('DY')} / 3`); return;
        case 'motion_setx': if (me) push(`${me}.x = ${v('X')} / 3 + 80`); return;
        case 'motion_sety': if (me) push(`${me}.y = 60 - ${v('Y')} / 3`); return;
        case 'motion_gotoxy': if (me) push(`${me}.setPosition(${v('X')} / 3 + 80, 60 - ${v('Y')} / 3)`); return;
        case 'motion_goto': {
            const to = this.menuField(b, 'TO', 'TO');
            const other = this.spriteVar.get(to);
            if (me && other) push(`${me}.setPosition(${other}.x, ${other}.y)`);
            else if (me && to === '_random_') push(`${me}.setPosition(randint(0, 160), randint(0, 120))`);
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
            if (fn) push(`${fn}(${ids.map(a => this.value(b, a)).join(', ')})`);
            else push(`// ${this.note(`call ${code}`)}`);
            return;
        }
        default:
            push(`// ${this.note(b.opcode)}`);
        }
    }

    // ── images ───────────────────────────────────────────────────────────
    /** The costume as palette pixels: exact for pixel art, palette-matched otherwise. */
    image (target) {
        const costume = target.costumes[target.currentCostume || 0];
        const svg = costume && this.opts.costumeSvg ? this.opts.costumeSvg(target, costume) : null;
        if (svg) {
            const px = svgToPixels(svg);
            if (px) return px;
        }
        const raster = costume && this.opts.costumeRgba ? this.opts.costumeRgba(target, costume) : null;
        if (raster) {
            // A Scratch costume is drawn 3x larger than its Arcade sprite (the stage
            // is 3x the screen); palette-matched, and named, because that is lossy.
            this.warnings.push(`${target.name}: costume "${costume.name}" converted to palette pixels`);
            return quantizeRgba(raster.rgba, raster.width, raster.height,
                Math.max(1, Math.round(raster.width / 3)), Math.max(1, Math.round(raster.height / 3)));
        }
        this.warnings.push(`${target.name}: no costume image available — a placeholder square`);
        const w = 8;
        const px = new Uint8Array(w * w).fill(target.name.length % 14 + 1);
        return {width: w, height: w, pixels: px};
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
        for (const t of this.project.targets) {
            this.target = t;
            this.blocks = t.blocks || {};
            for (const [, b] of Object.entries(this.blocks)) {
                if (!b || !b.topLevel) continue;
                const script = [];
                if (b.opcode === 'event_whenflagclicked') {
                    this.stmts(b.next, 1, script);
                    if (script.length) body.push(`control.runInParallel(function () {\n${script.join('\n')}\n})`);
                } else if (b.opcode === 'event_whenkeypressed') {
                    const key = this.field(b, 'KEY_OPTION');
                    const btn = KEY_BUTTON[key];
                    this.stmts(b.next, 1, script);
                    if (btn) handlers.push(`${btn}.onEvent(ControllerButtonEvent.Pressed, function () {\n${script.join('\n')}\n})`);
                    else handlers.push(`// ${this.note(`when key "${key}" pressed (Arcade has arrows, A and B)`)}`);
                } else if (b.opcode === 'procedures_definition') {
                    const proto = this.block(b.inputs && b.inputs.custom_block && b.inputs.custom_block[1]);
                    if (!proto || !proto.mutation) continue;
                    const names = JSON.parse(proto.mutation.argumentnames || '[]').map(ident);
                    this.stmts(b.next, 1, script);
                    const fn = this.fnNames.get(`${t.isStage ? '' : t.name}:${proto.mutation.proccode}`);
                    functions.push(`function ${fn} (${names.map(n => `${n}: any`).join(', ')}) {\n${script.join('\n')}\n}`);
                } else if (/^(procedures_prototype|argument_|.*_menu$)/.test(b.opcode)) {
                    continue;
                } else if (/^event_|^control_start_as_clone/.test(b.opcode)) {
                    handlers.push(`// ${this.note(`${b.opcode} script`)}`);
                } else if (!b.parent) {
                    continue;                               // a loose block: not a script
                }
            }
        }
        // Declarations: every variable the program touched, then the sprites.
        const decls = [...new Set(this.globals.values())];
        for (const n of decls) {
            const kinds = this.kinds.get(n) || new Set(['number']);
            // A variable given both text and numbers is `any` — Scratch's own
            // variables are untyped, and that is the honest translation.
            out.push(kinds.size > 1 ? `let ${n}: any = 0` : kinds.has('string') ? `let ${n} = ""` : `let ${n} = 0`);
        }
        if (this.usedNa) out.push('let _na = 0  // stands in for values with no Arcade counterpart (see comments)');
        for (const t of this.sprites) {
            const s = this.spriteVar.get(t.name);
            const img = toImgLiteral(this.image(t));
            out.push(`let ${s} = sprites.create(${img}, SpriteKind.Player)`);
            out.push(`${s}.setPosition(${Number(t.x || 0)} / 3 + 80, 60 - ${Number(t.y || 0)} / 3)`);
            if (t.visible === false) out.push(`${s}.setFlag(SpriteFlag.Invisible, true)`);
        }
        if (stage && this.opts.stageBackground) {
            const bg = this.opts.stageBackground(stage);
            if (bg) out.push(`scene.setBackgroundImage(${toImgLiteral(bg)})`);
        }
        return [...functions, ...out, ...handlers, ...body].join('\n') + '\n';
    }
}

/**
 * @param {object} project a Scratch project JSON (vm.toJSON() / SB3Creator's shape)
 * @param {object} [opts]
 * @param {(target, costume) => string|null} [opts.costumeSvg] the costume's SVG text, if it is an SVG
 * @param {(target, costume) => {rgba, width, height}|null} [opts.costumeRgba] its pixels, for anything else
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
            files: ['main.ts'], preferredEditor: 'tsprj'
        }, null, 4)}\n`
    };
    return {ts, files, unsupported: e.unsupported, warnings: e.warnings};
}

/** Re-exported for callers that build a background from pixels. */
export {imageToSvg};
