const bcrypt = require('bcryptjs');
const connection = require('./db_conection.js'); 

async function registrarTrabajador(req, res) {
  const { nombre, apellido, rut, direccion, comuna,  correo, telefono, contrasena, rol, region_id, codigo_postal, usuario } = req.body;
  try {
    // Cifrar la contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);
    console.log("Contraseña cifrada:", hashedPassword);

    // Paso 1: Insertar la nueva ubicación
    const sqlUbicacion = `
      INSERT INTO Ubicacion (direccion, ciudad, region_id, postal)
      VALUES (?, ?, ?, ?);
    `;
    connection.execute(sqlUbicacion, [direccion, comuna, region_id, codigo_postal], (err, result) => {
    if (err) {
      console.error('Error al insertar:', err);
      connection.end();
      return;
    }
    // Obtener el insertId de la inserción
    const ubicacion_id = result.insertId;
    console.log('El ID de la ubicacion es:', ubicacion_id);

    // Paso 2: Insertar la nueva persona
    const sqlPersona = `
      INSERT INTO Persona (nombre, apellido, rut, telefono, correo, ubicacion_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    connection.execute(sqlPersona, [nombre, apellido, rut, telefono, correo, ubicacion_id], async (err, resultPersona) => {
      if (err){
        console.error('Error al insertar persona:', err);
        return res.status(500).json({ message: 'Error al registrar trabajador: ' + err.message });
      }
      // Obtener el ID de la persona insertada
      console.log('Persona insertada con ID:', resultPersona.insertId);

      // Roles 
      const roles = {
      '1': 1, // Soporte TI
      '2': 2, // Gerente
      '3': 3 // Supervisor
      };
      
      const rol_id = roles[rol];
      console.log("Rol ID obtenido:", rol_id);

      if (!rol_id) {
      return res.status(400).json({ message: 'Rol no válido' });
      }

      // Paso 4: Insertar el trabajador
      const sqlTrabajador = `
        INSERT INTO Trabajador (usuario, contrasena, persona_id, rol_id)
        VALUES (?, ?, ?, ?)
      `;
      connection.execute(sqlTrabajador, [usuario, hashedPassword, resultPersona.insertId, rol_id], (err, resultTrabajador) => {
        if (err) {
          console.error('Error al insertar trabajador:', err);
          return res.status(500).json({ message: 'Error al registrar trabajador: ' + err.message });
        }
        console.log('Trabajador insertado con ID:', resultTrabajador.insertId);
      });
      res.status(201).json({ message: 'Trabajador registrado exitosamente' });
    });
  });
} catch (error) {
    console.error('Error al registrar trabajador:', error);
    res.status(500).json({ message: 'Error al registrar trabajador: ' + error.message });
  }
};

module.exports = registrarTrabajador;