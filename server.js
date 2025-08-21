// ===== FARO Digital - Pricing API (Node+Express / CommonJS) =====
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---------- Helpers ----------
function asInt(n) {
  const v = parseInt(n, 10);
  return Number.isNaN(v) ? null : v;
}
function pickTierByMax(tiers, minutes) {
  return tiers.find(t => minutes <= t.max) || null;
}
function sendJSON(req, res, obj) {
  if (String(req.query.pretty || '') === '1') {
    res.set('Content-Type', 'application/json; charset=utf-8');
    return res.send(JSON.stringify(obj, null, 2));
  }
  return res.json(obj);
}
function waTextFrom(payload) {
  const lines = [];
  if (payload.servicio) lines.push(`FARO Digital • ${payload.servicio}`);
  if (payload.duracion_min) lines.push(`Duración: ${payload.duracion_min} min`);
  if (payload.rango) lines.push(`Rango: ${payload.rango}`);
  if (payload.tarifa_clp) lines.push(`Tarifa: $${payload.tarifa_clp.toLocaleString('es-CL')}`);
  if (payload.precio_neto_clp) lines.push(`Precio: $${payload.precio_neto_clp.toLocaleString('es-CL')}`);
  if (payload.precio_volumen_clp) lines.push(`Volumen: $${payload.precio_volumen_clp.toLocaleString('es-CL')}`);
  if (payload.jornadas) lines.push(`Jornadas: ${payload.jornadas}`);
  if (payload.total_clp) lines.push(`Total: $${payload.total_clp.toLocaleString('es-CL')}`);
  if (payload.notas) lines.push(`Notas: ${payload.notas}`);
  const msg = lines.join('\n');
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

// ===================================================================
//                        TABLAS DE PRECIOS (CLP)
// ===================================================================

// DCP — desde tu PDF
const DCP_TIERS = [
  { max: 15,  creacion: 145000,  clon: 125000,  label: '0–15 min'  },
  { max: 45,  creacion: 520000,  clon: 15000,   label: '15–45 min' },
  { max: 90,  creacion: 900000,  clon: 48000,   label: '45–90 min' },
  { max: 120, creacion: 1350000, clon: 95000,   label: '90–120 min'}
];

// Copias para TV/Agencias (MOV/MXF/XDCAM) — desde tu tabla de Canal
const CANAL_TIERS = [
  { max: 15,  copia: 45000,  volumen: 65000,  label: '0–15 min'  },
  { max: 45,  copia: 85000,  volumen: 20000,  label: '15–45 min' },
  { max: 90,  copia: 120000, volumen: 30000,  label: '45–90 min' },
  { max: 120, copia: 150000, volumen: 45000,  label: '90–120 min'}
];

// Redes / Identidad (referenciales)
const REDES_PLANS = {
  instagram_mensual: {
    nombre: 'Plan Instagram Mensual (12 publicaciones)',
    incluye: [
      'Diseño / redacción',
      'Programación',
      'Interacción básica',
      'Reporte mensual'
    ],
    tarifa: 460000
  }
};
const IDENTIDAD_MARCA = {
  nombre: 'Identidad de Marca (entrega PDF)',
  incluye: ['Análisis', 'Buyer persona', 'Tono + estilo', 'Ejemplos y plantillas'],
  tarifa: 140000
};

// VFX (referencial por plano)
const VFX_TIERS = [
  { key: 'basico',     por_plano: 60000,   desc: 'Limpieza/retouch simple' },
  { key: 'intermedio', por_plano: 120000,  desc: 'Track/replace pantalla u objetos simples' },
  { key: 'avanzado',   por_plano: 250000,  desc: 'Composición avanzada/roto/tracking complejo' }
];

// **COLOR** — precio fijo por jornada (lo que pediste)
const COLOR_JORNADA_CLP = 650000;

// ===================================================================
//                              RUTAS
// ===================================================================

app.get('/', (_req, res) => {
  res.type('text/plain').send('Servidor FARO Digital activo 🚀  Usa /help para rutas.');
});

app.get('/help', (_req, res) => {
  res.type('text/plain').send(
`Rutas principales:
/cotizar/dcp/:min                            -> Ej: /cotizar/dcp/60
/cotizar/canal/:formato/:min                -> formato: mxf | mov | xdcam (Ej: /cotizar/canal/mxf/30)
Alias:
/cotizacion?tipo=dcp&duracion=60            -> (o tipo=mxf|mov|xdcam)
/cotizacion-dcp?duracion=60
/cotizacion-canal?formato=mxf&minutos=45

Servicios comerciales:
/cotizar/redes/instagram_mensual
/cotizar/identidad-marca
/cotizar/vfx?tipo=intermedio&planos=3
/cotizar/color/:jornadas                    -> Ej: /cotizar/color/2  (2 jornadas x $650.000)

Tip: añade ?pretty=1 para ver JSON legible.`
  );
});

// ----------------- DCP -----------------
app.get('/cotizar/dcp/:min', (req, res) => {
  const min = asInt(req.params.min);
  const tipo = String(req.query.tipo || 'creacion').toLowerCase(); // 'creacion' | 'clon'
  if (!min || min <= 0) return res.status(400).json({ error: 'Duración inválida (>0).' });
  if (min > 120) return res.status(404).json({ error: 'Fuera de rango (1–120 min).' });

  const tier = pickTierByMax(DCP_TIERS, min);
  const isClon = tipo === 'clon';
  const payload = {
    servicio: isClon ? 'Clonación DCP' : 'Creación DCP',
    duracion_min: min,
    rango: tier.label,
    tarifa_clp: isClon ? tier.clon : tier.creacion,
    notas: 'Valores referenciales; pueden variar por specs exactas (resolución, audio, QC, urgencia).'
  };
  payload.wa_text = waTextFrom(payload);
  return sendJSON(req, res, payload);
});

// -------- Copias para Canal (MXF/MOV/XDCAM) --------
app.get('/cotizar/canal/:formato/:min', (req, res) => {
  const formato = String(req.params.formato || '').toLowerCase();
  const min = asInt(req.params.min);
  if (!['mxf','mov','xdcam'].includes(formato)) {
    return res.status(400).json({ error: 'Formato inválido. Usa: mxf | mov | xdcam' });
  }
  if (!min || min <= 0) return res.status(400).json({ error: 'Duración inválida (>0).' });
  if (min > 120) return res.status(404).json({ error: 'Fuera de rango (1–120 min).' });

  const tier = pickTierByMax(CANAL_TIERS, min);
  const payload = {
    servicio: `Archivo ${formato.toUpperCase()} (TV/Agencias)`,
    duracion_min: min,
    rango: tier.label,
    precio_neto_clp: tier.copia,
    precio_volumen_clp: tier.volumen,
    notas: 'Mismo valor para MOV/MXF/XDCAM. Puede variar por specs de canal y QC.'
  };
  payload.wa_text = waTextFrom(payload);
  return sendJSON(req, res, payload);
});

// ----------------- ALIAS (query, sin regex) -----------------
app.get('/cotizacion', (req, res) => {
  const tipo = String(req.query.tipo || '').toLowerCase();
  const min  = asInt(req.query.duracion);
  if (!tipo || !min) {
    return res.status(400).json({ error: 'Faltan parámetros. Usa: /cotizacion?tipo=dcp&duracion=60 ó tipo=mxf|mov|xdcam' });
  }
  if (tipo === 'dcp') return res.redirect(302, `/cotizar/dcp/${min}`);
  if (['mxf','mov','xdcam'].includes(tipo)) return res.redirect(302, `/cotizar/canal/${tipo}/${min}`);
  return res.status(400).json({ error: 'tipo inválido. Usa: dcp | mxf | mov | xdcam' });
});

app.get('/cotizacion-dcp', (req, res) => {
  const min = asInt(req.query.duracion);
  if (!min) return res.status(400).json({ error: 'Falta o inválida la duración. Ej: /cotizacion-dcp?duracion=60' });
  return res.redirect(302, `/cotizar/dcp/${min}`);
});

app.get('/cotizacion-canal', (req, res) => {
  const fmt = String(req.query.formato || '').toLowerCase();
  const min = asInt(req.query.minutos);
  if (!fmt || !min) return res.status(400).json({ error: 'Faltan parámetros. Ej: /cotizacion-canal?formato=mxf&minutos=45' });
  if (!['mxf','mov','xdcam'].includes(fmt)) return res.status(400).json({ error: 'formato inválido. Usa: mxf | mov | xdcam' });
  return res.redirect(302, `/cotizar/canal/${fmt}/${min}`);
});

// ----------------- Redes Sociales -----------------
app.get('/cotizar/redes/instagram_mensual', (req, res) => {
  const plan = REDES_PLANS.instagram_mensual;
  const payload = {
    servicio: plan.nombre,
    incluye: plan.incluye,
    tarifa_clp: plan.tarifa,
    notas: 'Precio neto referencial; se ajusta por alcance, urgencias o extras.'
  };
  return sendJSON(req, res, payload);
});

// ----------------- Identidad de Marca -----------------
app.get('/cotizar/identidad-marca', (req, res) => {
  const payload = {
    servicio: IDENTIDAD_MARCA.nombre,
    incluye: IDENTIDAD_MARCA.incluye,
    tarifa_clp: IDENTIDAD_MARCA.tarifa,
    notas: 'Alcance ajustable según requerimientos. Entrega en PDF.'
  };
  return sendJSON(req, res, payload);
});

// ----------------- VFX -----------------
app.get('/cotizar/vfx', (req, res) => {
  const tipo = String(req.query.tipo || 'basico').toLowerCase(); // basico|intermedio|avanzado
  const planos = asInt(req.query.planos || '1') || 1;
  const tier = VFX_TIERS.find(t => t.key === tipo) || VFX_TIERS[0];
  const total = tier.por_plano * planos;

  const payload = {
    servicio: `VFX ${tier.key}`,
    descripcion: tier.desc,
    planos,
    tarifa_unitaria_clp: tier.por_plano,
    total_clp: total,
    notas: 'Estimación referencial por plano. Requiere revisar material para cotización definitiva.'
  };
  return sendJSON(req, res, payload);
});

// ----------------- COLOR (650.000 por jornada) -----------------
app.get('/cotizar/color/:jornadas', (req, res) => {
  const jornadas = asInt(req.params.jornadas);
  if (!jornadas || jornadas <= 0) {
    return res.status(400).json({ error: 'Número de jornadas inválido (>0). Ej: /cotizar/color/2' });
  }
  const total = COLOR_JORNADA_CLP * jornadas;
  const payload = {
    servicio: 'Color grading',
    jornadas,
    tarifa_por_jornada_clp: COLOR_JORNADA_CLP,
    total_clp: total,
    notas: 'Valor por jornada. Puede variar por complejidad, conformado, entregables y urgencias.'
  };
  payload.wa_text = waTextFrom(payload);
  return sendJSON(req, res, payload);
});

// ----------------- 404 amigable -----------------
app.use((_req, res) => {
  res.status(404).json({
    error: 'Ruta no encontrada. Revisa /help',
    ejemplos: [
      '/cotizar/dcp/60',
      '/cotizar/canal/mxf/30',
      '/cotizacion?tipo=dcp&duracion=45',
      '/cotizacion-canal?formato=mov&minutos=20',
      '/cotizar/redes/instagram_mensual',
      '/cotizar/identidad-marca',
      '/cotizar/vfx?tipo=intermedio&planos=3',
      '/cotizar/color/2'
    ]
  });
});

// ----------------- Start -----------------
app.listen(PORT, () => {
  console.log(`✅ Servidor FARO Digital iniciado en http://localhost:${PORT}`);
});


