import paper from '@scratch/paper';
import PropTypes from 'prop-types';
import React from 'react';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import {injectIntl, intlShape} from 'react-intl';

import {clearSelectedItems, setSelectedItems} from '../reducers/selected-items';
import {getSelectedLeafItems} from '../helper/selection';
import {
    listObjects,
    renameObject,
    reorderObject,
    selectObject,
    setObjectHidden,
    setObjectLocked
} from '../helper/bw/objects';

import BwObjectsPanelComponent from '../components/bw-objects-panel/bw-objects-panel.jsx';

/**
 * Brickwright: the objects tree.
 *
 * Like the transform panel, the list is read out of paper on every render rather than mirrored
 * into redux — paper owns the z-order, and a mirror would drift. `selectedItems` is the re-render
 * trigger, and update-image-hoc dispatches redrawSelectionBox after every committed edit, so
 * drawing a new shape or deleting one refreshes the list too.
 */
class BwObjectsPanel extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleDragEnd',
            'handleDragOver',
            'handleDragStart',
            'handleDrop',
            'handleRename',
            'handleSelect',
            'handleToggleHidden',
            'handleToggleLocked'
        ]);
        this.state = {
            dragIndex: null,
            dragTargetIndex: null,
            editingId: null
        };
    }
    handleSelect (object, additive) {
        selectObject(object.item, additive, this.props.clearSelectedItems);
        this.props.setSelectedItems();
    }
    handleToggleLocked (object) {
        setObjectLocked(object.item, !object.locked);
        this.props.setSelectedItems();
    }
    handleToggleHidden (object) {
        setObjectHidden(object.item, !object.hidden);
        // Visibility is an editing aid that never reaches the costume, so this deliberately does
        // NOT call onUpdateImage — there is nothing to re-export, and doing so would push an
        // identical costume and a pointless undo step.
        this.props.setSelectedItems();
    }
    handleRename (object, name) {
        renameObject(object.item, name);
        this.setState({editingId: null});
        this.props.setSelectedItems();
    }
    handleDragStart (index) {
        this.setState({dragIndex: index});
    }
    handleDragOver (event, index) {
        // Without this the browser refuses the drop.
        event.preventDefault();
        if (this.state.dragTargetIndex !== index) {
            this.setState({dragTargetIndex: index});
        }
    }
    handleDragEnd () {
        this.setState({dragIndex: null, dragTargetIndex: null});
    }
    handleDrop (index) {
        const {dragIndex} = this.state;
        this.setState({dragIndex: null, dragTargetIndex: null});
        if (dragIndex === null || dragIndex === index) return;
        const objects = listObjects();
        const moved = objects[dragIndex];
        if (!moved) return;
        if (reorderObject(moved.item, index)) {
            this.props.onUpdateImage();
        }
    }
    render () {
        return (
            <BwObjectsPanelComponent
                dragTargetIndex={this.state.dragTargetIndex}
                editingId={this.state.editingId}
                locale={this.props.intl.locale}
                objects={listObjects()}
                onCancelRename={() => this.setState({editingId: null})}
                onDragEnd={this.handleDragEnd}
                onDragOver={this.handleDragOver}
                onDragStart={this.handleDragStart}
                onDrop={this.handleDrop}
                onRename={this.handleRename}
                onSelect={this.handleSelect}
                onStartRename={editingId => this.setState({editingId})}
                onToggleHidden={this.handleToggleHidden}
                onToggleLocked={this.handleToggleLocked}
            />
        );
    }
}

BwObjectsPanel.propTypes = {
    clearSelectedItems: PropTypes.func.isRequired,
    intl: intlShape,
    onUpdateImage: PropTypes.func.isRequired,
    // Not read for its contents — it is what makes the list re-render when the artwork changes.
    // eslint-disable-next-line react/no-unused-prop-types
    selectedItems: PropTypes.arrayOf(PropTypes.instanceOf(paper.Item)),
    setSelectedItems: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    selectedItems: state.scratchPaint.selectedItems
});
const mapDispatchToProps = dispatch => ({
    clearSelectedItems: () => {
        dispatch(clearSelectedItems());
    },
    setSelectedItems: () => {
        dispatch(setSelectedItems(getSelectedLeafItems(), false /* bitmapMode */));
    }
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(BwObjectsPanel));
