// SPDX-License-Identifier: BSD-3-Clause
// Actual Sound provider with passive player/callback spies; no audio starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {scopeAfter} from './helpers/js-scope.mjs';
import {registerEditorMenuActions, runEditorMenuAction, getEditorMenuItems}
    from '../overlay/scratch-gui/src/lib/editor-menu-actions.js';
const source = readFileSync(new URL('../overlay/scratch-gui/src/containers/sound-editor.jsx', import.meta.url), 'utf8');
const method = (signature, args = '', extra = {}) => new Function(...Object.keys(extra),
    `return function(${args}) ${scopeAfter(source, signature)}`)(...Object.values(extra));
const effectTypes = Object.fromEntries(['FASTER', 'SLOWER', 'LOUDER', 'SOFTER', 'MUTE', 'FADEIN', 'FADEOUT', 'REVERSE', 'ROBOT', 'ECHO'].map(key => [key, key]));
function fixture () {
    const calls = [];
    const host = {_menuMounted: true, surface: 'sounds', loud: false,
        props: {soundId: 'sound', soundIndex: 0, sampleRate: 44100, isFullScreen: false,
            intl: {locale: 'en', formatMessage: ({defaultMessage}) => defaultMessage},
            vm: {editingTarget: {sprite: {sounds: [{soundId: 'sound'}]}}}},
        state: {copyBuffer: null, trimStart: null, trimEnd: null, playhead: null, chunkLevels: []},
        audioBufferPlayer: {buffer: {length: 4}},
        effectFactory: type => () => calls.push(['effect', type]), tooLoud() {return this.loud;}};
    for (const name of ['handleCopy', 'handlePaste', 'handleCopyToNew', 'handleDelete', 'handlePlay', 'handleStopPlaying']) {
        host[name] = () => calls.push([name]);
    }
    host.editorMenuActions = method('    editorMenuActions ()', '', {
        getUndoState: () => ({surface: host.surface}), AudioEffects: {effectTypes}});
    return {host, calls};
}

test('Sound menu routes real edit/play/effect callbacks and preserves sample, selection and clipboard guards', () => {
    const {host, calls} = fixture();
    const unregister = registerEditorMenuActions('test-sound-menu', () => host.editorMenuActions());
    try {
        assert.equal(getEditorMenuItems('test-sound-menu', 'edit').length, 16);
        for (const name of ['copy', 'copy-to-new', 'play', 'effect-faster', 'effect-reverse', 'effect-echo']) {
            assert.equal(runEditorMenuAction('test-sound-menu', name), true, name);
        }
        for (const name of ['paste', 'delete', 'stop', 'undo', 'redo']) assert.equal(runEditorMenuAction('test-sound-menu', name), false, name);
        host.state.trimStart = 0; host.state.trimEnd = 0.5;
        host.state.copyBuffer = {samples: new Float32Array([1]), sampleRate: 22050};
        assert.equal(runEditorMenuAction('test-sound-menu', 'paste'), true);
        assert.equal(runEditorMenuAction('test-sound-menu', 'delete'), true);
        host.state.playhead = 0;
        assert.equal(runEditorMenuAction('test-sound-menu', 'play'), false);
        assert.equal(runEditorMenuAction('test-sound-menu', 'stop'), true);
        host.loud = true;
        assert.equal(runEditorMenuAction('test-sound-menu', 'effect-louder'), false);
        host.audioBufferPlayer.buffer.length = 1;
        assert.equal(runEditorMenuAction('test-sound-menu', 'effect-softer'), false);
        assert.deepEqual(calls, [['handleCopy'], ['handleCopyToNew'], ['handlePlay'], ['effect', 'FASTER'],
            ['effect', 'REVERSE'], ['effect', 'ECHO'], ['handlePaste'], ['handleDelete'], ['handleStopPlaying']]);
    } finally {unregister();}
});

test('Sound refuses stale targets, other surfaces, disposed/fullscreen editors and malformed clipboard', () => {
    const {host} = fixture();
    host.props.vm.editingTarget.sprite.sounds[0].soundId = 'replacement';
    assert.equal(host.editorMenuActions(), null);
    host.props.vm.editingTarget.sprite.sounds[0].soundId = 'sound';
    host.surface = 'costumes'; assert.equal(host.editorMenuActions(), null);
    host.surface = 'sounds'; host._menuMounted = false; assert.equal(host.editorMenuActions(), null);
    host._menuMounted = true; host.props.isFullScreen = true; assert.equal(host.editorMenuActions(), null);
    host.props.isFullScreen = false; host.state.copyBuffer = {};
    assert.equal(host.editorMenuActions().paste.enabled, false);
    host.audioBufferPlayer = null;
    for (const action of Object.values(host.editorMenuActions())) assert.equal(action.enabled, false);
    host.audioBufferPlayer = {buffer: {length: 4}};
    host.props.intl = {locale: 'de', formatMessage: ({id}) => `de:${id}`};
    assert.equal(host.editorMenuActions()['effect-fadeIn'].submenu, 'Effekte');
    assert.equal(host.editorMenuActions().copy.label, 'de:gui.soundEditor.copy');
});

test('Sound notifications follow selection, clipboard, current sound and playing transitions, not audio frames', () => {
    let count = 0;
    const update = method('    componentDidUpdate (prevProps, prevState)', 'prevProps, prevState',
        {notifyEditorMenuActions: () => {count++;}});
    const {host} = fixture();
    for (const key of ['copyBuffer', 'trimStart', 'trimEnd', 'chunkLevels']) {
        const before = {...host.state}; host.state[key] = {};
        const previous = count; update.call(host, host.props, before); assert.equal(count, previous + 1, key);
    }
    host.state.playhead = 0;
    const previous = count; update.call(host, host.props, {...host.state, playhead: null});
    assert.equal(count, previous + 1, 'zero is an active playback position');
    update.call(host, host.props, {...host.state, playhead: 0.8});
    assert.equal(count, previous + 1, 'audio callback frames do not churn the menu');
    assert.match(scopeAfter(source, '    componentDidMount ()'), /registerEditorMenuActions\('sounds'/);
    assert.match(scopeAfter(source, '    componentWillUnmount ()'), /this\._menuMounted = false;[\s\S]*this\.unregisterMenu\(\)/);
});
