// 用 CDP WebSocket 截图指定 target
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

const [,, targetId, outPath, expr] = process.argv;

function httpJson(path){
  return new Promise((res,rej)=>{
    http.get({host:'127.0.0.1',port:9223,path},r=>{
      let b='';r.on('data',c=>b+=c);r.on('end',()=>{try{res(JSON.parse(b))}catch(e){rej(e)}});
    }).on('error',rej);
  });
}

(async()=>{
  const targets = await httpJson('/json/list');
  const t = targets.find(x=>x.id===targetId) || targets.find(x=>x.type==='page');
  if(!t){console.error('no target');process.exit(1);}
  const ws = new WebSocket(t.webSocketDebuggerUrl,{perMessageDeflate:false});
  let id=0; const pend={};
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;pend[i]={res,rej};ws.send(JSON.stringify({id:i,method,params}));});
  ws.on('message',d=>{const m=JSON.parse(d); if(m.id&&pend[m.id]){m.error?pend[m.id].rej(new Error(m.error.message)):pend[m.id].res(m.result);delete pend[m.id];}});
  await new Promise(r=>ws.on('open',r));
  await send('Page.enable');
  await send('Runtime.enable');
  // 可选：执行 JS（用于交互，如点击/切换分类）
  if(expr){
    const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
    console.log('EVAL:', JSON.stringify(r.result && r.result.value).slice(0,300));
    await new Promise(r=>setTimeout(r,1200)); // 等渲染
  }
  const shot = await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync(outPath, Buffer.from(shot.data,'base64'));
  console.log('SAVED', outPath, fs.statSync(outPath).size);
  ws.close();
  process.exit(0);
})().catch(e=>{console.error('ERR',e.message);process.exit(1);});
