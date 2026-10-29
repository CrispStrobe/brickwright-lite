import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import {injectIntl, intlShape} from 'react-intl';
import WavEncoder from 'wav-encoder';
import VM from 'scratch-vm';

import {connect} from 'react-redux';

import {
    computeChunkedRMS,
    encodeAndAddSoundToVM,
    downsampleIfNeeded,
    dropEveryOtherSample
} from '../lib/audio/audio-util.js';
import AudioEffects from '../lib/audio/audio-effects.js';
import SoundEditorComponent from '../components/sound-editor/sound-editor.jsx';
import AudioBufferPlayer from '../lib/audio/audio-buffer-player.js';
import log from '../lib/log.js';
import {activateUndoSurface, getUndoState, notifyUndoState, registerUndoSurface} from '../lib/global-undo.js';

import {notifyEditorMenuActions, registerEditorMenuActions} from '../lib/editor-menu-actions.js';

const UNDO_STACK_SIZE = 99;

const MAX_RMS = 1.2;

class SoundEditor extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'copy',
            'copyCurrentBuffer',
            'handleCopyToNew',
            'handleStoppedPlaying',
            'handleChangeName',
            'handlePlay',
            'handleStopPlaying',
            'handleUpdatePlayhead',
            'handleDelete',
            'handleUpdateTrim',
            'handleEffect',
            'handleUndo',
            'handleRedo',
            'submitNewSamples',
            'handleCopy',
            'handlePaste',
            'paste',
            'handleKeyPress',
            'handleContainerClick',
            'setRef',
            'resampleBufferToRate'
        ]);
        this.state = {
            copyBuffer: null,
            chunkLevels: computeChunkedRMS(this.props.samples),
            playhead: null, // null is not playing, [0 -> 1] is playing percent
            trimStart: null,
            trimEnd: null,
            soundBusy: false,
            soundBusyNotice: false,
            soundError: false
        };

        this.redoStack = [];
        this.undoStack = [];
        // Brickwright: History list names, parallel to the stacks.
        this.undoLabels = [];
        this.redoLabels = [];
        this.stepLabel = null;

        this.ref = null;
        this.soundOperation = null;
        this.soundUnmounted = false;
        this.soundTarget = this.props.vm.editingTarget;
        this.soundObject = this.soundTarget && this.soundTarget.sprite.sounds[this.props.soundIndex];
    }
    componentDidMount () {
        this.audioBufferPlayer = new AudioBufferPlayer(this.props.samples, this.props.sampleRate);

        document.addEventListener('keydown', this.handleKeyPress);
        // Brickwright: the shared History waits for each sound step. Direct
        // operations are refused while an encode or effect is in progress.
        this.unregisterUndo = registerUndoSurface('sounds', {
            label: 'Sounds',
            canUndo: () => this.undoStack.length > 0,
            canRedo: () => this.redoStack.length > 0,
            depth: () => ({undo: this.undoStack.length, redo: this.redoStack.length}),
            steps: () => ({past: this.undoLabels.slice(), future: this.redoLabels.slice().reverse()}),
            undo: () => (this.undoStack.length ? this.handleUndo() : false),
            redo: () => (this.redoStack.length ? this.handleRedo() : false)
        });
        activateUndoSurface('sounds');
        this._menuMounted = true;
        this.unregisterMenu = registerEditorMenuActions('sounds', () => this.editorMenuActions());
    }
    componentWillReceiveProps (newProps) {
        const target = newProps.vm.editingTarget;
        const sound = target && target.sprite.sounds[newProps.soundIndex];
        if (this.soundOperation && !this.currentSoundOperation(this.soundOperation, newProps)) {
            this.soundOperation = null;
            this.setState({soundBusy: false, soundBusyNotice: false, soundError: false});
        }
        if (newProps.soundId !== this.props.soundId || target !== this.soundTarget || sound !== this.soundObject) {
            this.redoStack = [];
            this.undoStack = [];
            this.undoLabels = [];
            this.redoLabels = [];
            notifyUndoState();
            this.resetState(newProps.samples, newProps.sampleRate);
            this.setState({
                trimStart: null,
                trimEnd: null
            });
        }
        this.soundTarget = target;
        this.soundObject = sound;
    }
    componentWillUnmount () {
        this._menuMounted = false;
        if (this.unregisterMenu) this.unregisterMenu();
        this.soundUnmounted = true;
        this.soundOperation = null;
        this.audioBufferPlayer.stop();
        if (this.unregisterUndo) this.unregisterUndo();

        document.removeEventListener('keydown', this.handleKeyPress);
    }
    componentDidUpdate (prevProps, prevState) {
        // Playing changes the available command once; playhead frames do not
        // cause the shared menus to render at the audio callback frequency.
        if (prevProps.soundId !== this.props.soundId || prevProps.samples !== this.props.samples ||
            prevProps.sampleRate !== this.props.sampleRate || prevProps.isFullScreen !== this.props.isFullScreen ||
            prevProps.intl !== this.props.intl || prevState.copyBuffer !== this.state.copyBuffer ||
            prevState.trimStart !== this.state.trimStart || prevState.trimEnd !== this.state.trimEnd ||
            prevState.chunkLevels !== this.state.chunkLevels ||
            (prevState.playhead !== null) !== (this.state.playhead !== null)) notifyEditorMenuActions();
    }
    editorMenuActions () {
        const sound = this.props.vm.editingTarget?.sprite?.sounds?.[this.props.soundIndex];
        if (!this._menuMounted || getUndoState().surface !== 'sounds' || this.props.isFullScreen ||
            !sound || sound.soundId !== this.props.soundId) return null;
        const buffer = this.audioBufferPlayer?.buffer;
        const ready = !!(buffer && buffer.length > 0 && this.props.sampleRate > 0);
        const selected = this.state.trimStart !== null;
        const playing = this.state.playhead !== null;
        const label = (key, defaultMessage) => this.props.intl.formatMessage({id: `gui.soundEditor.${key}`, defaultMessage});
        const action = (key, fallback, enabled, run, submenu = '') => ({label: label(key, fallback),
            location: 'edit', submenu, enabled: !!enabled && typeof run === 'function', run});
        const actions = {
            copy: action('copy', 'Copy', ready, this.handleCopy),
            paste: action('paste', 'Paste', ready && this.state.copyBuffer?.samples?.length > 0 &&
                this.state.copyBuffer.sampleRate > 0, this.handlePaste),
            'copy-to-new': action('copyToNew', 'Copy to New', ready, this.handleCopyToNew),
            delete: action('delete', 'Delete', ready && selected, this.handleDelete),
            play: action('play', 'Play', ready && !playing, this.handlePlay),
            stop: action('stop', 'Stop', ready && playing, this.handleStopPlaying)
        };
        const effects = AudioEffects.effectTypes;
        const group = this.props.intl.locale.startsWith('de') ? 'Effekte' : 'Effects';
        for (const [key, fallback, type] of [
            ['faster', 'Faster', effects.FASTER], ['slower', 'Slower', effects.SLOWER],
            ['louder', 'Louder', effects.LOUDER], ['softer', 'Softer', effects.SOFTER],
            ['mute', 'Mute', effects.MUTE], ['fadeIn', 'Fade in', effects.FADEIN],
            ['fadeOut', 'Fade out', effects.FADEOUT], ['reverse', 'Reverse', effects.REVERSE],
            ['robot', 'Robot', effects.ROBOT], ['echo', 'Echo', effects.ECHO]
        ]) {
            actions[`effect-${key}`] = action(key, fallback, ready && buffer.length >= 2 &&
                (key !== 'louder' || !this.tooLoud()), this.effectFactory(type), group);
        }
        return actions;
    }
    handleKeyPress (event) {
        if (event.target instanceof HTMLInputElement) {
            // Ignore keyboard shortcuts if a text input field is focused
            return;
        }
        if (this.props.isFullScreen) {
            // Ignore keyboard shortcuts if the stage is fullscreen mode
            return;
        }
        if (event.key === ' ') {
            event.preventDefault();
            if (this.state.playhead) {
                this.handleStopPlaying();
            } else {
                this.handlePlay();
            }
        }
        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            if (event.shiftKey) {
                this.handleDeleteInverse();
            } else {
                this.handleDelete();
            }
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            this.handleUpdateTrim(null, null);
        }
        if (event.metaKey || event.ctrlKey) {
            if (event.shiftKey && event.key.toLowerCase() === 'z') {
                event.preventDefault();
                if (this.redoStack.length > 0) {
                    this.handleRedo();
                }
            } else if (event.key === 'z') {
                if (this.undoStack.length > 0) {
                    event.preventDefault();
                    this.handleUndo();
                }
            } else if (event.key === 'c') {
                event.preventDefault();
                this.handleCopy();
            } else if (event.key === 'v') {
                event.preventDefault();
                this.handlePaste();
            } else if (event.key === 'a') {
                event.preventDefault();
                this.handleUpdateTrim(0, 1);
            }
        }
    }
    resetState (samples, sampleRate) {
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer = new AudioBufferPlayer(samples, sampleRate);
        this.setState({
            chunkLevels: computeChunkedRMS(samples),
            playhead: null
        });
    }
    currentSoundOperation (operation, props = this.props) {
        const target = props.vm.editingTarget;
        return !this.soundUnmounted && this.soundOperation === operation && props.vm === operation.vm &&
            target === operation.target && props.soundIndex === operation.index &&
            props.soundId === operation.soundId && operation.vm.runtime &&
            operation.vm.runtime.targets.includes(operation.target) &&
            target && target.sprite && target.sprite.sounds[operation.index] === operation.sound;
    }
    runSoundOperation (work) {
        if (this.soundOperation) {
            this.setState({soundBusyNotice: true});
            return Promise.resolve(false);
        }
        const target = this.props.vm.editingTarget;
        const sound = target && target.sprite && target.sprite.sounds[this.props.soundIndex];
        if (!sound || this.soundUnmounted) return Promise.resolve(false);
        const operation = {vm: this.props.vm, target, sound, index: this.props.soundIndex, soundId: this.props.soundId};
        this.soundOperation = operation;
        this.setState({soundBusy: true, soundBusyNotice: false, soundError: false});
        return Promise.resolve().then(() => this.currentSoundOperation(operation) && work(operation))
            .catch(error => {
                log.error(`Encountered error while editing sound: ${error.message}`);
                return false;
            })
            .then(result => {
                if (result === false && this.currentSoundOperation(operation)) this.setState({soundError: true});
                return result;
            })
            .finally(() => {
                if (this.soundOperation === operation) {
                    this.soundOperation = null;
                    this.stepLabel = null;
                    if (!this.soundUnmounted) this.setState({soundBusy: false, soundBusyNotice: false});
                }
            });
    }
    submitNewSamples (samples, sampleRate, skipUndo, operation) {
        return downsampleIfNeeded({samples, sampleRate}, this.resampleBufferToRate)
            .then(({samples: newSamples, sampleRate: newSampleRate}) =>
                WavEncoder.encode({sampleRate: newSampleRate, channelData: [newSamples]}).then(wavBuffer => {
                    if (!this.currentSoundOperation(operation)) return false;
                    const player = new AudioBufferPlayer(newSamples, newSampleRate);
                    const chunkLevels = computeChunkedRMS(newSamples);
                    const undoItem = skipUndo ? null : this.getUndoItem();
                    operation.vm.updateSoundBuffer(operation.index, player.buffer, new Uint8Array(wavBuffer));
                    if (!this.currentSoundOperation(operation)) return false;
                    this.audioBufferPlayer.stop();
                    this.audioBufferPlayer = player;
                    this.setState({chunkLevels, playhead: null});
                    if (!skipUndo) {
                        this.redoStack = [];
                        this.redoLabels = [];
                        if (this.undoStack.length >= UNDO_STACK_SIZE) {
                            this.undoStack.shift();
                            this.undoLabels.shift();
                        }
                        this.undoStack.push(undoItem);
                        this.undoLabels.push(this.stepLabel || 'Change');
                    }
                    this.stepLabel = null;
                    notifyUndoState();
                    return true;
                })
            )
            .catch(e => {
                log.error(`Encountered error while trying to encode sound update: ${e.message}`);
                return false;
            });
    }
    handlePlay () {
        this.audioBufferPlayer.stop();
        this.audioBufferPlayer.play(
            this.state.trimStart || 0,
            this.state.trimEnd || 1,
            this.handleUpdatePlayhead,
            this.handleStoppedPlaying);
    }
    handleStopPlaying () {
        this.audioBufferPlayer.stop();
        this.handleStoppedPlaying();
    }
    handleStoppedPlaying () {
        this.setState({playhead: null});
    }
    handleUpdatePlayhead (playhead) {
        this.setState({playhead});
    }
    handleChangeName (name) {
        this.props.vm.renameSound(this.props.soundIndex, name);
    }
    hasTrimSelection () {
        return this.hasTrimSelectionForLength(this.audioBufferPlayer && this.audioBufferPlayer.buffer.length);
    }
    hasTrimSelectionForLength (sampleCount) {
        const {trimStart, trimEnd} = this.state;
        return Number.isSafeInteger(sampleCount) && sampleCount > 0 &&
            Number.isFinite(trimStart) && Number.isFinite(trimEnd) &&
            trimStart >= 0 && trimEnd <= 1 && trimStart < trimEnd &&
            Math.floor(trimStart * sampleCount) < Math.floor(trimEnd * sampleCount);
    }
    handleDelete () {
        if (!this.soundOperation && !this.hasTrimSelection()) return Promise.resolve(false);
        return this.runSoundOperation(operation => {
            const {samples, sampleRate} = this.copyCurrentBuffer();
            if (!this.hasTrimSelectionForLength(samples.length)) return false;
            this.stepLabel = 'Delete selection';
            const startIndex = Math.floor(this.state.trimStart * samples.length);
            const endIndex = Math.floor(this.state.trimEnd * samples.length);
            const firstPart = samples.slice(0, startIndex);
            const secondPart = samples.slice(endIndex);
            const newLength = firstPart.length + secondPart.length;
            const newSamples = new Float32Array(Math.max(1, newLength));
            newSamples.set(firstPart, 0);
            newSamples.set(secondPart, firstPart.length);
            return this.submitNewSamples(newSamples, sampleRate, false, operation).then(success => {
                if (success && this.currentSoundOperation(operation)) this.setState({trimStart: null, trimEnd: null});
                return success;
            });
        });
    }
    handleDeleteInverse () {
        if (!this.soundOperation && !this.hasTrimSelection()) return Promise.resolve(false);
        return this.runSoundOperation(operation => {
            const {samples, sampleRate} = this.copyCurrentBuffer();
            if (!this.hasTrimSelectionForLength(samples.length)) return false;
            this.stepLabel = 'Crop';
            const startIndex = Math.floor(this.state.trimStart * samples.length);
            const endIndex = Math.floor(this.state.trimEnd * samples.length);
            const clippedSamples = samples.slice(startIndex, endIndex);
            return this.submitNewSamples(clippedSamples, sampleRate, false, operation).then(success => {
                if (success && this.currentSoundOperation(operation)) this.setState({trimStart: null, trimEnd: null});
                return success;
            });
        });
    }
    handleUpdateTrim (trimStart, trimEnd) {
        if (this.soundOperation) {
            this.setState({soundBusyNotice: true}); return;
        }
        this.setState({trimStart, trimEnd});
        this.handleStopPlaying();
    }
    effectFactory (name) {
        return () => this.handleEffect(name);
    }
    copyCurrentBuffer () {
        // Cannot reliably use props.samples because it gets detached by Firefox
        return {
            samples: this.audioBufferPlayer.buffer.getChannelData(0),
            sampleRate: this.audioBufferPlayer.buffer.sampleRate
        };
    }
    handleEffect (name) {
        return this.runSoundOperation(operation => {
            this.stepLabel = `Effect ${name}`;
            const trimStart = this.state.trimStart === null ? 0.0 : this.state.trimStart;
            const trimEnd = this.state.trimEnd === null ? 1.0 : this.state.trimEnd;
            if (this.audioBufferPlayer.buffer.length < 2) return false;
            const effects = new AudioEffects(this.audioBufferPlayer.buffer, name, trimStart, trimEnd);
            return new Promise((resolve, reject) => {
                const rendering = effects.process((renderedBuffer, adjustedTrimStart, adjustedTrimEnd) => {
                    if (!this.currentSoundOperation(operation)) return resolve(false);
                    this.submitNewSamples(renderedBuffer.getChannelData(0), renderedBuffer.sampleRate, false, operation)
                        .then(success => {
                            if (success && this.currentSoundOperation(operation)) {
                                if (this.state.trimStart === null) this.handlePlay();
                                else {
                                    this.setState({trimStart: adjustedTrimStart, trimEnd: adjustedTrimEnd},
                                        this.handlePlay);
                                }
                            }
                            resolve(success);
                        }, reject);
                });
                if (rendering && typeof rendering.catch === 'function') rendering.catch(reject);
            });
        });
    }
    tooLoud () {
        const numChunks = this.state.chunkLevels.length;
        const startIndex = this.state.trimStart === null ?
            0 : Math.floor(this.state.trimStart * numChunks);
        const endIndex = this.state.trimEnd === null ?
            numChunks - 1 : Math.ceil(this.state.trimEnd * numChunks);
        const trimChunks = this.state.chunkLevels.slice(startIndex, endIndex);
        return Math.max(...trimChunks) > MAX_RMS;
    }
    getUndoItem () {
        return {
            ...this.copyCurrentBuffer(),
            trimStart: this.state.trimStart,
            trimEnd: this.state.trimEnd
        };
    }
    handleUndo () {
        return this.runSoundOperation(operation => {
            const item = this.undoStack[this.undoStack.length - 1];
            if (!item || !item.samples) return false;
            const current = this.getUndoItem();
            return this.submitNewSamples(item.samples, item.sampleRate, true, operation).then(success => {
                if (!success || !this.currentSoundOperation(operation)) return false;
                this.undoStack.pop();
                this.redoStack.push(current);
                this.redoLabels.push(this.undoLabels.pop());
                notifyUndoState();
                this.setState({trimStart: item.trimStart, trimEnd: item.trimEnd}, this.handlePlay);
                return true;
            });
        });
    }
    handleRedo () {
        return this.runSoundOperation(operation => {
            const item = this.redoStack[this.redoStack.length - 1];
            if (!item || !item.samples) return false;
            const current = this.getUndoItem();
            return this.submitNewSamples(item.samples, item.sampleRate, true, operation).then(success => {
                if (!success || !this.currentSoundOperation(operation)) return false;
                this.redoStack.pop();
                this.undoStack.push(current);
                this.undoLabels.push(this.redoLabels.pop());
                notifyUndoState();
                this.setState({trimStart: item.trimStart, trimEnd: item.trimEnd}, this.handlePlay);
                return true;
            });
        });
    }
    handleCopy () {
        this.copy();
    }
    copy (callback) {
        const trimStart = this.state.trimStart === null ? 0.0 : this.state.trimStart;
        const trimEnd = this.state.trimEnd === null ? 1.0 : this.state.trimEnd;

        const newCopyBuffer = this.copyCurrentBuffer();
        const trimStartSamples = trimStart * newCopyBuffer.samples.length;
        const trimEndSamples = trimEnd * newCopyBuffer.samples.length;
        newCopyBuffer.samples = newCopyBuffer.samples.slice(trimStartSamples, trimEndSamples);

        this.setState({
            copyBuffer: newCopyBuffer
        }, callback);
    }
    handleCopyToNew () {
        this.copy(() => {
            encodeAndAddSoundToVM(this.props.vm, this.state.copyBuffer.samples,
                this.state.copyBuffer.sampleRate, this.props.name);
        });
    }
    resampleBufferToRate (buffer, newRate) {
        return new Promise((resolve, reject) => {
            const sampleRateRatio = newRate / buffer.sampleRate;
            const newLength = sampleRateRatio * buffer.samples.length;
            let offlineContext;
            // Try to use either OfflineAudioContext or webkitOfflineAudioContext to resample
            // The constructors will throw if trying to resample at an unsupported rate
            // (e.g. Safari/webkitOAC does not support lower than 44khz).
            try {
                if (window.OfflineAudioContext) {
                    offlineContext = new window.OfflineAudioContext(1, newLength, newRate);
                } else if (window.webkitOfflineAudioContext) {
                    offlineContext = new window.webkitOfflineAudioContext(1, newLength, newRate);
                }
            } catch {
                // If no OAC available and downsampling by 2, downsample by dropping every other sample.
                if (newRate === buffer.sampleRate / 2) {
                    return resolve(dropEveryOtherSample(buffer));
                }
                return reject(new Error('Could not resample'));
            }
            const source = offlineContext.createBufferSource();
            const audioBuffer = offlineContext.createBuffer(1, buffer.samples.length, buffer.sampleRate);
            audioBuffer.getChannelData(0).set(buffer.samples);
            source.buffer = audioBuffer;
            source.connect(offlineContext.destination);
            source.start();
            offlineContext.oncomplete = ({renderedBuffer}) => {
                resolve({
                    samples: renderedBuffer.getChannelData(0),
                    sampleRate: newRate
                });
            };
            const rendering = offlineContext.startRendering();
            if (rendering && typeof rendering.catch === 'function') rendering.catch(reject);
        });
    }
    paste (copyBuffer, operation) {
        this.stepLabel = 'Paste';
        const {samples} = this.copyCurrentBuffer();
        if (this.state.trimStart === null) {
            const newSamples = new Float32Array(samples.length + copyBuffer.samples.length);
            newSamples.set(samples, 0);
            newSamples.set(copyBuffer.samples, samples.length);
            return this.submitNewSamples(newSamples, this.props.sampleRate, false, operation).then(success => {
                if (success && this.currentSoundOperation(operation)) this.handlePlay();
                return success;
            });
        }
        const trimStartSamples = this.state.trimStart * samples.length;
        const trimEndSamples = this.state.trimEnd * samples.length;
        const firstPart = samples.slice(0, trimStartSamples);
        const lastPart = samples.slice(trimEndSamples);
        const newSamples = new Float32Array(firstPart.length + copyBuffer.samples.length + lastPart.length);
        newSamples.set(firstPart, 0);
        newSamples.set(copyBuffer.samples, firstPart.length);
        newSamples.set(lastPart, firstPart.length + copyBuffer.samples.length);
        const trimStartSeconds = trimStartSamples / this.props.sampleRate;
        const trimEndSeconds = trimStartSeconds + (copyBuffer.samples.length / copyBuffer.sampleRate);
        const newDurationSeconds = newSamples.length / copyBuffer.sampleRate;
        const adjustedTrimStart = trimStartSeconds / newDurationSeconds;
        const adjustedTrimEnd = trimEndSeconds / newDurationSeconds;
        return this.submitNewSamples(newSamples, this.props.sampleRate, false, operation).then(success => {
            if (success && this.currentSoundOperation(operation)) {
                this.setState({trimStart: adjustedTrimStart, trimEnd: adjustedTrimEnd}, this.handlePlay);
            }
            return success;
        });
    }
    handlePaste () {
        if (!this.state.copyBuffer) return Promise.resolve(false);
        return this.runSoundOperation(operation => {
            const copyBuffer = this.state.copyBuffer;
            const buffer = copyBuffer.sampleRate === this.props.sampleRate ? Promise.resolve(copyBuffer) :
                this.resampleBufferToRate(copyBuffer, this.props.sampleRate);
            return buffer.then(result => {
                if (!this.currentSoundOperation(operation)) return false;
                if (result !== copyBuffer) this.setState({copyBuffer: result});
                return this.paste(result, operation);
            });
        });
    }
    setRef (element) {
        this.ref = element;
    }
    handleContainerClick (e) {
        // If the click is on the sound editor's div (and not any other element), delesect
        if (e.target === this.ref && this.state.trimStart !== null) {
            this.handleUpdateTrim(null, null);
        }
    }
    render () {
        const {effectTypes} = AudioEffects;
        const german = String(this.props.locale || '').toLowerCase()
            .startsWith('de');
        return (<>
            {this.state.soundBusy ? <div
                aria-live="polite"
                role="status"
            >
                {this.state.soundBusyNotice ?
                    (german ? 'Bitte warte, bis die Klangbearbeitung abgeschlossen ist.' :
                        'Please wait for the current sound edit to finish.') :
                    (german ? 'Klang wird bearbeitet…' : 'Editing sound…')}
            </div> : null}
            {this.state.soundError ? <div role="alert">
                {german ? 'Der Klang konnte nicht bearbeitet werden. Bitte versuche es erneut.' :
                    'Could not complete the sound edit. Please try again.'}
            </div> : null}
            <SoundEditorComponent
                editingBusy={this.state.soundBusy}
                canPaste={this.state.copyBuffer !== null}
                canRedo={this.redoStack.length > 0}
                canUndo={this.undoStack.length > 0}
                chunkLevels={this.state.chunkLevels}
                name={this.props.name}
                playhead={this.state.playhead}
                setRef={this.setRef}
                tooLoud={this.tooLoud()}
                trimEnd={this.state.trimEnd}
                trimStart={this.state.trimStart}
                onChangeName={this.handleChangeName}
                onContainerClick={this.handleContainerClick}
                onCopy={this.handleCopy}
                onCopyToNew={this.handleCopyToNew}
                onDelete={this.handleDelete}
                onEcho={this.effectFactory(effectTypes.ECHO)}
                onFadeIn={this.effectFactory(effectTypes.FADEIN)}
                onFadeOut={this.effectFactory(effectTypes.FADEOUT)}
                onFaster={this.effectFactory(effectTypes.FASTER)}
                onLouder={this.effectFactory(effectTypes.LOUDER)}
                onMute={this.effectFactory(effectTypes.MUTE)}
                onPaste={this.handlePaste}
                onPlay={this.handlePlay}
                onRedo={this.handleRedo}
                onReverse={this.effectFactory(effectTypes.REVERSE)}
                onRobot={this.effectFactory(effectTypes.ROBOT)}
                onSetTrim={this.handleUpdateTrim}
                onSlower={this.effectFactory(effectTypes.SLOWER)}
                onSofter={this.effectFactory(effectTypes.SOFTER)}
                onStop={this.handleStopPlaying}
                onUndo={this.handleUndo}
            />
        </>);
    }
}

SoundEditor.propTypes = {
    intl: intlShape.isRequired,
    isFullScreen: PropTypes.bool,
    locale: PropTypes.string,
    name: PropTypes.string.isRequired,
    sampleRate: PropTypes.number,
    samples: PropTypes.instanceOf(Float32Array),
    soundId: PropTypes.string,
    soundIndex: PropTypes.number,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = (state, {soundIndex}) => {
    const sprite = state.scratchGui.vm.editingTarget.sprite;
    // Make sure the sound index doesn't go out of range.
    const index = soundIndex < sprite.sounds.length ? soundIndex : sprite.sounds.length - 1;
    const sound = state.scratchGui.vm.editingTarget.sprite.sounds[index];
    const audioBuffer = state.scratchGui.vm.getSoundBuffer(index);
    return {
        soundId: sound.soundId,
        sampleRate: audioBuffer.sampleRate,
        samples: audioBuffer.getChannelData(0),
        isFullScreen: state.scratchGui.mode.isFullScreen,
        locale: state.locales.locale,
        name: sound.name,
        vm: state.scratchGui.vm
    };
};

export default injectIntl(connect(
    mapStateToProps
)(SoundEditor));
