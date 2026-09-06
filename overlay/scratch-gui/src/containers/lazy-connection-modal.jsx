import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import Modal from './modal.jsx';
import {closeConnectionModal} from '../reducers/modals';

let connectionModalRequest = null;
const loadConnectionModal = () => {
    if (!connectionModalRequest) {
        connectionModalRequest = import(/* webpackChunkName: "connection-modal" */ './connection-modal.jsx')
            .catch(error => {
                connectionModalRequest = null;
                throw error;
            });
    }
    return connectionModalRequest;
};
const createLazyConnectionModal = () => React.lazy(loadConnectionModal);

const LoadingModal = ({error, onCancel, onRetry}) => (
    <Modal
        contentLabel={error ? 'Connection tools could not be loaded' : 'Loading connection tools'}
        id="connectionModal"
        onRequestClose={onCancel}
    >
        <div
            aria-busy={error ? null : 'true'}
            data-connection-modal-load-error={error ? true : null}
            data-connection-modal-loading={error ? null : true}
        >
            {error ? (
                <React.Fragment>
                    <p>{String(error.message || error)}</p>
                    <button type="button" onClick={onRetry}>Retry connection tools</button>
                </React.Fragment>
            ) : 'Loading connection tools…'}
        </div>
    </Modal>
);

LoadingModal.propTypes = {
    error: PropTypes.shape({message: PropTypes.string}),
    onCancel: PropTypes.func.isRequired,
    onRetry: PropTypes.func
};

LoadingModal.defaultProps = {
    error: null,
    onRetry: null
};

class LazyConnectionModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {error: null, generation: 0};
        this.ConnectionModal = createLazyConnectionModal();
    }
    static getDerivedStateFromError (error) {
        return {error};
    }
    handleRetry = () => {
        this.ConnectionModal = createLazyConnectionModal();
        this.setState(state => ({error: null, generation: state.generation + 1}));
    };
    render () {
        if (this.state.error) {
            return (
                <LoadingModal
                    error={this.state.error}
                    onCancel={this.props.onCancel}
                    onRetry={this.handleRetry}
                />
            );
        }
        const ConnectionModal = this.ConnectionModal;
        return (
            <React.Suspense fallback={<LoadingModal onCancel={this.props.onCancel} />}>
                <ConnectionModal key={this.state.generation} vm={this.props.vm} />
            </React.Suspense>
        );
    }
}

LazyConnectionModal.propTypes = {
    onCancel: PropTypes.func.isRequired,
    vm: PropTypes.shape({}).isRequired
};

const mapDispatchToProps = dispatch => ({
    onCancel: () => dispatch(closeConnectionModal())
});

export default connect(null, mapDispatchToProps)(LazyConnectionModal);
