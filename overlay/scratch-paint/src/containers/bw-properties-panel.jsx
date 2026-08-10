import paper from '@scratch/paper';
import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';

import Modes from '../lib/modes';
import {changeCornerRadius} from '../reducers/bw-shape';
import {togglePanel} from '../reducers/bw-panel';

import {alignSelection, AlignTo, distributeSelection} from '../helper/bw/align';
import {getTransform, rotateBy, setPosition, setRotation, setSize} from '../helper/bw/transform';
import {getSelectedRootItems} from '../helper/selection';
import {ART_BOARD_WIDTH, SVG_ART_BOARD_WIDTH} from '../helper/view';

import BwPropertiesPanelComponent from '../components/bw-properties-panel/bw-properties-panel.jsx';

// paper's art board is twice the size of the exported costume. The panel talks in COSTUME units,
// because those are the numbers the costume, the stage and every other part of Scratch use — a
// 480-wide costume reading as "960" here would be nothing but a trap.
const ART_BOARD_UNITS_PER_COSTUME_UNIT = ART_BOARD_WIDTH / SVG_ART_BOARD_WIDTH;

const toCostumeUnits = value => Math.round((value / ART_BOARD_UNITS_PER_COSTUME_UNIT) * 100) / 100;
const toArtBoardUnits = value => value * ART_BOARD_UNITS_PER_COSTUME_UNIT;

/**
 * Brickwright: the designer's properties rail — numeric transform, align and distribute, and the
 * parameters of the parametric shape tools.
 *
 * Geometry is read straight out of paper on every render rather than mirrored into redux, because
 * paper is the single source of truth for it and a mirror would drift. What redux provides is the
 * re-render TRIGGER: `selectedItems` changes identity whenever the selection changes, and
 * update-image-hoc additionally dispatches redrawSelectionBox after every committed edit, so a
 * plain drag on the canvas refreshes these numbers too.
 */
class BwPropertiesPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleAlign',
            'handleChangeCornerRadius',
            'handleChangeHeight',
            'handleChangeRotation',
            'handleChangeWidth',
            'handleChangeX',
            'handleChangeY',
            'handleDistribute',
            'handleRotateClockwise',
            'handleRotateCounterClockwise',
            'handleToggleLockAspect'
        ]);
        this.state = {
            alignTo: AlignTo.SELECTION,
            lockAspect: false
        };
    }
    /**
     * Commit a geometry change. onUpdateImage exports the costume, takes an undo snapshot and
     * (via update-image-hoc) tells everything reading the selection to refresh.
     * @param {boolean} changed Whether the helper actually moved anything.
     */
    commit (changed) {
        if (changed) this.props.onUpdateImage();
    }
    handleChangeX (value) {
        this.commit(setPosition(toArtBoardUnits(value), null));
    }
    handleChangeY (value) {
        this.commit(setPosition(null, toArtBoardUnits(value)));
    }
    handleChangeWidth (value) {
        const transform = getTransform();
        if (!transform) return;
        const width = toArtBoardUnits(value);
        const height = this.state.lockAspect && transform.width > 0 ?
            transform.height * (width / transform.width) :
            null;
        this.commit(setSize(width, height));
    }
    handleChangeHeight (value) {
        const transform = getTransform();
        if (!transform) return;
        const height = toArtBoardUnits(value);
        const width = this.state.lockAspect && transform.height > 0 ?
            transform.width * (height / transform.height) :
            null;
        this.commit(setSize(width, height));
    }
    handleChangeRotation (value) {
        this.commit(setRotation(value));
    }
    handleRotateClockwise () {
        this.commit(rotateBy(90));
    }
    handleRotateCounterClockwise () {
        this.commit(rotateBy(-90));
    }
    handleToggleLockAspect () {
        this.setState({lockAspect: !this.state.lockAspect});
    }
    handleAlign (alignment) {
        this.commit(alignSelection(alignment, this.state.alignTo));
    }
    handleDistribute (axis) {
        this.commit(distributeSelection(axis));
    }
    handleChangeCornerRadius (value) {
        // Only affects shapes drawn from now on, so there is no image to update.
        this.props.onChangeCornerRadius(value);
    }
    render () {
        const raw = getTransform();
        const transform = raw === null ? null : {
            x: toCostumeUnits(raw.x),
            y: toCostumeUnits(raw.y),
            width: toCostumeUnits(raw.width),
            height: toCostumeUnits(raw.height),
            rotation: raw.rotation === null ? null : Math.round(raw.rotation * 10) / 10
        };

        return (
            <BwPropertiesPanelComponent
                alignTo={this.state.alignTo}
                cornerRadius={this.props.cornerRadius}
                locale={this.props.intl.locale}
                lockAspect={this.state.lockAspect}
                selectionCount={getSelectedRootItems().length}
                showShapeSection={this.props.mode === Modes.ROUNDED_RECT}
                transform={transform}
                visible={this.props.visible}
                onAlign={this.handleAlign}
                onChangeAlignTo={alignTo => this.setState({alignTo})}
                onChangeCornerRadius={this.handleChangeCornerRadius}
                onChangeHeight={this.handleChangeHeight}
                onChangeRotation={this.handleChangeRotation}
                onChangeWidth={this.handleChangeWidth}
                onChangeX={this.handleChangeX}
                onChangeY={this.handleChangeY}
                onDistribute={this.handleDistribute}
                onRotateClockwise={this.handleRotateClockwise}
                onRotateCounterClockwise={this.handleRotateCounterClockwise}
                onToggleLockAspect={this.handleToggleLockAspect}
                onTogglePanel={this.props.onTogglePanel}
            />
        );
    }
}

BwPropertiesPanel.propTypes = {
    cornerRadius: PropTypes.number.isRequired,
    intl: intlShape,
    mode: PropTypes.oneOf(Object.keys(Modes)).isRequired,
    onChangeCornerRadius: PropTypes.func.isRequired,
    onTogglePanel: PropTypes.func.isRequired,
    onUpdateImage: PropTypes.func.isRequired,
    // Not read directly — it is what makes this component re-render when the geometry changes.
    // eslint-disable-next-line react/no-unused-prop-types
    selectedItems: PropTypes.arrayOf(PropTypes.instanceOf(paper.Item)),
    visible: PropTypes.bool.isRequired
};

const mapStateToProps = state => ({
    cornerRadius: state.scratchPaint.bwShape.cornerRadius,
    mode: state.scratchPaint.mode,
    selectedItems: state.scratchPaint.selectedItems,
    visible: state.scratchPaint.bwPanel.visible
});
const mapDispatchToProps = dispatch => ({
    onChangeCornerRadius: cornerRadius => {
        dispatch(changeCornerRadius(cornerRadius));
    },
    onTogglePanel: () => {
        dispatch(togglePanel());
    }
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(BwPropertiesPanel));
