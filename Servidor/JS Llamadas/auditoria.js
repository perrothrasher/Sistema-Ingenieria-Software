const conexion_Mongo = require('./mongo_connection.js');

/**
 * Registra un evento de auditoría en la base de datos.
 * @param {string} trabajadorId - El ID del usuario que realiza la acción.
 * @param {string} nombreUsuario - El nombre del usuario.
 * @param {string} accion - Una descripción breve de la acción (ej. 'INICIO_SESION_EXITOSO').
 * @param {string} direccionIp - La dirección IP desde la que se realizó la acción.
 * @param {object} [detalles={}] - Un objeto opcional con detalles adicionales del evento.
 */

async function registrarAuditoria(trabajadorId, nombreUsuario, accion, direccionIp, detalles = {}){
    try{
        const db = await conexion_Mongo();
        const auditoriaCollection = db.collection('auditoria_logs');

        const logEntry = {
            timestamp: new Date(),
            trabajadorId,
            nombreUsuario,
            accion,
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

module.exports = { registrarAuditoria};