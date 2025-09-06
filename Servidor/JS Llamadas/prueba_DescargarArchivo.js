const conexion_Mongo = require('./mongo_connection');
const fs = require('fs');
const { GridFSBucket } = require('mongodb');

async function descargarArchivo(nombreArchivo, rutaDestino) {
  try {
    const db = await conexion_Mongo();
    const bucket = new GridFSBucket(db, { bucketName: 'archivos' });

    const downloadStream = bucket.openDownloadStreamByName(nombreArchivo);
    const writeStream = fs.createWriteStream(rutaDestino);

    downloadStream
      .pipe(writeStream)
      .on('error', (err) => console.error('❌ Error descargando archivo:', err))
      .on('finish', () => console.log(`📂 Archivo "${nombreArchivo}" descargado correctamente en ${rutaDestino}`));
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

// Ejecutar desde terminal
const nombreArchivo = process.argv[2]; // Nombre exacto del archivo en MongoDB
const rutaDestino = process.argv[3];  // Ruta donde guardar el archivo

if (!nombreArchivo || !rutaDestino) {
  console.log('⚠️  Uso correcto:');
  console.log('   node prueba_DescargarArchivo.js nombre_en_mongo ruta_de_salida');
  console.log('Ejemplo:');
  console.log('   node prueba_DescargarArchivo.js prueba.pdf ./descargas/prueba.pdf');
  process.exit(1);
}

descargarArchivo(nombreArchivo, rutaDestino);
