// Simple preview server for wp-agui-chat plugin UI
// Serves static assets and stubs WordPress REST endpoints used by the UI
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const ROOT = process.cwd();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5500;

function sendJson(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin':'*' });
  res.end(body);
}

function parseBody(req){
  return new Promise((resolve)=>{
    let data='';
    req.on('data', chunk=>{ data += chunk; });
    req.on('end', ()=>{
      try{ resolve(JSON.parse(data||'{}')); }catch(e){ resolve({}); }
    });
  });
}

function svgFromPrompt(prompt){
  const safe = String(prompt||'Brand Concept').replace(/[\r\n]+/g,' ').slice(0,80);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600">
    <defs>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="#f0f4ff"/>
        <stop offset="1" stop-color="#e2eafc"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="50%" y="45%" text-anchor="middle" font-family="Inter,Arial" font-size="42" fill="#111" opacity="0.9">Brand Visual</text>
    <text x="50%" y="58%" text-anchor="middle" font-family="Inter,Arial" font-size="28" fill="#333">${safe}</text>
  </svg>`;
}

function contentType(ext){
  const map = {
    '.html':'text/html', '.js':'application/javascript', '.css':'text/css',
    '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml'
  };
  return map[ext] || 'application/octet-stream';
}

const server = http.createServer(async (req,res)=>{
  const parsed = url.parse(req.url, true);
  const pathname = decodeURI(parsed.pathname);

  // CORS preflight for stub endpoints
  if(req.method === 'OPTIONS'){
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, ngrok-skip-browser-warning'
    });
    return res.end('');
  }

  // Settings endpoint: proxy to WP if WP_ORIGIN is set, otherwise stub
  if (pathname === '/wp-json/agui-chat/v1/settings') {
    const ENV_WP_ORIGIN = process.env.WP_ORIGIN || '';
    if (ENV_WP_ORIGIN) {
      const target = new url.URL('/wp-json/agui-chat/v1/settings', ENV_WP_ORIGIN);
      const mod = target.protocol === 'https:' ? require('https') : require('http');
      const rq = mod.request(target, { method: 'GET' }, (rs) => {
        let data = '';
        rs.on('data', (c) => data += c);
        rs.on('end', () => {
          try {
            const src = JSON.parse(data);
            // Rewrite endpoints to use local preview proxy to avoid CORS in the browser
            const AGENT_IMAGE_ENDPOINT = process.env.AGENT_IMAGE_ENDPOINT || '';
            const FASTAPI_BASE = process.env.FASTAPI_BASE || '';
            const FAL_KEY = process.env.FAL_KEY || '';
            const out = { ...src };
            // Ensure the client knows to poll this same settings endpoint
            out.wpSettingsEndpoint = '/wp-json/agui-chat/v1/settings';
            out.wpSendEndpoint = '/wp-json/agui-chat/v1/agency/respond';
            out.wpFormEndpoint = '/wp-json/agui-chat/v1/ghl/contact';
            out.wpImageEndpoint = '/wp-json/agui-chat/v1/image/generate';
            out.wpAgencyRespond = '/wp-json/agui-chat/v1/agency/respond';
            out.wpAgencyStream = '/wp-json/agui-chat/v1/agency/stream';
            // Prefer explicit AGENT_IMAGE_ENDPOINT; else derive from FASTAPI_BASE
            if (AGENT_IMAGE_ENDPOINT) {
              out.agentImageEndpoint = AGENT_IMAGE_ENDPOINT;
            } else if (FASTAPI_BASE) {
              try { const b = String(FASTAPI_BASE).replace(/\/$/, ''); out.agentImageEndpoint = b + '/api/fal/generate'; } catch(_) {}
            }
            // Match frontend casing: fastApiBase
            out.fastApiBase = FASTAPI_BASE || out.fastApiBase || '';
            out.fal_configured = !!FAL_KEY || !!out.fal_configured;
            sendJson(res, rs.statusCode || 200, out);
          }
          catch(_) { res.writeHead(rs.statusCode || 200); res.end(data); }
        });
      });
      rq.on('error', () => sendJson(res, 502, { error:'Proxy to WP settings failed' }));
      rq.end();
      return;
    }
    const WP_ORIGIN = ENV_WP_ORIGIN;
    const AGENT_IMAGE_ENDPOINT = process.env.AGENT_IMAGE_ENDPOINT || '';
    const FAL_KEY = process.env.FAL_KEY || '';
    const publicCfg = {
      sseUrl: '',
      wsUrl: '',
      sendUrl: '',
      preferWebSocket: false,
      fallbackUrl: '',
      wpSettingsEndpoint: '/wp-json/agui-chat/v1/settings',
      wpSendEndpoint: '/wp-json/agui-chat/v1/agency/respond',
      wpFormEndpoint: '/wp-json/agui-chat/v1/ghl/contact',
      wpImageEndpoint: '/wp-json/agui-chat/v1/image/generate',
      fastApiBase: process.env.FASTAPI_BASE || '',
      dbToken: '',
      agentImageEndpoint: AGENT_IMAGE_ENDPOINT || (WP_ORIGIN ? new url.URL('/api/fal/generate', WP_ORIGIN).href : '')
    };
    publicCfg.fal_configured = !!FAL_KEY;
    return sendJson(res, 200, publicCfg);
  }

  // Image generation endpoint: proxy to WP if WP_ORIGIN is set; otherwise proxy to Agent if AGENT_IMAGE_ENDPOINT is set; else 503
  if (pathname === '/wp-json/agui-chat/v1/image/generate') {
    const ENV_WP_ORIGIN2 = process.env.WP_ORIGIN || '';
    const AGENT_IMAGE_ENDPOINT = process.env.AGENT_IMAGE_ENDPOINT || '';
    const body = await parseBody(req);
    if (ENV_WP_ORIGIN2) {
      const target = new url.URL('/wp-json/agui-chat/v1/image/generate', ENV_WP_ORIGIN2);
      const mod = target.protocol === 'https:' ? require('https') : require('http');
      const rq = mod.request(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, (rs) => {
        let data = '';
        rs.on('data', (c) => data += c);
        rs.on('end', () => {
          try { sendJson(res, rs.statusCode || 200, JSON.parse(data)); }
          catch(_) { res.writeHead(rs.statusCode || 200); res.end(data); }
        });
      });
      rq.on('error', () => sendJson(res, 502, { error:'Proxy to WP image generate failed' }));
      rq.end(JSON.stringify(body||{}));
      return;
    }
    if (AGENT_IMAGE_ENDPOINT) {
      try {
        const target = new url.URL(AGENT_IMAGE_ENDPOINT);
        const mod = target.protocol === 'https:' ? require('https') : require('http');
        const rq = mod.request(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept':'application/json' }
        }, (rs) => {
          let data = '';
          rs.on('data', (c) => data += c);
          rs.on('end', () => {
            try { sendJson(res, rs.statusCode || 200, JSON.parse(data)); }
            catch(_) { res.writeHead(rs.statusCode || 200); res.end(data); }
          });
        });
        rq.on('error', () => sendJson(res, 502, { error:'Proxy to Agent image generate failed' }));
        rq.end(JSON.stringify(body||{}));
        return;
      } catch(e) {
        return sendJson(res, 500, { error:'Invalid AGENT_IMAGE_ENDPOINT' });
      }
    }
    return sendJson(res, 503, { error:'No image generation backend configured. Set WP_ORIGIN or AGENT_IMAGE_ENDPOINT.' });
  }

  // Contact creation endpoint (GHL stub)
  if (pathname === '/wp-json/agui-chat/v1/ghl/contact') {
    const body = await parseBody(req);
    const name = body && (body.name || body.full_name || 'Guest');
    const email = body && (body.email || 'guest@example.com');
    const handle = body && (body.handle || '');
    const sessionId = 'sess_' + Math.random().toString(36).slice(2,10);
    return sendJson(res, 200, { ok:true, status:200, data:{ contact_id:'c_'+Date.now(), session_id:sessionId, name, email, handle } });
  }

  // Optional social scan stub
  if (pathname === '/wp-json/agui-chat/v1/social/scan') {
    const body = await parseBody(req);
    const handle = (body && body.handle) || '';
    const summary = handle ? `@${handle} vibes: upbeat, entrepreneurial; audience: early-stage founders; content: tips, reels, carousels.`
                           : 'No handle provided.';
    return sendJson(res, 200, { ok:true, status:200, data:{ handle, summary } });
  }

  // Brand name generator stub
  if (pathname === '/wp-json/agui-chat/v1/brandname/generate') {
    const body = await parseBody(req);
    const seed = (body && (body.seed || body.description || 'brand'));
    const base = seed.replace(/[^a-zA-Z0-9 ]/g,' ').trim().split(/\s+/)[0] || 'Nova';
    const names = [ `${base} Labs`, `${base} Co`, `${base} Studio`, `${base} Works`, `${base} Forge`, `${base} Hub` ];
    const suggestions = names.map(n => ({ name:n, avail:{ domain: Math.random()>0.4, instagram: Math.random()>0.4 } }));
    return sendJson(res, 200, { ok:true, status:200, data:{ suggestions } });
  }

  // Top products/SKUs stub
  if (pathname === '/wp-json/agui-chat/v1/products/top') {
    const body = await parseBody(req);
    const cat = (body && body.category) || 'Drinkware';
    const mkSvg = (title)=> 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"600\" height=\"400\"><rect width=\"100%\" height=\"100%\" fill=\"#eef2ff\"/><text x=\"50%\" y=\"50%\" text-anchor=\"middle\" font-size=\"22\" font-family=\"Inter,Arial\">${title}</text></svg>`);
    const items = [
      { id:'sku1', title:`${cat} Pro`, blurb:'Premium quality, durable finish', image_url: mkSvg(`${cat} Pro`) },
      { id:'sku2', title:`${cat} Lite`, blurb:'Budget-friendly, great value', image_url: mkSvg(`${cat} Lite`) },
      { id:'sku3', title:`${cat} Max`, blurb:'Largest size, bold presence', image_url: mkSvg(`${cat} Max`) }
    ];
    return sendJson(res, 200, { ok:true, status:200, data:{ items } });
  }

  // Calendar slots stub (GHL)
  if (pathname === '/wp-json/agui-chat/v1/ghl/slots') {
    const now = Date.now();
    const day = 24*60*60*1000;
    const slots = [1,2,3,4,5].map(i => ({ id:'slot'+i, time: new Date(now + i*day).toISOString().slice(0,16).replace('T',' ') }));
    return sendJson(res, 200, { ok:true, status:200, data:{ slots } });
  }

  // Book a slot stub (GHL)
  if (pathname === '/wp-json/agui-chat/v1/ghl/book') {
    const body = await parseBody(req);
    const slotId = (body && body.slot_id) || 'slot1';
    return sendJson(res, 200, { ok:true, status:200, data:{ booking_id:'b_'+Date.now(), slot_id: slotId, message:'Booked! A confirmation email was sent.' } });
  }

  // Serve static files
  let filePath = path.join(ROOT, pathname === '/' ? '/preview-plugin.html' : pathname);
  try{
    const st = fs.statSync(filePath);
    if(st.isDirectory()){
      filePath = path.join(filePath, 'index.html');
    }
  }catch(e){
    res.writeHead(404, { 'Content-Type':'text/plain' });
    return res.end('Not found');
  }
  try{
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType(path.extname(filePath)) });
    res.end(data);
  }catch(e){
    res.writeHead(500, { 'Content-Type':'text/plain' });
    res.end('Server error');
  }
});

server.listen(PORT, ()=>{
  console.log('Preview server running at http://localhost:'+PORT+'/');
});

// Keep server alive
process.on('SIGINT', ()=>{ try{ server.close(); }catch(e){} process.exit(0); });