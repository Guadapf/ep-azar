# Brave: preparación y validación de la versión 0.2.1

Fecha: 14 de septiembre de 2026. Windows, interfaz de los servicios en español. Se distribuye una única carpeta `dist` para Chrome y Brave.

## Versiones observadas

Se leyeron los metadatos de los ejecutables instalados, sin iniciar actualizaciones ni modificar la configuración.

| Navegador | ProductVersion / FileVersion del ejecutable | Conexión para esta prueba |
| --- | --- | --- |
| Brave Browser | 153.1.95.101 | Disponible |
| Google Chrome | 153.0.8010.36 | No disponible en esta sesión |

Estas son las versiones reportadas por los archivos de Windows. No se verificó la versión comercial mostrada en la pantalla «Acerca de» ni una eventual actualización pendiente del proceso abierto.

## Instalación y actualización

1. En Brave abrí `brave://extensions`.
2. Activá **Modo de desarrollador**.
3. Elegí **Cargar descomprimida** y seleccioná `C:\Guada\extension\dist`.
4. Si ya estaba instalada en Brave, pulsá **Recargar** en su tarjeta en lugar de agregarla de nuevo.
5. Recargá las pestañas de Netflix y HBO Max para eliminar el script de una versión anterior.
6. Abrí la ficha de una serie y usá el icono **Episodio al azar — Netflix y HBO Max**.

La instalación se hace por navegador: instalar en Chrome no la instala en Brave. Ambos apuntan al mismo paquete compilado, pero usan sus propias sesiones del servicio.

## Cambios incluidos

- El mensaje de la vista sin APIs de extensión menciona Chrome y Brave.
- Documentación de instalación y actualización para ambos navegadores.
- Se mantienen Manifest V3, las APIs `chrome.*`, los permisos `activeTab` y `scripting`, y un solo build con objetivo de sintaxis `chrome120`.
- Corrección de una diferencia real en HBO Max: el nombre accesible de la ficha puede decir «Two and a Half Men» y el encabezado «Two And A Half Men». La comparación ignora mayúsculas, pero sigue rechazando títulos distintos. Se conserva el título original para mostrarlo.
- No se alteraron el sorteo, las probabilidades, la selección de episodios ni la configuración del navegador.

## Resultados observados

| Comprobación | Resultado |
| --- | --- |
| Netflix en Brave: ficha de Friends | Detectada; 10 temporadas en el menú. |
| Netflix: cambiar a temporada 10 y expandir | Confirmado; 17 tarjetas coinciden con el total publicado. |
| Netflix: abrir episodio 1 de temporada 10 | Navega a `/watch/70274215`. |
| Netflix: reproducción efectiva | No confirmada. El reproductor quedó cargando y no se observó un elemento `video`. No se determinó la causa. |
| HBO Max en Brave: Two And A Half Men | Ficha identificada; 12 temporadas en el menú. |
| HBO Max: cambiar a temporada 12 | Confirmado; 16 enlaces, con la última etiqueta «16 de 16». |
| HBO Max: reproducción normal | Confirmada desde el enlace del primer episodio. Se observó `paused=false`, `readyState=4` y tiempo avanzado a aproximadamente 21 segundos. |
| Pruebas automatizadas | 25 aprobadas, incluida la regresión de Netflix y HBO Max y la nueva comprobación de mayúsculas. |
| Comprobación de tipos y compilación | Correctas; versión 0.2.1 en `dist`. |
| Extensión instalada en Brave | Pendiente de carga/actualización y prueba desde el icono. |
| Nueva prueba instalada en Chrome | Pendiente; no estaba conectado. La confirmación anterior del usuario sobre Netflix no se presenta como una prueba nueva de 0.2.1. |

Las operaciones sobre los servicios se realizaron mediante sus controles normales. No equivalen a una prueba del paquete instalado. No se declara la compatibilidad completa con Brave hasta terminar ambas pruebas reales con la extensión.

## Casos pendientes en la instalación real

- Verificar que Netflix reproduzca normalmente en Brave antes de atribuirle cualquier fallo a la extensión.
- En ambos servicios: comprobar nombre de serie y proveedor, sorteo, coincidencia del resultado con el episodio abierto y reproducción efectiva.
- Cerrar el popup inmediatamente después del clic y comprobar que la operación termine.
- Hacer doble clic y comprobar que haya una sola operación.
- Cambiar de serie durante la carga y comprobar que se descarte la selección anterior.
- Repetir un sorteo en Chrome con esta misma compilación.

El cierre del popup, doble clic y cambio de serie tienen cobertura automatizada del controlador, pero aún requieren la comprobación del navegador instalado solicitada en el plan.

## Diagnóstico si un servicio no reproduce

Primero probar la reproducción desde los controles del propio servicio. Brave utiliza Widevine para contenido protegido; si aparece una solicitud para habilitarlo o el sitio muestra un error, consultar al usuario antes de modificar configuración o aceptar condiciones. No se cambió Widevine ni Shields durante este trabajo.

Referencias oficiales: [extensiones compatibles con Brave](https://support.brave.com/hc/en-us/articles/360017909112-How-can-I-add-extensions-to-Brave) y [reproducción de contenido protegido](https://support.brave.com/hc/es/articles/360023851591--C%C3%B3mo-veo-el-contenido-protegido-por-DRM).
