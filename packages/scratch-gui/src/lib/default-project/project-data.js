import {defineMessages} from 'react-intl';
import sharedMessages from '../shared-messages';

let messages = defineMessages({
    meow: {
        defaultMessage: 'Meow',
        description: 'Name for the meow sound',
        id: 'gui.defaultProject.meow'
    },
    variable: {
        defaultMessage: 'my variable',
        description: 'Name for the default variable',
        id: 'gui.defaultProject.variable'
    }
});

messages = {...messages, ...sharedMessages};

// use the default message if a translation function is not passed
const defaultTranslator = msgObj => msgObj.defaultMessage;

/**
 * Generate a localized version of the default project
 * @param {function} translateFunction a function to use for translating the default names
 * @return {object} the project data json for the default project
 */
const projectData = translateFunction => {
    const translator = translateFunction || defaultTranslator;
    return ({
        targets: [
            {
                isStage: true,
                name: 'Stage',
                variables: {
                    '`jEk@4|i[#Fk?(8x)AV.-my variable': [
                        translator(messages.variable),
                        0
                    ]
                },
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                costumes: [
                    {
                        assetId: 'cd21514d0531fdffb22204e0ec5ed84a',
                        name: translator(messages.backdrop, {index: 1}),
                        md5ext: 'cd21514d0531fdffb22204e0ec5ed84a.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 240,
                        rotationCenterY: 180
                    }
                ],
                sounds: [
                    {
                        assetId: '83a9787d4cb6f3b7632b4ddfebf74367',
                        name: translator(messages.pop),
                        dataFormat: 'wav',
                        format: '',
                        rate: 11025,
                        sampleCount: 258,
                        md5ext: '83a9787d4cb6f3b7632b4ddfebf74367.wav'
                    }
                ],
                volume: 100
            },
            {
                isStage: false,
                name: translator(messages.sprite, {index: 1}),
                variables: {},
                lists: {},
                broadcasts: {},
                blocks: {},
                currentCostume: 0,
                // The rotation centres belong to the ROBOT, not to the cat.
                //
                // Branding replaced the two cat costume SVGs in place, keeping the md5
                // filenames so this file would not need editing. The artwork changed
                // anyway: the cat is ~95x100 with its centre near (48, 50), the robot is
                // 220x260 with its artwork centred at (110, 131.5) — measured with
                // getBBox, and identical in both files. Leaving the cat's numbers pinned
                // the robot by a point up near its left shoulder.
                //
                // Three things that fixes, all of them the same off-centre anchor:
                //   - the paint editor drew the art board offset from the artwork, so its
                //     bottom edge cut across the canvas at the robot's feet and the
                //     workspace background showed below it as a grey band
                //   - `turn 15 degrees` swung the robot around its shoulder
                //   - a sprite at x:0 y:0 did not sit in the middle of the stage
                //
                // 131 rather than 131.5: these are integers everywhere else in this file,
                // and half a pixel is not worth being the exception.
                costumes: [
                    {
                        assetId: 'bcf454acf82e4504149f7ffe07081dbc',
                        name: translator(messages.costume, {index: 1}),
                        bitmapResolution: 1,
                        md5ext: 'bcf454acf82e4504149f7ffe07081dbc.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 110,
                        rotationCenterY: 131
                    },
                    {
                        assetId: '0fb9be3e8397c983338cb71dc84d0b25',
                        name: translator(messages.costume, {index: 2}),
                        bitmapResolution: 1,
                        md5ext: '0fb9be3e8397c983338cb71dc84d0b25.svg',
                        dataFormat: 'svg',
                        rotationCenterX: 110,
                        rotationCenterY: 131
                    }
                ],
                sounds: [
                    {
                        assetId: '83c36d806dc92327b9e7049a565c6bff',
                        name: translator(messages.meow),
                        dataFormat: 'wav',
                        format: '',
                        rate: 22050,
                        sampleCount: 18688,
                        md5ext: '83c36d806dc92327b9e7049a565c6bff.wav'
                    }
                ],
                volume: 100,
                visible: true,
                x: 0,
                y: 0,
                size: 100,
                direction: 90,
                draggable: false,
                rotationStyle: 'all around'
            }
        ],
        meta: {
            semver: '3.0.0',
            vm: '0.1.0',
            agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_13_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36' // eslint-disable-line max-len
        }
    });
};


export default projectData;
