import test from 'node:test';
import assert from 'node:assert/strict';
import {captureCodeArtwork, codeArtworkMatches, retainCodeArtwork} from '../overlay/scratch-gui/src/lib/bw-code-artwork.js';
import {ARTWORK_PATH, setCostumeDocument, applyArtwork, getCostumeDocument} from '../overlay/scratch-gui/src/lib/bw-artwork-bundle.js';

const clone = value => JSON.parse(JSON.stringify(value));
const costume = (id, name, format = 'svg') => ({assetId: id, md5ext: `${id}.${format}`, dataFormat: format,
    name, bitmapResolution: format === 'png' ? 2 : 1, rotationCenterX: 3.25, rotationCenterY: -2,
    asset: {assetId: id, dataFormat: format, data: new Uint8Array([3, 9, 1, 4])}});
const setup = () => {
    const stage = {isStage: true, isOriginal: true, currentCostume: 1,
        sprite: {costumes: [costume('background', 'Backdrop'), costume('night', 'Night', 'png')]}};
    const actor = {isStage: false, isOriginal: true, name: 'Actor', currentCostume: 1,
        sprite: {costumes: [costume('actor', 'painted'), costume('walk', 'Walk', 'png')]}};
    const vm = {runtime: {targets: [stage, actor]}};
    const declarations = {targets: [{isStage: true, name: 'Stage', currentCostume: 0,
        costumes: [{name: 'backdrop1'}, {name: 'Night'}]}, {isStage: false, name: 'Actor', currentCostume: 0,
        costumes: [{name: 'costume1'}, {name: 'Walk'}]}]};
    const files = new Map(); const zip = {file: (key, value) => {files.set(key, value);}};
    return {stage, actor, vm, declarations, zip, files, context: captureCodeArtwork(vm, declarations)};
};
const animatedDocument = () => {
    const layers = [{id: 'pixels', type: 'pixel', name: 'Pixels', visible: true, locked: false,
        opacity: 1, content: {kind: 'pixels', value: {width: 1, height: 1, pixels: [2]}}}];
    return {version: 3, pixelScale: 8,
        palette: [null, ...Array.from({length: 15}, (_, i) => `#${(i + 1).toString(16).padStart(6, '0')}`)],
        activeLayerId: 'pixels', layers, animation: {activeFrameId: 'one', frames: [
            {id: 'one', name: 'Start', durationMs: 123, activeLayerId: 'pixels', layers: clone(layers)},
            {id: 'two', name: 'End', durationMs: 456, activeLayerId: 'pixels', layers: clone(layers)}]}};
};

test('Code handoff reads fresh exact PNG/SVG assets, centers, names, current costume and animation source', () => {
    const s = setup();
    // Edit after From blocks. The handoff must read this current asset, not its old SVG upload.
    s.actor.sprite.costumes[0].asset.data = new Uint8Array([8, 6, 7, 5, 3, 0, 9]);
    const document = animatedDocument();
    setCostumeDocument(s.actor.sprite.costumes[0], document);
    const project = clone(s.declarations);
    assert.equal(retainCodeArtwork(s.zip, project, s.vm, s.context), true);
    assert.deepEqual(s.files.get('actor.svg'), new Uint8Array([8, 6, 7, 5, 3, 0, 9]));
    assert.deepEqual(s.files.get('night.png'), s.stage.sprite.costumes[1].asset.data);
    assert.equal(project.targets[1].costumes[0].name, 'painted');
    assert.equal(project.targets[1].costumes[0].rotationCenterX, 3.25);
    assert.equal(project.targets[1].costumes[0].rotationCenterY, -2);
    assert.equal(project.targets[0].costumes[1].bitmapResolution, 2);
    assert.equal(project.targets[1].currentCostume, 1);
    assert.equal(project.targets[0].currentCostume, 1);
    const saved = JSON.parse(s.files.get(ARTWORK_PATH));
    const record = saved.costumes.find(row => row.targetIndex === 1 && row.costumeIndex === 0);
    assert.deepEqual(record.document, document);
    // Existing artwork load boundary restores the full source onto new VM costumes.
    const next = {runtime: {targets: project.targets.map(target => ({...target,
        sprite: {costumes: target.costumes.map(c => ({...c}))}}))}};
    assert.equal(applyArtwork({outcome: 'loaded', records: saved.costumes}, next).count, 4);
    assert.deepEqual(getCostumeDocument(next.runtime.targets[1].sprite.costumes[0]), document);
});

test('changed SHAPE/COSTUME and deleted BACKDROP declarations use generated artwork', () => {
    const s = setup(); const project = clone(s.declarations);
    project.targets[1].costumes[0]._shapeSpec = 'square 20 #ff0000';
    project.targets[1].costumes[1] = {name: 'Jump', _spec: 'Jump circle 10'};
    project.targets[0].costumes = project.targets[0].costumes.slice(0, 1);
    retainCodeArtwork(s.zip, project, s.vm, s.context);
    assert.deepEqual(project.targets[1].costumes, [{name: 'costume1', _shapeSpec: 'square 20 #ff0000'},
        {name: 'Jump', _spec: 'Jump circle 10'}]);
    assert.equal(project.targets[0].costumes.length, 1);
    assert.equal(s.files.has('walk.png'), false);
    assert.equal(s.files.has('night.png'), false);
});

test('costume reordering preserves declaration identity rather than taking the old array slot', () => {
    const s = setup(); const base = s.actor.sprite.costumes[0];
    s.actor.sprite.costumes.reverse();
    const project = clone(s.declarations);
    retainCodeArtwork(s.zip, project, s.vm, s.context);
    assert.equal(project.targets[1].costumes[0].assetId, base.assetId);
    assert.equal(project.targets[1].costumes[1].assetId, 'walk');
});

test('external project replacement never inherits the previous project artwork', () => {
    const s = setup(); s.vm.runtime.targets = s.vm.runtime.targets.map(target => ({...target}));
    assert.equal(codeArtworkMatches(s.vm, s.context), false);
    assert.equal(retainCodeArtwork(s.zip, clone(s.declarations), s.vm, s.context), false);
    assert.equal(s.files.size, 0);
});

test('missing live assets fail before a generated project can replace the loaded project', () => {
    const s = setup(); delete s.actor.sprite.costumes[0].asset;
    assert.throws(() => retainCodeArtwork(s.zip, clone(s.declarations), s.vm, s.context), /asset unavailable/);
});

test('explicit new SVG upload overrides the retained first costume', () => {
    const s = setup(); const project = clone(s.declarations);
    retainCodeArtwork(s.zip, project, s.vm, s.context, [{sprite: 'Actor', mode: 'replace'}]);
    assert.deepEqual(project.targets[1].costumes[0], {name: 'costume1'});
    assert.equal(project.targets[1].costumes[1].assetId, 'walk');
});
