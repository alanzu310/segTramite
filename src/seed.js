// Carga datos de ejemplo. Uso: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./db');

const yaHayDatos = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
if (yaHayDatos) {
  console.log('La base de datos ya tiene datos; no se cargó nada.');
  process.exit(0);
}

const seed = db.transaction(() => {
  const insertDep = db.prepare('INSERT INTO departamentos (nombre, descripcion) VALUES (?, ?)');
  const deps = [
    ['Mesa de Entrada', 'Recepción y registro de trámites'],
    ['Departamento Técnico', 'Revisión técnica de la documentación'],
    ['Asesoría Legal', 'Revisión legal y emisión de dictámenes'],
    ['Dirección General', 'Aprobación final'],
  ].map(([nombre, desc]) => insertDep.run(nombre, desc).lastInsertRowid);
  const [mesa, tecnico, legal] = deps;

  const hash = bcrypt.hashSync('123456', 10);
  const insertUser = db.prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, departamento_id) VALUES (?, ?, ?, ?, ?)'
  );
  const ciudadano = insertUser.run('Juan Pérez', 'usuario@demo.com', hash, 'usuario', null).lastInsertRowid;
  const tec = insertUser.run('Ana Técnica', 'tecnico@demo.com', hash, 'tecnico', tecnico).lastInsertRowid;
  insertUser.run('Carlos Jefe', 'jefe@demo.com', hash, 'jefe', tecnico);
  insertUser.run('María Mesa', 'mesa@demo.com', hash, 'jefe', mesa);
  insertUser.run('Luis Legal', 'legal@demo.com', hash, 'tecnico', legal);

  const t = db.prepare(`
    INSERT INTO tramites (codigo, titulo, descripcion, solicitante_id, departamento_actual_id, estado)
    VALUES (?, ?, ?, ?, ?, 'en_revision')
  `).run('TRM-2026-0001', 'Solicitud de permiso de construcción',
    'Ampliación de vivienda unifamiliar, 45 m2.', ciudadano, tecnico).lastInsertRowid;

  const mov = db.prepare(
    'INSERT INTO movimientos (tramite_id, desde_departamento, hacia_departamento, usuario_id, comentario) VALUES (?, ?, ?, ?, ?)'
  );
  mov.run(t, null, mesa, ciudadano, 'Trámite ingresado');
  mov.run(t, mesa, tecnico, null, 'Documentación completa, se deriva para revisión técnica');

  db.prepare(
    'INSERT INTO informes (tramite_id, autor_id, departamento_id, tipo, contenido) VALUES (?, ?, ?, ?, ?)'
  ).run(t, tec, tecnico, 'observacion', 'Falta adjuntar el plano de instalaciones eléctricas.');
});

seed();
console.log('Datos de ejemplo cargados. Contraseña de todos los usuarios: 123456');
