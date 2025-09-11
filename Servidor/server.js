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
const { conexion_Mongo } = require('./JS Llamadas/mongo_connection.js');
const { obtenerHistoricos } = require('./JS Llamadas/historicos.js'); 

const { registrarOperacionHistorica } = require('./JS Llamadas/op_hist_manual.js');
const { actualizarHistorico } = require('./JS Llamadas/historicos.js');

// ⚠️ Ya existía en tu código — lo dejo como está
// (si ese router interno existe, seguirá funcionando)
app.use('/', require('./JS-llamadas/prediccion'));

// 👉 Importo también el puente directo Node->Python (no rompe lo anterior)
const { entrenarModelo, proyectar } = require('./JS Llamadas/prediccion.js');
/////////////////////////////////////////////////

// TRABAJADORES
/////////////////////////////////////////////////
app.post('/register', registrarTrabajador);
app.post('/login', login);
app.get('/get-trabajadores', obtenerTrabajadores);
app.put('/editarTrabajador/:id', editarTrabajadores);
app.delete('/eliminarTrabajador/:id', eliminarTrabajadores);
/////////////////////////////////////////////////

// CLIENTES
/////////////////////////////////////////////////
app.post('/register-cliente', registrarCliente);
app.get('/get-clientes', obtenerClientes);
app.put('/editarCliente/:id', editarClientes);
app.delete('/eliminarCliente/:id', eliminarCliente);
/////////////////////////////////////////////////

// DOTACIÓN
/////////////////////////////////////////////////
app.post('/registrar-dotacion', registrarDotacion);
app.get('/get-dotaciones', obtenerDotaciones);
app.get('/get-dotaciones-edicion', obtenerDotacionesParaEdicion);
app.put('/editarDotacion/:id', editarDotacion);
/////////////////////////////////////////////////

// HISTÓRICOS 
/////////////////////////////////////////////////
app.get('/historicos', obtenerHistoricos);
app.post('/operacion-historica', registrarOperacionHistorica);  // CU14 (manual)
app.put('/historicos/:tipo/:id', actualizarHistorico);          // CU19 (editar)
/////////////////////////////////////////////////

// ✅ PREDICCIÓN IA (añadido sin borrar nada)
/////////////////////////////////////////////////
// Endpoints directos (operan con ML/modelo_dotacion.py)
app.post('/prediccion/entrenar', entrenarModelo);
app.get('/prediccion/proyectar', proyectar);
/////////////////////////////////////////////////

// SERVIDOR
const puerto = 8090;
app.listen(puerto, () => {
  console.log('Servidor en ejecución en el puerto ' + puerto);
});
