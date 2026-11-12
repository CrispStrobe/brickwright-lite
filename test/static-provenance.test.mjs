// Static-asset provenance transaction: every vendored bw-board static record is
// re-admitted (or refused by name, before any write) when the bw-board pin moves.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {STATIC_RECORDS, checkStaticProvenance, admitStaticProvenance}
    from '../scripts/admit-static-provenance.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OLD = 'c'.repeat(40), NEW = 'd'.repeat(40);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

/** A synthetic Lite root holding copies of the real records and asset bytes. */
function fixture (t) {
    const root = mkdtempSync(path.join(tmpdir(), 'static-provenance-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    writeFileSync(path.join(root, 'vendor-pins.json'), JSON.stringify({'bw-board': OLD}));
    const supplier = {[OLD]: new Map(), [NEW]: new Map()};
    for (const rec of STATIC_RECORDS) {
        for (const base of ['overlay/scratch-gui', ...(rec.trackedMirror ? ['packages/scratch-gui'] : [])]) {
            const file = path.join(root, base, rec.record);
            mkdirSync(path.dirname(file), {recursive: true});
            const json = JSON.parse(readFileSync(path.join(ROOT, 'overlay/scratch-gui', rec.record), 'utf8'));
            writeFileSync(file, `${JSON.stringify({...json, bwBoardPin: OLD}, null, 2)}\n`);
        }
        for (const asset of rec.assets) {
            const bytes = readFileSync(path.join(ROOT, 'overlay/scratch-gui', asset.file));
            cpSync(path.join(ROOT, 'overlay/scratch-gui', asset.file), path.join(root, 'overlay/scratch-gui', asset.file));
            if (asset.supplier) for (const pin of [OLD, NEW]) supplier[pin].set(asset.supplier, bytes);
        }
        for (const input of rec.inputs || []) {
            for (const pin of [OLD, NEW]) supplier[pin].set(input, Buffer.from(`input ${input}`));
        }
    }
    const readSupplier = (pin, file) => supplier[pin]?.get(file) ?? null;
    return {root, supplier, readSupplier};
}
const pinOf = (root, rec, base = 'overlay/scratch-gui') =>
    JSON.parse(readFileSync(path.join(root, base, rec.record), 'utf8')).bwBoardPin;

test('real tree: every static record matches the pin, its asset bytes and its tracked mirror', () => {
    assert.deepEqual(checkStaticProvenance({root: ROOT}), STATIC_RECORDS.map(rec => rec.record));
});

test('registry covers every overlay static record that declares a bw-board pin', () => {
    assert.deepEqual(STATIC_RECORDS.map(rec => rec.record).sort(), [
        'static/dos/msdos200-base.provenance.json', 'static/roms/cpm-roms.provenance.json',
        'static/roms/free-386-bios.provenance.json']);
});

test('admission re-admits all records to the new pin, changing only bwBoardPin', t => {
    const {root, readSupplier} = fixture(t);
    const before = STATIC_RECORDS.map(rec => JSON.parse(readFileSync(path.join(root, 'overlay/scratch-gui', rec.record), 'utf8')));
    writeFileSync(path.join(root, 'vendor-pins.json'), JSON.stringify({'bw-board': NEW}));
    assert.throws(() => checkStaticProvenance({root}), /stale.*bwBoardPin/, 'stale control: moved pin, unadmitted records');
    const written = admitStaticProvenance({root, readSupplier});
    assert.equal(written.length, 5, 'three overlay records plus two tracked mirrors');
    STATIC_RECORDS.forEach((rec, i) => {
        const after = JSON.parse(readFileSync(path.join(root, 'overlay/scratch-gui', rec.record), 'utf8'));
        assert.deepEqual(after, {...before[i], bwBoardPin: NEW});
        if (rec.trackedMirror) assert.equal(pinOf(root, rec, 'packages/scratch-gui'), NEW);
    });
    assert.deepEqual(checkStaticProvenance({root}), STATIC_RECORDS.map(rec => rec.record));
    assert.deepEqual(admitStaticProvenance({root, readSupplier}), [], 'idempotent');
});

const refuses = (t, mutate, pattern) => {
    const ctx = fixture(t);
    writeFileSync(path.join(ctx.root, 'vendor-pins.json'), JSON.stringify({'bw-board': NEW}));
    mutate(ctx);
    const read = rel => { try { return readFileSync(path.join(ctx.root, rel), 'utf8'); } catch { return null; } };
    const files = STATIC_RECORDS.flatMap(rec => ['overlay', 'packages'].map(base => `${base}/scratch-gui/${rec.record}`));
    const snapshot = files.map(read);
    assert.throws(() => admitStaticProvenance(ctx), pattern);
    files.forEach((rel, i) => assert.equal(read(rel), snapshot[i], `${rel} unwritten after refusal`));
};

test('omission control: a pinned static record missing from the registry refuses by name', t => {
    refuses(t, ({root}) => writeFileSync(path.join(root, 'overlay/scratch-gui/static/roms/extra.provenance.json'),
        JSON.stringify({bwBoardPin: OLD})), /REFUSED: static\/roms\/extra\.provenance\.json.*not in the static provenance registry/);
});

test('omission control: a registered record that is absent refuses by name', t => {
    refuses(t, ({root}) => rmSync(path.join(root, 'overlay/scratch-gui/static/roms/cpm-roms.provenance.json')),
        /REFUSED: static\/roms\/cpm-roms\.provenance\.json.*missing/);
});

test('changed-byte control: a vendored asset that differs from its record refuses', t => {
    refuses(t, ({root}) => {
        const file = path.join(root, 'overlay/scratch-gui/static/roms/cpm-bios.bin');
        const bytes = readFileSync(file); bytes[0] ^= 1; writeFileSync(file, bytes);
    }, /REFUSED: static\/roms\/cpm-roms\.provenance\.json: static\/roms\/cpm-bios\.bin sha256/);
});

test('changed-byte control: a supplier blob that differs at the target pin refuses', t => {
    refuses(t, ({supplier}) => {
        const bytes = Buffer.from(supplier[NEW].get('roms/free-at-bios/vgabios-lgpl.bin')); bytes[7] ^= 1;
        supplier[NEW].set('roms/free-at-bios/vgabios-lgpl.bin', bytes);
    }, /REFUSED: static\/roms\/free-386-bios\.provenance\.json: .*vgabios-lgpl\.bin differs/);
});

test('changed-input control: a DOS construction input changed between pins refuses', t => {
    refuses(t, ({supplier}) => supplier[NEW].set('dos/iosys.asm', Buffer.from('changed')),
        /REFUSED: static\/dos\/msdos200-base\.provenance\.json: .*dos\/iosys\.asm changed/);
});

test('stale control: a record hash edited without its bytes refuses', t => {
    refuses(t, ({root}) => {
        const file = path.join(root, 'overlay/scratch-gui/static/dos/msdos200-base.provenance.json');
        const json = JSON.parse(readFileSync(file, 'utf8'));
        writeFileSync(file, JSON.stringify({...json, sha256: sha256('stale')}));
    }, /REFUSED: static\/dos\/msdos200-base\.provenance\.json: static\/dos\/msdos200-base\.img sha256/);
});

test('mirror control: a stale tracked mirror refuses before writing', t => {
    refuses(t, ({root}) => writeFileSync(path.join(root, 'packages/scratch-gui/static/roms/cpm-roms.provenance.json'), '{}\n'),
        /REFUSED: packages\/scratch-gui\/static\/roms\/cpm-roms\.provenance\.json is not identical/);
});

test('missing supplier file refuses (no fetch, no rebuild)', t => {
    refuses(t, ({supplier}) => supplier[NEW].delete('roms/cpm/bios.bin'), /roms\/cpm\/bios\.bin.*absent/);
});
