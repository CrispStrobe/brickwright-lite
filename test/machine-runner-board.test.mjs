import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import test from 'node:test';

const runnerPath = join(import.meta.dirname, '..', 'overlay', 'scratch-gui', 'src',
    'lib', 'bw-debug', 'debug-runner.js');
const source = readFileSync(runnerPath, 'utf8');

const functionBody = (name, nextMarker) => {
    const start = source.indexOf(`async function ${name}()`);
    const end = source.indexOf(nextMarker, start);
    assert.ok(start >= 0 && end > start, `${name} is missing`);
    return source.slice(start, end);
};

test('machine runners publish the real designer board they drive', () => {
    const eater = functionBody('attachEater6502', '// ── Z80 machine bench');
    const z80 = functionBody('attachZ80', '/**\n     * Should this halt');

    for (const [name, body] of [['6502', eater], ['Z80', z80]]) {
        assert.match(body, /targetOpts\.board = db\.board;/,
            `${name} target must attach the designer board`);
        assert.match(body, /board = db\.board;/,
            `${name} runner.board() must expose that same active board`);
    }
    assert.match(source, /board: \(\) => board/,
        'the shared runner board contract must remain public');
});
