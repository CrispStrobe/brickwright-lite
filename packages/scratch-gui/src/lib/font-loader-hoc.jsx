import React from 'react';
import PropTypes from 'prop-types';
import omit from 'lodash.omit';
import {connect} from 'react-redux';
import {setFontsLoaded} from '../reducers/fonts-loaded';

/* Higher Order Component to provide behavior for loading fonts.
 *
 * Brickwright: upstream gathered the seven render fonts' document.fonts
 * promises here and `vm-manager-hoc` refused to load a project until they
 * settled, because a costume rasterised before its @font-face existed was
 * wrong. The faces are now a lazy chunk fetched by the places that actually
 * put text on screen (see lib/lazy-render-fonts.js), each of which waits for
 * it itself, so this HOC has nothing left to wait for: `fontsLoaded` flips as
 * soon as the document is complete and a project with no text never pays for
 * fonts at all. The prop is kept because vm-manager-hoc keys on it.
 * @param {React.Component} WrappedComponent component to receive fontsLoaded prop
 * @returns {React.Component} component with font loading behavior
 */
const FontLoaderHOC = function (WrappedComponent) {
    class FontLoaderComponent extends React.Component {
        componentDidMount () {
            if (this.props.fontsLoaded) return;
            if (document.readyState === 'complete') {
                this.props.onSetFontsLoaded();
            } else {
                document.onreadystatechange = () => {
                    if (document.readyState !== 'complete') return;
                    document.onreadystatechange = null;
                    this.props.onSetFontsLoaded();
                };
            }
        }
        render () {
            const componentProps = omit(this.props, ['onSetFontsLoaded']);
            return (
                <WrappedComponent
                    {...componentProps}
                />
            );
        }
    }


    FontLoaderComponent.propTypes = {
        fontsLoaded: PropTypes.bool.isRequired,
        onSetFontsLoaded: PropTypes.func.isRequired
    };
    const mapStateToProps = state => ({
        fontsLoaded: state.scratchGui.fontsLoaded
    });
    const mapDispatchToProps = dispatch => ({
        onSetFontsLoaded: () => dispatch(setFontsLoaded())
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(FontLoaderComponent);
};

export {
    FontLoaderHOC as default
};
