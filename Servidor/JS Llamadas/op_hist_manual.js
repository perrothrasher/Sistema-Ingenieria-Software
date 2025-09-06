// Servidor/JS Llamadas/op_hist_manual.js
const connection = require('./db_conection.js');

function ejecutar(sql, params) {
  return new Promise((resolve, reject) => {
    connection.execute(sql, params, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

/**
 * CU14: Registrar operación histórica (ingreso manual)
 * Espera JSON: { fecha: 'YYYY-MM-DD', cliente_id?, tipo?, monto?, descripcion? }
 */
async function registrarOperacionHistorica(req, res) {
  try {
    const { fecha, cliente_id = null, tipo = null, monto = null, descripcion = null } = req.body || {};
    if (!fecha) return res.status(400).json({ message: 'El campo "fecha" es requerido.' });

    const sql = `
      INSERT INTO OperacionHistorica (fecha, cliente_id, tipo, monto, descripcion)
      VALUES (?, ?, ?, ?, ?)
    `;
    await ejecutar(sql, [fecha, cliente_id, tipo, monto, descripcion]);

    return res.status(201).json({ message: 'Operación histórica registrada con éxito.' });
  } catch (err) {
    console.error('[CU14] Error registrando operación histórica:', err);
    return res.status(500).json({ message: 'Error al registrar la operación histórica: ' + err.message });
  }
}

module.exports = { registrarOperacionHistorica };
