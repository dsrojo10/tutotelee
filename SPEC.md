# Especificación de TutoTeLee

Este documento es la fuente de verdad de los requisitos funcionales de TutoTeLee. Si otro documento entra en conflicto con este, prevalece `SPEC.md`.

## 1. Propósito y alcance

TutoTeLee es una aplicación familiar creada para facilitar la comunicación con una persona con sordera severa y visión reducida. Un Smart TV muestra texto grande y un celular actúa como micrófono y entrada de texto.

El MVP debe resolver este flujo de forma directa, accesible y sin historial de conversaciones. No es una plataforma de mensajería ni pretende ofrecer emparejamiento de alta seguridad.

## 2. Flujo principal

1. El Smart TV abre `tv.html`.
2. El TV crea una sesión y muestra un código temporal de exactamente 6 dígitos en tamaño muy grande.
3. El usuario abre `index.html` en el celular.
4. El usuario escribe el código mostrado en el TV y selecciona **CONECTAR**.
5. El celular y el TV quedan emparejados.
6. El código desaparece o queda inutilizado inmediatamente.
7. El celular muestra un botón grande **HABLAR** y los controles de texto.
8. Cuando el usuario habla, el celular convierte la voz a texto.
9. Los resultados intermedios y finales aparecen casi en tiempo real en el TV.
10. Cada nueva frase reemplaza por completo la anterior.
11. El celular también permite escribir y enviar texto manualmente.
12. El celular permite borrar el texto mostrado en el TV.
13. El celular puede desconectarse de forma explícita y ambas pantallas deben reflejar el cambio.

## 3. Pantalla del TV

- Archivo de entrada: `tv.html`.
- Fondo negro y texto blanco para ofrecer máximo contraste.
- Durante el emparejamiento, mostrar el código de 6 dígitos de forma enorme y clara.
- Después del emparejamiento, ocultar el código y mostrar el texto de conversación en tamaño enorme.
- Priorizar la lectura desde varios metros de distancia.
- Evitar el scroll durante la conversación. El texto debe ajustarse al espacio disponible de forma legible.
- Mantener en pantalla muy pocos elementos.
- Mostrar discretamente el estado de conexión sin competir visualmente con el código o la conversación.

## 4. Pantalla del celular

El archivo de entrada es `index.html`.

### 4.1 Antes de conectar

- Campo para introducir un código numérico de 6 dígitos.
- Botón **CONECTAR**.
- Mensajes claros ante código inválido, expirado, inexistente o ya utilizado.

### 4.2 Después de conectar

- Botón grande **HABLAR**.
- Vista previa del reconocimiento de voz.
- Campo de texto manual.
- Botón **MOSTRAR EN TV**.
- Botón **BORRAR TV**.
- Botón **DESCONECTAR**.

Los controles principales deben ser grandes, claros y fáciles de utilizar en un celular.

## 5. Reconocimiento de voz

- Usar Web Speech API cuando `SpeechRecognition` o su variante compatible esté disponible.
- Usar inicialmente el idioma `es-CO`.
- Mostrar la vista previa en el celular.
- Enviar resultados intermedios al TV para reducir la latencia percibida.
- Enviar y conservar únicamente el texto correspondiente a la frase actual; una nueva frase reemplaza la anterior.
- Mantener siempre disponible la entrada manual de texto.
- Si el reconocimiento no está disponible, informarlo claramente y recomendar el dictado del teclado del celular como alternativa.
- No grabar, almacenar ni enviar audio a Firebase. El TV recibe únicamente texto.
- Informar en la documentación de privacidad que la Web Speech API puede procesar audio mediante servicios del proveedor del navegador.

## 6. Emparejamiento y ciclo de vida de la sesión

- El código visible debe ser numérico y tener exactamente 6 dígitos, incluidos posibles ceros iniciales.
- El código es válido durante un máximo de 10 minutos desde su creación, únicamente mientras ningún celular esté conectado.
- Cada TV admite como máximo un celular conectado en el MVP.
- Cada sesión debe usar internamente un `sessionId` criptográficamente aleatorio, independiente y distinto del código visible.
- El código visible sirve únicamente para descubrir la sesión; no debe utilizarse como identificador permanente de esta.
- Al completar el emparejamiento, eliminar o inutilizar de forma atómica el código para impedir su reutilización.
- La aceptación del emparejamiento debe evitar que dos celulares reclamen simultáneamente la misma sesión.
- No guardar historial permanente. La sesión almacena únicamente el texto actualmente mostrado y los metadatos mínimos de estado, propiedad y expiración.
- Borrar el contenido actual cuando el usuario use **BORRAR TV**.
- Considerar cierres de pestañas, pérdida de red y otras desconexiones inesperadas. Las pantallas deben mostrar un estado comprensible y permitir recuperar o reiniciar el flujo sin conservar conversaciones.
- Las sesiones y códigos abandonados deben tener fecha de expiración. La implementación debe impedir su uso tras expirar y eliminarlos mediante un mecanismo de limpieza compatible con la arquitectura sin servidor propio.
- Usar timestamps confiables de Firebase para validar la vigencia y mecanismos de presencia/desconexión de Realtime Database cuando correspondan.

## 7. Arquitectura técnica

- Frontend estático.
- Vite como herramienta de desarrollo y build.
- Vanilla JavaScript, HTML y CSS; no usar React.
- Firebase JavaScript SDK.
- Firebase Anonymous Authentication para identificar de forma temporal a cada cliente.
- Firebase Realtime Database para emparejamiento, presencia y sincronización del texto actual.
- GitHub Pages para hosting.
- GitHub Actions para build y deploy.
- No desplegar un servidor propio Node, Express, Socket.IO ni equivalente.
- Node se utiliza únicamente durante desarrollo, tests y build.
- La configuración pública necesaria del cliente Firebase se suministra mediante variables de entorno `VITE_FIREBASE_*`. No incluir secretos privados en el frontend ni en el repositorio.

La implementación concreta del esquema de datos puede evolucionar, siempre que preserve estos requisitos y las reglas de seguridad indicadas a continuación.

## 8. Privacidad y seguridad

- No guardar audio.
- El TV recibe únicamente texto.
- No almacenar historial de transcripciones ni frases anteriores.
- No incluir claves privadas, credenciales administrativas ni otros secretos en el frontend.
- Configurar Firebase Realtime Database con reglas *deny-by-default*.
- Autorizar cada lectura y escritura explícitamente según la identidad anónima, la pertenencia a la sesión, el estado y la expiración.
- No permitir listar indiscriminadamente sesiones, códigos de emparejamiento ni su contenido. La consulta de un código debe ser directa y limitada al código exacto introducido.
- Validar en las reglas el formato y tamaño de los datos, las transiciones de estado permitidas, el límite de un celular y la expiración cuando sea posible.
- Tratar el código de 6 dígitos como un mecanismo temporal de descubrimiento, no como una contraseña de alta seguridad.
- Minimizar los datos almacenados y limitar su vida útil.
- Documentar que, según el navegador, la Web Speech API puede utilizar servicios externos del proveedor para reconocer la voz.

## 9. Requisitos de calidad y accesibilidad

- La función principal debe ser comprensible sin instrucciones extensas.
- La interfaz debe responder correctamente en navegadores de Smart TV y celulares compatibles dentro de las limitaciones documentadas.
- Los estados de conexión, error, expiración y falta de compatibilidad deben expresarse con lenguaje sencillo.
- No depender únicamente del color para comunicar estados.
- Mantener foco visible, controles etiquetados y navegación básica por teclado.
- Priorizar alto contraste, tipografía legible, objetivos táctiles grandes y poco contenido simultáneo.
- Antes de dar por terminada una tarea de implementación, ejecutar los tests existentes y el build.

## 10. Fuera del alcance inicial

- Cuentas de usuario permanentes.
- Historial de conversaciones o transcripciones.
- Almacenamiento o reproducción de audio.
- Más de un celular conectado a un TV.
- Servidor de aplicación propio en producción.
- Frameworks de interfaz como React.
- Funciones generales de chat o mensajería.

## 11. Estado del proyecto

El MVP está implementado con dos entradas (`index.html` y `tv.html`), sincronización mediante Firebase, reglas de Realtime Database, pruebas automatizadas y despliegue de GitHub Pages. `README.md` contiene la configuración y las limitaciones operativas actuales.

## 12. Diagnóstico temporal y explícito del TV

- Únicamente `debug=1` como parámetro de la URL del TV habilita un panel de diagnóstico cuando ocurre un error.
- Mostrar entorno del navegador, disponibilidad de APIs, autenticación sin UID, presencia de Realtime Database, reloj local, offset, hora estimada del servidor y diferencia local menos servidor.
- Distinguir fallos de inicialización de Firebase, autenticación, lectura del reloj, escritura de sesión, transacción de pairing y onDisconnect, conservando la causa interna y mostrando code, name y message redactado solo en debug.
- Mantener visible el fallo de lectura del reloj aunque se use el fallback local o falle una operación posterior.
- Nunca mostrar configuración completa, API key, tokens, credenciales, UID, sessionId ni códigos adicionales. No almacenar ni transmitir diagnósticos.
- Sin ese parámetro, conservar mensajes genéricos y no añadir observadores de diagnóstico. No cambiar arquitectura, reglas ni comportamiento del ciclo de vida para diagnosticar.
