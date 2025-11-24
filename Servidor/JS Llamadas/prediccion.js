// prediccion.js (COMPLETO Y CORREGIDO)
const { Router } = require('express');
const PDFDocument = require('pdfkit');
const router = Router();

// Constantes
const EVENTOS_SEMILLA = { 1: 0.95, 2: 0.85, 3: 1.10, 9: 0.80, 12: 0.90 };
const POLL_INTERVAL_MS = 60 * 1000;

// Helpers DB
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

// Regresión simple
function calcularRegresion(puntos) {
  const n = puntos.length;
  if (n === 0) return { m: 0, b: 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const p of puntos) {
    sumX += p.x; sumY += p.y; sumXY += p.x * p.y; sumXX += p.x * p.x;
  }
  const den = (n * sumXX - sumX * sumX);
  if (den === 0) return { m: 0, b: 0 };
  const m = (n * sumXY - sumX * sumY) / den;
  const b = (sumY - m * sumX) / n;
  return { m, b };
}

// Productividad base: promedio por trabajador (solo justificacion_id = 0)
async function calcularProductividadBase(db) {
  try {
    const sql = `
      SELECT
        p.usuarioPrendas_id AS usuario,
        SUM(p.cantidadFolios) AS total,
        COUNT(DISTINCT CONCAT(p.anio,'-',LPAD(p.mes,2,'0'))) AS meses_activos,
        (SUM(p.cantidadFolios) / NULLIF(COUNT(DISTINCT CONCAT(p.anio,'-',LPAD(p.mes,2,'0'))),0)) AS promedio_mensual
      FROM produccion p
      WHERE (p.justificacion_id = 0 OR p.justificacion_id IS NULL)
      GROUP BY p.usuarioPrendas_id
      HAVING total > 0
    `;
    const rows = await query(db, sql);
    if (!rows || rows.length === 0) {
      const r2 = await query(db, `
        SELECT AVG(total) AS prom FROM (
          SELECT SUM(cantidadFolios) AS total FROM produccion GROUP BY anio, mes
        ) tmp
      `);
      const fallback = (r2 && r2[0] && r2[0].prom) ? Number(r2[0].prom) : 500;
      return Math.round(fallback);
    }
    let maxVal = -Infinity, minVal = Infinity;
    for (const r of rows) {
      const v = Number(r.promedio_mensual || 0);
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
    }
    if (!isFinite(maxVal) || !isFinite(minVal)) {
      const fallbackAvg = rows.reduce((a,b)=>a+Number(b.promedio_mensual||0),0)/rows.length;
      return Math.round(fallbackAvg);
    }
    const productBase = (maxVal + minVal) / 2;
    return Math.max(1, Math.round(productBase));
  } catch (e) {
    try {
      const r2 = await query(db, `
        SELECT AVG(total) AS prom FROM (
          SELECT SUM(cantidadFolios) AS total FROM produccion GROUP BY anio, mes
        ) tmp
      `);
      const fallback = (r2 && r2[0] && r2[0].prom) ? Number(r2[0].prom) : 500;
      return Math.round(fallback);
    } catch(_) {
      return 500;
    }
  }
}

// Helper auxiliar (solo usado como fallback)
async function getLastRecordedDate(db) {
  const sql = `
    SELECT anio, mes
    FROM (
      SELECT anio, mes, SUM(cantidadFolios) AS total
      FROM produccion
      GROUP BY anio, mes
      HAVING total > 0
    ) t
    ORDER BY anio DESC, mes DESC
    LIMIT 1
  `;
  const rows = await query(db, sql);
  if (!rows || rows.length === 0) {
    const now = new Date();
    return { anio: now.getFullYear(), mes: now.getMonth() + 1 };
  }
  return rows[0];
}

// Entrenar modelo (tendencia y estacionalidad)
async function entrenarModeloInterno(db) {
  console.log("[IA] Entrenando modelo...");
  const sqlHistoria = `
    SELECT anio, mes, SUM(cantidadFolios) AS produccion_total
    FROM produccion
    GROUP BY anio, mes
    HAVING SUM(cantidadFolios) > 0
    ORDER BY anio ASC, mes ASC
  `;
  const rows = await query(db, sqlHistoria);
  if (!rows || rows.length < 2) {
    console.log("[IA] Datos insuficientes para entrenar.");
    return null;
  }

  const productividad_base = await calcularProductividadBase(db);

  // puntos x = anio*12 + mes
  const puntos = rows.map(r => {
    const x = (Number(r.anio) * 12) + Number(r.mes);
    return { x, y: Number(r.produccion_total) };
  }).sort((a,b)=>a.x-b.x);

  const { m, b } = calcularRegresion(puntos);

  // factores estacionales
  const factoresTemp = {};
  const conteo = {};
  for (const p of puntos) {
    const tendencia = (m * p.x) + b;
    const ratio = tendencia > 0 ? (p.y / tendencia) : 1;
    const mes = ((p.x - 1) % 12) + 1;
    factoresTemp[mes] = (factoresTemp[mes] || 0) + ratio;
    conteo[mes] = (conteo[mes] || 0) + 1;
  }
  const factoresFinales = {};
  for (let mth=1;mth<=12;mth++) {
    const est = conteo[mth] ? (factoresTemp[mth]/conteo[mth]) : 1;
    factoresFinales[mth] = (est * 0.7) + ((EVENTOS_SEMILLA[mth] || 1) * 0.3);
  }

  // Guardamos el último registro REAL usado para el entrenamiento
  const ultimo = rows[rows.length - 1];
  const ultimoX = (Number(ultimo.anio) * 12) + Number(ultimo.mes);

  const modeloData = {
    pendiente: m,
    intercepto: b,
    factores_json: JSON.stringify(factoresFinales),
    productividad_base: productividad_base,
    ultimo_indice: ultimoX,
    ultimo_anio: ultimo.anio, // IMPORTANTE: Guarda dónde termina la realidad
    ultimo_mes: ultimo.mes,   // IMPORTANTE: Guarda dónde termina la realidad
    fecha_entrenamiento: new Date()
  };

  await query(db, "TRUNCATE TABLE modelo_prediccion");
  await query(db, "INSERT INTO modelo_prediccion SET ?", [modeloData]);

  console.log("[IA] Modelo guardado. Último dato real:", ultimo.anio, ultimo.mes);
  return modeloData;
}

async function getModeloGuardado(db) {
  const rows = await query(db, `SELECT * FROM modelo_prediccion ORDER BY id_modelo DESC LIMIT 1`);
  return rows && rows.length ? rows[0] : null;
}

// Polling (Detección de cambios y auto-entrenamiento)
let lastProductionChecksum = null;
let pollingStarted = false;
async function computeProductionChecksum(db) {
  // Checksum simple: Cantidad de filas + Fecha máxima + ID máximo
  const rows = await query(db, `SELECT COUNT(*) AS cnt, MAX(fecha_registro) AS max_date, MAX(id) AS max_id FROM produccion`);
  if (!rows || !rows.length) return null;
  const r = rows[0];
  const datePart = r.max_date ? (r.max_date.toISOString ? r.max_date.toISOString() : r.max_date) : '';
  return `${r.cnt}|${datePart}|${r.max_id||0}`;
}
async function startPollingForChanges(app) {
  if (pollingStarted) return;
  pollingStarted = true;
  const db = getDB(app);
  if (!db) return console.warn("[IA] No DB para polling");
  try { lastProductionChecksum = await computeProductionChecksum(db); } catch(e){ lastProductionChecksum = null; }
  
  setInterval(async () => {
    try {
      const cs = await computeProductionChecksum(db);
      // Si cambia algo en la tabla producción, reentrenamos
      if (cs && cs !== lastProductionChecksum) {
        console.log("[IA] Cambio detectado en datos -> REENTRENANDO MODELO...");
        lastProductionChecksum = cs;
        try { 
            await entrenarModeloInterno(db); 
        } catch(e){ 
            console.error("[IA] Reentreno falló:", e.message); 
        }
      }
    } catch(e){ console.error("[IA] Polling error:", e.message); }
  }, POLL_INTERVAL_MS);
}

// RUTAS

router.post('/entrenar', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error:"DB no conectada" });
  try {
    const modelo = await entrenarModeloInterno(db);
    res.json({ ok:true, modelo });
  } catch(e) { res.status(500).json({ ok:false, error: e.message }); }
});

router.post('/notify-change', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    await entrenarModeloInterno(db);
    lastProductionChecksum = await computeProductionChecksum(db);
    res.json({ ok:true, msg: "Reentrenamiento ejecutado" });
  } catch(e) { res.status(500).json({ ok:false, error: e.message }); }
});

// ANALIZAR MES
router.get('/analizar-mes', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    const mes = Number(req.query.mes);
    const anio = Number(req.query.anio);
    const rows = await query(db, `SELECT SUM(cantidadFolios) AS total FROM produccion WHERE mes = ? AND anio = ?`, [mes, anio]);
    const total = (rows && rows[0] && rows[0].total) ? Number(rows[0].total) : 0;
    const productividad_base = await calcularProductividadBase(db);
    const dot = productividad_base > 0 ? Math.ceil(total / productividad_base) : 0;
    const exacto = productividad_base > 0 ? (total / productividad_base) : 0;
    let estado = 'ok';
    if (dot > exacto * 1.15) estado = 'sobre';
    else if (dot < exacto * 0.85) estado = 'sub';
    res.json({ ok:true, produccion: total, dotacion: dot, estado });
  } catch(e) { res.status(500).json({ ok:false, error: e.message }); }
});

// PROYECTAR (CORREGIDO PARA INICIAR DESDE FIN DEL ENTRENAMIENTO)
router.get('/proyectar', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    let mod = await getModeloGuardado(db);
    if (!mod) {
      // entrenar si no existe modelo
      await entrenarModeloInterno(db);
      mod = await getModeloGuardado(db);
      if (!mod) return res.status(400).json({ ok:false, error: "Modelo inicializando" });
    }

    const factores = JSON.parse(mod.factores_json || "{}");
    const nMeses = parseInt(req.query.meses) || 1;
    const proy = [];

    // --- LÓGICA CORREGIDA ---
    // Usamos el último año/mes que el modelo "conoce" por su entrenamiento.
    // Esto evita saltar a fechas futuras basura en la DB.
    let lastAnio = Number(mod.ultimo_anio);
    let lastMes = Number(mod.ultimo_mes);

    // Fallback: Si el modelo es muy antiguo y no tiene esos campos, consultamos DB (último recurso)
    if (!lastAnio || !lastMes) {
         const ultimoReal = await getLastRecordedDate(db);
         lastAnio = Number(ultimoReal.anio);
         lastMes = Number(ultimoReal.mes);
    }
    
    // Convertimos a índice lineal X
    let x = (lastAnio * 12) + lastMes;
    // ------------------------

    for (let i=0;i<nMeses;i++) {
      // avanzar calendario al siguiente mes para proyectar
      lastMes++;
      if (lastMes > 12) { lastMes = 1; lastAnio++; }
      x = x + 1;

      // Calcular predicción
      const tendencia = (mod.pendiente * x) + Number(mod.intercepto);
      const factor = (factores[lastMes] !== undefined) ? Number(factores[lastMes]) : 1;
      const estimado = Math.max(0, tendencia * factor);

      // Calcular dotación sugerida
      const productividad_base = Number(mod.productividad_base || (await calcularProductividadBase(db)));
      const dot = productividad_base > 0 ? Math.ceil(estimado / productividad_base) : 0;
      const exacto = productividad_base > 0 ? (estimado / productividad_base) : 0;
      let estado = 'ok';
      if (dot > exacto * 1.15) estado = 'sobre';
      else if (dot < exacto * 0.85) estado = 'sub';

      proy.push({
        anio: lastAnio,
        mes: lastMes,
        produccion: Math.round(estimado),
        rango_min: Math.round(estimado * 0.9),
        rango_max: Math.round(estimado * 1.1),
        dotacion: dot,
        factor: factor.toFixed(2),
        estado
      });
    }

    // Guardar historial para auditoría (opcional)
    if (proy.length) {
      const resumen = `${proy[0].anio}-${String(proy[0].mes).padStart(2,'0')} → ${proy[proy.length-1].anio}-${String(proy[proy.length-1].mes).padStart(2,'0')}`;
      try {
        await query(db, "INSERT INTO historial_proyecciones (fecha, resumen, json_resultado) VALUES (NOW(), ?, ?)", [resumen, JSON.stringify(proy)]);
      } catch(e) { /* ignore */ }
    }

    res.json({ ok:true, proyecciones: proy });
  } catch(e) { res.status(500).json({ ok:false, error: e.message }); }
});

// GRAFICO FILTRADO
router.post('/grafico-filtrado', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.status(500).json({ ok:false, error: "DB no conectada" });
  try {
    const { anio, mandante, servicio, usuario } = req.body;
    const where = ["1=1"];
    const params = [];
    if (anio) { where.push("p.anio = ?"); params.push(anio); }
    if (mandante) { where.push("p.cliente_id = ?"); params.push(mandante); }
    if (servicio) { where.push("p.tipoServicio_id = ?"); params.push(servicio); }
    if (usuario) {
      if (/^\d+$/.test(String(usuario))) { where.push("p.usuarioPrendas_id = ?"); params.push(usuario); }
      else { where.push("(up.primer_nombre LIKE ? OR up.primer_apellido LIKE ?)"); params.push("%"+usuario+"%", "%"+usuario+"%"); }
    }
    const needJoinUsu = (usuario && !/^\d+$/.test(String(usuario)));
    const sql = `
      SELECT p.anio, p.mes, CONCAT(p.anio,'-',LPAD(p.mes,2,'0')) AS etiqueta, SUM(p.cantidadFolios) AS valor
      FROM produccion p
      ${needJoinUsu ? "INNER JOIN usuarioprendas up ON up.id = p.usuarioPrendas_id" : ""}
      WHERE ${where.join(" AND ")}
      GROUP BY p.anio, p.mes
      ORDER BY p.anio ASC, p.mes ASC
    `;
    const rows = await query(db, sql, params);

    const productividad_base = await calcularProductividadBase(db);

    const datos = rows.map(r => {
      const anioN = Number(r.anio), mesN = Number(r.mes), valor = Number(r.valor || 0);
      const dot = productividad_base > 0 ? Math.ceil(valor / productividad_base) : 0;
      const exacto = productividad_base > 0 ? (valor / productividad_base) : 0;
      let estado = 'ok';
      if (dot > exacto * 1.15) estado = 'sobre';
      else if (dot < exacto * 0.85) estado = 'sub';
      return { etiqueta: r.etiqueta, valor: valor, anio: anioN, mes: mesN, estado };
    });

    res.json({ ok:true, datos, meta_base: productividad_base });
  } catch(e) {
    res.json({ ok:false, error: e.message });
  }
});

// Filtros info
router.get('/filtros-info', async (req, res) => {
  const db = getDB(req);
  if (!db) return res.json({ mandantes:[], servicios:[], usuarios:[] });
  try {
    const mandantes = await query(db, `SELECT id, nombre FROM cliente ORDER BY nombre`);
    const servicios = await query(db, `SELECT id, NombreServicio AS nombre FROM tiposervicio ORDER BY NombreServicio`);
    const usuarios = await query(db, `SELECT id, CONCAT(primer_nombre, ' ', primer_apellido) AS nombre FROM usuarioprendas ORDER BY primer_nombre, primer_apellido`);
    res.json({ mandantes, servicios, usuarios });
  } catch(e) { res.json({ mandantes:[], servicios:[], usuarios:[] }); }
});

// Historial
router.get('/historial', async (req, res) => {
  const db = getDB(req);
  try {
    const rows = await query(db, `SELECT id, fecha, resumen FROM historial_proyecciones ORDER BY fecha DESC`);
    res.json({ ok:true, historial: rows });
  } catch(e){ res.json({ ok:false, error: e.message }); }
});

router.get('/historial/pdf/:id', async (req, res) => {
  const db = getDB(req);
  try {
    const rows = await query(db, `SELECT archivo_pdf FROM historial_proyecciones WHERE id = ?`, [req.params.id]);
    if (!rows || !rows.length) return res.status(404).send("No encontrado");
    res.setHeader("Content-Type", "application/pdf");
    res.send(rows[0].archivo_pdf);
  } catch(e){ res.status(500).send("Error interno"); }
});

// Generar PDF
// REEMPLAZAR SOLO LA RUTA '/reporte' EN prediccion.js

router.post('/reporte', async (req, res) => {
  try {
    const proyecciones = req.body.proyecciones || [];
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Configurar respuesta HTTP
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Informe_Dotacion_${new Date().toISOString().slice(0,10)}.pdf`);
    doc.pipe(res);

    // --- 1. ENCABEZADO ---
    doc.fillColor('#444444').fontSize(20).text('Informe de Proyección de Dotación', { align: 'center' });
    doc.fontSize(10).text(`Generado el: ${new Date().toLocaleString()}`, { align: 'center' });
    doc.moveDown(2);

    // --- 2. RESUMEN EJECUTIVO ---
    doc.fillColor('#000000').fontSize(12).font('Helvetica-Bold').text('Resumen Ejecutivo');
    doc.font('Helvetica').fontSize(10).moveDown(0.5);
    
    const inicio = proyecciones.length > 0 ? `${proyecciones[0].anio}-${proyecciones[0].mes}` : '?';
    const fin = proyecciones.length > 0 ? `${proyecciones[proyecciones.length-1].anio}-${proyecciones[proyecciones.length-1].mes}` : '?';
    const maxDot = Math.max(...proyecciones.map(p => p.dotacion));
    
    doc.text(`El presente informe detalla la proyección de dotación sugerida para el periodo comprendido entre ${inicio} y ${fin}. ` +
             `El modelo predictivo ha analizado las tendencias históricas y la estacionalidad para recomendar una dotación máxima de ${maxDot} personas durante este periodo. ` + 
             `Se recomienda ajustar los turnos según los rangos mínimos y máximos presentados a continuación para optimizar la productividad.`);
    doc.moveDown(2);

    // --- 3. TABLA DE DATOS ---
    doc.font('Helvetica-Bold').fontSize(10);
    
    // Cabecera Tabla
    const tableTop = doc.y;
    const colX = [50, 130, 230, 330, 430]; // Posiciones X de las columnas
    
    doc.text('Periodo', colX[0], tableTop);
    doc.text('Producción Est.', colX[1], tableTop);
    doc.text('Rango Sugerido', colX[2], tableTop);
    doc.text('Dotación', colX[3], tableTop);
    doc.text('Estado', colX[4], tableTop);

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#aaaaaa').stroke();
    
    let y = tableTop + 25;
    doc.font('Helvetica').fontSize(10);

    proyecciones.forEach(p => {
        // Fondo alternado para filas
        if (proyecciones.indexOf(p) % 2 === 1) {
            doc.save().fillColor('#f5f5f5').rect(50, y - 5, 500, 20).fill().restore();
        }

        const periodo = `${p.anio}-${String(p.mes).padStart(2,'0')}`;
        const rango = `${p.rango_min} - ${p.rango_max}`;
        
        doc.fillColor('#000000').text(periodo, colX[0], y);
        doc.text(p.produccion.toString(), colX[1], y);
        doc.text(rango, colX[2], y);
        doc.font('Helvetica-Bold').fillColor('#2980b9').text(`${p.dotacion} Pers.`, colX[3], y);
        
        // Estado con color
        doc.font('Helvetica');
        let colorEstado = '#27ae60'; // verde
        if(p.estado === 'sobre') colorEstado = '#c0392b'; // rojo
        if(p.estado === 'sub') colorEstado = '#d35400'; // naranja
        
        doc.fillColor(colorEstado).text(p.estado.toUpperCase(), colX[4], y);
        
        y += 20;
    });

    doc.moveDown(3);

    // --- 4. GRÁFICA DE DOTACIÓN (DIBUJO VECTORIAL) ---
    if (proyecciones.length > 1) {
        doc.addPage(); // Nueva página para el gráfico grande
        doc.fillColor('#000000').fontSize(14).font('Helvetica-Bold').text('Gráfica de Tendencia: Dotación Sugerida', { align: 'center' });
        doc.moveDown(2);

        const chartTop = 150;
        const chartLeft = 50;
        const chartHeight = 300;
        const chartWidth = 450;
        const chartBottom = chartTop + chartHeight;

        // Ejes
        doc.strokeColor('#000000').lineWidth(1)
           .moveTo(chartLeft, chartTop).lineTo(chartLeft, chartBottom) // Eje Y
           .lineTo(chartLeft + chartWidth, chartBottom) // Eje X
           .stroke();

        // Escalas
        const maxVal = Math.ceil(Math.max(...proyecciones.map(p => p.dotacion)) * 1.2); // +20% margen arriba
        const stepX = chartWidth / (proyecciones.length - 1);

        // Dibujar Eje Y (Etiquetas y líneas guía)
        doc.fontSize(9).fillColor('#666666');
        for (let i = 0; i <= 5; i++) {
            const val = Math.round((maxVal / 5) * i);
            const yPos = chartBottom - ((val / maxVal) * chartHeight);
            doc.text(val.toString(), chartLeft - 25, yPos - 5, { width: 20, align: 'right' });
            // Línea guía
            doc.strokeColor('#e0e0e0').lineWidth(0.5)
               .moveTo(chartLeft, yPos).lineTo(chartLeft + chartWidth, yPos).stroke();
        }

        // Dibujar Línea de Tendencia
        doc.strokeColor('#2980b9').lineWidth(3).lineCap('round').lineJoin('round');
        
        let prevX = 0, prevY = 0;
        proyecciones.forEach((p, i) => {
            const x = chartLeft + (i * stepX);
            const y = chartBottom - ((p.dotacion / maxVal) * chartHeight);
            
            if (i === 0) {
                doc.moveTo(x, y);
            } else {
                doc.lineTo(x, y);
            }
            
            // Guardar coordenadas para dibujar puntos después
            p._x = x; 
            p._y = y;
        });
        doc.stroke(); // Ejecutar trazo de línea

        // Dibujar Puntos y Etiquetas X
        proyecciones.forEach((p, i) => {
            // Punto
            doc.fillColor('#e74c3c').circle(p._x, p._y, 4).fill();
            
            // Etiqueta X (Mes)
            doc.fillColor('#000000').fontSize(8)
               .text(`${p.anio}-${p.mes}`, p._x - 15, chartBottom + 10, { width: 30, align: 'center' });
            
            // Etiqueta Valor sobre el punto
            doc.fillColor('#2980b9').fontSize(9).font('Helvetica-Bold')
               .text(p.dotacion.toString(), p._x - 10, p._y - 15, { width: 20, align: 'center' });
        });
    }

    // Pie de página
    doc.fillColor('#999999').fontSize(8)
       .text('Este documento fue generado automáticamente por el sistema de IA.', 50, 750, { align: 'center', width: 500 });

    doc.end();

  } catch(e) {
    console.error(e);
    res.status(500).send('Error generando PDF: ' + e.message);
  }
});

// Inicializador de auto-entrenamiento (exportado)
function initAutoRetrain(app) {
  const db = getDB(app);
  if (!db) return console.warn("[IA] initAutoRetrain: no db");
  startPollingForChanges(app).catch(e => console.warn("[IA] Polling start error:", e.message));
}

module.exports = router;
module.exports.entrenarModeloInterno = entrenarModeloInterno;
module.exports.initAutoRetrain = initAutoRetrain;