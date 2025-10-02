// Importar la conexión a la base de datos
const connection = require('./db_conection.js'); 
const { registrarAuditoria } = require('./auditoria.js');
const PDFDocument = require('pdfkit');
const path = require('path');

function registrarDotacion(req, res){
  const { anio, mes, TipoContrato_id, cantidad_personal, carga_horaria } = req.body;

  const sql = `
    INSERT INTO DotacionPersonal (anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria)
    VALUES (?, ?, ?, ?, ?)
  `;

  connection.execute(
    sql, [anio, mes, TipoContrato_id, cantidad_personal, carga_horaria],
    (err, results) => {
      if (err) {
        console.error('Error en la consulta SQL:', err);
        return res.status(500).json({ message: 'Error al registrar la dotación', error: err.message });
      }
      // Registrar evento en la auditoría
        const {id, nombre, apellido, rol} = req.usuario;
        const ip = req.ip || req.connection.remoteAddress;
        registrarAuditoria(
            id, `${nombre} ${apellido}`, 'Dotación Creada', ip, rol,
            {dotacionId: results.insertId, mes: req.body.mes, anio: req.body.anio} // Datos adicionales del evento
        );
      res.status(200).json({ message: 'Dotación registrada exitosamente' });
    }
  );
};

function obtenerDotaciones(req, res){
    const id = req.query.id;
    const sql = `
        SELECT
        d.id,
        d.anio, 
        m.nombre AS mes, 
        t.nombre AS tipo_contrato, 
        d.cantidad_personal, 
        d.carga_horaria
        FROM DotacionPersonal d
        JOIN TipoContrato t ON d.TipoContrato_id = t.id
        JOIN Mes m ON d.mes_id = m.id
        ORDER BY d.anio DESC, m.id DESC
    `;

    connection.query(sql, [id], (err, results) => {
        if (err) {
        console.error('Error en la consulta SQL:', err);
        return res.status(500).json({ message: 'Error al obtener las dotaciones', error: err.message });
        }
        if (results.length > 0) {
            return res.status(200).json({ dotaciones: results });
        } else{
            return res.status(404).json({ message: 'No se encontraron dotaciones' });
        }
    });
};

// Obtener dotacion para editar
function obtenerDotacionesParaEdicion(req, res){
    const id = req.query.id;
    const sql = `
        SELECT
        d.id,
        d.anio, 
        d.mes_id, 
        d.TipoContrato_id, 
        d.cantidad_personal, 
        d.carga_horaria
        FROM DotacionPersonal d
        JOIN TipoContrato t ON d.TipoContrato_id = t.id
        JOIN Mes m ON d.mes_id = m.id
        ORDER BY d.anio DESC, m.id DESC
    `;

    connection.query(sql, [id], (err, results) => {
        if (err) {
        console.error('Error en la consulta SQL:', err);
        return res.status(500).json({ message: 'Error al obtener las dotaciones', error: err.message });
        }
        if (results.length > 0) {
            return res.status(200).json({ dotaciones: results });
        } else{
            return res.status(404).json({ message: 'No se encontraron dotaciones' });
        }
    });
};

// Ruta para editar una dotación
function editarDotacion(req, res){
    const {id} = req.params;
    const { anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria } = req.body;

    console.log('Datos recibidos para actualizar la dotación:', {
        id, mes_id, anio, TipoContrato_id, cantidad_personal, carga_horaria
    });

    const sql = `
        UPDATE DotacionPersonal d
        JOIN TipoContrato t ON d.TipoContrato_id = t.id
        SET d.mes_id = ?, 
            d.anio = ?, 
            d.TipoContrato_id = ?, 
            d.cantidad_personal = ?, 
            d.carga_horaria = ? 
        WHERE d.id = ?; 
    `;
    connection.execute(
        sql, [mes_id, anio, TipoContrato_id, cantidad_personal, carga_horaria, id],
        (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Error al actualizar la dotación', error: err.message });
            }
            console.log('Dotación actualizada:', results);
            // Registrar evento en la auditoría
            const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
            const ip = req.ip || req.connection.remoteAddress;
            registrarAuditoria(
                userId, `${userNombre} ${userApellido}`, 'Dotación Editada', ip, rol,
                {dotacionIdEditada: req.params.id} // Datos adicionales del evento
            );
            res.status(200).json({ message: 'Dotación actualizada exitosamente' });
        }
    );
};

// Generar reportes con las dotaciones
async function generarReporteDotacion(req, res){
    try{
        const [rows] = await connection.promise().query(`
            SELECT
                d.id,
                d.anio, 
                m.nombre AS mes, 
                t.nombre AS tipo_contrato, 
                d.cantidad_personal, 
                d.carga_horaria
                FROM DotacionPersonal d
                JOIN TipoContrato t ON d.TipoContrato_id = t.id
                JOIN Mes m ON d.mes_id = m.id
                ORDER BY d.id ASC
        `);
        const dotaciones = rows;

        // Crear nuevo documento PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Configurar la respuesta del navegador para descargar el PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-dotaciones.pdf');
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
        doc.fontSize(25).text('Reporte de Dotación Actual', {align: 'center'});
        doc.moveDown(0.5);

        // Linea divisoria
        doc.strokeColor("#aaaaaa")
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(550, doc.y)
            .stroke();
        doc.moveDown(2);

        // Iterar sobre las dotaciones y agregarlas al PDF
        dotaciones.forEach((dotacion, index) =>{
            doc.fontSize(14).text(`${index + 1}. ${dotacion.anio} ${dotacion.mes} ${dotacion.tipo_contrato}`, { underline: true });
            doc.fontSize(10).text(`Cantidad de Personal: ${dotacion.cantidad_personal}`);
            doc.fontSize(10).text(`Carga Horaria: ${dotacion.carga_horaria} hrs`);
            doc.moveDown();
        });
        // --- Finalización del contenido del PDF ---
        doc.end();

        // Registrar evento en la auditoría
        const {id: userId, nombre: userNombre, apellido: userApellido, rol} = req.usuario;
        const ip = req.ip || req.connection.remoteAddress;
        registrarAuditoria(
            userId, `${userNombre} ${userApellido}`, 'Reporte de Dotaciones Generado', ip, rol
        );

    }catch(error){
        console.error('Error al generar el reporte PDF:', error);
        res.status(500).json({message: 'Error al generar el reporte PDF'});
    }
};

module.exports = {
    registrarDotacion,
    obtenerDotaciones,
    editarDotacion,
    obtenerDotacionesParaEdicion,
    generarReporteDotacion
    };