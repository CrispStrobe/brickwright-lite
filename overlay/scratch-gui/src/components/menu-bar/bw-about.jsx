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
const NOTICES_URL = `${REPO_URL}/blob/main/THIRD-PARTY-NOTICES.md`;
const COMPILER_ABOUT_URL = 'https://stc-compiler.vercel.app/#about';
const COMPILER_HEALTH_URL = 'https://stc-compiler.vercel.app/health';

// The imprint block, mirroring the compiler service's About (its
// IMPRINT_* defaults) — one provider, stated identically in both places.
const PROVIDER = {
    name: 'Christian Ströbele',
    address: ['Nikolausstr. 5', '70190 Stuttgart', 'Deutschland / Germany'],
    email: 'postmaster@crispstro.be',
    phone: '+49 176 6421 8601'
};

/** Component / licence table. Rows are [what, licence, url]. */
const COMPONENTS = [
    ['Brickwright-lite — this app', 'MIT + BSD-3/Apache-2.0 (pre-relicense Scratch stack)', `${REPO_URL}/blob/main/LICENSE`],
    ['bw-board · bw-circuit-ui · sb3-creator (engine, designer, transpiler)', 'MIT', 'https://github.com/CrispStrobe'],
    ['@wokwi/elements (part artwork) · avr8js (AVR emulator)', 'MIT', 'https://github.com/wokwi'],
    ['emu8051 fork (8051 emulator)', 'MIT', 'https://github.com/CrispStrobe/emu8051-stc'],
    ['Skulpt (Python preview)', 'MIT', 'https://github.com/skulpt/skulpt'],
    ['SDCC — hosted compile service (separate program, not bundled)', 'GPL-2.0+, runs server-side', COMPILER_ABOUT_URL],
    ['SDCC-WASM — optional local compiler (opt-in download)', 'GPL-2.0+, separate artifact', NOTICES_URL]
];

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
        copy: 'Copy version details',
        provider: 'Provider (Impressum)',
        contact: 'Contact',
        email: 'E-mail',
        phone: 'Phone',
        privacy: 'Privacy',
        privacyText: 'This is a static page: no accounts, no tracking by us, and projects stay ' +
            'in your browser. Pressing Build/Run sends your program text to the compile service ' +
            'to be compiled and is not stored; the optional local compiler removes even that.',
        disclaimer: 'Disclaimer',
        disclaimerText: 'An educational tool. The simulation is a model, not silicon: check ' +
            'polarity, voltage and current limits before wiring real hardware, and treat ' +
            'anything not verified on a real chip as unverified.',
        components: 'Components and licences',
        notices: 'Full third-party notices',
        affil: 'Affiliation',
        affilText: 'Not affiliated with or endorsed by Scratch / MIT, STC, Arduino, or ' +
            'Raspberry Pi. Trademarks belong to their owners.',
        toolchain: 'Compile service',
        toolchainLoading: 'asking the service…',
        toolchainDown: 'service not reachable right now — compiling will say why'
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
        copy: 'Versionsdetails kopieren',
        provider: 'Anbieter (Impressum)',
        contact: 'Kontakt',
        email: 'E-Mail',
        phone: 'Telefon',
        privacy: 'Datenschutz',
        privacyText: 'Dies ist eine statische Seite: keine Konten, kein Tracking durch uns, ' +
            'Projekte bleiben im Browser. Build/Run sendet den Programmtext zum Kompilieren an ' +
            'den Compile-Dienst und wird nicht gespeichert; der optionale lokale Compiler ' +
            'vermeidet auch das.',
        disclaimer: 'Haftungsausschluss',
        disclaimerText: 'Ein Lernwerkzeug. Die Simulation ist ein Modell, kein Silizium: vor ' +
            'echter Hardware Polung, Spannungen und Stromgrenzen prüfen; alles ohne Nachweis ' +
            'auf echtem Chip gilt als unverifiziert.',
        components: 'Komponenten und Lizenzen',
        notices: 'Vollständige Third-Party-Hinweise',
        affil: 'Zugehörigkeit',
        affilText: 'Nicht verbunden mit oder unterstützt von Scratch / MIT, STC, Arduino oder ' +
            'Raspberry Pi. Marken gehören ihren Eigentümern.',
        toolchain: 'Compile-Dienst',
        toolchainLoading: 'frage den Dienst…',
        toolchainDown: 'Dienst gerade nicht erreichbar — beim Kompilieren steht warum'
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
        this.state = {open: false, copied: false, toolchain: null};
        this.handleToggle = this.handleToggle.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleCopy = this.handleCopy.bind(this);
        this.handleKeyDown = this.handleKeyDown.bind(this);
    }
    componentDidMount () {
        document.addEventListener('keydown', this.handleKeyDown);
        this.openFromSettings = () => this.setState({open: true, copied: false});
        window.addEventListener('bw-open-about', this.openFromSettings);
    }
    componentWillUnmount () {
        document.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('bw-open-about', this.openFromSettings);
    }
    handleKeyDown (event) {
        if (event.key === 'Escape' && this.state.open) this.handleClose();
    }
    handleToggle () {
        const opening = !this.state.open;
        this.setState({open: opening, copied: false});
        // The dialog states the WHOLE chain: this build, and the toolchains
        // that will compile for it. Fetched on open, never blocking render;
        // /health carries CORS and reports the service's own deploy commit.
        if (opening && !this.state.toolchain) {
            fetch(COMPILER_HEALTH_URL, {cache: 'no-store'})
                .then(r => r.json())
                .then(info => this.setState({toolchain: info}))
                .catch(() => this.setState({toolchain: {ok: false}}));
        }
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
                {this.props.hideTrigger ? null : (
                    <button
                        className={styles.trigger}
                        title={`${t('about')} — ${VERSION}`}
                        type="button"
                        onClick={this.handleToggle}
                    >
                        {VERSION}
                    </button>
                )}
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

                            <div className={styles.section}>
                                <div className={styles.heading}>{t('provider')}</div>
                                <address className={styles.address}>
                                    <strong>{PROVIDER.name}</strong><br />
                                    {PROVIDER.address.map(line => [line, <br key={line} />])}
                                </address>
                                <div className={styles.heading}>{t('contact')}</div>
                                <p className={styles.body}>
                                    {t('email')}: <a href={`mailto:${PROVIDER.email}`}>{PROVIDER.email}</a><br />
                                    {t('phone')}: <a href={`tel:${PROVIDER.phone.replace(/[^+0-9]/g, '')}`}>{PROVIDER.phone}</a>
                                </p>
                                <div className={styles.heading}>{t('privacy')}</div>
                                <p className={styles.body}>{t('privacyText')}</p>
                                <div className={styles.heading}>{t('disclaimer')}</div>
                                <p className={styles.body}>{t('disclaimerText')}</p>
                                <div className={styles.heading}>{t('components')}</div>
                                <table className={styles.licences}>
                                    <tbody>
                                        {COMPONENTS.map(([what, lic, url]) => (
                                            <tr key={what}>
                                                <td>{what}</td>
                                                <td>
                                                    <a href={url} rel="noopener noreferrer" target="_blank">{lic}</a>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className={styles.body}>
                                    <a href={NOTICES_URL} rel="noopener noreferrer" target="_blank">{t('notices')}</a>
                                </p>
                                <div className={styles.heading}>{t('toolchain')}</div>
                                <p className={classNames(styles.body, styles.mono)}>
                                    {this.state.toolchain === null ? t('toolchainLoading') :
                                        this.state.toolchain.ok === false ? t('toolchainDown') : [
                                            this.state.toolchain.version ?
                                                `service ${this.state.toolchain.version}` : null,
                                            this.state.toolchain.sdcc || null,
                                            this.state.toolchain.avr_gcc || null
                                        ].filter(Boolean).join(' · ')}
                                </p>
                                <div className={styles.heading}>{t('affil')}</div>
                                <p className={styles.body}>{t('affilText')}</p>
                            </div>

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
    locale: PropTypes.string,
    hideTrigger: PropTypes.bool
};

const mapStateToProps = state => ({
    locale: state.locales && state.locales.locale
});

export default connect(mapStateToProps)(BwAbout);
