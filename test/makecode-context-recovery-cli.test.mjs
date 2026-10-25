import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

test('context recovery fetches only a full manifest commit and refuses mutable revisions before network', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bw-context-pin-'));
    try {
        const bytes = 'let selected = 19\n';
        await fs.writeFile(path.join(dir, 'original.ts'), bytes);
        const manifest = path.join(dir, 'manifest.json'), audit = path.join(dir, 'audit.json');
        const marker = path.join(dir, 'fetch.txt'), preload = path.join(dir, 'fetch.mjs');
        await fs.writeFile(audit, JSON.stringify({rows: [{file: 'original.ts', stage: 'partial', unsupported: []}]}));
        await fs.writeFile(preload, `import fs from 'node:fs';
globalThis.fetch = async url => {
    fs.appendFileSync(${JSON.stringify(marker)}, url + '\\n');
    return new Response('## Authentic tutorial\\n', {status: 200});
};`);
        const sha = '8ae4f42df2b2f4a0472b0da04c3cdcd3438dbb02';
        for (const revision of ['main', 'v1.0', sha.slice(0, 8), 'g'.repeat(40), sha]) {
            await fs.writeFile(manifest, JSON.stringify({entries: [{file: 'original.ts',
                sha256: createHash('sha256').update(bytes).digest('hex'),
                source: `https://github.com/microsoft/pxt-arcade/blob/${revision}/docs/control.md`, license: 'MIT'}]}));
            const out = path.join(dir, `out-${revision}`);
            const result = spawnSync(process.execPath, ['--import', preload,
                'scripts/recover-makecode-context.mjs', '--manifest', manifest,
                '--audit', audit, '--corpus-dir', dir, '--out', out], {encoding: 'utf8'});
            if (revision !== sha) {
                assert.notEqual(result.status, 0);
                assert.match(result.stderr, /Expected pinned PXT Arcade Markdown source/);
                await assert.rejects(fs.stat(marker), {code: 'ENOENT'});
                await assert.rejects(fs.stat(out), {code: 'ENOENT'});
            } else {
                assert.equal(result.status, 0, result.stderr);
                assert.equal(await fs.readFile(marker, 'utf8'),
                    `https://raw.githubusercontent.com/microsoft/pxt-arcade/${sha}/docs/control.md\n`);
                const report = JSON.parse(await fs.readFile(path.join(out, 'recovery.json'), 'utf8'));
                assert.equal(report.rows.length, 1);
                assert.equal(await fs.readFile(path.join(dir, 'original.ts'), 'utf8'), bytes);
            }
        }
    } finally {
        await fs.rm(dir, {recursive: true, force: true});
    }
});
