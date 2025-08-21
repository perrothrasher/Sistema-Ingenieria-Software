const cors = require('cors');

// Configuración de CORS
const corsOptions = {
    origin: 'http://localhost', 
    methods: 'GET,POST, DELETE, PUT', 
    allowedHeaders: 'Content-Type, Authorization'
    };

module.exports = corsOptions;