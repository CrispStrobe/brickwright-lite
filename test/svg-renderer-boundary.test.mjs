import {describe, test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const guiRoot = '../packages/scratch-gui/src/';

describe('SVG renderer demand boundary', () => {
    test('synchronous consumers use leaf modules and never the broad renderer barrel', () => {
        const consumers = [
            `${guiRoot}containers/paint-editor-wrapper.jsx`,
            `${guiRoot}containers/stage.jsx`,
            `${guiRoot}lib/file-uploader.js`,
            `${guiRoot}lib/get-costume-url.js`,
            '../packages/scratch-render/src/SVGSkin.js',
            '../packages/scratch-vm/src/import/load-costume.js'
        ].map(read);

        for (const source of consumers) {
            assert.doesNotMatch(source, /(?:from |require\()['"]scratch-svg-renderer['"]\)?/);
        }
        assert.match(consumers[0], /scratch-svg-renderer\/src\/font-inliner/);
        assert.match(consumers[1], /scratch-svg-renderer\/src\/bitmap-adapter/);
        assert.match(consumers[4], /scratch-svg-renderer\/src\/load-svg-string/);
        assert.match(consumers[4], /scratch-svg-renderer\/src\/serialize-svg-to-string/);
        assert.match(consumers[5], /scratch-svg-renderer\/src\/load-svg-string/);
        assert.match(consumers[5], /scratch-svg-renderer\/src\/serialize-svg-to-string/);
    });

    test('only the SVG branch requests the named, retryable sanitizer chunk', () => {
        const uploader = read(`${guiRoot}lib/file-uploader.js`);
        const svgCase = uploader.slice(
            uploader.indexOf("case 'image/svg+xml'"),
            uploader.indexOf("case 'image/jpeg'")
        );

        assert.match(uploader, /webpackChunkName: "svg-sanitizer"/);
        assert.match(uploader, /import\([\s\S]*scratch-svg-renderer\/src\/sanitize-svg/);
        assert.match(uploader, /svgSanitizerRequest = null;[\s\S]*throw error;/,
            'a rejected chunk request must be retryable');
        assert.match(svgCase, /svgUploadQueue\.then\(\(\) => loadSvgSanitizer\(\)\)/,
            'multiple SVGs must preserve selection order');
        assert.match(svgCase, /sanitizeByteStream\(fileData\)[\s\S]*createVMAsset/,
            'untrusted bytes must be sanitized before storage');
        assert.match(svgCase, /return upload\.catch\(handleError\)/,
            'chunk and sanitation failures must use the existing error path');
        assert.doesNotMatch(uploader.slice(uploader.indexOf("case 'image/jpeg'")), /loadSvgSanitizer/,
            'bitmap, GIF, sound and sprite-only paths must not demand the sanitizer');
    });

    test('owned GUI mirrors and fresh-install patchers preserve the boundary', () => {
        for (const relative of [
            'containers/paint-editor-wrapper.jsx',
            'containers/stage.jsx',
            'lib/file-uploader.js',
            'lib/get-costume-url.js'
        ]) {
            assert.equal(
                read(`../overlay/scratch-gui/src/${relative}`),
                read(`${guiRoot}${relative}`),
                `${relative} diverged from its integration overlay`
            );
        }

        const rendererPackage = JSON.parse(read('../packages/scratch-svg-renderer/package.json'));
        assert.equal(rendererPackage.exports['.'].webpack, './src/index.js');
        for (const leaf of [
            'bitmap-adapter',
            'font-inliner',
            'load-svg-string',
            'sanitize-svg',
            'serialize-svg-to-string'
        ]) {
            assert.equal(rendererPackage.exports[`./src/${leaf}`], `./src/${leaf}.js`);
        }

        const renderPatch = read('../scripts/apply-render-overlay.mjs');
        const vmPatch = read('../scripts/apply-vm-overlay.mjs');
        assert.match(renderPatch, /leafExports/);
        assert.match(renderPatch, /scratch-svg-renderer\/src\/load-svg-string/);
        assert.match(vmPatch, /load-costume\.js \(narrow SVG imports\)/);
        assert.match(vmPatch, /scratch-svg-renderer\/src\/serialize-svg-to-string/);
    });
});
