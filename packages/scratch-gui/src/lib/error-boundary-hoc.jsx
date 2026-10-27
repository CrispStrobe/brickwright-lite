import React from 'react';
import EditorErrorBoundary from '../components/editor-error-boundary/editor-error-boundary.jsx';

// Brickwright: an editor tab (Blocks, Costumes, Sounds) that throws shows a
// recoverable notice in its own place instead of the full-screen crash page,
// which replaced the whole app and lost unsaved work. The app-level
// ErrorBoundary (containers/error-boundary.jsx) still guards the shell.
const EDITOR_NAMES = {
    'Blocks': 'Blocks',
    'Costume Tab': 'Costumes',
    'Sound Tab': 'Sounds'
};

/*
 * Higher Order Component to provide error boundary for wrapped component.
 * A curried function, call like errorHOC(<tracking label>)(<Component>).
 * @param {string} action - Label for GA tracking of errors.
 * @returns {function} a function that accepts a component to wrap.
 */
const ErrorBoundaryHOC = function (action){
    /**
     * The function to be called with a React component to wrap it.
     * @param {React.ComponentType} WrappedComponent - Component to wrap with an error boundary.
     * @returns {React.ComponentType} the component wrapped with an error boundary.
     */
    return function (WrappedComponent) {
        const ErrorBoundaryWrapper = props => (
            <EditorErrorBoundary name={EDITOR_NAMES[action] || action}>
                <WrappedComponent {...props} />
            </EditorErrorBoundary>
        );
        return ErrorBoundaryWrapper;
    };
};

export default ErrorBoundaryHOC;
