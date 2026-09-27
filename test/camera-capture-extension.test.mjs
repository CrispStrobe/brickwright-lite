import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const extensionSource = readFileSync(new URL(
    '../overlay/scratch-vm/src/extensions/crispstrobe/cameracapture/index.js', import.meta.url), 'utf8');
const extensionModule = {exports: {}};
class FakeScannerStore {
    begin () {}
    async addRgbDataUrl (photo, metadata) { this.lastFrame = {photo, metadata}; }
    async count () { return 0; }
    async clear () {}
    async archive () { return {filename: 'scan.bwscan.zip', blob: {}}; }
}
const dependencies = new Map([
    ['../../../engine/runtime', class Runtime { static PROJECT_STOP_ALL = 'PROJECT_STOP_ALL'; }],
    ['../../../extension-support/argument-type', {STRING: 'string', NUMBER: 'number'}],
    ['../../../extension-support/block-type', {COMMAND: 'command', BOOLEAN: 'Boolean', REPORTER: 'reporter'}],
    ['../../../util/cast', {toNumber: value => Number(value) || 0}],
    ['../../../io/video', {FORMAT_CANVAS: 'canvas'}],
    ['./scanner-store', {ScannerStore: FakeScannerStore}]
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
    const provider = {
        video: noVideoElement ? null : {srcObject: {getVideoTracks: () => [track]}},
        async listVideoDevices () {
            calls.push(['enumerate']);
            return [{deviceId: 'usb-1', label: 'USB Document Camera'}];
        },
        async selectVideoDevice (constraints) {
            calls.push(['select', constraints]);
            return {settings: {deviceId: constraints.deviceId}};
        },
        cameraInfo () {
            return {settings: {deviceId: 'usb-1'}, capabilities: {zoom: {min: 1, max: 4}}};
        },
        async applyCameraSettings (settings) { calls.push(['control', settings]); }
    };
    provider.watchVideoDevices = callback => {
        provider.deviceChange = callback;
        return () => { provider.deviceChange = null; };
    };
    const video = {
        provider,
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

test('USB cameras can be enumerated and selected with explicit capture settings', async () => {
    const {runtime, calls} = makeRuntime();
    const extension = new CameraCapture(runtime);
    assert.equal(calls.some(call => call[0] === 'enumerate'), false,
        'enumeration must not become an eager permission probe');
    await extension.startCamera({FACING: 'environment'});
    await extension.refreshCameras();
    assert.equal(extension.cameraNames(), 'USB Document Camera');
    await extension.selectCamera({CAMERA: 'usb-1', WIDTH: 1920, HEIGHT: 1080, FPS: 30});
    assert.deepEqual(calls.find(call => call[0] === 'select'), ['select', {
        deviceId: 'usb-1', width: 1920, height: 1080, frameRate: 30
    }]);
    assert.equal(extension.activeCamera(), 'USB Document Camera');
    assert.match(extension.cameraCapabilities(), /"zoom"/);
    await extension.setCameraControl({CONTROL: 'zoom', VALUE: 2});
    assert.deepEqual(calls.find(call => call[0] === 'control'), ['control', {zoom: 2}]);
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

test('supported Apple depth capture stores synchronized RGB-D and unsupported hosts stay RGB-only', async () => {
    const {runtime} = makeRuntime();
    const extension = new CameraCapture(runtime);
    assert.equal(extension.depthAvailable(), false);
    assert.equal(extension.depthStatus(), 'RGB only');

    const calls = [];
    globalThis.__BRICKWRIGHT_DEPTH__ = {
        available: true,
        running: false,
        label: 'Apple LiDAR scene depth',
        async start () { this.running = true; calls.push('start'); },
        async stop () { this.running = false; calls.push('stop'); },
        async capture () {
            calls.push('capture');
            return {
                rgbDataUrl: 'data:image/jpeg;base64,cGhvdG8=',
                depthBase64: 'AAAAAA==', confidenceBase64: 'Ag==',
                imageWidth: 1920, imageHeight: 1440, depthWidth: 1, depthHeight: 1,
                depthFormat: 'float32-little-endian-metres',
                confidenceFormat: 'uint8-0-low-1-medium-2-high',
                intrinsics: [1, 0, 0, 0, 1, 0, 0, 0, 1], pose: [1], timestamp: 42
            };
        }
    };
    try {
        assert.equal(extension.depthAvailable(), true);
        await extension.startDepthCamera();
        await extension.saveFrame();
        assert.deepEqual(calls, ['start', 'capture']);
        assert.equal(extension._store.lastFrame.photo, 'data:image/jpeg;base64,cGhvdG8=');
        assert.equal(extension._store.lastFrame.metadata.depthWidth, 1);
        assert.deepEqual(extension._store.lastFrame.metadata.calibration.intrinsics,
            [1, 0, 0, 0, 1, 0, 0, 0, 1]);
    } finally {
        delete globalThis.__BRICKWRIGHT_DEPTH__;
    }
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
