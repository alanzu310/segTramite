const express = require('express');
const db = require('../db');
const { requireLogin, requireRol } = require('../middleware/auth');

const router = express.Router();

const ESTADOS = {
  recibido: 'Recibido',
  en_revision: 'En revisión',
  observado: 'Observado',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  finalizado: 'Finalizado',
};
const TIPOS_INFORME = {
  informe: 'Informe',
  recomendacion: 'Recomendación',
  observacion: 'Observación',
};

router.use((req, res, next) => {
  res.locals.ESTADOS = ESTADOS;
  res.locals.TIPOS_INFORME = TIPOS_INFORME;
  next();
});

const SELECT_TRAMITE = `
  SELECT t.*, d.nombre AS departamento_nombre, u.nombre AS solicitante_nombre
  FROM tramites t
  JOIN departamentos d ON d.id = t.departamento_actual_id
  JOIN usuarios u ON u.id = t.solicitante_id
`;

function getTramite(id) {
  return db.prepare(`${SELECT_TRAMITE} WHERE t.id = ?`).get(id);
}

function getHistorial(tramiteId) {
  return db.prepare(`
    SELECT m.*, dd.nombre AS desde_nombre, hd.nombre AS hacia_nombre, u.nombre AS usuario_nombre
    FROM movimientos m
    LEFT JOIN departamentos dd ON dd.id = m.desde_departamento
    JOIN departamentos hd ON hd.id = m.hacia_departamento
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.tramite_id = ?
    ORDER BY m.fecha, m.id
  `).all(tramiteId);
}

function generarCodigo() {
  const anio = new Date().getFullYear();
  const prefijo = `TRM-${anio}-`;
  const ultimo = db.prepare(
    'SELECT codigo FROM tramites WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1'
  ).get(`${prefijo}%`);
  const siguiente = ultimo ? parseInt(ultimo.codigo.slice(prefijo.length), 10) + 1 : 1;
  return prefijo + String(siguiente).padStart(4, '0');
}

const esPersonal = (user) => user.rol === 'tecnico' || user.rol === 'jefe';
const estaEnSuDepartamento = (user, tramite) =>
  esPersonal(user) && user.departamento_id === tramite.departamento_actual_id;

// ---------- Consulta pública por código ----------
router.get('/consulta', (req, res) => {
  const codigo = (req.query.codigo || '').trim().toUpperCase();
  let tramite = null;
  let historial = [];
  if (codigo) {
    tramite = db.prepare(`${SELECT_TRAMITE} WHERE t.codigo = ?`).get(codigo);
    if (tramite) historial = getHistorial(tramite.id);
  }
  res.render('consulta', { codigo, tramite, historial });
});

// ---------- Listado ----------
router.get('/tramites', requireLogin, (req, res) => {
  const user = req.session.user;
  let tramites;
  let vista = 'mios';

  if (user.rol === 'usuario') {
    tramites = db.prepare(`${SELECT_TRAMITE} WHERE t.solicitante_id = ? ORDER BY t.actualizado_en DESC`).all(user.id);
  } else if (req.query.ver === 'todos') {
    vista = 'todos';
    tramites = db.prepare(`${SELECT_TRAMITE} ORDER BY t.actualizado_en DESC`).all();
  } else {
    vista = 'bandeja';
    tramites = db.prepare(`${SELECT_TRAMITE} WHERE t.departamento_actual_id = ? ORDER BY t.actualizado_en DESC`)
      .all(user.departamento_id);
  }

  res.render('tramites/lista', { tramites, vista });
});

// ---------- Nuevo trámite (solicitante) ----------
router.get('/tramites/nuevo', requireRol('usuario'), (req, res) => {
  res.render('tramites/nuevo', { datos: {} });
});

router.post('/tramites', requireRol('usuario'), (req, res) => {
  const titulo = (req.body.titulo || '').trim();
  const descripcion = (req.body.descripcion || '').trim();
  if (!titulo) {
    res.locals.flash = { tipo: 'error', texto: 'El título es obligatorio.' };
    return res.status(400).render('tramites/nuevo', { datos: { titulo, descripcion } });
  }

  // Todo trámite ingresa por el primer departamento (Mesa de Entrada).
  const entrada = db.prepare('SELECT id FROM departamentos ORDER BY id LIMIT 1').get();
  if (!entrada) return res.status(500).render('error', { mensaje: 'No hay departamentos configurados.' });

  const crear = db.transaction(() => {
    const codigo = generarCodigo();
    const id = db.prepare(`
      INSERT INTO tramites (codigo, titulo, descripcion, solicitante_id, departamento_actual_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(codigo, titulo, descripcion, req.session.user.id, entrada.id).lastInsertRowid;
    db.prepare(`
      INSERT INTO movimientos (tramite_id, desde_departamento, hacia_departamento, usuario_id, comentario)
      VALUES (?, NULL, ?, ?, 'Trámite ingresado')
    `).run(id, entrada.id, req.session.user.id);
    return { id, codigo };
  });

  const { id, codigo } = crear();
  req.session.flash = { tipo: 'ok', texto: `Trámite registrado con el código ${codigo}.` };
  res.redirect(`/tramites/${id}`);
});

// ---------- Detalle ----------
router.get('/tramites/:id', requireLogin, (req, res) => {
  const user = req.session.user;
  const tramite = getTramite(req.params.id);
  if (!tramite) return res.status(404).render('error', { mensaje: 'Trámite no encontrado.' });
  if (user.rol === 'usuario' && tramite.solicitante_id !== user.id) {
    return res.status(403).render('error', { mensaje: 'No tiene acceso a este trámite.' });
  }

  const informes = db.prepare(`
    SELECT i.*, u.nombre AS autor_nombre, u.rol AS autor_rol, d.nombre AS departamento_nombre
    FROM informes i
    JOIN usuarios u ON u.id = i.autor_id
    JOIN departamentos d ON d.id = i.departamento_id
    WHERE i.tramite_id = ?
    ORDER BY i.fecha DESC, i.id DESC
  `).all(tramite.id);

  const departamentos = db.prepare('SELECT * FROM departamentos ORDER BY id').all();

  res.render('tramites/detalle', {
    tramite,
    historial: getHistorial(tramite.id),
    informes,
    departamentos,
    puedeInformar: estaEnSuDepartamento(user, tramite) && tramite.estado !== 'finalizado',
    puedeGestionar: user.rol === 'jefe' && estaEnSuDepartamento(user, tramite),
  });
});

// ---------- Acciones del personal ----------
function cargarTramiteDelDepartamento(req, res, next) {
  const tramite = getTramite(req.params.id);
  if (!tramite) return res.status(404).render('error', { mensaje: 'Trámite no encontrado.' });
  if (!estaEnSuDepartamento(req.session.user, tramite)) {
    return res.status(403).render('error', { mensaje: 'El trámite no se encuentra en su departamento.' });
  }
  req.tramite = tramite;
  next();
}

const tocar = db.prepare("UPDATE tramites SET actualizado_en = datetime('now', 'localtime') WHERE id = ?");

router.post('/tramites/:id/informes', requireRol('tecnico', 'jefe'), cargarTramiteDelDepartamento, (req, res) => {
  const { tramite } = req;
  const tipo = req.body.tipo;
  const contenido = (req.body.contenido || '').trim();

  if (tramite.estado === 'finalizado') {
    req.session.flash = { tipo: 'error', texto: 'El trámite está finalizado.' };
  } else if (!TIPOS_INFORME[tipo] || !contenido) {
    req.session.flash = { tipo: 'error', texto: 'Seleccione el tipo y escriba el contenido.' };
  } else {
    db.prepare(`
      INSERT INTO informes (tramite_id, autor_id, departamento_id, tipo, contenido) VALUES (?, ?, ?, ?, ?)
    `).run(tramite.id, req.session.user.id, req.session.user.departamento_id, tipo, contenido);
    tocar.run(tramite.id);
    req.session.flash = { tipo: 'ok', texto: `Se guardó: ${TIPOS_INFORME[tipo]}.` };
  }
  res.redirect(`/tramites/${tramite.id}`);
});

router.post('/tramites/:id/derivar', requireRol('jefe'), cargarTramiteDelDepartamento, (req, res) => {
  const { tramite } = req;
  const destino = parseInt(req.body.departamento_id, 10);
  const comentario = (req.body.comentario || '').trim();
  const existe = db.prepare('SELECT 1 FROM departamentos WHERE id = ?').get(destino);

  if (!existe || destino === tramite.departamento_actual_id) {
    req.session.flash = { tipo: 'error', texto: 'Seleccione un departamento de destino válido.' };
    return res.redirect(`/tramites/${tramite.id}`);
  }

  db.transaction(() => {
    db.prepare(`
      INSERT INTO movimientos (tramite_id, desde_departamento, hacia_departamento, usuario_id, comentario)
      VALUES (?, ?, ?, ?, ?)
    `).run(tramite.id, tramite.departamento_actual_id, destino, req.session.user.id, comentario || null);
    db.prepare(`
      UPDATE tramites
      SET departamento_actual_id = ?,
          estado = CASE WHEN estado = 'recibido' THEN 'en_revision' ELSE estado END,
          actualizado_en = datetime('now', 'localtime')
      WHERE id = ?
    `).run(destino, tramite.id);
  })();

  req.session.flash = { tipo: 'ok', texto: 'Trámite derivado.' };
  // Ya no está en el departamento del jefe: volvemos a su bandeja.
  res.redirect('/tramites');
});

router.post('/tramites/:id/estado', requireRol('jefe'), cargarTramiteDelDepartamento, (req, res) => {
  const { tramite } = req;
  const estado = req.body.estado;
  if (!ESTADOS[estado]) {
    req.session.flash = { tipo: 'error', texto: 'Estado no válido.' };
  } else {
    db.prepare("UPDATE tramites SET estado = ?, actualizado_en = datetime('now', 'localtime') WHERE id = ?")
      .run(estado, tramite.id);
    req.session.flash = { tipo: 'ok', texto: `Estado cambiado a "${ESTADOS[estado]}".` };
  }
  res.redirect(`/tramites/${tramite.id}`);
});

module.exports = router;
