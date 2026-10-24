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

// Exercise the rendered component's actual controls, with only React's unmounted
// state callback boundary made synchronous. These are not guest physics fixtures.
const editorFixture = overrides => {
    const changes = [], focus = {count: 0};
    const panel = new Panel({...props, session: {model: {}},
        parts: ['a', 'b', 'c', 'd'].map(id => ({id, label: id})),
        ...overrides, onChange (definitions) {
            changes.push(definitions);
            panel.props = {...panel.props, definitions};
        }});
    panel.setState = (update, callback) => {
        Object.assign(panel.state, typeof update === 'function' ? update(panel.state, panel.props) : update);
        callback?.();
    };
    const button = {isConnected: true, focus () {focus.count++;}};
    const control = id => {
        const found = findElement(panel.render(), e => e.props?.['data-testid'] === id);
        assert.ok(found, `rendered control ${id}`);
        return found;
    };
    const edit = id => control(`bw-sim-lab-measurement-edit-${id}`).props.onClick({currentTarget: button});
    const name = value => {
        const input = findElement(panel.render(), e => e.type === 'input' && e.props.maxLength === 80);
        assert.ok(input); input.props.onChange({target: {value}});
    };
    const choose = (id, value) => control(id).props.onChange({target: {value}});
    const submit = () => control('bw-sim-lab-measurement-editor').props.onSubmit({preventDefault () {}});
    return {panel, changes, focus, control, edit, name, choose, submit};
};
const bindingFixture = () => ({
    bodies: [{id: 'left', parts: ['a']}, {id: 'right', parts: ['b']}, {id: 'other', parts: ['c']}],
    joints: [{id: 'j0', type: 'hinge', body1: 'left', body2: 'right'},
        {id: 'j1', type: 'hinge', body1: 'left', body2: 'other'}],
    couplings: [{id: 'r0', kind: 'rope', parts: ['a', 'b']}, {id: 'r1', kind: 'rope', parts: ['a', 'c']}]
});

test('editing replaces one stable row and preserves latest visibility, other rows and plot selection', () => {
    const definitions = [{id: 'other', kind: 'mass', label: 'Other', targets: ['a'], visible: true},
        {...props.definitions[0], targets: ['a', 'b']}];
    const f = editorFixture({definitions}); f.panel.state.plots = ['span'];
    f.edit('span'); f.name('Edited span');
    f.choose('bw-sim-lab-measurement-target-1', 'c');
    f.panel.props = {...f.panel.props, definitions: [{...definitions[0], label: 'Latest other'}, {...definitions[1], visible: false}]};
    f.submit();
    assert.equal(f.changes.length, 1);
    assert.deepEqual(f.changes[0].map(d => d.id), ['other', 'span']);
    assert.equal(f.changes[0][0].label, 'Latest other');
    assert.deepEqual(f.changes[0][1], {id: 'span', kind: 'distance', label: 'Edited span', targets: ['a', 'c'], visible: false});
    assert.deepEqual(f.panel.state.plots, ['span']); assert.equal(f.focus.count, 1);
    assert.deepEqual(definitions[1].targets, ['a', 'b'], 'the editor did not mutate the original target array');
    assert.deepEqual(schema.measurementDefinitions(f.changes[0]), f.changes[0]);
});

test('Cancel never changes definitions and returns focus to the invoking row', () => {
    const original = Object.freeze({...props.definitions[0], targets: Object.freeze(['a', 'b'])});
    const f = editorFixture({definitions: Object.freeze([original])});
    f.edit('span'); f.name('Unsaved'); f.choose('bw-sim-lab-measurement-target-1', 'c');
    f.control('bw-sim-lab-measurement-cancel').props.onClick();
    assert.equal(f.changes.length, 0); assert.equal(f.panel.props.definitions[0], original);
    assert.equal(f.focus.count, 1); assert.ok(f.control('bw-sim-lab-measurement-add'));
});

test('the 64-definition limit blocks Add while an existing definition can still be edited', () => {
    const definitions = Array.from({length: schema.MEASUREMENT_LIMIT}, (_, i) => ({...props.definitions[0], id: `m${i}`, targets: ['a', 'b']}));
    const f = editorFixture({definitions});
    assert.equal(f.control('bw-sim-lab-measurement-add').props.disabled, true);
    f.edit('m63'); f.name('Last measurement'); f.submit();
    assert.equal(f.changes.length, 1); assert.equal(f.changes[0].length, 64);
    assert.equal(f.changes[0][63].id, 'm63'); assert.equal(f.changes[0][63].label, 'Last measurement');
});

test('joint and rope edits use their selected targets current bindings and discard inapplicable fields', () => {
    const mechanism = bindingFixture();
    const definitions = [{id: 'turn', kind: 'jointAngle', label: 'jointAngle', joint: 'j0', binding: readings.jointBinding(mechanism, mechanism.joints[0]), visible: true},
        {id: 'pull', kind: 'tension', label: 'Rope load', rope: 'r0', binding: readings.ropeBinding(mechanism.couplings[0]), visible: false}];
    const f = editorFixture({mechanism, definitions, rows: []});
    f.edit('turn'); assert.equal(f.control('bw-sim-lab-measurement-joint').props.value, 'j0');
    f.choose('bw-sim-lab-measurement-joint', 'j1'); f.submit();
    assert.equal(f.changes[0][0].joint, 'j1');
    assert.equal(f.changes[0][0].binding, readings.jointBinding(mechanism, mechanism.joints[1]));
    assert.equal(f.changes[0][0].label, 'jointAngle', 'a target-only edit preserves automatic localization');
    f.edit('pull'); f.choose('bw-sim-lab-measurement-rope', 'r1'); f.submit();
    assert.equal(f.changes[1][1].rope, 'r1'); assert.equal(f.changes[1][1].binding, readings.ropeBinding(mechanism.couplings[1]));
    assert.equal(f.changes[1][1].visible, false);
    f.edit('turn'); f.choose('bw-sim-lab-measurement-kind', 'mass'); f.choose('bw-sim-lab-measurement-target-0', 'a'); f.name('Assembly'); f.submit();
    assert.deepEqual(f.changes[2][0], {id: 'turn', kind: 'mass', label: 'Assembly', targets: ['a'], visible: true});
});

test('legacy or reused joint and rope IDs require explicit target confirmation, never first-option fallback', () => {
    for (const scenario of ['legacy-joint', 'reused-joint', 'reused-rope']) {
        const mechanism = bindingFixture(), rope = scenario === 'reused-rope';
        const definition = rope ? {id: 'saved', kind: 'tension', label: 'Saved', rope: 'r0', binding: readings.ropeBinding(mechanism.couplings[0])} :
            {id: 'saved', kind: 'jointAngle', label: 'Saved', joint: 'j0', binding: readings.jointBinding(mechanism, mechanism.joints[0])};
        if (scenario === 'legacy-joint') definition.binding = JSON.stringify(['hinge', ['a'], ['b']]);
        else if (rope) mechanism.couplings[0].parts = ['a', 'd'];
        else mechanism.bodies[1].parts = ['d'];
        const field = rope ? 'rope' : 'joint', id = rope ? 'r0' : 'j0';
        const f = editorFixture({mechanism, definitions: [definition], rows: []});
        f.edit('saved'); f.name('Name only');
        assert.equal(f.control(`bw-sim-lab-measurement-${field}`).props.value, '');
        f.submit(); assert.equal(f.changes.length, 0, scenario);
        f.choose(`bw-sim-lab-measurement-${field}`, id); f.submit();
        assert.equal(f.changes.length, 1); assert.equal(f.changes[0][0].id, 'saved');
        assert.equal(f.changes[0][0].binding, rope ? readings.ropeBinding(mechanism.couplings[0]) : readings.jointBinding(mechanism, mechanism.joints[0]));
    }
});

test('Save rechecks bindings changed in place after Edit and requires same-ID reselection', () => {
    for (const rope of [false, true]) {
        const mechanism = bindingFixture();
        const definition = rope ? {id: 'saved', kind: 'tension', label: 'Saved', rope: 'r0', binding: readings.ropeBinding(mechanism.couplings[0])} :
            {id: 'saved', kind: 'jointAngle', label: 'Saved', joint: 'j0', binding: readings.jointBinding(mechanism, mechanism.joints[0])};
        const f = editorFixture({mechanism, definitions: [definition], rows: []}); f.edit('saved'); f.name('Changed name');
        if (rope) mechanism.couplings[0].parts = ['a', 'd']; else mechanism.bodies[1].parts = ['d'];
        f.submit(); assert.equal(f.changes.length, 0);
        const field = rope ? 'rope' : 'joint';
        assert.equal(f.control(`bw-sim-lab-measurement-${field}`).props.value, '');
        f.choose(`bw-sim-lab-measurement-${field}`, rope ? 'r0' : 'j0'); f.submit();
        assert.equal(f.changes.length, 1); assert.notEqual(f.changes[0][0].binding, definition.binding);
    }
});

test('a pending submit refuses replaced sessions, changed or removed definitions and missing parts', () => {
    for (const scenario of ['session', 'definition', 'removed', 'part']) {
        const f = editorFixture({definitions: structuredClone(props.definitions)}); f.edit('span'); f.name('Unsaved');
        const submit = f.control('bw-sim-lab-measurement-editor').props.onSubmit;
        const previous = f.panel.props;
        if (scenario === 'session') f.panel.props = {...previous, session: {model: previous.session.model}};
        if (scenario === 'definition') f.panel.props = {...previous, definitions: [{...previous.definitions[0], label: 'External change'}]};
        if (scenario === 'removed') f.panel.props = {...previous, definitions: []};
        if (scenario === 'part') f.panel.props = {...previous, parts: previous.parts.filter(p => p.id !== 'b')};
        f.panel.componentDidUpdate(previous);
        submit({preventDefault () {}});
        assert.equal(f.changes.length, 0, scenario);
        assert.ok(f.control('bw-sim-lab-measurement-editor-status'));
    }
});

test('both preset actions cancel a draft even when the replacement definition is identical', () => {
    for (const lesson of [false, true]) {
        let presets = 0;
        const f = editorFixture({teachingPreset: {title: 'Lesson', definitions: props.definitions}, onPresets () {presets++;}});
        f.edit('span'); f.name('Unsaved');
        const action = lesson ? f.control('bw-sim-measurement-teaching-preset') : findElement(f.panel.render(), e =>
            e.type === 'button' && e.props.children === 'Reset to recommended measurements');
        assert.ok(action); action.props.onClick();
        assert.ok(f.control('bw-sim-lab-measurement-add'));
        assert.equal(lesson ? f.changes.length : presets, 1);
        if (lesson) assert.equal(f.changes[0][0].label, props.definitions[0].label);
        const restoredFocus = f.focus.count;
        action.props.onClick();
        assert.equal(f.focus.count, restoredFocus, 'a preset action without an active edit does not jump to an old row');
    }
});
