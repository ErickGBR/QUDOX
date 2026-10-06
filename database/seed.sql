/*
 * QUDOX — Prueba Técnica Full Stack Developer
 * Entregable: datos de demostración (seed idempotente)
 * Archivo: database/seed.sql
 * Fecha: 2026-10-06
 *
 * PROPOSITO
 *   Semilla para las 4 tablas definidas en database/payroll.sql.
 *   Cada bloque va protegido con IF NOT EXISTS (SELECT 1 FROM <tabla>)
 *   y usa INSERT ... VALUES plano (sin variables, sin MERGE, sin SELECT).
 *
 * COBERTURA DE LOS CASOS DE PRUEBA
 *   Consulta 1 -> Planilla 1 (2026-09 'Aprobada') con movimientos en 3 centros de
 *                 costo; Ventas queda SIN movimientos para ejercitar el NULL trap
 *                 (COALESCE a 0). Filtro e.Activo = 1 se ejercita porque hay 2
 *                 empleados dados de baja (EmpleadoId 11 y 12) sin movimientos.
 *   Consulta 2 -> Planilla 4 (2026-09 'Borrador') deliberadamente descuadrada:
 *                 Debitos 157.50 <> Creditos 1000.00.
 *   Consulta 3 -> Planilla 2 contiene el duplicado exacto
 *                 (PlanillaId = 2, EmpleadoId = 10, 'Horas extra') x2.
 *   sp_AprobarPlanilla -> Planilla 2 ('Borrador', CUADRADA) es la candidata para
 *                 aprobar sin error; Planilla 4 ('Borrador', descuadrada) dispara
 *                 el error 50003; Planilla 1 ('Aprobada') dispara 50004;
 *                 Planilla 3 ('EnviadaSAP') dispara 50002.
 *   UI (estados) -> Planilla 2 'Borrador' habilita el boton de aprobacion;
 *                 Planilla 3 'EnviadaSAP' ejercita el estado 'ya enviada'.
 *
 * IDs EXPLICITOS
 *   Se usan IDs literales (CentroCostoId 1..4, EmpleadoId 1..12, PlanillaId 1..4)
 *   porque las columnas son IDENTITY(1,1) y los guards IF NOT EXISTS garantizan
 *   tablas VACIAS antes de cada bloque. Si la tabla ya tiene filas, el bloque se
 *   omite integramente (no hay riesgo de IDs pisados).
 *
 * DOMINIOS RESPECTADOS (de payroll.sql)
 *   Monto  DECIMAL(18,2) con maximo 2 decimales y siempre > 0 (CK_PlanillaDetalle_Monto_Positivo)
 *   Estado IN ('Borrador','Aprobada','EnviadaSAP')  (CK_Planillas_Estado)
 *   Tipo   IN ('D','C')                             (CK_PlanillaDetalle_Tipo)
 *   Periodo 'YYYY-MM'                               (CK_Planillas_Periodo_Formato)
 *
 * CONVENCION DE TIPO (no la define el DDL; documentada aqui)
 *   'C' (credito) = devengos del empleado : Sueldo base, Horas extra, Bonificacion
 *   'D' (debito)  = descuentos/aplicaciones: Anticipo, Descuento SS, ISR
 *   Los montos se eligieron para que Debitos = Creditos en las planillas que deben
 *   cuadrar, porque sp_AprobarPlanilla exige balance exacto (error 50003).
 *
 * EJECUCION: se aplica automaticamente al levantar el stack, via docker/init-db.sh
 *   (corre payroll.sql y despues este archivo). Tambien puede ejecutarse a mano con
 *   sqlcmd, siempre despues de haber aplicado payroll.sql.
 */

-- ============================================================
-- 1. CENTROS DE COSTO — base de la Consulta 1 (agregacion por centro)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM CentrosCosto)
BEGIN
    -- Consulta 1: los 4 centros deben aparecer aunque solo 3 tengan movimientos
    -- en 2026-09 'Aprobada' (Ventas -> 0 / 0 gracias a COALESCE, no NULL).
    INSERT INTO CentrosCosto (Nombre)
    VALUES ('Producción'),
           ('Logística'),
           ('Administración'),
           ('Ventas');
END;

-- ============================================================
-- 2. EMPLEADOS — Consulta 1 filtra Activo = 1 (2 bajas prueban el filtro)
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM Empleados)
BEGIN
    -- Consulta 1: JOIN Empleados con e.Activo = 1; los 12 aparecen en el LEFT JOIN
    -- desde CentrosCosto pero solo los 10 activos aportan movimientos.
    INSERT INTO Empleados (Nombre, CentroCostoId, Activo)
    VALUES ('Ana López',      1, 1),   -- Producción
           ('Bruno Díaz',     1, 1),   -- Producción
           ('Carla Ruiz',     1, 1),   -- Producción
           ('Diego Soto',     2, 1),   -- Logística
           ('Elena Paz',      2, 1),   -- Logística
           ('Fabián Gil',     3, 1),   -- Administración
           ('Gabriela Vera',  3, 1),   -- Administración
           ('Paola Céspedes', 4, 1),   -- Ventas
           ('Iván Mora',      4, 1),   -- Ventas
           ('Julia Núñez',    4, 1),   -- Ventas
           ('Kevin Ortiz',    4, 0),   -- Baja: NO debe sumar en Consulta 1
           ('Laura Sáez',     1, 0);   -- Baja: NO debe sumar en Consulta 1
END;

-- ============================================================
-- 3. PLANILLAS — cabeceras: los 3 estados válidos + la descuadrada
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM Planillas)
BEGIN
    -- PlanillaId 1 'Aprobada'  -> Consulta 1 (única 2026-09 aprobada con detalle)
    --                          -> sp_AprobarPlanilla error 50004 (ya aprobada)
    -- PlanillaId 2 'Borrador'  -> UI habilita botón; sp_AprobarPlanilla la aprueba
    --                          (está cuadrada) si se invoca
    -- PlanillaId 3 'EnviadaSAP'-> UI estado 'ya enviada'; sp error 50002;
    --                          ejercita ReferenciaSap y EnviadaSapEn
    -- PlanillaId 4 'Borrador'  -> descuadrada; sp error 50003; Consulta 2 la detecta
    INSERT INTO Planillas (Periodo, Estado, ReferenciaSap, EnviadaSapEn)
    VALUES ('2026-09', 'Aprobada',   NULL,                   NULL),
           ('2026-09', 'Borrador',   NULL,                   NULL),
           ('2026-08', 'EnviadaSAP', 'SAP-2026-08-000117',   '2026-09-05T02:30:00'),
           ('2026-09', 'Borrador',   NULL,                   NULL);
END;

-- ============================================================
-- 4. PLANILLA DETALLE — movimientos de las 4 planillas
-- ============================================================
IF NOT EXISTS (SELECT 1 FROM PlanillaDetalle)
BEGIN
    -- --------------------------------------------------------
    -- PlanillaId 1 — 2026-09 'Aprobada': planilla principal de demo.
    -- CUADRA exacto a 2 decimales: Debitos 4255.75 = Creditos 4255.75
    -- (requisito de sp_AprobarPlanilla, error 50003 si falla).
    -- 19 filas, 5 empleados, 3 centros de costo, los 6 conceptos.
    -- Ejercita: Consulta 1 (totales por centro, 2026-09, solo 'Aprobada')
    --           y sp_AprobarPlanilla (paso 4: calculo de totales).
    -- --------------------------------------------------------
    INSERT INTO PlanillaDetalle (PlanillaId, EmpleadoId, Concepto, Monto, Tipo)
    VALUES
    -- Creditos (devengos) = 4255.75
    (1, 1, 'Sueldo base',  850.00, 'C'),
    (1, 2, 'Sueldo base',  780.00, 'C'),
    (1, 3, 'Sueldo base',  720.00, 'C'),
    (1, 4, 'Sueldo base',  650.00, 'C'),
    (1, 6, 'Sueldo base',  900.00, 'C'),
    (1, 1, 'Horas extra',  120.50, 'C'),
    (1, 4, 'Horas extra',   85.25, 'C'),
    (1, 2, 'Bonificación', 150.00, 'C'),
    -- Debitos = 4255.75 (292.50 SS + 220.00 ISR + 3743.25 anticipos)
    (1, 1, 'Descuento SS',  63.75, 'D'),
    (1, 2, 'Descuento SS',  58.50, 'D'),
    (1, 3, 'Descuento SS',  54.00, 'D'),
    (1, 4, 'Descuento SS',  48.75, 'D'),
    (1, 6, 'Descuento SS',  67.50, 'D'),
    (1, 1, 'ISR',           85.00, 'D'),
    (1, 6, 'ISR',          135.00, 'D'),
    (1, 1, 'Anticipo',    1200.00, 'D'),
    (1, 2, 'Anticipo',     900.00, 'D'),
    (1, 3, 'Anticipo',     900.00, 'D'),
    (1, 4, 'Anticipo',     743.25, 'D'),

    -- --------------------------------------------------------
    -- PlanillaId 2 — 2026-09 'Borrador': botón habilitado en UI.
    -- CUADRA: Debitos 1670.00 = Creditos 1670.00 (aprobable por el SP).
    -- CONTIENE EL DUPLICADO PARA LA CONSULTA 3:
    --   (PlanillaId=2, EmpleadoId=10, 'Horas extra') aparece 2 veces.
    -- Es el UNICO (PlanillaId, EmpleadoId, Concepto) repetido de todo el seed.
    -- --------------------------------------------------------
    (2,  8, 'Sueldo base',  700.00, 'C'),
    (2,  9, 'Sueldo base',  680.00, 'C'),
    (2, 10, 'Bonificación', 200.00, 'C'),
    (2, 10, 'Horas extra',   45.00, 'C'),   -- fila original   (Consulta 3: Rn=1)
    (2, 10, 'Horas extra',   45.00, 'C'),   -- DUPLICADO       (Consulta 3: Rn=2)
    (2,  8, 'Descuento SS',  52.50, 'D'),
    (2,  9, 'Descuento SS',  51.00, 'D'),
    (2, 10, 'Descuento SS',  15.00, 'D'),
    (2,  8, 'ISR',           70.00, 'D'),
    (2,  9, 'ISR',           68.00, 'D'),
    (2, 10, 'ISR',           20.00, 'D'),
    (2,  8, 'Anticipo',     650.00, 'D'),
    (2,  9, 'Anticipo',     743.50, 'D'),

    -- --------------------------------------------------------
    -- PlanillaId 3 — 2026-08 'EnviadaSAP': estado ya enviado.
    -- CUADRA: Debitos 2730.00 = Creditos 2730.00.
    -- Sin duplicados; ejercita la UI 'ya enviada' y el error 50002 del SP.
    -- --------------------------------------------------------
    (3, 1, 'Sueldo base',  850.00, 'C'),
    (3, 4, 'Sueldo base',  650.00, 'C'),
    (3, 5, 'Sueldo base',  620.00, 'C'),
    (3, 7, 'Sueldo base',  610.00, 'C'),
    (3, 1, 'Descuento SS',  63.75, 'D'),
    (3, 4, 'Descuento SS',  48.75, 'D'),
    (3, 5, 'Descuento SS',  46.50, 'D'),
    (3, 7, 'Descuento SS',  45.75, 'D'),
    (3, 1, 'ISR',           85.00, 'D'),
    (3, 4, 'ISR',           60.00, 'D'),
    (3, 1, 'Anticipo',     800.00, 'D'),
    (3, 5, 'Anticipo',     700.00, 'D'),
    (3, 7, 'Anticipo',     880.25, 'D'),

    -- --------------------------------------------------------
    -- PlanillaId 4 — 2026-09 'Borrador': DELIBERADAMENTE DESCUADRADA.
    -- Debitos 157.50 <> Creditos 1000.00.
    -- Ejercita: Consulta 2 (la detecta en cualquier estado)
    --           sp_AprobarPlanilla error 50003 (descuadrada).
    -- Sin duplicados: (PlanillaId, EmpleadoId, Concepto) unicos.
    -- --------------------------------------------------------
    (4, 6, 'Sueldo base',  900.00, 'C'),
    (4, 6, 'Horas extra',  100.00, 'C'),
    (4, 6, 'Descuento SS',  67.50, 'D'),
    (4, 6, 'ISR',           90.00, 'D');
END;
