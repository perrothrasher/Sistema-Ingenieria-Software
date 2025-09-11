// Servidor/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { entrenarModelo, proyectar } = require('./JS Llamadas/prediccion.js');  

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
const { conexion_Mongo } = require('./JS Llamadas/mongo_connection.js');
const { obtenerHistoricos } = require('./JS Llamadas/historicos.js'); 

const { registrarOperacionHistorica } = require('./JS Llamadas/op_hist_manual.js');
const { actualizarHistorico } = require('./JS Llamadas/historicos.js');

// ⚠️ Si ya tienes un router alternativo de predicción, lo conservamos
try {
  app.use('/', require('./JS-llamadas/prediccion'));
} catch (_) {}

const path = require('path');
app.use(express.static(path.join(__dirname)));

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
/////////////////////////////////////////////////
app.get('/historicos', obtenerHistoricos);
app.post('/operacion-historica', registrarOperacionHistorica);  // CU14 (manual)
app.put('/historicos/:tipo/:id', actualizarHistorico);          // CU19 (editar)
/////////////////////////////////////////////////

// ✅ PREDICCIÓN IA (ENDPOINTS EXPLÍCITOS)
/////////////////////////////////////////////////
app.post('/prediccion/entrenar', entrenarModelo);
app.get('/prediccion/proyectar', proyectar);

// ...después (más abajo en el archivo) se mantiene:
try { app.use('/', require('./JS-llamadas/prediccion')); } catch (_) {}
// SERVIDOR

const puerto = 8090;
app.listen(puerto, () => {
  console.log('Servidor en ejecución en el puerto ' + puerto);
});
