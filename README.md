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

| Correo             | Rol      | Departamento          |
|--------------------|----------|-----------------------|
| usuario@demo.com   | usuario  | —                     |
| mesa@demo.com      | jefe     | Mesa de Entrada       |
| tecnico@demo.com   | técnico  | Departamento Técnico  |
| jefe@demo.com      | jefe     | Departamento Técnico  |
| legal@demo.com     | técnico  | Asesoría Legal        |

## Roles y permisos

| Acción                                              | Usuario | Técnico | Jefe |
|-----------------------------------------------------|:-------:|:-------:|:----:|
| Consultar estado por código (sin iniciar sesión)    | ✔ | ✔ | ✔ |
| Registrarse e iniciar un trámite                    | ✔ |   |   |
| Ver sus propios trámites, informes y recorrido      | ✔ |   |   |
| Ver bandeja de su departamento / todos los trámites |   | ✔ | ✔ |
| Agregar informe, recomendación u observación\*      |   | ✔ | ✔ |
| Derivar el trámite a otro departamento\*            |   |   | ✔ |
| Cambiar el estado del trámite\*                     |   |   | ✔ |

\* Solo cuando el trámite se encuentra actualmente en el departamento de quien realiza la acción.

Todo trámite nuevo ingresa por el primer departamento (Mesa de Entrada) y recibe un código `TRM-AAAA-NNNN`.

## Estructura

```
src/
  app.js              servidor Express y sesiones
  db.js               conexión SQLite y esquema
  seed.js             datos de ejemplo
  middleware/auth.js  requireLogin / requireRol
  routes/auth.js      login, logout, registro
  routes/tramites.js  consulta pública, listado, detalle, informes, derivación, estado
views/                plantillas EJS
public/css/           estilos
```

## Modelo de datos

- `departamentos`
- `usuarios` (rol: usuario | tecnico | jefe; departamento para el personal)
- `tramites` (código, departamento actual, estado)
- `movimientos` (historial de derivaciones entre departamentos)
- `informes` (tipo: informe | recomendacion | observacion; autor y departamento)

## Próximos pasos sugeridos

- Administración de usuarios y departamentos desde la web (hoy se cargan por seed).
- Adjuntar archivos a trámites e informes.
- Notificaciones por correo al solicitante cuando cambia el estado o el departamento.
- Protección CSRF en formularios y límite de intentos de login.
