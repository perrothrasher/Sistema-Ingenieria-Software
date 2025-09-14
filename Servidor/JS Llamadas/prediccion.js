v// prediccion.js
// Rutas para entrenamiento y proyección de dotación.
// Lee Excels desde MongoDB (GridFS), arma base mensual y pares (mes base -> mes siguiente),
// guarda JSONs en ./modelos y proyecta usando baseline o un microservicio de modelo (opcional).

const express = require('express');
const router = express.Router();

const path = require('path');
const fs = require('fs-extra');
const { MongoClient, GridFSBucket } = require('mongodb');
const XLSX = require('xlsx');
const axios = require('axios');

// ====== CONFIGURA AQUÍ (o por variables de entorno) ==========================
const MONGO_URI    = process.env.MONGO_URI    || 'mongodb://localhost:27017/tuBase';
const MONGO_DB     = process.env.MONGO_DB     || 'tuBase';
const MONGO_BUCKET = process.env.MONGO_BUCKET || 'excels';   // bucket GridFS con .xlsx
// Si levantas microservicio Python (FastAPI) para RandomForest:
const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || ''; // ej: 'http://localhost:8091'
// ============================================================================

// Carpeta de persistencia rápida
const MODELOS_DIR = path.join(__dirname, 'modelos');
fs.ensureDirSync(MODELOS_DIR);

// Utilidades
const MESES_MAP = {
  enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,
  septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12
};

function esInactivo(txt) {
  if (txt == null) return false;
  const s = String(txt).toLowerCase();
  return s.includes('vacacion') || s.includes('licencia');
}
function capacidadOptimaPorMes(porUsuario) {
  const vals = Object.values(porUsuario).filter(v => Number(v) > 0);
  if (vals.length === 0) return 0;
  const minPos = Math.min(...vals);
  const maxVal = Math.max(...vals);
  return (minPos + maxVal) / 2.0;
}
function ceilDiv(a, b) {
  if (!b || b <= 0) return NaN;
  return Math.ceil(a / b);
}
function nombreToMesAnio(nombre) {
  const base = path.parse(nombre).name;
  const m = base.match(/^\s*([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})\b/);
  if (!m) throw new Error(`Nombre no reconocido: ${nombre}`);
  const mesTxt = m[1].toLowerCase();
  const anio = parseInt(m[2], 10);
  const mes = MESES_MAP[mesTxt];
  if (!mes) throw new Error(`Mes no reconocido: ${mesTxt}`);
  return { anio, mes };
}
function detectarCols(cabeceras) {
  const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[^\w]/g,'');
  const pick = (cands) => {
    for (const c of cabeceras) {
      const n = norm(c);
      if (cands.some(x => n === norm(x))) return c;
    }
    for (const c of cabeceras) {
      const n = norm(c);
      if (cands.some(x => n.includes(norm(x)))) return c;
    }
    return null;
  };
  const colUsuario = pick(['usuario','trabajador','id_usuario','rut','id','nombre']);
  const colFolios  = pick(['folios','folio','produccion','producción','total_folios','cantidad']);
  const colEstado  = pick(['estado','situacion','situación','observacion','observación','comentario']);
  return { colUsuario, colFolios, colEstado };
}

async function leerExcelsDesdeMongo() {
  const cli = await MongoClient.connect(MONGO_URI, { useUnifiedTopology: true });
  const db = cli.db(MONGO_DB);
  const bucket = new GridFSBucket(db, { bucketName: MONGO_BUCKET });

  const archivos = await db.collection(`${MONGO_BUCKET}.files`).find({ filename: /\.xlsx$/i }).toArray();
  const res = [];
  for (const f of archivos) {
    const stream = bucket.openDownloadStream(f._id);
    const chunks = [];
    await new Promise((resolve, reject) => {
      stream.on('data', d => chunks.push(d));
      stream.on('error', reject);
      stream.on('end', resolve);
    });
    const buffer = Buffer.concat(chunks);
    const wb = XLSX.read(buffer, { type: 'buffer' });
    res.push({ nombre: f.filename, workbook: wb });
  }
  await cli.close();
  if (res.length === 0) throw new Error('No se encontraron .xlsx en GridFS');
  return res;
}
function hojaToRows(wb) {
  const hoja = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: null });
}
function agregarPorMes(tablas) {
  const base = [];
  for (const t of tablas) {
    const { anio, mes } = nombreToMesAnio(t.nombre);
    if (!t.rows.length) continue;
    const cab = Object.keys(t.rows[0] || {});
    const { colUsuario, colFolios, colEstado } = detectarCols(cab);
    if (!colUsuario || !colFolios) throw new Error(`Faltan columnas en ${t.nombre}`);

    const activos = t.rows.filter(r => !esInactivo(r[colEstado]));
    const sumFolios = (arr) => arr.reduce((acc, r) => acc + (Number(r[colFolios]) || 0), 0);

    const produccion_total = sumFolios(t.rows);
    const usuariosActivos = {};
    for (const r of activos) {
      const u = r[colUsuario] ?? '__NA__';
      usuariosActivos[u] = (usuariosActivos[u] || 0) + (Number(r[colFolios]) || 0);
    }
    const trabajadores_reales = new Set(activos.map(r => r[colUsuario] ?? '__NA__')).size;
    const capacidad_optima = capacidadOptimaPorMes(usuariosActivos);

    base.push({ anio, mes, produccion_total, trabajadores_reales, capacidad_optima });
  }
  base.sort((a,b)=> a.anio!==b.anio ? a.anio-b.anio : a.mes-b.mes);
  return base;
}
function construirPairs(base) {
  const pairs = [];
  for (let i=0;i<base.length-1;i++){
    const b = base[i], s = base[i+1];
    const necesarios = ceilDiv(s.produccion_total, b.capacidad_optima);
    if (!necesarios || Number.isNaN(necesarios)) continue;
    let estado = 'ok';
    if (s.trabajadores_reales > necesarios) estado = 'sobre';
    else if (s.trabajadores_reales < necesarios) estado = 'sub';

    pairs.push({
      anio_base: b.anio,
      mes_base: b.mes,
      capacidad_optima_base: b.capacidad_optima,
      prod_sig: s.produccion_total,
      anio_sig: s.anio,
      mes_sig: s.mes,
      produccion_total_sig: s.produccion_total,
      trabajadores_reales_sig: s.trabajadores_reales,
      trabajadores_necesarios: necesarios,
      estado_regla: estado
    });
  }
  return pairs;
}
async function maybePredictWithModel(features) {
  if (!MODEL_SERVICE_URL) return null;
  try {
    const r = await axios.post(`${MODEL_SERVICE_URL}/predict`, { features });
    return (r.data && r.data.clase) || null; // 'sobre'|'sub'|'ok'
  } catch {
    return null;
  }
}

// ======================= RUTAS ===============================

// POST /prediccion/entrenar
router.post('/entrenar', async (_req, res) => {
  try {
    const archivos = await leerExcelsDesdeMongo();
    const tablas = archivos.map(a => ({ nombre: a.nombre, rows: hojaToRows(a.workbook) }));
    const base = agregarPorMes(tablas);
    const pairs = construirPairs(base);
    if (pairs.length === 0) {
      return res.status(400).json({ ok:false, mensaje:'No hay pares (mes base -> mes siguiente) para entrenar.' });
    }
    await fs.writeJson(path.join(MODELOS_DIR, 'base_mensual.json'), base, { spaces: 2 });
    await fs.writeJson(path.join(MODELOS_DIR, 'dataset_pairs.json'), pairs, { spaces: 2 });

    // Aquí podrías llamar a tu microservicio de entrenamiento si lo deseas.
    res.json({
      ok: true,
      n_meses: base.length,
      n_pairs: pairs.length,
      meses_disponibles: base.map(b => ({ anio:b.anio, mes:b.mes }))
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

// GET /prediccion/proyectar?anio=&mes=
router.get('/proyectar', async (req, res) => {
  try {
    const base = await fs.readJson(path.join(MODELOS_DIR, 'base_mensual.json'));
    const pairs = await fs.readJson(path.join(MODELOS_DIR, 'dataset_pairs.json'));

    let { anio, mes } = req.query;
    if (anio) anio = Number(anio);
    if (mes)  mes  = Number(mes);

    let elegido = null;
    if (anio && mes) {
      elegido = pairs.find(p => p.anio_base===anio && p.mes_base===mes);
      if (!elegido) return res.status(404).json({ ok:false, mensaje:`No existe par para ${anio}-${mes}` });
    } else {
      elegido = pairs[pairs.length-1];
    }

    const features = {
      anio_base: elegido.anio_base,
      mes_base: elegido.mes_base,
      capacidad_optima_base: elegido.capacidad_optima_base,
      prod_sig: elegido.prod_sig
    };
    let estado_modelo = await maybePredictWithModel(features);
    if (!estado_modelo) estado_modelo = elegido.estado_regla;

    res.json({
      ok: true,
      mes_base: {
        anio: elegido.anio_base,
        mes: elegido.mes_base,
        capacidad_optima: elegido.capacidad_optima_base
      },
      mes_siguiente: {
        anio: elegido.anio_sig,
        mes: elegido.mes_sig,
        produccion_total: elegido.produccion_total_sig,
        trabajadores_reales: elegido.trabajadores_reales_sig,
        trabajadores_necesarios: elegido.trabajadores_necesarios,
        estado_regla: elegido.estado_regla,
        estado_modelo
      },
      modelo_entrenado: Boolean(MODEL_SERVICE_URL)
    });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

module.exports = router;
