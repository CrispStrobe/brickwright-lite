import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

const root = path.join(import.meta.dirname, '..');
const proof = readFileSync(path.join(root, 'scripts/verify-i8086-browser.mjs'), 'utf8');
const workflow = readFileSync(path.join(root, '.github/workflows/build.yml'), 'utf8');

test('the 8086 browser proof closes the local assembly, display, key and port journey', () => {
    for (const evidence of [
        "selectOption('i8086')", "selectOption('keys')", "selectOption('pins')",
        'bw-asm-assemble', 'bw-code-status', 'in this browser', 'data-vdp-screen', 'bw-serial-input',
        '/Z\\s+5A/', 'bw-led-ppi1-a-7', 'bw-switch-ppi1-c-0',
        'hostedCompilerRequests.length === 0'
    ]) assert.ok(proof.includes(evidence), `missing browser evidence: ${evidence}`);
    assert.match(proof, /isHostedCompilerRequest/);
    assert.match(proof, /bw-i8086-proof-control=1/,
        'zero hosted requests needs a positive interception control');
    assert.doesNotMatch(proof, /waitForTimeout|setTimeout/,
        'the production journey must wait on conditions, never elapsed guesses');
    const importer = readFileSync(path.join(root,
        'overlay/scratch-gui/src/components/tw-pseudocode/pseudocode-importer.jsx'), 'utf8');
    assert.match(importer, /data-testid="bw-code-status"/,
        'the asynchronous assembly verdict needs a stable production selector');
    assert.match(importer, /__bwPendingMedia = \{type: 'asm', detail\}/,
        'assembling before the lazy Circuit tab mounts must not lose the image');
    assert.match(importer, /key: 'bw-right-pane-hidden', value: '0'/,
        'launching an assembled program must expose the default right-docked debugger');
    const circuit = readFileSync(path.join(root,
        'overlay/scratch-gui/src/components/tw-pseudocode/circuit-tab.jsx'), 'utf8');
    assert.match(circuit, /if \(window\.__bwPendingMedia\) this\.setState\(\{machineBooted: true\}\)/,
        'the lazy Circuit tab must replay a program assembled before it mounted');
    assert.match(circuit, /!prevState\.machineBooted && this\.state\.machineBooted/,
        'the retained image must be replayed after the lazy debugger commit');
    assert.match(circuit, /this\.props\.isVisible && !prevProps\.isVisible[\s\S]*bw-asm-rom-ready/,
        'entering Circuit must synchronize media delivered while Code was visible');
    const debugPanel = readFileSync(path.join(root,
        'overlay/scratch-gui/src/components/tw-pseudocode/debug-panel.jsx'), 'utf8');
    assert.match(debugPanel, /return this\._onMediaLoad/,
        'the ASM handoff must preserve the asynchronous media-load promise');
    assert.match(debugPanel, /Promise\.resolve\(pendingReplay\)\.then/,
        'mount-time auto-run must wait for retained media to finish loading');
    const runner = readFileSync(path.join(root,
        'overlay/scratch-gui/src/lib/bw-debug/debug-runner.js'), 'utf8');
    assert.match(runner, /selectedKind === 'i8086' && bootMedia/,
        'an 8086 media image must bypass unrelated Scratch pin compilation');
});

test('CI runs the 8086 proof against the served build and preserves its evidence', () => {
    assert.match(workflow, /PROOF_URL=http:\/\/localhost:8617\/ node scripts\/verify-i8086-browser\.mjs/);
    assert.match(workflow, /name: i8086-production-browser-proof/);
    assert.match(workflow, /path: artifacts\/i8086-browser\//);
    assert.match(workflow, /if-no-files-found: error/);
});
