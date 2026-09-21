import React from 'react';
import {CHALLENGES, challengeById, isUnlocked, isRealise} from '../../lib/bw-fpga/challenges.js';
import {gradeMessage, gradeMessageRealised} from '../../lib/bw-fpga/grader.js';

/**
 * The learning-path panel — a Turing-Complete-style ladder of build-it-yourself
 * challenges, on real-silicon logic. It lists the curriculum with each step's
 * state (done / current / open / locked), shows the active brief, and a "Check"
 * button that runs the auto-grader. Progress is the builder's; this is the view.
 */

const stateOf = (c, passed, active) =>
    (passed.has(c.id) ? 'done' : c.id === active ? 'active' : isUnlocked(c.id, passed) ? 'open' : 'locked');

const ICON = {done: '✓', active: '▸', open: '○', locked: '🔒'};
/** Which realisations can build this challenge's gate, in learner's words. */
const RUNG_LABEL = {ic: '⚙ as a 74HC chip', cmos: '⚛ from transistors'};
const COLOR = {done: '#16a34a', active: '#1d4ed8', open: '#475569', locked: '#94a3b8'};

export function FpgaChallengePanel ({active, passed, result, onSelect, onCheck, onNext}) {
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
                {'Learning path'} <span style={{fontWeight: 'normal', opacity: 0.7}}>{`${done}/${CHALLENGES.length}`}</span>
            </div>
            <progress value={done} max={CHALLENGES.length} style={{width: '100%', height: 6, marginBottom: 6}} />
            {CHALLENGES.map(c => {
                const st = stateOf(c, passed, active);
                return (
                    <button key={c.id} type="button" disabled={st === 'locked'}
                        onClick={() => onSelect(c.id)} data-testid={`bw-fpga-challenge-${c.id}`}
                        title={c.brief}
                        style={{display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left',
                            border: 'none', background: st === 'active' ? 'rgba(29,78,216,0.10)' : 'transparent',
                            padding: '3px 5px', borderRadius: 4, cursor: st === 'locked' ? 'default' : 'pointer',
                            color: COLOR[st], fontSize: 12, fontWeight: st === 'active' ? 'bold' : 'normal'}}>
                        <span style={{flex: '0 0 auto'}}>{ICON[st]}</span>
                        <span>{c.title}</span>
                        {/* A board challenge is graded somewhere else entirely — say so
                            in the list, not only once it is open. */}
                        {isRealise(c) ? (
                            <span title="Graded on the real breadboard, in the Circuit tab"
                                style={{marginLeft: 'auto', flex: '0 0 auto', opacity: 0.75}}>{'🔌'}</span>
                        ) : null}
                    </button>
                );
            })}
            {activeC ? (
                <div style={{marginTop: 8}}>
                    <div style={{fontSize: 11, lineHeight: 1.4, color: '#334155', marginBottom: 6}}>{activeC.brief}</div>
                    {/* A board challenge is met in the Circuit tab, so name the
                        realisations that can build this particular gate — XOR,
                        for one, has no transistor form and no ⚛ button. */}
                    {isRealise(activeC) ? (
                        <div data-testid="bw-fpga-rungs" style={{fontSize: 11, lineHeight: 1.4, marginBottom: 6,
                            padding: '4px 6px', borderRadius: 4, background: 'rgba(29,78,216,0.06)', color: '#334155'}}>
                            {'🔌 Graded on the real board: '}
                            {(activeC.rungs || []).map(r => RUNG_LABEL[r]).filter(Boolean).join(', or ')}
                            {' — or wire it yourself. Any build that computes it passes.'}
                        </div>
                    ) : null}
                    <button type="button" onClick={onCheck} data-testid="bw-fpga-check"
                        disabled={Boolean(result && result.pending)}
                        style={{width: '100%', padding: '5px 8px', cursor: 'pointer', fontWeight: 'bold',
                            border: '1px solid #16a34a', borderRadius: 6, background: '#f0fdf4', color: '#166534'}}
                    >{result && result.pending ? 'Checking the board…'
                        : isRealise(activeC) ? '✓ Check my board' : '✓ Check my design'}</button>
                    {result && !result.pending ? (
                        <div data-testid="bw-fpga-result" style={{marginTop: 6, fontSize: 11, lineHeight: 1.4,
                            color: result.pass ? '#166534' : '#b91c1c'}}>
                            {result.realised ? gradeMessageRealised(result, activeC) : gradeMessage(result, activeC)}</div>
                    ) : null}
                    {result && result.pass ? (
                        <button type="button" onClick={onNext} data-testid="bw-fpga-next"
                            style={{marginTop: 6, width: '100%', padding: '5px 8px', cursor: 'pointer', fontWeight: 'bold',
                                border: '1px solid #1d4ed8', borderRadius: 6, background: '#eff6ff', color: '#1d4ed8'}}
                        >{'Next challenge →'}</button>
                    ) : null}
                </div>
            ) : (
                <div style={{marginTop: 8, fontSize: 11, color: '#64748b'}}>{'Pick a step to start building.'}</div>
            )}
        </div>
    );
}

export default FpgaChallengePanel;
