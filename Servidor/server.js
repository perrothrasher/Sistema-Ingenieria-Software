const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const app = express();
app.use(bodyParser.json());

/////////////////////////////////////////////////
const corsOptions = require('./JS Llamadas/cors_config.js'); // Configuración de CORS.
app.use(cors(corsOptions)); 
const registrarTrabajador = require('./JS Llamadas/registrar_trabajador.js'); // Registrar trabajador
const login = require('./JS Llamadas/login.js'); // Iniciar sesión
const { registrarCliente, obtenerClientes, editarClientes, eliminarCliente } = require('./JS Llamadas/cliente.js');
const { obtenerTrabajadores, editarTrabajadores, eliminarTrabajadores } = require('./JS Llamadas/trabajadores.js'); 
const { registrarDotacion, obtenerDotaciones, editarDotacion, obtenerDotacionesParaEdicion } = require('./JS Llamadas/dotacion.js');

const { obtenerHistoricos } = require('./JS Llamadas/historicos.js'); 
/////////////////////////////////////////////////

// TRABAJADORES
/////////////////////////////////////////////////
// Ruta para registrar un trabajador
app.post('/register', registrarTrabajador);
// Ruta para iniciar sesión
app.post('/login', login);
// Ruta para obtener todos los trabajadores
app.get('/get-trabajadores', obtenerTrabajadores);
// Ruta para editar un trabajador
app.put('/editarTrabajador/:id', editarTrabajadores);
// Ruta para eliminar un trabajador
app.delete('/eliminarTrabajador/:id', eliminarTrabajadores);
// Ruta para verificar si el usuario es administrador
/////////////////////////////////////////////////


// CLIENTES
/////////////////////////////////////////////////
// Ruta para registrar un cliente
app.post('/register-cliente', registrarCliente);
// Ruta para obtener todos los clientes
app.get('/get-clientes', obtenerClientes);
// Ruta para editar un cliente
app.put('/editarCliente/:id', editarClientes);
// Ruta para eliminar un cliente
app.delete('/eliminarCliente/:id', eliminarCliente);
/////////////////////////////////////////////////

// DOTACIÓN
/////////////////////////////////////////////////
// Ruta para registrar dotaciones
app.post('/registrar-dotacion', registrarDotacion);
// Ruta para obtener dotaciones
app.get('/get-dotaciones', obtenerDotaciones);
// Ruta para obtener dotaciones para edición
app.get('/get-dotaciones-edicion', obtenerDotacionesParaEdicion);
// Ruta para editar una dotación
app.put('/editarDotacion/:id', editarDotacion);
/////////////////////////////////////////////////


// HISTÓRICOS 
app.get('/historicos', obtenerHistoricos);
/////////////////////////////////////////////////

// Iniciar servidor
/////////////////////////////////////////////////
puerto = 8090;
app.listen(puerto, () => {
  console.log('Servidor en ejecución en el puerto ' + puerto);
});
/////////////////////////////////////////////////