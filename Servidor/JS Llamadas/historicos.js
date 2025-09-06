// Servidor/JS Llamadas/historicos.js
const connection = require('./db_conection.js'); // reutiliza tu conexión MySQL

function ejecutar(sql, params) {
  return new Promise((resolve, reject) => {
    connection.execute(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

// GET /historicos?tipo=operaciones|dotacion&desde=YYYY-MM-DD&hasta=YYYY-MM-DD&mes=1..12&anio=2024&page=1&limit=50
async function obtenerHistoricos(req, res) {
  try {
    const { tipo = 'operaciones', desde, hasta, mes, anio, page = 1, limit = 50 } = req.query;
    const limite = Math.max(1, Math.min(parseInt(limit, 10) || 50, 500));
    const pagina = Math.max(1, parseInt(page, 10) || 1);
    const offset = (pagina - 1) * limite;

    if (!['operaciones', 'dotacion'].includes(String(tipo).toLowerCase())) {
      return res.status(400).json({ message: 'Parámetro "tipo" inválido. Use operaciones o dotacion.' });
    }

    let sql = '';
    let params = [];
    if (tipo === 'operaciones') {
      sql = `SELECT id, fecha, cliente_id, tipo, monto, descripcion
             FROM OperacionHistorica
             WHERE 1=1`;
      if (desde) { sql += ' AND fecha >= ?'; params.push(desde); }
      if (hasta) { sql += ' AND fecha <= ?'; params.push(hasta); }
      sql += ' ORDER BY fecha DESC, id DESC LIMIT ? OFFSET ?';
      params.push(limite, offset);
    } else {
      sql = `SELECT id, mes, anio, area, cantidad, comentario
             FROM DotacionHistorica
             WHERE 1=1`;
      if (mes)  { sql += ' AND mes = ?';  params.push(parseInt(mes, 10)); }
      if (anio) { sql += ' AND anio = ?'; params.push(parseInt(anio, 10)); }
      sql += ' ORDER BY anio DESC, mes DESC, id DESC LIMIT ? OFFSET ?';
      params.push(limite, offset);
    }

    const filas = await ejecutar(sql, params);

    // total para paginación
    let sqlCount = (tipo === 'operaciones')
      ? 'SELECT COUNT(*) AS total FROM OperacionHistorica WHERE 1=1'
      : 'SELECT COUNT(*) AS total FROM DotacionHistorica WHERE 1=1';
    const paramsCount = [];
    if (tipo === 'operaciones') {
      if (desde) { sqlCount += ' AND fecha >= ?'; paramsCount.push(desde); }
      if (hasta) { sqlCount += ' AND fecha <= ?'; paramsCount.push(hasta); }
    } else {
      if (mes)  { sqlCount += ' AND mes = ?';  paramsCount.push(parseInt(mes, 10)); }
      if (anio) { sqlCount += ' AND anio = ?'; paramsCount.push(parseInt(anio, 10)); }
    }
    const [{ total }] = await ejecutar(sqlCount, paramsCount);

    return res.status(200).json({ message: 'OK', tipo, page: pagina, limit: limite, total, data: filas });
  } catch (err) {
    console.error('[CU14] Error obteniendo históricos:', err);
    return res.status(500).json({ message: 'Error al obtener datos históricos: ' + err.message });
  }
}
// === CU19: Actualizar registro histórico (operaciones o dotación) ===
async function actualizarHistorico(req, res) {
  try {
    const tipo = String(req.params.tipo || '').toLowerCase();
    const id = parseInt(req.params.id, 10);
    if (!['operaciones', 'dotacion'].includes(tipo)) {
      return res.status(400).json({ message: 'Tipo inválido. Use operaciones o dotacion.' });
    }
    if (!id) return res.status(400).json({ message: 'Id inválido.' });

    const body = req.body || {};
    let sql = '', params = [], allow = [];

    if (tipo === 'operaciones') {
      allow = ['fecha', 'cliente_id', 'tipo', 'monto', 'descripcion'];
      const sets = [];
      allow.forEach(k => {
        if (body[k] !== undefined) { sets.push(`${k} = ?`); params.push(body[k]); }
      });
      if (!sets.length) return res.status(400).json({ message: 'Nada que actualizar.' });
      sql = `UPDATE OperacionHistorica SET ${sets.join(', ')} WHERE id = ?`;
      params.push(id);
    } else {
      allow = ['mes', 'anio', 'area', 'cantidad', 'comentario'];
      const sets = [];
      allow.forEach(k => {
        if (body[k] !== undefined) { sets.push(`${k} = ?`); params.push(body[k]); }
      });
      if (!sets.length) return res.status(400).json({ message: 'Nada que actualizar.' });
      sql = `UPDATE DotacionHistorica SET ${sets.join(', ')} WHERE id = ?`;
      params.push(id);
    }

    const result = await new Promise((resolve, reject) => {
      connection.execute(sql, params, (err, r) => err ? reject(err) : resolve(r));
    });

    return res.status(200).json({ message: 'Registro histórico actualizado', affectedRows: result.affectedRows });
  } catch (err) {
    console.error('[CU19] Error actualizando histórico:', err);
    return res.status(500).json({ message: 'Error al actualizar: ' + err.message });
  }
}

module.exports = { obtenerHistoricos, actualizarHistorico };

