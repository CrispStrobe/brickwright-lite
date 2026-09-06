import {CATEGORIES, URL_ID_TO_DECK_ID} from '../../../src/lib/libraries/decks/metadata.js';

test('keeps the complete URL tutorial lookup synchronous', () => {
    expect(URL_ID_TO_DECK_ID).toEqual({
        getStarted: 'intro-move-sayhello',
        'getting-started-ASL': 'intro-getting-started-ASL',
        name: 'animate-a-name',
        'animate-a-character': 'Animate-A-Character',
        'tell-a-story': 'Tell-A-Story',
        'animations-that-talk': 'say-it-out-loud',
        imagine: 'imagine',
        'add-effects': 'add-effects',
        'make-it-fly': 'make-it-fly',
        music: 'Make-Music',
        pong: 'pong',
        'clicker-game': 'Make-A-Game',
        'chase-game': 'Chase-Game',
        'code-cartoon': 'code-cartoon',
        'animate-an-adventure-game': 'cartoon-network',
        'video-sensing': 'Video-Sensing',
        talking: 'talking',
        'add-a-sprite': 'add-sprite',
        'add-a-backdrop': 'add-a-backdrop',
        'arrow-keys': 'move-around-with-arrow-keys',
        'change-size': 'change-size',
        'glide-around': 'glide-around',
        'make-it-spin': 'spin-video',
        'record-a-sound': 'record-a-sound',
        hide: 'hide-and-show',
        'animate-a-sprite': 'switch-costume',
        wedo: 'wedo2-getting-started',
        ev3: 'ev3-getting-started',
        whatsnew: 'whats-new'
    });
});

test('keeps library categories available without importing rendered decks', () => {
    expect(CATEGORIES).toEqual({
        gettingStarted: 'gettingStarted',
        basics: 'basics',
        intermediate: 'intermediate',
        prompts: 'prompts'
    });
});
