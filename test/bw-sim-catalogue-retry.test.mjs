// SPDX-License-Identifier: BSD-3-Clause
import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const requireGui = createRequire(process.env.BW_INTEGRATED_ROOT ?
    pathToFileURL(resolve(process.env.BW_INTEGRATED_ROOT, 'package.json')) :
    new URL('../packages/scratch-gui/package.json', import.meta.url));
const React = requireGui('react'), babel = requireGui('@babel/core'), jsdom = requireGui('jsdom');
const document = jsdom.JSDOM ? new jsdom.JSDOM('<!doctype html><body></body>').window.document : jsdom.jsdom('<!doctype html><body></body>');
globalThis.window = document.defaultView;
globalThis.document = document;
Object.defineProperty(globalThis, 'navigator', {value: window.navigator, configurable: true});
window.requestAnimationFrame = callback => setTimeout(callback, 0);
window.cancelAnimationFrame = clearTimeout;
const messageChannel = globalThis.MessageChannel;
globalThis.MessageChannel = undefined;
const ReactDOM = requireGui('react-dom'), {act, Simulate} = requireGui('react-dom/test-utils');
globalThis.MessageChannel = messageChannel;
after(() => window.close());

// Compile the real palette and its info component; only catalogue I/O is controlled.
const component = filename => {
    const source = readFileSync(new URL(`../overlay/scratch-gui/src/components/tw-pseudocode/${filename}`, import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename, babelrc: false, configFile: false,
        presets: [requireGui.resolve('@babel/preset-react')],
        plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    const require = name => name === './sim-lab-info.jsx' ? component('sim-lab-info.jsx') : requireGui(name);
    new Function('require', 'module', 'exports', code)(require, module, module.exports);
    return module.exports;
};
const Palette = component('sim-lab-palette.jsx').default;
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => {resolve = yes; reject = no;});
    return {promise, resolve, reject};
};
const mount = () => {
    const requests = [], container = document.createElement('div');
    document.body.appendChild(container);
    let instance;
    act(() => {instance = ReactDOM.render(React.createElement(Palette, {
        locale: 'en', recent: [], thumbs: new Map(), requestThumb () {},
        text: {parts: 'Parts', helpParts: 'Help', paletteHelp: 'Choose parts', search: 'Search',
            catalogueOpen: 'Open catalogue', catalogueTitle: 'Catalogue', catalogueBack: 'Back',
            catalogueLoading: 'Loading catalogue', catalogueUnavailable: 'Catalogue unavailable: {error}',
            catalogueAbout: '{total} catalogue parts'},
        lib: {CATALOG: new Map(), CATALOGUE_PARTS: true, paletteFrom: () => [],
            searchCatalogue: () => ({results: [], total: 0})},
        onOpenCatalogue () {const request = deferred(); requests.push(request); return request.promise;}
    }), container);});
    return {container, requests, instance,
        click (id) {act(() => Simulate.click(container.querySelector(`[data-testid="${id}"]`)));},
        status () {return [...container.querySelectorAll('[role="status"]')].map(el => el.textContent);},
        async finish (index, error) {
            await act(async () => {error ? requests[index].reject(new Error(error)) : requests[index].resolve([]);});
        },
        close () {act(() => {ReactDOM.unmountComponentAtNode(container);}); container.remove();}};
};

test('reopening a failed catalogue reports loading while its retry is pending, then shows the result', async () => {
    const view = mount();
    try {
        view.click('bw-sim-lab-catalogue-open');
        assert.deepEqual(view.status(), ['Loading catalogue']);
        await view.finish(0, 'Offline');
        assert.deepEqual(view.status(), ['Catalogue unavailable: Offline']);
        view.click('bw-sim-lab-catalogue-back');
        view.click('bw-sim-lab-catalogue-open');
        assert.equal(view.requests.length, 2);
        assert.deepEqual(view.status(), ['Loading catalogue']);
        await view.finish(1);
        assert.deepEqual(view.status(), []);
        assert.match(view.container.textContent, /0 catalogue parts/);
    } finally {view.close();}
});

test('a failed retry reports the new error; a successful cached catalogue opens without another request', async () => {
    const view = mount();
    try {
        view.click('bw-sim-lab-catalogue-open');
        await view.finish(0, 'First failure');
        view.click('bw-sim-lab-catalogue-back');
        view.click('bw-sim-lab-catalogue-open');
        await view.finish(1, 'Retry failed');
        assert.deepEqual(view.status(), ['Catalogue unavailable: Retry failed']);
        view.click('bw-sim-lab-catalogue-back');
        view.click('bw-sim-lab-catalogue-open');
        await view.finish(2);
        view.click('bw-sim-lab-catalogue-back');
        view.click('bw-sim-lab-catalogue-open');
        assert.equal(view.requests.length, 3);
        assert.deepEqual(view.status(), []);
        assert.match(view.container.textContent, /0 catalogue parts/);
    } finally {view.close();}
});

test('closing and reopening a pending catalogue reuses its request', async () => {
    const view = mount();
    try {
        view.click('bw-sim-lab-catalogue-open');
        view.click('bw-sim-lab-catalogue-back');
        view.click('bw-sim-lab-catalogue-open');
        assert.equal(view.requests.length, 1);
        assert.deepEqual(view.status(), ['Loading catalogue']);
        await view.finish(0, 'Still offline');
        assert.deepEqual(view.status(), ['Catalogue unavailable: Still offline']);
    } finally {view.close();}
});
