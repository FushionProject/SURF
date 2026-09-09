/* eslint-disable @typescript-eslint/no-require-imports -- Node preload must also work in CommonJS build workers. */
// Defense in depth locally; GitHub also removes external network interfaces.
const net = require('node:net');
const tls = require('node:tls');
const { syncBuiltinESMExports } = require('node:module');
const blocked = () => { throw new Error('External network is disabled in offline CI'); };
const local = host => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const options = args[0];
  const host = typeof options === 'object' ? options.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (host && !local(host)) return blocked();
  return connect.apply(this, args);
};
tls.connect = blocked;
const fetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (!local(url.hostname)) return blocked();
  return fetch(input, options);
};
syncBuiltinESMExports();
