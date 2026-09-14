# Estado del proyecto

## TutoTeLee v1.0

TutoTeLee facilita la comunicación familiar con una persona con sordera severa y visión reducida: el celular captura voz o texto y el TV muestra la frase actual con gran legibilidad.

## Arquitectura y stack

- Aplicación web estática con Vite, JavaScript vanilla, HTML y CSS.
- Firebase Anonymous Authentication y Realtime Database para pairing, presencia y texto actual.
- Dos entradas: `index.html` (celular) y `tv.html` (TV).
- GitHub Pages para producción y un repositorio Pages separado para preview.

## Flujo

TV → código temporal de 6 dígitos → celular → Firebase RTDB → texto actual en el TV.

## URLs

- Producción celular: https://dsrojo10.github.io/tutotelee/
- Producción TV: https://dsrojo10.github.io/tutotelee/tv.html
- Repo preview: https://dsrojo10.github.io/tutotelee-preview/

## Validación y estado

Comprobado en celular, Firefox PC y Samsung Smart TV. Estado: **v1 estable**, para uso familiar.
