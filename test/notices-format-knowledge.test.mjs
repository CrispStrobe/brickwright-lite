/**
 * bw-circuit-ui's importers cite "THIRD-PARTY.md" for the file-format
 * knowledge they encode (KiCad, EasyEDA, SPICE, LTspice ASC). That file ships
 * in the installed package, and ROADMAP §3.5 item 2 asks that its attribution
 * rows also stand in THIRD-PARTY-NOTICES.md, so the pointer resolves from this
 * repository. The copy is by hand; this holds it to the installed package's
 * table, row for row, so a source upstream adds cannot go unattributed here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {packageSourceRoot} from './helpers/package-source.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function packageDir (name) {
    let dir = packageSourceRoot(name);
    while (!existsSync(path.join(dir, 'package.json'))) {
        const up = path.dirname(dir);
        assert.notEqual(up, dir, `no package.json above ${name}'s source`);
        dir = up;
    }
    return dir;
}

/** The rows of the markdown table whose header row is `header`. */
function tableRows (text, header) {
    const at = text.indexOf(header);
    assert.ok(at >= 0, `table "${header}" not found`);
    const rows = [];
    for (const line of text.slice(at).split('\n').slice(2)) {
        if (!line.startsWith('|')) break;
        rows.push(line.trim());
    }
    return rows;
}

const HEADER = '| Source | Licence | What was taken |';

test('THIRD-PARTY-NOTICES carries every format-knowledge row bw-circuit-ui ships', () => {
    const upstream = readFileSync(path.join(packageDir('bw-circuit-ui'), 'THIRD-PARTY.md'), 'utf8');
    const want = tableRows(upstream, HEADER);
    assert.ok(want.length >= 5, `upstream's table has ${want.length} rows; the parse is suspect`);
    const notices = readFileSync(path.join(REPO, 'THIRD-PARTY-NOTICES.md'), 'utf8');
    const start = notices.indexOf('## bw-circuit-ui');
    const end = notices.indexOf('\n## ', start + 1);
    assert.ok(start >= 0 && end > start, 'the bw-circuit-ui section moved');
    const have = new Set(tableRows(notices.slice(start, end), HEADER));
    const missing = want.filter(row => !have.has(row));
    assert.deepEqual(missing, [], 'rows in bw-circuit-ui/THIRD-PARTY.md that THIRD-PARTY-NOTICES.md lacks '
        + '(copy the table again from the installed package)');
});

test('the pointer the shipped importer prints is the file this mirrors', () => {
    const src = readFileSync(path.join(packageSourceRoot('bw-circuit-ui'), 'importers/kicad-common.js'), 'utf8');
    assert.match(src, /see THIRD-PARTY\.md/);
});
