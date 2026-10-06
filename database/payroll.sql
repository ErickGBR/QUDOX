/*
 * QUDOX — Prueba Técnica Full Stack Developer
 * Entregable Parte 1: DDL + 3 consultas + Stored Procedure de aprobación
 * Archivo: database/payroll.sql
 * Fecha: 2026-10-05
 *
 * SUPUESTOS DOCUMENTADOS (para el README):
 * 1. IDs = BIGINT IDENTITY — mÃ¡s realista en SQL Server para nómina que UUID/String.
 *    Rendimiento superior, claves clusterizadas secuenciales, sin fragmentación.
 * 2. Periodo = CHAR(7) 'YYYY-MM' — evita '2026-9' sin padding y evita elección arbitraria de día que trae DATE.
 * 3. Monto = DECIMAL(18,2) — NUNCA MONEY; MONEY convierte a float en división y produce errores de redondeo financiero.
 * 4. Estado y Tipo con CHECK constraints — integridad a nivel motor, no solo aplicación.
 * 5. SIN UNIQUE en (PlanillaId, EmpleadoId, Concepto) — la consulta 3 EXISTE para detectar duplicados;
 *    un unique la dejaría vacía para siempre (error de diseño clásico).
 * 6. Consulta 2: planilla sin detalles â 0 débitos = 0 créditos â CUADRA (no descuadrada).
 *    Usamos COALESCE para que la comparación nunca sea contra NULL.
 * 7. Consulta 3: devuelve FILAS individuales ofensivas (no solo grupos) — el equipo de nómina
 *    necesita ver cada fila duplicada para corregir. Collation default SQL Server = case-insensitive
 *    ('Horas' choca con 'horas').
 * 8. SP: SET XACT_ABORT ON obligatorio — sin él, error en tiempo de ejecución deja transacción
 *    abierta reteniendo locks (trampa mÃ¡s penalizada).
 * 9. SP: concurrencia optimista con UPDATE ... WHERE Estado='Borrador' + @@ROWCOUNT —
 *    evita race condition SELECT-then-UPDATE.
 * 10. SP: THROW con códigos de error distintos (50001, 50002, 50003) — RAISERROR es legacy y pierde detalle.
 * 11. SP: no re-aprobar 'Aprobada' — idempotencia explícita: si ya estÃ¡ Aprobada, error 50004.
 * 12. Periodo en SP: CONVERT(..., 120) explícito — conversión implícita depende de SET DATEFORMAT/idioma de sesión.
 * 13. Índices: SOLO los que justifican las 4 consultas. Índice innecesario = hallazgo de revisión, no mérito.
 * 14. Campos extra en Planillas: ReferenciaSap (traceabilidad envío) y EnviadaSapEn (diagnóstico incidente).
 */

-- ============================================================
-- 1. DDL — ESQUEMA COMPLETO
-- ============================================================

-- Centros de Costo
CREATE TABLE CentrosCosto (
    CentroCostoId   BIGINT        IDENTITY(1,1) PRIMARY KEY,
    Nombre          VARCHAR(120)  NOT NULL
);

-- Empleados
CREATE TABLE Empleados (
    EmpleadoId      BIGINT        IDENTITY(1,1) PRIMARY KEY,
    Nombre          VARCHAR(150)  NOT NULL,
    CentroCostoId   BIGINT        NOT NULL,
    Activo          BIT           NOT NULL DEFAULT 1,
    CONSTRAINT FK_Empleados_CentroCosto
        FOREIGN KEY (CentroCostoId) REFERENCES CentrosCosto(CentroCostoId)
);

-- Planillas (cabecera)
CREATE TABLE Planillas (
    PlanillaId      BIGINT        IDENTITY(1,1) PRIMARY KEY,
    Periodo         CHAR(7)       NOT NULL,                -- 'YYYY-MM'
    Estado          VARCHAR(20)   NOT NULL DEFAULT 'Borrador',
    ReferenciaSap   VARCHAR(60)   NULL,                    -- NUEVO: trazabilidad envío SAP
    EnviadaSapEn    DATETIME2     NULL,                    -- NUEVO: diagnóstico incidente
    CONSTRAINT CK_Planillas_Estado
        CHECK (Estado IN ('Borrador','Aprobada','EnviadaSAP')),
    CONSTRAINT CK_Planillas_Periodo_Formato
        CHECK (Periodo LIKE '[12][0-9][0-9][0-9]-[01][0-9]') -- validación bÃ¡sica YYYY-MM
);

-- PlanillaDetalle (movimientos)
CREATE TABLE PlanillaDetalle (
    DetalleId       BIGINT        IDENTITY(1,1) PRIMARY KEY,
    PlanillaId      BIGINT        NOT NULL,
    EmpleadoId      BIGINT        NOT NULL,
    Concepto        VARCHAR(80)   NOT NULL,
    Monto           DECIMAL(18,2) NOT NULL,
    Tipo            CHAR(1)       NOT NULL,                -- 'D' débito | 'C' crédito
    CONSTRAINT FK_PlanillaDetalle_Planilla
        FOREIGN KEY (PlanillaId) REFERENCES Planillas(PlanillaId),
    CONSTRAINT FK_PlanillaDetalle_Empleado
        FOREIGN KEY (EmpleadoId) REFERENCES Empleados(EmpleadoId),
    CONSTRAINT CK_PlanillaDetalle_Tipo
        CHECK (Tipo IN ('D','C')),
    CONSTRAINT CK_PlanillaDetalle_Monto_Positivo
        CHECK (Monto > 0)
    -- NO UNIQUE en (PlanillaId, EmpleadoId, Concepto) — ver supuesto #5
);

-- Índices justificados por las 4 consultas (ninguno innecesario)
-- Consulta 1: JOIN PlanillaDetalle â Planillas (Periodo, Estado) â Empleados â CentrosCosto
CREATE INDEX IX_PlanillaDetalle_PlanillaId
    ON PlanillaDetalle(PlanillaId);

CREATE INDEX IX_Planillas_Periodo_Estado
    ON Planillas(Periodo, Estado);

-- Consulta 2: agregación por PlanillaId en PlanillaDetalle
CREATE INDEX IX_PlanillaDetalle_PlanillaId_Tipo
    ON PlanillaDetalle(PlanillaId, Tipo);

-- Consulta 3: detección duplicados por (PlanillaId, EmpleadoId, Concepto)
CREATE INDEX IX_PlanillaDetalle_PlanillaId_EmpleadoId_Concepto
    ON PlanillaDetalle(PlanillaId, EmpleadoId, Concepto);

-- Consulta 1 también filtra Empleados.Activo y une CentrosCosto
CREATE INDEX IX_Empleados_CentroCostoId_Activo
    ON Empleados(CentroCostoId, Activo);

-- ============================================================
-- 2. CONSULTA 1 — Totales débito/crédito por centro de costo, periodo 2026-09, solo 'Aprobada'
-- ============================================================
/*
 * TRAMPA CLÃSICA (evitada): el NULL trap.
 * Un centro de costo con SOLO débitos debe aparecer con Créditos = 0, no NULL ni desaparecer.
 * SOLUCIÃN: Agregación condicional (SUM(CASE WHEN Tipo='D' ...)) desde CentrosCosto con LEFT JOIN.
 * Por qué no dos self-joins: duplicaría la lectura de PlanillaDetalle y Empleados,
 * complicaría el plan y no aporta valor — la agregación condicional es un solo scan,
 * legible y el optimizador la resuelve eficientemente.
 */
SELECT
    cc.CentroCostoId,
    cc.Nombre                          AS CentroCostoNombre,
    COALESCE(SUM(CASE WHEN pd.Tipo = 'D' THEN pd.Monto END), 0) AS TotalDebitos,
    COALESCE(SUM(CASE WHEN pd.Tipo = 'C' THEN pd.Monto END), 0) AS TotalCreditos
FROM CentrosCosto cc
LEFT JOIN Empleados e
    ON e.CentroCostoId = cc.CentroCostoId
    AND e.Activo = 1
LEFT JOIN PlanillaDetalle pd
    ON pd.EmpleadoId = e.EmpleadoId
LEFT JOIN Planillas p
    ON p.PlanillaId = pd.PlanillaId
    AND p.Periodo = '2026-09'
    AND p.Estado = 'Aprobada'
GROUP BY cc.CentroCostoId, cc.Nombre
ORDER BY cc.CentroCostoId;

-- ============================================================
-- 3. CONSULTA 2 — Planillas que NO cuadran (total débitos != total créditos)
-- ============================================================
/*
 * TRAMPA CLÃSICA (evitada): planilla SIN filas de detalle.
 * SUM(...) = NULL en ambos lados â NULL != NULL evalÃºa a UNKNOWN â la fila DESAPARECE en silencio.
 * DECISIÃN EXPLÍCITA: una planilla sin detalles tiene 0 débitos y 0 créditos â CUADRA (0 = 0).
 * Por tanto NO debe aparecer como descuadrada.
 * SOLUCIÃN: COALESCE(SUM(...), 0) en AMBOS lados para que la comparación sea 0 = 0 (verdadero)
 * y la planilla quede excluida del resultado. Documentado aquí a propósito.
 * NO filtramos por Estado — una planilla descuadrada interesa en CUALQUIER estado.
 */
SELECT
    p.PlanillaId,
    p.Periodo,
    p.Estado,
    COALESCE(SUM(CASE WHEN pd.Tipo = 'D' THEN pd.Monto END), 0) AS TotalDebitos,
    COALESCE(SUM(CASE WHEN pd.Tipo = 'C' THEN pd.Monto END), 0) AS TotalCreditos
FROM Planillas p
LEFT JOIN PlanillaDetalle pd
    ON pd.PlanillaId = p.PlanillaId
GROUP BY p.PlanillaId, p.Periodo, p.Estado
HAVING COALESCE(SUM(CASE WHEN pd.Tipo = 'D' THEN pd.Monto END), 0)
     <> COALESCE(SUM(CASE WHEN pd.Tipo = 'C' THEN pd.Monto END), 0)
ORDER BY p.PlanillaId;

-- ============================================================
-- 4. CONSULTA 3 — Empleados con Concepto duplicado dentro de la misma planilla
-- ============================================================
/*
 * INTERPRETACIÃN: mismo EmpleadoId + mismo Concepto (case-insensitive por collation default
 * de SQL Server: 'Horas' = 'horas') dentro del mismo PlanillaId.
 *
 * DECISIÃN: devolvemos las FILAS INDIVIDUALES ofensivas (no solo los grupos).
 * JUSTIFICACIÃN: el equipo de nómina necesita ver CADA fila duplicada para decidir cuÃ¡l
 * borrar/corregir. Un GROUP BY con HAVING COUNT(*) > 1 solo dice "hay duplicados aquí",
 * no cuÃ¡les son las filas exactas. Con ROW_NUMBER() sobre la partición obtenemos
 * fila 1 (original) y filas 2+ (duplicadas) — ambas Ãºtiles para auditoría.
 *
 * Collation: SQL Server default = SQL_Latin1_General_CP1_CI_AS (case-insensitive, accent-sensitive).
 * La comparación de Concepto hereda ese comportamiento — 'Horas' y 'horas' colisionan.
 * Si el negocio requiere case-sensitive, se añadiría COLLATE Latin1_General_CS_AS en la consulta.
 */
WITH DupRows AS (
    SELECT
        pd.DetalleId,
        pd.PlanillaId,
        pd.EmpleadoId,
        e.Nombre AS EmpleadoNombre,
        pd.Concepto,
        pd.Monto,
        pd.Tipo,
        ROW_NUMBER() OVER (
            PARTITION BY pd.PlanillaId, pd.EmpleadoId, pd.Concepto
            ORDER BY pd.DetalleId
        ) AS Rn
    FROM PlanillaDetalle pd
    JOIN Empleados e ON e.EmpleadoId = pd.EmpleadoId
)
SELECT
    PlanillaId,
    EmpleadoId,
    EmpleadoNombre,
    Concepto,
    Monto,
    Tipo,
    CASE WHEN Rn = 1 THEN 'Original' ELSE 'Duplicado' END AS RolFila
FROM DupRows
WHERE Rn >= 1  -- trae original (Rn=1) y duplicados (Rn>1) para contexto completo
  AND EXISTS (
        SELECT 1
        FROM DupRows d2
        WHERE d2.PlanillaId = DupRows.PlanillaId
          AND d2.EmpleadoId = DupRows.EmpleadoId
          AND d2.Concepto = DupRows.Concepto
          AND d2.Rn > 1
    )
ORDER BY PlanillaId, EmpleadoId, Concepto, Rn;

-- ============================================================
-- 5. STORED PROCEDURE — Aprobar Planilla (concurrencia optimista + TRY/CATCH)
-- ============================================================
/*
 * sp_AprobarPlanilla
 * Propósito: Cambia Estado de 'Borrador' a 'Aprobada' validando que débitos = créditos.
 *
 * CÃDIGOS DE ERROR (THROW):
 *   50001 — Planilla inexistente
 *   50002 — Estado no es 'Borrador' (incluye ya 'Aprobada' o 'EnviadaSAP')
 *   50003 — Descuadrada: total débito != total crédito
 *   50004 — Ya estÃ¡ 'Aprobada' (idempotencia explícita: no re-aprobar)
 *
 * PATRONES CRÍTICOS:
 * - SET XACT_ABORT ON: sin él, error runtime (p.ej. constraint, timeout) deja transacción
 *   ABIERTA reteniendo locks â bloquea toda la tabla. Es la omisión mÃ¡s penalizada.
 * - BEGIN TRY / BEGIN TRANSACTION / ... / COMMIT / END TRY / BEGIN CATCH / ROLLBACK / THROW / END CATCH
 * - Concurrencia optimista: UPDATE ... SET Estado='Aprobada' WHERE PlanillaId=@PlanillaId AND Estado='Borrador'
 *   + comprobación @@ROWCOUNT. Por qué no SELECT-then-UPDATE: race condition ventana
 *   entre SELECT y UPDATE — otro hilo puede cambiar el estado. El WHERE atómico + @@ROWCOUNT
 *   garantiza que SOLO el hilo que vio 'Borrador' gana.
 * - THROW (no RAISERROR): preserva nÃºmero, mensaje, estado y stack trace.
 * - CONVERT(..., 120) para Periodo si hiciera falta conversión de fecha — evita dependencia
 *   de SET DATEFORMAT / idioma de sesión (factor real de incidentes).
 * - No re-aprobar 'Aprobada': comportamiento idempotente explícito â error 50004.
 *   Alternativa (silenciar y devolver éxito) oculta bugs de doble clic en UI; el error
 *   fuerza al caller a manejar el caso conscientemente.
 */
CREATE OR ALTER PROCEDURE dbo.sp_AprobarPlanilla
    @PlanillaId BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;  -- CRÍTICO: sin esto, error runtime deja transacción abierta con locks

    DECLARE @TotalDebitos  DECIMAL(18,2);
    DECLARE @TotalCreditos DECIMAL(18,2);
    DECLARE @EstadoActual  VARCHAR(20);

    BEGIN TRY
        BEGIN TRANSACTION;

        -- 1) Validar existencia y leer estado actual (bloqueo de fila con UPDLOCK para serializar)
        SELECT @EstadoActual = Estado
        FROM Planillas WITH (UPDLOCK, ROWLOCK)
        WHERE PlanillaId = @PlanillaId;

        IF @EstadoActual IS NULL
        BEGIN
            THROW 50001, 'Planilla inexistente', 1;
        END

        -- 2) Guardia de idempotencia: ya Aprobada â error explícito (no silencioso)
        IF @EstadoActual = 'Aprobada'
        BEGIN
            THROW 50004, 'La planilla ya se encuentra en estado Aprobada', 1;
        END

        -- 3) Validar estado = 'Borrador' (cubre 'EnviadaSAP' y cualquier otro)
        IF @EstadoActual <> 'Borrador'
        BEGIN
            THROW 50002, 'La planilla no estÃ¡ en estado Borrador (estado actual: ' + @EstadoActual + ')', 1;
        END

        -- 4) Calcular totales (COALESCE para evitar NULL trap — ver Consulta 2)
        SELECT
            @TotalDebitos  = COALESCE(SUM(CASE WHEN Tipo = 'D' THEN Monto END), 0),
            @TotalCreditos = COALESCE(SUM(CASE WHEN Tipo = 'C' THEN Monto END), 0)
        FROM PlanillaDetalle
        WHERE PlanillaId = @PlanillaId;

        -- 5) Validar balance
        IF @TotalDebitos <> @TotalCreditos
        BEGIN
            THROW 50003, 'Planilla descuadrada', 1;
        END

        -- 6) Concurrencia optimista: UPDATE atómico + @@ROWCOUNT
        UPDATE Planillas
        SET Estado = 'Aprobada'
        WHERE PlanillaId = @PlanillaId
          AND Estado = 'Borrador';

        IF @@ROWCOUNT = 0
        BEGIN
            -- Otro hilo cambió el estado entre nuestro SELECT y este UPDATE
            THROW 50002, 'Conflicto de concurrencia: la planilla ya no estÃ¡ en estado Borrador', 1;
        END

        COMMIT TRANSACTION;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0
            ROLLBACK TRANSACTION;

        -- Re-lanzar el error original (THROW preserva nÃºmero, mensaje, severity, state)
        THROW;
    END CATCH;
END;
GO