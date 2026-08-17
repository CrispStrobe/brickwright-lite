// Brickwright offline asset-library dialog (native app only). Self-contained —
// a fixed overlay with its own state, no dependency on scratch-gui's Modal API,
// so it can't break the shared web build. Drives lib/offline-assets.js: download
// the costume/sound/backdrop library to the local cache (fetched from Scratch's
// CDN — nothing bundled/re-hosted; see PLAN.md §25), show progress, or remove it.

import PropTypes from 'prop-types';
import React from 'react';

import styles from './offline-library-modal.css';
import {
    libraryTotal,
    cachedCount,
    downloadLibrary,
    removeLibrary
} from '../../lib/offline-assets.js';

class OfflineLibraryModal extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            total: libraryTotal(),
            cached: 0,
            busy: false,
            progress: null,
            error: null
        };
        this.mounted = true;
        this.handleDownload = this.handleDownload.bind(this);
        this.handleRemove = this.handleRemove.bind(this);
        this.handleBackdropClick = this.handleBackdropClick.bind(this);
        this.handleCardClick = this.handleCardClick.bind(this);
    }
    componentDidMount () {
        this.refreshCached();
    }
    componentWillUnmount () {
        this.mounted = false;
    }
    refreshCached () {
        return cachedCount().then(cached => {
            if (this.mounted) this.setState({cached});
        });
    }
    handleDownload () {
        if (this.state.busy) return;
        this.setState({
            busy: true,
            error: null,
            progress: {done: 0, total: this.state.total, failed: 0}
        });
        downloadLibrary(p => {
            if (this.mounted) this.setState({progress: p});
        })
            .then(() => this.refreshCached())
            .catch(e => {
                if (this.mounted) this.setState({error: String((e && e.message) || e)});
            })
            .then(() => {
                if (this.mounted) this.setState({busy: false});
            });
    }
    handleRemove () {
        if (this.state.busy) return;
        this.setState({busy: true, error: null});
        removeLibrary()
            .then(() => this.refreshCached())
            .then(() => {
                if (this.mounted) this.setState({busy: false, progress: null});
            });
    }
    handleBackdropClick () {
        if (!this.state.busy) this.props.onClose();
    }
    handleCardClick (e) {
        // Clicks inside the card must not bubble to the backdrop (which closes).
        e.stopPropagation();
    }
    render () {
        const {total, cached, busy, progress, error} = this.state;
        const pct = progress && progress.total ?
            Math.round((progress.done / progress.total) * 100) : 0;
        const complete = total > 0 && cached >= total;
        return (
            <div
                className={styles.backdrop}
                onClick={this.handleBackdropClick}
            >
                <div
                    className={styles.card}
                    onClick={this.handleCardClick}
                >
                    <div className={styles.header}>
                        <span className={styles.title}>{'Offline asset library'}</span>
                        <button
                            className={styles.close}
                            onClick={this.props.onClose}
                            disabled={busy}
                        >{'×'}</button>
                    </div>
                    <p className={styles.body}>
                        {'Download the costume, sound and backdrop library to this device so it ' +
                         'works offline. Assets are fetched from Scratch’s servers on demand — ' +
                         'nothing is bundled or re-hosted. Remove them any time to free space.'}
                    </p>
                    <p className={styles.status}>
                        {complete ? '✓ ' : ''}{cached}{' / '}{total}{' assets cached'}
                    </p>
                    {busy && progress && (
                        <div className={styles.progressOuter}>
                            <div
                                className={styles.progressInner}
                                style={{width: `${pct}%`}}
                            />
                            <span className={styles.progressLabel}>
                                {pct}{'%'}
                                {progress.failed ? ` (${progress.failed} failed)` : ''}
                            </span>
                        </div>
                    )}
                    {error && <p className={styles.error}>{error}</p>}
                    <div className={styles.actions}>
                        <button
                            className={styles.primary}
                            onClick={this.handleDownload}
                            disabled={busy || complete}
                        >
                            {busy ? 'Downloading…' : complete ? 'Downloaded' : 'Download library'}
                        </button>
                        <button
                            className={styles.secondary}
                            onClick={this.handleRemove}
                            disabled={busy || cached === 0}
                        >{'Remove'}</button>
                    </div>
                </div>
            </div>
        );
    }
}

OfflineLibraryModal.propTypes = {
    onClose: PropTypes.func.isRequired
};

export default OfflineLibraryModal;
