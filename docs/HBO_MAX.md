# HBO Max: integración 0.2.0

## Observación real

Inspección realizada en Chrome conectado, sobre The Big Bang Theory, en la web `play.hbomax.com` con interfaz en español.

- Ficha: `/show/c8ea8e19-cae7-4683-9b62-cdbbed744784`.
- El nombre está en el encabezado accesible de nivel 1 y coincide con el nombre del elemento `main`. La URL canónica permite detectar una ficha anterior durante la navegación.
- El panel accesible «Episodios» contiene el desplegable de temporada. Se observaron 12 opciones.
- Temporada 1: 17 enlaces de episodios. Temporada 12: 24 enlaces. Las tarjetas fuera de la parte visible del carrusel también exponen sus enlaces.
- Tras seleccionar otra temporada, el rótulo cambia antes de que se reemplacen los enlaces. El lector espera a que todas las etiquetas correspondan a la temporada elegida.
- Las etiquetas accesibles tienen marcas Unicode de dirección de texto y describen temporada, episodio y posición «N de TOTAL». Se normalizan esas marcas, se comprueba el total y se rechazan duplicados.
- Los enlaces reproducen episodios en `/video/watch/<uuid>`. Algunos incluyen `?pos=0`, elegido por HBO Max para «Ver de nuevo». La extensión conserva el enlace completo sin decidir por su cuenta si reanudar o reiniciar.
- Se abrió el primer episodio de la temporada 12, «The Conjugal Configuration», desde su enlace. Se observó un video con `paused=false`, `readyState=4` y tiempo avanzado a aproximadamente 17 segundos. Luego se regresó a la ficha.

Esto valida los controles y datos de la web. La prueba final del content script instalado requiere que el usuario recargue la extensión, porque el acceso automatizado a `chrome://extensions` ya fue bloqueado por la política de navegación en la etapa anterior.

## Implementación

El adaptador HBO Max implementa la misma interfaz que Netflix: identificar la serie, enumerar temporadas, obtener todos los episodios y comprobar que la ficha siga siendo la misma. El controlador mantiene el sorteo en dos pasos y la operación independiente del popup. La ventana cambia el nombre del servicio automáticamente.

Se mantienen los dos permisos originales y el acceso bajo demanda. No hay consultas a APIs privadas ni nuevos dominios de datos. Solo está habilitado el origen observado `https://play.hbomax.com`; otros dominios históricos de Max no se declaran compatibles sin validarlos.

Si no aparece el total, la lista es parcial o cambió el formato, la operación falla con un mensaje en lugar de sortear solo entre lo que haya cargado. La variante de una temporada sin desplegable está cubierta con un fixture sintético; no se validó aún sobre otra serie real.

## Pruebas

Resultado: **24 pruebas aprobadas**, incluida la regresión de Netflix. Comprobación de tipos y compilación correctas.

Las pruebas nuevas cubren orígenes exactos, limpieza de etiquetas, títulos con puntuación, conservación de `pos=0`, exclusión de enlaces ajenos al panel, carga diferida y lista parcial, duplicados, metadatos dañados, identidad de ficha, temporada única y continuidad sin popup.

### Comprobación después de actualizar

1. Recargar la extensión existente en Chrome y recargar la pestaña de HBO Max.
2. Abrir una serie en «Episodios» y comprobar que la ventana diga «EN HBO MAX» y el nombre correcto.
3. Sortear; comprobar que temporada y episodio correspondan al resultado y que se reproduzcan.
4. Repetir cerrando la ventana de la extensión inmediatamente después de pulsar el botón.
5. Volver a Netflix y comprobar un sorteo para confirmar la compatibilidad en la instalación real.
