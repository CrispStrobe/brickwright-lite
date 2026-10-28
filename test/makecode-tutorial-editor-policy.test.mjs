import test from 'node:test';
import assert from 'node:assert/strict';
import {tutorialEditorProjectFiles, tutorialProjectFiles} from '../overlay/scratch-gui/src/lib/bw-makecode/tutorial-project.js';
const fence = (kind, source) => '```' + kind + '\n' + source + '\n```\n';
const targetBundle = {id: 'arcade', versions: {pxt: '13.2.1', target: '4.2.1'}, blocksprj: {
    config: {name: 'target', dependencies: {device: '*'}, files: ['main.ts', 'assets.json']},
    files: {'main.ts': ' ', 'assets.json': ''}
}};
const options = () => ({targetBundle: structuredClone(targetBundle), targetBundleSHA256: 'a'.repeat(64)});
const asset = files => fence('assetjson', JSON.stringify(files));

test('editor policy excludes saved project config without dropping real custom helper or selected source', () => {
    const main = 'namespace SpriteKind { export const Guard = SpriteKind.create() }\r\n';
    const helper = 'namespace SpriteKind { export const Guard = SpriteKind.create() }';
    const doc = asset({'pxt.json': JSON.stringify({dependencies: {tilemaps: 'github:x/tilemaps#v1'}}),
        'main.ts': 'old template', 'other.ts': 'doNotImport()', 'images.g.jres': '{"art":"unchanged"}'}) +
        fence('package', 'pxt-tilemaps=github:x/tilemaps/') + fence('customts', helper);
    const out = tutorialEditorProjectFiles(doc, main, options());
    assert.deepEqual(out.dependencies, {device: '*', 'pxt-tilemaps': 'github:x/tilemaps/'});
    assert.equal(out.files['main.ts'], main);
    assert.equal(out.files['tutorial.custom.ts'], helper);
    assert.equal(out.files['images.g.jres'], '{"art":"unchanged"}');
    assert.equal(out.files['other.ts'], undefined);
    assert.equal(out.assembly.originalEditorExport, false);
    assert.equal(out.assembly.assetCodeRegenerated, false);
    assert.equal(out.assembly.targetBundleSHA256, 'a'.repeat(64));
});

test('editor package policy overrides by key and never deduplicates two real alias declarations', () => {
    const doc = fence('package', 'device=remove\nfirst=github:x/pkg#v1\nsecond=github:x/pkg#v2\nfirst=github:x/pkg#v3');
    assert.deepEqual(tutorialEditorProjectFiles(doc, '', options()).dependencies,
        {first: 'github:x/pkg#v3', second: 'github:x/pkg#v2'});
});

test('editor policy selects last custom and asset fence but first package fence, preserving raw custom content', () => {
    const doc = fence('customts', 'first()') + fence('customts', 'last()\r') +
        asset({'images.g.ts': 'first art'}) + asset({'images.g.ts': 'last art'}) +
        fence('package', 'first') + fence('package', 'second');
    const out = tutorialEditorProjectFiles(doc, '', options());
    assert.equal(out.files['tutorial.custom.ts'], 'last()\r');
    assert.equal(out.files['images.g.ts'], 'last art');
    assert.deepEqual(out.dependencies, {device: '*', first: '*'});
});

test('editor policy refuses wrong or missing target authority and never invents core dependencies', () => {
    for (const change of [o => delete o.targetBundle, o => delete o.targetBundleSHA256,
        o => o.targetBundle.versions.pxt = '13.2.2', o => o.targetBundle.versions.target = '4.2.2',
        o => delete o.targetBundle.blocksprj.config.dependencies]) {
        const o = options(); change(o); assert.throws(() => tutorialEditorProjectFiles('', '', o));
    }
});

test('standalone editor JRES requires explicit emitter and takes precedence over saved tilemap inputs', () => {
    const doc = asset({'tilemap.g.jres': 'old', 'tilemap.g.ts': 'old generated'}) + fence('jres', '{"tile":"bytes"}');
    assert.throws(() => tutorialEditorProjectFiles(doc, '', options()), /original PXT tilemap generator/);
    const calls = [];
    const out = tutorialEditorProjectFiles(doc, '', {...options(), jresToTypeScript: bytes => {calls.push(bytes); return 'actual emitter result';}});
    assert.deepEqual(calls, ['{"tile":"bytes"}']);
    assert.equal(out.files['tilemap.g.jres'], calls[0]);
    assert.equal(out.files['tilemap.g.ts'], 'actual emitter result');
    assert.equal(out.assembly.assetCodeRegenerated, false);
});

test('legacy tutorial assembly remains a distinct historical reproduction route', () => {
    const doc = asset({'pxt.json': JSON.stringify({dependencies: {saved: 'github:x/saved'}, files: ['main.ts']}), 'main.ts': 'saved'});
    assert.equal(tutorialProjectFiles(doc, 'selected').dependencies.saved, 'github:x/saved');
    assert.equal(tutorialEditorProjectFiles(doc, 'selected', options()).dependencies.saved, undefined);
});
