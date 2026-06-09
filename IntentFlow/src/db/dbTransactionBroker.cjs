'use strict';

/**
 * DB transaction broker — serialized writes for Electron main process.
 * Evolved from dbWriteQueue; use this module for new code.
 */

module.exports = require('./dbWriteQueue.cjs');
