jest.mock('../../../src/lib/analytics.js', () => ({
    event: () => {}
}));

import reducer, {
    activateDeck,
    cardsInitialState,
    dragCard,
    nextStep,
    setCardsContent
} from '../../../src/reducers/cards.js';
import {initTutorialCard} from '../../../src/reducers/gui.js';

test('starts with a compact pending content slot', () => {
    expect(cardsInitialState.content).toBe(null);
});

test('content hydration preserves the active selection and card geometry', () => {
    let state = reducer(cardsInitialState, activateDeck('intro-move-sayhello'));
    state = reducer(state, nextStep());
    state = reducer(state, dragCard(37, 59));
    const content = {'intro-move-sayhello': {steps: []}};
    const hydrated = reducer(state, setCardsContent(content));

    expect(hydrated).toEqual(expect.objectContaining({
        visible: true,
        activeDeckId: 'intro-move-sayhello',
        step: 1,
        x: 37,
        y: 59,
        content
    }));
    expect(reducer(hydrated, setCardsContent(content))).toBe(hydrated);
});

test('initTutorialCard remains synchronous and retains already hydrated content', () => {
    const content = {deck: {steps: []}};
    const result = initTutorialCard({cards: {content}}, 'deck');

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.cards).toEqual({
        visible: true,
        content,
        activeDeckId: 'deck',
        expanded: true,
        step: 0,
        x: 0,
        y: 0,
        dragging: false
    });
});
