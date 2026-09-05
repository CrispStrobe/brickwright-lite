import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const createReducerManager = require('../overlay/scratch-gui/src/lib/reducer-manager.js');

const combineReducers = reducers => (state = {}, action) => Object.fromEntries(
    Object.entries(reducers).map(([key, reducer]) => [key, reducer(state[key], action)])
);

test('dynamic reducer installation preserves existing slices and is idempotent', () => {
    const locales = (state = {locale: 'de'}, action) =>
        action.type === 'LOCALE' ? {locale: action.locale} : state;
    const gui = (state = {counter: 0}, action) =>
        action.type === 'COUNT' ? {counter: state.counter + 1} : state;
    const manager = createReducerManager(combineReducers, {locales, scratchGui: gui});
    const before = manager.reduce(undefined, {type: '@@init'});
    const active = manager.reduce(before, {type: 'COUNT'});
    const paint = (state = {viewBounds: {kind: 'real-matrix'}}, action) => state;

    assert.equal(manager.install('scratchPaint', paint), true);
    const installed = manager.reduce(active, {type: '@@replace'});
    assert.strictEqual(installed.locales, active.locales);
    assert.strictEqual(installed.scratchGui, active.scratchGui);
    assert.deepEqual(installed.scratchPaint, {viewBounds: {kind: 'real-matrix'}});
    assert.equal(manager.install('scratchPaint', paint), false);
    assert.throws(() => manager.install('scratchPaint', () => null), /different implementation/);
});

test('the paint module is requested once, installed before render and retryable after failure', () => {
    const appState = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/app-state-hoc.jsx', import.meta.url), 'utf8');
    const wrapper = readFileSync(new URL(
        '../overlay/scratch-gui/src/containers/paint-editor-wrapper.jsx', import.meta.url), 'utf8');
    const reducerBridge = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/lazy-paint-reducer.js', import.meta.url), 'utf8');
    const editorBridge = readFileSync(new URL(
        '../overlay/scratch-gui/src/lib/lazy-paint-editor.jsx', import.meta.url), 'utf8');
    const publicIndex = readFileSync(new URL(
        '../packages/scratch-gui/src/index.js', import.meta.url), 'utf8');
    const paintReducer = readFileSync(new URL(
        '../packages/scratch-paint/src/reducers/view-bounds.js', import.meta.url), 'utf8');
    const browserGate = readFileSync(new URL(
        '../scripts/verify-costume-roundtrip.mjs', import.meta.url), 'utf8');
    const workflow = readFileSync(new URL('../.github/workflows/build.yml', import.meta.url), 'utf8');

    assert.doesNotMatch(appState, /scratch-paint/,
        'store construction must not retain an eager paint edge');
    assert.match(appState, /replaceReducer\(this\.reducerManager\.reduce\)/);
    assert.match(wrapper, /paintReducerRequest = import[\s\S]*paintReducerRequest = null/,
        'a failed shared reducer request must be retryable');
    assert.match(wrapper, /paintEditorRequest = import[\s\S]*paintEditorRequest = null/,
        'a failed shared editor request must be retryable');
    assert.match(wrapper,
        /installReducer\('scratchPaint', module\.default\);[\s\S]*yieldTask\(\)[\s\S]*loadPaintEditor\(\)[\s\S]*yieldTask\(\)[\s\S]*setState\(\{PaintEditor:/,
        'the real reducer must be installed before a paint child can render');
    assert.match(wrapper, /setTimeout\(resolve, 0\)/,
        'module evaluation and editor render must use fresh task boundaries');
    assert.match(wrapper, /webpackChunkName: "paint-reducer"[\s\S]*\.\.\/lib\/lazy-paint-reducer/);
    assert.match(wrapper, /webpackChunkName: "paint-editor"[\s\S]*\.\.\/lib\/lazy-paint-editor\.jsx/);
    assert.doesNotMatch(wrapper, /import\([^)]*['"]scratch-paint(?:['"]|\/)/,
        'the wrapper must not bypass the named local bridges');
    assert.match(reducerBridge,
        /from 'scratch-paint\/src\/reducers\/scratch-paint-reducer'/);
    assert.doesNotMatch(reducerBridge, /from 'scratch-paint'/,
        'the reducer bridge must not import the package root and editor');
    assert.match(editorBridge,
        /from 'scratch-paint\/src\/containers\/paint-editor\.jsx'/);
    assert.doesNotMatch(editorBridge, /from 'scratch-paint'/,
        'the editor bridge must not import the package root and reducer');
    assert.match(wrapper, /shouldComponentUpdate \(nextProps, nextState\)/);
    assert.match(wrapper, /generation !== this\.loadGeneration/);
    assert.match(wrapper, /Retry costume editor/);
    assert.match(publicIndex, /scratchPaint: ScratchPaintReducer/,
        'the published guiReducers contract must remain synchronous and unchanged');
    assert.match(paintReducer, /new paper\.Matrix\(\)/,
        'the installed reducer default must remain the real Matrix-backed state');
    assert.match(browserGate, /absent before the Costume editor/);
    assert.match(browserGate, /matrixBacked/);
    assert.doesNotMatch(browserGate, /constructor\?\.name === 'Matrix'/,
        'minification must not invalidate the real Matrix proof');
    assert.match(browserGate, /clone\.translate\(7, 11\)/,
        'the Matrix proof must exercise clone, equality and transformation behavior');
    assert.match(browserGate, /paint reducer and editor arrive as ordered activation resources/);
    assert.match(browserGate, /baselineMs = 390\.5/);
    assert.match(browserGate, /baselineRun = 33967333844/);
    assert.match(browserGate, /relativeLimitMs = 449\.075/);
    assert.match(browserGate, /absoluteLimitMs = 1000/);
    assert.match(browserGate, /maxLongTaskMs = 100/);
    assert.match(browserGate, /paint-performance\.json/);
    assert.doesNotMatch(workflow, /PAINT_FIRST_COSTUME_BASELINE_MS/);
});
