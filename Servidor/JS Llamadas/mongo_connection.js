const dotenv = require('dotenv');
const { MongoClient } = require('mongodb');

// Carga las variables de entorno desde el archivo .env
dotenv.config();

// Conexión a MongoDB
const uri = process.env.MongoDB_URI;
const DB_Nombre = process.env.MongoDB_NAME;


if (!uri) {
  throw new Error('❌ No se encontró la variable MongoDB en el archivo .env');
} else{
    console.log('Conexión exitosa a MongoDB');
}

const client = new MongoClient(uri);

async function conexion_Mongo() {
  try {
    await client.connect();
    return client.db(DB_Nombre);
  } catch (err) {
    console.error('Error conectando a MongoDB:', err);
    process.exit(1);
  }
}

module.exports = conexion_Mongo;
