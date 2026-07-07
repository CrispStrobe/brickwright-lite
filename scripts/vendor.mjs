#!/usr/bin/env node
// Vendor the *pre-relicense* (BSD-3 / Apache-2.0) Scratch stack into packages/ so every
// component (gui, vm, blocks, paint) is a local, editable fork we own. Scratch Foundation
// relicensed BSD-3 -> AGPL-3 on 2024-11-25; we pin the last permissive versions.
//
//   node scripts/vendor.mjs
//
// gui is fetched at the exact last-BSD commit; the rest at their last-permissive npm tag.
import { execSync } from 'node:child_process';
import { mkdirSync, existsSync, rmSync, renameSync, readdirSync } from 'node:fs';
import path from 'node:path';

const PKG = path.join(process.cwd(), 'packages');
const GUI_COMMIT = '7a72429477eb0006e91efb87efe2736b610564bd'; // scratch-gui v4.1.7, last BSD-3 (2024-11-23)
const NPM = [
    ['scratch-vm', '4.8.115', 'BSD-3-Clause'],
    ['scratch-blocks', '1.3.0', 'Apache-2.0'],   // classic — pairs with the v4 GUI (NOT the 2.x rewrite)
    ['scratch-paint', '2.2.518', 'BSD-3-Clause'],
    ['scratch-render', '1.2.126', 'BSD-3-Clause'],
    ['scratch-audio', '1.0.332', 'BSD-3-Clause'],
    ['scratch-storage', '2.3.284', 'BSD-3-Clause'],
    ['scratch-svg-renderer', '2.5.46', 'BSD-3-Clause']
];

const sh = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

// A dir counts as vendored only if its package.json is present. Vercel restores a build cache
// that can contain a PARTIAL packages/<name> (e.g. src/ but no package.json); trusting the bare
// directory then makes integrate.mjs fail on the missing package.json. Validate + re-fetch.
const isVendored = dest => existsSync(path.join(dest, 'package.json'));
const freshDir = dest => { if (existsSync(dest)) rmSync(dest, { recursive: true, force: true }); mkdirSync(dest, { recursive: true }); };

function vendorGui () {
    const dest = path.join(PKG, 'scratch-gui');
    if (isVendored(dest)) { console.log('  scratch-gui already vendored, skipping'); return; }
    console.log(`  scratch-gui @ ${GUI_COMMIT} (BSD-3-Clause)`);
    sh(`curl -sL "https://codeload.github.com/scratchfoundation/scratch-gui/tar.gz/${GUI_COMMIT}" -o /tmp/_gui.tgz`);
    freshDir(dest);
    sh(`tar xzf /tmp/_gui.tgz -C "${dest}" --strip-components=1`);
}

function vendorNpm (name, version) {
    const dest = path.join(PKG, name);
    if (isVendored(dest)) { console.log(`  ${name} already vendored, skipping`); return; }
    console.log(`  ${name}@${version}`);
    const tgz = execSync(`npm pack ${name}@${version} --pack-destination /tmp 2>/dev/null`).toString().trim();
    freshDir(dest);
    sh(`tar xzf "/tmp/${tgz}" -C "${dest}" --strip-components=1`);
}

mkdirSync(PKG, { recursive: true });
console.log('Vendoring the permissive Scratch stack:');
vendorGui();
for (const [name, version] of NPM) vendorNpm(name, version);
console.log('\nDone. All sources are BSD-3-Clause / Apache-2.0. Point scratch-gui at the local');
console.log('workspaces (file: deps) and `npm install && npm run build:gui`.');
