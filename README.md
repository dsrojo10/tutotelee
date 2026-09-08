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
npm test         # pruebas unitarias rápidas con Vitest
npm run test:rules # reglas contra Realtime Database Emulator
npm run test:all # pruebas unitarias y de reglas
npm run build    # build de producción en dist/
npm run preview  # vista previa del build
```

Las pruebas de reglas requieren Java 21. `firebase-tools` se conserva como dependencia de desarrollo porque inicia el emulador local; las pruebas usan además el paquete oficial `@firebase/rules-unit-testing`. Ninguna prueba se conecta a un proyecto Firebase real. El workflow instala explícitamente esa versión de Java.

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
6. Ejecuta `npm run test:all` y `npm run build` antes de publicar.

## Publicar en GitHub Pages

1. Crea un repositorio de GitHub (por ejemplo, `tutotelee`) y sube el proyecto a la rama `main`.
2. En **Settings > Secrets and variables > Actions > Variables**, crea las siete variables `VITE_FIREBASE_*` mostradas arriba. La configuración del cliente Firebase es pública, por lo que se recomiendan **Variables**; el workflow ya las lee desde `vars`. Si configuras App Check, agrega también `VITE_FIREBASE_APPCHECK_SITE_KEY`. Nunca configures el token de depuración como variable de Actions. Si tu política exige Secrets, cambia `vars.NOMBRE` por `secrets.NOMBRE` en el workflow.
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

## Seguridad

La configuración Web de Firebase se publica dentro del frontend por diseño y no es un secreto. Nunca debe incluir credenciales administrativas. La protección real depende de Firebase Anonymous Authentication, las reglas de Realtime Database, App Check cuando se active y el monitoreo del proyecto.

- Las reglas son *deny-by-default*, impiden listar `pairings` y `sessions`, validan los propietarios, la expiración, las transiciones y el texto de hasta 500 caracteres.
- El `sessionId` usa 128 bits aleatorios. El código de seis dígitos solo descubre temporalmente una sesión y no debe tratarse como una contraseña fuerte.
- Un pairing vigente no puede ser sobrescrito por otro TV. Un TV sí puede reclamar atómicamente un código cuyo pairing ya expiró.
- Solo se conserva `currentText`; no existe historial y nunca se guarda audio.
- La CSP de ambas páginas restringe scripts, conexiones, formularios, objetos y URL base a los orígenes necesarios para la aplicación y Firebase, sin `unsafe-eval`.

Para verificar la política localmente:

```bash
npm run test:rules
npm run test:all
```

### App Check opcional

La integración con Firebase App Check está preparada, pero permanece inactiva mientras `VITE_FIREBASE_APPCHECK_SITE_KEY` esté vacío. Para activarla de forma controlada:

1. En Firebase Console abre **App Check**, registra la aplicación Web y selecciona **reCAPTCHA Enterprise**.
2. Crea o selecciona la clave de sitio para los dominios permitidos, incluido `USUARIO.github.io`, y copia únicamente la *site key* pública a `VITE_FIREBASE_APPCHECK_SITE_KEY` en `.env.local` y a la variable homónima de GitHub Actions.
3. Publica primero sin enforcement, comprueba en **App Check > Métricas** que las solicitudes válidas llegan desde el celular y el TV, y prueba los navegadores objetivo.
4. Cuando las métricas sean correctas, habilita manualmente enforcement para Realtime Database y, si corresponde en tu proyecto, Authentication. El frontend no activa enforcement.
5. Para desarrollo local, genera un token de depuración siguiendo la documentación de App Check, regístralo en Firebase Console y colócalo solo en `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN` dentro de `.env.local`. Nunca lo subas ni lo configures en GitHub Actions.

Sin la site key la aplicación sigue funcionando exactamente como antes. App Check reduce abuso de clientes no oficiales, pero no sustituye las reglas ni constituye rate limiting fuerte.

### Límites de la protección actual

- Sin backend propio no existe rate limiting fuerte ni confirmación física en el TV; un atacante puede probar códigos individuales y abusar de Authentication anónima dentro de las cuotas de Firebase.
- Realtime Database no elimina registros por TTL de forma garantizada. Las reglas impiden reclamar sesiones expiradas y los códigos expirados se pueden reutilizar, pero la eliminación física depende de los clientes o de mantenimiento administrativo.
- Tras ganar `phoneUid`, el celular registra `onDisconnect` antes de activar la sesión. Sigue existiendo una ventana pequeña entre el commit del claim y el registro confirmado; el rollback comprueba el UID antes de liberar el claim, pero un cierre exacto en esa ventana puede dejar la sesión ocupada hasta expirar.
- Una protección robusta contra *clickjacking* requiere el header HTTP `Content-Security-Policy: frame-ancestors ...` o `X-Frame-Options`. GitHub Pages no permite configurar esos headers y `frame-ancestors` no funciona mediante un `meta` CSP.

## Limitaciones conocidas del MVP

- El código de 6 dígitos es un mecanismo de descubrimiento temporal, no una contraseña fuerte. Es apropiado para un entorno familiar de bajo riesgo.
- Cualquier usuario anónimo que conozca un código vigente puede leer ese pairing exacto e intentar reclamarlo. La transacción garantiza un solo celular ganador, pero un frontend estático no puede verificar proximidad física.
- Realtime Database no ofrece eliminación automática por TTL. Las reglas impiden usar sesiones expiradas, permiten reutilizar pairings expirados y los clientes realizan limpieza normal o por desconexión, pero una caída abrupta puede dejar registros antiguos hasta una limpieza administrativa posterior.
- Las reglas impiden listar colecciones mediante Firebase, pero no pueden evitar que alguien pruebe códigos individuales. La ventana de 10 minutos, los 6 dígitos y el `sessionId` aleatorio reducen este riesgo sin convertir el MVP en un sistema de alta seguridad.
- Solo se admite un celular por TV. No hay cuentas permanentes, historial, almacenamiento de audio ni recuperación de una conversación.
- El reconocimiento de voz depende del navegador, sus permisos, HTTPS, conexión y servicios del proveedor. Los Smart TV solo muestran texto y no requieren soporte de voz.
- El tamaño del texto prioriza pocas líneas muy grandes. Las frases se limitan a 500 caracteres y el exceso visual se recorta en el TV en lugar de habilitar scroll.

## Diagnóstico temporal del Smart TV

Abre `https://dsrojo10.github.io/tutotelee/tv.html?debug=1` después de publicar este build, o añade `?debug=1` a la URL del TV en el entorno que estés probando. Solo ese parámetro activa el diagnóstico; retíralo para volver a la pantalla habitual. No activa el modo debug de Firebase App Check.

Al ocurrir un error aparece un panel pequeño de alto contraste, desplazable y accesible con teclado. Muestra navegador, plataforma, reloj, disponibilidad de APIs, resultado de autenticación anónima (sin UID), presencia mediante `.info/connected`, lectura de `.info/serverTimeOffset`, `localNow`, `serverNow`, `offset` y `localMinusServer` (local menos servidor, en ms). La disponibilidad de localStorage comprueba acceso y lectura con captura de excepciones; no escribe datos ni garantiza persistencia.

Las etapas de inicio son `firebase-init`, `anonymous-auth`, `server-time`, `create-session`, `create-pairing` y `onDisconnect`. Los errores posteriores del observador de sesión se identifican como `session-listener`. El panel conserva code, name y message de la causa interna, redactando configuración, identificadores, códigos, URL y posibles credenciales. No guarda ni envía el diagnóstico. Si falla el reloj del servidor, muestra el fallo y valores desconocidos; la aplicación conserva su fallback al reloj local. Un error posterior no borra el diagnóstico de ese fallo de reloj.

Sin `?debug=1` no se recopila ni se muestra el panel ni se añade el observador de presencia. Los mensajes de producción siguen siendo genéricos. No cambian reglas, arquitectura, expiraciones ni escrituras.

El target no está fijado en `vite.config.js`: la versión instalada de Vite resuelve su valor predeterminado `baseline-widely-available` a Chrome 107, Edge 107, Firefox 104 y Safari 16. No se ha modificado. El bundle conserva sintaxis moderna y depende de APIs del navegador sin añadir polyfills generales. Si el navegador no logra interpretar o cargar el módulo inicial, este panel tampoco podrá ejecutarse; el fallo reportado actualmente sí alcanza el flujo de creación de sesión.
