/**
 * CodeMirror 6 React wrapper for BrickWright's Code tab.
 *
 * Lazy-loaded via React.lazy() in pseudocode-importer.jsx so blocks-only
 * users never download the ~200 KB CM chunk.
 *
 * Design:
 * - CM6 is uncontrolled internally; we sync external `value` changes via
 *   dispatch and prevent feedback loops with an `_updating` flag.
 * - `setHighlightedLine(n)` for debugger use (line decoration).
 * - Theme follows `bw-circuit-theme` localStorage (light/dark).
 * - Language modes switch when the `lang` prop changes.
 * - Auto-indent rule: increase indent after lines ending with a colon
 *   (pseudocode structural pattern).
 */
import React from 'react';
import PropTypes from 'prop-types';

import {EditorView, keymap, lineNumbers, highlightActiveLine, highlightSpecialChars,
    drawSelection, rectangularSelection} from '@codemirror/view';
import {EditorState, Compartment} from '@codemirror/state';
import {defaultKeymap, indentWithTab, history, historyKeymap, undo, redo, selectAll} from '@codemirror/commands';
import {searchKeymap, openSearchPanel} from '@codemirror/search';
import {bracketMatching} from '@codemirror/language';
import {closeBrackets, closeBracketsKeymap} from '@codemirror/autocomplete';
import {indentOnInput, foldGutter, syntaxHighlighting, defaultHighlightStyle,
    indentUnit, LanguageSupport} from '@codemirror/language';
import {oneDark} from '@codemirror/theme-one-dark';

import LatestLanguageRequest from './latest-language-request.js';
import {
    immediateCodeMirrorLanguage,
    loadDeferredCodeMirrorLanguage,
    plainTextLanguage
} from './codemirror-languages.js';
import {Decoration, ViewPlugin} from '@codemirror/view';
import {StateField, StateEffect} from '@codemirror/state';

// ── Highlighted-line decoration (for debugger) ─────────────────────
const setHighlightEffect = StateEffect.define();

const highlightedLineField = StateField.define({
    create: () => Decoration.none,
    update (decos, tr) {
        for (const e of tr.effects) {
            if (e.is(setHighlightEffect)) {
                if (e.value === null) return Decoration.none;
                const line = tr.state.doc.line(Math.min(e.value, tr.state.doc.lines));
                const deco = Decoration.line({class: 'cm-bw-highlighted-line'}).range(line.from);
                return Decoration.set([deco]);
            }
        }
        return decos.map(tr.changes);
    },
    provide: f => EditorView.decorations.from(f)
});

// ── Auto-indent after colon (pseudocode pattern) ──────────────────
// CM6 indentOnInput handles the re-indent on typing; this adds the
// "increase after colon" rule via a simple language data facet.
// We override indent for pseudocode: if the previous non-empty line
// ends with ":", indent one level deeper.
const pseudocodeIndent = EditorView.updateListener.of(update => {
    // Only act on user input that produces a newline
    if (!update.docChanged) return;
    for (const tr of update.transactions) {
        if (!tr.isUserEvent('input')) continue;
        tr.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
            const text = inserted.toString();
            if (text !== '\n' && text !== '\r\n') return;
            // Find the line we just left (the one before the cursor)
            const pos = fromB + text.length;
            const state = update.state;
            const curLine = state.doc.lineAt(pos);
            if (curLine.number <= 1) return;
            const prevLine = state.doc.line(curLine.number - 1);
            const prevText = prevLine.text;
            const prevIndent = prevText.match(/^(\s*)/)[1];
            const trimmed = prevText.trimEnd();
            if (trimmed.endsWith(':')) {
                const newIndent = prevIndent + '  ';
                // Only add indent if the current line doesn't already have it
                if (!curLine.text.startsWith(newIndent) || curLine.text === '') {
                    update.view.dispatch({
                        changes: {from: curLine.from, to: curLine.from + curLine.text.match(/^\s*/)[0].length, insert: newIndent}
                    });
                }
            }
        });
    }
});

// ── Theme styles ──────────────────────────────────────────────────
const bwLightTheme = EditorView.theme({
    // Fill the flex container so CM6's own scroller handles overflow
    '&': {fontSize: '13px', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', height: '100%'},
    '.cm-scroller': {overflow: 'auto'},
    '.cm-content': {padding: '8px 0'},
    '.cm-gutters': {background: '#f8fafc', borderRight: '1px solid #e2e8f0', color: '#94a3b8'},
    '.cm-activeLine': {background: 'hsla(215, 100%, 95%, 0.5)'},
    '.cm-bw-highlighted-line': {background: 'hsla(45, 100%, 85%, 0.6)'},
    '&.cm-focused': {outline: '2px solid #4c97ff'},
    '.cm-selectionBackground': {background: 'hsla(215, 100%, 85%, 0.4) !important'}
});

const bwDarkTheme = EditorView.theme({
    '.cm-bw-highlighted-line': {background: 'hsla(45, 80%, 30%, 0.5)'}
}, {dark: true});


class CodeMirrorEditor extends React.Component {
    constructor (props) {
        super(props);
        this._ref = React.createRef();
        this._view = null;
        this._updating = false; // prevent feedback loop
        this._langCompartment = new Compartment();
        this._themeCompartment = new Compartment();
        this._readOnlyCompartment = new Compartment();
        this._onSettingsChange = this._onSettingsChange.bind(this);
        this._languageRequest = new LatestLanguageRequest({
            getImmediate: immediateCodeMirrorLanguage,
            loadDeferred: loadDeferredCodeMirrorLanguage,
            fallback: plainTextLanguage,
            apply: extension => {
                if (!this._view) return;
                this._view.dispatch({
                    effects: this._langCompartment.reconfigure(extension)
                });
            },
            onError: (error, language) => {
                // Highlighting is optional. The editor stays usable as plain
                // text, and selecting the language again retries the chunk.
                console.warn(`CodeMirror ${language} grammar failed to load`, error);
            }
        });
    }

    componentDidMount () {
        const dark = this._isDark();
        const initialLanguage = immediateCodeMirrorLanguage(this.props.lang);
        const extensions = [
            lineNumbers(),
            highlightActiveLine(),
            highlightSpecialChars(),
            history(),
            drawSelection(),
            rectangularSelection(),
            bracketMatching(),
            closeBrackets(),
            indentOnInput(),
            indentUnit.of('  '),
            foldGutter(),
            syntaxHighlighting(defaultHighlightStyle, {fallback: true}),
            keymap.of([
                // On macOS, CodeMirror's defaultKeymap binds Ctrl-a to the
                // emacs "cursor to line start" command (Mod-a / Cmd-a is
                // select-all there). Web users — and cross-platform tooling —
                // expect Ctrl-a to select all everywhere, so bind it explicitly
                // ahead of the defaults on every OS.
                {key: 'Ctrl-a', run: selectAll, preventDefault: true},
                ...closeBracketsKeymap,
                ...defaultKeymap,
                ...historyKeymap,
                ...searchKeymap,
                indentWithTab
            ]),
            highlightedLineField,
            pseudocodeIndent,
            this._langCompartment.of(
                initialLanguage || plainTextLanguage
            ),
            this._themeCompartment.of(dark ? [oneDark, bwDarkTheme] : [bwLightTheme]),
            this._readOnlyCompartment.of(EditorState.readOnly.of(!!this.props.readOnly)),
            EditorView.updateListener.of(update => {
                if (update.docChanged && !this._updating && this.props.onChange) {
                    this._updating = true;
                    this.props.onChange(update.state.doc.toString());
                    this._updating = false;
                }
            }),
            EditorView.lineWrapping
        ];

        this._view = new EditorView({
            state: EditorState.create({
                doc: this.props.value || '',
                extensions
            }),
            parent: this._ref.current
        });

        if (initialLanguage === undefined) {
            this._languageRequest.select(this.props.lang);
        }

        window.addEventListener('bw-settings-change', this._onSettingsChange);
    }

    componentDidUpdate (prevProps) {
        if (!this._view) return;

        // External value change (tab switch, example load, from-blocks, etc.)
        if (this.props.value !== prevProps.value && !this._updating) {
            const current = this._view.state.doc.toString();
            if (this.props.value !== current) {
                this._updating = true;
                this._view.dispatch({
                    changes: {from: 0, to: current.length, insert: this.props.value || ''}
                });
                this._updating = false;
            }
        }

        // Language change
        if (this.props.lang !== prevProps.lang) {
            this._languageRequest.select(this.props.lang);
        }

        // ReadOnly change
        if (this.props.readOnly !== prevProps.readOnly) {
            this._view.dispatch({
                effects: this._readOnlyCompartment.reconfigure(
                    EditorState.readOnly.of(!!this.props.readOnly)
                )
            });
        }
    }

    componentWillUnmount () {
        window.removeEventListener('bw-settings-change', this._onSettingsChange);
        this._languageRequest.dispose();
        if (this._view) {
            this._view.destroy();
            this._view = null;
        }
    }

    _isDark () {
        try { return localStorage.getItem('bw-circuit-theme') === 'dark'; } catch { return false; }
    }

    _onSettingsChange (e) {
        if (!e.detail || e.detail.key !== 'bw-circuit-theme' || !this._view) return;
        const dark = e.detail.value === 'dark';
        this._view.dispatch({
            effects: this._themeCompartment.reconfigure(
                dark ? [oneDark, bwDarkTheme] : [bwLightTheme]
            )
        });
    }

    /** Imperative API for the debugger: highlight line n (1-based), or null to clear. */
    setHighlightedLine (n) {
        if (!this._view) return;
        this._view.dispatch({
            effects: setHighlightEffect.of(n)
        });
        // Scroll the highlighted line into view
        if (n !== null && n >= 1 && n <= this._view.state.doc.lines) {
            const line = this._view.state.doc.line(n);
            this._view.dispatch({
                effects: EditorView.scrollIntoView(line.from, {y: 'center'})
            });
        }
    }

    /** Imperative API: focus the editor. */
    focus () {
        if (this._view) this._view.focus();
    }

    render () {
        // flex:1 + minHeight:0 is the classic flex column trick: it makes
        // this container take remaining space, and minHeight:0 overrides
        // the default min-height:auto that prevents shrinking below content.
        // CM6's .cm-editor gets height:100% so its .cm-scroller scrolls.
        const style = {
            flex: '1 1 0',
            minHeight: 0,
            width: '100%',
            border: this.props.readOnly ? '1px solid #e2e8f0' : '1px solid #cbd5e1',
            borderRadius: 8,
            overflow: 'hidden'
        };
        return <div ref={this._ref} style={style} data-testid="bw-codemirror" />;
    }
}

CodeMirrorEditor.propTypes = {
    value: PropTypes.string,
    onChange: PropTypes.func,
    readOnly: PropTypes.bool,
    lang: PropTypes.string
};

export default CodeMirrorEditor;
