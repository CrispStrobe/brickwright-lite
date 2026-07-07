#!/usr/bin/env node
// Apply the Brickwright delta onto the vendored (BSD/Apache) scratch-gui: the sb3-creator
// "Code" tab (blocks <-> pseudocode <-> Python <-> JavaScript) and its deps. Idempotent.
// Run after `vendor`. Extensions are integrated separately (see integrate-extensions.mjs).
import { cpSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GUI = path.join(ROOT, 'packages', 'scratch-gui');
if (!existsSync(GUI)) { console.error('Run `npm run vendor` first (packages/scratch-gui missing).'); process.exit(1); }

// 0) micro:bit stub. Install runs with --ignore-scripts (the upstream prepublish.mjs downloads
// micro:bit firmware from a flaky URL), so `src/generated/microbit-hex-url.cjs` is never created
// and webpack fails: "Can't resolve '../generated/microbit-hex-url.cjs'". Only the firmware
// flasher path depends on it; stub it empty.
const genDir = path.join(GUI, 'src', 'generated');
mkdirSync(genDir, { recursive: true });
writeFileSync(path.join(genDir, 'microbit-hex-url.cjs'), "module.exports = '';\n");
console.log('  wrote src/generated/microbit-hex-url.cjs stub');

// 1) copy overlay files (sb3-creator libs + the tw-pseudocode component)
cpSync(path.join(ROOT, 'overlay', 'scratch-gui'), GUI, { recursive: true });
console.log('  copied Code-tab overlay (sb3-creator libs + tw-pseudocode component)');

// 2) ensure deps (skulpt for in-browser Python; jszip for .sb3; raw-loader already present)
const pkgPath = path.join(GUI, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.dependencies.skulpt = pkg.dependencies.skulpt || '^1.2.0';
pkg.dependencies.jszip = pkg.dependencies.jszip || '^3.10.1';
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('  ensured deps: skulpt, jszip');

// 3) patch gui.jsx — add the import, a 4th Tab, and its TabPanel
const guiJsx = path.join(GUI, 'src', 'components', 'gui', 'gui.jsx');
let s = readFileSync(guiJsx, 'utf8');
if (!s.includes('tw-pseudocode/pseudocode-importer')) {
    s = s.replace(
        "import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';",
        "import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';\nimport PseudocodeImporter from '../tw-pseudocode/pseudocode-importer.jsx';");
    s = s.replace('                                </TabList>',
        `                                    <Tab className={tabClassNames.tab}>
                                        <FormattedMessage
                                            defaultMessage="Code ⇄ Blocks"
                                            description="Brickwright pseudocode/Python/JS code tab"
                                            id="gui.gui.pseudocodeTab"
                                        />
                                    </Tab>
                                </TabList>`);
    s = s.replace('                            </Tabs>',
        `                                <TabPanel className={tabClassNames.tabPanel}>
                                    <PseudocodeImporter />
                                </TabPanel>
                            </Tabs>`);
    writeFileSync(guiJsx, s);
    console.log('  patched gui.jsx (added the Code tab)');
} else {
    console.log('  gui.jsx already patched, skipping');
}

// 4) disable production source maps. The base config uses `cheap-module-source-map`, which
// builds source maps over ~80MB of vendored blockly — the single biggest peak-memory driver
// and the cause of OOM (exit 137) on 7-8GB CI/Vercel runners. The shipped app needs no maps.
const wpPath = path.join(GUI, 'webpack.config.js');
let wp = readFileSync(wpPath, 'utf8');
if (!wp.includes('c.devtool = false')) {
    const anchor = `module.exports = buildDist ?
    [buildConfig.get(), distConfig.get()] :
    buildConfig.get();`;
    const repl = `const _cfgs = buildDist ? [buildConfig.get(), distConfig.get()] : [buildConfig.get()];
_cfgs.forEach(c => { c.devtool = false; }); // Brickwright: no source maps -> fits CI RAM
module.exports = buildDist ? _cfgs : _cfgs[0];`;
    if (!wp.includes(anchor)) { console.error('  ! webpack.config.js export anchor not found'); process.exit(1); }
    writeFileSync(wpPath, wp.replace(anchor, repl));
    console.log('  patched webpack.config.js (devtool: false)');
} else {
    console.log('  webpack.config.js already patched, skipping');
}

console.log('Integration applied. `cd packages/scratch-gui && npm install --ignore-scripts && npm run build`.');
