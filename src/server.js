import { createApp } from './app.js';
import { readFileSync } from 'node:fs';

const portIndex = process.argv.indexOf('--port');
const port = Number(portIndex === -1 ? process.env.PORT ?? 3000 : process.argv[portIndex + 1]);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const indexHtml = process.argv.includes('--ui')
  ? readFileSync(new URL('../ui/index.html', import.meta.url), 'utf8') : null;
const server = createApp({ indexHtml });
server.on('error', error => {
  console.error(`Unable to start FX API: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, () => {
  console.log(`FX API listening at http://localhost:${port}/convert`);
  if (indexHtml) console.log(`Currency converter: http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log(`${signal}: closing FX API`);
    server.close();
    const timeout = setTimeout(() => server.closeAllConnections(), 5000);
    timeout.unref();
  });
}
