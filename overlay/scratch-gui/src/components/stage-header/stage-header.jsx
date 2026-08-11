import {defineMessages, injectIntl, intlShape} from 'react-intl';
import PropTypes from 'prop-types';
import React, {useEffect, useState} from 'react';
import {connect} from 'react-redux';
import VM from 'scratch-vm';

import Box from '../box/box.jsx';
import Button from '../button/button.jsx';
import ToggleButtons from '../toggle-buttons/toggle-buttons.jsx';
import Controls from '../../containers/controls.jsx';
import {getStageDimensions} from '../../lib/screen-utils';
import {STAGE_SIZE_MODES} from '../../lib/layout-constants';

import fullScreenIcon from './icon--fullscreen.svg';
import largeStageIcon from './icon--large-stage.svg';
import smallStageIcon from './icon--small-stage.svg';
import unFullScreenIcon from './icon--unfullscreen.svg';
import circuitIcon from './icon--circuit.svg';
import debuggerIcon from './icon--debugger.svg';
import scratchStageIcon from './icon--scratch-stage.svg';

import scratchLogo from '../menu-bar/scratch-logo.svg';
import styles from './stage-header.css';

const messages = defineMessages({
    largeStageSizeMessage: {
        defaultMessage: 'Switch to large stage',
        description: 'Button to change stage size to large',
        id: 'gui.stageHeader.stageSizeLarge'
    },
    smallStageSizeMessage: {
        defaultMessage: 'Switch to small stage',
        description: 'Button to change stage size to small',
        id: 'gui.stageHeader.stageSizeSmall'
    },
    fullStageSizeMessage: {
        defaultMessage: 'Enter full screen mode',
        description: 'Button to change stage size to full screen',
        id: 'gui.stageHeader.stageSizeFull'
    },
    unFullStageSizeMessage: {
        defaultMessage: 'Exit full screen mode',
        description: 'Button to get out of full screen mode',
        id: 'gui.stageHeader.stageSizeUnFull'
    },
    fullscreenControl: {
        defaultMessage: 'Full Screen Control',
        description: 'Button to enter/exit full screen mode',
        id: 'gui.stageHeader.fullscreenControl'
    },
    circuitDebugger: {
        defaultMessage: 'Switch to debugger',
        description: 'Button to show the Circuit Designer with its debugger',
        id: 'gui.stageHeader.circuitDebugger'
    },
    circuitNoDebugger: {
        defaultMessage: 'Circuit Designer without debugger',
        description: 'Button to show the full-width Circuit Designer without debugger',
        id: 'gui.stageHeader.circuitNoDebugger'
    },
    scratchStage: {
        defaultMessage: 'Scratch Stage',
        description: 'Button to show the Scratch stage while coding',
        id: 'gui.stageHeader.scratchStage'
    }
});

const setCircuitView = ({fullWidth, debuggerOn}) => {
    const values = {
        'bw-hide-stage': fullWidth ? '1' : '0',
        'bw-debug-dock': debuggerOn ? 'top' : 'off',
        'bw-stage-circuit': fullWidth ? '1' : '0',
        'bw-circuit-theme': 'light'
    };
    try {
        Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, value));
    } catch { /* private browsing: the live events still work */ }
    Object.entries(values).forEach(([key, value]) => {
        window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key, value}}));
    });
};

const readCircuitView = () => {
    try {
        const coding = localStorage.getItem('bw-stage-circuit');
        // A fresh Scratch editor starts with its normal stage selected. The
        // circuit/debugger choices become active only after the user chooses
        // them or selects them in Settings.
        if (coding !== '1') return 'scratch';
        return localStorage.getItem('bw-debug-dock') === 'off' ? 'circuit' : 'debugger';
    } catch {
        return 'scratch';
    }
};

const StageViewButtons = ({intl}) => {
    const [view, setView] = useState(readCircuitView);
    useEffect(() => {
        const sync = event => {
            const {key, value} = event.detail || {};
            if (key === 'bw-stage-circuit') {
                setView(value === '1' ? (localStorage.getItem('bw-debug-dock') === 'off' ? 'circuit' : 'debugger') : 'scratch');
            } else if (key === 'bw-debug-dock') {
                setView(localStorage.getItem('bw-stage-circuit') === '0' ? 'scratch' : (value === 'off' ? 'circuit' : 'debugger'));
            }
        };
        window.addEventListener('bw-settings-change', sync);
        return () => window.removeEventListener('bw-settings-change', sync);
    }, []);
    return (
        <div
            className={styles.stageSizeToggleGroup}
            style={{position: 'relative', zIndex: 20}}
        >
            <ToggleButtons
                buttons={[
                    {
                        handleClick: () => { setCircuitView({fullWidth: true, debuggerOn: false}); setView('circuit'); },
                        icon: circuitIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'circuit',
                        title: intl.formatMessage(messages.circuitNoDebugger)
                    },
                    {
                        handleClick: () => { setCircuitView({fullWidth: true, debuggerOn: true}); setView('debugger'); },
                        icon: debuggerIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'debugger',
                        title: intl.formatMessage(messages.circuitDebugger)
                    },
                    {
                        handleClick: () => {
                            setCircuitView({fullWidth: false, debuggerOn: true});
                            setView('scratch');
                        },
                        icon: scratchStageIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'scratch',
                        title: intl.formatMessage(messages.scratchStage)
                    }
                ]}
            />
        </div>
    );
};

const StageHeaderComponent = function (props) {
    const {
        isFullScreen,
        isPlayerOnly,
        onKeyPress,
        onSetStageLarge,
        onSetStageSmall,
        onSetStageFull,
        onSetStageUnFull,
        showBranding,
        stageSizeMode,
        vm
    } = props;

    let header = null;

    if (isFullScreen) {
        const stageDimensions = getStageDimensions(null, true);
        const stageButton = showBranding ? (
            <div className={styles.embedScratchLogo}>
                <a
                    href="#"
                    rel="noopener noreferrer"
                    target="_blank"
                >
                    <img
                        alt="Scratch"
                        src={scratchLogo}
                    />
                </a>
            </div>
        ) : (
            <div className={styles.unselectWrapper}>
                <Button
                    className={styles.stageButton}
                    onClick={onSetStageUnFull}
                    onKeyPress={onKeyPress}
                >
                    <img
                        alt={props.intl.formatMessage(messages.unFullStageSizeMessage)}
                        className={styles.stageButtonIcon}
                        draggable={false}
                        src={unFullScreenIcon}
                        title={props.intl.formatMessage(messages.fullscreenControl)}
                    />
                </Button>
            </div>
        );
        header = (
            <Box className={styles.stageHeaderWrapperOverlay}>
                <Box
                    className={styles.stageMenuWrapper}
                    style={{width: stageDimensions.width}}
                >
                    <Controls vm={vm} />
                    {stageButton}
                </Box>
            </Box>
        );
    } else {
        const stageControls =
            isPlayerOnly ? (
                []
            ) : (
                <div className={styles.stageSizeToggleGroup}>
                    <ToggleButtons
                        buttons={[
                            {
                                handleClick: onSetStageSmall,
                                icon: smallStageIcon,
                                iconClassName: styles.stageButtonIcon,
                                isSelected: stageSizeMode === STAGE_SIZE_MODES.small,
                                title: props.intl.formatMessage(messages.smallStageSizeMessage)
                            },
                            {
                                handleClick: onSetStageLarge,
                                icon: largeStageIcon,
                                iconClassName: styles.stageButtonIcon,
                                isSelected: stageSizeMode === STAGE_SIZE_MODES.large,
                                title: props.intl.formatMessage(messages.largeStageSizeMessage)
                            }
                        ]}
                    />
                </div>
            );
        header = (
            <Box className={styles.stageHeaderWrapper}>
                <Box className={styles.stageMenuWrapper}>
                    <Controls vm={vm} />
                    <div className={styles.stageSizeRow}>
                        {stageControls}
                        <StageViewButtons intl={props.intl} />
                        <div>
                            <Button
                                className={styles.stageButton}
                                onClick={onSetStageFull}
                            >
                                <img
                                    alt={props.intl.formatMessage(messages.fullStageSizeMessage)}
                                    className={styles.stageButtonIcon}
                                    draggable={false}
                                    src={fullScreenIcon}
                                    title={props.intl.formatMessage(messages.fullscreenControl)}
                                />
                            </Button>
                        </div>
                    </div>
                </Box>
            </Box>
        );
    }

    return header;
};

const mapStateToProps = state => ({
    // This is the button's mode, as opposed to the actual current state
    stageSizeMode: state.scratchGui.stageSize.stageSize
});

StageHeaderComponent.propTypes = {
    intl: intlShape,
    isFullScreen: PropTypes.bool.isRequired,
    isPlayerOnly: PropTypes.bool.isRequired,
    onKeyPress: PropTypes.func.isRequired,
    onSetStageFull: PropTypes.func.isRequired,
    onSetStageLarge: PropTypes.func.isRequired,
    onSetStageSmall: PropTypes.func.isRequired,
    onSetStageUnFull: PropTypes.func.isRequired,
    showBranding: PropTypes.bool.isRequired,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    vm: PropTypes.instanceOf(VM).isRequired
};

StageHeaderComponent.defaultProps = {
    stageSizeMode: STAGE_SIZE_MODES.large
};

export default injectIntl(connect(
    mapStateToProps
)(StageHeaderComponent));
