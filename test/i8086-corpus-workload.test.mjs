import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setupCorpus} from '../scripts/lib/i8086-corpus-workload.mjs';

test('completed-program benchmark requires output, successful exit and a finite budget', () => {
    const source = 'ORG 100H\nLEA DX, MSG\nMOV AH,9\nINT 21H\nMOV AX,4C00H\nINT 21H\nMSG DB "OK$"\nEND';
    const result = setupCorpus(source,'hello.asm').run(2);
    assert.equal(result.repetitions,2);
    assert.equal(result.output,'OKOK');
    assert.ok(result.steps > 0 && result.programsPerSecond > 0);
    assert.throws(() => setupCorpus('ORG 100H\nMOV AX,4C00H\nINT 21H\nEND','silent.asm').run(1), /did not complete/);
    assert.throws(() => setupCorpus('NOT_AN_OPCODE','broken.asm'), /./);
});
