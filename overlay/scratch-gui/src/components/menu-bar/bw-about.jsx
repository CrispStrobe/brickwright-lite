import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {connect} from 'react-redux';

import styles from './bw-about.css';

/**
 * Brickwright: the About box, and the build stamp behind it.
 *
 * This exists because "which version am I looking at?" had no answer from inside the running app.
 * Working that out meant fetching the deployed index.html, reading the hashed entry filename out
 * of it, and comparing that against a local build — which is not something a user can be asked to
 * do, and it made every bug report ambiguous: a report of "not fixed" could equally mean a stale
 * tab, a deploy that had not landed yet, or a real regression, with no way to tell them apart.
 *
 * The version is stamped in at build time by webpack's DefinePlugin (see webpack.config.js), from
 * GITHUB_SHA in CI, VERCEL_GIT_COMMIT_SHA on Vercel, or `git rev-parse` locally.
 */

// Substituted at build time. The fallbacks keep this component honest in a dev server or any
// other build that did not define them, rather than rendering "undefined" as if it were a version.
const VERSION = (typeof process.env.BW_VERSION === 'string' && process.env.BW_VERSION) || 'unknown';
const BUILD_TIME = (typeof process.env.BW_BUILD_TIME === 'string' && process.env.BW_BUILD_TIME) || '';

const REPO_URL = 'https://github.com/CrispStrobe/brickwright-lite';

const L10N = {
    en: {
        about: 'About Brickwright',
        version: 'Version',
        built: 'Built',
        source: 'Source code',
        commit: 'View this commit',
        close: 'Close',
        unknownVersion: 'This build was made without a commit stamp.',
        blurb: 'A fully-permissive fork of the pre-relicense Scratch stack — BSD-3, Apache-2.0 ' +
            'and MIT throughout, so it can be bundled and shipped anywhere.',
        copied: 'Copied',
        copy: 'Copy version details'
    },
    de: {
        about: 'Über Brickwright',
        version: 'Version',
        built: 'Erstellt',
        source: 'Quellcode',
        commit: 'Diesen Commit ansehen',
        close: 'Schließen',
        unknownVersion: 'Dieser Build wurde ohne Commit-Stempel erzeugt.',
        blurb: 'Ein vollständig permissiver Fork des Scratch-Stacks vor der Lizenzänderung — ' +
            'durchgängig BSD-3, Apache-2.0 und MIT, also überall bündelbar und auslieferbar.',
        copied: 'Kopiert',
        copy: 'Versionsdetails kopieren'
    }
};

const tx = (locale, key) => {
    const language = String(locale || 'en').split('-')[0];
    return (L10N[language] || L10N.en)[key] || L10N.en[key] || key;
};

/** @param {string} iso An ISO timestamp. @return {string} A readable local date, or ''. */
const formatBuildTime = iso => {
    if (!iso) return '';
    const date = new Date(iso);
    return isNaN(date.getTime()) ? '' : date.toLocaleString();
};

class BwAbout extends React.Component {
    constructor (props) {
        super(props);
        this.state = {open: false, copied: false};
        this.handleToggle = this.handleToggle.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown);
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
    }
    handleKeyDown (event) {
        if (event.key === 'Escape' && this.state.open) this.handleClose();
    }
    handleToggle () {
        this.setState({open: !this.state.open, copied: false});
    }
    handleClose () {
        this.setState({open: false});
    }
    handleCopy () {
        // The whole point is pasting this into a bug report, so copy the details as one block.
        const text = `Brickwright ${VERSION}${BUILD_TIME ? ` (built ${BUILD_TIME})` : ''}\n` +
            `${navigator.userAgent}`;
        const done = () => this.setState({copied: true});
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, () => {});
        }
    }
    render () {
        const {locale} = this.props;
        const t = key => tx(locale, key);
        const known = VERSION !== 'unknown';
        const buildTime = formatBuildTime(BUILD_TIME);

        return (
            <React.Fragment>
                <button
                    className={styles.trigger}
                    title={`${t('about')} — ${VERSION}`}
                    type="button"
                    onClick={this.handleToggle}
                >
                    {VERSION}
                </button>
                {this.state.open ? (
                    <div
                        className={styles.backdrop}
                        onClick={this.handleClose}
                    >
                        <div
                            className={styles.dialog}
                            onClick={event => event.stopPropagation()}
                        >
                            <div className={styles.title}>{t('about')}</div>
                            <p className={styles.blurb}>{t('blurb')}</p>

                            <dl className={styles.details}>
                                <dt>{t('version')}</dt>
                                <dd className={styles.mono}>{VERSION}</dd>
                                {buildTime ? [
                                    <dt key="built-label">{t('built')}</dt>,
                                    <dd key="built-value">{buildTime}</dd>
                                ] : null}
                            </dl>

                            {known ? null :
                                <p className={styles.warning}>{t('unknownVersion')}</p>}

                            <div className={styles.links}>
                                <a
                                    href={REPO_URL}
                                    rel="noopener noreferrer"
                                    target="_blank"
                                >{t('source')}</a>
                                {known ? (
                                    <a
                                        href={`${REPO_URL}/commit/${VERSION}`}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >{t('commit')}</a>
                                ) : null}
                            </div>

                            <div className={styles.actions}>
                                <button
                                    className={classNames(styles.button, styles.buttonSecondary)}
                                    type="button"
                                    onClick={this.handleCopy}
                                >
                                    {this.state.copied ? t('copied') : t('copy')}
                                </button>
                                <button
                                    className={styles.button}
                                    type="button"
                                    onClick={this.handleClose}
                                >
                                    {t('close')}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </React.Fragment>
        );
    }
}

BwAbout.propTypes = {
    locale: PropTypes.string
};

const mapStateToProps = state => ({
    locale: state.locales && state.locales.locale
});

export default connect(mapStateToProps)(BwAbout);
