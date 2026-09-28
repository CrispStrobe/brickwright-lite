import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';
import Modes from '../lib/modes';
import tx from '../lib/bw-messages';
import {setBitmapSelectionKind, setBitmapSelectionTolerance} from '../reducers/bw-bitmap-selection';

const BitmapSelectionControls = props => {
    if (props.mode !== Modes.BIT_SELECT) return null;
    const buttonStyle = kind => ({minHeight: 40, padding: '4px 8px', borderRadius: 5, cursor: 'pointer',
        border: `1px solid ${props.kind === kind ? '#4c97ff' : '#cbd5e1'}`,
        background: props.kind === kind ? '#e0edff' : '#fff'});
    return <div style={{display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
        {['rectangle', 'lasso', 'wand'].map(kind =>
            <button key={kind} type="button" style={buttonStyle(kind)} aria-pressed={props.kind === kind}
                data-testid={`bw-bitmap-select-${kind}`} onClick={() => props.setKind(kind)}>
                {tx(props.intl.locale, kind === 'wand' ? 'magicWand' : kind)}
            </button>)}
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
