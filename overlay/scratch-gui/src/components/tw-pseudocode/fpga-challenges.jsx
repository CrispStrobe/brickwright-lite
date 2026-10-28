import React from 'react';
import {CHALLENGES, challengeById, isUnlocked, isRealise, challengeTitle, challengeBrief}
    from '../../lib/bw-fpga/challenges.js';
import {gradeMessage, gradeMessageRealised} from '../../lib/bw-fpga/grader.js';
import {IC_CIRCUITS, circuitLabel} from '../../lib/bw-fpga/logic-ic-circuit.js';
import {t} from '../../lib/bw-fpga/l10n.js';

/**
 * The learning-path panel — a Turing-Complete-style ladder of build-it-yourself
 * challenges, on real-silicon logic. It lists the curriculum with each step's
 * state (done / current / open / locked), shows the active brief, and a "Check"
 * button that runs the auto-grader. Progress is the builder's; this is the view.
 */

const stateOf = (c, passed, active) =>
    (passed.has(c.id) ? 'done' : c.id === active ? 'active' : isUnlocked(c.id, passed) ? 'open' : 'locked');

const ICON = {done: '✓', active: '▸', open: '○', locked: '🔒'};
/** Which realisations can build this challenge's gate, in the learner's words. */
const rungLabel = (rung, locale) => t(locale, `panel.rung.${rung}`);
const COLOR = {done: '#16a34a', active: '#1d4ed8', open: '#475569', locked: '#94a3b8'};

export function FpgaChallengePanel ({active, passed, result, onSelect, onCheck, onNext, locale}) {
    const activeC = active ? challengeById(active) : null;
    const done = CHALLENGES.filter(c => passed.has(c.id)).length;

    // Keep the verdict on screen. This panel is a fixed-height scroll box and the
    // brief, Check button and result sit BELOW the challenge list, so with a
    // ladder this long the result lands under the fold: pressing Check appeared
    // to do nothing at all (measured in a real browser — the panel's visible area
    // ended at y=560 and the verdict rendered at y=566). Scroll to the bottom
    // whenever the verdict changes, INCLUDING to the pending state, so the wait
    // is visible too. Scrolling this container rather than calling
    // scrollIntoView keeps the page itself still.
    const scrollRef = React.useRef(null);
    React.useEffect(() => {
        if (!result) return;
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [result]);

    return (
        <div ref={scrollRef} data-testid="bw-fpga-challenges" style={{width: 196, flex: '0 0 auto',
            borderRight: '1px solid rgba(71,85,105,0.25)', paddingRight: 8, marginRight: 8, overflowY: 'auto', maxHeight: '48vh'}}>
            <div style={{fontSize: 12, fontWeight: 'bold', margin: '0 0 4px'}}>
                {t(locale, 'panel.title')} <span style={{fontWeight: 'normal', opacity: 0.7}}>{`${done}/${CHALLENGES.length}`}</span>
            </div>
            <progress value={done} max={CHALLENGES.length} style={{width: '100%', height: 6, marginBottom: 6}} />
            {CHALLENGES.map(c => {
                const st = stateOf(c, passed, active);
                return (
                    <button key={c.id} type="button" disabled={st === 'locked'}
                        onClick={() => onSelect(c.id)} data-testid={`bw-fpga-challenge-${c.id}`}
                        title={challengeBrief(c, locale)}
                        style={{display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                            border: 'none', background: st === 'active' ? 'rgba(29,78,216,0.10)' : 'transparent',
                            padding: '3px 5px', borderRadius: 4, cursor: st === 'locked' ? 'default' : 'pointer',
                            color: COLOR[st], fontSize: 12, fontWeight: st === 'active' ? 'bold' : 'normal'}}>
                        <span style={{flex: '0 0 auto'}}>{ICON[st]}</span>
                        <span>{challengeTitle(c, locale)}</span>
                        {/* A board challenge is graded somewhere else entirely — say so
                            in the list, not only once it is open. */}
                        {isRealise(c) ? (
                            <span title={t(locale, 'panel.boardChallengeTitle')}
                                style={{marginLeft: 'auto', flex: '0 0 auto', opacity: 0.75}}>{'🔌'}</span>
                        ) : null}
                    </button>
                );
            })}
            {activeC ? (
                <div style={{marginTop: 8}}>
                    <div style={{fontSize: 11, lineHeight: 1.4, color: '#334155', marginBottom: 6}}>{challengeBrief(activeC, locale)}</div>
                    {/* A board challenge is met in the Circuit tab, so name the
                        realisations that can build this particular gate — XOR,
                        for one, has no transistor form and no ⚛ button. */}
                    {isRealise(activeC) ? (
                        <div data-testid="bw-fpga-rungs" style={{fontSize: 11, lineHeight: 1.4, marginBottom: 6,
                            padding: '4px 6px', borderRadius: 4, background: 'rgba(29,78,216,0.06)', color: '#334155'}}>
                            {t(locale, 'panel.gradedOnBoard')}
                            {activeC.circuit
                                ? `⚙ ${circuitLabel(IC_CIRCUITS[activeC.circuit], locale)}`
                                : (activeC.rungs || []).map(r => rungLabel(r, locale)).filter(Boolean).join(', ')}
                            {t(locale, 'panel.orWireItYourself')}
                            {/* A multi-output challenge reads more than one LED, and which
                                LED is which is the thing a learner can get backwards. */}
                            {activeC.outputs.length > 1 ? (
                                <div style={{marginTop: 4}}>
                                    {t(locale, 'panel.readsLeds', {
                                        n: activeC.outputs.length,
                                        names: activeC.outputs.map(o => o.name).join(', ')
                                    })}
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                    <button type="button" onClick={onCheck} data-testid="bw-fpga-check"
                        disabled={Boolean(result && result.pending)}
                        style={{width: '100%', padding: '5px 8px', cursor: 'pointer', fontWeight: 'bold',
                            border: '1px solid #16a34a', borderRadius: 6, background: '#f0fdf4', color: '#166534'}}
                    >{result && result.pending
                        ? (result.progress
                            ? t(locale, 'panel.checkingProgress',
                                {checked: result.progress.checked + 1, total: result.progress.total})
                            : t(locale, 'panel.checking'))
                        : t(locale, isRealise(activeC) ? 'panel.checkBoard' : 'panel.checkDesign')}</button>
                    {result && !result.pending ? (
                        <div data-testid="bw-fpga-result" style={{marginTop: 6, fontSize: 11, lineHeight: 1.4,
                            color: result.pass ? '#166534' : '#b91c1c'}}>
                            {result.realised
                                ? gradeMessageRealised(result, activeC, locale)
                                : gradeMessage(result, activeC, locale)}</div>
                    ) : null}
                    {result && result.pass ? (
                        <button type="button" onClick={onNext} data-testid="bw-fpga-next"
                            style={{marginTop: 6, width: '100%', padding: '5px 8px', cursor: 'pointer', fontWeight: 'bold',
                                border: '1px solid #1d4ed8', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8'}}
                        >{t(locale, 'panel.next')}</button>
                    ) : null}
                </div>
            ) : (
                <div style={{marginTop: 8, fontSize: 11, color: '#64748b'}}>{t(locale, 'panel.pickAStep')}</div>
            )}
        </div>
    );
}

export default FpgaChallengePanel;
