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
    const interactive = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/interactive-4.json');
    const debugging = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/debugging-5.json');
    const signals = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/signals-6.json');
    const machines = await readJson(
        '../overlay/scratch-gui/src/components/gui/lesson-waves/machines-7.json');
    return {
        schemaVersion: core.schemaVersion,
        lessons: [...core.lessons, ...electricity.lessons, ...measurement.lessons, ...languages.lessons,
            ...interactive.lessons, ...debugging.lessons, ...signals.lessons, ...machines.lessons]
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
    const bridgeCircuit = await readJson(
        '../overlay/scratch-gui/examples/pc31-bridge-rectifier/circuit.json');
    const bridgeIntro = await readFile(new URL(
        '../overlay/scratch-gui/examples/pc31-bridge-rectifier/intro.md', import.meta.url), 'utf8');
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

    const diodeLesson = wave.find(lesson => lesson.id === 'electricity-diode');
    assert.equal(diodeLesson.exampleId, 'pc31-bridge-rectifier',
        'the rectification lesson opens the reversible bridge experiment');
    assert.ok(diodeLesson.version >= 2, 'the corrected diode lesson invalidates stale progress');
    assert.equal(bridgeCircuit.parts.filter(part => part.kind === 'diode').length, 4,
        'the bridge experiment supplies four diode paths to trace');
    assert.ok(bridgeCircuit.parts.some(part => part.kind === 'vsource' && part.params.volts === 9),
        'the bridge experiment supplies the source whose polarity the lesson reverses');
    assert.doesNotMatch(bridgeIntro, /source that really alternates/i,
        'the bridge follow-up does not advertise a waveform absent from the linked example');
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

test('language wave has twelve distinct cross-representation semantic tasks', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'languages-3');
    const topics = new Set(wave.map(lesson => lesson.topic));

    const expected = ['sequence', 'events', 'loops', 'conditions', 'variables', 'procedures',
        'concurrency', 'state-machines', 'arrays-data', 'messages', 'pins-peripherals', 'protocols'];

    assert.equal(wave.length, 12);
    assert.deepEqual([...topics].sort(), expected.sort());
    for (const lesson of wave) {
        assert.deepEqual(Object.keys(lesson.variants), lesson.languages,
            `${lesson.id} explains every declared representation`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.id === 'predict'),
            `${lesson.id} starts from a prediction or model`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} compares against running behavior`);
    }
    const languages = new Set(wave.flatMap(lesson => lesson.languages));
    for (const language of ['blocks', 'pseudocode', 'python', 'javascript', 'c', 'asm']) {
        assert.ok(languages.has(language), `language wave covers ${language}`);
    }
});

test('interactive wave covers eight capability and control workflows', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'interactive-4');
    const expected = ['extension-discovery', 'sensor-capability', 'lego-connect-deploy-recover',
        'buttons-sliders-joysticks', 'displays-gauges', 'two-way-binding', 'dashboards',
        'calibration-sampling-safety'];

    assert.equal(wave.length, 8);
    assert.deepEqual(wave.map(lesson => lesson.topic).sort(), expected.sort());
    for (const lesson of wave) {
        assert.deepEqual(Object.keys(lesson.variants), lesson.languages,
            `${lesson.id} explains every declared representation`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.id === 'predict'),
            `${lesson.id} starts from an explicit prediction or design`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} includes live evidence or connection state`);
    }
    assert.equal(wave.find(lesson => lesson.id === 'interactive-lego-recovery').environment,
        'optional-hardware');
});

test('debugging wave asks ten questions answerable with evidence', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'debugging-5');
    const expected = ['reproduce-minimize', 'pause-step', 'watches', 'conditional-breakpoints',
        'call-stack', 'task-scheduling', 'pins-signals', 'serial-trace', 'timing-bugs',
        'simulation-vs-hardware'];

    assert.equal(wave.length, 10);
    assert.deepEqual(wave.map(lesson => lesson.topic).sort(), expected.sort());
    for (const lesson of wave) {
        assert.ok(lesson.copy.en.title.endsWith('?') && lesson.copy.de.title.endsWith('?'),
            `${lesson.id} begins with a question`);
        assert.equal(lesson.checkpoints[0].id, 'question',
            `${lesson.id} asks before operating the debugger`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} collects live evidence`);
    }
});

test('signals wave tests ten models with measurement and uncertainty', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'signals-6');
    const expected = ['rc-response', 'rl-response', 'complex-impedance', 'cutoff-phase',
        'bode-sweeps', 'resonance', 'loading', 'noise', 'aliasing-fft-limits',
        'uncertainty-model-comparison'];

    assert.equal(wave.length, 10);
    assert.deepEqual(wave.map(lesson => lesson.topic).sort(), expected.sort());
    for (const lesson of wave) {
        assert.equal(lesson.checkpoints[0].id, 'predict', `${lesson.id} predicts before measuring`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} gathers live evidence`);
        const text = JSON.stringify(lesson.copy.en).toLowerCase() +
            JSON.stringify(lesson.checkpoints.map(checkpoint => checkpoint.copy.en)).toLowerCase();
        assert.ok(/uncertainty|assumption|residual|error|limit/.test(text),
            `${lesson.id} qualifies its result`);
    }
    assert.equal(wave.filter(lesson => lesson.depth === 'research').length, 2);
});

test('machine wave connects ten architectural layers to electrical evidence', async () => {
    const {lessons} = await readLessons();
    const wave = lessons.filter(lesson => lesson.wave === 'machines-7');
    const expected = ['logic-levels', 'gates-registers', 'clocks', 'buses', 'memory-maps',
        'address-decoding', '6502-z80-execution', 'source-asm-correspondence',
        'bus-contention', 'interrupts-performance-timing'];

    assert.equal(wave.length, 10);
    assert.deepEqual(wave.map(lesson => lesson.topic).sort(), expected.sort());
    for (const lesson of wave) {
        assert.equal(lesson.checkpoints[0].id, 'predict', `${lesson.id} predicts machine state first`);
        assert.ok(lesson.checkpoints.some(checkpoint => checkpoint.observe),
            `${lesson.id} inspects live machine or electrical evidence`);
    }
    for (const language of ['pseudocode', 'c', 'basic', 'asm']) {
        assert.ok(wave.some(lesson => lesson.languages.includes(language)),
            `machine wave includes ${language} where useful`);
    }
});
