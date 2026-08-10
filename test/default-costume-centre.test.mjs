// The default sprite's rotation centre must belong to the artwork that is actually in the file.
//
// Branding replaced the two cat costume SVGs in place and kept their md5 filenames, precisely so
// that project-data.js would not need editing. But a rotation centre describes the ARTWORK, not
// the filename, and the artwork changed shape completely: the cat is ~95x100 with its centre near
// (48, 50); the robot is 220x260 centred at (110, 131.5). The cat's numbers survived the swap and
// anchored the robot by a point up near its left shoulder.
//
// It showed up as three unrelated-looking complaints:
//   - a grey band under the robot's feet in the costume editor. That band is the workspace
//     outside the art board: the board is positioned on the rotation centre, so an off-centre
//     anchor slid it up until its bottom edge cut across the visible canvas. Nothing to do with
//     the canvas sizing that a previous grey band came from — measured first, paper's view was
//     521x606 against a 521x606 element, an exact match.
//   - `turn 15 degrees` swung the robot around its shoulder.
//   - a sprite at x:0 y:0 did not sit in the middle of the stage.
//
// Asserted against the SVG's own viewBox rather than a hardcoded pair, so that replacing the
// artwork again fails here instead of silently reintroducing all three. The viewBox centre is a
// proxy for the artwork's bounding-box centre — computing the real one needs a browser — and the
// two agree to 1.5px for this artwork, hence the tolerance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(repo, 'overlay/scratch-gui/src/lib/default-project');
const projectData = readFileSync(resolve(dir, 'project-data.js'), 'utf8');

/** How far the stored centre may sit from the viewBox centre, in SVG units. */
const TOLERANCE = 3;

/**
 * Every costume entry whose SVG we actually replaced.
 *
 * Filtered by "is the file in our overlay", which is exactly the set this test is about. The
 * default project also has a blank backdrop, and that one is still upstream's asset with
 * upstream's correct (240, 180) — nothing to check, and its SVG is not here to measure.
 *
 * @returns {Array<{md5: string, x: number, y: number}>} Owned costume entries, in order.
 */
function ownedCostumes () {
    const out = [];
    const re = /md5ext:\s*'([0-9a-f]+)\.svg'[\s\S]{0,200}?rotationCenterX:\s*(-?[\d.]+),\s*rotationCenterY:\s*(-?[\d.]+)/g;
    let m;
    while ((m = re.exec(projectData)) !== null) {
        if (!existsSync(resolve(dir, `${m[1]}.svg`))) continue;
        out.push({md5: m[1], x: parseFloat(m[2]), y: parseFloat(m[3])});
    }
    return out;
}

test('the parse finds both replaced costumes', () => {
    // Guards the regex itself: zero matches would make every assertion below vacuous, and this
    // file is only useful as a tripwire.
    const found = ownedCostumes();
    assert.equal(found.length, 2, `expected 2 replaced costumes, parsed ${found.length}`);
});

test('each costume is anchored at the centre of its own artwork', () => {
    for (const {md5, x, y} of ownedCostumes()) {
        const svg = readFileSync(resolve(dir, `${md5}.svg`), 'utf8');
        const viewBox = /viewBox="([^"]+)"/.exec(svg);
        assert.ok(viewBox, `${md5}.svg has no viewBox`);

        const [minX, minY, width, height] = viewBox[1].trim().split(/[\s,]+/).map(Number);
        const cx = minX + (width / 2);
        const cy = minY + (height / 2);

        assert.ok(Math.abs(x - cx) <= TOLERANCE,
            `${md5}: rotationCenterX ${x} is ${Math.abs(x - cx)} from the artwork centre ${cx} ` +
            `(viewBox ${viewBox[1]}). The artwork was replaced without updating project-data.js.`);
        assert.ok(Math.abs(y - cy) <= TOLERANCE,
            `${md5}: rotationCenterY ${y} is ${Math.abs(y - cy)} from the artwork centre ${cy} ` +
            `(viewBox ${viewBox[1]}). The artwork was replaced without updating project-data.js.`);
    }
});

test('the cat\'s rotation centres are gone', () => {
    // Named explicitly, because these are the exact values that shipped and they read as
    // plausible small numbers rather than as a leftover.
    for (const {md5, x, y} of ownedCostumes()) {
        for (const [catX, catY] of [[48, 50], [46, 53]]) {
            assert.ok(!(x === catX && y === catY),
                `${md5} still carries the cat's rotation centre (${catX}, ${catY})`);
        }
    }
});
