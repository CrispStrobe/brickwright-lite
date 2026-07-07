#!/usr/bin/env node
// Apply the Brickwright delta onto the vendored (BSD/Apache) scratch-gui: the sb3-creator
// "Code" tab (blocks <-> pseudocode <-> Python <-> JavaScript) and its deps. Idempotent.
// Run after `vendor`. Extensions are integrated separately (see integrate-extensions.mjs).
import { cpSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GUI = path.join(ROOT, 'packages', 'scratch-gui');
if (!existsSync(GUI)) { console.error('Run `npm run vendor` first (packages/scratch-gui missing).'); process.exit(1); }

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
console.log('Integration applied. `cd packages/scratch-gui && npm install --ignore-scripts && npm run build`.');
