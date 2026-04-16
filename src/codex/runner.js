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
  env = process.env,
  signal
}) {
  const startedAt = Date.now();
  const childArgs = [...args, prompt];
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let cancelled = false;

  if (signal?.aborted) {
    return {
      ok: false,
      output: '',
      stdout: '',
      stderr: '',
      error: 'Codex task cancelled',
      exitCode: null,
      signal: null,
      timedOut: false,
      cancelled: true,
      durationMs: Date.now() - startedAt
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    let killTimer = null;
    const child = spawn(command, childArgs, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
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
      signal?.removeEventListener?.('abort', abortChild);
      resolve(result);
    }

    function abortChild() {
      if (settled) {
        return;
      }

      cancelled = true;
      child.kill('SIGTERM');
      killTimer = setTimeout(() => child.kill('SIGKILL'), 5000);
      killTimer.unref?.();
    }

    signal?.addEventListener?.('abort', abortChild, { once: true });

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
        cancelled,
        durationMs: Date.now() - startedAt
      });
    });

    child.once('close', (exitCode, signal) => {
      const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n\n');
      finish({
        ok: exitCode === 0 && !timedOut && !cancelled,
        output: truncateText(combined, maxOutputChars),
        stdout: truncateText(stdout, maxOutputChars),
        stderr: truncateText(stderr, maxOutputChars),
        error: cancelled
          ? 'Codex task cancelled'
          : timedOut
            ? `Codex timed out after ${timeoutMs}ms`
            : '',
        exitCode,
        signal,
        timedOut,
        cancelled,
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

  const status = result.cancelled
    ? 'cancelled'
    : result.timedOut
    ? 'timed out'
    : `failed with exit code ${result.exitCode ?? 'unknown'}`;
  const error = result.error ? `\n\n${result.error}` : '';
  return `Codex ${status} after ${seconds}s.${error}\n\n${output}`;
}
