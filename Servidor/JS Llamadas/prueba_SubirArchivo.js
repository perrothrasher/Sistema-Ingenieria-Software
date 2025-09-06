const {conexion_Mongo} = require('./mongo_connection');
const fs = require('fs');
const {GridFSBucket} = require('mongodb');

async function subirArchivo(rutaArchivo) {
  try {
    const db = await conexion_Mongo();
    const bucket = new GridFSBucket(db, { bucketName: 'archivos' });

    const nombreArchivo = rutaArchivo.split('/').pop(); // Solo nombre, sin ruta
    const readStream = fs.createReadStream(rutaArchivo);
    const uploadStream = bucket.openUploadStream(nombreArchivo);

    readStream.pipe(uploadStream)
      .on('error', (err) => console.error('❌ Error subiendo archivo:', err))
      .on('finish', () => console.log(`📂 Archivo "${nombreArchivo}" subido correctamente a MongoDB`));

  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

// Ejecutar desde la terminal
const archivo = process.argv[2]; // El archivo que pasas como argumento
if (!archivo) {
  console.log('⚠️  Debes indicar la ruta del archivo. Ejemplo:');
  console.log('   node subirArchivo.js ./documento.pdf');
  process.exit(1);
}

subirArchivo(archivo);