// A tiny Chrome DevTools Protocol client for driving the packaged app from the
// outside (the app is launched with --remote-debugging-port). No dependencies:
// Node 20 needs --experimental-websocket, Node 22+ has WebSocket built in.
//
//   node cdp.mjs list
//   node cdp.mjs eval  <surface> "<js expression>"
//   node cdp.mjs click <surface> "<css selector>"
//   node cdp.mjs shot  <surface> <out.png>
//
// <surface> matches the renderer's ?surface= query (popover, dashboard, pill,
// minibar, settings). Exits non-zero when the target or element is missing.
/* global fetch, setTimeout, WebSocket */
import fs from 'node:fs';

const PORT = process.env.CDP_PORT ?? '9222';
const [cmd, surface, arg] = process.argv.slice(2);

async function targets() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      return (await res.json()).filter((t) => t.type === 'page');
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`no DevTools endpoint on port ${PORT}`);
}

async function session(name) {
  const page = (await targets()).find((t) => new URL(t.url).searchParams.get('surface') === name);
  if (!page) throw new Error(`no page for surface "${name}"`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { send, close: () => ws.close() };
}

async function evaluate(s, expression) {
  const r = await s.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

try {
  if (cmd === 'list') {
    for (const t of await targets()) console.log(`${t.title}\t${t.url}`);
  } else if (cmd === 'eval') {
    const s = await session(surface);
    console.log(JSON.stringify(await evaluate(s, arg)));
    s.close();
  } else if (cmd === 'click') {
    const s = await session(surface);
    const ok = await evaluate(
      s,
      `(() => { const el = document.querySelector(${JSON.stringify(arg)}); if (!el) return false; el.click(); return true; })()`,
    );
    s.close();
    if (!ok) throw new Error(`no element "${arg}" in ${surface}`);
    console.log(`clicked ${arg} in ${surface}`);
  } else if (cmd === 'shot') {
    const s = await session(surface);
    const { data } = await s.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(arg, Buffer.from(data, 'base64'));
    s.close();
    console.log(`wrote ${arg}`);
  } else {
    throw new Error(`unknown command "${cmd}"`);
  }
} catch (err) {
  console.error(`cdp: ${err.message}`);
  process.exit(1);
}
