// CDP 驱动：list / open / shot / eval / click
// 用法：node cdp.js <cmd> [args...]   （需在 PowerShell 中运行，端口 9223）
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const PORT = 9223;

function httpJson(path) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PORT, path }, r => {
      let b = ''; r.on('data', c => b += c); r.on('end', () => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          return httpJson(r.headers.location).then(res, rej);
        }
        try { res(JSON.parse(b)); } catch (e) { rej(new Error('bad json: ' + b.slice(0, 200))); }
      });
    }).on('error', rej);
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function connect(idxOrId) {
  let targets = await httpJson('/json/list');
  targets = targets.filter(t => t.type === 'page');
  let t;
  if (/^\d+$/.test(String(idxOrId))) t = targets[Number(idxOrId)];
  else t = targets.find(x => x.id === idxOrId) || targets.find(x => (x.url || '').includes(idxOrId));
  if (!t) throw new Error('no target. available:\n' + targets.map((x, i) => i + ' ' + x.title + ' ' + x.url).join('\n'));
  const ws = new WebSocket(t.webSocketDebuggerUrl, { perMessageDeflate: false });
  let id = 0; const pend = {};
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; pend[i] = { res, rej };
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  ws.on('message', d => {
    const m = JSON.parse(d);
    if (m.id && pend[m.id]) { m.error ? pend[m.id].rej(new Error(m.error.message)) : pend[m.id].res(m.result); delete pend[m.id]; }
  });
  await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
  await send('Page.enable'); await send('Runtime.enable');
  return {
    target: t, close: () => ws.close(),
    send,
    eval: async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('EVAL EXC: ' + JSON.stringify(r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
      return r.result && r.result.value;
    },
    shot: async (out) => {
      const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(out, Buffer.from(s.data, 'base64'));
      return fs.statSync(out).size;
    },
  };
}

(async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'list') {
    const ts = await httpJson('/json/list');
    ts.filter(t => t.type === 'page').forEach((t, i) => console.log(`[${i}] ${t.id}  ${t.title}  ${t.url}`));
    return;
  }
  if (cmd === 'open') {
    const url = rest[0];
    const res = await httpJson('/json/new?' + encodeURIComponent(url));
    console.log('opened', res.id, res.url);
    await sleep(5000);
    if (rest[1]) { const c = await connect(res.id); const n = await c.shot(rest[1]); console.log('SAVED', rest[1], n); c.close(); }
    return;
  }
  if (cmd === 'shot') {
    const [idx, out, expr] = rest;
    const c = await connect(idx);
    if (expr) { const v = await c.eval(expr); console.log('EVAL:', String(JSON.stringify(v)).slice(0, 800)); await sleep(1500); }
    const n = await c.shot(out); console.log('SAVED', out, n);
    console.log('TITLE:', c.target.title, '| URL:', c.target.url);
    c.close(); return;
  }
  if (cmd === 'eval') {
    const [idx, expr] = rest;
    const c = await connect(idx);
    const v = await c.eval(expr);
    console.log(JSON.stringify(v, null, 1).slice(0, 4000));
    c.close(); return;
  }
  if (cmd === 'click') {
    const [idx, sel, out] = rest;
    const c = await connect(idx);
    const v = await c.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'NOT_FOUND'; e.scrollIntoView({block:'center'}); e.click(); return 'CLICKED '+(e.innerText||'').slice(0,40);})()`);
    console.log(v); await sleep(1800);
    if (out) { const n = await c.shot(out); console.log('SAVED', out, n); }
    c.close(); return;
  }
  if (cmd === 'tap') {
    // node cdp.js tap <idx> <sel|text=xxx> [out.png]  —— 用 Input.dispatchMouseEvent 模拟真实点击
    const [idx, selArg, out] = rest;
    const c = await connect(idx);
    const findExpr = selArg.startsWith('xy=')
      ? `(()=>{const [x,y]=${JSON.stringify(selArg.slice(3))}.split(',').map(Number);const e=document.elementFromPoint(x,y);return {x,y,hit:e?(e.tagName+'.'+String(e.className).split(' ')[0]+' '+(e.innerText||'').trim().slice(0,20)):null};})()`
      : selArg.startsWith('text=')
      ? `(()=>{const want=${JSON.stringify(selArg.slice(5))};const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&(e.innerText||'').trim()===want&&e.offsetHeight>0);const e=els[0];if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`
      : selArg.startsWith('cat=')
      ? `(()=>{const want=${JSON.stringify(selArg.slice(4))};const e=[...document.querySelectorAll('.category-item')].find(x=>x.innerText.trim()===want);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`
      : `(()=>{const e=document.querySelector(${JSON.stringify(selArg)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`;
    const p = await c.eval(findExpr);
    if (!p) { console.log('NOT_FOUND', selArg); c.close(); return; }
    const clickPoint = { x: p.x, y: p.y, button: 'left', clickCount: 1 };
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await sleep(120);
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...clickPoint });
    await sleep(60);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...clickPoint });
    console.log('TAPPED', selArg, 'at', p.x, p.y);
    await sleep(1800);
    if (out) { const n = await c.shot(out); console.log('SAVED', out, n); }
    c.close(); return;
  }
  if (cmd === 'right') {
    // node cdp.js right <idx> <xy=x,y|sel> [out.png] —— 右键
    const [idx, selArg, out] = rest;
    const c = await connect(idx);
    const p = await c.eval(selArg.startsWith('xy=')
      ? `(()=>{const [x,y]=${JSON.stringify(selArg.slice(3))}.split(',').map(Number);return {x,y};})()`
      : `(()=>{const e=document.querySelector(${JSON.stringify(selArg)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if (!p) { console.log('NOT_FOUND'); c.close(); return; }
    await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
    await sleep(100);
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'right', clickCount: 1 });
    await sleep(60);
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'right', clickCount: 1 });
    console.log('RIGHT-CLICKED at', p.x, p.y);
    await sleep(1500);
    if (out) { const n = await c.shot(out); console.log('SAVED', out, n); }
    c.close(); return;
  }
  console.log('unknown cmd', cmd);
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
