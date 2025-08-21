// server.js — FARO Digital (CommonJS)
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// (opcional) servir UI mínima si ya creaste /public/index.html
app.use(express.static(path.join(__dirname, "public")));

// ============ TABLAS DE PRECIOS (editar aquí) ============
// DCP (creación vs clon) — tramos 0–120 min
const DCP_TIERS = [
  { max: 15,  creacion: 145000,  clon: 125000,  label: "0–15 min"  },
  { max: 45,  creacion: 520000,  clon: 15000,   label: "15–45 min" },
  { max: 90,  creacion: 900000,  clon: 48000,   label: "45–90 min" },
  { max: 120, creacion: 1350000, clon: 95000,   label: "90–120 min"}
];

// Copias Canal (MOV, MXF, XDCAM) — precio por copia y precio volumen
const CANAL_TIERS = [
  { max: 15,  copia: 45000,  volumen: 65000,  label: "0–15 min"  },
  { max: 45,  copia: 85000,  volumen: 20000,  label: "15–45 min" },
  { max: 90,  copia: 120000, volumen: 30000,  label: "45–90 min" },
  { max: 120, copia: 150000, volumen: 45000,  label: "90–120 min"}
];

// ============ HELPERS ============
const FORMATO_ALIAS = { mov: "MOV", mxf: "MXF", xdcam: "XDCAM", xdcamhd: "XDCAM" };

function pickTier(tiers, minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m <= 0) return null;
  return tiers.find(t => m <= t.max) || null;
}
function prettyIfRequested(obj, req, res) {
  if (req.query.pretty) return res.type("application/json").send(JSON.stringify(obj, null, 2));
  return res.json(obj);
}

// ============ RUTAS ============
app.get("/", (_req, res) => {
  res.type("text/plain").send("Servidor FARO Digital activo. Prueba /cotizar?tipo=dcp&duracion=60");
});

// Catálogos (para sanity check)
app.get("/catalogo/dcp", (_req, res) => {
  prettyIfRequested({
    tipo: "DCP",
    items: DCP_TIERS.map(t => ({ rango: t.label, creacion_clp: t.creacion, clon_clp: t.clon }))
  }, _req, res);
});
app.get("/catalogo/canal", (_req, res) => {
  prettyIfRequested({
    tipo: "Copias Canal (MOV/MXF/XDCAM)",
    items: CANAL_TIERS.map(t => ({ rango: t.label, copia_clp: t.copia, volumen_clp: t.volumen }))
  }, _req, res);
});

// --- DCP: /cotizar/dcp/:min  (+ ?tipo=clon opcional)
app.get("/cotizar/dcp/:min", (req, res) => {
  const min = Number(req.params.min);
  const esClon = String(req.query.tipo || "").toLowerCase() === "clon";
  if (!Number.isFinite(min) || min <= 0) return res.status(400).json({ error: "Minutos inválidos (>0)." });
  const tier = pickTier(DCP_TIERS, min);
  if (!tier) return res.status(404).json({ error: "Fuera de rango (1–120 min)." });

  const tarifa = esClon ? tier.clon : tier.creacion;
  return prettyIfRequested({
    servicio: esClon ? "Clonación DCP" : "Creación DCP",
    duracion_min: min,
    rango: tier.label,
    tarifa_clp: tarifa,
    notas: "Valores referenciales; pueden variar por specs exactas y QC."
  }, req, res);
});

// --- CANAL por formato explícito: /cotizar/canal/:formato/:min
app.get("/cotizar/canal/:formato/:min", (req, res) => {
  const formato = String(req.params.formato || "").toLowerCase();
  const norm = FORMATO_ALIAS[formato];
  const min = Number(req.params.min);
  if (!norm) return res.status(400).json({ error: "Formato inválido. Usa mov | mxf | xdcam." });
  if (!Number.isFinite(min) || min <= 0) return res.status(400).json({ error: "Minutos inválidos (>0)." });
  const tier = pickTier(CANAL_TIERS, min);
  if (!tier) return res.status(404).json({ error: "Fuera de rango (1–120 min)." });

  return prettyIfRequested({
    servicio: `Copia ${norm} (TV/Agencia)`,
    duracion_min: min,
    rango: tier.label,
    precio_neto_clp: tier.copia,
    precio_volumen_clp: tier.volumen,
    notas: "Mismo valor para MOV/MXF/XDCAM. Puede variar por specs de canal y QC."
  }, req, res);
});

// --- CANAL genérico: /cotizar/canal/:min  (sin especificar formato)
app.get("/cotizar/canal/:min", (req, res) => {
  const min = Number(req.params.min);
  if (!Number.isFinite(min) || min <= 0) return res.status(400).json({ error: "Minutos inválidos (>0)." });
  const tier = pickTier(CANAL_TIERS, min);
  if (!tier) return res.status(404).json({ error: "Fuera de rango (1–120 min)." });

  return prettyIfRequested({
    servicio: "Copia para Canal (MOV/MXF/XDCAM)",
    duracion_min: min,
    rango: tier.label,
    precio_neto_clp: tier.copia,
    precio_volumen_clp: tier.volumen,
    notas: "Especifica formato si lo necesitas: /cotizar/canal/mxf/:min"
  }, req, res);
});
// Alias: /cotizacion-canal?formato=mxf&minutos=45  ->  /cotizar/canal/mxf/45
app.get('/cotizacion-canal', (req, res) => {
  const formato = String(req.query.formato || 'mxf').toLowerCase();
  const minutos = Number(req.query.minutos);
  const permitidos = ['mxf', 'mov', 'xdcam'];

  if (!minutos || Number.isNaN(minutos)) {
    return res.status(400).json({ error: 'Falta ?minutos (número en minutos)' });
  }
  if (!permitidos.includes(formato)) {
    return res.status(400).json({ error: `formato inválido. Usa: ${permitidos.join(', ')}` });
  }
  return res.redirect(`/cotizar/canal/${formato}/${minutos}`);
});

// ===== Alias con query params (sin regex) =====

// /cotizacion?tipo=dcp&duracion=60   ó  /cotizacion?tipo=mxf&duracion=30
app.get('/cotizacion', (req, res) => {
  const { tipo, duracion } = req.query;
  const min = parseInt(duracion, 10);

  if (!tipo || !duracion || Number.isNaN(min)) {
    return res.status(400).json({
      error: 'Faltan parámetros. Usa: /cotizacion?tipo=dcp&duracion=60 ó /cotizacion?tipo=mxf&duracion=30',
    });
  }

  const t = String(tipo).toLowerCase();
  if (t === 'dcp') return res.redirect(302, `/cotizar/dcp/${min}`);
  if (['mxf', 'mov', 'xdcam'].includes(t)) return res.redirect(302, `/cotizar/canal/${t}/${min}`);

  return res.status(400).json({ error: 'tipo inválido. Usa: dcp | mxf | mov | xdcam' });
});

// /cotizacion-dcp?duracion=60
app.get('/cotizacion-dcp', (req, res) => {
  const { duracion } = req.query;
  const min = parseInt(duracion, 10);
  if (Number.isNaN(min)) {
    return res.status(400).json({ error: 'Falta o es inválida la duración. Ej: /cotizacion-dcp?duracion=60' });
  }
  return res.redirect(302, `/cotizar/dcp/${min}`);
});

// /cotizacion-canal?formato=mxf&minutos=45
app.get('/cotizacion-canal', (req, res) => {
  const { formato, minutos } = req.query;
  const fmt = String(formato || '').toLowerCase();
  const min = parseInt(minutos, 10);

  if (!fmt || Number.isNaN(min)) {
    return res.status(400).json({
      error: 'Faltan parámetros. Usa: /cotizacion-canal?formato=mxf&minutos=45',
    });
  }
  if (!['mxf', 'mov', 'xdcam'].includes(fmt)) {
    return res.status(400).json({ error: 'formato inválido. Usa: mxf | mov | xdcam' });
  }
  return res.redirect(302, `/cotizar/canal/${fmt}/${min}`);
});

// --- Router de query params: /cotizar?tipo=...&duracion=...
app.get("/cotizar", (req, res) => {
  const tipo = String(req.query.tipo || "").toLowerCase();
  const min  = Number(req.query.duracion);
  if (!Number.isFinite(min) || min <= 0) return res.status(400).json({ error: "Parámetro 'duracion' inválido." });

  if (tipo === "dcp") return res.redirect(`/cotizar/dcp/${min}${req.query.tipo_copia === "clon" ? "?tipo=clon" : ""}`);
  if (tipo === "mxf" || tipo === "mov" || tipo === "xdcam") return res.redirect(`/cotizar/canal/${tipo}/${min}`);
  if (tipo === "canal") return res.redirect(`/cotizar/canal/${min}`);

  return res.status(400).json({ error: "Parámetro 'tipo' inválido. Usa: dcp | mxf | mov | xdcam | canal" });
});

// 404
app.use((_req, res) => {
  res.status(404).json({ error: "Ruta no encontrada. Ejemplos: /cotizar/dcp/60, /cotizar/canal/mxf/30" });
});

app.listen(PORT, () => {
  console.log(`✅ Servidor FARO Digital iniciado en http://localhost:${PORT}`);
});

// === Alias en español: /cotizacion-canal (usa la tabla de CANAL) ===
// Ejemplos:
//   /cotizacion-canal?minutos=45
//   /cotizacion-canal?formato=mxf&minutos=30
app.get("/cotizacion-canal", (req, res) => {
  const formato = String(req.query.formato || "").toLowerCase(); // opcional: mxf|mov|xdcam
  const min = Number(req.query.minutos);

  if (!Number.isFinite(min) || min <= 0) {
    return res.status(400).json({ error: "Parámetro 'minutos' inválido. Usa un entero > 0." });
  }

  const tier = pickTier(CANAL_TIERS, min);
  if (!tier) {
    return res.status(404).json({ error: "Duración fuera de rango (1–120 min)." });
  }

  // Formato opcional
  let nombreFormato = null;
  if (formato) {
    const norm = FORMATO_ALIAS[formato];
    if (!norm) {
      return res.status(400).json({ error: "Formato inválido. Usa: mov | mxf | xdcam (o deja vacío)." });
    }
    nombreFormato = norm;
  }

  const servicio = nombreFormato
    ? `Copia ${nombreFormato} (TV/Agencia)`
    : "Copia para Canal (MOV/MXF/XDCAM)";

  return prettyIfRequested({
    servicio,
    duracion_min: min,
    rango: tier.label,
    precio_neto_clp: tier.copia,
    precio_volumen_clp: tier.volumen,
    notas: "Mismo valor para MOV, MXF o XDCAM. Puede variar por specs del canal y QC."
  }, req, res);
});





