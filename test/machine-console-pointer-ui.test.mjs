import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, writeFile, unlink} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {dirname, join} from 'node:path';
import {randomUUID} from 'node:crypto';

const root = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const guiRequire = createRequire(join(root, 'packages/scratch-gui/package.json'));
const React = guiRequire('react');
const {create, act} = guiRequire('react-test-renderer');
const babel = guiRequire('@babel/core');

async function loadConsole() {
    const sourceUrl = new URL('../overlay/scratch-gui/src/components/tw-pseudocode/machine-console.jsx', import.meta.url);
    const tempUrl = new URL(`./machine-console-test-${randomUUID()}.mjs`, sourceUrl);
    const reactUrl = pathToFileURL(guiRequire.resolve('react')).href;
    const source = (await readFile(sourceUrl, 'utf8')).replace("from 'react'", `from '${reactUrl}'`);
    const transformed = babel.transformSync(source, {
        filename: 'machine-console.jsx', babelrc: false, configFile: false,
        presets: [[guiRequire.resolve('@babel/preset-react'), {runtime: 'classic'}]]
    }).code;
    await writeFile(tempUrl, transformed);
    try { return (await import(tempUrl.href)).default; }
    finally { await unlink(tempUrl); }
}

const widget = {name: 'VGA', config: {width: 640, height: 480}, state: {signal: true}};
const pointer = (x, y, button = 0) => ({
    clientX: x, clientY: y, button, pointerId: 7,
    preventDefault() { this.prevented = true; },
    currentTarget: {setPointerCapture(id) { assert.equal(id, 7); }}
});

// react-test-renderer invokes the actual component's event props. It needs
// these globals for effects, but no browser, emulator or private media.
async function withConsole(testBody) {
    const beforeDocument = globalThis.document;
    const beforeWindow = globalThis.window;
    globalThis.document = {fullscreenElement: null, addEventListener() {}, removeEventListener() {}};
    globalThis.window = {addEventListener() {}, removeEventListener() {}};
    try { await testBody(await loadConsole()); }
    finally {
        if (beforeDocument === undefined) delete globalThis.document;
        else globalThis.document = beforeDocument;
        if (beforeWindow === undefined) delete globalThis.window;
        else globalThis.window = beforeWindow;
    }
}

test('Widgets console forwards ordered PS/2 movement and button transitions, releasing lost capture and blur',
    async () => withConsole(async MachineConsole => {
        const received = [];
        let renderer;
        await act(async () => {
            renderer = create(React.createElement(MachineConsole, {
                widget, mouseIn: packet => { received.push(packet); return true; }
            }));
        });
        const consoleFace = renderer.root.findByProps({'data-testid': 'bw-machine-console'});
        const surface = renderer.root.findAllByType('div').find(node =>
            typeof node.props.onPointerMove === 'function');
        assert.ok(surface, 'the rendered Widgets pointer surface exists');

        surface.props.onPointerMove(pointer(100, 100)); // establish the relative origin
        assert.deepEqual(received, []);
        surface.props.onPointerMove(pointer(106, 97));
        const left = pointer(106, 97, 0);
        surface.props.onPointerDown(left);
        assert.equal(left.prevented, true, 'press is captured by the guest console');
        surface.props.onPointerMove(pointer(109, 101));
        surface.props.onPointerDown(pointer(109, 101, 2)); // right while left is held
        surface.props.onPointerUp(pointer(109, 101, 0));
        surface.props.onLostPointerCapture();
        surface.props.onPointerMove(pointer(200, 200)); // new origin after lost capture
        surface.props.onPointerDown(pointer(200, 200, 1)); // middle
        await act(async () => { consoleFace.props.onBlur(); });
        assert.deepEqual(received, [
            {dx: 6, dy: -3, buttons: 0},
            {dx: 0, dy: 0, buttons: 1},
            {dx: 3, dy: 4, buttons: 1},
            {dx: 0, dy: 0, buttons: 3},
            {dx: 0, dy: 0, buttons: 2},
            {dx: 0, dy: 0, buttons: 0},
            {dx: 0, dy: 0, buttons: 4},
            {dx: 0, dy: 0, buttons: 0}
        ]);
        await act(async () => { renderer.unmount(); });
    }));

test('Widgets console leaves pointer input inert when no machine mouse callback is attached',
    async () => withConsole(async MachineConsole => {
        let renderer;
        await act(async () => {
            renderer = create(React.createElement(MachineConsole, {widget}));
        });
        const surface = renderer.root.findAllByType('div').find(node =>
            typeof node.props.onPointerMove === 'function');
        const down = pointer(20, 30);
        surface.props.onPointerMove(pointer(10, 10));
        surface.props.onPointerMove(pointer(20, 30));
        surface.props.onPointerDown(down);
        surface.props.onPointerUp(pointer(20, 30));
        surface.props.onLostPointerCapture();
        assert.equal(down.prevented, undefined, 'ordinary screen clicks are not intercepted');
        await act(async () => { renderer.unmount(); });
    }));
