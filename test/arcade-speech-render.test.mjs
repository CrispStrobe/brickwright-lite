// Ported unchanged from the parked Codex WIP (task F3 of docs/OPEN-TASKS-2026-09-29.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const create = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/speech.js');
const initialize = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/speech-pxt.js');
const fonts = require('../overlay/scratch-vm/src/extensions/crispstrobe/arcade/speech-fonts.json');
const owner = {x: 80, y: 60, width: 2, height: 2};
const engine = () => create(initialize, fonts);
const count = (pixels, color) => pixels.filter(pixel => pixel === color).length;

test('modern and legacy speech draw PXT pixel glyphs in the requested palette colors', () => {
    for (const legacy of [false, true]) {
        const e = engine();
        const r = e.create('A', -1, false, 2, 9, legacy, owner, 0);
        const pixels = e.render(r, owner, 0, 0);
        // The PXT 6x8 A glyph contains fourteen set pixels; its third column
        // has the top stroke at row one. The legacy frame adds four padding
        // pixels and removes four corners; modern draws a rounded frame.
        assert.equal(count(pixels, 2), 14);
        assert.equal(count(pixels, 9), legacy ? 102 : 58);
        assert.equal(pixels[48 * 160 + 79], 2);
    }
});

test('animated speech grows, wraps and pages using PXT timing', () => {
    const e = engine();
    const r = e.create('Hello world', -1, true, 2, 9, false, owner, 0);
    const initial = e.render(r, owner, 0, 0);
    const later = e.render(r, owner, 300, 0.3);
    assert.ok(count(later, 2) > count(initial, 2));
    const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen';
    const paged = e.create(text, -1, true, 2, 9, false, owner, 0);
    assert.ok(paged.renderText.linebreaks.length > 5);
    assert.ok(paged.animation.numPages() >= 1);
    e.render(paged, owner, 10000, 10);
    e.render(paged, owner, 11001, 1.001);
    assert.ok(paged.animation.pageLine > 0);
});

test('legacy speech scrolls and moves below a sprite near the top edge', () => {
    const e = engine();
    const r = e.create('ABCDEFGHIJKLMNOPQRSTUVWXYZ', -1, false, 2, 9, true, owner, 0);
    const first = e.render(r, owner, 0, 0);
    e.render(r, owner, 1600, 1.6);
    const scrolled = e.render(r, owner, 2000, 0.4);
    assert.notDeepEqual(scrolled, first);
    assert.equal(r.sayBubbleSprite.width, 104);
    const edge = {...owner, x: 2, y: 2};
    e.render(r, edge, 2033, 1 / 30);
    assert.equal(r.sayBubbleSprite.left, 0);
    assert.ok(r.sayBubbleSprite.top > edge.y);
});

test('international speech selects the PXT 12x12 font', () => {
    const e = engine();
    const r = e.create('你好', -1, false, 2, 9, false, owner, 0);
    assert.equal(r.renderText.font.charWidth, 12);
    assert.equal(r.renderText.height, 12);
    assert.ok(count(e.render(r, owner, 0, 0), 2) > 0);
});
