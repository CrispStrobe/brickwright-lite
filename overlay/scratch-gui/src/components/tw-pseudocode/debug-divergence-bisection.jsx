import React from 'react';
import PropTypes from 'prop-types';

const BUTTON = {padding: '3px 7px', borderRadius: 3, border: '1px solid #2c3e50',
    background: '#16213e', color: '#ecf0f1', fontFamily: 'monospace', fontSize: 11};

const cursor = value => value ? `${value.branchId}#${value.eventCursor}` : '—';

const DebugDivergenceBisection = ({status, disabled, onMarkGood, onMarkBad, onStart, onCancel}) => {
    const running = status?.phase === 'running' || status?.phase === 'cancelling';
    return <section data-debug-divergence-bisection style={{display: 'flex', gap: 5,
        alignItems: 'center', flexWrap: 'wrap'}}>
        <strong>{'Divergence'}</strong>
        <span data-debug-bisection-good>{`Good ${cursor(status?.good)}`}</span>
        <span data-debug-bisection-bad>{`Bad ${cursor(status?.bad)}`}</span>
        <button data-debug-bisection-mark-good style={BUTTON} disabled={disabled || running}
            onClick={onMarkGood}>{'Mark good'}</button>
        <button data-debug-bisection-mark-bad style={BUTTON} disabled={disabled || running}
            onClick={onMarkBad}>{'Mark bad'}</button>
        <button data-debug-bisection-start style={BUTTON}
            disabled={disabled || running || !status?.good || !status?.bad} onClick={onStart}>{'Bisect'}</button>
        <button data-debug-bisection-cancel style={BUTTON} disabled={!running}
            onClick={onCancel}>{'Cancel'}</button>
        {running ? <progress data-debug-bisection-progress max={status.maxProbes || 1}
            value={status.probes || 0} /> : null}
        {status?.result ? <span data-debug-bisection-result role="status">
            {status.result.accepted ? `First mismatch #${status.result.firstMismatchEventSeq}` :
                (status.result.reason || status.result.code)}
        </span> : null}
    </section>;
};

DebugDivergenceBisection.propTypes = {
    status: PropTypes.object,
    disabled: PropTypes.bool,
    onMarkGood: PropTypes.func.isRequired,
    onMarkBad: PropTypes.func.isRequired,
    onStart: PropTypes.func.isRequired,
    onCancel: PropTypes.func.isRequired
};

export default DebugDivergenceBisection;
