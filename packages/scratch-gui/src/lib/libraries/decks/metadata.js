// Keep the information needed before the tutorial body opens free of React,
// translated deck steps and image imports. The full deck registry remains the
// source of truth for rendered tutorial content.
const CATEGORIES = {
    gettingStarted: 'gettingStarted',
    basics: 'basics',
    intermediate: 'intermediate',
    prompts: 'prompts'
};

const URL_ID_TO_DECK_ID = {
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
};

export {
    CATEGORIES,
    URL_ID_TO_DECK_ID
};
