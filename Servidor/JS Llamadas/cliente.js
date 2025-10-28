const connection = require('./db_conection.js'); 
const { registrarAuditoria } = require('./auditoria.js');
const PDFDocument = require('pdfkit');
const path = require('path');

// Ruta para registrar un cliente.
async function registrarCliente(req, res){
  const { nombre, apellido, rut,  direccion, comuna, correo, telefono, region_id, codigo_postal} = req.body;
  const {id: userId} = req.usuario;

  let conn;
  try{
    conn = await connection.getConnection();
    await conn.beginTransaction();

    // ESTABLECER EL ID DEL USUARIO QUE LANZA EL TRIGGER
    await conn.execute('SET @current_user_id = ?', [userId]);

    // Insertar la nueva ubicacion.
    const sqlUbicacion = `
      INSERT INTO Ubicacion (direccion, ciudad, region_id, postal)
      VALUES (?, ?, ?, ?);
    `;
    const [resultUbicacion] = await conn.execute(
      sqlUbicacion, [direccion, comuna, region_id, codigo_postal]
    );
    const ubicacion_id = resultUbicacion.insertId;

    // Insertar la nueva persona.
    const sqlPersona = `
    INSERT INTO Persona (nombre, apellido, rut, telefono, correo, ubicacion_id)
    VALUES (?, ?, ?, ?, ?, ?)
    `;

    const [resultPersona] = await conn.execute(
      sqlPersona, [nombre, apellido, rut, telefono, correo, ubicacion_id]
    );
    const persona_id = resultPersona.insertId;

    // Insertar el cliente.
    const sqlCliente = `
      INSERT INTO Cliente (persona_id)
      VALUES (?)
    `;

    const [resultCliente] = await conn.execute(
      sqlCliente, [persona_id]
    );

    await conn.commit();

    res.status(201).json({
      message: 'Cliente registrado con éxito',
      clienteId: resultCliente.insertId
    });

  } catch(error){
      console.error('Error al registrar cliente:', error);
      return res.status(500).json({ message: 'Error al registrar cliente: ' + error.message });
  } finally{
    if(conn){
      conn.release();
    }
  }
};

// Ruta para obtener todos los clientes.
async function obtenerClientes(req, res){
  const id = req.query.id;
  const sql = `
    SELECT
        c.id AS id,
        p.id AS persona_id,
        p.nombre,
        p.apellido,
        p.rut,
        p.telefono,
        p.correo,
        u.direccion,
        u.ciudad,
        r.id AS region_id,
        r.nombre AS region,
        u.postal
    FROM Cliente c
    JOIN Persona p ON c.persona_id = p.id
    JOIN Ubicacion u ON p.ubicacion_id = u.id
    JOIN Region r ON u.region_id = r.id;  
  `;

  try{
    const [results] = await connection.query(sql);

    if (results.length > 0){
      return res.status(200).json({ clientes: results });
    } else{
      return res.status(404).json({message: 'No se encontraron clientes'});
    }
  }catch(err){
    console.error('Error en la consulta SQL:', err);
    return res.status(500).json({ message: 'Error al obtener los clientes', error: err.message });
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
    console.log('Resultados de la actualización del cliente:', results);

    await conn.commit();
    if (results.affectedRows > 0){
      console.log('Cliente actualizado con éxito', results);
      res.status(200).json({ message: 'Cliente actualizado con éxito' });
    }else{
      console.log('No se encontró el cliente con el ID proporcionado');
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
  generarReporteClientes
};