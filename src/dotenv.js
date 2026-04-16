import fs from 'node:fs';

export function parseDotEnv(content) {
  const values = {};

  for (const rawLine of String(content || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    values[key] = parseValue(normalized.slice(separatorIndex + 1).trim());
  }

  return values;
}

function parseValue(value) {
  if (!value) {
    return '';
  }

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    const inner = value.slice(1, -1);
    return quote === '"'
      ? inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
      : inner;
  }

  const commentIndex = value.search(/\s#/);
  return (commentIndex === -1 ? value : value.slice(0, commentIndex)).trim();
}

export function loadDotEnv(path = '.env', env = process.env) {
  if (!fs.existsSync(path)) {
    return {};
  }

  const parsed = parseDotEnv(fs.readFileSync(path, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (env[key] === undefined) {
      env[key] = value;
    }
  }

  return parsed;
}
