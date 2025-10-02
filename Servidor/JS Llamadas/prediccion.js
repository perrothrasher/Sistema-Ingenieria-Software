// JS Llamadas/prediccion.js
// Lee Excels desde MongoDB (GridFS) y proyecta SOLO el primer mes faltante del último año con datos.
// Si intentan predecir un mes que YA TIENE informe, devuelve error.
// Si intentan saltarse un hueco previo (ej. falta el 9 y piden 10), devuelve error.

const { Router } = require('express');
const ExcelJS = require('exceljs');
const { GridFSBucket } = require('mongodb');

const router = Router();

// === Colección destino (donde guardaste el resumen mensual) ===
const COLECCION_MESES = 'venta_e_ingreso_por_usuario';

// === Meses en español -> número ===
const mapaMes = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12
};

// === Bucket de GridFS (puede tener espacios) ===
const BUCKET = (process.env.GFS_BUCKET && String(process.env.GFS_BUCKET).trim()) || 'archivos';

/* ========= 1) Parser nombre ========= */
function extraerMesAnioDesdeNombre(nombre) {
  if (!nombre) return null;

  let s = String(nombre)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[“”"']/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // quita extensión
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

/* ========= 2) Resumen Excel ========= */
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

/* ========= 3) Proyección (cálculo) ========= */
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

/* ========= 4) GridFS helpers ========= */
async function detectarColeccionesGridFS(db) {
  const names = await db.listCollections().toArray();
  const colNames = names.map(n => n.name);

  const filesStd = `${BUCKET}.files`;
  const chunksStd = `${BUCKET}.chunks`;

  let filesCollName = colNames.includes(filesStd) ? filesStd : null;
  let chunksCollName = colNames.includes(chunksStd) ? chunksStd : null;

  if (!filesCollName && colNames.includes(BUCKET)) filesCollName = BUCKET;

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

  if (!chunksCollName) throw new Error('No se encontró colección .chunks para reconstruir el archivo.');
  const colChunks = db.collection(chunksCollName);
  const cursor = colChunks.find({ files_id: fileId }).sort({ n: 1 });
  const parts = [];
  for await (const ch of cursor) {
    const buf = Buffer.isBuffer(ch.data) ? ch.data : Buffer.from(ch.data.buffer);
    parts.push(buf);
  }
  if (!parts.length) throw new Error(`No hay chunks para fileId=${fileId} en ${chunksCollName}`);
  return Buffer.concat(parts);
}

/* ========= 5) ENDPOINTS ========= */

// Entrenar
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
      if (!info) { console.warn(`[Entrenar] No pude extraer mes/año desde: ${file.filename}`); omitidos++; continue; }

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

// Proyectar (reglas:
// 1) Solo se puede predecir el PRIMER mes faltante del ÚLTIMO año con datos.
// 2) Si piden un mes que YA TIENE informe => error (no hay predicción que hacer).
// 3) Si faltan meses previos y piden un mes posterior => error.)
router.get('/proyectar', async (req, res) => {
  try {
    await req.app.locals.mongoReady;
    const db = req.app.locals.getDB();
    const col = db.collection(COLECCION_MESES);

    const meses = await col.find({}).toArray();
    if (!meses.length) {
      return res.status(400).json({ ok: false, error: 'Ejecuta /prediccion/entrenar primero' });
    }

    // Orden cronológico
    meses.sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));

    const exists = (a, m) => meses.some(x => x.anio === a && x.mes === m);

    // Último año con datos
    const years = [...new Set(meses.map(m => m.anio))].sort((a,b)=>a-b);
    const lastYear = years[years.length-1];

    // Meses presentes en ese año y prefijo contiguo
    const monthsInLast = new Set(meses.filter(m => m.anio===lastYear).map(m => m.mes));
    let contiguousLen = 0;
    for (let mm=1; mm<=12; mm++){
      if (monthsInLast.has(mm)) contiguousLen++;
      else break;
    }

    if (contiguousLen === 0) {
      return res.status(400).json({
        ok: false,
        error: `No hay informes previos en ${lastYear}. Sube al menos "Enero ${lastYear}" antes de predecir.`
      });
    }

    // Primer mes faltante del último año con datos
    let targetYear = lastYear;
    let targetMonth = contiguousLen + 1;
    if (targetMonth > 12) { targetMonth = 1; targetYear = lastYear + 1; }

    // Validar parámetros solicitados por el usuario (si los envía)
    const qAnio = req.query.anio ? Number(req.query.anio) : null;
    const qMes  = req.query.mes  ? Number(req.query.mes)  : null;

    if (qAnio && qMes) {
      // (NUEVO) Si el mes pedido YA EXISTE como informe, error directo:
      if (exists(qAnio, qMes)) {
        return res.status(400).json({
          ok: false,
          error: `El mes ${qAnio}-${String(qMes).padStart(2,'0')} ya tiene informe cargado. No hay predicción que hacer.`
        });
      }

      // Reglas de huecos: no se puede saltar el primer faltante
      if (qAnio === lastYear) {
        if (qMes !== targetMonth) {
          if (qMes > targetMonth) {
            return res.status(400).json({
              ok: false,
              error: `No se puede predecir ${qAnio}-${String(qMes).padStart(2,'0')}: falta el informe del mes ${String(targetMonth).padStart(2,'0')} de ${lastYear}.`
            });
          }
          // qMes < targetMonth y no existe => es un hueco antes del primer faltante (no debería ocurrir si contiguousLen es correcto)
          if (!monthsInLast.has(qMes)) {
            return res.status(400).json({
              ok: false,
              error: `El mes ${String(qMes).padStart(2,'0')} de ${qAnio} no tiene informe y está antes del primer faltante (${String(targetMonth).padStart(2,'0')}). Sube primero los meses previos.`
            });
          }
        }
      } else if (qAnio === lastYear + 1) {
        // Solo permitido si lastYear tiene 12/12 y piden enero del siguiente
        if (!(contiguousLen === 12 && qMes === 1)) {
          return res.status(400).json({
            ok: false,
            error: `Solo puede predecirse ${lastYear+1}-01 porque ${lastYear} ya tiene 12 meses.`
          });
        }
      } else {
        return res.status(400).json({
          ok: false,
          error: `La predicción se limita al primer mes faltante del último año con datos (${lastYear}).`
        });
      }

      // A partir de aquí, los parámetros son válidos, pero forzamos el objetivo a lo permitido
      targetYear = (qAnio === lastYear + 1 && contiguousLen === 12) ? (lastYear + 1) : lastYear;
      targetMonth = (qAnio === lastYear + 1 && contiguousLen === 12) ? 1 : targetMonth;
    }

    // Serie completa para entrenar/estimar tendencia
    const hasta = meses.slice();
    if (!hasta.length) {
      return res.status(400).json({ ok:false, error: 'Sin datos suficientes para proyectar.' });
    }

    let resp = proyectarSiguienteMes(hasta);
    if (!resp.ok) return res.status(400).json(resp);

    // Sobrescribe con el mes objetivo permitido
    resp.mes_siguiente.anio = targetYear;
    resp.mes_siguiente.mes  = targetMonth;

    // === Serie para gráfico (histórico + proyectado) ===
    const labels = [];
    const reales = [];
    const necesarios = [];
    for (const m of meses) {
      labels.push(`${m.anio}-${String(m.mes).padStart(2,'0')}`);
      const prod = Number(m.produccion_total || 0);
      const nec = Math.max(1, Math.ceil(prod / 100)); // misma regla
      necesarios.push(nec);
      reales.push(Number(m.trabajadores_reales) || Math.max(1, Math.round(prod / 100)));
    }
    labels.push(`${resp.mes_siguiente.anio}-${String(resp.mes_siguiente.mes).padStart(2,'0')}`);
    necesarios.push(resp.mes_siguiente.trabajadores_necesarios);
    reales.push(resp.mes_siguiente.trabajadores_reales);
    resp.serie_empleados = { labels, reales, necesarios };

    // === Resumen + Reporte ===
    const estado = resp.mes_siguiente.estado_regla;
    const textoEstado = estado === 'sobre' ? 'sobredotación' : estado === 'sub' ? 'subdotación' : 'dotación adecuada';
    resp.resumen =
      `Predicción para ${resp.mes_siguiente.anio}-${String(resp.mes_siguiente.mes).padStart(2,'0')}: ` +
      `producción esperada ${resp.mes_siguiente.produccion_total}, ` +
      `necesarios ${resp.mes_siguiente.trabajadores_necesarios}, ` +
      `reales base ${resp.mes_siguiente.trabajadores_reales} → ${textoEstado}.`;
    resp.reporte = {
      mes_base: resp.mes_base,
      mes_proyectado: resp.mes_siguiente,
      regla: 'Promedio móvil (3) + tendencia; productividad 100 unidades/empleado',
      notas: `Se proyecta únicamente el primer mes faltante del año ${lastYear}. Si falta un mes previo, NO se permite predecir meses posteriores. Si el mes ya tiene informe, no hay predicción que hacer.`
    };

    resp.mes_base.capacidad_optima = Number(resp.mes_base.capacidad_optima || 0);
    res.json(resp);
  } catch (e) {
    console.error('[Proyectar] ', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;