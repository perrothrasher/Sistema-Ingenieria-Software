-- -----------------------------------------------------
-- Tabla Trabajador
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Trabajador(
	id INT NOT NULL AUTO_INCREMENT,
    usuario VARCHAR(50) NOT NULL,
    contrasena VARCHAR (100) NOT NULL,
    persona_id INT NOT NULL,
    rol_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (persona_id) REFERENCES Persona(id) ON DELETE CASCADE, -- Referencia a la tabla Persona
    FOREIGN KEY (rol_id) REFERENCES Rol(id) ON DELETE CASCADE -- Referencia a la tabla Rol
);

-- -----------------------------------------------------
-- Tabla Persona
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Persona(
	id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL,
    apellido VARCHAR(50) NOT NULL,
    rut VARCHAR(20) NOT NULL,
    telefono VARCHAR(50) NOT NULL,
    correo VARCHAR(50) NOT NULL,
    ubicacion_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (ubicacion_id) REFERENCES Ubicacion(id) ON DELETE CASCADE -- Referencia a la tabla Ubicacion
);

-- -----------------------------------------------------
-- Tabla Rol
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Rol (
	id INT NOT NULL AUTO_INCREMENT,
    nombre VARCHAR (20) NOT NULL UNIQUE,
    PRIMARY KEY (id)
);

INSERT INTO Rol (nombre)
VALUES ('Soporte TI'), ('Gerente'), ('Supervisor');

-- -----------------------------------------------------
-- Tabla Ubicación
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Ubicacion(
	id INT NOT NULL AUTO_INCREMENT,
    direccion VARCHAR (100) NOT NULL,
    ciudad VARCHAR (50) NOT NULL,
    region_id INT NOT NULL,
    postal INT NOT NULL,
    PRIMARY KEY(id),
    FOREIGN KEY (region_id) REFERENCES Region(id) ON DELETE CASCADE
);

-- -----------------------------------------------------
-- Tabla Region
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Region(
	id INT NOT NULL AUTO_INCREMENT,
	nombre VARCHAR (50) NOT NULL,
    PRIMARY KEY (id)
);

INSERT INTO Region (nombre) VALUES
  ('Arica y Parinacota'),
  ('Tarapacá'),
  ('Antofagasta'),
  ('Atacama'),
  ('Coquimbo'),
  ('Valparaíso'),
  ('Región Metropolitana de Santiago'),
  ('O’Higgins'),
  ('Maule'),
  ('Ñuble'),
  ('Biobío'),
  ('La Araucanía'),
  ('Los Ríos'),
  ('Los Lagos'),
  ('Aysén del General Carlos Ibáñez del Campo'),
  ('Magallanes y de la Antártica Chilena');

-- -----------------------------------------------------
-- Tabla Cliente
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Cliente(
	id INT NOT NULL AUTO_INCREMENT,
	persona_id INT NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (persona_id) REFERENCES Persona(id) ON DELETE CASCADE  -- Referencia a la tabla Persona
);