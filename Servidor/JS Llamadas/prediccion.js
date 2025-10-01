// JS Llamadas/prediccion.js
const { Router } = require('express');
const fs = require('fs-extra');
const path = require('path');
const ExcelJS = require('exceljs');

const router = Router();

// Carpeta con tus Excels
const CARPETA_EXCELS = path.join(__dirname, '..', 'ML', 'Excels');
// Colección donde se guarda el RESUMEN mensual
const COLECCION_MESES = 'venta_ingreso_usuario_resumen';

// Meses español -> número
const mapaMes = {
  'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,
  'julio':7,'agosto':8,'septiembre':9,'setiembre':9,'octubre':10,
  'noviembre':11,'diciembre':12
};

// Detecta mes y año en nombres tipo "Enero 2025 Ventas e Ingreso por Usuario.xlsx"
function extraerMesAnioDesdeNombre(nombre) {
  const base = nombre.toLowerCase().replaceAll('_',' ');
  const partes = base.split(/\s+/);
  let mes=null, anio=null;
  for (let i=0;i<partes.length;i++){
    const limpio = partes[i].normalize('NFD').replace(/\p{Diacritic}/gu,'');
    if (mapaMes[limpio] && !mes) mes = mapaMes[limpio];
    if (/^\d{4}$/.test(partes[i]) && !anio) anio = parseInt(partes[i],10);
  }
  return (mes && anio) ? { mes, anio } : null;
}

// Lee hoja 0 y saca un resumen robusto (sin depender de nombres de columnas)
async function resumirExcel(rutaArchivo){
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(rutaArchivo);
  const hoja = libro.worksheets[0];
  if (!hoja) return { filas_utiles:0, suma_numeros:0 };

  let filas_utiles=0, suma_numeros=0;

  hoja.eachRow((fila, n) => {
    if (n===1) return; // saltar cabecera
    const hayDato = fila.values?.some(v => v!==null && v!==undefined && v!=='');
    if (!hayDato) return;

    filas_utiles++;
    fila.eachCell((celda) => {
      const val = celda.value;
      if (typeof val === 'number') { suma_numeros += val; return; }
      if (val && typeof val === 'object'){
        if (typeof val.result === 'number') suma_numeros += val.result;
        else if (typeof val.value === 'number') suma_numeros += val.value;
        else if (typeof val.text === 'string'){
          const n = Number(val.text.replace(/[^\d.\-]/g,''));
          if (!Number.isNaN(n)) suma_numeros += n;
        }
        return;
      }
      if (typeof val === 'string'){
        const n = Number(val.replace(/[^\d.\-]/g,''));
        if (!Number.isNaN(n)) suma_numeros += n;
      }
    });
  });

  return { filas_utiles, suma_numeros };
}

// Regla simple de proyección (promedio móvil + tendencia)
function proyectarSiguienteMes(ordenAsc){
  if (!ordenAsc.length) return { ok:false, error:'Sin datos entrenados' };

  const ultimo = ordenAsc[ordenAsc.length-1];
  let anioSig = ultimo.anio, mesSig = ultimo.mes + 1;
  if (mesSig>12){ mesSig=1; anioSig++; }

  const ult3 = ordenAsc.slice(-3);
  const prom3 = ult3.length
    ? (ult3.reduce((a,m)=>a+(m.produccion_total||0),0)/ult3.length)
    : (ultimo.produccion_total||0);

  const capacidad_optima = prom3 * 0.85;

  let delta=0;
  for(let i=1;i<ult3.length;i++){
    delta += (ult3[i].produccion_total - ult3[i-1].produccion_total);
  }
  const deltaProm = ult3.length>1 ? delta/(ult3.length-1) : 0;

  const produccion_siguiente = Math.max(0, Math.round((ultimo.produccion_total||0) + deltaProm));

  const productividad_promedio = 100; // AJUSTAR si tienes métrica real
  const trabajadores_necesarios = Math.max(1, Math.ceil(produccion_siguiente/productividad_promedio));
  const trabajadores_reales = ultimo.trabajadores_reales
    || Math.max(1, Math.round((ultimo.produccion_total||0)/productividad_promedio));

  let estado_regla='ok';
  if (trabajadores_reales > trabajadores_necesarios*1.1) estado_regla='sobre';
  else if (trabajadores_reales < trabajadores_necesarios*0.9) estado_regla='sub';

  return {
    ok:true,
    mes_base:{
      anio: ultimo.anio,
      mes:  ultimo.mes,
      capacidad_optima: capacidad_optima
    },
    mes_siguiente:{
      anio: anioSig,
      mes:  mesSig,
      produccion_total: produccion_siguiente,
      trabajadores_reales,
      trabajadores_necesarios,
      estado_regla
    }
  };
}

// =========== ENDPOINTS ===========

// POST /prediccion/entrenar  -> lee Excels y guarda resumen mensual en Mongo
router.post('/entrenar', async (req, res) => {
  try{
    await req.app.locals.mongoReady;
    const db = req.app.locals.getDB();
    const col = db.collection(COLECCION_MESES);

    await fs.ensureDir(CARPETA_EXCELS);
    const archivos = (await fs.readdir(CARPETA_EXCELS))
      .filter(f => f.toLowerCase().endsWith('.xlsx'));

    if (!archivos.length){
      return res.status(400).json({ ok:false, error:'No hay .xlsx en ML/Excels' });
    }

    for (const nombre of archivos){
      const info = extraerMesAnioDesdeNombre(nombre);
      if (!info){
        console.warn(`[Entrenar] No pude extraer mes/año desde: ${nombre}`);
        continue;
      }
      const ruta = path.join(CARPETA_EXCELS, nombre);
      const { filas_utiles, suma_numeros } = await resumirExcel(ruta);
      const produccion_total = (suma_numeros>0 ? suma_numeros : filas_utiles);

      const doc = {
        anio: info.anio,
        mes:  info.mes,
        archivo: nombre,
        filas_utiles,
        produccion_total,
        updatedAt: new Date()
      };

      await col.updateOne(
        { anio: info.anio, mes: info.mes },
        { $set: doc },
        { upsert: true }
      );
    }

    res.json({ ok:true, mensaje:'Entrenamiento completado' });
  } catch(e){
    console.error('[Entrenar] ', e);
    res.status(500).json({ ok:false, error:e.message });
  }
});

// GET /prediccion/proyectar?anio=&mes=
router.get('/proyectar', async (req, res) => {
  try{
    await req.app.locals.mongoReady;
    const db = req.app.locals.getDB();
    const col = db.collection(COLECCION_MESES);

    const meses = await col.find({}).toArray();
    if (!meses.length) return res.status(400).json({ ok:false, error:'Ejecuta /prediccion/entrenar primero' });

    meses.sort((a,b) => (a.anio-b.anio) || (a.mes-b.mes));

    const { anio, mes } = req.query;
    let hasta = meses;
    if (anio && mes){
      const idx = meses.findIndex(m => m.anio==Number(anio) && m.mes==Number(mes));
      if (idx===-1) return res.status(404).json({ ok:false, error:'Mes base no encontrado' });
      hasta = meses.slice(0, idx+1);
    }

    const resp = proyectarSiguienteMes(hasta);
    if (!resp.ok) return res.status(400).json(resp);
    resp.mes_base.capacidad_optima = Number(resp.mes_base.capacidad_optima||0);
    res.json(resp);
  } catch(e){
    console.error('[Proyectar] ', e);
    res.status(500).json({ ok:false, error:e.message });
  }
});

module.exports = router;
