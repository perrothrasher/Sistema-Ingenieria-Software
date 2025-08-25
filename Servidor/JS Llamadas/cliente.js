const connection = require('./db_conection.js'); 

// Ruta para registrar un cliente.
function registrarCliente(req, res){
  const { nombre, apellido, rut,  direccion, comuna, correo, telefono, region_id, codigo_postal} = req.body;
  try{
    // Insertar la nueva ubicacion.
    const sqlUbicacion = `
      INSERT INTO Ubicacion (direccion, ciudad, region_id, postal)
      VALUES (?, ?, ?, ?);
    `;
    connection.execute(sqlUbicacion, [direccion, comuna, region_id, codigo_postal], (err, result)=>{
      if (err){
        console.error('Error al insertar ubicación:', err);
        connection.end();
        return;
      }

      // Obtener el insertId de la inserción.
      const ubicacion_id = result.insertId;
      console.log('El ID de la ubicación es:', ubicacion_id);

      // Insertar la nueva persona.
      const sqlPersona = `
      INSERT INTO Persona (nombre, apellido, rut, telefono, correo, ubicacion_id)
      VALUES (?, ?, ?, ?, ?, ?)
      `;
      connection.execute(sqlPersona, [nombre, apellido, rut, telefono, correo, ubicacion_id], async (err, resultPersona)=>{
        if (err){
          console.error('Error al insertar persona:', err);
          return res.status(500).json({ message: 'Error al registrar cliente: ' + err.message });
        }

        // Obtener el ID de la persona insertada.
        console.log('Persona insertada con ID:', resultPersona.insertId);

        // Insertar el cliente.
        const sqlCliente = `
          INSERT INTO Cliente (persona_id)
          VALUES (?)
        `;
        connection.execute(sqlCliente, [resultPersona.insertId], (err, resultCliente)=>{
          if(err){
            console.error('Error al insertar cliente:', err);
            return res.status(500).json({ message: 'Error al registrar cliente: ' + err.message });
          }
          console.log('Cliente insertado con ID:', resultCliente.insertId);
        });
        res.status(201).json({ message: 'Cliente registrado exitosamente' });
      });
    });
  } catch(error){
      console.error('Error al registrar cliente:', error);
      return res.status(500).json({ message: 'Error al registrar cliente: ' + error.message });
  }
};

// Ruta para obtener todos los clientes.
function obtenerClientes(req, res){
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

  connection.query(sql, [id], (err, results) => {
    if (err) {
      console.error('Error en la consulta SQL:', err);  // Imprime el error en la consola
      return res.status(500).json({ message: 'Error al obtener los clientes' });
    }
    if (results.length > 0) {
      res.status(200).json({ clientes: results });
    } else {
      res.status(404).json({ message: 'Cliente no encontrado' });
    }
    //console.log('Clientes obtenidos:', results); Aqui se imprimen los resultados en la consola del servidor
  });
};


// Ruta para editar un cliente.
function editarClientes(req, res){
  const { id } = req.params;
  const { nombre, apellido, rut, region_id, direccion, ciudad, postal, telefono, correo } = req.body;

  //console.log('Datos recibidos para actualizar cliente:', req.body); Aqui se imprimen los datos recibidos en la consola del servidor
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
  connection.execute(
    sql,
    [
      nombre,
      apellido,
      rut,
      telefono,
      correo,
      direccion,
      ciudad,
      postal,
      region_id,
      id
    ],
    (err, result) => {
      if (err) {
        console.error('Error al actualizar cliente:', err);
        return res.status(500).json({ message: 'Error al actualizar el cliente' });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: 'Cliente no encontrado' });
      }

      res.status(200).json({ message: 'Cliente actualizado con éxito' });
    }
  );
};


// Ruta para eliminar un cliente.
function eliminarCliente(req, res){
  const { id } = req.params;

  const sql = `
    DELETE c, p, u
    FROM Cliente c
    JOIN Persona p ON c.persona_id = p.id
    JOIN Ubicacion u ON p.ubicacion_id = u.id
    WHERE c.id = ?;
  `;

  connection.execute(sql, [id], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Error al eliminar el cliente' });
    }
    res.status(200).json({ message: 'Cliente eliminado exitosamente' });
  });
};

// Exportar las funciones correctamente.
module.exports = {
  registrarCliente,
  obtenerClientes,
  editarClientes,
  eliminarCliente
};