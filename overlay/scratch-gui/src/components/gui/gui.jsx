import classNames from 'classnames';
import omit from 'lodash.omit';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, FormattedMessage, injectIntl, intlShape} from 'react-intl';
import {connect} from 'react-redux';
import MediaQuery from 'react-responsive';
import {Tab, Tabs, TabList, TabPanel} from 'react-tabs';
import PseudocodeImporter from '../tw-pseudocode/pseudocode-importer.jsx';
import CircuitTab from '../tw-pseudocode/circuit-tab.jsx';
const MicrobitSimPane = React.lazy(() =>
    import(/* webpackChunkName: "bw-microbit-sim" */ '../tw-pseudocode/microbit-sim-pane.jsx')
);
const ControllerPanelView = React.lazy(() =>
    import(/* webpackChunkName: "bw-controller-panel" */ '../tw-pseudocode/controller-panel-view.jsx')
);
import tabStyles from 'react-tabs/style/react-tabs.css';
import VM from 'scratch-vm';
import Renderer from 'scratch-render';

import Blocks from '../../containers/blocks.jsx';
import CostumeTab from '../../containers/costume-tab.jsx';
import TargetPane from '../../containers/target-pane.jsx';
import SoundTab from '../../containers/sound-tab.jsx';
import StageWrapper from '../../containers/stage-wrapper.jsx';
import Loader from '../loader/loader.jsx';
import Box from '../box/box.jsx';
import MenuBar from '../menu-bar/menu-bar.jsx';
import ChromeToggle from './chrome-toggle.jsx';
import StarterJourneys from './starter-journeys.jsx';
import GuidedLessons from './guided-lessons.jsx';
import lessonCatalog from './lessons.json';
import chromeStyles from './compact-chrome.css';
import PaneDivider from './pane-divider.jsx';
import PaneStrip from './pane-strip.jsx';
import {computePaneStyles, isCollapsed} from '../../lib/pane-sizes.js';
import {setPaneSize} from '../../reducers/pane-layout';
import CostumeLibrary from '../../containers/costume-library.jsx';
import BackdropLibrary from '../../containers/backdrop-library.jsx';
import Watermark from '../../containers/watermark.jsx';

import Backpack from '../../containers/backpack.jsx';
import WebGlModal from '../../containers/webgl-modal.jsx';
import TipsLibrary from '../../containers/tips-library.jsx';
import Cards from '../../containers/cards.jsx';
import Alerts from '../../containers/alerts.jsx';
import DragLayer from '../../containers/drag-layer.jsx';
import ConnectionModal from '../../containers/connection-modal.jsx';
import TelemetryModal from '../telemetry-modal/telemetry-modal.jsx';

import layout, {STAGE_SIZE_MODES} from '../../lib/layout-constants';
import {resolveStageSize} from '../../lib/screen-utils';
import {themeMap} from '../../lib/themes';

import { ControllerPanel } from '../../lib/bw-board/controller.js';
import { bindPanelToVariables } from '../../lib/bw-board/controller-binding.js';
import styles from './gui.css';
import addExtensionIcon from './icon--extensions.svg';
import codeIcon from './icon--code.svg';
import costumesIcon from './icon--costumes.svg';
import soundsIcon from './icon--sounds.svg';

const messages = defineMessages({
    addExtension: {
        id: 'gui.gui.addExtension',
        description: 'Button to add an extension in the target pane',
        defaultMessage: 'Add Extension'
    }
});

// Cache this value to only retrieve it once the first time.
// Assume that it doesn't change for a session.
let isRendererSupported = null;

const STARTER_COMPLETE_KEY = 'bw-starter-v1-complete';
const STARTER_EVENTS_KEY = 'bw-starter-v1-events';

// Keep first-run product signals local. They are useful for diagnosing whether a
// journey was opened or dismissed, but do not belong in network telemetry unless
// the app's explicit telemetry consent path grows support for them later.
const recordStarterEvent = (type, journeyId) => {
    try {
        const previous = JSON.parse(localStorage.getItem(STARTER_EVENTS_KEY) || '[]');
        const events = Array.isArray(previous) ? previous.slice(-19) : [];
        events.push({type, journeyId: journeyId || null, at: new Date().toISOString()});
        localStorage.setItem(STARTER_EVENTS_KEY, JSON.stringify(events));
    } catch { /* private mode, unavailable storage, or an old malformed value */ }
};

const GUIComponent = props => {
    const [starterOpen, setStarterOpen] = React.useState(false);
    const [starterBusy, setStarterBusy] = React.useState(false);
    const [starterError, setStarterError] = React.useState('');
    const [lessonsOpen, setLessonsOpen] = React.useState(false);
    const [activeLessonId, setActiveLessonId] = React.useState(null);
    const [lessonInitialEvent, setLessonInitialEvent] = React.useState('');
    const closeStarter = React.useCallback(() => {
        try {
            localStorage.setItem(STARTER_COMPLETE_KEY, '1');
        } catch { /* private mode */ }
        recordStarterEvent('dismissed');
        setStarterOpen(false);
        setStarterBusy(false);
        setStarterError('');
    }, []);
    React.useEffect(() => {
        try {
            if (localStorage.getItem(STARTER_COMPLETE_KEY) !== '1') setStarterOpen(true);
        } catch {
            setStarterOpen(true);
        }
        const open = () => {
            recordStarterEvent('reopened');
            setStarterBusy(false);
            setStarterError('');
            setStarterOpen(true);
        };
        const result = event => {
            const detail = event.detail || {};
            setStarterBusy(false);
            if (String(detail.journeyId || '').startsWith('lesson:')) {
                window.dispatchEvent(new CustomEvent('bw-lesson-project-result', {detail}));
                return;
            }
            if (detail.ok) {
                try {
                    localStorage.setItem(STARTER_COMPLETE_KEY, '1');
                } catch { /* private mode */ }
                recordStarterEvent('opened', detail.journeyId);
                setStarterOpen(false);
                setStarterError('');
                const lesson = lessonCatalog.lessons.find(item => item.journeyId === detail.journeyId);
                if (lesson) {
                    setActiveLessonId(lesson.id);
                    setLessonInitialEvent('starter-loaded');
                    setLessonsOpen(true);
                }
            } else {
                recordStarterEvent(detail.cancelled ? 'cancelled' : 'failed', detail.journeyId);
                setStarterError(detail.cancelled ? 'cancelled' :
                    (detail.error || 'The starter project could not be opened.'));
            }
        };
        const openLessons = () => {
            setActiveLessonId(null);
            setLessonInitialEvent('');
            setLessonsOpen(true);
        };
        window.addEventListener('bw-open-getting-started', open);
        window.addEventListener('bw-starter-result', result);
        window.addEventListener('bw-open-lessons', openLessons);
        return () => {
            window.removeEventListener('bw-open-getting-started', open);
            window.removeEventListener('bw-starter-result', result);
            window.removeEventListener('bw-open-lessons', openLessons);
        };
    }, []);
    const chooseStarter = React.useCallback(journey => {
        setStarterBusy(true);
        setStarterError('');
        props.onActivateTab(journey.editorTab);
        window.dispatchEvent(new CustomEvent('bw-start-journey', {detail: journey}));
    }, [props.onActivateTab]);
    React.useEffect(() => {
        const openLessonProject = event => {
            const lesson = event.detail || {};
            const editorTab = lesson.loadMode === 'program-only' ? 3 : 4;
            props.onActivateTab(editorTab);
            window.dispatchEvent(new CustomEvent('bw-start-journey', {detail: {
                id: `lesson:${lesson.id}`,
                exampleId: lesson.exampleId,
                mode: lesson.loadMode
            }}));
        };
        window.addEventListener('bw-open-lesson-project', openLessonProject);
        return () => window.removeEventListener('bw-open-lesson-project', openLessonProject);
    }, [props.onActivateTab]);
    React.useEffect(() => {
        const vm = props.vm;
        if (!vm || !vm.on) return undefined;
        const connected = peripheral => window.dispatchEvent(new CustomEvent('bw-hardware-state', {
            detail: {state: 'connected', peripheral: peripheral || null}
        }));
        const disconnected = peripheral => window.dispatchEvent(new CustomEvent('bw-hardware-state', {
            detail: {state: 'disconnected', peripheral: peripheral || null}
        }));
        vm.on('PERIPHERAL_CONNECTED', connected);
        vm.on('PERIPHERAL_DISCONNECTED', disconnected);
        return () => {
            vm.removeListener('PERIPHERAL_CONNECTED', connected);
            vm.removeListener('PERIPHERAL_DISCONNECTED', disconnected);
        };
    }, [props.vm]);
    const [stagePaneVisible, setStagePaneVisible] = React.useState(() => {
        // A fresh Circuit workspace should devote its width to the editor.
        // Only an explicit saved preference (or a view such as Debugger,
        // which publishes bw-right-pane-hidden=0) opens the optional pane.
        try { return localStorage.getItem('bw-right-pane-hidden') === '0'; } catch { return false; }
    });
    // dockMode drives which pane the right column shows. 'microbit' replaces the
    // sprite list with the sim; every other value keeps the normal stage+targets.
    // Read BOTH bw-debug-dock and bw-stage-circuit so a stale localStorage value
    // from a prior session never activates the sim pane on a mint project.
    const [dockMode, setDockMode] = React.useState(() => {
        try {
            const dock = localStorage.getItem('bw-debug-dock') || 'top';
            const circuit = localStorage.getItem('bw-stage-circuit');
            // Only honour 'microbit' if the circuit-pane flag is also set
            if (dock === 'microbit' && circuit !== '1') return 'top';
            // A restored 'microbit' pane must also match the PROJECT: a
            // pure-circuit or STC/AVR project reopening after a micro:bit
            // session was showing the sim for no reason (owner report).
            // The button still switches explicitly; only the silent
            // restore is gated on the device actually being a micro:bit.
            if (dock === 'microbit'
                && props.vm?.runtime?.stc?.device !== 'microbit') return 'top';
            return dock;
        } catch { return 'top'; }
    });
    React.useEffect(() => {
        const sync = event => {
            const detail = event.detail || {};
            if (detail.key === 'bw-right-pane-hidden') {
                setStagePaneVisible(detail.value !== '1');
            } else if (detail.key === 'bw-debug-dock') {
                setDockMode(detail.value || 'top');
            } else if (detail.key === 'bw-stage-circuit') {
                // If the circuit pane is being deactivated while in microbit mode, reset
                if (detail.value !== '1') {
                    setDockMode(prev => prev === 'microbit' ? 'top' : prev);
                }
            }
        };
        window.addEventListener('bw-settings-change', sync);
        return () => window.removeEventListener('bw-settings-change', sync);
    }, []);

    // ── Controller panel ──────────────────────────────────────────────
    const controllerPanelRef = React.useRef(null);
    if (!controllerPanelRef.current) controllerPanelRef.current = new ControllerPanel();
    const controllerPanel = controllerPanelRef.current;
    // Expose on vm.runtime so ControllerExtension can find it, and wire the
    // LIVE variable binding: input widgets write program variables, display
    // widgets show them (bindPanelToVariables polls via requestAnimationFrame).
    React.useEffect(() => {
        if (!props.vm || !props.vm.runtime) return undefined;
        props.vm.runtime.controllerPanel = controllerPanel;
        const varBinding = bindPanelToVariables(controllerPanel, props.vm);
        return () => varBinding.dispose();
    }, [props.vm, controllerPanel]);
    // Restore panel from project data when project loads
    React.useEffect(() => {
        const onProjectLoad = () => {
            try {
                const stc = props.vm?.runtime?.stc;
                if (stc && stc.controller) {
                    const restored = ControllerPanel.fromJSON(stc.controller);
                    // Replace widgets in the existing panel
                    for (const name of controllerPanel.getWidgetNames()) {
                        controllerPanel.removeWidget(name);
                    }
                    for (const w of restored.getWidgets()) {
                        const added = controllerPanel.addWidget(w.name, w.type, w.config, w.layout);
                        if (w.binding) added.binding = { ...w.binding };
                    }
                }
            } catch { /* ignore corrupt data */ }
        };
        if (props.vm) props.vm.on('PROJECT_LOADED', onProjectLoad);
        return () => { if (props.vm) props.vm.removeListener('PROJECT_LOADED', onProjectLoad); };
    }, [props.vm, controllerPanel]);
    // Listen for persistence events from the panel view
    React.useEffect(() => {
        const onChanged = (e) => {
            // Store controller data on the runtime stc object for project save
            if (props.vm && props.vm.runtime && props.vm.runtime.stc) {
                props.vm.runtime.stc.controller = e.detail.data;
            }
        };
        window.addEventListener('bw-controller-changed', onChanged);
        return () => window.removeEventListener('bw-controller-changed', onChanged);
    }, [props.vm, controllerPanel]);

    // Resolve the board instance from the runtime (circuit-tab creates it)
    const board = props.vm?.runtime?.stc?.board || null;

    const {
        accountNavOpen,
        activeTabIndex,
        alertsVisible,
        authorId,
        authorThumbnailUrl,
        authorUsername,
        basePath,
        backdropLibraryVisible,
        backpackHost,
        backpackVisible,
        blocksId,
        blocksTabVisible,
        cardsVisible,
        canChangeLanguage,
        canChangeTheme,
        canCreateNew,
        canEditTitle,
        canManageFiles,
        canRemix,
        canSave,
        canCreateCopy,
        canShare,
        canUseCloud,
        children,
        connectionModalVisible,
        costumeLibraryVisible,
        costumesTabVisible,
        enableCommunity,
        intl,
        isCreating,
        isFullScreen,
        isPlayerOnly,
        isRtl,
        isShared,
        isTelemetryEnabled,
        isTotallyNormal,
        loading,
        logo,
        renderLogin,
        onClickAbout,
        onClickAccountNav,
        onCloseAccountNav,
        onLogOut,
        onOpenRegistration,
        onToggleLoginOpen,
        onActivateCostumesTab,
        onActivateSoundsTab,
        onActivateTab,
        onClickLogo,
        onExtensionButtonClick,
        onProjectTelemetryEvent,
        onRequestCloseBackdropLibrary,
        onRequestCloseCostumeLibrary,
        onRequestCloseTelemetryModal,
        onSeeCommunity,
        onShare,
        onShowPrivacyPolicy,
        onStartSelectingFileUpload,
        onTelemetryModalCancel,
        onTelemetryModalOptIn,
        onTelemetryModalOptOut,
        showComingSoon,
        soundsTabVisible,
        stageSizeMode,
        paneLayout,
        onSetPaneSize,
        targetIsStage,
        telemetryModalVisible,
        theme,
        tipsLibraryVisible,
        vm,
        ...componentProps
    } = omit(props, 'dispatch');
    if (children) {
        return <Box {...componentProps}>{children}</Box>;
    }

    const tabClassNames = {
        tabs: styles.tabs,
        tab: classNames(tabStyles.reactTabsTab, styles.tab),
        tabList: classNames(tabStyles.reactTabsTabList, styles.tabList),
        tabPanel: classNames(tabStyles.reactTabsTabPanel, styles.tabPanel),
        tabPanelSelected: classNames(tabStyles.reactTabsTabPanelSelected, styles.isSelected),
        tabSelected: classNames(tabStyles.reactTabsTabSelected, styles.isSelected)
    };

    if (isRendererSupported === null) {
        isRendererSupported = Renderer.isSupported();
    }

    return (<MediaQuery minWidth={layout.fullSizeMinWidth}>{isFullSize => {
        const stageSize = resolveStageSize(stageSizeMode, isFullSize);

        // Three-column pane sizing from the paneLayout reducer.
        // The middle column's `upper` content id decides what the first TabPanel
        // shows: 'blocks-canvas' (default) = the workspace, 'code' = the pseudocode
        // editor. This is the "content swap" — the Tabs structure stays intact, only
        // the first panel's content changes per preset.
        const leftSize = paneLayout?.left?.size || 'm';
        const middleSize = paneLayout?.middle?.size || 'l';
        const rightSize = paneLayout?.right?.size || 'm';
        const middleContent = paneLayout?.middle?.upper || 'blocks-canvas';
        const paneStyles = computePaneStyles(leftSize, middleSize, rightSize);

        // Full screen for the RIGHT-PANE docks (controller / micro:bit): make the
        // active pane fill the viewport as its OWN content instead of fullscreening
        // the (hidden) Scratch stage. z-index stays UNDER the stage-header's fixed
        // exit overlay ($z-index-stage-header = 5000), so the return control is
        // always painted on top and clickable — never a trap.
        const dockFullScreenStyle = isFullScreen ? {
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            width: '100vw', height: '100vh', margin: 0, zIndex: 4000,
            background: '#ffffff', overflow: 'auto'
        } : null;

        // Right-pane full screen: the stock presentation mode is defeated by
        // brickwright's inline pane widths, so the right pane stayed a half-width
        // panel with the editor still showing beside it. The stage, the circuit
        // designer (dockMode 'off') and the debugger (dockMode 'right'/'solo')
        // all render in the RIGHT pane, so for every right-pane mode EXCEPT
        // controller/micro:bit (which paint their own 100vw overlay), hide the
        // editor and let the right pane fill the window.
        const stageFullScreen = isFullScreen && dockMode !== 'controller' && dockMode !== 'microbit';

        return isPlayerOnly ? (
            <StageWrapper
                isFullScreen={isFullScreen}
                isRendererSupported={isRendererSupported}
                isRtl={isRtl}
                loading={loading}
                stageSize={STAGE_SIZE_MODES.large}
                vm={vm}
            >
                {alertsVisible ? (
                    <Alerts className={styles.alertsContainer} />
                ) : null}
            </StageWrapper>
        ) : (
            <Box
                className={styles.pageWrapper}
                dir={isRtl ? 'rtl' : 'ltr'}
                {...componentProps}
            >
                {/* No custom exit-fullscreen button: the stage-header's own
                    un-full-screen control is now a fixed top-right overlay
                    (z-5100, above any dock overlay), so it is the single,
                    intuitive exit for every mode. Escape still works too. */}
                {telemetryModalVisible ? (
                    <TelemetryModal
                        isRtl={isRtl}
                        isTelemetryEnabled={isTelemetryEnabled}
                        onCancel={onTelemetryModalCancel}
                        onOptIn={onTelemetryModalOptIn}
                        onOptOut={onTelemetryModalOptOut}
                        onRequestClose={onRequestCloseTelemetryModal}
                        onShowPrivacyPolicy={onShowPrivacyPolicy}
                    />
                ) : null}
                {loading ? (
                    <Loader />
                ) : null}
                {isCreating ? (
                    <Loader messageId="gui.loader.creating" />
                ) : null}
                {isRendererSupported ? null : (
                    <WebGlModal isRtl={isRtl} />
                )}
                {starterOpen ? (
                    <StarterJourneys
                        busy={starterBusy}
                        error={starterError}
                        locale={intl.locale}
                        onChoose={chooseStarter}
                        onClose={closeStarter}
                    />
                ) : null}
                {lessonsOpen ? (
                    <GuidedLessons
                        initialEvent={lessonInitialEvent}
                        lessonId={activeLessonId}
                        locale={intl.locale}
                        onClose={() => setLessonsOpen(false)}
                        onSelectLesson={id => {
                            setLessonInitialEvent('');
                            setActiveLessonId(id);
                        }}
                    />
                ) : null}
                {tipsLibraryVisible ? (
                    <TipsLibrary />
                ) : null}
                {cardsVisible ? (
                    <Cards />
                ) : null}
                {alertsVisible ? (
                    <Alerts className={styles.alertsContainer} />
                ) : null}
                {connectionModalVisible ? (
                    <ConnectionModal
                        vm={vm}
                    />
                ) : null}
                {costumeLibraryVisible ? (
                    <CostumeLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseCostumeLibrary}
                    />
                ) : null}
                {backdropLibraryVisible ? (
                    <BackdropLibrary
                        vm={vm}
                        onRequestClose={onRequestCloseBackdropLibrary}
                    />
                ) : null}
                <MenuBar
                    accountNavOpen={accountNavOpen}
                    authorId={authorId}
                    authorThumbnailUrl={authorThumbnailUrl}
                    authorUsername={authorUsername}
                    canChangeLanguage={canChangeLanguage}
                    canChangeTheme={canChangeTheme}
                    canCreateCopy={canCreateCopy}
                    canCreateNew={canCreateNew}
                    canEditTitle={canEditTitle}
                    canManageFiles={canManageFiles}
                    canRemix={canRemix}
                    canSave={canSave}
                    canShare={canShare}
                    className={styles.menuBarPosition}
                    enableCommunity={enableCommunity}
                    isShared={isShared}
                    isTotallyNormal={isTotallyNormal}
                    logo={logo}
                    renderLogin={renderLogin}
                    showComingSoon={showComingSoon}
                    onClickAbout={onClickAbout}
                    onClickAccountNav={onClickAccountNav}
                    onClickLogo={onClickLogo}
                    onCloseAccountNav={onCloseAccountNav}
                    onLogOut={onLogOut}
                    onOpenRegistration={onOpenRegistration}
                    onProjectTelemetryEvent={onProjectTelemetryEvent}
                    onSeeCommunity={onSeeCommunity}
                    onShare={onShare}
                    onStartSelectingFileUpload={onStartSelectingFileUpload}
                    onToggleLoginOpen={onToggleLoginOpen}
                />
                <Box className={styles.bodyWrapper}>
                    <Box
                        className={styles.flexWrapper}
                        data-workspace-columns="true"
                        style={stagePaneVisible ? undefined : {display: 'block', width: '100%'}}
                    >
                        <Box
                            className={styles.editorWrapper}
                            data-editor-pane="true"
                            style={stageFullScreen ? {display: 'none'} : (stagePaneVisible ? undefined : {
                                display: 'flex', width: '100%', maxWidth: 'none', height: '100%',
                                flex: 'none', flexBasis: 'auto', minWidth: 0
                            })}
                        >
                            <Tabs
                                forceRenderTabPanel
                                className={tabClassNames.tabs}
                                selectedIndex={activeTabIndex}
                                selectedTabClassName={tabClassNames.tabSelected}
                                selectedTabPanelClassName={tabClassNames.tabPanelSelected}
                                onSelect={onActivateTab}
                            >
                                <TabList className={tabClassNames.tabList}>
                                    <ChromeToggle className={chromeStyles.chromeToggle} />
                                    <Tab className={tabClassNames.tab}>
                                        <img
                                            draggable={false}
                                            src={codeIcon}
                                        />
                                        <span>Blocks</span>
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        onClick={onActivateCostumesTab}
                                    >
                                        <img
                                            draggable={false}
                                            src={costumesIcon}
                                        />
                                        {targetIsStage ? (
                                            <FormattedMessage
                                                defaultMessage="Backdrops"
                                                description="Button to get to the backdrops panel"
                                                id="gui.gui.backdropsTab"
                                            />
                                        ) : (
                                            <FormattedMessage
                                                defaultMessage="Costumes"
                                                description="Button to get to the costumes panel"
                                                id="gui.gui.costumesTab"
                                            />
                                        )}
                                    </Tab>
                                    <Tab
                                        className={tabClassNames.tab}
                                        onClick={onActivateSoundsTab}
                                    >
                                        <img
                                            draggable={false}
                                            src={soundsIcon}
                                        />
                                        <FormattedMessage
                                            defaultMessage="Sounds"
                                            description="Button to get to the sounds panel"
                                            id="gui.gui.soundsTab"
                                        />
                                    </Tab>
                                    <Tab className={tabClassNames.tab}>
                                        <FormattedMessage
                                            defaultMessage="Code"
                                            description="Brickwright code editor tab"
                                            id="gui.gui.codeTab"
                                        />
                                    </Tab>
                                    <Tab className={tabClassNames.tab}>
                                        <FormattedMessage
                                            defaultMessage="🔌 Circuit"
                                            description="Brickwright circuit designer tab"
                                            id="gui.gui.circuitTab"
                                        />
                                    </Tab>
                                </TabList>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {middleContent === 'code' ? (
                                        /* Content swap: the code preset puts the pseudocode editor
                                           in the first (blocks) tab panel. The blocks workspace
                                           stays mounted in TabPanel index 3 so it is not destroyed. */
                                        <PseudocodeImporter />
                                    ) : (
                                        <React.Fragment>
                                            <Box className={styles.blocksWrapper}>
                                                <Blocks
                                                    key={`${blocksId}/${theme}`}
                                                    canUseCloud={canUseCloud}
                                                    grow={1}
                                                    isVisible={blocksTabVisible}
                                                    options={{
                                                        media: `${basePath}static/${themeMap[theme].blocksMediaFolder}/`
                                                    }}
                                                    stageSize={stageSize}
                                                    theme={theme}
                                                    vm={vm}
                                                />
                                            </Box>
                                            <Box className={styles.extensionButtonContainer}>
                                                <button
                                                    className={styles.extensionButton}
                                                    title={intl.formatMessage(messages.addExtension)}
                                                    onClick={onExtensionButtonClick}
                                                >
                                                    <img
                                                        className={styles.extensionButtonIcon}
                                                        draggable={false}
                                                        src={addExtensionIcon}
                                                    />
                                                </button>
                                            </Box>
                                            <Box className={styles.watermark}>
                                                <Watermark />
                                            </Box>
                                        </React.Fragment>
                                    )}
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {costumesTabVisible ? <CostumeTab vm={vm} /> : null}
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    {soundsTabVisible ? <SoundTab vm={vm} /> : null}
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    <PseudocodeImporter />
                                </TabPanel>
                                <TabPanel className={tabClassNames.tabPanel}>
                                    <CircuitTab />
                                </TabPanel>
                            </Tabs>
                            <button
                                type="button"
                                data-right-pane-toggle="true"
                                aria-pressed={stagePaneVisible}
                                aria-label={stagePaneVisible
                                    ? (/^de/i.test(navigator.language) ? 'Rechtes Panel ausblenden' : 'Hide right panel')
                                    : (/^de/i.test(navigator.language) ? 'Rechtes Panel einblenden' : 'Show right panel')}
                                title={stagePaneVisible
                                    ? (/^de/i.test(navigator.language) ? 'Rechtes Panel ausblenden' : 'Hide right panel')
                                    : (/^de/i.test(navigator.language) ? 'Rechtes Panel einblenden' : 'Show right panel')}
                                onClick={() => {
                                    const next = !stagePaneVisible;
                                    setStagePaneVisible(next);
                                    try { localStorage.setItem('bw-right-pane-hidden', next ? '0' : '1'); } catch { /* private mode */ }
                                    window.dispatchEvent(new CustomEvent('bw-settings-change', {detail: {key: 'bw-right-pane-hidden', value: next ? '0' : '1'}}));
                                    // Blockly caches its SVG dimensions and only re-fits on a resize
                                    // event. The pane-divider drag fires continuous resizes (so the
                                    // slider frees the space), but an instant hide/show does not —
                                    // the workspace stays at its old width and the freed room reads
                                    // as empty gap. Nudge it once the DOM has reflowed.
                                    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
                                }}
                                style={{position: 'absolute', zIndex: 20, right: 0, top: 11, width: 32, minWidth: 32, height: 34, padding: 0, border: '1px solid #94a3b8', borderRadius: 5, background: stagePaneVisible ? '#2563eb' : '#475569', color: '#fff', cursor: 'pointer', fontWeight: 700, fontSize: 22, lineHeight: 1}}
                            >{stagePaneVisible ? '›' : '‹'}</button>
                            {backpackVisible ? (
                                <Backpack host={backpackHost} />
                            ) : null}
                        </Box>

                        {stagePaneVisible ? <PaneDivider
                            isRtl={isRtl}
                            share={rightSize}
                            onCollapseToggle={() => onSetPaneSize &&
                                onSetPaneSize('right', isCollapsed(rightSize) ? 'm' : 'xs')}
                            onResize={share => onSetPaneSize && onSetPaneSize('right', share)}
                        /> : null}

                        <Box className={classNames(styles.stageAndTargetWrapper, styles[stageSize])}
                            data-right-pane="true"
                            style={stageFullScreen ? {
                                flex: '1 1 100%', width: '100%', minWidth: 0, height: '100%'
                            } : (stagePaneVisible ? paneStyles.right : {
                                display: 'none', flex: '0 0 0', width: 0, minWidth: 0
                            })}>
                            {/* Covers the column rather than replacing it — the stage stays
                                mounted underneath, clipped to 28px, so restoring is instant
                                and scratch-render's canvas is never torn down. */}
                            {isCollapsed(rightSize) ? (
                                <PaneStrip
                                    onRestore={() => onSetPaneSize && onSetPaneSize('right', 'm')}
                                />
                            ) : null}
                            {/* StageWrapper always renders so its header (view
                                toggle buttons) stays reachable in every mode.
                                In controller mode the stage canvas is hidden
                                so the panel owns the full column. */}
                            <div style={dockMode === 'controller' ? {maxHeight: 44, overflow: 'hidden', flexShrink: 0, borderBottom: '3px solid #475569', background: '#cbd5e1', boxShadow: '0 3px 6px rgba(0,0,0,0.22)', position: 'relative', zIndex: 5, boxSizing: 'border-box'} : undefined}>
                                <StageWrapper
                                    isFullScreen={isFullScreen}
                                    isRendererSupported={isRendererSupported}
                                    isRtl={isRtl}
                                    stageSize={stageSize}
                                    vm={vm}
                                />
                            </div>
                            {dockMode === 'microbit' ? (
                                <React.Suspense fallback={
                                    <div style={{padding: 24, color: '#64748b'}}>{/^de/i.test(navigator.language) ? 'micro:bit-Simulator wird geladen…' : 'Loading micro:bit simulator…'}</div>
                                }>
                                    {dockFullScreenStyle ? (
                                        <div style={dockFullScreenStyle}><MicrobitSimPane /></div>
                                    ) : (
                                        <MicrobitSimPane />
                                    )}
                                </React.Suspense>
                            ) : dockMode === 'controller' ? (
                                <React.Suspense fallback={
                                    <div style={{padding: 24, color: '#64748b'}}>Loading controller…</div>
                                }>
                                    <div style={dockFullScreenStyle || {position: 'relative', flex: 1, minHeight: 0, borderTop: '1px solid #ffffff', background: '#f8fafc'}}>
                                        <ControllerPanelView
                                            panel={controllerPanel}
                                            board={board}
                                            vm={vm}
                                        />
                                    </div>
                                </React.Suspense>
                            ) : (
                                <Box className={styles.targetWrapper}>
                                    <TargetPane
                                        stageSize={stageSize}
                                        vm={vm}
                                    />
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>
                <DragLayer />
            </Box>
        );
    }}</MediaQuery>);
};

GUIComponent.propTypes = {
    accountNavOpen: PropTypes.bool,
    activeTabIndex: PropTypes.number,
    authorId: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    authorThumbnailUrl: PropTypes.string,
    authorUsername: PropTypes.oneOfType([PropTypes.string, PropTypes.bool]), // can be false
    backdropLibraryVisible: PropTypes.bool,
    backpackHost: PropTypes.string,
    backpackVisible: PropTypes.bool,
    basePath: PropTypes.string,
    blocksTabVisible: PropTypes.bool,
    blocksId: PropTypes.string,
    canChangeLanguage: PropTypes.bool,
    canChangeTheme: PropTypes.bool,
    canCreateCopy: PropTypes.bool,
    canCreateNew: PropTypes.bool,
    canEditTitle: PropTypes.bool,
    canManageFiles: PropTypes.bool,
    canRemix: PropTypes.bool,
    canSave: PropTypes.bool,
    canShare: PropTypes.bool,
    canUseCloud: PropTypes.bool,
    cardsVisible: PropTypes.bool,
    children: PropTypes.node,
    costumeLibraryVisible: PropTypes.bool,
    costumesTabVisible: PropTypes.bool,
    enableCommunity: PropTypes.bool,
    intl: intlShape.isRequired,
    isCreating: PropTypes.bool,
    isFullScreen: PropTypes.bool,
    isPlayerOnly: PropTypes.bool,
    isRtl: PropTypes.bool,
    isShared: PropTypes.bool,
    isTotallyNormal: PropTypes.bool,
    loading: PropTypes.bool,
    logo: PropTypes.string,
    onActivateCostumesTab: PropTypes.func,
    onActivateSoundsTab: PropTypes.func,
    onActivateTab: PropTypes.func,
    onClickAccountNav: PropTypes.func,
    onClickLogo: PropTypes.func,
    onCloseAccountNav: PropTypes.func,
    onExtensionButtonClick: PropTypes.func,
    onLogOut: PropTypes.func,
    onOpenRegistration: PropTypes.func,
    onRequestCloseBackdropLibrary: PropTypes.func,
    onRequestCloseCostumeLibrary: PropTypes.func,
    onRequestCloseTelemetryModal: PropTypes.func,
    onSeeCommunity: PropTypes.func,
    onShare: PropTypes.func,
    onShowPrivacyPolicy: PropTypes.func,
    onStartSelectingFileUpload: PropTypes.func,
    onTabSelect: PropTypes.func,
    onTelemetryModalCancel: PropTypes.func,
    onTelemetryModalOptIn: PropTypes.func,
    onTelemetryModalOptOut: PropTypes.func,
    onToggleLoginOpen: PropTypes.func,
    renderLogin: PropTypes.func,
    showComingSoon: PropTypes.bool,
    soundsTabVisible: PropTypes.bool,
    stageSizeMode: PropTypes.oneOf(Object.keys(STAGE_SIZE_MODES)),
    targetIsStage: PropTypes.bool,
    telemetryModalVisible: PropTypes.bool,
    theme: PropTypes.string,
    tipsLibraryVisible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired
};
GUIComponent.defaultProps = {
    backpackHost: null,
    backpackVisible: false,
    basePath: './',
    blocksId: 'original',
    canChangeLanguage: true,
    canChangeTheme: true,
    canCreateNew: false,
    canEditTitle: false,
    canManageFiles: true,
    canRemix: false,
    canSave: false,
    canCreateCopy: false,
    canShare: false,
    canUseCloud: false,
    enableCommunity: false,
    isCreating: false,
    isShared: false,
    isTotallyNormal: false,
    loading: false,
    showComingSoon: false,
    stageSizeMode: STAGE_SIZE_MODES.large
};

const mapStateToProps = state => ({
    blocksId: state.scratchGui.timeTravel.year.toString(),
    stageSizeMode: state.scratchGui.stageSize.stageSize,
    theme: state.scratchGui.theme.theme,
    paneLayout: state.scratchGui.paneLayout
});

const mapDispatchToProps = dispatch => ({
    onSetPaneSize: (column, size) => dispatch(setPaneSize(column, size))
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(GUIComponent));
