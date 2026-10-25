import {connect} from 'react-redux';
import PropTypes from 'prop-types';
import bindAll from 'lodash.bindall';
import React from 'react';
import {confirmAsync} from '../lib/native-dialog';

const MenuBarHOC = function (WrappedComponent) {
    class MenuBarContainer extends React.PureComponent {
        constructor (props) {
            super(props);

            bindAll(this, [
                'confirmReadyToReplaceProject',
                'shouldSaveBeforeTransition'
            ]);
        }
        // Resolves to the answer. In the desktop/iOS app `confirm` cannot block (it returns a
        // Promise, which is always truthy), so the caller must wait: lib/native-dialog.js.
        async confirmReadyToReplaceProject (message) {
            if (this.props.projectChanged && !this.props.canCreateNew) {
                return (await this.props.confirmWithMessage(message)) === true;
            }
            return true;
        }
        shouldSaveBeforeTransition () {
            return (this.props.canSave && this.props.projectChanged);
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                projectChanged,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (<WrappedComponent
                confirmReadyToReplaceProject={this.confirmReadyToReplaceProject}
                shouldSaveBeforeTransition={this.shouldSaveBeforeTransition}
                {...props}
            />);
        }
    }

    MenuBarContainer.propTypes = {
        canCreateNew: PropTypes.bool,
        canSave: PropTypes.bool,
        confirmWithMessage: PropTypes.func,
        projectChanged: PropTypes.bool
    };
    MenuBarContainer.defaultProps = {
        // the browser's confirm, or a native OK/Cancel box in the app; resolves to the answer
        confirmWithMessage: message => confirmAsync(message)
    };
    const mapStateToProps = state => ({
        projectChanged: state.scratchGui.projectChanged
    });
    const mapDispatchToProps = () => ({});
    // Allow incoming props to override redux-provided props. Used to mock in tests.
    const mergeProps = (stateProps, dispatchProps, ownProps) => Object.assign(
        {}, stateProps, dispatchProps, ownProps
    );
    return connect(
        mapStateToProps,
        mapDispatchToProps,
        mergeProps
    )(MenuBarContainer);
};

export default MenuBarHOC;
