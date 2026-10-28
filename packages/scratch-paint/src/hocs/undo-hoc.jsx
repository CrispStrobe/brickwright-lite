import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import omit from 'lodash.omit';
import {connect} from 'react-redux';

import {getSelectedLeafItems} from '../helper/selection';
import {setSelectedItems} from '../reducers/selected-items';
import {
    performUndo, performRedo, shouldShowUndo, shouldShowRedo
} from '../helper/undo';
import {undo, redo} from '../reducers/undo';

import Formats, {isBitmap} from '../lib/format';

// Brickwright: the GUI's menu-bar Undo / Redo / History (scratch-gui
// lib/global-undo.js) publishes itself on globalThis because scratch-paint is
// a separate package. Without the GUI the editor works as before.
const globalUndo = () => (typeof globalThis !== 'undefined' && globalThis.__bwGlobalUndo) || null;

const UndoHOC = function (WrappedComponent) {
    class UndoWrapper extends React.Component {
        constructor (props) {
            super(props);
            bindAll(this, [
                'handleUndo',
                'handleRedo',
                'handleSetSelectedItems',
                'shouldShowUndo',
                'shouldShowRedo'
            ]);
        }
        componentDidMount () {
            const bridge = globalUndo();
            if (!bridge) return;
            const depth = () => {
                const {stack, pointer} = this.props.undoState;
                return {undo: Math.max(0, pointer), redo: Math.max(0, stack.length - 1 - pointer)};
            };
            // History list names, parallel to the snapshot stack. A snapshot does
            // not say what changed, so a step names the tool active when it was taken.
            this._names = [];
            this._unregisterUndo = bridge.registerUndoSurface('costumes', {
                label: 'Costumes',
                canUndo: () => depth().undo > 0,
                canRedo: () => depth().redo > 0,
                depth,
                steps: () => {
                    const {pointer} = this.props.undoState;
                    return {past: this._names.slice(0, Math.max(0, pointer)),
                        future: this._names.slice(Math.max(0, pointer)).filter(Boolean)};
                },
                undo: () => {
                    this.handleUndo();
                    return true;
                },
                redo: () => {
                    this.handleRedo();
                    return true;
                }
            });
            bridge.activateUndoSurface('costumes');
        }
        componentDidUpdate (prevProps) {
            const bridge = globalUndo();
            const before = prevProps.undoState, after = this.props.undoState;
            if (before === after) return;
            // _names[i] names the step that leads from snapshot i to snapshot i + 1.
            if (this._names) {
                const isNew = after.pointer === before.pointer + 1 && after.stack.length === after.pointer + 1 &&
                    after.stack[after.pointer] !== before.stack[after.pointer];
                if (after.pointer <= 0 && after.stack.length <= 1) {
                    this._names = [];
                } else if (isNew) {
                    const tool = String(this.props.mode || '').replace(/^BIT_/, '')
                        .toLowerCase()
                        .replace(/_/g, ' ');
                    this._names = this._names.slice(0, after.pointer - 1);
                    this._names.push(tool ? `Edit (${tool.charAt(0).toUpperCase()}${tool.slice(1)})` : 'Edit');
                }
                if (after.stack.length - 1 < this._names.length) this._names.length = Math.max(0, after.stack.length - 1);
            }
            if (bridge) bridge.notifyUndoState();
        }
        componentWillUnmount () {
            if (this._unregisterUndo) this._unregisterUndo();
        }
        handleUndo () {
            performUndo(this.props.undoState, this.props.onUndo, this.handleSetSelectedItems, this.props.onUpdateImage);
        }
        handleRedo () {
            performRedo(this.props.undoState, this.props.onRedo, this.handleSetSelectedItems, this.props.onUpdateImage);
        }
        handleSetSelectedItems () {
            this.props.setSelectedItems(this.props.format);
        }
        shouldShowUndo () {
            return shouldShowUndo(this.props.undoState);
        }
        shouldShowRedo () {
            return shouldShowRedo(this.props.undoState);
        }
        render () {
            const componentProps = omit(this.props, [
                'format',
                'mode',
                'onUndo',
                'onRedo',
                'setSelectedItems',
                'undoState']);
            return (
                <WrappedComponent
                    shouldShowRedo={this.shouldShowRedo}
                    shouldShowUndo={this.shouldShowUndo}
                    onRedo={this.handleRedo}
                    onUndo={this.handleUndo}
                    {...componentProps}
                />
            );
        }
    }

    UndoWrapper.propTypes = {
        format: PropTypes.oneOf(Object.keys(Formats)),
        onRedo: PropTypes.func.isRequired,
        onUndo: PropTypes.func.isRequired,
        onUpdateImage: PropTypes.func.isRequired,
        setSelectedItems: PropTypes.func.isRequired,
        undoState: PropTypes.shape({
            stack: PropTypes.arrayOf(PropTypes.object).isRequired,
            pointer: PropTypes.number.isRequired
        })
    };

    const mapStateToProps = state => ({
        mode: state.scratchPaint.mode,
        format: state.scratchPaint.format,
        undoState: state.scratchPaint.undo
    });
    const mapDispatchToProps = dispatch => ({
        setSelectedItems: format => {
            dispatch(setSelectedItems(getSelectedLeafItems(), isBitmap(format)));
        },
        onUndo: format => {
            dispatch(undo(format));
        },
        onRedo: format => {
            dispatch(redo(format));
        }
    });

    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(UndoWrapper);
};

export default UndoHOC;
