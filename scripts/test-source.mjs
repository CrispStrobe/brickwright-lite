#!/usr/bin/env node
// A bounded source suite. The full test glob remains the integrated release suite.
import {readFileSync, existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {checkTestSetup} from './check-test-setup.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const errors = checkTestSetup();
if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
}
if (process.argv.length > 2) {
    console.error('Usage: npm run test:source (runs the complete test/source-suite.json list)');
    process.exit(2);
}
const names = JSON.parse(readFileSync(path.join(root, 'test/source-suite.json'), 'utf8'));
if (!Array.isArray(names) || !names.length || new Set(names).size !== names.length ||
    names.some(name => typeof name !== 'string' || !/^[\w-]+\.test\.mjs$/.test(name) ||
        !existsSync(path.join(root, 'test', name)))) {
    throw new Error('Source suite must name distinct, existing test files.');
}
console.log(`Source suite: ${names.length} files; no generated GUI required.`);
const child = spawn(process.execPath,
    ['--test', '--test-concurrency=1', '--test-reporter=tap', ...names.map(name => `test/${name}`)],
    {cwd: root, env: process.env, stdio: ['ignore', 'pipe', 'inherit']});
let pending = '';
let failed = false;
let total = 0;
const inspect = line => {
    // Node versions have returned success for suite-construction failures.
    // A source-only verdict also must not silently skip a missing dependency.
    if (/^\s*not ok\b/.test(line) || /^\s*(?:ok|not ok)\b.*#\s*(?:SKIP|TODO)\b/i.test(line)) failed = true;
    const count = /^# tests (\d+)\s*$/.exec(line);
    if (count) total = Number(count[1]);
};
child.stdout.setEncoding('utf8');
child.stdout.on('data', text => {
    process.stdout.write(text);
    const lines = (pending + text).split('\n');
    pending = lines.pop();
    lines.forEach(inspect);
});
child.on('error', error => {
    console.error(error.message);
    process.exitCode = 1;
});
child.on('close', (code, signal) => {
    inspect(pending);
    if (code !== 0 || signal || failed || !total) {
        console.error('Source suite failed, skipped a scenario, or produced no test verdict.');
        process.exitCode = 1;
    }
});
