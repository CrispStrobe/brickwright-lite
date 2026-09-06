import PropTypes from 'prop-types';
import React from 'react';

let soundTabRequest = null;
const loadSoundTab = () => {
    if (!soundTabRequest) {
        soundTabRequest = import(/* webpackChunkName: "sound-tab" */ './sound-tab.jsx')
            .catch(error => {
                soundTabRequest = null;
                throw error;
            });
    }
    return soundTabRequest;
};
export const preloadSoundTab = loadSoundTab;
const createLazySoundTab = () => React.lazy(loadSoundTab);

class LazySoundTab extends React.Component {
    constructor (props) {
        super(props);
        this.state = {error: null, generation: 0};
        this.SoundTab = createLazySoundTab();
    }
    static getDerivedStateFromError (error) {
        return {error};
    }
    handleRetry = () => {
        this.SoundTab = createLazySoundTab();
        this.setState(state => ({error: null, generation: state.generation + 1}));
    };
    render () {
        if (this.state.error) {
            return (
                <div data-sound-tab-load-error>
                    <span>{String(this.state.error.message || this.state.error)}</span>
                    <button type="button" onClick={this.handleRetry}>Retry sound editor</button>
                </div>
            );
        }
        const SoundTab = this.SoundTab;
        return (
            <React.Suspense fallback={<div data-sound-tab-loading aria-busy="true" />}>
                <SoundTab key={this.state.generation} vm={this.props.vm} />
            </React.Suspense>
        );
    }
}

LazySoundTab.propTypes = {
    vm: PropTypes.shape({}).isRequired
};

export default LazySoundTab;
