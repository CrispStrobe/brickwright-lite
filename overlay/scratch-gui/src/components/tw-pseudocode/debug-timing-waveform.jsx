import React from 'react';
import PropTypes from 'prop-types';

const BUTTON = {
    padding: '3px 7px', borderRadius: 3, border: '1px solid #2c3e50',
    background: '#16213e', color: '#ecf0f1', fontFamily: 'monospace', fontSize: 11
};

const laneValue = (sample, lane) => sample.values?.[lane] ?? '—';
const MAX_RENDERED_SAMPLES = 128;

/**
 * Bounded presentation of a timing-waveform view. The component never owns a
 * cursor and never reads the live target: `selectedSeq` and every sample come
 * from the immutable canonical-event view supplied by the dock.
 */
const DebugTimingWaveform = ({view, selectedSeq, refusal, onSelect, onZoom, onPan,
    onSetTrigger, onPreviousTrigger, onNextTrigger, onExport}) => {
    if (!view) return null;
    const lanes = view.lanes || [];
    const samples = view.samples || [];
    const selectedIndex = samples.findIndex(sample => String(sample.seq) === String(selectedSeq));
    const start = Math.max(0, Math.min(samples.length - MAX_RENDERED_SAMPLES,
        selectedIndex < 0 ? samples.length - MAX_RENDERED_SAMPLES :
            selectedIndex - Math.floor(MAX_RENDERED_SAMPLES / 2)));
    const visibleSamples = samples.slice(start, start + MAX_RENDERED_SAMPLES);
    const fidelities = [...new Set(visibleSamples.map(sample => sample.provenance))].filter(Boolean);
    const provenance = fidelities.length === 1 ? fidelities[0] : fidelities.length ? 'mixed' : 'unavailable';
    return (
        <section data-debug-timing-waveform data-selected-event-seq={String(selectedSeq ?? '')}
            data-debug-waveform-provenance={provenance}
            style={{border: '1px solid #2c3e50', borderRadius: 4, padding: 7}}>
            <div style={{display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap'}}>
                <strong>{'Timing'}</strong>
                <span data-debug-waveform-fidelity style={{fontSize: 10, textTransform: 'uppercase'}}>
                    {provenance}
                </span>
                <button data-debug-waveform-zoom-in style={BUTTON} onClick={() => onZoom(2)}>{'Zoom +'}</button>
                <button data-debug-waveform-zoom-out style={BUTTON} onClick={() => onZoom(0.5)}>{'Zoom −'}</button>
                <button data-debug-waveform-pan-older style={BUTTON} onClick={() => onPan(-1)}>{'← Range'}</button>
                <button data-debug-waveform-pan-newer style={BUTTON} onClick={() => onPan(1)}>{'Range →'}</button>
                <select data-debug-waveform-trigger-lane aria-label="Trigger signal"
                    value={view.trigger?.lane || ''} style={BUTTON}
                    onChange={event => onSetTrigger(event.target.value)}>
                    <option value="">{'Trigger…'}</option>
                    {lanes.map(lane => <option key={lane.id} value={lane.id}>{lane.label || lane.id}</option>)}
                </select>
                <button data-debug-waveform-trigger-previous style={BUTTON}
                    onClick={onPreviousTrigger}>{'← Trigger'}</button>
                <button data-debug-waveform-trigger-next style={BUTTON}
                    onClick={onNextTrigger}>{'Trigger →'}</button>
                <button data-debug-waveform-export-json style={BUTTON}
                    onClick={() => onExport('json')}>{'JSON'}</button>
                <button data-debug-waveform-export-vcd style={BUTTON}
                    onClick={() => onExport('vcd')}>{'VCD'}</button>
            </div>
            <div role="table" aria-label="Recorded bus and pin timing"
                style={{display: 'grid', gap: 3, marginTop: 6, overflowX: 'auto'}}>
                {lanes.map(lane => {
                    return <div role="row" data-debug-waveform-lane={lane.group || lane.kind || 'signal'}
                        key={lane.id} style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                        <span role="rowheader" style={{width: 90}}>{lane.label || lane.id}</span>
                        {visibleSamples.map((sample, index) => {
                            const seq = sample.seq;
                                const selected = String(seq) === String(selectedSeq);
                                return <button key={`${String(seq)}:${index}`} data-debug-waveform-sample
                                    data-debug-waveform-sample-fidelity={sample.provenance}
                                    data-event-seq={String(seq)} aria-pressed={selected}
                                title={`${lane.label || lane.id}: ${String(laneValue(sample, lane.id))} · ${sample.provenance || provenance}`}
                                onClick={() => onSelect(seq)} style={{...BUTTON, padding: '2px 5px',
                                    borderColor: selected ? '#f1c40f' : '#2c3e50'}}>
                                {String(laneValue(sample, lane.id))}
                            </button>;
                        })}
                    </div>;
                })}
            </div>
            {refusal ? <div role="status" data-debug-waveform-refusal>{refusal}</div> : null}
        </section>
    );
};

DebugTimingWaveform.propTypes = {
    view: PropTypes.object,
    selectedSeq: PropTypes.any,
    refusal: PropTypes.string,
    onSelect: PropTypes.func.isRequired,
    onZoom: PropTypes.func.isRequired,
    onPan: PropTypes.func.isRequired,
    onSetTrigger: PropTypes.func.isRequired,
    onPreviousTrigger: PropTypes.func.isRequired,
    onNextTrigger: PropTypes.func.isRequired,
    onExport: PropTypes.func.isRequired
};

export default DebugTimingWaveform;
