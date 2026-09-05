#!/usr/bin/env node
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

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
    check('floooh Z80 native runner exits cleanly', result.status === 0,
        result.stderr || `exit ${String(result.status)}`);
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
} else {
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
} else {
    check('JSMoo W65C02 isolated runner supplied', false, 'W65C02_QUALIFICATION_RUNNER is required');
}

const failed = checks.filter(item => !item.ok);
const report = {schema: 1, generatedAt: new Date().toISOString(), manifest, checks,
    passed: checks.length - failed.length, failed: failed.length,
    promotionReady: failed.length === 0 && manifest.candidates.z80.decision === 'qualify',
    candidateDecisions: Object.fromEntries(Object.entries(manifest.candidates)
        .map(([name, candidate]) => [name, candidate.decision]))};
mkdirSync(resolve(output, '..'), {recursive: true});
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({passed: report.passed, failed: report.failed, output}));
process.exit(failed.length ? 1 : 0);
