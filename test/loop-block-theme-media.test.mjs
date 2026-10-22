import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defineStaticExtensionBlocks} from '../overlay/scratch-gui/src/lib/extension-block-definitions.js';
import {injectLoopBlockMedia} from '../overlay/scratch-gui/src/lib/themes/loopBlockMedia.js';

// Exact final row emitted by Runtime._convertBlockForScratchBlocks for LOOP.
// These pure presentation/method-boundary controls do not launch ScratchBlocks
// or qualify actual browser resource requests, theme rebuilding or rendering.
const loop = () => ({type: 'arcade_repeat', message0: 'repeat %1',
    args0: [{type: 'input_value', name: 'COUNT'}], message1: '%1',
    args1: [{type: 'input_statement', name: 'SUBSTACK'}],
    message2: '%1', lastDummyAlign2: 'RIGHT', args2: [{type: 'field_image',
        src: './static/blocks-media/repeat.svg', width: 24, height: 24, alt: '*', flip_rtl: true}],
    colour: '#123456', colourSecondary: '#234567', colourTertiary: '#345678',
    previousStatement: null, nextStatement: null, extensions: ['scratch_extension']});
const info = Object.freeze({blockType: 'loop', opcode: 'repeat'});
const freeze = value => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
const themes = {default: {}, dark: {extensions: {}}, 'high-contrast': {extensions: {}}};
const colors = {primary: '#010101', secondary: '#020202', tertiary: '#030303', quaternary: '#040404'};
const helperSource = fs.readFileSync(new URL('../overlay/scratch-gui/src/lib/themes/blockHelpers.js', import.meta.url), 'utf8');
assert.equal((helperSource.match(/import \{DEFAULT_THEME, getColorsForTheme, themeMap\} from '\.';/g) || []).length, 1);
assert.equal((helperSource.match(/import \{injectLoopBlockMedia\} from '\.\/loopBlockMedia';/g) || []).length, 1);
// Execute the actual helper body with explicitly modelled theme-color fixtures.
// The independent real theme/basePath/Blockly rebuild gate remains required.
const helperBody = helperSource
    .replace("import {DEFAULT_THEME, getColorsForTheme, themeMap} from '.';", '')
    .replace("import {injectLoopBlockMedia} from './loopBlockMedia';", '')
    .replace(/export \{\s*injectExtensionBlockTheme,\s*injectExtensionCategoryTheme\s*\};\s*$/, 'return {injectExtensionBlockTheme};');
const {injectExtensionBlockTheme} = new Function('DEFAULT_THEME', 'getColorsForTheme', 'themeMap',
    'injectLoopBlockMedia', helperBody)('default', () => ({pen: colors}), themes, injectLoopBlockMedia);

test('exact generated arrow uses default, dark and high-contrast media including deployment base paths', () => {
    for (const media of ['/static/blocks-media/default/', '/app/static/blocks-media/default/',
        '/app/static/blocks-media/high-contrast/', 'https://example.invalid/sub/static/blocks-media/default/']) {
        const original = freeze(loop()), before = structuredClone(original);
        const output = injectLoopBlockMedia(original, media, info);
        const expected = structuredClone(before);
        expected.args2[0].src = media + 'repeat.svg';
        assert.deepEqual(output, expected);
        assert.deepEqual(original, before);
        assert.notEqual(output, original);
        assert.notEqual(output.args2, original.args2);
        assert.equal(output.args0, original.args0);
        assert.equal(output.args1, original.args1);
    }
});

test('configured media without a trailing slash joins one filename without changing the deployment prefix', () => {
    assert.equal(injectLoopBlockMedia(loop(), '/nested/static/blocks-media/default', info).args2[0].src,
        '/nested/static/blocks-media/default/repeat.svg');
});

test('actual theme helper preserves default extension colors while adapting the arrow', () => {
    const original = freeze(loop());
    const output = injectExtensionBlockTheme(original, 'default', '/base/default/', info);
    const expected = structuredClone(original);
    expected.args2[0].src = '/base/default/repeat.svg';
    assert.deepEqual(output, expected);
    assert.equal(injectExtensionBlockTheme(original, 'default'), original);
});

test('actual theme helper retains non-default color and unrelated category-icon behavior', () => {
    const original = loop();
    original.args0.unshift({type: 'field_image', src: 'third-party.svg', width: 40, height: 40});
    const output = injectExtensionBlockTheme(freeze(original), 'high-contrast', '/base/high/', info);
    assert.equal(output.args0, original.args0);
    assert.equal(output.args0[0].src, 'third-party.svg');
    assert.equal(output.args2[0].src, '/base/high/repeat.svg');
    assert.equal(output.colour, colors.primary);
    assert.equal(output.colourSecondary, colors.secondary);
    assert.equal(output.colourTertiary, colors.tertiary);
    assert.equal(output.colourQuaternary, colors.quaternary);
});

test('normal themed extension icon selection remains independent from the final loop arrow', () => {
    themes['high-contrast'].extensions.arcade = {blockIconURI: 'theme-category.svg'};
    try {
        const original = loop();
        original.args0.unshift({type: 'field_image', src: 'extension-category.svg'});
        const output = injectExtensionBlockTheme(freeze(original), 'high-contrast', '/current/', info);
        assert.equal(output.args0[0].src, 'theme-category.svg');
        assert.equal(output.args2[0].src, '/current/repeat.svg');
        assert.equal(original.args0[0].src, 'extension-category.svg');
    } finally {delete themes['high-contrast'].extensions.arcade;}
});

test('missing metadata, non-loop and dynamic blocks cannot acquire a new image', () => {
    for (const metadata of [undefined, null, {}, {blockType: 'command'}, {...info, isDynamic: true}]) {
        const original = freeze(loop());
        assert.equal(injectLoopBlockMedia(original, '/current/', metadata), original);
    }
    for (const media of [undefined, null, '', 42]) {
        const original = freeze(loop());
        assert.equal(injectLoopBlockMedia(original, media, info), original);
    }
});

test('lookalike and malformed image fields remain untouched', () => {
    for (const [key, value] of [['type', 'input_value'], ['src', '/custom/repeat.svg'],
        ['width', 23], ['height', '24'], ['alt', 'repeat'], ['flip_rtl', false], ['custom', true]]) {
        const original = loop(); original.args2[0][key] = value; freeze(original);
        assert.equal(injectLoopBlockMedia(original, '/current/', info), original, key);
    }
    for (const alter of [json => {delete json.args2[0].width;},
        json => {json.args2.push({...json.args2[0]});},
        json => {json.message2 = 'repeat';}, json => {json.lastDummyAlign2 = 'LEFT';},
        json => {json.message3 = 'another real row';},
        json => {json.message99999999999999999999999 = '%1';}]) {
        const original = loop(); alter(original); freeze(original);
        assert.equal(injectLoopBlockMedia(original, '/current/', info), original);
    }
});

test('only the final generated arrow changes when another image reuses the legacy URI', () => {
    const original = loop(); original.args0.unshift({...original.args2[0]}); freeze(original);
    const output = injectLoopBlockMedia(original, '/current/', info);
    assert.equal(output.args0, original.args0);
    assert.equal(output.args0[0].src, './static/blocks-media/repeat.svg');
    assert.equal(output.args2[0].src, '/current/repeat.svg');
});

const container = fs.readFileSync(new URL('../overlay/scratch-gui/src/containers/blocks.jsx', import.meta.url), 'utf8');
const start = container.indexOf('    handleExtensionAdded (categoryInfo) {');
const end = container.indexOf('    handleBlocksInfoUpdate (categoryInfo) {', start);
assert.ok(start > 0 && end > start);
const method = new Function('injectExtensionBlockTheme', 'defineDynamicBlock', 'defineStaticExtensionBlocks',
    `return ({${container.slice(start, end)}}).handleExtensionAdded;`);

test('actual registration method rereads current workspace media and theme at each rebuild', () => {
    const registered = [], original = freeze(loop());
    const target = {props: {theme: 'default'}, workspace: {options: {pathToMedia: '/base/default/'}},
        ScratchBlocks: {Blocks: {}, defineBlocksWithJsonArray (rows) {
            registered.push(...rows);
            for (const row of rows) this.Blocks[row.type] = {init () {}};
        }},
        getToolboxXML: () => null};
    const category = {customFieldTypes: {}, menus: [], blocks: [{info, json: original}]};
    const register = method(injectExtensionBlockTheme, () => {throw Error('unexpected dynamic factory');}, defineStaticExtensionBlocks);
    for (const [theme, media] of [['default', '/base/default/'], ['high-contrast', '/base/high/'],
        ['dark', '/base/default/'], ['default', '/other/default/']]) {
        target.props.theme = theme;
        target.workspace.options.pathToMedia = media;
        register.call(target, category);
        assert.equal(registered.at(-1).args2[0].src, media + 'repeat.svg');
    }
    assert.equal(original.args2[0].src, './static/blocks-media/repeat.svg');
    assert.equal(registered[0].args2[0].src, '/base/default/repeat.svg');
});

test('actual registration keeps dynamic factories separate and does not add loop fields', () => {
    const calls = [], rows = [];
    const dynamicInfo = {info: {...info, isDynamic: true, opcode: 'dynamic'}, json: loop()};
    const target = {props: {theme: 'default'}, workspace: {options: {pathToMedia: '/base/'}},
        ScratchBlocks: {Blocks: {}, defineBlocksWithJsonArray: items => rows.push(...items)},
        getToolboxXML: () => null};
    const factory = {dynamicFactory: true};
    method(injectExtensionBlockTheme, (...args) => {calls.push(args); return factory;}, defineStaticExtensionBlocks).call(target,
        {id: 'arcade', customFieldTypes: {}, menus: [], blocks: [dynamicInfo]});
    assert.equal(calls.length, 1);
    assert.equal(calls[0][2], dynamicInfo);
    assert.equal(target.ScratchBlocks.Blocks.arcade_dynamic, factory);
    assert.deepEqual(rows, []);
    assert.equal(dynamicInfo.json.args2[0].src, './static/blocks-media/repeat.svg');
});

test('owned source and tracked integration pairs are byte exact', () => {
    for (const relative of ['containers/blocks.jsx', 'lib/themes/blockHelpers.js', 'lib/themes/loopBlockMedia.js']) {
        const left = fs.readFileSync(new URL('../overlay/scratch-gui/src/' + relative, import.meta.url));
        const right = fs.readFileSync(new URL('../packages/scratch-gui/src/' + relative, import.meta.url));
        assert.deepEqual(left, right, relative);
    }
});
