const connection = require('./db_conection.js');

function construirWhere(mes, anio) {
    let sql = " WHERE 1=1 ";
    const params = [];

    if (anio) {
        sql += " AND p.anio = ? ";
        params.push(anio);
    }
    if (mes) {
        sql += " AND p.mes = ? ";
        params.push(mes);
    }
    return { sql, params };
}

async function obtenerKPIs(req, res) {
    const { mes, anio } = req.query; 
    const filtro = construirWhere(mes, anio);

    try {
        const sqlTotal = `SELECT COALESCE(SUM(cantidadFolios), 0) as total FROM produccion p ${filtro.sql}`;
        
        const sqlTopCliente = `
            SELECT c.nombre, SUM(p.cantidadFolios) as total
            FROM produccion p
            JOIN cliente c ON p.cliente_id = c.id
            ${filtro.sql}
            GROUP BY c.nombre
            ORDER BY total DESC
            LIMIT 1
        `;

        const sqlTopUsuario = `
            SELECT CONCAT_WS(' ', u.primer_nombre, u.primer_apellido) as nombre, SUM(p.cantidadFolios) as total
            FROM produccion p
            JOIN usuarioprendas u ON p.usuarioPrendas_id = u.id
            ${filtro.sql}
            GROUP BY u.id, u.primer_nombre, u.primer_apellido
            ORDER BY total DESC
            LIMIT 1
        `;

        const [resTotal] = await connection.query(sqlTotal, filtro.params);
        const [resCliente] = await connection.query(sqlTopCliente, filtro.params);
        const [resUsuario] = await connection.query(sqlTopUsuario, filtro.params);

        const totalMes = resTotal[0] ? resTotal[0].total : 0;
        const clienteNombre = resCliente.length > 0 ? resCliente[0].nombre : "Sin datos";
        const clienteCant = resCliente.length > 0 ? resCliente[0].total : 0;
        const usuarioNombre = resUsuario.length > 0 ? resUsuario[0].nombre : "Sin datos";
        const usuarioCant = resUsuario.length > 0 ? resUsuario[0].total : 0;

        res.json({
            produccion_mensual: totalMes,
            top_cliente: clienteNombre,
            top_cliente_cantidad: clienteCant,
            top_usuario: usuarioNombre,
            top_usuario_cantidad: usuarioCant
        });

    } catch (error) {
        console.error("Error KPIs:", error);
        res.status(500).json({ message: "Error del servidor" });
    }
}

// GRÁFICOS
async function obtenerDatosGraficos(req, res) {
    const { mes, anio } = req.query;
    
    const filtroEstricto = construirWhere(mes, anio);
    const anioParaTendencia = anio || new Date().getFullYear();

    try {
        const sqlServicios = `
            SELECT ts.NombreServicio as nombre, COALESCE(SUM(p.cantidadFolios), 0) as total
            FROM produccion p
            JOIN tiposervicio ts ON p.tipoServicio_id = ts.id
            ${filtroEstricto.sql}
            GROUP BY ts.NombreServicio
        `;

        const sqlTendencia = `
            SELECT mes, SUM(cantidadFolios) as total
            FROM produccion WHERE anio = ? GROUP BY mes ORDER BY mes ASC
        `;

        const sqlUsuariosActivos = `
            SELECT mes, COUNT(DISTINCT usuarioPrendas_id) as total
            FROM produccion WHERE anio = ? GROUP BY mes ORDER BY mes ASC
        `;

        const sqlJustificaciones = `
            SELECT j.justificacion as nombre, COUNT(*) as total
            FROM produccion p
            JOIN Justificacion j ON p.justificacion_id = j.id
            ${filtroEstricto.sql}
            AND j.id != 1 
            GROUP BY j.justificacion
        `;

        const [resServicios] = await connection.query(sqlServicios, filtroEstricto.params);
        const [resTendencia] = await connection.query(sqlTendencia, [anioParaTendencia]);
        const [resUsuarios] = await connection.query(sqlUsuariosActivos, [anioParaTendencia]);
        const [resJustificaciones] = await connection.query(sqlJustificaciones, filtroEstricto.params);

        const dataProduccion = Array(12).fill(0);
        resTendencia.forEach(r => { if(r.mes >= 1 && r.mes <= 12) dataProduccion[r.mes - 1] = r.total; });

        const dataUsuarios = Array(12).fill(0);
        resUsuarios.forEach(r => { if(r.mes >= 1 && r.mes <= 12) dataUsuarios[r.mes - 1] = r.total; });

        res.json({
            tendencia: dataProduccion,
            servicios: resServicios,
            usuariosActivos: dataUsuarios,
            justificaciones: resJustificaciones
        });

    } catch (error) {
        console.error("Error Gráficos:", error);
        res.status(500).json({ message: "Error cargando gráficos" });
    }
}

module.exports = { obtenerKPIs, obtenerDatosGraficos };