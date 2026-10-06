// ---------------------------------------------------------------------------------------------
// The in-app text-input dialog `promptAsync` shows in the Tauri app (task E8; why: see
// lib/native-dialog.js). One question at a time; a second request waits for the first answer.
//
// Accessibility and input: role="dialog" + aria-modal, labelled and described by the question;
// the text field has focus (its text selected) when it opens; Tab and Shift+Tab stay inside the
// dialog; Enter answers OK, Escape answers Cancel; focus returns to where it was. The field uses
// a 16px font (iOS zooms the page into a smaller one) and the buttons are 44px tall; the box is
// at most 28rem wide and never wider than the window less 16px on each side, so it fits a phone.
// ---------------------------------------------------------------------------------------------
import PropTypes from 'prop-types';
import React from 'react';
import ReactDOM from 'react-dom';

export const PROMPT_STRINGS = {
    en: {ok: 'OK', cancel: 'Cancel', title: 'Input'},
    de: {ok: 'OK', cancel: 'Abbrechen', title: 'Eingabe'}
};

/**
 * The editor's language (the store's, as set in the menu), else the browser's.
 * @returns {string} 'en' or 'de'
 */
export const promptLocale = () => {
    let locale = '';
    try {
        locale = String(window.__brickwrightStore.getState().locales.locale || '');
    } catch (error) { /* the store is not mounted yet */ }
    if (!locale && typeof navigator !== 'undefined') locale = String(navigator.language || '');
    const two = locale.slice(0, 2).toLowerCase();
    return PROMPT_STRINGS[two] ? two : 'en';
};

const FOCUSABLE = 'input, button';
let serial = 0;

const STYLES = {
    backdrop: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2147483000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.45)', padding: '16px', boxSizing: 'border-box'
    },
    dialog: {
        width: '28rem', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto',
        boxSizing: 'border-box', background: '#ffffff', color: '#1f2933', borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)', padding: '20px',
        fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif'
    },
    message: {margin: '0 0 12px', fontSize: '15px', lineHeight: 1.4, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere'},
    input: {
        width: '100%', boxSizing: 'border-box', fontSize: '16px', padding: '10px 12px',
        border: '2px solid #4c97ff', borderRadius: '6px', color: '#1f2933', background: '#ffffff'
    },
    buttons: {display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: '8px', marginTop: '16px'},
    button: {
        minHeight: '44px', minWidth: '96px', padding: '0 16px', fontSize: '15px', borderRadius: '6px',
        border: '1px solid #b8c4ce', background: '#f2f5f8', color: '#1f2933', cursor: 'pointer'
    },
    primary: {border: '1px solid #3373cc', background: '#4c97ff', color: '#ffffff', fontWeight: 'bold'}
};

export class PromptModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {value: props.defaultValue};
        this.id = `bw-prompt-${++serial}`;
        this.answered = false;
        this.setDialog = node => { this.dialog = node; };
        this.setInput = node => { this.input = node; };
        this.handleChange = event => this.setState({value: event.target.value});
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.handleOk = () => this.answer(this.state.value);
        this.handleCancel = () => this.answer(null);
    }
    componentDidMount () {
        this.restoreFocus = typeof document !== 'undefined' ? document.activeElement : null;
        if (this.input) {
            this.input.focus();
            if (typeof this.input.select === 'function') this.input.select();
        }
        // Focus that lands outside the dialog (a library modal underneath re-focusing itself
        // after the window regains focus, a stray programmatic focus) comes back to the field.
        this.handleFocusIn = event => {
            if (!this.dialog || this.dialog.contains(event.target)) return;
            setTimeout(() => {
                if (this.input && this.dialog && !this.dialog.contains(document.activeElement)) this.input.focus();
            }, 0);
        };
        document.addEventListener('focus', this.handleFocusIn, true);
    }
    componentWillUnmount () {
        document.removeEventListener('focus', this.handleFocusIn, true);
        const target = this.restoreFocus;
        if (target && typeof target.focus === 'function' && target !== document.body) {
            try { target.focus(); } catch (error) { /* it left the page */ }
        }
    }
    answer (value) {
        if (this.answered) return;
        this.answered = true;
        this.props.onAnswer(typeof value === 'string' ? value : null);
    }
    handleKeyDown (event) {
        // Keys typed here are the dialog's: no React handler underneath sees them (Scratch's own
        // document listener already ignores keys aimed at an input).
        event.stopPropagation();
        if (event.key === 'Escape' || event.key === 'Esc') {
            event.preventDefault();
            this.handleCancel();
        } else if (event.key === 'Enter' && event.target === this.input) {
            event.preventDefault();
            this.handleOk();
        } else if (event.key === 'Tab' && this.dialog) {
            const items = Array.prototype.slice.call(this.dialog.querySelectorAll(FOCUSABLE));
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !this.dialog.contains(active))) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || !this.dialog.contains(active))) {
                event.preventDefault();
                first.focus();
            }
        }
    }
    render () {
        const t = PROMPT_STRINGS[this.props.locale] || PROMPT_STRINGS.en;
        return (
            <div
                data-bw-prompt-backdrop=""
                style={STYLES.backdrop}
            >
                <div
                    aria-describedby={`${this.id}-message`}
                    aria-label={this.props.message ? null : t.title}
                    aria-labelledby={this.props.message ? `${this.id}-message` : null}
                    aria-modal="true"
                    data-bw-prompt-modal=""
                    dir="auto"
                    ref={this.setDialog}
                    role="dialog"
                    style={STYLES.dialog}
                    onKeyDown={this.handleKeyDown}
                >
                    <p
                        id={`${this.id}-message`}
                        style={STYLES.message}
                    >{this.props.message}</p>
                    <input
                        aria-labelledby={this.props.message ? `${this.id}-message` : null}
                        aria-label={this.props.message ? null : t.title}
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                        data-bw-prompt-input=""
                        ref={this.setInput}
                        spellCheck={false}
                        style={STYLES.input}
                        type="text"
                        value={this.state.value}
                        onChange={this.handleChange}
                    />
                    <div style={STYLES.buttons}>
                        <button
                            data-bw-prompt-cancel=""
                            style={STYLES.button}
                            type="button"
                            onClick={this.handleCancel}
                        >{t.cancel}</button>
                        <button
                            data-bw-prompt-ok=""
                            style={Object.assign({}, STYLES.button, STYLES.primary)}
                            type="button"
                            onClick={this.handleOk}
                        >{t.ok}</button>
                    </div>
                </div>
            </div>
        );
    }
}

PromptModal.propTypes = {
    defaultValue: PropTypes.string,
    locale: PropTypes.string,
    message: PropTypes.string,
    onAnswer: PropTypes.func.isRequired
};
PromptModal.defaultProps = {defaultValue: '', locale: 'en', message: ''};

let queue = Promise.resolve();
const text = value => (value === null || typeof value === 'undefined' ? '' : String(value));

const showOne = ({message, defaultValue, locale}) => new Promise(resolve => {
    const host = document.createElement('div');
    host.setAttribute('data-bw-prompt-host', '');
    document.body.appendChild(host);
    const onAnswer = value => {
        ReactDOM.unmountComponentAtNode(host);
        if (host.parentNode) host.parentNode.removeChild(host);
        resolve(value);
    };
    ReactDOM.render(
        <PromptModal
            defaultValue={defaultValue}
            locale={locale || promptLocale()}
            message={message}
            onAnswer={onAnswer}
        />,
        host
    );
});

/**
 * Show the dialog and resolve with the answer: the text on OK (possibly ''), null on Cancel.
 * @param {{message: string, defaultValue: string, locale: (string|undefined)}} question what to ask
 * @returns {Promise<?string>} the answer
 */
export const showPromptModal = question => {
    const asked = queue.then(() => showOne({
        message: text(question.message),
        defaultValue: text(question.defaultValue),
        locale: question.locale
    }));
    queue = asked.catch(() => null);
    return asked;
};
