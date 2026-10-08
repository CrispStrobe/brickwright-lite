/**
 * A Scratch project -> MakeCode Arcade (lib/bw-makecode/export-arcade.js).
 *
 * The contract, checked on real programs: every one of lite's 38 Scratch game
 * examples, and every Arcade game a real MakeCode file imports into, exports to
 * TypeScript that MakeCode's OWN Arcade compiler accepts (measured 42/42 on
 * 2026-09-25, after two defects the first run found: variables given text were
 * declared as numbers, and a placeholder literal 0 tripped Static TypeScript's
 * literal narrowing). What has no Arcade counterpart is NAMED, never dropped.
 * The unit cases pin the model mapping: coordinates, keys, touching, costumes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {pixelsToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {ARCADE_PALETTE, parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {importArtefact, importProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {default: SB3Creator} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator.js'));
const games = (await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/sb3-creator-game-examples.js'))).default;

const exportOf = (src, uploads = []) => {
    const cr = new SB3Creator();
    cr.parse(src);
    for (const u of uploads) (u.mode === 'add' ? cr.addCustomSVGCostume(u.sprite, u.svg, u.name) : cr.applyCustomSVG(u.sprite, u.svg));
    return projectToArcade(cr.project, {costumeSvg: (t, c) => {
        const a = cr.assets.get(c.assetId);
        return a && a.type === 'svg' ? a.data : null;
    }, soundData: (t, s) => cr.assets.get(s.assetId)?.data || null});
};

test('the model mapping: coordinates, keys, touching', () => {
    const {ts, unsupported} = exportOf(`SPRITE hero:
WHEN flag clicked:
  go to x: 30 y: -60
  FOREVER:
    IF touching enemy THEN:
      change y by 30
WHEN right arrow key pressed:
  change x by 6

SPRITE enemy:
WHEN flag clicked:
  set x to 90
`);
    assert.match(ts, /heroSprite\.setPosition\(30 \/ 3 \+ 80, 60 - -60 \/ 3\)/, 'Scratch 30,-60 is Arcade 90,80');
    assert.match(ts, /heroSprite\.overlapsWith\(enemySprite\)/);
    assert.match(ts, /heroSprite\.y -= 30 \/ 3/, 'y up in Scratch is y down in Arcade');
    assert.match(ts, /controller\.right\.onEvent\(ControllerButtonEvent\.Pressed, function \(\) \{\n\s+heroSprite\.x \+= 6 \/ 3/);
    assert.match(ts, /enemySprite\.x = 90 \/ 3 \+ 80/);
    assert.deepEqual(unsupported, []);
});

test('a pixel-art costume becomes the sprite\'s image exactly', () => {
    const art = parseImageLiteral('. 2 2 .\n2 5 5 2\n. 2 2 .');
    const {ts} = exportOf('SPRITE gem:\nWHEN flag clicked:\n  wait 1 seconds\n', [{sprite: 'gem', svg: pixelsToSvg(art), mode: 'replace'}]);
    assert.match(ts, /sprites\.create\(img`\n\s+\. 2 2 \.\n\s+2 5 5 2\n\s+\. 2 2 \.\n`, SpriteKind\.Player\)/);
});

test('a custom palette keeps image indices and is written into Arcade project settings', () => {
    const cr = new SB3Creator();
    cr.parse('SPRITE gem:\nWHEN flag clicked:\n  wait 1 seconds\n');
    const image = parseImageLiteral('. 2 .\n2 2 2');
    const palette = [...ARCADE_PALETTE];
    palette[2] = '#123456';
    cr.applyCustomSVG('gem', pixelsToSvg(image, {palette}));
    const out = projectToArcade(cr.project, {
        costumeSvg: (target, costume) => cr.assets.get(costume.assetId)?.data || null,
        costumePalette: () => palette
    });
    assert.match(out.ts, /img`\n\s+\. 2 \.\n\s+2 2 2\n`/);
    assert.equal(JSON.parse(out.files['pxt.json']).palette[2], '#123456');
    assert.deepEqual(out.warnings, []);
});

test('the CLI reads version 2 and animated version 3 palettes for exact Arcade img export', async () => {
    const cr = new SB3Creator();
    cr.parse('SPRITE gem:\nWHEN flag clicked:\n  wait 1 seconds\n');
    const image = parseImageLiteral('. 2 .\n2 2 2');
    const palette = [...ARCADE_PALETTE];
    palette[2] = '#123456';
    const svg = pixelsToSvg(image, {palette});
    cr.applyCustomSVG('gem', svg);
    const costume = cr.project.targets[1].costumes[0];
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(cr.project));
    zip.file(costume.md5ext, svg);
    const layers = [{id: 'pixels', type: 'pixel',
                name: 'Pixels', visible: true, locked: false, opacity: 1,
                content: {kind: 'pixels', value: {width: 3, height: 2, pixels: [...image.pixels]}}}];
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bw-arcade-palette-'));
    const input = path.join(directory, 'custom.sb3');
    const output = path.join(directory, 'custom.ts');
    try {
        for (const version of [2, 3]) {
            const document = {version, palette, pixelScale: 4, activeLayerId: 'pixels', layers,
                ...(version === 3 ? {animation: {activeFrameId: 'two', frames: [
                    {id: 'one', durationMs: 100, activeLayerId: 'pixels', layers},
                    {id: 'two', durationMs: 100, activeLayerId: 'pixels', layers}]}} : {})};
            zip.file('brickwright/artwork/v1.json', JSON.stringify({format: 'brickwright-artwork', version,
                costumes: [{targetIndex: 1, costumeIndex: 0, renderedMd5ext: costume.md5ext, document}]}));
            fs.writeFileSync(input, await zip.generateAsync({type: 'nodebuffer'}));
            const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/makecode.mjs'),
                'to-ts', input, '-o', output, '--target', 'arcade'], {encoding: 'utf8'});
            assert.equal(result.status, 0, result.stderr);
            assert.match(fs.readFileSync(output, 'utf8'), /img`\n\s+\. 2 \.\n\s+2 2 2\n`/);
        }
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});

test('what has no Arcade counterpart is named and left as a comment where it stood', () => {
    // (Backdrops were the example here until they were mapped — task A4; the
    // mapped constructs are held by test/makecode-export-arcade-constructs.)
    const {ts, unsupported} = exportOf('SPRITE s:\nWHEN flag clicked:\n  think hmm\n  wait 1 seconds\n');
    assert.ok(unsupported.some(u => /looks_think/.test(u)), JSON.stringify(unsupported));
    assert.match(ts, /\/\/ looks_think/);
});

// ── Round-trip shapes MakeCode rejected (task F5 of docs/OPEN-TASKS-2026-09-29.md) ──
const F5_SOURCES = {
    // A value-returning function in a game that also stops: its stop guard
    // was a bare \`return\` ("Not all code paths return a value").
    'returning function with a stop guard': [
        'function make (): Sprite {',
        '    let enemy = sprites.create(img`1`, SpriteKind.Enemy)',
        '    place(enemy, 10)',
        '    enemy.vy = 10',
        '    return enemy',
        '}',
        'function place (s: Sprite, edge: number) {',
        '    s.x = randint(edge, 160 - edge)',
        '}',
        'let foe = make()',
        'info.onLifeZero(function () {',
        '    game.gameOver(false)',
        '})'
    ].join('\n'),
    // A sprite created in an interval hat is cloned there; the hat's body
    // spoke of \`self\`, which a plain onUpdateInterval handler lacks.
    'interval hat of a cloned sprite': [
        'let iceSprite: Sprite = null',
        'game.onUpdateInterval(1000, function () {',
        // Art from an extension package we do not carry keeps the older
        // cloned-sprite translation (corpus arcade-a03d93d1…).
        '    iceSprite = sprites.create(lab2imgs.icecube, SpriteKind.Enemy)',
        '    iceSprite.setPosition(randint(8, 152), 0)',
        '})'
    ].join('\n'),
    // A typed empty array on the fixed-sprite path became a named list, while
    // \`.length\` / \`.push\` read an unset reference variable (a number).
    'named array read by length': [
        'let frameNum = 0',
        'let frameList: Image[] = []',
        'game.onUpdateInterval(500, function () {',
        '    frameNum += 1',
        '    if (frameNum >= frameList.length) {',
        '        frameNum = 0',
        '    }',
        '})'
    ].join('\n')
};

test('the F5 shapes export without a bare return, a free self, or a list read as a number', () => {
    const exported = Object.fromEntries(Object.entries(F5_SOURCES).map(([id, src]) => {
        const r = importProjectFiles({'main.ts': src, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})},
            {target: 'arcade', name: id});
        return [id, {code: r.code, ts: exportOf(r.code, r.costumes || []).ts}];
    }));
    const returning = exported['returning function with a stop guard'].ts;
    for (const fn of returning.split(/\nfunction /).filter(f => /^\S+ \([^)]*\): \w+ \{/.test(f))) {
        assert.doesNotMatch(fn, /\breturn\s*$/m, `a bare return in a value-returning function:\n${fn}`);
    }
    const interval = exported['interval hat of a cloned sprite'].ts;
    assert.match(interval, /game\.onUpdateInterval\(1000, function \(\) \{\n {4}const w = new _Wait\(\)\n {4}for \(const s of _all_iceSprite\(\)\) _spawnFor\(w, /);
    assert.match(exported['interval hat of a cloned sprite'].code, /\(pick random 8 to 152\) - 80/);
    const named = exported['named array read by length'];
    assert.match(named.code, /length of array reference \(frameList\)/);
    assert.doesNotMatch(named.code, /length of array "frameList"/);
});

// ── MakeCode's own compiler, over the whole corpus ─────────────────────────
const STATIC = path.join(ROOT, 'packages/scratch-gui/static/makecode/arcade');
const skip = fs.existsSync(path.join(STATIC, 'pxtworker.js')) ? false : 'MakeCode runtime not synced (npm run sync:makecode) — pxt compiler absent';

test('every lite game and every imported Arcade game exports to TypeScript MakeCode\'s compiler accepts', {skip, timeout: 1200000}, async () => {
    const {PXT_GLUE_JS} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/pxt-runtime.js'));
    const sb = {setTimeout, clearTimeout, setInterval, clearInterval, setImmediate, clearImmediate,
        TextEncoder: util.TextEncoder, TextDecoder: util.TextDecoder, Buffer,
        console: {log () {}, debug () {}, info () {}, warn () {}, error () {}},
        pxtTargetBundle: JSON.parse(fs.readFileSync(path.join(STATIC, 'target.json'), 'utf8'))};
    sb.global = sb;
    sb.self = sb;
    sb.eval = src => vm.runInContext(src, sb, {filename: 'eval'});
    vm.createContext(sb, {codeGeneration: {strings: false, wasm: false}});
    vm.runInContext(fs.readFileSync(path.join(STATIC, 'pxtworker.js'), 'utf8'), sb, {filename: 'pxtworker.js'});
    vm.runInContext(PXT_GLUE_JS, sb, {filename: 'pxt-glue.js'});
    const corpus = Object.entries(games).map(([id, src]) => ({id, src: String(src), uploads: []}));
    for (const f of ['arcade-assets.hex', 'arcade-tilemap.hex', 'arcade-umlaut.hex', 'arcade-shield.hex']) {
        const r = await importArtefact(new Uint8Array(fs.readFileSync(path.join(ROOT, 'test/fixtures/makecode', f))), {name: f});
        corpus.push({id: f, src: r.code, uploads: r.costumes || []});
    }
    // Shapes the corpus audit found MakeCode rejecting after a round trip (F5).
    for (const [id, src] of Object.entries(F5_SOURCES)) {
        const r = importProjectFiles({'main.ts': src, 'pxt.json': JSON.stringify({dependencies: {device: '*'}, files: ['main.ts']})},
            {target: 'arcade', name: id});
        corpus.push({id, src: r.code, uploads: r.costumes || []});
    }
    assert.ok(corpus.length >= 40, `only ${corpus.length} programs`);
    const failed = [];
    for (const c of corpus) {
        const ex = exportOf(c.src, c.uploads);
        const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(ex.files, {})));
        if (!r.success) failed.push(`${c.id}: ${(r.diagnostics[0] || {}).message}`);
    }
    assert.deepEqual(failed, []);
});

test('Arcade maths keeps every argument both ways (min/max/pow kept only the first; abs of a - b was |a| - b)', async () => {
    const {arcadeToPseudocode} = await import(path.join(ROOT, 'overlay/scratch-gui/src/lib/bw-makecode/arcade-translate.js'));
    const {code, unsupported} = arcadeToPseudocode([
        'let a = 0',
        'let b = 0',
        'a = Math.max(0, b - 1)',
        'b = Math.min(a, 10)',
        'a = Math.pow(2, b)',
        'b = Math.abs(a - b)',
        'a = Math.map(b, 0, 10, 0, 100)'
    ].join('\n'));
    // Since task E1 the import writes MakeCode arithmetic through the value
    // words (`calculate value … op "-"`: JavaScript's rules), still with every
    // argument kept.
    assert.match(code, /set a to \(max of 0 and \(calculate value \(b\) op "-" with \(\(0 \+ \(1\)\)\)\)\)/);
    assert.match(code, /set b to \(min of a and 10\)/);
    assert.match(code, /set a to \(2 to the power of b\)/);
    assert.match(code, /set b to \(abs of \(calculate value \(a\) op "-" with \(b\)\)\)/);
    // No map reporter off the micro:bit: its definition, and said.
    assert.match(code, /set a to \(\(\(b - 0\) \* \(100 - 0\) \/ \(10 - 0\) \+ 0\)\)/);
    assert.ok(unsupported.some(u => /Math\.map\(\) — written out as its formula/.test(u)), unsupported.join('\n'));
    // The way back from the import's own words (task E2): the value words
    // export as JavaScript's operators (a helper per operator); min and max
    // keep the blocks' Scratch casts (a helper), power is Math.pow; every
    // argument kept, nothing refused.
    const back = exportOf(code);
    assert.deepEqual(back.unsupported, []);
    for (const call of [/__bwScratchMax\(0, __bwBinarySubtract\(b, \(0 \+ 1\)\)\)/, /__bwScratchMin\(a, 10\)/, /Math\.pow\(2, b\)/,
        /Math\.abs\(__bwBinarySubtract\(a, b\)\)/, /function __bwBinarySubtract\(left: any, right: any\): number \{ return left - right \}/]) {
        assert.match(back.ts, call);
    }
    // And from the same maths written as Scratch arithmetic.
    const {ts} = exportOf(`SPRITE s:\nWHEN flag clicked:\n${[
        'set a to max of 0 and (b - 1)', 'set b to min of a and 10', 'set a to 2 to the power of b',
        'set b to abs of (a - b)'].map(l => `  ${l}`).join('\n')}\n`);
    // (the export prefixes a sprite's variables with its name)
    for (const call of [/Math\.max\(0, \(\w*b - 1\)\)/, /Math\.min\(\w*a, 10\)/, /Math\.pow\(2, \w*b\)/,
        /Math\.abs\(\(\w*a - \w*b\)\)/]) {
        assert.match(ts, call);
    }
});

// ── What Lite's own export carries comes back as itself (task F8) ───────────
test('stop blocks and not survive export and re-import, without the run-token machinery', () => {
    const src = [
        'DEVICE ARCADE',
        'SPRITE Game:',
        'WHEN flag clicked:',
        '  set n to 0',
        '  REPEAT UNTIL not (n < 10):',
        '    change n by 1',
        '  stop other scripts in sprite',
        '  IF n > 5 THEN:',
        '    stop all',
        'WHEN flag clicked:',
        '  FOREVER:',
        '    change m by 1',
        ''
    ].join('\n');
    const {files} = exportOf(src);
    assert.match(files['main.ts'], /function _stopAll \(\)/);
    const back = importProjectFiles(files, {target: 'arcade', name: 'rt'});
    assert.doesNotMatch(back.code, /_tok|_dead|_stopAll|_stopMark|_som_|_sok_/, back.code);
    assert.match(back.code, /^\s*stop all$/m);
    assert.match(back.code, /^\s*stop other scripts in sprite$/m);
    assert.match(back.code, /REPEAT UNTIL not \(/);
    assert.doesNotMatch(back.code, /op "===" with \(\(compare value \(1\) op "<" with \(0\)\)\)/, 'a condition came back as a value comparison');
});
