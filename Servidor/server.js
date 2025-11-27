// Servidor/server.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const https = require('https');
const ejs = require('ejs');
const mysql = require('mysql2/promise'); // <--- AGREGA ESTA LÍNEA
require('dotenv').config();

/////////////////////////////////////////////////
const app = express();
app.set('trust proxy', 1);
app.set('views', path.join(__dirname, '..', 'Front', 'views'));
app.set('view engine', 'ejs');
app.get('/login.html', (req, res) => { res.render('login'); });
app.get('/index.html', (req, res) => { res.render('index'); });
app.get('/carga_datos_historicos.html', (req, res) => { res.render('carga_datos_historicos'); });
app.get('/dotacion_personal.html', (req, res) => { res.render('dotacion_personal'); });
app.get('/editar_cliente.html', (req, res) => { res.render('editar_cliente'); });
app.get('/editar_trabajador.html', (req, res) => { res.render('editar_trabajador'); });
app.get('/editar.html', (req, res) => { res.render('editar'); });
app.get('/editar2.html', (req, res) => { res.render('editar2'); });
app.get('/editar3.html', (req, res) => { res.render('editar3'); });
app.get('/estado_sistema.html', (req, res) => { res.render('estado_sistema'); });
app.get('/historial.html', (req, res) => { res.render('historial'); });
app.get('/prediccion.html', (req, res) => { res.render('prediccion'); });
app.get('/registro_cliente.html', (req, res) => { res.render('registro_cliente'); });
app.get('/registro2.html', (req, res) => { res.render('registro2'); });
app.get('/ver_auditoria.html', (req, res) => { res.render('ver_auditoria'); });
app.get('/ver_cliente.html', (req, res) => { res.render('ver_cliente'); });
app.get('/ver_trabajador.html', (req, res) => { res.render('ver_trabajador'); });
app.get('/visualizar_datos_historicos.html', (req, res) => { res.render('visualizar_datos_historicos'); });
app.get('/servicios.html', (req, res) => { res.render('servicios'); });
app.get('/mandantes.html', (req, res) => { res.render('mandantes'); });
app.get('/usuariosPrendas.html', (req, res) => { res.render('usuariosPrendas'); });
app.use(express.static(path.join(__dirname, '..', 'Front')));
app.use(express.json());
app.use(cookieParser());
/////////////////////////////////////////////////

const MONGO_URI = process.env.MONGO_URI
const MONGO_DB  = process.env.MONGO_DB 
const PUERTO    = process.env.PORT      || 8090; 

// =================================================================
// 2. CONFIGURACIÓN MYSQL (Para el modelo predictivo)
// =================================================================
const mysqlConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,  
    password: process.env.DB_PASSWORD,         
    database: process.env.DB_NAME, 
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const dbSql = mysql.createPool(mysqlConfig);

app.locals.db = dbSql;

dbSql.getConnection()
    .then(conn => {
        console.log('✅ [MySQL] Conectado correctamente.');
        conn.release();
    })
    .catch(err => {
        console.error('❌ [MySQL] Error de conexión:', err.message);
    });
// =================================================================

/////////////////////////////////////////////////
const corsOptions = require('./JS Llamadas/cors_config.js'); // Configuración de CORS.
app.use(cors(corsOptions)); 
const registrarTrabajador = require('./JS Llamadas/registrar_trabajador.js'); // Registrar trabajador
const login = require('./JS Llamadas/login.js'); // Iniciar sesión
const verificarToken = require('./JS Llamadas/authMiddleware.js');
const { registrarAuditoria, obtenerAuditoriaPorUsuario } = require('./JS Llamadas/auditoria.js');
const auditoriaRoutes = require('./JS Llamadas/auditoria_rutas.js');
const { registrarCliente, editarClientes, eliminarCliente, generarReporteClientes} = require('./JS Llamadas/cliente.js');
const { obtenerTrabajadores, editarTrabajadores, eliminarTrabajadores, listarTrabajadores, generarReporteTrabajadores, actualizarTipoContrato } = require('./JS Llamadas/trabajadores.js'); 
const { registrarDotacion, obtenerDotaciones, editarDotacion, obtenerDotacionesParaEdicion, generarReporteDotacion, eliminarDotacion, reestablecerDotacion, obtenerDatosHistoricos } = require('./JS Llamadas/dotacion.js');
const { obtenerHistoricos } = require('./JS Llamadas/historicos.js'); 
const { registrarOperacionHistorica } = require('./JS Llamadas/op_hist_manual.js');
const { actualizarHistorico } = require('./JS Llamadas/historicos.js');
const { listarMandantes, registrarMandante, eliminarMandante, editarMandante, recuperarNombreAnterior} = require('./JS Llamadas/mandantes.js');
const { añadirUsuario, listarUsuarios, eliminarUsuario} = require('./JS Llamadas/usuarios.js');
const {registrarProduccionMasiva} = require('./JS Llamadas/servicios.js');
const {obtenerKPIs, obtenerDatosGraficos} = require('./JS Llamadas/dashboard.js');
const conexion_Mongo = require('./JS Llamadas/mongo_connection.js');
/////////////////////////////////////////////////

// DASHBOARD Y KPIs
/////////////////////////////////////////////////
// vista
app.get('/dashboard.html', verificarToken, (req, res) => { res.render('dashboard'); });
// datos
app.get('/api/dashboard/kpis', verificarToken, obtenerKPIs);
// grafico
app.get('/api/dashboard/graficos', verificarToken, obtenerDatosGraficos);
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
// Ruta para actualizar tipo de contrato de un trabajador
app.put('/api/trabajadores/:id/contrato', verificarToken, actualizarTipoContrato);
/////////////////////////////////////////////////

// MANDANTES
/////////////////////////////////////////////////
// Ruta para listar mandantes (id, nombre, fecha_ingreso, total_folios)
app.get('/get-mandantes', listarMandantes);
// Ruta para registrar un mandante
app.post('/registrar-mandante', verificarToken, registrarMandante);
// Ruta para eliminar un mandante
app.delete('/eliminar-mandante/:id', verificarToken, eliminarMandante);
// Ruta para editar un mandante
app.put('/editar-mandante/:id', verificarToken, editarMandante);
// Ruta para recuperar el nombre anterior de un mandante
app.get('/recuperar-nombre/:id', verificarToken, recuperarNombreAnterior);
/////////////////////////////////////////////////

// USUARIOS DE PRENDAS
/////////////////////////////////////////////////
// Ruta para añadir un usuario de prendas
app.post('/registrar-usuario', añadirUsuario);
// Ruta para listar usuarios de prendas
app.get('/get-usuarios', listarUsuarios);
// Ruta para eliminar un usuario de prendas
app.delete('/eliminar-usuario/:id', verificarToken, eliminarUsuario);
/////////////////////////////////////////////////

// SERVICIOS
/////////////////////////////////////////////////
// Ruta para registrar producción masiva
app.post('/registrar-produccion-masiva', registrarProduccionMasiva);
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
// Ruta para eliminar una dotación
app.delete('/eliminarDotacion/:id', verificarToken, eliminarDotacion);
// Ruta para reestablecer una dotación eliminada
app.put('/reestablecerDotacion/:id', verificarToken, reestablecerDotacion);
// Ruta para obtener datos históricos de dotación
app.get('/api/historicos/dotacion', obtenerDatosHistoricos);
/////////////////////////////////////////////////

// HISTÓRICOS 
/////////////////////////////////////////////////
app.get('/historicos', obtenerHistoricos);
app.post('/operacion-historica', registrarOperacionHistorica);  // CU14 (manual)
app.put('/historicos/:tipo/:id', actualizarHistorico);          // CU19 (editar)
/////////////////////////////////////////////////

// ===== NUEVO: montar rutas de predicción SIN tocar lo demás =====
const prediccionRouter = require('./JS Llamadas/prediccion.js'); // <- nuevo archivo con la lógica de IA
app.use('/prediccion', verificarToken,prediccionRouter);
// ================================================================

// Inicialización del servidor HTTPS
const CERT_COLLECTION = 'configuracion';
const CERT_ID = 'ssl-localhost';

app.locals.mongoReady = (async () => {
  let db;
  try{
    db = await conexion_Mongo();
    app.locals.getDB = () => db;

    const sslConfig = await db.collection(CERT_COLLECTION).findOne({ _id: CERT_ID });

    if (!sslConfig || !sslConfig.key || !sslConfig.cert) {
      throw new Error(`No se encontró la configuración SSL con _id: ${CERT_ID} en la base de datos.`);
    }

    const httpsOptions = {
      key: sslConfig.key,
      cert: sslConfig.cert
    };

    https.createServer(httpsOptions, app).listen(PUERTO,()=>{
      console.log(`¡Servidor HTTPS seguro corriendo en el puerto ${PUERTO}!`);
      console.log(`Accede en: https://localhost:${PUERTO}/login.html`);
    });

    return db;
    
  } catch(err){
    console.error('Error fatal durante el arranque del servidor:', err.message);
    process.exit(1);
  }
})();

process.on('SIGINT', () => process.exit(0));