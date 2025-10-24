const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');
const dotenv = require('dotenv');

dotenv.config();

const mongoUri = 'mongodb://localhost:27017'; 
const dbName = 'IngenieriaSoftware';
const collectionName = 'configuracion';
const certId = 'ssl-localhost';

async function guardarCertsEnDB() {
  const client = new MongoClient(mongoUri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const collection = db.collection(collectionName);

    const keyContent = fs.readFileSync(path.join(__dirname,'..', 'localhost+2-key.pem'), 'utf8');
    const certContent = fs.readFileSync(path.join(__dirname,'..', 'localhost+2.pem'), 'utf8');

    const resultado = await collection.updateOne(
      { _id: certId },
      {
        $set: {
          key: keyContent,
          cert: certContent,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('Certificados guardados en MongoDB exitosamente.', resultado);

  } catch (err) {
    console.error('Error al guardar certificados:', err);
  } finally {
    await client.close();
  }
}

guardarCertsEnDB();