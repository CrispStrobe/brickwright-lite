import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {importGuiDependency, guiDependencyFile} from './helpers/bw-integrated.mjs';
import {pathToFileURL} from 'node:url';

const source = readFileSync(new URL('../overlay/scratch-gui/src/lib/file-uploader.js', import.meta.url), 'utf8');
// Evaluate the complete uploader. The three unrelated static imports have inert
// bindings: these focused controls never invoke their non-GIF branches. The
// production factory and GIF collector are not extracted or rewritten.
let unitSource = source;
for (const [original, replacement] of [
    ["import {BitmapAdapter, sanitizeSvg} from 'scratch-svg-renderer';", "const BitmapAdapter=class {constructor(){throw Error('unexpected bitmap branch')}};const sanitizeSvg=null;"],
    ["import randomizeSpritePosition from './randomize-sprite-position.js';", 'const randomizeSpritePosition=null;'],
    ["import bmpConverter from './bmp-converter';", 'const bmpConverter=null;']
]) {
    assert.equal(unitSource.split(original).length, 2, 'one exact unrelated import');
    unitSource = unitSource.replace(original, replacement);
}
const {createGifUploader} = await import(`data:text/javascript;base64,${Buffer.from(unitSource).toString('base64')}`);
const {GifWriter} = (await importGuiDependency('omggif/omggif.js')).default;
const decoderSource = readFileSync(new URL('../packages/scratch-gui/src/lib/gif-decoder.js', import.meta.url), 'utf8');
const decoderImport = "import {GifReader} from 'omggif';";
assert.equal(decoderSource.split(decoderImport).length, 2);
const executableDecoder = decoderSource.replace(decoderImport,
    `import omggif from ${JSON.stringify(pathToFileURL(guiDependencyFile('omggif/omggif.js')).href)};const {GifReader}=omggif;`);
const decode = (await import(`data:text/javascript;base64,${Buffer.from(executableDecoder).toString('base64')}`)).default;
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return {promise, resolve, reject};
};
const gif = () => {
    const bytes = new Uint8Array(1024), writer = new GifWriter(bytes, 1, 1, {palette: [0xff0000, 0x0000ff]});
    writer.addFrame(0, 0, 1, 1, new Uint8Array([0]), {delay: 1, disposal: 1});
    writer.addFrame(0, 0, 1, 1, new Uint8Array([1]), {delay: 1, disposal: 1});
    return bytes.slice(0, writer.end()).buffer;
};
// A declared Canvas unit model, not native PNG/canvas qualification. All frame
// bytes and frame indices come from the unchanged real decoder and GifReader.
const withCanvas = async body => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const document = {createElement (tag) {
        assert.equal(tag, 'canvas'); let pixels = new Uint8ClampedArray(4);
        const ctx = {
            createImageData (width, height) { return {data: new Uint8ClampedArray(width * height * 4)}; },
            clearRect () { pixels.fill(0); },
            putImageData (data) { pixels = data.data.slice(); },
            getImageData () { return {data: pixels.slice()}; }
        };
        return {getContext (kind) { assert.equal(kind, '2d'); return ctx; },
            toDataURL () { return `model:${JSON.stringify(Array.from(pixels))}`; }};
    }};
    Object.defineProperty(globalThis, 'document', {configurable: true, writable: true, value: document});
    try { await body(); }
    finally {
        if (original) Object.defineProperty(globalThis, 'document', original);
        else delete globalThis.document;
    }
};
const frameUploads = () => {
    const ready = deferred(), rows = [];
    const upload = (url, type, storage, complete, error) => {
        assert.equal(type, 'image/png'); rows.push({url, storage, complete, error});
        if (rows.length === 2) ready.resolve();
    };
    return {ready: ready.promise, rows, upload};
};

test('GIF acquisition is lazy and actual frames wait for all PNG conversions in decoder order', async () => withCanvas(async () => {
    const loader = deferred(), frames = frameUploads(), storage = {}, result = [], errors = [], input = gif(); let loads = 0;
    const upload = createGifUploader(() => { loads++; return loader.promise; });
    assert.equal(loads, 0);
    const acquisition = upload(input, storage, frames.upload, value => result.push(value), error => errors.push(error));
    assert.equal(typeof acquisition.then, 'function', 'the factory seam exposes acquisition, not full frame completion');
    assert.equal(loads, 0); assert.deepEqual(frames.rows, []);
    await turn(); assert.equal(loads, 1); loader.resolve(decode); await frames.ready;
    assert.deepEqual(frames.rows.map(row => row.url), ['model:[255,0,0,255]', 'model:[0,0,255,255]']);
    assert.ok(frames.rows.every(row => row.storage === storage));
    const a = {assetId: 'first'}, b = {assetId: 'second'};
    frames.rows[1].complete([b]); assert.deepEqual(result, [], 'last-numbered frame alone is not completion');
    frames.rows[1].complete([{assetId: 'duplicate'}]);
    assert.deepEqual(result, [], 'duplicate completion before all frames must not advance completion');
    frames.rows[0].complete([a]); assert.deepEqual(result, [[a, b]]); assert.equal(result[0][0], a);
    frames.rows[0].complete([a]); assert.equal(result.length, 1);
    frames.rows[0].error(new Error('late successful-frame error'));
    frames.rows[1].error(new Error('late completed-upload error'));
    assert.deepEqual(errors, []);
}));

test('chunk failure preserves its identity and a new upload retries the actual decoder', async () => withCanvas(async () => {
    const original = Object.freeze(new Error('chunk failed')), errors = [], frames = frameUploads(), result = []; let loads = 0;
    const upload = createGifUploader(() => ++loads === 1 ? Promise.reject(original) : Promise.resolve(decode));
    upload(gif(), {}, frames.upload, value => result.push(value), error => errors.push(error));
    await turn(); assert.deepEqual(errors, [original]); assert.deepEqual(frames.rows, []);
    upload(gif(), {}, frames.upload, value => result.push(value), error => errors.push(error)); await frames.ready;
    frames.rows[0].complete(['a']); frames.rows[1].complete(['b']);
    assert.equal(loads, 2); assert.deepEqual(result, [['a', 'b']]); assert.equal(errors[0], original);
}));

test('initial actual decoder failure reaches the upload error callback unchanged', async () => withCanvas(async () => {
    const errors = [], direct = [];
    try { decode(new Uint8Array([0]).buffer, () => assert.fail('invalid data has no frame')); }
    catch (error) { direct.push(error); }
    assert.equal(direct.length, 1);
    const input = new Uint8Array([0]).buffer; let observed;
    // Forward the same real decoder; capture the thrown original only to assert
    // identity across acquisition, not to replace its behavior or error.
    const actual = (...args) => { try { return decode(...args); } catch (error) { observed = error; throw error; } };
    createGifUploader(async () => actual)(input, {}, () => assert.fail('invalid data has no PNG'),
        () => assert.fail('invalid data has no costume'), error => errors.push(error));
    await turn(); assert.equal(errors.length, 1); assert.equal(errors[0], observed);
    assert.equal(errors[0].constructor, direct[0].constructor); assert.equal(errors[0].message, direct[0].message);
}));

test('PNG conversion failure closes only its own GIF upload with exact error identity', async () => withCanvas(async () => {
    const frames = frameUploads(), errors = [], result = [], original = Object.freeze(new TypeError('PNG failed', {cause: 'original'}));
    createGifUploader(async () => decode)(gif(), {}, frames.upload, value => result.push(value), error => errors.push(error));
    await frames.ready; frames.rows[1].error(original); frames.rows[0].complete(['late']); frames.rows[1].error(new Error('later'));
    assert.deepEqual(result, []); assert.deepEqual(errors, [original]); assert.equal(errors[0].cause, 'original');
}));

test('concurrent GIF uploads retain separate frame collectors and actual decoder buffers', async () => withCanvas(async () => {
    const one = frameUploads(), two = frameUploads(), results = [], errors = [];
    const upload = createGifUploader(async () => decode);
    upload(gif(), {}, one.upload, value => results.push(['one', value]), error => errors.push(error));
    upload(gif(), {}, two.upload, value => results.push(['two', value]), error => errors.push(error));
    await Promise.all([one.ready, two.ready]);
    two.rows[1].complete(['two-1']); one.rows[0].complete(['one-0']);
    two.rows[0].complete(['two-0']); one.rows[1].complete(['one-1']);
    assert.deepEqual(results, [['two', ['two-0', 'two-1']], ['one', ['one-0', 'one-1']]]); assert.deepEqual(errors, []);
}));

test('real decoder keeps synchronous frame zero while the upload callback is deferred', async () => withCanvas(async () => {
    const rows = [], done = deferred();
    assert.equal(decode(gif(), (i, url, count) => { rows.push({i, url, count}); if (i === count - 1) done.resolve(); }), undefined);
    assert.equal(rows.length, 1); assert.equal(rows[0].i, 0); await done.promise;
    assert.deepEqual(rows.map(row => row.i), [0, 1]);
    const frames = frameUploads(); let completed = false;
    createGifUploader(async () => decode)(gif(), {}, frames.upload, () => { completed = true; }, assert.fail);
    assert.equal(frames.rows.length, 0); assert.equal(completed, false); await frames.ready;
    frames.rows[0].complete([]); frames.rows[1].complete([]); assert.equal(completed, true);
}));

test('the existing asynchronous PNG callback chain forwards every exact costume callback thrown value', async () => withCanvas(async () => {
    for (const original of [Object.freeze(new TypeError('costume callback', {cause: 'owner'})), undefined, null, false, '', 0, -0, NaN]) {
        const errors = [], completed = deferred();
        const uploadFrame = (_url, _type, _storage, complete, error) => {
            // Same asynchronous callback/catch boundary as the production PNG branch.
            Promise.resolve().then(() => complete(['asset'])).catch(error);
        };
        createGifUploader(async () => decode)(gif(), {}, uploadFrame, () => { throw original; }, error => {
            errors.push(error); completed.resolve();
        });
        await completed.promise; assert.equal(errors.length, 1); assert.ok(Object.is(errors[0], original));
    }
    const shared = Object.freeze(new Error('same completion and handler throw'));
    const frames = frameUploads(); let reports = 0;
    createGifUploader(async () => decode)(gif(), {}, frames.upload, () => { throw shared; }, error => {
        reports++; assert.equal(error, shared); throw shared;
    });
    await frames.ready; frames.rows[0].complete(['first']);
    assert.throws(() => frames.rows[1].complete(['second']), error => error === shared);
    // Model the existing PNG catch forwarding that exact callback exception.
    assert.throws(() => frames.rows[1].error(shared), error => error === shared);
    assert.doesNotThrow(() => frames.rows[1].error(shared), 'settled frame errors do not rethrow handler errors');
    assert.equal(reports, 1);
}));

test('a throwing error handler remains the exact acquisition rejection through a synchronous frame failure', async () => withCanvas(async () => {
    for (const handlerFailure of [Object.freeze(new Error('error handler threw')), undefined, null, false, '', 0, -0, NaN]) {
        const failure = Object.freeze(new TypeError('PNG failed'));
        let handlerCalls = 0;
        const pending = createGifUploader(async () => decode)(gif(), {}, (_url, _type, _storage, _complete, error) => {
            error(failure);
        }, () => assert.fail('failed upload cannot complete'), error => {
            handlerCalls++; assert.equal(error, failure); throw handlerFailure;
        });
        await assert.rejects(pending, error => Object.is(error, handlerFailure));
        assert.equal(handlerCalls, 1);
    }
}));

test('uploader uses one dynamic real-decoder branch and exact overlay mirror', () => {
    assert.equal(source, readFileSync(new URL('../packages/scratch-gui/src/lib/file-uploader.js', import.meta.url), 'utf8'));
    assert.doesNotMatch(source, /^import .*gif-decoder/m);
    assert.match(source, /import\(\/\* webpackChunkName: "gif-decoder" \*\/ '\.\/gif-decoder'\)/);
    assert.match(source, /uploadGif\(fileData, storage, costumeUpload, handleCostume, handleError\)/);
});
