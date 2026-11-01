import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConversationStarters } from '../conversation-starters.js';

test('shared interests produce a personalized starter with its reason', () => {
  const viewer = { id: 'viewer', interests: ['Coding', 'Design'] };
  const attendee = { id: 'attendee', interests: ['coding'] };

  const starters = buildConversationStarters(viewer, attendee);

  assert.equal(starters.length, 1);
  assert.match(starters[0].prompt, /interested in coding/i);
  assert.equal(starters[0].reason, 'You both list coding as an interest.');
});

test('different interests fall back to details the attendee shared', () => {
  const viewer = {
    id: 'viewer', interests: ['Coding'], role: 'First-year CS student',
    note: 'Learning to build simple apps.', education: 'Computer science',
    lookingToMeet: 'People who like robotics.',
  };
  const attendee = {
    id: 'attendee', interests: ['Painting'], role: 'Film student',
    note: 'I am making a short film.', funFact: 'I collect tiny cameras.',
    lookingToMeet: 'Actors and writers for short films.',
  };

  const starters = buildConversationStarters(viewer, attendee);

  assert.equal(starters.length, 3);
  assert.ok(starters[0].prompt.includes('tiny cameras'));
  assert.ok(starters.every((starter) => !starter.reason.includes('both list')));
  assert.ok(starters.some((starter) => starter.reason.includes('networking goal')));
});

test('shared networking goals and background terms are explained', () => {
  const viewer = {
    id: 'viewer', interests: [], lookingToMeet: 'People exploring robotics projects',
    role: 'Accessibility student',
  };
  const attendee = {
    id: 'attendee', interests: [], lookingToMeet: 'Collaborators for robotics prototypes',
    role: 'Accessibility researcher',
  };

  const starters = buildConversationStarters(viewer, attendee);

  assert.equal(starters.length, 2);
  assert.ok(starters.some((starter) => starter.reason.includes('networking goals both mention robotics')));
  assert.ok(starters.some((starter) => starter.reason.includes('both mention accessibility')));
});

test('returns no suggestions for self profiles or profiles with no usable details', () => {
  const viewer = { id: 'viewer', interests: [] };
  assert.deepEqual(buildConversationStarters(viewer, { id: 'viewer' }), []);
  assert.deepEqual(buildConversationStarters(viewer, { id: 'other' }), []);
});
