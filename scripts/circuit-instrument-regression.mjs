#!/usr/bin/env node
/** Fixed authored CLI campaign. Default mode only prints its manifest. */
import {readFileSync, writeFileSync, mkdirSync, existsSync, realpathSync, readdirSync} from 'node:fs';
import {resolve, join, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createManifest, CONTRACT_SOURCES, contentHash} from './lib/instrument-regression-cases.mjs';
import {oracleDeck, parseOracleTable, compareDc, parseCapture, parseScopeCsv, compareCapture,
    reconcileResults, close, compareSeries, passiveReference, lmReference, createAdpReference} from './lib/instrument-regression-compare.mjs';

const RELEASE_SOURCE = '6d78f7e107752497ed96b30b03e985386916fc59';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const json = value => JSON.stringify(value, null, 2) + '\n';
const save = (path, value) => writeFileSync(path, value, {flag: 'wx'});

export function admitReleaseRun(run) {
    if (!Number.isSafeInteger(run.id) || run.id <= 0 || run.event !== 'workflow_dispatch' ||
        !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1 ||
        run.status !== 'completed' || run.conclusion !== 'success' || run.head_branch !== 'main' ||
        run.path !== '.github/workflows/testflight-release-recovery.yml' || !/^[0-9a-f]{40}$/.test(run.head_sha) ||
        run.repository?.full_name !== 'CrispStrobe/brickwright-lite') throw new Error('Release run metadata refused');
    return run;
}

export function admitReleaseJob(run, jobs) {
    admitReleaseRun(run);
    if (jobs.total_count !== 1 || jobs.jobs?.length !== 1) throw new Error('Release job census refused');
    const job = jobs.jobs[0];
    if (!Number.isSafeInteger(job.id) || job.id < 1 || job.run_id !== run.id || job.run_attempt !== run.run_attempt ||
        job.head_sha !== run.head_sha || job.name !== 'metadata' || job.status !== 'completed' || job.conclusion !== 'success' ||
        job.steps?.filter(s => s.name === 'Audit or recover existing release metadata' && s.status === 'completed' && s.conclusion === 'success').length !== 1) {
        throw new Error('Release metadata job join refused');
    }
    return job;
}

export function releaseAcquisition(run, jobs, logBytes) {
    const job = admitReleaseJob(run, jobs);
    return {schemaVersion: 1, runId: run.id, runAttempt: run.run_attempt, headSha: run.head_sha, jobId: job.id,
        endpoint: `repos/CrispStrobe/brickwright-lite/actions/jobs/${job.id}/logs`,
        log: {bytes: logBytes.length, sha256: contentHash(logBytes)}};
}

export function admitReleaseSummary(summary) {
    if (summary.schemaVersion !== 1 || !['audit', 'recover'].includes(summary.action) ||
        summary.version !== '0.1.26' || summary.tag !== 'v0.1.26' || summary.releaseSource !== RELEASE_SOURCE ||
        summary.complete !== true || summary.iosPresent !== true || summary.metadataVerified !== true ||
        summary.pendingReview !== false || summary.reviewRecorded !== true || !Array.isArray(summary.builds) ||
        !summary.builds.some(b => b.platform === 'IOS') || new Set(summary.builds.map(b => b.platform)).size !== summary.builds.length ||
        !summary.builds.every(b => ['IOS', 'MAC_OS'].includes(b.platform) && b.processingState === 'VALID' && b.expired === false &&
            b.usesNonExemptEncryption === false && [null, 'APPROVED'].includes(b.reviewState) &&
            b.internalGroupLinked === true && b.externalGroupLinked === true &&
            b.localizedNotesPresent?.['en-US'] === true && b.localizedNotesPresent?.['de-DE'] === true &&
            b.localizedNotesMatch?.['en-US'] === true && b.localizedNotesMatch?.['de-DE'] === true &&
            ['READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'].includes(b.internalBuildState) &&
            ['READY_FOR_BETA_TESTING', 'IN_BETA_TESTING'].includes(b.externalBuildState))) {
        throw new Error('TestFlight delivery prerequisite not established');
    }
    return summary;
}

export const REQUIRED_MUTATIONS = Object.freeze(['changed-voltage', 'reversed-nonzero-current',
    'timestamp-shift', 'wrong-R', 'wrong-C', 'wrong-L', 'LM-phase', 'LM-pole', 'ADP-no-limiter']);

/** Only consume already-retained successful records. No measured guest replay. */
export function retainedMutationChecks(capture, channels, definition) {
    const p = definition.parameters, mutations = [];
    const output = channels.find(c => c.id === 'output');
    const wave = (name, expected) => mutations.push({name, detected: compareSeries(output.samples,
        output.samples.map(s => ({...s, value: expected(s.timeNs / 1e9)})), definition.tolerances.waveV).some(c => !c.pass)});
    if (definition.template === 'divider' && p.volts === 5 && p.ohms === 1000 && p.ratio === 1) {
        const changed = output.samples.map(s => ({...s, value: s.value + .1}));
        mutations.push({name: 'changed-voltage', detected: compareSeries(changed, output.samples,
            definition.tolerances.waveV).some(c => !c.pass)});
        const index = definition.meters.findIndex(m => m.id === 'load-current');
        const actual = capture.report.meters[index].reading.siValue;
        mutations.push({name: 'reversed-nonzero-current', detected: Math.abs(actual) > 1e-5 &&
            !close(-actual, actual, definition.tolerances.meanA).pass});
        let timeDetected = false;
        try { compareSeries(output.samples.map(s => ({...s, timeNs: s.timeNs + 1})), output.samples, definition.tolerances.waveV); }
        catch (error) { if (error.message === 'Time or SI-unit mismatch') timeDetected = true; else throw error; }
        mutations.push({name: 'timestamp-shift', detected: timeDetected});
        const wrong = structuredClone(definition); wrong.parameters.ohms *= 2;
        mutations.push({name: 'wrong-R', detected: !close(actual,
            passiveReference(wrong, definition.clock.durationNs / 1e9).meters['load-current'], definition.tolerances.meanA).pass});
    }
    if (p.sign === 1 && ((definition.template === 'rc-lowpass' && p.ohms === 1000 && p.storage === 10) ||
        (definition.template === 'rl-lowpass' && p.ohms === 100 && p.storage === 10000000))) {
        const wrong = structuredClone(definition); wrong.parameters.tauNs *= 2;
        wave(definition.template.startsWith('rc') ? 'wrong-C' : 'wrong-L', t => passiveReference(wrong, t).wave.output);
    }
    if (definition.template === 'lm741-follower' && p.sign === 1 && p.phaseNs === 67 && p.loadOhms === 2000) {
        const wrong = structuredClone(definition); wrong.referenceModel.delayNs -= 67;
        wave('LM-phase', t => lmReference(wrong, t).wave.output);
        const wrongPole = structuredClone(definition); wrongPole.referenceModel.bandwidthHz *= 2;
        wave('LM-pole', t => lmReference(wrongPole, t).wave.output);
    }
    if (definition.template === 'adp7118-startup' && p.microfarads === 100 && p.loadOhms === 1000 && p.inputVolts === 6) {
        const noLimit = createAdpReference(definition, {omitLimit: true});
        wave('ADP-no-limiter', t => noLimit.at(t).wave.output);
    }
    return mutations.map(m => ({...m, caseId: definition.id, originalReplay: false}));
}

export function summaryFromOriginalLog(text) {
    const found = [];
    for (const line of text.split(/\r?\n/)) {
        const match = /^(?:\d{4}-\d\d-\d\dT\S+\s+)?(\{"action":.*\})$/.exec(line);
        if (!match) continue;
        const value = JSON.parse(match[1]);
        if (value.version === '0.1.26' && value.releaseSource === RELEASE_SOURCE) found.push(value);
    }
    if (found.length !== 1) throw new Error('Expected one original release summary');
    return admitReleaseSummary(found[0]);
}

export function buildCliArgs(definition, input, directory) {
    const args = [definition.route, input];
    if (definition.route === 'dc-sweep') {
        const s = definition.sweep;
        args.push('--source', s.source, '--from', String(s.from), '--to', String(s.to), '--points', '2');
        for (const o of definition.observations) args.push(o.kind === 'voltage' ? '--observe' : '--current',
            o.kind === 'voltage' ? `${o.tip},${o.reference}` : o.selector);
    } else {
        const c = definition.clock;
        args.push('--profile', 'precision-v1', '--initial', 'zero-state', '--probe', 'ideal',
            '--duration', `${c.durationNs}ns`, '--rate', `${c.rateHz}Hz`, '--max-step', `${definition.maxStepNs}ns`,
            '--csv', join(directory, 'capture.csv'), '--receipt', join(directory, 'receipt.json'));
        if (definition.acquisition === 'watch') args.push('--watch');
        for (const s of definition.scopes) args.push('--scope', `${s.tip},${s.reference}`);
        for (const m of definition.meters) args.push('--meter', `${m.mode}:${m.probes.join(',')}`);
    }
    // Watch emits NDJSON itself; the installed CLI deliberately refuses --json
    // together with --watch rather than silently changing output framing.
    return definition.acquisition === 'watch' ? args : [...args, '--json'];
}

// Independent reproduction of the documented runtime fingerprint, not an import
// from the package which produced the receipt being checked.
export function fingerprint(root, extraFiles = []) {
    root = realpathSync(root);
    const files = ['package.json', ...extraFiles];
    const visit = dir => {
        for (const name of readdirSync(join(root, dir), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            const path = join(dir, name.name);
            if (name.isDirectory()) visit(path);
            else if (name.isFile() && /\.(js|mjs|cjs|json)$/i.test(name.name)) files.push(path);
            else if (name.isSymbolicLink()) throw new Error('Runtime source symlink refused');
        }
    };
    visit('src');
    const chunks = [];
    for (const path of files.sort((a, b) => a.localeCompare(b))) {
        const bytes = readFileSync(join(root, path));
        chunks.push(Buffer.from(`${path.replaceAll('\\', '/')}\0${bytes.length}\0`), bytes, Buffer.from('\0'));
    }
    return {root, sha256: contentHash(Buffer.concat(chunks))};
}

export function verifyCaptureIdentity(receipt, definition, observed) {
    const c = definition.clock;
    if (receipt.schemaVersion !== 1 || receipt.kind !== 'bwc-measurement-receipt' || receipt.exitCode !== 0 ||
        receipt.input?.sha256 !== definition.input.sha256 || receipt.input?.bytes !== Buffer.byteLength(definition.input.text) ||
        receipt.engine?.selection !== 'installed package' || receipt.engine.observed?.root !== observed.engine.root ||
        receipt.engine.observed?.jsJsonTreeSha256 !== observed.engine.sha256 || receipt.cli?.root !== observed.cli.root ||
        receipt.cli?.jsJsonTreeSha256 !== observed.cli.sha256 || receipt.invocation?.nodeVersion !== process.version ||
        receipt.invocation?.BW_BOARD !== null || receipt.clock?.startNs !== '0' ||
        receipt.clock.durationNs !== String(c.durationNs) || receipt.clock.intervalNs !== String(c.intervalNs) ||
        receipt.acquisition !== definition.acquisition || receipt.csv?.sha256 !== observed.csvSha256 ||
        receipt.csv?.bytes !== observed.csvBytes || !/^[0-9a-f]{64}$/.test(receipt.importedCircuitSha256 ?? '') ||
        JSON.stringify(receipt.report) !== JSON.stringify(observed.report)) throw new Error('Capture provenance mismatch');
    return true;
}

function command(executable, argv, cwd, prefix, timeout = 150000) {
    const env = {...process.env, NODE_OPTIONS: '', NODE_PATH: ''};
    delete env.BW_BOARD;
    save(`${prefix}-command.json`, json({executable, argv, cwd, timeoutMs: timeout, engineOverride: false}));
    const result = spawnSync(executable, argv, {cwd, env, timeout, maxBuffer: 16 * 1024 * 1024});
    const stdout = result.stdout ?? Buffer.alloc(0), stderr = result.stderr ?? Buffer.alloc(0);
    save(`${prefix}-stdout.txt`, stdout); save(`${prefix}-stderr.txt`, stderr);
    const outcome = {status: result.status, signal: result.signal, error: result.error?.code ?? null,
        stdout: {bytes: stdout.length, sha256: contentHash(stdout)}, stderr: {bytes: stderr.length, sha256: contentHash(stderr)}};
    save(`${prefix}-outcome.json`, json(outcome));
    return {...outcome, text: stdout.toString('utf8')};
}

export async function runCampaign({output, installedRoot, boardSource, cuiSource, releaseRun, releaseLog}) {
    if (process.versions.node.split('.')[0] !== '22') throw new Error('Campaign requires Node 22');
    if (process.env.BW_BOARD || process.env.NODE_PATH || process.env.NODE_OPTIONS) throw new Error('Runtime overrides refused');
    const run = admitReleaseRun(JSON.parse(readFileSync(releaseRun, 'utf8')));
    const releaseBytes = readFileSync(releaseLog);
    const jobs = JSON.parse(readFileSync(join(dirname(releaseLog), 'jobs.json'), 'utf8'));
    const acquisition = JSON.parse(readFileSync(join(dirname(releaseLog), 'acquisition.json'), 'utf8'));
    if (JSON.stringify(acquisition) !== JSON.stringify(releaseAcquisition(run, jobs, releaseBytes))) throw new Error('Original release acquisition mismatch');
    const release = summaryFromOriginalLog(releaseBytes.toString('utf8'));
    const ancestor = spawnSync('/usr/bin/git', ['merge-base', '--is-ancestor', run.head_sha, 'HEAD'], {cwd: repoRoot});
    if (ancestor.status !== 0) throw new Error('Release workflow source is not admitted ancestor');
    output = resolve(output);
    if (existsSync(output)) throw new Error('Fresh evidence destination required');
    mkdirSync(output, {recursive: true});
    const manifest = createManifest(), results = manifest.cases.map(c => ({id: c.id, status: 'not-run', executed: false}));
    const mutations = [];
    save(join(output, 'manifest.json'), json(manifest));
    save(join(output, 'release-admission.json'), json({run, acquisition, job: admitReleaseJob(run, jobs), summary: release,
        originalLogSha256: contentHash(readFileSync(releaseLog)), observedFrom: 'single admitted official run log',
        limit: 'finite API observation at the release run; not a continuing availability guarantee'}));
    let preflight = null;
    try {
        const pins = JSON.parse(readFileSync(join(repoRoot, 'vendor-pins.json'), 'utf8'));
        for (const name of ['bw-board', 'bw-circuit-ui']) {
            if (pins[name] !== CONTRACT_SOURCES[name]) throw new Error('Manifest source contract moved; re-audit before campaign');
        }
        const {verifyInstalledPackage, verifySingleEngineResolution} = await import('./package-provenance.mjs');
        installedRoot = realpathSync(installedRoot);
        const proof = [verifyInstalledPackage({repoDir: boardSource, installedDir: join(installedRoot, 'bw-board'),
            name: 'bw-board', sha: pins['bw-board']}), verifyInstalledPackage({repoDir: cuiSource,
            installedDir: join(installedRoot, 'bw-circuit-ui'), name: 'bw-circuit-ui', sha: pins['bw-circuit-ui']})];
        verifySingleEngineResolution(installedRoot);
        const engine = fingerprint(join(installedRoot, 'bw-board'));
        const cli = fingerprint(join(installedRoot, 'bw-circuit-ui'), ['bin/bwc.mjs']);
        save(join(output, 'package-proof.json'), json({proof, engine, cli, node: process.version,
            limits: {dependenciesVerified: false, nativePayloadHashCompared: true, hermeticExecution: false}}));
        const oracleVersion = command('ngspice', ['--version'], output, join(output, 'ngspice-version'), 10000);
        if (oracleVersion.status !== 0) throw new Error('ngspice unavailable');
        for (let index = 0; index < manifest.cases.length; index++) {
            const c = manifest.cases[index], dir = join(output, c.id);
            mkdirSync(dir);
            const input = join(dir, `input.${c.input.format === 'json' ? 'json' : 'cir'}`);
            save(input, c.input.text);
            let executed = false;
            try {
                let oracle = null;
                if (c.referenceKind === 'ngspice') {
                    save(join(dir, 'oracle.cir'), oracleDeck(c));
                    const response = command('ngspice', ['-n', '-b', 'oracle.cir'], dir, join(dir, 'ngspice'), 60000);
                    if (response.status !== 0) throw new Error('Oracle execution refused');
                    oracle = {raw: parseOracleTable(readFileSync(join(dir, 'oracle-raw.txt'), 'utf8'), c)};
                    if (c.clock) oracle.sampled = parseOracleTable(readFileSync(join(dir, 'oracle-sampled.txt'), 'utf8'), c, {sampled: true});
                }
                const response = command(process.execPath, [join(cli.root, 'bin/bwc.mjs'), ...buildCliArgs(c, input, dir)],
                    dir, join(dir, 'cli'));
                executed = response.status !== null && response.error === null;
                if (response.status !== 0) {
                    results[index] = {id: c.id, status: 'refused', executed, reason: 'CLI returned nonzero; original diagnostics retained'};
                    save(join(dir, 'result.json'), json(results[index]));
                    continue;
                }
                let checks;
                if (!c.clock) checks = compareDc(JSON.parse(response.text), c, oracle.raw);
                else {
                    const capture = parseCapture(response.text, c), bytes = readFileSync(join(dir, 'capture.csv'));
                    const receipt = JSON.parse(readFileSync(join(dir, 'receipt.json'), 'utf8'));
                    verifyCaptureIdentity(receipt, c, {engine, cli, report: capture.report,
                        csvSha256: contentHash(bytes), csvBytes: bytes.length});
                    const channels = parseScopeCsv(bytes.toString('utf8'), c);
                    checks = compareCapture(capture, channels, c, oracle);
                    if (checks.every(c => c.pass)) mutations.push(...retainedMutationChecks(capture, channels, c));
                }
                save(join(dir, 'checks.json'), json(checks));
                results[index] = {id: c.id, status: checks.every(c => c.pass) ? 'pass' : 'fail', executed,
                    numericChecks: checks.length, failures: checks.filter(c => !c.pass).length,
                    referenceKind: c.referenceKind, measurementLocations: c.observations?.length ?? c.scopes.length + c.meters.length};
            } catch (error) {
                results[index] = {id: c.id, status: 'noncomparable', executed, reason: error.message};
            }
            save(join(dir, 'result.json'), json(results[index]));
        }
    } catch (error) { preflight = error.message; }
    const reconciliation = reconcileResults(manifest.cases, results);
    const byReference = Object.fromEntries(['ngspice', 'nominal-analytic'].map(kind => {
        const definitions = manifest.cases.filter(c => c.referenceKind === kind), ids = new Set(definitions.map(c => c.id));
        return [kind, reconcileResults(definitions, results.filter(r => ids.has(r.id)))];
    }));
    const mutationComplete = REQUIRED_MUTATIONS.every(name => mutations.filter(m => m.name === name && m.detected).length === 1);
    const report = {schemaVersion: 1, manifestSha256: manifest.definitionSha256,
        ...reconciliation, complete: reconciliation.complete && mutationComplete && preflight === null,
        mutationComplete, mutations, preflight, byReference, results,
        claims: {authoredParameterCases: true, importedCorpusValidation: false, physicalAccuracy: false,
            nominalDeviceCasesAreSpiceProof: false, rawEvidenceRetained: true}};
    save(join(output, 'report.json'), json(report));
    const originals = [];
    const collect = (relative = '') => {
        for (const entry of readdirSync(join(output, relative), {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
            const name = relative ? `${relative}/${entry.name}` : entry.name;
            if (entry.isDirectory()) collect(name);
            else if (entry.isFile()) {
                const bytes = readFileSync(join(output, name));
                originals.push({name, bytes: bytes.length, sha256: contentHash(bytes)});
            } else throw new Error('Unexpected evidence symlink or special file');
        }
    };
    collect();
    save(join(output, 'originals-index.json'), json({schemaVersion: 1, originals,
        limit: 'content hashes of retained originals; not signed provenance or a numerical oracle'}));
    return report;
}

export async function main(argv = process.argv.slice(2)) {
    if (argv.length === 0 || (argv.length === 1 && argv[0] === '--plan')) {
        console.log(json(createManifest())); return;
    }
    if (argv[0] === '--check-release-run' && argv.length === 2) {
        admitReleaseRun(JSON.parse(readFileSync(argv[1], 'utf8'))); return;
    }
    if (argv[0] === '--check-release-job' && argv.length === 3) {
        const job = admitReleaseJob(JSON.parse(readFileSync(argv[1], 'utf8')), JSON.parse(readFileSync(argv[2], 'utf8')));
        console.log(job.id); return;
    }
    if (argv[0] === '--bind-release-log' && argv.length === 5) {
        save(argv[4], json(releaseAcquisition(JSON.parse(readFileSync(argv[1], 'utf8')),
            JSON.parse(readFileSync(argv[2], 'utf8')), readFileSync(argv[3])))); return;
    }
    const allowed = ['--output', '--installed-root', '--board-source', '--cui-source', '--release-run', '--release-log'];
    if (argv[0] !== '--run' || argv.length !== 13) throw new Error('Use --plan or explicit bounded --run options');
    const options = {};
    for (let i = 1; i < argv.length; i += 2) {
        if (!allowed.includes(argv[i]) || !argv[i + 1] || options[argv[i]]) throw new Error('Invalid campaign option');
        options[argv[i]] = argv[i + 1];
    }
    if (Object.keys(options).length !== allowed.length) throw new Error('Missing campaign option');
    const report = await runCampaign({output: options['--output'], installedRoot: options['--installed-root'],
        boardSource: options['--board-source'], cuiSource: options['--cui-source'],
        releaseRun: options['--release-run'], releaseLog: options['--release-log']});
    console.log(json({complete: report.complete, counts: report.counts, preflight: report.preflight}));
    if (!report.complete || report.preflight) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
