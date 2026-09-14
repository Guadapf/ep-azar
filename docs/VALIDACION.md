# Registro de validación

Actualización: el usuario confirmó posteriormente que la versión instalada para Netflix funciona. La versión 0.2.0 agrega HBO Max y pasa 24 pruebas; ver `HBO_MAX.md`. Las observaciones siguientes corresponden a la validación inicial de Netflix.

Fecha de la inspección: 12 de septiembre de 2026. Navegador: Chrome conectado, interfaz de Netflix en español, catálogo mostrando la sección de Argentina.

## Evidencia de la web real

| Comprobación | Resultado |
| --- | --- |
| Identificar la ficha de Friends | Confirmado: `jbv=70153404`, diálogo de detalles y encabezado «Acerca de Friends». |
| Enumerar temporadas | Confirmado: 10 opciones de temporada; el menú también contiene «Ver todos los episodios», que debe excluirse del sorteo. |
| Cambiar a temporada 10 | Confirmado: cambia el rótulo y carga una lista nueva. |
| Expandir la temporada 10 | Confirmado: de 10 tarjetas iniciales a 17, igual al total anunciado por el menú. |
| Abrir el episodio 17, «El final» | Confirmado mediante el control de Netflix: navegación a `/watch/70274231`. |
| Reproducción efectiva | No confirmada: se mantuvo el indicador de carga, sin elemento `video` disponible en la inspección. No se determinó la causa. |
| Serie con una temporada: DANG! | Confirmado: 8 tarjetas, sin selector, total «8 episodios» en los metadatos y encabezado identificable. |
| Identidad durante cambios de ficha | Se observó carga diferida. Se comprueba también el identificador de serie del enlace principal cuando está disponible, para rechazar una ficha anterior durante la transición. |

Estas comprobaciones usan las herramientas del navegador sobre la interfaz real. No equivalen a una ejecución de la extensión instalada ni prueban que todos los clics programáticos sean aceptados por Netflix.

## Pruebas locales

- Selección uniforme por temporada y luego por episodio, incluyendo temporadas de distinta longitud.
- Lista vacía, opción única y límites del generador aleatorio.
- Extracción de temporada/episodio usando fixtures sintéticos con los atributos observados.
- Carga diferida, expansión y verificación de cantidad total.
- Temporada única y rechazo si falta el total publicado.
- Cancelación por cambio de serie y rechazo de URL/ficha desactualizada.
- Metadatos rotos, pantalla de inicio y ruta de inicio de sesión.
- Doble clic, continuidad sin consultas del popup y confirmación por avance del video.
- Resultado disponible cuando no se confirma la reproducción.
- Comprobación de tipos y compilación con Vite.
- Inspección visual del popup mediante vista local: sin errores de disposición observados. Esta vista no tiene permisos de extensión.

## Prueba final pendiente con la extensión instalada

El control de navegador bloqueó la apertura de `chrome://extensions/` por su política de URLs. La instalación debe realizarla el usuario desde Chrome; no se intentó eludir ese bloqueo. Resultado local final: 15 pruebas aprobadas y compilación/comprobación de tipos correctas.

1. Instalar `dist` en Chrome y comprobar que no aparezcan errores en su tarjeta.
2. Friends: abrir «Más info», abrir la extensión y comprobar el nombre. Sortear y confirmar que el episodio abierto coincide con el resultado.
3. Repetir cerrando el popup inmediatamente tras pulsar el botón; reabrirlo para consultar el estado.
4. DANG! u otra serie de temporada única: comprobar el sorteo y la apertura.
5. Durante una carga, cambiar de ficha: no debe abrirse un episodio de la serie anterior.
6. Comprobar una carga lenta o reproducción bloqueada: debe mostrarse un error o el resultado con la acción para abrirlo, sin afirmar que el video se reproduce.
7. Abrir un episodio parcialmente visto y comprobar que se respete la decisión de Netflix de reanudarlo. La extensión no altera `currentTime`.
8. Comprobar el mensaje sin sesión iniciada en una sesión de prueba; no se cerró la sesión personal durante este trabajo.

No se solicitó acceso persistente al sitio, permiso de almacenamiento, ni otro mecanismo de integración. Cualquier ampliación de ese alcance requiere consultar al usuario.
