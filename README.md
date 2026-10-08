# Episodio al azar — Netflix, HBO Max y Disney+

Extensión local para Chrome y Brave de escritorio en Windows, escrita en TypeScript con HTML/CSS y compilada con Vite. Detecta Netflix, HBO Max o Disney+ y abre un episodio de la serie cuya ficha está abierta: primero sortea una temporada y después un episodio de esa temporada. Ambos navegadores usan el mismo paquete; la validación real en Brave se registra en `docs/BRAVE.md` y `docs/DISNEY_PLUS.md`.

Versión actual: **0.4.0**, con soporte para `www.netflix.com`, `play.hbomax.com` y `www.disneyplus.com`, interfaz en español. Usa los mismos permisos: `activeTab`, `scripting` y el permiso autorizado `storage` para el modo continuo.

La ventana tiene estética de televisor de tubo de los 2000: carcasa plateada, pantalla verde, indicadores de canal y botones con relieve. La textura de pantalla es estática. Los indicadores CH 01, STEREO y POWER son decorativos; las acciones se realizan con los botones de sorteo y modo continuo.

## Actualizar la extensión

La carpeta `dist` contiene el paquete compilado. En `chrome://extensions` (Chrome) o `brave://extensions` (Brave), pulsá **Recargar** en la tarjeta de la extensión. Después recargá las pestañas del servicio. Se sigue usando una sola extensión por navegador.

En HBO Max, abrí la ficha de una serie y su pestaña **Episodios**. Al abrir la extensión verás **EN HBO MAX** y el nombre de la serie. El botón realiza el mismo sorteo que en Netflix.

En Disney+, abrí la ficha de una serie y la pestaña **EPISODIOS**. La extensión muestra **EN DISNEY+** y permite el sorteo individual y el modo continuo. Durante la preparación desplaza la página para cargar los episodios de cada temporada. Disney+ no publica un total verificable: se recorre la paginación hasta que la lista deja de crecer durante tres segundos. Una carga excepcionalmente lenta puede omitir episodios. Esta comprobación fue autorizada por el usuario; no usa APIs privadas ni permisos adicionales.

## Instalación local

La versión compilada está en `C:\Guada\extension\dist`.

1. Abrí `chrome://extensions` en Chrome o `brave://extensions` en Brave.
2. Activá **Modo de desarrollador**.
3. Elegí **Cargar descomprimida** y seleccioná la carpeta `C:\Guada\extension\dist` (no la raíz del proyecto).
4. Iniciá sesión en el servicio y abrí **Más info** de una serie en Netflix o la ficha con **Episodios** en HBO Max o Disney+. Esperá a que aparezcan los episodios.
5. Abrí **Episodio al azar — Netflix, HBO Max y Disney+** desde el menú de extensiones y pulsá **Episodio al azar**.

La operación puede cambiar el selector de temporada y expandir la lista de episodios del servicio. Podés cerrar la ventana de la extensión durante el sorteo; el trabajo continúa en la pestaña. Dejá esa pestaña abierta.

Para actualizar el código instalado, recompilá, pulsá **Recargar** en la tarjeta de la extensión y recargá el servicio: así se descarta el script anterior.

## Comportamiento

### Modo aleatorio continuo

1. Desde la ficha de una serie, pulsá **Iniciar modo continuo**.
2. Esperá la preparación: se leen y verifican todas las temporadas una sola vez. Podés cerrar el popup mientras trabaja; no cambies la ficha durante la lectura.
3. Se abre un episodio aleatorio y queda otro preparado. Durante la reproducción, **Volver a sortear el próximo** cambia únicamente el siguiente.
4. Al terminar el video, se abre el episodio preparado y se sortea otro. El popup puede permanecer cerrado.
5. **Desactivar modo continuo** borra la sesión sin interrumpir el video actual. Durante la lectura, el mismo botón permite cancelar la preparación.

El catálogo queda separado por pestaña en `chrome.storage.session`; los sorteos siguientes no vuelven a consultar las temporadas. Se conservan nombres, identificadores, enlaces y la duración publicada cuando está disponible, nunca videos ni historial. Cambiar de serie, volver a la ficha o cerrar la pestaña detiene el modo. Reiniciar el navegador o recargar la extensión borra las sesiones. La recarga de la página del episodio conserva el modo.

La activación inicial se hace desde la ficha: el reproductor por sí solo no garantiza acceso a todas las temporadas. Cada cambio automático abre la página del siguiente episodio con la sesión del servicio. Si el navegador bloquea la reproducción automática, usá **Reproducir** en el sitio. Detalles y pruebas pendientes en [docs/CONTINUO.md](docs/CONTINUO.md).

### Sorteo individual

- Cada temporada disponible tiene igual probabilidad, aunque sus cantidades de episodios sean diferentes.
- En Netflix y HBO Max se compara la lista con el total publicado antes de sortear. En Disney+ se comprueba por paginación y estabilidad de la lista, con la limitación indicada arriba. Una carga que exceda el tiempo máximo muestra un error.
- Las series con una sola temporada se reconocen sin depender de un menú de temporadas.
- Se activa el control del episodio en el servicio. No se modifica el punto de reproducción ni se descarga el video. En HBO Max se conserva el enlace publicado por la tarjeta, incluido `pos=0` cuando el propio sitio ofrece «Ver de nuevo».
- Solo se confirma «se está reproduciendo» cuando el video avanza. Si no se puede confirmar, se conserva el resultado y aparece **Abrir episodio elegido**. Si ya estás en ese episodio, ese botón vuelve a cargar su página.
- Se permiten repeticiones. No se guardan filtros ni historial.
- Si cambiás de serie durante la carga, el sorteo se cancela. Un doble clic no inicia dos operaciones.
- Al volver del reproductor a la ficha, se descarta el estado del episodio anterior y se habilita otro sorteo, incluso si todavía se estaba comprobando la reproducción.

## Permisos y datos

El manifiesto declara `activeTab`, `scripting` y `storage`. Al abrir la extensión se obtiene acceso temporal a la pestaña; el código comprueba que su origen sea exactamente `https://www.netflix.com`, `https://play.hbomax.com` o `https://www.disneyplus.com` antes de inyectarse. No se admiten otros subdominios por coincidencia parcial. El servicio de segundo plano usa solo `storage.session`, sin `local` ni `sync`; el catálogo no se expone al sitio.

La integración usa el DOM en el mundo aislado de la extensión. En Netflix lee controles `data-uia` y el identificador `video_id` de las tarjetas. En HBO Max lee el panel «Episodios», las opciones de temporada y las etiquetas accesibles/enlaces de cada episodio. En Disney+ lee la ficha, el selector, las tarjetas, el marcador de paginación y la línea de tiempo pública. No usa APIs privadas, scripts en el contexto JavaScript del servicio, cookies, credenciales ni solicitudes a un servidor propio.

El sorteo individual y una preparación aún incompleta viven en la pestaña y se pierden al recargarla. Una vez preparado el modo continuo, su catálogo y sus dos selecciones (actual y siguiente) viven en memoria de sesión de la extensión. Un servicio de segundo plano restaura la escucha del reproductor tras cada navegación autorizada, aunque el popup esté cerrado.

## Desarrollo

Entorno usado: Node.js 24.17.0 y npm 11.17.0. Las versiones de dependencias quedan fijadas en `package-lock.json`.

```powershell
cd C:\Guada\extension
npm.cmd ci
npm.cmd test
npm.cmd run build
```

`build` ejecuta la comprobación de tipos y produce el popup, el content script y el servicio de segundo plano. La carpeta `dist` es el paquete instalable; no incluye dependencias ni pruebas.

`npm.cmd run dev` ofrece una vista local en `http://127.0.0.1:5173/popup.html`. Sirve para revisar la presentación; las APIs de extensión solo funcionan una vez instalada en Chrome o Brave. El objetivo de compilación `chrome120` describe la compatibilidad del motor Chromium, no una restricción al navegador Google Chrome; se conserva un único build.

### Organización

- `src/netflix.ts`: reconocimiento de ficha, temporadas, carga completa e identificación de episodios.
- `src/hbomax.ts`: lector equivalente para HBO Max, con verificación de temporada, cantidad total y conservación del enlace del episodio.
- `src/disneyplus.ts`: ficha, temporadas, episodios y paginación de Disney+.
- `src/playback.ts`: identificación del video activo y lectura de la línea de tiempo pública de Disney+.
- `src/providers.ts`: detección del sitio y selección del adaptador; el controlador y el popup comparten esta interfaz.
- `src/random.ts`: selección uniforme con fuente aleatoria inyectable para pruebas.
- `src/controller.ts` y `src/content.ts`: operación independiente del popup, mensajes, exclusión de trabajos simultáneos y comprobación de reproducción.
- `src/catalog.ts`: preparación completa y sorteo desde los datos guardados.
- `src/continuous.ts` y `src/continuous-player.ts`: preparación cancelable y escucha de eventos del video.
- `src/continuous-session.ts` y `src/background.ts`: sesiones por pestaña, navegación, recuperación y protección frente a eventos duplicados.
- `src/popup.ts`, `src/popup.css` y `popup.html`: ventana de la extensión.
- `tests/`: probabilidades, fixtures sintéticos del DOM y ciclo de vida del controlador.

## Estado de validación

Consultar `docs/VALIDACION.md` y `docs/HBO_MAX.md`. El usuario confirmó que la versión instalada de Netflix funciona. En la inspección de HBO Max se comprobaron la enumeración de temporadas, la lista completa de episodios y la reproducción desde un enlace del sitio.

El usuario confirmó el funcionamiento de la extensión tras incorporar Brave y reportó que HBO Max conservaba el estado «reproduciendo» al volver atrás. La versión 0.2.2 corrige ese estado; las 29 pruebas automatizadas incluyen volver a la misma ficha después de reproducir y durante la comprobación del video, tanto en HBO Max como en Netflix. La corrección requiere una comprobación manual con la extensión recargada. Consultar `docs/BRAVE.md` para el registro anterior de versiones y pruebas. Las integraciones dependen del formato actual de las webs en español y pueden necesitar mantenimiento si cambia.

La versión 0.3.0 agrega pruebas del modo continuo. La validación automatizada no sustituye la prueba del encadenamiento real con Netflix/HBO Max y la extensión instalada. Consultar [docs/CONTINUO.md](docs/CONTINUO.md).

La versión 0.4.0 agrega Disney+ y pruebas de paginación, cancelación, video activo y modo continuo. Se inspeccionaron las temporadas, la carga adicional y la reproducción nativa de Modern Family en Brave. El recorrido con la extensión recargada y el cambio automático al terminar requieren validación manual. Ver [docs/DISNEY_PLUS.md](docs/DISNEY_PLUS.md).
