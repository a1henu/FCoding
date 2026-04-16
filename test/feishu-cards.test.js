import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCallbackTestCard,
  buildCommandResultCard,
  buildModelSelectionCard,
  buildRunningTaskCard,
  buildTaskStatusCard
} from '../src/feishu/cards.js';

test('builds an interactive callback test card', () => {
  const card = buildCallbackTestCard({ nonce: 'nonce-1' });
  const button = card.elements[1].actions[0];

  assert.equal(card.header.title.content, 'FCoding callback test');
  assert.equal(button.tag, 'button');
  assert.equal(button.value.fcoding_action, 'callback_test');
  assert.equal(button.value.nonce, 'nonce-1');
});

test('builds a command result card', () => {
  const card = buildCommandResultCard({
    title: 'FCoding status',
    summary: 'Ready',
    details: ['workspace ok']
  });

  assert.equal(card.header.title.content, 'FCoding status');
  assert.match(card.elements[0].text.content, /Ready/);
  assert.match(card.elements[0].text.content, /workspace ok/);
});

test('builds a model selection card', () => {
  const card = buildModelSelectionCard({
    runtime: {
      workspace: '/tmp/work',
      model: 'gpt-5.4',
      authMode: 'chatgpt'
    },
    models: [
      { label: 'Use default', value: '' },
      { label: 'gpt-5.4', value: 'gpt-5.4' },
      { label: 'gpt-5.4-mini', value: 'gpt-5.4-mini' },
      { label: 'gpt-5.2', value: 'gpt-5.2' }
    ]
  });

  assert.equal(card.header.title.content, 'FCoding model');
  assert.match(card.elements[0].text.content, /gpt-5\.4/);
  assert.equal(card.elements[1].actions[0].value.fcoding_action, 'set_model');
  assert.equal(card.elements[1].actions[0].value.model, '');
  assert.equal(card.elements[1].actions[1].value.model, 'gpt-5.4');
  assert.equal(card.elements[2].actions[0].value.model, 'gpt-5.2');
});

test('builds a collapsible task status card', () => {
  const card = buildTaskStatusCard({
    task: { prompt: 'fix tests' },
    runtime: {
      workspace: '/tmp/work',
      model: 'gpt-5',
      authMode: 'chatgpt'
    },
    result: {
      ok: true,
      output: 'done',
      durationMs: 1200
    },
    cardId: 'card-1',
    expanded: false
  });

  assert.equal(card.header.title.content, 'FCoding task finished');
  assert.equal(card.elements.at(-1).actions[0].value.fcoding_action, 'expand_output');
  assert.match(card.elements[0].text.content, /Preview/);
});

test('builds a running task card with cancel action', () => {
  const card = buildRunningTaskCard({
    task: { prompt: 'slow task' },
    runtime: {
      workspace: '/tmp/work',
      model: 'gpt-5',
      authMode: 'chatgpt'
    },
    taskId: 'task-1',
    elapsed: '3s'
  });

  assert.equal(card.header.title.content, 'FCoding task running');
  assert.equal(card.elements.at(-1).actions[0].value.fcoding_action, 'cancel_task');
  assert.equal(card.elements.at(-1).actions[0].value.task_id, 'task-1');
});
