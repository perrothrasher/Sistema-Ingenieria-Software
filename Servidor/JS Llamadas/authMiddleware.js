const jtw = require('jsonwebtoken');

function verificarToken(req, res, next){
    // se obtiene el token desde la peticion
    const token = req.cookies.token;

    //se comprueba que el token exista
    if(!token){
        return res.status(401).json({message: 'Acceso denegado, se requiere Iniciar Sesión'});
    }
    try{
        // se verifica que el token es valido
        const decoded = jtw.verify(token, process.env.JWT_SECRET);

        // si es valido se almacenan los datos del token en el objeto de la peticion
        req.usuario = decoded;
        next();
    } catch(error){
        // si el token es invalido, se bloquea el acceso
        res.status(403).json({message: 'Token inválido o expirado, inicie Sesión nuevamente.'});
    }
}

module.exports = verificarToken;