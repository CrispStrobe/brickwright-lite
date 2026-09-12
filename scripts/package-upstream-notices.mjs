#!/usr/bin/env node
// Preserve installed upstream LICENSE bytes. Run package provenance first;
// installed package metadata alone cannot establish the pinned source identity.
import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = Object.freeze([
    {name: 'bw-board', license: 'MIT', heading: /^MIT License\r?\n/},
    {name: 'bw-circuit-ui', license: 'MPL-2.0', heading: /^Mozilla Public License Version 2\.0\r?\n/}
]);
export const NOTICE_DIRS = Object.freeze(['overlay/scratch-gui/static/licenses', 'packages/scratch-gui/static/licenses']);

export function packageNotices({rootDir = ROOT, pinsFile = path.join(rootDir, 'vendor-pins.json'), installedRoot = path.join(rootDir, 'node_modules'), check = false} = {}) {
    const pins = JSON.parse(readFileSync(pinsFile, 'utf8'));
    const files = new Map(), packages = [];
    // Validate all inputs before writing any output; metadata license is not authority.
    for (const {name, license, heading} of PACKAGES) {
        const sha = pins[name];
        if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error(`vendor-pins.json ${name}: expected full commit SHA`);
        const dir = path.join(installedRoot, name);
        if (JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name !== name) throw new Error(`${name}: installed package name mismatch`);
        const bytes = readFileSync(path.join(dir, 'LICENSE'));
        if (!heading.test(bytes.toString('utf8'))) throw new Error(`${name}: LICENSE does not identify expected ${license}`);
        const filename = `${name}.${license}.txt`;
        files.set(filename, bytes);
        packages.push({name, commit: sha, license, licenseFile: filename,
            licenseSha256: createHash('sha256').update(bytes).digest('hex'),
            sourceTree: `https://github.com/CrispStrobe/${name}/tree/${sha}`,
            sourceArchive: `https://github.com/CrispStrobe/${name}/archive/${sha}.tar.gz`,
            upstreamLicense: `https://github.com/CrispStrobe/${name}/blob/${sha}/LICENSE`});
    }
    files.set('bw-packages.sources.json', Buffer.from(JSON.stringify({schemaVersion: 1,
        provenance: 'Requires separate pinned installed-content verification; these URLs identify expected source availability, not a network availability check.', packages}, null, 2) + '\n'));
    const findings = [];
    for (const relativeDir of NOTICE_DIRS) {
        const dir = path.join(rootDir, relativeDir);
        if (!check) mkdirSync(dir, {recursive: true});
        for (const [name, bytes] of files) {
            const target = path.join(dir, name);
            if (check) {
                if (!existsSync(target)) findings.push(`${relativeDir}/${name}: missing upstream notice`);
                else if (!readFileSync(target).equals(bytes)) findings.push(`${relativeDir}/${name}: stale upstream notice bytes or source pin`);
            } else writeFileSync(target, bytes);
        }
    }
    return Object.freeze({files: files.size * NOTICE_DIRS.length, findings: Object.freeze(findings)});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const args = process.argv.slice(2), options = {check: args.includes('--check')};
        for (let i = 0; i < args.length; i++) {
            if (args[i] === '--check') continue;
            const key = {'--installed-root': 'installedRoot', '--pins': 'pinsFile'}[args[i]];
            if (!key || !args[i + 1] || args[i + 1].startsWith('--')) throw new Error('usage: package-upstream-notices.mjs [--check] [--installed-root node_modules] [--pins vendor-pins.json]');
            options[key] = path.resolve(args[++i]);
        }
        const result = packageNotices(options);
        if (result.findings.length) {
            for (const finding of result.findings) console.error(finding);
            process.exitCode = 1;
        } else console.log(`package upstream notices: ${result.files} files ${options.check ? 'match' : 'written'} (run provenance verification separately)`);
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
