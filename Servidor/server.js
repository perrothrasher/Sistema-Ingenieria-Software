// Servidor/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

/////////////////////////////////////////////////
// Utilización de express para no utilizar xampp
const app = express();
app.use(express.static(path.join(__dirname, '..', 'Front')));
app.use(bodyParser.json());
app.use(cookieParser());
/////////////////////////////////////////////////

/////////////////////////////////////////////////
const corsOptions = require('./JS Llamadas/cors_config.js'); // Configuración de CORS.
app.use(cors(corsOptions)); 
const registrarTrabajador = require('./JS Llamadas/registrar_trabajador.js'); // Registrar trabajador
const login = require('./JS Llamadas/login.js'); // Iniciar sesión
const verificarToken = require('./JS Llamadas/authMiddleware.js');
const { registrarCliente, obtenerClientes, editarClientes, eliminarCliente } = require('./JS Llamadas/cliente.js');
const { obtenerTrabajadores, editarTrabajadores, eliminarTrabajadores } = require('./JS Llamadas/trabajadores.js'); 
const { registrarDotacion, obtenerDotaciones, editarDotacion, obtenerDotacionesParaEdicion } = require('./JS Llamadas/dotacion.js');
const { obtenerHistoricos } = require('./JS Llamadas/historicos.js'); 
const { registrarOperacionHistorica } = require('./JS Llamadas/op_hist_manual.js');
const { actualizarHistorico } = require('./JS Llamadas/historicos.js');
/////////////////////////////////////////////////

// RUTAS PARA GESTIÓN DE ARCHIVOS (SUBIDA Y DESCARGA)
/////////////////////////////////////////////////
const fileRoutes = require('./JS Llamadas/GridFS_rutas.js');
app.use('/api/archivos', fileRoutes);
/////////////////////////////////////////////////

// LOGIN
/////////////////////////////////////////////////
// Ruta para iniciar sesión
app.post('/login', login);
// Ruta para cerrar sesión
app.get('/api/perfil', verificarToken, (req, res) => {
  res.json(req.usuario);
});
app.post('/logout', (req, res) =>{
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/'
  };
  res.clearCookie('token', cookieOptions);
  res.status(200).json({message: 'Cierre de sesión exitoso'});
});
/////////////////////////////////////////////////

// TRABAJADORES
/////////////////////////////////////////////////
// Ruta para registrar un trabajador
app.post('/register', registrarTrabajador);
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

// ===== NUEVO: montar rutas de predicción SIN tocar lo demás =====
//const prediccionRouter = require('./prediccion'); // <- nuevo archivo con la lógica de IA
//app.use('/prediccion', prediccionRouter);
// ================================================================

const puerto = 8090;
app.listen(puerto, () => {
  //console.log('Servidor en ejecución en el puerto ' + puerto);
  console.log('Link: http://localhost:'+ puerto+'/login.html');
});
