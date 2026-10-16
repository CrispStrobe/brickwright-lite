import test from 'node:test';
import assert from 'node:assert/strict';
import Creator from '../overlay/scratch-gui/src/lib/sb3-creator.js';
import {projectToArcade} from '../overlay/scratch-gui/src/lib/bw-makecode/export-arcade.js';
import {createArrayReferenceExportAuthority} from '../overlay/scratch-gui/src/lib/bw-makecode/array-reference-export-authority.js';
import {createAnimationFrameArrayProducers} from '../overlay/scratch-gui/src/lib/bw-makecode/animation-frame-array-producers.js';

const id = 'authored-walk';
const document = (typed = false) => {
    const frames = [2, 8].map((colour, index) => ({id: `f${index}`, durationMs: 100, activeLayerId: 'pixels',
        layers: [{id: 'pixels', name: 'Pixels', locked: false, type: 'pixel', visible: true, opacity: 1,
            content: {kind: 'pixels', value: {width: 2, height: 1,
                pixels: typed ? new Uint8Array([colour, colour]) : [colour, colour]}}}]}));
    return {version: 4, layers: frames[0].layers, activeLayerId: 'pixels',
        animation: {resource: {id, name: 'Walk'}, activeFrameId: 'f0', frames}};
};
const program = (operation = 'frames', extra = '') => `DEVICE ARCADE
GLOBAL frames
GLOBAL alias
GLOBAL count
GLOBAL key = "${id}"
WHEN arcade source starts:
  set frames to (arcade animation ${operation} resource "${id}")
  set alias to (frames)
${extra}  set count to (length of array reference (alias))
`;
const parsed = source => {
    const creator = new Creator(); creator.parse(source);
    for (const key of ['warnings', 'errors', 'unparsed']) assert.deepEqual(creator[key], [], key);
    return creator;
};
const nodes = (project, opcode) => project.targets.flatMap(target => Object.values(target.blocks)
    .filter(node => node.opcode === opcode).map(node => ({target, node})));
const ref = (project, options, opcode = 'arrays_referenceLength') => {
    const {target, node} = nodes(project, opcode)[0];
    assert.ok(node, opcode);
    return {target, node, proof: createArrayReferenceExportAuthority(project, options)};
};
const check = (project, options, expected = true) => {
    const {target, node, proof} = ref(project, options);
    assert.equal(proof.validateInput(target, node).ok, expected);
    return {target, node, proof};
};
const cleanExport = (creator, options) => {
    const before = JSON.stringify(creator.project), out = projectToArcade(creator.project, options);
    assert.deepEqual(out.unsupported, []); assert.deepEqual(out.warnings, []);
    assert.equal(JSON.stringify(creator.project), before);
    return out;
};
const rawProducer = (fresh = false) => ({opcode: fresh ? 'arcade_animationAssetFreshFrames' : 'arcade_animationAssetFrames',
    fields: {}, inputs: {RESOURCE: [1, [10, id]]}});

test('public Creator shared and fresh literal resources carry Array authority into actual export', () => {
    for (const operation of ['frames', 'fresh frames']) {
        const c = parsed(program(operation)), options = {animationDocuments: [document()]};
        check(c.project, options);
        const out = cleanExport(c, options);
        assert.match(out.ts, /\.length/);
        assert.ok(out.files['images.g.jres']);
    }
});

test('actual menu selector and shared alias carry the same current resource producer', () => {
    for (const operation of ['frames', 'fresh frames']) {
        const c = parsed(program(operation)), options = {animationDocuments: [document()]};
        const opcode = operation === 'frames' ? 'arcade_animationAssetFrames' : 'arcade_animationAssetFreshFrames';
        const {target, node} = nodes(c.project, opcode)[0];
        const producerID = Object.keys(target.blocks).find(key => target.blocks[key] === node);
        target.blocks.menu = {opcode: 'arcade_menu_animationAssets', parent: producerID, next: null,
            shadow: true, topLevel: false, inputs: {}, fields: {animationAssets: [id, null]}};
        node.inputs.RESOURCE = [1, 'menu'];
        check(c.project, options); cleanExport(c, options);
    }
});

test('ordinary caller-derived formal transports an actual current animation Array', () => {
    for (const operation of ['frames', 'fresh frames']) {
        const c = parsed(`DEVICE ARCADE
GLOBAL count
DEFINE inspect (values):
  set count to (length of array reference (values))
WHEN arcade source starts:
  inspect (arcade animation ${operation} resource "${id}")
`);
        const options = {animationDocuments: [document()]};
        check(c.project, options); cleanExport(c, options);
    }
});

test('shared reporters share one allocation while each fresh reporter is independent', () => {
    const options = {animationDocuments: [document()]}, proof = createAnimationFrameArrayProducers(options), target = {blocks: {}};
    const a = proof.resolve(target, rawProducer()), b = proof.resolve({blocks: {}}, rawProducer());
    assert.equal(a.allocation, b.allocation); assert.equal(a.shared, true); assert.equal(a.length, 2);
    const first = rawProducer(true), second = rawProducer(true);
    const x = proof.resolve(target, first), y = proof.resolve(target, second);
    assert.notEqual(x.allocation, y.allocation); assert.notEqual(x.allocation, a.allocation);
    assert.equal(proof.resolve(target, first).allocation, x.allocation);
    assert.equal(x.shared, false);
});

test('alias mutation remains a real Array operation and cannot turn Image elements into Arrays', () => {
    const c = parsed(program('frames', '  set count to (pop from array reference (frames) index 0)\n'));
    const options = {animationDocuments: [document()]};
    check(c.project, options); cleanExport(c, options);
    const nested = parsed(program('frames', '  set alias to (item 0 of array reference (frames))\n'));
    check(nested.project, options, false);
    assert.ok(projectToArcade(nested.project, options).unsupported.some(s => s.startsWith('Array reference ')));
});

test('unknown neighboring writer remains incompatible with animation Array aliases', () => {
    const c = parsed(program('frames', '  set frames to 7\n'));
    check(c.project, {animationDocuments: [document()]}, false);
});

test('missing duplicate invalid and dynamic resource selections never supply Array facts', () => {
    const c = parsed(program());
    for (const documents of [[], [document(), document()], [{...document(), animation: {resource: {id, name: 'Walk'}, frames: []}}]]) {
        check(c.project, {animationDocuments: documents}, false);
    }
    const dynamic = parsed(program().replace(`resource "${id}"`, 'resource (key)'));
    check(dynamic.project, {animationDocuments: [document()]}, false);
});

test('resource pixels duration frame order and palette mutations expire an issued proof', () => {
    for (const mutate of [
        d => {d.animation.frames[0].layers[0].content.value.pixels[0] = 9;},
        d => {d.animation.frames[0].durationMs = 200;},
        d => {d.animation.frames.reverse();},
        d => {d.palette = [null, ...Array(15).fill('#ffffff')];},
        d => {d.animation.resource.name = 'Changed';}
    ]) {
        const c = parsed(program()), d = document(), options = {animationDocuments: [d]};
        const {target, node, proof} = check(c.project, options);
        mutate(d); assert.equal(proof.validateInput(target, node).ok, false);
    }
});

test('typed pixel bytes and view replacement expire proofs without retaining descriptor objects per pixel', () => {
    for (const mutate of [
        image => {image.pixels[0] = 7;},
        image => {image.pixels = new Uint8Array(image.pixels);},
        image => {image.pixels = new Uint8Array(image.pixels.buffer, 1, 1);}
    ]) {
        const c = parsed(program()), d = document(true), options = {animationDocuments: [d]};
        const {target, node, proof} = check(c.project, options);
        mutate(d.animation.frames[0].layers[0].content.value);
        assert.equal(proof.validateInput(target, node).ok, false);
    }
});

test('same-content resource and options replacements cannot reuse an issued producer', () => {
    for (const mutate of [
        options => {options.animationDocuments = options.animationDocuments.slice();},
        options => {options.animationDocuments[0] = document();},
        options => {Object.defineProperty(options, 'animationDocuments', {writable: false});}
    ]) {
        const c = parsed(program()), options = {animationDocuments: [document()]};
        const {target, node, proof} = check(c.project, options);
        mutate(options); assert.equal(proof.validateInput(target, node).ok, false);
    }
});

test('numeric pixel descriptor flags holes added properties and accessors expire proofs', () => {
    for (const mutate of [
        pixels => {Object.defineProperty(pixels, '0', {writable: false});},
        pixels => {delete pixels[0];},
        pixels => {pixels.extra = 1;},
        pixels => {Object.defineProperty(pixels, '0', {get() {throw Error('must not read accessor');}});}
    ]) {
        const c = parsed(program()), d = document(), options = {animationDocuments: [d]};
        const {target, node, proof} = check(c.project, options);
        mutate(d.animation.frames[0].layers[0].content.value.pixels);
        assert.equal(proof.validateInput(target, node).ok, false);
    }
});

test('unreadable resource documents and cyclic data never grant producer authority', () => {
    let reads = 0;
    const inaccessible = document(); Object.defineProperty(inaccessible, 'animation', {get() {reads++; throw Error('unreadable');}});
    const cycle = document(); cycle.loop = cycle;
    for (const d of [inaccessible, cycle]) check(parsed(program()).project, {animationDocuments: [d]}, false);
    assert.equal(reads, 0);
});

test('malformed selector roles shared physical selectors and foreign membership refuse', () => {
    for (const mutate of [
        (target, node) => {node.inputs.RESOURCE = [99, [10, id]];},
        (target, node) => {node.inputs.EXTRA = [1, [10, id]];},
        (target, node) => {node.fields.EXTRA = ['x', null];},
        (target, node) => {node.mutation = {};}
    ]) {
        const c = parsed(program()), {target, node} = nodes(c.project, 'arcade_animationAssetFrames')[0];
        mutate(target, node); check(c.project, {animationDocuments: [document()]}, false);
    }
    const c = parsed(program()), options = {animationDocuments: [document()]};
    const {target, node, proof} = check(c.project, options);
    assert.equal(proof.validateInput({...target}, node).ok, false);
});

test('current graph replacement and a shared physical menu selector cannot reuse authority', () => {
    const c = parsed(program()), options = {animationDocuments: [document()]};
    const {target, node, proof} = check(c.project, options);
    target.blocks[Object.keys(target.blocks).find(key => target.blocks[key] === node)] = {...node};
    assert.equal(proof.validateInput(target, node).ok, false);
    const shared = parsed(program('frames', `  set alias to (arcade animation frames resource "${id}")\n`));
    const producers = nodes(shared.project, 'arcade_animationAssetFrames');
    assert.equal(producers.length, 2);
    const owner = producers[0].target;
    assert.equal(producers[1].target, owner);
    const firstID = Object.keys(owner.blocks).find(key => owner.blocks[key] === producers[0].node);
    owner.blocks.sharedMenu = {opcode: 'arcade_menu_animationAssets', parent: firstID, next: null,
        shadow: true, topLevel: false, inputs: {}, fields: {animationAssets: [id, null]}};
    for (const p of producers) p.node.inputs.RESOURCE = [1, 'sharedMenu'];
    check(shared.project, options, false);
});

test('accessor options are unread and resource descriptors cannot turn into getters', () => {
    let reads = 0;
    const options = {};
    Object.defineProperty(options, 'animationDocuments', {get() {reads++; throw Error('must not invoke');}});
    check(parsed(program()).project, options, false);
    assert.equal(reads, 0);
    const d = document(), currentOptions = {animationDocuments: [d]}, c = parsed(program());
    const {target, node, proof} = check(c.project, currentOptions);
    Object.defineProperty(d.animation.resource, 'id', {get() {reads++; throw Error('must not invoke');}});
    assert.equal(proof.validateInput(target, node).ok, false);
    assert.equal(reads, 0);
});

test('actual early constructor artwork callbacks cannot renew the resource snapshot', () => {
    const c = parsed(program()), d = document();
    let calls = 0;
    const out = projectToArcade(c.project, {animationDocuments: [d], costumePalette() {
        calls++; d.animation.frames[0].layers[0].content.value.pixels[0] = 9;
        return null;
    }});
    assert.ok(calls > 0, 'actual constructor callback must execute');
    assert.ok(out.unsupported.some(message => message.includes('Animation resource documents changed')));
    assert.ok(out.files['images.g.jres']);
    const companion = JSON.parse(out.files['brickwright-animation.json']);
    assert.equal(companion.resources[0].document.animation.frames[0].layers[0].content.value.pixels[0], 2);
});

test('actual late stage background callback cannot publish a stale clean export', () => {
    const c = parsed(program()), d = document();
    let calls = 0;
    const out = projectToArcade(c.project, {animationDocuments: [d], stageBackground() {
        calls++; d.animation.frames[1].durationMs = 101;
        return null;
    }});
    assert.ok(calls > 0, 'actual stage background callback must execute');
    assert.ok(out.unsupported.some(message => message.includes('Animation resource documents changed')));
    assert.ok(out.files['images.g.jres']);
    const companion = JSON.parse(out.files['brickwright-animation.json']);
    assert.equal(companion.resources[0].document.animation.frames[1].durationMs, 100);
});

test('privately branded planner cannot be replaced by a forged interface or another options object', () => {
    const c = parsed(program()), options = {animationDocuments: [document()]};
    const {target, node} = ref(c.project, options);
    const forged = {isCurrent: () => true, resolve: () => ({allocation: {}, length: 2})};
    assert.equal(createArrayReferenceExportAuthority(c.project, options, forged).validateInput(target, node).ok, false);
    const actual = createAnimationFrameArrayProducers(options);
    assert.equal(createArrayReferenceExportAuthority(c.project, {...options}, actual).validateInput(target, node).ok, false);
    assert.equal(Object.isFrozen(actual.entries), true);
    const resource = actual.entries[0].resource;
    assert.equal(Object.isFrozen(resource), true);
    assert.equal(Object.isFrozen(resource.frames), true);
    assert.equal(Object.isFrozen(resource.frames[0].pixels), true);
    assert.throws(() => {resource.frames[0].pixels[0] = 9;}, TypeError);
});
