const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

require('./db');
const authRoutes = require('./routes/auth');
const tramitesRoutes = require('./routes/tramites');

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

app.use((req, res) => res.status(404).render('error', { mensaje: 'Página no encontrada.' }));

app.listen(PORT, () => {
  console.log(`SegTrámite escuchando en http://localhost:${PORT}`);
});
