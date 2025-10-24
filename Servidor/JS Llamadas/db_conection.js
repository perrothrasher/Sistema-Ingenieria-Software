const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Carga las variables de entorno desde el archivo .env
dotenv.config();

// Conexión a la BD
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;