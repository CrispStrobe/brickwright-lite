import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('starter journeys point at complete shipped examples', async () => {
    const journeys = await readJson('../overlay/scratch-gui/src/components/gui/starter-journeys.json');
    const index = await readJson('../overlay/scratch-gui/examples/index.json');
    const list = Array.isArray(index) ? index : index.examples;
    const examples = new Map(list.map(example => [example.id, example]));

    assert.deepEqual(journeys.map(journey => journey.id), ['circuit', 'board', 'lego']);
    assert.equal(new Set(journeys.map(journey => journey.exampleId)).size, journeys.length);

    for (const journey of journeys) {
        const example = examples.get(journey.exampleId);
        assert.ok(example, `${journey.id} example ${journey.exampleId} is in the shipped index`);
        assert.ok(journey.copy.en?.title && journey.copy.de?.title,
            `${journey.id} has English and German copy`);
        assert.ok([3, 4].includes(journey.editorTab), `${journey.id} opens a supported editor tab`);
        if (journey.mode === 'circuit-only') {
            assert.ok(example.files?.circuit, `${journey.id} ships a circuit`);
        } else if (journey.mode === 'program-and-circuit') {
            assert.ok(example.files?.program && example.files?.circuit,
                `${journey.id} ships a program and circuit`);
        } else if (journey.mode === 'program-only') {
            assert.ok(example.files?.program, `${journey.id} ships a program`);
        } else {
            assert.fail(`${journey.id} has unknown mode ${journey.mode}`);
        }
    }
});
