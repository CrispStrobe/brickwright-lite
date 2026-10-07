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
 *   - `stop` keeps Scratch's three meanings (see `stop`): this script returns;
 *     other scripts in sprite ends that sprite's (or clone's) other runs;
 *     all ends every run, deletes clones and silences — and the game goes on.
 * What has no Arcade counterpart is NAMED in `unsupported` and becomes a
 * comment where it stood — nothing vanishes in silence (the census rule).
 * docs/ARCADE-COMPAT-PLAN.md is the construct-by-construct matrix.
 *
 * @module
 */
import {LEGACY_PARSE_SOURCE, LEGACY_JSON_SOURCE, ARRAY_ACCESS_SOURCE} from './legacy-array-values.js';
import {animationResourceFromDocument} from '../bw-animation-resources.js';
import {encodeAnimationJres} from './animation-jres.js';
import {ANIMATION_COMPANION_PATH, encodeAnimationCompanion} from './animation-companion.js';
import {validateDocument} from '../bw-artwork-bundle.js';
import {tilemapSource} from './tilemap-values.js';
import {ValueTypeGraph} from './value-type-graph.js';
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

const REGISTERED_HAT_KINDS = {
    arcade_whenRegisteredCreated:'created', arcade_whenRegisteredWall:'wall', arcade_whenRegisteredTile:'tile',
    arcade_whenRegisteredUpdate:'update', arcade_whenRegisteredInterval:'interval', arcade_whenRegisteredButton:'button',
    arcade_whenRegisteredKindDestroyed:'destroyed', arcade_whenRegisteredOverlap:'overlap',
    arcade_whenRegisteredScenePush:'scenePush', arcade_whenRegisteredScenePop:'scenePop',
    arcade_whenRegisteredForever:'forever', arcade_whenRegisteredLifeZero:'lifeZero', arcade_whenRegisteredCountdown:'countdown'
};
const REGISTERED_COMMANDS = new Set(['arcade_registerSpriteCreated','arcade_registerWallHandler','arcade_registerTileHandler',
    'arcade_registerUpdateHandler','arcade_registerIntervalHandler','arcade_registerButtonHandler',
    'arcade_registerDestroyedHandler','arcade_registerOverlapHandler','arcade_registerScenePushHandler','arcade_registerScenePopHandler',
    'arcade_registerForeverHandler','arcade_registerLifeZeroHandler','arcade_registerCountdownHandler']);

const KEY_BUTTON = {
    'left arrow': 'controller.left', 'right arrow': 'controller.right',
    'up arrow': 'controller.up', 'down arrow': 'controller.down',
    space: 'controller.A', a: 'controller.A', z: 'controller.B', b: 'controller.B', x: 'controller.B'
};

const ident = name => {
    const s = String(name || 'v').replace(/[^A-Za-z0-9_]/g, '_');
    return /^[0-9]/.test(s) ? `_${s}` : s;
};

const RESERVED = new Set(['score', 'life', 'info', 'game', 'scene', 'sprites', 'controller', 'Math', 'function', 'let', 'var',
    'if', 'else', 'while', 'for', 'return', 'true', 'false', 'null', 'new', 'this', 'pause', 'forever',
    'SpriteKind', 'SpriteFlag', 'ControllerButtonEvent', 'DialogLayout', 'Image', 'console', 'control', 'assets', 'images', 'image', 'undefined']);

class ArcadeEmitter {
    constructor (project, opts) {
        this.project = project;
        this.opts = opts;
        this.unsupported = [];
        this.requiresAnimationPackage = false;
        this.warnings = [];
        this.sprites = project.targets.filter(t => !t.isStage);
        // Each sprite is a global `<name>Sprite`, kept clear of the program's variable names.
        this.spriteVar = new Map();
        const stage = project.targets.find(t => t.isStage);
        const globalNames = new Set(Object.values(stage?.variables || {}).map(variable => variable[0]));
        const used = new Set(RESERVED);
        for (const target of project.targets) for (const variable of Object.values(target.variables || {})) {
            const name = variable[0];
            let ts = ident(target.isStage || globalNames.has(name) ? name : `${target.name}_${name}`);
            if (RESERVED.has(ts)) ts += '_';
            used.add(ts);
        }
        for (const target of this.sprites) {
            let ts = `${ident(target.name)}Sprite`;
            while (used.has(ts)) ts += '_';
            this.spriteVar.set(target.name, ts);
            used.add(ts);
        }
        // An Arcade program (E1's import, or blocks from the Arcade/Arrays
        // extensions) keeps JavaScript's values: text stays text, a Boolean
        // stays a Boolean. A Scratch-only project keeps Scratch's numbers.
        this.arcadeValues = project.targets.some(t => Object.values(t.blocks || {})
            .some(b => b && /^(arcade|arrays)_/.test(b.opcode || '')));
        this.initialGlobals = new Map();
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
        this.valueOperationHelpers = new Map();
        this.namedArrays = new Map();
        this.legacyValueHelpers = new Map();
        this.templateNames = new Set();
        this.templateKinds = new Map();
        this.artVar = new Map();
        this.artPixels = new Map();
        this.handleTemplateVars = new Map();
        this.frameArrays = new Map();
        this.authoredAnimationArrays = new Map();
        this.usesAnimationResources = false;
        this.sharedImageArrays = new Map();
        this.imageVars = new Set();
        this.handleVars = new Set();
        this.customSpriteKinds = new Set();
        this.eventLocationName = null;
        this.eventHandles = null;
        this.eventKind = null;
        this.destroyedCallbacks = new Map();
        this.registeredCallbackBlocks = new Map();
        this.registeredCallbackKinds = new Map();
        this.registeredCallbacks = new Map();
        this.compilingRegisteredCallbacks = new Set();
        this.usedRegisteredCallbacks = new Set();
        this.usedDestroyedCallbacks = new Set();
        this.currentLocalNames = null;
        this.emittedSprites = new Set();    // the targets that became an Arcade sprite
        this.analyse();
        const palettes = this.sprites.map(target => {
            const costume = target.costumes[target.currentCostume || 0];
            const palette = costume && opts.costumePalette?.(target, costume);
            return isPalette(palette) ? palette : ARCADE_PALETTE;
        });
        palettes.push(...(opts.animationDocuments || []).map(document => document.palette).filter(isPalette));
        this.palette = palettes.find(palette => !samePalette(palette, ARCADE_PALETTE)) || ARCADE_PALETTE;
    }

    /** Scratch clears the Stage to white underneath transparent backdrop pixels. */
    stageMatte () {
        const index = nearestIndex([255, 255, 255], this.palette);
        if (!/^#?ffffff$/i.test(String(this.palette[index]).trim())) {
            this.warn('Stage white matte quantized to the nearest opaque project palette colour');
        }
        return `scene.setBackgroundColor(${index})`;
    }

    prepareAuthoredAnimations () {
        if (this.authoredAnimationsPrepared) return;
        this.authoredAnimationsPrepared = true;
        if (!this.animationFunctionNames) {
            const declaredVariables = this.project.targets.flatMap(target => Object.values(target.variables || {}).map(variable => {
                let name = ident(target.isStage || this.isGlobalVar(variable[0]) ? variable[0] : `${target.name}_${variable[0]}`);
                if (RESERVED.has(name)) name += '_';
                return name;
            }));
            const occupied = new Set([...declaredVariables, ...this.globals.values(), ...this.fnNames.values(), ...this.spriteVar.values(),
                ...[...this.sharedImageArrays.values(), ...this.frameArrays.values()].map(array => array.name)]);
            this.animationSymbol = base => {
                let name = base;
                while (occupied.has(name)) name += '_';
                occupied.add(name);
                return name;
            };
            this.animationFactoryNamespace = this.animationSymbol('__bwAnimationAssets');
            this.animationFunctionNames = {frames: this.animationSymbol('__bwAnimationFrames'),
                fresh: this.animationSymbol('__bwAnimationFreshFrames'),
                interval: this.animationSymbol('__bwAnimationInterval')};
        }
        const assetNames = new Set((this.opts.animationDocuments || []).map(document => document?.animation?.resource?.name));
        const usedNames = new Set();
        if (!this.authoredAnimationArrays.size) {
            for (const document of this.opts.animationDocuments || []) {
                if (!document?.animation?.resource) continue;
                try {
                    const resource = animationResourceFromDocument(document);
                    if (this.authoredAnimationArrays.has(resource.id)) {
                        this.note(`Duplicate animation resource ID: ${resource.id}`);
                        continue;
                    }
                    for (const warning of resource.warnings) this.warn(warning);
                    if (usedNames.has(resource.name)) {
                        this.note(`Duplicate native animation display name: ${resource.name}`);
                        continue;
                    }
                    const images = resource.frames.map(frame => {
                        const image = {width: resource.width, height: resource.height, pixels: frame.pixels};
                        if (samePalette(resource.palette, this.palette)) return image;
                        if (resource.palette.some((colour, index) => index && !this.palette.some(target =>
                            String(target).toLowerCase() === String(colour).toLowerCase()))) {
                            this.warn(`Animation "${resource.name}" colours quantized to the exported project palette`);
                        }
                        return remapPalette(image, resource.palette, this.palette);
                    });
                    let nativeId = `animation${this.authoredAnimationArrays.size}`;
                    while (assetNames.has(nativeId)) nativeId += '_';
                    const nativeEntry = encodeAnimationJres({id: nativeId, namespace: 'myAnimations',
                        name: resource.name, width: resource.width, height: resource.height,
                        intervalMs: resource.frames[0].durationMs, frames: images});
                    usedNames.add(resource.name);
                    this.authoredAnimationArrays.set(resource.id, {...resource, nativeId, nativeEntry, document,
                        variable: this.animationSymbol(`__bwAnimationFrames${this.authoredAnimationArrays.size}`),
                        literals: images.map(image => toImgLiteral(image))});
                } catch (error) { this.note(error.message); }
            }
        }
    }

    authoredAnimation (b) {
        this.usesAnimationResources = true;
        this.prepareAuthoredAnimations();
        let id = this.literalInput(b, 'RESOURCE');
        const menu = this.block(b.inputs?.RESOURCE?.[1]);
        if (menu?.opcode === 'arcade_menu_animationAssets') id = menu.fields?.animationAssets?.[0];
        if (id !== null && !this.authoredAnimationArrays.has(id)) this.note(`Animation resource unavailable: ${id}`);
        const method = b.opcode === 'arcade_animationAssetFrames' ? this.animationFunctionNames.frames :
            b.opcode === 'arcade_animationAssetFreshFrames' ? this.animationFunctionNames.fresh : this.animationFunctionNames.interval;
        return `${method}("" + ${this.arrayValue(b, 'RESOURCE')})`;
    }

    /** Record what kind of value a variable is given, for its declaration. */
    assign (tsName, expr, explicitKind) {
        if (explicitKind) {
            if (!this.kinds.has(tsName)) this.kinds.set(tsName, new Set());
            this.kinds.get(tsName).add(explicitKind);
            return;
        }
        if (!this.kinds.has(tsName)) this.kinds.set(tsName, new Set());
        // A list item can be text or a number: the variable holding it is `any`.
        if (/^_item\(/.test(expr)) {
            this.kinds.get(tsName).add('number').add('string');
            return;
        }
        const kind = /^"|^\("" \+|^_listText\(|Names\[|^game\.askForString\(/.test(expr) ? 'string' : 'number';
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
        this.usesStopAll = false;
        this.usesSay = false;
        this.stopOthers = new Set();        // targets whose scripts can be stopped by one of their own
        this.soundWaiters = new Set();      // targets that wait on a tone
        const names = new Set(this.sprites.map(t => t.name));
        for (const t of this.project.targets) {
            const blocks = t.blocks || {};
            for (const b of Object.values(blocks)) {
                if (!b || !b.opcode) continue;
                if (b.opcode === 'control_stop') {
                    const option = b.fields && b.fields.STOP_OPTION ? b.fields.STOP_OPTION[0] : '';
                    if (option === 'all') this.usesStopAll = true;
                    if (/^other scripts in (sprite|stage)$/.test(option)) this.stopOthers.add(t);
                }
                if (/^looks_say/.test(b.opcode)) this.usesSay = true;
                if (/^(sound_playuntildone|music_playNoteForBeats)$/.test(b.opcode)) this.soundWaiters.add(t);
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

    /**
     * Does a script of `target` carry a run token (`_t`)? Only when something
     * can stop it from outside: a `stop all` anywhere, or a `stop other
     * scripts` in its own sprite. `stop this script` needs none (a return).
     */
    tokened (target = this.target) {
        return this.usesStopAll || this.stopOthers.has(target);
    }

    /** The globals holding a non-cloned target's `stop other scripts` mark and the run it kept. */
    stopMarks (target = this.target) {
        const id = ident(target.isStage ? 'stage' : target.name);
        return [`_som_${id}`, `_sok_${id}`];
    }

    /**
     * What every script of the current target starts with and checks at each
     * yield, beyond its restart/clone guards: its run token, and whether a
     * `stop all` or a `stop other scripts` has ended it since it started.
     */
    stopGuards () {
        const guards = [];
        if (!this.tokened()) return guards;
        this.use('tok');
        if (this.usesStopAll) guards.push('_dead(_t)');
        if (this.stopOthers.has(this.target)) {
            if (this.isClonable()) {
                this.use('others');
                guards.push('_othersStopped(self, _t)');
            } else {
                const [mark, kept] = this.stopMarks();
                guards.push(`(_t <= ${mark} && _t != ${kept})`);
            }
        }
        return guards;
    }

    tokenLine () {
        return this.tokened() ? ['    const _t = _tok()'] : [];
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
        const owner = this.isGlobalVar(name) ? this.project.targets.find(candidate => candidate.isStage) : target;
        const initial = Object.values(owner.variables || {}).find(variable => variable[0] === name)?.[1];
        if (['string', 'number', 'boolean'].includes(typeof initial) &&
            (typeof initial !== 'number' || Number.isFinite(initial))) {
            this.initialGlobals.set(ts, initial);
            if (typeof initial !== 'number' || initial !== 0) this.assign(ts, '', typeof initial);
        }
        return ts;
    }

    isGlobalVar (name) {
        const stage = this.project.targets.find(t => t.isStage);
        return !!(stage && Object.values(stage.variables || {}).some(v => v[0] === name));
    }

    /** In an Arcade program, the global `score` and `lives` are Arcade's own (info). */
    infoVariable (name) {
        return this.arcadeValues && this.isGlobalVar(name) && ['score', 'lives'].includes(name) ? name : null;
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

    /**
     * E1's import keeps an Arcade program's own code on a sprite named Game.
     * When nothing of it is a sprite (no artwork, no motion or looks), it is
     * no Arcade sprite: its scripts run with no `self`.
     */
    isScriptHost (target) {
        if (!this.arcadeValues || target.name !== 'Game') return false;
        if (this.hasHandles) return true;
        if (target.costumes?.some(c =>
            (this.opts.costumeSvg && svgToPixels(this.opts.costumeSvg(target, c) || '')) ||
            (this.opts.costumeRgba && this.opts.costumeRgba(target, c)))) return false;
        return !Object.values(target.blocks || {}).some(b => b && b.opcode !== 'looks_hide' &&
            /^(motion_|looks_|pen_|sensing_touchingobject|sensing_distanceto)/.test(b.opcode));
    }

    self () {
        if (this.templateNames.has(this.target.name) ||
            this.isScriptHost(this.target)) return null;
        if (this.isClonable()) return 'self';
        return this.spriteVar.get(this.target.name) || null;
    }

    literalInput (b, name) {
        const slot = b.inputs?.[name]?.[1];
        return Array.isArray(slot) && [10, 11].includes(slot[0]) ? String(slot[1]) : null;
    }

    literalNumber (b, name) {
        const slot = b.inputs?.[name]?.[1];
        return Array.isArray(slot) && [4, 5, 6, 7, 8, 10].includes(slot[0]) &&
            Number.isFinite(Number(slot[1])) ? Number(slot[1]) : null;
    }

    namedArray (b) {
        const name=this.literalInput(b,'NAME');
        if (name===null) {this.note('Named array export requires a fixed name');return 'null';}
        if(!this.namedArrays.has(name)) {
            let variable='__bwNamedArray_'+ident(name);
            const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.namedArrays.values(),...this.spriteVar.values()]);
            while(occupied.has(variable))variable+='_';
            this.namedArrays.set(name,variable);
        }
        return this.namedArrays.get(name);
    }
    legacyValueHelper (kind) {
        if(!this.legacyValueHelpers.has(kind)) {
            const base=kind==='parse'?'__bwNamedParseValue':'__bwNamedJsonValue';
            let name=base;
            const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.legacyValueHelpers.values()].map(x=>typeof x==='string'?x:x.name));
            while(occupied.has(name))name+='_';
            const source=(kind==='parse'?LEGACY_PARSE_SOURCE:LEGACY_JSON_SOURCE).replaceAll(base,name);
            this.legacyValueHelpers.set(kind,{name,source});
        }
        return this.legacyValueHelpers.get(kind).name;
    }
    namedOperationHelper (op) {
        const key='named:'+op;
        if(!this.legacyValueHelpers.has(key)) {
            let name='__bwNamedArray'+op[0].toUpperCase()+op.slice(1);
            const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.legacyValueHelpers.values()].map(x=>typeof x==='string'?x:x.name));
            while(occupied.has(name))name+='_';
            const parse=()=>this.legacyValueHelper('parse'),json=()=>this.legacyValueHelper('json');
            let params='array: any[]',body='';
            if(op==='get'){params+=', index: any';body=`return array ? ${json()}(array[+index]) : ""`;}
            if(op==='pop')body='if (array) {\n        if (array.length) return array.pop()\n    }\n    return ""';
            if(op==='indexOf'){params+=', value: any';body=`return array ? array.indexOf(${parse()}(value)) : -1`;}
            if(op==='contains') {
                params+=', value: any';body=`if (array) {
        let parsed = ${parse()}(value)
        for (let i = 0; i < array.length; i++) {
            let item = array[i]
            if (item === parsed || (item !== item && parsed !== parsed)) return true
        }
    }
    return false`;
            }
            if(op==='push'){params+=', value: any';body=`if (array) array.push(${parse()}(value))`;}
            if(op==='set'){params+=', index: any, value: any';body=`if (array) array[+index] = ${parse()}(value)`;}
            if(op==='insert' || op==='remove') {
                params+=', index: any'+(op==='insert'?', value: any':'');
                body=`if (array) {
        let position = +index
        if (position !== position) position = 0
        position = position < 0 ? Math.max(0, array.length + Math.ceil(position)) : Math.min(array.length, Math.floor(position))
        ${op==='insert'?`array.insertAt(position, ${parse()}(value))`:'if (position < array.length) array.removeAt(position)'}
    }`;
            }
            const type=op==='contains'?'boolean':op==='indexOf'?'number':['get','pop'].includes(op)?'any':'void';
            this.legacyValueHelpers.set(key,{name,source:`function ${name}(${params}): ${type} {
    ${body}
}`});
        }
        return this.legacyValueHelpers.get(key).name;
    }

    scratchMinMax (b, operation) {
        const key='scratch:'+operation;
        if(!this.legacyValueHelpers.has(key)) {
            let name=operation==='min'?'__bwScratchMin':'__bwScratchMax';
            const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.legacyValueHelpers.values()].map(x=>typeof x==='string'?x:x.name));
            while(occupied.has(name))name+='_';
            this.legacyValueHelpers.set(key,{name,source:`function ${name}(left: any, right: any): number {
    let a = +left
    let b = +right
    if (a !== a) a = 0
    if (b !== b) b = 0
    return Math.${operation}(a, b)
}`});
        }
        return `${this.legacyValueHelpers.get(key).name}(${this.arrayValue(b,'NUM1')}, ${this.arrayValue(b,'NUM2')})`;
    }

    referenceArrayValue (b, name='ARRAY') {
        const value=this.value(b,name);
        const slot=b.inputs?.[name]?.[1];
        let id=Array.isArray(slot) && [12,13].includes(slot[0]) ? slot[2] : null;
        const reporter=typeof slot==='string' && this.block(slot);
        if(reporter?.opcode==='data_variable')id=reporter.fields?.VARIABLE?.[1];
        const dynamic=id && this.mixedValueVariableIds.has(id);
        if(!dynamic)return value;
        const key='arrayAccess';
        if(!this.legacyValueHelpers.has(key)) {
            let fn='__bwArrayAccess';
            const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.legacyValueHelpers.values()].map(x=>typeof x==='string'?x:x.name));
            while(occupied.has(fn))fn+='_';
            this.legacyValueHelpers.set(key,{name:fn,source:ARRAY_ACCESS_SOURCE.replaceAll('__bwArrayAccess',fn)});
        }
        return `${this.legacyValueHelpers.get(key).name}(${value})`;
    }

    legacyArrayInput (b, name='VALUE') {
        return this.legacyValueHelper('parse')+'('+this.arrayValue(b,name)+')';
    }

    handleInputVariable (b, name) {
        const slot = b.inputs?.[name]?.[1];
        if (Array.isArray(slot) && [12, 13].includes(slot[0])) return this.lookupVar(slot[1]);
        const reporter = typeof slot === 'string' ? this.block(slot) : null;
        return reporter?.opcode === 'data_variable' ? this.lookupVar(this.field(reporter, 'VARIABLE')) : null;
    }

    /** An input as a JavaScript value (Arcade programs); a Scratch-only project reads it as `value` does. */
    arrayValue (b, name) {
        if (!this.arcadeValues) return this.value(b, name);
        const slot=b.inputs?.[name]?.[1];
        if(Array.isArray(slot) && slot[0]===10)return JSON.stringify(String(slot[1]));
        if(Array.isArray(slot) && [12,13].includes(slot[0]))return this.lookupVar(slot[1]);
        const reporter=typeof slot==='string' && this.block(slot);
        return reporter && (this.isBoolean(reporter) || reporter.opcode==='data_variable') ? this.expr(reporter) : this.value(b,name);
    }

    kindExpr (b, name) {
        const kind = this.literalInput(b, name);
        if (!kind || !/^[A-Za-z_]\w*$/.test(kind)) {
            this.note(`Arcade kind in ${name} must be a fixed name`);
            return 'SpriteKind.Player';
        }
        if (!['Player', 'Enemy', 'Food', 'Projectile'].includes(kind)) this.customSpriteKinds.add(kind);
        return `SpriteKind.${kind}`;
    }

    // ── inputs ───────────────────────────────────────────────────────────
    block (id) { return id ? this.blocks[id] : null; }

    field (b, name) { return b.fields && b.fields[name] ? b.fields[name][0] : ''; }

    value (b, name, fallback = '0') {
        const input = b.inputs && b.inputs[name];
        if (!input) return fallback;
        const slot = input[1];
        const numeric = ['operator_equals','operator_gt','operator_lt','operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod','operator_round','operator_mathop','operator_random','planetemaths_min','planetemaths_max'].includes(b.opcode);
        if (Array.isArray(slot)) {
            const [type, text] = slot;
            if (type === 12 || type === 13) {
                const value = this.lookupVar(text);
                return numeric && this.booleanVariable(slot[2] || text) ? `(${value} ? 1 : 0)` : value;
            }
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
            if (r && (this.isBoolean(r) || (numeric && this.booleanVariable(r)))) return `(${this.expr(r)} ? 1 : 0)`;
            return this.expr(r);
        }
        return fallback;
    }

    condition (b, name) {
        const input = b.inputs && b.inputs[name];
        const slot = input && input[1];
        if (typeof slot !== 'string') return 'false';
        const r = this.block(slot);
        return this.isBoolean(r) || this.booleanVariable(r) ? this.expr(r) : `(${this.expr(r)} != 0)`;
    }

    /**
     * Does this variable (a data_variable block, or its id) hold a Boolean? Only
     * in an Arcade program, where `set x to (a < b)` keeps the Boolean; a
     * Scratch-only project stores 1/0 (`value`).
     */
    booleanVariable (variable) {
        if (!this.arcadeValues || !variable) return false;
        if (typeof variable === 'string') return this.booleanVariableIds.has(variable);
        return variable.opcode === 'data_variable' &&
            this.booleanVariableIds.has(variable.fields?.VARIABLE?.[1] || variable.fields?.VARIABLE?.[0]);
    }

    spriteFlagCondition (b, name = 'ON') {
        const slot = b.inputs?.[name]?.[1];
        if (Array.isArray(slot) && [12, 13].includes(slot[0])) {
            // A variable holding a Boolean (an Arcade program's `hidden = !hidden`) is the condition itself.
            const value = this.lookupVar(slot[1]);
            return this.booleanVariable(slot[2] || slot[1]) ? value : `(${value} != 0)`;
        }
        if (Array.isArray(slot)) {
            const value = slot[1];
            const on = [10, 11].includes(slot[0]) ? Boolean(value) && value !== '0' &&
                String(value).toLowerCase() !== 'false' : Boolean(Number(value));
            return on ? 'true' : 'false';
        }
        return this.condition(b, name);
    }

    isBoolean (b) {
        return !!b && ['arrays_valueTruthy','arrays_valueCompare','arrays_referenceRemove','arrays_referenceTruthy', 'arrays_contains', 'operator_and', 'operator_or', 'operator_not', 'operator_gt', 'operator_lt', 'operator_equals',
            'sensing_touchingobject', 'sensing_keypressed', 'sensing_mousedown', 'data_listcontainsitem',
            'arcade_spriteOverlaps', 'arcade_imagesOverlap', 'arcade_tileIs', 'arcade_tileIsWall', 'arcade_isHittingTile', 'arcade_hasLife', 'arcade_hasPlayerScore'].includes(b.opcode);
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
        case 'data_variable': {
            const name = this.field(b, 'VARIABLE');
            const info = this.infoVariable(name);
            return info === 'score' ? 'info.score()' : info === 'lives' ? 'info.life()' :
                this.lookupVar(name);
        }
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
        // In an Arcade program the blocks run with Scratch's casts (text -> 0),
        // so the export keeps them (a helper); a Scratch-only project's
        // numbers are numbers already.
        case 'planetemaths_min': return this.arcadeValues ? this.scratchMinMax(b, 'min') : `Math.min(${v('NUM1')}, ${v('NUM2')})`;
        case 'planetemaths_max': return this.arcadeValues ? this.scratchMinMax(b, 'max') : `Math.max(${v('NUM1')}, ${v('NUM2')})`;
        case 'planetemaths_pow': return `Math.pow(${v('NUM1')}, ${v('NUM2')})`;
        case 'operator_join':
            return v('STRING1') === '""' ? `("" + ${v('STRING2')})` : `("" + ${v('STRING1')} + ${v('STRING2')})`;
        case 'arcade_createSprite':
        case 'arcade_spawnSprite':
        case 'arcade_spawnProjectile': {
            if (!this.spawnAssignment && b.opcode === 'arcade_spawnSprite') this.note('Arcade positioned spawn expression needs an assigned handle');
            const template = this.literalInput(b, 'TEMPLATE');
            const art = template && this.artVar.get(template);
            if (!art) {
                this.note(`Arcade sprite template ${template || '(dynamic)'} has no exported artwork`);
                return this.na();
            }
            const size = this.artPixels.get(template);
            const width = this.literalNumber(b, 'WIDTH'), height = this.literalNumber(b, 'HEIGHT');
            if (size && ((width !== null && width !== size.width) ||
                (height !== null && height !== size.height))) {
                this.note(`${template}: Arcade handle size differs from its image; export needs image resizing`);
            }
            if (b.opcode === 'arcade_spawnProjectile') {
                const mode = this.literalInput(b, 'MODE');
                if (mode === 'side') {
                    return `sprites.createProjectileFromSide(${toImgLiteral(size)}, ${v('VX')}, ${v('VY')})`;
                }
                if (mode === 'sprite') {
                    const source = this.literalInput(b, 'SOURCE') === '' ? 'null' : v('SOURCE');
                    return `sprites.createProjectileFromSprite(${toImgLiteral(size)}, ${source}, ${v('VX')}, ${v('VY')})`;
                }
                if (mode === 'kind-source') {
                    const source = this.literalInput(b, 'SOURCE') === '' ? 'null' : v('SOURCE');
                    return `sprites.createProjectile(${toImgLiteral(size)}, ${v('VX')}, ${v('VY')}, ` +
                        `${this.kindExpr(b, 'KIND')}, ${source})`;
                }
                if (mode !== 'kind') this.note('Arcade projectile mode must be side, kind, sprite, or kind-source');
                return `sprites.createProjectile(${toImgLiteral(size)}, ${v('VX')}, ${v('VY')}, ${this.kindExpr(b, 'KIND')})`;
            }
            return `sprites.create(${toImgLiteral(size)}, ${this.kindExpr(b, 'KIND')})`;
        }
        case 'arcade_spawnImageProjectile': {
            const image = v('IMAGE'), vx = v('VX'), vy = v('VY');
            const source = this.literalInput(b, 'SOURCE') === '' ? 'null' : v('SOURCE');
            const mode = this.literalInput(b, 'MODE');
            if (mode === 'side') return `sprites.createProjectileFromSide(${image}, ${vx}, ${vy})`;
            if (mode === 'sprite') return `sprites.createProjectileFromSprite(${image}, ${source}, ${vx}, ${vy})`;
            if (mode === 'kind-source') return `sprites.createProjectile(${image}, ${vx}, ${vy}, ${this.kindExpr(b, 'KIND')}, ${source})`;
            if (mode !== 'kind') this.note('Arcade projectile mode must be side, kind, sprite, or kind-source');
            return `sprites.createProjectile(${image}, ${vx}, ${vy}, ${this.kindExpr(b, 'KIND')})`;
        }
        case 'arcade_imagesOverlap': return `${v('IMAGE')}.overlapsWith(${v('SOURCE')}, ${v('X')}, ${v('Y')})`;
        case 'arcade_callFunction': {
            const code = this.literalInput(b, 'NAME');
            const fn = code && (this.fnNames.get(`${this.target.isStage ? '' : this.target.name}:${code}`) || this.fnNames.get(`:${code}`));
            if (!fn) {this.note('Arcade function reporter needs a known procedure name');return this.na();}
            const args=[];let block=this.block(b.inputs?.ARGS?.[1]);
            while (block?.opcode==='arcade_functionArgument') {
                args.push(this.arrayValue(block,'VALUE'));block=this.block(block.inputs?.REST?.[1]);
            }
            // Arguments are authored as a linked chain, ending in the literal [].
            let tail=b.inputs?.ARGS;let current=this.block(tail?.[1]);
            while(current?.opcode==='arcade_functionArgument'){tail=current.inputs?.REST;current=this.block(tail?.[1]);}
            const shadow=tail?.[1];
            const empty=Array.isArray(shadow)?String(shadow[1])==='[]':current?.fields?.TEXT?.[0]==='[]';
            if(!empty)this.note('Arcade function arguments need a fixed argument chain');
            // A value-returning procedure runs in its caller's thread too (see procedures_call).
            if (this.tokened()) args.unshift('_t');
            if (this.isClonable()) args.unshift('self');
            return `${fn}(${args.join(', ')})`;
        }
        case 'arrays_namedReference': return this.namedArray(b);
        case 'arrays_parseLegacyValue': return this.legacyArrayInput(b);
        case 'arrays_jsonValue': return `${this.legacyValueHelper('json')}(${this.arrayValue(b,'VALUE')})`;
        case 'arrays_length': {const array=this.namedArray(b);return `(${array} ? ${array}.length : 0)`;}
        case 'arrays_get': return `${this.namedOperationHelper('get')}(${this.namedArray(b)}, ${this.arrayValue(b,'INDEX')})`;
        case 'arrays_pop': return `${this.namedOperationHelper('pop')}(${this.namedArray(b)})`;
        case 'arrays_indexOf': return `${this.namedOperationHelper('indexOf')}(${this.namedArray(b)}, ${this.arrayValue(b,'VALUE')})`;
        case 'arrays_contains': return `${this.namedOperationHelper('contains')}(${this.namedArray(b)}, ${this.arrayValue(b,'VALUE')})`;
        case 'arrays_toJSON': {const array=this.namedArray(b);return `${this.legacyValueHelper('json')}(${array} || [])`;}
        case 'arrays_createReference': {
            const args=[];let tail=b.inputs?.VALUES,current=this.block(tail?.[1]);
            while(current?.opcode==='arrays_referenceValues'){args.push(this.arrayValue(current,'VALUE'));tail=current.inputs?.REST;current=this.block(tail?.[1]);}
            const empty=Array.isArray(tail?.[1])?String(tail[1][1])==='[]':current?.fields?.TEXT?.[0]==='[]';
            if(!empty)this.note('Array reference constructor requires a fixed value chain');
            return `[${args.join(', ')}]`;
        }
        case 'arcade_getscore':return 'info.score()';
        case 'arrays_specialValue':return (this.field(b,'KIND') || this.literalInput(b,'KIND'))==='null'?'null':'undefined';
        case 'arrays_valueCompare':
        case 'arrays_valueBinary':
        case 'arrays_valueUnary': {
            const op=this.field(b,'OP') || this.literalInput(b,'OP'),unary=b.opcode==='arrays_valueUnary',compare=b.opcode==='arrays_valueCompare';
            const names={'+':'Add','-':'Subtract','*':'Multiply','/':'Divide','%':'Remainder','==':'Equal','!=':'NotEqual','===':'StrictEqual','!==':'StrictNotEqual','<':'Less','>':'Greater','<=':'LessEqual','>=':'GreaterEqual'};
            if(!names[op] || unary && !['+','-'].includes(op)){this.note(`unsupported value operation ${op}`);return this.na();}
            const key=(unary?'Unary':compare?'Compare':'Binary')+names[op];
            if(!this.valueOperationHelpers.has(key)){
                let name='__bw'+key;
                const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.spriteVar.values(),...this.artVar.values(),...this.valueOperationHelpers.values()].map(x=>typeof x==='string'?x:x.name));
                while(occupied.has(name))name+='_';
                this.valueOperationHelpers.set(key,{name,source:unary?`function ${name}(value: any): number { return ${op}value }`:`function ${name}(left: any, right: any): ${compare?'boolean':op==='+'?'any':'number'} { return left ${op} right }`});
            }
            const helper=this.valueOperationHelpers.get(key).name;
            return unary?`${helper}(${this.arrayValue(b,'VALUE')})`:`${helper}(${this.arrayValue(b,'LEFT')}, ${this.arrayValue(b,'RIGHT')})`;
        }
        case 'arrays_valueTruthy':return `!!(${this.arrayValue(b,'VALUE')})`;

        case 'arrays_referenceTruthy':return `!!${this.referenceArrayValue(b)}[${v('INDEX')}]`;
        case 'arrays_referenceItem':return `${this.referenceArrayValue(b)}[${v('INDEX')}]`;
        case 'arrays_referenceRemove':return `${this.referenceArrayValue(b)}.removeElement(${this.arrayValue(b,'VALUE')})`;
        case 'arrays_referenceRandom':return `Math.pickRandom(${this.referenceArrayValue(b)})`;
        case 'arrays_referenceLength':return `${this.referenceArrayValue(b)}.length`;
        case 'arrays_referenceIndexOf':return `${this.referenceArrayValue(b)}.indexOf(${this.arrayValue(b,'VALUE')}, ${v('INDEX')})`;
        case 'arrays_referenceTake': {
            const op=this.literalInput(b,'OP');
            if(op==='pop'||op==='shift')return `${this.referenceArrayValue(b)}.${op}()`;
            if(op==='removeAt')return `${this.referenceArrayValue(b)}.removeAt(${v('INDEX')})`;
            this.note('Array reference take operation must be pop, shift or removeAt');return this.na();
        }
        case 'arcade_animationAssetFreshFrames':
        case 'arcade_animationAssetFrames':
        case 'arcade_animationAssetInterval': return this.authoredAnimation(b);
        case 'arcade_createImage': return `image.create(${v('WIDTH')}, ${v('HEIGHT')})`;
        case 'arcade_cloneImage': return `${v('IMAGE')}.clone()`;
        case 'arcade_imageProperty': return `${v('IMAGE')}.${this.field(b,'PROPERTY')}`;
        case 'arcade_imagePixel': return `${v('IMAGE')}.getPixel(${v('X')}, ${v('Y')})`;
        case 'arcade_createImageSprite':
        case 'arcade_spawnImageSprite':
            if (!this.spawnAssignment && b.opcode === 'arcade_spawnImageSprite') this.note('Arcade positioned image spawn expression needs an assigned handle');
            return `sprites.create(${v('IMAGE')}, ${this.kindExpr(b,'KIND')})`;
        case 'arcade_spriteImage': return `${v('ID')}.image`;
        case 'arcade_frameImage': {
            const key = this.literalInput(b, 'KEY');
            const template = this.literalInput(b, 'TEMPLATE');
            const start = this.literalNumber(b, 'START'), count = this.literalNumber(b, 'COUNT');
            const target = this.sprites.find(t => t.name === template);
            if (!key || !target || start === null || count === null || !Number.isInteger(count) || !Number.isInteger(start) || count < 1 || start < 0 || start + count > target.costumes.length) {
                this.note('Arcade shared frame image requires a literal array key and valid template range');
                return this.na();
            }
            if (!this.sharedImageArrays.has(key)) {
                const frames = Array.from({length: count}, (_,i) => this.frame(target, start + i));
                let name = `__bwFrames_shared${this.sharedImageArrays.size+1}`;
                const used = new Set([...this.globals.values(), ...[...this.frameArrays.values(), ...this.sharedImageArrays.values()].map(a=>a.name)]);
                while (used.has(name)) name += '_';
                this.sharedImageArrays.set(key, {name,frames});
            }
            const array = this.sharedImageArrays.get(key);
            return `${array.name}[(((Math.round(${v('INDEX')}) % ${array.frames.length}) + ${array.frames.length}) % ${array.frames.length})]`;
        }
        case 'arcade_spritePixel': return `${v('ID')}.image.getPixel(${v('X')}, ${v('Y')})`;
        case 'arcade_spriteToString': return `${v('ID')}.toString()`;
        case 'arcade_spriteProperty': {
            const property = this.field(b, 'PROPERTY');
            if(!['x','y','left','right','top','bottom','vx','vy','ax','ay','fx','fy','sx','sy','scale','width','height','z','lifespan','rotation','rotationDegrees','data'].includes(property)){this.note(`Arcade sprite property ${property} is unsupported`);return this.na();}
            return `${v('ID')}.${property}`;
        }
        case 'arcade_menu_scaleAnchors': return String(Number(this.field(b,'scaleAnchors')));
        case 'arcade_menu_cameraProperties': return String(Number(this.field(b,'cameraProperties')));
        case 'arcade_getPlayerScore': {const api=this.infoPlayerApi(b);return api?`${api}.score()`:this.na();}
        case 'arcade_hasLife': {const api=this.infoPlayerApi(b);return api?`${api}.hasLife()`:this.na();}
        case 'arcade_hasPlayerScore': {const api=this.infoPlayerApi(b);return api?`${api}.hasScore()`:this.na();}
        case 'arcade_getLife': {const api=this.infoPlayerApi(b);return api?`${api}.life()`:this.na();}
        case 'arcade_currentScene': return 'game.currentScene()';
        case 'arcade_scenePhysicsEngine': return `(${v('SCENE')}.physicsEngine as ArcadePhysicsEngine)`;
        case 'arcade_createPhysicsEngine': return `new ArcadePhysicsEngine(${this.arrayValue(b,'MAX_SPEED')}, ${this.arrayValue(b,'MIN_STEP')}, ${this.arrayValue(b,'MAX_STEP')})`;
        case 'arcade_physicsEngineProperty': {
            const property=b.fields?.PROPERTY?.[0];
            if(!['maxSpeed','minStep','maxStep'].includes(property)){this.note(`Arcade PhysicsEngine property ${property} is unsupported`);return 'undefined';}
            return `(${v('ENGINE')}).${property}`;
        }
        case 'arcade_cameraProperty': return `scene.cameraProperty(${this.arrayValue(b,'PROPERTY')})`;
        case 'arcade_backgroundImage': return 'scene.backgroundImage()';
        case 'arcade_backgroundColor': return 'scene.backgroundColor()';
        case 'arcade_createAnimation': this.requiresAnimationPackage=true;return `animation.createAnimation(${this.arrayValue(b,'ACTION')}, ${this.arrayValue(b,'INTERVAL')})`;
        case 'arcade_animationProperty': {
            this.requiresAnimationPackage=true;
            const method={image:'getImage',action:'getAction',interval:'getInterval'}[this.field(b,'PROPERTY')];
            if(!method){this.note('Unsupported animation property');return this.na();}
            return `${v('ANIMATION')}.${method}()`;
        }
        case 'arcade_eventLocation':
            if(this.eventLocationName)return this.eventLocationName;
            this.note('Arcade event location outside a wall or tile callback');return this.na();
        case 'arcade_tileLocation': return `tiles.getTileLocation(${v('COLUMN')}, ${v('ROW')})`;
        case 'arcade_tilesOfType': return `tiles.getTilesByType(${v('IMAGE')})`;
        case 'arcade_tileLocationProperty': return `${v('LOCATION')}.${this.field(b,'PROPERTY')}`;
        case 'arcade_tileIs': return `tiles.tileAtLocationEquals(${v('LOCATION')}, ${v('IMAGE')})`;
        case 'arcade_isHittingTile': return `${v('ID')}.isHittingTile(${this.arrayValue(b,'DIRECTION')})`;
        case 'arcade_tileIsWall': return `tiles.tileAtLocationIsWall(${v('LOCATION')})`;
        case 'arcade_spritesOfKind': return `sprites.allOfKind(${this.kindExpr(b, 'KIND')})`;
        case 'arcade_spriteCount': return `sprites.allOfKind(${this.kindExpr(b, 'KIND')}).length`;
        case 'arcade_askForNumber': return `game.askForNumber(${v('QUESTION')})`;
        case 'arcade_controllerStep': {
            const literal=this.literal(b,'AXIS') ?? (this.field(b,'AXIS') || null);
            if(literal!==null)return `controller.d${literal.toLowerCase()==='y'?'y':'x'}(${v('STEP')})`;
            const key='controllerAxisStep';
            if(!this.legacyValueHelpers.has(key)) {
                let name='__bwControllerAxisStep';
                const occupied=new Set([...this.globals.values(),...this.fnNames.values(),...this.legacyValueHelpers.values()].map(value=>typeof value==='string'?value:value.name));
                while(occupied.has(name))name+='_';
                this.legacyValueHelpers.set(key,{name,source:`function ${name}(axis: any, step: number): number {
    const direction = "" + axis
    return direction === "y" || direction === "Y" ? controller.dy(step) : controller.dx(step)
}`});
            }
            return `${this.legacyValueHelpers.get(key).name}(${this.arrayValue(b,'AXIS')}, ${v('STEP')})`;
        }
        case 'arcade_getCaptured': {
            const name = this.literalInput(b,'NAME');
            if (!name || !this.compilingRegisteredCallbacks.size) { this.note('Arcade captured value needs a registered callback and fixed name');return this.na(); }
            return ident(name);
        }
        case 'arcade_getLocal': {
            const name = this.literalInput(b, 'NAME');
            if (!name || !/^[A-Za-z_]\w*$/.test(name) || !this.currentLocalNames) {
                this.note('Arcade local reporter needs a fixed name inside a procedure');
                return this.na();
            }
            this.currentLocalNames.add(name);
            return name;
        }
        case 'arcade_askForString': return `game.askForString(${v('QUESTION')})`;
        case 'arcade_eventSprite': {
            const which = this.field(b, 'WHICH') === 'second' ? 1 : 0;
            if (this.eventHandles?.[which]) return this.eventHandles[which];
            this.note('Arcade event sprite outside a creation or overlap callback');
            return this.na();
        }
        case 'arcade_spriteOverlaps': return `${v('A')}.overlapsWith(${v('B')})`;
        case 'operator_length': return `("" + ${v('STRING')}).length`;
        case 'operator_gt': return `(${v('OPERAND1')} > ${v('OPERAND2')})`;
        case 'operator_lt': return `(${v('OPERAND1')} < ${v('OPERAND2')})`;
        case 'operator_equals': {
            // A bare variable is compared as `any`: TypeScript narrows a `let`
            // to the literal it was last given (x = 1; ... x == 0 is then a
            // compile error), and a costume name may meet a number. `as` is
            // compile-time only; the comparison itself is unchanged.
            const loose = x => (/^[A-Za-z_]\w*$/.test(x) && x !== '_na' ? `(${x} as any)` : x);
            // Two number literals are a constant (the dialect writes a Boolean
            // literal as `0 = 1`); Static TypeScript refuses `0 == 1` outright.
            const number = x => /^-?\d+(\.\d+)?$/.test(x);
            const [left, right] = [v('OPERAND1'), v('OPERAND2')];
            if (number(left) && number(right)) return String(Number(left) === Number(right));
            return `(${loose(left)} == ${loose(right)})`;
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
            // `stop all` and `stop this script` are caps: nothing after them runs.
            if (b.opcode === 'control_stop' && /^(all|this script)$/.test(this.field(b, 'STOP_OPTION'))) return;
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
        case 'arcade_addAnimationFrame':this.requiresAnimationPackage=true;push(`${v('ANIMATION')}.addAnimationFrame(${v('IMAGE')})`);return;
        case 'arcade_attachAnimation':this.requiresAnimationPackage=true;push(`animation.attachAnimation(${v('ID')}, ${v('ANIMATION')})`);return;
        case 'arcade_setAnimationAction':this.requiresAnimationPackage=true;push(`animation.setAction(${v('ID')}, ${this.arrayValue(b,'ACTION')})`);return;
        case 'arcade_setScenePhysicsEngine': push(`${v('SCENE')}.physicsEngine = ${v('ENGINE')}`);return;
        case 'arcade_setPhysicsEngineProperty': {
            const property=b.fields?.PROPERTY?.[0];
            if(!['maxSpeed','minStep','maxStep'].includes(property)){this.note(`Arcade PhysicsEngine property ${property} is unsupported`);return;}
            push(`;(${v('ENGINE')}).${property} = ${this.arrayValue(b,'VALUE')}`);return;
        }
        case 'arcade_setAnimationInterval':this.requiresAnimationPackage=true;push(`${v('ANIMATION')}.setInterval(${this.arrayValue(b,'INTERVAL')})`);return;
        case 'arcade_runImageAnimation':push(`animation.runImageAnimation(${v('ID')}, ${this.arrayValue(b,'FRAMES')}, ${this.arrayValue(b,'INTERVAL')}, ${this.arrayValue(b,'LOOP')})`);return;
        case 'arcade_stopAnimation':push(`animation.stopAnimation(${this.arrayValue(b,'TYPE')}, ${v('ID')})`);return;
        case 'arcade_setTilemap': {
            const raw=this.literalInput(b,'DATA');let data=null;
            if(raw==='null' || raw===''){push('tiles.setTilemap(null)');return;}
            try{data=JSON.parse(raw);}catch(e){/* named below */}
            const source=tilemapSource(data);
            if(!source){this.note('Arcade tile map export requires valid fixed tile data, wall layer and scale');return;}
            push(`tiles.setTilemap(${source})`);return;
        }
        case 'arcade_setTileAt': push(`tiles.setTileAt(${v('LOCATION')}, ${v('IMAGE')})`);return;
        case 'arcade_setWallAt': push(`tiles.setWallAt(${v('LOCATION')}, ${this.condition(b,'WALL')})`);return;
        case 'arcade_placeOnTile': push(`tiles.placeOnTile(${v('ID')}, ${v('LOCATION')})`);return;
        case 'arcade_placeOnRandomTile': push(`tiles.placeOnRandomTile(${v('ID')}, ${v('IMAGE')})`);return;
        case 'arcade_setscore':push(`info.setScore(${v('N')})`);return;
        case 'arcade_changescore':push(`info.changeScoreBy(${v('N')})`);return;
        case 'data_setvariableto': {
            const scratchName = this.field(b, 'VARIABLE');
            const info = this.infoVariable(scratchName);
            if (info) {
                push(`info.set${info === 'score' ? 'Score' : 'Life'}(${v('VALUE')})`);
                return;
            }
            const name = this.lookupVar(this.field(b, 'VARIABLE'));
            if (!this.arcadeValues) {
                const val = v('VALUE');
                this.assign(name, val);
                push(`${name} = ${val}`);
                return;
            }
            // An Arcade program's variable is declared with the type of what
            // flows into it (sprite handle, image, array, Boolean, ...).
            const valueBlock = this.block(typeof b.inputs?.VALUE?.[1] === 'string' ? b.inputs.VALUE[1] : null);
            this.spawnAssignment = ['arcade_spawnSprite', 'arcade_spawnProjectile', 'arcade_spawnImageProjectile', 'arcade_spawnImageSprite', 'arcade_createSprite', 'arcade_createImageSprite'].includes(valueBlock?.opcode);
            const boolean = this.isBoolean(valueBlock) || this.booleanVariable(b.fields?.VARIABLE?.[1] || b.fields?.VARIABLE?.[0]);
            const val = this.arrayValue(b,'VALUE');
            this.spawnAssignment = false;
            if(this.mixedValueVariableIds.has(b.fields?.VARIABLE?.[1] || b.fields?.VARIABLE?.[0]))this.assign(name,val,'any');
            else if ((valueBlock && ['arcade_spawnSprite', 'arcade_spawnProjectile', 'arcade_spawnImageProjectile', 'arcade_spawnImageSprite', 'arcade_eventSprite', 'arcade_createSprite', 'arcade_createImageSprite'].includes(valueBlock.opcode)) ||
                this.handleVars.has(val) || this.spriteVariableIds.has(b.fields?.VARIABLE?.[1] || b.fields?.VARIABLE?.[0])) {
                this.handleVars.add(name);
            } else {
                const arrayType=this.arrayVariableTypes.get(b.fields?.VARIABLE?.[1] || b.fields?.VARIABLE?.[0]);
                const image = ['arcade_spriteImage', 'arcade_frameImage', 'arcade_backgroundImage', 'arcade_createImage', 'arcade_cloneImage'].includes(valueBlock?.opcode) || this.imageVars.has(val) ||
                    this.imageVariableIds.has(b.fields?.VARIABLE?.[1] || b.fields?.VARIABLE?.[0]) ||
                    (valueBlock?.opcode === 'arcade_callFunction' && this.imageReturnFunctions.has(`${this.target.isStage?'':this.target.name}:${this.literalInput(valueBlock,'NAME')}`));
                if (image) this.imageVars.add(name);
                this.assign(name, val, arrayType || (image ? 'image' : boolean ? 'boolean' : this.primitiveVariableTypes.get(b.fields?.VARIABLE?.[1] || b.fields?.VARIABLE?.[0]) || null));
            }
            push(`${name} = ${val}`);
            if (['arcade_spawnSprite', 'arcade_spawnImageSprite'].includes(valueBlock?.opcode)) {
                push(`${name}.setPosition(${this.value(valueBlock, 'X')}, ${this.value(valueBlock, 'Y')})`);
            }
            return;
        }
        case 'data_changevariableby': {
            const scratchName = this.field(b, 'VARIABLE');
            const info = this.infoVariable(scratchName);
            if (info) push(`info.change${info === 'score' ? 'Score' : 'Life'}By(${v('VALUE')})`);
            else push(`${this.lookupVar(scratchName)} += ${v('VALUE')}`);
            return;
        }
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
        case 'control_stop': this.stop(b, push); return;
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
        case 'arcade_setBackgroundImage': push(`scene.setBackgroundImage(${this.literalInput(b,'IMAGE') === '' ? 'null' : v('IMAGE')})`); return;
        case 'arcade_setBackgroundColor': push(`scene.setBackgroundColor(${v('COLOR')})`); return;
        case 'arcade_controlSprite': push(`controller.moveSprite(${v('ID')}, ${v('VX')}, ${v('VY')})`); return;
        case 'arcade_destroySprite': push(`${v('ID')}.destroy()`); return;
        case 'arcade_spriteSay': {
            const self = this.literalInput(b, 'ID') === 'self';
            const owner = self ? me : v('ID');
            if (!owner) { push(`// ${this.note('Arcade speech needs a sprite')}`); return; }
            const mode = this.literalInput(b, 'MODE') || b.fields?.MODE?.[0];
            if (!['text', 'legacy'].includes(mode)) {
                push(`// ${this.note('Arcade speech mode must be text or legacy')}`);
                return;
            }
            const literal = this.literalInput(b, 'TEXT');
            const textSlot = b.inputs?.TEXT?.[1];
            const reporter = typeof textSlot === 'string' ? this.block(textSlot) : null;
            const message = literal !== null ? JSON.stringify(literal) : this.isBoolean(reporter) ?
                this.expr(reporter) : v('TEXT', '""');
            const args = [message, v('DURATION', '-1')];
            if (mode === 'text') {
                const animated = this.literalNumber(b, 'ANIMATED');
                args.push(animated === null ? this.condition(b, 'ANIMATED') : animated ? 'true' : 'false');
            }
            args.push(v('FOREGROUND', '15'), v('BACKGROUND', '1'));
            push(`${owner}.${mode === 'legacy' ? 'say' : 'sayText'}(${args.join(', ')})`);
            return;
        }
        case 'arrays_createEmpty': push(`${this.namedArray(b)} = []`);return;
        case 'arrays_create1D':
        case 'arrays_create2D': {
            const text=this.literalInput(b,'JSON');let value;
            if(text===null){push(`// ${this.note('Named array JSON creation requires a fixed JSON value')}`);return;}
            try{value=JSON.parse(text);}catch(_){value=b.opcode==='arrays_create2D'?[[]]:[];}
            const representable=value=>value===null || ['string','number','boolean'].includes(typeof value) || Array.isArray(value) && value.every(representable);
            if(!Array.isArray(value) || !representable(value)){push(`// ${this.note('Named array JSON object entries require object-value support')}`);return;}
            push(`${this.namedArray(b)} = ${JSON.stringify(value)}`);return;
        }
        case 'arrays_push': push(`${this.namedOperationHelper('push')}(${this.namedArray(b)}, ${this.arrayValue(b,'VALUE')})`);return;
        case 'arrays_set': push(`${this.namedOperationHelper('set')}(${this.namedArray(b)}, ${this.arrayValue(b,'INDEX')}, ${this.arrayValue(b,'VALUE')})`);return;
        case 'arrays_insert': push(`${this.namedOperationHelper('insert')}(${this.namedArray(b)}, ${this.arrayValue(b,'INDEX')}, ${this.arrayValue(b,'VALUE')})`);return;
        case 'arrays_remove': push(`${this.namedOperationHelper('remove')}(${this.namedArray(b)}, ${this.arrayValue(b,'INDEX')})`);return;
        case 'arrays_delete': push(`${this.namedArray(b)} = null`);return;
        case 'arrays_mutateReference': {
            const op=this.literalInput(b,'OP'),array=this.referenceArrayValue(b);
            if(op==='set')push(`${array}[${v('INDEX')}] = ${this.arrayValue(b,'VALUE')}`);
            else if(op==='length')push(`${array}.length = ${this.arrayValue(b,'VALUE')}`);
            else if(['push','unshift','removeElement'].includes(op))push(`${array}.${op}(${this.arrayValue(b,'VALUE')})`);
            else if(op==='insertAt')push(`${array}.insertAt(${v('INDEX')}, ${this.arrayValue(b,'VALUE')})`);
            else if(op==='removeAt')push(`${array}.removeAt(${v('INDEX')})`);
            else if(['pop','shift','reverse'].includes(op))push(`${array}.${op}()`);
            else push(`// ${this.note('Unsupported array reference mutation '+op)}`);
            return;
        }
        case 'arcade_setLocal': {
            const name = this.literalInput(b, 'NAME');
            if (!name || !/^[A-Za-z_]\w*$/.test(name) || !this.currentLocalNames) {
                push(`// ${this.note('Arcade local assignment needs a fixed name inside a procedure')}`);
            } else {
                this.currentLocalNames.add(name);
                const valueBlock = this.block(typeof b.inputs?.VALUE?.[1] === 'string' ? b.inputs.VALUE[1] : null);
                this.spawnAssignment = ['arcade_spawnSprite', 'arcade_spawnProjectile', 'arcade_spawnImageProjectile', 'arcade_spawnImageSprite', 'arcade_createSprite', 'arcade_createImageSprite'].includes(valueBlock?.opcode);
                const value = this.arrayValue(b,'VALUE');
                this.spawnAssignment = false;
                push(`${name} = ${value}`);
                if (['arcade_spawnSprite', 'arcade_spawnImageSprite'].includes(valueBlock?.opcode)) {
                    push(`${name}.setPosition(${this.value(valueBlock, 'X')}, ${this.value(valueBlock, 'Y')})`);
                }
            }
            return;
        }
        case 'arcade_setPlayerScore':
        case 'arcade_changePlayerScore': {const api=this.infoPlayerApi(b);if(api)push(`${api}.${b.opcode==='arcade_setPlayerScore'?'setScore':'changeScoreBy'}(${this.arrayValue(b,'VALUE')})`);return;}
        case 'arcade_setLife':
        case 'arcade_changeLife': {const api=this.infoPlayerApi(b);if(api)push(`${api}.${b.opcode==='arcade_setLife'?'setLife':'changeLifeBy'}(${this.arrayValue(b,'VALUE')})`);return;}
        case 'arcade_pushScene': push('game.pushScene()');return;
        case 'arcade_popScene': push('game.popScene()');return;
        case 'arcade_registerUpdateHandler':
        case 'arcade_registerIntervalHandler':
        case 'arcade_registerButtonHandler':
        case 'arcade_registerDestroyedHandler':
        case 'arcade_registerOverlapHandler':
        case 'arcade_registerScenePushHandler':
        case 'arcade_registerScenePopHandler':
        case 'arcade_registerForeverHandler':
        case 'arcade_registerLifeZeroHandler':
        case 'arcade_registerCountdownHandler': {
            const kinds={arcade_registerUpdateHandler:'update',arcade_registerIntervalHandler:'interval',
                arcade_registerButtonHandler:'button',arcade_registerDestroyedHandler:'destroyed',arcade_registerOverlapHandler:'overlap',
                arcade_registerScenePushHandler:'scenePush',arcade_registerScenePopHandler:'scenePop',
                arcade_registerForeverHandler:'forever',arcade_registerLifeZeroHandler:'lifeZero',arcade_registerCountdownHandler:'countdown'};
            const kind=kinds[b.opcode],token=this.literalInput(b,'TOKEN'),callback=token && this.registeredCallback(token);
            if(!callback || callback.kind!==kind){push(`// ${this.note('Arcade registration has no matching callback')}`);return;}
            const signatures={destroyed:`${callback.parameter}: Sprite`,overlap:`${callback.parameter}: Sprite, ${callback.second}: Sprite`};
            const body=`function (${signatures[kind]||''}) {\n${callback.script.join('\n')}\n}`;
            const apis={update:'game.onUpdate',interval:'game.onUpdateInterval',destroyed:'sprites.onDestroyed',overlap:'sprites.onOverlap',
                scenePush:'game.addScenePushHandler',scenePop:'game.addScenePopHandler',forever:'game.forever',
                lifeZero:'info.onLifeZero',countdown:'info.onCountdownEnd'};
            const args=[];let api=apis[kind];
            if(kind==='lifeZero'){const playerApi=this.infoPlayerApi(b);if(!playerApi)return;api=playerApi+'.onLifeZero';}
            if(kind==='interval')args.push(this.arrayValue(b,'INTERVAL'));
            if(kind==='destroyed' || kind==='overlap')args.push(this.kindExpr(b,'KIND'));
            if(kind==='overlap')args.push(this.kindExpr(b,'OTHER_KIND'));
            if(kind==='button'){
                const button=this.literalInput(b,'BUTTON');
                if(!['A','B','up','down','left','right'].includes(button)){push(`// ${this.note('Arcade button registration requires a fixed supported button')}`);return;}
                api=`controller.${button}.onEvent`;args.push(this.arrayValue(b,'EVENT'));
            }
            this.usedRegisteredCallbacks.add(token);push(`${api}(${[...args,body].join(', ')})`);return;
        }
        case 'arcade_centerCameraAt': push(`scene.centerCameraAt(${this.arrayValue(b,'X')}, ${this.arrayValue(b,'Y')})`);return;
        case 'arcade_cameraFollowSprite': push(`scene.cameraFollowSprite(${this.arrayValue(b,'ID')})`);return;
        case 'arcade_registerWallHandler':
        case 'arcade_registerTileHandler': {
            const token=this.literalInput(b,'TOKEN'),kind=b.opcode==='arcade_registerWallHandler'?'wall':'tile';
            const callback=token && this.registeredCallback(token);
            if(!callback || callback.kind!==kind)push(`// ${this.note('Arcade terrain registration has no matching callback')}`);
            else {
                this.usedRegisteredCallbacks.add(token);
                const args=[this.kindExpr(b,'KIND')];if(kind==='tile')args.push(v('IMAGE'));
                push(`scene.${kind==='wall'?'onHitWall':'onOverlapTile'}(${args.join(', ')}, function (${callback.parameter}: Sprite, ${callback.location}: tiles.Location) {\n${callback.script.join('\n')}\n})`);
            }return;
        }
        case 'arcade_registerSpriteCreated': {
            const token = this.literalInput(b,'TOKEN');
            const callback = token && this.registeredCallback(token);
            if (!callback) push(`// ${this.note('Arcade creation registration has no matching callback')}`);
            else {
                this.usedRegisteredCallbacks.add(token);
                push(`sprites.onCreated(${this.kindExpr(b,'KIND')}, function (${callback.parameter}: Sprite) {\n${callback.script.join('\n')}\n})`);
            }
            return;
        }
        case 'arcade_setCaptured': {
            const name = this.literalInput(b,'NAME');
            if (!name || !this.compilingRegisteredCallbacks.size) push(`// ${this.note('Arcade captured assignment needs a registered callback and fixed name')}`);
            else push(`${ident(name)} = ${v('VALUE')}`);
            return;
        }
        case 'arcade_registerSpriteDestroyed': {
            const token = this.literalInput(b, 'TOKEN');
            const callback = token && this.destroyedCallbacks.get(token);
            if (!callback) push(`// ${this.note('Arcade sprite destruction registration has no matching callback')}`);
            else {
                this.usedDestroyedCallbacks.add(token);
                push(`${v('ID')}.onDestroyed(function () {\n${callback.join('\n')}\n})`);
            }
            return;
        }
        case 'arcade_mutateImage': {
            const op=this.field(b,'OP'); if(!['fill','replace','flipX','flipY'].includes(op)){this.note(`Unsupported Arcade image operation ${op}`);return;}
            const args=op==='fill'?v('COLOR'):op==='replace'?`${v('COLOR')}, ${v('TO')}`:'';
            push(`${v('IMAGE')}.${op}(${args})`);return;
        }
        case 'arcade_blitImage': {
            const op = this.field(b, 'OP');
            if (!['drawImage', 'drawTransparentImage'].includes(op)) {this.note(`Unsupported Arcade image copy operation ${op}`);return;}
            push(`${v('IMAGE')}.${op}(${v('SOURCE')}, ${v('X')}, ${v('Y')})`);return;
        }
        case 'arcade_returnValue': push(`return ${this.arrayValue(b,'VALUE')}`);return;
        case 'arcade_setImagePixel': push(`${v('IMAGE')}.setPixel(${v('X')}, ${v('Y')}, ${v('COLOR')})`);return;
        case 'arcade_drawImage': {
            const op=this.field(b,'OP');if(!['fillRect','drawLine'].includes(op)){this.note(`Unsupported Arcade drawing operation ${op}`);return;}
            push(`${v('IMAGE')}.${op}(${v('X')}, ${v('Y')}, ${v('W')}, ${v('H')}, ${v('COLOR')})`);return;
        }
        case 'arcade_setSpriteImage': push(`${v('ID')}.setImage(${v('IMAGE')})`); return;
        case 'arcade_setSpritePixel': push(`${v('ID')}.image.setPixel(${v('X')}, ${v('Y')}, ${v('COLOR')})`); return;
        case 'arcade_drawSpriteImage': {
            const operation = this.field(b, 'OP');
            if (!['fillRect', 'drawLine'].includes(operation)) { this.note(`Unsupported Arcade image drawing operation ${operation}`); return; }
            push(`${v('ID')}.image.${operation}(${v('X')}, ${v('Y')}, ${v('W')}, ${v('H')}, ${v('COLOR')})`); return;
        }
        case 'arcade_mutateSpriteImage': {
            const operation = this.field(b, 'OP');
            if (!['fill', 'replace', 'flipX', 'flipY'].includes(operation)) {
                this.note(`Unsupported Arcade image operation ${operation}`); return;
            }
            const args = operation === 'fill' ? v('COLOR') : operation === 'replace' ? `${v('COLOR')}, ${v('TO')}` : '';
            push(`${v('ID')}.image.${operation}(${args})`); return;
        }
        case 'arcade_setSpriteCostume': {
            const handle = this.handleInputVariable(b, 'ID');
            const template = handle && this.handleTemplateVars.get(handle);
            const target = template && this.sprites.find(t => t.name === template);
            const costume = this.literalNumber(b, 'COSTUME');
            if (!target) {
                const slot = b.inputs?.ID?.[1];
                const reporter = typeof slot === 'string' ? this.block(slot) : null;
                if (reporter?.opcode === 'arcade_eventSprite' &&
                    this.field(reporter, 'WHICH') === 'first' && this.eventKind && costume !== null) {
                    const matches = [...this.templateKinds].filter(([name, kind]) =>
                        kind === this.eventKind && this.templateNames.has(name))
                        .map(([name]) => this.sprites.find(sprite => sprite.name === name)).filter(Boolean);
                    if (matches.length && matches.every(sprite => (sprite.costumes?.length || 0) > 0)) {
                        const images = matches.map(sprite => {
                            const count = sprite.costumes.length;
                            const index = ((Math.round(costume) % count) + count) % count;
                            return this.frame(sprite, index);
                        });
                        const literal = toImgLiteral(images[0]);
                        if (images.every(image => toImgLiteral(image) === literal)) {
                            push(`${v('ID')}.setImage(${literal})`);
                            return;
                        }
                    }
                }
                push(`// ${this.note('Arcade image change needs a sprite handle with a known template')}`);
                return;
            }
            const count = target.costumes?.length || 0;
            if (!count) {
                push(`// ${this.note(`${template}: no costumes available for Arcade image change`)}`);
                return;
            }
            if (costume === null) {
                if (!this.frameArrays.has(template)) {
                    const frames = target.costumes.map((unused, index) => this.frame(target, index));
                    const initial = frames[0];
                    if (frames.some(frame => (frame.width !== initial.width || frame.height !== initial.height) &&
                        (frame.scale !== 4 || initial.scale !== 4))) {
                        this.note(`${template}: resized Arcade frames need four-unit pixel SVG artwork`);
                    }
                    const used = new Set([...this.spriteVar.values(), ...this.globals.values(),
                        ...[...this.frameArrays.values()].map(array => array.name)]);
                    for (const sprite of this.project.targets) for (const variable of Object.values(sprite.variables || {})) {
                        used.add(ident(variable[0]));
                        used.add(ident(`${sprite.name}_${variable[0]}`));
                    }
                    let name = `__bwFrames_${ident(template)}`;
                    while (used.has(name)) name += '_';
                    this.frameArrays.set(template, {name, frames});
                }
                const array = this.frameArrays.get(template);
                const selection = `(((Math.round(${v('COSTUME')}) % ${count}) + ${count}) % ${count})`;
                push(`${v('ID')}.setImage(${array.name}[${selection}])`);
                return;
            }
            const index = ((Math.round(costume) % count) + count) % count;
            const currentImage = this.frame(target, index);
            const initialImage = this.artPixels.get(template);
            if (initialImage && (initialImage.width !== currentImage.width ||
                initialImage.height !== currentImage.height) &&
                (initialImage.scale !== 4 || currentImage.scale !== 4)) {
                this.note(`${template}: resized Arcade frames need four-unit pixel SVG artwork`);
            }
            push(`${v('ID')}.setImage(${toImgLiteral(currentImage)})`);
            return;
        }
        case 'arcade_setSpriteScaleCore': push(`${v('ID')}.setScaleCore(${this.arrayValue(b,'SX')}, ${this.arrayValue(b,'SY')}, ${v('ANCHOR')}, ${this.spriteFlagCondition(b,'PROPORTIONAL')})`);return;
        case 'arcade_setSpriteScale': push(`${v('ID')}.setScale(${v('VALUE')}, ${v('ANCHOR')})`);return;
        case 'arcade_changeSpriteScale': push(`${v('ID')}.changeScale(${v('VALUE')}, ${v('ANCHOR')})`);return;
        case 'arcade_setSpritePosition': push(`${v('ID')}.setPosition(${v('X')}, ${v('Y')})`); return;
        case 'arcade_setSpriteProperty': {
            const property = this.field(b, 'PROPERTY');
            if(!['x','y','left','right','top','bottom','vx','vy','ax','ay','fx','fy','sx','sy','scale','width','height','z','lifespan','rotation','rotationDegrees','data'].includes(property)){push(`// ${this.note(`Arcade sprite property ${property} is unsupported`)}`);return;}
            if (['width', 'height'].includes(property)) push(`// ${this.note(`Arcade sprite ${property} needs image resizing`)}`);
            else push(`${v('ID')}.${property} = ${v('VALUE')}`);
            return;
        }
        case 'arcade_setSpriteKind': push(`${v('ID')}.setKind(${this.kindExpr(b, 'KIND')})`); return;
        case 'arcade_setSpriteFlag': {
            const flag = this.field(b, 'FLAG');
            if (!['AutoDestroy', 'StayInScreen', 'BounceOnWall', 'DestroyOnWall', 'Invisible', 'Ghost',
                'GhostThroughSprites', 'GhostThroughWalls', 'GhostThroughTiles', 'RelativeToCamera'].includes(flag)) {
                push(`// ${this.note(`Unsupported Arcade sprite flag ${flag}`)}`);
                return;
            }
            push(`${v('ID')}.setFlag(SpriteFlag.${flag}, ${this.spriteFlagCondition(b)})`);
            return;
        }
        case 'arcade_setSpriteStayInScreen': push(`${v('ID')}.setStayInScreen(${this.spriteFlagCondition(b)})`); return;
        case 'arcade_setSpriteAutoDestroy': push(`${v('ID')}.setFlag(SpriteFlag.AutoDestroy, ${this.spriteFlagCondition(b)})`); return;
        case 'arcade_setSpriteBounceOnWall': push(`${v('ID')}.setBounceOnWall(${this.spriteFlagCondition(b)})`); return;
        case 'arcade_setSpriteGhostThroughSprites': push(`${v('ID')}.setFlag(SpriteFlag.GhostThroughSprites, ${this.spriteFlagCondition(b)})`); return;
        case 'arcade_startCountdown': push(`info.startCountdown(${v('N')})`); return;
        case 'arcade_stopCountdown': push('info.stopCountdown()'); return;
        case 'arcade_splash': {
            const title = v('TITLE', '""');
            const subtitle = v('SUBTITLE', '""');
            push(subtitle === '""' ? `game.splash(${title})` : `game.splash(${title}, ${subtitle})`);
            return;
        }
        case 'arcade_showLongText': {
            const layout = this.field(b, 'LAYOUT');
            if (!['Left', 'Right', 'Top', 'Bottom', 'Center', 'Full'].includes(layout)) {
                push(`// ${this.note('Arcade long text layout must be fixed')}`);
                return;
            }
            push(`game.showLongText(${v('TEXT', '""')}, DialogLayout.${layout})`);
            return;
        }
        case 'arcade_log': push(`console.log(${this.arrayValue(b, 'TEXT')})`); return;
        case 'arcade_gameover': push('game.over(false)'); return;
        case 'procedures_call': {
            const code = b.mutation && b.mutation.proccode;
            const fn = this.fnNames.get(`${this.target.name}:${code}`) || this.fnNames.get(`:${code}`);
            const ids = b.mutation ? JSON.parse(b.mutation.argumentids || '[]') : [];
            const args = ids.map(a => this.arrayValue(b, a));
            // A custom block runs in its caller's thread: it gets the caller's run token.
            if (this.tokened()) args.unshift('_t');
            if (this.isClonable()) args.unshift('self');
            if (fn) {
                push(`${fn}(${args.join(', ')})`);
                // It may have yielded: if this script was ended meanwhile, end here too.
                this.guardLine().forEach(push);
            } else push(`// ${this.note(`call ${code}`)}`);
            return;
        }
        default:
            push(`// ${this.note(b.opcode)}`);
        }
    }

    /**
     * Scratch's `stop` block, option by option (scratch-vm control.stop):
     *   - `this script` returns — from the script, or, inside a custom block,
     *     from that block only (Thread.stopThisScript pops to the call);
     *   - `other scripts in sprite/stage` ends every other running script of
     *     THIS sprite or clone and carries on: the target's mark moves past
     *     every run token issued so far, keeping this run's own;
     *   - `all` ends every script everywhere (all run tokens so far are dead),
     *     deletes the clones, stops the sounds and clears speech bubbles, as
     *     Runtime.stopAll does — and the game keeps running, so a key or a
     *     broadcast starts its scripts again, as in Scratch. Not `game.over`,
     *     which shows a lose screen and restarts the program on a button.
     * A script ended from outside stops at its next yield; Arcade switches
     * threads only there, so it runs no further block, as in Scratch.
     */
    stop (b, push) {
        const option = this.field(b, 'STOP_OPTION');
        if (option === 'this script') {
            push('return  // stop this script');
        } else if (option === 'all') {
            this.use('tok');
            push('_stopAll()');
            push('return');
        } else if (/^other scripts in (sprite|stage)$/.test(option)) {
            this.use('tok');
            if (this.isClonable()) {
                this.use('others');
                push('_stopOthers(self, _t)');
            } else {
                const [mark, kept] = this.stopMarks();
                push(`${mark} = _tokens  // stop ${option}`);
                push(`${kept} = _t`);
            }
            if (this.soundWaiters && this.soundWaiters.has(this.target)) {
                this.warn(`stop other scripts in ${this.target.name}: a tone a stopped script was waiting on plays to its end (Arcade has one sound voice; Scratch stops that sprite's sound)`);
            }
        } else {
            push(`// ${this.note(`stop ${option || '…'}`)}`);
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

    localDeclaration (name, key) {
        const type=this.localValueTypes.get(key)?.get(name) || 'any';
        const initial=type==='Image' || type==='Sprite' || type==='tiles.Location' || type==='animation.Animation' || type==='scene.Scene' || type==='ArcadePhysicsEngine' || type.endsWith('[]') ? 'null' : type==='string' ? '""' : type==='boolean' ? 'false' : '0';
        return `    let ${name}: ${type} = ${initial}`;
    }

    infoPlayerApi(b) {
        const player=b.inputs?.PLAYER?this.literalNumber(b,'PLAYER'):1;
        if(![1,2,3,4].includes(player)){this.note('Arcade life export requires a fixed player from 1 to 4');return null;}
        return player===1?'info':`info.player${player}`;
    }

    registeredCallback(token) {
        if (this.registeredCallbacks.has(token)) return this.registeredCallbacks.get(token);
        const entry = this.registeredCallbackBlocks.get(token);
        if (!entry || this.compilingRegisteredCallbacks.has(token)) return null;
        const saved = {target:this.target,blocks:this.blocks,eventHandles:this.eventHandles,eventLocationName:this.eventLocationName,eventKind:this.eventKind,currentLocalNames:this.currentLocalNames};
        this.compilingRegisteredCallbacks.add(token);
        this.target = entry.target;this.blocks = entry.target.blocks;
        let parameter = `${entry.kind==='created'?'__bwCreatedSprite':['wall','tile'].includes(entry.kind)?'__bwTerrainSprite':'__bwEventSprite'}_${ident(token)}`;
        const text = JSON.stringify(entry.target.blocks);
        while (text.includes(parameter)) parameter += '_';
        let location=`__bwEventLocation_${ident(token)}`;while(text.includes(location))location+='_';
        let second=`__bwOtherSprite_${ident(token)}`;while(text.includes(second))second+='_';
        this.eventLocationName=['wall','tile'].includes(entry.kind)?location:null;
        this.eventHandles = entry.kind==='overlap'?[parameter,second]:['created','wall','tile','destroyed'].includes(entry.kind)?[parameter]:[];this.eventKind = this.registeredCallbackKinds.get(token);
        this.currentLocalNames = new Set();
        const script = [];this.stmts(entry.block.next,1,script);
        const scope=`${entry.target.name}:script:${Object.keys(this.blocks).find(id=>this.blocks[id]===entry.block)}`;
        script.unshift(...[...this.currentLocalNames].filter(name=>name!==parameter && name!==location && name!==second).map(name=>this.localDeclaration(name,scope)));
        this.compilingRegisteredCallbacks.delete(token);
        Object.assign(this,saved);
        const result = {parameter,second,location,kind:entry.kind,script};this.registeredCallbacks.set(token,result);return result;
    }

    /** Infer Image argument annotations from native image operations and
     * resource aliases. Constraint edges carry types through forwarded calls. */
    imageProcedureParameters () {
        const graphAnimationValues=new Set(),graphSceneValues=new Set(),graphPhysicsEngineValues=new Set();
        const dataProperties=[], parameters = new Map(), edges = [], images = new Set(), sprites = new Set(), tiles = new Set(), arrays = new Set(), numbers = new Set(), booleans=new Set(), strings=new Set(), anys=new Set(), specialTypes=[],valueOperations=[], elements=[],lookupTypes=[];
        const definitions = [],captureLinks=[],callbackScopes=new Map(),callbackCaptureNames=new Map();
        const inputBlock = (blocks, b, name) => {
            const input=b.inputs?.[name]?.[1];
            if(Array.isArray(input) && input[0]===12) return {opcode:'data_variable',fields:{VARIABLE:[input[1],input[2]]}};
            if(Array.isArray(input) && input[0]===10)return {opcode:'bw_stringLiteral',value:input[1]};
            if(Array.isArray(input) && [4,5,6,7,8].includes(input[0]))return {opcode:'bw_numberLiteral',value:Number(input[1])};
            return blocks[input];
        };
        const literal = (blocks, b, name) => {
            if(b.fields?.[name])return String(b.fields[name][0]);
            const input = b.inputs?.[name]?.[1];
            return Array.isArray(input) ? String(input[1]) : String(blocks[input]?.fields?.TEXT?.[0] || '');
        };
        for (const target of this.project.targets) {
            const blocks = target.blocks || {};
            for (const b of Object.values(blocks)) {
                if (b.opcode !== 'procedures_definition') continue;
                const proto = inputBlock(blocks,b,'custom_block');
                if (!proto?.mutation) continue;
                const key = `${target.isStage ? '' : target.name}:${proto.mutation.proccode}`;
                const names = JSON.parse(proto.mutation.argumentnames || '[]');
                const keys = names.map(name => `${key}:param:${name}`);
                parameters.set(key, keys);
                definitions.push({target,blocks,b,key});
            }
        }
        for (const target of this.project.targets) for (const [id,b] of Object.entries(target.blocks || {})) {
            if (b.topLevel && b.opcode !== 'procedures_definition') definitions.push({target,blocks:target.blocks,b,key:`${target.name}:script:${id}`});
        }
        for(const {blocks,b,key} of definitions)if(Object.prototype.hasOwnProperty.call(REGISTERED_HAT_KINDS,b.opcode)){
            callbackScopes.set(literal(blocks,b,'TOKEN'),key);
            const names=new Set(),seen=new Set();
            const collect=id=>{
                if(typeof id!=='string' || seen.has(id) || !blocks[id])return;
                seen.add(id);const value=blocks[id];
                if(['arcade_getCaptured','arcade_setCaptured'].includes(value.opcode))names.add(literal(blocks,value,'NAME'));
                for(const input of Object.values(value.inputs||{}))collect(input[1]);
                collect(value.next);
            };
            collect(b.next);callbackCaptureNames.set(key,names);
        }
        for (const {target,blocks,b,key} of definitions) {
            const localKey = name => parameters.get(key)?.includes(`${key}:param:${name}`) ? `${key}:param:${name}` : `${key}:local:${name}`;
            // Capture bindings belong to the registering script, even when another
            // procedure or callback uses the same local name in this target.
            const scopeBlocks = new Set();
            const collectScope = id => {
                if (typeof id !== 'string' || scopeBlocks.has(id) || !blocks[id]) return;
                scopeBlocks.add(id);
                for (const input of Object.values(blocks[id].inputs || {})) collectScope(input[1]);
                collectScope(blocks[id].next);
            };
            collectScope(b.next);
            const scopeValues = [...scopeBlocks].map(id => blocks[id]);
            const ref = value => {
                if (!value) return null;
                if(value.opcode==='arrays_namedReference'){const id='named-array:'+literal(blocks,value,'NAME');arrays.add(id);return id;}
                if(['arrays_parseLegacyValue','arrays_jsonValue','arrays_pop'].includes(value.opcode)){const id=Symbol('legacy value');anys.add(id);return id;}
                if(value.opcode==='arcade_spriteToString') {const id=Symbol('sprite text');strings.add(id);return id;}
                if(value.opcode==='bw_numberLiteral' || value.opcode==='math_number') {const id=Symbol('number value');numbers.add(id);return id;}
                if(value.opcode==='bw_stringLiteral') {const id=Symbol('string value');strings.add(id);return id;}
                if(['arrays_valueBinary','arrays_valueUnary'].includes(value.opcode)) {
                    const id=`${key}:value-operation:${Object.keys(blocks).find(id=>blocks[id]===value)}`;
                    if(value.opcode==='arrays_valueBinary' && literal(blocks,value,'OP')==='+')valueOperations.push([id,ref(inputBlock(blocks,value,'LEFT')),ref(inputBlock(blocks,value,'RIGHT'))]);
                    else numbers.add(id);
                    return id;
                }
                if(value.opcode==='arrays_specialValue'){const id=Symbol('special value');specialTypes.push([id,literal(blocks,value,'KIND')]);return id;}
                if(this.isBoolean(value) || ['operator_add','operator_subtract','operator_multiply','operator_divide','operator_mod','operator_round','operator_random','operator_join','planetemaths_min','planetemaths_max'].includes(value.opcode)) {
                    const id=`${key}:primitive:${Object.keys(blocks).find(id=>blocks[id]===value)}`;
                    (this.isBoolean(value)?booleans:value.opcode==='operator_join'?strings:numbers).add(id);return id;
                }
                if (/^argument_reporter_/.test(value.opcode)) return `${key}:param:${value.fields.VALUE[0]}`;
                if (value.opcode === 'arcade_getCaptured')return `${key}:capture:${literal(blocks,value,'NAME')}`;
                if (value.opcode === 'arcade_getLocal') return localKey(literal(blocks,value,'NAME'));
                if (value.opcode === 'arcade_callFunction') return `${target.isStage ? '' : target.name}:${literal(blocks,value,'NAME')}:result`;
                if (value.opcode === 'data_variable') return `variable:${value.fields.VARIABLE[1] || value.fields.VARIABLE[0]}`;
                if(value.opcode==='arcade_eventLocation'){const id=Symbol('event tile location');tiles.add(id);return id;}
                if(value.opcode==='arcade_tileLocation'){const id=`${key}:tile:${Object.keys(blocks).find(id=>blocks[id]===value)}`;tiles.add(id);return id;}
                if(value.opcode==='arcade_tilesOfType'){const id=`${key}:tile-array:${Object.keys(blocks).find(id=>blocks[id]===value)}`;arrays.add(id);return id;}
                if(['arcade_getLife','arcade_getPlayerScore'].includes(value.opcode)){const id=Symbol('player life');numbers.add(id);return id;}
                if(value.opcode==='arcade_spriteProperty' && value.fields?.PROPERTY?.[0]==='data'){
                    const id=Symbol('sprite data');dataProperties.push([ref(inputBlock(blocks,value,'ID')),id]);return id;
                }
                if(value.opcode==='arcade_spriteProperty' && ['fx','fy','sx','sy','scale','rotation','rotationDegrees'].includes(value.fields?.PROPERTY?.[0])){const id=Symbol('sprite numeric property');numbers.add(id);return id;}
                if(value.opcode==='arcade_cameraProperty'){const id=Symbol('camera numeric property');numbers.add(id);return id;}
                if(value.opcode==='arcade_tileLocationProperty'){const id=Symbol('tile numeric property');numbers.add(id);return id;}
                if(value.opcode==='arcade_currentScene'){const id=Symbol('scene value');graphSceneValues.add(id);return id;}
                if(['arcade_scenePhysicsEngine','arcade_createPhysicsEngine'].includes(value.opcode)){const id=Symbol('physics engine value');graphPhysicsEngineValues.add(id);return id;}
                if(value.opcode==='arcade_physicsEngineProperty'){const id=Symbol('physics engine numeric property');numbers.add(id);return id;}
                if(value.opcode==='arcade_createAnimation'){const id=Symbol('animation value');graphAnimationValues.add(id);return id;}
                if(value.opcode==='arcade_animationProperty'){const id=Symbol('animation property');(literal(blocks,value,'PROPERTY')==='image'?images:numbers).add(id);return id;}
                if(['arcade_animationAssetFrames','arcade_animationAssetFreshFrames'].includes(value.opcode)) {
                    const id=Symbol('authored animation array'), item=Symbol('authored animation image');
                    arrays.add(id); images.add(item); elements.push([id,item]); return id;
                }
                if(value.opcode==='arcade_animationAssetInterval'){const id=Symbol('animation interval');numbers.add(id);return id;}
                if(value.opcode==='arcade_spritesOfKind'){const id=`${key}:sprite-array:${Object.keys(blocks).find(id=>blocks[id]===value)}`;arrays.add(id);return id;}
                if (['arrays_createReference','arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(value.opcode)) {
                    const id=`${key}:array-value:${Object.keys(blocks).find(id=>blocks[id]===value)}`;
                    if(value.opcode==='arrays_createReference')arrays.add(id);return id;
                }
                if (['arcade_spawnSprite','arcade_spawnProjectile','arcade_spawnImageSprite','arcade_spawnImageProjectile','arcade_eventSprite', 'arcade_createSprite', 'arcade_createImageSprite'].includes(value.opcode)) {
                    const id = `${key}:sprite:${Object.keys(blocks).find(id => blocks[id] === value)}`;
                    sprites.add(id);return id;
                }
                if (['arcade_createImage','arcade_cloneImage','arcade_spriteImage','arcade_frameImage','arcade_backgroundImage'].includes(value.opcode)) {
                    const id = `${key}:image:${Object.keys(blocks).find(id => blocks[id] === value)}`;
                    images.add(id);return id;
                }
                return null;
            };
            const connect = (a,c) => { if (a && c) edges.push([a,c]); };
            const seen = new Set();
            const visit = id => {
                if (typeof id !== 'string' || seen.has(id) || !blocks[id]) return;
                seen.add(id);const block = blocks[id];
                for (const input of block.opcode === 'arcade_blitImage' || block.opcode === 'arcade_imagesOverlap' ? ['IMAGE', 'SOURCE'] : ['IMAGE']) {
                    const image = ref(inputBlock(blocks,block,input));if(image)images.add(image);
                }
                if(block.inputs?.SCENE){const value=ref(inputBlock(blocks,block,'SCENE'));if(value)graphSceneValues.add(value);}
                if(block.inputs?.ENGINE){const value=ref(inputBlock(blocks,block,'ENGINE'));if(value)graphPhysicsEngineValues.add(value);}
                if(block.inputs?.ANIMATION){const animation=ref(inputBlock(blocks,block,'ANIMATION'));if(animation)graphAnimationValues.add(animation);}
                if(block.opcode==='arcade_runImageAnimation'){const array=ref(inputBlock(blocks,block,'FRAMES'));if(array){arrays.add(array);const item=Symbol('animation frame');images.add(item);elements.push([array,item]);}}
                for (const input of ['ID', ...(block.opcode === 'arcade_spriteOverlaps' ? ['A','B'] : []), ...(['arcade_spawnProjectile','arcade_spawnImageProjectile'].includes(block.opcode) ? ['SOURCE'] : [])]) {
                    const sprite = ref(inputBlock(blocks,block,input));if(sprite)sprites.add(sprite);
                }
                if(block.opcode.startsWith('arrays_') && block.inputs?.NAME){const id='named-array:'+literal(blocks,block,'NAME');arrays.add(id);const value=Symbol('named array element');anys.add(value);elements.push([id,value]);}
                if(block.inputs?.LOCATION){const location=ref(inputBlock(blocks,block,'LOCATION'));if(location)tiles.add(location);}
                if(block.opcode==='arcade_tileLocation')for(const name of ['COLUMN','ROW']){const number=ref(inputBlock(blocks,block,name));if(number)numbers.add(number);}
                if(block.opcode==='arcade_tilesOfType'){const array=ref(block),item=Symbol('tile collection element');tiles.add(item);elements.push([array,item]);}
                if(block.opcode==='arcade_spritesOfKind'){const array=ref(block),item=Symbol('sprite collection element');sprites.add(item);elements.push([array,item]);}
                if(block.opcode==='arrays_createReference'){
                    const array=ref(block);let current=inputBlock(blocks,block,'VALUES');
                    while(current?.opcode==='arrays_referenceValues'){elements.push([array,ref(inputBlock(blocks,current,'VALUE'))]);current=inputBlock(blocks,current,'REST');}
                }
                if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom','arrays_referenceRemove','arrays_mutateReference','arrays_referenceLength','arrays_referenceIndexOf','arrays_referenceTruthy'].includes(block.opcode)){
                    const array=ref(inputBlock(blocks,block,'ARRAY'));if(array)arrays.add(array);
                    const index=ref(inputBlock(blocks,block,'INDEX'));if(index)numbers.add(index);
                    if(['arrays_referenceItem','arrays_referenceTake','arrays_referenceRandom'].includes(block.opcode))elements.push([array,ref(block)]);
                    if(block.opcode==='arrays_referenceRemove')elements.push([array,ref(inputBlock(blocks,block,'VALUE'))]);
                    if(block.opcode==='arrays_referenceIndexOf')lookupTypes.push([array,ref(inputBlock(blocks,block,'VALUE'))]);
                    if(block.opcode==='arrays_mutateReference' && ['push','unshift','insertAt','set','removeElement'].includes(literal(blocks,block,'OP')))elements.push([array,ref(inputBlock(blocks,block,'VALUE'))]);
                }
                if(REGISTERED_COMMANDS.has(block.opcode)){
                    const scope=callbackScopes.get(literal(blocks,block,'TOKEN'));
                    const explicit=new Set(literal(blocks,block,'CAPTURES').split(/\s+/).filter(Boolean));
                    for(const name of new Set([...explicit,...(callbackCaptureNames.get(scope)||[])]))if(scope){
                        const captured=scopeValues.some(value=>value.opcode==='arcade_getCaptured' && literal(blocks,value,'NAME')===name);
                        const local=scopeValues.some(value=>value.opcode==='arcade_setLocal' && literal(blocks,value,'NAME')===name);
                        // Nested registrations inherit the parent's captured cells
                        // even when CAPTURES only names newly owned locals.
                        captureLinks.push([`${scope}:capture:${name}`,!explicit.has(name) || captured && !local?`${key}:capture:${name}`:localKey(name)]);
                    }
                }
                if(block.opcode==='arcade_setSpriteProperty' && literal(blocks,block,'PROPERTY')==='data') {
                    const id=Symbol('sprite data assignment');dataProperties.push([ref(inputBlock(blocks,block,'ID')),id]);
                    connect(id,ref(inputBlock(blocks,block,'VALUE')));
                }
                if(block.opcode==='arcade_setCaptured')connect(`${key}:capture:${literal(blocks,block,'NAME')}`,ref(inputBlock(blocks,block,'VALUE')));
                if (block.opcode === 'arcade_setLocal') connect(localKey(literal(blocks,block,'NAME')),ref(inputBlock(blocks,block,'VALUE')));
                if (block.opcode === 'data_setvariableto') connect(`variable:${block.fields.VARIABLE[1] || block.fields.VARIABLE[0]}`,ref(inputBlock(blocks,block,'VALUE')));
                if (block.opcode === 'arcade_returnValue') connect(`${key}:result`,ref(inputBlock(blocks,block,'VALUE')));
                if (block.opcode === 'arcade_callFunction') {
                    const callee = `${target.isStage ? '' : target.name}:${literal(blocks,block,'NAME')}`;
                    let arg=inputBlock(blocks,block,'ARGS'),i=0;
                    while(arg?.opcode==='arcade_functionArgument') {
                        connect(parameters.get(callee)?.[i++],ref(inputBlock(blocks,arg,'VALUE')));arg=inputBlock(blocks,arg,'REST');
                    }
                }
                if (block.opcode === 'procedures_call') {
                    const callee = `${target.isStage ? '' : target.name}:${block.mutation?.proccode}`;
                    const args = JSON.parse(block.mutation?.argumentids || '[]');
                    args.forEach((arg,i) => connect(parameters.get(callee)?.[i],ref(inputBlock(blocks,block,arg))));
                }
                for (const input of Object.values(block.inputs || {})) visit(input[1]);
                visit(block.next);
            };
            visit(b.next);
        }
        edges.push(...captureLinks);
        const graph=new ValueTypeGraph();
        for(const [values,type] of [[graphSceneValues,'Scene'],[graphPhysicsEngineValues,'PhysicsEngine'],[graphAnimationValues,'Animation'],[images,'Image'],[sprites,'Sprite'],[tiles,'TileLocation'],[arrays,'array'],[numbers,'number'],[booleans,'boolean'],[strings,'string'],[anys,'any']])for(const value of values)graph.add(value,type);
        for(const [a,b] of edges)graph.merge(a,b);
        for(const [receiver,value] of dataProperties)if(receiver)graph.merge(graph.property(receiver,'data'),value);
        for(const [,value] of dataProperties)if(!graph.node(value).types.size)graph.add(value,'any');
        for(const [array,value] of elements)if(array && value){graph.add(array,'array');graph.merge(graph.element(array),value);}
        for(const [id,type] of specialTypes)graph.add(id,type);
        const inferValueOperations=()=>{
            let revision;
            do {
                revision=graph.revision;
                for(const [result,left,right] of valueOperations){
                    const a=graph.node(left).types,b=graph.node(right).types;
                    if(a.has('any') || b.has('any')){graph.add(result,'any');continue;}
                    if(a.has('string') || b.has('string'))graph.add(result,'string');
                    const nonString=types=>[...types].some(type=>['number','boolean','null','undefined'].includes(type));
                    if(nonString(a) && nonString(b))graph.add(result,'number');
                }
            } while(revision!==graph.revision);
        };
        inferValueOperations();
        // Unknown operations remain dynamic. Propagate that fact through the
        // same result/alias graph rather than prematurely widening known sums.
        for(const [result] of valueOperations)if(!graph.node(result).types.size)graph.add(result,'any');
        inferValueOperations();
        // Searching for a value outside a collection's inferred element type
        // is valid in Blocks and still returns -1 using strict equality. Widen
        // the exported collection type without aliasing the search argument
        // to its elements (which would incorrectly change the argument type).
        for(const [array,value] of lookupTypes)if(array && value){
            const element=graph.element(array),types=graph.node(element).types;
            const searched=[...graph.node(value).types].filter(type=>['Image','Sprite','TileLocation','Animation','Scene','PhysicsEngine','array','number','string','boolean'].includes(type));
            if(types.size && searched.some(type=>!types.has(type)))graph.add(element,'any');
        }
        // Element and alias joins can make a nested array visible to reads or
        // procedure results that had no annotation of their own.
        const inferred=new Map([[graphSceneValues,'Scene'],[graphPhysicsEngineValues,'PhysicsEngine'],[graphAnimationValues,'Animation'],[images,'Image'],[sprites,'Sprite'],[tiles,'TileLocation'],[arrays,'array'],[numbers,'number'],[booleans,'boolean'],[strings,'string'],[anys,'any']]);
        for(const [key] of graph.nodes)for(const [values,type] of inferred)if(graph.has(key,type))values.add(key);
        this.spriteReturnFunctions = new Set([...parameters.keys()].filter(key=>graph.arrayType(`${key}:result`)==='Sprite'));
        this.spriteVariableIds = new Set([...sprites].filter(key=>typeof key==='string' && key.startsWith('variable:') && graph.arrayType(key)==='Sprite').map(key=>key.slice(9)));
        this.imageReturnFunctions = new Set([...parameters.keys()].filter(key=>graph.arrayType(`${key}:result`)==='Image'));
        this.imageVariableIds = new Set([...images].filter(key=>typeof key==='string' && key.startsWith('variable:') && graph.arrayType(key)==='Image').map(key=>key.slice(9)));
        const arrayType=value=>graph.arrayType(value);
        this.mixedValueVariableIds=new Set([...graph.nodes.keys()].filter(key=>typeof key==='string' && key.startsWith('variable:') && (graph.node(key).types.size>1 || graph.has(key,'any')) && graph.arrayType(key)==='any').map(key=>key.slice(9)));
        this.booleanVariableIds=new Set([...booleans].filter(key=>typeof key==='string' && key.startsWith('variable:') && graph.arrayType(key)==='boolean').map(key=>key.slice(9)));
        this.primitiveVariableTypes=new Map([...graph.nodes.keys()].filter(key=>typeof key==='string' && key.startsWith('variable:') && ['string','tiles.Location','animation.Animation','scene.Scene','ArcadePhysicsEngine'].includes(graph.arrayType(key))).map(key=>[key.slice(9),graph.arrayType(key)]));
        this.valueReturnTypes=new Map([...parameters.keys()].map(key=>[key,graph.arrayType(`${key}:result`)]));
        this.localValueTypes=new Map();
        for(const key of graph.nodes.keys()){
            if(typeof key!=='string' || !key.includes(':local:'))continue;
            const at=key.lastIndexOf(':local:'),owner=key.slice(0,at),name=ident(key.slice(at+7));
            if(!this.localValueTypes.has(owner))this.localValueTypes.set(owner,new Map());
            this.localValueTypes.get(owner).set(name,arrayType(key));
        }
        this.arrayVariableTypes=new Map([...arrays].filter(k=>typeof k==='string' && k.startsWith('variable:')).map(k=>[k.slice(9),arrayType(k)]));
        this.arrayReturnTypes=new Map([...parameters.keys()].filter(k=>arrays.has(`${k}:result`)).map(k=>[k,arrayType(`${k}:result`)]));
        return new Map([...parameters].map(([key,keys]) => [key,keys.map(value => arrayType(value))]));
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

    /** Costume `index` of a target as palette pixels (an Arcade template's frames). */
    frame (target, index) {
        return this.image(target, target.costumes[index], index);
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
        const guards = this.stopGuards();
        const pre = this.tokenLine();
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
        // Scratch's Stage composites transparent backdrop pixels over white.
        // Native Arcade primitives own their scene defaults instead; do not
        // change those programs merely because they also have a Scratch Stage.
        const nativeArcade = this.project.targets.some(target => Object.values(target.blocks || {})
            .some(block => block?.opcode?.startsWith('arcade_')));
        const flagScripts = [];                             // green-flag scripts: {script, clonable, sv, plain}
        const handlers = [];
        const functions = [];
        const stage = this.project.targets.find(t => t.isStage);
        this.hasHandles = this.project.targets.some(t => Object.values(t.blocks || {})
            .some(b => b?.opcode?.startsWith('arcade_') &&
                ['arcade_spawnSprite', 'arcade_spawnProjectile', 'arcade_spawnImageProjectile', 'arcade_spawnImageSprite', 'arcade_whenSpriteCreated', 'arcade_whenSpritesOverlap',
                    'arcade_whenRegisteredDestroyed', 'arcade_whenRegisteredCreated', 'arcade_whenRegisteredWall', 'arcade_whenRegisteredTile', ...Object.keys(REGISTERED_HAT_KINDS), ...REGISTERED_COMMANDS, 'arcade_pushScene', 'arcade_popScene', 'arcade_createSprite', 'arcade_createImageSprite']
                    .includes(b.opcode)));
        // The importer represents a constant Arcade background colour as a
        // full-screen Scratch sprite so its artwork reaches the Code editor.
        // Recover that exact representation as an Arcade background again.
        const background = this.sprites.find(t => {
            if (t.name !== 'background' || t.costumes?.length !== 1) return false;
            const opcodes = Object.values(t.blocks || {}).map(b => b.opcode);
            return ['event_whenflagclicked', 'motion_gotoxy', 'looks_gotofrontback', 'looks_show']
                .every(opcode => opcodes.includes(opcode)) &&
                opcodes.every(opcode => ['event_whenflagclicked', 'motion_gotoxy',
                    'looks_gotofrontback', 'looks_show'].includes(opcode));
        });
        const backgroundSvg = background && this.opts.costumeSvg?.(background, background.costumes[0]);
        const backgroundFill = backgroundSvg?.match(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="480" height="360" viewBox="0 0 480 360"><rect width="480" height="360" fill="(#[0-9a-fA-F]{6})"\/><\/svg>$/)?.[1];
        const backgroundColor = backgroundFill && ARCADE_PALETTE.findIndex(color =>
            color?.toLowerCase() === backgroundFill.toLowerCase());
        this.importedBackgroundTarget = backgroundColor > 0 ? background : null;
        if (this.importedBackgroundTarget) out.push(`scene.setBackgroundColor(${backgroundColor})`);
        for (const t of this.project.targets) for (const b of Object.values(t.blocks || {})) {
            if (!['arcade_spawnSprite', 'arcade_spawnProjectile', 'arcade_spawnImageProjectile', 'arcade_spawnImageSprite', 'arcade_frameImage', 'arcade_createSprite', 'arcade_createImageSprite'].includes(b?.opcode)) continue;
            const name = this.literalInput(b, 'TEMPLATE');
            if (name) {
                this.templateNames.add(name);
                const kind = this.literalInput(b, 'KIND');
                if (!this.templateKinds.has(name)) this.templateKinds.set(name, kind);
                else if (this.templateKinds.get(name) !== kind) this.templateKinds.set(name, null);
            }
        }
        for (const name of this.templateNames) {
            const target = this.sprites.find(t => t.name === name);
            if (!target) { this.note(`Arcade sprite template ${name} does not exist`); continue; }
            this.artVar.set(name, `__bwArt_${ident(name)}`);
            this.artPixels.set(name, this.image(target));
        }
        for (const t of this.project.targets) {
            if (t === this.importedBackgroundTarget) continue;
            this.target = t;
            this.blocks = t.blocks || {};
            for (const b of Object.values(this.blocks)) {
                if (b?.opcode !== 'data_setvariableto') continue;
                const value = this.block(typeof b.inputs?.VALUE?.[1] === 'string' ? b.inputs.VALUE[1] : null);
                if (!['arcade_spawnSprite', 'arcade_spawnProjectile', 'arcade_spawnImageProjectile', 'arcade_spawnImageSprite', 'arcade_createSprite', 'arcade_createImageSprite'].includes(value?.opcode)) continue;
                const handle = this.lookupVar(this.field(b, 'VARIABLE'));
                const template = this.literalInput(value, 'TEMPLATE');
                if (this.handleTemplateVars.has(handle) && this.handleTemplateVars.get(handle) !== template) {
                    this.handleTemplateVars.set(handle, null);
                } else if (!this.handleTemplateVars.has(handle)) this.handleTemplateVars.set(handle, template);
            }
        }
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
        for (const target of this.project.targets) {
            this.target = target;this.blocks = target.blocks || {};
            for (const block of Object.values(this.blocks)) {
                if (Object.prototype.hasOwnProperty.call(REGISTERED_HAT_KINDS,block.opcode) && block.topLevel) {
                    const token = this.literalInput(block,'TOKEN');
                    if (!token || this.registeredCallbackBlocks.has(token)) this.note('Arcade registered callback needs a unique fixed token');
                    else this.registeredCallbackBlocks.set(token,{target,block,kind:REGISTERED_HAT_KINDS[block.opcode]});
                }
                if (REGISTERED_COMMANDS.has(block.opcode)) {
                    const token = this.literalInput(block,'TOKEN');
                    if (token) this.registeredCallbackKinds.set(token,this.literalInput(block,'KIND'));
                }
            }
        }
        const imageParameterTypes = this.imageProcedureParameters();
        // Instance destruction callbacks are registered by a command in the
        // startup script. Compile their bodies first, then insert each body at
        // its registration site so PXT captures the handle at that moment.
        for (const t of this.project.targets) {
            this.target = t;
            this.blocks = t.blocks || {};
            for (const b of Object.values(this.blocks)) {
                if (!b?.topLevel || b.opcode !== 'arcade_whenRegisteredDestroyed') continue;
                const token = this.literalInput(b, 'TOKEN');
                if (!token) { this.note('Arcade sprite destruction callback needs a fixed token'); continue; }
                if (this.destroyedCallbacks.has(token)) {
                    this.note(`Arcade sprite destruction callback token ${token} is duplicated`);
                    continue;
                }
                const script = [];
                this.stmts(b.next, 1, script);
                this.destroyedCallbacks.set(token, script);
            }
        }
        for (const t of this.project.targets) {
            if (t === this.importedBackgroundTarget) continue;
            this.target = t;
            this.blocks = t.blocks || {};
            const clonable = this.isClonable();
            const sv = this.spriteVar.get(t.name);
            for (const [, b] of Object.entries(this.blocks)) {
                if (!b || !b.topLevel) continue;
                if (this.templateNames.has(t.name)) {
                    // An Arcade sprite template (E1) is artwork for sprites.create:
                    // its own scripts have no MakeCode instance to run on.
                    if (b.opcode === 'event_whenflagclicked') {
                        const commands = [];
                        for (let item = this.block(b.next); item; item = this.block(item.next)) commands.push(item.opcode);
                        if (commands.some(opcode => opcode !== 'looks_hide')) {
                            this.note(`${t.name}: template scripts do not transfer to MakeCode sprite instances`);
                        }
                    } else if (b.opcode !== 'procedures_definition' && !/^(procedures_prototype|argument_)/.test(b.opcode)) {
                        this.note(`${t.name}: template event scripts do not transfer to MakeCode sprite instances`);
                    }
                    continue;
                }
                let script = [];
                // An Arcade hat's locals (arcade_setLocal) are declared in that run, not as file globals.
                const scoped = (emitBody, parameters = []) => {
                    const saved = this.currentLocalNames;
                    this.currentLocalNames = new Set();
                    const lines = emitBody();
                    const locals = [...this.currentLocalNames].filter(name => !parameters.includes(name));
                    this.currentLocalNames = saved;
                    const scope = `${t.name}:script:${Object.keys(this.blocks).find(id => this.blocks[id] === b)}`;
                    return [...locals.map(name => this.localDeclaration(name, scope)), ...lines];
                };
                const plainBody = parameters => scoped(() => this.body(b.next, this.stopGuards(), this.tokenLine()), parameters);
                // An Arcade event hat gets its event's sprites as parameters.
                const eventBody = (handles, kind = null, parameters = handles) => {
                    this.eventHandles = handles;
                    this.eventKind = kind;
                    const lines = plainBody(parameters);
                    this.eventHandles = null;
                    this.eventKind = null;
                    return lines;
                };
                if (b.opcode === 'event_whenflagclicked') {
                    // The green flag starts the ORIGINAL sprite's scripts; clones do not exist yet.
                    if (clonable) this.use('gone');
                    script = scoped(() => this.body(b.next, [...this.stopGuards(), ...(clonable ? ['_gone(self)'] : [])]));
                    if (script.length) script.unshift(...this.tokenLine());
                    if (script.length) flagScripts.push({script, clonable, sv, plain: !clonable && !this.tokened()});
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
                        script = plainBody();
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
                // ── Arcade event hats (E2: the import's arcade_when* words, back to their PXT calls) ──
                } else if (b.opcode === 'arcade_whenUpdate' || b.opcode === 'arcade_whenInterval') {
                    const period = b.opcode === 'arcade_whenInterval' ? this.literalNumber(b, 'PERIOD') : null;
                    const api = b.opcode === 'arcade_whenUpdate' ? 'game.onUpdate(' : `game.onUpdateInterval(${period}, `;
                    if (b.opcode === 'arcade_whenInterval' && (period === null || period <= 0)) {
                        handlers.push(`// ${this.note('Arcade interval period must be a fixed positive number')}`);
                    } else if (clonable) {
                        // A cloned sprite's hat runs in every instance, as the key hats
                        // do; its body speaks of \`self\`, which a plain handler lacks.
                        const {fn} = this.scriptFunction(b.opcode === 'arcade_whenUpdate' ? 'update' : 'interval', b, false);
                        this.use('wait');
                        handlers.push(`${api}function () {\n    const w = new _Wait()\n    for (const s of ${this.allOf(t.name)}) _spawnFor(w, ${fn}, s)\n})`);
                    } else {
                        handlers.push(`${api}function () {\n${plainBody().join('\n')}\n})`);
                    }
                } else if (b.opcode === 'arcade_whenSpriteCreated') {
                    const kind = this.kindExpr(b, 'KIND');
                    script = eventBody(['sprite'], this.literalInput(b, 'KIND'));
                    handlers.push(`sprites.onCreated(${kind}, function (sprite: Sprite) {\n${script.join('\n')}\n})`);
                } else if (b.opcode === 'arcade_whenSpriteDestroyed') {
                    const kind = this.kindExpr(b, 'KIND');
                    script = eventBody(['sprite']);
                    handlers.push(`sprites.onDestroyed(${kind}, function (sprite: Sprite) {\n${script.join('\n')}\n})`);
                } else if (b.opcode === 'arcade_whenRegisteredDestroyed' || Object.prototype.hasOwnProperty.call(REGISTERED_HAT_KINDS, b.opcode)) {
                    continue;                               // emitted where it is registered
                } else if (b.opcode === 'arcade_whenSpritesOverlap') {
                    const first = this.kindExpr(b, 'A');
                    const second = this.kindExpr(b, 'B');
                    script = eventBody(['sprite', 'otherSprite']);
                    handlers.push(`sprites.onOverlap(${first}, ${second}, function (sprite: Sprite, otherSprite: Sprite) {\n${script.join('\n')}\n})`);
                } else if (b.opcode === 'arcade_whenCountdownEnds') {
                    handlers.push(`info.onCountdownEnd(function () {\n${plainBody().join('\n')}\n})`);
                } else if (b.opcode === 'procedures_definition') {
                    const proto = this.block(b.inputs && b.inputs.custom_block && b.inputs.custom_block[1]);
                    if (!proto || !proto.mutation) continue;
                    const names = JSON.parse(proto.mutation.argumentnames || '[]').map(ident);
                    const key = `${t.isStage ? '' : t.name}:${proto.mutation.proccode}`;
                    const types = imageParameterTypes.get(key) || [];
                    const params = names.map((n, i) => `${n}: ${types[i] || 'any'}`);
                    // It runs in its caller's thread, so it checks the caller's run token.
                    if (this.tokened()) params.unshift('_t: number');
                    if (clonable) {
                        this.use('gone');
                        params.unshift('self: Sprite');
                    }
                    const saved = this.currentLocalNames;
                    this.currentLocalNames = new Set();
                    script = this.body(b.next, [...this.stopGuards(), ...(clonable ? ['_gone(self)'] : [])]);
                    const locals = [...this.currentLocalNames].filter(name => !names.includes(name));
                    this.currentLocalNames = saved;
                    const fn = this.fnNames.get(key);
                    // A procedure that returns a value (arcade_returnValue) is typed by
                    // what flows out of it; one that falls off its end returns undefined, as in PXT.
                    const returning = line => /^\s*return [^\s/]/.test(line);
                    const returns = script.some(returning);
                    const returnType = returns ? `: ${this.arrayReturnTypes.get(key) || (this.imageReturnFunctions.has(key) ? 'Image' :
                        this.spriteReturnFunctions.has(key) ? 'Sprite' : this.valueReturnTypes.get(key) || 'any')}` : '';
                    const tail = returns && !returning(script.at(-1) || '') ? ['    return undefined'] : [];
                    // A stop/clone guard exits with a bare \`return\`; in a function that
                    // returns a value PXT rejects that ("Not all code paths return a value").
                    const body = returns ? script.map(line => line.replace(/\breturn\s*$/, 'return undefined')) : script;
                    const lines = [...locals.map(name => this.localDeclaration(name, key)), ...body, ...tail];
                    functions.push(`function ${fn} (${params.join(', ')})${returnType} {\n${lines.join('\n')}\n}`);
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
        for (const token of this.registeredCallbackBlocks.keys()) {
            if (!this.usedRegisteredCallbacks.has(token)) this.note(`Arcade registered callback ${token} has no registration`);
        }
        for (const token of this.destroyedCallbacks.keys()) {
            if (!this.usedDestroyedCallbacks.has(token)) this.note(`Arcade sprite destruction callback ${token} has no registration`);
        }
        // Declarations: every variable the program touched, then the sprites.
        const decls = [...new Set(this.globals.values())];
        if (this.customSpriteKinds.size) {
            out.push('namespace SpriteKind {');
            for (const kind of this.customSpriteKinds) out.push(`    export const ${kind} = SpriteKind.create()`);
            out.push('}');
        }
        for (const n of decls) {
            const kinds = this.kinds.get(n) || new Set(['number']);
            // A variable given both text and numbers is `any` — Scratch's own
            // variables are untyped, and that is the honest translation.
            const arrayKind=[...kinds].find(kind=>kind.endsWith('[]'));
            const initial = this.initialGlobals.has(n) ? JSON.stringify(this.initialGlobals.get(n)) : '0';
            // Scratch's saved zero is a real initial value, even when the
            // script later assigns text or Boolean values. Keep both types.
            const initialScalarType = typeof this.initialGlobals.get(n);
            const mixedInitialScalar = this.initialGlobals.has(n) &&
                ['string', 'boolean', 'number'].some(kind => kinds.has(kind) && kind !== initialScalarType);
            out.push(arrayKind?`let ${n}: ${arrayKind} = null`:this.handleVars.has(n) ? `let ${n}: Sprite = null` :
                kinds.size > 1 || kinds.has('any') || mixedInitialScalar ? `let ${n}: any = ${initial}` : kinds.has('string') ? `let ${n} = ${this.initialGlobals.has(n) ? initial : '""'}` : kinds.has('boolean') ? `let ${n} = ${this.initialGlobals.has(n) ? initial : 'false'}` : kinds.has('scene.Scene') ? `let ${n}: scene.Scene = null` : kinds.has('ArcadePhysicsEngine') ? `let ${n}: ArcadePhysicsEngine = null` : kinds.has('animation.Animation') ? `let ${n}: animation.Animation = null` : kinds.has('tiles.Location') ? `let ${n}: tiles.Location = null` : kinds.has('image') ? `let ${n}: Image = null` : `let ${n} = ${initial}`);
        }
        if (this.usesAnimationResources) {
            const resources = [...this.authoredAnimationArrays.values()];
            for (const resource of resources) out.push(`let ${resource.variable}: Image[] = assets.animation\`${resource.nativeId}\``);
            out.push(`function ${this.animationFunctionNames.frames} (id: string): Image[] {\n${resources.map(resource =>
                `    if (id == ${JSON.stringify(resource.id)}) return ${resource.variable}`).join('\n')}\n    console.log("Animation resource unavailable: " + id)\n    return undefined\n}`);
            out.push(`function ${this.animationFunctionNames.fresh} (id: string): Image[] {\n${resources.map(resource =>
                `    if (id == ${JSON.stringify(resource.id)}) return assets.animation\`${resource.nativeId}\``).join('\n')}\n    console.log("Animation resource unavailable: " + id)\n    return undefined\n}`);
            out.push(`function ${this.animationFunctionNames.interval} (id: string): number {\n${resources.map(resource =>
                `    if (id == ${JSON.stringify(resource.id)}) return ${resource.frames[0].durationMs}`).join('\n')}\n    console.log("Animation resource unavailable: " + id)\n    return undefined\n}`);
        }
        for (const {name, frames} of [...this.frameArrays.values(), ...this.sharedImageArrays.values()]) {
            out.push(`let ${name}: Image[] = [${frames.map(frame => toImgLiteral(frame)).join(', ')}]`);
        }
        for (const [n, items] of this.lists) {
            const lit = items.map(x => (typeof x === 'number' || (String(x).trim() !== '' && Number.isFinite(Number(x))) ?
                String(Number(x)) : JSON.stringify(String(x))));
            out.push(`let ${n}: any[] = [${lit.join(', ')}]`);
        }
        for(const variable of this.namedArrays.values())out.push(`let ${variable}: any[] = null`);
        for(const helper of this.legacyValueHelpers.values())out.push(helper.source);
        if (this.usedNa) out.push('let _na = 0  // stands in for values with no Arcade counterpart (see comments)');
        if (this.usesPen) out.push('_penInit()');
        const penColour = nearestIndex([0, 0, 255], this.palette);      // Scratch's pen starts blue
        for (const t of this.sprites) {
            if (t === this.importedBackgroundTarget) continue;
            if (this.templateNames.has(t.name) || (this.hasHandles && t.name === 'Game')) continue;
            // The importer uses Game as a home for program-level scripts even
            // when the source creates no sprite. Do not invent an Arcade sprite
            // or require artwork for that target when its blocks never use self.
            if (this.isScriptHost(t)) continue;
            const s = this.spriteVar.get(t.name);
            this.emittedSprites.add(t);
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
        for (const t of this.stopOthers) {
            if (this.isClonable(t)) continue;
            const [mark, kept] = this.stopMarks(t);
            pre.push(`let ${mark} = 0  // stop other scripts in ${t.isStage ? 'stage' : t.name}: runs up to here are ended`);
            pre.push(`let ${kept} = 0  // ... except this one, the run that stopped them`);
        }
        if (this.usesStopAll) {
            // Scratch's Runtime.stopAll: every script ends, clones are deleted,
            // sounds stop, speech bubbles clear. The sprites, the pen, the
            // variables and the game loop stay — so hats still start scripts.
            generated.push([
                'function _stopAll () {',
                '    _stopMark = _tokens',
                ...[...this.clonable].map(name => `    sprites.destroyAllSpritesOfKind(${this.kindOf(name)})`),
                '    music.stopAllSounds()',
                ...(this.usesSay ? this.sprites.filter(t => this.emittedSprites.has(t)).map(t => `    ${this.spriteVar.get(t.name)}.sayText("")`) : []),
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
            if (!nativeArcade) out.push(this.stageMatte());
            out.push('scene.setBackgroundImage(_backdrops[_bd])');
        } else if (stage && this.opts.stageBackground) {
            const bg = this.opts.stageBackground(stage);
            if (bg) {
                if (!nativeArcade) out.push(this.stageMatte());
                out.push(`scene.setBackgroundImage(${toImgLiteral(bg)})`);
            }
        }
        // The green flag's scripts run side by side. An imported Arcade program
        // (one flag script, nothing that can stop it) is its own startup code, run
        // in place, so it keeps PXT's order: what it creates exists before the
        // first frame. It becomes a function when it declares locals or returns.
        let startup;
        if (this.arcadeValues && flagScripts.length === 1 && flagScripts[0].plain) {
            const lines = flagScripts[0].script;
            if (lines.some(line => /^\s*(let |const |return\b)|\breturn$/.test(line))) {
                let name = '__bwStartup';
                const occupied = new Set([...this.globals.values(), ...this.fnNames.values(), ...this.spriteVar.values(), ...this.artVar.values()]);
                while (occupied.has(name)) name += '_';
                functions.push(`function ${name} () {\n${lines.join('\n')}\n}`);
                startup = [`${name}()`];
            } else {
                startup = lines;
            }
        } else {
            startup = flagScripts.map(({script, clonable, sv}) =>
                `control.runInParallel(function () {\n${clonable ? `    const self = ${sv}\n` : ''}${script.join('\n')}\n})`);
        }
        return [...helperSource(this.helpers), ...[...this.valueOperationHelpers.values()].map(helper => helper.source),
            ...pre, ...generated, ...this.generated, ...functions, ...out, ...handlers, ...startup].join('\n') + '\n';
    }
}

/**
 * @param {object} project a Scratch project JSON (vm.toJSON() / SB3Creator's shape)
 * @param {object} [opts]
 * @param {(target, costume) => string|null} [opts.costumeSvg] the costume's SVG text, if it is an SVG
 * @param {(target, costume) => {rgba, width, height}|null} [opts.costumeRgba] its pixels, for anything else
 * @param {(target, costume) => Array<string|null>|null} [opts.costumePalette] editable palette, if any
 * @param {Array<object>} [opts.animationDocuments] full published Pixel timeline source documents
 * @param {(stage) => object|null} [opts.stageBackground] a 160x120 palette image for the backdrop
 * @returns {{ts: string, files: object, unsupported: string[], warnings: string[]}}
 */
export function projectToArcade (project, opts = {}) {
    const e = new ArcadeEmitter(project, opts);
    const ts = e.emit();
    // Publish unused assets as well, without introducing unused main-code helpers.
    e.prepareAuthoredAnimations();
    const resources = [...e.authoredAnimationArrays.values()];
    const assetFiles = resources.length ? {
        'images.g.jres': `${JSON.stringify(Object.fromEntries(resources.map(resource =>
            [`myAnimations.${resource.nativeId}`, resource.nativeEntry])), null, 4)}\n`,
        'images.g.ts': `namespace ${e.animationFactoryNamespace} {\n    helpers._registerFactory("animation", function (name: string) {\n        switch (helpers.stringTrim(name)) {\n${resources.map(resource => [...new Set([resource.name, resource.nativeId])].map(alias =>
            `            case ${JSON.stringify(alias)}:`).join('\n') +
            `\n                return [${resource.literals.join(',\n')}]`).join('\n')}\n        }\n        return null\n    })\n}\n`
    } : {};
    const sourceEntries = [];
    for (const resource of resources) {
        try { validateDocument(resource.document); }
        catch (error) {
            // The public behaviour exporter also accepts normalized frame-only
            // inputs. They are not complete, editable artwork documents.
            e.warn(`Animation "${resource.name}" rich source not exported: ${error.message}`);
            continue;
        }
        sourceEntries.push({nativeId: resource.nativeEntry.namespace ?
            `${resource.nativeEntry.namespace}.${resource.nativeEntry.id}` : resource.nativeEntry.id,
        document: resource.document, nativeEntry: resource.nativeEntry});
    }
    if (sourceEntries.length) assetFiles[ANIMATION_COMPANION_PATH] = encodeAnimationCompanion(sourceEntries, e.palette);
    const name = opts.name || 'brickwright-game';
    const files = {
        'main.ts': ts,
        ...assetFiles,
        'pxt.json': `${JSON.stringify({
            name, description: 'Exported from BrickWright', dependencies: {device: '*', ...(e.requiresAnimationPackage ? {animation: '*'} : {})},
            files: [...Object.keys(assetFiles), 'main.ts'], preferredEditor: 'tsprj',
            ...(!samePalette(e.palette, ARCADE_PALETTE) ? {palette: ['#000000', ...e.palette.slice(1)]} : {})
        }, null, 4)}\n`
    };
    return {ts, files, unsupported: e.unsupported, warnings: e.warnings};
}

/** Re-exported for callers that build a background from pixels. */
export {imageToSvg};
