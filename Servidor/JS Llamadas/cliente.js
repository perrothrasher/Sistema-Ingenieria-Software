const connection = require('./db_conection.js'); 
const { registrarAuditoria } = require('./auditoria.js');
const PDFDocument = require('pdfkit');
const path = require('path');

// Ruta para registrar un cliente.
async function registrarCliente(req, res){
    const { nombre } = req.body;
    //const {id: userId} = req.usuario;
    
    let conn;
    if(!nombre){
        return res.status(400).json({message: 'El nombre del cliente es obligatorio'});
    }

    const sql = `
        INSERT INTO Cliente (nombre) VALUES (?);
    `;

    try{
        conn = await connection.getConnection();
        await conn.beginTransaction();

        // Establecer el ID del usuario actual para el trigger
        //await conn.execute('SET @current_user_id = ?', [userId]);

        const [results] = await conn.execute(
            sql, [nombre]
        );

        await conn.commit();
        res.status(201).json({ message: 'Cliente registrado con éxito', clienteId: results.insertId });
    }catch(err){
        if(conn) await conn.rollback();
        console.error('Error al registrar cliente:', err);
        return res.status(500).json({ message: 'Error al registrar el cliente', error: err.message });
    } finally{
        if(conn) conn.release();
    }
}

// Ruta para obtener todos los clientes.
async function obtenerClientes(req, res){
  const id = req.query.id;

  if(!id){
    const sqlList = `
    SELECT
          c.id AS id, p.nombre, p.apellido, p.rut, p.telefono, p.correo,
          u.direccion, u.ciudad, r.nombre AS region, u.postal
      FROM Cliente c
      JOIN Persona p ON c.persona_id = p.id
      JOIN Ubicacion u ON p.ubicacion_id = u.id
      JOIN Region r ON u.region_id = r.id; 
    `;

    try{
      const [results] = await connection.query(sqlList);

      if (results.length > 0){
        return res.status(200).json({ clientes: results });
      } else{
        return res.status(404).json({message: 'No se encontraron clientes'});
      }
    }catch(err){
      console.error('Error en la consulta SQL:', err);
      return res.status(500).json({ message: 'Error al obtener los clientes', error: err.message });
    }
  }

  const sqlActual = `
    SELECT
        c.id, p.nombre, p.apellido, p.rut, p.telefono, p.correo,
        u.direccion, u.ciudad, u.postal, u.region_id
    FROM Cliente c
    JOIN Persona p ON c.persona_id = p.id
    JOIN Ubicacion u ON p.ubicacion_id = u.id
    WHERE c.id = ?;
  `;

  const sqlAnterior = `
    (SELECT detalles_cambio FROM auditoria_clientes
     WHERE cliente_id = ? AND accion_id = 2 AND JSON_EXTRACT(detalles_cambio, '$.tabla_modificada') = 'Persona'
     ORDER BY fecha DESC LIMIT 1)
    UNION ALL
    (SELECT detalles_cambio FROM auditoria_clientes
     WHERE cliente_id = ? AND accion_id = 2 AND JSON_EXTRACT(detalles_cambio, '$.tabla_modificada') = 'Ubicacion'
     ORDER BY fecha DESC LIMIT 1);
  `;

  try {
    const [resultsActual] = await connection.query(sqlActual, [id]);
    const [resultsAnterior] = await connection.query(sqlAnterior, [id, id]);

    if (resultsActual.length === 0) {
      return res.status(404).json({ message: 'No se encontró el cliente' });
    }

    const clienteActual = resultsActual[0];
    let datosAnteriores = {}; 

    if (resultsAnterior.length > 0) {
      resultsAnterior.forEach(row => {
        Object.assign(datosAnteriores, row.detalles_cambio.valores_viejos);
      });
    } else {
      datosAnteriores = null;
    }
    return res.status(200).json({
      clienteActual: clienteActual,
      datosAnteriores: datosAnteriores
    });

  } catch(err) {
    console.error('Error en la consulta SQL:', err);
    return res.status(500).json({ message: 'Error al obtener el cliente', error: err.message });
  }
};

// Reestablecer cliente
async function reestablecerCliente(req, res){
  const { id: clienteId } = req.params;
  const { nombre, apellido, rut, region_id, direccion, ciudad, postal, telefono, correo } = req.body;
  const { id: userId} = req.usuario;
  
  const sql = `
    UPDATE Persona p
    JOIN Cliente c ON c.persona_id = p.id
    JOIN Ubicacion u ON u.id = p.ubicacion_id
    SET
      p.nombre = ?,
      p.apellido = ?,
      p.rut = ?,
      p.telefono = ?,
      p.correo = ?,
      u.direccion = ?,
      u.ciudad = ?,
      u.postal = ?,
      u.region_id = ?
    WHERE c.id = ?
  `;

  let conn;
  try{
    conn = await connection.getConnection();
    await conn.beginTransaction();
    await conn.execute('SET @current_user_id = ?', [userId]);
    await conn.execute('SET @accion_id_override = 4', []); 

    const [results] = await conn.execute(
      sql, [nombre, apellido, rut, telefono, correo, direccion, ciudad, postal, region_id, clienteId]
    );

    await conn.commit();
    res.status(200).json({ message: 'Cliente re-establecido exitosamente' });

  }catch(err){
    if (conn) await conn.rollback();
    console.error('Error al re-establecer el cliente:', err);
    return res.status(500).json({ message: 'Error al re-establecer el cliente', error: err.message });
  } finally{
    if (conn) conn.release();
  }
};


// Ruta para editar un cliente.
async function editarClientes(req, res){
  const { id: clienteId } = req.params;
  const { nombre, apellido, rut, region_id, direccion, ciudad, postal, telefono, correo } = req.body;
  const { id: userId} = req.usuario;

  const sql = `
    UPDATE Persona p
    JOIN Cliente c ON c.persona_id = p.id
    JOIN Ubicacion u ON u.id = p.ubicacion_id
    JOIN Region r ON u.region_id = r.id
    SET
      p.nombre = ?,
      p.apellido = ?,
      p.rut = ?,
      p.telefono = ?,
      p.correo = ?,
      u.direccion = ?,
      u.ciudad = ?,
      u.postal = ?,
      u.region_id = ?
    WHERE c.id = ?
  `;

  let conn;
  try{
    conn = await connection.getConnection();
    await conn.beginTransaction();
    await conn.execute('SET @current_user_id = ?', [userId]);
    const [results] = await conn.execute(
      sql, [nombre, apellido, rut, telefono, correo, direccion, ciudad, postal, region_id, clienteId]
    );

    await conn.commit();
    if (results.affectedRows > 0){
      res.status(200).json({ message: 'Cliente actualizado con éxito' });
    }else{
      res.status(404).json({ message: 'No se encontró el cliente con el ID proporcionado' });
    }
  }catch(err){
    if (conn) await conn.rollback();
    return res.status(500).json({ message: 'Error al actualizar el cliente', error: err.message });
  } finally{
    if (conn) conn.release();
  }
};


// Ruta para eliminar un cliente.
async function eliminarCliente(req, res){
  const { id: clienteId } = req.params;
  const { id: userId } = req.usuario;

  const sql = `
    DELETE c, p, u
    FROM Cliente c
    JOIN Persona p ON c.persona_id = p.id
    JOIN Ubicacion u ON p.ubicacion_id = u.id
    WHERE c.id = ?;
  `;

  let conn;
  try{
    conn = await connection.getConnection();
    await conn.beginTransaction();
    await conn.execute('SET @current_user_id = ?', [userId]);
    const [results] = await conn.execute(sql, [clienteId]);

    await conn.commit();
    res.status(200).json({ message: 'Cliente eliminado con éxito' });
  }catch(err){
    if (conn) await conn.rollback();
    return res.status(500).json({ message: 'Error al eliminar el cliente', error: err.message });
  } finally{
    if (conn) conn.release();
  }
};

async function generarReporteClientes(req, res){
  try{
    const [rows] = await connection.promise().query(`
            SELECT p.nombre, p.apellido, p.rut, p.correo, p.telefono, u.direccion
              FROM Cliente c JOIN Persona p ON c.persona_id = p.id
              JOIN Ubicacion u ON p.ubicacion_id = u.id
        `);
    const clientes = rows;

    // Crear un nuevo documento PDF
    const doc = new PDFDocument({ margin: 50 });

    // Configurar la respuesta del navegador para descargar el PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-clientes.pdf');

    doc.pipe(res);
    
    // Logo de la empresa
    const LogoPath = path.join(__dirname, '..', '..', 'Front', 'assets', 'totalcheck-logo.png');

    // Dibujar el logo
    doc.image(LogoPath, 50, 45, { width: 100 });

    // Información de la empresa
    doc.fontSize(10)
           .text(
                `Fanor Velasco 85, Piso 3\n` +
                `+56 2 2617 9200\n` +
                `contacto@totalcheck.cl`,
                { align: 'right' }
           );   
    doc.moveDown(4);

    // Contenido del PDF
    doc.fontSize(25).text('Reporte de Clientes', {align: 'center'});
    doc.moveDown(0.5);

    // Linea divisoria
    doc.strokeColor("#aaaaaa")
           .lineWidth(1)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke();
    doc.moveDown(2);

    // iterar sobre los clientes y agregarlos al PDF
    clientes.forEach((cliente, index) =>{
      doc.fontSize(14).text(`${index + 1}. ${cliente.nombre} ${cliente.apellido}`, { underline: true });
      doc.fontSize(10).text(`RUT: ${cliente.rut}`);
      doc.fontSize(10).text(`Correo: ${cliente.correo}`);
      doc.fontSize(10).text(`Teléfono: ${cliente.telefono}`);
      doc.fontSize(10).text(`Dirección: ${cliente.direccion}`);
      doc.moveDown();
    });
    // --- finalización del contenido del PDF ---
    doc.end();

    // registrar evento en la auditoría
    const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
    const ip = req.ip || req.connection.remoteAddress;
    registrarAuditoria(
      userId, `${userNombre} ${userApellido}`, 'Reporte de Clientes Generado', ip, rol
    );

  }catch(error){
    console.error('Error al generar el reporte PDF:', error);
    res.status(500).json({ message: 'Error al generar el reporte PDF' });
  }
};

// exportar las funciones correctamente
module.exports = {
  registrarCliente,
  obtenerClientes,
  editarClientes,
  eliminarCliente,
  generarReporteClientes,
  reestablecerCliente
};