import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {connect} from 'react-redux';

import ControlsComponent from '../components/controls/controls.jsx';

class Controls extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleGreenFlagClick', 'handleStopAllClick']);
    }
    handleGreenFlagClick (e) {
        e.preventDefault();
        if (e.shiftKey) {
            this.props.vm.setTurboMode(!this.props.turbo);
        } else {
            if (!this.props.isStarted) this.props.vm.start();
            this.props.vm.greenFlag();
            // The circuit designer listens to the same user-level action. This
            // keeps the Scratch green flag as the single, unsurprising start
            // control for both block scripts and a visible circuit simulation.
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('bw-green-flag')), 0);
        }
    }
    handleStopAllClick (e) {
        e.preventDefault();
        this.props.vm.stopAll();
        window.setTimeout(() => window.dispatchEvent(new CustomEvent('bw-stop-all')), 0);
    }
    render () {
        const {vm, isStarted, projectRunning, turbo, ...props} = this.props;
        return <ControlsComponent {...props} active={projectRunning} turbo={turbo}
            onGreenFlagClick={this.handleGreenFlagClick} onStopAllClick={this.handleStopAllClick} />;
    }
}

Controls.propTypes = {
    isStarted: PropTypes.bool.isRequired,
    projectRunning: PropTypes.bool.isRequired,
    turbo: PropTypes.bool.isRequired,
    vm: PropTypes.instanceOf(VM)
};

const mapStateToProps = state => ({
    isStarted: state.scratchGui.vmStatus.running,
    projectRunning: state.scratchGui.vmStatus.running,
    turbo: state.scratchGui.vmStatus.turbo
});

export default connect(mapStateToProps, () => ({}))(Controls);
