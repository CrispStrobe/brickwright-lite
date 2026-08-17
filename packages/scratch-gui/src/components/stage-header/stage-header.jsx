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
import debuggerSoloIcon from './icon--debugger-solo.svg';
import microbitIcon from './icon--microbit.svg';
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
    circuitOnly: {
        defaultMessage: 'Circuit Designer (only)',
        description: 'Button to show the Circuit Designer without panels — clean view for inspection',
        id: 'gui.stageHeader.circuitOnly'
    },
    debuggerFull: {
        defaultMessage: 'Debugger',
        description: 'Button to show the full debugger enlarged in the right pane',
        id: 'gui.stageHeader.debuggerFull'
    },
    microbitSim: {
        defaultMessage: 'micro:bit Simulator',
        description: 'Button to show the micro:bit simulator in the right pane',
        id: 'gui.stageHeader.microbitSim'
    },
    scratchStage: {
        defaultMessage: 'Scratch Stage',
        description: 'Button to show the Scratch stage while coding',
        id: 'gui.stageHeader.scratchStage'
    }
});

const setCircuitView = ({fullWidth, dock}) => {
    const values = {
        'bw-hide-stage': fullWidth ? '1' : '0',
        'bw-right-pane-hidden': '0',
        'bw-debug-dock': dock,
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

// The dock value alone names the view while the circuit owns the pane:
// 'off' → bare circuit, 'solo' → debugger-only pane, anything else → the
// circuit with its instruments-column debugger.
const viewForDock = dock => {
    if (dock === 'off') return 'circuit';
    // 'right' claims the stage column exactly like 'solo' while coding;
    // on the Circuit tab it renders the FULL panel in the right column
    // instead of falling back to the tiny instruments dock (owner spec).
    if (dock === 'solo' || dock === 'right') return 'solo';
    if (dock === 'microbit') return 'microbit';
    // 'top' and any other value default to scratch stage
    return 'scratch';
};

const readCircuitView = () => {
    try {
        const coding = localStorage.getItem('bw-stage-circuit');
        // A fresh Scratch editor starts with its normal stage selected. The
        // circuit/debugger choices become active only after the user chooses
        // them or selects them in Settings.
        if (coding !== '1') return 'scratch';
        return viewForDock(localStorage.getItem('bw-debug-dock'));
    } catch {
        return 'scratch';
    }
};

const StageViewButtons = ({intl}) => {
    const [view, setView] = useState(readCircuitView);
    const [deviceIsMicrobit, setDeviceIsMicrobit] = useState(false);
    useEffect(() => {
        const sync = event => {
            const {key, value} = event.detail || {};
            if (key === 'bw-stage-circuit') {
                setView(value === '1' ? viewForDock(localStorage.getItem('bw-debug-dock')) : 'scratch');
            } else if (key === 'bw-debug-dock') {
                setView(localStorage.getItem('bw-stage-circuit') === '0' ? 'scratch' : viewForDock(value));
            } else if (key === 'bw-device-id') {
                setDeviceIsMicrobit(value === 'microbit');
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
                        handleClick: () => { setCircuitView({fullWidth: true, dock: 'off'}); setView('circuit'); },
                        icon: circuitIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'circuit',
                        title: intl.formatMessage(messages.circuitOnly)
                    },
                    {
                        // Full debugger enlarged in the right pane — run
                        // control, registers, trace, all at full size.
                        // dock 'right', not 'solo': on the dedicated
                        // Circuit tab 'solo' fell back to the tiny
                        // instruments-column debugger — the owner asked for
                        // the FULL panel in the right pane, which is what
                        // dock 'right' renders in both tabs.
                        handleClick: () => { setCircuitView({fullWidth: true, dock: 'right'}); setView('solo'); },
                        icon: debuggerSoloIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'solo',
                        title: intl.formatMessage(messages.debuggerFull)
                    },
                    // micro:bit button only appears when DEVICE MICROBIT is declared
                    ...(deviceIsMicrobit ? [{
                        handleClick: () => { setCircuitView({fullWidth: true, dock: 'microbit'}); setView('microbit'); },
                        icon: microbitIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'microbit',
                        title: intl.formatMessage(messages.microbitSim)
                    }] : []),
                    {
                        handleClick: () => {
                            setCircuitView({fullWidth: false, dock: 'top'});
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
