import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const LANGUAGES = new Set(['blocks', 'pseudocode', 'python', 'javascript', 'c', 'basic', 'asm']);
const EVENTS = new Set(['starter-loaded', 'project-run', 'project-stop', 'circuit-ready',
    'circuit-changed', 'debug-phase', 'hardware-state']);

const readLessons = async () => {
    const core = await readJson('../overlay/scratch-gui/src/components/gui/lessons.json');
    const electricity = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/electricity-1.json');
    const measurement = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/measurement-2.json');
    const languages = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/languages-3.json');
    return {
        schemaVersion: core.schemaVersion,
        lessons: [...core.lessons, ...electricity.lessons, ...measurement.lessons, ...languages.lessons]
    };
};

test('guided lesson catalog is localized, connected, and declarative', async () => {
    const catalog = await readLessons();
    const exampleIndex = await readJson('../overlay/scratch-gui/examples/index.json');
    const examples = new Set((Array.isArray(exampleIndex) ? exampleIndex : exampleIndex.examples)
        .map(example => example.id));
    const ids = new Set(catalog.lessons.map(lesson => lesson.id));

    assert.equal(catalog.schemaVersion, 1);
    assert.equal(ids.size, catalog.lessons.length, 'lesson ids are unique');
    assert.ok(catalog.lessons.length >= 8, 'the exemplary catalog spans more than onboarding');

    for (const lesson of catalog.lessons) {
        assert.ok(Number.isInteger(lesson.version) && lesson.version > 0, `${lesson.id} is versioned`);
        assert.ok(examples.has(lesson.exampleId), `${lesson.id} references a shipped example`);
        assert.ok(['circuit-only', 'program-and-circuit', 'program-only'].includes(lesson.loadMode),
            `${lesson.id} declares how its project opens`);
        assert.ok(lesson.copy.en?.title && lesson.copy.de?.title, `${lesson.id} has English and German copy`);
        assert.ok(lesson.copy.en?.objective && lesson.copy.de?.objective, `${lesson.id} localizes its objective`);
        assert.ok(lesson.domains.length && lesson.depth && lesson.environment, `${lesson.id} is classified`);
        assert.ok(lesson.checkpoints.length, `${lesson.id} has checkpoints`);
        for (const prerequisite of lesson.prerequisites) {
            assert.ok(ids.has(prerequisite), `${lesson.id} prerequisite ${prerequisite} exists`);
            assert.notEqual(prerequisite, lesson.id, `${lesson.id} does not require itself`);
        }
        for (const language of lesson.languages) {
            assert.ok(LANGUAGES.has(language), `${lesson.id} uses supported language ${language}`);
        }
        if (lesson.variants) {
            for (const [language, copy] of Object.entries(lesson.variants)) {
                assert.ok(lesson.languages.includes(language), `${lesson.id}: variant language is declared`);
                assert.ok(copy.en && copy.de, `${lesson.id}/${language}: variant is bilingual`);
            }
        }
        const checkpointIds = new Set();
        for (const checkpoint of lesson.checkpoints) {
            assert.ok(!checkpointIds.has(checkpoint.id), `${lesson.id}/${checkpoint.id} is unique`);
            checkpointIds.add(checkpoint.id);
            for (const lang of ['en', 'de']) {
                const copy = checkpoint.copy[lang];
                assert.ok(copy?.action && copy?.explain && copy?.hint && copy?.manual,
                    `${lesson.id}/${checkpoint.id} has complete ${lang} guidance and manual fallback`);
            }
            if (checkpoint.observe) {
                assert.ok(EVENTS.has(checkpoint.observe.event),
                    `${lesson.id}/${checkpoint.id} uses a safe observable`);
            }
        }
    }
});

test('catalog covers the promised domains, depths, and code representations', async () => {
    const {lessons} = await readLessons();
    const domains = new Set(lessons.flatMap(lesson => lesson.domains));
    const depths = new Set(lessons.map(lesson => lesson.depth));
    const languages = new Set(lessons.flatMap(lesson => lesson.languages));

    for (const domain of ['circuits', 'instruments', 'widgets', 'extensions', 'debugging',
        'representations', 'computer-architecture']) assert.ok(domains.has(domain), `covers ${domain}`);
    for (const depth of ['discover', 'foundation', 'practitioner', 'advanced']) {
        assert.ok(depths.has(depth), `covers ${depth} depth`);
    }
    for (const language of ['blocks', 'pseudocode', 'python', 'javascript', 'c', 'asm']) {
        assert.ok(languages.has(language), `covers ${language}`);
    }
    const adaptable = lessons.find(lesson => lesson.id === 'starter-blink-representations');
    assert.deepEqual(Object.keys(adaptable.variants), adaptable.languages,
        'the exemplary representation lesson has content for every declared language');
});

test('electricity wave has twelve distinct, progressive learning experiences', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'electricity-1');
    const topics = new Set(wave.map(lesson => lesson.topic));
    const expected = ['closed-paths', 'polarity', 'resistance', 'ohms-law', 'series-parallel',
        'voltage-dividers', 'buttons', 'capacitors', 'inductors', 'diodes',
        'transistor-switching', 'motor-flyback'];

    assert.equal(wave.length, 12);
    assert.deepEqual([...topics].sort(), expected.sort());
    assert.ok(wave.some(lesson => lesson.depth === 'discover'));
    assert.ok(wave.some(lesson => lesson.depth === 'foundation'));
    for (const lesson of wave) {
        const text = lesson.checkpoints.flatMap(checkpoint => [
            checkpoint.copy.en.action,
            checkpoint.copy.en.explain
        ]).join(' ').toLowerCase();
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.id === 'predict') ||
            /predict|trace|calculate/.test(text),
        `${lesson.id} asks the learner to predict or reason before accepting a result`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} includes a live observation`);
        assert.ok(lesson.checkpoints.length >= 2, `${lesson.id} is a learning sequence`);
    }
});

test('measurement wave teaches ten honest instrument workflows', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'measurement-2');
    const topics = new Set(wave.map(lesson => lesson.topic));
    const expected = ['continuity', 'voltage', 'current-and-burden', 'resistance-measurement',
        'range-and-error', 'function-generator', 'scope-probes-and-scale', 'scope-timebase',
        'scope-triggering', 'cursors-and-rc'];

    assert.equal(wave.length, 10);
    assert.deepEqual([...topics].sort(), expected.sort());
    for (const lesson of wave) {
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.id === 'predict'),
            `${lesson.id} starts from a prediction`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} includes live observation`);
    }
    const safetyText = wave.flatMap(lesson => lesson.checkpoints)
        .flatMap(checkpoint => Object.values(checkpoint.copy.en)).join(' ').toLowerCase();
    for (const concern of ['power off', 'burden', 'ground clip', 'uncertainty']) {
        assert.ok(safetyText.includes(concern), `measurement wave covers ${concern}`);
    }
});

test('language wave begins with distinct cross-representation semantic tasks', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'languages-3');
    const topics = new Set(wave.map(lesson => lesson.topic));

    assert.deepEqual([...topics].sort(), ['conditions', 'events', 'sequence', 'state-machines']);
    for (const lesson of wave) {
        assert.deepEqual(Object.keys(lesson.variants), lesson.languages,
            `${lesson.id} explains every declared representation`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.id === 'predict'),
            `${lesson.id} starts from a prediction or model`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} compares against running behavior`);
    }
});
