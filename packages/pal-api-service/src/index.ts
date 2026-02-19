/*****
 Copyright © 2026 & Interledger Foundation
 ----------------------------------------------
 Contributors

 * Cyberbones Digital Solutions
 - Pedro Sousa Barreto <pedrosousabarreto@gmail.com>
 ******/

"use strict";

import {PalApiService} from "./service";
import process from "process";

void PalApiService.start().then(() => {
  console.log(`${PalApiService.constructor.name} start complete`);
});


/**
 * process termination and cleanup
 */

async function _handle_int_and_term_signals(signal: NodeJS.Signals): Promise<void> {
  console.info(`Service - ${signal} received - cleaning up...`);
  let clean_exit = false;
  setTimeout(() => {
    // eslint-disable-next-line
    clean_exit || process.exit(99);
  }, 5000);

  // call graceful stop routine
  await PalApiService.stop();

  clean_exit = true;
  process.exit();
}

//catches ctrl+c event
process.on("SIGINT", _handle_int_and_term_signals);
//catches program termination event
process.on("SIGTERM", _handle_int_and_term_signals);

//do something when app is closing
process.on("exit", async () => {
  console.info("Microservice - exiting...");
});
process.on("uncaughtException", (err: Error) => {
  console.error(err);
  console.log("UncaughtException - EXITING...");
  process.exit(999);
});
