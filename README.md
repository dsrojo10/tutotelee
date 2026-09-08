# TutoTeLee

TutoTeLee es una aplicación familiar que facilita la comunicación con una persona con sordera severa y visión reducida. Un Smart TV muestra texto grande y un celular convierte voz o texto escrito en la frase que aparece casi en tiempo real en el TV.

El TV no necesita micrófono: todo el reconocimiento ocurre en el celular. TutoTeLee no guarda audio ni historial; Firebase conserva solamente el texto visible en ese momento y metadatos temporales de conexión.

## Cómo funciona

1. Abre `tv.html` en el Smart TV. Aparecerá un código temporal de 6 dígitos.
2. Abre `index.html` en el celular e introduce el código.
3. Pulsa **HABLAR** o escribe una frase y selecciona **MOSTRAR EN TV**.
4. Cada frase nueva reemplaza la anterior. **BORRAR TV** limpia la pantalla.

La especificación funcional completa está en [SPEC.md](./SPEC.md).

## Arquitectura y datos

- Vite, Vanilla JavaScript, HTML y CSS, sin framework de interfaz.
- Firebase JavaScript SDK modular, Anonymous Authentication y Realtime Database.
- Hosting estático en GitHub Pages y despliegue con GitHub Actions.
- Node se usa únicamente para desarrollo, pruebas y build. No existe servidor propio en producción.

Estructura conceptual de Realtime Database:

```text
pairings/{codigo}
  sessionId, tvUid, createdAt, expiresAt

sessions/{sessionId}
  tvUid, phoneUid, connected, currentText, isFinal,
  createdAt, updatedAt, expiresAt
```

El código caduca a los 10 minutos y se elimina al conectarse. `sessionId` contiene 128 bits aleatorios y no coincide con el código visible. Una sesión conectada tiene una expiración lógica máxima de 12 horas. Las pestañas registran operaciones `onDisconnect` para retirar pairings abandonados o marcar desconexiones; los clientes también eliminan datos al cerrar el flujo normalmente.

## Requisitos locales

- Node.js 20.19 o posterior (se recomienda Node 22).
- npm.
- Un proyecto Firebase con una aplicación Web.

## Instalación y desarrollo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completa `.env.local` antes de usar las pantallas. Vite mostrará en la terminal la URL local, normalmente:

- Celular: `http://localhost:5173/`
- TV: `http://localhost:5173/tv.html`

Para probar con un celular real, ambos dispositivos deben acceder al servidor de desarrollo por la red local y el navegador puede exigir HTTPS para usar el micrófono. La entrada manual funciona aunque el reconocimiento de voz no esté disponible.

Comandos disponibles:

```bash
npm run dev      # servidor de desarrollo
npm test         # pruebas automatizadas con Vitest
npm run build    # build de producción en dist/
npm run preview  # vista previa del build
```

## Configurar Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com/).
2. En **Configuración del proyecto**, registra una aplicación Web. No es necesario activar Firebase Hosting.
3. En **Authentication > Sign-in method**, habilita el proveedor **Anonymous**.
4. En **Realtime Database**, crea una base de datos. Selecciona una región cercana y no dejes reglas abiertas de modo de prueba.
5. Copia la configuración de la aplicación Web a `.env.local` usando exactamente estas variables:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Estos valores identifican la aplicación web y quedan incluidos en el frontend; no son claves privadas. La seguridad depende de Authentication y de `database.rules.json`. Nunca pongas credenciales administrativas o claves de cuentas de servicio en variables `VITE_*`.

### Publicar las reglas

Instala Firebase CLI, inicia sesión y despliega únicamente las reglas:

```bash
npm install --global firebase-tools
firebase login
firebase deploy --only database --project TU_PROJECT_ID
```

También puedes copiar el contenido de `database.rules.json` en **Realtime Database > Rules** dentro de Firebase Console y publicarlo. `firebase.json` ya apunta al archivo correcto.

Las reglas son *deny-by-default*, exigen autenticación, validan códigos, IDs, expiración y texto (máximo 500 caracteres), protegen propietarios y no conceden lectura sobre las colecciones `pairings` o `sessions`. Solo permiten leer una ruta exacta conocida.

## Prueba manual

1. Ejecuta `npm run dev` con Firebase configurado.
2. Abre `/tv.html` en una ventana y `/` en otra, preferiblemente usando perfiles o navegadores distintos para obtener identidades anónimas distintas.
3. Introduce en el celular el código del TV.
4. Comprueba texto manual, **BORRAR TV**, **DESCONECTAR** y un código nuevo.
5. En un navegador compatible, concede permiso de micrófono y prueba resultados parciales y finales.
6. Ejecuta `npm test` y `npm run build` antes de publicar.

## Publicar en GitHub Pages

1. Crea un repositorio de GitHub (por ejemplo, `tutotelee`) y sube el proyecto a la rama `main`.
2. En **Settings > Secrets and variables > Actions > Variables**, crea las siete variables `VITE_FIREBASE_*` mostradas arriba. La configuración del cliente Firebase es pública, por lo que se recomiendan **Variables**; el workflow ya las lee desde `vars`. Si tu política exige Secrets, cambia `vars.NOMBRE` por `secrets.NOMBRE` en el workflow.
3. En **Settings > Pages > Build and deployment**, selecciona **GitHub Actions** como fuente.
4. Haz push a `main` o ejecuta manualmente **Deploy to GitHub Pages** desde la pestaña Actions.

El workflow instala con `npm ci`, ejecuta las pruebas, construye ambas páginas, sube `dist` y despliega con las acciones oficiales. Vite usa rutas relativas, así que funciona tanto en un dominio raíz como bajo el nombre del repositorio.

Para un repositorio `tutotelee`, las URL aproximadas serán:

- Celular: `https://USUARIO.github.io/tutotelee/`
- TV: `https://USUARIO.github.io/tutotelee/tv.html`

## Voz, privacidad y compatibilidad

La aplicación usa `window.SpeechRecognition || window.webkitSpeechRecognition` con idioma inicial `es-CO`, resultados intermedios y modo continuo. La Web Speech API no está disponible en todos los navegadores móviles y su comportamiento varía entre Chrome, Safari y otros navegadores. Si la API no existe, el botón de voz se deshabilita; el micrófono o dictado integrado en el teclado del celular sigue siendo una alternativa válida dentro del campo manual.

GitHub Pages publica la aplicación mediante HTTPS, lo que ayuda a satisfacer los requisitos de permisos del micrófono. Sin embargo, usar HTTPS no garantiza que el navegador implemente `SpeechRecognition`.

Según el navegador, la Web Speech API puede enviar audio a servicios del proveedor para convertirlo en texto. TutoTeLee no envía audio a Firebase, no lo almacena y el TV recibe únicamente texto.

## Limitaciones conocidas del MVP

- El código de 6 dígitos es un mecanismo de descubrimiento temporal, no una contraseña fuerte. Es apropiado para un entorno familiar de bajo riesgo.
- Cualquier usuario anónimo que conozca un código vigente puede leer ese pairing exacto e intentar reclamarlo. La transacción garantiza un solo celular ganador, pero un frontend estático no puede verificar proximidad física.
- Realtime Database no ofrece eliminación automática por TTL. Las reglas impiden usar datos expirados y los clientes realizan limpieza normal o por desconexión, pero una caída abrupta puede dejar registros expirados inaccesibles hasta una limpieza administrativa posterior.
- Las reglas impiden listar colecciones mediante Firebase, pero no pueden evitar que alguien pruebe códigos individuales. La ventana de 10 minutos, los 6 dígitos y el `sessionId` aleatorio reducen este riesgo sin convertir el MVP en un sistema de alta seguridad.
- Solo se admite un celular por TV. No hay cuentas permanentes, historial, almacenamiento de audio ni recuperación de una conversación.
- El reconocimiento de voz depende del navegador, sus permisos, HTTPS, conexión y servicios del proveedor. Los Smart TV solo muestran texto y no requieren soporte de voz.
- El tamaño del texto prioriza pocas líneas muy grandes. Las frases se limitan a 500 caracteres y el exceso visual se recorta en el TV en lugar de habilitar scroll.
