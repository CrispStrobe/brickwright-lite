// N2d measurement gate. This is parse/generate only: candidate compilation and
// live output belong to hosted acceptance after the boundary is chosen.
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {
    printDependsOnNumericList,
    printDependsOnRandomControlFlow
} from '../scripts/lib/i8086-print-reach.mjs';

const execFileP = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const hook = join(root, 'scripts/lib/register-gui-scope.mjs');
const script = join(root, 'scripts/measure-i8086-print-reach.mjs');
const measureRaw = async examples => (await execFileP(process.execPath,
    ['--import', hook, script, '--examples', examples],
    {cwd: root, maxBuffer: 8 * 1024 * 1024})).stdout;
const measure = async examples => JSON.parse(await measureRaw(examples));

test('the exact 280-program print census is disjoint, exhaustive and names the bounded gain',
    {timeout: 120000}, async () => {
        const absolute = join(root, 'overlay/scratch-gui/examples');
        const absoluteBytes = await measureRaw(absolute);
        const relativeBytes = await measureRaw('overlay/scratch-gui/examples');
        assert.equal(relativeBytes, absoluteBytes,
            'equivalent corpus paths must produce byte-identical JSON');
        const report = JSON.parse(absoluteBytes);
        assert.equal(report.schema, 'n2d-i8086-print-reach-v3');
        assert.equal(report.programs, 280);
        assert.deepEqual(report.source.operations, {say: 0, sayForSecs: 0, print: 83, total: 83});
        assert.deepEqual(report.source.values, {literalText: 27, numericLiteral: 0, computed: 56});
        assert.deepEqual(report.source.programCounts,
            {literalText: 3, numericLiteral: 0, computed: 24, mixed: 14, none: 239});
        assert.deepEqual(report.opcode.operations, report.source.operations,
            'retarget/parse changed the output-opcode inventory');
        assert.deepEqual(report.opcode.values, report.source.values,
            'retarget/parse changed the output-value inventory');
        assert.equal(report.invariants.sourceLiteralTextPrograms, 17);
        assert.equal(report.invariants.sourceNumericOrComputedPrograms, 38);
        assert.equal(report.invariants.sourceOutputPrograms, 41);
        assert.equal(report.invariants.sourceProgramCount, 280);
        assert.equal(report.invariants.opcodeProgramCount, 149);
        assert.equal(report.invariants.sourceProgramExhaustive, true);
        assert.equal(report.invariants.opcodeProgramExhaustive, true);
        assert.equal(report.invariants.currentOutputCount, 41);
        assert.equal(report.invariants.currentOutputExhaustiveForSource, true);
        assert.deepEqual(report.currentOutput.counts,
            {notReached: 0, hostC: 15, refused: 26, emitted: 0, commentOnly: 0});
        assert.deepEqual(report.terminalCounts, {
            retargetRefused: 131, parseFailed: 0, noOutputOpcode: 108, hostC: 15,
            remainingChoke: 19, waitRefused: 0, int16Refused: 0,
            longLeaked: 0, prospectiveEmit: 7
        });
        assert.equal(report.invariants.terminalCount, 280);
        assert.equal(report.invariants.terminalExhaustive, true);
        assert.deepEqual(report.chokeCombinationCounts, {
            'adc + print': 14, print: 7, 'adc + print + tone': 1,
            'adc + print + pwm': 1, 'adc + now + print': 3
        });
        assert.deepEqual(report.remainingChokeCounts, {adc: 19, tone: 1, pwm: 1, now: 3});
        assert.equal(report.computedForms.variable.deviceOccurrences, 10);
        assert.equal(report.computedForms.stc12_read.deviceOccurrences, 15);
        assert.equal(report.computedForms.operator_join.deviceOccurrences, 3);
        assert.deepEqual(report.computedForms.operator_join.devicePrograms,
            ['arduino-08-string-addition']);
        assert.deepEqual(report.postChokeCandidates.literalTextOnly,
            ['arduino-sk-p11-crystal-ball']);
        assert.deepEqual(report.postChokeCandidates.numericOrComputedOnly, [
            'arduino-01-digital-read-serial',
            'arduino-02-digital-input-pullup',
            'arduino-02-state-change',
            'arduino-03-smoothing',
            'arduino-06-ping',
            'arduino-08-string-addition'
        ]);
        assert.deepEqual(report.postChokeCandidates.stringComputed,
            ['arduino-08-string-addition'],
            'string join must remain visible instead of being counted as safe numeric output');
        assert.deepEqual(report.postChokeCandidates.numericListDependency,
            ['arduino-03-smoothing'],
            'a list-dependent scalar must not wear an emitted candidate count');
        assert.deepEqual(report.postChokeCandidates.randomControlFlowDependency,
            ['arduino-sk-p11-crystal-ball'],
            'unsupported random control flow must not make literal output look reachable');
        assert.deepEqual(report.postChokeCandidates.incompleteLowering,
            ['arduino-03-smoothing', 'arduino-08-string-addition', 'arduino-sk-p11-crystal-ball']);
        const smoothingEvidence = report.numericListDependencyEvidence['arduino-03-smoothing'];
        assert.equal(smoothingEvidence.length, 4);
        for (const fragment of ['delete all of readings', 'add 0 to readings',
            'item (readIndex + 1) of readings', 'replace item (readIndex + 1) of readings']) {
            assert.ok(smoothingEvidence.some(row => row.includes(fragment)),
                `smoothing evidence does not name ${fragment}`);
        }
        assert.deepEqual(report.incompleteLoweringEvidence['arduino-03-smoothing'], smoothingEvidence);
        assert.ok(report.incompleteLoweringEvidence['arduino-sk-p11-crystal-ball']
            .some(row => row.includes('pick random 1 to 8')));
        assert.equal(Object.keys(report.printChokeEvidence).length, 7);
        assert.equal(Object.values(report.printChokeEvidence).every(rows => rows.length === 1), true,
            'each syntactic candidate must retain exactly the expected removed-print-choke warning');
        assert.deepEqual(report.boundedRecommendation, {
            numericSigned16: [
                'arduino-01-digital-read-serial',
                'arduino-02-digital-input-pullup',
                'arduino-02-state-change',
                'arduino-06-ping'
            ],
            refuseLiteralText: ['arduino-sk-p11-crystal-ball'],
            refuseStringComputed: ['arduino-08-string-addition'],
            refuseNumericListDependency: ['arduino-03-smoothing'],
            refuseRandomControlFlowDependency: ['arduino-sk-p11-crystal-ball']
        });
        assert.equal(report.emitterWarnings.length, 8);
        assert.equal(report.emitterWarnings.every(row =>
            /^(?:arduino-03-smoothing|arduino-08-string-addition|arduino-sk-p11-crystal-ball): /.test(row)), true,
        'only incomplete prospective programs contribute lowering-warning evidence');
        assert.equal(report.terminal.retargetRefused.every(row => row.includes(': ')), true,
            'retarget failures must retain their named reason');
        assert.equal(report.terminal.remainingChoke.every(row => row.includes(': ')), true,
            'remaining-choke outcomes must retain their named reason');
    });

test('a parsed say is reported as comment-only, never mistaken for emitted device output', async () => {
    const temp = await mkdtemp(join(tmpdir(), 'n2d-say-'));
    try {
        const example = join(temp, 'say-fixture');
        await mkdir(example);
        await writeFile(join(example, 'program.bw'), [
            'DEVICE STC12C5A60S2',
            'PIN led = P1.0 OUTPUT',
            'WHEN flag clicked:',
            '  say "hello"'
        ].join('\n') + '\n');
        const report = await measure(temp);
        assert.deepEqual(report.source.operations, {say: 1, sayForSecs: 0, print: 0, total: 1});
        assert.deepEqual(report.opcode.operations, report.source.operations);
        assert.deepEqual(report.currentOutput.counts,
            {notReached: 0, hostC: 0, refused: 0, emitted: 0, commentOnly: 1});
        assert.deepEqual(report.terminalCounts, {
            retargetRefused: 0, parseFailed: 0, noOutputOpcode: 0, hostC: 0,
            remainingChoke: 0, waitRefused: 0, int16Refused: 0,
            longLeaked: 0, prospectiveEmit: 1
        });
    } finally {
        await rm(temp, {recursive: true, force: true});
    }
});

const valueVariable = (name, id) => [3, [12, name, id]];
const valueBlock = id => [3, id];
const fieldVariable = (name, id) => [name, id];
const projectWith = blocks => ({targets: [{blocks}]});

test('numeric-list dependency follows direct and transitive print inputs but ignores non-feeding lists', () => {
    const direct = projectWith({
        print: {opcode: 'stc12_print', inputs: {VALUE: valueBlock('item')}},
        item: {opcode: 'data_itemoflist', inputs: {INDEX: [1, [4, 1]]}}
    });
    assert.equal(printDependsOnNumericList(direct), true, 'direct list reporter was missed');

    const transitive = projectWith({
        print: {opcode: 'stc12_print', inputs: {VALUE: valueVariable('out', 'out-id')}},
        setOut: {
            opcode: 'data_setvariableto', fields: {VARIABLE: fieldVariable('out', 'out-id')},
            inputs: {VALUE: valueVariable('middle', 'middle-id')}
        },
        setMiddle: {
            opcode: 'data_setvariableto', fields: {VARIABLE: fieldVariable('middle', 'middle-id')},
            inputs: {VALUE: valueBlock('item')}
        },
        item: {opcode: 'data_itemoflist', inputs: {INDEX: [1, [4, 1]]}}
    });
    assert.equal(printDependsOnNumericList(transitive), true, 'transitive scalar provenance was missed');

    const nonFeeding = projectWith({
        print: {opcode: 'stc12_print', inputs: {VALUE: valueVariable('out', 'out-id')}},
        setOut: {
            opcode: 'data_setvariableto', fields: {VARIABLE: fieldVariable('out', 'out-id')},
            inputs: {VALUE: [1, [4, 7]]}
        },
        unrelated: {opcode: 'data_itemoflist', inputs: {INDEX: [1, [4, 1]]}}
    });
    assert.equal(printDependsOnNumericList(nonFeeding), false, 'an unrelated list poisoned print reach');
});

test('random control-flow dependency follows a printed branch through scalar provenance', () => {
    const project = projectWith({
        setRoll: {
            opcode: 'data_setvariableto', fields: {VARIABLE: fieldVariable('roll', 'roll-id')},
            inputs: {VALUE: valueBlock('random')}
        },
        random: {opcode: 'operator_random', inputs: {FROM: [1, [4, 1]], TO: [1, [4, 8]]}},
        equals: {
            opcode: 'operator_equals',
            inputs: {OPERAND1: valueVariable('roll', 'roll-id'), OPERAND2: [1, [4, 1]]}
        },
        branch: {
            opcode: 'control_if', inputs: {CONDITION: valueBlock('equals'), SUBSTACK: valueBlock('print')}
        },
        print: {opcode: 'stc12_print', parent: 'branch', inputs: {VALUE: [1, [10, 'yes']]}}
    });
    assert.equal(printDependsOnRandomControlFlow(project), true);
});
