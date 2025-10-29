// Importar la conexión a la base de datos
const connection = require('./db_conection.js'); 
const { registrarAuditoria } = require('./auditoria.js');
const PDFDocument = require('pdfkit');
const path = require('path');
const {ChartJSNodeCanvas} = require('chartjs-node-canvas');
const e = require('express');

async function registrarDotacion(req, res){
  const { anio, mes, TipoContrato_id, cantidad_personal, carga_horaria } = req.body;
  const {id: userId} = req.usuario;

  const sql = `
    INSERT INTO DotacionPersonal (anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria)
    VALUES (?, ?, ?, ?, ?)
  `;
  
  let conn;
  try{
    conn = await connection.getConnection();
    await conn.beginTransaction();

    // Establecer el ID del usuario actual para el trigger
    await conn.execute('SET @current_user_id = ?', [userId]);

    const [results] = await conn.execute(
        sql, [anio, mes, TipoContrato_id, cantidad_personal, carga_horaria]
    );

    await conn.commit();

    res.status(200).json({ message: 'Dotación registrada exitosamente', insertId: results.insertId});
  }catch(err){
    if (conn) await conn.rollback();
    console.error('Error en la consulta SQL:', err);
    return res.status(500).json({ message: 'Error al registrar la dotación', error: err.message });
  } finally{
    if (conn) conn.release();
  }
};


async function obtenerDotaciones(req, res){
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

    try {
        const [results] = await connection.query(sql);

        if (results.length > 0) {
            return res.status(200).json({ dotaciones: results });
        } else {
            return res.status(404).json({ message: 'No se encontraron dotaciones' });
        }
    } catch (err) {
        console.error('Error en la consulta SQL:', err);
        return res.status(500).json({ message: 'Error al obtener las dotaciones', error: err.message });
    }
};

// Obtener dotacion para editar
async function obtenerDotacionesParaEdicion(req, res){
    const {id} = req.query;

    const sqlActual = `
       SELECT id, anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria
        FROM DotacionPersonal
        WHERE id = ?;
    `;

    const sqlAnterior= `
        SELECT detalles_cambio
        FROM auditoria_dotacionpersonal
        WHERE dotacionpersonal_id = ? AND accion_id = 2 -- (accion 2 = Modificar)
        ORDER BY fecha DESC
        LIMIT 1;
    `;

    try {
        const [resultsActual] = await connection.query(sqlActual, [id]);
        const [resultsAnterior] = await connection.query(sqlAnterior, [id]);

        if (resultsActual.length === 0) {
            return res.status(404).json({ message: 'No se encontró la dotación' });
        }

        const dotacionActual = resultsActual[0];
        let datosAnteriores = null;

        if (resultsAnterior.length > 0) {
            datosAnteriores = resultsAnterior[0].detalles_cambio.valores_viejos;
        }

        return res.status(200).json({
            dotacionActual: dotacionActual,
            datosAnteriores: datosAnteriores
        })
    } catch (err) {
        console.error('Error en la consulta SQL:', err);
        return res.status(500).json({ message: 'Error al obtener la dotación', error: err.message });
    }
};

// Ruta para editar una dotación
async function editarDotacion(req, res){
    const {id: dotacionId} = req.params;
    const { anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria } = req.body;
    const {id: userId} = req.usuario;

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
    let conn;
    try {
        conn = await connection.getConnection();
        await conn.beginTransaction();
        await conn.execute('SET @current_user_id = ?', [userId]);
        const [results] = await conn.execute(
            sql, [mes_id, anio, TipoContrato_id, cantidad_personal, carga_horaria, dotacionId]
        );

        await conn.commit();
        console.log('Dotación actualizada:', results);
        res.status(200).json({ message: 'Dotación actualizada exitosamente' });

    } catch (err) {
        if (conn) await conn.rollback();
        return res.status(500).json({ message: 'Error al actualizar la dotación', error: err.message });
    } finally {
        if (conn) conn.release();
    }
};

// Eliminar dotacion
async function eliminarDotacion(req, res){
    const {id: dotacionId} = req.params;
    const {id: userId} = req.usuario;

    const sql = `DELETE FROM DotacionPersonal WHERE id = ?`;

    let conn;
    try {
        conn = await connection.getConnection();
        await conn.beginTransaction();
        await conn.execute('SET @current_user_id = ?', [userId]);
        const [results] = await conn.execute(sql, [dotacionId]);

        await conn.commit();
        res.status(200).json({ message: 'Dotación eliminada exitosamente' });

    } catch (err) {
        if (conn) await conn.rollback();
        return res.status(500).json({ message: 'Error al eliminar la dotación', error: err.message });
    } finally {
        if (conn) conn.release();
    }
};

// Reestablecer dotacion
async function reestablecerDotacion(req, res){
    const {id: dotacionId} = req.params;
    const { anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria } = req.body;
    const {id: userId} = req.usuario;

    const sql = `
        UPDATE DotacionPersonal
        SET mes_id = ?, 
            anio = ?, 
            TipoContrato_id = ?, 
            cantidad_personal = ?, 
            carga_horaria = ? 
        WHERE id = ?; 
    `;
    let conn;
    try {
        conn = await connection.getConnection();
        await conn.beginTransaction();

        await conn.execute('SET @current_user_id = ?', [userId]);

        await conn.execute('SET @accion_id_override = 4', []); 

        const [results] = await conn.execute(
            sql, [mes_id, anio, TipoContrato_id, cantidad_personal, carga_horaria, dotacionId]
        );

        await conn.commit();
        res.status(200).json({ message: 'Dotación re-establecida exitosamente' });

    } catch (err) {
        if (conn) await conn.rollback();
        console.error('Error al re-establecer la dotación:', err);
        return res.status(500).json({ message: 'Error al re-establecer la dotación', error: err.message });
    } finally {
        if (conn) conn.release();
    }
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
        
        // Procesar graficos
        const labels = [...new Set(dotaciones.map(d => `${d.mes.substring(0, 3)} ${d.anio}`))]; // Ej: ["Ene 2024", "Feb 2024"]
        const dataFullTime = [];
        const dataPartTime = [];

        labels.forEach(label =>{
            const [mesLabel, anioLabel] = label.split(' ');
            
            const dotacionFull = dotaciones.find(d => `${d.mes.substring(0, 3)} ${d.anio}` === label && d.tipo_contrato === 'Full Time');
            dataFullTime.push(dotacionFull ? dotacionFull.cantidad_personal : 0);

            const dotacionPart = dotaciones.find(d => `${d.mes.substring(0, 3)} ${d.anio}` === label && d.tipo_contrato === 'Part Time');
            dataPartTime.push(dotacionPart ? dotacionPart.cantidad_personal : 0);
        });

        // Configuración del gráfico
        const width = 800; // ancho en píxeles
        const height = 600; // alto en píxeles
        const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height });

        const configuration = {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Personal Part Time',
                        data: dataPartTime,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Personal Full Time',
                        data: dataFullTime,
                        backgroundColor: 'rgba(255, 99, 132, 0.6)',
                        borderColor: 'rgba(255, 99, 132, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: 'Evolución de la Dotación de Personal',
                        font: { size: 20 }
                    }
                },
                scales: {
                    x: { stacked: true }, // Apilar en el eje X
                    y: { stacked: true, beginAtZero: true } // Apilar en el eje Y
                }
            }
        };

        const chartImageBuffer = await chartJSNodeCanvas.renderToBuffer(configuration);

        // Crear nuevo documento PDF
        const doc = new PDFDocument({ margin: 50 });
        
        // Configurar la respuesta del navegador para descargar el PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=reporte-dotaciones.pdf');
        doc.pipe(res);

        // logo de la empresa
        const LogoPath = path.join(__dirname, '..', '..', 'Front', 'assets', 'totalcheck-logo.png');

        // dibujar el logo
        doc.image(LogoPath, 50, 45, { width: 100 });

        // información de la empresa
        doc.fontSize(10)
            .text(
                    `Fanor Velasco 85, Piso 3\n` +
                    `+56 2 2617 9200\n` +
                    `contacto@totalcheck.cl`,
                    { align: 'right' }
            );   
        doc.moveDown(4);

        // contenido del PDF
        doc.fontSize(25).text('Reporte de Dotación Actual', {align: 'center'});
        doc.moveDown(0.5);

        // linea divisoria
        doc.strokeColor("#aaaaaa")
            .lineWidth(1)
            .moveTo(50, doc.y)
            .lineTo(550, doc.y)
            .stroke();
        doc.moveDown(2);

        // iterar sobre las dotaciones y agregarlas al PDF
        dotaciones.forEach((dotacion, index) =>{
            doc.fontSize(14).text(`${index + 1}. ${dotacion.anio} ${dotacion.mes} ${dotacion.tipo_contrato}`, { underline: true });
            doc.fontSize(10).text(`Cantidad de Personal: ${dotacion.cantidad_personal}`);
            doc.fontSize(10).text(`Carga Horaria: ${dotacion.carga_horaria} hrs`);
            doc.moveDown();
        });

        doc.moveDown(2);

        doc.fontSize(16).text('Visualización Gráfica', { align: 'center' });
        doc.moveDown();

        doc.image(chartImageBuffer, {
            fit: [500, 400],
            align: 'center',
            valign: 'center'
        });

        // --- finalización del contenido del PDF ---
        doc.end();

        // registrar evento en la auditoría
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
    generarReporteDotacion,
    eliminarDotacion,
    reestablecerDotacion
    };