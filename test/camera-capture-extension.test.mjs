import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const extensionSource = readFileSync(new URL(
    '../overlay/scratch-vm/src/extensions/crispstrobe/cameracapture/index.js', import.meta.url), 'utf8');
const extensionModule = {exports: {}};
const dependencies = new Map([
    ['../../../engine/runtime', class Runtime { static PROJECT_STOP_ALL = 'PROJECT_STOP_ALL'; }],
    ['../../../extension-support/argument-type', {STRING: 'string', NUMBER: 'number'}],
    ['../../../extension-support/block-type', {COMMAND: 'command', BOOLEAN: 'Boolean', REPORTER: 'reporter'}],
    ['../../../util/cast', {toNumber: value => Number(value) || 0}],
    ['../../../io/video', {FORMAT_CANVAS: 'canvas'}]
]);
new Function('require', 'module', 'exports', extensionSource)(
    id => dependencies.get(id), extensionModule, extensionModule.exports);
const CameraCapture = extensionModule.exports;

const makeRuntime = ({ready = true, enableError = null, noVideoElement = false} = {}) => {
    const calls = [];
    let videoReady = ready;
    const track = {
        async applyConstraints (constraints) {
            calls.push(['constraints', constraints]);
        }
    };
    const canvas = {
        width: 1280,
        height: 960,
        toDataURL (format, quality) {
            calls.push(['encode', format, quality]);
            return `data:${format};base64,photo`;
        }
    };
    const video = {
        provider: {video: noVideoElement ? null : {srcObject: {getVideoTracks: () => [track]}}},
        get videoReady () { return videoReady; },
        async enableVideo () {
            calls.push(['enable']);
            if (enableError) throw enableError;
        },
        disableVideo () {
            calls.push(['disable']);
            videoReady = false;
        },
        getFrame (options) {
            calls.push(['frame', options]);
            return canvas;
        }
    };
    const listeners = new Map();
    return {
        runtime: {
            ioDevices: {video},
            on: (event, handler) => listeners.set(event, handler)
        },
        calls,
        listeners
    };
};

test('camera permission is lazy and rear selection uses the shared stream', async () => {
    const {runtime, calls} = makeRuntime();
    const extension = new CameraCapture(runtime);
    assert.deepEqual(calls, [], 'constructing/loading the extension must not request camera access');

    await extension.startCamera({FACING: 'environment'});
    assert.equal(calls[0][0], 'enable');
    assert.deepEqual(calls[1], ['constraints', {facingMode: {exact: 'environment'}}]);
    assert.equal(extension.cameraReady(), true);
    assert.equal(extension.cameraStatus(), 'ready');
});

test('capture returns a reusable data URL and records dimensions', async () => {
    const {runtime, calls} = makeRuntime();
    const extension = new CameraCapture(runtime);
    await extension.startCamera({FACING: 'user'});
    extension.takePhoto({FORMAT: 'image/jpeg', QUALITY: 150});

    assert.equal(extension.lastPhoto(), 'data:image/jpeg;base64,photo');
    assert.equal(extension.photoWidth(), 1280);
    assert.equal(extension.photoHeight(), 960);
    assert.deepEqual(calls.find(call => call[0] === 'encode'), ['encode', 'image/jpeg', 1]);
    const frame = calls.find(call => call[0] === 'frame')[1];
    assert.equal(frame.mirror, false, 'scanner photographs preserve physical orientation');
});

test('denied permission is visible and stopping releases an owned camera', async () => {
    const denied = makeRuntime({ready: false, enableError: Object.assign(new Error('no'), {name: 'NotAllowedError'})});
    const deniedExtension = new CameraCapture(denied.runtime);
    await deniedExtension.startCamera({FACING: 'environment'});
    assert.equal(deniedExtension.cameraStatus(), 'permission denied');
    assert.equal(denied.calls.some(call => call[0] === 'disable'), false);

    const swallowed = makeRuntime({ready: false, noVideoElement: true});
    const swallowedExtension = new CameraCapture(swallowed.runtime);
    await swallowedExtension.startCamera({FACING: 'environment'});
    assert.equal(swallowedExtension.cameraStatus(), 'permission denied or unavailable');

    const active = makeRuntime();
    const activeExtension = new CameraCapture(active.runtime);
    await activeExtension.startCamera({FACING: 'environment'});
    activeExtension.stopCamera();
    assert.equal(active.calls.filter(call => call[0] === 'disable').length, 1);
    assert.equal(activeExtension.cameraStatus(), 'off');
});

test('picker registration and iOS privacy strings describe the feature without Photos access', () => {
    const manager = readFileSync(new URL('../overlay/scratch-vm/src/extension-support/extension-manager.js', import.meta.url), 'utf8');
    const gallery = readFileSync(new URL('../overlay/scratch-gui/src/lib/libraries/extensions/index.jsx', import.meta.url), 'utf8');
    assert.match(manager, /cameracapture:.*ext-cameracapture/);
    assert.match(gallery, /extensionId: 'cameracapture'/);

    for (const name of ['Info.plist', 'Info.ios.plist']) {
        const plist = readFileSync(new URL(`../apps/tauri/src-tauri/${name}`, import.meta.url), 'utf8');
        assert.match(plist, /<key>NSCameraUsageDescription<\/key>[\s\S]*LEGO scanners/);
        assert.doesNotMatch(plist, /NSPhotoLibrary(?:Add)?UsageDescription/,
            `${name} must not request Photos access when captures stay inside the project`);
    }
});
