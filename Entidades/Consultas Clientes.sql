-- -----------------------------------------------------
-- Consultas
-- -----------------------------------------------------
SELECT * FROM Cliente;

SELECT
	c.id AS cliente_id,
    p.id AS persona_id,
    p.nombre,
    p.apellido,
    p.rut,
    p.telefono,
    p.correo,
    u.direccion,
    u.ciudad,
    r.id AS Region_id,
    r.nombre AS Region,
    u.postal
FROM Cliente c
JOIN Persona p ON c.persona_id = p.id
JOIN Ubicacion u ON p.ubicacion_id = u.id
JOIN Region r ON u.region_id = r.id;

-- Consulta para Eliminar
DELETE c, p, u
FROM Cliente c
JOIN Persona p ON c.persona_id = p.id
JOIN Ubicacion u ON p.ubicacion_id = u.id
WHERE c.id = 1;

UPDATE Persona p
    JOIN Cliente c ON c.persona_id = p.id
    JOIN Ubicacion u ON u.id = p.ubicacion_id
    JOIN Region r ON u.region_id = r.id
    SET
      p.nombre = 'Juanito',
      p.apellido = 'Perez',
      p.rut = '12345678-9',
      p.correo = 'juan.perez@email.com',
      p.telefono = '123456789',
      u.direccion = 'El Cerro 1234',
      u.ciudad = 'Colina',
      u.postal = '9340000',
      u.region_id = '7'
    WHERE c.id = 6;
    
    SELECT
        c.id AS id,
        p.id AS persona_id,
        p.nombre,
        p.apellido,
        p.rut,
        p.telefono,
        p.correo,
        u.direccion,
        u.ciudad,
        r.id AS region_id,
        r.nombre AS region,
        u.postal
    FROM Cliente c
    JOIN Persona p ON c.persona_id = p.id
    JOIN Ubicacion u ON p.ubicacion_id = u.id
    JOIN Region r ON u.region_id = r.id;