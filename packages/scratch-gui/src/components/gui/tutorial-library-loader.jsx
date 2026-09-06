import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import {connect} from 'react-redux';

import Modal from '../../containers/modal.jsx';
import {closeCards, setCardsContent} from '../../reducers/cards';
import {closeTipsLibrary} from '../../reducers/modals';

import styles from './tutorial-library-loader.css';

let tutorialLibraryRequest = null;
const loadTutorialLibrary = () => {
    if (!tutorialLibraryRequest) {
        tutorialLibraryRequest = import(
            /* webpackChunkName: "tutorial-library" */
            './tutorial-library-runtime.jsx'
        ).catch(error => {
            tutorialLibraryRequest = null;
            throw error;
        });
    }
    return tutorialLibraryRequest;
};

class TutorialLibraryLoader extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleCancel', 'load']);
        this.state = {Runtime: null, loadError: null};
        this.mounted = false;
        this.loadGeneration = 0;
    }
    componentDidMount () {
        this.mounted = true;
        this.load();
    }
    componentWillUnmount () {
        this.mounted = false;
        this.loadGeneration++;
    }
    load () {
        if (!this.mounted) return;
        const generation = ++this.loadGeneration;
        if (this.state.loadError) this.setState({loadError: null});
        loadTutorialLibrary().then(module => {
            if (!this.mounted || generation !== this.loadGeneration) return;
            this.props.onHydrateContent(module.decks);
            if (!this.mounted || generation !== this.loadGeneration) return;
            this.setState({
                Runtime: this.props.mode === 'tips' ? module.TipsLibrary : module.Cards,
                loadError: null
            });
        }).catch(error => {
            if (this.mounted && generation === this.loadGeneration) this.setState({loadError: error});
        });
    }
    handleCancel () {
        // Invalidate this instance before dispatching close. The shared request
        // may still finish and warm the cache, but cannot revive closed UI.
        this.loadGeneration++;
        this.props.onCancel();
    }
    renderStatus () {
        const failed = Boolean(this.state.loadError);
        const status = (
            <div
                className={styles.status}
                data-testid={failed ? 'tutorial-library-error' : 'tutorial-library-loading'}
            >
                {failed ? (
                    <FormattedMessage
                        defaultMessage="The tutorials could not be loaded."
                        description="Error shown when the tutorial library code could not be loaded"
                        id="gui.tutorialLibrary.loadError"
                    />
                ) : (
                    <FormattedMessage
                        defaultMessage="Loading tutorials…"
                        description="Status shown while the tutorial library code loads"
                        id="gui.tutorialLibrary.loading"
                    />
                )}
                <div className={styles.actions}>
                    {failed ? (
                        <button
                            className={styles.action}
                            data-testid="tutorial-library-retry"
                            type="button"
                            onClick={this.load}
                        >
                            <FormattedMessage
                                defaultMessage="Retry"
                                description="Button to retry loading the tutorial library"
                                id="gui.tutorialLibrary.retry"
                            />
                        </button>
                    ) : null}
                    <button
                        className={styles.action}
                        data-testid="tutorial-library-cancel"
                        type="button"
                        onClick={this.handleCancel}
                    >
                        <FormattedMessage
                            defaultMessage="Cancel"
                            description="Button to close the tutorial library while it loads"
                            id="gui.tutorialLibrary.cancel"
                        />
                    </button>
                </div>
            </div>
        );

        if (this.props.mode === 'tips') {
            return (
                <Modal
                    fullScreen
                    contentLabel={(
                        <FormattedMessage
                            defaultMessage="Tutorials"
                            description="Title for the tutorial library while it loads"
                            id="gui.tutorialLibrary.title"
                        />
                    )}
                    id="tipsLibrary"
                    onRequestClose={this.handleCancel}
                >
                    {status}
                </Modal>
            );
        }

        return (
            <div className={styles.cardOverlay}>
                <div className={styles.cardShell}>{status}</div>
            </div>
        );
    }
    render () {
        const Runtime = this.state.Runtime;
        return Runtime ? <Runtime /> : this.renderStatus();
    }
}

TutorialLibraryLoader.propTypes = {
    mode: PropTypes.oneOf(['cards', 'tips']).isRequired,
    onCancel: PropTypes.func.isRequired,
    onHydrateContent: PropTypes.func.isRequired
};

const mapDispatchToProps = (dispatch, ownProps) => ({
    onCancel: () => dispatch(ownProps.mode === 'tips' ? closeTipsLibrary() : closeCards()),
    onHydrateContent: content => dispatch(setCardsContent(content))
});

export {
    TutorialLibraryLoader,
    loadTutorialLibrary
};

export default connect(
    null,
    mapDispatchToProps
)(TutorialLibraryLoader);
