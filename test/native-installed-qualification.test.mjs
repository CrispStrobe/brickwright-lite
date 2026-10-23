// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Brickwright contributors
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('native qualification refuses foreign or changed source, artifacts and resource declarations', () => {
    // The Ubuntu qualification host's system interpreter is the explicit test input.
    const result = spawnSync('/usr/bin/python3', [fileURLToPath(new URL('./native-installed-qualification-controls.py', import.meta.url))],
        {encoding: 'utf8', timeout: 30000});
    assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /Ran \d+ tests/);
    assert.match(result.stderr, /\bOK\b/);
});
