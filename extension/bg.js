// Relays content-script requests to the local server (content scripts on https pages can't reach localhost directly).
const API = 'http://127.0.0.1:47821';
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    try {
      if (msg.type === 'item') return reply(await (await fetch(`${API}/item?url=${encodeURIComponent(msg.url)}`)).json());
      if (msg.type === 'resume') {
        const buf = new Uint8Array(await (await fetch(`${API}/resume`)).arrayBuffer());
        let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return reply(btoa(s));
      }
      if (msg.type === 'applied') return reply(await (await fetch(`${API}/applied`, { method: 'POST', body: JSON.stringify({ url: msg.url }) })).json());
      if (msg.type === 'debug') return reply(await (await fetch(`${API}/debug`, { method: 'POST', body: JSON.stringify(msg) })).json());
      reply(null);
    } catch (e) { reply({ error: String(e) }); }
  })();
  return true;
});
