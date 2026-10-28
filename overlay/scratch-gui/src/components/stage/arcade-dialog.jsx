import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {makeT, browserLocale} from '../../lib/bw-i18n.js';

const ARCADE_DIALOG_L10N = {
    en: {longText: 'Arcade long text', splash: 'Arcade splash screen', continue: 'Continue', ask:'Arcade question', yes:'Yes (A)', no:'No (B)', previous:'Previous page (Up)', next:'Next page (Down)'},
    de: {longText: 'Arcade-Langtext', splash: 'Arcade-Startbildschirm', continue: 'Weiter', ask:'Arcade-Frage', yes:'Ja (A)', no:'Nein (B)', previous:'Vorherige Seite (Hoch)', next:'Nächste Seite (Runter)'}
};
const at = makeT(ARCADE_DIALOG_L10N);
import styles from './stage.css';

export default function ArcadeDialog({dialog, onDismiss, onButtonEdge}) {
    const held = useRef(new Set());
    const timers = useRef(new Set());
    const edge = (button, down) => {
        if (held.current.has(button) === down) return;
        if (down) held.current.add(button); else held.current.delete(button);
        onButtonEdge?.(button, down);
    };
    useEffect(() => () => {
        for (const timer of timers.current) clearTimeout(timer);
        for (const button of held.current) onButtonEdge?.(button, false);
        held.current.clear();
    }, [onButtonEdge]);
    const pulse = button => {
        edge(button, true);
        const timer = setTimeout(() => {edge(button, false);timers.current.delete(timer);}, 100);
        timers.current.add(timer);
    };
    const yesRef = useRef(null);
    const ready = dialog.type === 'ask' && dialog.elapsed >= 500;
    useEffect(() => {if (ready) yesRef.current?.focus();}, [dialog, ready]);
    const arcadeDialogStyle = dialog?.type === 'longText' ? {
        justifyContent: dialog.layout === 'Top' ? 'flex-start' :
            dialog.layout === 'Bottom' ? 'flex-end' : 'center',
        alignItems: dialog.layout === 'Left' ? 'flex-start' :
            dialog.layout === 'Right' ? 'flex-end' : 'center'
    } : undefined;

    if (dialog.native) {
        const keyButton = key => ({" ":"a",Enter:"a",ArrowDown:"down",ArrowUp:"up"}[key]);
        const button = (name, label) => <button className={styles.arcadeDialogButton}
            data-testid={`bw-arcade-dialog-${name}`}
            onPointerDown={event => {event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);edge(name,true);}}
            onPointerUp={() => edge(name,false)} onPointerCancel={() => edge(name,false)}
            onLostPointerCapture={() => edge(name,false)}
            onClick={event => {if (event.detail === 0) pulse(name);}}>{label}</button>;
        return createPortal(<div className={styles.arcadeDialogNativeControls} role="dialog" aria-modal="true"
            aria-label={at(browserLocale(),dialog.type === "splash" ? "splash" : "longText")}
            onKeyDown={event => {const name=keyButton(event.key);if(name){event.preventDefault();event.stopPropagation();if(!event.repeat)edge(name,true);}}}
            onKeyUp={event => {const name=keyButton(event.key);if(name){event.preventDefault();event.stopPropagation();edge(name,false);}}}
            onBlur={event => {if(!event.currentTarget.contains(event.relatedTarget))for(const name of [...held.current])edge(name,false);}}>
            <span className={styles.arcadeDialogAccessibleText}>{dialog.title} {dialog.subtitle}
                {dialog.type === "longText" ? ` (${dialog.page+1}/${dialog.pages})` : ""}</span>
            {dialog.type === "longText" ? button("up", at(browserLocale(),"previous")) : null}
            {button("a", at(browserLocale(),"continue") + " (A)")}
            {dialog.type === "longText" ? button("down", at(browserLocale(),"next")) : null}
        </div>, document.body);
    }
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
