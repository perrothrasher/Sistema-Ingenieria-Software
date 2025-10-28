const bcrypt = require('bcryptjs');
const connection = require('./db_conection.js'); 
const { registrarAuditoria } = require('./auditoria.js');

async function registrarTrabajador(req, res) {
  const { nombre, apellido, rut, direccion, comuna,  correo, telefono, contrasena, rol, region_id, codigo_postal, usuario, tipo_contrato_id } = req.body;
  const {id: userId} = req.usuario;

  let conn;
  try {
    conn = await connection.getConnection();
    await conn.beginTransaction();

    // ESTABLECER EL ID DEL USUARIO QUE LANZA EL TRIGGER
    await conn.execute('SET @current_user_id = ?', [userId]);

    // Cifrar la contraseña.
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Paso 1: Insertar la nueva ubicación
    const sqlUbicacion = `
      INSERT INTO Ubicacion (direccion, ciudad, region_id, postal)
      VALUES (?, ?, ?, ?);
    `;
    const [resultUbicacion] = await conn.execute(sqlUbicacion, [direccion, comuna, region_id, codigo_postal]);
    const ubicacion_id = resultUbicacion.insertId;

    // Paso 2: Insertar la nueva persona
    const sqlPersona = `
      INSERT INTO Persona (nombre, apellido, rut, telefono, correo, ubicacion_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const [resultPersona] = await conn.execute(
      sqlPersona, [nombre, apellido, rut, telefono, correo, ubicacion_id]
    );
    const persona_id = resultPersona.insertId;
      
    // Roles 
    const roles = {
    '1': 1, // Soporte TI
    '2': 2, // Gerente
    '3': 3 // Supervisor
    };
      
    const rol_id = roles[rol];

    if (!rol_id) {
      await conn.rollback();
      return res.status(400).json({ message: 'Rol inválido proporcionado.' });
    }

    // Paso 4: Insertar el trabajador
    const sqlTrabajador = `
      INSERT INTO Trabajador (usuario, contrasena, persona_id, rol_id, tipo_contrato_id)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [resultTrabajador] = await conn.execute(
      sqlTrabajador, [usuario, hashedPassword, persona_id, rol_id, tipo_contrato_id]
    );

    await conn.commit();

    res.status(201).json({
      message: 'Trabajador registrado con éxito',
      trabajadorId: resultTrabajador.insertId
    });

} catch (error) {
    if (conn){
      await conn.rollback();
    }
    console.error('Error al registrar trabajador:', error);
    return res.status(500).json({ message: 'Error al registrar trabajador: ' + error.message });
} finally{
    if (conn){
      conn.release();
    }
}
};

module.exports = registrarTrabajador;