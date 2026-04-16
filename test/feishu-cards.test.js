import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCallbackTestCard } from '../src/feishu/cards.js';

test('builds an interactive callback test card', () => {
  const card = buildCallbackTestCard({ nonce: 'nonce-1' });
  const button = card.elements[1].actions[0];

  assert.equal(card.header.title.content, 'FCoding callback test');
  assert.equal(button.tag, 'button');
  assert.equal(button.value.fcoding_action, 'callback_test');
  assert.equal(button.value.nonce, 'nonce-1');
});
