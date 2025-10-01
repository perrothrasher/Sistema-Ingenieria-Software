const conexion_Mongo = require('./mongo_connection.js');

/**
 * Registra un evento de auditoría en la base de datos.
 * @param {string} trabajadorId - El ID del usuario que realiza la acción.
 * @param {string} nombreUsuario - El nombre del usuario.
 * @param {string} rol
 * @param {string} accion - Una descripción breve de la acción (ej. 'INICIO_SESION_EXITOSO').
 * @param {string} direccionIp - La dirección IP desde la que se realizó la acción.
 * @param {object} [detalles={}] - Un objeto opcional con detalles adicionales del evento.
 */

async function registrarAuditoria(trabajadorId, nombreUsuario, accion, direccionIp, rol, detalles = {}){
    try{
        const db = await conexion_Mongo();
        const auditoriaCollection = db.collection('auditoria_logs');

        const logEntry = {
            timestamp: new Date(),
            trabajadorId,
            nombreUsuario,
            accion,
            rol,
            direccionIp,
            detalles
        };

        // Insertar el registro en la colección
        await auditoriaCollection.insertOne(logEntry);
        console.log(`📝 Auditoría registrada: ${nombreUsuario} - ${accion}`);
    } catch(error){
        console.error('Error registrando auditoría:', error);
    }
};

const obtenerAuditoriaPorUsuario = async (req, res) => {
    try {
        const { usuarioId } = req.params;
        if (!usuarioId) {
            return res.status(400).json({ message: 'Se requiere el ID del usuario.' });
        }

        const db = await conexion_Mongo();
        const auditoriaCollection = db.collection('auditoria_logs');

        // Buscamos todos los logs del usuario y los ordenamos por fecha, del más reciente al más antiguo
        const logs = await auditoriaCollection.find({ trabajadorId: parseInt(usuarioId) })
                                              .sort({ timestamp: -1 })
                                              .toArray();

        res.status(200).json(logs);

    } catch (error) {
        console.error('Error al obtener la auditoría del usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

module.exports = { registrarAuditoria, obtenerAuditoriaPorUsuario };