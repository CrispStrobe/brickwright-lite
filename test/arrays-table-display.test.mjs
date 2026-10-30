/**
 * Arrays & Tensors — stage table display.
 *
 * The extension draws a stored array onto the stage as an SVG skin. Three
 * properties are worth a gate, and only one of them is about drawing:
 *
 *   1. The SVG is BUILT FROM CELL VALUES, which are learner-authored strings.
 *      They are interpolated into markup, so an unescaped `<` is not a cosmetic
 *      bug — it ends the text node and the rest of the cell becomes elements.
 *      Asserted on the string, because the renderer is what would swallow it.
 *   2. Marks are STATE, not pixels. A project that never shows a table still
 *      has to answer `marked?` correctly, so the reporters are asserted with
 *      no renderer present at all — which is also how this suite runs.
 *   3. Absence of a renderer must not throw. The blocks are reachable from a
 *      headless VM run and from the corpus walks; a table that cannot draw has
 *      to degrade to not drawing, not to a red project.
 *
 * The SVG builder is a pure method for exactly this reason: asserting a grid
 * through a GL context would test the context.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
import {INTEGRATED} from './helpers/bw-integrated.mjs';
import {arrayFixture} from './helpers/arrays-current-operation.mjs';

const require = createRequire(import.meta.url);
const ArraysExtension = require(
    path.join(INTEGRATED, 'node_modules/scratch-vm/src/extensions/crispstrobe/arrays'));

// No renderer, and deliberately so: `Scratch.vm.runtime.renderer` is undefined
// here, which is the headless case every assertion below also exercises.
const makeExt = () => new ArraysExtension({on: () => {}, emit: () => {}});

const TABLE_BLOCKS = {
    showTable: 'command', hideTable: 'command', setTableTitle: 'command',
    setTableStyle: 'command', markCell: 'command', unmarkCell: 'command',
    clearMarks: 'command', isMarked: 'Boolean', markedCount: 'reporter'
};

test('the table blocks are declared, and with the shapes their use requires', () => {
    const info = makeExt().getInfo();
    const byOpcode = new Map(info.blocks.filter(b => b && b.opcode).map(b => [b.opcode, b]));
    for (const [opcode, blockType] of Object.entries(TABLE_BLOCKS)) {
        const block = byOpcode.get(opcode);
        assert.ok(block, `${opcode} is not declared`);
        // A reporter where a Boolean belongs still "works" in the palette and
        // cannot be dropped into an `if`, which is the only place a win check
        // for a bingo card can go.
        assert.equal(block.blockType, blockType, `${opcode} has the wrong block type`);
    }
});

test('every table block has text in every locale the extension ships', () => {
    // A missing key renders as the bare key ("arrays.markCell") in the palette,
    // which reads as a broken block rather than an untranslated one.
    const source = require('node:fs').readFileSync(path.join(INTEGRATED,
        'node_modules/scratch-vm/src/extensions/crispstrobe/arrays/index.js'), 'utf8');
    for (const locale of ['en', 'de', 'fr']) {
        const start = source.indexOf(`\\n    ${locale}: {\\n`);
        assert.ok(start > 0, `locale ${locale} is missing`);
        const end = source.indexOf('\\n    },\\n', start);
        const body = source.slice(start, end);
        for (const opcode of Object.keys(TABLE_BLOCKS)) {
            assert.ok(body.includes(`arrays.${opcode}`), `${locale} lacks arrays.${opcode}`);
        }
    }
});

test('a 2D array becomes one cell per element, with a title above them', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    (await ext.create2D({NAME: 'card', JSON: '[[1,2,3],[4,5,6]]'}));
    (await ext.setTableTitle({NAME: 'card', TITLE: 'Player 1'}));
    const svg = (await tableSnapshot('card'));
    // 6 cells + 1 panel background; 6 values + 1 title.
    assert.equal((svg.match(/<rect/g) || []).length, 7);
    assert.equal((svg.match(/<text/g) || []).length, 7);
    assert.ok(svg.includes('>Player 1<'));
    for (const value of ['1', '2', '3', '4', '5', '6']) {
        assert.ok(svg.includes(`>${value}<`), `cell ${value} is not drawn`);
    }
});

test('a cell value cannot escape its text node', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    (await ext.create2D({NAME: 'x', JSON: JSON.stringify([['<script>alert(1)</script>', 'a & b', '"q"']])}));
    (await ext.setTableTitle({NAME: 'x', TITLE: '<title>'}));
    const svg = (await tableSnapshot('x'));
    assert.ok(!svg.includes('<script>'), 'a cell opened a real element');
    assert.ok(!svg.includes('<title>'), 'a title opened a real element');
    assert.ok(svg.includes('&lt;script&gt;'));
    assert.ok(svg.includes('a &amp; b'));
    assert.ok(svg.includes('&quot;q&quot;'));
});

test('marks are 1-based, per-table, and readable without ever drawing', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    (await ext.create2D({NAME: 'a', JSON: '[[1,2],[3,4]]'}));
    (await ext.create2D({NAME: 'b', JSON: '[[1,2],[3,4]]'}));
    (await ext.markCell({NAME: 'a', ROW: 2, COL: 1}));
    // Row 2 col 1 is the THIRD element in reading order. A 0-based slip would
    // put this mark on row 1 col 2 and the bingo win check would fire a line early.
    assert.equal((await ext.isMarked({NAME: 'a', ROW: 2, COL: 1})), true);
    assert.equal((await ext.isMarked({NAME: 'a', ROW: 1, COL: 2})), false);
    assert.equal((await ext.isMarked({NAME: 'b', ROW: 2, COL: 1})), false, 'marks leaked between tables');
    assert.equal((await ext.markedCount({NAME: 'a'})), 1);
    assert.equal((await ext.markedCount({NAME: 'b'})), 0);
    (await ext.unmarkCell({NAME: 'a', ROW: 2, COL: 1}));
    assert.equal((await ext.markedCount({NAME: 'a'})), 0);
    (await ext.markCell({NAME: 'a', ROW: 1, COL: 1}));
    (await ext.markCell({NAME: 'a', ROW: 2, COL: 2}));
    (await ext.clearMarks({NAME: 'a'}));
    assert.equal((await ext.markedCount({NAME: 'a'})), 0);
    // An unknown table reports rather than throwing: a win check that runs
    // before the card is dealt must answer "no", not stop the script.
    assert.equal((await ext.isMarked({NAME: 'never-made', ROW: 1, COL: 1})), false);
    assert.equal((await ext.markedCount({NAME: 'never-made'})), 0);
});

test('a marked cell is drawn differently from an unmarked one', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    (await ext.create2D({NAME: 'c', JSON: '[[7,8]]'}));
    const plain = (await tableSnapshot('c'));
    (await ext.markCell({NAME: 'c', ROW: 1, COL: 2}));
    const marked = (await tableSnapshot('c'));
    assert.notEqual(plain, marked, 'marking a cell changed nothing that would be drawn');
    assert.ok(!plain.includes('#ff8c1a'));
    assert.ok(marked.includes('#ff8c1a'));
});

test('style changes reach the drawing, and a 1D array is one row', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    (await ext.create1D({NAME: 'row', JSON: '[10,20,30]'}));
    const before = (await tableSnapshot('row'));
    assert.match(before, /width="140"/); // 3 * 44 + 2 * 4
    (await ext.setTableStyle({NAME: 'row', W: 60, H: 40, SIZE: 22}));
    const after = (await tableSnapshot('row'));
    assert.match(after, /width="188"/); // 3 * 60 + 2 * 4
    assert.ok(after.includes('font-size="22"'));
});

test('nothing to draw is null, not an empty or malformed document', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    assert.equal((await tableSnapshot('missing')), null);
    (await ext.create1D({NAME: 'empty', JSON: '[]'}));
    assert.equal((await tableSnapshot('empty')), null);
});

test('the display blocks do not throw when there is no renderer', async t => {
    const {ext, tableSnapshot} = await arrayFixture(t);
    (await ext.create2D({NAME: 'headless', JSON: '[[1,2],[3,4]]'}));
    // Every one of these reaches _redrawTable, which reaches for a renderer
    // that is not there. This is the corpus-walk and unit-test path.
    await assert.doesNotReject(async () => {
        (await ext.showTable({NAME: 'headless', X: 100, Y: -40}));
        (await ext.setTableTitle({NAME: 'headless', TITLE: 'P2'}));
        (await ext.setTableStyle({NAME: 'headless', W: 50, H: 32, SIZE: 18}));
        (await ext.markCell({NAME: 'headless', ROW: 1, COL: 1}));
        (await ext.clearMarks({NAME: 'headless'}));
        (await ext.hideTable({NAME: 'headless'}));
        (await ext.hideTable({NAME: 'never-shown'}));
    });
    // State survived the missing renderer: position was recorded even though
    // nothing could be positioned.
    const state = ext._tableState('headless');
    assert.equal(state.x, 100);
    assert.equal(state.y, -40);
    assert.equal(state.title, 'P2');
});
