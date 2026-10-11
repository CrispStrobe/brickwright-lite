import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';

const ARCADE_DIALOG_L10N = {
    en: {longText: 'Arcade long text', splash: 'Arcade splash screen', continue: 'Continue', ask:'Arcade question', yes:'Yes (A)', no:'No (B)'},
    de: {longText: 'Arcade-Langtext', splash: 'Arcade-Startbildschirm', continue: 'Weiter', ask:'Arcade-Frage', yes:'Ja (A)', no:'Nein (B)'}
};
const at = makeT(ARCADE_DIALOG_L10N);
import styles from './stage.css';

export default function ArcadeDialog({dialog, onDismiss}) {
    const yesRef = useRef(null);
    const ready = dialog.type === 'ask' && dialog.elapsed >= 500;
    useEffect(() => {if (ready) yesRef.current?.focus();}, [dialog, ready]);
    const arcadeDialogStyle = dialog?.type === 'longText' ? {
        justifyContent: dialog.layout === 'Top' ? 'flex-start' :
            dialog.layout === 'Bottom' ? 'flex-end' : 'center',
        alignItems: dialog.layout === 'Left' ? 'flex-start' :
            dialog.layout === 'Right' ? 'flex-end' : 'center'
    } : undefined;

    return createPortal(
        <div className={styles.arcadeDialogOverlay} role="dialog" aria-modal="true"
            aria-label={at(browserLocale(), dialog.type === 'ask' ? 'ask' : dialog.type === 'longText' ? 'longText' : 'splash')}
            style={arcadeDialogStyle}
            onKeyDown={event => {
                if (dialog.type === 'ask') {
                    if (event.repeat) {event.preventDefault();return;}
                    if (['z','Z','Escape'].includes(event.key)) {
                        event.preventDefault();event.stopPropagation();onDismiss(false);
                    }
                    return;
                }
                if (event.key !== 'Tab') {
                    event.preventDefault();
                    event.stopPropagation();
                    onDismiss();
                }
            }}>
            <div className={styles.arcadeDialogText}
                style={dialog.layout === 'Full' ? {width: '100%', maxHeight: '85vh'} : undefined}>
                <strong>{dialog.title}</strong>
                {dialog.subtitle ? <span>{dialog.subtitle}</span> : null}
            </div>
            {dialog.type === 'ask' ? <div style={{display:'flex',gap:12,flexWrap:'wrap'}}>
                <button ref={yesRef} className={styles.arcadeDialogButton} data-testid="bw-arcade-question-yes"
                    disabled={dialog.elapsed < 500} onClick={() => onDismiss(true)}>{at(browserLocale(),'yes')}</button>
                <button className={styles.arcadeDialogButton} data-testid="bw-arcade-question-no"
                    disabled={dialog.elapsed < 500} onClick={() => onDismiss(false)}>{at(browserLocale(),'no')}</button>
            </div> : <button autoFocus className={styles.arcadeDialogButton}
                onClick={() => onDismiss()}>{at(browserLocale(), 'continue')}</button>}
        </div>, document.body
    );
}
