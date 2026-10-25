// Exercise the actual UI method without importing JSX or executing a guest.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';

const source = readFileSync(new URL('../overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx', import.meta.url), 'utf8');
const body = scopeAfter(source, 'async loadAsmExample (id) {');
const once = (text, anchor, replacement) => {
    assert.equal(text.split(anchor).length - 1, 1, `unique mutation anchor: ${anchor}`);
    return text.replace(anchor, replacement);
};
const setup = ({method = body, busy = false, current = 'owned source', confirm = async () => true, locale = 'en'} = {}) => {
    let prompts = 0;
    const component = {
        props: {locale}, state: {busy, buffers: {asm: current, pseudocode: 'preserved'}, asmMode: 'old', status: 'old'},
        L: {asmExampleReplace: 'replace?', asmExampleLoaded: label => `loaded ${label}`},
        _asmExamples: () => [{id: 'pins', source: 'exact example', label: 'Pins', labelDe: 'Anschluesse'}],
        setState (patch) { Object.assign(this.state, patch(this.state)); }
    };
    component.load = new Function('confirmAsync', 'pickLocale', `return async function (id) ${method}`)(
        async () => { prompts++; return confirm(); }, value => value);
    return {component, prompts: () => prompts};
};
const busyEntry = async method => {
    const {component, prompts} = setup({method, busy: true});
    const before = structuredClone(component.state);
    const buffers = component.state.buffers;
    await component.load('pins');
    assert.equal(prompts(), 1, 'accepted replacement still asks confirmation');
    assert.notEqual(component.state.buffers, buffers, 'accepted request must replace the captured buffer object');
    assert.equal(component.state.buffers.asm, 'exact example', 'accepted request must reserve newer editor buffers');
    assert.equal(component.state.buffers.pseudocode, before.buffers.pseudocode);
    assert.equal(component.state.busy, true);
    assert.equal(component.state.status, 'loaded Pins');
};
const confirmationRace = async method => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const {component, prompts} = setup({method, confirm: () => pending});
    const loading = component.load('pins');
    assert.equal(prompts(), 1);
    component.state.busy = true;
    const before = structuredClone(component.state);
    release(true);
    await loading;
    assert.equal(component.state.buffers.asm, 'exact example', 'confirmed request must own the newer editor buffer');
    assert.equal(component.state.buffers.pseudocode, before.buffers.pseudocode);
    assert.equal(component.state.busy, true);
    assert.equal(component.state.status, 'loaded Pins');
};

test('accepted method request reserves newer editor source during compilation', () => busyEntry(body));
test('compilation starting during confirmation preserves the accepted newer editor request', () => confirmationRace(body));
test('idle ASM example loading preserves other buffers and localized status', async () => {
    for (const locale of ['en', 'de']) {
        for (const current of ['', 'owned source']) {
            const {component, prompts} = setup({current, locale});
            await component.load('pins');
            assert.equal(prompts(), current ? 1 : 0);
            assert.deepEqual(component.state.buffers, {asm: 'exact example', pseudocode: 'preserved'});
            assert.equal(component.state.asmMode, 'source');
            assert.equal(component.state.status, `loaded ${locale === 'de' ? 'Anschluesse' : 'Pins'}`);
        }
    }
});
test('declined ASM replacement and unknown examples preserve all state', async () => {
    for (const id of ['pins', '', 'unknown']) {
        const {component, prompts} = setup({confirm: async () => false});
        const before = structuredClone(component.state);
        await component.load(id);
        assert.deepEqual(component.state, before);
        assert.equal(prompts(), id === 'pins' ? 1 : 0);
    }
});
test('ASM examples become available again after compilation finishes', async () => {
    const {component} = setup({busy: true, current: ''});
    await component.load('pins');
    assert.equal(component.state.buffers.asm, 'exact example');
    component.state.busy = false;
    await component.load('pins');
    assert.equal(component.state.buffers.asm, 'exact example');
});
test('dropping accepted buffer publication fails the ownership control', async () => {
    await assert.rejects(() => busyEntry(once(body, 'asm: example.source', 'asm: state.buffers.asm')),
        /accepted request must reserve/);
});
test('in-place buffer mutation fails captured editor ownership', async () => {
    await assert.rejects(() => busyEntry(once(body,
        'buffers: {...state.buffers, asm: example.source}',
        'buffers: Object.assign(state.buffers, {asm: example.source})')),
        /accepted request must replace the captured buffer object/);
});
test('the ASM picker busy expression disables pending work, with omission negative', () => {
    const picker = source.slice(source.indexOf('data-testid="bw-asm-examples"'));
    const opening = picker.slice(0, picker.indexOf('\n                                >'));
    const disabled = text => {
        const expression = text.match(/disabled=\{([^}]+)\}/);
        assert.ok(expression, 'ASM picker must have a disabled expression');
        return new Function(`return (${expression[1]});`);
    };
    const evaluate = disabled(opening);
    assert.equal(evaluate.call({state: {busy: true}}), true);
    assert.equal(evaluate.call({state: {busy: false}}), false);
    assert.throws(() => disabled(once(opening, 'disabled={this.state.busy}', '')), /must have a disabled expression/);
});
