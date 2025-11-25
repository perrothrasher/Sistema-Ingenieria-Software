const connection = require('./db_conection.js'); 
const PDFDocument = require('pdfkit');
const path = require('path');

async function listarMandantes(req, res){
    const sql = `
        SELECT
            m.id,
            m.nombre,
            m.fecha_ingreso,
            COALESCE(SUM(p.cantidadfolios), 0) as total_folios
        FROM Cliente m
        LEFT JOIN Produccion p ON m.id = p.cliente_id
        WHERE activo = 1
        GROUP BY m.id, m.nombre, m.fecha_ingreso
        ORDER BY m.fecha_ingreso DESC
    `;

    try{
        const [mandantes] = await connection.query(sql);
        res.status(200).json({mandantes: mandantes});
    }catch(err){
       console.error("Error al obtener lista de mandantes:", err);
         res.status(500).json({ message: "Error interno al consultar la base de datos", error: err.message }); 
    }
};

async function registrarMandante(req, res){
    const { nombre } = req.body;
    const {id: userId} = req.usuario;
    
    let conn;
    if(!nombre){
        return res.status(400).json({message: 'El nombre del cliente es obligatorio'});
    }

    const sql = `
        INSERT INTO Cliente (nombre) VALUES (?);
    `;

    try{
        conn = await connection.getConnection();
        await conn.beginTransaction();

        await conn.execute('SET @current_user_id = ?', [userId]);

        const [results] = await conn.execute(
            sql, [nombre]
        );

        await conn.commit();
        res.status(201).json({ message: 'Cliente registrado con éxito', clienteId: results.insertId });
    }catch(err){
        if(conn) await conn.rollback();
        console.error('Error al registrar cliente:', err);
        return res.status(500).json({ message: 'Error al registrar el cliente', error: err.message });
    } finally{
        if(conn) conn.release();
    }
};

async function eliminarMandante(req,res){
    const { id: clienteId } = req.params;
    const { id: userId} = req.usuario;

    const sql = `
        DELETE FROM Cliente WHERE id = ?;
    `;

    let conn;
    try{
        conn = await connection.getConnection();
        await conn.beginTransaction();
        await conn.execute('SET @current_user_id = ?', [userId]);
        const [results] = await conn.execute(sql, [clienteId]);

        await conn.commit();
        res.status(200).json({ message: 'Cliente eliminado con éxito' });
    }catch(err){
        if (conn) await conn.rollback();
        return res.status(500).json({ message: 'Error al eliminar el cliente', error: err.message });
    } finally {
        if (conn) conn.release();
    }
};

async function editarMandante(req, res) {
    const { id } = req.params;
    const { nombre } = req.body;
    const { id: userId } = req.usuario;

    if (!nombre) {
        return res.status(400).json({ message: 'El nombre es obligatorio' });
    }

    let conn;
    try {
        conn = await connection.getConnection();
        await conn.beginTransaction();
        await conn.execute('SET @current_user_id = ?', [userId]);

        const sql = "UPDATE Cliente SET nombre = ? WHERE id = ?";
        const [result] = await conn.execute(sql, [nombre, id]);

        if (result.affectedRows === 0) {
            await conn.rollback();
            return res.status(404).json({ message: 'Mandante no encontrado' });
        }

        await conn.commit();
        res.status(200).json({ message: 'Mandante actualizado correctamente' });

    } catch (error) {
        if (conn) await conn.rollback();
        console.error("Error al editar mandante:", error);
        res.status(500).json({ message: "Error al editar mandante", error: error.message });
    } finally {
        if (conn) conn.release();
    }
}

async function recuperarNombreAnterior(req, res) {
    const { id } = req.params;

    const sql = `
        SELECT 
            JSON_UNQUOTE(JSON_EXTRACT(detalles_cambio, '$.anterior.nombre')) as nombre_anterior
        FROM auditoria_clientes
        WHERE cliente_id = ? 
          AND accion_id = 2 
        ORDER BY id DESC 
        LIMIT 1;
    `;

    try {
        const [rows] = await connection.query(sql, [id]);

        if (rows.length > 0 && rows[0].nombre_anterior) {
            res.json({ nombre: rows[0].nombre_anterior });
        } else {
            res.status(404).json({ message: "No hay historial de cambios para este cliente." });
        }

    } catch (error) {
        console.error("Error recuperando historial:", error);
        res.status(500).json({ message: "Error al consultar historial" });
    }
}


module.exports = {
    listarMandantes,
    registrarMandante,
    eliminarMandante,
    editarMandante,
    recuperarNombreAnterior
};