import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {
    lessonMatchesQuery,
    normalizeSearchText
} from '../overlay/scratch-gui/src/components/gui/lesson-search.mjs';

const GUI = path.resolve(import.meta.dirname, '../overlay/scratch-gui/src/components/gui');
const electricity = JSON.parse(readFileSync(path.join(GUI, 'lesson-waves/electricity-1.json'), 'utf8'));
const motor = electricity.lessons.find(lesson => lesson.id === 'electricity-motor-flyback');

test('lesson search matches the human-readable spelling of a hyphenated topic', () => {
    assert.equal(motor.topic, 'motor-flyback', 'fixture retains the machine-readable topic spelling');
    assert.equal(motor.topic.replace(/-/g, ' '), 'motor flyback',
        'the query is exactly the topic text rendered on the lesson card');
    assert.equal(lessonMatchesQuery(motor, motor.copy.en, 'motor flyback'), true);
});

test('lesson search normalizes query and catalog separators symmetrically', () => {
    assert.equal(normalizeSearchText('  MOTOR_flyback  '), 'motor flyback');
    assert.equal(lessonMatchesQuery(motor, motor.copy.en, 'motor_flyback'), true);
    assert.equal(lessonMatchesQuery(motor, motor.copy.en, 'motor-flyback'), true);
    assert.equal(lessonMatchesQuery(motor, motor.copy.en, 'voltage divider'), false);
});

test('blank search remains an unfiltered catalog query', () => {
    assert.equal(lessonMatchesQuery(motor, motor.copy.en, '   '), true);
});
