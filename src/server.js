import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}
const server = createApp();
server.on('error', error => {
  console.error(`Unable to start FX API: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, () => console.log(`FX API listening at http://localhost:${port}/convert`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    console.log(`${signal}: closing FX API`);
    server.close();
    const timeout = setTimeout(() => server.closeAllConnections(), 5000);
    timeout.unref();
  });
}
