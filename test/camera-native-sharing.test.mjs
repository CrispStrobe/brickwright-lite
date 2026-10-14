import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const native = path.join(root, 'apps/tauri/src-tauri');
const read = relative => readFileSync(path.join(native, relative), 'utf8');

test('LAN sharing is token-scoped, selected-file-only, expiring, and GET-only', () => {
    const source = read('src/share_server.rs');
    assert.match(source, /Uuid::new_v4\(\)/);
    assert.match(source, /first != format!\("GET \{expected_path\} HTTP\/1\.1"\)/);
    assert.match(source, /minutes\.clamp\(1, 30\)/);
    assert.match(source, /"Cache-Control", "no-store"/);
    assert.match(source, /"Content-Disposition"/);
    assert.doesNotMatch(source, /read_dir|serve_dir|"POST |"PUT /);
});

test('macOS native sharing uses the system picker, which exposes AirDrop and installed share targets', () => {
    const source = read('src/macos_share.m');
    assert.match(source, /NSSharingServicePicker/);
    assert.match(source, /fileURLWithPath/);
    assert.match(source, /showRelativeToRect/);
});

test('Apple depth capture is honest, synchronized, calibrated, and tightly packed', () => {
    const source = read('plugins/depth-capture/ios/Sources/DepthCapture/DepthCapturePlugin.swift');
    assert.match(source, /supportsFrameSemantics\(\.sceneDepth\)/);
    assert.match(source, /frame\.capturedImage/);
    assert.match(source, /scene\.depthMap/);
    assert.match(source, /packedRowBytes = CVPixelBufferGetWidth\(buffer\) \* bytesPerPixel/);
    for (const field of ['depthFormat', 'confidenceFormat', 'intrinsics', 'pose', 'timestamp']) {
        assert.match(source, new RegExp(`"${field}"`));
    }
    assert.match(source, /"RGB only"/);
});

test('camera and LAN permission declarations are purpose-limited and do not request Photos access', () => {
    for (const plist of ['Info.plist', 'Info.ios.plist']) {
        const source = read(plist);
        assert.match(source, /NSCameraUsageDescription/);
        assert.match(source, /NSLocalNetworkUsageDescription/);
        assert.doesNotMatch(source, /NSPhotoLibrary(?:Add)?UsageDescription/);
    }
});

test('browser sharing falls back to download and camera costumes become real stored assets', () => {
    const download = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/download-blob.js'), 'utf8');
    const bridge = readFileSync(path.join(root, 'overlay/scratch-gui/src/lib/tauri-bridge.js'), 'utf8');
    assert.match(download, /navigator\.share\(shareData\)\.catch\(\(\) => browserDownload/);
    assert.match(bridge, /storage\.createAsset\(/);
    assert.match(bridge, /storage\.AssetType\.ImageBitmap/);
    assert.match(bridge, /vm\.addCostume\(md5/);
});
