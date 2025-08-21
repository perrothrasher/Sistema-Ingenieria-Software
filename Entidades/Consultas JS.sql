
-- -----------------------------------------------------
-- SCRIPT: INSERTAR NUEVA UBICACIÓN 
-- -----------------------------------------------------
INSERT INTO Ubicacion (direccion, ciudad, region_id, postal)
      VALUES (?, ?, ?, ?);
      
-- -----------------------------------------------------
-- SCRIPT: INSERTAR ID UBICACIÓN EN PERSONA
-- -----------------------------------------------------
INSERT INTO Persona (nombre, apellido, rut, telefono, correo, ubicacion_id)
      VALUES (?, ?, ?, ?, ?, ?);
      
-- -----------------------------------------------------
-- SCRIPT: INSERTAR TRABAJADOR
-- -----------------------------------------------------
INSERT INTO Trabajador (usuario, contrasena, persona_id, rol_id)
        VALUES (?, ?, ?, ?);
        
-- -----------------------------------------------------
-- SCRIPT: CONSULTAR TRABAJADORES
-- -----------------------------------------------------
SELECT t.id, t.usuario, t.contrasena, p.nombre, p.apellido, p.rut, p.telefono, p.correo, r.nombre AS rol,
        u.direccion, u.ciudad, u.region_id AS region_id, g.nombre AS Region, u.postal, r.id AS rol_id
        FROM Trabajador t
        JOIN Persona p ON t.persona_id = p.id
        JOIN Rol r ON t.rol_id = r.id
        JOIN Ubicacion u ON p.ubicacion_id = u.id
        JOIN Region g ON u.region_id = g.id;

-- -----------------------------------------------------
-- SCRIPT: EDITAR TRABAJADOR
-- LA LINEA ${contrasena ?} FUNCIONAL UNICAMENTE EN JS
-- -----------------------------------------------------
UPDATE Persona p
        JOIN Trabajador t ON t.persona_id = p.id
        JOIN Ubicacion u ON u.id = p.ubicacion_id
        SET
            p.nombre = ?, 
            p.apellido = ?, 
            p.rut = ?, 
            p.telefono = ?, 
            p.correo = ?, 
            u.direccion = ?, 
            u.ciudad = ?, 
            u.postal = ?, 
            u.region_id = ?,
            t.rol_id = ?,
            ${contrasena ? "t.contrasena = ?" : ""} -- PARAMETRO FUNCIONAL EN SERVER.JS
        WHERE t.id = ?;
        
-- -----------------------------------------------------
-- SCRIPT: ELIMINAR TRABAJADOR
-- -----------------------------------------------------
DELETE t, p, u
        FROM Trabajador t
        JOIN Persona p ON t.persona_id = p.id
        JOIN Ubicacion U ON p.ubicacion_id = u.id
        WHERE t.id = ?;
        
-- -----------------------------------------------------
-- SCRIPT: LOGIN
-- -----------------------------------------------------
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
                    WHERE p.correo = ?;

-- -----------------------------------------------------
-- SCRIPT: REGISTRAR DOTACIÓN
-- -----------------------------------------------------
INSERT INTO DotacionPersonal (anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria)
    VALUES (?, ?, ?, ?, ?);
    
-- -----------------------------------------------------
-- SCRIPT: OBTENER TABLA DOTACIÓN
-- -----------------------------------------------------
SELECT
        d.id,
        d.anio, 
        m.nombre AS mes, 
        t.nombre AS tipo_contrato, 
        d.cantidad_personal, 
        d.carga_horaria
        FROM DotacionPersonal d
        JOIN TipoContrato t ON d.TipoContrato_id = t.id
        JOIN Mes m ON d.mes_id = m.id
        ORDER BY d.anio DESC, m.id DESC;

-- -----------------------------------------------------
-- SCRIPT: OBTENER TABLA DOTACIÓN PARA EDICIÓN
-- -----------------------------------------------------
SELECT
        d.id,
        d.anio, 
        d.mes_id, 
        d.TipoContrato_id, 
        d.cantidad_personal, 
        d.carga_horaria
        FROM DotacionPersonal d
        JOIN TipoContrato t ON d.TipoContrato_id = t.id
        JOIN Mes m ON d.mes_id = m.id
        ORDER BY d.anio DESC, m.id DESC;

-- -----------------------------------------------------
-- SCRIPT: ACTUALIZAR TABLA DOTACIÓN
-- -----------------------------------------------------
UPDATE DotacionPersonal d
        JOIN TipoContrato t ON d.TipoContrato_id = t.id
        SET d.mes_id = ?, 
            d.anio = ?, 
            d.TipoContrato_id = ?, 
            d.cantidad_personal = ?, 
            d.carga_horaria = ? 
        WHERE d.id = ?; 

-- -----------------------------------------------------
-- SCRIPT: INSERTAR CLIENTE
-- -----------------------------------------------------
INSERT INTO Cliente (persona_id)
          VALUES (?);
          
-- -----------------------------------------------------
-- SCRIPT: CONSULTAR CLIENTE
-- -----------------------------------------------------
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

-- -----------------------------------------------------
-- SCRIPT: EDITAR CLIENTE
-- -----------------------------------------------------
UPDATE Persona p
    JOIN Cliente c ON c.persona_id = p.id
    JOIN Ubicacion u ON u.id = p.ubicacion_id
    JOIN Region r ON u.region_id = r.id
    SET
      p.nombre = ?,
      p.apellido = ?,
      p.rut = ?,
      p.telefono = ?,
      p.correo = ?,
      u.direccion = ?,
      u.ciudad = ?,
      u.postal = ?,
      u.region_id = ?
    WHERE c.id = ?;

-- -----------------------------------------------------
-- SCRIPT: ELIMINAR CLIENTE
-- -----------------------------------------------------
DELETE c, p, u
    FROM Cliente c
    JOIN Persona p ON c.persona_id = p.id
    JOIN Ubicacion u ON p.ubicacion_id = u.id
    WHERE c.id = ?;