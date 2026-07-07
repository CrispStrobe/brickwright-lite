import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from 'scratch-vm';
import {defineMessages, injectIntl, intlShape} from 'react-intl';

import extensionLibraryContent from '../lib/libraries/extensions/index.jsx';

import LibraryComponent from '../components/library/library.jsx';
import extensionIcon from '../components/action-menu/icon--sprite.svg';

// Brickwright: the CrispStrobe extension gallery. Its entries are loaded UNSANDBOXED, in-process,
// by the VM's clean-room loader (extension-manager.loadExtensionURL -> crispstrobe adapter). This
// container merges the gallery (fetched once at open) after our bundled built-ins. Only this host
// is trusted by the VM allow-list, so only these entries actually run in-process.
const GALLERY_BASE = 'https://crispstrobe.github.io/extensions/';
const GALLERY_INDEX = `${GALLERY_BASE}generated-metadata/extensions-v0.json`;

let cachedGallery = null;

const fetchGallery = async () => {
    if (cachedGallery) return cachedGallery;
    const res = await fetch(GALLERY_INDEX);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cachedGallery = (data.extensions || []).map(ext => ({
        name: ext.name,
        description: ext.description,
        extensionId: ext.id,
        extensionURL: `${GALLERY_BASE}${ext.slug}.js`,
        iconURL: ext.image ? `${GALLERY_BASE}${ext.image}` : extensionIcon,
        tags: ['gallery'],
        featured: true,
        // carry translations through so a later i18n pass can localise the picker
        nameTranslations: ext.nameTranslations || {},
        descriptionTranslations: ext.descriptionTranslations || {}
    }));
    return cachedGallery;
};

const messages = defineMessages({
    extensionTitle: {
        defaultMessage: 'Choose an Extension',
        description: 'Heading for the extension library',
        id: 'gui.extensionLibrary.chooseAnExtension'
    },
    extensionUrl: {
        defaultMessage: 'Enter the URL of the extension',
        description: 'Prompt for unoffical extension url',
        id: 'gui.extensionLibrary.extensionUrl'
    }
});

class ExtensionLibrary extends React.PureComponent {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleItemSelect'
        ]);
        this.state = {gallery: [], galleryError: null};
    }
    componentDidMount () {
        fetchGallery()
            .then(gallery => this.setState({gallery}))
            .catch(err => this.setState({galleryError: err.message}));
    }
    handleItemSelect (item) {
        const id = item.extensionId;
        let url = item.extensionURL ? item.extensionURL : id;
        if (!item.disabled && !id) {
            // eslint-disable-next-line no-alert
            url = prompt(this.props.intl.formatMessage(messages.extensionUrl));
        }
        if (id && !item.disabled) {
            if (this.props.vm.extensionManager.isExtensionLoaded(url)) {
                this.props.onCategorySelected(id);
            } else {
                this.props.vm.extensionManager.loadExtensionURL(url).then(() => {
                    this.props.onCategorySelected(id);
                });
            }
        }
    }
    render () {
        // bundled built-ins first, then the fetched gallery
        const allExtensions = extensionLibraryContent.concat(this.state.gallery);
        const extensionLibraryThumbnailData = allExtensions.map(extension => ({
            rawURL: extension.iconURL || extensionIcon,
            ...extension
        }));
        return (
            <LibraryComponent
                data={extensionLibraryThumbnailData}
                filterable
                id="extensionLibrary"
                title={this.props.intl.formatMessage(messages.extensionTitle)}
                visible={this.props.visible}
                onItemSelected={this.handleItemSelect}
                onRequestClose={this.props.onRequestClose}
            />
        );
    }
}

ExtensionLibrary.propTypes = {
    intl: intlShape.isRequired,
    onCategorySelected: PropTypes.func,
    onRequestClose: PropTypes.func,
    visible: PropTypes.bool,
    vm: PropTypes.instanceOf(VM).isRequired // eslint-disable-line react/no-unused-prop-types
};

export default injectIntl(ExtensionLibrary);
