import PropTypes from 'prop-types';
import React from 'react';
import {createPortal} from 'react-dom';
import classNames from 'classnames';

import Box from '../box/box.jsx';
import DOMElementRenderer from '../../containers/dom-element-renderer.jsx';
import Loupe from '../loupe/loupe.jsx';
import MonitorList from '../../containers/monitor-list.jsx';
import TargetHighlight from '../../containers/target-highlight.jsx';
import GreenFlagOverlay from '../../containers/green-flag-overlay.jsx';
import Question from '../../containers/question.jsx';
import MicIndicator from '../mic-indicator/mic-indicator.jsx';
import {STAGE_DISPLAY_SIZES} from '../../lib/layout-constants.js';
import {getStageDimensions} from '../../lib/screen-utils.js';
import styles from './stage.css';

const StageComponent = props => {
    const {
        canvas,
        dragRef,
        isColorPicking,
        isFullScreen,
        isStarted,
        colorInfo,
        arcadeDialog,
        micIndicator,
        question,
        stageSize,
        useEditorDragStyle,
        onDeactivateColorPicker,
        onDoubleClick,
        onArcadeDialogDismiss,
        onQuestionAnswered,
        ...boxProps
    } = props;

    const stageDimensions = getStageDimensions(stageSize, isFullScreen);
    const arcadeDialogStyle = arcadeDialog?.type === 'longText' ? {
        justifyContent: arcadeDialog.layout === 'Top' ? 'flex-start' :
            arcadeDialog.layout === 'Bottom' ? 'flex-end' : 'center',
        alignItems: arcadeDialog.layout === 'Left' ? 'flex-start' :
            arcadeDialog.layout === 'Right' ? 'flex-end' : 'center'
    } : undefined;

    return (
        <React.Fragment>
            <Box
                className={classNames(
                    styles.stageWrapper,
                    {[styles.withColorPicker]: !isFullScreen && isColorPicking})}
                onDoubleClick={onDoubleClick}
            >
                <Box
                    className={classNames(
                        styles.stage,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                    style={{
                        height: stageDimensions.height,
                        width: stageDimensions.width
                    }}
                >
                    <DOMElementRenderer
                        domElement={canvas}
                        style={{
                            height: stageDimensions.height,
                            width: stageDimensions.width
                        }}
                        {...boxProps}
                    />
                    {arcadeDialog ? createPortal(
                        <div className={styles.arcadeDialogOverlay} role="dialog" aria-modal="true"
                            aria-label={arcadeDialog.type === 'longText' ? 'Arcade long text' : 'Arcade splash screen'}
                            style={arcadeDialogStyle}
                            onKeyDown={event => {
                                if (event.key !== 'Tab') {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onArcadeDialogDismiss();
                                }
                            }}>
                            <div className={styles.arcadeDialogText}
                                style={arcadeDialog.layout === 'Full' ? {width: '100%', maxHeight: '85vh'} : undefined}>
                                <strong>{arcadeDialog.title}</strong>
                                {arcadeDialog.subtitle ? <span>{arcadeDialog.subtitle}</span> : null}
                            </div>
                            <button autoFocus className={styles.arcadeDialogButton}
                                onClick={onArcadeDialogDismiss}>Continue</button>
                        </div>, document.body
                    ) : null}
                    <Box className={styles.monitorWrapper}>
                        <MonitorList
                            draggable={useEditorDragStyle}
                            stageSize={stageDimensions}
                        />
                    </Box>
                    <Box className={styles.frameWrapper}>
                        <TargetHighlight
                            className={styles.frame}
                            stageHeight={stageDimensions.height}
                            stageWidth={stageDimensions.width}
                        />
                    </Box>
                    {isColorPicking && colorInfo ? (
                        <Loupe colorInfo={colorInfo} />
                    ) : null}
                </Box>

                {/* `stageOverlays` is for items that should *not* have their overflow contained within the stage */}
                <Box
                    className={classNames(
                        styles.stageOverlays,
                        {[styles.fullScreen]: isFullScreen}
                    )}
                >
                    <div
                        className={styles.stageBottomWrapper}
                        style={{
                            width: stageDimensions.width,
                            height: stageDimensions.height
                        }}
                    >
                        {micIndicator ? (
                            <MicIndicator
                                className={styles.micIndicator}
                                stageSize={stageDimensions}
                            />
                        ) : null}
                        {question === null ? null : (
                            <div
                                className={styles.questionWrapper}
                                style={{width: stageDimensions.width}}
                            >
                                <Question
                                    question={question}
                                    onQuestionAnswered={onQuestionAnswered}
                                />
                            </div>
                        )}
                    </div>
                    <canvas
                        className={styles.draggingSprite}
                        height={0}
                        ref={dragRef}
                        width={0}
                    />
                </Box>
                {isStarted ? null : (
                    <GreenFlagOverlay
                        className={styles.greenFlagOverlay}
                        wrapperClass={styles.greenFlagOverlayWrapper}
                    />
                )}
            </Box>
            {isColorPicking ? (
                <Box
                    className={styles.colorPickerBackground}
                    onClick={onDeactivateColorPicker}
                />
            ) : null}
        </React.Fragment>
    );
};
StageComponent.propTypes = {
    arcadeDialog: PropTypes.shape({title: PropTypes.string, subtitle: PropTypes.string,
        type: PropTypes.string, layout: PropTypes.string}),
    canvas: PropTypes.instanceOf(Element).isRequired,
    colorInfo: Loupe.propTypes.colorInfo,
    dragRef: PropTypes.func,
    isColorPicking: PropTypes.bool,
    isFullScreen: PropTypes.bool.isRequired,
    isStarted: PropTypes.bool,
    micIndicator: PropTypes.bool,
    onDeactivateColorPicker: PropTypes.func,
    onArcadeDialogDismiss: PropTypes.func,
    onDoubleClick: PropTypes.func,
    onQuestionAnswered: PropTypes.func,
    question: PropTypes.string,
    stageSize: PropTypes.oneOf(Object.keys(STAGE_DISPLAY_SIZES)).isRequired,
    useEditorDragStyle: PropTypes.bool
};
StageComponent.defaultProps = {
    dragRef: () => {}
};
export default StageComponent;
