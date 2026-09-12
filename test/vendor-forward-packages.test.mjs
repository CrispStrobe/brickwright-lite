import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execSync} from 'node:child_process';
import {quote, parseForwardPins, refreshForwardPackages, verifyForwardBuild, selectForwardOutputs, forwardMirror,
    verifyGuiPackageMetadata} from '../scripts/lib/vendor-forward-packages.mjs';

const config = {root: '/app', clones: {'bw-board': '/clones/engine', 'bw-circuit-ui': '/clones/ui'}};
const record = fail => {
    const calls = [];
    const run = (cmd, options) => {
        calls.push({cmd, options});
        if (fail?.(cmd)) throw new Error('planted refusal');
    };
    return {calls, run, options: {...config, verifyGuiMetadata: () => calls.push({cmd: 'GUI metadata check'})}};
};

test('shell argument quoting preserves literal newlines and the generated commit trailer', () => {
    const body = "literal 'quotes' and $(false)\n\nClaude-Session: vendor-forward-script";
    assert.equal(execSync(`printf %s ${quote(body)}`, {encoding: 'utf8'}), body);
    assert.equal(execSync('git interpret-trailers --parse', {input: body, encoding: 'utf8'}),
        'Claude-Session: vendor-forward-script\n');
});

test('emitted proof and notices are verified against the actual build directory', () => {
    const {calls, run} = record();
    verifyForwardBuild(run, config);
    assert.deepEqual(calls.map(row => row.cmd), [
        "node scripts/verify-emitted-native-broker-proof.mjs '/app/packages/scratch-gui/build'",
        "node scripts/package-upstream-notices.mjs --check --build-dir '/app/packages/scratch-gui/build'"
    ]);
    const failing = record(() => true);
    assert.throws(() => verifyForwardBuild(failing.run, config), /planted refusal/);
    assert.equal(failing.calls.length, 1);
});

test('package forward installs GUI after integrate, restores all overlays, proves bytes before notices', () => {
    const {calls, run, options} = record();
    refreshForwardPackages(run, options);
    const commands = calls.map(row => row.cmd);
    const at = text => commands.findIndex(cmd => cmd.includes(text));
    assert.ok(at('--verify-installed') < at('sync-i8086-bios.mjs'));
    assert.ok(at('sync-i8086-demo-roms') < at('npm run integrate'));
    assert.ok(at('npm run integrate') < at('npm install'));
    const install = calls.find(row => row.cmd.startsWith('npm install'));
    assert.equal(install.options.cwd, '/app/packages/scratch-gui');
    assert.match(install.cmd, /--legacy-peer-deps/);
    const bios = commands.filter(cmd => cmd.includes('sync-i8086-bios.mjs'));
    assert.deepEqual(bios, ["node scripts/sync-i8086-bios.mjs --dir '/clones/engine'",
        "node scripts/sync-i8086-bios.mjs --dir '/clones/engine' --record"]);
    for (const overlay of ['vm', 'paint', 'render']) {
        assert.ok(at('npm install') < at(`apply-${overlay}-overlay`));
        assert.ok(at(`apply-${overlay}-overlay`) < at('GUI metadata check'));
    }
    const proofs = commands.filter(cmd => cmd.includes('--verify-installed'));
    assert.equal(proofs.length, 2);
    assert.match(proofs[1], /--source 'bw-board=\/clones\/engine'/);
    assert.match(proofs[1], /--source 'bw-circuit-ui=\/clones\/ui'/);
    assert.match(proofs[1], /--installed-root '\/app\/node_modules'/);
    assert.match(proofs[1], /--installed-root '\/app\/packages\/scratch-gui\/node_modules'/);
    assert.ok(commands.indexOf(proofs[1]) < at('package-upstream-notices'));
    assert.ok(at('package-upstream-notices') < at('gen-i8086-capability-report'));
});

for (const step of ['--verify-installed', 'npm install', 'apply-render-overlay', 'package-upstream-notices']) {
    test(`forward stops immediately when ${step} refuses`, () => {
        const {calls, run, options} = record(cmd => cmd.includes(step));
        assert.throws(() => refreshForwardPackages(run, options), /planted refusal/);
        assert.ok(calls.at(-1).cmd.includes(step));
        assert.ok(!calls.some(({cmd}) => cmd.includes('gen-language-device-matrix')));
    });
}

test('changed BIOS requires manual review and cannot reach write/install/notices', () => {
    const {calls, run, options} = record(cmd => cmd.includes('sync-i8086-bios') && !cmd.includes('--record'));
    assert.throws(() => refreshForwardPackages(run, options), /BIOS bytes\/source require manual review/);
    assert.ok(!calls.some(({cmd}) => cmd.includes('--write') || cmd.includes('npm install') || cmd.includes('notices')));
});

test('explicit immutable --at selections remain reproducible and malformed names refuse', () => {
    const sha = 'a'.repeat(40);
    assert.deepEqual(parseForwardPins(['--at', `bw-board=${sha}`, '--no-commit', '--at', `sb3-creator=${sha}`]),
        {'bw-board': sha, 'sb3-creator': sha});
    assert.deepEqual(parseForwardPins([]), {});
    for (const value of ['bw-board=main', 'bw-board=abc123', `unknown=${sha}`, `bw-board=${sha}=extra`]) {
        assert.throws(() => parseForwardPins(['--at', value]), /--at/);
    }
    for (const flag of ['--att', '--no-comit', '--pin', 'unexpected']) {
        assert.throws(() => parseForwardPins([flag]), /unknown forward argument/);
    }
    assert.throws(() => parseForwardPins(['--at', `bw-board=${sha}`, '--at', `bw-board=${'b'.repeat(40)}`]), /conflicting --at/);
    assert.deepEqual(parseForwardPins(['--at', `bw-board=${sha}`, '--at', `bw-board=${sha}`]), {'bw-board': sha});
});

test('staging includes exact manifests, locks, reports and own mirrors; unrelated paths refuse', () => {
    const files = ['vendor-pins.json', 'package.json', 'package-lock.json',
        'packages/scratch-gui/package.json', 'packages/scratch-gui/package-lock.json',
        'docs/generated/bw-board-census.json', 'overlay/scratch-gui/examples/new/circuit.json',
        'packages/scratch-gui/static/licenses/bw-packages.sources.json'];
    assert.deepEqual(selectForwardOutputs(files), [...files].sort());
    assert.equal(forwardMirror('overlay/scratch-gui/src/lib/sb3-creator.js'), 'packages/scratch-gui/src/lib/sb3-creator.js');
    assert.equal(forwardMirror('overlay/scratch-gui/examples/new/circuit.json'), null,
        'do not re-track removed generated example copies');
    for (const file of ['LANES.md', 'overlay/scratch-gui/src/lib/unrelated.js', 'docs/other.md',
        'packages/scratch-gui/node_modules/bw-board/src/index.js', 'overlay/scratch-gui/examples/../evil',
        'overlay/scratch-gui/examples/..', '/package.json']) {
        assert.throws(() => selectForwardOutputs([...files, file]), /unexpected changed paths/);
    }
});

test('GUI metadata proof refuses wrong pin, origin and nested manifest state', t => {
    const root = mkdtempSync(path.join(tmpdir(), 'forward-gui-metadata-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    mkdirSync(path.join(root, 'packages/scratch-gui'), {recursive: true});
    const pins = {'bw-board': 'a'.repeat(40), 'bw-circuit-ui': 'b'.repeat(40)};
    const dependencies = Object.fromEntries(Object.entries(pins).map(([name, sha]) => [name, `github:CrispStrobe/${name}#${sha}`]));
    const lock = {packages: {'': {dependencies}, ...Object.fromEntries(Object.entries(dependencies)
        .map(([name, spec]) => [`node_modules/${name}`, {resolved: spec}]))}};
    const write = (file, data) => writeFileSync(path.join(root, file), JSON.stringify(data));
    write('vendor-pins.json', pins);
    write('packages/scratch-gui/package.json', {dependencies});
    const lockPath = 'packages/scratch-gui/package-lock.json';
    write(lockPath, lock);
    assert.doesNotThrow(() => verifyGuiPackageMetadata(root));
    for (const entry of [{resolved: `https://evil.example/${pins['bw-board']}`},
        {resolved: dependencies['bw-board'], link: true}, {resolved: `github:CrispStrobe/bw-board#${pins['bw-circuit-ui']}`}]) {
        write(lockPath, {packages: {...lock.packages, 'node_modules/bw-board': entry}});
        assert.throws(() => verifyGuiPackageMetadata(root), /GUI package manifest\/lock/);
    }
    write(lockPath, {packages: {...lock.packages, '': {dependencies: {}}}});
    assert.throws(() => verifyGuiPackageMetadata(root), /GUI package manifest\/lock/);
});

test('CLI keeps clean-tree preflight, exact clone identities, scoped staging and an owned server', () => {
    const src = readFileSync(new URL('../scripts/vendor-forward.mjs', import.meta.url), 'utf8');
    assert.ok(src.indexOf('git status --porcelain') < src.indexOf('for (const repo of UPSTREAMS)'));
    assert.match(src, /if \(got !== want\) throw/);
    assert.match(src, /--unshallow --no-tags origin \$\{want\}/);
    assert.match(src, /if \(!pinned\[repo\]\) sh\(`git.*merge-base --is-ancestor/);
    assert.match(src, /pin-packages\.mjs --set \$\{repo\}=\$\{shas\[repo\]\} --pin/);
    assert.ok(src.indexOf("sh('npm run build'") < src.indexOf('verifyForwardBuild(sh'));
    assert.ok(src.indexOf("sh('npm run check:load')") < src.indexOf("sh('npm run build'"));
    assert.match(src, /Claude-Session: vendor-forward-script/);
    assert.ok(src.indexOf('verifyForwardBuild(sh') < src.indexOf("server = spawn('python3'"));
    assert.doesNotMatch(src, /shaOf\(/);
    assert.ok(src.indexOf('selectForwardOutputs([...changed, ...added])') < src.indexOf('git add -f --'));
    assert.doesNotMatch(src, /pkill|git add overlay|process\.exit\(/);
    assert.match(src, /spawn\('python3', \['-u', '-m', 'http.server', '0'/);
    assert.match(src, /finally \{[\s\S]*server\.kill\('SIGTERM'\)/);
});

test('actual forward BIOS comparison CLI accepts default mode and leaves provenance bytes unchanged', {
    skip: process.env.BW_BOARD_DIR ? false : 'BW_BOARD_DIR unset — actual forward BIOS CLI not exercised'
}, () => {
    const root = process.env.BW_FORWARD_APP_ROOT || fileURLToPath(new URL('../', import.meta.url));
    const dir = path.resolve(process.env.BW_BOARD_DIR);
    const {calls, run, options} = record();
    refreshForwardPackages(run, {...options, clones: {...config.clones, 'bw-board': dir}});
    const command = calls.find(({cmd}) => cmd.includes('sync-i8086-bios.mjs')).cmd;
    const files = ['vendor-pins.json', ...['i8086-bios.bin', 'i8086-bios.asm', 'i8086-bios.provenance.json']
        .map(name => `overlay/scratch-gui/static/roms/${name}`)];
    const before = files.map(file => readFileSync(path.join(root, file)));
    const output = execSync(command, {cwd: root, encoding: 'utf8', timeout: 30000,
        env: {...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}`}});
    assert.match(output, /the committed ROM is this source\. Nothing to do\./);
    files.forEach((file, i) => assert.deepEqual(readFileSync(path.join(root, file)), before[i], file));
});
