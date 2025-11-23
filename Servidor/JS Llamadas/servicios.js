const connection = require('./db_conection.js'); 
const PDFDocument = require('pdfkit');
const path = require('path');

async function registrarProduccionMasiva(req, res) {
    const datos = req.body; 

    if (!Array.isArray(datos) || datos.length === 0) {
        return res.status(400).json({ message: "No se recibieron datos." });
    }

    const valoresParaInsertar = datos.map(fila => [
        fila.id_usuario,       
        fila.id_mandante,      
        fila.id_tipo_servicio, 
        fila.cantidad,
        fila.mes,
        fila.anio,
        // Si no viene justificación, usamos 1 (Sin justificación)
        fila.id_justificacion || 1 
    ]);
    const sql = `
        INSERT INTO produccion 
        (usuarioPrendas_id, cliente_id, tipoServicio_id, cantidadFolios, mes, anio, justificacion_id) 
        VALUES ?
    `;

    try {
        const [result] = await connection.query(sql, [valoresParaInsertar]);
        res.status(201).json({ 
            message: "Producción registrada correctamente", 
            filas_guardadas: result.affectedRows 
        });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ message: "Error al guardar", error: error.message });
    }
}

module.exports = {
    registrarProduccionMasiva
};