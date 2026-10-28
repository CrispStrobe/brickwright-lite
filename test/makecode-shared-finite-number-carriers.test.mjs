import test from 'node:test';
import assert from 'node:assert/strict';
import {microbitToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/microbit-translate.js';
import {ev3ToPseudocode} from '../overlay/scratch-gui/src/lib/bw-makecode/ev3-translate.js';
import {projectToMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/export.js';
import {projectToCalliopeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/export-calliope.js';
import {projectToEv3Ts} from '../overlay/scratch-gui/src/lib/bw-makecode/export-ev3.js';
import {parseMakeCodeTs} from '../overlay/scratch-gui/src/lib/bw-makecode/ts-import.js';
import {runArcadeSourceCode} from './helpers/arcade-source-program.mjs';
import {stepFrames} from './helpers/bw-vm.mjs';

const targets = [
    ['microbit', source => microbitToPseudocode(source), projectToMakeCodeTs],
    ['calliopemini', source => microbitToPseudocode(source, {board: 'calliopemini'}), projectToCalliopeTs],
    ['ev3', ev3ToPseudocode, projectToEv3Ts]
];
const literals = ['1e-7', '1e+3', '1.E+3', '5e-324', '1e3', '0x1f', '0b101',
    '1e+21', '5e-999999', '1.7976931348623157e308'];
const values = vm => Object.fromEntries(vm.runtime.targets.flatMap(target =>
    Object.values(target.variables).map(variable => [variable.name, variable.value])));

for (const [name, convert, exportProject] of targets) {
    test(`${name} finite source literals reach actual numeric inputs and editable saved export routes`, async () => {
        const source = literals.map((literal, index) => `let measured${index}=${literal}`).join(';') +
            ';let alias=measured0;let negative=-1e-7;let combined=measured1+measured2;let literalText="1e+3"';
        const converted = convert(source);
        assert.deepEqual(converted.unsupported, []);
        const run = await runArcadeSourceCode(converted.code, {frames: 3});
        let fresh;
        try {
            assert.deepEqual(run.errors, []);
            const setters = run.creator.project.targets.flatMap(target => Object.values(target.blocks))
                .filter(block => block.opcode === 'data_setvariableto');
            for (let index = 0; index < literals.length; index++) {
                const setter = setters.find(block => block.fields.VARIABLE?.[0] === `measured${index}`);
                assert.ok(setter);
                assert.equal(setter.inputs.VALUE[0], 1);
                assert.equal(setter.inputs.VALUE[1][0], 4, 'the literal is a numeric shadow, not text or an exponent operator');
                assert.equal(Number(setter.inputs.VALUE[1][1]), Number(literals[index]));
                assert.equal(Number(values(run.vm)[`measured${index}`]), Number(literals[index]));
            }
            assert.equal(Number(values(run.vm).alias), 1e-7);
            assert.equal(Number(values(run.vm).negative), -1e-7);
            assert.equal(Number(values(run.vm).combined), 2000);
            assert.equal(values(run.vm).literalText, '1e+3');

            const matches = run.vm.runtime.targets.flatMap(target => Object.values(target.blocks._blocks)
                .filter(block => block.opcode === 'data_setvariableto' && block.fields.VARIABLE?.value === 'measured1')
                .map(block => ({target, block})));
            assert.equal(matches.length, 1);
            const {target, block} = matches[0];
            const input = target.blocks.getBlock(block.inputs.VALUE.block);
            assert.equal(input.opcode, 'math_number');
            target.blocks.changeBlock({id: input.id, element: 'field', name: 'NUM', value: '12.5'});
            run.vm.greenFlag();
            await stepFrames(run.vm, 3, 20);
            assert.equal(Number(values(run.vm).measured1), 12.5);
            const saved = Buffer.from(await (await run.vm.saveProjectSb3()).arrayBuffer());
            await run.vm.loadProject(saved);
            run.vm.greenFlag();
            await stepFrames(run.vm, 3, 20);
            assert.equal(Number(values(run.vm).measured1), 12.5);
            assert.equal(Number(values(run.vm).combined), 1012.5);
            const exported = exportProject(JSON.parse(run.vm.toJSON()));
            assert.deepEqual(exported.unsupported, []);
            const reimported = convert(exported.ts);
            assert.deepEqual(reimported.unsupported, []);
            fresh = await runArcadeSourceCode(reimported.code, {frames: 3});
            assert.deepEqual(fresh.errors, []);
            assert.equal(Number(values(fresh.vm).measured1), 12.5);
            assert.equal(Number(values(fresh.vm).measured0), 1e-7);
            assert.equal(Number(values(fresh.vm).measured3), 5e-324);
            assert.equal(Number(values(fresh.vm).combined), 1012.5);
            assert.equal(values(fresh.vm).literalText, '1e+3');
            assert.deepEqual(run.errors, []);
        } finally {
            fresh?.vm.stopAll();
            run.vm.stopAll();
        }
    });

    test(`${name} refuses non-finite source literals and preserves malformed exponent diagnostics`, () => {
        for (const literal of ['1e+309', '1e309', '-1e+309', `0x${'f'.repeat(300)}`]) {
            const result = convert(`let measured=${literal}`);
            assert.match(result.unsupported.join('\n'), /Non-finite source Number literals/);
        }
        for (const literal of ['1e', '1e+', '1e--3', '.5e-']) {
            assert.throws(() => convert(`let measured=${literal}`), /malformed numeric exponent/);
        }
        assert.ok(convert('let measured=(1).toString()').unsupported.length > 0,
            'the finite carrier does not add Number methods to other targets');
    });
}

test('shared numeric lexing retains unary and member boundaries', () => {
    assert.equal(parseMakeCodeTs('let value=1..toString()').body[0].decls[0].init.callee.object.value, '1.');
    const negative = parseMakeCodeTs('let value=-1e-7').body[0].decls[0].init;
    assert.equal(negative.op, '-');
    assert.equal(negative.argument.value, '1e-7');
    assert.equal(parseMakeCodeTs('let e=3;let value=e-1').body[1].decls[0].init.left.name, 'e');
});
