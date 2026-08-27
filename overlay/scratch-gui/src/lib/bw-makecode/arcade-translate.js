/**
 * MakeCode Arcade → a Scratch project.
 *
 * WHY THIS IS A TRANSLATION AND NOT AN EMULATION
 * ---------------------------------------------
 * An Arcade game targets a 160x120 screen driven by a Cortex-M4; we
 * cannot run its binary. But its MODEL is unusually close to Scratch's:
 * a sprite is an image with a position and a velocity, collisions are
 * "these two overlap", the score is a number on screen, and the game
 * ends when something says so. Those all have Scratch spellings. So the
 * import is a translation between two sprite models, and what does not
 * survive it is named rather than faked.
 *
 * WHAT SURVIVES: the artwork (every `img` literal and every asset in the
 * .g.jres becomes a costume), the sprites and their kinds, positions,
 * velocity as a per-frame motion loop, controller movement as arrow-key
 * motion, overlap handlers as `touching`, score and lives as variables,
 * `game.over()` as `stop all`, and all the ordinary control flow.
 *
 * WHAT DOES NOT: tilemaps, sprite effects and particles, the physics
 * engine's acceleration and tile collision, animations, and music. Each
 * gets a `# unsupported:` line where it stood, and an entry in the
 * returned list so the UI can say how much of the game arrived.
 *
 * COORDINATES. Arcade is 160x120 with the origin top-left and y growing
 * downwards. The Scratch stage is 480x360 centred with y growing up. So
 * every position is `(x - 80) * 3` and `(60 - y) * 3`, and a downward
 * velocity becomes a negative one. That transform is applied at the
 * points where a coordinate is USED, never to a bare number, so
 * arithmetic in between stays in Arcade's units and reads like the
 * original.
 *
 * @module
 */

import {parseMakeCodeTs} from './ts-import.js';
import {BaseTranslator, bodyOf, num} from './translate-base.js';
import {
    parseImageLiteral,
    parseJres,
    parseTilemaps,
    renderTilemap,
    imageToSvg
} from './arcade-assets.js';

/** Arcade pixels → stage units. 160x120 scaled by 3 is 480x360 exactly. */
const SCALE = 3;
const HALF_WIDTH = 80;
const HALF_HEIGHT = 60;

/**
 * Velocity divisor: Arcade's vx is pixels per second and a Scratch
 * forever loop runs about 30 times a second, so one iteration should
 * move vx/30 Arcade pixels — which is vx*3/30 stage units.
 */
const VELOCITY_DIVISOR = 10;

/**
 * How many backdrops to carry over. A level renders to a few hundred
 * kilobytes of SVG; a platformer with eight of them would hand the paint
 * editor several megabytes of rectangles. The ones past the cap are
 * named in the unsupported list rather than dropped in silence.
 */
const MAX_BACKDROPS = 4;

/** MakeCode's controller buttons → the Scratch key names. */
const CONTROLLER_KEYS = {
    up: 'up arrow', down: 'down arrow', left: 'left arrow', right: 'right arrow',
    A: 'space', B: 'z', menu: 'm'
};

class ArcadeTranslator extends BaseTranslator {
    constructor (assets, tilemaps) {
        super();
        this.assets = assets || {};      // jres images by name
        this.tilemaps = tilemaps || {};  // level name → grid of tile indexes
        this.sprites = [];               // {name, image, kind, velocity}
        this.self = null;                // the sprite the current script is on
        this.aliases = new Map();        // handler parameter → sprite name
        this.pendingClone = null;        // a sprite spawned in this block
        this.kinds = 0;                  // SpriteKind.create() hands out ids
    }

    /**
     * Arcade spawns a new sprite mid-game with `enemy = sprites.create(…)`
     * and then positions it. Scratch's equivalent is a clone — and a
     * clone inherits the parent's state at the moment it is made, so the
     * `create clone of` goes AFTER the setup, at the end of the block
     * that spawned it. That reordering is the whole reason this override
     * exists; without it every clone would appear where the last one did.
     */
    block (body, indent, out) {
        const outer = this.pendingClone;
        this.pendingClone = null;
        super.block(body, indent, out);
        if (this.pendingClone) {
            out.push(`${'  '.repeat(indent)}create clone of ${this.pendingClone}`);
            this.pendingClone = null;
        }
        this.pendingClone = outer;
    }

    sprite (name) {
        return this.sprites.find(s => s.name === name) || null;
    }

    /** The sprite a name refers to, following handler parameter aliases. */
    resolveSprite (node) {
        if (!node) return null;
        if (node.type !== 'Identifier') return null;
        const alias = this.aliases.get(node.name);
        return this.sprite(alias || node.name);
    }

    /** An x coordinate in Arcade units, as a stage-unit expression. */
    stageX (node) {
        if (node && node.type === 'Number') return num((Number(node.value) - HALF_WIDTH) * SCALE);
        return `(${this.expr(node)} - ${HALF_WIDTH}) * ${SCALE}`;
    }

    stageY (node) {
        if (node && node.type === 'Number') return num((HALF_HEIGHT - Number(node.value)) * SCALE);
        return `(${HALF_HEIGHT} - ${this.expr(node)}) * ${SCALE}`;
    }

    /**
     * A length (not a position): scaled, but not shifted or mirrored.
     * Parenthesised, because `0 - 10 * -3` is a precedence accident
     * waiting to happen and a literal `* -3` is not a spelling to rely on.
     */
    stageLength (node, {negate = false} = {}) {
        const literal = node && node.type === 'Number' ? Number(node.value) :
            (node && node.type === 'Unary' && node.op === '-' && node.argument.type === 'Number' ?
                -Number(node.argument.value) : null);
        if (literal !== null) return num(literal * (negate ? -SCALE : SCALE));
        const scaled = `(${this.expr(node)}) * ${SCALE}`;
        return negate ? `0 - ${scaled}` : scaled;
    }

    /**
     * The SVG for whatever art an argument names.
     *
     * Two shapes, and the template's TAG tells them apart: `img\`…\``
     * carries the pixels itself, `assets.image\`Jojojo\`` names an entry
     * in the project's .g.jres gallery.
     */
    artOf (node) {
        if (!node || node.type !== 'Template') return null;
        if (node.tag && /^assets\./.test(node.tag)) {
            const named = this.assets[node.value.trim()];
            return named ? imageToSvg(named) : null;
        }
        const image = parseImageLiteral(node.value);
        return image ? imageToSvg(image) : null;
    }

    isBooleanValue (value) {
        return super.isBooleanValue(value) || /^(touching |key .* pressed\?)/.test(value);
    }

    callExpression (node) {
        const name = this.path(node.callee);
        const a = node.args || [];
        switch (name) {
        case 'info.score': return 'score';
        case 'info.life': return 'lives';
        case 'scene.screenWidth': return String(HALF_WIDTH * 2);
        case 'scene.screenHeight': return String(HALF_HEIGHT * 2);
        case 'randint': return `pick random ${this.expr(a[0])} to ${this.expr(a[1])}`;
        case 'game.runtime': return 'timer * 1000';
        // A sprite KIND is a compile-time label; every Arcade game defines
        // a few, and reporting them as unsupported would bury the real
        // refusals under noise. A number is exactly what they are.
        case 'SpriteKind.create': return String(100 + (++this.kinds));
        default: {
            // `ball.overlapsWith(paddle)` is `touching paddle` — the one
            // sprite method that reports rather than acts.
            if (node.callee && node.callee.type === 'Member' && node.callee.name === 'overlapsWith') {
                const owner = this.resolveSprite(node.callee.object);
                const other = this.resolveSprite(a[0]);
                if (owner && other && owner === this.self) return `touching ${other.name}`;
                if (owner && other) {
                    this.unsupported.push(
                        `${owner.name}.overlapsWith(${other.name}) — only this sprite's own overlaps can be tested`);
                    return 'false';
                }
            }
            return super.callExpression(node);
        }
        }
    }

    /**
     * Property reads: `ball.x`, `ball.vx`, `sprite.width`.
     *
     * Positions come back in ARCADE units — `x position` is stage units,
     * so it is converted back — because the arithmetic around the read is
     * the game's own and speaks Arcade's coordinates. Mixing the two is
     * how a translated game ends up subtly, unreproducibly wrong.
     * Another sprite's position is readable (`x position of ball`) even
     * though writing it is not.
     */
    expr (node) {
        if (node && node.type === 'Member') {
            const owner = this.resolveSprite(node.object);
            if (owner) {
                const mine = owner === this.self;
                const suffix = mine ? '' : ` of ${owner.name}`;
                if (node.name === 'x') return `(x position${suffix} / ${SCALE} + ${HALF_WIDTH})`;
                if (node.name === 'y') return `(${HALF_HEIGHT} - y position${suffix} / ${SCALE})`;
                if (node.name === 'vx' || node.name === 'vy') return `${owner.name}_${node.name}`;
                this.unsupported.push(`${owner.name}.${node.name} — no stage equivalent`);
                return '0';
            }
        }
        return super.expr(node);
    }

    command (node, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        const name = this.path(node.callee);
        const a = node.args || [];

        // Methods on a sprite: `ball.say("hi")`, `sprite.destroy()`.
        if (node.callee && node.callee.type === 'Member') {
            const owner = this.resolveSprite(node.callee.object);
            if (owner) {
                this.spriteMethod(owner, node.callee.name, a, indent, out);
                return;
            }
        }

        switch (name) {
        case 'pause':
        case 'loops.pause':
            push(`wait ${a[0] && a[0].type === 'Number' ? num(Number(a[0].value) / 1000) : `(${this.expr(a[0])}) / 1000`} seconds`);
            return;

        case 'info.setScore':
            push(`set score to ${this.single(a[0], out, pad)}`);
            return;
        case 'info.changeScoreBy':
            push(`change score by ${this.single(a[0], out, pad)}`);
            return;
        case 'info.setLife':
            push(`set lives to ${this.single(a[0], out, pad)}`);
            return;
        case 'info.changeLifeBy':
            push(`change lives by ${this.single(a[0], out, pad)}`);
            return;

        case 'game.over':
        case 'game.gameOver':
            push('stop all');
            return;
        case 'game.splash':
        case 'game.showLongText':
            push(`say ${this.expr(a[0])} for 2 seconds`);
            return;

        case 'music.playTone':
        case 'music.play':
            push(this.note(`${name}() — Arcade's music has no stage equivalent`));
            return;

        default:
            super.command(node, indent, out);
        }
    }

    /** `<sprite>.<method>(...)` where <sprite> is a sprite we know. */
    spriteMethod (owner, method, args, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        if (owner !== this.self) {
            push(this.note(`${owner.name}.${method}() — Scratch scripts can only move their own sprite`));
            return;
        }
        switch (method) {
        case 'setPosition':
            push(`go to x: ${this.stageX(args[0])} y: ${this.stageY(args[1])}`);
            return;
        case 'say':
            push(args[1] ?
                `say ${this.expr(args[0])} for ${this.expr(args[1])} seconds` :
                `say ${this.expr(args[0])}`);
            return;
        case 'destroy':
            push('hide');
            return;
        case 'setImage':
            push('next costume');
            return;
        case 'setFlag':
        case 'startEffect':
        case 'setVelocity':
        case 'follow':
        case 'setStayInScreen':
            push(this.note(`sprite.${method}() — no stage equivalent`));
            return;
        default:
            push(this.note(`sprite.${method}()`));
        }
    }

    /** Assignments to sprite properties, before the generic handling. */
    expressionStatement (expr, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);

        if (expr.type === 'Assignment' && expr.left.type === 'Identifier' &&
            expr.right && expr.right.type === 'Call' && this.path(expr.right.callee) === 'sprites.create') {
            const owner = this.sprite(expr.left.name);
            if (owner) {
                this.pendingClone = owner.name;
                push(`# ${owner.name} is spawned here; in Scratch the parent is set up and then cloned`);
                return;
            }
        }

        if (expr.type === 'Assignment' && expr.left.type === 'Member') {
            const owner = this.resolveSprite(expr.left.object);
            if (owner) {
                const property = expr.left.name;
                if (owner !== this.self) {
                    push(this.note(`${owner.name}.${property} = … — a script can only change its own sprite`));
                    return;
                }
                if (property === 'x' || property === 'y') {
                    const isX = property === 'x';
                    if (expr.op === '=') {
                        push(`set ${isX ? 'x' : 'y'} to ${isX ? this.stageX(expr.right) : this.stageY(expr.right)}`);
                    } else {
                        const negate = !isX && expr.op === '+=';
                        push(`change ${isX ? 'x' : 'y'} by ${this.stageLength(expr.right, {negate: negate})}`);
                    }
                    return;
                }
                if (property === 'vx' || property === 'vy') {
                    owner.velocity = true;
                    const variable = `${owner.name}_${property}`;
                    this.declared.add(variable);
                    if (expr.op === '=') push(`set ${variable} to ${this.expr(expr.right)}`);
                    else push(`change ${variable} by ${this.expr(expr.right)}`);
                    return;
                }
                push(this.note(`sprite.${property} = …`));
                return;
            }
        }
        super.expressionStatement(expr, indent, out);
    }
}

/** `SpriteKind.Player` → "Player"; a user kind resolves the same way. */
const kindOf = node => {
    if (node && node.type === 'Member') return node.name;
    if (node && node.type === 'Identifier') return node.name;
    return 'Player';
};

/**
 * Translate a MakeCode Arcade project.
 *
 * @param {Object<string, string>|string} files the project's file map
 *   (main.ts plus any *.g.jres), or just main.ts
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @returns {{
 *   code: string,
 *   unsupported: Array<string>,
 *   costumes: Array<{sprite: string, name: string, svg: string, mode: string}>,
 *   sprites: Array<string>
 * }}
 */
export function arcadeToPseudocode (files, opts = {}) {
    const map = typeof files === 'string' ? {'main.ts': files} : (files || {});
    const source = map['main.ts'] || '';

    const assets = {};
    const tilemaps = {};
    for (const [filename, text] of Object.entries(map)) {
        if (/\.jres$/.test(filename)) Object.assign(assets, parseJres(text));
        if (/\.g\.ts$/.test(filename)) Object.assign(tilemaps, parseTilemaps(text));
    }

    const ast = parseMakeCodeTs(source);
    const t = new ArcadeTranslator(assets, tilemaps);
    const costumes = [];

    // ── pass 1: find the sprites, because everything else refers to them
    const registerSprite = (name, createCall) => {
        const art = t.artOf(createCall.args[0]);
        const sprite = {name, kind: kindOf(createCall.args[1]), velocity: false};
        t.sprites.push(sprite);
        if (art) costumes.push({sprite: name, name: `${name}-art`, svg: art, mode: 'replace'});
        return sprite;
    };

    /**
     * The backdrop becomes a SPRITE, not a Stage costume: the costume
     * route the Code tab uses (`applyCustomSVG`) deliberately skips the
     * Stage, and a full-screen sprite sent to the back looks the same
     * and actually arrives.
     */
    /**
     * Backdrop art: the first one becomes the sprite's costume, and every
     * one after it is added beside it.
     *
     * A game usually has both a background image and one or more levels,
     * and Scratch sprites hold many costumes — so they all arrive and the
     * user can switch between them, rather than the second one being
     * refused for having come second.
     */
    const backdropArt = (label, svg) => {
        if (!t.sprite('background')) {
            t.sprites.unshift({name: 'background', kind: 'Background', velocity: false, backdrop: true});
        }
        const existing = costumes.filter(c => c.sprite === 'background').length;
        if (existing >= MAX_BACKDROPS) {
            t.unsupported.push(`${label} — only the first ${MAX_BACKDROPS} backdrops are carried over`);
            return;
        }
        costumes.push({sprite: 'background', name: label, svg, mode: existing ? 'add' : 'replace'});
    };

    /**
     * A level becomes a picture of itself, painted tile by tile.
     *
     * Scratch has no scrolling tilemap, so what arrives is the level as an
     * image rather than terrain a sprite can collide with. Said once, in
     * the unsupported list, because it is the difference that matters.
     */
    const registerTilemap = node => {
        const name = node && node.type === 'Template' ? node.value.trim() : '';
        const tilemap = t.tilemaps[name];
        if (!tilemap) {
            t.unsupported.push(`tiles.setTilemap(${name || '…'}) — no such tilemap in this project`);
            return;
        }
        const image = renderTilemap(tilemap, t.assets);
        if (!image) {
            t.unsupported.push(`tiles.setTilemap(${name}) — the level's tiles could not be read`);
            return;
        }
        backdropArt(`level-${name}`, imageToSvg(image, {scale: 1}));
        t.unsupported.push('tiles.* — the level arrives as a picture, not as terrain a sprite collides with');
    };

    const registerBackground = node => {
        const art = t.artOf(node);
        if (!art) {
            t.unsupported.push('scene.setBackgroundImage() with art we could not read');
            return;
        }
        backdropArt('background', art);
    };

    /**
     * Backdrops are declared wherever the game happens to declare them —
     * a level is usually set inside a `setLevel()` function, not at the
     * top level — so this scan goes all the way down. Sprite creation
     * does NOT: one inside a body is a spawn, and pass 2 turns it into a
     * clone.
     */
    const visitCalls = (node, seen = new Set()) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (node.type === 'Call') {
            const called = t.path(node.callee);
            if (called === 'scene.setBackgroundImage') registerBackground(node.args[0]);
            if (called === 'tiles.setTilemap' || called === 'scene.setTileMapLevel') {
                registerTilemap(node.args[0]);
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(v => visitCalls(v, seen));
            else if (value && typeof value === 'object') visitCalls(value, seen);
        }
    };

    const walkForSprites = body => {
        for (const st of body) {
            if (st.type === 'Declaration') {
                for (const d of st.decls) {
                    if (d.init && d.init.type === 'Call' && t.path(d.init.callee) === 'sprites.create') {
                        registerSprite(d.name, d.init);
                    }
                }
            }
            if (st.type === 'ExpressionStatement' && st.expr.type === 'Assignment' &&
                st.expr.right && st.expr.right.type === 'Call' &&
                t.path(st.expr.right.callee) === 'sprites.create' &&
                st.expr.left.type === 'Identifier') {
                registerSprite(st.expr.left.name, st.expr.right);
            }
            if (st.type === 'Enum') t.statement(st, 0, []);
            if (st.type === 'FunctionDeclaration') t.functions.push({name: st.name, params: st.params, body: st.body});
        }
    };
    walkForSprites(ast.body);
    ast.body.forEach(st => visitCalls(st));
    for (const st of ast.body) {
        if (st.type === 'ExpressionStatement' && st.expr.type === 'Call') {
            for (const arg of st.expr.args || []) {
                if (arg.type === 'FunctionExpression') walkForSprites(arg.body);
            }
        }
    }

    if (!t.sprites.length) t.sprites.push({name: 'Game', kind: 'Player', velocity: false});

    /** Where ownerless scripts and top-level setup go — never the backdrop. */
    const mainSprite = t.sprites.find(s => !s.backdrop) || t.sprites[0];

    // ── pass 2: scripts, each landing on the sprite it talks about
    /** name → array of script line-blocks */
    const scriptsFor = new Map(t.sprites.map(s => [s.name, []]));
    const setup = [];

    /** Which sprite a body is about: the first one it mentions. */
    const ownerOf = body => {
        let found = null;
        const visit = node => {
            if (!node || found || typeof node !== 'object') return;
            if (node.type === 'Identifier' && t.sprite(node.name)) {
                found = t.sprite(node.name);
                return;
            }
            for (const value of Object.values(node)) {
                if (Array.isArray(value)) value.forEach(visit);
                else if (value && typeof value === 'object') visit(value);
            }
        };
        body.forEach(visit);
        return found || mainSprite;
    };

    /**
     * @param {object} owner the sprite this script lives on
     * @param {Array<string>} header the lines above the body
     * @param {Array} body statements
     * @param {object} [options]
     * @param {number} [options.indent] nesting depth of the body — NOT
     *   header.length, because a header line can be a comment or a `wait`
     *   rather than a level of nesting.
     */
    const emitScript = (owner, header, body, {aliases = {}, indent = header.length} = {}) => {
        t.self = owner;
        t.aliases = new Map(Object.entries(aliases));
        const lines = [...header];
        t.block(body, indent, lines);
        scriptsFor.get(owner.name).push(lines);
        t.self = null;
        t.aliases = new Map();
    };

    for (const st of ast.body) {
        if (st.type === 'Enum' || st.type === 'FunctionDeclaration') continue;
        const call = st.type === 'ExpressionStatement' && st.expr.type === 'Call' ? st.expr : null;
        const name = call ? t.path(call.callee) : null;
        const handler = call ? (call.args || []).find(arg => arg.type === 'FunctionExpression') : null;

        if (name === 'game.onUpdate' && handler) {
            const owner = ownerOf(handler.body);
            emitScript(owner, ['WHEN flag clicked:', '  FOREVER:'], handler.body);
            continue;
        }
        if (name === 'game.onUpdateInterval' && handler) {
            const owner = ownerOf(handler.body);
            const seconds = call.args[0] && call.args[0].type === 'Number' ?
                num(Number(call.args[0].value) / 1000) : '1';
            emitScript(owner, ['WHEN flag clicked:', '  FOREVER:', `    wait ${seconds} seconds`],
                handler.body, {indent: 2});
            continue;
        }
        if (name === 'sprites.onOverlap' && handler) {
            // The handler's two parameters are "me" and "the other one";
            // in Scratch that is this sprite and a `touching` test.
            const mine = t.sprites.find(s => s.kind === kindOf(call.args[0])) || mainSprite;
            const other = t.sprites.find(s => s.kind === kindOf(call.args[1]));
            const params = handler.params || [];
            const aliases = {};
            if (params[0]) aliases[params[0]] = mine.name;
            if (params[1] && other) aliases[params[1]] = other.name;
            const target = other ? other.name : kindOf(call.args[1]);
            emitScript(mine, [
                `# sprites.onOverlap(${kindOf(call.args[0])}, ${kindOf(call.args[1])})`,
                'WHEN flag clicked:',
                '  FOREVER:',
                `    IF touching ${target} THEN:`
            ], handler.body, {aliases, indent: 3});
            continue;
        }
        if (name === 'controller.moveSprite') {
            const owner = t.resolveSprite(call.args[0]) || mainSprite;
            const vx = call.args[1] ? Math.round((Number(call.args[1].value) || 100) / 20) : 5;
            const vy = call.args[2] ? Math.round((Number(call.args[2].value) || 0) / 20) : 0;
            const lines = ['# controller.moveSprite — the arrow keys, at the same speed',
                'WHEN flag clicked:', '  FOREVER:'];
            if (vx) {
                lines.push('    IF key right arrow pressed? THEN:', `      change x by ${vx}`);
                lines.push('    IF key left arrow pressed? THEN:', `      change x by 0 - ${vx}`);
            }
            if (vy) {
                lines.push('    IF key up arrow pressed? THEN:', `      change y by ${vy}`);
                lines.push('    IF key down arrow pressed? THEN:', `      change y by 0 - ${vy}`);
            }
            scriptsFor.get(owner.name).push(lines);
            continue;
        }
        if (/^controller\.(\w+)\.on(Event|Pressed)$/.test(name || '') && handler) {
            const button = /^controller\.(\w+)\./.exec(name)[1];
            const key = CONTROLLER_KEYS[button] || 'space';
            const owner = ownerOf(handler.body);
            emitScript(owner, [`WHEN ${key} key pressed:`], handler.body);
            continue;
        }
        if (name === 'scene.setBackgroundImage') continue;    // handled in pass 1
        if (name === 'tiles.setTilemap' || name === 'scene.setTileMapLevel') continue;
        if (name && /^(tiles|scene)\.(set|place)/.test(name)) {
            t.unsupported.push(`${name}() — tilemaps have no stage equivalent`);
            continue;
        }

        // A declaration that creates a sprite was consumed by pass 1;
        // re-emitting it would be a variable set to a sprite that is
        // already a sprite.
        if (st.type === 'Declaration') {
            // Drop both `let ball = sprites.create(...)` and the
            // `let ball: Sprite = null` that MakeCode hoists above it:
            // pass 1 already made `ball` a sprite, and a variable of the
            // same name beside it would only confuse the reader.
            const remaining = st.decls.filter(d => !t.sprite(d.name) &&
                !(d.init && d.init.type === 'Call' && t.path(d.init.callee) === 'sprites.create'));
            if (!remaining.length) continue;
            t.self = mainSprite;
            t.statement({type: 'Declaration', kind: st.kind, decls: remaining}, 1, setup);
            t.self = null;
            continue;
        }
        if (st.type === 'ExpressionStatement' && st.expr.type === 'Assignment' &&
            st.expr.right && st.expr.right.type === 'Call' &&
            t.path(st.expr.right.callee) === 'sprites.create') {
            continue;
        }

        // Anything else at the top level is setup, and runs on the sprite
        // it concerns.
        t.self = mainSprite;
        t.statement(st, 1, setup);
        t.self = null;
    }

    // Velocity becomes a motion loop, once per sprite that has one.
    for (const sprite of t.sprites) {
        if (!sprite.velocity) continue;
        scriptsFor.get(sprite.name).push([
            '# sprite.vx / vy — Arcade integrates these every frame',
            'WHEN flag clicked:',
            '  FOREVER:',
            `    change x by ${sprite.name}_vx / ${VELOCITY_DIVISOR}`,
            `    change y by 0 - ${sprite.name}_vy / ${VELOCITY_DIVISOR}`
        ]);
    }

    // ── assemble
    const out = [];
    out.push('DEVICE ARCADE', '');
    if (opts.name) out.push(`# Imported from MakeCode Arcade: ${opts.name}`);
    out.push('# Arcade is 160x120 with y downwards; the stage is 480x360 centred,',
        `# so positions are scaled x${SCALE} and y is mirrored.`, '');

    t.sprites.forEach(sprite => {
        out.push(`SPRITE ${sprite.name}:`);
        const scripts = scriptsFor.get(sprite.name);
        if (sprite === mainSprite && setup.length) out.push('WHEN flag clicked:', ...setup, '');
        for (const script of scripts) out.push(...script, '');
        if (sprite.backdrop) {
            out.push('WHEN flag clicked:', '  go to x: 0 y: 0', '  go to back', '  show', '');
        } else if (!scripts.length && !(sprite === mainSprite && setup.length)) {
            out.push('WHEN flag clicked:', '  show', '');
        }
    });

    for (const fn of t.functions) {
        const signature = fn.params && fn.params.length ?
            `${fn.name} ${fn.params.map(p => `(${p})`).join(' ')}` : fn.name;
        const lines = [`DEFINE ${signature}:`];
        t.self = mainSprite;
        t.block(fn.body, 1, lines);
        t.self = null;
        out.push(...lines, '');
    }

    return {
        code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)],
        costumes,
        sprites: t.sprites.map(s => s.name)
    };
}

export default arcadeToPseudocode;
