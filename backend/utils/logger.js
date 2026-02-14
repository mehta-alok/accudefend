/**
 * AccuDefend Chargeback Defense System
 * Logger Configuration
 *
 * Console-based logger for maximum compatibility across Node.js versions.
 */

const ts = () => new Date().toISOString().replace('T', ' ').substring(0, 19);

const logger = {
  info: (msg, ...args) => console.log(`${ts()} [AccuDefend] info: ${msg}`, ...args),
  warn: (msg, ...args) => console.warn(`${ts()} [AccuDefend] warn: ${msg}`, ...args),
  error: (msg, ...args) => console.error(`${ts()} [AccuDefend] error: ${msg}`, ...args),
  debug: (msg, ...args) => {
    if (process.env.LOG_LEVEL === 'debug') console.debug(`${ts()} [AccuDefend] debug: ${msg}`, ...args);
  },
  http: (msg) => console.log(`${ts()} [AccuDefend] http: ${msg}`),
  log: ({ level, message }) => console.log(`${ts()} [AccuDefend] ${level}: ${message}`),
  stream: { write: (msg) => console.log(msg.trim()) }
};

module.exports = logger;
