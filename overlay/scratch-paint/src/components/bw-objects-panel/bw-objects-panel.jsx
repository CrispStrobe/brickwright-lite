import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';

import tx from '../../lib/bw-messages';
import {Eye, Padlock} from '../bw-properties-panel/bw-icons.jsx';

import styles from './bw-objects-panel.css';

/**
 * Brickwright: the objects tree.
 *
 * Listed TOP FIRST, so "top of the list" and "in front" mean the same thing — paper stores its
 * children the other way round and the container flips them.
 */

const ObjectRow = props => {
    const {locale, object} = props;
    const t = key => tx(locale, key);

    return (
        <li
            className={classNames(styles.row, {
                [styles.rowSelected]: object.selected,
                [styles.rowDragOver]: props.isDragTarget,
                [styles.rowDimmed]: object.hidden || object.locked
            })}
            draggable
            onDragEnd={props.onDragEnd}
            onDragOver={props.onDragOver}
            onDragStart={props.onDragStart}
            onDrop={props.onDrop}
        >
            <button
                className={styles.rowIcon}
                title={object.hidden ? t('showObject') : t('hideObject')}
                type="button"
                onClick={props.onToggleHidden}
            >
                <Eye closed={object.hidden} />
            </button>
            <button
                className={styles.rowIcon}
                title={object.locked ? t('unlockObject') : t('lockObject')}
                type="button"
                onClick={props.onToggleLocked}
            >
                <Padlock locked={object.locked} />
            </button>
            {props.isEditing ?
                <input
                    autoFocus
                    className={styles.rowInput}
                    defaultValue={object.name}
                    placeholder={object.label}
                    onBlur={event => props.onRename(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter') event.target.blur();
                        // Escape leaves the name alone; blur would otherwise commit the draft.
                        if (event.key === 'Escape') props.onCancelRename();
                    }}
                /> :
                <button
                    className={styles.rowLabel}
                    title={t('renameHint')}
                    type="button"
                    onClick={props.onSelect}
                    onDoubleClick={props.onStartRename}
                >
                    {object.label}
                </button>
            }
        </li>
    );
};

ObjectRow.propTypes = {
    isDragTarget: PropTypes.bool,
    isEditing: PropTypes.bool,
    locale: PropTypes.string,
    object: PropTypes.shape({
        hidden: PropTypes.bool,
        label: PropTypes.string,
        locked: PropTypes.bool,
        name: PropTypes.string,
        selected: PropTypes.bool
    }).isRequired,
    onCancelRename: PropTypes.func.isRequired,
    onDragEnd: PropTypes.func.isRequired,
    onDragOver: PropTypes.func.isRequired,
    onDragStart: PropTypes.func.isRequired,
    onDrop: PropTypes.func.isRequired,
    onRename: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    onStartRename: PropTypes.func.isRequired,
    onToggleHidden: PropTypes.func.isRequired,
    onToggleLocked: PropTypes.func.isRequired
};

const BwObjectsPanel = props => {
    const t = key => tx(props.locale, key);

    return (
        <div className={styles.panel}>
            <div className={styles.sectionTitle}>
                {t('objects')}
                <span className={styles.count}>{props.objects.length}</span>
            </div>
            {props.objects.length === 0 ?
                <div className={styles.empty}>{t('noObjects')}</div> :
                <ul className={styles.list}>
                    {props.objects.map((object, index) => (
                        <ObjectRow
                            isDragTarget={props.dragTargetIndex === index}
                            isEditing={props.editingId === object.id}
                            key={object.id}
                            locale={props.locale}
                            object={object}
                            onCancelRename={props.onCancelRename}
                            onDragEnd={props.onDragEnd}
                            onDragOver={event => props.onDragOver(event, index)}
                            onDragStart={() => props.onDragStart(index)}
                            onDrop={() => props.onDrop(index)}
                            onRename={name => props.onRename(object, name)}
                            onSelect={event => props.onSelect(object, event.shiftKey)}
                            onStartRename={() => props.onStartRename(object.id)}
                            onToggleHidden={() => props.onToggleHidden(object)}
                            onToggleLocked={() => props.onToggleLocked(object)}
                        />
                    ))}
                </ul>
            }
        </div>
    );
};

BwObjectsPanel.propTypes = {
    dragTargetIndex: PropTypes.number,
    editingId: PropTypes.number,
    locale: PropTypes.string,
    objects: PropTypes.arrayOf(PropTypes.object).isRequired,
    onCancelRename: PropTypes.func.isRequired,
    onDragEnd: PropTypes.func.isRequired,
    onDragOver: PropTypes.func.isRequired,
    onDragStart: PropTypes.func.isRequired,
    onDrop: PropTypes.func.isRequired,
    onRename: PropTypes.func.isRequired,
    onSelect: PropTypes.func.isRequired,
    onStartRename: PropTypes.func.isRequired,
    onToggleHidden: PropTypes.func.isRequired,
    onToggleLocked: PropTypes.func.isRequired
};

export default BwObjectsPanel;
