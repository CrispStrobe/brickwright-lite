import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import JSZip from 'jszip';
import install, {appliedProjectDevice} from '../overlay/scratch-gui/src/lib/saved-project-device-publication.js';
import {runProgram} from './helpers/bw-vm.mjs';

function fixture() {
    const runtime = new EventEmitter(), events = new EventTarget();
    let stage = {};
    runtime.getTargetForStage = () => stage;
    const vm = {runtime}, seen = [];
    events.addEventListener('bw-settings-change', event => seen.push(event.detail));
    const uninstall = install(vm, {events, coreOfDevice: device => `${device}-core`});
    return {vm, runtime, events, seen, uninstall, stage: value => {stage = value;}};
}
test('completed load publishes saved device and clears prior flags for a generic project', async () => {
    const f = fixture();f.runtime.stc = {version: 1, device: 'ARCADE'};
    f.runtime.emit('PROJECT_LOADED');
    assert.equal(f.runtime.bwDeviceId, 'arcade');
    await Promise.resolve();await Promise.resolve();await Promise.resolve();
    assert.equal(f.runtime.bwDeviceCore, 'arcade-core');
    f.stage({});f.runtime.stc = null;f.runtime.emit('PROJECT_LOADED');
    assert.equal(f.runtime.bwDeviceId, null);assert.equal(f.runtime.bwDeviceCore, null);
    assert.deepEqual(f.seen.map(row => row.value), ['arcade', '']);f.uninstall();
});
test('explicit current-project board choice wins, previous-project choices do not leak', () => {
    const f = fixture();f.runtime.stc = {device: 'microbit'};
    f.events.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-device-id', value: 'calliopemini'}}));
    f.runtime.emit('PROJECT_LOADED');assert.equal(f.runtime.bwDeviceId, 'calliopemini');
    f.stage({});f.runtime.stc = {device: 'arcade'};f.runtime.emit('PROJECT_LOADED');
    assert.equal(f.runtime.bwDeviceId, 'arcade');f.uninstall();
});
test('late metadata resolution cannot change a replaced project or a disposed publisher', async () => {
    const runtime = new EventEmitter();runtime.getTargetForStage = () => ({});
    const pending = [];
    const uninstall = install({runtime}, {events: null, coreOfDevice: () => new Promise(resolve => pending.push(resolve))});
    runtime.stc = {device: 'arcade'};runtime.emit('PROJECT_LOADED');await Promise.resolve();
    runtime.stc = {device: 'microbit'};runtime.emit('PROJECT_LOADED');await Promise.resolve();
    pending[0]('old-core');await Promise.resolve();await Promise.resolve();
    assert.equal(runtime.bwDeviceId, 'microbit');assert.equal(runtime.bwDeviceCore, null);
    uninstall();pending[1]('disposed-core');await Promise.resolve();await Promise.resolve();
    assert.equal(runtime.bwDeviceCore, null);
});
test('installation is idempotent and uninstallation releases all subscriptions', () => {
    const f = fixture();assert.equal(install(f.vm, {events: f.events}), false);
    assert.equal(f.runtime.listenerCount('PROJECT_LOADED'), 1);f.uninstall();
    assert.equal(f.runtime.listenerCount('PROJECT_LOADED'), 0);
});
test('real SB3 reload publishes hardware; whole-project metadata absence clears it without extension inference', async () => {
    const run = await runProgram('DEVICE ARCADE\nSPRITE Game:\nWHEN flag clicked:\n  hide\n', {frames: 2, storage: true});
    const f = new EventTarget();const notices = [];
    f.addEventListener('bw-settings-change', event => notices.push(event.detail.value));
    const uninstall = install(run.vm, {events: f, coreOfDevice: () => 'arm'});
    try {
        const saved = await run.vm.saveProjectSb3();
        const savedBytes = Buffer.from(await saved.arrayBuffer());
        await run.vm.loadProject(savedBytes);
        assert.equal(run.vm.runtime.stc.device.toLowerCase(), 'arcade');
        assert.equal(run.vm.runtime.bwDeviceId, 'arcade');
        const sprite = run.vm.runtime.targets.find(target => target.isOriginal && !target.isStage);
        const spriteFile = await run.vm.exportSprite(sprite.id, 'nodebuffer');
        await run.vm.addSprite(spriteFile);
        assert.equal(run.vm.runtime.stc.device.toLowerCase(), 'arcade', 'Importing a sprite preserves project hardware');
        assert.equal(run.vm.runtime.bwDeviceId, 'arcade');
        const archive = await JSZip.loadAsync(savedBytes);
        const generic = JSON.parse(await archive.file('project.json').async('string'));delete generic.stc;
        generic.extensions = ['arcade'];
        archive.file('project.json', JSON.stringify(generic));
        await run.vm.loadProject(await archive.generateAsync({type: 'nodebuffer'}));
        assert.equal(run.vm.runtime.stc, null);assert.equal(run.vm.runtime.bwDeviceId, null);
        assert.deepEqual(notices, ['arcade', '']);
    } finally {uninstall();run.vm.quit?.();}
});


test('pane device reading preserves explicit empty selection and canonicalizes saved metadata', () => {
    assert.equal(appliedProjectDevice({stc: {device: 'ARCADE'}}), 'arcade');
    assert.equal(appliedProjectDevice({stc: {device: 'arcade'}, bwDeviceId: null}), '');
    assert.equal(appliedProjectDevice({stc: {device: 'microbit'}, bwDeviceId: 'calliopemini'}), 'calliopemini');
    assert.equal(appliedProjectDevice(null), '');
});
