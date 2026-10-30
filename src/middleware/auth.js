function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

// Uso: requireRol('tecnico', 'jefe')
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.session.user) return res.redirect('/login');
    if (!roles.includes(req.session.user.rol)) {
      return res.status(403).render('error', { mensaje: 'No tiene permisos para realizar esta acción.' });
    }
    next();
  };
}

module.exports = { requireLogin, requireRol };
