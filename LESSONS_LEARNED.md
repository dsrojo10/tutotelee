# Lecciones aprendidas

- Samsung/Tizen requiere compatibilidad conservadora de navegador y pruebas en el dispositivo real.
- `.info/serverTimeOffset` debe leerse con un listener `onValue`, con fallback local.
- `CLOCK_SKEW_SAFETY_MS` evita `PERMISSION_DENIED` cuando el reloj local está adelantado.
- RTDB puede usar WebSocket o fallback long polling; la CSP debe permitir el host RTDB también para long polling.
- `auth: ok` no demuestra que RTDB esté conectado.
- El diagnóstico `?debug=1` fue clave para separar fallos de Firebase, reloj, red y navegador.
- El preview de GitHub Pages debe estar aislado de producción.
- El pairing de 6 dígitos sirve para descubrimiento temporal, no es una contraseña fuerte.
- La configuración Firebase del cliente no es secreta; `.env.local` sí debe permanecer fuera de Git.
- Accesibilidad y compatibilidad tienen prioridad sobre efectos visuales modernos.
- `SpeechRecognition` no se comporta igual en todos los navegadores; la entrada manual siempre debe estar disponible.
