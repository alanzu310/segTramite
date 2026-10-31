# SegTrámite

Aplicación web para el seguimiento de trámites: permite ver en qué departamento se encuentra
un trámite y que el personal de cada departamento agregue informes, recomendaciones y observaciones.

**Stack:** Node.js + Express 5, plantillas EJS, SQLite (módulo `node:sqlite` incluido en Node, sin compilación), sesiones con `express-session` y contraseñas con `bcryptjs`.

## Cómo ejecutar

Requiere Node.js 22.13 o superior.

```bash
npm install
npm run seed     # crea la base data/segtramite.db con datos de ejemplo
npm start        # http://localhost:3000
```

Variables de entorno opcionales: `PORT`, `DB_PATH`, `SESSION_SECRET` (definirla en producción para que las sesiones sobrevivan a reinicios).

## Usuarios de prueba (contraseña `123456`)

| Correo               | Rol           | Dependencia                            |
|----------------------|---------------|----------------------------------------|
| admin@demo.com       | administrador | —                                      |
| usuario@demo.com     | usuario       | —                                      |
| secretaria@demo.com  | jefe          | Secretaría General                     |
| jefe@demo.com        | jefe          | Jefatura de Terrenos y Legalizaciones  |
| tecnico@demo.com     | técnico       | Jefatura de Terrenos y Legalizaciones  |
| catastro@demo.com    | técnico       | Jefatura de Catastro y Avalúos         |
| sindico@demo.com     | jefe          | Procuraduría Síndica                   |

Si ya tenía una base de datos de una versión anterior, bórrela (`data/segtramite.db`) y vuelva a ejecutar `npm run seed`.

## Roles y permisos

| Acción                                              | Usuario | Técnico | Jefe | Admin |
|-----------------------------------------------------|:-------:|:-------:|:----:|:-----:|
| Consultar estado por código (sin iniciar sesión)    | ✔ | ✔ | ✔ | ✔ |
| Registrarse e iniciar un trámite                    | ✔ |   |   |   |
| Subir requisitos pendientes de sus trámites         | ✔ |   |   |   |
| Ver bandeja de su dependencia / todos los trámites  |   | ✔ | ✔ | ✔ |
| Agregar informe, recomendación u observación\*      |   | ✔ | ✔ |   |
| Derivar el trámite a otra dependencia\*             |   |   | ✔ |   |
| Cambiar el estado del trámite\*                     |   |   | ✔ |   |
| Crear y editar usuarios (rol y dependencia)         |   |   |   | ✔ |
| Crear dependencias                                  |   |   |   | ✔ |

\* Solo cuando el trámite se encuentra actualmente en la dependencia de quien realiza la acción.

## Legalización de terrenos municipales

Basado en la Ordenanza de Legalización de Terrenos Municipales del cantón Salinas:

- **Dependencias** (Art. 14, 15 y 20): Secretaría General, Alcaldía, Dirección de Planeamiento Territorial y sus jefaturas
  (Terrenos y Legalizaciones, Diseño y Topografía, Catastro y Avalúos, Control de Construcciones), Gestión de Riesgos,
  Gestión Ambiental, Dirección Financiera (Rentas, Tesorería), Procuraduría Síndica, Comisión de Catastro, Avalúos y
  Predios Urbanos y Concejo Municipal.
- **Inicio** (Art. 13): el trámite ingresa por Secretaría General.
- **Requisitos** (Art. 18): el solicitante sube cada documento (PDF o imagen, máx. 10 MB). Los requisitos condicionales
  (cónyuge, predial, hijos, declaración de edificación, extranjeros) pueden marcarse como "No aplica".
- El trámite **puede enviarse con requisitos incompletos**: queda marcado con "Faltan N requisitos" en la bandeja,
  en el detalle y en la consulta pública, y el solicitante puede subirlos después.

Los archivos se guardan en `uploads/` (configurable con `UPLOAD_DIR`) y solo los pueden descargar el solicitante y el personal.

## Estructura

```
src/
  app.js              servidor Express y sesiones
  db.js               conexión SQLite y esquema
  seed.js             datos de ejemplo
  middleware/auth.js  requireLogin / requireRol
  routes/auth.js      login, logout, registro
  routes/tramites.js  consulta pública, listado, nuevo trámite, requisitos, documentos, informes, derivación, estado
  routes/admin.js     administración de usuarios y dependencias
  upload.js           subida de archivos (multer)
views/                plantillas EJS
public/css/           estilos
```

## Modelo de datos

- `departamentos` (dependencias)
- `usuarios` (rol: usuario | tecnico | jefe | admin; dependencia para el personal; activo)
- `tipos_tramite` y `requisitos` (documento o declaración; condicional)
- `tramites` (tipo, código, datos del predio en JSON, dependencia actual, estado)
- `tramite_requisitos` (cumplido / no aplica por trámite) y `documentos` (archivos subidos)
- `movimientos` (historial de derivaciones entre departamentos)
- `informes` (tipo: informe | recomendacion | observacion; autor y departamento)

## Próximos pasos sugeridos

- Que el personal valide u observe cada documento subido.
- Adjuntar archivos a los informes.
- Notificaciones por correo al solicitante cuando cambia el estado o el departamento.
- Protección CSRF en formularios y límite de intentos de login.
