const connection = require('./db_conection.js'); 
const bcrypt = require('bcryptjs');
const jtw = require('jsonwebtoken');

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

      // Creación de una cookie
      const payload = {
        id: trabajador.id,
        rol: trabajador.rol,
        nombre: trabajador.nombre,
        apellido: trabajador.apellido
      };

      // Firma de la cookie
      const token = jtw.sign(payload, process.env.JWT_SECRET, {expiresIn: '1h'});

      // Envio cookie a HttpOnly
      res.cookie('token', token,{
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });

      // Envio de login exitoso
      res.status(200).json({message: 'Login Exitoso'});
    });
  });
};

module.exports = login;