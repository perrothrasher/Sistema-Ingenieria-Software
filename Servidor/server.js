// Servidor/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

/////////////////////////////////////////////////
// Utilización de express para no utilizar xampp
const app = express();
app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, '..', 'Front')));
app.use(express.json());
app.use(cookieParser());
/////////////////////////////////////////////////

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB  = process.env.MONGO_DB  || 'IngenieriaSoftware';
const PUERTO    = process.env.PORT      || 8090;

/////////////////////////////////////////////////
const corsOptions = require('./JS Llamadas/cors_config.js'); // Configuración de CORS.
app.use(cors(corsOptions)); 
const registrarTrabajador = require('./JS Llamadas/registrar_trabajador.js'); // Registrar trabajador
const login = require('./JS Llamadas/login.js'); // Iniciar sesión
const verificarToken = require('./JS Llamadas/authMiddleware.js');
const { registrarAuditoria } = require('./JS Llamadas/auditoria.js');
const auditoriaRoutes = require('./JS Llamadas/auditoria_rutas.js');
const { registrarCliente, obtenerClientes, editarClientes, eliminarCliente, generarReporteClientes } = require('./JS Llamadas/cliente.js');
const { obtenerTrabajadores, editarTrabajadores, eliminarTrabajadores, listarTrabajadores, generarReporteTrabajadores } = require('./JS Llamadas/trabajadores.js'); 
const { registrarDotacion, obtenerDotaciones, editarDotacion, obtenerDotacionesParaEdicion, generarReporteDotacion } = require('./JS Llamadas/dotacion.js');
const { obtenerHistoricos } = require('./JS Llamadas/historicos.js'); 
const { registrarOperacionHistorica } = require('./JS Llamadas/op_hist_manual.js');
const { actualizarHistorico } = require('./JS Llamadas/historicos.js');
const conexion_Mongo = require('./JS Llamadas/mongo_connection.js');
/////////////////////////////////////////////////

// RUTAS PARA GESTIÓN DE ARCHIVOS (SUBIDA Y DESCARGA)
/////////////////////////////////////////////////
const fileRoutes = require('./JS Llamadas/GridFS_rutas.js');
app.use('/api/archivos', fileRoutes);
/////////////////////////////////////////////////

// RUTAS DE AUDITORÍA 
/////////////////////////////////////////////////
app.use('/api/auditoria', auditoriaRoutes);
//TRABAJADORES
app.post('/register', verificarToken, registrarTrabajador);
app.put('/editarTrabajador/:id', verificarToken, editarTrabajadores);
app.delete('/eliminarTrabajador/:id', verificarToken, eliminarTrabajadores);
//CLIENTES
app.post('/register-cliente', verificarToken, registrarCliente);
app.put('/editarCliente/:id', verificarToken, editarClientes);
app.delete('/eliminarCliente/:id', verificarToken, eliminarCliente);
//DOTACIÓN
app.post('/registrar-dotacion', verificarToken, registrarDotacion);
app.put('/editarDotacion/:id', verificarToken, editarDotacion);
/////////////////////////////////////////////////

// LOGIN
/////////////////////////////////////////////////
// Ruta para iniciar sesión
app.post('/login', login);
// Ruta para cerrar sesión
app.get('/api/perfil', verificarToken, (req, res) => {
  res.json(req.usuario);
});
app.post('/logout', verificarToken, (req, res) => {
  try{
    const ip = req.ip || req.connection.remoteAddress;
    const usuario = req.usuario;

    registrarAuditoria(
      usuario.id,
      `${usuario.nombre} ${usuario.apellido}`,
      'Cierre de sesión',
      ip,
      usuario.rol
    );
  }catch(error){
    console.error('Error registrando auditoría de cierre de sesión:', error);
  }
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
// Ruta para listar trabajadores (id, nombre, apellido)
app.get('/api/usuarios/lista', verificarToken, listarTrabajadores);
// Ruta para generar reporte PDF de trabajadores
app.get('/api/trabajadores/reporte', verificarToken, generarReporteTrabajadores);
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
// Ruta para generar reporte PDF de clientes
app.get('/api/clientes/reporte', verificarToken, generarReporteClientes);
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
// Ruta para generar reporte PDF de dotaciones
app.get('/api/dotacion/reporte', verificarToken, generarReporteDotacion);
/////////////////////////////////////////////////

// HISTÓRICOS 
/////////////////////////////////////////////////
app.get('/historicos', obtenerHistoricos);
app.post('/operacion-historica', registrarOperacionHistorica);  // CU14 (manual)
app.put('/historicos/:tipo/:id', actualizarHistorico);          // CU19 (editar)
/////////////////////////////////////////////////

// ===== NUEVO: montar rutas de predicción SIN tocar lo demás =====
const prediccionRouter = require('./JS Llamadas/prediccion.js'); // <- nuevo archivo con la lógica de IA
app.use('/prediccion', prediccionRouter);
// ================================================================

const httpsOptions ={
  key: fs.readFileSync(path.join(__dirname, 'localhost+2-key.pem')),
  cert: fs.readFileSync(path.join(__dirname, 'localhost+2.pem'))
};

const puerto = 8090;

// Si se cuenta con un certificado SSL, usar HTTPS

https.createServer(httpsOptions, app).listen(puerto, () =>{
  console.log(`¡Servidor HTTPS seguro corriendo en el puerto ${puerto}!`);
  console.log(`Accede en: https://localhost:${puerto}/login.html`);
})

app.locals.mongoReady = (async () => {
  const db = await conexion_Mongo();     // obtiene la DB desde tu helper
  app.locals.getDB = () => db;           // para que los routers hagan req.app.locals.getDB()
  return db;
})();

process.on('SIGINT', () => process.exit(0)); // opcional: tu helper mantiene el cliente
/* 
app.listen(puerto, () => {
  //console.log('Servidor en ejecución en el puerto ' + puerto);
  console.log('Link: http://localhost:'+ puerto+'/login.html');
});
*/
