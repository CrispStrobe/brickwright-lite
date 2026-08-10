import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';

import styles from './pane-strip.css';

/**
 * The collapsed stage column — a labelled strip that clicks back open.
 *
 * Collapsing that column has always produced a 28px slice of the live stage: a fragment
 * of the green flag, a sliced sprite, two orphaned letters off the sprite panel. That was
 * reported as broken when it was a step in the old size-cycling button, and making the
 * divider's double-click the way to reach it changed only how you get there. A collapsed
 * pane has to look collapsed — deliberate, labelled, and obviously reversible — or it
 * reads as the editor having fallen over.
 *
 * It covers the column instead of replacing it. StageWrapper stays mounted underneath:
 * unmounting it would take scratch-render's canvas with it, and remounting a renderer to
 * save 28px of clipped pixels is a bad trade. So the stage is merely hidden behind an
 * opaque lid, and restoring is instant because nothing was ever torn down.
 *
 * Clicking anywhere on the strip restores, which is the second way to do it — the
 * divider's double-click is the first. Both are the same gesture that collapsed it,
 * following the rule chrome-toggle.jsx already states: the control that put something
 * away is the control that brings it back, and there is no "reset layout" anywhere.
 */

// Our components do not go through scratch-l10n, so they read state.locales.locale and
// pick from a table here, falling back to English. Adding a language = adding a column.
const L10N = {
    en: {label: 'Stage', title: 'Show the stage'},
    de: {label: 'Bühne', title: 'Bühne wieder anzeigen'}
};

const PaneStrip = ({locale, onRestore}) => {
    const t = L10N[locale] || L10N.en;
    return (
        <button
            aria-expanded={false}
            className={styles.strip}
            title={t.title}
            type="button"
            onClick={onRestore}
        >
            {/* Points back into the space the column will reoccupy. */}
            <span
                aria-hidden="true"
                className={styles.chevron}
            >{'‹'}</span>
            <span className={styles.label}>{t.label}</span>
        </button>
    );
};

PaneStrip.propTypes = {
    locale: PropTypes.string,
    onRestore: PropTypes.func.isRequired
};

const mapStateToProps = state => ({
    locale: state.locales && state.locales.locale
});

export default connect(mapStateToProps)(PaneStrip);
