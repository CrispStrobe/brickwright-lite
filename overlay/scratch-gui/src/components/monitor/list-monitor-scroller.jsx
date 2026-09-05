import React from 'react';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import {FormattedMessage} from 'react-intl';

let bodyRequest = null;
const loadBody = () => {
    if (!bodyRequest) {
        bodyRequest = import(
            /* webpackChunkName: "list-monitor-body" */
            './list-monitor-scroller-body.jsx'
        ).catch(error => {
            bodyRequest = null;
            throw error;
        });
    }
    return bodyRequest;
};

class ListMonitorScroller extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['checkVisibility', 'handleIntersection', 'load', 'setHost']);
        this.state = {Body: null, loadError: null};
        this.mounted = false;
        this.loadGeneration = 0;
    }
    componentDidMount () {
        this.mounted = true;
        if (typeof window.IntersectionObserver === 'function') {
            this.visibilityObserver = new window.IntersectionObserver(this.handleIntersection);
            this.visibilityObserver.observe(this.host);
        } else {
            window.addEventListener('resize', this.checkVisibility);
            if (typeof window.MutationObserver === 'function') {
                this.visibilityMutations = new window.MutationObserver(this.checkVisibility);
                this.visibilityMutations.observe(document.body, {attributes: true, subtree: true});
            }
            this.checkVisibility();
        }
    }
    componentWillUnmount () {
        this.mounted = false;
        this.loadGeneration++;
        this.stopWatching();
    }
    setHost (host) {
        this.host = host;
    }
    stopWatching () {
        if (this.visibilityObserver) this.visibilityObserver.disconnect();
        if (this.visibilityMutations) this.visibilityMutations.disconnect();
        window.removeEventListener('resize', this.checkVisibility);
    }
    checkVisibility () {
        if (!this.mounted || !this.host || !this.host.getClientRects().length) return;
        const rect = this.host.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        this.stopWatching();
        this.load();
    }
    handleIntersection (entries) {
        if (!this.mounted || !entries.some(entry => entry.isIntersecting &&
            entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0)) return;
        this.stopWatching();
        this.load();
    }
    load () {
        if (!this.mounted) return;
        const generation = ++this.loadGeneration;
        if (this.state.loadError) this.setState({loadError: null});
        loadBody().then(module => {
            if (!this.mounted || generation !== this.loadGeneration) return;
            this.setState({Body: module.default, loadError: null});
        }).catch(error => {
            if (this.mounted && generation === this.loadGeneration) this.setState({loadError: error});
        });
    }
    render () {
        const {height, width} = this.props;
        const size = {height: Math.max(0, height - 44), width};
        const Body = this.state.Body;
        return (
            <div data-testid="list-monitor-body-host" ref={this.setHost} style={size}>
                {Body ? <Body {...this.props} /> : this.state.loadError ? (
                    <button
                        className="no-drag"
                        data-testid="list-monitor-body-retry"
                        type="button"
                        onClick={this.load}
                    >
                        <FormattedMessage
                            defaultMessage="Retry list"
                            description="Button to retry loading a list monitor"
                            id="gui.monitor.listMonitor.retry"
                        />
                    </button>
                ) : (
                    <div data-testid="list-monitor-body-loading" style={size} />
                )}
            </div>
        );
    }
}

ListMonitorScroller.propTypes = {
    height: PropTypes.number,
    width: PropTypes.number
};

export default ListMonitorScroller;
