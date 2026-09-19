import React from 'react';
import {CHALLENGES, challengeById, isUnlocked} from '../../lib/bw-fpga/challenges.js';
import {gradeMessage} from '../../lib/bw-fpga/grader.js';

/**
 * The learning-path panel — a Turing-Complete-style ladder of build-it-yourself
 * challenges, on real-silicon logic. It lists the curriculum with each step's
 * state (done / current / open / locked), shows the active brief, and a "Check"
 * button that runs the auto-grader. Progress is the builder's; this is the view.
 */

const stateOf = (c, passed, active) =>
    (passed.has(c.id) ? 'done' : c.id === active ? 'active' : isUnlocked(c.id, passed) ? 'open' : 'locked');

const ICON = {done: '✓', active: '▸', open: '○', locked: '🔒'};
const COLOR = {done: '#16a34a', active: '#1d4ed8', open: '#475569', locked: '#94a3b8'};

export function FpgaChallengePanel ({active, passed, result, onSelect, onCheck}) {
    const activeC = active ? challengeById(active) : null;
    const done = CHALLENGES.filter(c => passed.has(c.id)).length;
    return (
        <div data-testid="bw-fpga-challenges" style={{width: 196, flex: '0 0 auto',
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
                    </button>
                );
            })}
            {activeC ? (
                <div style={{marginTop: 8}}>
                    <div style={{fontSize: 11, lineHeight: 1.4, color: '#334155', marginBottom: 6}}>{activeC.brief}</div>
                    <button type="button" onClick={onCheck} data-testid="bw-fpga-check"
                        style={{width: '100%', padding: '5px 8px', cursor: 'pointer', fontWeight: 'bold',
                            border: '1px solid #16a34a', borderRadius: 6, background: '#f0fdf4', color: '#166534'}}
                    >{'✓ Check my design'}</button>
                    {result ? (
                        <div data-testid="bw-fpga-result" style={{marginTop: 6, fontSize: 11, lineHeight: 1.4,
                            color: result.pass ? '#166534' : '#b91c1c'}}>{gradeMessage(result, activeC)}</div>
                    ) : null}
                </div>
            ) : (
                <div style={{marginTop: 8, fontSize: 11, color: '#64748b'}}>{'Pick a step to start building.'}</div>
            )}
        </div>
    );
}

export default FpgaChallengePanel;
