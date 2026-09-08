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

test('the exact 282-program post-production print census is disjoint and exhaustive',
    {timeout: 120000}, async () => {
        const absolute = join(root, 'overlay/scratch-gui/examples');
        const absoluteBytes = await measureRaw(absolute);
        const relativeBytes = await measureRaw('overlay/scratch-gui/examples');
        assert.equal(relativeBytes, absoluteBytes,
            'equivalent corpus paths must produce byte-identical JSON');
        const report = JSON.parse(absoluteBytes);
        assert.equal(report.schema, 'n2f-i8086-print-reach-v5');
        // c593574 adds lesson 56's program.bw. It has no output opcode, so it
        // grows only the exhaustive corpus/opcode denominators and no print bucket.
        assert.equal(report.programs, 282);
        assert.deepEqual(report.source.operations, {say: 0, sayForSecs: 0, print: 83, total: 83});
        assert.deepEqual(report.source.values, {literalText: 27, numericLiteral: 0, computed: 56});
        assert.deepEqual(report.source.programCounts,
            {literalText: 3, numericLiteral: 0, computed: 24, mixed: 14, none: 241});
        assert.deepEqual(report.opcode.operations, report.source.operations,
            'retarget/parse changed the output-opcode inventory');
        assert.deepEqual(report.opcode.values, report.source.values,
            'retarget/parse changed the output-value inventory');
        assert.equal(report.invariants.sourceLiteralTextPrograms, 17);
        assert.equal(report.invariants.sourceNumericOrComputedPrograms, 38);
        assert.equal(report.invariants.sourceOutputPrograms, 41);
        assert.equal(report.invariants.sourceProgramCount, 282);
        assert.equal(report.invariants.opcodeProgramCount, 151);
        assert.equal(report.invariants.sourceProgramExhaustive, true);
        assert.equal(report.invariants.opcodeProgramExhaustive, true);
        assert.equal(report.invariants.currentOutputCount, 41);
        assert.equal(report.invariants.currentOutputExhaustiveForSource, true);
        assert.deepEqual(report.currentOutput.counts,
            {notReached: 0, hostC: 15, refused: 21, emitted: 5, commentOnly: 0});
        assert.deepEqual(report.terminalCounts, {
            retargetRefused: 131, parseFailed: 0, noOutputOpcode: 110, hostC: 15,
            printRefused: 1, remainingChoke: 20, waitRefused: 0, int16Refused: 0,
            longLeaked: 0, emitted: 5, commentOnly: 0
        });
        assert.equal(report.invariants.terminalCount, 282);
        assert.equal(report.invariants.terminalExhaustive, true);
        assert.deepEqual(report.chokeCombinationCounts, {
            adc: 15, none: 6, 'adc + tone': 1,
            'adc + pwm': 1, 'adc + now': 3
        });
        assert.deepEqual(report.remainingChokeCounts, {adc: 20, tone: 1, pwm: 1, now: 3});
        assert.equal(report.computedForms.variable.deviceOccurrences, 10);
        assert.equal(report.computedForms.stc12_read.deviceOccurrences, 15);
        assert.equal(report.computedForms.operator_join.deviceOccurrences, 3);
        assert.deepEqual(report.computedForms.operator_join.devicePrograms,
            ['arduino-08-string-addition']);
        assert.deepEqual(report.currentOutput.emitted, [
            'arduino-01-digital-read-serial',
            'arduino-02-digital-input-pullup',
            'arduino-02-state-change',
            'arduino-06-ping',
            'arduino-sk-p11-crystal-ball'
        ]);
        const smoothingEvidence = report.numericListDependencyEvidence['arduino-03-smoothing'];
        assert.ok(smoothingEvidence.some(row => /ADC/.test(row)),
            'smoothing must retain its named post-N2e ADC choke');
        assert.equal(smoothingEvidence.some(row => /list.*not emitted|data_itemoflist/.test(row)), false,
            'N2e list lowering must not remain in smoothing refusal evidence');
        assert.equal(Object.hasOwn(report.printRefusalEvidence, 'arduino-03-smoothing'), false,
            'N2e list lowering crossed, so smoothing must no longer be a print refusal');
        assert.ok(report.terminal.remainingChoke.includes('arduino-03-smoothing: adc'),
            'N2e must move smoothing only to its honest remaining ADC choke');
        assert.equal(report.terminal.remainingChoke.some(row => /numericLists/.test(row)), false,
            'the reach classifier contradicts the emitter by calling N2e list lowering unsupported');
        assert.match(report.printRefusalEvidence['arduino-08-string-addition'].reasons.join('\n'),
            /operator_join is string-valued/);
        for (const name of ['arduino-05-switch-case', 'arduino-06-knock']) {
            assert.equal(Object.hasOwn(report.printRefusalEvidence, name), false,
                `${name}: released literal output remained a print refusal instead of its ADC choke`);
        }
        assert.deepEqual(Object.keys(report.printRefusalEvidence), [
            'arduino-08-string-addition'
        ]);
        assert.ok(report.terminal.emitted.includes('arduino-sk-p11-crystal-ball'),
            'N2f crystal-ball did not reach emitted terminal output');
        assert.equal(report.terminal.printRefused.every(row => row.includes(': ')), true,
            'numeric print refusals must retain their named reason');
        for (const obsolete of ['postChokeCandidates', 'printChokeEvidence']) {
            assert.equal(Object.hasOwn(report, obsolete), false,
                `post-production schema retained hypothetical ${obsolete}`);
        }
        assert.equal(Object.hasOwn(report.terminal, 'prospectiveEmit'), false,
            'post-production terminal retained hypothetical prospectiveEmit');
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
            printRefused: 0, remainingChoke: 0, waitRefused: 0, int16Refused: 0,
            longLeaked: 0, emitted: 0, commentOnly: 1
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
