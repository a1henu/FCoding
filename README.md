# FCoding

FCoding is a local Feishu bot bridge for running Codex CLI tasks from Feishu messages. The preferred setup path is Feishu long connection (`FEISHU_EVENT_MODE=ws`); HTTP webhook mode also exists for environments with a public HTTPS callback URL.

## Repository

- GitHub: https://github.com/a1henu/FCoding
- Clone (HTTPS): `https://github.com/a1henu/FCoding.git`
- Clone (SSH): `git@github.com:a1henu/FCoding.git`

If an agent receives only this README, it should first make sure it has this repository locally before doing anything else.

## Source Of Truth

Before changing code or configuration, read:

1. `AGENTS.md`
2. `docs/agent-installation.md`
3. `docs/agent-context/project-map.md`
4. `docs/agent-context/current-plan.md`
5. `docs/agent-context/change-safety.md`
6. `docs/agent-context/testing-playbook.md`
7. `docs/agent-context/open-questions.md`

Key runtime files:

- `src/index.js`
- `src/config.js`
- `src/server.js`
- `src/feishu/events.js`
- `src/feishu/ws.js`
- `src/feishu/client.js`
- `src/codex/runner.js`

## What The Agent Should Achieve

The handoff goal is not just to edit files. The agent should guide the human through the full local setup so the bot can:

- receive Feishu direct messages through long connection
- run local Codex CLI tasks
- reply with ack, progress, and final output
- receive interactive card callbacks

Constraints:

- keep secrets only in ignored local files such as `.env`
- do not print `FEISHU_APP_SECRET`, tenant tokens, or full `.env`
- prefer Feishu long connection over HTTP mode unless the user explicitly wants webhook mode
- run the relevant tests after config-sensitive or code changes
- only commit/push safe source, tests, docs, and templates
- if docs and code disagree, call that out explicitly instead of guessing

## Recommended Agent Prompt

Use this when handing the project to an AI coding agent:

```text
Take over the FCoding repository at https://github.com/a1henu/FCoding (SSH: git@github.com:a1henu/FCoding.git). If the repository is not already available locally, clone it first. Before making any changes, read AGENTS.md, docs/agent-installation.md, docs/agent-context/project-map.md, docs/agent-context/current-plan.md, docs/agent-context/change-safety.md, docs/agent-context/testing-playbook.md, and docs/agent-context/open-questions.md.

Your job is to help me configure this project end to end as a local Feishu Codex bot. Guide me step by step, keep all secrets only in ignored local files such as .env, prefer Feishu long connection mode, configure Feishu message events and card.action.trigger callbacks, fill the minimum required local config, install dependencies, run the required tests, start the service, guide the smoke tests, and tighten allowlists after the first successful message if needed.

Use the repository's documented source-of-truth files for behavior: src/index.js, src/config.js, src/server.js, src/feishu/events.js, src/feishu/ws.js, src/feishu/client.js, and src/codex/runner.js. Do not invent missing Feishu permissions, CLI behavior, or repo features. If you find doc/code drift or unresolved questions, state them explicitly before changing behavior. Only commit or push safe source, tests, docs, and templates.
```

## 中文交接 Prompt

```text
请接管 FCoding 仓库：https://github.com/a1henu/FCoding （SSH: git@github.com:a1henu/FCoding.git）。如果本地还没有这个仓库，请先 clone。开始改动前，先阅读 AGENTS.md、docs/agent-installation.md、docs/agent-context/project-map.md、docs/agent-context/current-plan.md、docs/agent-context/change-safety.md、docs/agent-context/testing-playbook.md、docs/agent-context/open-questions.md。

你的任务是端到端帮我把这个项目配置成一个本地运行的飞书 Codex 机器人。请一步步引导我完成配置；所有敏感信息只能写入 .env 等已忽略的本地文件；优先使用飞书长连接模式；配置飞书消息事件和 card.action.trigger 卡片回调；补齐最小本地配置；安装依赖；运行需要的测试；启动服务；带我做 smoke test；如有需要，在首次成功收消息后再收紧 allowlist。

涉及行为判断时，以仓库里的 source-of-truth 文件为准：src/index.js、src/config.js、src/server.js、src/feishu/events.js、src/feishu/ws.js、src/feishu/client.js、src/codex/runner.js。不要自行脑补飞书权限名、CLI 能力或仓库中不存在的功能；如果发现文档和代码不一致，或者存在 unresolved questions，请先明确指出，再决定是否修改。只允许提交和推送安全的源码、测试、文档和模板文件。
```

## Minimal Local Commands

Useful commands once the repo is present locally:

```bash
npm install
npm test
npm start
git diff --check
git status --short
```

For the full setup workflow, see `docs/agent-installation.md`.
