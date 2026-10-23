// SPDX-License-Identifier: BSD-3-Clause
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import * as schema from '../overlay/scratch-gui/src/lib/bw-sim/measurements/schema.js';
import * as readings from '../overlay/scratch-gui/src/lib/bw-sim/measurements/readings.js';
import * as targetContext from '../overlay/scratch-gui/src/lib/bw-sim/measurements/target-context.js';
import * as history from '../overlay/scratch-gui/src/lib/bw-sim/measurements/history.js';

const requireGui = createRequire(new URL('../packages/scratch-gui/package.json', import.meta.url));
const React = requireGui('react'), {renderToStaticMarkup} = requireGui('react-dom/server'), babel = requireGui('@babel/core');
const loadJSX = name => {
    const source = readFileSync(new URL(`../overlay/scratch-gui/src/components/tw-pseudocode/${name}`, import.meta.url), 'utf8');
    const code = babel.transformSync(source, {filename: name, babelrc: false, configFile: false,
        presets: [requireGui.resolve('@babel/preset-react')], plugins: [requireGui.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
    const module = {exports: {}};
    new Function('require', 'module', 'exports', code)(name => name.endsWith('/measurements/schema.js') ? schema :
        name.endsWith('/measurements/readings.js') ? readings : name.endsWith('/measurements/target-context.js') ? targetContext :
            name.endsWith('/measurements/history.js') ? history : name === './sim-lab-measurement-plot.jsx' ? loadJSX('sim-lab-measurement-plot.jsx') : requireGui(name), module, module.exports);
    return module.exports;
};
const Panel = loadJSX('sim-lab-measurements.jsx').default;
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

const findElement = (element, predicate) => {
    if (!element || typeof element !== 'object') return null;
    if (predicate(element)) return element;
    for (const child of [element.props?.children].flat(Infinity)) {
        const found = findElement(child, predicate); if (found) return found;
    }
    return null;
};
test('plot selection requests a real fresh reading, uses its actual time and clears for replay', () => {
    const session = {}, panel = new Panel({...props, session, sampleTime: 0, paused: true});
    panel.setState = (update, callback) => {Object.assign(panel.state, update); callback?.();};
    panel.props.onSample = () => {panel.props = {...panel.props, rows: props.rows.map(r => ({...r})), sampleTime: 50};};
    panel.render();
    const toggle = findElement(panel.render(), e => e.props?.['data-testid'] === 'bw-sim-measurement-plot-toggle-span');
    toggle.props.onChange({target: {checked: true}});
    let html = renderToStaticMarkup(panel.render());
    assert.match(html,/data-testid="bw-sim-measurement-plot"/); assert.match(html,/Simulation time from window start/);
    assert.deepEqual(panel.history.update({session,definitions:props.definitions,selected:['span'],rows:panel.props.rows,time:50,paused:true}).get('span'),[{time:50,value:36.2}]);
    panel.props={...panel.props,replaying:true};html=renderToStaticMarkup(panel.render());
    assert.doesNotMatch(html,/<svg/);assert.match(html,/hidden during pose replay/);
    panel.props={...panel.props,replaying:false};html=renderToStaticMarkup(panel.render());
    assert.match(html,/No available time samples yet/);
});
test('four plot selections bound the UI and applying a lesson is an explicit edit', () => {
    const definitions=Array.from({length:5},(_,i)=>({...props.definitions[0],id:`m${i}`}));
    let submitted;
    const panel=new Panel({...props,definitions,teachingPreset:{title:'Crank and rocker',definitions:[definitions[4]]},onChange:value=>{submitted=value;}});
    panel.state.plots=definitions.slice(0,4).map(d=>d.id);
    const tree=panel.render(), fifth=findElement(tree,e=>e.props?.['data-testid']==='bw-sim-measurement-plot-toggle-m4');
    assert.equal(fifth.props.disabled,true);assert.equal(submitted,undefined);
    findElement(tree,e=>e.props?.['data-testid']==='bw-sim-measurement-teaching-preset').props.onClick();
    assert.deepEqual(submitted,[definitions[4]]);
});

test('plot labels remain accessible in both languages and unavailable endpoints retain gaps', () => {
    for(const locale of ['en','de']) {
        const panel=new Panel({...props,locale,session:{},sampleTime:0});panel.state.plots=['span'];
        let html=renderToStaticMarkup(panel.render());
        assert.match(html,locale==='de'?/Simulationszeit seit Fensterbeginn/:/Simulation time from window start/);
        assert.match(html,locale==='de'?/Aktuell 36.2 mm/:/Current 36.2 mm/);
        panel.props={...panel.props,sampleTime:100,rows:[{id:'span',available:false,value:null}]};
        html=renderToStaticMarkup(panel.render());
        assert.match(html,locale==='de'?/Aktuell Nicht verfügbar/:/Current Unavailable/);
        assert.match(html,/min 36.2 mm; max 36.2 mm/);
        assert.doesNotMatch(html,/<polyline/,'an unavailable endpoint never connects to a fabricated zero');
    }
});
