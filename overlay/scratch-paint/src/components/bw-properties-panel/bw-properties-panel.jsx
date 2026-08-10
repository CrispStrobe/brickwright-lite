import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import BufferedInputHOC from '../forms/buffered-input-hoc.jsx';
import Input from '../forms/input.jsx';
import tx from '../../lib/bw-messages';
import {Alignments, AlignTo, Axes} from '../../helper/bw/align';

import {
    AlignBottom,
    AlignHorizontalCenter,
    AlignLeft,
    AlignRight,
    AlignTop,
    AlignVerticalCenter,
    AspectLock,
    Chevron,
    DistributeHorizontal,
    DistributeVertical,
    RotateClockwise,
    RotateCounterClockwise
} from './bw-icons.jsx';

import styles from './bw-properties-panel.css';

const BufferedInput = BufferedInputHOC(Input);

/** A square icon button. Children are one of the inline SVG glyphs from bw-icons. */
const IconButton = ({active, children, disabled, onClick, title}) => (
    <button
        className={classNames(styles.iconButton, {[styles.iconButtonActive]: active})}
        disabled={disabled}
        title={title}
        type="button"
        onClick={onClick}
    >
        {children}
    </button>
);
IconButton.propTypes = {
    active: PropTypes.bool,
    children: PropTypes.node,
    disabled: PropTypes.bool,
    onClick: PropTypes.func.isRequired,
    title: PropTypes.string
};

/** A labelled numeric field. A null value renders an empty box rather than "0" or "NaN". */
const NumberField = ({disabled, label, title, value, onSubmit}) => (
    <label
        className={classNames(styles.field, {[styles.fieldDisabled]: disabled})}
        title={title}
    >
        <span className={styles.fieldLabel}>{label}</span>
        {disabled || value === null ?
            <Input
                className={styles.fieldInput}
                disabled
                readOnly
                type="text"
                value=""
            /> :
            <BufferedInput
                className={styles.fieldInput}
                type="number"
                value={value}
                onSubmit={onSubmit}
            />
        }
    </label>
);
NumberField.propTypes = {
    disabled: PropTypes.bool,
    label: PropTypes.string.isRequired,
    onSubmit: PropTypes.func.isRequired,
    title: PropTypes.string,
    value: PropTypes.number
};

const Section = ({children, title}) => (
    <div className={styles.section}>
        <div className={styles.sectionTitle}>{title}</div>
        {children}
    </div>
);
Section.propTypes = {
    children: PropTypes.node,
    title: PropTypes.string.isRequired
};

const BwPropertiesPanel = props => {
    const {alignTo, locale, selectionCount, transform, visible} = props;
    const t = key => tx(locale, key);

    const hasSelection = transform !== null;
    // Aligning against the canvas is meaningful for a single object; aligning objects to each
    // other is not. Distribute always needs three, so there is a middle item to move.
    const canAlign = hasSelection && (alignTo === AlignTo.CANVAS || selectionCount >= 2);
    const canDistribute = selectionCount >= 3;
    const singleItem = selectionCount === 1;

    const alignButton = (alignment, key, Icon) => (
        <IconButton
            disabled={!canAlign}
            title={canAlign ? t(key) : `${t(key)} — ${t('needTwo')}`}
            onClick={() => props.onAlign(alignment)}
        >
            <Icon />
        </IconButton>
    );

    if (!visible) {
        return (
            <div className={styles.railCollapsed}>
                <IconButton
                    title={t('showProperties')}
                    onClick={props.onTogglePanel}
                >
                    <Chevron pointsRight={false} />
                </IconButton>
            </div>
        );
    }

    return (
        <div className={styles.rail}>
            <div className={styles.header}>
                <IconButton
                    title={t('hideProperties')}
                    onClick={props.onTogglePanel}
                >
                    <Chevron pointsRight />
                </IconButton>
                <span className={styles.headerTitle}>{t('properties')}</span>
            </div>

            <div className={styles.body}>
                <Section title={t('transform')}>
                    {hasSelection ? null :
                        <div className={styles.hint}>{t('nothingSelected')}</div>}
                    <div className={styles.fieldRow}>
                        <NumberField
                            disabled={!hasSelection}
                            label={t('positionX')}
                            value={hasSelection ? transform.x : null}
                            onSubmit={props.onChangeX}
                        />
                        <NumberField
                            disabled={!hasSelection}
                            label={t('positionY')}
                            value={hasSelection ? transform.y : null}
                            onSubmit={props.onChangeY}
                        />
                    </div>
                    <div className={styles.fieldRow}>
                        <NumberField
                            disabled={!hasSelection}
                            label={t('width')}
                            value={hasSelection ? transform.width : null}
                            onSubmit={props.onChangeWidth}
                        />
                        <NumberField
                            disabled={!hasSelection}
                            label={t('height')}
                            value={hasSelection ? transform.height : null}
                            onSubmit={props.onChangeHeight}
                        />
                        <IconButton
                            active={props.lockAspect}
                            disabled={!hasSelection}
                            title={t('lockAspect')}
                            onClick={props.onToggleLockAspect}
                        >
                            <AspectLock locked={props.lockAspect} />
                        </IconButton>
                    </div>
                    <div className={styles.fieldRow}>
                        <NumberField
                            disabled={!singleItem}
                            label={t('rotation')}
                            title={singleItem ? null : t('rotationMultiple')}
                            value={singleItem ? transform.rotation : null}
                            onSubmit={props.onChangeRotation}
                        />
                        <IconButton
                            disabled={!hasSelection}
                            title={t('rotateCounterClockwise')}
                            onClick={props.onRotateCounterClockwise}
                        >
                            <RotateCounterClockwise />
                        </IconButton>
                        <IconButton
                            disabled={!hasSelection}
                            title={t('rotateClockwise')}
                            onClick={props.onRotateClockwise}
                        >
                            <RotateClockwise />
                        </IconButton>
                    </div>
                </Section>

                <Section title={t('align')}>
                    <div className={styles.segmented}>
                        <span className={styles.segmentedLabel}>{t('alignRelativeTo')}</span>
                        <button
                            className={classNames(styles.segment, {
                                [styles.segmentActive]: alignTo === AlignTo.SELECTION
                            })}
                            type="button"
                            onClick={() => props.onChangeAlignTo(AlignTo.SELECTION)}
                        >
                            {t('alignToSelection')}
                        </button>
                        <button
                            className={classNames(styles.segment, {
                                [styles.segmentActive]: alignTo === AlignTo.CANVAS
                            })}
                            type="button"
                            onClick={() => props.onChangeAlignTo(AlignTo.CANVAS)}
                        >
                            {t('alignToCanvas')}
                        </button>
                    </div>
                    <div className={styles.buttonRow}>
                        {alignButton(Alignments.LEFT, 'alignLeft', AlignLeft)}
                        {alignButton(Alignments.HORIZONTAL_CENTER, 'alignHorizontalCenter', AlignHorizontalCenter)}
                        {alignButton(Alignments.RIGHT, 'alignRight', AlignRight)}
                    </div>
                    <div className={styles.buttonRow}>
                        {alignButton(Alignments.TOP, 'alignTop', AlignTop)}
                        {alignButton(Alignments.VERTICAL_CENTER, 'alignVerticalCenter', AlignVerticalCenter)}
                        {alignButton(Alignments.BOTTOM, 'alignBottom', AlignBottom)}
                    </div>
                    <div className={styles.buttonRow}>
                        <IconButton
                            disabled={!canDistribute}
                            title={canDistribute ?
                                t('distributeHorizontal') :
                                `${t('distributeHorizontal')} — ${t('needThree')}`}
                            onClick={() => props.onDistribute(Axes.HORIZONTAL)}
                        >
                            <DistributeHorizontal />
                        </IconButton>
                        <IconButton
                            disabled={!canDistribute}
                            title={canDistribute ?
                                t('distributeVertical') :
                                `${t('distributeVertical')} — ${t('needThree')}`}
                            onClick={() => props.onDistribute(Axes.VERTICAL)}
                        >
                            <DistributeVertical />
                        </IconButton>
                    </div>
                </Section>

                {props.showShapeSection ?
                    <Section title={t('shape')}>
                        <div className={styles.fieldRow}>
                            <NumberField
                                label={t('cornerRadius')}
                                value={props.cornerRadius}
                                onSubmit={props.onChangeCornerRadius}
                            />
                        </div>
                    </Section> : null}
            </div>
        </div>
    );
};

BwPropertiesPanel.propTypes = {
    alignTo: PropTypes.oneOf(Object.keys(AlignTo).map(key => AlignTo[key])).isRequired,
    cornerRadius: PropTypes.number,
    locale: PropTypes.string,
    lockAspect: PropTypes.bool,
    onAlign: PropTypes.func.isRequired,
    onChangeAlignTo: PropTypes.func.isRequired,
    onChangeCornerRadius: PropTypes.func.isRequired,
    onChangeHeight: PropTypes.func.isRequired,
    onChangeRotation: PropTypes.func.isRequired,
    onChangeWidth: PropTypes.func.isRequired,
    onChangeX: PropTypes.func.isRequired,
    onChangeY: PropTypes.func.isRequired,
    onDistribute: PropTypes.func.isRequired,
    onRotateClockwise: PropTypes.func.isRequired,
    onRotateCounterClockwise: PropTypes.func.isRequired,
    onToggleLockAspect: PropTypes.func.isRequired,
    onTogglePanel: PropTypes.func.isRequired,
    selectionCount: PropTypes.number.isRequired,
    showShapeSection: PropTypes.bool,
    transform: PropTypes.shape({
        height: PropTypes.number,
        rotation: PropTypes.number,
        width: PropTypes.number,
        x: PropTypes.number,
        y: PropTypes.number
    }),
    visible: PropTypes.bool.isRequired
};

export default BwPropertiesPanel;
