import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import {getIsAnyCreatingNewState, getIsShowingWithoutId} from '../reducers/project-state';
import {setProjectTitle} from '../reducers/project-title';

const messages = defineMessages({
    defaultProjectTitle: {
        id: 'gui.gui.defaultProjectTitle',
        description: 'Default title for project',
        defaultMessage: 'BrickWright Project'
    }
});

const TitledHOC = function (WrappedComponent) {
    class TitledComponent extends React.Component {
        componentDidMount () { this.handleReceivedProjectTitle(this.props.projectTitle); }
        componentDidUpdate (prevProps) {
            if (this.props.projectTitle !== prevProps.projectTitle) this.handleReceivedProjectTitle(this.props.projectTitle);
            if (this.props.isShowingWithoutId && prevProps.isAnyCreatingNewState) {
                const defaultProjectTitle = this.handleReceivedProjectTitle();
                this.props.onUpdateProjectTitle(defaultProjectTitle);
            }
            if (this.props.reduxProjectTitle !== prevProps.reduxProjectTitle &&
                this.props.reduxProjectTitle !== this.props.projectTitle) {
                this.props.onUpdateProjectTitle(this.props.reduxProjectTitle);
            }
        }
        handleReceivedProjectTitle (requestedTitle) {
            const newTitle = requestedTitle === null || typeof requestedTitle === 'undefined' ?
                this.props.intl.formatMessage(messages.defaultProjectTitle) : requestedTitle;
            this.props.onChangedProjectTitle(newTitle);
            return newTitle;
        }
        render () {
            const {
                intl, isAnyCreatingNewState, isShowingWithoutId, onChangedProjectTitle,
                onUpdateProjectTitle, projectTitle, reduxProjectTitle, ...componentProps
            } = this.props;
            return <WrappedComponent {...componentProps} />;
        }
    }
    TitledComponent.propTypes = {
        intl: intlShape,
        isAnyCreatingNewState: PropTypes.bool,
        isShowingWithoutId: PropTypes.bool,
        onChangedProjectTitle: PropTypes.func,
        onUpdateProjectTitle: PropTypes.func,
        projectTitle: PropTypes.string,
        reduxProjectTitle: PropTypes.string
    };
    TitledComponent.defaultProps = {onUpdateProjectTitle: () => {}};
    const mapStateToProps = state => {
        const loadingState = state.scratchGui.projectState.loadingState;
        return {
            isAnyCreatingNewState: getIsAnyCreatingNewState(loadingState),
            isShowingWithoutId: getIsShowingWithoutId(loadingState),
            reduxProjectTitle: state.scratchGui.projectTitle
        };
    };
    const mapDispatchToProps = dispatch => ({onChangedProjectTitle: title => dispatch(setProjectTitle(title))});
    return injectIntl(connect(mapStateToProps, mapDispatchToProps)(TitledComponent));
};

export {TitledHOC as default};
