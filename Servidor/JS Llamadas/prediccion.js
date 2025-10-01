// server.js
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { MongoClient, GridFSBucket } = require('mongodb');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(cors());

// === CONFIG ===
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB  = process.env.MONGO_DB  || 'IngenieriaSoftware';
const PUERTO    = process.env.PORT      || 8090;

// === CONEXIÓN ÚNICA ===
let clienteMongo, db, gridfs;

async function conectarMongoUnaVez() {
  if (db) return db;
  clienteMongo = new MongoClient(MONGO_URI, { ignoreUndefined: true });
  await clienteMongo.connect();
  db = clienteMongo.db(MONGO_DB);
  gridfs = new GridFSBucket(db, { bucketName: 'archivos' });
  console.log(`[MongoDB] Conectado a ${MONGO_URI}/${MONGO_DB}`);
  return db;
}

app.locals.mongoReady = (async () => { await conectarMongoUnaVez(); })();
app.locals.getDB = () => db;
app.locals.getGridFS = () => gridfs;

// (sirve tu front si lo apuntas a la raíz)
app.use(express.static(path.join(__dirname, '..')));

// Rutas de predicción
const rutaPrediccion = require('./JS Llamadas/prediccion');
app.use('/prediccion', rutaPrediccion);

// endpoint mínimo para que el front muestre usuario
app.get('/api/perfil', (_req, res) => {
  res.json({ nombre: 'Usuario', apellido: 'Demo', rol: 'Gerente' });
});

app.listen(PUERTO, () => {
  console.log(`[Servidor] http://localhost:${PUERTO}`);
});

process.on('SIGINT', async () => {
  try { await clienteMongo?.close(); } finally { process.exit(0); }
});
