import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { buildCommandResultCard, buildModelSelectionCard, buildStatusCard } from './feishu/cards.js';

export const MODEL_CHOICES = [
  { label: 'Use default', value: '' },
  { label: 'gpt-5.4', value: 'gpt-5.4' },
  { label: 'gpt-5.4-mini', value: 'gpt-5.4-mini' },
  { label: 'gpt-5.2', value: 'gpt-5.2' },
  { label: 'gpt-5.2-codex', value: 'gpt-5.2-codex' },
  { label: 'gpt-5.1-codex-max', value: 'gpt-5.1-codex-max' }
];

function splitCommand(input) {
  return String(input || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function resolveWorkspacePath(value, currentWorkspace) {
  if (!value) {
    return currentWorkspace;
  }

  return path.isAbsolute(value)
    ? path.normalize(value)
    : path.resolve(currentWorkspace, value);
}

async function verifyDirectoryExists(directoryPath) {
  await access(directoryPath, fsConstants.R_OK);
}

async function getCodexLoginStatus({ logger = console } = {}) {
  return new Promise((resolve) => {
    const child = spawn('codex', ['login', 'status'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.once('error', (error) => {
      logger.error?.({ error }, 'Failed to check Codex login status');
      resolve('unavailable');
    });
    child.once('close', () => {
      const value = stdout.trim() || stderr.trim() || 'unknown';
      resolve(value.replace(/^WARNING:.*\n?/gm, '').trim() || 'unknown');
    });
  });
}

function helpDetails() {
  return [
    '`codex help`',
    '`codex status`',
    '`codex workspace`',
    '`codex workspace set <path>`',
    '`codex model`',
    '`codex model set <name>`',
    '`codex login`',
    '`codex login status`',
    '`codex cancel`'
  ];
}

export async function handleBotCommand({
  task,
  runtimeState,
  logger = console
}) {
  const parts = splitCommand(task.prompt);
  const [command = 'help', subcommand, action, ...rest] = parts;
  const runtime = runtimeState.snapshot();

  if (command === 'help') {
    return {
      handled: true,
      card: buildCommandResultCard({
        title: 'FCoding commands',
        summary: 'Use the commands below to inspect or adjust the current FCoding runtime session.',
        details: helpDetails()
      })
    };
  }

  if (command === 'status') {
    return {
      handled: true,
      card: buildStatusCard({
        runtime,
        loginStatus: await getCodexLoginStatus({ logger })
      })
    };
  }

  if (command === 'cancel') {
    const cancelled = runtimeState.cancelActiveTask();
    if (!cancelled) {
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding task cancel',
          summary: 'No active Codex task is currently running.'
        })
      };
    }

    return {
      handled: true,
      card: buildCommandResultCard({
        title: 'FCoding task cancel requested',
        status: 'running',
        summary: `Cancellation requested for \`${cancelled.prompt}\`.`
      })
    };
  }

  if (command === 'workspace') {
    if (!subcommand) {
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding workspace',
          summary: `Current workspace: \`${runtime.workspace}\``,
          details: [`Default workspace: \`${runtime.defaultWorkspace}\``]
        })
      };
    }

    if (subcommand === 'set') {
      const nextPath = resolveWorkspacePath(rest.join(' '), runtime.workspace);
      await verifyDirectoryExists(nextPath);
      const nextRuntime = runtimeState.setWorkspace(nextPath);
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding workspace updated',
          summary: `Workspace switched to \`${nextRuntime.workspace}\`.`
        })
      };
    }

    if (subcommand === 'reset') {
      const nextRuntime = runtimeState.resetWorkspace();
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding workspace reset',
          summary: `Workspace reset to \`${nextRuntime.workspace}\`.`
        })
      };
    }
  }

  if (command === 'model') {
    if (!subcommand) {
      return {
        handled: true,
        card: buildModelSelectionCard({
          runtime,
          models: MODEL_CHOICES
        })
      };
    }

    if (subcommand === 'set') {
      const model = [action, ...rest].filter(Boolean).join(' ').trim();
      if (!model) {
        throw new Error('Model name is required');
      }

      const nextRuntime = runtimeState.setModel(model);
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding model updated',
          summary: `Model override set to \`${nextRuntime.model}\`.`
        })
      };
    }

    if (subcommand === 'clear' || subcommand === 'reset') {
      runtimeState.clearModel();
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding model cleared',
          summary: 'Model override cleared. Future runs will use the Codex default.'
        })
      };
    }
  }

  if (command === 'login') {
    if (!subcommand || subcommand === 'status') {
      return {
        handled: true,
        card: buildStatusCard({
          runtime: runtimeState.snapshot(),
          loginStatus: await getCodexLoginStatus({ logger })
        })
      };
    }

    if (subcommand === 'use' && action === 'chatgpt') {
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding login mode',
          summary: 'FCoding always uses the local Codex ChatGPT login. API key mode is not supported.'
        })
      };
    }
  }

  return { handled: false };
}
