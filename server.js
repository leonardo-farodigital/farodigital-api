git// FARO Digital — API estable con precios de PDF
// Ejecuta: node server.js

const express = require('express');
const path = require('path');
const app = express();

// ===============================
// PRECIOS OFICIALES (PDF)
// ===============================
// DCP: Creación + Clon por rango
const DCP = {
  '0-15':   { creacion: 145000,  clon: 15000  },
  '15-45':  { creacion: 520000,  clon: 48000  },
  '45-90':  { creacion: 900000,  clon: 95000  },
  '90-120': { creacion: 1350000, clon: 125000 }
};
const RANGOS_DCP = Object.keys(DCP);

// Copias Canal: precio por rango (SIN volumen en UI)
const COPIA_CANAL = {
  '0-15':   45000,
  '15-45':  85000,
  '45-90': 120000,
  '90-120':150000
};
const RANGOS_CANAL = Object.keys(COPIA_CANAL);

// Color fijo
const COLOR_POR_JORNADA = 650000;

// ===============================
// Helpers
// ===============================
const CLP = (n) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency', currency: 'CLP', maximumFractionDigits: 0
  }).format(n);

// ===============================
// API — COTIZADORES
// ===============================
app.get('/api/dcp', (req, res) => {
  const range = String(req.query.range || '').trim();
  if (!RANGOS_DCP.includes(range)) {
    return res.status(400).json({ ok:false, error:'Rango DCP inválido' });
  }
  const { creacion, clon } = DCP[range];
  res.json({
    ok: true,
    range,
    creacion,
    clon,
    creacion_fmt: CLP(creacion),
    clon_fmt: CLP(clon),
  });
});

app.get('/api/copia-canal', (req, res) => {
  const range = String(req.query.range || '').trim();
  if (!RANGOS_CANAL.includes(range)) {
    return res.status(400).json({ ok:false, error:'Rango Copia Canal inválido' });
  }
  const precio = COPIA_CANAL[range];
  res.json({
    ok: true,
    range,
    precio,
    precio_fmt: CLP(precio),
  });
});

app.get('/api/color', (_req, res) => {
  res.json({ ok:true, precio: COLOR_POR_JORNADA, precio_fmt: CLP(COLOR_POR_JORNADA) });
});

// Referenciales
const REFERENCIAS = {
  redes: `📱 Redes Sociales (referencial)
– Paquetes según plataforma, piezas y alcance.
– Cuéntanos tu objetivo (orgánico / pauta) y te proponemos plan + precio.`,
  anuncios: `📢 Anuncios (referencial)
– Spots / Piezas performance.
– Depende de guion, equipo y días de rodaje/post.`,
  identidad: `✨ Identidad de marca (referencial)
– Naming, logo, manual básico y aplicaciones.
– Entregables y plazos dependen del requerimiento.`,
  vfx: `🪄 VFX / Post (referencial por plano)
– Simple / Medio / Complejo.
– Depende de complejidad y duración del plano / pieza.`
};
app.get('/api/ref', (req, res) => {
  const sec = String(req.query.sec || '').toLowerCase();
  if (!REFERENCIAS[sec]) return res.status(404).json({ ok:false, error:'Sección no encontrada' });
  res.json({ ok:true, sec, texto:REFERENCIAS[sec] });
});

// Estáticos
app.use(express.static(path.join(__dirname, 'public')));

// (Opcional) Ruta cómoda por si algún botón apunta a /feedback
app.get('/feedback', (_req, res) => {
  res.redirect('https://docs.google.com/forms/d/e/1FAIpQLSeM5cnP6LEcsh8xQNRyNX_hFIBsaESfXBQJu67_YE7DkGIqYg/viewform?usp=dialog');
});

// START
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FARO Digital API corriendo en http://localhost:${PORT}`));

