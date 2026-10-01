import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import Modes from '../lib/modes';
import tx from '../lib/bw-messages';
import {setBitmapSelectionKind, setBitmapSelectionTolerance} from '../reducers/bw-bitmap-selection';

const BitmapSelectionControls = props => {
    if (props.mode !== Modes.BIT_SELECT) return null;
    const buttonStyle = kind => ({width: 44, height: 44, padding: 8, borderRadius: 5, cursor: 'pointer',
        border: `1px solid ${props.kind === kind ? '#4c97ff' : '#cbd5e1'}`,
        background: props.kind === kind ? '#e0edff' : '#fff'});
    const icons = {
        rectangle: <rect x="4" y="4" width="16" height="16" strokeDasharray="3 3" />,
        lasso: <><path d="M5 8c2-5 11-6 14-1 3 6-3 11-9 10-5-1-8-5-5-9z" strokeDasharray="2 2" />
            <path d="M10 17l2 4" /></>,
        wand: <><path d="M5 19L18 6M14 3v2m7 5h-2m-1 8l-1-2M5 5l1 2" />
            <path d="M18 3v6m-3-3h6" /></>
    };
    return <div style={{display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap'}}>
        {['rectangle', 'lasso', 'wand'].map(kind => {
            const label = tx(props.intl.locale, kind === 'wand' ? 'magicWand' : kind);
            return <button key={kind} type="button" style={buttonStyle(kind)} aria-pressed={props.kind === kind}
                aria-label={label} title={label}
                data-testid={`bw-bitmap-select-${kind}`} onClick={() => props.setKind(kind)}>
                <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8"
                    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" width="22" height="22">
                    {icons[kind]}
                </svg>
            </button>;
        })}
        {props.kind === 'wand' ? <label style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
            {tx(props.intl.locale, 'tolerance')} {props.tolerance}
            <input type="range" min="0" max="255" value={props.tolerance}
                data-testid="bw-bitmap-wand-tolerance"
                onChange={event => props.setTolerance(event.target.value)} />
        </label> : null}
    </div>;
};

BitmapSelectionControls.propTypes = {
    intl: intlShape.isRequired,
    kind: PropTypes.string.isRequired,
    mode: PropTypes.string.isRequired,
    setKind: PropTypes.func.isRequired,
    setTolerance: PropTypes.func.isRequired,
    tolerance: PropTypes.number.isRequired
};

const mapStateToProps = state => ({
    kind: state.scratchPaint.bwBitmapSelection.kind,
    mode: state.scratchPaint.mode,
    tolerance: state.scratchPaint.bwBitmapSelection.tolerance
});
const mapDispatchToProps = dispatch => ({
    setKind: kind => dispatch(setBitmapSelectionKind(kind)),
    setTolerance: value => dispatch(setBitmapSelectionTolerance(value))
});

export default connect(mapStateToProps, mapDispatchToProps)(injectIntl(BitmapSelectionControls));
