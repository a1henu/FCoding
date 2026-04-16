import { spawn } from 'node:child_process';

export function truncateText(text, maxChars) {
  const value = String(text || '');
  if (!maxChars || value.length <= maxChars) {
    return value;
  }

  const marker = `\n\n[output truncated to ${maxChars} characters]\n\n`;
  const headSize = Math.max(0, Math.floor((maxChars - marker.length) * 0.65));
  const tailSize = Math.max(0, maxChars - marker.length - headSize);
  return `${value.slice(0, headSize)}${marker}${value.slice(-tailSize)}`;
}

export async function runCodexTask({
  prompt,
  command = 'codex',
  args = [],
  cwd = process.cwd(),
  timeoutMs = 10 * 60 * 1000,
  maxOutputChars = 12000,
  env = process.env
}) {
  const startedAt = Date.now();
  const childArgs = [...args, prompt];
  let stdout = '';
  let stderr = '';
  let timedOut = false;

  return new Promise((resolve) => {
    let settled = false;
    let killTimer = null;
    const child = spawn(command, childArgs, {
      cwd,
      env,
      shell: false,
      windowsHide: true
    });

    const timeout = timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
        }, timeoutMs)
      : null;

    function finish(result) {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (killTimer) {
        clearTimeout(killTimer);
      }
      resolve(result);
    }

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.once('error', (error) => {
      finish({
        ok: false,
        output: '',
        stdout: '',
        stderr: '',
        error: error.message,
        exitCode: null,
        signal: null,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });

    child.once('close', (exitCode, signal) => {
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n\n');
      finish({
        ok: exitCode === 0 && !timedOut,
        output: truncateText(combined, maxOutputChars),
        stdout: truncateText(stdout, maxOutputChars),
        stderr: truncateText(stderr, maxOutputChars),
        error: timedOut ? `Codex timed out after ${timeoutMs}ms` : '',
        exitCode,
        signal,
        timedOut,
        durationMs: Date.now() - startedAt
      });
    });
  });
}

export function formatCodexResult(result) {
  const seconds = Math.max(0, result.durationMs / 1000).toFixed(1);
  const output = result.output || '(no output)';

  if (result.ok) {
    return `Codex finished in ${seconds}s.\n\n${output}`;
  }

  const status = result.timedOut
    ? 'timed out'
    : `failed with exit code ${result.exitCode ?? 'unknown'}`;
  const error = result.error ? `\n\n${result.error}` : '';
  return `Codex ${status} after ${seconds}s.${error}\n\n${output}`;
}
