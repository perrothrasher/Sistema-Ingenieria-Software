const express = require('express');
const router = express.Router();
const { obtenerAuditoriaPorUsuario } = require('./auditoria.js');
const verificarToken = require('./authMiddleware.js');

// Todas las rutas aquí estarán protegidas
router.use(verificarToken);

// GET /api/auditoria/:usuarioId
router.get('/', obtenerAuditoriaPorUsuario);

module.exports = router;