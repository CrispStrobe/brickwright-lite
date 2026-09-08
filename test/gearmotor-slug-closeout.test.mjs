import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ROOTS = ['overlay/scratch-gui/src/lib/bw-circuit-ui',
    'packages/scratch-gui/src/lib/bw-circuit-ui'];
const OLD = 'hobby_gearmotor';

const walk = dir => readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
});

const validateCloseout = ({files, contents}) => {
    for (const root of ROOTS) {
        const parts = `${root}/parts-data`;
        assert.equal(files.has(`${parts}/${OLD}.json`), false, `${OLD}.json survived in ${root}`);
        assert.equal(files.has(`${parts}/${OLD}.svg`), false, `${OLD}.svg survived in ${root}`);
        assert.ok(files.has(`${parts}/gearmotor.json`), `canonical gearmotor.json missing from ${root}`);
        assert.ok(files.has(`${parts}/gearmotor.svg`), `canonical gearmotor.svg missing from ${root}`);
    }
    const stale = [...contents].filter(([, text]) => text.includes(OLD)).map(([file]) => file);
    assert.deepEqual(stale, [], `runtime files still reference ${OLD}: ${stale.join(', ')}`);
};

test('retired gearmotor slug is absent and canonical pair remains reachable', () => {
    const files = new Set();
    const contents = new Map();
    for (const relRoot of ROOTS) {
        for (const file of walk(path.join(ROOT, relRoot))) {
            const rel = path.relative(ROOT, file);
            files.add(rel);
            if (/\.(?:js|jsx|json)$/i.test(file)) contents.set(rel, readFileSync(file, 'utf8'));
        }
    }
    validateCloseout({files, contents});
    for (const root of ROOTS) {
        const index = path.join(ROOT, root, 'parts-data', 'index.js');
        assert.match(readFileSync(index, 'utf8'), /from ['"]\.\/gearmotor\.json['"]/,
            `canonical gearmotor is not imported by ${path.relative(ROOT, index)}`);
    }
});

test('gearmotor closeout rejects old asset, stale reference and missing canonical mutations', () => {
    const baseFiles = new Set(ROOTS.flatMap(root => [
        `${root}/parts-data/gearmotor.json`, `${root}/parts-data/gearmotor.svg`
    ]));
    const good = {files: baseFiles, contents: new Map([['runtime.js', 'case \'gearmotor\':']])};
    assert.doesNotThrow(() => validateCloseout(good));
    assert.throws(() => validateCloseout({...good, files: new Set([...baseFiles,
        `${ROOTS[0]}/parts-data/${OLD}.json`])}), /survived/);
    assert.throws(() => validateCloseout({...good,
        contents: new Map([['runtime.js', `case '${OLD}':`]])}), /still reference/);
    const missing = new Set(baseFiles);
    missing.delete(`${ROOTS[1]}/parts-data/gearmotor.svg`);
    assert.throws(() => validateCloseout({...good, files: missing}), /canonical gearmotor\.svg missing/);
});
