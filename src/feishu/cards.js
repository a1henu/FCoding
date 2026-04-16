function plainText(content) {
  return {
    tag: 'plain_text',
    content
  };
}

function markdown(content) {
  return {
    tag: 'lark_md',
    content
  };
}

function cardConfig() {
  return {
    wide_screen_mode: true
  };
}

function section(label, value) {
  return `**${label}:** ${value}`;
}

function statusTemplate(status) {
  switch (status) {
    case 'success':
      return 'green';
    case 'error':
      return 'red';
    case 'running':
      return 'orange';
    default:
      return 'blue';
  }
}

function authDescription(runtime) {
  return 'ChatGPT login';
}

function buildSummaryLines(runtime) {
  return [
    section('Workspace', `\`${runtime.workspace}\``),
    section('Model', runtime.model ? `\`${runtime.model}\`` : 'default'),
    section('Auth', authDescription(runtime))
  ];
}

function makeToggleAction({ cardId, expanded }) {
  return {
    tag: 'button',
    text: plainText(expanded ? 'Hide output' : 'Show output'),
    value: {
      fcoding_action: expanded ? 'collapse_output' : 'expand_output',
      card_id: cardId
    }
  };
}

function buildReplyCard({
  title,
  template = 'blue',
  bodyLines = [],
  actions = []
}) {
  const elements = [];

  if (bodyLines.length > 0) {
    elements.push({
      tag: 'div',
      text: markdown(bodyLines.join('\n'))
    });
  }

  if (actions.length > 0) {
    elements.push({
      tag: 'action',
      actions
    });
  }

  return {
    config: cardConfig(),
    header: {
      title: plainText(title),
      template
    },
    elements
  };
}

export function buildCallbackTestCard({ nonce = String(Date.now()) } = {}) {
  return buildReplyCard({
    title: 'FCoding callback test',
    template: 'blue',
    bodyLines: [
      'Click the button below.',
      'If long-connection callbacks are working, Feishu should show a toast and the bot service should log the callback.'
    ],
    actions: [
      {
        tag: 'button',
        text: plainText('Test callback'),
        type: 'primary',
        value: {
          fcoding_action: 'callback_test',
          nonce
        }
      }
    ]
  });
}

export function buildCallbackReceivedCard({
  receivedAt = new Date().toISOString(),
  action = 'callback_test'
} = {}) {
  return buildReplyCard({
    title: 'FCoding callback received',
    template: 'green',
    bodyLines: [
      `Long-connection callback received.`,
      '',
      section('Action', `\`${action}\``),
      section('Time', receivedAt)
    ]
  });
}

export function buildCommandResultCard({
  title,
  summary,
  details = [],
  status = 'info'
} = {}) {
  return buildReplyCard({
    title,
    template: statusTemplate(status),
    bodyLines: [
      summary,
      ...(details.length > 0 ? ['', ...details] : [])
    ]
  });
}

export function buildTaskStatusCard({
  task,
  runtime,
  result,
  cardId,
  expanded = false
}) {
  const template = statusTemplate(result.ok ? 'success' : result.timedOut ? 'error' : 'error');
  const statusLine = result.ok
    ? `Completed in ${(Math.max(0, result.durationMs || 0) / 1000).toFixed(1)}s`
    : result.timedOut
      ? `Timed out after ${(Math.max(0, result.durationMs || 0) / 1000).toFixed(1)}s`
      : `Failed after ${(Math.max(0, result.durationMs || 0) / 1000).toFixed(1)}s`;
  const bodyLines = [
    section('Prompt', `\`${task.prompt}\``),
    section('Status', statusLine),
    ...buildSummaryLines(runtime)
  ];

  if (result.error) {
    bodyLines.push(section('Error', result.error));
  }

  if (expanded) {
    bodyLines.push('', '**Output**', '```text', result.output || '(no output)', '```');
  } else if (result.output) {
    const preview = result.output.length > 220
      ? `${result.output.slice(0, 220).trimEnd()}...`
      : result.output;
    bodyLines.push('', section('Preview', `\`${preview.replace(/\n/g, ' ')}\``));
  }

  return buildReplyCard({
    title: result.ok ? 'FCoding task finished' : 'FCoding task failed',
    template,
    bodyLines,
    actions: cardId
      ? [makeToggleAction({ cardId, expanded })]
      : []
  });
}

export function buildStatusCard({ runtime, loginStatus }) {
  return buildReplyCard({
    title: 'FCoding status',
    template: 'blue',
    bodyLines: [
      ...buildSummaryLines(runtime),
      section('Codex login', loginStatus || 'unknown')
    ]
  });
}
