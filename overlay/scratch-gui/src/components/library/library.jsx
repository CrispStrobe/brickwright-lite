import React from 'react';
import PropTypes from 'prop-types';
import {injectIntl, intlShape} from 'react-intl';
import Modal from '../../containers/modal.jsx';
import Spinner from '../spinner/spinner.jsx';
import {requestLibraryComponent} from '../../lib/library-component-loader.js';

// Callers mount this only for an open library. Keep the original implementation
// and its props/defaults unchanged, but request it only after that real demand.
const DeferredLibrary = props => {
    const [Component, setComponent] = React.useState(null);
    const [error, setError] = React.useState(null);
    const [attempt, setAttempt] = React.useState(0);
    React.useEffect(() => {
        setError(null);
        return requestLibraryComponent(
            () => import(/* webpackChunkName: "bw-library" */ './library-content.jsx'),
            loaded => setComponent(() => loaded),
            setError
        );
    }, [attempt]);
    if (Component) return <Component {...props} />;
    const de = /^de(?:-|$)/i.test(props.intl.locale);
    return (
        <Modal fullScreen contentLabel={props.title} id={props.id} onRequestClose={props.onRequestClose}>
            <div style={{padding: 24}} data-testid="bw-library-loading" aria-busy={!error}>
                {error ? (
                    <div role="alert">
                        <p>{de ? 'Die Bibliothek konnte nicht geöffnet werden.' : 'The library could not be opened.'}</p>
                        <button type="button" onClick={() => setAttempt(value => value + 1)}
                            style={{minHeight: 44, padding: '8px 16px'}}>
                            {de ? 'Erneut versuchen' : 'Try again'}
                        </button>
                    </div>
                ) : <div role="status"><Spinner />{de ? 'Bibliothek wird geladen…' : 'Loading library…'}</div>}
            </div>
        </Modal>
    );
};

DeferredLibrary.propTypes = {
    id: PropTypes.string.isRequired,
    intl: intlShape.isRequired,
    onRequestClose: PropTypes.func.isRequired,
    title: PropTypes.string.isRequired
};

export default injectIntl(DeferredLibrary);
