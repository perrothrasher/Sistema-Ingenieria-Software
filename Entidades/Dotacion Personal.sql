-- SE DEBE CORRER EL SCRIPT COMPLETO
CREATE DATABASE IngenieriaSoftware;
USE IngenieriaSoftware;
-- -----------------------------------------------------
-- Tabla Meses
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS Mes (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(20) NOT NULL,
  PRIMARY KEY (id)
);

INSERT INTO Mes (nombre) VALUES
  ('Enero'),
  ('Febrero'),
  ('Marzo'),
  ('Abril'),
  ('Mayo'),
  ('Junio'),
  ('Julio'),
  ('Agosto'),
  ('Septiembre'),
  ('Octubre'),
  ('Noviembre'),
  ('Diciembre');
-- -----------------------------------------------------
-- Tabla TipoContrato
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS TipoContrato (
  id INT NOT NULL AUTO_INCREMENT,
  nombre VARCHAR(20) NOT NULL UNIQUE, -- Nombre (part time o full time)
  PRIMARY KEY (id)
);

INSERT INTO TipoContrato (nombre)
VALUES ('Full Time'), ('Part Time');

-- -----------------------------------------------------
-- Tabla DotaciónPersonal
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS DotacionPersonal (
  id INT NOT NULL AUTO_INCREMENT,
  anio SMALLINT NOT NULL,
  mes_id INT NOT NULL,
  TipoContrato_id INT NOT NULL,
  cantidad_personal INT NOT NULL,
  carga_horaria INT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_periodo_contrato (anio, mes_id, TipoContrato_id),
    FOREIGN KEY (TipoContrato_id) -- Llave foranea que llama a la tabla TipoContrato
		REFERENCES TipoContrato (id)
		ON UPDATE CASCADE 
		ON DELETE RESTRICT,
	FOREIGN KEY (mes_id) -- Llave foranea que llama a la tabla Mes
		REFERENCES Mes (id)
        ON UPDATE CASCADE 
		ON DELETE RESTRICT
);
