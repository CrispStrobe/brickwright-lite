import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const build = read('.github/workflows/build.yml');
const focused = read('.github/workflows/debugger.yml');
const qualification = read('.github/workflows/cycle-core-qualification.yml');
const pkg = JSON.parse(read('package.json'));

test('required browser acceptance cannot become a soft deployment gate', () => {
    const install = /- name: Install Playwright browser([\s\S]*?)(?=\n\s{6}- name:)/.exec(build)?.[1];
    assert.ok(install, 'Playwright installation step was not found');
    assert.doesNotMatch(install, /continue-on-error:\s*true/);
    assert.match(build, /Browser gate — debugger recording, reverse and fork history[\s\S]*?npm run verify:debug-history/);
    assert.match(build, /deploy:\n\s+needs:\s*\[build, corpus\]/,
        'publication must require the job containing browser acceptance');
});

test('heavy cycle qualification is GitHub-hosted and absent from ordinary local test scripts', () => {
    assert.match(qualification, /runs-on:\s*ubuntu-latest/);
    assert.match(qualification, /timeout-minutes:\s*45/);
    assert.match(qualification, /workflow_dispatch:/);
    assert.match(qualification, /schedule:/);
    assert.doesNotMatch(focused, /qualify-cycle-candidates|playwright install/,
        'the small focused workflow must not duplicate heavyweight qualification');
    for (const name of ['test', 'test:unit', 'test:fast']) {
        if (!pkg.scripts[name]) continue;
        assert.doesNotMatch(pkg.scripts[name], /qualify-cycle-candidates|cycle-core-qualification/,
            `${name} must not run the heavyweight candidate corpus on a developer VPS`);
    }
});

test('failed native qualification does not still download and launch Chromium', () => {
    const step = (name, next) => {
        const start = qualification.indexOf(`- name: ${name}`);
        return qualification.slice(start, qualification.indexOf(`- name: ${next}`, start));
    };
    const browserInstall = step('Install the qualification browser', 'Measure the candidate in Chromium');
    const measureStart = qualification.indexOf('- name: Measure the candidate in Chromium');
    const browserMeasure = qualification.slice(measureStart,
        qualification.indexOf('\n      - uses: actions/upload-artifact', measureStart));
    assert.ok(browserInstall && browserMeasure);
    assert.doesNotMatch(browserInstall, /if:\s*always\(\)/);
    assert.doesNotMatch(browserMeasure, /if:\s*always\(\)/);
});
