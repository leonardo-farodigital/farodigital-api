// server.js — FARO DIGITAL (API + Chat pruebas)
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CHAT_TEST_PASSWORD = process.env.CHAT_TEST_PASSWORD || 'faro-test';

// ===== Middlewares =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// ===== Cargar tarifario =====
const preciosPath = path.join(__dirname, 'data', 'servicios.json');
let KNOW = {};
try {
  KNOW = JSON.parse(fs.readFileSync(preciosPath, 'utf-8'));
  console.log('📦 Tarifario cargado:', preciosPath);
} catch (e) {
  console.warn('⚠️ No pude leer data/servicios.json:', e.message);
  KNOW = {};
}

// Utilidades
const fCLP = (n) =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(n || 0));

const pickRange = (min) => {
  const m = Number(min || 0);
  if (m <= 15) return '0-15';
  if (m <= 45) return '15-45';
  if (m <= 90) return '45-90';
  return '90-120';
};

const withNotes = (texto) => {
  const notas = KNOW?.observaciones_generales || [];
  const pie = notas.length ? `\n\nNotas: ${notas.join(' · ')}` : '';
  return texto + pie;
};

// ===== Rutas básicas =====
app.get('/', (_req, res) => res.send('Servidor FARO Digital activo 🚀 Usa /help para rutas.'));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'farodigital-api' }));
app.get('/help', (_req, res) => {
  res.json({
    routes: {
      '/chat.html': 'Interfaz de pruebas (protegida con clave)',
      'GET /health': 'Estado',
      'GET /cotizacion?tipo=dcp|mxf|mov|xdcam&duracion=MIN': 'Redirige a detalle',
      'GET /cotizar/dcp/:min': 'DCP por minutos',
      'GET /cotizar/:formato/:min': 'Copias mxf/mov/xdcam por minutos',
      'POST /api/chat { message }': 'Chat (requiere header x-chat-pass)'
    }
  });
});

// ===== Guard sencillo (clave de pruebas) =====
function guard(req, res, next) {
  const pass = req.headers['x-chat-pass'];
  if (pass !== CHAT_TEST_PASSWORD) return res.sendStatus(401);
  next();
}
app.get('/api/ping', guard, (_req, res) => res.json({ ok: true }));

// ===== Cotizaciones =====
function quoteDCP(min) {
  const r = pickRange(min);
  const t = KNOW?.dcp?.[r];
  if (!t) return { error: 'Sin datos de DCP para ese rango.' };
  return {
    rango: r,
    creacion: t.creacion,
    clon: t.clon,
    texto: withNotes(`🎬 DCP ${r} min\n- Creación: ${fCLP(t.creacion)}\n- Clon: ${fCLP(t.clon)}`)
  };
}

function quoteCopia(formato = 'mxf', min) {
  const r = pickRange(min);
  const t = KNOW?.copias?.[r];
  if (!t) return { error: 'Sin datos de copias para ese rango.' };
  const fmt = String(formato).toUpperCase();
  return {
    formato: fmt,
    rango: r,
    unitario: t.unitario,
    volumen: t.volumen,
    texto: withNotes(`📀 Copia ${fmt} ${r} min\n- Unitario: ${fCLP(t.unitario)}\n- Volumen: ${fCLP(t.volumen)}`)
  };
}

function quoteColor() {
  const j = KNOW?.color?.jornada;
  if (!j) return { error: 'Sin datos de Corrección de Color.' };
  return { texto: withNotes(`🎨 Corrección de color (jornada): ${fCLP(j)}`) };
}

function quoteRedes() {
  const ig = KNOW?.redes?.instagram || {};
  const an = KNOW?.redes?.anuncios || {};
  const id = KNOW?.redes?.identidad || {};
  const texto = [
    `📱 Instagram:\n- Plan A (8 posts): ${fCLP(ig.planA)}\n- Plan B (12 posts): ${fCLP(ig.planB)}`,
    `📢 Anuncios:\n- Meta Ads: ${fCLP(an.metaAds)}\n- Google Ads: ${fCLP(an.googleAds)}\n- Ambos: ${fCLP(an.ambos)}\n- Inversión sugerida aparte: ${fCLP(an.inversion_sugerida)}`,
    `🎯 Identidad de marca: ${fCLP(id.paquete)}`
  ].join('\n\n');
  return { texto: withNotes(texto) };
}

function quoteVFX() {
  const nota = KNOW?.vfx?.nota || 'VFX/Post a cotizar por shot o paquete.';
  return { texto: withNotes(`✨ ${nota}`) };
}

// Redirecciones rápidas
app.get('/cotizacion', (req, res) => {
  const { tipo, duracion } = req.query;
  const min = parseInt(duracion, 10);
  if (!tipo || Number.isNaN(min)) return res.status(400).json({ error: 'Usa: /cotizacion?tipo=dcp|mxf|mov|xdcam&duracion=MIN' });
  const t = String(tipo).toLowerCase();
  if (t === 'dcp') return res.redirect(302, `/cotizar/dcp/${min}`);
  if (['mxf', 'mov', 'xdcam'].includes(t)) return res.redirect(302, `/cotizar/${t}/${min}`);
  return res.status(400).json({ error: 'Tipo no soportado. Usa dcp, mxf, mov o xdcam.' });
});

app.get('/cotizar/dcp/:min', (req, res) => {
  const q = quoteDCP(Number(req.params.min));
  if (q.error) return res.status(400).json(q);
  res.json(q);
});

app.get('/cotizar/:formato/:min', (req, res) => {
  const q = quoteCopia(req.params.formato, Number(req.params.min));
  if (q.error) return res.status(400).json(q);
  res.json(q);
});

// ===== Chat con reglas + fallback a OpenAI =====
app.post('/api/chat', guard, async (req, res) => {
  try {
    const text = String(req.body?.message || '').trim().toLowerCase();

    // DCP con minutos
    let m = text.match(/dcp.*?(\d{1,3})\s*(min|mins|minutos)?/);
    if (m) return res.json({ reply: quoteDCP(Number(m[1])).texto });

    // Copias formato + minutos
    m = text.match(/\b(mxf|mov|xdcam)\b.*?(\d{1,3})\s*(min|mins|minutos)?/);
    if (m) return res.json({ reply: quoteCopia(m[1], Number(m[2])).texto });

    // Color
    if (/\bcorrecci[oó]n de color\b|\bcolor(ist[ao])?\b/.test(text))
      return res.json({ reply: quoteColor().texto });

    // Redes / Anuncios / Identidad
    if (/instagram|redes|anuncio|ads|google|meta|identidad/.test(text))
      return res.json({ reply: quoteRedes().texto });

    // VFX/Post
    if (/vfx|postproducci[oó]n|composici[oó]n|rotoscop|animaci[oó]n|sonido|m[uú]sica/.test(text))
      return res.json({ reply: quoteVFX().texto });

    // Fallback OpenAI (con tarifario como contexto)
    if (!OPENAI_API_KEY) {
      return res.json({ reply: 'Falta OPENAI_API_KEY para respuestas conversacionales. Puedo dar precios si me das formato/duración.' });
    }
    const sys = [
      'Eres el agente de Faro Digital. Responde breve, claro y comercial.',
      'Siempre en CLP y + IVA salvo indicación contraria.',
      `TARIFARIO JSON:\n${JSON.stringify(KNOW)}`
    ].join('\n');

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [{ role: 'system', content: sys }, { role: 'user', content: req.body?.message || '' }]
      })
    });
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content?.trim() || 'Sin respuesta por ahora.';
    res.json({ reply });
  } catch (err) {
    console.error('AI/chat error', err);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

/* ===== Compatibilidad de rutas para el frontend =====
   Evita 404 cuando el HTML llama endpoints antiguos
*/

// DCP por query: /api/precios/dcp?min=90  (o ?duracion=90)
app.get('/api/precios/dcp', (req, res) => {
  const min = Number(req.query.min || req.query.duracion || req.query.minutes);
  if (Number.isNaN(min)) return res.status(400).json({ error: 'Falta min.' });
  const q = quoteDCP(min);
  if (q.error) return res.status(400).json(q);
  res.json(q);
});

// Copias por query: /api/precios/copias?formato=mxf&min=45
app.get('/api/precios/copias', (req, res) => {
  const formato = String(req.query.formato || req.query.tipo || 'mxf');
  const min = Number(req.query.min || req.query.duracion || req.query.minutes);
  if (Number.isNaN(min)) return res.status(400).json({ error: 'Falta min.' });
  const q = quoteCopia(formato, min);
  if (q.error) return res.status(400).json(q);
  res.json(q);
});

// Tablas informativas rápidas
app.get('/api/precios/redes', (_req, res) => res.json(quoteRedes()));
app.get('/api/precios/color', (_req, res) => res.json(quoteColor()));
app.get('/api/precios/vfx',   (_req, res) => res.json(quoteVFX()));

// Compatibilidad chat si el HTML usa /chat (en vez de /api/chat)
app.post('/chat', (req, res, next) => {
  // Si tu HTML NO envía x-chat-pass, no bloqueamos; reusamos handler de /api/chat
  req.headers['x-chat-pass'] = req.headers['x-chat-pass'] || process.env.CHAT_TEST_PASSWORD || 'faro-test';
  next();
}, (req, res) => {
  // Reutilizamos la lógica de /api/chat sin duplicarla:
  // Llamamos directamente a la función del manejador si la tienes separada; si no,
  // podemos reenviar la request con fetch interno (simple duplicado de lógica).
  // Para simplificar, respondemos redirigiendo a la misma lógica:
  // Copia la lógica de tu /api/chat aquí si no la tienes modular.
  // ---- Inicio copia simple de /api/chat ----
  const text = String(req.body?.message || '').trim().toLowerCase();
  let m = text.match(/dcp.*?(\d{1,3})\s*(min|mins|minutos)?/);
  if (m) return res.json({ reply: quoteDCP(Number(m[1])).texto });
  m = text.match(/\b(mxf|mov|xdcam)\b.*?(\d{1,3})\s*(min|mins|minutos)?/);
  if (m) return res.json({ reply: quoteCopia(m[1], Number(m[2])).texto });
  if (/\bcorrecci[oó]n de color\b|\bcolor(ist[ao])?\b/.test(text)) return res.json({ reply: quoteColor().texto });
  if (/instagram|redes|anuncio|ads|google|meta|identidad/.test(text)) return res.json({ reply: quoteRedes().texto });
  if (/vfx|postproducci[oó]n|composici[oó]n|rotoscop|animaci[oó]n|sonido|m[uú]sica/.test(text)) return res.json({ reply: quoteVFX().texto });
  return res.json({ reply: 'Dime el formato y duración: por ej. “DCP 90 minutos” o “MXF 45 min”.' });
  // ---- Fin copia simple de /api/chat ----
});

// ===== Arranque =====
app.listen(PORT, () => console.log(`✅ FARO Digital API escuchando en :${PORT}`));
