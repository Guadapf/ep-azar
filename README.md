# Episodio al azar — Netflix y HBO Max

Extensión local para Chrome y Brave de escritorio en Windows, escrita en TypeScript con HTML/CSS y compilada con Vite. Detecta Netflix o HBO Max y abre un episodio de la serie cuya ficha está abierta: primero sortea una temporada y después un episodio de esa temporada. Ambos navegadores usan el mismo paquete; la validación real en Brave se registra en `docs/BRAVE.md`.

Versión actual: **0.2.2**, con soporte para `www.netflix.com` y `play.hbomax.com`, interfaz en español. Mantiene los permisos `activeTab` y `scripting`.

## Actualizar desde la versión de Netflix

La carpeta `dist` ya está recompilada. En `chrome://extensions` (Chrome) o `brave://extensions` (Brave), pulsá **Recargar** en la tarjeta de la extensión. Después recargá las pestañas de Netflix y HBO Max. Dentro del mismo navegador no hace falta agregar otra extensión ni conceder permisos adicionales.

En HBO Max, abrí la ficha de una serie y su pestaña **Episodios**. Al abrir la extensión verás **EN HBO MAX** y el nombre de la serie. El botón realiza el mismo sorteo que en Netflix.

## Instalación local

La versión compilada está en `C:\Guada\extension\dist`.

1. Abrí `chrome://extensions` en Chrome o `brave://extensions` en Brave.
2. Activá **Modo de desarrollador**.
3. Elegí **Cargar descomprimida** y seleccioná la carpeta `C:\Guada\extension\dist` (no la raíz del proyecto).
4. Iniciá sesión en el servicio y abrí **Más info** de una serie en Netflix o la ficha con **Episodios** en HBO Max. Esperá a que aparezcan los episodios.
5. Abrí **Episodio al azar — Netflix y HBO Max** desde el menú de extensiones y pulsá **Episodio al azar**.

La operación puede cambiar el selector de temporada y expandir la lista de episodios del servicio. Podés cerrar la ventana de la extensión durante el sorteo; el trabajo continúa en la pestaña. Dejá esa pestaña abierta.

Para actualizar el código instalado, recompilá, pulsá **Recargar** en la tarjeta de la extensión y recargá el servicio: así se descarta el script anterior.

## Comportamiento

- Cada temporada disponible tiene igual probabilidad, aunque sus cantidades de episodios sean diferentes.
- Se leen todos los episodios de la temporada elegida y se compara el resultado con el total publicado por el servicio antes de sortear. Si no se puede confirmar la lista completa, se muestra un error.
- Las series con una sola temporada se reconocen sin depender de un menú de temporadas.
- Se activa el control del episodio en el servicio. No se modifica el punto de reproducción ni se descarga el video. En HBO Max se conserva el enlace publicado por la tarjeta, incluido `pos=0` cuando el propio sitio ofrece «Ver de nuevo».
- Solo se confirma «se está reproduciendo» cuando el video avanza. Si no se puede confirmar, se conserva el resultado y aparece **Abrir episodio elegido**. Si ya estás en ese episodio, ese botón vuelve a cargar su página.
- Se permiten repeticiones. No se guardan filtros ni historial.
- Si cambiás de serie durante la carga, el sorteo se cancela. Un doble clic no inicia dos operaciones.
- Al volver del reproductor a la ficha, se descarta el estado del episodio anterior y se habilita otro sorteo, incluso si todavía se estaba comprobando la reproducción.

## Permisos y datos

El manifiesto declara solamente `activeTab` y `scripting`. Al abrir la extensión se obtiene acceso temporal a la pestaña; el código comprueba que su origen sea exactamente `https://www.netflix.com` o `https://play.hbomax.com` antes de inyectarse. No se admiten otros subdominios por coincidencia parcial.

La integración usa el DOM en el mundo aislado de la extensión. En Netflix lee controles `data-uia` y el identificador `video_id` de las tarjetas. En HBO Max lee el panel «Episodios», las opciones de temporada y las etiquetas accesibles/enlaces de cada episodio. No usa APIs privadas, scripts en el contexto JavaScript del servicio, cookies, credenciales ni solicitudes a un servidor propio.

El estado del sorteo vive en memoria en la pestaña. Cerrar el popup no lo elimina. Una recarga completa, cerrar la pestaña o reiniciar el navegador sí lo elimina; no se reanuda un trabajo después de esos eventos. La navegación interna puede mantener el estado; si reemplaza el documento entero, será necesario volver a abrir la extensión.

## Desarrollo

Entorno usado: Node.js 24.17.0 y npm 11.17.0. Las versiones de dependencias quedan fijadas en `package-lock.json`.

```powershell
cd C:\Guada\extension
npm.cmd ci
npm.cmd test
npm.cmd run build
```

`build` ejecuta la comprobación de tipos y produce el popup y un content script autocontenido en formato IIFE. La carpeta `dist` es el paquete instalable; no incluye dependencias ni pruebas.

`npm.cmd run dev` ofrece una vista local en `http://127.0.0.1:5173/popup.html`. Sirve para revisar la presentación; las APIs de extensión solo funcionan una vez instalada en Chrome o Brave. El objetivo de compilación `chrome120` describe la compatibilidad del motor Chromium, no una restricción al navegador Google Chrome; se conserva un único build.

### Organización

- `src/netflix.ts`: reconocimiento de ficha, temporadas, carga completa e identificación de episodios.
- `src/hbomax.ts`: lector equivalente para HBO Max, con verificación de temporada, cantidad total y conservación del enlace del episodio.
- `src/providers.ts`: detección del sitio y selección del adaptador; el controlador y el popup comparten esta interfaz.
- `src/random.ts`: selección uniforme con fuente aleatoria inyectable para pruebas.
- `src/controller.ts` y `src/content.ts`: operación independiente del popup, mensajes, exclusión de trabajos simultáneos y comprobación de reproducción.
- `src/popup.ts`, `src/popup.css` y `popup.html`: ventana de la extensión.
- `tests/`: probabilidades, fixtures sintéticos del DOM y ciclo de vida del controlador.

## Estado de validación

Consultar `docs/VALIDACION.md` y `docs/HBO_MAX.md`. El usuario confirmó que la versión instalada de Netflix funciona. En la inspección de HBO Max se comprobaron la enumeración de temporadas, la lista completa de episodios y la reproducción desde un enlace del sitio.

El usuario confirmó el funcionamiento de la extensión tras incorporar Brave y reportó que HBO Max conservaba el estado «reproduciendo» al volver atrás. La versión 0.2.2 corrige ese estado; las 29 pruebas automatizadas incluyen volver a la misma ficha después de reproducir y durante la comprobación del video, tanto en HBO Max como en Netflix. La corrección requiere una comprobación manual con la extensión recargada. Consultar `docs/BRAVE.md` para el registro anterior de versiones y pruebas. Las integraciones dependen del formato actual de las webs en español y pueden necesitar mantenimiento si cambia.
