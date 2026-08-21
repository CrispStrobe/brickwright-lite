/* eslint-disable react/jsx-no-bind, max-len, no-undefined */
import PropTypes from 'prop-types';
import React from 'react';

import coreCatalog from './lessons.json';
import debuggingWave from './lesson-waves/debugging-5.json';
import electricityWave from './lesson-waves/electricity-1.json';
import interactiveWave from './lesson-waves/interactive-4.json';
import languagesWave from './lesson-waves/languages-3.json';
import machinesWave from './lesson-waves/machines-7.json';
import measurementWave from './lesson-waves/measurement-2.json';
import signalsWave from './lesson-waves/signals-6.json';
import styles from './guided-lessons.css';

const catalog = {
    lessons: [...coreCatalog.lessons, ...electricityWave.lessons, ...measurementWave.lessons,
        ...languagesWave.lessons, ...interactiveWave.lessons, ...debuggingWave.lessons,
        ...signalsWave.lessons, ...machinesWave.lessons]
};

const UI = {
    en: {library: 'Lessons',
        close: 'Close lessons',
        back: 'All lessons',
        objective: 'Goal',
        search: 'Search lessons',
        allLevels: 'All levels',
        noResults: 'No lessons match these filters.',
        viewAs: 'Concept lens',
        openProject: 'Open lesson project',
        opening: 'Opening project…',
        opened: 'Project opened',
        prereqs: 'Builds on',
        hint: 'Show hint',
        hideHint: 'Hide hint',
        previous: 'Previous',
        next: 'Next',
        done: 'Lesson complete',
        reset: 'Reset progress',
        observed: 'Observed',
        progress: 'progress',
        resume: 'Resume',
        start: 'Start',
        manualNote: 'Automatic checks are aids, not tests.'},
    de: {library: 'Lektionen',
        close: 'Lektionen schließen',
        back: 'Alle Lektionen',
        objective: 'Ziel',
        search: 'Lektionen suchen',
        allLevels: 'Alle Stufen',
        noResults: 'Keine Lektion passt zu diesen Filtern.',
        viewAs: 'Sprachperspektive',
        openProject: 'Lektionsprojekt öffnen',
        opening: 'Projekt wird geöffnet…',
        opened: 'Projekt geöffnet',
        prereqs: 'Baut auf auf',
        hint: 'Hinweis zeigen',
        hideHint: 'Hinweis ausblenden',
        previous: 'Zurück',
        next: 'Weiter',
        done: 'Lektion abgeschlossen',
        reset: 'Fortschritt zurücksetzen',
        observed: 'Erkannt',
        progress: 'Fortschritt',
        resume: 'Fortsetzen',
        start: 'Starten',
        manualNote: 'Automatische Prüfungen sind Hilfen, keine Tests.'}
};

const language = locale => (/^de/i.test(locale || '') ? 'de' : 'en');
const localized = (value, lang) => value[lang] || value.en;
const progressKey = lesson => `bw-lesson-progress:${lesson.id}:v${lesson.version}`;

const loadProgress = lesson => {
    try {
        const value = JSON.parse(localStorage.getItem(progressKey(lesson)) || '{}');
        return value.completed && typeof value.completed === 'object' ? value.completed : {};
    } catch {
        return {};
    }
};

const matches = (condition, detail) => {
    if (!condition) return true;
    return Object.keys(condition).every(key => {
        if (key === 'minimumParts') return Number(detail.parts || 0) >= Number(condition[key]);
        return detail[key] === condition[key];
    });
};

const eventNames = {
    'project-run': 'bw-green-flag',
    'project-stop': 'bw-stop-all',
    'circuit-ready': 'bw-circuit-ready',
    'circuit-changed': 'bw-circuit-changed',
    'debug-phase': 'bw-debug-phase',
    'hardware-state': 'bw-hardware-state'
};

const GuidedLessons = ({initialEvent, lessonId, locale, onClose, onSelectLesson}) => {
    const lang = language(locale);
    const text = UI[lang];
    const lesson = catalog.lessons.find(item => item.id === lessonId) || null;
    const [completed, setCompleted] = React.useState(() => (lesson ? loadProgress(lesson) : {}));
    const [step, setStep] = React.useState(0);
    const [hint, setHint] = React.useState(false);
    const [projectStatus, setProjectStatus] = React.useState('');
    const [selectedVariant, setSelectedVariant] = React.useState('');
    const [query, setQuery] = React.useState('');
    const [depthFilter, setDepthFilter] = React.useState('');

    React.useEffect(() => {
        setCompleted(lesson ? loadProgress(lesson) : {});
        setStep(0);
        setHint(false);
        setProjectStatus('');
        setSelectedVariant(lesson && lesson.languages.length ? lesson.languages[0] : '');
    }, [lessonId]);

    React.useEffect(() => {
        const result = event => {
            const detail = event.detail || {};
            if (!lesson || detail.journeyId !== `lesson:${lesson.id}`) return;
            setProjectStatus(detail.ok ? 'opened' : (detail.cancelled ? '' :
                (detail.error || 'Could not open the lesson project.')));
        };
        window.addEventListener('bw-lesson-project-result', result);
        return () => window.removeEventListener('bw-lesson-project-result', result);
    }, [lesson]);

    const complete = React.useCallback((checkpointId, method) => {
        if (!lesson) return;
        setCompleted(previous => {
            if (previous[checkpointId]) return previous;
            const next = {...previous, [checkpointId]: {method, at: new Date().toISOString()}};
            try {
                localStorage.setItem(progressKey(lesson), JSON.stringify({
                    lessonVersion: lesson.version,
                    completed: next
                }));
            } catch { /* local progress is optional in private mode */ }
            return next;
        });
    }, [lesson]);

    React.useEffect(() => {
        if (!lesson) return undefined;
        const removers = [];
        for (const checkpoint of lesson.checkpoints) {
            if (!checkpoint.observe || checkpoint.observe.event === 'starter-loaded') continue;
            const domName = eventNames[checkpoint.observe.event];
            if (!domName) continue;
            const listener = event => {
                if (matches(checkpoint.observe.match, event.detail || {})) {
                    complete(checkpoint.id, 'observed');
                }
            };
            window.addEventListener(domName, listener);
            removers.push(() => window.removeEventListener(domName, listener));
        }
        return () => removers.forEach(remove => remove());
    }, [complete, lesson]);

    React.useEffect(() => {
        if (!lesson || initialEvent !== 'starter-loaded') return;
        for (const checkpoint of lesson.checkpoints) {
            if (checkpoint.observe && checkpoint.observe.event === initialEvent) {
                complete(checkpoint.id, 'observed');
            }
        }
    }, [complete, initialEvent, lesson]);

    if (!lesson) {
        const normalizedQuery = query.trim().toLowerCase();
        const visibleLessons = catalog.lessons.filter(item => {
            if (depthFilter && item.depth !== depthFilter) return false;
            if (!normalizedQuery) return true;
            const copy = localized(item.copy, lang);
            return [copy.title, copy.objective, item.topic || '', ...item.domains, ...item.languages]
                .join(' ')
                .toLowerCase()
                .includes(normalizedQuery);
        });
        return (
            <aside
                className={styles.drawer}
                aria-label={text.library}
                data-testid="bw-lessons-library"
            >
                <header className={styles.header}>
                    <h2>{text.library}</h2>
                    <button
                        aria-label={text.close}
                        type="button"
                        onClick={onClose}
                    >{'×'}</button>
                </header>
                <div className={styles.filters}>
                    <input
                        aria-label={text.search}
                        placeholder={text.search}
                        type="search"
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                    />
                    <select
                        aria-label={text.allLevels}
                        value={depthFilter}
                        onChange={event => setDepthFilter(event.target.value)}
                    >
                        <option value="">{text.allLevels}</option>
                        {['discover', 'foundation', 'practitioner', 'advanced', 'research'].map(depth => (
                            <option
                                key={depth}
                                value={depth}
                            >{depth}</option>
                        ))}
                    </select>
                </div>
                <div className={styles.catalog}>
                    {visibleLessons.map(item => {
                        const copy = localized(item.copy, lang);
                        const saved = loadProgress(item);
                        const count = Object.keys(saved).length;
                        return (
                            <button
                                className={styles.lessonCard}
                                data-lesson-id={item.id}
                                key={item.id}
                                type="button"
                                onClick={() => onSelectLesson(item.id)}
                            >
                                <span className={styles.lessonTitle}>{copy.title}</span>
                                <span className={styles.lessonMeta}>
                                    {`${item.depth} · ${item.ageGuidance} · ${item.minutes} min`}
                                </span>
                                {item.topic ? (
                                    <span className={styles.lessonTopic}>{item.topic.replace(/-/g, ' ')}</span>
                                ) : null}
                                <span className={styles.lessonObjective}>{copy.objective}</span>
                                <span className={styles.lessonProgress}>
                                    {count ? `${text.resume} · ${count}/${item.checkpoints.length}` : text.start}
                                </span>
                            </button>
                        );
                    })}
                    {visibleLessons.length === 0 ? <p className={styles.noResults}>{text.noResults}</p> : null}
                </div>
            </aside>
        );
    }

    const checkpoint = lesson.checkpoints[Math.min(step, lesson.checkpoints.length - 1)];
    const copy = localized(lesson.copy, lang);
    const checkpointCopy = localized(checkpoint.copy, lang);
    const variantCopy = lesson.variants && lesson.variants[selectedVariant] ?
        localized(lesson.variants[selectedVariant], lang) : '';
    const count = Object.keys(completed).length;
    const isComplete = count === lesson.checkpoints.length;
    const reset = () => {
        try {
            localStorage.removeItem(progressKey(lesson));
        } catch { /* private mode */ }
        setCompleted({});
        setStep(0);
        setHint(false);
    };

    return (
        <aside
            className={styles.drawer}
            aria-label={copy.title}
            data-testid="bw-guided-lesson"
        >
            <header className={styles.header}>
                <button
                    type="button"
                    onClick={() => onSelectLesson(null)}
                >{'‹ '}{text.back}</button>
                <button
                    aria-label={text.close}
                    type="button"
                    onClick={onClose}
                >{'×'}</button>
            </header>
            <div className={styles.lessonBody}>
                <div className={styles.badges}>
                    <span>{lesson.depth}</span><span>{lesson.ageGuidance}</span><span>{`${lesson.minutes} min`}</span>
                </div>
                <h2>{copy.title}</h2>
                <div className={styles.objective}><strong>{`${text.objective}: `}</strong>{copy.objective}</div>
                <button
                    className={styles.openProject}
                    type="button"
                    onClick={() => {
                        setProjectStatus('opening');
                        window.dispatchEvent(new CustomEvent('bw-open-lesson-project', {detail: lesson}));
                    }}
                >{text.openProject}</button>
                <span
                    className={styles.projectStatus}
                    aria-live="polite"
                >
                    {projectStatus === 'opening' ? text.opening :
                        (projectStatus === 'opened' ? text.opened : projectStatus)}
                </span>
                {lesson.languages.length ? (
                    <div className={styles.variantPicker}>
                        <strong>{`${text.viewAs}: `}</strong>
                        {lesson.languages.map(item => (
                            <button
                                className={item === selectedVariant ? styles.variantSelected : styles.variant}
                                key={item}
                                type="button"
                                onClick={() => setSelectedVariant(item)}
                            >{item}</button>
                        ))}
                        {variantCopy ? <p>{variantCopy}</p> : null}
                    </div>
                ) : null}
                <div
                    className={styles.progressBar}
                    aria-label={`${count}/${lesson.checkpoints.length} ${text.progress}`}
                >
                    <span style={{width: `${100 * count / lesson.checkpoints.length}%`}} />
                </div>
                <div className={styles.stepCount}>{`${step + 1} / ${lesson.checkpoints.length}`}</div>
                <section className={styles.checkpoint}>
                    <h3>{checkpointCopy.action}</h3>
                    <p>{checkpointCopy.explain}</p>
                    {hint ? <div className={styles.hint}>{checkpointCopy.hint}</div> : null}
                    <button
                        className={styles.hintButton}
                        type="button"
                        onClick={() => setHint(value => !value)}
                    >
                        {hint ? text.hideHint : text.hint}
                    </button>
                    <button
                        className={completed[checkpoint.id] ? styles.completedButton : styles.completeButton}
                        data-testid="bw-lesson-complete"
                        type="button"
                        onClick={() => complete(checkpoint.id, 'manual')}
                    >
                        {completed[checkpoint.id] && completed[checkpoint.id].method === 'observed' ?
                            `✓ ${text.observed}` : completed[checkpoint.id] ? `✓ ${checkpointCopy.manual}` : checkpointCopy.manual}
                    </button>
                    <small>{text.manualNote}</small>
                </section>
                <nav className={styles.navigation}>
                    <button
                        disabled={step === 0}
                        type="button"
                        onClick={() => {
                            setStep(step - 1); setHint(false);
                        }}
                    >{text.previous}</button>
                    <button
                        data-testid="bw-lesson-next"
                        disabled={step >= lesson.checkpoints.length - 1}
                        type="button"
                        onClick={() => {
                            setStep(step + 1); setHint(false);
                        }}
                    >{text.next}</button>
                </nav>
                {isComplete ? <div className={styles.done}>{`✓ ${text.done}`}</div> : null}
                <button
                    className={styles.reset}
                    type="button"
                    onClick={reset}
                >{text.reset}</button>
            </div>
        </aside>
    );
};

GuidedLessons.propTypes = {
    initialEvent: PropTypes.string,
    lessonId: PropTypes.string,
    locale: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onSelectLesson: PropTypes.func.isRequired
};

export default GuidedLessons;
