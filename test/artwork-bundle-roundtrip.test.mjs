import {test} from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

const artwork = await import('../overlay/scratch-gui/src/lib/bw-artwork-bundle.js');

const fixture = async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2"/></svg>';
    const id = 'f0000000000000000000000000000000.svg';
    const costume = {name: 'costume1', md5ext: id, dataFormat: 'svg'};
    const target = {isOriginal: true, sprite: {costumes: [costume]}};
    const vm = {runtime: {targets: [target]}};
    const project = {targets: [{isStage: true, name: 'Stage', blocks: {},
        costumes: [{...costume, rotationCenterX: 1, rotationCenterY: 1}], sounds: []}],
    monitors: [], extensions: [], meta: {semver: '3.0.0'}};
    const zip = new JSZip();
    zip.file('project.json', JSON.stringify(project));
    zip.file(id, svg);
    return {vm, costume, project, svg, id, blob: await zip.generateAsync({type: 'blob'})};
};

test('SB3 retains Scratch rendering and opens its editable pixel source', async () => {
    const {vm, costume, project, svg, id, blob} = await fixture();
    const pixelDoc = {version: 1, pixelScale: 4, layers: [{id: 'pixels', type: 'pixel',
        name: 'Pixels', visible: true, locked: false, opacity: 1,
        content: {kind: 'pixels', value: {width: 2, height: 2, pixels: [1, 2, 3, 4]}}}]};
    artwork.setCostumeDocument(costume, pixelDoc);
    const saved = await artwork.attachArtwork(blob, vm);
    const zip = await JSZip.loadAsync(await saved.arrayBuffer());
    assert.deepEqual(JSON.parse(await zip.file('project.json').async('text')), project);
    assert.equal(await zip.file(id).async('text'), svg);
    assert.deepEqual(JSON.parse(await zip.file(artwork.ARTWORK_PATH).async('text')).costumes[0].document,
        pixelDoc);

    const inspected = await artwork.inspectArtwork(await saved.arrayBuffer());
    assert.equal(inspected.outcome, 'loaded');
    const reopened = await fixture();
    assert.equal(artwork.applyArtwork(inspected, reopened.vm).count, 1);
    assert.deepEqual(artwork.getCostumeDocument(reopened.costume), pixelDoc);
    artwork.resetCostumeDocument(reopened.costume);
    assert.equal(artwork.getCostumeDocument(reopened.costume).layers[0].content.kind, 'asset');
});

test('stale source is ignored if another editor changed the Scratch asset', async () => {
    const {vm, costume, blob} = await fixture();
    const saved = await artwork.attachArtwork(blob, vm);
    const zip = await JSZip.loadAsync(await saved.arrayBuffer());
    const project = JSON.parse(await zip.file('project.json').async('text'));
    project.targets[0].costumes[0].md5ext = 'changed.svg';
    zip.file('project.json', JSON.stringify(project));
    zip.file('changed.svg', '<svg/>');
    const changed = await zip.generateAsync({type: 'blob'});
    const inspected = await artwork.inspectArtwork(await changed.arrayBuffer());
    assert.equal(inspected.outcome, 'loaded');
    assert.equal(inspected.records.length, 0);
    costume.md5ext = 'changed.svg';
    assert.equal(artwork.applyArtwork(inspected, vm).count, 0);
    assert.equal(artwork.getCostumeDocument(costume).layers[0].content.value, 'changed.svg');
});

test('an edited costume uses the new asset ID even when VM leaves md5ext stale', async () => {
    const {vm, costume, blob} = await fixture();
    costume.asset = {assetId: 'f0000000000000000000000000000000'};
    const source = {version: 1, layers: [{id: 'base', type: 'vector', name: 'New',
        visible: true, locked: false, opacity: 1,
        content: {kind: 'svg', value: '<svg><circle r="1"/></svg>'}}]};
    artwork.setCostumeDocument(costume, source);
    const saved = await artwork.attachArtwork(blob, vm);
    const zip = await JSZip.loadAsync(await saved.arrayBuffer());
    const record = JSON.parse(await zip.file(artwork.ARTWORK_PATH).async('text')).costumes[0];
    assert.deepEqual(record.document, source);
});

test('a future artwork source survives an unchanged Scratch rendering', async () => {
    const {vm, blob} = await fixture();
    const future = JSON.stringify({format: artwork.ARTWORK_FORMAT, version: 8,
        costumes: [], futureField: {keep: true}});
    const inputZip = await JSZip.loadAsync(await blob.arrayBuffer());
    inputZip.file(artwork.ARTWORK_PATH, future);
    const input = await inputZip.generateAsync({type: 'blob'});
    const inspected = await artwork.inspectArtwork(await input.arrayBuffer());
    assert.equal(inspected.outcome, 'future');
    artwork.applyArtwork(inspected, vm);
    const saved = await artwork.attachArtwork(blob, vm);
    const savedZip = await JSZip.loadAsync(await saved.arrayBuffer());
    assert.equal(await savedZip.file(artwork.ARTWORK_PATH).async('text'), future);
    artwork.applyArtwork({outcome: 'legacy'}, vm);
});

test('a malformed artwork source does not replace the usable Scratch rendering', async () => {
    const {vm, costume, blob} = await fixture();
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    zip.file(artwork.ARTWORK_PATH, '{broken json');
    const damaged = await zip.generateAsync({type: 'blob'});
    const inspected = await artwork.inspectArtwork(await damaged.arrayBuffer());
    assert.equal(inspected.outcome, 'invalid');
    artwork.applyArtwork(inspected, vm);
    assert.equal(artwork.getCostumeDocument(costume).layers[0].content.kind, 'asset');
    const output = await artwork.attachArtwork(damaged, vm);
    const saved = await JSZip.loadAsync(await output.arrayBuffer());
    assert.equal(await saved.file(costume.md5ext).async('text'),
        await zip.file(costume.md5ext).async('text'));
});
