const { AsyncLocalStorage } = require("async_hooks");
const appPoolPromise = require("./dbConn");
const cronPoolPromise = require("./cronDbConn");

const cronJobContext = new AsyncLocalStorage();

function runWithCronPool(fn) {
  return cronJobContext.run(true, fn);
}

function isCronJobContext() {
  return cronJobContext.getStore() === true;
}

function getActivePoolPromise() {
  return isCronJobContext() ? cronPoolPromise : appPoolPromise;
}

module.exports = {
  runWithCronPool,
  isCronJobContext,
  getActivePoolPromise,
};
