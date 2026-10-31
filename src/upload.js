const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const TIPOS_PERMITIDOS = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const MAX_MB = 10;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomUUID() + TIPOS_PERMITIDOS[file.mimetype]),
  }),
  limits: { fileSize: MAX_MB * 1024 * 1024, files: 40 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_PERMITIDOS[file.mimetype]) return cb(null, true);
    const err = new Error(`"${nombreOriginal(file)}" no es PDF ni imagen (JPG, PNG, WEBP).`);
    err.code = 'TIPO_NO_PERMITIDO';
    cb(err);
  },
});

// Los navegadores envían el nombre en UTF-8 pero busboy lo interpreta como latin1.
function nombreOriginal(file) {
  return Buffer.from(file.originalname, 'latin1').toString('utf8');
}

function mensajeError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') return `Cada archivo puede pesar como máximo ${MAX_MB} MB.`;
  if (err.code === 'LIMIT_FILE_COUNT') return 'Demasiados archivos en un solo envío.';
  if (err.code === 'TIPO_NO_PERMITIDO') return err.message;
  return 'No se pudieron subir los archivos.';
}

// Ejecuta multer y, si falla, deja el error en req.uploadError en lugar de cortar la petición.
function recibirArchivos(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) {
      req.uploadError = mensajeError(err);
      // Borra lo que se haya alcanzado a guardar
      for (const f of req.files || []) fs.rm(f.path, { force: true }, () => {});
      req.files = [];
    }
    next();
  });
}

function borrarArchivos(files) {
  for (const f of files || []) fs.rm(f.path, { force: true }, () => {});
}

module.exports = { UPLOAD_DIR, recibirArchivos, borrarArchivos, nombreOriginal };
