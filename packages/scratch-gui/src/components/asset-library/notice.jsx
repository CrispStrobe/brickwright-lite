import React from 'react';
import PropTypes from 'prop-types';

const AssetLibraryNotice = ({locale, onEditArtwork}) => (
    <aside data-testid="bw-library-notice" style={{padding: '1.5rem'}}>
        <h2>{locale.startsWith('de') ? 'Bildbibliothek' : 'Artwork library'}</h2>
        <p>{locale.startsWith('de') ?
            'Diese Bibliothek enthält Bilder und Animationen. Sie bleibt unsichtbar und hat keine Spielskripte oder Klänge.' :
            'This library holds images and animations. It stays hidden and has no gameplay scripts or sounds.'}</p>
        <button type="button" onClick={onEditArtwork} data-testid="bw-library-edit-artwork">
            {locale.startsWith('de') ? 'Bilder bearbeiten' : 'Edit artwork'}
        </button>
    </aside>
);
AssetLibraryNotice.propTypes = {locale: PropTypes.string, onEditArtwork: PropTypes.func.isRequired};
AssetLibraryNotice.defaultProps = {locale: 'en'};
export default AssetLibraryNotice;
