// JS Llamadas/prediccion.js
// Lee Excels desde MongoDB (GridFS) y proyecta el mes siguiente

const { Router } = require('express');
const ExcelJS = require('exceljs');
const { GridFSBucket } = require('mongodb');

const router = Router();

// === Colección donde se guarda el RESUMEN mensual ===
// (ajústala si prefieres otro nombre)
const COLECCION_MESES = 'venta_e_ingreso_por_usuario';

// === Meses en español -> número ===
const mapaMes = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12
};

// === Bucket de GridFS (puede tener espacios) ===
// .env: GFS_BUCKET=venta e ingreso por usuario
const BUCKET = (process.env.GFS_BUCKET && String(process.env.GFS_BUCKET).trim()) || 'archivos';

/* =========================================================================
   Parser del nombre: 1er token = mes, 2do token = año
   Tolerante a tildes, comillas, guiones/underscores y espacios extra
   ========================================================================= */
function extraerMesAnioDesdeNombre(nombre) {
  if (!nombre) return null;

  let s = String(nombre)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita tildes
    .toLowerCase()
    .replace(/[“”"']/g, '')     // quita comillas
    .replace(/[_-]+/g, ' ')     // _ y - -> espacio
    .replace(/\s+/g, ' ')       // colapsa espacios
    .trim();

  // quita extensión (maneja espacios antes del punto)
  s = s.replace(/\s*\.(xlsx|xls|xlsm)\s*$/i, '');

  const tokens = s.split(' ').filter(Boolean);
  if (tokens.length < 2) return null;

  const mesTxt = tokens[0];
  const mes = mapaMes[mesTxt];
  if (!mes) return null;

  const anioStr = tokens[1];
  if (!/^(19|20)\d{2}$/.test(anioStr)) return null;

  return { mes, anio: parseInt(anioStr, 10) };
}

/* =========================================================================
   Lectura del Excel desde Buffer (descargado de GridFS)
   Resumen robusto: suma todos los números que aparezcan
   ========================================================================= */
async function resumirExcelDesdeBuffer(buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hoja = libro.worksheets[0];
  if (!hoja) return { filas_utiles: 0, suma_numeros: 0 };

  let filas_utiles = 0, suma_numeros = 0;

  hoja.eachRow((fila, n) => {
    if (n === 1) return; // cabecera
    const hayDato = fila.values?.some(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hayDato) return;

    filas_utiles++;
    fila.eachCell((celda) => {
      const val = celda.value;
      if (typeof val === 'number') { suma_numeros += val; return; }
      if (val && typeof val === 'object') {
        if (typeof val.result === 'number') suma_numeros += val.result;
        else if (typeof val.value === 'number') suma_numeros += val.value;
        else if (typeof val.text === 'string') {
          const n = Number(val.text.replace(/[^\d.\-]/g, ''));
          if (!Number.isNaN(n)) suma_numeros += n;
        }
        return;
      }
      if (typeof val === 'string') {
        const n = Number(val.replace(/[^\d.\-]/g, ''));
        if (!Number.isNaN(n)) suma_numeros += n;
      }
    });
  });

  return { filas_utiles, suma_numeros };
}

/* =========================================================================
   Proyección: promedio móvil (3) + tendencia
   ========================================================================= */
function proyectarSiguienteMes(ordenAsc) {
  if (!ordenAsc.length) return { ok: false, error: 'Sin datos entrenados' };

  const ultimo = ordenAsc[ordenAsc.length - 1];
  let anioSig = ultimo.anio, mesSig = ultimo.mes + 1;
  if (mesSig > 12) { mesSig = 1; anioSig++; }

  const ult3 = ordenAsc.slice(-3);
  const prom3 = ult3.length
    ? (ult3.reduce((a, m) => a + (m.produccion_total || 0), 0) / ult3.length)
    : (ultimo.produccion_total || 0);

  const capacidad_optima = prom3 * 0.85;

  let delta = 0;
  for (let i = 1; i < ult3.length; i++) {
    delta += (ult3[i].produccion_total - ult3[i - 1].produccion_total);
  }
  const deltaProm = ult3.length > 1 ? delta / (ult3.length - 1) : 0;

  const produccion_siguiente = Math.max(0, Math.round((ultimo.produccion_total || 0) + deltaProm));

  const productividad_promedio = 100; // AJUSTA si tienes métrica real
  const trabajadores_necesarios = Math.max(1, Math.ceil(produccion_siguiente / productividad_promedio));
  const trabajadores_reales = ultimo.trabajadores_reales
    || Math.max(1, Math.round((ultimo.produccion_total || 0) / productividad_promedio));

  let estado_regla = 'ok';
  if (trabajadores_reales > trabajadores_necesarios * 1.1) estado_regla = 'sobre';
  else if (trabajadores_reales < trabajadores_necesarios * 0.9) estado_regla = 'sub';

  return {
    ok: true,
    mes_base: { anio: ultimo.anio, mes: ultimo.mes, capacidad_optima },
    mes_siguiente: {
      anio: anioSig,
      mes: mesSig,
      produccion_total: produccion_siguiente,
      trabajadores_reales,
      trabajadores_necesarios,
      estado_regla
    }
  };
}

/* =========================================================================
   Helpers: detección de colecciones GridFS (casos no estándar) y descarga
   ========================================================================= */
async function detectarColeccionesGridFS(db) {
  const names = await db.listCollections().toArray();
  const colNames = names.map(n => n.name);

  // Estándar
  const filesStd  = `${BUCKET}.files`;
  const chunksStd = `${BUCKET}.chunks`;

  let filesCollName  = colNames.includes(filesStd)  ? filesStd  : null;
  let chunksCollName = colNames.includes(chunksStd) ? chunksStd : null;

  // Caso "plano": metadatos sin .files
  if (!filesCollName && colNames.includes(BUCKET)) {
    filesCollName = BUCKET; // p.ej. "venta e ingreso por usuario"
  }

  // Si no hay chunks estándar, busca cualquiera que termine en .chunks
  if (!chunksCollName) {
    const candidatas = colNames.filter(n => /\.chunks$/i.test(n));
    if (candidatas.includes(chunksStd)) chunksCollName = chunksStd;
    else if (candidatas.length) chunksCollName = candidatas[0];
  }

  return { filesCollName, chunksCollName };
}

async function listarArchivosExcel(db) {
  const { filesCollName } = await detectarColeccionesGridFS(db);
  if (!filesCollName) return [];
  const colFiles = db.collection(filesCollName);
  return await colFiles.find({ filename: { $regex: /\.xlsx$/i } }).toArray();
}

async function descargarArchivoGridFS(db, fileId) {
  const { filesCollName, chunksCollName } = await detectarColeccionesGridFS(db);

  // Si es bucket estándar, usa GridFSBucket directo
  if (filesCollName === `${BUCKET}.files` && chunksCollName === `${BUCKET}.chunks`) {
    const bucket = new GridFSBucket(db, { bucketName: BUCKET });
    const chunks = [];
    return await new Promise((resolve, reject) => {
      bucket.openDownloadStream(fileId)
        .on('data', d => chunks.push(d))
        .on('error', reject)
        .on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  // Fallback: concatenar manualmente los chunks de la colección detectada
  if (!chunksCollName) {
    throw new Error('No se encontró colección .chunks para reconstruir el archivo.');
  }

  const colChunks = db.collection(chunksCollName);
  const cursor = colChunks.find({ files_id: fileId }).sort({ n: 1 });

  const parts = [];
  for await (const ch of cursor) {
    const buf = Buffer.isBuffer(ch.data) ? ch.data : Buffer.from(ch.data.buffer);
    parts.push(buf);
  }

  if (!parts.length) {
    throw new Error(`No hay chunks para fileId=${fileId} en ${chunksCollName}`);
  }

  return Buffer.concat(parts);
}

/* =========================================================================
   ENDPOINTS
   ========================================================================= */

// POST /prediccion/entrenar  -> lee Excels desde GridFS y guarda resumen mensual
router.post('/entrenar', async (req, res) => {
  try {
    await req.app.locals.mongoReady;
    const db = req.app.locals.getDB();
    const colResumen = db.collection(COLECCION_MESES);

    const { filesCollName, chunksCollName } = await detectarColeccionesGridFS(db);
    console.log('[Predicción] files:', filesCollName, '| chunks:', chunksCollName, '| BUCKET:', `"${BUCKET}"`);

    const archivos = await listarArchivosExcel(db);
    if (!archivos.length) {
      return res.status(400).json({ ok: false, error: `No hay .xlsx en GridFS (${filesCollName || `${BUCKET}.files`})` });
    }

    let procesados = 0, omitidos = 0;

    for (const file of archivos) {
      const info = extraerMesAnioDesdeNombre(file.filename);
      if (!info) {
        console.warn(`[Entrenar] No pude extraer mes/año desde: ${file.filename}`);
        omitidos++;
        continue;
      }

      const buffer = await descargarArchivoGridFS(db, file._id);
      const { filas_utiles, suma_numeros } = await resumirExcelDesdeBuffer(buffer);

      const produccion_total = (suma_numeros > 0 ? suma_numeros : filas_utiles);

      const doc = {
        anio: info.anio,
        mes: info.mes,
        archivo: file.filename,
        fileId: file._id,
        filas_utiles,
        produccion_total,
        updatedAt: new Date()
      };

      await colResumen.updateOne(
        { anio: info.anio, mes: info.mes },
        { $set: doc },
        { upsert: true }
      );
      procesados++;
    }

    res.json({ ok: true, mensaje: 'Entrenamiento completado desde GridFS', procesados, omitidos });
  } catch (e) {
    console.error('[Entrenar] ', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /prediccion/proyectar?anio=&mes=
router.get('/proyectar', async (req, res) => {
  try {
    await req.app.locals.mongoReady;
    const db = req.app.locals.getDB();
    const col = db.collection(COLECCION_MESES);

    const meses = await col.find({}).toArray();
    if (!meses.length) {
      return res.status(400).json({ ok: false, error: 'Ejecuta /prediccion/entrenar primero' });
    }

    meses.sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));

    const { anio, mes } = req.query;
    let hasta = meses;
    if (anio && mes) {
      const idx = meses.findIndex(m => m.anio == Number(anio) && m.mes == Number(mes));
      if (idx === -1) return res.status(404).json({ ok: false, error: 'Mes base no encontrado' });
      hasta = meses.slice(0, idx + 1);
    }

    const resp = proyectarSiguienteMes(hasta);
    if (!resp.ok) return res.status(400).json(resp);

    resp.mes_base.capacidad_optima = Number(resp.mes_base.capacidad_optima || 0);
    res.json(resp);
  } catch (e) {
    console.error('[Proyectar] ', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;