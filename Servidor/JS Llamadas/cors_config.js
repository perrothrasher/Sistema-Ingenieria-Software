const cors = require('cors');

// Configuración de CORS.
const corsOptions = {
    origin: 'http://localhost:8090', 
    methods: 'GET,POST, DELETE, PUT', 
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true
    };

module.exports = corsOptions;