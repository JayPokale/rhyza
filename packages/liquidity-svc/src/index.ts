"use strict";

import {LiquidityRestServiceApp} from "./application/app";
export {LiquidityRestServiceApp} from "./application/app"; // re-export for unit tests package

LiquidityRestServiceApp.start().then(() => {
    console.log("Started service");
}).catch(error => {
    console.error(error);
});
