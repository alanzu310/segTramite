const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireRol } = require('../middleware/auth');

const router = express.Router();
router.use('/admin', requireRol('admin'));

const ROLES = {
  usuario: 'Usuario (solicitante)',
  tecnico: 'Técnico',
  jefe: 'Jefe',
  admin: 'Administrador',
};
const ROLES_PERSONAL = ['tecnico', 'jefe'];

router.use('/admin', (req, res, next) => {
  res.locals.ROLES = ROLES;
  next();
});

const listarDependencias = () => db.prepare('SELECT * FROM departamentos ORDER BY nombre').all();

// ---------- Usuarios ----------
router.get('/admin/usuarios', (req, res) => {
  const filtro = { rol: req.query.rol || '', dep: req.query.dep || '' };
  const where = [];
  const params = [];
  if (ROLES[filtro.rol]) { where.push('u.rol = ?'); params.push(filtro.rol); }
  if (filtro.dep) { where.push('u.departamento_id = ?'); params.push(Number(filtro.dep)); }

  const usuarios = db.prepare(`
    SELECT u.*, d.nombre AS departamento_nombre
    FROM usuarios u LEFT JOIN departamentos d ON d.id = u.departamento_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY u.activo DESC, d.nombre, u.nombre
  `).all(...params);

  res.render('admin/usuarios', { usuarios, dependencias: listarDependencias(), filtro });
});

router.get('/admin/usuarios/nuevo', (req, res) => {
  res.render('admin/usuario_form', { u: { rol: 'tecnico', activo: 1 }, dependencias: listarDependencias() });
});

// Valida y normaliza los datos del formulario. Devuelve { datos, error }.
function leerFormulario(body, { esNuevo, idActual }) {
  const datos = {
    nombre: (body.nombre || '').trim(),
    cedula: (body.cedula || '').trim() || null,
    email: (body.email || '').trim().toLowerCase(),
    rol: body.rol,
    departamento_id: body.departamento_id ? Number(body.departamento_id) : null,
    activo: body.activo ? 1 : 0,
    password: body.password || '',
  };
  if (!ROLES_PERSONAL.includes(datos.rol)) datos.departamento_id = null;

  let error = null;
  if (!datos.nombre || !datos.email) error = 'Nombre y correo son obligatorios.';
  else if (!ROLES[datos.rol]) error = 'Seleccione un rol válido.';
  else if (ROLES_PERSONAL.includes(datos.rol) && !datos.departamento_id) error = 'Los técnicos y jefes deben tener una dependencia.';
  else if (datos.departamento_id && !db.prepare('SELECT 1 FROM departamentos WHERE id = ?').get(datos.departamento_id)) error = 'Dependencia no válida.';
  else if (esNuevo && datos.password.length < 6) error = 'La contraseña debe tener al menos 6 caracteres.';
  else if (!esNuevo && datos.password && datos.password.length < 6) error = 'La nueva contraseña debe tener al menos 6 caracteres.';
  else if (db.prepare('SELECT 1 FROM usuarios WHERE email = ? AND id IS NOT ?').get(datos.email, idActual ?? null)) error = 'Ese correo ya está registrado.';
  return { datos, error };
}

router.post('/admin/usuarios', (req, res) => {
  const { datos, error } = leerFormulario(req.body, { esNuevo: true });
  if (error) {
    res.locals.flash = { tipo: 'error', texto: error };
    return res.status(400).render('admin/usuario_form', { u: datos, dependencias: listarDependencias() });
  }
  db.prepare(`
    INSERT INTO usuarios (nombre, cedula, email, password_hash, rol, departamento_id, activo)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(datos.nombre, datos.cedula, datos.email, bcrypt.hashSync(datos.password, 10),
    datos.rol, datos.departamento_id, datos.activo);
  req.session.flash = { tipo: 'ok', texto: `Usuario ${datos.nombre} creado.` };
  res.redirect('/admin/usuarios');
});

router.get('/admin/usuarios/:id', (req, res) => {
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!u) return res.status(404).render('error', { mensaje: 'Usuario no encontrado.' });
  res.render('admin/usuario_form', { u, dependencias: listarDependencias() });
});

router.post('/admin/usuarios/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(id)) {
    return res.status(404).render('error', { mensaje: 'Usuario no encontrado.' });
  }
  let { datos, error } = leerFormulario(req.body, { esNuevo: false, idActual: id });
  // Evita que el administrador se quite el acceso a sí mismo
  if (!error && id === req.session.user.id && (datos.rol !== 'admin' || !datos.activo)) {
    error = 'No puede quitarse el rol de administrador ni desactivar su propia cuenta.';
  }
  if (error) {
    res.locals.flash = { tipo: 'error', texto: error };
    return res.status(400).render('admin/usuario_form', { u: { ...datos, id }, dependencias: listarDependencias() });
  }

  db.prepare(`
    UPDATE usuarios SET nombre = ?, cedula = ?, email = ?, rol = ?, departamento_id = ?, activo = ? WHERE id = ?
  `).run(datos.nombre, datos.cedula, datos.email, datos.rol, datos.departamento_id, datos.activo, id);
  if (datos.password) {
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(datos.password, 10), id);
  }
  req.session.flash = { tipo: 'ok', texto: `Usuario ${datos.nombre} actualizado.` };
  res.redirect('/admin/usuarios');
});

// ---------- Dependencias ----------
router.get('/admin/dependencias', (req, res) => {
  const dependencias = db.prepare(`
    SELECT d.*, COUNT(u.id) AS personal
    FROM departamentos d LEFT JOIN usuarios u ON u.departamento_id = d.id AND u.activo = 1
    GROUP BY d.id ORDER BY d.id
  `).all();
  res.render('admin/dependencias', { dependencias });
});

router.post('/admin/dependencias', (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  const descripcion = (req.body.descripcion || '').trim() || null;
  if (!nombre) {
    req.session.flash = { tipo: 'error', texto: 'El nombre es obligatorio.' };
  } else if (db.prepare('SELECT 1 FROM departamentos WHERE nombre = ?').get(nombre)) {
    req.session.flash = { tipo: 'error', texto: 'Ya existe una dependencia con ese nombre.' };
  } else {
    db.prepare('INSERT INTO departamentos (nombre, descripcion) VALUES (?, ?)').run(nombre, descripcion);
    req.session.flash = { tipo: 'ok', texto: `Dependencia "${nombre}" creada.` };
  }
  res.redirect('/admin/dependencias');
});

module.exports = router;
