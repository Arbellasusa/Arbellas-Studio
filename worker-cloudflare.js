// Servidor de IA para Arbella Studio (Cloudflare Worker).
// Guarda tus claves fuera de la app para que nadie las pueda ver.
//
// Variables que debes crear en Cloudflare (Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  tu clave de console.anthropic.com  → guiones
//   LEONARDO_API_KEY   (Secret)  tu clave de app.leonardo.ai → API  → arreglar fotos
//   GEMINI_API_KEY     (Secret)  tu clave de aistudio.google.com     → video IA de Google
//   VIDEO_MODEL        (Text, opcional) por defecto gemini-omni-1.1-flash
//   APP_TOKEN          (Secret)  una contraseña que inventes; la misma va en Ajustes de la app
//   ALLOWED_ORIGIN     (Text)    https://arbellasusa.github.io
//   MODEL              (Text, opcional) por defecto claude-sonnet-5-5
//   ANTHROPIC_WORKSPACE_ID (Text, opcional) solo si tu clave no está asignada a un workspace

const LEO = 'https://cloud.leonardo.ai/api/rest';

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim().replace(/\/+$/, '')).filter(Boolean);
    const okOrigin = allowed.includes(origin);
    const cors = {
      'Access-Control-Allow-Origin': okOrigin ? origin : (allowed[0] || 'null'),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ error: 'Usa POST' }, 405);
    if (!okOrigin) return json({ error: 'Origen no permitido. Revisa ALLOWED_ORIGIN.' }, 403);
    if (!env.APP_TOKEN || request.headers.get('X-App-Token') !== env.APP_TOKEN) return json({ error: 'Contraseña incorrecta' }, 401);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'Solicitud inválida' }, 400); }

    try {
      switch (body.action || 'script') {
        case 'script': return await script(body, env, json);
        case 'nobg':   return await leoNoBg(body, env, json);
        case 'edit':   return await leoEdit(body, env, json);
        case 'status': return await leoStatus(body, env, json);
        case 'video_start':  return await gVideoStart(body, env, json);
        case 'video_status': return await gVideoStatus(body, env, json, cors);
        case 'video_file':   return await gVideoFile(body, env, json, cors);
        case 'ping':   return json({ ok: true, claude: !!env.ANTHROPIC_API_KEY, leonardo: !!env.LEONARDO_API_KEY, google: !!env.GEMINI_API_KEY });
        default:       return json({ error: 'Acción desconocida' }, 400);
      }
    } catch (e) {
      return json({ error: String(e && e.message || e) }, 502);
    }
  }
};

/* ---------- Claude: guiones ---------- */
async function script(body, env, json) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'Falta ANTHROPIC_API_KEY en el servidor' }, 500);
  const prompt = String(body.prompt || '').slice(0, 8000);
  if (!prompt) return json({ error: 'Falta el texto' }, 400);
  const images = Array.isArray(body.images) ? body.images.slice(0, 4) : [];
  const content = [];
  for (const im of images) {
    const type = ['image/jpeg', 'image/png', 'image/webp'].includes(im.media_type) ? im.media_type : 'image/jpeg';
    if (typeof im.data === 'string' && im.data.length < 7_000_000) {
      content.push({ type: 'image', source: { type: 'base64', media_type: type, data: im.data } });
    }
  }
  content.push({ type: 'text', text: prompt });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      env.ANTHROPIC_WORKSPACE_ID ? { 'anthropic-workspace-id': env.ANTHROPIC_WORKSPACE_ID } : {}),
    body: JSON.stringify({ model: env.MODEL || 'claude-sonnet-5-5', max_tokens: 2000, messages: [{ role: 'user', content }] })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return json({ error: (data.error && data.error.message) || ('Anthropic respondió ' + r.status) }, r.status === 429 ? 429 : 502);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return json({ text });
}

/* ---------- Leonardo: utilidades ---------- */
function leoHeaders(env) {
  return { 'accept': 'application/json', 'content-type': 'application/json', 'authorization': 'Bearer ' + env.LEONARDO_API_KEY };
}
function needLeo(env, json) {
  return env.LEONARDO_API_KEY ? null : json({ error: 'Falta LEONARDO_API_KEY en el servidor' }, 500);
}
function cleanB64(s) { return String(s || '').replace(/^data:[^,]+,/, ''); }
function b64ToBytes(b64) {
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(buf) {
  const bytes = new Uint8Array(buf); let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
async function leoError(r, label) {
  const t = await r.text().catch(() => '');
  let msg = t;
  try { const j = JSON.parse(t); msg = j.error || j.message || (j.errors && JSON.stringify(j.errors)) || t; } catch {}
  return new Error(label + ' (' + r.status + '): ' + String(msg).slice(0, 300));
}

/* ---------- Leonardo: quitar fondo (rápido, sin espera) ---------- */
async function leoNoBg(body, env, json) {
  const miss = needLeo(env, json); if (miss) return miss;
  const data = cleanB64(body.image);
  if (!data) return json({ error: 'Falta la foto' }, 400);
  const bg = body.bg && body.bg !== 'transparent' ? String(body.bg).slice(0, 20) : '';
  const params = {
    format: bg ? 'jpg' : 'png',
    size: 'auto',
    type: 'product',
    shadow_type: body.shadow ? 'drop' : 'none',
    guidances: { image_reference: [{ image: { type: 'BASE64', data } }] }
  };
  if (bg) params.bg_color = bg;
  const r = await fetch(LEO + '/v2/generationssync', {
    method: 'POST', headers: leoHeaders(env),
    body: JSON.stringify({ model: 'remove-bg', ephemeral: true, base64: true, public: false, parameters: params })
  });
  if (!r.ok) throw await leoError(r, 'Leonardo quitar fondo');
  const out = await r.json();
  const res = (out.results || [])[0];
  if (!res) return json({ error: 'Leonardo no devolvió imagen (posible bloqueo de moderación)' }, 502);
  let image = res.dataB64;
  if (!image && res.url) { const im = await fetch(res.url); image = bytesToB64(await im.arrayBuffer()); }
  return json({ image, contentType: res.contentType || (bg ? 'image/jpeg' : 'image/png'), cost: out.cost || null });
}

/* ---------- Leonardo: escena / edición con IA (tarda ~20-60 s) ---------- */
async function leoEdit(body, env, json) {
  const miss = needLeo(env, json); if (miss) return miss;
  const data = cleanB64(body.image);
  const prompt = String(body.prompt || '').slice(0, 1500);
  if (!data || !prompt) return json({ error: 'Faltan la foto o la instrucción' }, 400);

  // 1) Pedir permiso de subida
  const r1 = await fetch(LEO + '/v1/init-image', { method: 'POST', headers: leoHeaders(env), body: JSON.stringify({ extension: 'jpg' }) });
  if (!r1.ok) throw await leoError(r1, 'Leonardo subir foto');
  const up = (await r1.json()).uploadInitImage || {};
  const fields = typeof up.fields === 'string' ? JSON.parse(up.fields) : (up.fields || {});
  if (!up.url || !up.id) throw new Error('Leonardo no dio dirección de subida');

  // 2) Subir la foto (sin encabezado de autorización)
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  form.append('file', new Blob([b64ToBytes(data)], { type: 'image/jpeg' }), 'foto.jpg');
  const r2 = await fetch(up.url, { method: 'POST', body: form });
  if (!r2.ok && r2.status !== 204) throw await leoError(r2, 'Leonardo guardar foto');

  // 3) Crear la imagen nueva con Nano Banana usando la foto como referencia
  const r3 = await fetch(LEO + '/v2/generations', {
    method: 'POST', headers: leoHeaders(env),
    body: JSON.stringify({
      model: 'gemini-2.5-flash-image',
      public: false,
      parameters: {
        prompt,
        width: 0, height: 0,          // 0 = mismo tamaño que la foto original
        quantity: 1,
        prompt_enhance: 'OFF',
        guidances: { image_reference: [{ image: { id: up.id, type: 'UPLOADED' }, strength: 'HIGH' }] }
      }
    })
  });
  if (!r3.ok) throw await leoError(r3, 'Leonardo crear imagen');
  const g = await r3.json();
  const generationId = (g.generate && g.generate.generationId) || g.generationId || (g.sdGenerationJob && g.sdGenerationJob.generationId);
  if (!generationId) throw new Error('Leonardo no devolvió el número de trabajo');
  return json({ generationId });
}

async function leoStatus(body, env, json) {
  const miss = needLeo(env, json); if (miss) return miss;
  const id = String(body.id || '').replace(/[^a-zA-Z0-9-]/g, '');
  if (!id) return json({ error: 'Falta el número de trabajo' }, 400);
  const r = await fetch(LEO + '/v1/generations/' + id, { headers: leoHeaders(env) });
  if (!r.ok) throw await leoError(r, 'Leonardo revisar trabajo');
  const g = (await r.json()).generations_by_pk || {};
  const status = String(g.status || 'PENDING').toUpperCase();
  if (status === 'FAILED') return json({ status: 'FAILED', error: 'Leonardo no pudo crear la imagen. Prueba otra instrucción.' });
  if (status !== 'COMPLETE') return json({ status: 'PENDING' });
  const img = (g.generated_images || [])[0];
  if (!img || !img.url) return json({ status: 'FAILED', error: 'La imagen fue bloqueada o no está disponible.' });
  const im = await fetch(img.url);
  if (!im.ok) throw await leoError(im, 'Leonardo descargar imagen');
  return json({ status: 'COMPLETE', image: bytesToB64(await im.arrayBuffer()), contentType: im.headers.get('content-type') || 'image/jpeg' });
}

/* ---------- Google Gemini Omni (motor de video de Flow): animar foto ---------- */
const GEM = 'https://generativelanguage.googleapis.com/v1beta';
function gemHeaders(env) {
  return { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY, 'Api-Revision': '2026-05-20' };
}
async function gVideoStart(body, env, json) {
  if (!env.GEMINI_API_KEY) return json({ error: 'Falta GEMINI_API_KEY en el servidor' }, 500);
  const data = cleanB64(body.image);
  const prompt = String(body.prompt || '').slice(0, 2000);
  if (!data || !prompt) return json({ error: 'Faltan la foto o la instrucción' }, 400);
  const r = await fetch(GEM + '/interactions', {
    method: 'POST', headers: gemHeaders(env),
    body: JSON.stringify({
      model: env.VIDEO_MODEL || 'gemini-omni-1.1-flash',
      input: [
        { type: 'image', data, mime_type: 'image/jpeg' },
        { type: 'text', text: prompt }
      ],
      response_format: { type: 'video', aspect_ratio: '9:16', resolution: '720p' },
      generation_config: { video_config: { task: 'image_to_video' } },
      background: true,
      store: true
    })
  });
  const t = await r.text();
  let j = {}; try { j = JSON.parse(t); } catch {}
  if (!r.ok) return json({ error: 'Google (' + r.status + '): ' + String((j.error && j.error.message) || t).slice(0, 300) }, r.status === 429 ? 429 : 502);
  if (!j.id) return json({ error: 'Google no devolvió el número de trabajo' }, 502);
  return json({ id: j.id, status: j.status || 'in_progress' });
}
async function gVideoStatus(body, env, json, cors) {
  if (!env.GEMINI_API_KEY) return json({ error: 'Falta GEMINI_API_KEY en el servidor' }, 500);
  const id = String(body.id || '').replace(/[^a-zA-Z0-9_\-\/.]/g, '').replace(/^interactions\//, '');
  if (!id) return json({ error: 'Falta el número de trabajo' }, 400);
  const r = await fetch(GEM + '/interactions/' + id, { headers: gemHeaders(env) });
  if (!r.ok) {
    const t = await r.text();
    let j = {}; try { j = JSON.parse(t); } catch {}
    return json({ error: 'Google (' + r.status + '): ' + String((j.error && j.error.message) || t).slice(0, 300) }, 502);
  }
  // Se pasa la respuesta tal cual (puede traer el video en base64) sin procesarla aquí.
  return new Response(r.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
}
async function gVideoFile(body, env, json, cors) {
  if (!env.GEMINI_API_KEY) return json({ error: 'Falta GEMINI_API_KEY en el servidor' }, 500);
  let u;
  try { u = new URL(String(body.uri || '')); } catch { return json({ error: 'Dirección de video inválida' }, 400); }
  if (u.protocol !== 'https:' || !/(^|\.)googleapis\.com$/.test(u.hostname)) return json({ error: 'Dirección de video no permitida' }, 400);
  const r = await fetch(u.toString(), { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, redirect: 'follow' });
  if (!r.ok) return json({ error: 'Google descargar video (' + r.status + ')' }, 502);
  return new Response(r.body, { status: 200, headers: { ...cors, 'Content-Type': r.headers.get('content-type') || 'video/mp4' } });
}
