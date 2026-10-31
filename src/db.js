const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'segtramite.db');
const SCHEMA_VERSION = 2;

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Envuelve fn en una transacción: si lanza un error se revierte todo.
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN');
  try {
    const resultado = fn(...args);
    db.exec('COMMIT');
    return resultado;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

const version = db.prepare('PRAGMA user_version').get().user_version;
const tieneTablas = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'usuarios'").get();
if (tieneTablas && version < SCHEMA_VERSION) {
  throw new Error(
    `La base de datos ${DB_PATH} es de una versión anterior. ` +
    'Bórrela y vuelva a ejecutar "npm run seed".'
  );
}

db.exec(`
  -- Dependencias municipales (direcciones, jefaturas, comisiones...)
  CREATE TABLE IF NOT EXISTS departamentos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL UNIQUE,
    descripcion TEXT
  );

  -- rol: 'usuario' (solicitante), 'tecnico', 'jefe', 'admin'
  CREATE TABLE IF NOT EXISTS usuarios (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre          TEXT NOT NULL,
    cedula          TEXT,
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    rol             TEXT NOT NULL CHECK (rol IN ('usuario', 'tecnico', 'jefe', 'admin')),
    departamento_id INTEGER REFERENCES departamentos(id),
    activo          INTEGER NOT NULL DEFAULT 1,
    creado_en       TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS tipos_tramite (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    clave                  TEXT NOT NULL UNIQUE,
    nombre                 TEXT NOT NULL,
    descripcion            TEXT,
    departamento_inicial_id INTEGER NOT NULL REFERENCES departamentos(id)
  );

  -- tipo: 'documento' (se sube un archivo) o 'declaracion' (el solicitante lo declara)
  -- condicional = 1 cuando el requisito solo aplica en ciertos casos
  CREATE TABLE IF NOT EXISTS requisitos (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo_tramite_id INTEGER NOT NULL REFERENCES tipos_tramite(id) ON DELETE CASCADE,
    orden        INTEGER NOT NULL,
    nombre       TEXT NOT NULL,
    ayuda        TEXT,
    tipo         TEXT NOT NULL DEFAULT 'documento' CHECK (tipo IN ('documento', 'declaracion')),
    condicional  INTEGER NOT NULL DEFAULT 0
  );

  -- estado: 'recibido', 'en_revision', 'observado', 'aprobado', 'rechazado', 'finalizado'
  CREATE TABLE IF NOT EXISTS tramites (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo                 TEXT NOT NULL UNIQUE,
    tipo_tramite_id        INTEGER NOT NULL REFERENCES tipos_tramite(id),
    titulo                 TEXT NOT NULL,
    descripcion            TEXT,
    datos                  TEXT,  -- JSON con los datos propios del tipo de trámite
    solicitante_id         INTEGER NOT NULL REFERENCES usuarios(id),
    departamento_actual_id INTEGER NOT NULL REFERENCES departamentos(id),
    estado                 TEXT NOT NULL DEFAULT 'recibido',
    creado_en              TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    actualizado_en         TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- Situación de cada requisito dentro de un trámite
  CREATE TABLE IF NOT EXISTS tramite_requisitos (
    tramite_id   INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
    requisito_id INTEGER NOT NULL REFERENCES requisitos(id),
    cumplido     INTEGER NOT NULL DEFAULT 0,
    no_aplica    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (tramite_id, requisito_id)
  );

  CREATE TABLE IF NOT EXISTS documentos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tramite_id      INTEGER NOT NULL REFERENCES tramites(id) ON DELETE CASCADE,
    requisito_id    INTEGER REFERENCES requisitos(id),
    nombre_original TEXT NOT NULL,
    archivo         TEXT NOT NULL,
    mime            TEXT NOT NULL,
    tamano          INTEGER NOT NULL,
    subido_por      INTEGER NOT NULL REFERENCES usuarios(id),
    fecha           TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  -- Historial de paso del trámite por las dependencias
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
db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);

module.exports = db;
