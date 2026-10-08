# Modo continuo — versión 0.3.0

Implementado el 2 de octubre de 2026. Paquete único para Chrome y Brave de escritorio.

## Funcionamiento y rendimiento

- Preparación explícita desde la ficha: recorre una vez todas las temporadas utilizando los adaptadores y sus comprobaciones de lista completa. No sortea sobre un catálogo parcial.
- Sortea primero una temporada y luego un episodio dentro de ella, con probabilidades uniformes y repeticiones permitidas.
- Conserva catálogo, selección actual y próxima en memoria de sesión por pestaña. No guarda historial y no descarga videos.
- Los eventos del video disparan la continuidad. No hay un temporizador permanente consultando el catálogo o enviando mensajes mientras se reproduce. El popup consulta estado solo mientras está abierto.
- El servicio de segundo plano puede suspenderse y recuperar la sesión desde `storage.session`. Se vuelven a instalar los listeners tras cargar la página del episodio. Se serializan las operaciones por pestaña y se identifican por sesión y generación para ignorar eventos de finales anteriores.
- Navegar a una ficha o salir del sitio elimina la sesión; cerrar la pestaña también. Desactivar no pausa el video. Una recarga del episodio conserva la sesión; recargar la extensión o reiniciar el navegador la elimina.

## Final del episodio y avance nativo

La señal principal es `ended` de un único video listo en la ruta del episodio seleccionado. Se ignoran eventos de otras rutas o páginas con varios videos listos, para evitar avanzar desde un reproductor ambiguo.

Algunos sitios saltan de episodio durante los créditos antes de emitir `ended`. Cuando el video avanza por el último 10% de su duración, con un máximo de dos minutos, se habilita temporalmente la sustitución de un salto a otro episodio conocido por el siguiente sorteado. No se adelanta el video actual por tiempo: se espera el salto del sitio o su evento de finalización. Pausar o buscar otro punto desarma esa ventana; volver a reproducir cerca del final la arma nuevamente. El clic explícito en enlaces o controles identificables de siguiente/salida y la vuelta atrás desactivan el modo.

Esta detección del salto nativo es una heurística que requiere validación real. Saltos fuera de esa ventana detienen el modo. La navegación manual por la barra de direcciones a otro episodio conocido durante esa ventana puede confundirse con el avance nativo. Los planes con anuncios y los reproductores que oculten/reemplacen el video durante el final no están validados. No se cambian ajustes de autoplay del usuario. Si la página nueva queda pausada, hay que iniciar la reproducción con los controles del sitio.

## Permiso autorizado

Se agregó `storage` con autorización del usuario; se utiliza únicamente `chrome.storage.session` en el worker. Se mantiene el acceso predeterminado limitado a contextos de la extensión. No se agregaron permisos de hosts, `tabs`, `webNavigation` ni acceso a APIs privadas.

Referencias: [memoria de sesión de Chrome](https://developer.chrome.com/docs/extensions/reference/api/storage#session) y [duración del acceso activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

## Validación automatizada

La suite cubre catálogos completos de Netflix y HBO Max, temporadas de distinta longitud, recuperación de sesión, independencia entre pestañas, volver a sortear sin navegar, final duplicado, repetición del mismo episodio, preparación cancelada, regreso a ficha, salto nativo simulado, error de navegación y rechazo de enlaces externos. También simula destruir y recrear el controlador entre episodios. Las pruebas previas del sorteo individual y del bug de volver atrás se conservan.

## Prueba manual pendiente

1. Recargar la extensión en `chrome://extensions` o `brave://extensions` y recargar el sitio.
2. Abrir una serie de varias temporadas y activar el modo; cerrar el popup durante la preparación.
3. Comprobar la selección actual y próxima; volver a sortear la próxima sin interrumpir la actual.
4. Dejar finalizar un episodio con el popup cerrado, comprobar el elegido y repetir un segundo salto.
5. Probar el avance nativo durante créditos, pausa, búsqueda de otro punto, navegación atrás, recarga del reproductor y desactivación.
6. Repetir en Netflix y HBO Max, en Chrome y Brave; registrar navegador, serie, temporada, resultados y cualquier bloqueo de autoplay.

No se afirma que el encadenamiento instalado haya superado estas pruebas reales todavía.
