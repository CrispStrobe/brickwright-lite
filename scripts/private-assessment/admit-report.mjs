import {createHash} from 'node:crypto';

// Independent report DATA reader. No converter, compiler, VM or producer parser imports.
const LEAF = 8 * 1024 ** 2;
const TOTAL = 64 * 1024 ** 2;
const sha = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireFact = (value, code) => {if (!value) {const error = new Error('Assessment report: ' + code); error.code = code; throw error;}};
const fields = (value, names) => requireFact(object(value) && Object.keys(value).length === names.length &&
    names.every(name => Object.hasOwn(value, name)), 'SCHEMA');
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const commit = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
function json(text, limit, pretty = false) {
    requireFact(typeof text === 'string' && Buffer.byteLength(text) <= limit, 'JSON_BOUND');
    const value = JSON.parse(text);
    // Exact native JSON roundtrip rejects duplicate keys, nonfinite numbers and
    // ambiguous spellings. The report is the CLI's complete pretty-printed JSON.
    requireFact(JSON.stringify(value, null, pretty ? 2 : undefined) + (pretty ? '\n' : '') === text, 'JSON_ENCODING');
    return value;
}
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Check complete static report/journal DATA against independently admitted expectations.
 * Return values and error details are PRIVATE. This never authenticates an Actions
 * run, a source checkout, dependency installation or input repository by itself.
 */
export function admitReportData(options) {
    fields(options, ['reportJson', 'progressJsonl', 'expectationJson']);
    const {reportJson, progressJsonl, expectationJson} = options;
    const expected = json(expectationJson, LEAF);
    fields(expected, ['inputMode', 'sourceCommit', 'corpusCommit', 'catalogueSHA256', 'inputMultisetSHA256',
        'vendorPinsSHA256', 'makecodeVersionsSHA256', 'rawFiles', 'contextSubjects']);
    requireFact(commit(expected.sourceCommit) && commit(expected.corpusCommit) &&
        ['catalogueSHA256', 'inputMultisetSHA256', 'vendorPinsSHA256', 'makecodeVersionsSHA256'].every(key => digest(expected[key])), 'EXPECTED_IDENTITY');
    requireFact(['catalogue', 'positional-context'].includes(expected.inputMode), 'EXPECTED_SUBJECTS');
    const positionalCount = expected.inputMode === 'catalogue' ? 0 : 184;
    const catalogueCount = 225 - positionalCount;
    requireFact(Array.isArray(expected.rawFiles) && expected.rawFiles.length === positionalCount &&
        expected.rawFiles.every(name => typeof name === 'string' && name.length > 0 && name.length <= 4096) &&
        new Set(expected.rawFiles).size === positionalCount && Array.isArray(expected.contextSubjects) &&
        expected.contextSubjects.length === catalogueCount, 'EXPECTED_SUBJECTS');
    const ids = new Set(expected.rawFiles.map(id => JSON.stringify(['POSITIONAL_INPUT', id])));
    for (const [index, subject] of expected.contextSubjects.entries()) {
        fields(subject, ['id', 'kind', 'target', 'name']);
        requireFact(typeof subject.id === 'string' && subject.id.length > 0 && subject.id.length <= 4096 &&
            !ids.has(JSON.stringify([subject.kind, subject.id])) && ['RAW_BASELINE', 'RETAINED_CONTEXT'].includes(subject.kind) &&
            subject.target === 'arcade' && typeof subject.name === 'string', 'EXPECTED_SUBJECTS');
        requireFact(subject.kind === (expected.inputMode === 'catalogue' && index < 184 ? 'RAW_BASELINE' : 'RETAINED_CONTEXT'), 'EXPECTED_SUBJECTS');
        ids.add(JSON.stringify([subject.kind, subject.id]));
    }
    const report = json(reportJson, TOTAL, true);
    requireFact(object(report) && report.schema === 'brickwright/compat-audit/v1' && report.count === 225 &&
        Array.isArray(report.rows) && report.rows.length === 225 && object(report.tally), 'REPORT_COMPLETENESS');
    const provenance = report.provenance;
    requireFact(object(provenance) && object(provenance.endIdentity) && object(provenance.corpus) &&
        object(provenance.contextCatalogue) && object(provenance.changeDetection), 'PROVENANCE');
    const empty = sha('');
    for (const source of [provenance.source, provenance.endIdentity.source]) {
        requireFact(object(source) && source.commit === expected.sourceCommit && source.dirty === false &&
            source.trackedDiffSha256 === empty && source.statusSha256 === empty, 'SOURCE_IDENTITY');
    }
    for (const identity of [provenance, provenance.endIdentity]) {
        requireFact(object(identity.vendorPins) && object(identity.makecodeVersions) &&
            sha(JSON.stringify(identity.vendorPins)) === expected.vendorPinsSHA256 &&
            sha(JSON.stringify(identity.makecodeVersions)) === expected.makecodeVersionsSHA256, 'DEPENDENCY_IDENTITY');
    }
    requireFact(['sourceChanged', 'vendorPinsChanged', 'makecodeVersionsChanged'].every(key =>
        provenance.changeDetection[key] === false), 'SOURCE_CHANGED');
    requireFact(provenance.corpus.declaredCommit === expected.corpusCommit &&
        provenance.corpus.commitVerified === false && provenance.corpus.fileCount === positionalCount + 1 &&
        provenance.corpus.unreadableFiles === 0 &&
        provenance.corpus.contentMultisetSha256 === expected.inputMultisetSHA256, 'INPUT_IDENTITY');
    requireFact(provenance.contextCatalogue.sha256 === expected.catalogueSHA256 &&
        equal(provenance.contextCatalogue.selectedSubjects, expected.contextSubjects), 'CONTEXT_IDENTITY');
    requireFact(object(report.compilerPolicy) && report.compilerPolicy.extensionFetching === 'offline' &&
        report.compilerPolicy.preparedInputs === 'not-requested' && !Object.hasOwn(report, 'journeyPolicy') &&
        object(report.preparedTally) && Object.keys(report.preparedTally).length === 0, 'STATIC_SCOPE');
    const tally = Object.create(null), baselineTally = Object.create(null), retainedContextTally = Object.create(null);
    const subjects = expected.rawFiles.map((id, ordinal) => ({ordinal, id, kind: 'POSITIONAL_INPUT', target: 'arcade'}))
        .concat(expected.contextSubjects.map((row, index) => ({ordinal: positionalCount + index, id: row.id, kind: row.kind, target: row.target})));
    for (let index = 0; index < report.rows.length; index++) {
        const row = report.rows[index];
        requireFact(object(row) && row.file === subjects[index].id && typeof row.stage === 'string' &&
            row.stage.length > 0 && row.stage.length <= 128, 'ROW_IDENTITY');
        // A failed raw .ts import emits compile:null even when compilation was
        // not requested. Retain that exact sentinel without accepting a result.
        const staticImportFailure = index < positionalCount && row.format === 'typescript' && row.stage === 'parse-failed';
        requireFact((!Object.hasOwn(row, 'compile') || staticImportFailure && row.compile === null) &&
            !['execution', 'journey', 'journeyStatus', 'journeyCompatibility', 'preparedTranslation'].some(key => Object.hasOwn(row, key)), 'STATIC_SCOPE');
        if (row.stage === 'read-failed') {
            requireFact(!Object.hasOwn(row, 'staticTranslation') && !Object.hasOwn(row, 'qualification') &&
                typeof row.reason === 'string' && Object.hasOwn(row, 'observationFailure') &&
                object(row.observationFailure), 'STATIC_SCOPE');
        } else {
            fields(row.staticTranslation, ['status']);
            fields(row.qualification, ['staticTranslation', 'originalCompile', 'runtimeSmoke', 'behavioralEquivalence']);
            requireFact(row.staticTranslation.status === row.stage && row.qualification.staticTranslation === row.stage &&
                row.qualification.originalCompile === (index < positionalCount ? 'not-requested' : 'retained-original-data') &&
                row.qualification.runtimeSmoke === 'not-requested' && row.qualification.behavioralEquivalence === 'not-measured', 'STATIC_SCOPE');
        }
        if (Object.hasOwn(row, 'target')) requireFact(row.target === 'arcade', 'ROW_TARGET');
        if (index >= positionalCount) {
            if (Object.hasOwn(row, 'context')) requireFact(object(row.context) && row.context.id === subjects[index].id &&
                row.context.kind === subjects[index].kind, 'ROW_CONTEXT');
            // The CLI's contextual catch has no loaded context. Its original
            // exception remains data; expected ID and journal still bind it.
            else requireFact(row.stage === 'read-failed' && typeof row.reason === 'string' &&
                Object.hasOwn(row, 'observationFailure') && object(row.observationFailure), 'ROW_CONTEXT');
        }
        tally[row.stage] = (tally[row.stage] || 0) + 1;
        const group = index < 184 ? baselineTally : retainedContextTally;
        group[row.stage] = (group[row.stage] || 0) + 1;
    }
    requireFact(Object.keys(report.tally).length === Object.keys(tally).length && Object.keys(tally).every(stage =>
        Number.isSafeInteger(report.tally[stage]) && report.tally[stage] === tally[stage]), 'TALLY');
    requireFact(typeof progressJsonl === 'string' && Buffer.byteLength(progressJsonl) <= LEAF &&
        progressJsonl.endsWith('\n'), 'PROGRESS_BOUND');
    const lines = progressJsonl.slice(0, -1).split('\n');
    requireFact(lines.length >= 452 && lines.length <= 65536, 'PROGRESS_COMPLETENESS');
    let next = 0, active = false, previousTime = -1n;
    for (let index = 0; index < lines.length; index++) {
        requireFact(Buffer.byteLength(lines[index]) <= 16384, 'PROGRESS_BOUND');
        const event = json(lines[index], 16384);
        requireFact(object(event) && event.schema === 'brickwright/compat-progress/v1' && event.sequence === index &&
            typeof event.phase === 'string' && typeof event.monotonicNanoseconds === 'string' &&
            /^[0-9]{1,32}$/.test(event.monotonicNanoseconds), 'PROGRESS_IDENTITY');
        const time = BigInt(event.monotonicNanoseconds);
        requireFact(time >= previousTime, 'PROGRESS_ORDER'); previousTime = time;
        if (event.phase === 'SUBJECT_BEGIN') {
            requireFact(!active && next < subjects.length && equal(event.subject, subjects[next]), 'PROGRESS_SUBJECT'); active = true;
        } else if (Object.hasOwn(event, 'subject')) {
            requireFact(active && next < subjects.length && equal(event.subject, subjects[next]), 'PROGRESS_SUBJECT');
        }
        if (event.phase === 'ROW_GRAPH_CAPTURED_IN_MEMORY') {
            requireFact(active && Object.hasOwn(event, 'subject'), 'PROGRESS_SUBJECT'); active = false; next++;
        }
        if (event.phase === 'CLI_REPORTS_FINISHED') requireFact(index === lines.length - 1 && !active && next === 225, 'PROGRESS_COMPLETENESS');
        if (index === 0) requireFact(event.phase === 'CLI_PROGRESS_BEGIN', 'PROGRESS_COMPLETENESS');
        if (index === lines.length - 1) requireFact(event.phase === 'CLI_REPORTS_FINISHED', 'PROGRESS_COMPLETENESS');
    }
    requireFact(next === 225 && !active, 'PROGRESS_COMPLETENESS');
    return {report, summary: {count: 225, baselineCount: 184, retainedContextCount: 41,
        positionalInputCount: positionalCount, catalogueSubjectCount: catalogueCount,
        uniqueCatalogueIds: new Set(expected.contextSubjects.map(subject => subject.id)).size, tally: {...tally}, baselineTally: {...baselineTally}, retainedContextTally: {...retainedContextTally},
        boundary: 'Complete static report DATA only; no independently authenticated run, execution, SDK or GUI equivalence.'}};
}
