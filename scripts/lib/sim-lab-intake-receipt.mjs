// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 CrispStrobe
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sharedPrograms = new Set(['cascade-control', 'rise-ratio-control', 'wavemaker-control', 'cable-compass-control']);
export function intakeIdentity(id, buildDir) {
    assert.match(id, /^[a-z][a-z0-9-]+$/);
    const program = sharedPrograms.has(id) ? id.replace(/-control$/, '') : id;
    return {
        source: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
        frontend: sha(readFileSync(resolve(buildDir, 'brickwright-build.json'))),
        model: sha(readFileSync(resolve(root, `overlay/scratch-gui/static/sim-lab/models/${id}.ldr`))),
        program: sha(readFileSync(resolve(root, `overlay/scratch-gui/static/sim-lab/programs/${program}.bw`)))
    };
}

export function validateIntakeReceipt(receipt, {id, identity, projectBytes}) {
    assert.equal(receipt.schema, 1, 'supported intake receipt');
    assert.equal(receipt.id, id, 'receipt belongs to selected model');
    assert.deepEqual(receipt.identity, identity, 'same source, frontend, model and program');
    assert.equal(receipt.project, `${id}.sb3`, 'original project basename');
    assert.equal(receipt.projectSha256, sha(projectBytes), 'actual original exported project bytes');
    assert.ok(receipt.record && typeof receipt.record.ldraw === 'string', 'saved model record');
    assert.ok(Array.isArray(receipt.expected) && receipt.expected.length, 'captured original parts');
    assert.ok(Array.isArray(receipt.program) && receipt.program.some(t => t.operations.length), 'captured actual saved blocks');
    const {record, expected, program} = receipt;
    assert.equal(receipt.stateSha256, sha(JSON.stringify({record, expected, program})), 'captured saved state intact');
    return receipt;
}

export function writeIntakeReceipt(path, {id, identity, project, record, expected, program}) {
    const receipt = {schema: 1, id, identity, project: `${id}.sb3`,
        projectSha256: sha(readFileSync(project)), record, expected, program,
        stateSha256: sha(JSON.stringify({record, expected, program}))};
    assert.equal(resolve(project), resolve(dirname(path), receipt.project), 'receipt accompanies actual export');
    validateIntakeReceipt(receipt, {id, identity, projectBytes: readFileSync(project)});
    writeFileSync(path, JSON.stringify(receipt, null, 2) + '\n');
    return receipt;
}

export function readIntakeReceipt(path, {id, identity}) {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(receipt.project, `${id}.sb3`, 'original project basename');
    const project = resolve(dirname(path), receipt.project);
    return {...validateIntakeReceipt(receipt, {id, identity, projectBytes: readFileSync(project)}), project};
}
