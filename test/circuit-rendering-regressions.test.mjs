import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHitTest, partBounds} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/interaction/hittest.js';
import {computeLeadMap, straddleRefRow} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/footprints.js';
import {runDrc} from '../overlay/scratch-gui/src/lib/bw-circuit-ui/model/drc.js';

const ui = 'overlay/scratch-gui/src/lib/bw-circuit-ui';
const canvas = readFileSync(`${ui}/components/BoardCanvas.jsx`, 'utf8');
const breadboard = readFileSync(`${ui}/components/BreadboardView.jsx`, 'utf8');
const designer = readFileSync(`${ui}/components/CircuitDesigner.jsx`, 'utf8');
const palette = readFileSync(`${ui}/components/PartPalette.jsx`, 'utf8');

test('breadboard preview, dropped part, and rendered hole grid share physical geometry', () => {
    const width = size => {
        const b = partBounds({kind: 'breadboard', x: 0, y: 0, params: {size}});
        return b.maxX - b.minX;
    };
    assert.deepEqual([width('full'), width('half'), width('mini')], [930, 460, 278]);
    assert.match(canvas, /const bounds = partBounds\(placeGhost\)/);
    assert.doesNotMatch(breadboard, /c % 6/);
    assert.match(breadboard, /for \(let c = 0; c < origin\.cols; c\+\+\)/);
});

test('Arduino face, placement outline, and hit bounds use one coordinate system', () => {
    assert.match(canvas, /<foreignObject x=\{x - W \/ 2\} y=\{y - H \/ 2\}/);
    assert.match(canvas, /data-board-face-license="MIT"/);
    for (const kind of ['arduino_uno', 'arduino_nano', 'pi_pico']) {
        const b = partBounds({kind, x: 300, y: 200});
        assert.ok(b.minX < 300 && b.maxX > 300 && b.minY < 200 && b.maxY > 200, kind);
    }
});

test('part palette placement controls expose button and keyboard semantics', () => {
    assert.match(palette, /role="button"/);
    assert.match(palette, /aria-label=\{label\}/);
    assert.match(palette, /event\.key !== 'Enter' && event\.key !== ' '/);
});

test('Nano and Pico retain their real two-row breadboard footprints', () => {
    for (const [kind, expectedRow] of [['arduino_nano', 'b'], ['pi_pico', 'a']]) {
        const footprint = JSON.parse(readFileSync(`${ui}/parts-data/${kind}.json`, 'utf8')).footprint;
        assert.equal(straddleRefRow(footprint), expectedRow, kind);
        const leads = computeLeadMap(footprint, `${expectedRow}5`);
        const rows = new Set(Object.values(leads).map(hole => hole[0]));
        assert.ok(rows.has(expectedRow) && rows.has('f'), `${kind} must straddle the breadboard gutter`);
    }
    assert.match(canvas, /SEATED_PREVIEW_SCALE\[placeGhost\.kind\] \?\? 1/,
        'Nano/Pico placement must not inherit the LED-only shrink');
});

test('DIP body wins hit testing over the breadboard beneath it', () => {
    const tiny = {id: 'tiny', kind: 'attiny13', x: 100, y: 100};
    const board = {id: 'board', kind: 'breadboard', x: 100, y: 100, params: {}};
    const hit = createHitTest(() => [tiny, board], () => [], () => []);
    assert.equal(hit.partAt(130, 100), 'tiny');
    assert.equal(hit.partAt(300, 100), 'board');
});

test('wire hit paths match their visible curves and supply shorts warn', () => {
    assert.match(canvas, /freeWireCurve\(wire, a, b\)\.path/);
    assert.match(canvas, /jumperHitPoints\(bb, a, b, jwIdx\)/);
    assert.match(canvas, /tapWireHitPoints\(a, b\)/);
    const battery = {id: 'bat', kind: 'vsource', terminals: ['pos', 'neg'], params: {volts: 9}};
    const circuit = {parts: [battery], wires: [{from: {part: 'bat', terminal: 'pos'}, to: {part: 'bat', terminal: 'neg'}, netId: 'short'}], breadboards: new Map()};
    assert.ok(runDrc(circuit, {powered: true}).some(warning => warning.rule === 'supply-short'));
});

test('Instruments are collapsed until debugging or simulation needs them', () => {
    assert.match(designer, /useState\(!!debuggerOn \|\| !!benchOpen\)/);
    // SAME BLOCK, not the same LINE. The old assertion pinned the exact
    // one-line spelling, so inserting any statement into the block -- which the
    // React update-source work does routinely -- split the line and turned this
    // red while the behaviour was untouched. Species 1 running BACKWARDS: a
    // source-text match tracking spelling rather than behaviour, producing a
    // false failure instead of a false pass. `\{?[^}]*?` accepts the braced and
    // unbraced forms and allows inserted statements, while forbidding a closing
    // brace between condition and effect -- so the effect must still be INSIDE
    // the condition, which is the actual claim.
    assert.match(designer, /if \(debuggerOn \|\| benchOpen\)\s*\{?[^}]*?setRightOpen\(true\)/);
});

test('simulated potentiometers own their pointer gesture and stay within their footprint', () => {
    assert.match(canvas, /data-pot-control=\{id\}/);
    assert.match(canvas, /onPointerDown=\{simulate \? \(e\) => e\.stopPropagation\(\) : undefined\}/);
    assert.match(canvas, /onPointerMove=\{simulate \? \(e\) => e\.stopPropagation\(\) : undefined\}/);
    assert.match(canvas, /onPointerUp=\{simulate \? \(e\) => e\.stopPropagation\(\) : undefined\}/);
    assert.match(canvas, /style=\{\{ display: 'block', transform: 'scale\(0\.79375\)', transformOrigin: 'top left' \}\}/);
    assert.match(canvas, /potScale = Math\.min\(seatSpan \/ 40, 1\.4\)/);
    assert.match(canvas, /potTop = cy - 60 \* potScale/);
    assert.match(canvas, /controlValues\?\.get\(id\) \?\? part\.params\?\.position \?\? 0\.5/);
});
