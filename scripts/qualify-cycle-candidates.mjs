#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {evaluateCandidateDecision} from './lib/cycle-candidate-decision.mjs';

if (!process.env.CI && process.env.BW_ALLOW_LOCAL_CYCLE_QUALIFICATION !== '1') {
    console.error('cycle-core qualification is CI-only; set BW_ALLOW_LOCAL_CYCLE_QUALIFICATION=1 explicitly');
    process.exit(2);
}

const root = resolve(process.env.CYCLE_CANDIDATE_ROOT || '');
const output = resolve(process.env.CYCLE_QUALIFICATION_OUTPUT ||
    'artifacts/cycle-core-qualification/report.json');
const manifest = JSON.parse(readFileSync(new URL('../test/fixtures/cycle-core-candidates.json', import.meta.url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = [];
const check = (name, ok, detail = '') => checks.push({name, ok: Boolean(ok), detail});
const observations = {};

for (const [name, candidate] of Object.entries(manifest.candidates)) {
    const checkout = join(root, name);
    for (const path of [...candidate.sourcePaths, ...(candidate.licensePath ? [candidate.licensePath] : [])]) {
        let bytes;
        try { bytes = readFileSync(join(checkout, path)); } catch (error) {
            check(`${name} source exists: ${path}`, false, error.message);
            continue;
        }
        const expected = candidate.sourceSha256?.[path];
        check(`${name} source hash: ${path}`, expected ? sha256(bytes) === expected : true,
            expected ? `sha256 ${sha256(bytes)}` : `inventory sha256 ${sha256(bytes)} (promotion blocked)`);
    }
    check(`${name} license is promotion-ready`, candidate.license !== 'UNVERIFIED',
        candidate.license === 'UNVERIFIED' ? 'upstream license file/SPDX grant not established at the pin' : candidate.license);
}

const runner = process.env.Z80_QUALIFICATION_RUNNER;
if (runner) {
    const result = spawnSync(runner, [], {encoding: 'utf8'});
    let report = null;
    try { report = JSON.parse(result.stdout); } catch {}
    const candidate = manifest.candidates.z80;
    const rejectionEvidence = {runnerExit: result.status,
        oracleCorpusTotal: report?.oracleCorpusTotal,
        oracleCorpusPassed: report?.oracleCorpusPassed};
    observations.z80 = {evidenceComplete: report?.schema === 1,
        qualifies: result.status === 0 && report?.oracleCorpusPassed === report?.oracleCorpusTotal,
        rejectionEvidence};
    const decision = evaluateCandidateDecision(candidate, observations.z80);
    check('floooh Z80 runner outcome matches the declared candidate decision', decision.decisionMatched,
        `${JSON.stringify(rejectionEvidence)}; ${decision.reason || 'qualified'}`);
    check('floooh Z80 snapshot replay is byte-identical', report?.snapshotReplay === true,
        report ? JSON.stringify(report) : result.stdout);
    check('floooh Z80 snapshots replay from every exercised microstep', report?.snapshotPoints === 42,
        report ? `${report.snapshotPoints} snapshot points` : 'no report');
    check('floooh Z80 emits non-empty recorded control activity',
        Number.isSafeInteger(report?.controlMask) && (report.controlMask & 15) === 15,
        report ? `mask ${report.controlMask}` : 'no report');
    check('floooh Z80 HALT and interrupt acknowledge are observable cycle boundaries',
        report?.haltSeen === true && report?.interruptAcknowledgeSeen === true,
        report ? JSON.stringify(report) : 'no report');
    check('floooh Z80 matches the pinned SingleStepTests retire vector',
        report?.oracleVector === '3E 0000' && report?.oracleTicks === 7 && report?.oracleMatch === true,
        report ? JSON.stringify(report) : 'no report');
    check('floooh Z80 publishes the bounded pinned SingleStepTests corpus result',
        Number.isSafeInteger(report?.oracleCorpusTotal) && report.oracleCorpusTotal === 32 &&
            Number.isSafeInteger(report.oracleCorpusPassed) && report.oracleCorpusPassed >= 0 &&
            report.oracleCorpusPassed <= report.oracleCorpusTotal &&
            (report.oracleCorpusPassed === report.oracleCorpusTotal ? report.oracleFirstFailure === null :
                typeof report.oracleFirstFailure === 'string'),
        report ? `${report.oracleCorpusPassed}/${report.oracleCorpusTotal}; first failure: ${report.oracleFirstFailure}` : 'no report');
    check('floooh Z80 WAIT stretching and NMI entry are directly observed',
        report?.waitStretched === true && report?.nmiStackWrite === true,
        report ? JSON.stringify(report) : 'no report');
    check('floooh Z80 publishes bounded cost receipts',
        Number.isSafeInteger(report?.checkpointBytes) && report.checkpointBytes > 65536 &&
        Number.isSafeInteger(report?.ticksPerSecond) && report.ticksPerSecond > 0,
        report ? `${report.checkpointBytes} checkpoint bytes; ${report.ticksPerSecond} ticks/s` : 'no report');
} else {
    observations.z80 = {evidenceComplete: false, qualifies: false};
    check('floooh Z80 native runner supplied', false, 'Z80_QUALIFICATION_RUNNER is required');
}

const w65Runner = process.env.W65C02_QUALIFICATION_RUNNER;
if (w65Runner) {
    const result = spawnSync(process.execPath, [w65Runner], {encoding: 'utf8', env: {
        ...process.env, W65C02_CANDIDATE_ROOT: join(root, 'w65c02')
    }});
    let report = null;
    try { report = JSON.parse(result.stdout); } catch {}
    const expectedRejection = manifest.candidates.w65c02.decision === 'reject';
    check('JSMoo W65C02 isolated runner produced a bounded result', report?.schema === 1,
        result.stderr || result.stdout || `exit ${String(result.status)}`);
    check('JSMoo W65C02 promotion decision matches replay evidence', expectedRejection
        ? result.status !== 0 && report?.snapshotReplay === false &&
            report?.stateMismatch?.includes('regs.P')
        : result.status === 0 && report?.snapshotReplay === true,
    report ? JSON.stringify(report) : result.stdout);
    check('JSMoo W65C02 emits non-empty bus activity', report?.busActivity === true,
        report ? JSON.stringify(report) : 'no report');
    const expectedVectors = manifest.candidates.w65c02.oracle.vectorPaths.length *
        manifest.candidates.w65c02.oracle.vectorsPerOpcode;
    check('JSMoo W65C02 runs the bounded pinned WDC65C02 corpus',
        report?.corpus?.total === expectedVectors &&
        Number.isSafeInteger(report?.corpus?.retirePassed) &&
        Number.isSafeInteger(report?.corpus?.busPassed),
    report?.corpus ? `${report.corpus.total} vectors; ${report.corpus.retirePassed} retire; ` +
        `${report.corpus.busPassed} bus matches` : 'no corpus receipt');
    check('JSMoo W65C02 corpus receipts prove every selected oracle shard hash',
        report?.corpus?.vectorReceipts?.length === manifest.candidates.w65c02.oracle.vectorPaths.length &&
        report.corpus.vectorReceipts.every(receipt =>
            manifest.candidates.w65c02.oracle.vectorSha256[receipt.path] === receipt.sha256 &&
            receipt.selected === manifest.candidates.w65c02.oracle.vectorsPerOpcode),
    report?.corpus ? JSON.stringify(report.corpus.vectorReceipts) : 'no vector receipts');
    check('WAI and STP corpus omissions remain explicit rejection receipts',
        typeof report?.corpus?.excluded?.cb === 'string' && typeof report?.corpus?.excluded?.db === 'string',
        report?.corpus ? JSON.stringify(report.corpus.excluded) : 'no exclusion receipt');
    check('JSMoo W65C02 corpus failure evidence is bounded, never discarded',
        Array.isArray(report?.corpus?.failures) && report.corpus.failures.length <= 12 &&
        report.corpus.retirePassed <= report.corpus.total && report.corpus.busPassed <= report.corpus.total,
        report?.corpus ? `${report.corpus.failures.length} retained first-failure receipts` : 'no corpus receipt');
    check('JSMoo W65C02 known B-latch defect is reproduced by real oracle vectors',
        report?.corpus?.statusLatchOnly > 0 && report.corpus.failures.some(failure =>
            failure.statusOnly === true && failure.registerDiffs?.p),
    report?.corpus ? `${report.corpus.statusLatchOnly} otherwise-matching vectors changed P.B` : 'no corpus receipt');
    const lowPower = report?.lowPowerQualification;
    check('JSMoo W65C02 runs exact WAI/STP IRQ/NMI timed-bus scenarios',
        lowPower?.schema === 1 && lowPower.total === 5 &&
        lowPower.scenarios?.every(scenario => scenario.bus.length === scenario.actions),
        lowPower ? `${lowPower.passed}/${lowPower.total} scenarios matched` : 'no low-power receipt');
    check('JSMoo W65C02 snapshots replay at every low-power microstep',
        lowPower?.snapshotPoints === 51 && lowPower.snapshotPassed === lowPower.snapshotPoints,
        lowPower ? `${lowPower.snapshotPassed}/${lowPower.snapshotPoints} microsteps` : 'no low-power receipt');
    check('JSMoo W65C02 WAI timing defects remain explicit rejection evidence',
        lowPower?.scenarios?.filter(scenario => scenario.name.startsWith('WAI')).length === 3 &&
        lowPower.scenarios.filter(scenario => scenario.name.startsWith('WAI')).every(scenario =>
            !scenario.passed && scenario.failures.some(failure => failure.category === 'timed-wake-bus')),
        lowPower ? JSON.stringify(lowPower.failures) : 'no low-power receipt');
    check('JSMoo W65C02 STP hold and reset behavior match the bespoke vectors',
        lowPower?.scenarios?.filter(scenario => scenario.name.startsWith('STP')).length === 2 &&
        lowPower.scenarios.filter(scenario => scenario.name.startsWith('STP')).every(scenario => scenario.passed),
        lowPower ? JSON.stringify(lowPower.scenarios.filter(scenario => scenario.name.startsWith('STP')))
            : 'no low-power receipt');
    observations.w65c02 = {evidenceComplete: report?.schema === 1,
        qualifies: result.status === 0 && report?.snapshotReplay === true,
        rejectionEvidence: {runnerExit: result.status, snapshotReplay: report?.snapshotReplay,
            stateMismatch: report?.stateMismatch?.includes('regs.P') ? 'regs.P' : report?.stateMismatch}};
    const decision = evaluateCandidateDecision(manifest.candidates.w65c02, observations.w65c02);
    check('JSMoo W65C02 runner outcome matches the declared candidate decision', decision.decisionMatched,
        `${JSON.stringify(observations.w65c02.rejectionEvidence)}; ${decision.reason || 'qualified'}`);
} else {
    observations.w65c02 = {evidenceComplete: false, qualifies: false};
    check('JSMoo W65C02 isolated runner supplied', false, 'W65C02_QUALIFICATION_RUNNER is required');
}

const failed = checks.filter(item => !item.ok);
const candidateResults = Object.fromEntries(Object.entries(manifest.candidates).map(([name, candidate]) => {
    const result = evaluateCandidateDecision(candidate, observations[name]);
    return [name, {decision: candidate.decision, ...result}];
}));
const report = {schema: 1, generatedAt: new Date().toISOString(), manifest, checks,
    passed: checks.length - failed.length, failed: failed.length,
    evaluationSucceeded: failed.length === 0 &&
        Object.values(candidateResults).every(candidate => candidate.decisionMatched),
    promotionReady: failed.length === 0 &&
        Object.values(candidateResults).every(candidate => candidate.promotionReady),
    candidateResults,
    candidateDecisions: Object.fromEntries(Object.entries(manifest.candidates)
        .map(([name, candidate]) => [name, candidate.decision]))};
mkdirSync(resolve(output, '..'), {recursive: true});
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({passed: report.passed, failed: report.failed, output}));
process.exit(failed.length ? 1 : 0);
