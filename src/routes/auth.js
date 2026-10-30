const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/tramites');
  res.render('login', { email: '' });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  const user = db.prepare(`
    SELECT u.*, d.nombre AS departamento_nombre
    FROM usuarios u LEFT JOIN departamentos d ON d.id = u.departamento_id
    WHERE u.email = ?
  `).get(email);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.locals.flash = { tipo: 'error', texto: 'Correo o contraseña incorrectos.' };
    return res.status(401).render('login', { email });
  }

  req.session.regenerate((err) => {
    if (err) return res.status(500).render('error', { mensaje: 'No se pudo iniciar sesión.' });
    req.session.user = {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      departamento_id: user.departamento_id,
      departamento_nombre: user.departamento_nombre,
    };
    res.redirect('/tramites');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// El registro público solo crea cuentas de rol "usuario" (solicitante).
// Las cuentas de técnicos y jefes se crean desde la base de datos / seed.
router.get('/registro', (req, res) => {
  res.render('registro', { datos: {} });
});

router.post('/registro', (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';

  let error = null;
  if (!nombre || !email || !password) error = 'Complete todos los campos.';
  else if (password.length < 6) error = 'La contraseña debe tener al menos 6 caracteres.';
  else if (db.prepare('SELECT 1 FROM usuarios WHERE email = ?').get(email)) error = 'Ese correo ya está registrado.';

  if (error) {
    res.locals.flash = { tipo: 'error', texto: error };
    return res.status(400).render('registro', { datos: { nombre, email } });
  }

  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)')
    .run(nombre, email, bcrypt.hashSync(password, 10), 'usuario');

  req.session.flash = { tipo: 'ok', texto: 'Cuenta creada. Ya puede iniciar sesión.' };
  res.redirect('/login');
});

module.exports = router;
