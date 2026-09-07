import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const liveNames = ['PLAN.md', 'ROADMAP.md', 'LANES.md', 'HANDOFF.md', 'BLOCKED.md'];
const requiredNames = [...liveNames, 'BUILD.md', 'MBIT-BUILD.md', 'HISTORY.md'];
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('steering documents exist and remain concise', () => {
    for (const name of requiredNames) {
        assert.ok(fs.existsSync(path.join(root, name)), name + ' is required');
        const lines = read(name).split('\n').length;
        assert.ok(lines <= 180, name + ' has ' + lines + ' lines; split contracts from narrative');
    }
});

test('live steering documents contain no completion ledger', () => {
    const forbidden = [
        /^\s*[-*]\s+\[[xX]\]/m,
        /^#{1,6}.*\b(?:done|resolved|closed|landed|shipped)\b/im,
        /^\|.*\b(?:done|resolved|closed|landed|shipped)\b.*\|$/im,
        /\b(?:checkpoint|execution log|what was done)\s+(?:19|20)\d\d[-/]\d\d/im,
        /\b[0-9a-f]{7,40}\b.*\b(?:CI|commit|run)\b/i
    ];
    for (const name of liveNames) {
        const body = read(name);
        for (const expression of forbidden) {
            assert.equal(expression.test(body), false,
                name + ' contains historical completion evidence matching ' + expression);
        }
    }
});

test('local Markdown links in steering documents are live', () => {
    const link = /\[[^\]]+\]\(([^)]+)\)/g;
    for (const name of requiredNames) {
        const body = read(name);
        for (const match of body.matchAll(link)) {
            const target = match[1].split('#', 1)[0];
            if (!target || /^[a-z]+:/i.test(target)) continue;
            const resolved = path.resolve(root, path.dirname(name), decodeURIComponent(target));
            assert.ok(fs.existsSync(resolved), name + ' links to missing ' + target);
        }
    }
});

test('current plans do not resurrect retired steering structures', () => {
    const body = liveNames.map(read).join('\n');
    for (const phrase of [
        'Current execution log',
        'DONE — recently',
        'Wind-down note',
        'session 8',
        'campaign: circuit parity'
    ]) {
        assert.equal(body.includes(phrase), false, 'retired steering phrase: ' + phrase);
    }
});
