import React from 'react';
import LazyScratchBlocks from './tw-lazy-scratch-blocks';

const LoadScratchBlocksHOC = function (WrappedComponent) {
    class LoadScratchBlocks extends React.Component {
        constructor (props) {
            super(props);
            this.state = {
                loaded: LazyScratchBlocks.isLoaded(),
                error: null
            };
            if (!this.state.loaded) {
                LazyScratchBlocks.load()
                    .then(() => {
                        this.setState({loaded: true});
                    })
                    .catch(e => {
                        console.error('Failed to load scratch-blocks:', e);
                        this.setState({error: e});
                    });
            }
        }
        render () {
            if (this.state.error !== null) {
                return <div style={{padding: 20, color: 'red'}}>Failed to load block editor.</div>;
            }
            if (!this.state.loaded) {
                return null;
            }
            return <WrappedComponent {...this.props} />;
        }
    }
    return LoadScratchBlocks;
};

export default LoadScratchBlocksHOC;
