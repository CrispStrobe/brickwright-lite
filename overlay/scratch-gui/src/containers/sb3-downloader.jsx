import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {projectTitleInitialState} from '../reducers/project-title';
import {showStandardAlertWithMessage} from '../reducers/alerts';
import downloadBlob from '../lib/download-blob';
import {attachBrickwrightState} from '../lib/bw-project-bundle';
/**
 * Project saver component passes a downloadProject function to its child.
 * It expects this child to be a function with the signature
 *     function (downloadProject, props) {}
 * The component can then be used to attach project saving functionality
 * to any other component:
 *
 * <SB3Downloader>{(downloadProject, props) => (
 *     <MyCoolComponent
 *         onClick={downloadProject}
 *         {...props}
 *     />
 * )}</SB3Downloader>
 */
class SB3Downloader extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'downloadProject'
        ]);
    }
    downloadProject () {
        // EVERY step here can fail, and until 2026-08-24 none of them reported it.
        // saveProjectSb3() rejecting, or downloadBlob() throwing, produced an
        // unhandled promise rejection: no dialog, no console entry the user would
        // find, nothing saved. On iOS that is exactly what "the app just crashes
        // and nothing is saved" looked like from the outside, and it made every
        // possible cause — serializer, memory, the blob download path — present
        // identically, which is why the report could not be acted on.
        //
        // The message is shown IN THE GUI rather than logged, because the person
        // who needs it is holding the device.
        this.props.saveProjectSb3()
            // Fold the Circuit / Code / Widgets tabs into the same .sb3 before it
            // leaves. Extra zip entries are inert to every existing reader, so
            // one format serves both directions — see lib/bw-project-bundle.js.
            // It returns the original blob if anything goes wrong: saving the
            // Scratch half beats saving nothing.
            .then(content => attachBrickwrightState(content))
            .then(content => {
                if (this.props.onSaveFinished) {
                    this.props.onSaveFinished();
                }
                // downloadBlob is not async on the browser path but CAN throw
                // synchronously (blob URL creation, the anchor click), so it is
                // inside the chain rather than after it.
                return downloadBlob(this.props.projectFilename, content);
            })
            .catch(err => {
                const detail = (err && (err.message || err.name)) || String(err);
                // eslint-disable-next-line no-console
                console.error('[brickwright] project export failed', err);
                if (this.props.onExportError) {
                    this.props.onExportError(detail);
                }
            });
    }
    render () {
        const {
            children
        } = this.props;
        return children(
            this.props.className,
            this.downloadProject
        );
    }
}

const getProjectFilename = (curTitle, defaultTitle) => {
    let filenameTitle = curTitle;
    if (!filenameTitle || filenameTitle.length === 0) {
        filenameTitle = defaultTitle;
    }
    return `${filenameTitle.substring(0, 100)}.sb3`;
};

SB3Downloader.propTypes = {
    children: PropTypes.func,
    className: PropTypes.string,
    onExportError: PropTypes.func,
    onSaveFinished: PropTypes.func,
    projectFilename: PropTypes.string,
    saveProjectSb3: PropTypes.func
};
SB3Downloader.defaultProps = {
    className: ''
};

const mapStateToProps = state => ({
    saveProjectSb3: state.scratchGui.vm.saveProjectSb3.bind(state.scratchGui.vm),
    projectFilename: getProjectFilename(state.scratchGui.projectTitle, projectTitleInitialState)
});

// The dispatch prop was previously omitted entirely. It is needed now so an
// export failure can reach the GUI rather than only the console.
const mapDispatchToProps = dispatch => ({
    onExportError: detail => dispatch(showStandardAlertWithMessage('exportError', detail))
});

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(SB3Downloader);
