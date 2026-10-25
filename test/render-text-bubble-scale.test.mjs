import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bubbleScaleAnchor, bubbleScalePatch, patchTextBubbleScale} from '../scripts/lib/render-text-bubble-patch.mjs';

// Exercise the actual pinned method with renderer-owned texture/canvas doubles.
// The canvas rejects exactly the zero-size read rejected by browser canvases.
const installed = readFileSync(new URL('../packages/scratch-gui/node_modules/scratch-render/src/TextBubbleSkin.js', import.meta.url), 'utf8');
const upstream = installed.replace(bubbleScalePatch, bubbleScaleAnchor);
const methodOf = source => {
    const start = source.indexOf('    getTexture (scale) {');
    const end = source.indexOf('\n    }', start) + 6;
    assert.ok(start >= 0 && end > start);
    return new Function('twgl', `return ({${source.slice(start, end)}}).getTexture;`)({createTexture: () => ({texture: true})});
};
const original = methodOf(upstream);
const patched = methodOf(patchTextBubbleScale(upstream));
function skin() {
    const s = {
        _texture: null, _textureDirty: true, _renderedScale: 0,
        _renderer: {gl: {CLAMP_TO_EDGE: 33071}}, reads: [], renders: [],
        _canvas: {width: 0, height: 0},
        _renderTextBubble(scale) {
            this.renders.push(scale);
            this._canvas.width = Math.ceil(80 * scale);
            this._canvas.height = Math.ceil(40 * scale);
            this._renderedScale = scale;
        },
        _setTexture(data) { this.upload = data; }
    };
    s._canvas.getContext = () => ({getImageData(_x, _y, width, height) {
        if (!width || !height) throw new Error('IndexSizeError: zero source dimension');
        s.reads.push([width, height]);
        return {width, height};
    }});
    return s;
}

test('unchanged renderer reproduces the hidden-stage crash and lost dirty text', () => {
    const s = skin();
    assert.throws(() => original.call(s, [0, 0]), /IndexSizeError/);
    assert.equal(s._textureDirty, false);
});

test('zero and nonfinite scales defer the first texture without losing dirty text', () => {
    const s = skin();
    for (const scale of [[0, 0], [NaN, 100], [Infinity, 0]]) {
        assert.equal(patched.call(s, scale), null);
        assert.equal(s._textureDirty, true);
        assert.equal(s._renderedScale, 0);
    }
    assert.deepEqual(s.renders, []);
    assert.deepEqual(s.reads, []);
    assert.ok(patched.call(s, [100, 100]));
    assert.deepEqual(s.reads, [[80, 40]]);
});

test('cached texture survives hidden text changes and refreshes on reveal at the same scale', () => {
    const s = skin();
    const texture = patched.call(s, [100, 100]);
    assert.equal(patched.call(s, [100, 100]), texture);
    assert.equal(s.reads.length, 1);
    s._textureDirty = true; // a new say/think value while the stage is hidden
    assert.equal(patched.call(s, [0, 0]), texture);
    assert.equal(s._textureDirty, true);
    assert.equal(s._renderedScale, 1);
    assert.equal(s.reads.length, 1);
    assert.equal(patched.call(s, [100, 100]), texture);
    assert.equal(s._textureDirty, false);
    assert.equal(s.reads.length, 2);
});

test('positive, flipped, one-axis and tiny scales preserve upstream rendering', () => {
    for (const scale of [undefined, [200, 100], [-100, -100], [0, 100], [0.001, 0.001]]) {
        const a = skin(), b = skin();
        assert.deepEqual(patched.call(a, scale), original.call(b, scale));
        assert.deepEqual(a.reads, b.reads);
        assert.deepEqual(a.renders, b.renders);
    }
});

test('source overlay is idempotent and refuses missing, duplicate or partial anchors', () => {
    const once = patchTextBubbleScale(upstream);
    assert.equal(patchTextBubbleScale(once), once);
    assert.throws(() => patchTextBubbleScale(upstream.replace(bubbleScaleAnchor, '')), /anchor/);
    assert.throws(() => patchTextBubbleScale(upstream + bubbleScaleAnchor), /anchor/);
    assert.throws(() => patchTextBubbleScale(once.replace('!Number.isFinite(requestedScale)', 'false')), /partial/);
});
