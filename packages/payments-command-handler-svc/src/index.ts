'use strict'
// require("./telemetry.js"); // Load telemetry before running the rest of the app

import { PaymentsServiceApp } from './app'
export { PaymentsServiceApp } from './app' // re-export for unit tests package

PaymentsServiceApp.start()
  .then(() => {
    console.log('Started service')
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
