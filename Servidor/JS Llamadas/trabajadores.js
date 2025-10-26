const connection = require('./db_conection.js'); 
const bcrypt = require('bcryptjs');
const { registrarAuditoria } = require('./auditoria.js');
const PDFDocument = require('pdfkit');
const path = require('path');

// Ruta para obtener todos los trabajadores.
async function obtenerTrabajadores(req, res){
    const id = req.query.id;
    const sql = `
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
            u.direccion, 
            u.ciudad, 
            u.region_id AS region_id, 
            g.nombre AS Region, 
            u.postal, 
            r.id AS rol_id, 
            c.id AS tipo_contrato_id,
            c.nombre AS tipo_contrato_nombre 
        FROM 
            Trabajador t
        JOIN 
            Persona p ON t.persona_id = p.id
        JOIN 
            Rol r ON t.rol_id = r.id
        LEFT JOIN 
            TipoContrato c ON t.tipo_contrato_id = c.id 
        JOIN 
            Ubicacion u ON p.ubicacion_id = u.id
        JOIN 
            Region g ON u.region_id = g.id;
    `;

    try{
        const [results] = await connection.query(sql);

        if(results.length > 0){
            return res.status(200).json({ trabajadores: results});
        }else{
            return res.status(404).json({message: 'No se encontraron trabajadores' });
        }
    }catch(err){
        console.error('Error en la consulta SQL:', err);
        return res.status(500).json({ message: 'Error al obtener los trabajadores', error: err.message });
    }
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

async function listarTrabajadores(req, res){
    const sql = `
        SELECT t.id, p.nombre, p.apellido, r.nombre AS rol
        FROM Trabajador t
        JOIN Persona p ON t.persona_id = p.id
        JOIN Rol r ON t.rol_id = r.id
        ORDER BY p.nombre ASC
    `;
    try {
        const [usuarios] = await connection.query(sql);
        res.status(200).json(usuarios);
    } catch (err) {
        // ESTO es lo que está causando el error 500
        console.error("Error al obtener lista de usuarios:", err); 
        res.status(500).json({ message: "Error interno al consultar la base de datos", error: err.message });
    }
};

function actualizarTipoContrato(req, res) {
    const { id } = req.params;
    const { tipo_contrato_id } = req.body;

    if (!tipo_contrato_id) {
        return res.status(400).json({ message: 'El ID del tipo de contrato es requerido.' });
    }

    const sql = 'UPDATE Trabajador SET tipo_contrato_id = ? WHERE id = ?';

    connection.execute(sql, [tipo_contrato_id, id], (err, result) => {
        if (err) {
            console.error('Error al actualizar el tipo de contrato:', err);
            return res.status(500).json({ message: 'Error interno al actualizar el contrato.' });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Trabajador no encontrado.' });
        }

        // Opcional: Registrar en auditoría
        const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
        const ip = req.ip || req.connection.remoteAddress;
        registrarAuditoria(
          userId, `${userNombre} ${userApellido}`, 'Tipo de Contrato Actualizado', ip, rol,
          { trabajadorId: id, nuevoContratoId: tipo_contrato_id }
        );

        res.status(200).json({ message: 'Tipo de contrato actualizado con éxito.' });
    });
}

async function generarReporteTrabajadores(req,res){
    try{
    const [rows] = await connection.promise().query(`
            SELECT t.id, p.nombre, p.apellido, p.rut, p.telefono, p.correo, r.nombre AS rol,
                u.direccion, u.ciudad
                FROM Trabajador t
                JOIN Persona p ON t.persona_id = p.id
                JOIN Rol r ON t.rol_id = r.id
                JOIN Ubicacion u ON p.ubicacion_id = u.id
        `);
    const trabajadores = rows;

    // Crear un nuevo documento PDF
    const doc = new PDFDocument({ margin: 50 });

    // Configurar la respuesta del navegador para descargar el PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-trabajadores.pdf');
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
    doc.fontSize(25).text('Reporte de Trabajadores Contratados', {align: 'center'});
    doc.moveDown(0.5);

    // Linea divisoria
    doc.strokeColor("#aaaaaa")
           .lineWidth(1)
           .moveTo(50, doc.y)
           .lineTo(550, doc.y)
           .stroke();
    doc.moveDown();

    // Iterar sobre los trabajadores y agregarlos al PDF
    trabajadores.forEach((trabajador, index) =>{
      doc.fontSize(14).text(`${index + 1}. ${trabajador.nombre} ${trabajador.apellido}`, { underline: true });
      doc.fontSize(10).text(`RUT: ${trabajador.rut}`);
      doc.fontSize(10).text(`Rol: ${trabajador.rol}`);
      doc.fontSize(10).text(`Correo: ${trabajador.correo}`);
      doc.fontSize(10).text(`Teléfono: ${trabajador.telefono}`);
      doc.fontSize(10).text(`Dirección: ${trabajador.direccion}`);
      doc.fontSize(10).text(`Ciudad: ${trabajador.ciudad}`);
      doc.moveDown();
    });
    // --- Finalización del contenido del PDF ---
    doc.end();

    // Registrar evento en la auditoría
    const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
    const ip = req.ip || req.connection.remoteAddress;
    registrarAuditoria(
      userId, `${userNombre} ${userApellido}`, 'Reporte de Trabajadores Generado', ip, rol
    );
    
  }catch(error){
    console.error('Error al generar el reporte PDF:', error);
    res.status(500).json({ message: 'Error al generar el reporte PDF' });
  }
};

module.exports = {
    obtenerTrabajadores,
    editarTrabajadores,
    eliminarTrabajadores,
    listarTrabajadores,
    generarReporteTrabajadores,
    actualizarTipoContrato
};