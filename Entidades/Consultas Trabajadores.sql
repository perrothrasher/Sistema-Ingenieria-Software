-- -----------------------------------------------------
-- Consultas
-- -----------------------------------------------------

-- Consulta para enseñar tabla donde:
-- Muestra: 
-- id (Trabajador), usuario (Trabajador), contraseña (Trabajador), nombre (Persona), apellido (Persona)
-- rut (Persona), correo (Persona), nombre (Rol), direccion (Ubicacion), ciudad (Ubicacion)
-- Region ID (Ubicacion), nombre Region (Region), postal (Ubicacion)
SELECT t.id, t.usuario, t.contrasena, p.nombre, p.apellido, p.rut, p.telefono, p.correo, r.nombre AS rol,
u.direccion, u.ciudad, u.region_id AS id_region, g.nombre AS Region, u.postal, r.id AS rol_id
FROM Trabajador t
JOIN Persona p ON t.persona_id = p.id
JOIN Rol r ON t.rol_id = r.id
JOIN Ubicacion u ON p.ubicacion_id = u.id
JOIN Region g ON u.region_id = g.id;

SELECT t.id, t.usuario, p.correo, r.nombre AS rol, r.id AS id_rol
FROM Trabajador t
JOIN Persona P ON t.persona_id = p.id
JOIN Rol r ON t.rol_id = r.id;

SELECT * FROM Trabajador;
SELECT * FROM Persona;
SELECT * FROM Ubicacion ORDER BY id ASC;
SELECT * FROM Cliente;
SELECT * FROM Region;

DELETE FROM Trabajador WHERE id= 3;
DELETE FROM Persona WHERE id= 3;
DELETE FROM Ubicacion WHERE id BETWEEN 37 AND 40;
DELETE FROM Persona WHERE id BETWEEN 18 AND 19;

DELETE FROM Persona WHERE id= (
	SELECT persona_id FROM Trabajador WHERE id = 3
);

-- Consulta para Eliminar
DELETE t, p, u
FROM Trabajador t
JOIN Persona p ON t.persona_id = p.id
JOIN Ubicacion U ON p.ubicacion_id = u.id
WHERE t.id = 1;

SELECT 
        t.id, 
        t.usuario, 
        t.contrasena, 
        p.nombre, 
        p.apellido, 
        p.rut, 
        p.telefono, 
        p.correo, 
        r.nombre AS rol,
        r.id AS rol_id
    FROM Trabajador t
    JOIN Persona p ON t.persona_id = p.id
    JOIN Rol r ON t.rol_id = r.id
    WHERE p.correo = 'francisco.reyes@admin.cl';
    
SELECT * FROM Region WHERE id = 7;

INSERT INTO Ubicacion (direccion, ciudad, region_id, postal) 
VALUES ('Calle Falsa 123', 'Santiago', 7, 9340000);

UPDATE Persona p
        JOIN Trabajador t ON t.persona_id = p.id
        JOIN Ubicacion u ON u.id = p.ubicacion_id
        SET
            p.nombre = 'Juan', 
            p.apellido = 'Pérez', 
            p.rut = '12345678-9', 
            p.telefono = '987654321', 
            p.correo = 'juan.perez@mail.com', 
            u.direccion = 'Avenida Libertador 123', 
            u.ciudad = 'Colina', 
            u.postal = '7500000', 
            u.region_id = '7',
            t.rol_id = '3'
        WHERE t.id = 1;