'use strict';

import { OpenPaymentsAuthServer } from './service.js';
import process from 'process';

void OpenPaymentsAuthServer.start().then(() => {
  console.log('OpenPaymentsAuthServer start complete');
});

async function _handle_int_and_term_signals(
  signal: NodeJS.Signals
): Promise<void> {
  console.info(`Service - ${signal} received - cleaning up...`);
  let cleanExit = false;
  setTimeout(() => {
    if (!cleanExit) {
      process.exit(99);
    }
  }, 5000);

  await OpenPaymentsAuthServer.stop();

  cleanExit = true;
  process.exit();
}

process.on('SIGINT', _handle_int_and_term_signals);
process.on('SIGTERM', _handle_int_and_term_signals);

process.on('exit', async () => {
  console.info('Microservice - exiting...');
});
process.on('uncaughtException', (err: Error) => {
  console.error(err);
  console.log('UncaughtException - EXITING...');
  process.exit(999);
});
