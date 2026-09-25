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
import path from 'node:path';
import vm from 'node:vm';
import util from 'node:util';
import {fileURLToPath} from 'node:url';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {pixelsToSvg} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {parseImageLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {importArtefact} from '../overlay/scratch-gui/src/lib/bw-makecode/index.js';

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
    }});
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

test('what has no Arcade counterpart is named and left as a comment where it stood', () => {
    const {ts, unsupported} = exportOf('SPRITE s:\nWHEN flag clicked:\n  switch backdrop to night\n  wait 1 seconds\n');
    assert.ok(unsupported.some(u => /backdrop/.test(u)), JSON.stringify(unsupported));
    assert.match(ts, /\/\/ looks_switchbackdropto/);
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
    assert.ok(corpus.length >= 40, `only ${corpus.length} programs`);
    const failed = [];
    for (const c of corpus) {
        const ex = exportOf(c.src, c.uploads);
        const r = JSON.parse(JSON.stringify(await sb.bwMakeCode.compile(ex.files, {})));
        if (!r.success) failed.push(`${c.id}: ${(r.diagnostics[0] || {}).message}`);
    }
    assert.deepEqual(failed, []);
});
