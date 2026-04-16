import { loadDotEnv } from './dotenv.js';
import { loadConfig } from './config.js';
import { createRuntimeState } from './runtime-state.js';
import { FeishuClient } from './feishu/client.js';
import { createServer } from './server.js';
import { startWsEventClient } from './feishu/ws.js';

loadDotEnv();

const config = loadConfig();
const feishuClient = new FeishuClient(config.feishu);
const runtimeState = createRuntimeState({ config });
let server = null;
let wsClient = null;

if (config.eventMode === 'ws') {
  wsClient = await startWsEventClient({ config, feishuClient, runtimeState });
  console.log('FCoding Feishu WS client started');
} else if (config.eventMode === 'http') {
  server = createServer({ config, feishuClient, runtimeState });
  server.listen(config.port, config.host, () => {
    console.log(`FCoding listening on http://${config.host}:${config.port}`);
  });
} else {
  throw new Error(`Unsupported FEISHU_EVENT_MODE: ${config.eventMode}`);
}

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  wsClient?.close?.({ force: true });
  if (server) {
    server.close(() => process.exit(0));
    return;
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
