import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow = readFileSync(new URL('../.github/workflows/mobile.yml', import.meta.url), 'utf8');
test('ad-hoc diagnostics print only device count and preserve the actual assertion', () => {
    assert.match(workflow, /DEVICE_COUNT=\$\(plutil -extract ProvisionedDevices xml1 -o - "\$WORK\/embedded.plist" \| grep -c '<string>'\)/);
    assert.match(workflow, /\[ "\$DEVICE_COUNT" -gt 0 \]/);
    assert.match(workflow, /plutil -extract ProvisionedDevices xml1 -o - \"\$WORK\/embedded.plist\" >\/dev\/null/);
    assert.doesNotMatch(workflow, /^\s*plutil -extract ProvisionedDevices[^\n]+\| grep '<string>'/m);
    assert.equal((workflow.match(/^\s*node scripts\/prepare-ios-device-build\.mjs$/gm) || []).length, 3);
});
test('asset source preparation adds no runtime download or delivery event', () => {
    assert.doesNotMatch(workflow, /simctl.*download|downloadPlatform|BW_EMBEDDED_ASSET_AUDIT_PATH/);
    assert.match(workflow, /if: startsWith\(github.ref, 'refs\/tags\/'\)/);
});
test('actual device-count shell keeps assertions and does not print authored identifiers', () => {
    const start = workflow.indexOf('          plutil -extract ProvisionedDevices xml1 -o - "$WORK/embedded.plist" >/dev/null');
    assert.ok(start > 0);
    const end = workflow.indexOf('          [ -f "$APP/PrivacyInfo.xcprivacy" ]', start);
    assert.ok(end > start);
    const script = workflow.slice(start, end).replace(/^          /gm, '');
    const dir = mkdtempSync(join(tmpdir(), 'bw-profile-count-'));
    try {
        writeFileSync(join(dir, 'plutil'), '#!/bin/sh\nprintf "%s\\n" "$PROFILE_XML"\nexit "${PROFILE_RC:-0}"\n', {mode: 0o755});
        const run = (text, xml, code = '0') => spawnSync('/bin/bash', ['-c', `set -euo pipefail\n${text}`], {
            encoding: 'utf8', env: {...process.env, PATH: `${dir}:${process.env.PATH}`, WORK: dir,
                PROFILE_XML: xml, PROFILE_RC: code}
        });
        const xml = '<array>\n<string>AUTHORED-DEVICE-A</string>\n<string>AUTHORED-DEVICE-B</string>\n</array>';
        const positive = run(script, xml);
        assert.equal(positive.status, 0, positive.stderr);
        assert.match(positive.stdout, /provisioned device count=2/);
        assert.doesNotMatch(positive.stdout + positive.stderr, /AUTHORED-DEVICE/);
        assert.notEqual(run(script, '<array/>').status, 0);
        assert.notEqual(run(script, '', '37').status, 0);
        const originalLeak = run(script.replace(' >/dev/null', ''), xml);
        assert.equal(originalLeak.status, 0);
        assert.match(originalLeak.stdout, /AUTHORED-DEVICE/, 'privacy control detects the original stdout leak');
    } finally {
        rmSync(dir, {recursive: true, force: true});
    }
});
