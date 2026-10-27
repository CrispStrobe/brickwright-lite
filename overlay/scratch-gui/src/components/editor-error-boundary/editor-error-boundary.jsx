import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';

// Keeps one failing editor (a tab, a popover) from replacing the whole app with
// the crash screen. The fallback names the failure and offers Try again, which
// remounts the subtree; the project and every other editor keep running.
// Kept small on purpose: gui.jsx imports it eagerly (startup budget, P17).
class EditorErrorBoundary extends React.Component {
    constructor (props) {
        super(props);
        this.state = {error: null};
        this.handleRetry = () => this.setState({error: null});
    }
    static getDerivedStateFromError (error) {
        return {error: error || new Error('Unknown error')};
    }
    componentDidCatch (error, info) {
        // eslint-disable-next-line no-console
        console.error(`[brickwright] ${this.props.name} failed`, error, info && info.componentStack);
        try {
            window.dispatchEvent(new CustomEvent('bw-editor-error', {detail: {
                name: this.props.name, message: String(error && error.message || error)}}));
        } catch (e) { /* reporting must not fail the fallback */ }
    }
    render () {
        const {error} = this.state;
        if (!error) return this.props.children;
        return (
            <div
                data-testid="bw-editor-error"
                role="alert"
                style={{padding: 16, margin: 8, border: '1px solid #fca5a5', borderRadius: 8,
                    background: '#fef2f2', color: '#7f1d1d', fontSize: 13, overflow: 'auto'}}
            >
                <strong>
                    <FormattedMessage
                        defaultMessage="{name} hit a problem and was stopped. Your project is safe."
                        id="gui.bw.editorError"
                        values={{name: this.props.name}}
                    />
                </strong>
                <pre style={{whiteSpace: 'pre-wrap', margin: '8px 0', fontSize: 12}}>
                    {String(error.message || error).slice(0, 500)}
                </pre>
                <button
                    data-testid="bw-editor-error-retry"
                    style={{minHeight: 36, padding: '6px 12px'}}
                    type="button"
                    onClick={this.handleRetry}
                >
                    <FormattedMessage
                        defaultMessage="Try again"
                        id="gui.bw.editorErrorRetry"
                    />
                </button>
            </div>
        );
    }
}

EditorErrorBoundary.propTypes = {
    children: PropTypes.node,
    name: PropTypes.string.isRequired
};

export default EditorErrorBoundary;
