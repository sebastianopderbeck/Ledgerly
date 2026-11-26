# Menú unificado y filtros compactos — diseño

Fecha: 2026-11-26
Estado: en revisión.

Mockup interactivo: https://claude.ai/artifact/M1LSCdYxWMQnV7619iZCUk (opción A, solapas «Pastillas»).

## Objetivo

El menú lateral quedó con 12 entradas sueltas y cuesta encontrar las cosas. Se juntan por tipo: cada grupo es
una sola entrada del menú y, al abrirlo, sus secciones aparecen como solapas arriba de la página.

Ya que estamos, los filtros de las páginas con búsqueda o con varios filtros se compactan: la búsqueda queda
siempre a la vista y ocupa el ancho libre, y el resto se esconde detrás de un botón «Filtros».

Son dos cambios independientes y van en dos ramas: primero el menú, después los filtros.

## Decisiones tomadas

Las de la conversación:

- **Agrupación A («por tipo»):**

  | Entrada del menú | Solapas, en orden |
  | --- | --- |
  | Inicio | Dashboard (sin solapas) |
  | Gastos | Movimientos · Suscripciones · Servicios · Vencimientos |
  | Ingresos | Sueldo · Flujo |
  | Deudas | Créditos · Auto |
  | Patrimonio | Patrimonio · Contexto |
  | Datos (al pie del menú, encima de «Colapsar») | Importar · Reglas |

- **Solapas con estilo de pastilla**, como en el mockup.
- **La sidebar pasa a ser un riel:** una pastilla angosta que flota separada del borde, con el ícono de cada
  entrada y su nombre abajo (variante «Riel» del mockup). No se colapsa.
- **Filtros, opción intermedia:** se esconden detrás de «Filtros» cuando la página tiene búsqueda o más de un
  filtro: Movimientos, Importar y Dashboard. Donde solo hay Año (Sueldo, Flujo, Créditos, Auto, Patrimonio,
  Contexto), el selector sigue a la vista como hoy.

Decisiones mías (a revisar):

### Menú

- **Las URLs no cambian.** Cada solapa es un link a la ruta que ya existe (`/transactions`, `/suscripciones`,
  `/credits`…) y conserva los filtros globales de año y moneda, como hoy (`useNavSearch`). Los links guardados
  y los que arma la app (`transactionsLink.ts`) siguen andando.
- **Cada entrada del menú lleva a su primera solapa** y se marca activa cuando la ruta actual es cualquiera de
  sus solapas. Movimientos sigue a un click: es la primera de Gastos.
- **El encabezado lo dibuja el Layout:** el nombre del grupo como título y debajo las pastillas. En Inicio, que
  tiene una sola sección, el título es «Dashboard» y no hay pastillas. Las páginas del menú dejan de dibujar su
  propio título (`h4`) y conservan la introducción y sus botones («Agregar servicio», «Agregar activo»,
  «Reaplicar a todo»), en la fila de la introducción.
- **Las pastillas son links, no pestañas de ARIA:** cada una navega a otra ruta. Van dentro de un `nav` con
  nombre («secciones de Gastos») y la actual con `aria-current="page"`. En pantallas angostas la fila se
  desliza de costado.
- **Datos (Importar · Reglas) va al pie del menú.** El botón de importar de la pill de arriba sigue igual y
  lleva a `/import`, que ahora se ve dentro de Datos.
- **Celular:** la barra de abajo pasa a Inicio · Gastos · Ingresos · Deudas · Patrimonio y desaparece «Más»
  (se borran `MoreSheet` y su test). A Datos se llega desde el botón de importar de la pill.
- **El riel:** unos 84 px de ancho, separado 12 px del borde izquierdo y de arriba, con las esquinas redondeadas,
  el vidrio, el borde y la sombra de la pill de acciones de arriba a la derecha. Mide lo que su contenido
  (si la ventana es más baja, scrollea por dentro). Arriba solo el isotipo de Ledgerly, sin el nombre. Cada
  entrada es el ícono dentro de una pastilla indicadora con el nombre abajo, en 11 px; la activa tiene la
  pastilla con el fondo `primary` suave y el texto en `primary`. Datos queda al pie, separado por una línea.
- **Se va el colapsar:** el botón «Colapsar», `useSidebarCollapsed` y la preferencia guardada
  (`ledgerly.sidebarCollapsed`). `SIDEBAR_WIDTH` pasa a ser un solo ancho y `sidebarItemSx` se reemplaza por el
  estilo de la entrada del riel. El contenido gana el ancho que antes ocupaba la sidebar expandida.
- **Íconos de los grupos** (MUI, outlined): Inicio `SpaceDashboard`, Gastos `ShoppingBag`, Ingresos
  `Payments`, Deudas `AccountBalance`, Patrimonio `AccountBalanceWallet`, Datos `Storage`. Las pastillas usan
  los íconos que cada sección tiene hoy.
- **Rutas fuera del menú** (`/installments`, `/presupuestos`, hoy apagadas): no muestran encabezado de grupo y
  conservan su propio título.
- **Datos del menú en `navItems.ts`:** `NAV_GROUPS` pasa a describir secciones con sus solapas
  (`id`, `label`, `icon`, `tabs`), más funciones puras para encontrar la sección de una ruta y armar la barra
  del celular. Sigue en `components/layout/` con su spec al lado, como hoy.

### Filtros

- **Un componente de presentación compartido** para la fila compacta: búsqueda a lo ancho, botón «Filtros» con
  la cantidad de filtros ocultos activos y, al lado, el resumen de lo aplicado («2026 · USD · Supermercado»).
  Al tocar el botón se despliega abajo, en la misma página, una fila con el resto de los filtros. Arranca
  cerrada. Lo usan `FiltersBar` (Movimientos, Dashboard) e `ImportedFilesFilters` (Importar).
- **Sin búsqueda (Dashboard):** la fila tiene solo el botón y el resumen.
- **El número del botón no cuenta la búsqueda**, porque la búsqueda está a la vista. Hoy
  `activeFilterCount` la cuenta; se agrega en el dominio (`filters/activeFilters.ts`) un conteo de los filtros
  ocultos, con su spec.
- **La regla de cuándo se compacta va en el dominio:** compacta si los campos incluyen la búsqueda o si hay más
  de un campo.
- **Importar:** sus filtros (Tipo, Año, Solo a revisar) viven en estado local, no en la URL. El conteo y el
  resumen para el botón salen de funciones nuevas en `importedFiles.ts`, con spec.
- **Celular:** ya tiene botón, resumen y hoja inferior. Lo único que cambia es que la búsqueda pasa arriba del
  botón y que el número del botón deja de contar la búsqueda. Importar, que hoy no tiene variante para el
  celular, usa la misma fila compacta en todos los tamaños.
- **Cuotas** (`/installments`, fuera del menú) tiene Año, Moneda y Tarjeta, así que se compacta sola por la
  regla.

## Enfoques considerados

**Menú**

1. **Elegido: rutas como están y encabezado en el Layout.** La sección y sus pastillas salen de `navItems.ts`
   según la ruta actual. No se toca el router ni los links internos, y las pastillas no se animan con la
   transición de página: queda fija mientras cambia el contenido.
2. Rutas anidadas (`/gastos/suscripciones`) con una página por grupo y `<Outlet>`. Cambia todas las URLs,
   rompe links guardados y obliga a redirecciones, sin ganar nada sobre la 1.
3. Que cada página dibuje sus pastillas. Repite el mismo bloque en 11 páginas y es fácil que una quede
   desfasada.

**Filtros**

1. **Elegido: panel que se despliega en la página**, compartido entre las barras de filtros.
2. Popover flotante. Los selects de MUI abren su menú encima del popover y, para cambiar varios filtros, hay que
   abrirlo y cerrarlo seguido.
3. La hoja inferior del celular también en compu. Tapa la tabla y en una pantalla grande queda fuera de lugar.

## Fuera de alcance

- Volver a prender Cuotas y Presupuestos en el menú.
- Los filtros de la tabla de recibos en Sueldo (Tipo, Desde, Hasta): son de la sección, no de la página, y
  quedan como están.
- Cambiar qué filtros tiene cada página.

## Pruebas

- **`navItems`:** cada ruta del menú pertenece a una sola sección, la sección de una ruta y la barra del
  celular.
- **Layout:** las entradas del riel con su nombre visible, Datos al pie, la entrada activa según la ruta, las
  pastillas con `aria-current` y los links que conservan los filtros globales. Los tests de «Más» y de
  colapsar la sidebar se reemplazan por los de la barra y el riel nuevos.
- **Páginas:** los tests que buscan el título de la página como heading se actualizan.
- **Filtros:** cuándo se compacta, el número sin la búsqueda, el resumen, y abrir y cerrar el panel. Lo mismo
  para Importar.
- **En el navegador:** compu y celular, modo claro y oscuro. Las capturas van a los PR.
