import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const ledgerUrl = new URL('../docs/TARGET-EMULATOR-PERFORMANCE.md', import.meta.url);

const parseRows = source => source.split('\n')
    .filter(line => /^\| CP\d{2} \|/.test(line))
    .map(line => {
        const [, id, state, checkpoint, definition, evidence] = line
            .split('|')
            .map(value => value.trim());
        return {id, state, checkpoint, definition, evidence};
    });

const validateRows = rows => {
    assert.ok(rows.length >= 10, `expected at least 10 checkpoints, got ${rows.length}`);
    assert.deepEqual(
        rows.map(row => row.id),
        rows.map((_, index) => `CP${String(index + 1).padStart(2, '0')}`),
        'checkpoint IDs must be unique, contiguous and ordered'
    );

    const next = rows.filter(row => row.state === 'NEXT');
    assert.equal(next.length, 1, 'exactly one checkpoint must be NEXT');
    const nextIndex = rows.indexOf(next[0]);

    for (const [index, row] of rows.entries()) {
        assert.ok(['DONE', 'NEXT', 'TODO'].includes(row.state), `${row.id} has an invalid state`);
        assert.ok(row.checkpoint.length >= 4, `${row.id} lacks a checkpoint name`);
        assert.ok(row.definition.length >= 20, `${row.id} lacks a testable definition of done`);
        assert.equal(row.state, index < nextIndex ? 'DONE' : index === nextIndex ? 'NEXT' : 'TODO',
            `${row.id} violates sequential execution order`);
        if (row.state === 'DONE') {
            assert.notEqual(row.evidence, 'pending', `${row.id} is complete without evidence`);
            assert.match(row.evidence, /(https:\/\/github\.com\/|`[0-9a-f]{8,40}`)/,
                `${row.id} evidence is not immutable`);
        } else {
            assert.equal(row.evidence, 'pending', `${row.id} claims evidence before completion`);
        }
    }
};

test('target checkpoint ledger has one strictly ordered work frontier', async () => {
    validateRows(parseRows(await readFile(ledgerUrl, 'utf8')));
});

test('target checkpoint ledger rejects an out-of-order completion', async () => {
    const rows = parseRows(await readFile(ledgerUrl, 'utf8'));
    const outOfOrder = rows.findIndex(row => row.state === 'NEXT') + 1;
    rows[outOfOrder] = {...rows[outOfOrder], state: 'DONE', evidence: '`deadbeef`'};
    assert.throws(() => validateRows(rows), /sequential execution order/);
});

test('target checkpoint ledger rejects completion without immutable evidence', async () => {
    const rows = parseRows(await readFile(ledgerUrl, 'utf8'));
    rows[0] = {...rows[0], evidence: 'pending'};
    assert.throws(() => validateRows(rows), /complete without evidence/);
});

test('target checkpoint ledger rejects a missing checkpoint', async () => {
    const rows = parseRows(await readFile(ledgerUrl, 'utf8'));
    rows.splice(4, 1);
    assert.throws(() => validateRows(rows), /unique, contiguous and ordered/);
});
