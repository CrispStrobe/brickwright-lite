// A <rect rx="..."> must not lose its corners when the paint editor opens it.
//
// SVG says a missing ry defaults to rx and vice versa, so `<rect rx="12">` has 12x12 corners.
// paper's SVG importer does not implement that default: it reads ry off the node, gets nothing,
// and builds the shape with radius (12, 0) — and a corner radius with a zero axis is a SQUARE
// corner. Measured against our own robot sprite, importing it as authored produced 0 rounded and
// 15 square-cornered rectangles; with both radii present, 14 rounded and 1 square (that one has
// no rx and is meant to be square).
//
// This was not merely a display bug. The editor exports what it imported, so the first edit to a
// costume wrote the squared-off shapes back over the artwork and the rounding was gone for good.
//
// Asserted as a guard rather than by running paper, which would need jsdom and a native canvas in
// the test environment. What it protects is the thing that actually broke: the normalisation
// running BEFORE the SVG is handed to paper.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paperCanvas = resolve(repo, 'overlay/scratch-paint/src/containers/paper-canvas.jsx');

test('the paint editor fills in a rounded rect\'s missing ry (and rx) before importing', () => {
    const source = readFileSync(paperCanvas, 'utf8');

    assert.match(
        source, /getElementsByTagName\('rect'\)/,
        'paper-canvas must look at the rects before handing the SVG to paper'
    );
    assert.match(
        source, /setAttribute\('ry',\s*rx\)/,
        'a rect with only rx must have ry filled in from it, or its corners import square'
    );
    assert.match(
        source, /setAttribute\('rx',\s*ry\)/,
        'the mirror case: a rect with only ry must have rx filled in from it'
    );

    // The order matters more than the presence: normalising after the import would do nothing.
    const normalizeAt = source.indexOf('getElementsByTagName(\'rect\')');
    const importAt = source.indexOf('paper.project.importSVG(');
    assert.ok(normalizeAt !== -1 && importAt !== -1);
    assert.ok(
        normalizeAt < importAt,
        'the radii must be normalised BEFORE paper.project.importSVG, not after'
    );
});
