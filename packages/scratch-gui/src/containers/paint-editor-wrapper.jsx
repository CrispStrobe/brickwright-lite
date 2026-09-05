import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import bindAll from 'lodash.bindall';
import VM from 'scratch-vm';
import {inlineSvgFonts} from 'scratch-svg-renderer';

import {connect} from 'react-redux';
import DynamicReducerContext from '../lib/dynamic-reducer-context';

// Split the Paper-backed reducer from the React editor so fetching, parsing and
// installing both cannot become one activation task. Requests are shared, while
// reducer installation remains store-local. A rejected stage resets only its
// own promise, allowing the retry control to resume at the failed boundary.
let paintReducerRequest = null;
const loadPaintReducer = () => {
    if (!paintReducerRequest) {
        paintReducerRequest = import(
            /* webpackChunkName: "paint-reducer" */
            'scratch-paint/src/reducers/scratch-paint-reducer'
        ).catch(error => {
            paintReducerRequest = null;
            throw error;
        });
    }
    return paintReducerRequest;
};

let paintEditorRequest = null;
const loadPaintEditor = () => {
    if (!paintEditorRequest) {
        paintEditorRequest = import(/* webpackChunkName: "paint-editor" */ 'scratch-paint')
            .catch(error => {
                paintEditorRequest = null;
                throw error;
            });
    }
    return paintEditorRequest;
};

// A timer queues a fresh task without charging the already-tight activation
// budget for a whole animation frame.
const yieldTask = () => new Promise(resolve => setTimeout(resolve, 0));

class PaintEditorWrapper extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleUpdateImage',
            'handleUpdateName',
            'loadEditor'
        ]);
        this.state = {PaintEditor: null, loadError: null};
        this.mounted = false;
        this.loadGeneration = 0;
    }
    componentDidMount () {
        this.mounted = true;
        this.loadEditor();
    }
    componentWillUnmount () {
        this.mounted = false;
        this.loadGeneration++;
    }
    loadEditor () {
        const generation = ++this.loadGeneration;
        if (this.state.loadError) this.setState({loadError: null});
        loadPaintReducer().then(module => {
            if (!this.mounted || generation !== this.loadGeneration) return;
            if (!this.props.installReducer) {
                throw new Error('The paint editor requires a dynamic reducer installer');
            }
            this.props.installReducer('scratchPaint', module.default);
            return yieldTask();
        }).then(() => {
            if (!this.mounted || generation !== this.loadGeneration) return null;
            return loadPaintEditor();
        }).then(module => {
            if (!module || !this.mounted || generation !== this.loadGeneration) return;
            return yieldTask().then(() => module);
        }).then(module => {
            if (!module || !this.mounted || generation !== this.loadGeneration) return;
            if (this.mounted && generation === this.loadGeneration) {
                this.setState({PaintEditor: module.default, loadError: null});
            }
        }).catch(error => {
            if (this.mounted && generation === this.loadGeneration) this.setState({loadError: error});
        });
    }
    shouldComponentUpdate (nextProps, nextState) {
        return this.props.imageId !== nextProps.imageId ||
            this.props.rtl !== nextProps.rtl ||
            this.props.name !== nextProps.name ||
            this.state.PaintEditor !== nextState.PaintEditor ||
            this.state.loadError !== nextState.loadError;
    }
    handleUpdateName (name) {
        this.props.vm.renameCostume(this.props.selectedCostumeIndex, name);
    }
    handleUpdateImage (isVector, image, rotationCenterX, rotationCenterY) {
        if (isVector) {
            this.props.vm.updateSvg(
                this.props.selectedCostumeIndex,
                image,
                rotationCenterX,
                rotationCenterY);
        } else {
            this.props.vm.updateBitmap(
                this.props.selectedCostumeIndex,
                image,
                rotationCenterX,
                rotationCenterY,
                2 /* bitmapResolution */);
        }
    }
    render () {
        if (!this.props.imageId) return null;
        if (this.state.loadError) {
            return (
                <button type="button" onClick={this.loadEditor}>
                    <FormattedMessage
                        defaultMessage="Retry costume editor"
                        description="Button to retry loading the costume paint editor"
                        id="gui.costumeTab.retryPaintEditor"
                    />
                </button>
            );
        }
        const PaintEditor = this.state.PaintEditor;
        if (!PaintEditor) return null;
        const {
            selectedCostumeIndex,
            installReducer, // eslint-disable-line no-unused-vars
            vm,
            ...componentProps
        } = this.props;

        return (
            <PaintEditor
                {...componentProps}
                image={vm.getCostume(selectedCostumeIndex)}
                onUpdateImage={this.handleUpdateImage}
                onUpdateName={this.handleUpdateName}
                fontInlineFn={inlineSvgFonts}
            />
        );
    }
}

PaintEditorWrapper.propTypes = {
    imageFormat: PropTypes.string.isRequired,
    imageId: PropTypes.string.isRequired,
    installReducer: PropTypes.func,
    name: PropTypes.string,
    rotationCenterX: PropTypes.number,
    rotationCenterY: PropTypes.number,
    rtl: PropTypes.bool,
    selectedCostumeIndex: PropTypes.number.isRequired,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = (state, {selectedCostumeIndex}) => {
    const targetId = state.scratchGui.vm.editingTarget.id;
    const sprite = state.scratchGui.vm.editingTarget.sprite;
    // Make sure the costume index doesn't go out of range.
    const index = selectedCostumeIndex < sprite.costumes.length ?
        selectedCostumeIndex : sprite.costumes.length - 1;
    const costume = state.scratchGui.vm.editingTarget.sprite.costumes[index];
    return {
        name: costume && costume.name,
        rotationCenterX: costume && costume.rotationCenterX,
        rotationCenterY: costume && costume.rotationCenterY,
        imageFormat: costume && costume.dataFormat,
        imageId: targetId && `${targetId}${costume.skinId}`,
        rtl: state.locales.isRtl,
        selectedCostumeIndex: index,
        vm: state.scratchGui.vm,
        zoomLevelId: targetId
    };
};

const PaintEditorWithReducer = props => (
    <DynamicReducerContext.Consumer>
        {installReducer => <PaintEditorWrapper {...props} installReducer={installReducer} />}
    </DynamicReducerContext.Consumer>
);
PaintEditorWithReducer.propTypes = PaintEditorWrapper.propTypes;

export default connect(
    mapStateToProps
)(PaintEditorWithReducer);
