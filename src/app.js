const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

const db = require('./db');
const authRoutes = require('./routes/auth');
const tramitesRoutes = require('./routes/tramites');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 8 },
}));

// Carga el usuario en cada petición para que los cambios del administrador
// (rol, dependencia, desactivación) se apliquen de inmediato.
const buscarUsuario = db.prepare(`
  SELECT u.id, u.nombre, u.email, u.rol, u.departamento_id, u.activo, d.nombre AS departamento_nombre
  FROM usuarios u LEFT JOIN departamentos d ON d.id = u.departamento_id
  WHERE u.id = ?
`);
app.use((req, res, next) => {
  const user = req.session.userId ? buscarUsuario.get(req.session.userId) : null;
  if (user && user.activo) req.session.user = user;
  else delete req.session.user;
  next();
});

// Usuario y mensajes "flash" disponibles en todas las vistas
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => res.redirect(req.session.user ? '/tramites' : '/consulta'));
app.use(authRoutes);
app.use(tramitesRoutes);
app.use(adminRoutes);

app.use((req, res) => res.status(404).render('error', { mensaje: 'Página no encontrada.' }));

app.listen(PORT, () => {
  console.log(`SegTrámite escuchando en http://localhost:${PORT}`);
});
