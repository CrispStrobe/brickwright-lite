import React from 'react';
import PropTypes from 'prop-types';

const BUTTON = {padding: '3px 7px', borderRadius: 3, border: '1px solid #2c3e50',
    background: '#16213e', color: '#ecf0f1', fontFamily: 'monospace', fontSize: 11};
const labelCursor = cursor => cursor ? `${cursor.branchId}#${cursor.eventCursor}` : '—';

const DebugCorrelatedTargets = ({view, selectedTarget, status, onSelectTarget,
    onSelectEvent, onAddTrigger, onFollowCause, onCheckpoint, onRestore}) => (
    <section data-debug-correlated-targets style={{border: '1px solid #2c3e50', borderRadius: 4,
        padding: 7, display: 'grid', gap: 5}}>
        <div style={{display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap'}}>
            <strong>{'CPUs'}</strong>
            <select data-debug-correlated-target-select value={selectedTarget || ''}
                onChange={event => onSelectTarget(event.target.value)} style={BUTTON}>
                {(view?.targets || []).map(item => <option key={item.targetId || item.id}
                    value={item.targetId || item.id}>{item.targetId || item.id}</option>)}
            </select>
            <button data-debug-cross-core-trigger style={BUTTON} onClick={onAddTrigger}>
                {'Trigger from selected event'}</button>
            <button data-debug-causal-follow style={BUTTON} disabled={!view?.selectedEvent?.cause}
                onClick={onFollowCause}>{'Follow cause'}</button>
            <button data-debug-correlated-checkpoint style={BUTTON} onClick={onCheckpoint}>
                {'Checkpoint all'}</button>
            <button data-debug-correlated-restore style={BUTTON} disabled={!view?.lastCheckpoint}
                onClick={onRestore}>{'Restore all'}</button>
        </div>
        <div data-debug-correlated-lanes style={{display: 'grid', gap: 3}}>
            {(view?.lanes || []).map(lane => <div key={lane.targetId} data-debug-correlated-lane
                data-target-id={lane.targetId} data-clock-domain={lane.clockDomain}>
                <strong>{`${lane.targetId} · ${lane.clockDomain}`}</strong>{' '}
                {(lane.events || []).slice(-32).map(event => <button key={event.cursor.eventCursor}
                    data-debug-correlated-event data-causal-order={event.causalOrder}
                    style={BUTTON} onClick={() => onSelectEvent(event.cursor)}
                    title={event.cause ? `caused by ${labelCursor(event.cause)}` : ''}>
                    {` ${labelCursor(event.cursor)} `}
                </button>)}
            </div>)}
        </div>
        {status ? <span data-debug-correlated-status role={status.accepted === false ? 'alert' : 'status'}>
            {status.message || status.reason || status.code}
        </span> : null}
    </section>
);

DebugCorrelatedTargets.propTypes = {
    view: PropTypes.object,
    selectedTarget: PropTypes.string,
    status: PropTypes.object,
    onSelectTarget: PropTypes.func.isRequired,
    onSelectEvent: PropTypes.func.isRequired,
    onAddTrigger: PropTypes.func.isRequired,
    onFollowCause: PropTypes.func.isRequired,
    onCheckpoint: PropTypes.func.isRequired,
    onRestore: PropTypes.func.isRequired
};

export default DebugCorrelatedTargets;
