import {applyDeclaredValueType} from './declared-value-types.js';
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
 * Native routes preserve supported typed sprites, Images, arrays, animation
 * objects and tile data as editable blocks, with matching Arcade VM APIs and
 * PXT export. Older fixed-target routes remain for their supported subsets.
 * Directional wall contacts and tested tile collision movement are implemented.
 * Terrain events, scrolling cameras, full physics parity, some effects/music
 * and external packages remain named diagnostics. Consult the conversion
 * capability inventory and regression reports for the exact tested subsets.
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

import {decodeTilemap, parseNativeTilemaps} from './tilemap-values.js';
import {LEGACY_PARSE_SOURCE, LEGACY_JSON_SOURCE, ARRAY_ACCESS_SOURCE} from './legacy-array-values.js';
import {prepareAnimationImport} from '../bw-animation-import.js';
import {ValueTypeGraph} from './value-type-graph.js';
import {lowerLazyValues} from './lower-lazy-values.js';
import {lowerNamespaceBindings} from './namespace-bindings.js';
import {lowerStaticCallbackHelpers} from './static-callback-helpers.js';
import {arcadeProjectSource} from './project-source.js';
import {parseMakeCodeTs} from './ts-import.js';
import {BaseTranslator, bodyOf, num, tsText} from './translate-base.js';
import {
    parseImageLiteral,
    parseJres,
    parseTilemaps,
    renderTilemap,
    decodeMkcdImage,
    imageToSvg,
    ARCADE_PALETTE
} from './arcade-assets.js';
import {svgToPixels} from './pixel-image.js';
import {parseAnimationJres} from './arcade-animation-assets.js';
import {BUILTIN_IMAGES} from './arcade-builtin-images.js';
import {ANIMATION_COMPANION_PATH, recoverAnimationCompanion} from './animation-companion.js';
import {HELPERS} from './arcade-runtime.js';
/** `sprites.castle`, `sprites.dungeon`, … : the namespaces PXT's built-in art lives in. */
const BUILTIN_IMAGE_GROUPS = new Set(Object.keys(BUILTIN_IMAGES).map(key => key.slice(0, key.lastIndexOf('.'))));

// MakeCode's true and false in a value position (see expr's Boolean case).
const ARCADE_TRUE = '(compare value (0) op "<" with (1))';
const ARCADE_FALSE = '(compare value (1) op "<" with (0))';
const DELEGATE = Symbol('base statement');
// MakeCode text as a dialect string literal, exactly. The dialect decodes
// only \n \t \r \\ and \" inside quotes (it keeps \f, \b and \uXXXX as
// literal text) and reads any other character as itself, so those five are
// escaped and every other character is written raw. (The base translator's
// literal turns a newline into a space, a micro:bit display convention.)
const ESCAPES = {'"': '\\"', '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\t': '\\t'};
const arcadeTextLiteral = text => `"${String(text).replace(/["\\\n\r\t]/g, c => ESCAPES[c])}"`;
// A Scratch predicate the base translator writes (`key a pressed?`,
// `touching x?`): a condition, never a value (quoted text is not one).
const isScratchPredicate = text => typeof text === 'string' && !/^["(]/.test(text.trim()) && /\?$/.test(text.trim());
// A TypeScript expression whose value is a truth value, written by the base
// translator in the CONDITION grammar (`not (…)`, `a < b`, `(…) and (…)`).
const isTruthNode = node => !!node && (
    (node.type === 'Binary' && ['==', '===', '!=', '!==', '<', '>', '<=', '>=', '&&', '||'].includes(node.op)) ||
    (node.type === 'Unary' && node.op === '!'));
// What expr() hands back for a call that is a CONDITION in the dialect: a
// Scratch predicate (`key left arrow pressed?`, `touching ball`), or the
// comparison `info.playerN.hasLife()` is. Never a Boolean reporter WORD
// (`arcade a overlaps b`): those are values (docs/BOOLEAN-IN-VALUE-POSITION.md).
const isConditionCall = (node, text) => node?.type === 'Call' && typeof text === 'string' &&
    (isScratchPredicate(text) || /^touching /.test(text) || /^\S+ > 0$/.test(text));

/** Arcade pixels → stage units. 160x120 scaled by 3 is 480x360 exactly. */
const SCALE = 3;
const HALF_WIDTH = 80;
const HALF_HEIGHT = 60;

// Pinned game/sprite.ts: obstacle slots are left, top, right, bottom.
const COLLISION_DIRECTIONS = Object.freeze({Left:0, Top:1, Right:2, Bottom:3});
const CAMERA_PROPERTIES = Object.freeze({X:0, Y:1, Left:2, Right:3, Top:4, Bottom:5});
const BUTTON_EVENTS = Object.freeze({Pressed:2049, Released:2048, Repeated:2054});

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

/**
 * How many animation frames to carry onto one sprite. A platformer with
 * eleven animations of eight frames would hand the paint editor ninety
 * costumes; the ones past the cap are named in the unsupported list.
 */
const MAX_ANIMATION_FRAMES = 24;

/**
 * Which variables a player's score and lives live in.
 *
 * MakeCode's plain `info.setScore()` IS player one, so player one shares
 * the variables that API already uses and only players two to four get a
 * suffix. A game that mixes both — and the pong here does — then reads
 * and writes one set of variables rather than two that drift apart.
 */
/**
 * Properties that only make sense on a sprite. A read of one of these on
 * something we cannot resolve is reported rather than turned into a
 * variable of that name — see the note in expr().
 */
const SPRITE_PROPERTIES = new Set([
    'x', 'y', 'vx', 'vy', 'ax', 'ay', 'fx', 'fy', 'sx', 'sy', 'scale',
    'width', 'height', 'left', 'right', 'top', 'bottom',
    'image', 'kind', 'lifespan', 'z', 'rotation', 'rotationDegrees', 'data'
]);

const playerVar = (base, player) => (player > 1 ? `${base}${player}` : base);

/** `info.player3` → 3; `info` → 1. */
const playerOf = path => {
    const match = /^info\.player(\d)\b/.exec(path || '');
    return match ? Number(match[1]) : 1;
};

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
        this.handleTemplates = null;     // enabled for creation-event projects
        this.projectileTemplates = new Map(); // projectile calls inside functions
        this.handleAliases = new Map();  // callback parameter -> event handle
        this.handleVars = new Set();      // MakeCode variables holding handles
        this.localHandleVars = new Set(); // function locals holding sprite handles
        this.parameterHandleVars = new Set(); // procedure arguments holding sprite handles
        this.destroyedInstanceHandlers = new Map();
        this.createdRegistrations = new Map();
        this.terrainRegistrations = new Map();
        this.capturedBindings = new Map();
        this.localVars = null;
        this.stringVars = new Set();
        this.imageValueResources = new Map();
        this.handleImageArrays = null;   // image array name -> costume range
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

    handleRef (node) {
        if (node?.type === 'Index' && this.spriteReferences?.has(node)) return this.expr(node);
        if (node?.type === 'Call' && this.handleTemplates && this.spriteReferences?.has(node)) return this.expr(node);
        if (node?.type !== 'Identifier') return null;
        if (this.handleTemplates && node.temporary && this.spriteReferences?.has(node)) return this.expr(node);
        if (this.localVars?.has(node.name)) {
            return this.localHandleVars.has(node.name) || (this.handleTemplates && this.spriteReferences?.has(node)) ? `arcade local ${this.currentParameters?.has(node.name)?this.varName(node.name):node.name}` : null;
        }
        if (this.capturedBindings.has(node.name) && this.spriteReferences?.has(node)) return `arcade captured ${this.capturedBindings.get(node.name)}`;
        return this.handleAliases.get(node.name) ||
            (this.parameterHandleVars.has(node.name) ? this.varName(node.name) : null) ||
            (this.handleVars.has(node.name) ? this.varName(node.name) :
                this.handleTemplates && this.spriteReferences?.has(node) ? this.expr(node) : null);
    }

    claimNames(node, seen = new Set()) {
        super.claimNames(node, seen);
        if (node?.type !== 'Program') return;
        this.boundSourceGlobals=new Set(node.body.filter(st=>st.type==='Declaration').flatMap(st=>st.decls.map(decl=>decl.name)));
        this.sourceFunctions=new Map(node.body.filter(fn=>fn.type==='FunctionDeclaration').map(fn=>[fn.name,fn]));
        const references = inferImageReferences(node, value => this.path(value), value => this.imageOf(value));
        this.imageReferences = references.images;this.spriteReferences = references.sprites;this.dataReferences = references.data;
        this.playerReferences=references.players;this.sceneReferences=references.scenes;this.physicsEngineReferences=references.physicsEngines;this.tileReferences = references.tiles;this.legacyTileReferences=references.legacyTiles;this.animationReferences = references.animations;this.nullReferences=references.nulls;this.arrayReferences = references.arrays;this.numberReferences=references.numbers;this.stringReferences=references.strings;this.booleanReferences=references.booleans;
        this.inferredSpriteParameters = references.parameters;
        this.spriteResultFunctions = references.spriteFunctions;
        this.spriteResultBindings = new Set();
        const bindings = [];
        const collectBindings = value => {
            if (!value || typeof value !== 'object') return;
            if (value.type === 'Declaration') for (const decl of value.decls) bindings.push([decl.name,decl.init]);
            if (value.type === 'Assignment' && value.op === '=' && value.left?.type === 'Identifier') bindings.push([value.left.name,value.right]);
            for (const child of Object.values(value)) {
                if (Array.isArray(child)) child.forEach(collectBindings);
                else if (child && typeof child === 'object') collectBindings(child);
            }
        };
        collectBindings(node);
        let added;
        do {
            added = false;
            for (const [name,value] of bindings) if (!this.spriteResultBindings.has(name) &&
                (value?.type === 'Call' && value.callee?.type === 'Identifier' && references.spriteFunctions.has(value.callee.name) ||
                    value?.type === 'Identifier' && this.spriteResultBindings.has(value.name))) {
                this.spriteResultBindings.add(name);added = true;
            }
        } while (added);
        this.sceneStackProgram=containsAst(node,value=>value.type==='Call' && /^(?:mp\.(?:onButtonEvent|getPlayerState|setPlayerState|changePlayerStateBy)|game\.(?:pushScene|popScene|addScenePushHandler|addScenePopHandler|removeScenePushHandler|removeScenePopHandler))$/.test(this.path(value.callee)||''));
        this.nativeInfoProgram=this.sceneStackProgram || containsAst(node,value=>value.type==='Call' && isInfoRegistration(this.path(value.callee)));
        const registrations=discoverRuntimeRegistrations(node,this);
        this.createdRegistrations=new Map([...registrations].filter(([,record])=>record.kind==='creation'));
        this.terrainRegistrations=new Map([...registrations].filter(([,record])=>['wall','tile','legacyWall'].includes(record.kind)));
        this.sceneRegistrations=new Map([...registrations].filter(([,record])=>!['creation','wall','tile','legacyWall'].includes(record.kind)));
        this.returnFunctions = new Map();
        const hasReturn = value => value && typeof value === 'object' &&
            (value.type === 'Return' || (!['FunctionDeclaration', 'FunctionExpression'].includes(value.type) &&
                Object.values(value).some(child=>Array.isArray(child)?child.some(hasReturn):hasReturn(child))));
        const hasBareReturn = value => value && typeof value === 'object' &&
            (value.type === 'Return' ? !value.value : !['FunctionDeclaration','FunctionExpression'].includes(value.type) &&
                Object.values(value).some(child=>Array.isArray(child)?child.some(hasBareReturn):hasBareReturn(child)));
        const returnsOnAllPaths = body => (body || []).some(st=>st.type==='Return' ||
            st.type==='Block' && returnsOnAllPaths(st.body) ||
            st.type==='If' && returnsOnAllPaths(st.consequent) && returnsOnAllPaths(st.alternate));
        for (const fn of node.body) if (fn.type === 'FunctionDeclaration' && fn.body.some(hasReturn)) {
            this.returnFunctions.set(fn.name,{...fn,unsupportedUndefined:fn.body.some(hasBareReturn) || !returnsOnAllPaths(fn.body)});
        }

    }

    imageRef(node, allowValueCall = true) {
        const background = this.imageValueResources.get(node);
        if (background) {
            const resource = `arcade frame image array "${background.key}" index (${background.value ? this.expr(background.value) : 0}) template "${background.name}" start 0 count ${background.count || 1}`;
            return background.fresh ? `arcade copy image (${resource})` : resource;
        }
        if (node?.type === 'Call' && this.path(node.callee) === 'scene.backgroundImage' && !node.args?.length) return 'arcade background image';
        if (node?.type === 'Call' && this.path(node.callee) === 'image.create' && node.args?.length === 2) {
            return `arcade new image width (${this.expr(node.args[0])}) height (${this.expr(node.args[1])})`;
        }
        if (node?.type === 'Call' && node.callee?.type === 'Member' && node.callee.name === 'clone' && !node.args?.length) {
            const image = this.imageRef(node.callee.object);
            if (image) return `arcade copy image (${image})`;
        }
        if (node?.type === 'Member' && node.name === 'image') {
            if (this.handleTemplates && this.animationReferences?.has(node.object)) return this.expr(node);
            const handle = this.handleRef(node.object);
            if (handle) return `arcade image of ${handle}`;
        }
        if (node?.type === 'Index' && this.imageReferences?.has(node)) {
            if(this.canonicalFrameArrays?.has(node.object?.name))return null;
            return this.expr(node);
        }
        if (allowValueCall && node?.type === 'Call' && this.imageReferences?.has(node)) return this.expr(node);
        return node?.type === 'Identifier' && this.imageReferences?.has(node) ? this.expr(node) : null;
    }

    /** An x coordinate in Arcade units, as a stage-unit expression. */
    stageX (node) {
        if (node && node.type === 'Number') return num((Number(node.value) - HALF_WIDTH) * SCALE);
        return `(${this.side(node, '-', false)} - ${HALF_WIDTH}) * ${SCALE}`;
    }

    stageY (node) {
        if (node && node.type === 'Number') return num((HALF_HEIGHT - Number(node.value)) * SCALE);
        return `(${HALF_HEIGHT} - ${this.side(node, '-', true)}) * ${SCALE}`;
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
        const image = this.imageOf(node);
        return image ? imageToSvg(image) : null;
    }

    /**
     * The decoded image behind an art argument, not its SVG.
     *
     * Kept separate because the SIZE is worth knowing on its own: a game
     * asks a sprite for its `width` to do bounds arithmetic, and since we
     * decoded the picture to make the costume, that number is exact
     * rather than a guess.
     */
    imageOf (node) {
        const tileAsset = node?.type === 'Member' && ['myTiles','assets','tiles'].includes(this.path(node.object)) && this.assets[node.name];
        if(tileAsset)return tileAsset;
        const builtIn = node?.type === 'Member' && BUILTIN_IMAGES[this.path(node)];
        if (builtIn) return decodeMkcdImage(builtIn);
        if (!node || node.type !== 'Template' || !(node.tag === 'img' || /^assets\./.test(node.tag || ''))) return null;
        if (node.tag && /^assets\./.test(node.tag)) {
            return this.assets[node.value.trim()] || null;
        }
        return parseImageLiteral(node.value);
    }

    /**
     * An array REFERENCE (a value a variable holds), as the value-type graph
     * says, unless the name was declared as a named Scratch list on the
     * fixed-sprite path (\`new array "frameList"\`): then the list's own
     * blocks read it, and a reference read would find an unset variable.
     */
    isArrayReference (node) {
        if (!this.arrayReferences?.has(node)) return false;
        return !(node?.type === 'Identifier' && this.arrays?.has(node.name) && !this.handleTemplates);
    }

    isBooleanValue (value) {
        return super.isBooleanValue(value) || /^(touching |key .* pressed\?|arcade .* overlaps |arcade images overlap )/.test(value);
    }

    mathOperand (node) {
        const value = this.expr(node);
        return /^[^\s()]+$/.test(value) ? value : `(${value})`;
    }

    single(node, out, pad) {
        if (node?.type === 'Identifier' && (this.currentParameters?.has(node.name) || this.localVars?.has(node.name))) return `(${this.expr(node)})`;
        return super.single(node, out, pad);
    }

    // Boolean contexts use branches. Scratch's operator_and/operator_or
    // evaluate both inputs eagerly, including procedure calls and array reads.
    hasLazyCondition(node) {
        return node?.type==='Binary' && ['&&','||'].includes(node.op) ||
            node?.type==='Unary' && node.op==='!' && this.hasLazyCondition(node.argument);
    }
    predicateBranches(node, indent, out, yes, no) {
        if(node?.type==='Unary' && node.op==='!') {
            this.predicateBranches(node.argument,indent,out,no,yes);return;
        }
        if(node?.type==='Binary' && node.op==='&&') {
            this.predicateBranches(node.left,indent,out,
                depth=>this.predicateBranches(node.right,depth,out,yes,no),no);return;
        }
        if(node?.type==='Binary' && node.op==='||') {
            this.predicateBranches(node.left,indent,out,yes,
                depth=>this.predicateBranches(node.right,depth,out,yes,no));return;
        }
        out.push(`${'  '.repeat(indent)}IF ${this.condition(node)} THEN:`);
        yes(indent+1);out.push(`${'  '.repeat(indent)}ELSE:`);no(indent+1);
    }
    predicateCell(node,indent,out,name) {
        this.predicateBranches(node,indent,out,
            depth=>out.push(`${'  '.repeat(depth)}arcade set local ${name} to (1)`),
            depth=>out.push(`${'  '.repeat(depth)}arcade set local ${name} to (0)`));
    }
    /**
     * A statement, with its own lines-before (this.pre) also for the
     * statements written here rather than by the base translator: a truth
     * value in one of their value slots is chosen into a variable on the
     * lines before it (see truthAsValue), and those lines are THIS
     * statement's, not the enclosing one's.
     */
    statement(st, indent, out) {
        const outerPre=this.pre,mark=out.length;
        this.pre=[];
        let delegated=false;
        try {
            delegated=this.arcadeStatement(st,indent,out)===DELEGATE;
            if(this.pre.length)out.splice(mark,0,...this.pre.map(line=>`${'  '.repeat(indent)}${line}`));
        } finally {
            this.pre=outerPre;
        }
        if(delegated)super.statement(st,indent,out);
    }
    arcadeStatement(st, indent, out) {
        const target=st?.type==='ExpressionStatement' && st.expr?.type==='Assignment' && st.expr.left;
        if(target?.type==='Member' && (this.physicsEngineReferences?.has(target.object) || this.sceneReferences?.has(target.object))) {
            const n=st.expr,pad='  '.repeat(indent);
            if(this.sceneReferences?.has(target.object) && target.name==='physicsEngine' && n.op==='=' && !['Null','Undefined'].includes(n.right?.type) && this.physicsEngineReferences?.has(n.right)) {
                out.push(`${pad}arcade set physics engine of scene (${this.expr(target.object)}) to (${this.expr(n.right)})`);return;
            }
            if(this.physicsEngineReferences?.has(target.object) && ['maxSpeed','minStep','maxStep'].includes(target.name) && n.op==='=') {
                out.push(`${pad}arcade set physics engine property ${target.name} of (${this.expr(target.object)}) to (${this.expr(n.right)})`);return;
            }
            const owner=this.physicsEngineReferences?.has(target.object)?'PhysicsEngine':'Scene';
            out.push(`${pad}${this.note(`Arcade ${owner}.${target.name} assignment ${n.op} is not supported`)}`);return;
        }
        if(this.handleTemplates && st.type==='ExpressionStatement' && st.expr?.type==='Assignment' && st.expr.left?.temporary) {
            out.push(`${'  '.repeat(indent)}arcade set local ${st.expr.left.name} to (${this.arrayElementValue(st.expr.right)})`);return;
        }
        if(this.handleTemplates && ['If','While','For'].includes(st.type) && this.hasLazyCondition(st.test)) {
            let name;do {name=`__bwCondition${++this.temps}`;} while(this.taken?.has(name));
            this.taken?.add(name);
            const pad='  '.repeat(indent),read=`not (arcade local ${name} = 0)`;
            if(st.type==='For' && st.init)this.statement(st.init,indent,out);
            this.predicateCell(st.test,indent,out,name);
            if(st.type==='If') {
                out.push(`${pad}IF ${read} THEN:`);this.block(st.consequent,indent+1,out);
                if(st.alternate?.length){out.push(`${pad}ELSE:`);this.block(st.alternate,indent+1,out);}
            } else {
                out.push(`${pad}REPEAT UNTIL not (${read}):`);this.block(st.body,indent+1,out);
                if(st.type==='For' && st.update)this.statement({type:'ExpressionStatement',expr:st.update},indent+1,out);
                this.predicateCell(st.test,indent+1,out,name);
            }
            return;
        }
        if (st.type==='Declaration' && this.handleTemplates) {
            const pad='  '.repeat(indent);
            for(const d of st.decls){
                const gaps=this.unsupported.length;
                let value=d.init?this.arrayElementValue(d.init):d.isArray?this.expr({type:'Undefined'}):'0';
                // An array we could not translate (already named as a gap) stands in as an
                // EMPTY array, so \`for (const t of unknownArrayFactory())\` runs no times
                // instead of failing at run time on "Array reference is null or expired".
                if(d.isArray && d.init && value==='0' && this.unsupported.length>gaps)value='new array reference from ("[]")';
                if(d.temporary || this.localVars?.has(d.name))out.push(`${pad}arcade set local ${d.name} to (${value})`);
                else out.push(`${pad}set ${this.varName(d.name)} to (${value})`);
            }
            return;
        }
        if(st.type==='ExpressionStatement' && st.expr?.type==='Assignment' && st.expr.op==='=' && st.expr.left?.type==='Identifier' && this.isArrayReference(st.expr.left)) {
            const name=st.expr.left.name,value=this.expr(st.expr.right),pad='  '.repeat(indent);
            out.push((st.expr.left.temporary || this.localVars?.has(name))?`${pad}arcade set local ${name} to (${value})`:`${pad}set ${this.varName(name)} to ${value}`);return;
        }
        if(this.handleTemplates && st.type==='ExpressionStatement' && st.expr?.type==='Assignment' && st.expr.left?.type==='Member' && this.animationReferences?.has(st.expr.left.object)) {
            const n=st.expr,l=n.left;
            if(l.name==='interval' && n.op==='=')out.push(`${'  '.repeat(indent)}arcade set animation interval (${this.expr(l.object)}) to (${this.expr(n.right)})`);
            else out.push(`${'  '.repeat(indent)}${this.note(`animation.Animation.${l.name} assignment ${n.op} requires animation property mutation support`)}`);
            return;
        }
        if(st.type==='ExpressionStatement' && st.expr?.type==='Assignment' && st.expr.left?.type==='Member' && st.expr.left.name==='length' && this.isArrayReference(st.expr.left.object)) {
            const n=st.expr,l=n.left,value=n.op==='='?this.expr(n.right):`(${this.expr(l)}) ${n.op.slice(0,-1)} (${this.expr(n.right)})`;
            out.push(`${'  '.repeat(indent)}mutate array reference (${this.expr(l.object)}) op "length" index (0) value (${value})`);return;
        }
        if (st.type==='ExpressionStatement' && st.expr?.type==='Assignment' && st.expr.left?.type==='Index' && this.isArrayReference(st.expr.left.object)) {
            const n=st.expr,l=n.left;const value=n.op==='='?this.arrayElementValue(n.right):this.expr({type:'Binary',op:n.op.slice(0,-1),left:l,right:n.right});
            out.push(`${'  '.repeat(indent)}mutate array reference (${this.expr(l.object)}) op "set" index (${this.expr(l.index)}) value (${value})`);return;
        }
        if(st.type==='ExpressionStatement' && st.expr?.type==='Call' && st.expr.callee?.type==='Member' && this.isArrayReference(st.expr.callee.object)) {
            const n=st.expr,op=n.callee.name,a=n.args||[];
            if(['push','unshift','insertAt','set','removeAt','removeElement','pop','shift','reverse'].includes(op)) {
                const index=['insertAt','set','removeAt'].includes(op)?this.expr(a[0]):'0';
                const value=['insertAt','set'].includes(op)?this.arrayElementValue(a[1]):['push','unshift','removeElement'].includes(op)?this.arrayElementValue(a[0]):'0';
                out.push(`${'  '.repeat(indent)}mutate array reference (${this.expr(n.callee.object)}) op "${op}" index (${index}) value (${value})`);return;
            }
        }
        if (st.type === 'For' && st.init?.type === 'Declaration' && this.localVars?.has(st.init.decls[0]?.name)) {
            this.statement(st.init,indent,out);
            out.push(`${'  '.repeat(indent)}REPEAT UNTIL not (${this.repeatedCondition(st.test)}):`);
            this.block(st.body,indent+1,out);
            if(st.update)this.expressionStatement(st.update,indent+1,out);
            return;
        }
        if (st.type === 'Return') {out.push(`${'  '.repeat(indent)}arcade return value (${st.value ? this.arrayElementValue(st.value) : 'undefined value'})`);return;}
        return DELEGATE;
    }

    varName(name) {
        if(this.handleTemplates && String(name).toLowerCase()==='score') {
            if(!this.renamed)this.renamed=new Map();
            if(!this.renamed.has(String(name))){let mapped='score_';while(this.taken?.has(mapped))mapped+='_';this.renamed.set(String(name),mapped);}
            return this.renamed.get(String(name));
        }
        return super.varName(name);
    }
    condition (node) {
        // The node being written as a condition is not a value: expr() on
        // it (the base condition() calls it) writes the condition grammar.
        const outer=this.conditionNode;
        this.conditionNode=node;
        try {
            return this.conditionInner(node);
        } finally {
            this.conditionNode=outer;
        }
    }
    conditionInner (node) {
        // MakeCode true/false. condition() results are also written into
        // value slots (assignments, arguments), where the dialect has no value
        // form for a comparison (it warns and keeps the text), so a word that
        // reports a real boolean carries it (E0).
        if(this.handleTemplates && node?.type==='Boolean')return node.value?ARCADE_TRUE:ARCADE_FALSE;
        // \`!x\` AS A CONDITION is the dialect's \`not\`; E9's \`x === false\` value form is
        // for value slots only. Written through it, Lite's own export (\`while (!(!c))\`)
        // came back as nested value comparisons and lost every operator_not.
        if(this.handleTemplates && node?.type==='Unary' && node.op==='!') {
            const inner=node.argument;
            if(inner?.type==='Unary' && inner.op==='!')return this.condition(inner.argument);
            return `not (${this.condition(inner)})`;
        }
        if(node?.type==='Index' && this.isArrayReference(node.object))
            return `truthiness of item (${this.expr(node.index)}) of array reference (${this.expr(node.object)})`;
        if(this.handleTemplates && node && node.type!=='Boolean' &&
            !(node.type==='Binary' && ['==','!=','===','!==','<','>','<=','>=','&&','||'].includes(node.op)) &&
            !(node.type==='Unary' && node.op==='!')) {
            const value=this.expr(node);
            // A Scratch predicate (`key left arrow pressed?`) is already a
            // condition; in a value slot the dialect would keep it as text.
            if(isScratchPredicate(value))return value;
            this.usesArrays=true;return `truthiness of value (${node?.type==='Number' ? `(0 + (${value}))` : value})`;
        }
        return super.condition(node);
    }

    /** A value word reporting JavaScript's truthiness of node (a real boolean). */
    truthValue (node) {
        if(node?.type==='Boolean')return node.value?ARCADE_TRUE:ARCADE_FALSE;
        if(node?.type==='Binary' && ['==','!=','===','!==','<','>','<=','>='].includes(node.op) ||
            node?.type==='Unary' && node.op==='!')return this.expr(node);
        return `truthiness of value (${this.arrayElementValue(node)})`;
    }

    arrayElementValue (node) {
        if(node?.type==='Boolean')return node.value?ARCADE_TRUE:ARCADE_FALSE;
        const value=this.expr(node);
        // The dialect has no value form for a Scratch predicate: in a value
        // slot it is kept as literal text, so say so instead.
        if(isScratchPredicate(value)){this.unsupported.push(`${value} as a value (a Scratch condition has no value form here)`);return ARCADE_FALSE;}
        // Scratch string shadows must not turn a numeric array element into text.
        return node?.type==='Number' ? `(0 + (${value}))` : value;
    }

    callExpression (node) {
        const engineApi=this.path(node.callee),engineArgs=node.args||[];
        if(engineApi?.startsWith('mp.') && (this.boundSourceGlobals?.has('mp') || this.sourceFunctions?.has('mp') || this.localVars?.has('mp') || this.currentParameters?.has('mp') || this.capturedBindings.has('mp'))) {
            this.unsupported.push(`${engineApi} refers to a shadowed mp binding`);return 'undefined value';
        }
        if(engineApi==='MultiplayerState.create') {
            if(this.boundSourceGlobals?.has('MultiplayerState') || this.sourceFunctions?.has('MultiplayerState') || this.localVars?.has('MultiplayerState') || this.currentParameters?.has('MultiplayerState') || this.capturedBindings.has('MultiplayerState')){this.unsupported.push('MultiplayerState.create refers to a shadowed binding');return 'undefined value';}
            if(!engineArgs.length)return 'arcade create player state key';
            this.unsupported.push('MultiplayerState.create requires no arguments');return 'undefined value';
        }
        if(engineApi==='mp.getPlayerState' && engineArgs.length===2)return `arcade state (${this.expr(engineArgs[1])}) of player (${this.expr(engineArgs[0])})`;
        const mpSpecs={'mp.playerSelector':['arcade player by number',1], 'mp.getPlayerByNumber':['arcade player by number',1],
            'mp.getPlayerByIndex':['arcade player by index',1], 'mp.getPlayerSprite':['arcade sprite of player',1],
            'mp.getPlayerBySprite':['arcade player of sprite',1]};
        if(mpSpecs[engineApi]) {
            const [word,arity]=mpSpecs[engineApi];
            if(engineArgs.length===arity)return `${word} (${this.expr(engineArgs[0])})`;
            this.unsupported.push(`${engineApi} requires ${arity} argument`);return 'undefined value';
        }
        if(engineApi==='mp.allPlayers' && !engineArgs.length)return 'arcade all players';
        if(engineApi==='mp.isButtonPressed' && engineArgs.length===2)return `arcade player (${this.expr(engineArgs[0])}) button (${this.expr(engineArgs[1])}) pressed`;
        if(engineApi==='mp.getPlayerProperty' && engineArgs.length===2)return `arcade player safe property (${this.expr(engineArgs[1])}) of (${this.expr(engineArgs[0])})`;
        if(engineApi==='game.currentScene') {
            if(!engineArgs.length)return 'arcade current scene';
            this.unsupported.push('game.currentScene requires zero arguments');return 'undefined value';
        }
        if(engineApi==='ArcadePhysicsEngine') {
            if(this.boundSourceGlobals?.has('ArcadePhysicsEngine') || this.localVars?.has('ArcadePhysicsEngine') || this.currentParameters?.has('ArcadePhysicsEngine') || this.capturedBindings.has('ArcadePhysicsEngine')) {
                this.unsupported.push('ArcadePhysicsEngine constructor refers to a shadowed binding');return 'undefined value';
            }
            if(node.constructorCall && engineArgs.length<=3) {
                const args=[0,1,2].map(i=>engineArgs[i]?this.expr(engineArgs[i]):String([500,2,4][i]));
                return `arcade create physics engine max speed (${args[0]}) min step (${args[1]}) max step (${args[2]})`;
            }
            this.unsupported.push('ArcadePhysicsEngine requires new and zero to three constructor arguments');return 'undefined value';
        }
        if(node?.callee?.type==='Member' && this.physicsEngineReferences?.has(node.callee.object)) {
            this.unsupported.push(`Arcade PhysicsEngine.${node.callee.name} requires native PhysicsEngine method support`);return 'undefined value';
        }
        if(node?.callee?.type==='Member' && this.sceneReferences?.has(node.callee.object)) {
            this.unsupported.push(`Arcade Scene.${node.callee.name} requires native Scene method support`);return 'undefined value';
        }
        const owner=node.callee?.type==='Member' && node.callee.object;
        if (owner && this.isArrayReference(owner)) {
            const ref=this.expr(owner),op=node.callee.name,a=node.args||[];
            if (['pop','shift','removeAt'].includes(op)) return `${op} from array reference (${ref}) index (${a[0]?this.expr(a[0]):0})`;
            if (op==='_pickRandom' && !a.length) return `random item of array reference (${ref})`;
            if (op==='get') return `item (${this.expr(a[0])}) of array reference (${ref})`;
            // The pinned PXT Array_.removeElement reports 1 or 0 (measured); the
            // arrays block reports true or false, and true + 0 is 1.
            if (op==='removeElement') return `calculate value (remove value (${this.arrayElementValue(a[0])}) from array reference (${ref})) op "+" with ((0 + (0)))`;
            if (op==='indexOf') return `index of (${this.arrayElementValue(a[0])}) in array reference (${ref}) from (${a[1]?this.expr(a[1]):0})`;
        }
        if (this.path(node.callee)==='Math.pickRandom' && this.isArrayReference(node.args?.[0])) {
            return `random item of array reference (${this.expr(node.args[0])})`;
        }
        const name = this.path(node.callee);
        const a = node.args || [];
        const fn = node.callee?.type === 'Identifier' && this.returnFunctions?.get(node.callee.name);
        if (fn) {
            if (a.length > fn.params.length || fn.params.slice(a.length).some(name=>!fn.optionalParams?.includes(name))) {this.unsupported.push(`${fn.name}() argument count differs from its declaration`);return '0';}
            const actual=fn.params.map((_,i)=>a[i] || {type:'Undefined'});
            let args = '"[]"';
            for (let i=actual.length-1;i>=0;i--) args = `arcade function argument (${this.arrayElementValue(actual[i])}) rest (${args})`;
            const code = [fn.name, ...fn.params.map(()=>'%s')].join(' ');
            return `(arcade call function ${JSON.stringify(code)} arguments (${args}))`;
        }
        if (node.callee?.type==='Member' && node.callee.name==='isHittingTile') {
            const handle=this.handleTemplates && this.handleRef(node.callee.object);
            if (!handle || a.length!==1) {
                this.unsupported.push('Sprite.isHittingTile requires a typed sprite reference and one collision direction');return ARCADE_FALSE;
            }
            const direction=this.path(a[0]);
            if(direction?.startsWith('CollisionDirection.') && !Object.prototype.hasOwnProperty.call(COLLISION_DIRECTIONS,a[0].name)) {
                this.unsupported.push(`${direction} is not a declared Arcade CollisionDirection member`);return ARCADE_FALSE;
            }
            return `arcade sprite (${handle}) hitting wall (${this.expr(a[0])})`;
        }
        if (node.callee?.type==='Member' && node.callee.name==='toString' && this.spriteReferences?.has(node.callee.object)) {
            if(a.length) {this.unsupported.push('Sprite.toString() requires zero arguments');return '""';}
            return `arcade text of sprite (${this.handleRef(node.callee.object) || this.expr(node.callee.object)})`;
        }
        if (this.projectileTemplates.has(node)) {
            const template = this.projectileTemplates.get(node);
            const mode = name === 'sprites.createProjectileFromSide' ? 'side' :
                name === 'sprites.createProjectileFromSprite' ? 'sprite' : a[4] ? 'kind-source' : 'kind';
            const source = mode === 'sprite' ? a[1] : mode === 'kind-source' ? a[4] : null;
            const sourceHandle = source?.type === 'Null' ? '""' : source && this.handleRef(source);
            if (source && !sourceHandle) this.unsupported.push(`${name}() source must be a sprite handle or null`);
            const vx = mode === 'sprite' ? a[2] : a[1];
            const vy = mode === 'sprite' ? a[3] : a[2];
            if (template.dynamicImage) return `arcade projectile image (${this.imageRef(a[0])}) template "${template.name}" kind "${template.kind}" ` +
                `vx ${this.expr(vx)} vy ${this.expr(vy)} mode ${mode}` +
                (source ? ` source ${sourceHandle || this.expr(source)}` : '');
            return `arcade projectile template "${template.name}" kind "${template.kind}" ` +
                `vx ${this.expr(vx)} vy ${this.expr(vy)} width ${template.width} ` +
                `height ${template.height} mode ${mode}` +
                (source ? ` source ${sourceHandle || this.expr(source)}` : '');
        }
        const imageValue = this.imageRef(node,false);
        if (imageValue) return imageValue;
        if (this.handleTemplates && name === 'sprites.create') {
            const template = this.handleTemplates.get(node);
            if (!template) {
                this.unsupported.push('sprites.create() — image could not be used as a sprite template');
                return '0';
            }
            if (template.dynamicImage) return `arcade create image (${this.imageRef(a[0])}) template "${template.name}" kind "${template.kind}"`;
            return `arcade create template "${template.name}" kind "${template.kind}" ` +
                `width ${template.width} height ${template.height}`;
        }
        if(this.handleTemplates && this.nativeInfoProgram && /^info(?:\.player[1-4])?\.life$/.test(name||'')) {
            if(a.length){this.unsupported.push(`${name} requires no arguments`);return 'undefined value';}
            return `arcade life player (${playerOf(name)})`;
        }
        if(this.handleTemplates && this.nativeInfoProgram && /^info(?:\.player[1-4])?\.(hasLife|score|hasScore)$/.test(name||'')) {
            if(a.length){this.unsupported.push(`${name} requires no arguments`);return 'undefined value';}
            const method=name.split('.').pop(),property=method==='hasLife'?'has life':method==='hasScore'?'has score':'score';
            return `arcade player (${playerOf(name)}) ${property}`;
        }
        switch (name) {
        // Arcade's score is the game's on-screen score: the extension's own, on both
        // paths. (The fixed-sprite path used to keep it in a Scratch variable named
        // `score`, which the export could not tell from a user's, so the HUD was lost.)
        case 'info.score': return 'arcade score';
        case 'info.life': return 'lives';
        case 'game.ask':
            if(a.length>=1 && a.length<=2)return `arcade ask yes ${this.expr(a[0])} subtitle ${a[1]?this.expr(a[1]):'""'}`;
            this.unsupported.push('game.ask() requires a title and optional subtitle');return '0';
        case 'game.askForNumber':
            if (a.length === 1) return `arcade ask number ${this.expr(a[0])}`;
            this.unsupported.push('game.askForNumber() with digit limit or other options');
            return '0';
        case 'game.askForString':
            if (a.length === 1) return `arcade ask text ${this.expr(a[0])}`;
            this.unsupported.push('game.askForString() with length limit or other options');
            return '""';
        case 'scene.cameraProperty':
            if(this.handleTemplates && a.length===1) {
                const property=this.path(a[0]);
                if(property?.startsWith('CameraProperty.') && !Object.prototype.hasOwnProperty.call(CAMERA_PROPERTIES,a[0].name)){
                    this.unsupported.push(`${property} is not a declared Arcade CameraProperty member`);return 'undefined value';
                }
                return `arcade camera property (${this.expr(a[0])})`;
            }
            this.unsupported.push('scene.cameraProperty requires one property selector and native camera support');return 'undefined value';
        case 'scene.screenWidth': return String(HALF_WIDTH * 2);
        case 'scene.screenHeight': return String(HALF_HEIGHT * 2);
        case 'randint': return `pick random ${this.mathOperand(a[0])} to ${this.mathOperand(a[1])}`;
        case 'game.runtime': return 'timer * 1000';
        case 'controller.dx': return `arcade controller x step ${this.expr(a[0] || {type: 'Number', value: 100})}`;
        case 'controller.dy': return `arcade controller y step ${this.expr(a[0] || {type: 'Number', value: 100})}`;
        // Math.min/max/pow/map: the base translator's (task #400) — every
        // argument kept, and Math.map written as its formula with a note,
        // because there is no map reporter off the micro:bit.
        // A sprite KIND is a compile-time label; every Arcade game defines
        // a few, and reporting them as unsupported would bury the real
        // refusals under noise. A number is exactly what they are.
        case 'SpriteKind.create': return String(100 + (++this.kinds));
        case 'animation.createAnimation':
            if (this.handleTemplates && a.length === 2) return `arcade create animation action (${this.expr(a[0])}) interval (${this.expr(a[1])})`;
            this.unsupported.push('animation.createAnimation requires an action, interval and runtime animation support');
            return '0';
        case 'animation.attachAnimation':
            this.unsupported.push('animation.attachAnimation is a command, not a value');return '0';

        default: {
            // The per-player info API: `info.player2.hasLife()` and friends.
            // Player one shares the plain API's variables by design, so a
            // game that mixes both reads and writes one set, not two.
            if (/^info\.player\d\./.test(name || '')) {
                const player = playerOf(name);
                const method = name.split('.').pop();
                if (method === 'score') return `arcade player (${player}) score`;
                if (method === 'life') return playerVar('lives', player);
                if (method === 'hasLife') {
                    if (this.handleTemplates) {this.usesArrays = true; return `compare value (${playerVar('lives', player)}) op ">" with (0)`;}
                    return `${playerVar('lives', player)} > 0`;
                }
            }

            const imageOwner = node.callee?.object;
            const imageHandle = imageOwner?.type === 'Member' && imageOwner.name === 'image' && this.handleRef(imageOwner.object);
            const resource = this.imageRef(imageOwner);
            if (resource && node.callee.name === 'overlapsWith') {
                const source = this.imageRef(a[0]);
                if (a.length === 3 && source) return `arcade images overlap (${resource}) source (${source}) x (${this.expr(a[1])}) y (${this.expr(a[2])})`;
                this.unsupported.push(`${name}() needs an image source and x/y offsets`);return 'false';
            }
            if (resource && !imageHandle && node.callee.name === 'getPixel' && a.length === 2) {
                return `arcade image pixel (${resource}) x (${this.expr(a[0])}) y (${this.expr(a[1])})`;
            }
            if (imageHandle && node.callee.name === 'getPixel' && a.length === 2) {
                return `arcade pixel of ${imageHandle} x (${this.expr(a[0])}) y (${this.expr(a[1])})`;
            }
            if (name === 'scene.backgroundColor' && a.length === 0) return 'arcade background color';

            // `controller.left.isPressed()` is `key left arrow pressed?`,
            // which is the second most common way an Arcade game reads
            // input after controller.moveSprite.
            const button = /^controller\.(\w+)\.isPressed$/.exec(name || '');
            if (button && CONTROLLER_KEYS[button[1]]) {
                return `key ${CONTROLLER_KEYS[button[1]]} pressed?`;
            }

            // `ball.overlapsWith(paddle)` is `touching paddle` — the one
            // sprite method that reports rather than acts.
            if (node.callee && node.callee.type === 'Member' && node.callee.name === 'overlapsWith') {
                const first = this.handleRef(node.callee.object);
                const second = this.handleRef(a[0]);
                if (first && second) return `arcade ${first} overlaps ${second}`;
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
     * A truth value in a VALUE slot (task E9). The dialect reads a condition
     * there as literal text (with a warning), so a truth value that has no
     * value word is chosen on the lines before its statement:
     *   IF <condition> THEN: set _mcN to <true> ELSE: set _mcN to <false>
     * and the slot reads _mcN. True and false are the program's own: 1 and 0
     * on the fixed-sprite path (its Boolean literals are 1 and 0, and its
     * conditions read a variable as `not (v = 0)`), the real Booleans
     * ARCADE_TRUE / ARCADE_FALSE on the handle path, whose comparisons and
     * `!` are already value words (compare value, truthiness of value).
     * The condition() a node is being written for is not a value slot.
     */
    expr (node) {
        if (node?.bwAnimationResourceId) return `arcade animation fresh frames resource ${JSON.stringify(node.bwAnimationResourceId)}`;
        const value=this.valueExpr(node);
        if(!node || node===this.conditionNode)return value;
        // On the fixed-sprite path a truth node's value text IS its condition
        // (the base writes `!`, comparisons, && and || in that grammar).
        if(!isConditionCall(node,value) && !(isTruthNode(node) && !this.handleTemplates))return value;
        const repeated=this.inLoopCondition || this.inRepeatedCondition;
        if(this.pre && !repeated)return this.truthAsValue(value);
        this.unsupported.push(`${value} as a value ${repeated ? 'in a condition tested on every pass' : 'outside a statement'} (it cannot be chosen into a variable first)`);
        return value;
    }
    /** A condition tested again and again: nothing in it can be chosen first. */
    repeatedCondition (node) {
        const was=this.inRepeatedCondition;this.inRepeatedCondition=true;
        try {return this.condition(node);} finally {this.inRepeatedCondition=was;}
    }
    truthAsValue (condition) {
        const name=`_mc${++this.temps}`;
        this.declared.add(name);
        const [yes,no]=this.handleTemplates?[ARCADE_TRUE,ARCADE_FALSE]:['1','0'];
        this.pre.push(`IF ${condition} THEN:`,`  set ${name} to ${yes}`,'ELSE:',`  set ${name} to ${no}`);
        return name;
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
    valueExpr (node) {
        if(['MultiplayerState.score','MultiplayerState.life'].includes(this.path(node))) {
            if(this.boundSourceGlobals?.has('MultiplayerState') || this.sourceFunctions?.has('MultiplayerState') || this.localVars?.has('MultiplayerState') || this.currentParameters?.has('MultiplayerState') || this.capturedBindings.has('MultiplayerState')){this.unsupported.push('MultiplayerState constant refers to a shadowed binding');return 'undefined value';}
            return this.path(node).endsWith('.score')?'0':'1';
        }
        const mpEnum = this.path(node);
        const mpConstants={'mp.PlayerNumber.One':1,'mp.PlayerNumber.Two':2,'mp.PlayerNumber.Three':3,'mp.PlayerNumber.Four':4,
            'mp.PlayerProperty.Index':1,'mp.PlayerProperty.Number':2,
            'mp.MultiplayerButton.A':0,'mp.MultiplayerButton.B':1,'mp.MultiplayerButton.Up':2,'mp.MultiplayerButton.Right':3,'mp.MultiplayerButton.Down':4,'mp.MultiplayerButton.Left':5};
        if(Object.prototype.hasOwnProperty.call(mpConstants,mpEnum)) {
            if(this.boundSourceGlobals?.has('mp') || this.sourceFunctions?.has('mp') || this.localVars?.has('mp') || this.currentParameters?.has('mp') || this.capturedBindings.has('mp')) {
                this.unsupported.push(`${mpEnum} refers to a shadowed mp binding`);return 'undefined value';
            }
            return String(mpConstants[mpEnum]);
        }
        if(/^mp\.(PlayerNumber|PlayerProperty|MultiplayerButton)\./.test(mpEnum||'')) {
            this.unsupported.push(`${mpEnum} is not a declared multiplayer enum member`);return 'undefined value';
        }
        if(node?.type==='Member' && this.playerReferences?.has(node.object)) {
            if(['index','number'].includes(node.name))return `arcade player member property (${node.name==='index'?1:2}) of (${this.expr(node.object)})`;
            this.unsupported.push(`mp.Player.${node.name} requires native player member support`);return 'undefined value';
        }
        if(node?.type==='Member' && this.sceneReferences?.has(node.object)) {
            if(node.name==='physicsEngine')return `arcade physics engine of scene (${this.expr(node.object)})`;
            this.unsupported.push(`Arcade Scene.${node.name} requires native Scene member support`);return 'undefined value';
        }
        if(node?.type==='Member' && this.physicsEngineReferences?.has(node.object)) {
            if(['maxSpeed','minStep','maxStep'].includes(node.name))return `arcade physics engine property ${node.name} of (${this.expr(node.object)})`;
            this.unsupported.push(`Arcade PhysicsEngine.${node.name} requires native physics-engine member support`);return 'undefined value';
        }
        if(this.handleTemplates && node?.type==='Member' && node.object?.type==='Identifier' && node.object.name==='ControllerButtonEvent') {
            if(this.boundSourceGlobals?.has('ControllerButtonEvent') || this.localVars?.has('ControllerButtonEvent') || this.currentParameters?.has('ControllerButtonEvent') || this.capturedBindings.has('ControllerButtonEvent')) {
                this.unsupported.push(`${this.path(node)} refers to a shadowed ControllerButtonEvent binding`);return 'undefined value';
            }
            if(Object.prototype.hasOwnProperty.call(BUTTON_EVENTS,node.name))return String(BUTTON_EVENTS[node.name]);
            this.unsupported.push(`${this.path(node)} is not a declared Arcade ControllerButtonEvent member`);return 'undefined value';
        }
        if(node?.type==='Member' && node.object?.type==='Identifier' && node.object.name==='ScaleAnchor') {
            const values={Middle:0,Top:1,Left:2,Right:4,Bottom:8,TopLeft:3,TopRight:5,BottomLeft:10,BottomRight:12};
            if(this.boundSourceGlobals?.has('ScaleAnchor') || this.localVars?.has('ScaleAnchor') || this.currentParameters?.has('ScaleAnchor') || this.capturedBindings.has('ScaleAnchor')) {
                this.unsupported.push(`${this.path(node)} refers to a shadowed ScaleAnchor binding`);return 'undefined value';
            }
            if(Object.prototype.hasOwnProperty.call(values,node.name))return String(values[node.name]);
            this.unsupported.push(`${this.path(node)} is not a declared Arcade ScaleAnchor member`);return 'undefined value';
        }
        if(node?.type==='Member' && node.object?.type==='Identifier' && node.object.name==='CameraProperty') {
            if(this.boundSourceGlobals?.has('CameraProperty') || this.localVars?.has('CameraProperty') || this.currentParameters?.has('CameraProperty') || this.capturedBindings.has('CameraProperty')) {
                this.unsupported.push(`${this.path(node)} refers to a shadowed CameraProperty binding; object member access is not supported`);return 'undefined value';
            }
            if(Object.prototype.hasOwnProperty.call(CAMERA_PROPERTIES,node.name))return String(CAMERA_PROPERTIES[node.name]);
            this.unsupported.push(`${this.path(node)} is not a declared Arcade CameraProperty member`);return 'undefined value';
        }
        if(node?.type==='Member' && node.object?.type==='Identifier' && node.object.name==='CollisionDirection' &&
            !this.boundSourceGlobals?.has('CollisionDirection') && !this.localVars?.has('CollisionDirection') && !this.currentParameters?.has('CollisionDirection') && !this.capturedBindings.has('CollisionDirection')) {
            if(Object.prototype.hasOwnProperty.call(COLLISION_DIRECTIONS,node.name))return String(COLLISION_DIRECTIONS[node.name]);
            this.unsupported.push(`${this.path(node)} is not a declared Arcade CollisionDirection member`);return '0';
        }
        if(node?.type==='Identifier' && ['NaN','Infinity'].includes(node.name) && !this.boundSourceGlobals?.has(node.name) && !this.localVars?.has(node.name) && !this.currentParameters?.has(node.name) && !this.capturedBindings.has(node.name)) {
            return this.expr({type:'Binary',op:'/',left:{type:'Number',value:node.name==='NaN'?'0':'1'},right:{type:'Number',value:'0'}});
        }
        if(node?.type==='LegacyParsedValue'){this.usesArrays=true;return `parse array input (${this.arrayElementValue(node.value)})`;}
        if(node?.type==='NativeArrayAccess')return this.expr(node.value);
        if(node?.type==='LegacyJsonValue'){this.usesArrays=true;return `JSON text of value (${this.arrayElementValue(node.value)})`;}
        if(this.handleTemplates && node?.type==='Identifier' && node.temporary)return `arcade local ${node.name}`;
        if(this.handleTemplates && node?.type==='Boolean')return node.value?ARCADE_TRUE:ARCADE_FALSE;
        if(this.handleTemplates && node?.type==='Member' && this.path(node.object)==='TileScale') {
            if(this.boundSourceGlobals?.has('TileScale') || this.sourceFunctions?.has('TileScale') || this.localVars?.has('TileScale') || this.currentParameters?.has('TileScale') || this.capturedBindings.has('TileScale')){this.unsupported.push('TileScale refers to a shadowed binding');return 'undefined value';}
            const values={Four:2,Eight:3,Sixteen:4,ThirtyTwo:5};
            if(Object.prototype.hasOwnProperty.call(values,node.name))return String(values[node.name]);
            this.unsupported.push(`TileScale.${node.name} is not a declared tile scale`);return '4';
        }
        if(this.handleTemplates && node?.type==='String')return arcadeTextLiteral(tsText(node.value));
        if(this.handleTemplates && ['Update','Assignment'].includes(node?.type)){this.unsupported.push(`${node.type.toLowerCase()} expression used as a value`);return '0';}
        if (this.handleTemplates && ['Null','Undefined'].includes(node?.type)) {
            this.usesArrays=true;return `${node.type.toLowerCase()} value`;
        }
        if(this.handleTemplates && node?.type==='Binary' && ['==','!=','===','!==','<','>','<=','>='].includes(node.op)) {
            this.usesArrays=true;
            return `compare value (${this.arrayElementValue(node.left)}) op "${node.op}" with (${this.arrayElementValue(node.right)})`;
        }
        if(this.handleTemplates && node?.type==='Binary' && ['+','-','*','/','%'].includes(node.op)) {
            if([node.left,node.right].some(value=>this.spriteReferences?.has(value)))this.unsupported.push('sprite arithmetic conversion requires ToPrimitive support');
            if([node.left,node.right].some(value=>this.playerReferences?.has(value)))this.unsupported.push('player arithmetic conversion requires ToPrimitive support');
            this.usesArrays=true;return `calculate value (${this.arrayElementValue(node.left)}) op "${node.op}" with (${this.arrayElementValue(node.right)})`;
        }
        // `!x` as a value. The value words have no unary `!` (BWValues.unary
        // is + and -), and `not (…)` in a value slot is kept as text, so it is
        // JavaScript's own definition: truthiness of x === false.
        if(this.handleTemplates && node?.type==='Unary' && node.op==='!') {
            this.usesArrays=true;
            return `compare value (${this.truthValue(node.argument)}) op "===" with (${ARCADE_FALSE})`;
        }
        if(this.handleTemplates && node?.type==='Unary' && ['+','-'].includes(node.op)) {
            this.usesArrays=true;return `convert value (${this.arrayElementValue(node.argument)}) op "${node.op}"`;
        }
        if(this.handleTemplates && node?.type==='Binary' && ['&&','||'].includes(node.op))
            this.unsupported.push(`logical ${node.op} as a value needs operand-preserving lazy evaluation`);
        if (node?.type==='Array' && this.handleTemplates) {
            let values='"[]"';for(let i=node.items.length-1;i>=0;i--)values=`array value (${this.arrayElementValue(node.items[i])}) rest (${values})`;
            return `new array reference from (${values})`;
        }
        if(this.handleTemplates && node?.type==='Member' && this.animationReferences?.has(node.object)) {
            if(['image','action','interval'].includes(node.name))return `arcade animation ${node.name} of (${this.expr(node.object)})`;
            this.unsupported.push(`animation.Animation.${node.name} requires animation property support`);return '0';
        }
        if(this.handleTemplates && node?.type==='Member' && this.legacyTileReferences?.has(node.object)) {
            if(['x','y','tileSet'].includes(node.name))return `arcade color tile ${node.name} of (${this.expr(node.object)})`;
            this.unsupported.push(`tiles.Tile.${node.name} is not a supported legacy Tile property`);return '0';
        }
        if(this.handleTemplates && node?.type==='Member' && this.tileReferences?.has(node.object)) {
            const property=node.name==='col'?'column':node.name;
            if(['column','row','x','y','left','right','top','bottom','tileSet'].includes(property))return `arcade tile ${property} of (${this.expr(node.object)})`;
            this.unsupported.push(`tiles.Location.${node.name} requires tile location property support`);return '0';
        }
        if(this.handleTemplates && node?.type==='Call') {
            const api=this.path(node.callee),args=node.args||[];
            if(node.callee?.type==='Member' && this.animationReferences?.has(node.callee.object) && args.length===0 && ['getImage','getAction','getInterval'].includes(node.callee.name))return `arcade animation ${node.callee.name.slice(3).toLowerCase()} of (${this.expr(node.callee.object)})`;
            if(['scene.getTile','scene.getTilesByType'].includes(api)) {
                if(this.boundSourceGlobals?.has('scene') || this.sourceFunctions?.has('scene') || this.localVars?.has('scene') || this.currentParameters?.has('scene') || this.capturedBindings.has('scene')){this.unsupported.push(`${api} refers to a shadowed scene binding`);return '0';}
                if(api==='scene.getTile' && args.length===2)return `arcade color tile column (${this.expr(args[0])}) row (${this.expr(args[1])})`;
                if(api==='scene.getTilesByType' && args.length===1)return `arcade color tile array index (${this.expr(args[0])})`;
                this.unsupported.push(`${api} has invalid arity`);return '0';
            }
            if(api==='scene.tileHitFrom' && (this.boundSourceGlobals?.has('scene') || this.sourceFunctions?.has('scene') || this.localVars?.has('scene') || this.currentParameters?.has('scene') || this.capturedBindings.has('scene'))){this.unsupported.push('scene.tileHitFrom refers to a shadowed scene binding');return '0';}
            if(api==='scene.tileHitFrom' && args.length===2)return `arcade sprite (${this.expr(args[0])}) wall hit index (${this.expr(args[1])})`;
            if(node.callee?.type==='Member' && node.callee.name==='tileHitFrom' && this.spriteReferences?.has(node.callee.object) && args.length===1)return `arcade sprite (${this.expr(node.callee.object)}) wall hit index (${this.expr(args[0])})`;
            if(api==='tiles.getTileLocation' && args.length===2)return `arcade tile location column (${this.expr(args[0])}) row (${this.expr(args[1])})`;
            if(api==='tiles.getTilesByType' && args.length===1){this.usesArrays=true;return `arcade tile array image (${this.expr(args[0])})`;}
            if(api==='tiles.tileAtLocationEquals' && args.length===2)return `arcade tile (${this.expr(args[0])}) equals image (${this.expr(args[1])})`;
            if(api==='tiles.tileAtLocationIsWall' && args.length===1)return `arcade tile (${this.expr(args[0])}) is wall`;
        }
        if (node?.type==='Call' && this.handleTemplates && this.path(node.callee)==='sprites.allOfKind') {
            this.usesArrays=true;
            const kind=node.args?.[0];
            if(node.args.length!==1 || kind?.type!=='Member' || this.path(kind.object)!=='SpriteKind') {
                this.unsupported.push('sprites.allOfKind requires a supported SpriteKind member');return '0';
            }
            return `arcade sprite array kind ${JSON.stringify(kind.name)}`;
        }
        if (node?.type==='Index' && this.isArrayReference(node.object) && !this.imageValueResources.has(node)) return `item (${this.expr(node.index)}) of array reference (${this.expr(node.object)})`;
        if (node?.type==='Member' && node.name==='length' && this.isArrayReference(node.object)) return `length of array reference (${this.expr(node.object)})`;

        if (this.imageValueResources.has(node)) return this.imageRef(node);
        // The Arcade exporter writes a Scratch join as `"" + left + right`.
        // Preserve its string coercion and block shape on the way back in.
        if (node?.type === 'Binary' && node.op === '+' &&
            node.left?.type === 'Binary' && node.left.op === '+' &&
            node.left.left?.type === 'String' && node.left.left.value === '') {
            return `${this.expr(node.left.right)} join ${this.expr(node.right)}`;
        }
        if (node?.type === 'Identifier' && this.currentParameters?.has(node.name)) return `arcade local ${this.varName(node.name)}`;
        if (node?.type === 'Identifier' && this.localVars?.has(node.name)) {
            return `arcade local ${node.name}`;
        }
        if (node?.type === 'Identifier' && this.capturedBindings.has(node.name)) return `arcade captured ${this.capturedBindings.get(node.name)}`;
        if (node?.type === 'Member' && node.name === 'length' && node.object?.type === 'Call' &&
            this.path(node.object.callee) === 'sprites.allOfKind') {
            return `arcade count kind "${kindOf(node.object.args?.[0])}"`;
        }
        if (node?.type === 'Identifier' && this.handleAliases.has(node.name)) {
            return this.handleAliases.get(node.name);
        }
        const image = node?.type === 'Member' && this.imageRef(node.object);
        if (image && ['width', 'height'].includes(node.name)) return `arcade image ${node.name} of (${image})`;
        const handle = node?.type === 'Member' && this.handleRef(node.object);
        if (handle) {
            if (['x', 'y', 'left', 'right', 'top', 'bottom', 'vx', 'vy', 'ax', 'ay', 'fx', 'fy', 'sx', 'sy', 'scale',
                'width', 'height', 'z', 'lifespan', 'rotation', 'rotationDegrees', 'data'].includes(node.name)) {
                return `arcade property ${node.name} of ${handle}`;
            }
            if (node.name === 'image') return `arcade image of ${handle}`;
            this.unsupported.push(`${this.path(node)} — unsupported Arcade handle property`);
            return '0';
        }
        if(node?.type==='Member' && this.dataReferences?.has(node.object)) {
            this.unsupported.push(`Sprite.data.${node.name} requires arbitrary object member support`);return 'undefined value';
        }
        if (node && node.type === 'Member' && node.object.type === 'Identifier' &&
            node.object.name === 'screen') {
            if (node.name === 'width') return String(HALF_WIDTH * 2);
            if (node.name === 'height') return String(HALF_HEIGHT * 2);
        }
        if (node && node.type === 'Member') {
            const owner = this.resolveSprite(node.object);
            if (owner) {
                const mine = owner === this.self;
                const suffix = mine ? '' : ` of ${owner.name}`;
                if (node.name === 'x') return `(x position${suffix} / ${SCALE} + ${HALF_WIDTH})`;
                if (node.name === 'y') return `(${HALF_HEIGHT} - y position${suffix} / ${SCALE})`;
                if (node.name === 'vx' || node.name === 'vy') return `${owner.name}_${node.name}`;
                // A sprite's size is a CONSTANT here: we decoded its
                // picture to build the costume, so the number the game
                // wants for its bounds arithmetic is exactly known.
                if (node.name === 'width' && owner.width) return String(owner.width);
                if (node.name === 'height' && owner.height) return String(owner.height);
                // The edges follow from the centre and the size, in the
                // Arcade units the surrounding arithmetic is written in.
                if (owner.width && owner.height) {
                    const x = mine ? `(x position / ${SCALE} + ${HALF_WIDTH})` :
                        `(x position of ${owner.name} / ${SCALE} + ${HALF_WIDTH})`;
                    const y = mine ? `(${HALF_HEIGHT} - y position / ${SCALE})` :
                        `(${HALF_HEIGHT} - y position of ${owner.name} / ${SCALE})`;
                    if (node.name === 'left') return `${x} - ${owner.width / 2}`;
                    if (node.name === 'right') return `${x} + ${owner.width / 2}`;
                    if (node.name === 'top') return `${y} - ${owner.height / 2}`;
                    if (node.name === 'bottom') return `${y} + ${owner.height / 2}`;
                }
                this.unsupported.push(`${owner.name}.${node.name} — no stage equivalent`);
                return '0';
            }
        }
        // A sprite property on something we could NOT resolve to a sprite —
        // `collisionPaddle.width`, where the variable holds whichever paddle
        // was hit — used to fall through to the base and become a variable
        // literally named `width`. That reads as a working program and is
        // not one.
        if (node && node.type === 'Member' && SPRITE_PROPERTIES.has(node.name)) {
            const owner = node.object.type === 'Identifier' ? node.object.name : 'a value';
            this.unsupported.push(
                `${owner}.${node.name} — a sprite held in a variable, which the stage cannot follow`);
            return '0';
        }
        // \`sprites.dungeon.someTile\`: built-in art we do not carry (an extension's
        // namespace, or one newer than the pinned bundle). Falling through made a
        // variable named \`someTile\` that silently held 0.
        if (node && node.type === 'Member' && !BUILTIN_IMAGES[this.path(node)] &&
            BUILTIN_IMAGE_GROUPS.has(this.path(node.object))) {
            this.unsupported.push(`${this.path(node)} — built-in image art not available`);
            return '0';
        }
        return super.expr(node);
    }

    command (node, indent, out) {
        const pad = '  '.repeat(indent);
        if(node?.callee?.type==='Member' && this.physicsEngineReferences?.has(node.callee.object)) {
            if(node.callee.name==='setMaxSpeed' && node.args?.length===1){out.push(`${pad}arcade set physics engine property maxSpeed of (${this.expr(node.callee.object)}) to (${this.expr(node.args[0])})`);return;}
            out.push(`${pad}${this.note(`Arcade PhysicsEngine.${node.callee.name} requires native PhysicsEngine method support`)}`);return;
        }
        if(node?.callee?.type==='Member' && this.sceneReferences?.has(node.callee.object)) {
            out.push(`${pad}${this.note(`Arcade Scene.${node.callee.name} requires native Scene method support`)}`);return;
        }

        const push = line => out.push(pad + line);
        const name = this.path(node.callee);
        const a = node.args || [];
        if(name?.startsWith('mp.') && (this.boundSourceGlobals?.has('mp') || this.sourceFunctions?.has('mp') || this.localVars?.has('mp') || this.currentParameters?.has('mp') || this.capturedBindings.has('mp'))) {push(this.note(`${name} refers to a shadowed mp binding`));return;}
        if(['mp.setPlayerState','mp.changePlayerStateBy'].includes(name) && a.length===3){push(name==='mp.setPlayerState'?`arcade set state (${this.expr(a[1])}) of player (${this.expr(a[0])}) to (${this.expr(a[2])})`:`arcade change state (${this.expr(a[1])}) of player (${this.expr(a[0])}) by (${this.expr(a[2])})`);return;}
        if(name==='mp.moveWithButtons' && a.length>=1 && a.length<=3){push(`arcade move player (${this.expr(a[0])}) with buttons vx (${a[1]?this.expr(a[1]):100}) vy (${a[2]?this.expr(a[2]):100})`);return;}
        if(name==='mp.setPlayerSprite' && a.length===2){push(`arcade set sprite of player (${this.expr(a[0])}) to (${this.expr(a[1])})`);return;}
        // Lite's own export's stop machinery, lifted back by liftExporterStops.
        if (name === '__bwStopAll') { push('stop all'); return; }
        if (name === '__bwStopOthers') { push('stop other scripts in sprite'); return; }
        if (this.functions.some(fn=>fn.name===name)) {
            const fn=this.sourceFunctions?.get(name),actual=[...a];
            if(this.handleTemplates && fn && a.length<fn.params.length){
                if(fn.params.slice(a.length).some(param=>!fn.optionalParams?.includes(param)))this.unsupported.push(`${name}() argument count differs from its declaration`);
                while(actual.length<fn.params.length)actual.push({type:'Undefined'});
            }
            const values=actual.map(arg=>{
                const value=this.arrayElementValue(arg);
                return /^[-\w.]+$/.test(value) || /^"(?:[^"\\]|\\.)*"$/.test(value) ? value : `(${value})`;
            });
            push([name,...values].join(' '));return;
        }

        if(['pauseUntil','control.waitUntil'].includes(name)) {
            const predicate=a[0];
            if(a.length===1 && predicate?.type==='FunctionExpression' && !predicate.params.length && predicate.body.length===1 && predicate.body[0].type==='Return')push(`wait until ${this.repeatedCondition(predicate.body[0].value)}`);
            else push(this.note(`${name}() requires a pure predicate callback`));
            return;
        }
        if (name === 'scene.setBackgroundImage' && a.length === 1) {
            const image = a[0]?.type === 'Null' ? '""' : this.imageRef(a[0]);
            if (image) push(`arcade set background image (${image})`);
            else push(this.note('scene.setBackgroundImage() with art we could not read'));
            return;
        }
        const directController = /^controller(?:\.player([1-4]))?\.(moveSprite|stopControllingSprite)$/.exec(name || '');
        if (directController && (directController[1] || directController[2]==='moveSprite')) {
            if (this.boundSourceGlobals?.has('controller') || this.sourceFunctions?.has('controller') || this.localVars?.has('controller') || this.currentParameters?.has('controller') || this.capturedBindings.has('controller')) {
                push(this.note(`${name} refers to a shadowed controller binding`));return;
            }
            const stopping=directController[2]==='stopControllingSprite';
            if (!a.length || a.length>(stopping?1:3)) {push(this.note(`${name}() requires a sprite${stopping?'':' and at most two speeds'}`));return;}
            const sprite=this.handleRef(a[0]) || (a[0]?.type==='Null'?'null':null);
            if (!sprite) {push(this.note(`${name}() requires a supported sprite handle`));return;}
            if (stopping) push(`arcade controller ${directController[1] || 1} stop controlling sprite (${sprite})`);
            else if (directController[1]) push(`arcade controller ${directController[1]} move sprite (${sprite}) vx (${a[1]?this.expr(a[1]):100}) vy (${a[2]?this.expr(a[2]):100})`);
            else push(`arcade control sprite (${sprite}) vx (${a[1]?this.expr(a[1]):100}) vy (${a[2]?this.expr(a[2]):100})`);
            return;
        }
        if (name === 'sprites.onCreated') {
            if (a[0]?.type !== 'Member' || this.path(a[0].object) !== 'SpriteKind') {
                push(this.note('sprites.onCreated() runtime kind expressions need support'));return;
            }
            const registration = this.createdRegistrations.get(node);
            if (registration && this.handleTemplates) push(`arcade register creation kind "${kindOf(a[0])}" as "${registration.token}" capturing ${JSON.stringify([...registration.ownCaptures].join(' '))}`);
            else push(this.note('sprites.onCreated() needs a supported callback'));
            return;
        }
        if(this.handleTemplates && name==='scene.onHitTile' && (this.boundSourceGlobals?.has('scene') || this.sourceFunctions?.has('scene') || this.localVars?.has('scene') || this.currentParameters?.has('scene') || this.capturedBindings.has('scene'))){push(this.note('scene.onHitTile refers to a shadowed scene binding'));return;}
        if(this.handleTemplates && ['scene.onHitWall','scene.onOverlapTile','scene.onHitTile'].includes(name)) {
            const registration=this.terrainRegistrations.get(node);
            if(!registration){push(this.note(`${name} requires a fixed SpriteKind, exact arguments and an inline callback with at most two parameters`));return;}
            const captures=JSON.stringify([...registration.ownCaptures].join(' '));
            if(registration.kind==='legacyWall')push(`arcade register color wall kind "${kindOf(a[0])}" index (${this.expr(a[1])}) as "${registration.token}" capturing ${captures}`);
            else if(registration.kind==='wall')push(`arcade register wall kind "${kindOf(a[0])}" as "${registration.token}" capturing ${captures}`);
            else push(`arcade register tile kind "${kindOf(a[0])}" image (${this.expr(a[1])}) as "${registration.token}" capturing ${captures}`);
            return;
        }
        if(this.handleTemplates && ['game.pushScene','game.popScene'].includes(name)) {
            if(a.length){push(this.note(`${name} requires no arguments`));return;}
            push(name==='game.pushScene'?'arcade push scene':'arcade pop scene');return;
        }
        if(this.handleTemplates && this.nativeInfoProgram && /^info(?:\.player[1-4])?\.(setLife|changeLifeBy)$/.test(name||'')) {
            if(a.length!==1){push(this.note(`${name} requires one life value`));return;}
            push(name.endsWith('.setLife')?`arcade set life player (${playerOf(name)}) to (${this.expr(a[0])})`:`arcade change life player (${playerOf(name)}) by (${this.expr(a[0])})`);return;
        }
        if(this.handleTemplates && this.nativeInfoProgram && /^info(?:\.player[1-4])?\.(setScore|changeScoreBy)$/.test(name||'')) {
            if(a.length!==1){push(this.note(`${name} requires one score value`));return;}
            push(name.endsWith('.setScore')?`arcade set score player (${playerOf(name)}) to (${this.expr(a[0])})`:`arcade change score player (${playerOf(name)}) by (${this.expr(a[0])})`);return;
        }
        if(isFrameRegistration(name) && (this.boundSourceGlobals?.has('game') || this.sourceFunctions?.has('game') || this.localVars?.has('game') || this.currentParameters?.has('game') || this.capturedBindings.has('game'))){push(this.note(`${name} refers to a shadowed game binding`));return;}
        if(isButtonRegistration(name) && (this.boundSourceGlobals?.has('controller') || this.sourceFunctions?.has('controller') || this.localVars?.has('controller') || this.currentParameters?.has('controller') || this.capturedBindings.has('controller'))){push(this.note(`${name} refers to a shadowed controller binding`));return;}
        if(isInfoRegistration(name) && (this.boundSourceGlobals?.has('info') || this.sourceFunctions?.has('info') || this.localVars?.has('info') || this.currentParameters?.has('info') || this.capturedBindings.has('info'))){push(this.note(`${name} refers to a shadowed info binding`));return;}
        if(isForeverRegistration(name) || isParallelLaunch(name)){
            const binding=name.split('.')[0];
            if(this.boundSourceGlobals?.has(binding) || this.sourceFunctions?.has(binding) || this.localVars?.has(binding) || this.currentParameters?.has(binding) || this.capturedBindings.has(binding)){push(this.note(`${name} refers to a shadowed ${binding} binding`));return;}
        }
        if(isSpriteRegistration(name)){
            for(const binding of ['sprites','SpriteKind'])if(this.boundSourceGlobals?.has(binding) || this.sourceFunctions?.has(binding) || this.localVars?.has(binding) || this.currentParameters?.has(binding) || this.capturedBindings.has(binding)){push(this.note(`${name} refers to a shadowed ${binding} binding`));return;}
        }
        const sceneSpec=(this.sceneStackProgram || isIndependentRegistration(name)) && sceneRegistrationSpec(name);
        if(this.handleTemplates && sceneSpec) {
            const registration=this.sceneRegistrations.get(node);
            if(!registration){push(this.note(isParallelLaunch(name)?'control.runInParallel requires one inline callback without parameters':`${name} requires exact arguments, fixed sprite kinds and a supported inline callback; lifecycle oldScene access is not yet supported`));return;}
            const suffix=`as "${registration.token}" capturing ${JSON.stringify([...registration.ownCaptures].join(' '))}`;
            switch(registration.kind) {
            case 'update':push(`arcade register update ${suffix}`);break;
            case 'forever':push(`arcade register forever ${suffix}`);break;
            case 'parallel':push(`arcade run parallel ${suffix}`);break;
            case 'lifeZero':push(`arcade register life zero player (${playerOf(name)}) ${suffix}`);break;
            case 'countdown':push(`arcade register countdown ${suffix}`);break;
            case 'interval':push(`arcade register interval (${this.expr(a[0])}) ${suffix}`);break;
            case 'multiplayerButton':push(`arcade register multiplayer button (${this.expr(a[0])}) event (${this.expr(a[1])}) ${suffix}`);break;
            case 'button':push(`arcade register button "${/^controller\.(\w+)\./.exec(name)[1]}" event (${this.expr(a[0])}) ${suffix}`);break;
            case 'destroyed':push(`arcade register destroyed kind "${kindOf(a[0])}" ${suffix}`);break;
            case 'overlap':push(`arcade register overlap kind "${kindOf(a[0])}" with kind "${kindOf(a[1])}" ${suffix}`);break;
            case 'scenePush':push(`arcade register scene push ${suffix}`);break;
            case 'scenePop':push(`arcade register scene pop ${suffix}`);break;
            }
            return;
        }
        if(this.handleTemplates && name==='scene.centerCameraAt') {
            if(a.length!==2){push(this.note('scene.centerCameraAt requires x and y coordinates'));return;}
            push(`arcade center camera x (${this.expr(a[0])}) y (${this.expr(a[1])})`);return;
        }
        if(this.handleTemplates && name==='scene.cameraFollowSprite') {
            if(a.length!==1){push(this.note('scene.cameraFollowSprite requires one sprite or null'));return;}
            const sprite=a[0],handle=this.handleRef(sprite);
            if(!handle && sprite.type!=='Null' && !this.nullReferences?.has(sprite)){push(this.note('scene.cameraFollowSprite requires a typed sprite reference or null'));return;}
            push(`arcade camera follow sprite (${handle || this.expr(sprite)})`);return;
        }
        if (name === 'image.setPalette' && a.length === 1) {
            const buffer=a[0];
            if(buffer.type==='Template' && buffer.tag==='hex') {
                const hex=buffer.value.replace(/\s/g,'');
                if(!/^[0-9a-f]{96}$/i.test(hex)){push(this.note('image.setPalette requires exactly 48 RGB bytes'));return;}
                push(`arcade set palette hex "${hex.toLowerCase()}"`);return;
            }
            if(buffer.type==='Call' && this.path(buffer.callee)==='Buffer.fromHex' && buffer.args.length===1) {
                const data=buffer.args[0];
                if(data.type==='String' && !/^[0-9a-f]{96}$/i.test(data.value)) {
                    push(this.note('image.setPalette Buffer.fromHex requires exactly 96 hex digits without whitespace'));return;
                }
                push(`arcade set palette hex (${this.expr(data)})`);return;
            }
            push(this.note('image.setPalette requires a hex literal or Buffer.fromHex expression'));return;
        }
        if (name === 'scene.setBackgroundColor' && a.length === 1) {
            push(`arcade set background color to ${this.expr(a[0])}`);
            return;
        }
        if(this.handleTemplates && name==='animation.attachAnimation' && a.length===2){push(`arcade attach animation (${this.expr(a[1])}) to sprite (${this.expr(a[0])})`);return;}
        if(this.handleTemplates && name==='animation.setAction' && a.length===2){push(`arcade set animation action of (${this.expr(a[0])}) to (${this.expr(a[1])})`);return;}
        if(this.handleTemplates && name==='animation.runImageAnimation' && a.length>=2 && a.length<=4){
            // Pinned game/animation.ts applies frameInterval || 500 and !!loop.
            // Preserve provided operands for the runtime's coercion and evaluate
            // each once; only omitted operands acquire these default literals.
            const interval=a[2] || {type:'Number',value:500};
            const loop=a[3] || {type:'Boolean',value:false};
            push(`arcade animate sprite (${this.expr(a[0])}) frames (${this.expr(a[1])}) interval (${this.expr(interval)}) loop (${this.expr(loop)})`);return;
        }
        if(this.handleTemplates && name==='animation.stopAnimation' && a.length===2){
            const fixed=this.path(a[0]),types={'animation.AnimationTypes.All':0,'animation.AnimationTypes.ImageAnimation':1,'animation.AnimationTypes.MovementAnimation':2};
            if(fixed?.startsWith('animation.AnimationTypes.') && !Object.prototype.hasOwnProperty.call(types,fixed)){push(this.note(`${fixed} is not a declared Arcade AnimationTypes member`));return;}
            push(`arcade stop animations of (${this.expr(a[1])}) type (${Object.prototype.hasOwnProperty.call(types,fixed)?types[fixed]:this.expr(a[0])})`);return;
        }
        if(this.handleTemplates && node.callee?.type==='Member' && node.callee.name==='addAnimationFrame' && this.animationReferences?.has(node.callee.object) && a.length===1){push(`arcade add animation frame (${this.expr(node.callee.object)}) image (${this.expr(a[0])})`);return;}
        if(this.handleTemplates && node.callee?.type==='Member' && node.callee.name==='setInterval' && this.animationReferences?.has(node.callee.object) && a.length===1){push(`arcade set animation interval (${this.expr(node.callee.object)}) to (${this.expr(a[0])})`);return;}
        if(this.handleTemplates && ['scene.setTileMap','scene.setTile','scene.setTileAt','scene.place','scene.placeOnRandomTile'].includes(name) && (this.boundSourceGlobals?.has('scene') || this.sourceFunctions?.has('scene') || this.localVars?.has('scene') || this.currentParameters?.has('scene') || this.capturedBindings.has('scene'))) {push(this.note(`${name} refers to a shadowed scene binding`));return;}
        if(this.handleTemplates && ['scene.setTileAt','scene.place','scene.placeOnRandomTile'].includes(name)) {
            if(a.length!==2){push(this.note(`${name} requires two arguments`));return;}
            if(name==='scene.setTileAt')push(`arcade set color tile (${this.expr(a[0])}) index (${this.expr(a[1])})`);
            else if(name==='scene.place')push(`arcade on color tile (${this.expr(a[0])}) place sprite (${this.expr(a[1])})`);
            else push(`arcade place sprite (${this.expr(a[0])}) on random color tile (${this.expr(a[1])})`);
            return;
        }
        if(this.handleTemplates && node.callee?.type==='Member' && node.callee.name==='place' && this.legacyTileReferences?.has(node.callee.object) && a.length===1){push(`arcade on color tile (${this.expr(node.callee.object)}) place sprite (${this.expr(a[0])})`);return;}
        if(this.handleTemplates && name==='scene.setTileMap') {
            if(a.length<1 || a.length>2){push(this.note('scene.setTileMap requires an image and optional tile scale'));return;}
            const scale=a[1]?this.expr(a[1]):'4';
            push(`arcade set color-coded map image (${this.expr(a[0])}) scale (${scale})`);return;
        }
        if(this.handleTemplates && name==='scene.setTile') {
            if(a.length<2 || a.length>3){push(this.note('scene.setTile requires an index, image and optional wall flag'));return;}
            push(`arcade set color tile (${this.expr(a[0])}) image (${this.expr(a[1])}) wall (${a[2]?this.expr(a[2]):'false'})`);return;
        }
        if(this.handleTemplates && ['tiles.setTilemap','tiles.setCurrentTilemap','scene.setTileMapLevel'].includes(name)) {
            const value=a[0];
            if(a.length===1 && value?.type==='Null'){push('arcade set tilemap data \"null\"');return;}
            const data=value?.type==='Template' && /^(tilemap|assets\.tilemap)$/.test(value.tag||'') ? this.tilemaps[value.value.trim()] : decodeTilemap(value,node=>this.imageOf(node),node=>this.path(node));
            if(!data){this.unsupported.push(`${name}() requires a readable literal tile map with wall layer and tile scale`);return;}
            push(`arcade set tilemap data ${JSON.stringify(JSON.stringify(data))}`);
            const gap='full terrain collision physics and scene lifecycle are not yet supported';
            if(!this.unsupported.includes(gap))this.unsupported.push(gap);
            return;
        }
        if(this.handleTemplates && name==='tiles.setTileAt' && a.length===2){push(`arcade set tile (${this.expr(a[0])}) image (${this.expr(a[1])})`);return;}
        if(this.handleTemplates && name==='tiles.setWallAt' && a.length===2){push(`arcade set tile wall (${this.expr(a[0])}) to (${this.expr(a[1])})`);return;}
        if(this.handleTemplates && name==='tiles.placeOnTile' && a.length===2){push(`arcade place sprite (${this.expr(a[0])}) on tile (${this.expr(a[1])})`);return;}
        if(this.handleTemplates && name==='tiles.placeOnRandomTile' && a.length===2){push(`arcade place sprite (${this.expr(a[0])}) on random tile image (${this.expr(a[1])})`);return;}
        if(name==='game.ask') {
            if(!this.discardedQuestionName){let n=0,name;do{name=`__bwDiscardedQuestion${++n}`;}while(this.taken.has(name));
                this.taken.add(name);this.discardedQuestionName=name;}
            push(`set ${this.discardedQuestionName} to ${this.callExpression(node)}`);return;
        }
        if (this.projectileTemplates.has(node)) {
            // Creation is a side effect even when the caller discards its handle.
            // Scratch reporters need a consuming command to execute. Use a
            // private target variable, with a name outside every source binding.
            if (!this.discardedProjectileName) {
                let suffix = 0, name;
                do { name = `__bwDiscardedProjectile${++suffix}`; } while (this.taken.has(name));
                this.taken.add(name);
                this.discardedProjectileName = name;
            }
            push(`set ${this.discardedProjectileName} to ${this.callExpression(node)}`);
            return;
        }
        if (this.handleTemplates && name === 'sprites.create') {
            push(`set __arcadeCreated to ${this.callExpression(node)}`);
            return;
        }
        if (name === 'sprites.destroy' && this.handleRef(a[0])) {
            push(`arcade destroy ${this.handleRef(a[0])}`);
            if (a.length > 1) push(this.note('sprites.destroy() effect and duration — not rendered'));
            return;
        }
        const imageOwner = node.callee?.object;
        const imageHandle = imageOwner?.type === 'Member' && imageOwner.name === 'image' && this.handleRef(imageOwner.object);
        const resource = this.imageRef(imageOwner);
        if (resource && ['drawImage', 'drawTransparentImage'].includes(node.callee.name)) {
            const source = this.imageRef(a[0]);
            if (a.length !== 3 || !source) { push(this.note(`${name}() needs an image source and x/y offsets`));return; }
            push(`arcade blit image ${node.callee.name} (${resource}) source (${source}) x (${this.expr(a[1])}) y (${this.expr(a[2])})`);return;
        }
        if (resource && !imageHandle && ['fill', 'replace', 'flipX', 'flipY', 'setPixel', 'fillRect', 'drawLine'].includes(node.callee.name)) {
            const operation = node.callee.name;
            const expected = {fill:1, replace:2, flipX:0, flipY:0, setPixel:3, fillRect:5, drawLine:5}[operation];
            if (a.length !== expected) { push(this.note(`${name}() requires ${expected} arguments`)); return; }
            if (operation === 'setPixel') push(`arcade set image pixel (${resource}) x ${this.expr(a[0])} y ${this.expr(a[1])} color ${this.expr(a[2])}`);
            else if (['fillRect', 'drawLine'].includes(operation)) push(`arcade draw image ${operation} (${resource}) x ${this.expr(a[0])} y ${this.expr(a[1])} width ${this.expr(a[2])} height ${this.expr(a[3])} color ${this.expr(a[4])}`);
            else push(`arcade mutate image ${operation} (${resource}) color ${a[0] ? this.expr(a[0]) : 0} replacement ${a[1] ? this.expr(a[1]) : 0}`);
            return;
        }
        if (imageHandle && ['fill', 'replace', 'flipX', 'flipY', 'setPixel', 'getPixel', 'fillRect', 'drawLine', 'drawImage', 'drawTransparentImage', 'overlapsWith'].includes(node.callee.name)) {
            const operation = node.callee.name;
            if (operation === 'setPixel' && a.length === 3) {
                push(`arcade set pixel of ${imageHandle} x ${this.expr(a[0])} y ${this.expr(a[1])} color ${this.expr(a[2])}`);
                return;
            }
            if (['fillRect', 'drawLine'].includes(operation) && a.length === 5) {
                push(`arcade draw ${operation} of ${imageHandle} x ${this.expr(a[0])} y ${this.expr(a[1])} width ${this.expr(a[2])} height ${this.expr(a[3])} color ${this.expr(a[4])}`);
                return;
            }
            if (['setPixel', 'getPixel', 'fillRect', 'drawLine'].includes(operation)) {
                push(this.note(`${name}() — invalid drawing arguments or discarded pixel value`)); return;
            }
            const expected = operation === 'fill' ? 1 : operation === 'replace' ? 2 : 0;
            if (a.length !== expected) { push(this.note(`${name}() requires ${expected} arguments`)); return; }
            push(`arcade image ${operation} of ${imageHandle} color ${a[0] ? this.expr(a[0]) : 0} replacement ${a[1] ? this.expr(a[1]) : 0}`);
            return;
        }
        const handle = node.callee?.type === 'Member' && this.handleRef(node.callee.object);
        if (handle) {
            if (node.callee.name==='setScaleCore') {
                if(a.length>4)push(this.note('sprite.setScaleCore() requires up to four arguments'));
                else push(`arcade scale core of (${handle}) x (${a[0]?this.expr(a[0]):'undefined value'}) y (${a[1]?this.expr(a[1]):'undefined value'}) anchor (${a[2]?this.expr(a[2]):'0'}) proportional (${a[3]?this.expr(a[3]):'false'})`);
            }
            else if (['setScale','changeScale'].includes(node.callee.name)) {
                if(a.length<1 || a.length>2)push(this.note(`sprite.${node.callee.name}() requires one scale and optional anchor`));
                else push(`arcade ${node.callee.name==='setScale'?'set':'change'} scale of (${handle}) ${node.callee.name==='setScale'?'to':'by'} (${this.expr(a[0])}) anchor (${a[1]?this.expr(a[1]):'0'})`);
            }
            else if (node.callee.name === 'destroy') push(`arcade destroy ${handle}`);
            else if (node.callee.name === 'say' || node.callee.name === 'sayText') {
                this.spriteSpeech(handle, node.callee.name, a, push);
            }
            else if (node.callee.name === 'onDestroyed') {
                const registration = this.sceneRegistrations.get(node);
                if (registration) push(`arcade register instance destruction of (${handle}) as "${registration.token}" capturing ${JSON.stringify([...registration.ownCaptures].join(' '))}`);
                else push(this.note('sprite.onDestroyed() requires one inline callback without parameters and a typed sprite reference'));
            }
            else if (node.callee.name === 'setKind') push(`arcade set kind of ${handle} to "${kindOf(a[0])}"`);
            else if (node.callee.name === 'setFlag' && this.path(a[0]) === 'SpriteFlag.AutoDestroy') {
                push(`arcade auto destroy ${handle} outside screen ${this.expr(a[1])}`);
            }
            else if (node.callee.name === 'setStayInScreen') {
                push(`arcade keep ${handle} in screen ${this.expr(a[0])}`);
            }
            else if (node.callee.name === 'setBounceOnWall') {
                push(`arcade bounce ${handle} on wall ${this.expr(a[0])}`);
            }
            else if (node.callee.name === 'setFlag' && this.path(a[0]) === 'SpriteFlag.BounceOnWall') {
                push(`arcade bounce ${handle} on wall ${this.expr(a[1])}`);
            }
            else if (node.callee.name === 'setFlag' && this.path(a[0]) === 'SpriteFlag.GhostThroughSprites') {
                push(`arcade ghost ${handle} through sprites ${this.expr(a[1])}`);
            }
            else if (node.callee.name === 'setFlag' && this.path(a[0]) === 'SpriteFlag.StayInScreen') {
                push(`arcade keep ${handle} in screen ${this.expr(a[1])}`);
            }
            else if (node.callee.name === 'setFlag' &&
                ['Invisible', 'Ghost', 'GhostThroughWalls', 'GhostThroughTiles', 'DestroyOnWall', 'RelativeToCamera'].some(flag =>
                    this.path(a[0]) === `SpriteFlag.${flag}`)) {
                if(a.length!==2)push(this.note(`SpriteFlag.${a[0].name} requires a flag and one Boolean value`));
                else push(`arcade set flag ${a[0].name} of ${handle} to ${this.expr(a[1])}`);
            }
            else if (node.callee.name === 'setImage' && this.imageRef(a[0])) {
                push(`arcade set image of ${handle} to ${this.imageRef(a[0])}`);
            }
            else if (node.callee.name === 'setImage' && this.handleImageLiterals?.has(node)) {
                push(`arcade set costume of ${handle} to ${this.handleImageLiterals.get(node)}`);
            }
            else if (node.callee.name === 'setImage' && this.handleFrameSelections?.has(node)) {
                const selection = this.handleFrameSelections.get(node);
                const value = this.expr(selection.value);
                push(`arcade set image of ${handle} to arcade frame image array "${selection.key}" index (${value}) template "${selection.template}" start ${selection.offset} count ${selection.count}`);
            }
            else if (node.callee.name === 'setImage' &&
                a[0]?.type === 'Call' && this.path(a[0].callee) === 'Math.pickRandom' &&
                a[0].args?.[0]?.type === 'Identifier' && this.handleImageArrays?.has(a[0].args[0].name)) {
                const range = this.handleImageArrays.get(a[0].args[0].name);
                const template = this.handleTemplates.values().next().value;
                push(`arcade set image of ${handle} to arcade frame image array "${a[0].args[0].name}" index (pick random 0 to ${range.end - range.start}) template "${template.name}" start ${range.start} count ${range.end - range.start + 1}`);
            }
            else if (node.callee.name === 'setPosition') {
                push(`arcade set position of (${handle}) x (${this.expr(a[0])}) y (${this.expr(a[1])})`);
            } else if (node.callee.name === 'setVelocity') {
                push(`arcade set vx of ${handle} to ${this.expr(a[0])}`);
                push(`arcade set vy of ${handle} to ${this.expr(a[1])}`);
            } else push(this.note(`${this.path(node.callee)}() — unsupported Arcade handle method`));
            return;
        }

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
            push(`arcade set score to ${this.expr(a[0])}`);
            return;
        // The per-player forms: player one IS the plain score in the extension,
        // so a game that mixes both stays consistent.
        case 'info.player1.setScore':
        case 'info.player2.setScore':
        case 'info.player3.setScore':
        case 'info.player4.setScore':
            push(`arcade set score player (${playerOf(name)}) to (${this.expr(a[0])})`);
            return;
        case 'info.player1.changeScoreBy':
        case 'info.player2.changeScoreBy':
        case 'info.player3.changeScoreBy':
        case 'info.player4.changeScoreBy':
            push(`arcade change score player (${playerOf(name)}) by (${this.expr(a[0])})`);
            return;
        case 'info.player1.setLife':
        case 'info.player2.setLife':
        case 'info.player3.setLife':
        case 'info.player4.setLife':
            push(`set ${playerVar('lives', playerOf(name))} to ${this.expr(a[0])}`);
            return;
        case 'info.player1.changeLifeBy':
        case 'info.player2.changeLifeBy':
        case 'info.player3.changeLifeBy':
        case 'info.player4.changeLifeBy':
            push(`change ${playerVar('lives', playerOf(name))} by ${this.expr(a[0])}`);
            return;
        case 'info.changeScoreBy':
            push(`arcade change score by ${this.expr(a[0])}`);
            return;
        case 'info.setLife':
            push(`set lives to ${this.expr(a[0])}`);
            return;
        case 'info.startCountdown':
            push(`arcade start countdown ${this.expr(a[0])}`);
            return;
        case 'info.stopCountdown':
            push('arcade stop countdown');
            return;
        case 'info.changeLifeBy':
            push(`change lives by ${this.expr(a[0])}`);
            return;

        case 'game.over':
        case 'game.gameOver':
            push('stop all');
            return;
        case 'game.splash':
            if (a.length < 1 || a.length > 2) {
                push(this.note('game.splash() arguments'));
                return;
            }
            push(`arcade splash ${this.expr(a[0])} subtitle ${a[1] ? this.expr(a[1]) : '""'}`);
            return;
        case 'game.showLongText':
            if (a.length !== 2 || !/^DialogLayout\.(Left|Right|Top|Bottom|Center|Full)$/.test(this.path(a[1]) || '')) {
                push(this.note('game.showLongText() layout must be a fixed DialogLayout value'));
                return;
            }
            push(`arcade long text ${this.expr(a[0])} layout "${this.path(a[1]).split('.')[1]}"`);
            return;

        case 'music.playTone':
        case 'music.play':
            push(this.note(`${name}() — Arcade's music has no stage equivalent`));
            return;
        case 'music.stopAllSounds':
            push('stop all sounds');
            return;
        case 'console.log':
            push(`arcade log ${a.length ? this.expr(a[0]) : '""'}`);
            if (a.length > 1) push(this.note('console.log() with multiple values'));
            return;

        // Animation declarations are ASSETS, gathered in pass 1 and turned
        // into costumes; as statements they have nothing to emit, and a
        // generic refusal for each would bury the one note that matters.
        case 'animation.createAnimation':
        case 'animation.attachAnimation':
        case 'animation.setAction':
        case 'animation.runImageAnimation':
        case 'animation.stopAnimation':
            if(this.handleTemplates)push(this.note(`${name}() arguments require supported runtime animation forms`));
            return;

        default:
            // `walkLeft.addAnimationFrame(img`…`)` is a method on a plain
            // variable rather than a sprite, so it arrives here; pass 1
            // already read its art.
            if (node.callee && node.callee.type === 'Member' &&
                node.callee.name === 'addAnimationFrame') {
                if(this.handleTemplates)push(this.note('addAnimationFrame requires a known animation and one image'));
                return;
            }
            super.command(node, indent, out);
        }
    }

    /** `<sprite>.<method>(...)` where <sprite> is a sprite we know. */
    spriteSpeech (handle, method, args, push) {
        const legacy = method === 'say';
        if (!args.length || args.length > (legacy ? 4 : 5)) {
            push(this.note(`sprite.${method}() arguments`));
            return;
        }
        // A literal argument stays a literal in the block's slot: \`false\` is 0 and
        // \`-1\` is -1, as when the import supplies the default (Lite's own export
        // writes them out; read as value words they changed the blocks on a round trip).
        const literal = node => node?.type === 'Boolean' ? (node.value ? '1' : '0') :
            node?.type === 'Unary' && node.op === '-' && node.argument?.type === 'Number' ? num(-Number(node.argument.value)) : null;
        const optional = (index, fallback) => args[index] &&
            args[index].type !== 'Null' &&
            !(args[index].type === 'Identifier' && args[index].name === 'undefined') ? literal(args[index]) ?? this.expr(args[index]) : fallback;
        const escapes = {n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0'};
        const decode = value => value.replace(/\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|([\s\S]))/gi,
            (_, point, unicode, hex, char) => point || unicode || hex ?
                String.fromCodePoint(parseInt(point || unicode || hex, 16)) : escapes[char] ?? char);
        const text = args[0]?.type === 'Null' || args[0]?.type === 'Identifier' &&
            ['null', 'undefined'].includes(args[0].name) ? '""' : args[0]?.type === 'Boolean' ?
            JSON.stringify(String(args[0].value)) : args[0]?.type === 'String' ?
                JSON.stringify(decode(args[0].value)) : this.expr(args[0]);
        push(`arcade say ${handle} text ${text} for ${optional(1, '-1')} ms animated ` +
            `${legacy ? '0' : optional(2, '0')} text color ${optional(legacy ? 2 : 3, '15')} ` +
            `box color ${optional(legacy ? 3 : 4, '1')} mode "${legacy ? 'legacy' : 'text'}"`);
    }

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
        case 'sayText':
            this.spriteSpeech('"self"', method, args, push);
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

    statementInner (st, indent, out) {
        if (st.type === 'Declaration' && this.localVars &&
            st.decls.every(decl => this.localVars.has(decl.name))) {
            for (const decl of st.decls) {
                out.push(`${'  '.repeat(indent)}arcade set local ${decl.name} to ` +
                    `${decl.init ? this.expr(decl.init) : '0'}`);
            }
            return;
        }
        super.statementInner(st, indent, out);
    }

    /** Assignments to sprite properties, before the generic handling. */
    expressionStatement (expr, indent, out) {
        const pad = '  '.repeat(indent);
        const push = line => out.push(pad + line);
        const dataTarget=expr.type==='Assignment'?expr.left:expr.type==='Update'?expr.argument:null;
        if(dataTarget?.type==='Member' && this.playerReferences?.has(dataTarget.object)){push(this.note(`mp.Player.${dataTarget.name} assignment requires native player member support`));return;}
        if(dataTarget?.type==='Member' && this.dataReferences?.has(dataTarget.object) && !this.spriteReferences?.has(dataTarget.object)) {
            push(this.note(`Sprite.data.${dataTarget.name} assignment requires arbitrary object member support`));return;
        }

        if(this.handleTemplates && (expr.type==='Assignment' && expr.left?.type==='Identifier' || expr.type==='Update' && expr.argument?.type==='Identifier')) {
            const target=expr.type==='Update'?expr.argument:expr.left;
            const op=expr.type==='Update'?(expr.op==='++'?'+':'-'):expr.op.slice(0,-1);
            let value;
            if(expr.type==='Assignment' && expr.op==='=')value=this.arrayElementValue(expr.right);
            else if(['+','-','*','/','%'].includes(op)) {
                const left=expr.type==='Update'?{type:'Unary',op:'+',argument:target}:target;
                value=this.expr({type:'Binary',op,left,right:expr.type==='Update'?{type:'Number',value:'1'}:expr.right});
            } else {push(this.note(`${target.name} ${expr.op} — unsupported value assignment`));return;}
            if(this.capturedBindings.has(target.name))push(`arcade set captured ${this.capturedBindings.get(target.name)} to (${value})`);
            else if(target.temporary || this.localVars?.has(target.name) || this.currentParameters?.has(target.name))push(`arcade set local ${this.varName(target.name)} to (${value})`);
            else push(`set ${this.varName(target.name)} to (${value})`);
            return;
        }

        const parameter = expr.type === 'Assignment' && expr.left?.type === 'Identifier' ? expr.left.name :
            expr.type === 'Update' && expr.argument?.type === 'Identifier' ? expr.argument.name : null;
        if (parameter && this.currentParameters?.has(parameter)) {
            const name=this.varName(parameter),prior=`arcade local ${name}`;
            const result=expr.type==='Update' ? `${prior} ${expr.op==='++'?'+':'-'} 1` : expr.op==='=' ? this.expr(expr.right) :
                ['+=','-=','*=','/='].includes(expr.op) ? `${prior} ${expr.op[0]} ${this.expr(expr.right)}` : null;
            if(result===null)push(this.note(`${parameter} ${expr.op} — unsupported parameter assignment`));
            else push(`arcade set local ${name} to ${result}`);return;
        }

        if (expr.type === 'Update' && expr.argument?.type === 'Identifier' && this.localVars?.has(expr.argument.name)) {
            push(`arcade set local ${expr.argument.name} to arcade local ${expr.argument.name} ${expr.op==='++'?'+':'-'} 1`);return;
        }

        if (expr.type === 'Assignment' && expr.left?.type === 'Identifier' &&
            (expr.left.temporary || this.localVars?.has(expr.left.name))) {
            const prior = `arcade local ${expr.left.name}`;
            const value = expr.valuePreserving?this.arrayElementValue(expr.right):this.expr(expr.right);
            const result = expr.op === '=' ? value :
                ['+=', '-=', '*=', '/='].includes(expr.op) ?
                    `${prior} ${expr.op[0]} ${value}` : null;
            if (result === null) push(this.note(`${expr.left.name} ${expr.op} — unsupported local assignment`));
            else push(`arcade set local ${expr.left.name} to ${result}`);
            return;
        }

        if (expr.type === 'Assignment' && expr.left?.type === 'Identifier' && this.capturedBindings.has(expr.left.name)) {
            const name = this.capturedBindings.get(expr.left.name), prior = `arcade captured ${name}`;
            const value = this.expr(expr.right);
            const result = expr.op === '=' ? value : ['+=','-=','*=','/='].includes(expr.op) ? `${prior} ${expr.op[0]} ${value}` : null;
            if (result === null) push(this.note(`${expr.left.name} ${expr.op} — unsupported captured assignment`));
            else push(`arcade set captured ${name} to ${result}`);
            return;
        }

        if (expr.type === 'Assignment' && expr.op === '+=' &&
            expr.left?.type === 'Identifier' && this.stringVars.has(expr.left.name)) {
            const name = this.varName(expr.left.name);
            push(`set ${name} to ${name} join ${this.expr(expr.right)}`);
            return;
        }

        const handle = expr.type === 'Assignment' && expr.left?.type === 'Member' &&
            this.handleRef(expr.left.object);
        if (handle) {
            const property = expr.left.name;
            if (!['x', 'y', 'left', 'right', 'top', 'bottom', 'vx', 'vy', 'ax', 'ay', 'fx', 'fy', 'sx', 'sy', 'scale',
                'width', 'height', 'z', 'lifespan', 'rotation', 'rotationDegrees', 'data'].includes(property)) {
                push(this.note(`${this.path(expr.left)} = … — unsupported Arcade handle property`));
                return;
            }
            const value = this.expr(expr.right);
            const result = expr.op === '=' ? value :
                ['+=','-=','*=','/=','%='].includes(expr.op) ? this.expr({type:'Binary',op:expr.op.slice(0,-1),left:expr.left,right:expr.right}) : null;
            if (result === null) push(this.note(`${this.path(expr.left)} ${expr.op} — unsupported assignment`));
            else push(`arcade set ${property} of ${handle} to ${result}`);
            return;
        }

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
            // \`paddle.x = …\` where \`paddle\` is a loop variable or a parameter: no
            // stage sprite to move. Falling through wrote \`set 0 to …\`, a variable
            // literally named 0 (the property read as an unresolved value).
            if (!owner && !(this.handleTemplates && this.handleRef(expr.left.object)) && SPRITE_PROPERTIES.has(expr.left.name)) {
                const name = expr.left.object.type === 'Identifier' ? expr.left.object.name : 'a value';
                push(this.note(`${name}.${expr.left.name} = … — a sprite held in a variable, which the stage cannot follow`));
                return;
            }
            if (owner) {
                const property = expr.left.name;
                // Velocity is the exception, and it costs nothing: vx and vy
                // already live in a shared variable that the owning sprite's
                // motion loop reads every frame, so ANOTHER script setting it
                // is exact and immediate — no broadcast, no frame of lag, and
                // it is what the game meant. Position is not so lucky: only
                // the sprite itself can be moved, which is why that stays a
                // refusal rather than becoming a broadcast behind your back.
                if (property === 'vx' || property === 'vy') {
                    owner.velocity = true;
                    const variable = `${owner.name}_${property}`;
                    this.declared.add(variable);
                    if (expr.op === '=') push(`set ${variable} to ${this.expr(expr.right)}`);
                    else if (expr.op === '+=') push(`change ${variable} by ${this.expr(expr.right)}`);
                    else if (expr.op === '-=') push(`change ${variable} by (0 - ${this.expr(expr.right)})`);
                    else push(`set ${variable} to ${variable} ${expr.op[0]} ${this.expr(expr.right)}`);
                    return;
                }
                if (owner !== this.self) {
                    push(this.note(`${owner.name}.${property} = … — a script can only change its own sprite`));
                    return;
                }
                if (property === 'x' || property === 'y') {
                    const isX = property === 'x';
                    if (expr.op === '=') {
                        push(`set ${isX ? 'x' : 'y'} to ${isX ? this.stageX(expr.right) : this.stageY(expr.right)}`);
                        return;
                    }
                    if (expr.op === '+=' || expr.op === '-=') {
                        // Two sign flips, and they compose: `-=` reverses the
                        // move, and Arcade's y grows DOWNWARD while the stage's
                        // grows up. Treating every compound operator as `+=`
                        // sent a sprite the wrong way on `x -= n` and was right
                        // on `y -= n` only by accident.
                        const negate = isX ? expr.op === '-=' : expr.op === '+=';
                        push(`change ${isX ? 'x' : 'y'} by ${this.stageLength(expr.right, {negate})}`);
                        return;
                    }
                    // `*=` and `/=` scale the ARCADE coordinate, which is not
                    // the stage one — the stage's origin is elsewhere. So read
                    // back into Arcade units, apply the operator there, and
                    // transform the result, rather than scaling a number that
                    // means something different.
                    const arcade = isX ?
                        `(x position / ${SCALE} + ${HALF_WIDTH})` :
                        `(${HALF_HEIGHT} - y position / ${SCALE})`;
                    const applied = `((${arcade}) ${expr.op[0]} ${this.expr(expr.right)})`;
                    push(isX ?
                        `set x to (${applied} - ${HALF_WIDTH}) * ${SCALE}` :
                        `set y to (${HALF_HEIGHT} - ${applied}) * ${SCALE}`);
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

/** Recover pure typed operator helpers emitted for PXT's mixed-value typing.
 * Match the full body and every use before inlining; names alone never grant
 * intrinsic semantics. Evaluating the operands preserves call argument order.
 */
let legacyArrayHelperTemplates;
// Arcade destroys the current kind collection, not a live query on each
// iteration. Lower through the same snapshot-array and handle destruction
// primitives exposed in Blocks. Newly created callback sprites survive.
const lowerDestroyAllSprites = (program, source) => {
    let suffix = 0;
    const visit = node => {
        if (Array.isArray(node)) return node.map(visit);
        if (!node || typeof node !== 'object') return node;
        for (const key of Object.keys(node)) node[key] = visit(node[key]);
        const call = node.type === 'ExpressionStatement' && node.expr;
        const callee = call?.type === 'Call' && call.callee;
        const kind = call?.args?.[0];
        if (callee?.type !== 'Member' || callee.object?.type !== 'Identifier' ||
            callee.object.name !== 'sprites' || callee.name !== 'destroyAllSpritesOfKind' ||
            call.args.length !== 1 || kind?.type !== 'Member' ||
            kind.object?.type !== 'Identifier' || kind.object.name !== 'SpriteKind') return node;
        do suffix++; while (source.includes(`__bwDestroyKindSprite${suffix}`));
        const name = `__bwDestroyKindSprite${suffix}`;
        return {type: 'ForOf', kind: 'let', name,
            iterable: {type: 'Call', callee: {...callee, name: 'allOfKind'}, args: [kind]},
            body: [{type: 'ExpressionStatement', expr: {type: 'Call',
                callee: {type: 'Member', object: {type: 'Identifier', name}, name: 'destroy'}, args: []}}]};
    };
    return visit(program);
};

// `for (const x of list)` in MakeCode iterates a SNAPSHOT of the array value
// by index. The parser gives every translator a ForOf node; this importer
// lowers it to that index loop, so a reference array (sprites, rows) keeps
// its identity and an element reads through the array-reference words.
// The two helper names are unique within the program's own identifiers.
const desugarForOf = (program, source) => {
    let suffix = 0;
    const fresh = () => {
        do suffix++; while (source.includes(`__bwForOfArray${suffix}`) || source.includes(`__bwForOfIndex${suffix}`));
        return suffix;
    };
    const id = name => ({type: 'Identifier', name});
    const visit = node => {
        if (Array.isArray(node)) return node.map(visit);
        if (!node || typeof node !== 'object') return node;
        for (const key of Object.keys(node)) node[key] = visit(node[key]);
        if (node.type !== 'ForOf') return node;
        const n = fresh();
        const array = `__bwForOfArray${n}`;
        const index = `__bwForOfIndex${n}`;
        const body = Array.isArray(node.body) ? node.body : [node.body];
        return {type: 'Block', body: [
            {type: 'Declaration', kind: 'let', decls: [{name: array, init: node.iterable, isArray: true}]},
            {type: 'For', init: {type: 'Declaration', kind: 'let', decls: [{name: index, init: {type: 'Number', value: 0}}]},
                test: {type: 'Binary', op: '<', left: id(index), right: {type: 'Member', object: id(array), name: 'length'}},
                update: {type: 'Update', op: '++', argument: id(index), prefix: false},
                body: [{type: 'Declaration', kind: node.kind || 'let',
                    decls: [{name: node.name, init: {type: 'Index', object: id(array), index: id(index)}}]}, ...body]}
        ]};
    };
    return visit(program);
};

// Lite's own Arcade export carries the run-token machinery that makes Scratch's
// \`stop\` blocks work in PXT (arcade-runtime.js \`tok\`/\`others\`, export-arcade.js
// stop()). Read back as user code it became DEFINE _tok / _dead / _stopAll and
// the \`stop all\` itself was lost. When that machinery is present VERBATIM, this
// lifts it back: \`_stopAll()\` is \`stop all\`, a mark of \`_stopOthers\` is \`stop
// other scripts in sprite\`, and the run-token lines and their guards vanish.
let exporterTokenTemplates;
const liftExporterStops = program => {
    const shape = node => JSON.stringify(node, (key, value) => (key === 'line' ? undefined : value));
    const templates = exporterTokenTemplates || (exporterTokenTemplates = new Map(
        parseMakeCodeTs(`${HELPERS.tok.ts}\n${HELPERS.others.ts}`).body
            .filter(st => st.type === 'FunctionDeclaration').map(fn => [fn.name, shape(fn)])));
    const declared = new Map(program.body.filter(st => st.type === 'FunctionDeclaration').map(fn => [fn.name, fn]));
    const stopAll = declared.get('_stopAll');
    const generated = ['_tok', '_dead'].every(name => declared.has(name) && shape(declared.get(name)) === templates.get(name)) &&
        (!stopAll || stopAll.body?.[0]?.type === 'ExpressionStatement' && stopAll.body[0].expr?.type === 'Assignment' &&
            stopAll.body[0].expr.left?.name === '_stopMark' && stopAll.body[0].expr.right?.name === '_tokens');
    if (!generated) return program;
    const helpers = new Set(['_tok', '_dead', '_stopAll',
        ...['_stopOthers', '_othersStopped'].filter(name => declared.has(name) && shape(declared.get(name)) === templates.get(name))]);
    const isId = (node, name) => node?.type === 'Identifier' && (name instanceof RegExp ? name.test(node.name) : node.name === name);
    const isCall = (node, name) => node?.type === 'Call' && isId(node.callee, name);
    const marker = name => ({type: 'ExpressionStatement', expr: {type: 'Call', callee: {type: 'Identifier', name}, args: []}});
    // A guard term the export adds at each yield; anything else in the test stays.
    const guardTerm = node => isCall(node, '_dead') && isId(node.args?.[0], '_t') ||
        isCall(node, '_othersStopped') && isId(node.args?.[1], '_t') ||
        node?.type === 'Binary' && node.op === '&&' && node.left?.type === 'Binary' && node.left.op === '<=' &&
            isId(node.left.left, '_t') && isId(node.left.right, /^_som_/);
    const terms = node => node?.type === 'Binary' && node.op === '||' ? [...terms(node.left), ...terms(node.right)] : [node];
    const bareReturn = st => st?.type === 'Return' && !st.value ||
        st?.type === 'Block' && st.body?.length === 1 && bareReturn(st.body[0]) ||
        Array.isArray(st) && st.length === 1 && bareReturn(st[0]);
    const statements = list => {
        const out = [];
        for (let i = 0; i < list.length; i++) {
            const st = list[i];
            if (st?.type === 'FunctionDeclaration' && helpers.has(st.name)) continue;
            if (st?.type === 'Declaration' && st.decls.every(d => /^(_tokens|_stopMark|_som_\w+|_sok_\w+)$/.test(d.name) && !d.init?.type?.startsWith('Call') ||
                d.name === '_t' && isCall(d.init, '_tok'))) continue;
            if (st?.type === 'If' && !st.alternate && bareReturn(st.consequent)) {
                const all = terms(st.test);
                const kept = all.filter(term => !guardTerm(term));
                if (kept.length === 0) continue;
                if (kept.length < all.length) {
                    out.push({...st, test: kept.reduce((left, right) => ({type: 'Binary', op: '||', left, right}))});
                    continue;
                }
            }
            const expr = st?.type === 'ExpressionStatement' && st.expr;
            if (isCall(expr, '_stopAll') && !expr.args?.length) {
                out.push(marker('__bwStopAll'));
                if (bareReturn(list[i + 1])) i++;
                continue;
            }
            if (isCall(expr, '_stopOthers') && isId(expr.args?.[1], '_t')) {
                out.push(marker('__bwStopOthers'));
                continue;
            }
            // \`_som_X = _tokens\` then \`_sok_X = _t\`: stop other scripts of a sprite that is never cloned.
            if (expr?.type === 'Assignment' && isId(expr.left, /^_som_/) && isId(expr.right, '_tokens')) {
                const next = list[i + 1]?.expr;
                if (next?.type === 'Assignment' && isId(next.left, /^_sok_/) && isId(next.right, '_t')) i++;
                out.push(marker('__bwStopOthers'));
                continue;
            }
            out.push(visit(st));
        }
        return out;
    };
    const visit = node => {
        if (Array.isArray(node)) return statements(node);
        if (!node || typeof node !== 'object') return node;
        const copy = {...node};
        for (const key of Object.keys(copy)) {
            if (Array.isArray(copy[key])) copy[key] = copy[key].every(x => x && typeof x === 'object' && 'type' in x) &&
                ['body', 'consequent', 'alternate', 'cases'].includes(key) ? statements(copy[key]) : copy[key].map(visit);
            else if (copy[key] && typeof copy[key] === 'object') copy[key] = visit(copy[key]);
        }
        return copy;
    };
    return {...program, body: statements(program.body)};
};

// PXT library calls that are, by their own definition, expressions the
// translator already has, rewritten to those before translation:
//   Math.percentChance(p) is \`Math.randomRange(0, 99) < p\` (pxt-core math.ts),
//   Math.clamp(lo, hi, v) is min(max(v, lo), hi), each argument read once,
//   control.millis() is the time since the program started, as game.runtime().
const lowerLibraryCalls = program => {
    const callee = node => node?.type === 'Call' && node.callee?.type === 'Member' && node.callee.object?.type === 'Identifier' ?
        `${node.callee.object.name}.${node.callee.name}` : null;
    const call = (object, name, args) => ({type: 'Call', callee: {type: 'Member', object: {type: 'Identifier', name: object}, name}, args});
    const visit = node => {
        if (Array.isArray(node)) return node.map(visit);
        if (!node || typeof node !== 'object') return node;
        const copy = {...node};
        for (const key of Object.keys(copy)) copy[key] = visit(copy[key]);
        const name = callee(copy), a = copy.args || [];
        if (name === 'Math.percentChance' && a.length === 1) {
            return {type: 'Binary', op: '<', left: {type: 'Call', callee: {type: 'Identifier', name: 'randint'},
                args: [{type: 'Number', value: 0}, {type: 'Number', value: 99}]}, right: a[0]};
        }
        if (name === 'Math.clamp' && a.length === 3) return call('Math', 'min', [call('Math', 'max', [a[2], a[0]]), a[1]]);
        if (name === 'control.millis' && a.length === 0) return call('game', 'runtime', []);
        return copy;
    };
    return visit(program);
};

const inlineLegacyArrayHelpers = program => {
    if(!program.body.some(fn=>fn.type==='FunctionDeclaration' && /^__bw(?:Named(?:Parse|Json)Value|ArrayAccess)/.test(fn.name)))return program;
    const templates=legacyArrayHelperTemplates || (legacyArrayHelperTemplates=new Map([
        ['__bwNamedParseValue',{fn:parseMakeCodeTs(LEGACY_PARSE_SOURCE, {parameterDefaults: true}).body[0],type:'LegacyParsedValue'}],
        ['__bwNamedJsonValue',{fn:parseMakeCodeTs(LEGACY_JSON_SOURCE, {parameterDefaults: true}).body[0],type:'LegacyJsonValue'}],
        ['__bwArrayAccess',{fn:parseMakeCodeTs(ARRAY_ACCESS_SOURCE, {parameterDefaults: true}).body[0],type:'NativeArrayAccess'}]
    ]));
    const normalize=(fn,base)=>{
        const rename=node=>Array.isArray(node)?node.map(rename):node && typeof node==='object'?
            Object.fromEntries(Object.entries(node).map(([key,value])=>[key,(key==='name' && value===fn.name)?base:rename(value)])):node;
        return JSON.stringify(rename(fn));
    };
    const helpers=new Map();
    for(const fn of program.body)if(fn.type==='FunctionDeclaration')for(const [base,template] of templates)
        if(new RegExp('^'+base+'_*$').test(fn.name) && normalize(fn,base)===normalize(template.fn,base))helpers.set(fn.name,template);
    const unsafe=new Set();
    const inspect=(node,parent,key)=>{
        if(!node || typeof node!=='object')return;
        if(node.type==='Identifier' && helpers.has(node.name) && !(parent?.type==='Call' && key==='callee' && parent.args.length===1))unsafe.add(node.name);
        for(const [key,value] of Object.entries(node))if(Array.isArray(value))value.forEach(child=>inspect(child,node,key));else inspect(value,node,key);
    };
    for(const node of program.body)if(!helpers.has(node.name))inspect(node);
    for(const name of unsafe)helpers.delete(name);
    const rewrite=node=>{
        if(!node || typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(rewrite);
        if(node.type==='Call' && node.callee?.type==='Identifier' && helpers.has(node.callee.name))return {type:helpers.get(node.callee.name).type,value:rewrite(node.args[0])};
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value)]));
    };
    return rewrite({...program,body:program.body.filter(fn=>!(fn.type==='FunctionDeclaration' && helpers.has(fn.name)))});
};

const inlineValueHelpers = program => {
    const helpers=new Map();
    for(const fn of program.body) {
        if(fn.type!=='FunctionDeclaration' || !/^__bw(?:Binary|Unary|Compare)/.test(fn.name) || fn.body.length!==1 || fn.body[0].type!=='Return')continue;
        const value=fn.body[0].value;
        if(value?.type==='Binary' && ['+','-','*','/','%','==','!=','===','!==','<','>','<=','>='].includes(value.op) && fn.params.length===2 && value.left?.type==='Identifier' && value.left.name===fn.params[0] && value.right?.type==='Identifier' && value.right.name===fn.params[1])helpers.set(fn.name,{fn,value});
        if(value?.type==='Unary' && ['+','-'].includes(value.op) && fn.params.length===1 && value.argument?.type==='Identifier' && value.argument.name===fn.params[0])helpers.set(fn.name,{fn,value});
    }
    const unsafe=new Set();
    const inspect=(node,parent,key)=>{
        if(!node || typeof node!=='object')return;
        if(node.type==='Identifier' && helpers.has(node.name) && !(parent?.type==='Call' && key==='callee' && parent.args.length===helpers.get(node.name).fn.params.length))unsafe.add(node.name);
        for(const [key,value] of Object.entries(node))if(Array.isArray(value))value.forEach(child=>inspect(child,node,key));else inspect(value,node,key);
    };
    inspect(program);for(const name of unsafe)helpers.delete(name);
    if(!helpers.size)return program;
    const rewrite=node=>{
        if(!node || typeof node!=='object')return node;
        if(Array.isArray(node))return node.map(rewrite);
        if(node.type==='Call' && node.callee?.type==='Identifier' && helpers.has(node.callee.name)) {
            const {value}=helpers.get(node.callee.name),args=node.args.map(rewrite);
            return value.type==='Binary'?{...value,left:args[0],right:args[1]}:{...value,argument:args[0]};
        }
        return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,rewrite(value)]));
    };
    return rewrite({...program,body:program.body.filter(fn=>!(fn.type==='FunctionDeclaration' && helpers.has(fn.name)))});
};

/** Infer which procedure parameters receive runtime sprite handles. Follow
 * calls until a function forwarding a handle to another one reaches a fixed
 * point; callback parameters seed the graph with their event handles. */
const inferProcedureHandleParameters = (ast, functions, globalHandles, pathOf) => {
    const byName = new Map(functions.map(fn => [fn.name, fn]));
    const handles = new Map(functions.map(fn => [fn.name, new Set()]));
    for (const fn of functions) {
        const walk = node => {
            if (!node || typeof node !== 'object' || node.type === 'FunctionExpression') return;
            const owner = node.type === 'Call' && node.callee?.object;
            if (owner?.type === 'Member' && owner.name === 'image' && owner.object?.type === 'Identifier' &&
                fn.params.includes(owner.object.name) && ['fill', 'replace', 'flipX', 'flipY', 'setPixel', 'getPixel', 'fillRect', 'drawLine', 'drawImage', 'drawTransparentImage', 'overlapsWith'].includes(node.callee.name)) {
                handles.get(fn.name).add(owner.object.name);
            }
            for (const value of Object.values(node)) {
                if (Array.isArray(value)) value.forEach(walk);
                else if (value && typeof value === 'object') walk(value);
            }
        };
        fn.body.forEach(walk);
    }
    const localSpriteNames = body => {
        const names = new Set();
        const create = node => node?.type === 'Call' &&
            ['sprites.create', 'sprites.createProjectile', 'sprites.createProjectileFromSide',
                'sprites.createProjectileFromSprite'].includes(pathOf(node.callee));
        const walk = statements => {
            for (const st of statements || []) {
                if (st.type === 'Declaration') for (const decl of st.decls) {
                    if (create(decl.init)) names.add(decl.name);
                }
                if (st.type === 'ExpressionStatement' && st.expr?.type === 'Assignment' &&
                    st.expr.left?.type === 'Identifier' && create(st.expr.right)) names.add(st.expr.left.name);
                if (st.type === 'If') { walk(st.consequent); walk(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) walk(st.body);
            }
        };
        walk(body);
        return names;
    };
    const visit = (node, scope = new Set(), shadowed = new Set()) => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'FunctionDeclaration') {
            const local = new Set([...(handles.get(node.name) || []), ...localSpriteNames(node.body)]);
            node.body.forEach(st => visit(st, local, new Set(node.params || [])));
            return;
        }
        if (node.type === 'FunctionExpression') {
            const local = new Set([...scope, ...localSpriteNames(node.body)]);
            node.body.forEach(st => visit(st, local, new Set([...shadowed, ...node.params])));
            return;
        }
        if (node.type === 'Call') {
            const callee = node.callee?.type === 'Identifier' && byName.get(node.callee.name);
            if (callee) node.args.forEach((arg, index) => {
                if (arg?.type !== 'Identifier' || index >= callee.params.length) return;
                if (scope.has(arg.name) || (!shadowed.has(arg.name) && globalHandles.has(arg.name))) {
                    handles.get(callee.name).add(callee.params[index]);
                }
            });
            const event = pathOf(node.callee);
            const eventArgs = event === 'sprites.onOverlap' ? 2 :
                ['sprites.onCreated', 'sprites.onDestroyed','scene.onHitTile','scene.onHitWall','scene.onOverlapTile'].includes(event) ? 1 : 0;
            for (const arg of node.args || []) {
                if (arg?.type === 'FunctionExpression' && eventArgs) {
                    const eventScope = new Set([...scope, ...arg.params.slice(0, eventArgs)]);
                    visit(arg, eventScope, shadowed);
                } else visit(arg, scope, shadowed);
            }
            visit(node.callee, scope, shadowed);
            return;
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(item => visit(item, scope, shadowed));
            else if (value && typeof value === 'object') visit(value, scope, shadowed);
        }
    };
    let changed;
    do {
        const before = [...handles.values()].reduce((n, set) => n + set.size, 0);
        ast.body.forEach(st => visit(st));
        changed = [...handles.values()].reduce((n, set) => n + set.size, 0) !== before;
    } while (changed);
    return handles;
};

/** Infer Image references from bindings and calls, retaining lexical scope.
 * Passing a resource does not copy it. Forwarded parameters and local aliases
 * reach a fixed point, including recursive procedures and callback callers. */
const inferImageReferences = (ast, pathOf, imageOf) => {
    const players = new WeakSet(), references = new WeakSet(), tiles = new WeakSet(), legacyTiles = new WeakSet(), sprites = new WeakSet(), animations = new WeakSet(), scenes = new WeakSet(), physicsEngines = new WeakSet(), nulls = new WeakSet(), arrays = new WeakSet(), numbers = new WeakSet(), strings = new WeakSet(), booleans = new WeakSet();
    const entries = [];
    const functions = new Map();
    const scope = parent => ({parent, bindings: new Map()});
    const global = scope(null);
    const binding = (owner, name, declare = false) => {
        if (declare) {
            if (!owner.bindings.has(name)) owner.bindings.set(name, new Set());
            return owner.bindings.get(name);
        }
        for (let current = owner; current; current = current.parent) {
            if (current.bindings.has(name)) return current.bindings.get(name);
        }
        return binding(global, name, true);
    };
    const visit = (node, owner, eventParameters = []) => {
        if (!node || typeof node !== 'object') return;
        if (['FunctionDeclaration', 'FunctionExpression'].includes(node.type)) {
            owner = scope(owner);
            for (const [i, name] of (node.params || []).entries()) {
                const value = binding(owner, name, true);
                if (eventParameters[i]) value.add(eventParameters[i]);
            }
            if (node.type === 'FunctionDeclaration') functions.set(node.name, {node, owner});
        }
        entries.push({node, owner});
        if (node.type === 'Declaration') for (const decl of node.decls) {const value=binding(owner,decl.name,true);if(decl.isArray)value.add('array');}
        if (node.type === 'Call') {
            const api = pathOf(node.callee);
            const types = api==='mp.onButtonEvent'?['player']:api==='sprites.onOverlap'?['sprite','sprite']:
                api==='scene.onHitTile'?['sprite']:['scene.onHitWall','scene.onOverlapTile'].includes(api)?['sprite','tile']:
                ['sprites.onCreated','sprites.onDestroyed'].includes(api)?['sprite']:[];
            visit(node.callee, owner);
            for (const arg of node.args || []) visit(arg, owner, types);
            return;
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(child => visit(child, owner));
            else if (value && typeof value === 'object') visit(value, owner);
        }
    };
    visit(ast, global);
    const typeOf = (node, owner) => {
        if (imageOf(node)) return new Set(['image']);
        if(node?.type==='Number')return new Set(['number']);
        if(node?.type==='Null')return new Set(['null']);
        if(node?.type==='Member' && node.object?.name==='CameraProperty' && Object.prototype.hasOwnProperty.call(CAMERA_PROPERTIES,node.name))return new Set(['number']);
        if(node?.type==='Member' && node.object?.name==='CollisionDirection' && Object.prototype.hasOwnProperty.call(COLLISION_DIRECTIONS,node.name))return new Set(['number']);
        if(node?.type==='String')return new Set(['string']);
        if(node?.type==='Boolean' || node?.type==='Unary' && node.op==='!' || node?.type==='Binary' && ['==','!=','===','!==','<','>','<=','>='].includes(node.op))return new Set(['boolean']);
        if(node?.type==='Unary' && ['+','-'].includes(node.op))return new Set(['number']);
        if(node?.type==='Binary' && ['-','*','/','%','**'].includes(node.op))return new Set(['number']);
        if(node?.type==='Binary' && node.op==='+') {
            const left=typeOf(node.left,owner),right=typeOf(node.right,owner);
            if(left.has('string')||right.has('string'))return new Set(['string']);
            if(left.has('number')&&right.has('number'))return new Set(['number']);
        }
        if(node?.type==='NativeArrayAccess')return new Set(['array']);
        if(node?.type==='LegacyJsonValue')return new Set(['string']);
        if(node?.type==='LegacyParsedValue')return new Set(['any']);
        if (node?.type === 'Array') return new Set(['array',...node.items.flatMap(item=>[...typeOf(item,owner)].filter(t=>['image','sprite','tile','number','string','scene','physics-engine'].includes(t)).map(t=>`${t}-array`))]);
        if (node?.type === 'Index') return new Set([...typeOf(node.object,owner)].filter(t=>['image-array','sprite-array','tile-array','legacy-tile-array','number-array','string-array','scene-array','physics-engine-array'].includes(t)).map(t=>t.slice(0,-6)));
        if (node?.type === 'Identifier') return binding(owner, node.name);
        if(node?.type==='Member' && ['index','number'].includes(node.name) && typeOf(node.object,owner).has('player'))return new Set(['number']);
        if(node?.type==='Member' && ['maxSpeed','minStep','maxStep'].includes(node.name) && typeOf(node.object,owner).has('physics-engine'))return new Set(['number']);
        if(node?.type==='Member' && node.name==='physicsEngine' && typeOf(node.object,owner).has('scene'))return new Set(['physics-engine']);
        if(node?.type==='Member' && ['fx','fy','sx','sy','scale'].includes(node.name) && typeOf(node.object,owner).has('sprite'))return new Set(['number']);
        if (node?.type === 'Member' && node.name === 'image' && (typeOf(node.object, owner).has('sprite') || typeOf(node.object, owner).has('animation'))) return new Set(['image']);
        if (node?.type === 'Member' && ['action','interval'].includes(node.name) && typeOf(node.object,owner).has('animation')) return new Set(['number']);
        if (node?.type === 'Call') {
            const api = pathOf(node.callee);
            if(['mp.playerSelector','mp.getPlayerByNumber','mp.getPlayerByIndex','mp.getPlayerBySprite'].includes(api))return new Set(['player']);
            if(api==='mp.getPlayerSprite')return new Set(['sprite']);
            if(api==='mp.allPlayers')return new Set(['array']);
            if(api==='mp.getPlayerState' || api==='MultiplayerState.create')return new Set(['number']);
            if(api==='mp.getPlayerProperty')return new Set(['number']);
            if(api==='mp.isButtonPressed' || api==='game.ask')return new Set(['boolean']);
            if(api==='game.currentScene' && !node.args.length)return new Set(['scene']);
            if(api==='ArcadePhysicsEngine' && node.constructorCall && node.args.length<=3)return new Set(['physics-engine']);
            if(api==='scene.cameraProperty' && node.args.length===1 || /^info(?:\.player[1-4])?\.(life|score)$/.test(api||'') && !node.args.length)return new Set(['number']);
            if(/^info(?:\.player[1-4])?\.(hasLife|hasScore)$/.test(api||'') && !node.args.length)return new Set(['boolean']);
            if(api==='animation.createAnimation')return new Set(['animation']);
            if(node.callee?.type==='Member' && typeOf(node.callee.object,owner).has('animation') && node.args.length===0){
                if(node.callee.name==='getImage')return new Set(['image']);
                if(['getAction','getInterval'].includes(node.callee.name))return new Set(['number']);
            }
            if(api==='sprites.allOfKind')return new Set(['array','sprite-array']);
            if(api==='tiles.getTilesByType')return new Set(['array','tile-array']);
            if(api==='tiles.getTileLocation')return new Set(['tile']);
            if(api==='scene.getTile')return new Set(['legacy-tile']);
            if(api==='scene.getTilesByType')return new Set(['array','legacy-tile-array']);
            if(['tiles.tileAtLocationEquals','tiles.tileAtLocationIsWall'].includes(api))return new Set(['boolean']);
            if(node.callee?.type==='Member' && node.callee.name==='isHittingTile' && node.args.length===1 && typeOf(node.callee.object,owner).has('sprite'))return new Set(['boolean']);
            if(node.callee?.type==='Member' && node.callee.name==='toString' && !node.args.length && typeOf(node.callee.object,owner).has('sprite'))return new Set(['string']);
            if (api === 'image.create' && node.args.length === 2 || api === 'scene.backgroundImage' && !node.args.length) return new Set(['image']);
            if (node.callee?.type === 'Member' && (['pop','shift','removeAt','get'].includes(node.callee.name) || node.callee.name==='_pickRandom' && !node.args.length) && typeOf(node.callee.object,owner).has('array')) return new Set([...typeOf(node.callee.object,owner)].filter(t=>['image-array','sprite-array','tile-array','legacy-tile-array','number-array','string-array','scene-array','physics-engine-array'].includes(t)).map(t=>t.slice(0,-6)));
            if (api==='Math.pickRandom' && node.args.length===1) return new Set([...typeOf(node.args[0],owner)].filter(t=>['image-array','sprite-array','tile-array','legacy-tile-array','number-array','string-array','scene-array','physics-engine-array'].includes(t)).map(t=>t.slice(0,-6)));
            if (node.callee?.type === 'Identifier' && functions.has(node.callee.name)) return functions.get(node.callee.name).returns || new Set();
            if (['sprites.create', 'sprites.createProjectile', 'sprites.createProjectileFromSide',
                'sprites.createProjectileFromSprite'].includes(api)) return new Set(['sprite']);
            if (node.callee?.type === 'Member' && node.callee.name === 'clone' &&
                !node.args.length && typeOf(node.callee.object, owner).has('image')) return new Set(['image']);
        }
        return new Set();
    };
    let changed;
    const merge = (into, from) => {
        for (const value of from) if (!into.has(value)) { into.add(value); changed = true; }
    };
    do {
        changed = false;
        for (const {node, owner} of entries) {
            if (node.type === 'Return') for (const fn of functions.values()) if (fn.owner === owner) {
                if (!fn.returns) fn.returns = new Set();merge(fn.returns, typeOf(node.value,owner));
            }
            if (node.type === 'Declaration') for (const decl of node.decls) merge(binding(owner, decl.name), typeOf(decl.init, owner));
            if (node.type === 'Assignment' && node.op === '=' && node.left?.type === 'Identifier') merge(binding(owner, node.left.name), typeOf(node.right, owner));
            if (node.type==='Assignment' && node.left?.type==='Index' && node.left.object?.type==='Identifier') {
                merge(binding(owner,node.left.object.name),new Set([...typeOf(node.right,owner)].filter(t=>['image','sprite','tile','number','string','scene','physics-engine'].includes(t)).map(t=>`${t}-array`)));
            }
            if (node.type==='Call' && node.callee?.type==='Member' && ['push','unshift','insertAt','set'].includes(node.callee.name) && node.callee.object?.type==='Identifier') {
                const value=node.args[['insertAt','set'].includes(node.callee.name)?1:0];
                merge(binding(owner,node.callee.object.name),new Set([...typeOf(value,owner)].filter(t=>['image','sprite','tile','number','string','scene','physics-engine'].includes(t)).map(t=>`${t}-array`)));
            }
            if (node.type === 'Call' && node.callee?.type === 'Identifier') {
                const fn = functions.get(node.callee.name);
                if (fn) node.args.forEach((arg, i) => {
                    if (i < fn.node.params.length) merge(binding(fn.owner, fn.node.params[i]), typeOf(arg, owner));
                });
            }
        }
    } while (changed);
    // Join array element constraints as a graph, so nested arrays and aliases
    // retain their element types without unrolling recursive array types.
    const graph = new ValueTypeGraph();
    const cell = (node, owner) => {
        if(node?.type === 'Identifier')return binding(owner,node.name);
        if(node?.type === 'Member' && node.name === 'data') {
            const value=graph.property(cell(node.object,owner),'data');graph.add(value,'SpriteData');return value;
        }
        return node;
    };
    const connect = (left,right) => {if(left && right)graph.merge(left,right);};
    for (const fn of functions.values()) {
        fn.resultCell = Symbol('procedure result');
        applyDeclaredValueType(graph, fn.resultCell, fn.node.returnType);
    }
    for (const {node, owner} of entries) {
        if (['FunctionDeclaration', 'FunctionExpression'].includes(node.type)) {
            for (const name of node.params || []) {
                applyDeclaredValueType(graph, binding(owner, name), node.paramTypes?.[name]?.text);
            }
        }
        if (node.type === 'Declaration') for (const decl of node.decls) {
            applyDeclaredValueType(graph, binding(owner, decl.name), decl.typeName);
        }
    }
    for (const {node,owner} of entries) {
        const value=cell(node,owner);
        for (const type of typeOf(node,owner)) {
            const name={image:'Image',sprite:'Sprite',tile:'TileLocation','legacy-tile':'LegacyTile',animation:'Animation',scene:'Scene','physics-engine':'PhysicsEngine',player:'Player',number:'number',string:'string',boolean:'boolean',array:'array'}[type];
            if(name)graph.add(value,name);
        }
        if(node.type==='Call' && pathOf(node.callee)==='mp.allPlayers'){graph.add(value,'array');graph.add(graph.element(value),'Player');}
        if(node.type==='Call' && pathOf(node.callee)==='sprites.allOfKind'){graph.add(value,'array');graph.add(graph.element(value),'Sprite');}
        if(node.type==='Call' && pathOf(node.callee)==='scene.getTilesByType'){graph.add(value,'array');graph.add(graph.element(value),'LegacyTile');}
        if(node.type==='Call' && pathOf(node.callee)==='tiles.getTilesByType'){graph.add(value,'array');graph.add(graph.element(value),'TileLocation');}
        if(node.type==='Array') for(const item of node.items)connect(graph.element(value),cell(item,owner));
        if(node.type==='Declaration')for(const decl of node.decls){
            const variable=binding(owner,decl.name);
            if(decl.isArray)graph.add(variable,'array');
            connect(variable,cell(decl.init,owner));
        }
        if(node.type==='Assignment' && node.op==='=')connect(cell(node.left,owner),cell(node.right,owner));
        if(node.type==='Return')for(const fn of functions.values())if(fn.owner===owner)connect(fn.resultCell,cell(node.value,owner));
        if(node.type==='Call' && node.callee?.type==='Identifier'){
            const fn=functions.get(node.callee.name);
            if(fn){
                connect(value,fn.resultCell);
                node.args.forEach((arg,i)=>{if(i<fn.node.params.length)connect(binding(fn.owner,fn.node.params[i]),cell(arg,owner));});
            }
        }
    }
    let revision;
    do {
        revision=graph.revision;
        for(const {node,owner} of entries){
            const value=cell(node,owner);
            if(node.type==='Index' && graph.has(cell(node.object,owner),'array'))connect(value,graph.element(cell(node.object,owner)));
            if(node.type==='Member' && node.name==='image' && (graph.has(cell(node.object,owner),'Sprite') || graph.has(cell(node.object,owner),'Animation')))graph.add(value,'Image');
            if(node.type!=='Call')continue;
            const receiver=node.callee?.type==='Member' && cell(node.callee.object,owner),op=node.callee?.name;
            if(receiver && graph.has(receiver,'array')){
                if(['push','unshift','insertAt','set'].includes(op))connect(graph.element(receiver),cell(node.args[['insertAt','set'].includes(op)?1:0],owner));
                if(['pop','shift','removeAt','get'].includes(op) || op==='_pickRandom' && !node.args.length)connect(value,graph.element(receiver));
            }
            if(pathOf(node.callee)==='Math.pickRandom' && node.args.length===1 && graph.has(cell(node.args[0],owner),'array'))connect(value,graph.element(cell(node.args[0],owner)));
            if(receiver && op==='clone' && !node.args.length && graph.has(receiver,'Image'))graph.add(value,'Image');
        }
    } while(revision!==graph.revision);
    const data = new WeakSet();
    for (const {node, owner} of entries) {
        const value=cell(node,owner);
        if(graph.has(value,'SpriteData'))data.add(node);
        if (graph.has(value,'array')) arrays.add(node);
        if (graph.has(value,'string')) strings.add(node);
        if (graph.has(value,'boolean')) booleans.add(node);
        if (node.type==='Number' || graph.has(value,'number') && !['array','Image','Sprite','string','boolean'].some(type=>graph.has(value,type))) numbers.add(node);
        if (graph.has(value,'Image')) references.add(node);
        if (graph.has(value,'Sprite')) sprites.add(node);
        if (graph.has(value,'Player')) players.add(node);
        if (graph.has(value,'TileLocation')) tiles.add(node);
        if (graph.has(value,'LegacyTile')) legacyTiles.add(node);
        if (graph.has(value,'Animation')) animations.add(node);
        const types=typeOf(node,owner);
        if(types.has('scene') || graph.has(value,'Scene') && !['number','string','boolean','Image','Sprite','PhysicsEngine'].some(type=>graph.has(value,type)))scenes.add(node);
        if(types.has('physics-engine') || graph.has(value,'PhysicsEngine') && !['number','string','boolean','Image','Sprite','Scene'].some(type=>graph.has(value,type)))physicsEngines.add(node);
        if(types.has('null') && [...types].every(type=>type==='null'||type==='sprite'))nulls.add(node);
    }
    return {players, images: references, tiles, legacyTiles, sprites, animations, scenes, physicsEngines, nulls, arrays, numbers, strings, booleans, data,
        spriteFunctions:new Set([...functions].filter(([,fn])=>graph.has(fn.resultCell,'Sprite')).map(([name])=>name)),
        parameters:new Map([...functions].map(([name,fn])=>[name,new Set(fn.node.params.filter(param=>graph.has(binding(fn.owner,param),'Sprite')))]))};
};

const containsAst = (node,predicate) => node && typeof node==='object' &&
    (predicate(node) || Object.values(node).some(value=>Array.isArray(value)?value.some(child=>containsAst(child,predicate)):containsAst(value,predicate)));
const isFrameRegistration = name => ['game.onUpdate','game.onUpdateInterval'].includes(name);
const isButtonRegistration = name => /^controller\.(A|B|up|down|left|right)\.onEvent$/.test(name || '');
const isInfoRegistration = name => /^info(?:\.player[1-4])?\.onLifeZero$/.test(name || '') || name==='info.onCountdownEnd';
const isForeverRegistration = name => ['forever','game.forever','basic.forever'].includes(name);
const isSpriteRegistration = name => ['sprites.onDestroyed','sprites.onOverlap'].includes(name);
const isParallelLaunch = name => name==='control.runInParallel';
const isIndependentRegistration = name => isParallelLaunch(name) || isFrameRegistration(name) || isButtonRegistration(name) || isInfoRegistration(name) || isForeverRegistration(name) || isSpriteRegistration(name);
const sceneRegistrationSpec = name => {
    const specs={
        'game.addScenePushHandler':{kind:'scenePush',handlerIndex:0,arity:1,prefix:'__bwScenePush',maxParams:1},
        'game.addScenePopHandler':{kind:'scenePop',handlerIndex:0,arity:1,prefix:'__bwScenePop',maxParams:1},
        'forever':{kind:'forever',handlerIndex:0,arity:1,prefix:'__bwForever',maxParams:0},
        'control.runInParallel':{kind:'parallel',handlerIndex:0,arity:1,prefix:'__bwParallel',maxParams:0},
        'game.forever':{kind:'forever',handlerIndex:0,arity:1,prefix:'__bwForever',maxParams:0},
        'basic.forever':{kind:'forever',handlerIndex:0,arity:1,prefix:'__bwForever',maxParams:0},
        'info.onLifeZero':{kind:'lifeZero',handlerIndex:0,arity:1,prefix:'__bwLifeZero',maxParams:0},
        'info.player1.onLifeZero':{kind:'lifeZero',handlerIndex:0,arity:1,prefix:'__bwLifeZero',maxParams:0},
        'info.onCountdownEnd':{kind:'countdown',handlerIndex:0,arity:1,prefix:'__bwCountdown',maxParams:0},
        'mp.onButtonEvent':{kind:'multiplayerButton',handlerIndex:2,arity:3,prefix:'__bwMPButton',maxParams:1},
        'game.onUpdate':{kind:'update',handlerIndex:0,arity:1,prefix:'__bwUpdate',maxParams:0},
        'game.onUpdateInterval':{kind:'interval',handlerIndex:1,arity:2,prefix:'__bwInterval',maxParams:0},
        'sprites.onDestroyed':{kind:'destroyed',handlerIndex:1,arity:2,prefix:'__bwKindDestroyed',maxParams:1,kinds:[0]},
        'sprites.onOverlap':{kind:'overlap',handlerIndex:2,arity:3,prefix:'__bwOverlap',maxParams:2,kinds:[0,1]}
    };
    return specs[name] || (/^info\.player[1-4]\.onLifeZero$/.test(name||'')?{kind:'lifeZero',handlerIndex:0,arity:1,prefix:'__bwLifeZero',maxParams:0}:null) || (/^controller\.(A|B|up|down|left|right)\.onEvent$/.test(name||'')?{kind:'button',handlerIndex:1,arity:2,prefix:'__bwButton',maxParams:0}:null);
};

const discoverRuntimeRegistrations = (ast, translator) => {
    const specs={
        'sprites.onCreated':{kind:'creation',handlerIndex:1,arity:2,prefix:'__bwCreated'},
        'scene.onHitTile':{kind:'legacyWall',handlerIndex:2,arity:3,prefix:'__bwColorWall',maxParams:1,kinds:[0]},
        'scene.onHitWall':{kind:'wall',handlerIndex:1,arity:2,prefix:'__bwWall'},
        'scene.onOverlapTile':{kind:'tile',handlerIndex:2,arity:3,prefix:'__bwTile'}
    };
    const counts=new Map();
    const registrations = new Map();
    const localNames = body => {
        const names = new Set();
        const visit = statements => { for (const st of statements || []) {
            if (st.type === 'Declaration') for (const decl of st.decls) names.add(decl.name);
            if (st.type === 'If') { visit(st.consequent);visit(st.alternate); }
            if (['For','While','Block'].includes(st.type)) visit(st.body);
        }};
        visit(body);return names;
    };
    const visit = (node, bindings = new Map(), owner = null) => {
        if (!node || typeof node !== 'object') return;
        if (['FunctionDeclaration','FunctionExpression'].includes(node.type)) {
            bindings = new Map(bindings);owner = node;
            for (const param of node.params || []) bindings.set(param, {key:translator.varName(param),owner});
            for (const local of localNames(node.body)) bindings.set(local, {key:local,owner});
        }
        const instance=node.type==='Call' && node.callee?.type==='Member' && node.callee.name==='onDestroyed' && translator.spriteReferences.has(node.callee.object);
        const spec=instance?{kind:'instanceDestroyed',handlerIndex:0,arity:1,prefix:'__bwInstanceDestroyed',maxParams:0}:node.type==='Call' && (specs[translator.path(node.callee)] || (translator.sceneStackProgram || isIndependentRegistration(translator.path(node.callee))) && sceneRegistrationSpec(translator.path(node.callee)));
        if (spec) {
            const handler=node.args?.[spec.handlerIndex];
            const kind=node.args?.[0];
            const nativeScene=spec.maxParams!==undefined;
            const validScene=nativeScene && handler?.params?.length<=spec.maxParams &&
                (spec.kinds||[]).every(index=>node.args[index]?.type==='Member' && translator.path(node.args[index].object)==='SpriteKind') &&
                (!['scenePush','scenePop'].includes(spec.kind) || !handler.params.length || !containsAst(handler.body,value=>value.type==='Identifier' && value.name===handler.params[0]));
            if (handler?.type==='FunctionExpression' && node.args.length===spec.arity &&
                (nativeScene?validScene:spec.kind==='creation' || handler.params.length<=2 && kind?.type==='Member' && translator.path(kind.object)==='SpriteKind')) {
                const captures = new Map(bindings);
                for (const name of [...(handler.params || []), ...localNames(handler.body)]) captures.delete(name);
                const index=(counts.get(spec.kind)||0)+1;counts.set(spec.kind,index);
                registrations.set(node, {kind:spec.kind, token:`${spec.prefix}${index}`, handler,
                    captures:new Map([...captures].map(([name,value])=>[name,value.key])),
                    ownCaptures:new Set([...captures.values()].filter(value=>value.owner===owner).map(value=>value.key)),
                    locals: localNames(handler.body)});
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(child => visit(child, bindings, owner));
            else if (value && typeof value === 'object') visit(value, bindings, owner);
        }
    };
    visit(ast);return registrations;
};

const emitCreatedRegistrations = (translator, out, localHandles = new Map(), callbackLocals = new Map()) => {
    for (const {token, handler, captures, locals} of translator.createdRegistrations.values()) {
        const previousCaptures = translator.capturedBindings;
        translator.capturedBindings = captures;
        translator.localVars = locals;
        translator.localHandleVars = localHandles.get(callbackLocals.get(handler)) || new Set();
        translator.handleAliases = new Map(handler.params?.[0] ? [[handler.params[0], 'arcade event first']] : []);
        out.push(`WHEN arcade creation handler "${token}" runs:`);
        // Keep callback arguments available as cells if a nested registration
        // captures them after this handler returns.
        if (handler.params?.[0]) out.push(`  arcade set local ${translator.varName(handler.params[0])} to arcade event first`);
        translator.block(handler.body, 1, out);
        translator.capturedBindings = previousCaptures;
        translator.localVars = null;translator.localHandleVars = new Set();translator.handleAliases = new Map();
        out.push('');
    }
};

const emitTerrainRegistrations = (translator,out,localHandles=new Map(),callbackLocals=new Map()) => {
    for(const {kind,token,handler,captures,locals} of translator.terrainRegistrations.values()) {
        const previous={captures:translator.capturedBindings,locals:translator.localVars,parameters:translator.currentParameters,handles:translator.localHandleVars,aliases:translator.handleAliases};
        translator.capturedBindings=captures;
        translator.localVars=new Set([...locals,...handler.params]);
        translator.currentParameters=new Set(handler.params);
        translator.localHandleVars=new Set([...(localHandles.get(callbackLocals.get(handler)) || []),...(handler.params[0]?[handler.params[0]]:[])]);
        translator.handleAliases=new Map();
        out.push(`WHEN arcade ${kind==='legacyWall'?'color wall':kind} handler "${token}" runs:`);
        for(const [index,param] of handler.params.entries())out.push(`  arcade set local ${translator.varName(param)} to ${index===0?'arcade event first':'arcade event location'}`);
        translator.block(handler.body,1,out);out.push('');
        translator.capturedBindings=previous.captures;translator.localVars=previous.locals;translator.currentParameters=previous.parameters;translator.localHandleVars=previous.handles;translator.handleAliases=previous.aliases;
    }
};

const emitSceneRegistrations = (translator,out,localHandles=new Map(),callbackLocals=new Map()) => {
    for(const {kind,token,handler,captures,locals} of translator.sceneRegistrations.values()) {
        const previous={captures:translator.capturedBindings,locals:translator.localVars,parameters:translator.currentParameters,handles:translator.localHandleVars,aliases:translator.handleAliases};
        translator.capturedBindings=captures;
        translator.localVars=new Set([...locals,...handler.params]);
        translator.currentParameters=new Set(handler.params);
        const spriteParams=kind==='destroyed'?handler.params.slice(0,1):kind==='overlap'?handler.params.slice(0,2):[];
        translator.localHandleVars=new Set([...(localHandles.get(callbackLocals.get(handler)) || []),...spriteParams]);
        translator.handleAliases=new Map();
        const label=kind==='multiplayerButton'?'multiplayer button':kind==='scenePush'?'scene push':kind==='scenePop'?'scene pop':kind==='instanceDestroyed'?'instance destruction':kind==='destroyed'?'destroyed kind':kind==='lifeZero'?'life zero':kind;
        out.push(`WHEN arcade ${label} handler "${token}" runs:`);
        if(kind==='multiplayerButton' && handler.params[0])out.push(`  arcade set local ${translator.varName(handler.params[0])} to arcade event player`);
        for(const [index,param] of spriteParams.entries())out.push(`  arcade set local ${translator.varName(param)} to arcade event ${index===0?'first':'second'}`);
        translator.block(handler.body,1,out);out.push('');
        translator.capturedBindings=previous.captures;translator.localVars=previous.locals;translator.currentParameters=previous.parameters;translator.localHandleVars=previous.handles;translator.handleAliases=previous.aliases;
    }
};

const appendHandleProcedures = (translator, functions, parameterHandles, out, localHandles = new Map()) => {
    for (const fn of functions) {
        const signature = fn.params?.length ?
            `${fn.name} ${fn.params.map(param => `(${translator.varName(param)})`).join(' ')}` : fn.name;
        const lines = [`DEFINE ${signature}:`];
        const collectLocals = body => {
            for (const st of body || []) {
                if (st.type === 'Declaration') for (const decl of st.decls) translator.localVars.add(decl.name);
                if (st.type === 'For' && st.init?.type === 'Declaration') for (const decl of st.init.decls) translator.localVars.add(decl.name);
                if (st.type === 'If') { collectLocals(st.consequent); collectLocals(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) collectLocals(st.body);
            }
        };
        translator.localVars = new Set();
        translator.currentParameters = new Set(fn.params || []);
        collectLocals(fn.body);
        translator.parameterHandleVars = new Set([...(parameterHandles.get(fn.name) || []), ...(translator.inferredSpriteParameters?.get(fn.name) || [])]);
        translator.localHandleVars = localHandles.get(fn.name) || new Set();
        translator.block(fn.body, 1, lines);
        translator.parameterHandleVars = new Set();
        translator.localHandleVars = new Set();
        translator.currentParameters = null;
        translator.localVars = null;
        out.push(...lines, '');
    }
};

/**
 * A small, exact path for games that create unnamed sprites and configure
 * each one in sprites.onCreated. A fixed Scratch target cannot represent
 * this pattern: each callback receives a different runtime sprite. Keep the
 * older translator for programs with named sprites or other setup until the
 * handle path covers their full control flow.
 */
const translateCreationEvents = (ast, assets) => {
    const t = new ArcadeTranslator(assets, {});
    const calls = ast.body.map(st => st.type === 'ExpressionStatement' && st.expr?.type === 'Call' ? st.expr : null);
    const nameOf = call => call && t.path(call.callee);
    const created = calls.filter(call => nameOf(call) === 'sprites.onCreated');
    if (!created.length) return null;
    const allowed = new Set(['sprites.onCreated', 'sprites.onDestroyed', 'game.onUpdateInterval',
        'sprites.create', 'game.splash', 'pause']);
    for (const [index, st] of ast.body.entries()) {
        if (st.type === 'Namespace' && st.name === 'SpriteKind') continue;
        if (st.type === 'FunctionDeclaration') continue;
        if (st.type === 'If') continue;
        if (st.type === 'For') continue;
        if (st.type === 'ExpressionStatement' && st.expr?.type === 'Assignment' &&
            st.expr.left?.type === 'Identifier' &&
            !(st.expr.right?.type === 'Call' && nameOf(st.expr.right) === 'sprites.create')) continue;
        if (st.type === 'Declaration' && st.decls.every(d => d.isArray || d.init?.type === 'Array' ||
            !(d.init?.type === 'Call' && nameOf(d.init) === 'sprites.create'))) continue;
        if (!allowed.has(nameOf(calls[index]))) return null;
    }
    const intervals = calls.filter(call => nameOf(call) === 'game.onUpdateInterval');
    const destroyed = calls.filter(call => nameOf(call) === 'sprites.onDestroyed');
    if (intervals.some(call => !call.args?.[1] || call.args[1].type !== 'FunctionExpression' ||
        !call.args[1].body.every(st => st.type === 'ExpressionStatement' &&
            st.expr?.type === 'Call' && nameOf(st.expr) === 'sprites.create'))) return null;
    if ([...created, ...destroyed].some(call => call.args?.[1]?.type !== 'FunctionExpression')) return null;

    const creates = [];
    const collectCreates = body => {
        for (const st of body || []) {
            if (st.type === 'ExpressionStatement' && st.expr?.type === 'Call') {
                if (nameOf(st.expr) === 'sprites.create') creates.push(st.expr);
                for (const arg of st.expr.args || []) if (arg?.type === 'FunctionExpression') collectCreates(arg.body);
            }
            if (st.type === 'If') { collectCreates(st.consequent); collectCreates(st.alternate); }
            if (['For', 'While', 'Block', 'FunctionDeclaration'].includes(st.type)) collectCreates(st.body);
        }
    };
    collectCreates(ast.body);
    if (!creates.length) return null;
    t.claimNames(ast);
    for (const st of ast.body) if (st.type === 'Declaration') for (const d of st.decls) {
        if (d.init?.type === 'String' || d.init?.type === 'Call' &&
            t.path(d.init.callee) === 'game.askForString') t.stringVars.add(d.name);
    }
    t.functions.push(...ast.body.filter(st => st.type === 'FunctionDeclaration')
        .map(fn => ({name: fn.name, params: fn.params, body: fn.body})));
    const parameterHandles = inferProcedureHandleParameters(ast, t.functions, new Set(), node => t.path(node));
    const imageArrays = new Map();
    let nextCostume = 1;
    for (const st of ast.body) if (st.type === 'Declaration') for (const d of st.decls) {
        if (!d.isArray && d.init?.type !== 'Array') continue;
        const images = d.init?.items?.map(node => t.imageOf(node)) || [];
        if (images.length && images.every(Boolean)) {
            imageArrays.set(d.name, {images, start: nextCostume, end: nextCostume + images.length - 1});
            nextCostume += images.length;
        } else t.unsupported.push(`array ${d.name} — data is not imported by the Arcade creation-event path`);
    }
    const costumes = [];
    t.handleTemplates = new Map();
    t.handleImageArrays = imageArrays;
    for (const [index, call] of creates.entries()) {
        const image = t.imageOf(call.args[0]);
        if (!image) return null;
        const template = {name: `__arcadeTemplate${index + 1}`,
            kind: kindOf(call.args[1]), width: image.width, height: image.height};
        t.handleTemplates.set(call, template);
        costumes.push({sprite: template.name, name: `${template.name}-art`,
            svg: imageToSvg(image), mode: 'replace'});
        for (const [arrayName, range] of imageArrays) for (const [choice, art] of range.images.entries()) {
            costumes.push({sprite: template.name, name: `${arrayName}-${choice + 1}`,
                svg: imageToSvg(art), mode: 'add'});
        }
    }
    const globals = ast.body.filter(st => st.type === 'Declaration')
        .flatMap(st => st.decls.filter(d => !d.isArray && d.init?.type !== 'Array').map(d => d.name));
    const out = ['DEVICE ARCADE', '', 'GLOBAL __arcadeCreated',
        ...globals.map(name => `GLOBAL ${t.varName(name)}`), '', 'SPRITE Game:'];
    const setup = ast.body.filter(st => st.type === 'Declaration' &&
        st.decls.every(d => !d.isArray && d.init?.type !== 'Array') || ['If', 'For'].includes(st.type) ||
        st.type === 'ExpressionStatement' && st.expr?.type === 'Assignment' &&
            st.expr.left?.type === 'Identifier' ||
        ['sprites.create', 'sprites.onCreated', 'game.splash', 'pause'].includes(nameOf(st.type === 'ExpressionStatement' ? st.expr : null)));
    {
        out.push('WHEN flag clicked:', '  hide');
        for (const st of setup) t.statement(st, 1, out);
        out.push('');
    }
    for (const call of intervals) {
        const ms = Number(call.args[0]?.value);
        if (!Number.isFinite(ms) || ms <= 0) return null;
        out.push(`WHEN arcade every ${num(ms)} ms:`);
        t.block(call.args[1].body, 1, out);
        out.push('');
    }
    emitCreatedRegistrations(t, out);
    for (const call of destroyed) {
        const handler = call.args[1];
        t.handleAliases = new Map(handler.params?.[0] ? [[handler.params[0], 'arcade event first']] : []);
        out.push(`WHEN arcade kind "${kindOf(call.args[0])}" destroyed:`);
        t.block(handler.body, 1, out);
        t.handleAliases = new Map();
        out.push('');
    }
    appendHandleProcedures(t, t.functions, parameterHandles, out);
    const names = ['Game'];
    for (const template of t.handleTemplates.values()) {
        names.push(template.name);
        out.push(`SPRITE ${template.name}:`, 'WHEN flag clicked:', '  hide', '');
    }
    return {code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)], costumes, sprites: names};
};

/** Handle-valued globals plus onCreated/onOverlap callbacks. Kept separate
 * from the fixed-target path until its other sprite APIs can use handles. */
const translateNamedHandleEvents = (ast, assets, tilemaps = {}, forceSpriteRuntime = false) => {
    const t = new ArcadeTranslator(assets, tilemaps);
    const needsProjectileHandles = node => {
        if (!node || typeof node !== 'object') return false;
        if (node.type === 'Call' && ['sprites.onCreated', 'image.create'].includes(t.path(node.callee))) return true;
        if (node.type === 'ExpressionStatement' && node.expr?.type === 'Call' &&
            ['sprites.createProjectile', 'sprites.createProjectileFromSide',
                'sprites.createProjectileFromSprite'].includes(t.path(node.expr.callee))) return true;
        if (node.type === 'Call' && ['sprites.createProjectile', 'sprites.createProjectileFromSide',
            'sprites.createProjectileFromSprite'].includes(t.path(node.callee)) &&
            ['Identifier', 'Call', 'Index'].includes(node.args?.[0]?.type)) return true;
        if (node.type === 'Call' && ['sprites.createProjectile', 'sprites.createProjectileFromSide',
            'sprites.createProjectileFromSprite'].includes(t.path(node.callee)) && node.args?.[0]?.type === 'Member' &&
            node.args[0].name === 'image') return true;
        return Object.values(node).some(value=>Array.isArray(value)?value.some(needsProjectileHandles):needsProjectileHandles(value));
    };
    const hasReturnedCreations = node => node && typeof node === 'object' && (node.type === 'Return' && node.value?.type === 'Call' && /^sprites\.create/.test(t.path(node.value.callee) || '') || Object.values(node).some(value => Array.isArray(value) ? value.some(hasReturnedCreations) : hasReturnedCreations(value)));
    const hasCreationCallbacks = needsProjectileHandles(ast) || hasReturnedCreations(ast);
    const creationApis = new Set(['sprites.create', 'sprites.createProjectile',
        'sprites.createProjectileFromSide', 'sprites.createProjectileFromSprite']);
    // A declaration with a sprite-valued initializer creates a handle at that
    // exact point, just like a later assignment to the same variable. Lower
    // only this form so the existing ordered setup path owns both forms.
    ast = {...ast, body: ast.body.flatMap(st => {
        if (st.type !== 'Declaration' || !st.decls.some(d => !d.temporary && d.init?.type === 'Call' &&
            creationApis.has(t.path(d.init.callee)))) return [st];
        return st.decls.flatMap(d => !d.temporary && d.init?.type === 'Call' &&
            creationApis.has(t.path(d.init.callee)) ? [
                {...st, decls: [{...d, init: {type: 'Null',spritePlaceholder:true}}]},
                {type: 'ExpressionStatement', expr: {type: 'Assignment', op: '=',
                    left: {type: 'Identifier', name: d.name}, right: d.init}}
            ] : [{...st, decls: [d]}]);
    })};
    const callOf = st => st.type === 'ExpressionStatement' && st.expr?.type === 'Call' ? st.expr : null;
    const nameOf = call => call && t.path(call.callee);
    const calls = ast.body.map(callOf);
    const names = calls.map(nameOf);
    const assignsCreate = st => st.type === 'ExpressionStatement' &&
        st.expr?.type === 'Assignment' && st.expr.op === '=' &&
        st.expr.left?.type === 'Identifier' && st.expr.right?.type === 'Call' &&
        creationApis.has(nameOf(st.expr.right));
    t.claimNames(ast);
    const usesRuntimeSpriteMethods = node => {
        if (!node || typeof node !== 'object') return false;
        if(node.loweredStaticCallbacks || node.optionalParams?.length || node.loweredLazyValues || node.type==='Undefined' || node.type==='Null' && !node.spritePlaceholder || t.hasLazyCondition(node))return true;
        if(['LegacyParsedValue','LegacyJsonValue','NativeArrayAccess'].includes(node.type) || node.type==='Identifier' && ['NaN','Infinity'].includes(node.name) && !t.boundSourceGlobals.has(node.name))return true;
        if(node.type==='Declaration' && node.decls.some(decl=>decl.isArray && !decl.init))return true;
        const constantNumber=value=>value?.type==='Number'?Number(value.value):value?.type==='Unary' && value.op==='-' && value.argument?.type==='Number'?-Number(value.argument.value):value?.type==='Member' && value.object?.name==='Math' && value.name==='PI'?Math.PI:NaN;
        if(node.type==='Binary' && node.op==='/' && (!Number.isFinite(constantNumber(node.right)) || constantNumber(node.right)===0))return true;
        if(node.type==='Unary' && node.op==='-' && constantNumber(node.argument)===0)return true;
        if(node.type==='Call' && (isIndependentRegistration(t.path(node.callee)) || t.path(node.callee)==='game.ask'))return true;
        if(node.type==='Call' && t.path(node.callee)==='MultiplayerState.create')return true;
        if(node.type==='Call' && /^controller\.player[1-4]\.(?:moveSprite|stopControllingSprite)$/.test(t.path(node.callee)||''))return true;
        if(node.type==='Call' && /^mp\./.test(t.path(node.callee)||''))return true;
        if(node.type==='Call' && (['game.currentScene','ArcadePhysicsEngine','sprites.allOfKind','scene.onHitTile','scene.tileHitFrom','scene.onHitWall','scene.onOverlapTile','scene.centerCameraAt','scene.cameraFollowSprite','scene.cameraProperty','game.pushScene','game.popScene','game.addScenePushHandler','game.addScenePopHandler','game.removeScenePushHandler','game.removeScenePopHandler'].includes(t.path(node.callee)) || /^tiles\./.test(t.path(node.callee)||'')))return true;
        if(node.type==='Member' && ['fx','fy','sx','sy','scale'].includes(node.name))return true;
        if(node.type==='Call' && node.callee?.type==='Member' && node.callee.name==='toString' && t.spriteReferences.has(node.callee.object))return true;
        const mixedValue=value=>['String','Boolean','Null','Undefined','Array'].includes(value?.type) || t.stringReferences.has(value) || t.booleanReferences.has(value) || t.arrayReferences.has(value) || t.imageReferences.has(value);
        if(node.type==='Binary' && (node.op==='%' || ['+','-','*','/','==','!=','===','!==','<','>','<=','>='].includes(node.op) && (mixedValue(node.left) || mixedValue(node.right))) || node.type==='Unary' && ['+','-'].includes(node.op) && mixedValue(node.argument))return true;
        if(node.type==='Array' && node.items.some(item=>item?.type==='Array' || t.arrayReferences.has(item)))return true;
        if(['FunctionDeclaration','FunctionExpression'].includes(node.type) && node.body.some(st=>st.type==='Declaration'))return true;
        if (node.type==='Array' && node.items.some(item=>t.imageReferences.has(item)||t.spriteReferences.has(item))) return true;
        if(node.type==='Index' && (t.imageReferences.has(node)||t.spriteReferences.has(node)||t.arrayReferences.has(node.object)))return true;
        if(node.type==='Call' && ['Math.sqrt','Math.log','Math.log10','Math.asin','Math.acos','Math.pow','Math.pickRandom'].includes(t.path(node.callee)))return true;
        if(node.type==='Call' && node.callee?.type==='Member' && t.arrayReferences.has(node.callee.object))return true;
        if (node.type === 'Declaration' && node.decls.some(d => t.imageOf(d.init))) return true;
        if (node.type === 'Return' && (t.imageOf(node.value) || t.imageReferences.has(node.value))) return true;
        if (node.type === 'Assignment' && t.imageOf(node.right)) return true;
        if (node.type === 'Call' && node.callee?.type === 'Member' && t.imageReferences.has(node.callee.object)) return true;
        if (node.type === 'Call' && ['image.setPalette','image.create','scene.setTileMap','scene.setTile','scene.getTile','scene.getTilesByType','scene.setTileAt','scene.place','scene.placeOnRandomTile','scene.setBackgroundImage','scene.backgroundImage', 'animation.createAnimation','animation.attachAnimation','animation.setAction','animation.runImageAnimation','animation.stopAnimation'].includes(t.path(node.callee))) return true;
        if (node.type === 'Call' && node.callee?.type === 'Member' &&
            (['setScaleCore', 'setScale', 'changeScale', 'setStayInScreen', 'setBounceOnWall', 'setFlag', 'setVelocity', 'setImage', 'isHittingTile'].includes(node.callee.name) ||
                (node.callee.object?.type === 'Member' && node.callee.object.name === 'image' &&
                    ['fill', 'replace', 'flipX', 'flipY', 'setPixel', 'getPixel', 'fillRect', 'drawLine', 'drawImage', 'drawTransparentImage', 'overlapsWith'].includes(node.callee.name)))) return true;
        return Object.values(node).some(value => Array.isArray(value) ?
            value.some(usesRuntimeSpriteMethods) : usesRuntimeSpriteMethods(value));
    };
    const mapCalls=new Set();
    const collectMapCalls=node=>{
        if(!node || typeof node!=='object')return;
        if(node.type==='Call')mapCalls.add(t.path(node.callee));
        for(const value of Object.values(node))if(Array.isArray(value))value.forEach(collectMapCalls);else collectMapCalls(value);
    };
    collectMapCalls(ast);
    if(['scene.setTileMap','scene.setTile','scene.getTile','scene.getTilesByType','scene.setTileAt','scene.place','scene.placeOnRandomTile'].some(name=>mapCalls.has(name)) &&
        ['tiles.setTilemap','tiles.setCurrentTilemap','scene.setTileMapLevel','tiles.getTilesByType','tiles.tileAtLocationEquals','tiles.setTileAt','tiles.setWallAt','tiles.placeOnRandomTile'].some(name=>mapCalls.has(name)))
        t.unsupported.push('Mixing legacy color-coded maps with modern map replacement, image lookup or per-location mutation is not yet supported');
    const requiresSpriteRuntime = forceSpriteRuntime || usesRuntimeSpriteMethods(ast);
    const callbackLocals = new Map();
    const createAssignments = [];
    const localCreateAssignments = [];
    const standaloneCreates = [];
    const localCreates = [];
    const returnedCreates = [];
    const localHandles = new Map();
    const declaredWithin = body => {
        const names = new Set();
        const visit = statements => {
            for (const st of statements || []) {
                if (st.type === 'Declaration') for (const decl of st.decls) names.add(decl.name);
                if (st.type === 'If') { visit(st.consequent); visit(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) visit(st.body);
            }
        };
        visit(body);
        return names;
    };
    const collectCreateAssignments = (body, functionName = null, localNames = new Set()) => {
        for (const st of body || []) {
            if (st.type === 'Return' && st.value?.type === 'Call' && creationApis.has(nameOf(st.value))) returnedCreates.push(st.value);
            if (assignsCreate(st)) {
                if (functionName && localNames.has(st.expr.left.name)) {
                    localCreateAssignments.push(st);
                    if (!localHandles.has(functionName)) localHandles.set(functionName, new Set());
                    localHandles.get(functionName).add(st.expr.left.name);
                } else createAssignments.push(st);
            }
            if (callOf(st) && creationApis.has(nameOf(callOf(st)))) standaloneCreates.push(callOf(st));
            if (functionName && st.type === 'Declaration') for (const decl of st.decls) {
                if (decl.init?.type !== 'Call' || !creationApis.has(nameOf(decl.init))) continue;
                localCreates.push({name: decl.name, call: decl.init});
                if (!localHandles.has(functionName)) localHandles.set(functionName, new Set());
                localHandles.get(functionName).add(decl.name);
            }
            if (callOf(st)) for (const arg of callOf(st).args || []) {
                if (arg?.type !== 'FunctionExpression') continue;
                const key = `__callback${callbackLocals.size + 1}`;
                callbackLocals.set(arg, key);
                collectCreateAssignments(arg.body, key, declaredWithin(arg.body));
            }
            if (st.type === 'If') {
                collectCreateAssignments(st.consequent, functionName, localNames);
                collectCreateAssignments(st.alternate, functionName, localNames);
            }
            if (['For', 'While', 'Block'].includes(st.type)) {
                collectCreateAssignments(st.body, functionName, localNames);
            }
            if (st.type === 'FunctionDeclaration') {
                collectCreateAssignments(st.body, st.name, declaredWithin(st.body));
            }
        }
    };
    collectCreateAssignments(ast.body);
    if (!names.includes('sprites.onOverlap') && !hasCreationCallbacks &&
        !createAssignments.length && !localCreateAssignments.length && !localCreates.length && !returnedCreates.length && !requiresSpriteRuntime) return null;
    const handleProperty = st => st.type === 'ExpressionStatement' &&
        st.expr?.type === 'Assignment' && (st.expr.left?.type==='Index' || st.expr.left?.type === 'Member') &&
        ['Identifier','Call','Index'].includes(st.expr.left.object?.type);
    const ordinaryAssignment = st => st.type === 'ExpressionStatement' &&
        st.expr?.type === 'Assignment' && st.expr.left?.type === 'Identifier' && !assignsCreate(st);
    const frameArrays = new Map();
    for (const st of ast.body) if (st.type === 'Declaration') for (const d of st.decls) {
        if (!d.name.startsWith('__bwFrames_') || d.init?.type !== 'Array') continue;
        const images = d.init.items.map(item => t.imageOf(item));
        if (images.length && images.every(Boolean)) frameArrays.set(d.name, images);
    }
    const wrappedFrameValue = (node, count) => {
        const isCount = item => item?.type === 'Number' && Number(item.value) === count;
        if (node?.type !== 'Binary' || node.op !== '%' || !isCount(node.right)) return null;
        const plus = node.left;
        if (plus?.type !== 'Binary' || plus.op !== '+' || !isCount(plus.right)) return null;
        const inner = plus.left;
        if (inner?.type !== 'Binary' || inner.op !== '%' || !isCount(inner.right)) return null;
        const round = inner.left;
        return round?.type === 'Call' && t.path(round.callee) === 'Math.round' &&
            round.args?.length === 1 ? round.args[0] : null;
    };
    t.canonicalFrameArrays=frameArrays;
    const usedFrameArrays = new Set();
    const frameDeclaration = st => st.type === 'Declaration' && st.decls.every(d => frameArrays.has(d.name));
    const plainDeclaration = st => st.type === 'Declaration' && st.decls.every(d =>
        !frameArrays.has(d.name) && !(d.init?.type === 'Call' && nameOf(d.init) === 'sprites.create'));
    const creates = [...createAssignments.map(st => st.expr.right),
        ...localCreateAssignments.map(st => st.expr.right), ...standaloneCreates,
        ...localCreates.map(item => item.call), ...returnedCreates];
    const findEmbeddedCreates=node=>{
        if(!node||typeof node!=='object')return;
        if(node.type==='Call'&&creationApis.has(nameOf(node))&&!creates.includes(node))creates.push(node);
        for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(findEmbeddedCreates);else if(value&&typeof value==='object')findEmbeddedCreates(value);}
    };
    findEmbeddedCreates(ast);
    if (!creates.length && !requiresSpriteRuntime) return null;
    const functions = ast.body.filter(st => st.type === 'FunctionDeclaration');
    const functionNames = new Set(functions.map(fn => fn.name));
    const allowedCalls = new Set(['sprites.onCreated', 'sprites.onDestroyed', 'sprites.onOverlap', 'sprites.destroy',
        ...creationApis, 'game.onUpdateInterval', 'game.onUpdate', 'control.runInParallel', 'forever', 'game.forever', 'basic.forever',
        'controller.A.onEvent', 'controller.moveSprite', 'info.setLife', 'info.setScore',
        'info.startCountdown', 'info.stopCountdown', 'info.onCountdownEnd', 'info.onLifeZero', 'console.log',
        'pause', 'game.splash', 'game.showLongText', 'image.setPalette', 'scene.setBackgroundColor', 'scene.setBackgroundImage']);
    for (const [index, st] of ast.body.entries()) {
        if (st.type === 'Namespace' && st.name === 'SpriteKind') continue;
        if (st.type === 'FunctionDeclaration') continue;
        if (plainDeclaration(st) || frameDeclaration(st)) continue;
        if (assignsCreate(st)) continue;
        if (handleProperty(st)) continue;
        if (ordinaryAssignment(st) || ['If', 'For', 'While','Block'].includes(st.type) || requiresSpriteRuntime && st.type==='ExpressionStatement' && ['Assignment','Update'].includes(st.expr?.type)) continue;
        const name = names[index];
        if (allowedCalls.has(name) || functionNames.has(name) ||
            /^controller\.(A|B|up|down|left|right)\.onEvent$/.test(name || '') || /^info\.player[1-4]\.onLifeZero$/.test(name || '') ||
            (name && /^[A-Za-z_]\w*\.onDestroyed$/.test(name)) ||
            (name && /\.(destroy|say|sayText|setStayInScreen|setBounceOnWall|setFlag|setPosition|setVelocity|setImage)$/.test(name))) continue;
        if (!(requiresSpriteRuntime && callOf(st))) return null;
    }
    for (const call of calls) if (!t.sceneStackProgram && nameOf(call)==='sprites.onCreated' &&
        !call.args?.some(arg => arg.type === 'FunctionExpression')) return null;

    for (const st of ast.body) if (st.type === 'Declaration') for (const d of st.decls) {
        if (d.init?.type === 'String' || d.init?.type === 'Call' &&
            t.path(d.init.callee) === 'game.askForString') t.stringVars.add(d.name);
    }
    t.handleVars = new Set(createAssignments.map(st => st.expr.left.name));
    const declaredTopLevel = new Set(ast.body.filter(st => st.type === 'Declaration')
        .flatMap(st => st.decls.map(decl => decl.name)));
    for (const call of calls) {
        const event = nameOf(call);
        if (!['sprites.onCreated', 'sprites.onDestroyed', 'sprites.onOverlap'].includes(event)) continue;
        const handler = call.args?.find(arg => arg.type === 'FunctionExpression');
        const eventParameters = new Set(handler?.params?.slice(0, event === 'sprites.onOverlap' ? 2 : 1));
        const collectEventAliases = body => {
            for (const st of body || []) {
                if (ordinaryAssignment(st) && st.expr.op === '=' &&
                    declaredTopLevel.has(st.expr.left.name) &&
                    eventParameters.has(st.expr.right?.name)) t.handleVars.add(st.expr.left.name);
                if (st.type === 'If') {
                    collectEventAliases(st.consequent);
                    collectEventAliases(st.alternate);
                }
                if (['For', 'While', 'Block'].includes(st.type)) collectEventAliases(st.body);
            }
        };
        collectEventAliases(handler?.body);
    }
    // An assignment copies the handle, not the sprite. Keep aliases typed as
    // handles so a later reassignment of the source variable cannot move an
    // event registration to the new sprite.
    let aliasesChanged;
    do {
        aliasesChanged = false;
        for (const st of ast.body) {
            if (st.type === 'Declaration') for (const decl of st.decls) {
                if (decl.init?.type === 'Identifier' && t.handleVars.has(decl.init.name) && !t.handleVars.has(decl.name)) {
                    t.handleVars.add(decl.name);aliasesChanged = true;
                }
            }
            if (!ordinaryAssignment(st) || st.expr.op !== '=' || st.expr.right?.type !== 'Identifier') continue;
            if (t.handleVars.has(st.expr.right.name) && !t.handleVars.has(st.expr.left.name)) {
                t.handleVars.add(st.expr.left.name);
                aliasesChanged = true;
            }
        }
    } while (aliasesChanged);
    t.functions.push(...functions.map(fn => ({name: fn.name, params: fn.params, body: fn.body})));
    const parameterHandles = inferProcedureHandleParameters(ast, functions, t.handleVars, node => t.path(node));
    t.handleTemplates = new Map();
    t.handleImageArrays = new Map();
    t.handleImageLiterals = new Map();
    t.handleFrameSelections = new Map();
    const templateByVariable = new Map();
    const initialImageByTemplate = new Map();
    const costumes = [];
    const directImageOwners=new Set([...createAssignments,...localCreateAssignments].map(st=>st.expr.left.name));
    for(const item of localCreates)directImageOwners.add(item.name);
    for(const call of calls.filter(c=>nameOf(c)==='sprites.onCreated')) {
        const handler=call.args?.find(arg=>arg.type==='FunctionExpression');
        if(handler?.params?.[0])directImageOwners.add(handler.params[0]);
    }
    const imageValueCostumes = [];
    const builtinImageResources = new Map();
    const sharedFrameResources = new Map();
    const collectImageValues = (node, parent) => {
        if (!node || typeof node !== 'object') return;
        if (node.type==='Declaration' && node.decls.every(d=>frameArrays.has(d.name))) return;
        // Map resources are embedded in tile data; they are not sprite image values.
        if(node.type==='Call' && nameOf(node)==='tiles.createTilemap')return;
        const image = t.imageOf(node);
        const directArt = parent?.type === 'Call' && parent.args?.[0] === node &&
            (creationApis.has(nameOf(parent)) || parent.callee?.name === 'setImage' && directImageOwners.has(parent.callee.object?.name) || nameOf(parent) === 'scene.setBackgroundImage');
        if (image && (!directArt || node.type === 'Member')) {
            const builtin = node.type === 'Member' ? t.path(node) : null;
            let resource = builtin && builtinImageResources.get(builtin);
            if (!resource) {
                const name = `__arcadeBackground${imageValueCostumes.length+1}`;
                resource = {name,key:`${name}Image`,fresh:!builtin};
                imageValueCostumes.push({sprite:name,name:`${name}-art`,svg:imageToSvg(image),mode:'replace'});
                if (builtin) builtinImageResources.set(builtin,resource);
            }
            t.imageValueResources.set(node,resource);
            return;
        }
        const spriteFrame = parent?.type === 'Call' && parent.args?.[0] === node && parent.callee?.name === 'setImage';
        if (node.type === 'Index' && !spriteFrame) {
            const arrayName=node.object?.type==='Identifier' && node.object.name;
            const frames=frameArrays.get(arrayName),value=frames && wrappedFrameValue(node.index,frames.length);
            if (frames && value) {
                let resource=sharedFrameResources.get(arrayName);
                if (!resource) {
                    const name=`__arcadeBackground${imageValueCostumes.length+1}`;
                    resource={name,key:arrayName,count:frames.length};sharedFrameResources.set(arrayName,resource);
                    frames.forEach((image,i)=>imageValueCostumes.push({sprite:name,name:`${name}-frame-${i}`,svg:imageToSvg(image),mode:i?'add':'replace'}));
                }
                usedFrameArrays.add(arrayName);t.imageValueResources.set(node,{...resource,value});
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(child=>collectImageValues(child,node));
            else if (value && typeof value === 'object') collectImageValues(value,node);
        }
    };
    collectImageValues(ast);
    for (const [index, call] of creates.entries()) {
        const api = nameOf(call), projectile = api !== 'sprites.create';
        const dynamicImage = t.imageRef(call.args[0]);
        const image = dynamicImage ? {width: 1, height: 1, pixels: new Uint8Array(1)} : t.imageOf(call.args[0]);
        if (!image) return null;
        const kindArgument = projectile ? api === 'sprites.createProjectile' ? call.args[3] : null : call.args[1];
        let kind = projectile ? 'Projectile' : 'Player';
        if (kindArgument?.type === 'Number') {
            const builtinKind = ['Player','Projectile','Food','Enemy'][Number(kindArgument.value)];
            if (builtinKind) kind = builtinKind;
            else t.unsupported.push(`${api}() numeric sprite kind ${kindArgument.value} needs kind identity support`);
        } else if (kindArgument?.type === 'Member' && t.path(kindArgument.object) === 'SpriteKind') kind = kindArgument.name;
        else if (kindArgument) t.unsupported.push(`${api}() dynamic sprite kind needs kind expression support`);
        // PXT's optional projectile kind uses `kind || SpriteKind.Projectile`.
        if (projectile && kind === 'Player') kind = 'Projectile';
        const template = {name: `__arcadeTemplate${index + 1}`, dynamicImage: !!dynamicImage, kind,
            width: image.width, height: image.height};
        t.handleTemplates.set(call, template);
        if (projectile) t.projectileTemplates.set(call, template);
        initialImageByTemplate.set(template.name, image);
        costumes.push({sprite: template.name, name: `${template.name}-art`,
            svg: imageToSvg(image), mode: 'replace'});
    }
    const imageTemplates = [...new Set(imageValueCostumes.map(c=>c.sprite))];
    const collectBackgroundArt = node => {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Call' && nameOf(node) === 'scene.setBackgroundImage' && node.args?.length === 1) {
            const image = t.imageOf(node.args[0]);
            if (image && !t.imageValueResources.has(node.args[0])) {
                const name = `__arcadeBackground${imageTemplates.length+1}`, key = `${name}Image`;
                t.imageValueResources.set(node.args[0],{name,key,fresh:true});imageTemplates.push(name);
                costumes.push({sprite:name,name:`${name}-art`,svg:imageToSvg(image),mode:'replace'});
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(collectBackgroundArt);
            else if (value && typeof value === 'object') collectBackgroundArt(value);
        }
    };
    collectBackgroundArt(ast);
    costumes.push(...imageValueCostumes);
    for (const st of [...createAssignments, ...localCreateAssignments]) {
        const variable = st.expr.left.name;
        const template = t.handleTemplates.get(st.expr.right);
        if (templateByVariable.has(variable) && templateByVariable.get(variable) !== template) {
            templateByVariable.set(variable, null);
        } else if (!templateByVariable.has(variable)) templateByVariable.set(variable, template);
    }
    for (const {name, call} of localCreates) {
        const template = t.handleTemplates.get(call);
        if (templateByVariable.has(name) && templateByVariable.get(name) !== template) {
            templateByVariable.set(name, null);
        } else if (!templateByVariable.has(name)) templateByVariable.set(name, template);
    }
    const sameImage = (a, b) => a?.width === b?.width && a?.height === b?.height &&
        a.pixels?.length === b.pixels?.length && a.pixels.every((pixel, index) => pixel === b.pixels[index]);
    const frameCostumes = new Map();
    const imageCalls = [];
    const collectImageCalls = body => {
        for (const st of body || []) {
            const call = callOf(st);
            if (call?.callee?.type === 'Member' && call.callee.name === 'setImage') imageCalls.push(call);
            if (call) for (const arg of call.args || []) {
                if (arg?.type === 'FunctionExpression') collectImageCalls(arg.body);
            }
            if (st.type === 'If') {
                collectImageCalls(st.consequent);
                collectImageCalls(st.alternate);
            }
            if (['For', 'While'].includes(st.type)) collectImageCalls(st.body);
        }
    };
    collectImageCalls(ast.body);
    const eventImageCalls = new Map();
    for (const call of calls) {
        if (nameOf(call) !== 'sprites.onCreated') continue;
        const handler = call.args?.find(arg => arg.type === 'FunctionExpression');
        const parameter = handler?.params?.[0];
        if (!parameter) continue;
        const scan = body => {
            for (const st of body || []) {
                const imageCall = callOf(st);
                if (imageCall?.callee?.type === 'Member' && imageCall.callee.name === 'setImage' &&
                    imageCall.callee.object?.type === 'Identifier' &&
                    imageCall.callee.object.name === parameter) {
                    eventImageCalls.set(imageCall, kindOf(call.args[0]));
                }
                if (st.type === 'If') { scan(st.consequent); scan(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) scan(st.body);
            }
        };
        scan(handler.body);
    }
    const imagesByTemplate = new Map([...initialImageByTemplate].map(([name, image]) => [name, [image]]));
    // Register arrays before literal changes. The former define costume index
    // order; literal setImage calls can then reuse an existing frame by content.
    for (const call of [...imageCalls.filter(c => c.args?.[0]?.type === 'Index'),
        ...imageCalls.filter(c => c.args?.[0]?.type !== 'Index')].filter(c => !eventImageCalls.has(c))) {
        const variable = call.callee.object?.type === 'Identifier' && call.callee.object.name;
        const template = templateByVariable.get(variable);
        if (t.imageRef(call.args?.[0])) continue;
        if (!template) return null;
        const image = t.imageOf(call.args?.[0]);
        if (image) {
            const known = imagesByTemplate.get(template.name);
            let index = known.findIndex(existing => sameImage(existing, image));
            if (index < 0) {
                index = known.length;
                known.push(image);
                costumes.push({sprite: template.name, name: `${template.name}-frame-${index}`,
                    svg: imageToSvg(image), mode: 'add'});
            }
            t.handleImageLiterals.set(call, index);
            continue;
        }
        const arg = call.args?.[0];
        const arrayName = arg?.type === 'Index' && arg.object?.type === 'Identifier' && arg.object.name;
        const frames = frameArrays.get(arrayName);
        const value = frames && wrappedFrameValue(arg.index, frames.length);
        if (!frames || !value) return null;
        usedFrameArrays.add(arrayName);
        const key = `${template.name}:${arrayName}`;
        if (!frameCostumes.has(key)) {
            const known = imagesByTemplate.get(template.name);
            const offset = sameImage(frames[0], initialImageByTemplate.get(template.name)) ? 0 : known.length;
            for (let i = offset === 0 ? 1 : 0; i < frames.length; i++) {
                const frame = frames[i];
                known.push(frame);
                costumes.push({sprite: template.name, name: `${template.name}-frame-${i}`,
                    svg: imageToSvg(frame), mode: 'add'});
            }
            frameCostumes.set(key, offset);
        }
        t.handleFrameSelections.set(call, {value, offset: frameCostumes.get(key), key: arrayName, template: template.name, count: frames.length});
    }
    for (const [call, kind] of eventImageCalls) {
        const arg = call.args?.[0];
        if (t.imageRef(arg)) continue;
        const templates = [...t.handleTemplates.values()].filter(template => template.kind === kind);
        const arrayName = arg?.type === 'Index' && arg.object?.type === 'Identifier' && arg.object.name;
        const frames = frameArrays.get(arrayName);
        const value = frames && wrappedFrameValue(arg.index, frames.length);
        if (frames && value && templates.length) {
            const offset = Math.max(...templates.map(template => imagesByTemplate.get(template.name).length));
            for (const template of templates) {
                const known = imagesByTemplate.get(template.name);
                while (known.length < offset) {
                    const prior = known[known.length - 1];
                    costumes.push({sprite: template.name, name: `${template.name}-frame-${known.length}`,
                        svg: imageToSvg(prior), mode: 'add'});
                    known.push(prior);
                }
                for (const frame of frames) {
                    costumes.push({sprite: template.name, name: `${template.name}-frame-${known.length}`,
                        svg: imageToSvg(frame), mode: 'add'});
                    known.push(frame);
                }
            }
            usedFrameArrays.add(arrayName);
            t.handleFrameSelections.set(call, {value, offset, key: arrayName, template: templates[0].name, count: frames.length});
            continue;
        }
        const image = t.imageOf(arg);
        if (!image || !templates.length) return null;
        const index = Math.max(...templates.map(template => imagesByTemplate.get(template.name).length));
        for (const template of templates) {
            const known = imagesByTemplate.get(template.name);
            while (known.length < index) {
                const prior = known[known.length - 1];
                costumes.push({sprite: template.name, name: `${template.name}-frame-${known.length}`,
                    svg: imageToSvg(prior), mode: 'add'});
                known.push(prior);
            }
            known.push(image);
            costumes.push({sprite: template.name, name: `${template.name}-frame-${index}`,
                svg: imageToSvg(image), mode: 'add'});
        }
        t.handleImageLiterals.set(call, index);
    }
    if ([...frameArrays.keys()].some(name => !usedFrameArrays.has(name))) return null;
    const declaredGlobals = ast.body.filter(plainDeclaration).flatMap(st => st.decls.filter(d=>!d.temporary).map(d => d.name));
    const out = ['DEVICE ARCADE', '', ...[...new Set([...t.handleVars, ...declaredGlobals])]
        .map(name => `GLOBAL ${t.varName(name)}`),
        '', 'SPRITE Game:'];
    const setup = ast.body.filter(st => assignsCreate(st) || handleProperty(st) || ordinaryAssignment(st) ||
        st.type==='ExpressionStatement' && ['Assignment','Update'].includes(st.expr?.type) ||
        plainDeclaration(st) ||
        ['If', 'For', 'While','Block'].includes(st.type) ||
        callOf(st));
    {
        out.push('WHEN flag clicked:', '  hide');
        for (const st of setup) t.statement(st, 1, out);
        out.push('');
    }
    emitCreatedRegistrations(t, out, localHandles, callbackLocals);
    emitTerrainRegistrations(t,out,localHandles,callbackLocals);
    emitSceneRegistrations(t,out,localHandles,callbackLocals);
    appendHandleProcedures(t, t.functions, parameterHandles, out, localHandles);
    const spriteNames = ['Game'];
    for (const template of t.handleTemplates.values()) {
        spriteNames.push(template.name);
        out.push(`SPRITE ${template.name}:`, 'WHEN flag clicked:', '  hide', '');
    }
    for (const name of imageTemplates) {spriteNames.push(name);out.push(`SPRITE ${name}:`, 'WHEN flag clicked:', '  hide', '');}
    return {code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)], costumes, sprites: spriteNames};
};

/** Top-level projectile creation with a named handle. PXT starts side
 * projectiles one pixel inside the incoming edge, then integrates velocity. */
const translateSideProjectiles = (ast, assets) => {
    const t = new ArcadeTranslator(assets, {});
    const path = call => call && t.path(call.callee);
    const literal = node => node?.type === 'Number' ? Number(node.value) :
        node?.type === 'Unary' && node.op === '-' && node.argument?.type === 'Number' ?
            -Number(node.argument.value) : null;
    const projectile = node => node?.type === 'Call' &&
        ['sprites.createProjectileFromSide', 'sprites.createProjectile'].includes(path(node));
    const create = st => st.type === 'ExpressionStatement' && st.expr?.type === 'Assignment' &&
        st.expr.op === '=' && st.expr.left?.type === 'Identifier' && projectile(st.expr.right) ?
        {name: st.expr.left.name, call: st.expr.right} :
        st.type === 'Declaration' && st.decls.length === 1 && projectile(st.decls[0].init) ?
            {name: st.decls[0].name, call: st.decls[0].init} : null;
    const creates = ast.body.map(create).filter(Boolean);
    if (!creates.length) return null;
    const vars = new Set(creates.map(item => item.name));
    for (const st of ast.body) {
        if (create(st)) continue;
        if (st.type === 'Declaration' && st.decls.every(d => vars.has(d.name) &&
            (!d.init || d.init.type === 'Null'))) continue;
        if (st.type === 'ExpressionStatement' && st.expr?.type === 'Call' && path(st.expr) === 'pause') continue;
        if (st.type === 'ExpressionStatement' && st.expr?.type === 'Assignment' &&
            st.expr.left?.type === 'Member' && st.expr.left.object?.type === 'Identifier' &&
            vars.has(st.expr.left.object.name) &&
            ['x', 'y', 'vx', 'vy', 'ax', 'ay', 'fx', 'fy', 'sx', 'sy', 'scale', 'lifespan', 'rotation', 'rotationDegrees', 'data'].includes(st.expr.left.name)) continue;
        return null;
    }
    t.claimNames(ast);
    t.handleVars = vars;
    const templates = new Map();
    const costumes = [];
    for (const [index, item] of creates.entries()) {
        const args = item.call.args || [];
        const image = t.imageOf(args[0]);
        const vx = literal(args[1]), vy = literal(args[2]);
        if (!image || !Number.isFinite(vx) || !Number.isFinite(vy) || args[4]) return null;
        const name = `__arcadeTemplate${index + 1}`;
        templates.set(item.call, {name, image, vx, vy,
            kind: path(item.call) === 'sprites.createProjectileFromSide' || !args[3] ||
                (args[3].type === 'Number' && [0, 1].includes(Number(args[3].value))) ?
                'Projectile' : args[3].type === 'Number' ? String(args[3].value) : kindOf(args[3])});
        costumes.push({sprite: name, name: `${name}-art`, svg: imageToSvg(image), mode: 'replace'});
    }
    const out = ['DEVICE ARCADE', '', ...[...vars].map(name => `GLOBAL ${t.varName(name)}`),
        '', 'SPRITE Game:', 'WHEN flag clicked:', '  hide'];
    for (const st of ast.body) {
        const item = create(st);
        if (item) {
            const template = templates.get(item.call);
            const {width, height} = template.image;
            const x = template.vx < 0 ? 160 + Math.floor(width / 2) - 1 :
                template.vx > 0 ? 1 - Math.floor(width / 2) : 0;
            const y = template.vy < 0 ? 120 + Math.floor(height / 2) - 1 :
                template.vy > 0 ? 1 - Math.floor(height / 2) : 0;
            const id = t.varName(item.name);
            out.push(`  set ${id} to arcade spawn template "${template.name}" kind "${template.kind}" ` +
                `x ${x} y ${y} width ${width} height ${height}`,
            `  arcade set vx of ${id} to ${template.vx}`,
            `  arcade set vy of ${id} to ${template.vy}`,
            `  arcade auto destroy ${id} outside screen 1`);
        } else if (st.type !== 'Declaration') t.statement(st, 1, out);
    }
    for (const template of templates.values()) {
        out.push('', `SPRITE ${template.name}:`, 'WHEN flag clicked:', '  hide');
    }
    return {code: `${out.join('\n').trimEnd()}\n`, unsupported: [...new Set(t.unsupported)],
        costumes, sprites: ['Game', ...[...templates.values()].map(template => template.name)]};
};

/** Event-only Arcade snippets can be imported as real kind-filtered hats.
 * Their callback parameters are runtime handles even when the snippet itself
 * contains no sprite creation. */
const translateOverlapOnly = (ast, assets) => {
    const t = new ArcadeTranslator(assets, {});
    const call = st => st.type === 'ExpressionStatement' && st.expr?.type === 'Call' ? st.expr : null;
    const overlap = st => call(st) && t.path(call(st).callee) === 'sprites.onOverlap';
    if (!ast.body.some(overlap)) return null;
    for (const st of ast.body) {
        if (overlap(st)) {
            if (call(st).args?.[2]?.type !== 'FunctionExpression') return null;
        } else if (!(st.type === 'Declaration' && st.decls.every(d => d.init?.type === 'Number'))) return null;
    }
    t.claimNames(ast);
    const out = ['DEVICE ARCADE', '', 'SPRITE Game:', 'WHEN flag clicked:', '  hide'];
    const declarations = ast.body.filter(st => st.type === 'Declaration');
    if (declarations.length) {
        for (const st of declarations) t.statement(st, 1, out);
    }
    out.push('');
    for (const st of ast.body.filter(overlap)) {
        const args = call(st).args;
        const handler = args[2];
        t.handleAliases = new Map();
        if (handler.params?.[0]) t.handleAliases.set(handler.params[0], 'arcade event first');
        if (handler.params?.[1]) t.handleAliases.set(handler.params[1], 'arcade event second');
        out.push(`WHEN arcade kinds "${kindOf(args[0])}" and "${kindOf(args[1])}" overlap:`);
        t.block(handler.body, 1, out);
        out.push('');
    }
    return {code: `${out.join('\n').trimEnd()}\n`, unsupported: [...new Set(t.unsupported)],
        costumes: [], sprites: ['Game']};
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
    const selectedSource = arcadeProjectSource(map);
    const source = selectedSource.source;
    const projectInputDiagnostics = [...selectedSource.diagnostics];
    // Parse each boundary independently before the combined parse. This keeps
    // syntax errors in one file from consuming the following file's tokens,
    // while the combined parser allocates its generated temporary names once.
    if (selectedSource.entries.length > 1) {
        for (const entry of selectedSource.entries) {
            try { parseMakeCodeTs(entry.source, {parameterDefaults: true}); }
            catch (error) { throw new Error(`${entry.name}: ${error.message}`, {cause: error}); }
        }
    }
    let projectPalette = ARCADE_PALETTE;
    let projectPaletteHex = null;
    if (map['pxt.json']) {
        try {
            const palette = JSON.parse(map['pxt.json']).palette;
            if (palette !== undefined) {
                if (!Array.isArray(palette) || palette.length !== 16 ||
                    !palette.every(color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color))) {
                    projectInputDiagnostics.push('Invalid project palette: expected 16 RGB colors');
                } else {
                    projectPalette = [null, ...palette.slice(1).map(color => color.toLowerCase())];
                    if (palette.some((color, index) => color.toLowerCase() !== (ARCADE_PALETTE[index] || '#000000'))) {
                        projectPaletteHex = palette.map(color => color.slice(1).toLowerCase()).join('');
                    }
                }
            }
        } catch (error) { projectInputDiagnostics.push(`Project pxt.json could not be read: ${error.message}`); }
    }

    const assets = {};
    const tilemaps = {};
    const animationAliases = new Map(), animationDiagnostics = [], animationIds = new Set(), nativeAnimations = [];
    let duplicateAnimationId = false;
    for (const [filename, text] of Object.entries(map)) {
        if (/\.jres$/.test(filename)) {
            Object.assign(assets, parseJres(text));
            const parsedAnimations = parseAnimationJres(text);
            animationDiagnostics.push(...parsedAnimations.unsupported.map(message => `${filename}: ${message}`));
            for (const animation of parsedAnimations.animations) {
                const duplicateId = animationIds.has(animation.id);
                if (duplicateId) {
                    duplicateAnimationId = true;
                    animationDiagnostics.push(`Duplicate animation asset ID: ${animation.id}`);
                    for (const [alias, prior] of animationAliases) if (prior?.id === animation.id) animationAliases.set(alias, null);
                }
                animationIds.add(animation.id);
                nativeAnimations.push(animation);
                for (const alias of animation.aliases) {
                    if (animationAliases.has(alias)) {
                        animationAliases.set(alias, null);
                        animationDiagnostics.push(`Ambiguous animation asset alias: ${JSON.stringify(alias)}`);
                    } else animationAliases.set(alias, duplicateId ? null : animation);
                }
            }
        }
        if (/\.g\.ts$/.test(filename)) Object.assign(tilemaps, parseTilemaps(text));
    }

    // Recover rich source only when it matches native pixels. Resource import
    // optionally binds fresh factories to an explicitly installed artwork library.
    const recovered = duplicateAnimationId && map[ANIMATION_COMPANION_PATH] === undefined ? {resources: [], warnings: []} :
        recoverAnimationCompanion(map[ANIMATION_COMPANION_PATH], nativeAnimations, projectPalette);
    const recoveredById = new Map(recovered.resources.map(resource => [resource.nativeId, resource]));
    let animationResources = duplicateAnimationId ? [] : nativeAnimations.map(animation => ({...animation,
        palette: [...projectPalette], document: recoveredById.get(animation.id)?.document || null,
        ...(recoveredById.get(animation.id)?.reason ? {sourceReason: recoveredById.get(animation.id).reason} : {})}));

    if (opts.animationResources) animationResources = prepareAnimationImport(animationResources);
    const resourceIds = new Map(animationResources.map(resource => [resource.id, resource.document?.animation.resource.id]));

    // Native assets.animation produces a fresh Image[] per lookup. Lower to
    // the existing typed image-array machinery, preserving ordinary variable
    // aliases/mutation. Resource mode annotates the same typed array AST so
    // inference stays intact while emission uses the fresh resource reporter.
    const lowerAnimationAssets = node => {
        if (!node || typeof node !== 'object') return node;
        if (node.type === 'Template' && node.tag === 'assets.animation') {
            const alias = node.value.trim(), animation = animationAliases.get(alias);
            if (!animation) {
                animationDiagnostics.push(`${animationAliases.has(alias) ? 'Ambiguous' : 'Missing'} animation asset reference: ${JSON.stringify(alias)}`);
                return {type: 'Undefined'};
            }
            return {type: 'Array', ...(opts.animationResources ? {bwAnimationResourceId: resourceIds.get(animation.id)} : {}),
                items: animation.frames.map(frame => ({type: 'Template', tag: 'img',
                value: Array.from({length: animation.height}, (_, y) =>
                    Array.from(frame.pixels.subarray(y * animation.width, (y + 1) * animation.width),
                        index => index.toString(16)).join(' ')).join('\n')}))};
        }
        if (Array.isArray(node)) return node.map(lowerAnimationAssets);
        return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, lowerAnimationAssets(value)]));
    };
    const parsed = inlineValueHelpers(inlineLegacyArrayHelpers(desugarForOf(lowerDestroyAllSprites(lowerLibraryCalls(liftExporterStops(
        lowerAnimationAssets(parseMakeCodeTs(source, {parameterDefaults: true})))), source), source)));
    const containsPaletteCall = node => {
        if(!node || typeof node!=='object')return false;
        if(node.type==='Call' && node.callee?.type==='Member' && node.callee.name==='setPalette' &&
            node.callee.object?.type==='Identifier' && node.callee.object.name==='image')return true;
        return Object.values(node).some(value=>Array.isArray(value)?value.some(containsPaletteCall):containsPaletteCall(value));
    };
    const runtimePaletteRequested=containsPaletteCall(parsed);
    const withAnimationDiagnostics = result => {
        let code = result.code;
        let costumes = result.costumes;
        if (projectPaletteHex) {
            const command = `  arcade set palette hex "${projectPaletteHex}"`;
            code = /^WHEN flag clicked:$/m.test(code) ?
                code.replace(/^WHEN flag clicked:$/m, `WHEN flag clicked:\n${command}`) :
                `${code.trimEnd()}\nWHEN flag clicked:\n${command}\n`;
            costumes = (costumes || []).map(costume => {
                const pixels = /shape-rendering="crispEdges"/.test(costume.svg || '') && svgToPixels(costume.svg);
                const svg = pixels ? imageToSvg(pixels, {scale:pixels.scale,palette:projectPalette}) :
                    String(costume.svg || '').replace(/fill="(#[0-9a-f]{6})"/gi, (fill,color) => {
                        const index=ARCADE_PALETTE.findIndex(entry=>entry?.toLowerCase()===color.toLowerCase());
                        return index>0 ? `fill="${projectPalette[index]}"` : fill;
                    });
                return {...costume,svg};
            });
        }
        const paletteDiagnostics=[];
        const nativeImages=/arcade (?:create (?:sprite|image|template)|spawn (?:template|image)|frame image|projectile image)/.test(code);
        if(runtimePaletteRequested && (costumes || []).length && !nativeImages) {
            paletteDiagnostics.push('Runtime palette changes require native Arcade image rendering; fixed Scratch costume rendering is not supported');
        }
        if(projectPaletteHex && projectPaletteHex.slice(0,6)!=='000000' &&
            (result.costumes || []).some(costume=>costume.sprite==='background' && !/shape-rendering="crispEdges"/.test(costume.svg || ''))) {
            paletteDiagnostics.push('Project palette index zero on a fixed Scratch background requires native Arcade background rendering');
        }
        return {...result,code,costumes,animationResources,warnings:recovered.warnings,
            unsupported:[...new Set([...animationDiagnostics,...projectInputDiagnostics,...paletteDiagnostics,...result.unsupported])]};
    };
    const namespaceBindings = lowerNamespaceBindings(parsed);
    const callbacks = lowerStaticCallbackHelpers(namespaceBindings.program || parsed);
    projectInputDiagnostics.push(...callbacks.unsupported);
    const ast = lowerLazyValues(callbacks.program);
    const flattened = namespaceBindings.program ? ast : null;
    const tileImageOf = node => node?.type==='Template' && node.tag==='img' ? parseImageLiteral(node.value) : node?.type==='Template' && /^assets\./.test(node.tag||'') ? assets[node.value.trim()] : node?.type==='Member' ? assets[node.name] : null;
    const nativeTilemaps = {};
    for(const [filename,text] of Object.entries(map))if(/\.g\.ts$/.test(filename))Object.assign(nativeTilemaps,parseNativeTilemaps(text,tileImageOf));
    const namedEvents = flattened && translateNamedHandleEvents(flattened, assets, nativeTilemaps, !!projectPaletteHex || runtimePaletteRequested);
    if (namedEvents) return withAnimationDiagnostics(namedEvents);
    const creationEvents = flattened && translateCreationEvents(flattened, assets);
    if (creationEvents) return withAnimationDiagnostics(creationEvents);
    const sideProjectiles = namespaceBindings.program && translateSideProjectiles(ast, assets);
    if (sideProjectiles) return withAnimationDiagnostics(sideProjectiles);
    const overlapOnly = namespaceBindings.program && translateOverlapOnly(ast, assets);
    if (overlapOnly) return withAnimationDiagnostics(overlapOnly);
    const t = new ArcadeTranslator(assets, tilemaps);
    t.unsupported.push(...animationDiagnostics, ...namespaceBindings.unsupported);
    // Before anything is emitted: a variable this program has to be
    // renamed must not land on a name the program already uses.
    t.claimNames(ast);
    const costumes = [];

    // ── pass 1: find the sprites, because everything else refers to them
    const registerSprite = (name, createCall) => {
        const image = t.imageOf(createCall.args[0]);
        const art = image ? imageToSvg(image) : null;
        if (!art) {
            const source = t.path(createCall.args[0]) || 'sprite image';
            t.unsupported.push(`${name}: ${source} — sprite artwork is unavailable in this project`);
        }
        const sprite = {
            name,
            kind: kindOf(createCall.args[1]),
            velocity: false,
            width: image ? image.width : null,
            height: image ? image.height : null
        };
        t.sprites.push(sprite);
        if (art) costumes.push({sprite: name, name: `${name}-art`, svg: art, mode: 'replace'});
        return sprite;
    };

    /**
     * Backdrop art: the first becomes the costume, the rest are added
     * beside it.
     *
     * The backdrop is a SPRITE and not a Stage costume because the route
     * the Code tab uses (`applyCustomSVG`) deliberately skips the Stage —
     * a full-screen sprite sent to the back looks the same and actually
     * arrives. And a game usually has both a background image and one or
     * more levels, so they all land as costumes on it and the user can
     * switch between them, rather than the second being refused for
     * having come second.
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
    /**
     * MakeCode animations, brought in as costumes.
     *
     * The shape a real game uses is the action API, not runImageAnimation:
     *
     *   walkLeft = animation.createAnimation(ActionKind.Walking, 100)
     *   animation.attachAnimation(hero, walkLeft)
     *   walkLeft.addAnimationFrame(img`…`)
     *
     * Scratch has costumes but no NAMED animation with its own timer, and
     * a game here binds several animations to one sprite under the same
     * ActionKind — so `setAction` cannot be resolved to one of them. What
     * CAN be saved is the artwork, which is otherwise lost outright: every
     * frame becomes a costume on the sprite it was attached to, and the
     * switching is reported rather than invented.
     */
    const animations = new Map();          // variable name → {sprite, frames}

    const animationFor = name => {
        if (!animations.has(name)) animations.set(name, {sprite: null, frames: []});
        return animations.get(name);
    };

    const collectAnimations = (node, seen = new Set()) => {
        if (!node || typeof node !== 'object' || seen.has(node)) return;
        seen.add(node);
        if (node.type === 'Assignment' && node.left.type === 'Identifier' &&
            node.right && node.right.type === 'Call' &&
            t.path(node.right.callee) === 'animation.createAnimation') {
            animationFor(node.left.name);
        }
        if (node.type === 'Declaration') {
            for (const d of node.decls || []) {
                if (d.init && d.init.type === 'Call' &&
                    t.path(d.init.callee) === 'animation.createAnimation') {
                    animationFor(d.name);
                }
            }
        }
        if (node.type === 'Call') {
            const called = t.path(node.callee);
            if (called === 'animation.attachAnimation') {
                const sprite = t.resolveSprite(node.args[0]);
                const variable = node.args[1] && node.args[1].type === 'Identifier' ? node.args[1].name : null;
                if (sprite && variable) animationFor(variable).sprite = sprite.name;
            }
            // `walkLeft.addAnimationFrame(img`…`)`
            if (node.callee && node.callee.type === 'Member' &&
                node.callee.name === 'addAnimationFrame' &&
                node.callee.object.type === 'Identifier') {
                const art = t.artOf(node.args[0]);
                if (art) animationFor(node.callee.object.name).frames.push(art);
            }
        }
        for (const value of Object.values(node)) {
            if (Array.isArray(value)) value.forEach(v => collectAnimations(v, seen));
            else if (value && typeof value === 'object') collectAnimations(value, seen);
        }
    };

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
    // After the sprites, because an animation is bound to one by name.
    ast.body.forEach(st => collectAnimations(st));

    // A projectile made inside a function belongs to that invocation. Keep
    // its handle in the procedure frame and use a reusable image template,
    // rather than creating one shared Scratch variable for every call.
    const functionLocalHandles = new Map();
    const functionDestructionCallbacks = [];
    const projectileApis = new Set(['sprites.createProjectile', 'sprites.createProjectileFromSide',
        'sprites.createProjectileFromSprite']);
    const registerProjectile = (call, scope) => {
        const api = call?.type === 'Call' && t.path(call.callee);
        if (!projectileApis.has(api)) return false;
        if (t.projectileTemplates.has(call)) return true;
        const argCount = call.args?.length || 0;
        const validArity = api === 'sprites.createProjectileFromSide' ? argCount === 3 :
            api === 'sprites.createProjectileFromSprite' ? argCount === 4 :
                argCount >= 3 && argCount <= 5;
        if (!validArity) {
            t.unsupported.push(`${api}() with missing or extra arguments in ${scope}`);
            return true;
        }
        const image = t.imageOf(call.args[0]);
        if (!image) {
            t.unsupported.push(`${api}() in ${scope} — projectile artwork is unavailable`);
            return true;
        }
        const name = `__arcadeProjectileTemplate${t.projectileTemplates.size + 1}`;
        const kindArg = api === 'sprites.createProjectile' ? call.args[3] : null;
        if (kindArg?.type === 'Number' && ![0, 1].includes(Number(kindArg.value))) {
            t.unsupported.push(`${api}() numeric kind ${kindArg.value} in ${scope}`);
        }
        const kind = api === 'sprites.createProjectileFromSide' || !kindArg ||
            (kindArg.type === 'Number' && [0, 1].includes(Number(kindArg.value))) ?
            'Projectile' : kindOf(kindArg);
        t.projectileTemplates.set(call, {name, kind, width: image.width, height: image.height});
        costumes.push({sprite: name, name: `${name}-art`, svg: imageToSvg(image), mode: 'replace'});
        return true;
    };
    for (const fn of t.functions) {
        const handles = new Set();
        const locals = new Set(fn.params || []);
        const scan = body => {
            for (const st of body || []) {
                if (st.type === 'Declaration') for (const decl of st.decls) {
                    locals.add(decl.name);
                    if (registerProjectile(decl.init, `${fn.name}()`)) handles.add(decl.name);
                }
                const assignment = st.type === 'ExpressionStatement' && st.expr?.type === 'Assignment' &&
                    st.expr.op === '=' && st.expr.left?.type === 'Identifier' ? st.expr : null;
                if (assignment && locals.has(assignment.left.name) &&
                    registerProjectile(assignment.right, `${fn.name}()`)) {
                    handles.add(assignment.left.name);
                }
                if (st.type === 'If') { scan(st.consequent); scan(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) scan(st.body);
            }
        };
        scan(fn.body);
        functionLocalHandles.set(fn, handles);
        const scanCallbacks = body => {
            for (const st of body || []) {
                const call = st.type === 'ExpressionStatement' && st.expr?.type === 'Call' ? st.expr : null;
                if (call?.callee?.type === 'Member' && call.callee.name === 'onDestroyed' &&
                    call.callee.object?.type === 'Identifier' && handles.has(call.callee.object.name) &&
                    call.args?.[0]?.type === 'FunctionExpression') {
                    const token = `__bwFunctionDestroyed${functionDestructionCallbacks.length + 1}`;
                    t.destroyedInstanceHandlers.set(call, token);
                    functionDestructionCallbacks.push({token, body: call.args[0].body, locals});
                }
                if (st.type === 'If') { scanCallbacks(st.consequent); scanCallbacks(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) scanCallbacks(st.body);
            }
        };
        scanCallbacks(fn.body);
    }
    const callbackProjectileScopes = new Map();
    for (const st of ast.body) {
        const call = st.type === 'ExpressionStatement' && st.expr?.type === 'Call' ? st.expr : null;
        if (!call) continue;
        for (const handler of call.args || []) {
            if (handler?.type !== 'FunctionExpression') continue;
            const locals = new Set();
            const handles = new Set();
            const collectLocals = body => {
                for (const item of body || []) {
                    if (item.type === 'Declaration') for (const decl of item.decls) locals.add(decl.name);
                    if (item.type === 'If') { collectLocals(item.consequent); collectLocals(item.alternate); }
                    if (['For', 'While', 'Block'].includes(item.type)) collectLocals(item.body);
                }
            };
            collectLocals(handler.body);
            const collectProjectiles = body => {
                for (const item of body || []) {
                    if (item.type === 'Declaration') for (const decl of item.decls) {
                        if (registerProjectile(decl.init, `${t.path(call.callee)} callback`)) {
                            handles.add(decl.name);
                        }
                    }
                    const assignment = item.type === 'ExpressionStatement' && item.expr?.type === 'Assignment' &&
                        item.expr.op === '=' && item.expr.left?.type === 'Identifier' ? item.expr : null;
                    if (assignment && locals.has(assignment.left.name) &&
                        registerProjectile(assignment.right, `${t.path(call.callee)} callback`)) {
                        handles.add(assignment.left.name);
                    }
                    if (item.type === 'If') {
                        collectProjectiles(item.consequent);
                        collectProjectiles(item.alternate);
                    }
                    if (['For', 'While', 'Block'].includes(item.type)) collectProjectiles(item.body);
                }
            };
            collectProjectiles(handler.body);
            if (handles.size) callbackProjectileScopes.set(handler.body, {locals, handles});
        }
    }

    // Frames become costumes on the sprite they were attached to. An
    // animation nothing attached has no home here, so it is reported.
    const framesTaken = new Map();
    let hasAnimationFrames = false;
    for (const [variable, animation] of animations) {
        if (!animation.frames.length) continue;
        if (!animation.sprite) {
            t.unsupported.push(`animation ${variable} — attached to no sprite, so its frames have no home`);
            continue;
        }
        for (const [index, svg] of animation.frames.entries()) {
            const taken = framesTaken.get(animation.sprite) || 0;
            if (taken >= MAX_ANIMATION_FRAMES) {
                t.unsupported.push(
                    `animation frames for ${animation.sprite} past ${MAX_ANIMATION_FRAMES} — ` +
                    'the rest are not carried over');
                break;
            }
            framesTaken.set(animation.sprite, taken + 1);
            hasAnimationFrames = true;
            costumes.push({
                sprite: animation.sprite,
                name: `${variable}-${index + 1}`,
                svg,
                mode: 'add'
            });
        }
    }
    if (hasAnimationFrames) {
        t.unsupported.push(
            'animation.setAction() — the frames arrive as costumes, but Scratch has no named ' +
            'animation with its own timer, and one ActionKind here covers several animations');
    }
    for (const st of ast.body) {
        if (st.type === 'ExpressionStatement' && st.expr.type === 'Call') {
            for (const arg of st.expr.args || []) {
                if (arg.type === 'FunctionExpression') walkForSprites(arg.body);
            }
        }
    }

    if (!t.sprites.length) t.sprites.push({name: 'Game', kind: 'Player', velocity: false, scriptHost: true});

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
        const projectileScope = callbackProjectileScopes.get(body);
        if (projectileScope) {
            t.localVars = projectileScope.locals;
            t.localHandleVars = projectileScope.handles;
        }
        const lines = [...header];
        t.block(body, indent, lines);
        scriptsFor.get(owner.name).push(lines);
        t.self = null;
        t.aliases = new Map();
        t.localVars = null;
        t.localHandleVars = new Set();
    };

    for (const st of ast.body) {
        if (st.type === 'Enum' || st.type === 'FunctionDeclaration') continue;
        const call = st.type === 'ExpressionStatement' && st.expr.type === 'Call' ? st.expr : null;
        const name = call ? t.path(call.callee) : null;
        const handler = call ? (call.args || []).find(arg => arg.type === 'FunctionExpression') : null;

        if (name === 'game.onUpdate' && handler) {
            const owner = ownerOf(handler.body);
            emitScript(owner, ['WHEN arcade updates:'], handler.body, {indent: 1});
            continue;
        }
        if (name === 'forever' && handler) {
            emitScript(ownerOf(handler.body), ['WHEN flag clicked:', '  FOREVER:'], handler.body);
            continue;
        }
        if (name === 'game.onUpdateInterval' && handler) {
            const owner = ownerOf(handler.body);
            const period = call.args[0]?.type === 'Number' ? Number(call.args[0].value) : NaN;
            if (!Number.isFinite(period) || period <= 0) {
                t.unsupported.push('game.onUpdateInterval() period must be a positive constant');
                continue;
            }
            emitScript(owner, [`WHEN arcade every ${num(period)} ms:`], handler.body, {indent: 1});
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
        if (name === 'sprites.onDestroyed' && handler) {
            const owner = ownerOf(handler.body);
            t.handleAliases = new Map(handler.params?.[0] ? [[handler.params[0], 'arcade event first']] : []);
            emitScript(owner, [`WHEN arcade kind "${kindOf(call.args[0])}" destroyed:`], handler.body, {indent: 1});
            t.handleAliases = new Map();
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
        if (name === 'info.onCountdownEnd' && handler) {
            emitScript(ownerOf(handler.body), ['WHEN arcade countdown ends:'], handler.body);
            continue;
        }
        // Wait for a positive life count before detecting zero. This keeps
        // an event-only snippet from firing at Scratch's initial zero and
        // allows a callback that grants another life to arm again.
        if ((name === 'info.onLifeZero' || /^info\.player\d\.onLifeZero$/.test(name || '')) && handler) {
            const variable = playerVar('lives', playerOf(name));
            const owner = ownerOf(handler.body);
            const lines = [
                `# ${name} — fires when lives fall to zero.`,
                'WHEN flag clicked:',
                '  FOREVER:',
                `    wait until ${variable} > 0`,
                `    wait until ${variable} < 1`
            ];
            t.self = owner;
            t.block(handler.body, 2, lines);
            t.self = null;
            scriptsFor.get(owner.name).push(lines);
            continue;
        }

        if (name === 'scene.setBackgroundImage') continue;    // handled in pass 1
        if (name === 'scene.setBackgroundColor' || name === 'image.setPalette') {
            t.statement(st, 1, setup);
            continue;
        }
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
    // `change x by …` below IS the motion block, on purpose. A program's own
    // variable called `x` is a different thing and cannot keep the name.
    const renames = t.renameNotes();
    if (renames.length) out.push(...renames, '');

    t.sprites.forEach(sprite => {
        out.push(`SPRITE ${sprite.name}:`);
        const scripts = scriptsFor.get(sprite.name);
        if (sprite === mainSprite && setup.length) {
            out.push('WHEN flag clicked:');
            if (sprite.scriptHost) out.push('  hide');
            out.push(...setup, '');
        }
        for (const script of scripts) out.push(...script, '');
        if (sprite.backdrop) {
            out.push('WHEN flag clicked:', '  go to x: 0 y: 0', '  go to back');
            out.push('  show', '');
        } else if (!scripts.length && !(sprite === mainSprite && setup.length)) {
            out.push('WHEN flag clicked:', '  show', '');
        }
    });

    for (const fn of t.functions) {
        const signature = fn.params && fn.params.length ?
            `${fn.name} ${fn.params.map(p => `(${t.varName(p)})`).join(' ')}` : fn.name;
        const lines = [`DEFINE ${signature}:`];
        const collectLocals = body => {
            for (const st of body || []) {
                if (st.type === 'Declaration') for (const decl of st.decls) t.localVars.add(decl.name);
                if (st.type === 'For' && st.init?.type === 'Declaration') for (const decl of st.init.decls) t.localVars.add(decl.name);
                if (st.type === 'If') { collectLocals(st.consequent); collectLocals(st.alternate); }
                if (['For', 'While', 'Block'].includes(st.type)) collectLocals(st.body);
            }
        };
        t.localVars = new Set();
        t.currentParameters = new Set(fn.params || []);
        collectLocals(fn.body);
        for (const param of fn.params || []) t.localVars.delete(param);
        t.localHandleVars = functionLocalHandles.get(fn) || new Set();
        t.self = mainSprite;
        t.block(fn.body, 1, lines);
        t.self = null;
        t.currentParameters = null;
        t.localVars = null;
        out.push(...lines, '');
    }

    for (const callback of functionDestructionCallbacks) {
        const referencesLocal = node => {
            if (!node || typeof node !== 'object') return false;
            if (node.type === 'Identifier' && callback.locals.has(node.name)) return true;
            return Object.values(node).some(value => Array.isArray(value) ?
                value.some(referencesLocal) : referencesLocal(value));
        };
        if (callback.body.some(referencesLocal)) {
            t.unsupported.push('sprite.onDestroyed() callback captures a function local');
        }
        out.push(`WHEN arcade destruction handler "${callback.token}" runs:`);
        t.block(callback.body, 1, out);
        out.push('');
    }
    for (const template of t.projectileTemplates.values()) {
        out.push(`SPRITE ${template.name}:`, 'WHEN flag clicked:', '  hide', '');
    }

    return withAnimationDiagnostics({
        code: `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`,
        unsupported: [...new Set(t.unsupported)],
        costumes,
        sprites: [...t.sprites.map(s => s.name), ...[...t.projectileTemplates.values()].map(t => t.name)]
    });
}

export default arcadeToPseudocode;
