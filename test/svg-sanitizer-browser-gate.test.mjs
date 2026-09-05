import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const gate = readFileSync(path.join(root, 'scripts/verify-svg-sanitizer-upload.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');
const uploader = readFileSync(path.join(root, 'packages/scratch-gui/src/lib/file-uploader.js'), 'utf8');

test('SVG sanitizer production gate preserves the causal and failure proof', () => {
    assert.match(gate, /default stage requests no SVG sanitizer chunk/);
    assert.match(gate, /opening Costumes still requests no SVG sanitizer chunk/);
    assert.match(gate, /exactly once/);
    assert.match(gate, /failed sanitizer chunk stores no costume or asset/);
    assert.match(gate, /retries with a new request and succeeds/);
    assert.match(gate, /external href, or CSS import/);
    assert.match(gate, /valid rectangle remains/);
    assert.match(gate, /waitFor\(\{state: 'visible'/);
    assert.match(gate, /getByRole\('tabpanel', \{name: \/Costumes\?\/\}/);
    assert.match(gate, /durationMs/);
    assert.match(gate, /longTasks/);
    assert.match(gate, /EAGER_UPLOAD_BASELINE_MS = 65\.7/);
    assert.match(gate, /RELATIVE_UPLOAD_LIMIT_MS = EAGER_UPLOAD_BASELINE_MS \* 1\.15/);
    assert.match(gate, /ABSOLUTE_UPLOAD_LIMIT_MS = 1000/);
    assert.match(gate, /LONG_TASK_LIMIT_MS = 100/);
    assert.match(gate, /within 115% of the same-probe eager baseline/);
    assert.match(gate, /creates no task over 100 ms/);
    assert.doesNotMatch(gate, /waitForTimeout|setTimeout\s*\(/);
});

test('SVG bytes can enter storage only after the retryable lazy sanitizer resolves', () => {
    assert.doesNotMatch(uploader, /^import .*sanitize-svg/m);
    assert.match(uploader, /webpackChunkName: "svg-sanitizer"[\s\S]*scratch-svg-renderer\/src\/sanitize-svg/);
    assert.match(uploader, /svgSanitizerRequest = null;[\s\S]*throw error/);
    const svgCase = uploader.slice(uploader.indexOf("case 'image/svg+xml'"),
        uploader.indexOf("case 'image/jpeg'"));
    assert.ok(svgCase.indexOf('sanitizeByteStream(fileData)') < svgCase.indexOf('createVMAsset('),
        'sanitization must precede storage creation');
    assert.match(svgCase, /return upload\.catch\(handleError\)/);
});

test('CI runs the SVG sanitizer gate and always retains its receipt', () => {
    assert.match(workflow, /node scripts\/verify-svg-sanitizer-upload\.mjs/);
    assert.match(workflow, /name: svg-sanitizer-upload-proof[\s\S]*path: artifacts\/svg-sanitizer-upload\/\*/);
});
