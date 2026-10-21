import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {admitReportData} from '../scripts/private-assessment/admit-report.mjs';

const sha = text => createHash('sha256').update(text).digest('hex');
const pins = {arrays: 'synthetic-identity'}, versions = {arcade: 'synthetic-version'};
const expected = {inputMode: 'positional-context', sourceCommit: 'a'.repeat(40), corpusCommit: 'b'.repeat(40), catalogueSHA256: 'c'.repeat(64),
    inputMultisetSHA256: 'd'.repeat(64), vendorPinsSHA256: sha(JSON.stringify(pins)),
    makecodeVersionsSHA256: sha(JSON.stringify(versions)),
    rawFiles: Array.from({length: 184}, (_, index) => '/inputs/corpus/' + index + '.ts'),
    contextSubjects: Array.from({length: 41}, (_, index) => ({id: 'context-' + index,
        kind: 'RETAINED_CONTEXT', target: 'arcade', name: 'Synthetic ' + index}))};
function fixture() {
    const source = {commit: expected.sourceCommit, dirty: false, trackedDiffSha256: sha(''), statusSha256: sha('')};
    const provenance = {source, vendorPins: pins, makecodeVersions: versions,
        endIdentity: {source: {...source}, vendorPins: pins, makecodeVersions: versions},
        corpus: {declaredCommit: expected.corpusCommit, commitVerified: false, fileCount: 185,
            unreadableFiles: 0, contentMultisetSha256: expected.inputMultisetSHA256},
        contextCatalogue: {sha256: expected.catalogueSHA256, selectedSubjects: expected.contextSubjects},
        changeDetection: {sourceChanged: false, vendorPinsChanged: false, makecodeVersionsChanged: false}};
    const subjects = expected.rawFiles.map((id, ordinal) => ({ordinal, id, kind: 'POSITIONAL_INPUT', target: 'arcade'}))
        .concat(expected.contextSubjects.map((subject, index) => ({ordinal: 184 + index,
            id: subject.id, kind: subject.kind, target: subject.target})));
    const rows = subjects.map((subject, index) => ({file: subject.id, target: 'arcade',
        stage: index === 0 ? 'parse-failed' : index === 1 ? 'partial' : 'translated',
        unsupported: index === 1 ? ['synthetic unsupported capability'] : [],
        ...(index === 0 ? {reason: 'synthetic malformed original retained'} : {}),
        ...(index >= 184 ? {context: {id: subject.id, kind: subject.kind,
            originalCompile: {success: false, diagnostics: ['synthetic original compiler error retained']}}} : {})}));
    for (const [index, row] of rows.entries()) {
        row.staticTranslation = {status: row.stage};
        row.qualification = {staticTranslation: row.stage,
            originalCompile: index < 184 ? 'not-requested' : 'retained-original-data',
            runtimeSmoke: 'not-requested', behavioralEquivalence: 'not-measured'};
    }
    const report = {schema: 'brickwright/compat-audit/v1', count: 225, provenance,
        compilerPolicy: {extensionFetching: 'offline', preparedInputs: 'not-requested'}, preparedTally: {},
        tally: {'parse-failed': 1, partial: 1, translated: 223}, rows};
    const events = []; let sequence = 0;
    const event = (phase, subject) => events.push({schema: 'brickwright/compat-progress/v1', sequence,
        phase, monotonicNanoseconds: String(sequence++), ...(subject ? {subject} : {})});
    event('CLI_PROGRESS_BEGIN');
    for (const subject of subjects) {event('SUBJECT_BEGIN', subject); event('ROW_GRAPH_CAPTURED_IN_MEMORY', subject);}
    event('CLI_REPORTS_FINISHED');
    return {report, events};
}
const options = ({report, events}, expectation = expected) => ({reportJson: JSON.stringify(report, null, 2) + '\n',
    progressJsonl: events.map(event => JSON.stringify(event)).join('\n') + '\n', expectationJson: JSON.stringify(expectation)});
const refuses = (edit, code) => {const value = fixture(); edit(value); assert.throws(() => admitReportData(options(value)), error => error.code === code);};

test('complete 184+41 report retains failures, diagnostics and original compiler data as private DATA', () => {
    const value = fixture(), input = options(value), accepted = admitReportData(input);
    assert.deepEqual(accepted.report, value.report);
    assert.deepEqual(accepted.summary.tally, value.report.tally);
    assert.deepEqual(accepted.summary.baselineTally, {'parse-failed': 1, partial: 1, translated: 182});
    assert.deepEqual(accepted.summary.retainedContextTally, {translated: 41});
    assert.equal(accepted.summary.count, 225); assert.equal(accepted.summary.baselineCount, 184); assert.equal(accepted.summary.retainedContextCount, 41);
    assert.equal(accepted.report.rows[184].context.originalCompile.success, false);
    assert.match(accepted.report.rows[0].reason, /malformed original/);
    assert.match(accepted.summary.boundary, /no independently authenticated run/);
    assert.equal(JSON.stringify(accepted.report, null, 2) + '\n', input.reportJson);
    // Exact emitted contextual catch shape: no invented context object.
    const caught = fixture();
    caught.report.rows[184] = {file: expected.contextSubjects[0].id, stage: 'read-failed',
        reason: 'retained original contextual load failure', observationFailure: {schema: 'synthetic exception graph', nodes: []}};
    caught.report.tally.translated--; caught.report.tally['read-failed'] = 1;
    assert.deepEqual(admitReportData(options(caught)).report.rows[184], caught.report.rows[184]);
    // Exact static failed raw TypeScript import includes a null compile sentinel.
    const failedImport = fixture(); failedImport.report.rows[0].format = 'typescript'; failedImport.report.rows[0].compile = null;
    assert.equal(admitReportData(options(failedImport)).report.rows[0].compile, null);
    const rawCatch = fixture(); rawCatch.report.rows[0] = {file: expected.rawFiles[0], stage: 'read-failed',
        reason: 'retained raw read exception', observationFailure: {schema: 'synthetic exception graph'}};
    delete rawCatch.report.tally['parse-failed']; rawCatch.report.tally['read-failed'] = 1;
    assert.deepEqual(admitReportData(options(rawCatch)).report.rows[0], rawCatch.report.rows[0]);
});

test('truncated, reordered, duplicated or retallied rows cannot become a complete replacement census', () => {
    refuses(value => value.report.rows.pop(), 'REPORT_COMPLETENESS');
    refuses(value => value.report.count = 224, 'REPORT_COMPLETENESS');
    refuses(value => value.report.rows.reverse(), 'ROW_IDENTITY');
    refuses(value => value.report.rows[1] = value.report.rows[0], 'ROW_IDENTITY');
    refuses(value => value.report.rows[184].context.kind = 'RAW_BASELINE', 'ROW_CONTEXT');
    refuses(value => delete value.report.rows[184].context, 'ROW_CONTEXT');
    refuses(value => {value.report.rows[184] = {file: expected.contextSubjects[0].id, stage: 'read-failed', reason: 'missing graph'};}, 'STATIC_SCOPE');
    refuses(value => value.report.rows[0].target = 'scratch', 'ROW_TARGET');
    refuses(value => value.report.tally.partial = 0, 'TALLY');
    refuses(value => value.report.tally.extra = 0, 'TALLY');
});

test('source endpoints, dependency identities and declarative input commit never substitute for external provenance', () => {
    refuses(value => value.report.provenance.source.commit = '0'.repeat(40), 'SOURCE_IDENTITY');
    refuses(value => value.report.provenance.endIdentity.source.dirty = null, 'SOURCE_IDENTITY');
    refuses(value => value.report.provenance.source.statusSha256 = '0'.repeat(64), 'SOURCE_IDENTITY');
    refuses(value => value.report.provenance.endIdentity.vendorPins = {}, 'DEPENDENCY_IDENTITY');
    refuses(value => value.report.provenance.changeDetection.sourceChanged = true, 'SOURCE_CHANGED');
    refuses(value => value.report.provenance.corpus.commitVerified = true, 'INPUT_IDENTITY');
    refuses(value => value.report.provenance.corpus.fileCount = 184, 'INPUT_IDENTITY');
    refuses(value => value.report.provenance.corpus.contentMultisetSha256 = '0'.repeat(64), 'INPUT_IDENTITY');
    refuses(value => value.report.provenance.contextCatalogue.sha256 = '0'.repeat(64), 'CONTEXT_IDENTITY');
    refuses(value => value.report.provenance.contextCatalogue.selectedSubjects = [], 'CONTEXT_IDENTITY');
});

test('missing final journal, overlap, subject skips, reordering and extra final events fail admission', () => {
    refuses(value => value.events.pop(), 'PROGRESS_COMPLETENESS');
    refuses(value => value.events[1].sequence = 0, 'PROGRESS_IDENTITY');
    refuses(value => value.events[2].subject.id = 'different', 'PROGRESS_SUBJECT');
    refuses(value => value.events[2].phase = 'SUBJECT_BEGIN', 'PROGRESS_SUBJECT');
    refuses(value => value.events[2].monotonicNanoseconds = '0', 'PROGRESS_ORDER');
    refuses(value => value.events[1].phase = 'ROW_GRAPH_CAPTURED_IN_MEMORY', 'PROGRESS_SUBJECT');
    refuses(value => value.events.push({...value.events.at(-1), sequence: value.events.length}), 'PROGRESS_COMPLETENESS');
});

test('reader scope cannot promote static DATA into compilation, execution or journey evidence', () => {
    refuses(value => value.report.rows[0].qualification.originalCompile = 'pass', 'STATIC_SCOPE');
    refuses(value => value.report.rows[184].qualification.runtimeSmoke = 'stepped', 'STATIC_SCOPE');
    refuses(value => value.report.rows[0].qualification.behavioralEquivalence = 'proven', 'STATIC_SCOPE');
    refuses(value => value.report.rows[0].staticTranslation.status = 'translated', 'STATIC_SCOPE');
    refuses(value => value.report.compilerPolicy.extensionFetching = 'explicitly-enabled', 'STATIC_SCOPE');
    refuses(value => value.report.compilerPolicy.preparedInputs = 'separately-audited', 'STATIC_SCOPE');
    refuses(value => value.report.journeyPolicy = {}, 'STATIC_SCOPE');
    refuses(value => value.report.preparedTally.prepared = 1, 'STATIC_SCOPE');
    refuses(value => delete value.report.preparedTally, 'STATIC_SCOPE');
    for (const key of ['compile', 'execution', 'journey', 'preparedTranslation', 'journeyStatus', 'journeyCompatibility']) refuses(value => value.report.rows[0][key] = {}, 'STATIC_SCOPE');
});

test('duplicate JSON keys, altered expectations, extra options and fixed input bounds refuse', () => {
    const input = options(fixture());
    assert.throws(() => admitReportData({...input, reportJson: input.reportJson.replace('{', '{"schema":"ignored",')}), /JSON_ENCODING/);
    assert.throws(() => admitReportData({...input, progressJsonl: input.progressJsonl.slice(0, -1)}), /PROGRESS_BOUND/);
    assert.throws(() => admitReportData({...input, reportJson: ' '.repeat(64 * 1024 ** 2 + 1)}), /JSON_BOUND/);
    assert.throws(() => admitReportData({...input, progressJsonl: ' '.repeat(8 * 1024 ** 2 + 1)}), /PROGRESS_BOUND/);
    assert.throws(() => admitReportData({...input, limit: 1}), /SCHEMA/);
    const incomplete = {...expected, rawFiles: expected.rawFiles.slice(1)};
    assert.throws(() => admitReportData({...input, expectationJson: JSON.stringify(incomplete)}), /EXPECTED_SUBJECTS/);
    const wrongKind = structuredClone(expected); wrongKind.contextSubjects[0].kind = 'RAW_BASELINE';
    assert.throws(() => admitReportData({...input, expectationJson: JSON.stringify(wrongKind)}), /EXPECTED_SUBJECTS/);
    const duplicate = {...expected, contextSubjects: expected.contextSubjects.map(subject => ({...subject, id: 'same'}))};
    assert.throws(() => admitReportData({...input, expectationJson: JSON.stringify(duplicate)}), /EXPECTED_SUBJECTS/);
});

// The original whole225 invocation uses ONE catalogue, not positional raw files.
test('original all225 catalogue mode preserves raw-baseline provenance and every retained context in order', () => {
    const value = fixture();
    const catalogue = {...expected, inputMode: 'catalogue', rawFiles: [],
        contextSubjects: value.report.rows.map((row, index) => ({id: index < 41 ? expected.contextSubjects[index].id : index < 184 ? 'baseline-' + index : row.file,
            kind: index < 184 ? 'RAW_BASELINE' : 'RETAINED_CONTEXT', target: 'arcade', name: 'Original ' + index}))};
    for (const [index, row] of value.report.rows.entries()) {
        const subject = catalogue.contextSubjects[index];
        row.file = subject.id; row.format = 'retained-context';
        row.qualification.originalCompile = 'retained-original-data';
        row.context = {id: subject.id, kind: subject.kind,
            provenance: {historicalStage: 'translated', acceptedOriginalLineageSHA256: 'e'.repeat(64)},
            originalCompile: index < 184 ? null : {success: false, diagnostics: ['retained contextual error']}};
    }
    for (const event of value.events) if (event.subject) {
        const subject = catalogue.contextSubjects[event.subject.ordinal];
        event.subject = {ordinal: event.subject.ordinal, id: subject.id, kind: subject.kind, target: subject.target};
    }
    value.report.provenance.contextCatalogue.selectedSubjects = catalogue.contextSubjects;
    value.report.provenance.corpus.fileCount = 1;
    const input = options(value, catalogue), accepted = admitReportData(input);
    assert.deepEqual(accepted.report, value.report);
    assert.equal(accepted.summary.positionalInputCount, 0);
    assert.equal(accepted.summary.catalogueSubjectCount, 225);
    assert.equal(accepted.summary.uniqueCatalogueIds, 184);
    assert.deepEqual(accepted.summary.baselineTally, {'parse-failed': 1, partial: 1, translated: 182});
    assert.deepEqual(accepted.summary.retainedContextTally, {translated: 41});
    assert.equal(accepted.report.rows[0].file, accepted.report.rows[184].file, 'same application ID is retained in two genuine kinds');
    assert.notEqual(accepted.report.rows[0].context.kind, accepted.report.rows[184].context.kind);
    assert.equal(accepted.summary.baselineCount, 184); assert.equal(accepted.summary.retainedContextCount, 41);
    assert.equal(accepted.report.rows[0].context.provenance.acceptedOriginalLineageSHA256, 'e'.repeat(64));
    const wrongKind = structuredClone(catalogue); wrongKind.contextSubjects[0].kind = 'RETAINED_CONTEXT';
    assert.throws(() => admitReportData({...input, expectationJson: JSON.stringify(wrongKind)}), /EXPECTED_SUBJECTS/);
    const truncated = {...catalogue, contextSubjects: catalogue.contextSubjects.slice(184)};
    assert.throws(() => admitReportData({...input, expectationJson: JSON.stringify(truncated)}), /EXPECTED_SUBJECTS/);
    const duplicate = structuredClone(value); duplicate.report.rows[185].file = duplicate.report.rows[184].file;
    assert.throws(() => admitReportData(options(duplicate, catalogue)), /ROW_IDENTITY/);
    const duplicateExpected = structuredClone(catalogue); duplicateExpected.contextSubjects[185].id = duplicateExpected.contextSubjects[184].id;
    assert.throws(() => admitReportData({...input, expectationJson: JSON.stringify(duplicateExpected)}), /EXPECTED_SUBJECTS/);
    const wrongCount = structuredClone(value); wrongCount.report.provenance.corpus.fileCount = 185;
    assert.throws(() => admitReportData(options(wrongCount, catalogue)), /INPUT_IDENTITY/);
});
