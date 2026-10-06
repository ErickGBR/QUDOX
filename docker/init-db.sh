#!/usr/bin/env bash
set -euo pipefail
SERVIDOR="${DB_HOST:-db}"
USUARIO="${DB_USER:-sa}"
CLAVE="${MSSQL_SA_PASSWORD:?Falta MSSQL_SA_PASSWORD}"
BASE="${DB_NAME:-Qudox}"
SQLCMD="/opt/mssql-tools18/bin/sqlcmd"
DIR_SQL="/init-db"
echo "[init-db] Esperando SQL Server..."
intentos=0
until "${SQLCMD}" -C -S "${SERVIDOR}" -U "${USUARIO}" -P "${CLAVE}" -I -Q "SELECT 1" > /dev/null 2>&1; do
  intentos=$((intentos + 1))
  [ "${intentos}" -ge 60 ] && { echo "[init-db] ERROR timeout"; exit 1; }
  echo "[init-db] intento ${intentos}/60"
  sleep 2
done
echo "[init-db] OK. Creando base..."
"${SQLCMD}" -C -S "${SERVIDOR}" -U "${USUARIO}" -P "${CLAVE}" -d master -I -Q "IF DB_ID(N'${BASE}') IS NULL CREATE DATABASE [${BASE}]"
[ ! -f "${DIR_SQL}/payroll.sql" ] && { echo "FALTA payroll.sql"; exit 1; }
echo "[init-db] Aplicando payroll.sql..."
"${SQLCMD}" -C -S "${SERVIDOR}" -U "${USUARIO}" -P "${CLAVE}" -d "${BASE}" -I -i "${DIR_SQL}/payroll.sql" -b || { echo "[init-db] ERROR payroll.sql"; exit 1; }
if [ -f "${DIR_SQL}/seed.sql" ]; then
  echo "[init-db] Aplicando seed.sql..."
  "${SQLCMD}" -C -S "${SERVIDOR}" -U "${USUARIO}" -P "${CLAVE}" -d "${BASE}" -I -i "${DIR_SQL}/seed.sql" -b || { echo "[init-db] ERROR seed.sql (continuando?)"; exit 1; }
fi
echo "[init-db] COMPLETO"
