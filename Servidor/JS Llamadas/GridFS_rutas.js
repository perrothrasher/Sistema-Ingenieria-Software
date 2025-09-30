const express = require('express');
const multer = require('multer');
const {subirArchivo, descargarArchivo, listarArchivos, eliminarArchivo} = require('./GridFS_controlador.js');
const router = express.Router();

// Configuración de multer para manejar la subida de archivos en memoria
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {fileSize: 10 * 1024 * 1024} // Límite de tamaño de archivo: 10MB
});

// Definicion de las rutas
// Ruta para subir un archivo
router.post('/upload', upload.single('miArchivo'),subirArchivo);

// Ruta para descargar un archivo por su nombre
router.get('/ver/:filename', descargarArchivo);

// Ruta para listar todos los archivos
router.get('/lista', listarArchivos);

// Ruta para eliminar un archivo por su ID
router.delete('/:id', eliminarArchivo);

module.exports = router;