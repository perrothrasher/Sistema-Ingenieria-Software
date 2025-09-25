const connection = require('./db_conection.js'); 
const bcrypt = require('bcryptjs');
// Ruta de login.
function login(req, res){
  const { correo, contrasena } = req.body;
  // Verificar si el correo existe en la base de datos
  connection.query(`SELECT 
                      t.id, 
                      t.usuario, 
                      t.contrasena, 
                      p.nombre, 
                      p.apellido, 
                      p.rut, 
                      p.telefono, 
                      p.correo, 
                      r.nombre AS rol,
                      r.id AS rol_id
                    FROM Trabajador t
                    JOIN Persona p ON t.persona_id = p.id
                    JOIN Rol r ON t.rol_id = r.id
                    WHERE p.correo = ?`, [correo], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Error al verificar el correo' });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: 'Correo no encontrado' });
    }

    const trabajador = results[0];

// Comparar la contraseña ingresada con la almacenada en la base de datos
    bcrypt.compare(contrasena, trabajador.contrasena, (err, isMatch) => {
      if (err) {
        return res.status(500).json({ message: 'Error al verificar la contraseña' });
      }

      if (!isMatch) {
        return res.status(401).json({ message: 'Contraseña incorrecta' });
      }

      // Si las credenciales son correctas, devolver la respuesta con los datos del trabajador
      res.status(200).json({
        message: 'Login exitoso',
        trabajador: {
          id: trabajador.id,
          usuario: trabajador.usuario,
          nombre: trabajador.nombre,
          apellido: trabajador.apellido,
          correo: trabajador.correo,
          rol: trabajador.rol
        }
      });
    });
  });
};

module.exports = login;