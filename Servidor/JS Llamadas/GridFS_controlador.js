const {GridFSBucket, ObjectId} = require('mongodb');
const streamifier = require('streamifier');
const conexion_Mongo = require('./mongo_connection.js');

// Subida del archivo a MongoDB
const subirArchivo = async (req, res) =>{
    if(!req.file){
        return res.status(400).json({error: 'No se ha proporcionado ningún archivo'});
    }

    try{
        const db = await conexion_Mongo();
        const bucket = new GridFSBucket(db, {bucketName: 'archivos'});

        const buffer = req.file.buffer;
        const nombreArchivo = req.file.originalname;

        const uploadStream = bucket.openUploadStream(nombreArchivo,{
            metadata:{
                mimeType: req.file.mimetype,
                fechaSubida: new Date() //Fecha actual
            }
        });

        streamifier.createReadStream(buffer).pipe(uploadStream)
        .on('error', (err) =>{
            console.error('Error al subir el archivo a GridFS:', err);
            return res.status(500).json({error: 'Error al subir el archivo'});
        })
        .on('finish', () =>{
            console.log(`Archivo "${nombreArchivo}" subido con ID:`, uploadStream.id);
            return res.status(201).json({
                message: 'Archivo subido exitosamente',
                fileId: uploadStream.id,
                filename: nombreArchivo
            });
        });
    }
    catch(error){
        console.error('Error subiendo el archivo:', error);
        res.status(500).json({error: 'Error interno del servidor'});
    }
};

const descargarArchivo = async (req, res) =>{
    try{
        const db = await conexion_Mongo();
        const bucket = new GridFSBucket(db, {bucketName: 'archivos'});
        const filename = req.params.filename;
        
        const files = await bucket.find({filename: filename}).toArray();
        if(files.length === 0){
            return res.status(404).json({error: 'Archivo no encontrado'});
        }

        // Tipo de contenido para que el navegador lo maneje correctamente
        res.set('Content-Type', files[0].metadata.mimeType || 'application/octet-stream');

        const downloadStream = bucket.openDownloadStreamByName(filename);
        downloadStream.pipe(res)
        .on('error', (err) =>{
            console.error('Error al descargar el archivo desde GridFS:', err);
            res.status(404).json({error: 'Archivo no encontrado'});
        });
    } catch(error){
        console.error('Error general al descargar el archivo:', error);
        res.status(500).json({error: 'Error interno del servidor'});
    }
};

const listarArchivos = async (req, res) =>{
    try{
        const db = await conexion_Mongo();
        const bucket = new GridFSBucket(db, {bucketName: 'archivos'});
        const archivos = await bucket.find({}).toArray();

        if(!archivos || archivos.length === 0){
            return res.status(404).json({error: 'No se encontraron archivos'});
        }

        // Mapeo
        const fileInfos = archivos.map(file => ({
            id: file._id,
            filename: file.filename,
            uploadDate: file.uploadDate,
            contentType: file.metadata.mimeType
        }));
        
        res.status(200).json(fileInfos);
    } catch(error){
        console.error('Error al listar los archivos:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
const eliminarArchivo = async (req, res) =>{
    try{
        const fileId = req.params.id;

        if(!fileId){
            return res.status(400).json({error: 'Falta el ID del archivo'});
        }
        const db = await conexion_Mongo();
        const bucket = new GridFSBucket(db, {bucketName: 'archivos'});

        // convertir el string del id a ObjectId de mongo
        const objectId = new ObjectId(fileId);

        // bucket.id se encarga de eliminar los chunks y el archivo
        await bucket.delete(objectId);
        res.status(200).json({message: 'Archivo eliminado exitosamente'});
    }catch(error){
        console.error('Error al eliminar el archivo:', error);

        // si el id tiene un formato invalido
        if(error.message.includes('Argument passed in must be a single String of 12 bytes or a string of 24 hex characters')){
            return res.status(400).json({error: 'el ID del archivo tiene un formato inválido'});
        }
        res.status(500).json({error: 'Error interno del servidor'});
}
};

module.exports = {
    subirArchivo,
    descargarArchivo,
    listarArchivos,
    eliminarArchivo
};