const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'segtramite.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS departamentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT
  );

  -- rol: 'usuario' (solicitante), 'tecnico', 'jefe'
  CREATE TABLE IF NOT EXISTS usuarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    rol             TEXT NOT NULL CHECK (rol IN ('usuario', 'tecnico', 'jefe')),
    departamento_id INTEGER REFERENCES departamentos(id),
    creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- estado: 'recibido', 'en_revision', 'observado', 'aprobado', 'rechazado', 'finalizado'
  CREATE TABLE IF NOT EXISTS tramites (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo                 TEXT NOT NULL UNIQUE,
    titulo                 TEXT NOT NULL,
    descripcion            TEXT,
    solicitante_id         INTEGER NOT NULL REFERENCES usuarios(id),
    departamento_actual_id INTEGER NOT NULL REFERENCES departamentos(id),
    estado                 TEXT NOT NULL DEFAULT 'recibido',
    creado_en              TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- Historial de paso del trámite por los departamentos
  CREATE TABLE IF NOT EXISTS movimientos (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    tramite_id         INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
    desde_departamento INTEGER REFERENCES departamentos(id),
    hacia_departamento INTEGER NOT NULL REFERENCES departamentos(id),
    usuario_id         INTEGER REFERENCES usuarios(id),
    comentario         TEXT,
    fecha              TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- tipo: 'informe', 'recomendacion', 'observacion'
  CREATE TABLE IF NOT EXISTS informes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tramite_id      INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
    autor_id        INTEGER NOT NULL REFERENCES usuarios(id),
    departamento_id INTEGER NOT NULL REFERENCES departamentos(id),
    tipo            TEXT NOT NULL CHECK (tipo IN ('informe', 'recomendacion', 'observacion')),
    contenido       TEXT NOT NULL,
    fecha           TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );
`);

module.exports = db;
