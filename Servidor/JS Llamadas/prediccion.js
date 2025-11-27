const { Router } = require('express');
const PDFDocument = require('pdfkit');
const router = Router();

// ==========================================
// CONFIGURACIÓN
// ==========================================
const EVENTOS_SEMILLA = { 1: 0.95, 2: 0.85, 3: 1.10, 9: 0.80, 12: 0.90 };
const POLL_INTERVAL_MS = 60 * 1000;

// Umbral para considerar un registro válido (evitar gente que hizo 1 folio)
const MIN_FOLIOS_VALIDOS = 50; 

// ID CRÍTICO: Solo consideramos producción con este ID (1 = Sin Justificación / Real)
const ID_SIN_JUSTIFICACION = 1;

// ==========================================
// HELPERS BASE DE DATOS
// ==========================================
function getDB(reqOrApp) {
  if (!reqOrApp) return null;
  if (reqOrApp.app) return reqOrApp.app.locals.db;
  if (reqOrApp.locals) return reqOrApp.locals.db;
  return null;
}

async function query(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

// ==========================================
// LÓGICA MATEMÁTICA AVANZADA
// ==========================================

// 1. Obtener estadísticas de rendimiento REAL del equipo
async function obtenerEstadisticasEquipo(db) {
    // Traemos la producción agrupada por usuario y mes
    // FILTRO CLAVE: Solo ID 1 (Producción Real)
    const sql = `
        SELECT usuarioPrendas_id, anio, mes, SUM(cantidadFolios) as total
        FROM produccion
        WHERE (justificacion_id = ? OR justificacion_id IS NULL) 
        GROUP BY usuarioPrendas_id, anio, mes
        HAVING total > ?
    `;
    const rows = await query(db, sql, [ID_SIN_JUSTIFICACION, MIN_FOLIOS_VALIDOS]);

    // Fallback si no hay datos limpios
    if (!rows.length) return { capacidad_ok: 500, dotacion_actual: 1 };

    // A. Calcular Dotación Actual (Basado en el último mes registrado con actividad real)
    rows.sort((a, b) => (a.anio - b.anio) || (a.mes - b.mes));
    const ultimoPeriodo = rows[rows.length - 1];
    
    const usuariosActivos = new Set(
        rows.filter(r => r.anio === ultimoPeriodo.anio && r.mes === ultimoPeriodo.mes)
            .map(r => r.usuarioPrendas_id)
    );
    const dotacionActual = usuariosActivos.size || 1;

    // B. Lógica de "Banda de Rendimiento" (Max / Min)
    const producciones = rows.map(r => Number(r.total));
    const maxProd = Math.max(...producciones);
    const minProd = Math.min(...producciones);
    
    // Media Operativa: El punto medio entre el mejor y el peor desempeño real
    const mediaOperativa = (maxProd + minProd) / 2;

    // C. Filtrar a los trabajadores "OK" (Eficientes)
    // Consideramos "OK" a quienes están por encima del 90% de la media operativa
    const produccionesOK = producciones.filter(p => p >= (mediaOperativa * 0.9)); 
    
    // Calculamos el promedio solo con los eficientes para no bajar la vara
    const baseCalculo = produccionesOK.length > 0 ? produccionesOK : producciones;
    const capacidadPromedioOK = baseCalculo.reduce((a, b) => a + b, 0) / baseCalculo.length;

    return {
        capacidad_ok: Math.round(capacidadPromedioOK),
        dotacion_actual: dotacionActual,
        max_historico: maxProd,
        min_historico: minProd,
        media_operativa: Math.round(mediaOperativa)
    };
}

function calcularRegresion(puntos) {
  const n = puntos.length;
  if (n === 0) return { m: 0, b: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of puntos) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
  }
  const den = (n * sumXX - sumX * sumX);
  if (den === 0) return { m: 0, b: sumY / n };
  const m = (n * sumXY - sumX * sumY) / den;
  const b = (sumY - m * sumX) / n;
  return { m, b };
}

async function getLastRecordedDate(db) {
  const sql = `SELECT anio, mes FROM produccion ORDER BY anio DESC, mes DESC LIMIT 1`;
  const rows = await query(db, sql);
  if (!rows || !rows.length) {
    const now = new Date();
    return { anio: now.getFullYear(), mes: now.getMonth() + 1 };
  }
  return rows[0];
}

// ==========================================
// ENTRENAMIENTO Y MODELO
// ==========================================

async function entrenarModeloInterno(db) {
  console.log("[IA] Entrenando modelo global (Filtrando justificaciones)...");
  
  // AHORA EL ENTRENAMIENTO TAMBIÉN IGNORA LA BASURA (ID != 1)
  const sqlHistoria = `
    SELECT anio, mes, SUM(cantidadFolios) AS produccion_total
    FROM produccion
    WHERE (justificacion_id = ? OR justificacion_id IS NULL)
    GROUP BY anio, mes
    HAVING SUM(cantidadFolios) > 0
    ORDER BY anio ASC, mes ASC
  `;
  const rows = await query(db, sqlHistoria, [ID_SIN_JUSTIFICACION]);
  
  if (!rows || rows.length < 2) return null;

  const puntos = rows.map(r => {
    const x = (Number(r.anio) * 12) + Number(r.mes);
    return { x, y: Number(r.produccion_total) };
  }).sort((a,b)=>a.x-b.x);

  const { m, b } = calcularRegresion(puntos);

  const factoresTemp = {};
  const conteo = {};
  for (const p of puntos) {
    const tendencia = (m * p.x) + b;
    const tVal = tendencia < 1 ? 1 : tendencia;
    const ratio = p.y / tVal;
    
    const mes = ((p.x - 1) % 12) + 1;
    factoresTemp[mes] = (factoresTemp[mes] || 0) + ratio;
    conteo[mes] = (conteo[mes] || 0) + 1;
  }
  
  const factoresFinales = {};
  for (let mth=1;mth<=12;mth++) {
    const est = conteo[mth] ? (factoresTemp[mth]/conteo[mth]) : 1;
    factoresFinales[mth] = (est * 0.7) + ((EVENTOS_SEMILLA[mth] || 1) * 0.3);
  }

  const ultimo = rows[rows.length - 1];
  const ultimoX = (Number(ultimo.anio) * 12) + Number(ultimo.mes);

  const modeloData = {
    pendiente: m,
    intercepto: b,
    factores_json: JSON.stringify(factoresFinales),
    productividad_base: 0, 
    ultimo_indice: ultimoX,
    ultimo_anio: ultimo.anio,
    ultimo_mes: ultimo.mes,
    fecha_entrenamiento: new Date()
  };

  await query(db, "DELETE FROM modelo_prediccion");
  await query(db, "INSERT INTO modelo_prediccion SET ?", [modeloData]);
  return modeloData;
}

async function getModeloGuardado(db) {
  const rows = await query(db, "SELECT * FROM modelo_prediccion ORDER BY id_modelo DESC LIMIT 1");
  return rows && rows.length ? rows[0] : null;
}

// POLLING
let lastProductionChecksum = null;
let pollingStarted = false;

async function computeProductionChecksum(db) {
  const rows = await query(db, "SELECT COUNT(*) AS cnt, MAX(fecha_registro) AS max_date, MAX(id) AS max_id FROM produccion");
  if (!rows || !rows.length) return null;
  const r = rows[0];
  const datePart = r.max_date ? (r.max_date.toISOString ? r.max_date.toISOString() : r.max_date) : '';
  return `${r.cnt}|${datePart}|${r.max_id||0}`;
}

async function startPollingForChanges(app) {
  if (pollingStarted) return;
  pollingStarted = true;
  const db = getDB(app);
  if (!db) return;
  try { lastProductionChecksum = await computeProductionChecksum(db); } catch(e){}
  
  setInterval(async () => {
    try {
      const cs = await computeProductionChecksum(db);
      if (cs && cs !== lastProductionChecksum) {
        console.log("[IA] Cambio detectado -> Reentrenando...");
        lastProductionChecksum = cs;
        await entrenarModeloInterno(db);
      }
    } catch(e){}
  }, POLL_INTERVAL_MS);
}

// ==========================================
// RUTAS DE LA API
// ==========================================

router.post('/entrenar', async (req, res) => {
  const db = getDB(req);
  try {
    const modelo = await entrenarModeloInterno(db);
    res.json({ ok:true, modelo });
  } catch(e) { res.status(500).json({ ok:false, error: e.message }); }
});

// ------------------------------------------
// 1. ANALIZAR MES (Diagnóstico Pasado)
// ------------------------------------------
router.get('/analizar-mes', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    const mes = Number(req.query.mes);
    const anio = Number(req.query.anio);
    
    // FILTRO CLAVE: Solo ID 1
    const sql = `
        SELECT SUM(cantidadFolios) AS total, COUNT(DISTINCT usuarioPrendas_id) as personas_reales
        FROM produccion 
        WHERE mes = ? AND anio = ? AND (justificacion_id = ? OR justificacion_id IS NULL)
    `;
    const rows = await query(db, sql, [mes, anio, ID_SIN_JUSTIFICACION]);
    const total = (rows && rows[0] && rows[0].total) ? Number(rows[0].total) : 0;
    const personas_reales = (rows && rows[0] && rows[0].personas_reales) ? Number(rows[0].personas_reales) : 0;

    const stats = await obtenerEstadisticasEquipo(db);
    const dotacionTeorica = Math.ceil(total / stats.capacidad_ok);
    
    let estado = 'ADECUADO';
    if (personas_reales > dotacionTeorica) estado = 'SOBREDOTACIÓN';
    if (personas_reales < dotacionTeorica) estado = 'SUBDOTACIÓN';

    res.json({ 
        ok:true, 
        produccion: total, 
        estado,
        debug: { real: personas_reales, ideal: dotacionTeorica, cap_ok: stats.capacidad_ok }
    });
  } catch(e) { res.status(500).json({ ok:false, error: e.message }); }
});

// ------------------------------------------
// 2. PROYECCIÓN (El Cerebro Nuevo)
// ------------------------------------------
router.get('/proyectar', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    const nMeses = parseInt(req.query.meses) || 1;
    
    let mod = await getModeloGuardado(db);
    if (!mod) { await entrenarModeloInterno(db); mod = await getModeloGuardado(db); }
    
    const m = Number(mod.pendiente);
    const b = Number(mod.intercepto);
    let lastAnio = Number(mod.ultimo_anio);
    let lastMes = Number(mod.ultimo_mes);
    let factoresEstacionales = {};
    try { factoresEstacionales = JSON.parse(mod.factores_json); } catch(e) { factoresEstacionales = EVENTOS_SEMILLA; }

    if (!lastAnio) {
        const ultimoReal = await getLastRecordedDate(db);
        lastAnio = Number(ultimoReal.anio);
        lastMes = Number(ultimoReal.mes);
    }

    const stats = await obtenerEstadisticasEquipo(db);
    const capacidadPorPersona = stats.capacidad_ok;
    const dotacionActual = stats.dotacion_actual;

    const proy = [];
    let x = (lastAnio * 12) + lastMes;

    for (let i=0; i<nMeses; i++) {
      lastMes++;
      if (lastMes > 12) { lastMes = 1; lastAnio++; }
      x++;

      let estimado = (m * x) + b;
      let factorMes = (factoresEstacionales[lastMes] !== undefined) ? Number(factoresEstacionales[lastMes]) : 1.0;
      estimado = Math.max(0, estimado * factorMes);

      const personalNecesario = Math.ceil(estimado / capacidadPorPersona);
      
      let estado = 'ADECUADO';
      let mensaje = 'Mantener dotación';

      if (dotacionActual > personalNecesario) {
          const sobrante = dotacionActual - personalNecesario;
          estado = 'SOBREDOTACIÓN';
          mensaje = `Reducir: -${sobrante}`; 
      } else if (dotacionActual < personalNecesario) {
          const faltante = personalNecesario - dotacionActual;
          estado = 'SUBDOTACIÓN';
          mensaje = `Contratar: +${faltante}`;
      }

      proy.push({
        anio: lastAnio,
        mes: lastMes,
        produccion: Math.round(estimado),
        rango_min: Math.round(estimado * 0.9),
        rango_max: Math.round(estimado * 1.1),
        dotacion_sugerida: personalNecesario, 
        dotacion_actual: dotacionActual,
        factor: factorMes.toFixed(2),
        estado,
        mensaje_extra: mensaje
      });
    }

    if (proy.length) {
      const resumen = `${proy[0].anio}-${String(proy[0].mes).padStart(2,'0')} -> ${proy[proy.length-1].anio}-${String(proy[proy.length-1].mes).padStart(2,'0')}`;
      try {
        await query(db, "INSERT INTO historial_proyecciones (fecha, resumen, json_resultado) VALUES (NOW(), ?, ?)", [resumen, JSON.stringify(proy)]);
      } catch(e) {}
    }

    res.json({ ok:true, proyecciones: proy, stats_equipo: stats });
  } catch(e) { 
    console.error(e);
    res.status(500).json({ ok:false, error: e.message }); 
  }
});

// ------------------------------------------
// 3. GRAFICO (Global y Limpio)
// ------------------------------------------
router.post('/grafico-filtrado', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    // FILTRO CLAVE: Solo ID 1
    const sql = `
      SELECT anio, mes, CONCAT(anio,'-',LPAD(mes,2,'0')) AS etiqueta, 
             SUM(cantidadFolios) AS valor,
             COUNT(DISTINCT usuarioPrendas_id) as dotacion_real
      FROM produccion
      WHERE (justificacion_id = ? OR justificacion_id IS NULL)
      GROUP BY anio, mes
      ORDER BY anio ASC, mes ASC
    `;
    const rows = await query(db, sql, [ID_SIN_JUSTIFICACION]);

    const stats = await obtenerEstadisticasEquipo(db);

    const datos = rows.map(r => {
      const valor = Number(r.valor || 0);
      const dotReal = Number(r.dotacion_real || 1);
      const dotIdeal = Math.ceil(valor / stats.capacidad_ok);
      
      let estado = 'ADECUADO';
      if (dotReal > dotIdeal) estado = 'SOBREDOTACIÓN';
      if (dotReal < dotIdeal) estado = 'SUBDOTACIÓN';

      return { 
          etiqueta: r.etiqueta, 
          valor: valor, 
          anio: Number(r.anio), 
          mes: Number(r.mes), 
          estado 
      };
    });

    res.json({ ok:true, datos, meta_base: stats.capacidad_ok });
  } catch(e) {
    res.json({ ok:false, error: e.message });
  }
});

router.get('/filtros-info', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.json({ mandantes:[], servicios:[], usuarios:[] });
  try {
    res.json({ mandantes:[], servicios:[], usuarios:[] });
  } catch(e) { res.json({ mandantes:[], servicios:[], usuarios:[] }); }
});

router.get('/historial', async (req, res) => {
  const db = getDB(req);
  try {
    const rows = await query(db, "SELECT id, fecha, resumen FROM historial_proyecciones ORDER BY fecha DESC");
    res.json({ ok:true, historial: rows });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

router.get('/historial/pdf/:id', async (req, res) => {
  const db = getDB(req);
  try {
    const rows = await query(db, "SELECT archivo_pdf FROM historial_proyecciones WHERE id = ?", [req.params.id]);
    if (!rows || !rows.length) return res.status(404).send("No encontrado");
    res.setHeader("Content-Type", "application/pdf");
    res.send(rows[0].archivo_pdf);
  } catch(e){ res.status(500).send("Error interno"); }
});

router.post('/reporte', async (req, res) => {
  try {
    const proyecciones = req.body.proyecciones || [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Informe_Dotacion_${new Date().toISOString().slice(0,10)}.pdf`);
    doc.pipe(res);

    doc.fillColor('#444444').fontSize(20).text('Informe de Proyección de Dotación', { align: 'center' });
    doc.fontSize(10).text(`Generado el: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // Tabla
    const tableTop = doc.y;
    const colX = [50, 150, 250, 350, 450];
    
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Periodo', colX[0], tableTop);
    doc.text('Producción', colX[1], tableTop);
    doc.text('Dot. Actual', colX[2], tableTop);
    doc.text('Sugerido', colX[3], tableTop);
    doc.text('Estado', colX[4], tableTop);

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#aaaaaa').stroke();
    
    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(10);

    proyecciones.forEach(p => {
        if (y > 700) { doc.addPage(); y = 50; } 
        
        doc.fillColor('#000000').text(`${p.anio}-${String(p.mes).padStart(2,'0')}`, colX[0], y);
        doc.text(p.produccion.toString(), colX[1], y);
        doc.text(p.dotacion_actual.toString(), colX[2], y);
        doc.font('Helvetica-Bold').text(p.dotacion_sugerida.toString(), colX[3], y);
        
        doc.font('Helvetica');
        let color = '#27ae60';
        if(p.estado === 'SOBREDOTACIÓN') color = '#c0392b';
        if(p.estado === 'SUBDOTACIÓN') color = '#d35400';
        
        doc.fillColor(color).text(p.estado, colX[4], y);
        y += 20;
    });

    doc.end();
  } catch(e) { res.status(500).send('Error PDF: ' + e.message); }
});

function initAutoRetrain(app) {
  const db = getDB(app);
  if (!db) return console.warn("[IA] initAutoRetrain: no db");
  startPollingForChanges(app).catch(e => console.warn("[IA] Polling error:", e.message));
}

module.exports = router;
module.exports.entrenarModeloInterno = entrenarModeloInterno;
module.exports.initAutoRetrain = initAutoRetrain;