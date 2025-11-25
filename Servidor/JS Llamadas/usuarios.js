const connection = require('./db_conection.js'); 
const PDFDocument = require('pdfkit');
const path = require('path');

async function añadirUsuario(req, res){
    const {primer_nombre, segundo_nombre, primer_apellido, segundo_apellido} = req.body;

    if(!primer_nombre || !primer_apellido){
        return res.status(400).json({
            message: 'El primer nombre y el primer apellido son obligatorios'
        })
    }

    const segundoNombreInsert = segundo_nombre || null;
    const segundoApellidoInsert = segundo_apellido || null;

    const sql = `
        INSERT INTO usuarioprendas (primer_nombre, segundo_nombre, primer_apellido, segundo_apellido)
        VALUES (?, ?, ?, ?);
    `;

    let conn;
    try{
        conn = await connection.getConnection();
        await conn.beginTransaction();

        // Establecer el ID del usuario actual para el trigger
        //await conn.execute('SET @current_user_id = ?', [userId]);

        const [results] = await conn.execute(sql, [
            primer_nombre, segundoNombreInsert,
            primer_apellido, segundoApellidoInsert
        ]);

        await conn.commit();
        res.status(201).json({
            message: 'Usuario añadido con éxito',
            id: results.insertId
        });
    }catch(err){
        if(conn) await conn.rollback();
        console.error("Error al añadir usuario:", err);
        res.status(500).json({
            message: 'Error al añadir el usuario',
            error: err.message
        });
    }finally{
        if(conn) conn.release();
    }
}
    
async function listarUsuarios(req, res){
    const sql = `
        SELECT 
            up.id,
            up.primer_nombre,
            up.primer_apellido,
            up.fecha_ingreso,
            CONCAT_WS(' ', up.primer_nombre, up.primer_apellido, up.segundo_apellido) as nombre_completo,
            COALESCE(SUM(p.cantidadFolios), 0) as total_folios
        FROM usuarioprendas up 
        LEFT JOIN produccion p ON up.id = p.usuarioPrendas_id
        WHERE activo = 1
        GROUP BY up.id, up.primer_nombre, up.primer_apellido, up.fecha_ingreso
        ORDER BY up.primer_apellido ASC;
    `;

    try {
        const [usuarios] = await connection.query(sql);
        res.status(200).json({ usuarios: usuarios });
    } catch (err) {
        console.error("Error al obtener lista de usuarios de prendas:", err);
        res.status(500).json({ message: "Error al consultar la base de datos." });
    }
};

async function eliminarUsuario(req, res) {
    const { id } = req.params;
    //const { id: userId } = req.usuario; // auditoría

    let conn;
    try {
        conn = await connection.getConnection();
        await conn.beginTransaction();

        // await conn.execute('SET @current_user_id = ?', [userId]);

        const sqlBorrarFolios = "DELETE FROM produccion WHERE usuarioPrendas_id = ?";
        await conn.execute(sqlBorrarFolios, [id]);

        const sqlBorrarUsuario = "DELETE FROM usuarioprendas WHERE id = ?";
        const [result] = await conn.execute(sqlBorrarUsuario, [id]);

        await conn.commit();

        if (result.affectedRows > 0) {
            res.status(200).json({ message: "Usuario y sus registros eliminados correctamente." });
        } else {
            res.status(404).json({ message: "Usuario no encontrado." });
        }

    } catch (error) {
        if (conn) await conn.rollback();
        console.error("Error al eliminar:", error);
        res.status(500).json({ message: "Error al eliminar", error: error.message });
    } finally {
        if (conn) conn.release();
    }
}

module.exports = {
    añadirUsuario,
    listarUsuarios,
    eliminarUsuario
};