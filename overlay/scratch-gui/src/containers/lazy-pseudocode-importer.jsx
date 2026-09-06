import PropTypes from 'prop-types';
import React from 'react';

let importerRequest = null;
const loadPseudocodeImporter = () => {
    if (!importerRequest) {
        importerRequest = import(
            /* webpackChunkName: "pseudocode-importer" */ '../components/tw-pseudocode/pseudocode-importer.jsx'
        ).catch(error => {
            importerRequest = null;
            throw error;
        });
    }
    return importerRequest;
};

// Intent prewarming uses the same cached request as selection. Swallow the
// speculative rejection here: the rendered error boundary owns the visible
// failure and retry once the tab is actually selected.
export const preloadPseudocodeImporter = () => loadPseudocodeImporter().catch(() => null);
const createLazyImporter = () => React.lazy(loadPseudocodeImporter);

class LazyPseudocodeImporter extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            activated: props.isVisible,
            error: null,
            generation: 0,
            importerReady: false,
            pendingBundleDetail: null
        };
        this.Importer = createLazyImporter();
    }
    static getDerivedStateFromError (error) {
        return {error};
    }
    componentDidMount () {
        window.addEventListener('bw-project-bundle-loaded', this.handleBundleLoaded);
        this.bindRuntime(this.props.vm);
    }
    componentDidUpdate (previousProps) {
        if (this.props.isVisible && !this.state.activated) this.setState({activated: true});
        if (previousProps.vm !== this.props.vm) {
            this.unbindRuntime(previousProps.vm);
            this.bindRuntime(this.props.vm);
        }
    }
    componentWillUnmount () {
        window.removeEventListener('bw-project-bundle-loaded', this.handleBundleLoaded);
        this.unbindRuntime(this.props.vm);
    }
    bindRuntime (vm) {
        if (vm?.runtime?.on) vm.runtime.on('PROJECT_CHANGED', this.handleProjectChanged);
    }
    unbindRuntime (vm) {
        if (vm?.runtime?.removeListener) vm.runtime.removeListener('PROJECT_CHANGED', this.handleProjectChanged);
    }
    handleProjectChanged = () => {
        // Ordinary Scratch startup emits PROJECT_CHANGED. Only a source parked
        // by the Circuit example handoff needs the Code component while hidden.
        if (!this.state.activated && this.props.vm?.runtime?.bwPseudocodeSource) {
            this.setState({activated: true});
        }
    };
    handleBundleLoaded = event => {
        if (!this.state.importerReady) {
            this.setState({activated: true, pendingBundleDetail: event?.detail || {}});
        }
    };
    handlePendingBundleHandled = () => this.setState({pendingBundleDetail: null});
    handleImporterReady = () => this.setState({importerReady: true});
    handleRetry = () => {
        this.Importer = createLazyImporter();
        this.setState(state => ({error: null, generation: state.generation + 1, importerReady: false}));
    };
    render () {
        if (!this.state.activated) return null;
        if (this.state.error) {
            return (
                <div data-pseudocode-importer-load-error role="alert" style={{padding: 16}}>
                    <p>{String(this.state.error.message || this.state.error)}</p>
                    <button type="button" onClick={this.handleRetry}>Retry code editor</button>
                </div>
            );
        }
        const Importer = this.Importer;
        return (
            <React.Suspense fallback={
                <div data-pseudocode-importer-loading aria-busy="true" style={{padding: 16}}>
                    Loading code editor…
                </div>
            }>
                <Importer
                    key={this.state.generation}
                    isVisible={this.props.isVisible}
                    pendingBundleDetail={this.state.pendingBundleDetail}
                    onPendingBundleHandled={this.handlePendingBundleHandled}
                    onReady={this.handleImporterReady}
                />
            </React.Suspense>
        );
    }
}

LazyPseudocodeImporter.propTypes = {
    isVisible: PropTypes.bool,
    vm: PropTypes.shape({runtime: PropTypes.shape({
        on: PropTypes.func,
        removeListener: PropTypes.func,
        bwPseudocodeSource: PropTypes.string
    })}).isRequired
};

LazyPseudocodeImporter.defaultProps = {
    isVisible: false
};

export default LazyPseudocodeImporter;
