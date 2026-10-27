// The About dialog lists every app of the developer account with its App Store
// and/or TestFlight link (components/menu-bar/app-showcase.jsx).
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const data = await import('../overlay/scratch-gui/src/components/menu-bar/app-showcase-data.js');
const {mergeApps, slugOf} = await import('../scripts/refresh-app-showcase.mjs');
const load = () => {
    const babel = requireGui('@babel/core');
    const source = readFileSync(new URL('../overlay/scratch-gui/src/components/menu-bar/app-showcase.jsx', import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename: 'app-showcase.jsx', babelrc: false, configFile: false,
        presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    new Function('require', 'module', 'exports', code)(name => (name === './app-showcase-data.js' ? data : requireGui(name)),
        module, module.exports);
    return module.exports;
};

test('every listed app has its icon, a description in both languages and only Apple links', () => {
    const {APPS} = load();
    assert.ok(APPS.length >= 19);
    assert.equal(new Set(APPS.map(app => app.slug)).size, APPS.length);
    for (const app of APPS) {
        assert.ok(existsSync(new URL(`../overlay/scratch-gui/static/app-showcase/${app.slug}.png`, import.meta.url)), `${app.slug} icon`);
        assert.ok(app.en && app.de, `${app.slug} description`);
        if (app.store) assert.match(app.store, /^\d{9,11}$/, `${app.slug} App Store id`);
        if (app.beta) assert.match(app.beta, /^[A-Za-z0-9]{8}$/, `${app.slug} TestFlight code`);
    }
    assert.equal(APPS.filter(app => app.self).map(app => app.slug).join(), 'brickwright');
});

test('the showcase renders App Store, Mac App Store, TestFlight and coming-soon entries', () => {
    const React = requireGui('react');
    const {renderToStaticMarkup} = requireGui('react-dom/server');
    const {default: AppShowcase} = load();
    const en = renderToStaticMarkup(React.createElement(AppShowcase, {locale: 'en'}));
    assert.match(en, /href="https:\/\/apps\.apple\.com\/app\/id6788990894"/);
    assert.match(en, /href="https:\/\/testflight\.apple\.com\/join\/UngCMwHZ"/);
    assert.match(en, />Mac App Store</);
    assert.match(en, />Coming soon</);
    assert.doesNotMatch(en, /href="(?!https:\/\/(apps|testflight)\.apple\.com\/)/, 'no other link targets');
    assert.match(renderToStaticMarkup(React.createElement(AppShowcase, {locale: 'de-DE'})), /Bald verfügbar/);
});

test('the About dialog loads the showcase lazily and isolates its failure', () => {
    const about = readFileSync(new URL('../overlay/scratch-gui/src/components/menu-bar/bw-about.jsx', import.meta.url), 'utf8');
    assert.match(about, /React\.lazy\(\(\) => import\(\/\* webpackChunkName: "about-apps" \*\/ '\.\/app-showcase\.jsx'\)\)/);
    assert.doesNotMatch(about, /^import .*app-showcase/m);
    assert.match(about, /<EditorErrorBoundary name=\{t\('apps'\)\}>/);
});

test('the refresh keeps hand-written texts and local icons, and flags what a human must write', () => {
    const current = [{slug: 'old', id: '1', name: 'Old', beta: 'AAAAAAAA', icon: 'local', en: 'Hand text', de: 'Handtext'},
        {slug: 'gone', id: '2', name: 'Gone', en: 'x', de: 'y'}];
    const apple = [
        {id: '1', name: 'Old', bundleId: 'b.old', subtitle: {en: 'Apple text'}, betaCode: 'BBBBBBBB', store: {mac: true}},
        {id: '3', name: 'Naga - The Snake Game', bundleId: 'com.crispstrobe.brickwright', subtitle: {}, betaCode: null, store: null}
    ];
    const {apps, notes} = mergeApps(current, apple);
    assert.deepEqual(apps[1], {slug: 'old', id: '1', name: 'Old', store: '1', mac: true, beta: 'BBBBBBBB', icon: 'local',
        en: 'Apple text', de: 'Handtext'}, 'Apple subtitles win; a missing one keeps the hand-written text');
    assert.equal(apps[0].slug, 'naga');
    assert.equal(apps[0].self, true);
    assert.equal(apps[0].en, '');
    assert.ok(notes.some(note => /Naga.*no en description/.test(note)));
    assert.ok(notes.some(note => /Gone: no longer/.test(note)));
    assert.equal(slugOf('Word Universe'), 'word-universe');
});
