import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCandidateDecision} from '../scripts/lib/cycle-candidate-decision.mjs';

const rejected = {decision: 'reject', rejection: '24 of 32',
    expectedRejection: {runnerExit: 1, passed: 24, total: 32}};

test('matching rejection makes evaluation green without making promotion ready', () => {
    assert.deepEqual(evaluateCandidateDecision(rejected, {evidenceComplete: true, qualifies: false,
        rejectionEvidence: {runnerExit: 1, passed: 24, total: 32}}),
    {decisionMatched: true, promotionReady: false, reason: '24 of 32'});
});

test('rejection drift and false acceptance fail closed', () => {
    assert.equal(evaluateCandidateDecision(rejected, {evidenceComplete: true, qualifies: false,
        rejectionEvidence: {runnerExit: 1, passed: 25, total: 32}}).decisionMatched, false);
    assert.equal(evaluateCandidateDecision(rejected, {evidenceComplete: true, qualifies: true,
        rejectionEvidence: {runnerExit: 0, passed: 32, total: 32}}).decisionMatched, false);
    assert.equal(evaluateCandidateDecision(rejected, {evidenceComplete: false}).decisionMatched, false);
});

test('qualification requires complete positive evidence', () => {
    assert.deepEqual(evaluateCandidateDecision({decision: 'qualify'},
        {evidenceComplete: true, qualifies: true}),
    {decisionMatched: true, promotionReady: true, reason: null});
    assert.equal(evaluateCandidateDecision({decision: 'qualify'},
        {evidenceComplete: true, qualifies: false}).promotionReady, false);
});
