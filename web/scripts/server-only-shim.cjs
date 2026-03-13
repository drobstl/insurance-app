// Override the 'server-only' module so lib/* can be imported in standalone scripts.
// This file must be --require'd before running any script that imports lib/ modules.
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'server-only') {
    return __filename;
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
module.exports = {};
