import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createAuditProgress, writeProgressBytes} from '../scripts/lib/conversion-progress.mjs';
import {auditConversionSubject, compactConversionObservationGraph} from '../scripts/lib/conversion-audit-core.mjs';
import {openConversionCatalogue} from '../scripts/lib/conversion-context-inputs.mjs';
import {fixture} from './fixtures/conversion-context-catalogue.mjs';
const raw = source => ({id: 'actual', name: 'actual', kind: 'RAW_BASELINE', target: 'arcade',
    files: {'main.ts': source, 'pxt.json': JSON.stringify({name: 'actual', dependencies: {device: '*'}, files: ['main.ts']})}});
const identity = {ordinal: 0, id: 'actual', kind: 'RAW_BASELINE', target: 'arcade'};
const lines = file => fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
function contradictory () {
    const subject = raw('let count=1;'); subject.kind = 'RETAINED_CONTEXT';
    subject.files['pxt.json'] = JSON.stringify({name: 'actual', dependencies: {library: 'github:owner/library#first'}, files: ['main.ts']});
    subject.resolved = {target: 'arcade', inputFiles: {...subject.files}, dependencyBindings: {library: 'github:owner/library#first'},
        packages: {library: {identity: 'github:owner/library#first', dependencyConfig: {dependencies: {library: 'github:owner/library#second'}}, files: {}}}, fetchedExtensions: []};
    return subject;
}

test('optional progress records whole ordered lines and actual process clocks with explicit observer residual', async () => fixture(f => {
    const file = path.join(f.directory, 'progress.jsonl'), p = createAuditProgress(file);
    p.mark('CLI_PROGRESS_BEGIN');p.mark('SUBJECT_BEGIN', identity);p.mark('CONVERSION_END', identity);p.close();p.close();
    const rows = lines(file);assert.deepEqual(rows.map(r => r.phase), ['CLI_PROGRESS_BEGIN','SUBJECT_BEGIN','CONVERSION_END']);
    assert.deepEqual(rows.map(r => r.sequence), [0,1,2]);assert.deepEqual(rows[1].subject, identity);
    assert.equal(Object.hasOwn(rows[0], 'subject'), false);
    for (const [i,row] of rows.entries()) {
        assert.equal(row.schema, 'brickwright/compat-progress/v1');assert.match(row.monotonicNanoseconds, /^\d+$/);
        assert.ok(Number.isInteger(row.userMicroseconds) && Number.isInteger(row.systemMicroseconds));
        assert.match(row.costBoundary, /final event write\/close residual unmeasured/);
        if (i) {
            assert.ok(BigInt(row.monotonicNanoseconds) >= BigInt(rows[i-1].monotonicNanoseconds));
            assert.ok(BigInt(row.observerBeforeThisEvent.wallNanoseconds) > 0n);
            assert.ok(row.userMicroseconds >= rows[i-1].userMicroseconds);
        }
    }
}));
test('progress byte writer completes genuine partial FD writes and refuses zero or impossible progress', async () => fixture(f => {
    const file = path.join(f.directory, 'partial'), fd = fs.openSync(file, 'wx'), bytes = Buffer.from('complete actual journal bytes\n');
    let calls = 0;
    try {
        writeProgressBytes(fd, bytes, (target, value, offset, length) => {calls++;return fs.writeSync(target, value, offset, Math.min(length, 3));});
        assert.ok(calls > 1);assert.deepEqual(fs.readFileSync(file), bytes);
        assert.throws(() => writeProgressBytes(fd, bytes, () => 0), /no bounded progress/);
        assert.throws(() => writeProgressBytes(fd, bytes, () => bytes.length + 1), /no bounded progress/);
        const original = new Error('actual observer sink failure');assert.throws(() => writeProgressBytes(fd, bytes, () => {throw original;}), e => e === original);
    } finally {fs.closeSync(fd);}
}));
test('progress bounds fail sticky before another event and preserve the exact first observer error', async () => fixture(f => {
    for (const [index,limits] of [{maxEvents: 1},{maxBytes: 1},{maxLineBytes: 1}].entries()) {
        const file = path.join(f.directory, 'bounded'+index), p = createAuditProgress(file, limits);
        if (index === 0) p.mark('CLI_PROGRESS_BEGIN');
        let first;try {p.mark('SUBJECT_BEGIN', identity);} catch (e) {first=e;}
        assert.ok(first instanceof Error);assert.match(first.message, /bound/);
        assert.throws(() => p.throwIfFailed(), e => e === first);
        assert.throws(() => p.mark('CLI_REPORTS_FINISHED'), e => e === first);
        assert.throws(() => p.close(), e => e === first);
        assert.equal(lines(file).length, index === 0 ? 1 : 0);
    }
    assert.throws(() => createAuditProgress(path.join(f.directory, 'bad'), {maxEvents: Infinity}), /bounded integer/);
}));
test('progress admission refuses existing outputs and canonical input report or catalogue collisions without mutation', async () => fixture(f => {
    const file = path.join(f.directory, 'original');fs.writeFileSync(file, 'original bytes');
    assert.throws(() => createAuditProgress(file), /EEXIST/);assert.equal(fs.readFileSync(file,'utf8'),'original bytes');
    const fresh = path.join(f.directory, 'fresh');
    assert.throws(() => createAuditProgress(fresh, {protectedPaths: [fresh]}), /collides/);assert.equal(fs.existsSync(fresh), false);
    const link = path.join(f.directory, 'alias');fs.symlinkSync(f.directory, link, 'dir');
    assert.throws(() => createAuditProgress(path.join(link,'fresh'), {protectedPaths: [fresh]}), /collides/);
    assert.equal(fs.existsSync(fresh), false);assert.throws(() => createAuditProgress(file, {protectedPaths: [file]}), /collides/);
    assert.throws(() => createAuditProgress(path.join(f.directory,'new-input.ts'), {protectedPaths: [f.directory]}), /collides/);
    assert.equal(fs.existsSync(path.join(f.directory,'new-input.ts')),false);
}));
test('progress core observer reads only fixed own phase and status scalars without inspecting values or errors', async () => fixture(f => {
    const file = path.join(f.directory, 'scalars'), p = createAuditProgress(file);let calls = 0;
    const event = {phase:'import',status:'return'};
    for (const key of ['value','exception','channels','current','returned']) Object.defineProperty(event,key,{get(){calls++;throw Error('unobserved');}});
    p.onObservation(event,identity);p.onObservation({phase:'dependency-callback'},identity);p.close();
    assert.equal(calls,0);assert.deepEqual(lines(file).map(r=>[r.corePhase,r.coreStatus]),[['import','return'],['dependency-callback','observed-before-validation']]);
    const invalid=createAuditProgress(path.join(f.directory,'accessor'));
    const accessor={};Object.defineProperty(accessor,'phase',{get(){calls++;return 'import';}});
    assert.throws(()=>invalid.onObservation(accessor,identity),/phase differs/);assert.equal(calls,0);
}));
test('actual two RAW conversions retain full returned graphs while opt-in scalar observations remain separate', async () => fixture(async f => {
    const file=path.join(f.directory,'actual'),p=createAuditProgress(file);
    for (const [ordinal,source] of ['let count=1;','let first=1;let second=first+2;'].entries()) {
        const subject=raw(source),id={...identity,ordinal};p.mark('SUBJECT_BEGIN',id);
        const actual=await auditConversionSubject(subject,{onObservation:event=>p.onObservation(event,id)});
        assert.equal(actual.import.status,'return');assert.equal(actual.creator.status,'return');
        assert.deepEqual(actual.inputMutation,{rootChanged:false,resolvedChanged:false});
        const before=compactConversionObservationGraph(actual);p.mark('ROW_GRAPH_CAPTURED_IN_MEMORY',id);
        assert.deepEqual(compactConversionObservationGraph(actual),before,'scalar progress cannot modify provided values or diagnostics');
    }
    p.close();const rows=lines(file);assert.equal(rows.filter(r=>r.phase==='SUBJECT_BEGIN').length,2);
    assert.deepEqual(rows.filter(r=>r.phase==='CORE_OBSERVATION').map(r=>r.corePhase),['import','creator','import','creator']);
    const source=fs.readFileSync(new URL('../scripts/compat-audit.mjs',import.meta.url),'utf8');
    assert.match(source,/progressFile === null \? null : \(await import\('\.\/lib\/conversion-progress\.mjs'\)\)/);
    assert.match(source,/onObservation: event => progress\.onObservation\(event, progressSubject\)/);
    assert.equal((source.match(/else observed = await auditConversionSubject\(\{/g)||[]).length,2);
    assert.match(source,/const observed = progress \? await observeConversion\(subject\) : await auditConversionSubject\(subject, conversionOptions\(\)\)/);
    assert.match(source,/else row = await applyOptionalGates\(row, observed\.import\.value, null, observed\)/);
    assert.equal((source.match(/if \(progress\) progress\.throwIfFailed\(\);/g)||[]).length,2);
}));
test('actual dependency product rejection retains original code channels and unattempted Creator with progress enabled', async () => fixture(async f => {
    const p=createAuditProgress(path.join(f.directory,'product')),subject=contradictory();
    const actual=await auditConversionSubject(subject,{onObservation:event=>p.onObservation(event,identity)});p.close();
    assert.equal(actual.import.status,'throw');assert.equal(actual.import.exception.actual.code,'DEPENDENCY_IDENTITY_MISMATCH');
    assert.equal(actual.creator.status,'unattempted');assert.equal(actual.stage,'parse-failed');
    assert.deepEqual(actual.inputMutation,{rootChanged:false,resolvedChanged:false});
    assert.deepEqual(lines(path.join(f.directory,'product')).map(r=>[r.corePhase,r.coreStatus]),[['dependency-callback','observed-before-validation'],['import','throw']]);
}));
test('actual dependency observer failure escapes before product classification and keeps its sticky error identity', async () => fixture(async f => {
    f.catalogue.subjects.push(f.context());const subject=openConversionCatalogue(f.save()).loadSubject(0);
    const p=createAuditProgress(path.join(f.directory,'observer'),{maxEvents:1});p.mark('CLI_PROGRESS_BEGIN');let original;
    await assert.rejects(auditConversionSubject(subject,{onObservation:event=>{try{p.onObservation(event,identity);}catch(e){original=e;throw e;}}}),e=>e===original);
    assert.ok(original instanceof Error);assert.match(original.message,/bound/);
    assert.throws(()=>p.throwIfFailed(),e=>e===original);assert.equal(Object.hasOwn(original,'code'),false);
    assert.deepEqual(lines(path.join(f.directory,'observer')).map(r=>r.phase),['CLI_PROGRESS_BEGIN']);
}));
