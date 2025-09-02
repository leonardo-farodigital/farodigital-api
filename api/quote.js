// api/quote.js
// Router de cotizaciones para FARO Digital — respeta los tramos de los PDFs

const express = require('express');
const router = express.Router();

// Utilidad CLP
const CLP = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const clp = (n) => CLP.format(Number(n || 0));

// ===== Tablas de precios (según tus PDFs) =====
// DCP (PRECIOS_DCP_2022.pdf)
const DCP = [
  { max: 15,  creacion: 145000, clon: 125000, label: '0–15 min'   },
  { max: 45,  creacion: 520000, clon: 15000,  label: '15–45 min'  },
  { max: 90,  creacion: 900000, clon: 48000,  label: '45–90 min'  },
  { max: 120, creacion: 1350000,clon: 95000,  label: '90–120 min' }
];

// Copias Canal (MOV/MXF/XDCAM) — PRECIOS_Copias_Agencias_Copias_Canal.pdf
const CANAL = [
  { max: 15,  unitario: 45000,  volumen: 65000,  label: '0–15 min'   },
  { max: 45,  unitario: 85000,  volumen: 20000,  label: '15–45 min'  },
  { max: 90,  unitario: 120000, volumen: 30000,  label: '45–90 min'  },
  { max: 120, unitario: 150000, volumen: 45000,  label: '90–120 min' }
];

// Color — definido por ti
const COLOR_JORNADA = 650000;

// ===== Helpers =====
function tramoPorMin(tabla, minutos) {
  const m = Number(minutos || 0);
  return tabla.find(t => m <= t.max) || null;
}

// ===== Rutas =====

// DCP por minutos
// GET /cotizar/dcp/:min
router.get('/dcp/:min', (req, res) => {
  const min = parseInt(req.params.min, 10);
  if (Number.isNaN(min) || min <= 0) {
    return res.status(400).json({ ok: false, error: 'Duración inválida' });
  }

  const tramo = tramoPorMin(DCP, min);
  if (!tramo) {
    return res.json({ ok: true, texto: 'DCP: duración > 120 min — consultar comercial.' });
  }

  const texto = [
    `🎬 DCP ${tramo.label} (consulta: ${min} min)`,
    `– Creación: ${clp(tramo.creacion)}`,
    `– Clon: ${clp(tramo.clon)}`,
    '',
    'Notas: Valores NETOS (+ IVA). Plazos y entregables sujetos a revisión técnica del material.'
  ].join('\n');

  return res.json({
    ok: true,
    rango: tramo.label,
    creacion: tramo.creacion,
    clon: tramo.clon,
    minutos: min,
    texto
  });
});

// Copia Canal por minutos (MXF/XDCAM/MOV)
/// GET /cotizar/canal/:min
router.get('/canal/:min', (req, res) => {
  const min = parseInt(req.params.min, 10);
  if (Number.isNaN(min) || min <= 0) {
    return res.status(400).json({ ok: false, error: 'Duración inválida' });
  }

  const tramo = tramoPorMin(CANAL, min);
  if (!tramo) {
    return res.json({ ok: true, texto: 'Copia Canal: duración > 120 min — consultar comercial.' });
  }

  const texto = [
    `📺 Copia Canal ${tramo.label} (consulta: ${min} min)`,
    `– Unitario: ${clp(tramo.unitario)}`,
    `– Volumen: ${clp(tramo.volumen)}`,
    '',
    'Notas: Valores NETOS (+ IVA). Plazos y entregables sujetos a revisión técnica del material.'
  ].join('\n');

  return res.json({
    ok: true,
    rango: tramo.label,
    unitario: tramo.unitario,
    volumen: tramo.volumen,
    minutos: min,
    texto
  });
});

// Color (jornada)
/// GET /cotizar/color
router.get('/color', (_req, res) => {
  const texto = [
    '🎨 Corrección de Color — 1 jornada',
    `– Precio: ${clp(COLOR_JORNADA)}`,
    '',
    'Notas: Valores NETOS (+ IVA). Plazos y entregables sujetos a revisión técnica del material.'
  ].join('\n');

  res.json({ ok: true, jornada: COLOR_JORNADA, texto });
});

// (Opcionales) Rutas informativas extra para tu menú
router.get('/redes', (_req, res) => {
  // Puedes ajustar según tus planes exactos
  const texto = [
    '📱 Redes Sociales (Instagram)',
    `– Plan A (8 posts): ${clp(400000)}`,
    `– Plan B (12 posts): ${clp(460000)}`,
    '',
    'Notas: Valores NETOS (+ IVA).'
  ].join('\n');
  res.json({ ok: true, texto });
});

router.get('/anuncios', (_req, res) => {
  const texto = [
    '📣 Anuncios',
    `– Meta Ads: ${clp(170000)}`,
    `– Google Ads: ${clp(150000)}`,
    `– Ambos: ${clp(250000)}`,
    `– Inversión sugerida (medios) aparte: ${clp(300000)}`
  ].join('\n');
  res.json({ ok: true, texto });
});

router.get('/identidad', (_req, res) => {
  const texto = [
    '🎯 Identidad de marca:',
    `– Paquete: ${clp(140000)}`
  ].join('\n');
  res.json({ ok: true, texto });
});

module.exports = router;

