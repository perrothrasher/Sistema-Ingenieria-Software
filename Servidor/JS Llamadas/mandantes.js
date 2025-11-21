const connection = require('./db_conection.js'); 
const PDFDocument = require('pdfkit');
const path = require('path');

async function listarMandantes(req, res){
    const sql = `
        SELECT
            m.id,
            m.nombre,
            m.fecha_ingreso,
            COALESCE(COUNT(p.cantidad_folios), 0) as total_folios
        FROM Mandante m
        LEFT JOIN Produccion p ON m.id = p.mandante_id
        GROUP BY m.id, m.nombre, m.fecha_ingreso
        ORDER BY m.fecha_ingreso DESC
    `;

    try{
        const [mandantes] = await connection.query(sql);
        res.status(200).json(mandantes)
    }catch(err){
       console.error("Error al obtener lista de mandantes:", err);
         res.status(500).json({ message: "Error interno al consultar la base de datos", error: err.message }); 
    }
};

module.exports = {
    listarMandantes
};