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
import arcadeIcon from './icon--arcade.svg';
import controllerIcon from './icon--controller.svg';
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
        defaultMessage: 'Circuit Designer',
        description: 'Button for the clean Circuit Designer view; the Selectors and Instruments panels can still blend in optionally, so "(only)" was dropped as misleading',
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
    arduboyConsole: {
        defaultMessage: 'Arduboy Console',
        description: 'Button to show the Arduboy console in the right pane',
        id: 'gui.stageHeader.arduboyConsole'
    },
    arcadeConsole: {
        defaultMessage: 'Game Console',
        description: 'Button to show the MakeCode Arcade or PyBadge console',
        id: 'gui.stageHeader.arcadeConsole'
    },
    controllerPanel: {
        defaultMessage: 'Controller',
        description: 'Button to show the controller panel with interactive widgets',
        id: 'gui.stageHeader.controllerPanel'
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
    if (dock === 'arcade') return 'arcade';
    if (dock === 'arduboy') return 'arduboy';
    if (dock === 'controller') return 'controller';
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

const StageViewButtons = ({intl, vm}) => {
    const [view, setView] = useState(readCircuitView);
    // The Calliope runs the same MicroPython on the same simulator, so the
    // button that opens it is the same button — a separate one would be two
    // controls for one pane.
    const MICROPYTHON_DEVICES = ['microbit', 'calliopemini'];
    const [deviceIsMicrobit, setDeviceIsMicrobit] = useState(() =>
        MICROPYTHON_DEVICES.includes(vm.runtime.bwDeviceId || vm.runtime.stc?.device));
    const [deviceIsArduboy, setDeviceIsArduboy] = useState(() =>
        (vm.runtime.bwDeviceId || vm.runtime.stc?.device) === 'arduboy');
    const [deviceIsArcade, setDeviceIsArcade] = useState(() => ['arcade', 'pybadge', 'pybadge-lc', 'samd51']
        .includes(vm.runtime.bwDeviceId || vm.runtime.stc?.device));
    useEffect(() => {
        const sync = event => {
            const {key, value} = event.detail || {};
            if (key === 'bw-stage-circuit') {
                setView(value === '1' ? viewForDock(localStorage.getItem('bw-debug-dock')) : 'scratch');
            } else if (key === 'bw-debug-dock') {
                setView(localStorage.getItem('bw-stage-circuit') === '0' ? 'scratch' : viewForDock(value));
            } else if (key === 'bw-device-id') {
                setDeviceIsMicrobit(MICROPYTHON_DEVICES.includes(value));
                setDeviceIsArduboy(value === 'arduboy');
                setDeviceIsArcade(['arcade', 'pybadge', 'pybadge-lc', 'samd51'].includes(value));
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
                    ...(deviceIsArcade ? [{
                        handleClick: () => { setCircuitView({fullWidth: true, dock: 'arcade'}); setView('arcade'); },
                        icon: arcadeIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'arcade',
                        title: intl.formatMessage(messages.arcadeConsole)
                    }] : []),
                    ...(deviceIsArduboy ? [{
                        handleClick: () => { setCircuitView({fullWidth: true, dock: 'arduboy'}); setView('arduboy'); },
                        icon: arcadeIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'arduboy',
                        title: intl.formatMessage(messages.arduboyConsole)
                    }] : []),
                    {
                        handleClick: () => { setCircuitView({fullWidth: true, dock: 'controller'}); setView('controller'); },
                        icon: controllerIcon,
                        iconClassName: styles.stageButtonIcon,
                        isSelected: view === 'controller',
                        title: intl.formatMessage(messages.controllerPanel)
                    },
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
                    data-testid="bw-exit-fullscreen"
                    onClick={onSetStageUnFull}
                    onKeyPress={onKeyPress}
                >
                    <img
                        alt={props.intl.formatMessage(messages.unFullStageSizeMessage)}
                        className={styles.stageButtonIcon}
                        data-testid="bw-exit-fullscreen-img"
                        draggable={false}
                        src={unFullScreenIcon}
                        title={props.intl.formatMessage(messages.fullscreenControl)}
                    />
                </Button>
            </div>
        );
        header = (
            <Box className={styles.stageHeaderWrapperOverlay} style={{height: 0, overflow: 'visible', position: 'relative', zIndex: 5100}}>
                {/* Full-screen controls as a compact TOP-RIGHT overlay (z above any
                    dock overlay), not a horizontal band — so the run/exit controls
                    stay out of the way and the stage below fills the whole height.
                    The un-full-screen button here is the single, intuitive exit for
                    every mode. */}
                <Box
                    className={styles.stageMenuWrapper}
                    style={{position: 'fixed',
                        // Clear the menu bar ($menu-bar-height, 3rem = 48px) instead of
                        // sitting inside its band. Measured on the built app at an iPad
                        // viewport in WebKit: at top:8 this row occupied y 13..47 while the
                        // menu bar occupied y 0..48 — a total overlap. It still won the
                        // stacking (z 5100 over the menu bar's 491, and elementFromPoint at
                        // its centre returned this button), so raising z-index again would
                        // have changed nothing: the defect is geometry, not paint order.
                        // On the device the iOS status bar can cover the top of that same
                        // band as well, and no z-index reaches OS chrome.
                        top: 'calc(env(safe-area-inset-top, 0px) + 56px)',
                        right: 'calc(env(safe-area-inset-right, 0px) + 8px)',
                        left: 'auto', width: 'auto', display: 'flex', gap: 8, alignItems: 'center', zIndex: 5100, background: 'rgba(226,232,240,0.94)', borderRadius: 10, padding: '3px 8px', boxShadow: '0 1px 6px rgba(0,0,0,0.28)'}}
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
                        <StageViewButtons intl={props.intl} vm={vm} />
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
