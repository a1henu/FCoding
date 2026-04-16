import path from 'node:path';
import { access } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { spawn } from 'node:child_process';
import { buildCommandResultCard, buildStatusCard } from './feishu/cards.js';

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
    '`codex login use chatgpt`',
    '`codex login use api`',
    '`codex login base-url set <url>`',
    '`codex login key-env set <ENV_VAR>`'
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
        card: buildCommandResultCard({
          title: 'FCoding model',
          summary: runtime.model
            ? `Current model override: \`${runtime.model}\``
            : 'Current model override: default'
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

    if (subcommand === 'use') {
      if (action === 'chatgpt') {
        runtimeState.setAuthMode('chatgpt');
        return {
          handled: true,
          card: buildCommandResultCard({
            title: 'FCoding login mode updated',
            summary: 'Auth mode switched to ChatGPT login.'
          })
        };
      }

      if (action === 'api') {
        const nextRuntime = runtimeState.setAuthMode('api');
        return {
          handled: true,
          card: buildCommandResultCard({
            title: 'FCoding login mode updated',
            summary: 'Auth mode switched to API key mode.',
            details: [
              `API base URL: \`${nextRuntime.apiBaseUrl}\``,
              `API key env var: \`${nextRuntime.apiKeyEnvVar}\``,
              nextRuntime.apiKeySource === 'missing'
                ? 'No API key detected yet. Set the environment variable in the FCoding process environment before running tasks.'
                : 'An API key is currently available to the FCoding process.'
            ]
          })
        };
      }
    }

    if (subcommand === 'base-url' && action === 'set') {
      const nextBaseUrl = rest.join(' ').trim();
      if (!nextBaseUrl) {
        throw new Error('Base URL is required');
      }

      new URL(nextBaseUrl);
      runtimeState.setApiBaseUrl(nextBaseUrl);
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding API base URL updated',
          summary: `API base URL set to \`${nextBaseUrl}\`.`
        })
      };
    }

    if (subcommand === 'base-url' && (action === 'reset' || action === 'clear')) {
      const nextRuntime = runtimeState.resetApiBaseUrl();
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding API base URL reset',
          summary: `API base URL reset to \`${nextRuntime.apiBaseUrl}\`.`
        })
      };
    }

    if (subcommand === 'key-env' && action === 'set') {
      const envVarName = rest.join(' ').trim();
      const nextRuntime = runtimeState.setApiKeyEnvVar(envVarName);
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding API key env updated',
          summary: `FCoding will now read API keys from \`${nextRuntime.apiKeyEnvVar}\`.`
        })
      };
    }

    if (subcommand === 'key-env' && (action === 'reset' || action === 'clear')) {
      const nextRuntime = runtimeState.resetApiKeyEnvVar();
      return {
        handled: true,
        card: buildCommandResultCard({
          title: 'FCoding API key env reset',
          summary: `API key env var reset to \`${nextRuntime.apiKeyEnvVar}\`.`
        })
      };
    }
  }

  return { handled: false };
}
