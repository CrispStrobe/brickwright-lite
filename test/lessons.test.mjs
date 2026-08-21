import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const LANGUAGES = new Set(['blocks', 'pseudocode', 'python', 'javascript', 'c', 'basic', 'asm']);
const EVENTS = new Set(['starter-loaded', 'project-run', 'project-stop', 'circuit-ready',
    'circuit-changed', 'debug-phase', 'hardware-state']);

test('guided lesson catalog is localized, connected, and declarative', async () => {
    const catalog = await readJson('../overlay/scratch-gui/src/components/gui/lessons.json');
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
    const {lessons} = await readJson('../overlay/scratch-gui/src/components/gui/lessons.json');
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
