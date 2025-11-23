const connection = require('./db_conection.js'); 
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { registrarAuditoria } = require('./auditoria.js');

// Ruta de login.
async function login(req, res){
  const { correo, contrasena } = req.body;

  try{
    const [results] = await connection.query(`
      SELECT 
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
      WHERE p.correo = ?`, [correo]);
    
      if (results.length === 0) {
      return res.status(404).json({ message: 'Correo no encontrado' });
    }

    const trabajador = results[0];
    const isMatch = await bcrypt.compare(contrasena, trabajador.contrasena);

    if (!isMatch) {
      return res.status(401).json({ message: 'Contraseña incorrecta' });
    }

    const payload = {
      id: trabajador.id,
      rol: trabajador.rol,
      nombre: trabajador.nombre,
      apellido: trabajador.apellido
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {expiresIn: '10h'});

    const ip = req.ip || req.connection.remoteAddress;
    registrarAuditoria(
      trabajador.id,
      `${trabajador.nombre} ${trabajador.apellido}`,
      'Inicio de Sesión', 
      ip,
      trabajador.rol
    );

    res.cookie('token', token,{
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.status(200).json({message: 'Login Exitoso'});
  }catch(err){
    console.error('Error en el proceso de login:', err);
    res.status(500).json({ message: 'Error interno del servidor', error: err.message });
  }
};

module.exports = login;