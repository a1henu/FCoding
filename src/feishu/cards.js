export function buildCallbackTestCard({ nonce = String(Date.now()) } = {}) {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: {
        tag: 'plain_text',
        content: 'FCoding callback test'
      },
      template: 'blue'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: 'Click the button below. If long-connection callbacks are working, Feishu should show a toast and the bot service should log the callback.'
        }
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            text: {
              tag: 'plain_text',
              content: 'Test callback'
            },
            type: 'primary',
            value: {
              fcoding_action: 'callback_test',
              nonce
            }
          }
        ]
      }
    ]
  };
}

export function buildCallbackReceivedCard({
  receivedAt = new Date().toISOString(),
  action = 'callback_test'
} = {}) {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: {
        tag: 'plain_text',
        content: 'FCoding callback received'
      },
      template: 'green'
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `Long-connection callback received.\n\nAction: ${action}\nTime: ${receivedAt}`
        }
      }
    ]
  };
}
