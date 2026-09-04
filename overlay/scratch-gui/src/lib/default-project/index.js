import projectData from './project-data';

/* eslint-disable import/no-unresolved */
import popWav from '!arraybuffer-loader!./83a9787d4cb6f3b7632b4ddfebf74367.wav?';
import meowWav from '!arraybuffer-loader!./83c36d806dc92327b9e7049a565c6bff.wav?';
import backdrop from '!raw-loader!./cd21514d0531fdffb22204e0ec5ed84a.svg?';
import costumeArt from '!raw-loader!./404462a29fe1d73ede8ea6b9ded5fabc.svg?';
/* eslint-enable import/no-unresolved */

const defaultProject = translator => {
    let _TextEncoder;
    if (typeof TextEncoder === 'undefined') {
        _TextEncoder = require('fastestsmallesttextencoderdecoder').TextEncoder;
    } else {
        _TextEncoder = TextEncoder;
    }
    const encoder = new _TextEncoder();

    const projectJson = projectData(translator);
    return [{
        id: 0,
        assetType: 'Project',
        dataFormat: 'JSON',
        data: JSON.stringify(projectJson)
    }, {
        id: '83a9787d4cb6f3b7632b4ddfebf74367',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(popWav)
    }, {
        id: '83c36d806dc92327b9e7049a565c6bff',
        assetType: 'Sound',
        dataFormat: 'WAV',
        data: new Uint8Array(meowWav)
    }, {
        id: 'cd21514d0531fdffb22204e0ec5ed84a',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(backdrop)
    }, {
        // ONE asset, named by the md5 of its own bytes, for both costumes.
        //
        // It used to be two: the artwork was swapped for the Brickwright robot
        // in 0d58e52be but kept upstream's filenames, so the app registered
        // robot bytes under `bcf454ac…` and `0fb9be3e…` — which are Scratch's
        // Cat-a and Cat-b, still referenced by name in libraries/costumes.json
        // and libraries/sprites.json. Two consequences, both measured: an
        // .sb3 saved from a fresh start carried assets whose id was not the
        // hash of their content, so a costume's id CHANGED across a round trip
        // that altered nothing; and the same two ids meant one image here and
        // a different image in the sprite library.
        //
        // Both costume entries in project-data.js point at this single id. That
        // is legal SB3 and it is honest: the two files were byte-identical, so
        // the sprite always had one image. It still does — this changes the id,
        // not what a learner sees. Giving costume2 its own artwork is a separate
        // decision for whoever owns the art, and until it is made the costume
        // switcher demonstrates nothing.
        id: '404462a29fe1d73ede8ea6b9ded5fabc',
        assetType: 'ImageVector',
        dataFormat: 'SVG',
        data: encoder.encode(costumeArt)
    }];
};

export default defaultProject;
