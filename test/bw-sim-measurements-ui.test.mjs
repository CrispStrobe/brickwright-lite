// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as schema from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import * as readings from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import * as targetContext from '../overlay/scratch-gui/src/lib/bw-sim/measurements/target-context.js';

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const React = requireGui('react'), {renderToStaticMarkup} = requireGui('react-dom/server'), babel = requireGui('@babel/core');
const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/sim-lab-measurements.jsx', import.meta.url), 'utf8');
const code = babel.transformSync(source, {filename: 'sim-lab-measurements.jsx', babelrc: false, configFile: false,
    presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
const module = {exports: {}};
new Function('require', 'module', 'exports', code)(name => name.endsWith('/measurements/schema.js') ? schema :
    name.endsWith('/measurements/readings.js') ? readings : name.endsWith('/measurements/target-context.js') ? targetContext : requireGui(name), module, module.exports);
const Panel = module.exports.default;
const props = {locale: 'en', definitions: [{id: 'span', kind: 'distance', label: 'Axle span', targets: ['a', 'b'], visible: true}],
    rows: [{id: 'span', available: true, value: 36.2, unit: 'mm', source: 'part-origins'}],
    parts: [{id: 'a', label: 'Axle'}, {id: 'b', label: 'Wheel'}], mechanism: {joints: [], couplings: []},
    shown: false, replaying: false, onChange () {}, onShown () {}, onPresets () {}, onClose () {}};

test('measurement panel names targets, units, controls and provenance in English and German', () => {
    for (const locale of ['en', 'de']) {
        const html = renderToStaticMarkup(React.createElement(Panel, {...props, locale}));
        assert.match(html, /36.2 mm/); assert.match(html, /Axle span/);
        assert.match(html, /a · Axle/); assert.match(html, /b · Wheel/);
        assert.match(html, locale === 'en' ? /Part origins/ : /Teilursprünge/);
        assert.match(html, /bw-sim-lab-measurement-add/);
    }
});

test('pose replay hides current values and reports missing targets without fabricated zeroes', () => {
    const replay = renderToStaticMarkup(React.createElement(Panel, {...props, replaying: true}));
    assert.doesNotMatch(replay, /36.2 mm/); assert.match(replay, /hidden during pose replay/);
    const missing = renderToStaticMarkup(React.createElement(Panel, {...props, rows: [{id: 'span', available: false, reason: 'missing-target'}]}));
    assert.match(missing, /Target missing from model/); assert.doesNotMatch(missing, /0.0 mm/);
});

test('missing joint or rope choices cannot submit a measurement; labels are escaped', () => {
    const panel = new Panel(props);
    panel.state = {...panel.state, kind: 'tension'};
    assert.match(renderToStaticMarkup(panel.render()), /type="submit" disabled=""/);
    const html = renderToStaticMarkup(React.createElement(Panel, {...props, definitions: [{...props.definitions[0], label: '<script>bad</script>'}]}));
    assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/);
});


test('joint choices and stored rows describe their connected assembly parts', () => {
    const mechanism = {bodies: [{id: 'body', parts: ['wheel-axle']}], joints: [{id: 'j0', type: 'hinge', body1: 'world', body2: 'body'}], couplings: []};
    const panel = new Panel({...props, mechanism, definitions: [{id: 'turn', kind: 'jointAngle', label: 'Wheel', joint: 'j0', binding: 'legacy', visible: true}],
        rows: [{id: 'turn', available: true, value: 45, unit: '°', source: 'jolt-joint'}]});
    panel.state = {...panel.state, kind: 'jointAngle'};
    const html = renderToStaticMarkup(panel.render());
    assert.match(html, /Ground ↔ wheel-axle/); assert.doesNotMatch(html, /j0 · j0/);
});

test('model mass needs no part target and identifies its exclusion of scenery in both languages', () => {
    for (const locale of ['en', 'de']) {
        const panel = new Panel({...props, locale, definitions: [{id: 'total', kind: 'modelMass', label: 'modelMass', visible: true}],
            rows: [{id: 'total', available: true, value: 232.5, unit: 'g', source: 'configured-model-mass'}]});
        panel.state = {...panel.state, kind: 'modelMass'};
        const html = renderToStaticMarkup(panel.render());
        assert.match(html, /232.5 g/);
        assert.match(html, locale === 'en' ? /excluding scenery/ : /ohne Umgebung/);
        assert.doesNotMatch(html, /bw-sim-lab-measurement-target-/);
    }
});
