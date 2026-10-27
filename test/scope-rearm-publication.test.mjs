import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'verify-circuit-ux.mjs'), 'utf8');
const begin = '    // BEGIN SCOPE_REARM_PUBLICATION_PREDICATE\n';
const end = '    // END SCOPE_REARM_PUBLICATION_PREDICATE';
assert.equal(source.split(begin).length - 1, 1, 'one actual predicate start boundary');
assert.equal(source.split(end).length - 1, 1, 'one actual predicate end boundary');
const predicateSource = source.slice(source.indexOf(begin) + begin.length, source.indexOf(end)).trim();
const load = text => vm.runInNewContext(`(${text})`, Object.create(null),
    {filename: 'scope-rearm-publication-predicate.js'});
const predicate = load(predicateSource);

function publishedSample() {
    const board = {};
    const selector = {isConnected: true, value: 'sample', disabled: false};
    const owner = {isConnected: true};
    const adc = {isConnected: true, checked: false, disabled: false};
    return {
        expectedMode: 'sample', expectedBoard: board, board,
        expectedSelector: selector, selector, activeElement: selector, expectedOwner: owner, owner, adcOwner: owner, adc,
        selectorCount: 1, ownerSelectorCount: 1, adcCount: 1, ownerAdcCount: 1,
        channels: [],
    };
}

const changed = (state, patch) => Object.assign({...state}, patch);

test('actual source predicate accepts only committed removal and sample publication', () => {
    const sample = publishedSample();
    assert.equal(predicate(sample), true, 'committed sample state');
    assert.equal(predicate(changed(sample, {
        expectedMode: 'envelope',
        selector: {...sample.selector, value: 'envelope'},
        expectedSelector: sample.expectedSelector,
        adc: {...sample.adc, disabled: true},
    })), false, 'a replacement selector is not the retained real selector');

    const envelopeSelector = {isConnected: true, value: 'envelope', disabled: false};
    assert.equal(predicate(changed(sample, {
        expectedMode: 'envelope', selector: envelopeSelector, expectedSelector: envelopeSelector,
        adc: {...sample.adc, disabled: true},
    })), true, 'committed envelope removal state');
    assert.equal(predicate(changed(sample, {adc: {...sample.adc, disabled: true}})), false,
        'native sample DOM before React publishes the old disabled ADC state');

    const retainedSelector = patch => {
        const selector = {...sample.selector, ...patch};
        return changed(sample, {selector, expectedSelector: selector});
    };
    const disconnectedOwner = {isConnected: false};
    const negatives = [
        ['Board replacement', changed(sample, {board: {}})],
        ['selector replacement', changed(sample, {selector: {...sample.selector}})],
        ['owner replacement', changed(sample, {owner: {isConnected: true}})],
        ['ADC owner replacement', changed(sample, {adcOwner: {isConnected: true}})],
        ['duplicate page selector', changed(sample, {selectorCount: 2})],
        ['duplicate owner selector', changed(sample, {ownerSelectorCount: 2})],
        ['duplicate page ADC', changed(sample, {adcCount: 2})],
        ['duplicate owner ADC', changed(sample, {ownerAdcCount: 2})],
        ['disconnected selector', retainedSelector({isConnected: false})],
        ['disconnected owner', changed(sample, {owner: disconnectedOwner,
            expectedOwner: disconnectedOwner, adcOwner: disconnectedOwner})],
        ['disconnected ADC', changed(sample, {adc: {...sample.adc, isConnected: false}})],
        ['disabled selector', retainedSelector({disabled: true})],
        ['wrong mode', retainedSelector({value: 'envelope'})],
        ['unsupported expected mode', changed(sample, {expectedMode: 'average'})],
        ['lost focused selector', changed(sample, {activeElement: {}})],
        ['checked ADC', changed(sample, {adc: {...sample.adc, checked: true}})],
        ['real channel remains', changed(sample, {channels: [17]})],
        ['unreadable channels', changed(sample, {channels: null})],
    ];
    for (const [name, state] of negatives) assert.equal(predicate(state), false, name);
});

test('named source-backed mutants prove Board, DOM, ADC and channel fences are load-bearing', () => {
    const sample = publishedSample();
    const mutations = [
        ['omit Board identity', 'return boardIdentity && ', 'return ', {board: {}}],
        ['omit DOM identity', 'domIdentity && ', '', {selector: {...sample.selector}}],
        ['omit ADC publication', '            && adcPublication && focusPublication && channelPublication;',
            '            && focusPublication && channelPublication;', {adc: {...sample.adc, checked: true}}],
        ['omit focused selector', ' && focusPublication && ', ' && ', {activeElement: {}}],
        ['omit real-channel publication', ' && channelPublication;', ';', {channels: [23]}],
    ];
    for (const [name, anchor, replacement, patch] of mutations) {
        assert.equal(predicateSource.split(anchor).length - 1, 1, `${name} source anchor`);
        const control = changed(sample, patch);
        assert.equal(predicate(control), false, `${name} negative control`);
        const mutant = load(predicateSource.replace(anchor, replacement));
        assert.equal(mutant(control), true, `${name} must be detected by the actual-source control`);
    }
});

test('observer source stays passive, capture-phase and finally-owned', () => {
    const start = source.indexOf('function scopeRearmPublicationObserverFactory');
    const stop = source.indexOf("if (!existsSync(join(build, 'index.html'))", start);
    assert.ok(start >= 0 && stop > start);
    const observer = source.slice(start, stop);
    assert.match(observer, /document\.addEventListener\(type, observe, \{capture: true, passive: true\}\)/);
    assert.match(observer, /document\.removeEventListener\(type, observe, true\)/);
    assert.match(observer, /isTrusted: event\.isTrusted/);
    assert.doesNotMatch(observer, /isTrusted\s*===|isTrusted\s*!==/,
        'Playwright provenance is recorded, never mislabelled as hardware trust');
    assert.doesNotMatch(observer, /dispatchEvent|setTimeCapture|setADCEnabled|addScopeChannel|removeScopeChannel|advanceTo/);
    assert.match(source, /try\{return observer\.snapshot\(\);\} finally\{observer\.stop\(\);\}/);
});


const actionStart = '// BEGIN SCOPE_POINT_KEYBOARD_ACTION\n';
const actionEnd = '// END SCOPE_POINT_KEYBOARD_ACTION';
assert.equal(source.split(actionStart).length - 1, 1);
assert.equal(source.split(actionEnd).length - 1, 1);
const actionSource = source.slice(source.indexOf(actionStart) + actionStart.length,
    source.indexOf(actionEnd)).trim();
const keyboardAction = load(actionSource);

test('actual action uses one focus and one native key, refuses lost publication without retry', async () => {
    const run = async ({mode = 'envelope', ready = true, connected = true} = {}) => {
        const calls = [];
        const document = {activeElement: null};
        const target = {value: mode, isConnected: connected, ownerDocument: document};
        const selector = {
            evaluate: async callback => {calls.push('read'); return callback(target);},
            focus: async () => {calls.push('focus'); document.activeElement = target;},
            press: () => {throw new Error('Locator press would focus a second time');},
            selectOption: () => {throw new Error('No synthetic selection or fallback');},
        };
        const keyboard = {press: async key => {calls.push(key); target.value = 'sample';}};
        const observer = {evaluate: async callback => {calls.push('publication');
            return callback({readyForKeyboard: () => ready
                && document.activeElement === target && target.isConnected && target.value === 'envelope'});}};
        try {return {calls, target, result: await keyboardAction(selector, observer, keyboard)};}
        catch (error) {return {calls, target, error};}
    };
    const success = await run();
    assert.deepEqual(success.calls, ['read', 'focus', 'publication', 'ArrowDown', 'read']);
    assert.equal(success.result.kind, 'native-keyboard');
    assert.equal(success.result.key, 'ArrowDown');
    assert.equal(success.result.before.mode, 'envelope');
    assert.equal(success.result.after.mode, 'sample');
    assert.equal(success.result.before.connected, true);
    assert.equal(success.result.after.connected, true);
    assert.equal(success.result.after.focused, true);
    const lost = await run({ready: false});
    assert.ok(lost.error, 'lost focus/publication must refuse before the native key');
    assert.match(lost.error.message, /FOCUS_PUBLICATION/);
    assert.deepEqual(lost.calls, ['read', 'focus', 'publication']);
    const disconnected = await run({connected: false});
    assert.ok(disconnected.error, 'disconnected selector must refuse before focus');
    assert.deepEqual(disconnected.calls, ['read'], 'disconnected selector must refuse before focus');
    assert.match(disconnected.error.message, /PRESTATE/);
    const wrong = await run({mode: 'sample'});
    assert.match(wrong.error.message, /PRESTATE/);
    assert.deepEqual(wrong.calls, ['read']);
    assert.doesNotMatch(actionSource, /selectOption|dispatchEvent|setTimeout|waitForTimeout|\.value\s*=|\bwhile\b|\bfor\s*\(/);
});
