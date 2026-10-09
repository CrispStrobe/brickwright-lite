import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {EventEmitter} from 'node:events';
import {loadExtensionClass} from './helpers/bw-extensions.mjs';
import {readFileSync} from 'node:fs';
import {ARCADE_PALETTE, pixelsToSvg, svgToPixels} from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import {parseExactImgLiteral} from '../overlay/scratch-gui/src/lib/bw-makecode/arcade-assets.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import JSZip from 'jszip';
import {compile} from '../scripts/lib/pxt-node.mjs';
import SB3Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {scopeAfter} from './helpers/js-scope.mjs';
import * as pixels from '../overlay/scratch-gui/src/lib/bw-makecode/pixel-image.js';
import * as layers from '../overlay/scratch-gui/src/lib/bw-pixel-layers.js';
import {getCostumeDocument} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';
const require = createRequire(import.meta.url);
const engine = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image.js')(
    ARCADE_PALETTE, require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/image-pxt.js'));
const palette = [...ARCADE_PALETTE];
palette[1] = '#123456'; palette[2] = '#123456'; palette[3] = '#000000';
const art = {width: 4, height: 2, pixels: Uint8Array.from([0, 1, 2, 3, 15, 2, 1, 0]), palette};
const decodeNative = svg => engine.decode({asset: {data: svg}}, art);

test('graphics and native readers preserve duplicate colors, opaque black and transparent index zero', () => {
    for (const scale of [1, 3, 4, 8]) {
        const svg = pixelsToSvg(art, {scale});
        const graphic = svgToPixels(svg), native = decodeNative(svg);
        assert.deepEqual(graphic.pixels, art.pixels);
        assert.deepEqual(graphic.palette, palette);
        assert.equal(graphic.scale, scale);
        assert.deepEqual(native, art);
        assert.deepEqual(svgToPixels(pixelsToSvg(graphic, {scale})), graphic);
    }
    assert.deepEqual(decodeNative(engine.svg(art)), art, 'native emitted images retain source palette');
});

test('readers reject stale, incomplete and malformed palette/index metadata', () => {
    const svg = pixelsToSvg(art);
    for (const damaged of [
        svg.replace('data-bw-color-index="1"', 'data-bw-color-index="3"'),
        svg.replace('data-bw-color-index="1"', 'data-bw-color-index="0"'),
        svg.replace('data-bw-color-index="1"', 'data-bw-color-index="16"'),
        svg.replace('data-bw-color-index="1"', 'data-bw-color-index="01"'),
        svg.replace(' data-bw-color-index="1"', ''),
        svg.replace('data-bw-palette="#123456,', 'data-bw-palette="'),
        svg.replace('data-bw-palette="#123456', 'data-bw-palette="#oops'),
        svg.replace('data-bw-pixel-scale="4"', 'data-bw-pixel-scale="3"'),
        svg.replace('<rect x="4"', '<rect x="400"')
    ]) {
        assert.equal(svgToPixels(damaged), null);
        assert.equal(decodeNative(damaged), null);
    }
    assert.throws(() => pixelsToSvg(art, {palette: palette.slice(1)}), /Invalid Arcade image palette/);
});

test('legacy default SVG remains byte compatible and decodes without a custom palette', () => {
    const image = {width: 1, height: 1, pixels: Uint8Array.of(2)};
    const svg = pixelsToSvg(image);
    assert.equal(svg, '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4" viewBox="0 0 4 4" shape-rendering="crispEdges" data-bw-pixel-scale="4"><rect x="0" y="0" width="4" height="4" fill="#ff2121"/></svg>');
    assert.deepEqual(engine.decode({asset: {data: svg}}, image), image);
    assert.equal(svgToPixels(svg).palette, undefined);
});

test('actual graphics editor opens custom indexed SVG with its original palette and no raster conversion', async () => {
    const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pixel-art-editor.jsx', import.meta.url), 'utf8');
    const bindings = {...pixels, ...layers, getCostumeDocument,
        rasterize: () => { throw new Error('exact indexed artwork must not be rasterized'); }};
    const load = new Function(...Object.keys(bindings), `return async function(size) ${scopeAfter(source, 'async load (size) {')}`)(...Object.values(bindings));
    const costume = {name: 'Custom', asset: {dataFormat: 'svg', decodeText: () => pixelsToSvg(art)}};
    const editor = {props: {vm: {editingTarget: {isStage: false}}}, state: {}, costume: () => costume,
        setState(patch) { Object.assign(this.state, patch); }};
    await load.call(editor);
    assert.deepEqual(editor.state.palette, palette);
    assert.deepEqual(editor.state.image.pixels, art.pixels);
    assert.equal(editor.state.converted, false);
});

test('Arcade export discovers embedded palette and preserves indices without a separate palette callback', () => {
    const creator = new SB3Creator();
    creator.parse('SPRITE gem:\nWHEN flag clicked:\n  wait 1 seconds\n');
    creator.applyCustomSVG('gem', pixelsToSvg(art));
    const exported = projectToArcade(creator.project, {
        costumeSvg: (target, costume) => creator.assets.get(costume.assetId)?.data
    });
    assert.deepEqual(JSON.parse(exported.files['pxt.json']).palette, ['#000000', ...palette.slice(1)]);
    const literal = /sprites\.create\((img`[\s\S]*?`)/.exec(exported.ts);
    assert.ok(literal);
    assert.deepEqual(parseExactImgLiteral(literal[1]).pixels, art.pixels);
    assert.deepEqual(exported.unsupported, []);
    assert.deepEqual(exported.warnings, []);
});


test('saved SB3 custom artwork exports to a project accepted by the original Arcade compiler', async () => {
    const creator = new SB3Creator();
    creator.parse('SPRITE gem:\nWHEN flag clicked:\n  wait 1 seconds\n');
    creator.applyCustomSVG('gem', pixelsToSvg(art));
    const saved = await creator.generateSB3();
    const zip = await JSZip.loadAsync(await saved.arrayBuffer());
    const project = JSON.parse(await zip.file('project.json').async('text'));
    const costume = project.targets[1].costumes[0];
    const svg = await zip.file(costume.md5ext).async('text');
    assert.deepEqual(svgToPixels(svg).pixels, art.pixels);
    const exported = projectToArcade(project, {costumeSvg: (target, candidate) =>
        candidate.md5ext === costume.md5ext ? svg : null});
    assert.deepEqual(JSON.parse(exported.files['pxt.json']).palette, ['#000000', ...palette.slice(1)]);
    assert.deepEqual(exported.unsupported, []);
    const built = await compile('arcade', exported.files);
    assert.equal(built.success, true, JSON.stringify(built.diagnostics));
});


test('native template sprite retains custom indices and renderer colors after mutable image operations', () => {
    const runtime = new EventEmitter();
    runtime.startHats = () => []; runtime.requestRedraw = () => {};
    const skins = new Map(); let nextSkin = 0;
    runtime.renderer = {createSVGSkin(svg) { const id = ++nextSkin; skins.set(id, svg); return id; },
        updateSVGSkin(id, svg) { skins.set(id, svg); }, updateDrawableSkinId() {}, destroySkin(id) { skins.delete(id); }};
    const costume = {asset: {data: pixelsToSvg(art)}, dataFormat: 'svg', rotationCenterX: 8, rotationCenterY: 4};
    runtime.getSpriteTargetByName = () => ({makeClone: () => ({drawableID: 1, currentCostume: 0,
        getCostumes: () => [costume], setVisible() {}, setXY() {}, setSize() {}, setCostume() {}})});
    runtime.addTarget = () => {};
    const Arcade = loadExtensionClass('arcade');
    const extension = new Arcade(runtime);
    const id = extension.spawnSprite({TEMPLATE: 'gem', KIND: 'Player', X: 80, Y: 60, WIDTH: 4, HEIGHT: 2});
    assert.equal(extension.spritePixel({ID: id, X: 1, Y: 0}), 1);
    assert.deepEqual(extension._sprite(id).image.pixels, art.pixels);
    assert.deepEqual(extension._sprite(id).image.palette, palette);
    extension.mutateSpriteImage({ID: id, OP: 'replace', COLOR: 1, TO: 5});
    const changed = Uint8Array.from(art.pixels, index => index === 1 ? 5 : index);
    assert.deepEqual(extension._sprite(id).image.pixels, changed, 'index 2 survives even though it has the same RGB as index 1');
    const rendered = [...skins.values()].at(-1);
    assert.match(rendered, /#fff609/);
    assert.match(rendered, /#123456/);
    assert.match(rendered, /#000000/);
});


test('custom indexed Stage artwork also determines the exported project palette', () => {
    const creator = new SB3Creator();
    creator.parse('DEVICE ARCADE\nBACKDROP art\nWHEN flag clicked:\n  switch backdrop to "art"\n');
    const stage = creator.project.targets.find(target => target.isStage);
    const svg = pixelsToSvg(art);
    const exported = projectToArcade(creator.project, {
        costumeSvg: target => target === stage ? svg : null
    });
    assert.deepEqual(JSON.parse(exported.files['pxt.json']).palette, ['#000000', ...palette.slice(1)]);
    assert.match(exported.ts, /\. 1 2 3/);
});
