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
    // WRITTEN AS THE PROPERTY, NOT THE SPELLING. This asserted the literal
    // `needs: [build, corpus]` while its own message named what it meant:
    // "publication must require the job containing browser acceptance". On
    // 2026-09-05 the gates moved into their own `browser` job -- because the
    // build was being killed by its own 30-minute ceiling and reported as
    // `cancelled` -- and deploy gained that job as a dependency. The intent
    // was MORE satisfied and the assertion failed anyway.
    //
    // So: find the job that actually contains a browser gate, then require
    // deploy to need it. A rename or another split keeps working; removing
    // the dependency does not.
    const jobOf = (needle) => {
        const lines = build.split('\n');
        const starts = lines.map((l, i) => (/^  [a-z][a-z-]*:$/.test(l) ? i : -1)).filter(i => i >= 0);
        const at = starts.find((s, n) =>
            lines.slice(s, starts[n + 1] ?? lines.length).some((l) => l.includes(needle)));
        return at === undefined ? null : lines[at].trim().replace(':', '');
    };
    const gateJob = jobOf('Browser gate — debugger recording');
    assert.ok(gateJob, 'no job in build.yml contains the debugger browser gate');
    const deployNeeds = /deploy:\n(?:\s+\w[^\n]*\n)*?\s+needs:\s*\[([^\]]*)\]/.exec(build)?.[1] ?? '';
    assert.ok(deployNeeds.split(',').map((s) => s.trim()).includes(gateJob),
        `publication must require the job containing browser acceptance: deploy needs ` +
        `[${deployNeeds}] but the gates live in \`${gateJob}\``);
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
