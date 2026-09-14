# Mantenimiento

## Desarrollo local

```bash
npm install
npm test
npm run build
npm run dev
npm run preview
npm run test:rules
```

`npm run test:rules` requiere Java 21 (el workflow lo instala). Para validar visualmente el build real, usar `npm run build` y después `npm run preview`: `npm run dev` puede comportarse distinto por la CSP y el servidor de Vite.

## Ramas y despliegue

- Mantener `main` estable y trabajar en ramas descriptivas.
- Probar primero en `tutotelee-preview`; no usar producción para pruebas.
- El workflow `Deploy to GitHub Pages` despliega `main` al hacer push o mediante ejecución manual.
- Revisar el workflow y la URL resultante antes de compartir un preview.

## Configuración y seguridad

Configurar las variables `VITE_FIREBASE_*` en `.env.local` para desarrollo y en las variables del repositorio para Actions. Nunca versionar `.env.local`, secretos, tokens ni credenciales.

No tocar Firebase Rules, CSP ni la lógica de reloj sin pruebas. No cambiar pairing, TTL, `serverTimeOffset` o voz sin validar el flujo completo.

## Checklist antes de mergear a `main`

- [ ] Probar el cambio en una rama y en `tutotelee-preview`.
- [ ] Confirmar que no incluye `feature/voice-rolling-window`.
- [ ] Ejecutar `npm test`, `npm run build` y `git diff --check`.
- [ ] Ejecutar `npm run test:rules` cuando Java esté disponible.
- [ ] Confirmar accesibilidad, celular, Firefox PC y Samsung Smart TV.
- [ ] Revisar cambios de Firebase/CSP y actualizar documentación si aplica.
- [ ] Hacer merge y push solo después de revisar el workflow Pages.
