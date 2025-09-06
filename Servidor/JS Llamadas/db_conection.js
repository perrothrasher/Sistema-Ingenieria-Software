const mysql = require('mysql2');
const dotenv = require('dotenv');

// Carga las variables de entorno desde el archivo .env
dotenv.config();

// Conexión a la BD
const connection = mysql.createConnection({
  host: process.env.DB_HOST, 
  user: process.env.DB_USER,      
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_NAME 
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