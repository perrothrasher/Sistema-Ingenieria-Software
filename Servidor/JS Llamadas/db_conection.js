import dotenv from 'dotenv';
const mysql = require('mysql2');

// Carga las variables de entorno desde el archivo .env
dotenv.config();

// Conexión a la BD
const connection = mysql.createConnection({
  host: process.env.DB_HOST, // Host de la base de datos
  user: process.env.DB_USER, // Usuario de la base de datos      
  password: process.env.DB_PASSWORD, // Contraseña de la base de datos
  database: process.env.DB_NAME // Nombre de la base de datos
});

// Verifica si la conexión es exitosa
connection.connect((err) => {
  if (err) {
    console.error('Error conectando a la base de datos:', err.stack);
    return;
  }
  console.log('Conexión exitosa a la base de datos, con ID: ' + connection.threadId);
});

module.exports = connection;