import assert from 'node:assert/strict';
import {mkdirSync, lstatSync, readdirSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function snapshotScopedGuest({source, destination, model, stepId, outcome, conclusion}) {
    const ids = {apex: 'scoped_robot_apex', 'tempest-pendulum': 'scoped_robot_tempest'};
    assert.ok(Object.hasOwn(ids, model), 'Known scoped model required');
    assert.equal(ids[model], stepId, 'Exact model and producing step');
    assert.ok(['success', 'failure', 'cancelled'].includes(outcome), 'Terminal producing outcome required');
    assert.ok(['success', 'failure', 'cancelled'].includes(conclusion), 'Terminal step conclusion required');
    source = path.resolve(source); destination = path.resolve(destination);
    assert.ok(source !== destination && !destination.startsWith(source + path.sep) &&
        !source.startsWith(destination + path.sep), 'Disjoint source and snapshot');
    mkdirSync(path.dirname(destination), {recursive: true});
    mkdirSync(destination); // Existing originals are never overwritten.
    let present = false, entries = [];
    try {
        const st = lstatSync(source);
        assert.ok(st.isDirectory() && !st.isSymbolicLink(), 'Regular output directory required');
        entries = readdirSync(source).sort();
        renameSync(source, path.join(destination, 'originals'));
        present = true;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    // The next guest receives an empty directory, after the previous original is retained.
    mkdirSync(source, {recursive: true});
    const receipt = {model, stepId, outcome, conclusion, sourcePresent: present, topLevelEntries: entries};
    writeFileSync(path.join(destination, 'step.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    snapshotScopedGuest({source: process.argv[2], destination: process.argv[3],
        model: process.env.BW_SCOPED_MODEL, stepId: process.env.BW_SCOPED_STEP_ID,
        outcome: process.env.BW_SCOPED_STEP_OUTCOME, conclusion: process.env.BW_SCOPED_STEP_CONCLUSION});
}
