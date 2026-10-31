const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('../db');
const { requireLogin, requireRol } = require('../middleware/auth');
const { UPLOAD_DIR, recibirArchivos, borrarArchivos, nombreOriginal } = require('../upload');

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
// Datos del predio que se piden en la solicitud de legalización
const CAMPOS_LEGALIZACION = {
  sector: 'Sector / barrio',
  manzana: 'Manzana',
  solar: 'Solar',
  area: 'Área aproximada (m²)',
  anios_posesion: 'Años de posesión',
  edificacion: '¿Existe edificación en el predio?',
};
// Estados en los que el solicitante ya no puede completar requisitos
const ESTADOS_CERRADOS = ['aprobado', 'rechazado', 'finalizado'];

router.use((req, res, next) => {
  res.locals.ESTADOS = ESTADOS;
  res.locals.TIPOS_INFORME = TIPOS_INFORME;
  res.locals.CAMPOS_LEGALIZACION = CAMPOS_LEGALIZACION;
  next();
});

// Cantidad de requisitos sin cumplir (ni marcados "no aplica") de cada trámite
const SELECT_TRAMITE = `
  SELECT t.*, d.nombre AS departamento_nombre, u.nombre AS solicitante_nombre,
         tt.nombre AS tipo_nombre, tt.clave AS tipo_clave,
         (SELECT COUNT(*) FROM tramite_requisitos tr
          WHERE tr.tramite_id = t.id AND tr.cumplido = 0 AND tr.no_aplica = 0) AS faltantes
  FROM tramites t
  JOIN departamentos d ON d.id = t.departamento_actual_id
  JOIN usuarios u ON u.id = t.solicitante_id
  JOIN tipos_tramite tt ON tt.id = t.tipo_tramite_id
`;

function getTramite(id) {
  const t = db.prepare(`${SELECT_TRAMITE} WHERE t.id = ?`).get(id);
  if (t) t.datos = t.datos ? JSON.parse(t.datos) : {};
  return t;
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

// Requisitos del trámite con su situación y los documentos subidos para cada uno
function getRequisitos(tramiteId) {
  const requisitos = db.prepare(`
    SELECT r.*, tr.cumplido, tr.no_aplica
    FROM tramite_requisitos tr JOIN requisitos r ON r.id = tr.requisito_id
    WHERE tr.tramite_id = ?
    ORDER BY r.orden
  `).all(tramiteId);
  const docs = db.prepare('SELECT * FROM documentos WHERE tramite_id = ? ORDER BY fecha, id').all(tramiteId);
  for (const r of requisitos) r.documentos = docs.filter((d) => d.requisito_id === r.id);
  return requisitos;
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

const insertarDocumento = db.prepare(`
  INSERT INTO documentos (tramite_id, requisito_id, nombre_original, archivo, mime, tamano, subido_por)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const marcarRequisito = db.prepare(
  'UPDATE tramite_requisitos SET cumplido = ?, no_aplica = ? WHERE tramite_id = ? AND requisito_id = ?'
);

const esPersonal = (user) => user.rol === 'tecnico' || user.rol === 'jefe';
const estaEnSuDepartamento = (user, tramite) =>
  esPersonal(user) && user.departamento_id === tramite.departamento_actual_id;
const puedeVer = (user, tramite) => user.rol !== 'usuario' || tramite.solicitante_id === user.id;

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
  } else if (user.rol === 'admin' || req.query.ver === 'todos') {
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
function renderNuevo(res, tipo, datos = {}, status = 200) {
  const requisitos = db.prepare('SELECT * FROM requisitos WHERE tipo_tramite_id = ? ORDER BY orden').all(tipo.id);
  res.status(status).render('tramites/nuevo', { tipo, requisitos, datos });
}

router.get('/tramites/nuevo', requireRol('usuario'), (req, res) => {
  const tipo = req.query.tipo && db.prepare('SELECT * FROM tipos_tramite WHERE clave = ?').get(req.query.tipo);
  if (!tipo) {
    const tipos = db.prepare(`
      SELECT tt.*, (SELECT COUNT(*) FROM requisitos r WHERE r.tipo_tramite_id = tt.id) AS n_requisitos
      FROM tipos_tramite tt ORDER BY tt.id
    `).all();
    return res.render('tramites/elegir_tipo', { tipos });
  }
  renderNuevo(res, tipo);
});

router.post('/tramites', requireRol('usuario'), recibirArchivos, (req, res) => {
  const tipo = db.prepare('SELECT * FROM tipos_tramite WHERE clave = ?').get(req.body.tipo);
  if (!tipo) {
    borrarArchivos(req.files);
    return res.status(400).render('error', { mensaje: 'Tipo de trámite no válido.' });
  }

  let titulo = (req.body.titulo || '').trim();
  const descripcion = (req.body.descripcion || '').trim();
  const datos = {};
  if (tipo.clave === 'legalizacion') {
    for (const campo of Object.keys(CAMPOS_LEGALIZACION)) datos[campo] = (req.body[campo] || '').trim();
    titulo = ['Legalización de terreno', datos.sector,
      datos.manzana && `Mz. ${datos.manzana}`, datos.solar && `Solar ${datos.solar}`].filter(Boolean).join(' — ');
  }
  const volverAlForm = (texto) => {
    borrarArchivos(req.files);
    res.locals.flash = { tipo: 'error', texto };
    renderNuevo(res, tipo, { titulo, descripcion, ...datos }, 400);
  };

  if (req.uploadError) return volverAlForm(`${req.uploadError} Vuelva a seleccionar los archivos.`);
  if (tipo.clave === 'legalizacion' && !datos.sector) return volverAlForm('Indique al menos el sector del predio.');
  if (!titulo) return volverAlForm('El asunto es obligatorio.');

  const requisitos = db.prepare('SELECT * FROM requisitos WHERE tipo_tramite_id = ?').all(tipo.id);
  const user = req.session.user;

  const crear = db.transaction(() => {
    const codigo = generarCodigo();
    const id = Number(db.prepare(`
      INSERT INTO tramites (codigo, tipo_tramite_id, titulo, descripcion, datos, solicitante_id, departamento_actual_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(codigo, tipo.id, titulo, descripcion, JSON.stringify(datos), user.id, tipo.departamento_inicial_id)
      .lastInsertRowid);

    for (const r of requisitos) {
      const archivos = req.files.filter((f) => f.fieldname === `req_${r.id}`);
      for (const f of archivos) {
        insertarDocumento.run(id, r.id, nombreOriginal(f), f.filename, f.mimetype, f.size, user.id);
      }
      const cumplido = r.tipo === 'declaracion' ? Boolean(req.body[`decl_${r.id}`]) : archivos.length > 0;
      const noAplica = !cumplido && r.condicional && Boolean(req.body[`na_${r.id}`]);
      db.prepare(`
        INSERT INTO tramite_requisitos (tramite_id, requisito_id, cumplido, no_aplica) VALUES (?, ?, ?, ?)
      `).run(id, r.id, cumplido ? 1 : 0, noAplica ? 1 : 0);
    }

    db.prepare(`
      INSERT INTO movimientos (tramite_id, desde_departamento, hacia_departamento, usuario_id, comentario)
      VALUES (?, NULL, ?, ?, 'Trámite ingresado')
    `).run(id, tipo.departamento_inicial_id, user.id);
    return { id, codigo };
  });

  let creado;
  try {
    creado = crear();
  } catch (err) {
    borrarArchivos(req.files);
    throw err;
  }
  // Archivos con un nombre de campo que no corresponde a ningún requisito
  const usados = new Set(requisitos.map((r) => `req_${r.id}`));
  borrarArchivos(req.files.filter((f) => !usados.has(f.fieldname)));

  const faltan = getTramite(creado.id).faltantes;
  req.session.flash = {
    tipo: faltan ? 'aviso' : 'ok',
    texto: `Trámite registrado con el código ${creado.codigo}.` +
      (faltan ? ` Quedan ${faltan} requisito(s) pendientes; puede subirlos desde esta página.` : ''),
  };
  res.redirect(`/tramites/${creado.id}`);
});

// ---------- Detalle ----------
router.get('/tramites/:id', requireLogin, (req, res) => {
  const user = req.session.user;
  const tramite = getTramite(req.params.id);
  if (!tramite) return res.status(404).render('error', { mensaje: 'Trámite no encontrado.' });
  if (!puedeVer(user, tramite)) {
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
    requisitos: getRequisitos(tramite.id),
    historial: getHistorial(tramite.id),
    informes,
    departamentos,
    puedeCompletar: user.id === tramite.solicitante_id && !ESTADOS_CERRADOS.includes(tramite.estado),
    puedeInformar: estaEnSuDepartamento(user, tramite) && tramite.estado !== 'finalizado',
    puedeGestionar: user.rol === 'jefe' && estaEnSuDepartamento(user, tramite),
  });
});

// ---------- Completar requisitos (solicitante) ----------
router.post('/tramites/:id/requisitos/:reqId', requireRol('usuario'), recibirArchivos, (req, res) => {
  const tramite = getTramite(req.params.id);
  const volver = (tipo, texto) => {
    req.session.flash = { tipo, texto };
    res.redirect(`/tramites/${req.params.id}#requisitos`);
  };
  if (!tramite || tramite.solicitante_id !== req.session.user.id) {
    borrarArchivos(req.files);
    return res.status(403).render('error', { mensaje: 'No tiene acceso a este trámite.' });
  }
  if (ESTADOS_CERRADOS.includes(tramite.estado)) {
    borrarArchivos(req.files);
    return volver('error', 'El trámite ya no admite cambios en los requisitos.');
  }
  if (req.uploadError) return volver('error', req.uploadError);

  const requisito = getRequisitos(tramite.id).find((r) => r.id === Number(req.params.reqId));
  if (!requisito) {
    borrarArchivos(req.files);
    return volver('error', 'Requisito no válido.');
  }

  const esArchivoValido = (f) => requisito.tipo === 'documento' && f.fieldname === 'archivo';
  const archivos = req.files.filter(esArchivoValido);
  borrarArchivos(req.files.filter((f) => !esArchivoValido(f)));
  const accion = req.body.accion;

  // Devuelve [cumplido, no_aplica] según la acción, o null si no hay nada que hacer
  let nuevoEstado = null;
  if (requisito.tipo === 'documento' && archivos.length) nuevoEstado = [1, 0];
  else if (requisito.tipo === 'declaracion' && accion === 'declarar') nuevoEstado = [1, 0];
  else if (requisito.condicional && accion === 'no_aplica' && !requisito.documentos.length) nuevoEstado = [0, 1];
  else if (accion === 'aplica') nuevoEstado = [requisito.documentos.length ? 1 : 0, 0];

  if (!nuevoEstado) {
    return volver('error', requisito.tipo === 'documento' ? 'Seleccione al menos un archivo.' : 'No hubo cambios.');
  }

  db.transaction(() => {
    for (const f of archivos) {
      insertarDocumento.run(tramite.id, requisito.id, nombreOriginal(f), f.filename, f.mimetype, f.size, req.session.user.id);
    }
    marcarRequisito.run(...nuevoEstado, tramite.id, requisito.id);
    tocar.run(tramite.id);
  })();
  volver('ok', `Requisito actualizado: ${requisito.nombre}.`);
});

// ---------- Descarga de documentos ----------
router.get('/documentos/:id', requireLogin, (req, res) => {
  const doc = db.prepare('SELECT * FROM documentos WHERE id = ?').get(req.params.id);
  const tramite = doc && getTramite(doc.tramite_id);
  if (!doc || !tramite || !puedeVer(req.session.user, tramite)) {
    return res.status(404).render('error', { mensaje: 'Documento no encontrado.' });
  }
  const ruta = path.join(UPLOAD_DIR, path.basename(doc.archivo));
  if (!fs.existsSync(ruta)) return res.status(404).render('error', { mensaje: 'El archivo ya no existe.' });

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.nombre_original)}`);
  res.sendFile(ruta);
});

// ---------- Acciones del personal ----------
function cargarTramiteDelDepartamento(req, res, next) {
  const tramite = getTramite(req.params.id);
  if (!tramite) return res.status(404).render('error', { mensaje: 'Trámite no encontrado.' });
  if (!estaEnSuDepartamento(req.session.user, tramite)) {
    return res.status(403).render('error', { mensaje: 'El trámite no se encuentra en su dependencia.' });
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
    req.session.flash = { tipo: 'error', texto: 'Seleccione una dependencia de destino válida.' };
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
  // Ya no está en la dependencia del jefe: volvemos a su bandeja.
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
