#!/usr/bin/env node
/** Load trusted, self-contained .sb3 fixtures in the product VM and save them again. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import JSZip from 'jszip';
import {VM, clearStrayTimers} from '../test/helpers/bw-vm.mjs';
import {importGuiDependency} from '../test/helpers/bw-integrated.mjs';
import {bundledExtensionIds} from '../test/helpers/bw-extensions.mjs';

const [auditFile, output] = process.argv.slice(2);
if (!auditFile || !output) {
    console.error('usage: node scripts/sb3-native-roundtrips.mjs COMPAT-AUDIT.json OUTPUT.json');
    process.exit(2);
}
const Storage = (await importGuiDependency('scratch-storage/dist/node/scratch-storage.js')).default;
const bundled = new Set(bundledExtensionIds().keys());
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
function facts (project) {
    const opcodes = new Map();
    for (const target of project.targets || []) for (const block of Object.values(target.blocks || {})) {
        if (block?.opcode) opcodes.set(block.opcode, (opcodes.get(block.opcode) || 0) + 1);
    }
    return {targets: (project.targets || []).map(t => t.name), opcodes: Object.fromEntries(opcodes),
        extensionIds: [...(project.extensions || [])].sort(), extensionURLs: project.extensionURLs || {},
        assets: (project.targets || []).flatMap(t => [...(t.costumes || []), ...(t.sounds || [])]
            .map(a => a.md5ext || `${a.assetId}.${a.dataFormat}`)).sort()};
}
function difference (before, after) {
    return {
        targets: before.targets.filter(x => !after.targets.includes(x)),
        opcodes: Object.entries(before.opcodes).filter(([x, n]) => n > (after.opcodes[x] || 0))
            .map(([x, n]) => `${x}: ${n} -> ${after.opcodes[x] || 0}`),
        extensionIds: before.extensionIds.filter(x => !after.extensionIds.includes(x)),
        extensionURLs: Object.keys(before.extensionURLs).filter(x => !after.extensionURLs[x] && !bundled.has(x)),
        assets: before.assets.filter(x => !after.assets.includes(x))
    };
}
const rows = [];
for (const auditRow of audit.rows) {
    if (auditRow.stage !== 'parsed') {
        rows.push({file: auditRow.file, status: 'skipped', reason: auditRow.stage});
        continue;
    }
    let vm;
    try {
        const original = await JSZip.loadAsync(fs.readFileSync(auditRow.file));
        const project = JSON.parse(await original.file('project.json').async('string'));
        vm = new VM();
        vm.attachStorage(new Storage());
        await vm.loadProject(fs.readFileSync(auditRow.file));
        const blob = await vm.saveProjectSb3();
        const roundtrip = await JSZip.loadAsync(await blob.arrayBuffer());
        const saved = JSON.parse(await roundtrip.file('project.json').async('string'));
        const loss = difference(facts(project), facts(saved));
        const assetBytesChanged = [];
        for (const asset of facts(project).assets) {
            const a = original.file(asset), b = roundtrip.file(asset);
            if (!a || !b || hash(await a.async('nodebuffer')) !== hash(await b.async('nodebuffer'))) {
                assetBytesChanged.push(asset);
            }
        }
        const issues = Object.values(loss).some(x => x.length) || assetBytesChanged.length;
        rows.push({file: auditRow.file, status: issues ? 'loss' : 'preserved',
            loss, normalizedBundledURLs: Object.keys(facts(project).extensionURLs)
                .filter(x => !facts(saved).extensionURLs[x] && bundled.has(x)),
            assetBytesChanged});
    } catch (error) {
        rows.push({file: auditRow.file, status: 'failed', reason: String(error?.message || error).slice(0, 400)});
    } finally {
        if (vm) vm.quit();
        clearStrayTimers();
    }
}
const tally = {};
for (const row of rows) tally[row.status] = (tally[row.status] || 0) + 1;
const report = {schema: 'brickwright/sb3-native-roundtrips/v1', generatedAt: new Date().toISOString(),
    count: rows.length, tally, rows};
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({count: report.count, tally, report: output}, null, 2));
