-- inserción de prueba
INSERT INTO DotacionPersonal (anio, mes_id, TipoContrato_id, cantidad_personal, carga_horaria)
VALUES
	(2025, 8, 1, 50, 80),
    (2024, 7, 2, 30, 40),
    (2025, 12, 2, 15, 20),
    (2025, 8, 2, 50, 80);

-- tabla original
SELECT * FROM DotacionPersonal;

-- Formato de la tabla, y como se realizan las consultas dentro de la tabla de dotaciones
SELECT
	d.id,
	d.anio,
    m.nombre AS mes,
    t.nombre AS tipo_contrato,
    d.cantidad_personal,
    d.carga_horaria
FROM
	DotacionPersonal AS d
JOIN
	TipoContrato t ON d.TipoContrato_id = t.id
JOIN
	Mes m ON d.mes_id = m.id
ORDER BY d.anio DESC, m.id DESC;

-- Actualizar dentro de la tabla
UPDATE DotacionPersonal d
JOIN TipoContrato t ON d.TipoContrato_id = t.id
SET d.mes_id = 1, -- mes (1-12)
	d.anio = 2025, -- año que se desea
    d.TipoContrato_id = 1, -- tipo de contrato, 1 fulltime, 2 partime
    d.cantidad_personal = 100, -- cantidad de personal
    d.carga_horaria = 100 -- carga horaria
WHERE d.id = 3; -- id que se desea actualizar, para consultar por id ver la consulta de arriba

-- Consulta que se realiza a la tabla cuando se desea editar la dotación
SELECT
	d.id,
	d.anio,
    d.mes_id AS mes,
    d.TipoContrato_id,
    d.cantidad_personal,
    d.carga_horaria
FROM
	DotacionPersonal AS d
JOIN
	TipoContrato t ON d.TipoContrato_id = t.id
JOIN
	Mes m ON d.mes_id = m.id
ORDER BY d.anio DESC, m.id DESC;