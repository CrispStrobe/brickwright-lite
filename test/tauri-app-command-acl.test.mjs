import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const native = path.join(root, 'apps/tauri/src-tauri');

const balanced = (source, marker, open, close) => {
    const markerAt = source.indexOf(marker);
    assert.notEqual(markerAt, -1, `missing ${marker}`);
    const start = source.indexOf(open, markerAt + marker.length);
    assert.notEqual(start, -1, `missing ${open} after ${marker}`);
    let depth = 0;
    for (let i = start; i < source.length; i++) {
        if (source[i] === open) depth++;
        if (source[i] === close && --depth === 0) return source.slice(start + 1, i);
    }
    assert.fail(`unbalanced ${marker}`);
};

const stringArray = body => [...body.matchAll(/"([a-z0-9_-]+)"/g)].map(match => match[1]);
const uniqueSorted = values => [...new Set(values)].sort();

const registeredCommands = source => balanced(source, 'tauri::generate_handler!', '[', ']')
    .split(',')
    .map(entry => entry.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').trim())
    .filter(Boolean)
    .map(entry => entry.split('::').at(-1));

const manifestCommands = source => {
    assert.match(source, /tauri_build::try_build\s*\(/, 'fallible ACL generation must not be discarded');
    assert.match(source, /AppManifest::new\(\)\.commands\(APP_COMMANDS\)/,
        'the generated app manifest must use the reviewed command constant');
    return stringArray(balanced(source, 'const APP_COMMANDS: &[&str] = &', '[', ']'));
};

const allowName = command => `allow-${command.replaceAll('_', '-')}`;

const audit = ({handler, build, main, mobile}) => {
    const registered = registeredCommands(handler);
    const manifested = manifestCommands(build);
    assert.equal(registered.length, 17, 'review a deliberate command-count change');
    assert.equal(new Set(registered).size, registered.length, 'handler commands must be unique');
    assert.equal(new Set(manifested).size, manifested.length, 'manifest commands must be unique');
    assert.deepEqual(uniqueSorted(manifested), uniqueSorted(registered),
        'the app manifest must cover exactly every registered application command');

    const expectedAllows = registered.map(allowName);
    const mainAllows = main.permissions.filter(permission => permission.startsWith('allow-'));
    assert.deepEqual(uniqueSorted(mainAllows), uniqueSorted(expectedAllows),
        'main must receive exactly the generated application-command permissions');
    assert.equal(mainAllows.length, expectedAllows.length, 'main grants must not be duplicated');
    assert.deepEqual(mobile.permissions.filter(permission => expectedAllows.includes(permission)), [],
        'the additive mobile capability must not duplicate application-command grants');
};

const live = () => ({
    handler: readFileSync(path.join(native, 'src/lib.rs'), 'utf8'),
    build: readFileSync(path.join(native, 'build.rs'), 'utf8'),
    main: JSON.parse(readFileSync(path.join(native, 'capabilities/default.json'), 'utf8')),
    mobile: JSON.parse(readFileSync(path.join(native, 'capabilities/mobile.json'), 'utf8'))
});

test('Tauri application-command manifest and main grants exactly match generate_handler', () => {
    audit(live());
});

test('Tauri application-command ACL rejects omissions, extras, and mobile duplication', () => {
    const mutations = [
        input => { input.build = input.build.replace('        "save_project",\n', ''); },
        input => { input.build = input.build.replace('        "save_project",', '        "invented_command",'); },
        input => { input.main.permissions = input.main.permissions.filter(value => value !== 'allow-save-project'); },
        input => { input.main.permissions.push('allow-invented-command'); },
        input => { input.mobile.permissions.push('allow-save-project'); }
    ];
    for (const mutate of mutations) {
        const input = structuredClone(live());
        mutate(input);
        assert.throws(() => audit(input));
    }
});
