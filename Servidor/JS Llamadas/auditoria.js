const conexion_Mongo = require('./mongo_connection.js');
const connection = require('./db_conection.js'); // Conexión MySQL

async function registrarAuditoria(trabajadorId, nombreUsuario, accion, direccionIp, rol, detalles = {}){
    try{
        const db = await conexion_Mongo();
        const auditoriaCollection = db.collection('auditoria_logs');

        const logEntry = {
            timestamp: new Date(),
            trabajadorId: parseInt(trabajadorId), 
            nombreUsuario,
            accion,
            rol,
            direccionIp,
            detalles
        };

        await auditoriaCollection.insertOne(logEntry);
        console.log(`📝 Auditoría registrada (Mongo): ${nombreUsuario} - ${accion}`);
    } catch(error){
        console.error('Error registrando auditoría:', error);
    }
};

const obtenerAuditoriaPorUsuario = async (req, res) => {
    const { usuarioId, accion } = req.query;

    try {
        let logsCombinados = [];

        if (!accion || accion.includes('Sesión')) {
            const db = await conexion_Mongo();
            const auditoriaCollection = db.collection('auditoria_logs');
            
            let queryMongo = {};
            if (usuarioId) queryMongo.trabajadorId = parseInt(usuarioId);
            if (accion) queryMongo.accion = accion;

            const logsMongo = await auditoriaCollection.find(queryMongo).toArray();
            
            const logsMongoFormateados = logsMongo.map(log => ({
                nombreUsuario: log.nombreUsuario,
                accion: log.accion,
                rol: log.rol,
                timestamp: log.timestamp,
                direccionIp: log.direccionIp,
                detalles: log.detalles,
                origen: 'SESION'
            }));
            
            logsCombinados = [...logsCombinados, ...logsMongoFormateados];
        }
        if (!accion || !accion.includes('Sesión')) {
            
            let sql = `
                SELECT 
                    ac.fecha as timestamp,
                    CONCAT(p.nombre, ' ', p.apellido) as nombreUsuario,
                    r.nombre as rol,
                    CASE 
                        WHEN ac.accion_id = 1 THEN 'Cliente Creado'
                        WHEN ac.accion_id = 2 THEN 'Cliente Editado'
                        WHEN ac.accion_id = 3 THEN 'Cliente Eliminado'
                        WHEN ac.accion_id = 4 THEN 'Cliente Restaurado'
                    END as accion,
                    'Sistema' as direccionIp,
                    ac.detalles_cambio as detalles
                FROM auditoria_clientes ac
                JOIN trabajador t ON ac.trabajador_id = t.id
                JOIN persona p ON t.persona_id = p.id
                JOIN rol r ON t.rol_id = r.id
                WHERE 1=1 ${usuarioId ? `AND ac.trabajador_id = ${connection.escape(usuarioId)}` : ''}

                UNION ALL

                SELECT 
                    at.fecha as timestamp,
                    CONCAT(p.nombre, ' ', p.apellido) as nombreUsuario,
                    r.nombre as rol,
                    CASE 
                        WHEN at.accion_id = 1 THEN 'Trabajador Creado'
                        WHEN at.accion_id = 2 THEN 'Trabajador Editado'
                        WHEN at.accion_id = 3 THEN 'Trabajador Eliminado'
                        WHEN at.accion_id = 4 THEN 'Trabajador Restaurado'
                    END as accion,
                    'Sistema' as direccionIp,
                    at.detalles_cambio as detalles
                FROM auditoria_trabajadores at
                JOIN trabajador t ON at.trabajador_id = t.id
                JOIN persona p ON t.persona_id = p.id
                JOIN rol r ON t.rol_id = r.id
                WHERE 1=1 ${usuarioId ? `AND at.trabajador_id = ${connection.escape(usuarioId)}` : ''}

                UNION ALL

                SELECT 
                    ad.fecha as timestamp,
                    CONCAT(p.nombre, ' ', p.apellido) as nombreUsuario,
                    r.nombre as rol,
                    CASE 
                        WHEN ad.accion_id = 1 THEN 'Dotación Creada'
                        WHEN ad.accion_id = 2 THEN 'Dotación Editada'
                        WHEN ad.accion_id = 3 THEN 'Dotación Eliminada'
                        WHEN ad.accion_id = 4 THEN 'Dotación Restaurada'
                    END as accion,
                    'Sistema' as direccionIp,
                    ad.detalles_cambio as detalles
                FROM auditoria_dotacionpersonal ad
                JOIN trabajador t ON ad.trabajador_id = t.id
                JOIN persona p ON t.persona_id = p.id
                JOIN rol r ON t.rol_id = r.id
                WHERE 1=1 ${usuarioId ? `AND ad.trabajador_id = ${connection.escape(usuarioId)}` : ''}
            `;

            const [logsMySQL] = await connection.query(sql);
            if (accion) {
                const logsFiltrados = logsMySQL.filter(log => log.accion === accion);
                logsCombinados = [...logsCombinados, ...logsFiltrados];
            } else {
                logsCombinados = [...logsCombinados, ...logsMySQL];
            }
        }
        logsCombinados.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.status(200).json(logsCombinados);

    } catch (error) {
        console.error('Error al obtener auditoría unificada:', error);
        res.status(500).json({ message: 'Error interno del servidor al consultar auditoría.' });
    }
};

module.exports = { registrarAuditoria, obtenerAuditoriaPorUsuario };