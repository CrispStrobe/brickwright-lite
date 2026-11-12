import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const MENU_PATHS = new Set([
    'overlay/scratch-gui/src/components/menu/menu.jsx',
    'packages/scratch-gui/src/components/menu/menu.jsx',
    'overlay/scratch-gui/src/lib/menu-keyboard.js',
    'packages/scratch-gui/src/lib/menu-keyboard.js',
    'scripts/verify-arcade-tilemap-painter.mjs',
    'test/menu-keyboard.test.mjs',
    'test/menu-submenu-focus.test.mjs'
]);
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const uncertain = () => ({selected: true, apex: true, tempest: true, reason: 'checkout-scope-uncertain'});
const noGuests = reason => ({selected: false, apex: false, tempest: false, reason});

export function classifyGuestPaths(paths) {
    const result = {selected: false, apex: false, tempest: false, matches: []};
    const common = new Set(['package.json', 'package-lock.json', 'vendor-pins.json',
        '.github/workflows/build.yml', 'scripts/menu-painter-browser-scope.mjs']);
    const robot = new Set(['scripts/verify-sim-lab-browser.mjs',
        'scripts/lib/robot-lab-qualification.mjs', 'docs/data/robot-lab-qualification.json',
        'scripts/lib/sim-lab-q5-browser-gate.mjs']);
    for (const file of paths) {
        if (MENU_PATHS.has(file)) {result.selected = true; result.matches.push(file); continue;}
        if (common.has(file)) {result.selected = result.apex = result.tempest = true; continue;}
        if (file === 'scripts/lib/sim-lab-r3-judges.mjs' ||
            /^(?:overlay|packages)\/scratch-gui\/static\/sim-lab\/(?:models|programs|lessons)\/apex[.]/.test(file) ||
            file.startsWith('test/fixtures/model-files/apex-source/')) {result.apex = true; continue;}
        if (file === 'scripts/lib/sim-lab-r4-judges.mjs' ||
            /^(?:overlay|packages)\/scratch-gui\/static\/sim-lab\/(?:models|programs|lessons)\/tempest-pendulum[.]/.test(file) ||
            file.startsWith('test/fixtures/model-files/tempest-pendulum-source/')) {result.tempest = true; continue;}
        if (robot.has(file) || /^(?:overlay|packages)\/scratch-gui\/(?:src\/lib\/bw-sim|static\/ldraw)\//.test(file) ||
            file.startsWith('scripts/lib/sim-lab-')) {result.apex = result.tempest = true; continue;}
        if (/^(?:docs|lanes|test)\//.test(file) || /^[^/]+\.md$/.test(file)) continue;
        // Unclassified executable/build inputs cannot prove these app journeys unrelated.
        result.selected = result.apex = result.tempest = true;
    }
    return result;
}

export function menuPainterScope(root, {eventName, event, checkoutSha}) {
    if (eventName !== 'pull_request') return noGuests('not-a-pr');
    const pr = event?.pull_request;
    if (!pr || event?.repository?.full_name !== 'CrispStrobe/brickwright-lite' ||
        !sha(checkoutSha) || !sha(pr.base?.sha) || !sha(pr.head?.sha) ||
        pr.base?.repo?.full_name !== 'CrispStrobe/brickwright-lite' ||
        !Array.isArray(pr.labels) || pr.labels.some(label => typeof label?.name !== 'string')) return uncertain();
    try {
        const env = {...process.env};
        for (const key of Object.keys(env)) if (key.startsWith('GIT_')) delete env[key];
        env.GIT_OPTIONAL_LOCKS = '0';
        const git = args => execFileSync('/usr/bin/git', ['-c', 'core.fsmonitor=false', ...args],
            {cwd: root, env, encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024});
        const parents = git(['rev-list', '--parents', '-n', '1', 'HEAD']).trim().split(/\s+/);
        if (parents.length !== 3 || parents[0] !== checkoutSha || parents[1] !== pr.base.sha ||
            parents[2] !== pr.head.sha) return uncertain();
        // --no-renames yields both deletion and addition paths for every rename.
        const raw = git(['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--name-only', '-z',
            parents[1], parents[0], '--']);
        if (raw && !raw.endsWith('\0')) return uncertain();
        const paths = raw ? raw.slice(0, -1).split('\0') : [];
        if (!paths.length) return uncertain();
        const selection = classifyGuestPaths(paths);
        return {...selection, reason: selection.selected || selection.apex || selection.tempest ? 'affected-guest-path' : 'proven-unrelated',
            checkoutSha, baseSha: parents[1], headSha: parents[2], changedPaths: paths.length};
    } catch {
        return uncertain();
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    let decision;
    try {
        if (statSync(process.env.GITHUB_EVENT_PATH).size > 4 * 1024 * 1024) throw new Error('Event too large');
        const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
        const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
        decision = menuPainterScope(root, {eventName: process.env.GITHUB_EVENT_NAME,
            event, checkoutSha: process.env.GITHUB_SHA});
    } catch { decision = uncertain(); }
    const report = path.resolve(process.argv[2] || 'test-results/menu-painter-scope.json');
    mkdirSync(path.dirname(report), {recursive: true});
    writeFileSync(report, JSON.stringify(decision, null, 2) + '\n', {flag: 'wx'});
    appendFileSync(process.env.GITHUB_OUTPUT, `selected=${decision.selected}\napex=${decision.apex}\ntempest=${decision.tempest}\n`);
    console.log(JSON.stringify(decision));
}
