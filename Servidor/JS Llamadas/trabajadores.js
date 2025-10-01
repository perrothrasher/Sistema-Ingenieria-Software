const connection = require('./db_conection.js'); 
const bcrypt = require('bcryptjs');
const { registrarAuditoria } = require('./auditoria.js');

// Ruta para obtener todos los trabajadores.
function obtenerTrabajadores(req, res){
    const id = req.query.id;
    const sql = `
        SELECT t.id, t.usuario, t.contrasena, p.nombre, p.apellido, p.rut, p.telefono, p.correo, r.nombre AS rol,
        u.direccion, u.ciudad, u.region_id AS region_id, g.nombre AS Region, u.postal, r.id AS rol_id
        FROM Trabajador t
        JOIN Persona p ON t.persona_id = p.id
        JOIN Rol r ON t.rol_id = r.id
        JOIN Ubicacion u ON p.ubicacion_id = u.id
        JOIN Region g ON u.region_id = g.id;
    `;

    connection.query(sql, [id], (err, results) => {
        if (err){
            console.error('Error en la consulta SQL:', err);  // Imprime el error en la consola
            return res.status(500).json({ message: 'Error al obtener los trabajadores' });
        }
        if (results.length > 0){
            res.status(200).json({ trabajadores: results });
        } else {
            res.status(404).json({ message: 'Trabajador no encontrado' });
        }
        //console.log('Trabajadores obtenidos:', results);
    });
};

// Ruta para editar un trabajador
function editarTrabajadores(req, res){
    const { id } = req.params; 
    const { nombre, apellido, contrasena, rut, direccion, ciudad,  correo, telefono, rol_id, region_id, postal } = req.body;

    console.log('Datos recibidos para actualizar trabajador:', req.body);

    // Si la contraseña se ha proporcionado, encriptarla antes de actualizarla
    let hashedPassword = null;
    if (contrasena) {
        hashedPassword = bcrypt.hashSync(contrasena, 10);  // Encriptar la contraseña
    }
    const sql = `
        UPDATE Persona p
        JOIN Trabajador t ON t.persona_id = p.id
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
            u.region_id = ?,
            t.rol_id = ?,
            ${contrasena ? "t.contrasena = ?" : ""}
        WHERE t.id = ?
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
            rol_id, 
            ...(contrasena ? [hashedPassword] : []),
            id
        ], 
        (err, result) => {
            if (err) {
                console.error('Error al actualizar el trabajador:', err);
                return res.status(500).json({ message: 'Error al actualizar el trabajador' });
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ message: 'Trabajador no encontrado' });
            }

            // Registrar evento en la auditoría
            const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
            const ip = req.ip || req.connection.remoteAddress;
            registrarAuditoria(
              userId, `${userNombre} ${userApellido}`, 'Trabajador Editado', ip, rol,
              {trabajadorIdEditado: req.params.id} // Datos adicionales del evento
            );

            res.status(200).json({ message: 'Trabajador actualizado con éxito' });
        }
    );
};

// Ruta para eliminar un trabajador
function eliminarTrabajadores(req, res){
    const { id } = req.params;

    const sql = `
        DELETE t, p, u
        FROM Trabajador t
        JOIN Persona p ON t.persona_id = p.id
        JOIN Ubicacion U ON p.ubicacion_id = u.id
        WHERE t.id = ?;
    `;

    connection.execute(sql, [id], (err, results) => {
        if (err){
            return res.status(500).json({ message: 'Error al eliminar el trabajador' });
        }
        // Registrar evento en la auditoría
        const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
        const ip = req.ip || req.connection.remoteAddress;
        registrarAuditoria(
          userId, `${userNombre} ${userApellido}`, 'Trabajador Eliminado', ip, rol,
          {trabajadorIdEliminado: id} // Datos adicionales del evento
        );
        res.status(200).json({ message: 'Trabajador eliminado exitosamente' });
    });
};

function listarTrabajadores(req, res){
    const sql = `
        SELECT t.id, p.nombre, p.apellido, r.nombre AS rol
        FROM Trabajador t
        JOIN Persona p ON t.persona_id = p.id
        JOIN Rol r ON t.rol_id = r.id
        ORDER BY p.nombre ASC
    `;
    connection.query(sql, (err, results) => {
        if (err) {
            console.error("Error al listar nombres de usuarios:", err);
            return res.status(500).json({ message: "Error interno del servidor." });
        }
        res.status(200).json(results);
    });
};

module.exports = {
    obtenerTrabajadores,
    editarTrabajadores,
    eliminarTrabajadores,
    listarTrabajadores
};