import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workflowSources, assertCheckoutPins} from '../scripts/ci-workflow-inputs.mjs';
import {vendorPinOutputs} from '../scripts/ci-vendor-pins.mjs';

const workflows = workflowSources(new URL('..', import.meta.url).pathname);
const names = ['bw-circuit-ui', 'bw-board', 'sb3-creator'];
const copiedRepos = ['CrispStrobe/sb3-creator'];
const allowed = site => site.file === '.github/workflows/vendor-freshness.yml'
    && names.some(name => copiedRepos.includes(site.repository) && site.repository === `CrispStrobe/${name}`
        && site.ref === '${{ steps.vendor_pins.outputs.' + name + ' }}');

test('every external workflow checkout has a full pin or validated vendor-pin output', t => {
    const sites = assertCheckoutPins(workflows, allowed);
    const workflow = workflows.get('.github/workflows/vendor-freshness.yml');
    assert.match(workflow, /id: vendor_pins\n\s+run: node brickwright-lite\/scripts\/ci-vendor-pins.mjs >> "\$GITHUB_OUTPUT"/);
    assert.ok(workflow.indexOf('id: vendor_pins') < workflow.indexOf('repository: CrispStrobe/'));
    assert.deepEqual(sites.filter(allowed).map(site => site.repository).sort(), copiedRepos);
    assert.doesNotMatch(workflow, /staying on HEAD|comparing against HEAD/);
    t.diagnostic(`Audited ${sites.length} external checkout sites across ${workflows.size} workflows`);
});

test('vendor outputs reject a missing, abbreviated, moving or injected SHA before checkout', () => {
    const pins = JSON.parse(readFileSync(new URL('../vendor-pins.json', import.meta.url), 'utf8'));
    assert.equal(vendorPinOutputs(pins), names.map(name => `${name}=${pins[name]}\n`).join(''));
    for (const name of names) {
        for (const bad of [undefined, 'main', pins[name].slice(0, 7), pins[name] + '\ninjected=yes']) {
            assert.throws(() => vendorPinOutputs({...pins, [name]: bad}), new RegExp(name + ': missing or invalid'));
        }
    }
});

test('new checkout sites and unrecognized dynamic refs fail by repository', () => {
    const workflow = ref => 'steps:\n  - uses: actions/checkout@full\n    with:\n      repository: Acme/new\n' + (ref ? `      ref: ${ref}\n` : '');
    for (const ref of [null, 'main', 'abc1234', '${{ steps.unreviewed.outputs.sha }}']) {
        assert.throws(() => assertCheckoutPins(new Map([['new.yml', workflow(ref)]]), allowed), /Acme\/new: expected a full/);
    }
    assert.equal(assertCheckoutPins(new Map([['new.yml', workflow('a'.repeat(40))]])).length, 1);
});

test('duplicate-ref fixture: a checkout has exactly one ref field', () => {
    const base = 'steps:\n  - uses: actions/checkout@full\n    with:\n      repository: Acme/duplicate\n      ref: ' + 'a'.repeat(40) + '\n';
    assert.equal(assertCheckoutPins(new Map([['duplicate.yml', base]])).length, 1);
    assert.throws(() => assertCheckoutPins(new Map([['duplicate.yml', base + '      ref: ' + 'b'.repeat(40) + '\n']])), /duplicate checkout ref/);
});

function assertInstalledProvenanceBeforeBuild(source) {
    const jobs = new Map([...source.matchAll(/^  (build|browser):\n([\s\S]*?)(?=^  [a-z][\w-]*:|$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
    assert.deepEqual([...jobs.keys()].sort(), ['browser', 'build']);
    for (const [name, job] of jobs) {
        const id = name === 'build' ? 'package_provenance' : 'browser_package_provenance';
        const step = job.match(new RegExp(`        id: ${id}\\n([\\s\\S]*?)(?=      - name:|$)`))?.[1];
        assert.ok(step, `${name}: missing provenance step`);
        assert.match(step, /node scripts\/pin-packages\.mjs --verify-installed/);
        assert.match(step, /--source bw-board=\/tmp\/bw-board --source bw-circuit-ui=\/tmp\/bw-circuit-ui/);
        assert.match(step, /--installed-root node_modules --installed-root packages\/scratch-gui\/node_modules/);
        assert.match(step, /node scripts\/package-upstream-notices\.mjs --check/);
        const build = job.match(/        id: build_editor(?:_browser)?\n([\s\S]*?)(?=\n\n)/)?.[1];
        assert.ok(build?.includes(`steps.${id}.outcome == 'success'`), `${name}: build must require provenance success`);
        assert.ok(job.indexOf(`id: ${id}`) < job.indexOf('id: build_editor'), `${name}: provenance must precede build`);
        assert.ok(job.indexOf('npm ci --ignore-scripts') < job.indexOf('node scripts/pin-packages.mjs --verify-installed'), `${name}: root install must precede verification`);
        assert.ok(job.indexOf('cd packages/scratch-gui && npm install') < job.indexOf('node scripts/pin-packages.mjs --verify-installed'), `${name}: GUI install must precede verification`);
        assert.ok(job.includes('/^[0-9a-f]{40}$/'), `${name}: source pins require full-SHA validation`);
        assert.ok(job.includes('rev-parse HEAD'), `${name}: fetched source HEAD must be checked`);
    }
    const main = jobs.get('build');
    assert.match(main, /https:\/\/github.com\/CrispStrobe\/bw-board.git/);
    assert.match(main, /https:\/\/github.com\/CrispStrobe\/bw-circuit-ui.git/);
    assert.match(jobs.get('browser'), /for PACKAGE in bw-board bw-circuit-ui; do/);
    assert.match(jobs.get('browser'), /https:\/\/github.com\/CrispStrobe\/\$PACKAGE.git/);
}

test('both build paths verify actual root and GUI bytes, pinned sources and shipped notices', () => {
    const source = workflows.get('.github/workflows/build.yml');
    assertInstalledProvenanceBeforeBuild(source);
    for (const mutated of [
        source.replaceAll('--installed-root packages/scratch-gui/node_modules', ''),
        source.replaceAll('node scripts/package-upstream-notices.mjs --check', 'echo notices skipped'),
        source.replace(" && steps.package_provenance.outcome == 'success'", ''),
        source.replace(" && steps.browser_package_provenance.outcome == 'success'", ''),
        source.replaceAll('/^[0-9a-f]{40}$/', '/^[0-9a-f]+$/'),
        source.replaceAll('https://github.com/CrispStrobe/bw-circuit-ui.git', 'https://evil.example/bw-circuit-ui.git')
    ]) assert.throws(() => assertInstalledProvenanceBeforeBuild(mutated));
});
