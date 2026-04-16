import { loadDotEnv } from './dotenv.js';
import { loadConfig } from './config.js';
import { FeishuClient } from './feishu/client.js';
import { createServer } from './server.js';

loadDotEnv();

const config = loadConfig();
const feishuClient = new FeishuClient(config.feishu);
const server = createServer({ config, feishuClient });

server.listen(config.port, config.host, () => {
  console.log(`FCoding listening on http://${config.host}:${config.port}`);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
