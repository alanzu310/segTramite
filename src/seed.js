// Carga dependencias, tipos de trámite, requisitos y usuarios de ejemplo. Uso: npm run seed
const bcrypt = require('bcryptjs');
const db = require('./db');

const yaHayDatos = db.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n > 0;
if (yaHayDatos) {
  console.log('La base de datos ya tiene datos; no se cargó nada.');
  process.exit(0);
}

// Órganos que intervienen en la legalización (Ordenanza, Art. 14, 15 y 20)
const DEPENDENCIAS = [
  ['Secretaría General', 'Recepta solicitudes, genera el expediente y notifica (Art. 13 y 15.1)'],
  ['Alcaldía', 'Sumilla las solicitudes y suscribe resoluciones (Art. 15.2)'],
  ['Dirección de Planeamiento Territorial', 'Recibe solicitudes sumilladas y deriva a sus jefaturas (Art. 15.3)'],
  ['Jefatura de Terrenos y Legalizaciones', 'Inspección in situ, censo socioeconómico, levantamiento planimétrico (Art. 15.3)'],
  ['Jefatura de Diseño y Topografía', 'Apoyo topográfico a Terrenos y Legalizaciones (Art. 20)'],
  ['Jefatura de Catastro y Avalúos', 'Informe catastral, código catastral y avalúo (Art. 15.3)'],
  ['Jefatura de Control de Construcciones', 'Verifica permisos de las edificaciones existentes (Art. 15.3)'],
  ['Dirección de Gestión de Riesgos', 'Informe técnico de riesgos del predio (Art. 15.4)'],
  ['Dirección de Gestión Ambiental', 'Informe de impacto en áreas de interés ambiental (Art. 15.5)'],
  ['Dirección Financiera', 'Coordina Rentas y Tesorería (Art. 15.6)'],
  ['Jefatura de Rentas', 'Valor del terreno, tasas y convenios de pago (Art. 15.6)'],
  ['Jefatura de Tesorería', 'Deudas y pagos del solicitante y del predio (Art. 15.6)'],
  ['Procuraduría Síndica', 'Informe jurídico y minuta de compraventa (Art. 15.7)'],
  ['Comisión de Catastro, Avalúos y Predios Urbanos', 'Informe de comisión para el Concejo (Art. 15.8)'],
  ['Concejo Municipal', 'Resuelve la legalización (Art. 16)'],
];

// Requisitos del solicitante (Ordenanza, Art. 18)
// [nombre, ayuda, tipo, condicional]
const REQUISITOS_LEGALIZACION = [
  ['Ser mayor de edad', 'Art. 18 a). Declaración del solicitante.', 'declaracion', 0],
  ['Copia de cédula y certificado de votación del solicitante', 'Art. 18 b).', 'documento', 0],
  ['Copia de cédula y certificado de votación del cónyuge o conviviente',
    'Art. 18 b). Solo si es casado o mantiene unión de hecho legalmente formalizada.', 'documento', 1],
  ['Copia del último pago del impuesto predial urbano o rural',
    'Art. 18 c) y d). Solo si existe edificación registrada y usted consta como contribuyente. ' +
    'Para predios vacíos no se exige hasta la aprobación del Concejo.', 'documento', 1],
  ['Copia de cédula o certificado de nacimiento de los hijos menores de 18 años',
    'Art. 18 e). Solo si tiene hijos menores de edad.', 'documento', 1],
  ['Certificado actualizado de no poseer bienes o historia de dominio',
    'Art. 18 f). Emitido por el Registro de la Propiedad del cantón Salinas.', 'documento', 0],
  ['Certificado de no ser deudor al GAD Municipal de Salinas', 'Art. 18 g).', 'documento', 0],
  ['Declaración juramentada que acredite la propiedad de la edificación',
    'Art. 18 h). Solo cuando exista una edificación en el predio.', 'documento', 1],
  ['Fotografía del predio que se va a legalizar', 'Art. 18 i).', 'documento', 0],
  ['Certificado de no ser deudor del Cuerpo de Bomberos del cantón Salinas', 'Art. 18 j).', 'documento', 0],
  ['Residencia legal superior a 5 años o visa definitiva en el cantón Salinas',
    'Art. 18, inciso final. Solo para ciudadanos extranjeros.', 'documento', 1],
];

const seed = db.transaction(() => {
  const insertDep = db.prepare('INSERT INTO departamentos (nombre, descripcion) VALUES (?, ?)');
  const dep = {};
  for (const [nombre, desc] of DEPENDENCIAS) dep[nombre] = Number(insertDep.run(nombre, desc).lastInsertRowid);

  const insertTipo = db.prepare(
    'INSERT INTO tipos_tramite (clave, nombre, descripcion, departamento_inicial_id) VALUES (?, ?, ?, ?)'
  );
  const legalizacion = insertTipo.run('legalizacion',
    'Legalización de terreno municipal',
    'Regularización de posesiones sobre solares municipales (posesión pacífica, pública y continua de al menos 5 años).',
    dep['Secretaría General']).lastInsertRowid;
  insertTipo.run('general', 'Solicitud general', 'Cualquier otra solicitud dirigida al GAD Municipal.',
    dep['Secretaría General']);

  const insertReq = db.prepare(
    'INSERT INTO requisitos (tipo_tramite_id, orden, nombre, ayuda, tipo, condicional) VALUES (?, ?, ?, ?, ?, ?)'
  );
  REQUISITOS_LEGALIZACION.forEach(([nombre, ayuda, tipo, cond], i) =>
    insertReq.run(legalizacion, i + 1, nombre, ayuda, tipo, cond));

  const hash = bcrypt.hashSync('123456', 10);
  const insertUser = db.prepare(
    'INSERT INTO usuarios (nombre, email, password_hash, rol, departamento_id) VALUES (?, ?, ?, ?, ?)'
  );
  insertUser.run('Administrador', 'admin@demo.com', hash, 'admin', null);
  insertUser.run('Juan Pérez', 'usuario@demo.com', hash, 'usuario', null);
  insertUser.run('María Secretaría', 'secretaria@demo.com', hash, 'jefe', dep['Secretaría General']);
  insertUser.run('Carlos Jefe', 'jefe@demo.com', hash, 'jefe', dep['Jefatura de Terrenos y Legalizaciones']);
  insertUser.run('Ana Técnica', 'tecnico@demo.com', hash, 'tecnico', dep['Jefatura de Terrenos y Legalizaciones']);
  insertUser.run('Pedro Catastro', 'catastro@demo.com', hash, 'tecnico', dep['Jefatura de Catastro y Avalúos']);
  insertUser.run('Luis Síndico', 'sindico@demo.com', hash, 'jefe', dep['Procuraduría Síndica']);
});

seed();
console.log('Datos de ejemplo cargados. Contraseña de todos los usuarios: 123456');
