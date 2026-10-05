# Base de datos privada de Silver Master

Tus propios precios de Albion Online, capturados en tu PC y guardados en tu cuenta de Cloudflare.
Solo se pueden leer o escribir con tu clave.

```
Albion Online (tu PC)  →  Albion Data Client  →  tu Worker en Cloudflare (+ base D1)  →  Silver Master (PC o teléfono)
```

El Albion Data Client es el programa de código abierto de Albion Online Data Project. Solo lee lo que el juego
ya le envía a tu computador; no modifica el juego ni hace acciones por ti.

> Los nombres de los menús de Cloudflare pueden cambiar con el tiempo. Si alguno no coincide, busca el más parecido.

## Parte 1 · Cloudflare (una sola vez, unos 10 minutos)

1. Crea una cuenta gratuita en <https://dash.cloudflare.com>.
2. **Crea la base de datos.** Menú *Storage & Databases* → *D1 SQL Database* → *Create Database*. Nombre: `silver-master`. No hay que crear tablas: el Worker las crea solo.
3. **Crea el Worker.** Menú *Workers & Pages* → *Create* → *Worker* (plantilla «Hello World»). Nombre: por ejemplo `mi-base`. Pulsa *Deploy*.
4. **Pega el código.** En el Worker, pulsa *Edit code*, borra todo lo que hay y pega el contenido completo de
   [`base-privada-worker.js`](https://raw.githubusercontent.com/eduardogonzalezpaidmedia/Albion/main/worker/base-privada-worker.js). Pulsa *Deploy*.
5. **Enlaza la base.** En el Worker: *Settings* → *Bindings* → *Add* → *D1 database*. En *Variable name* escribe exactamente `DB` y elige la base `silver-master`. Guarda.
6. **Crea tu clave.** En el Worker: *Settings* → *Variables and Secrets* → *Add*. Tipo *Secret*, nombre exactamente `CLAVE`, y como valor una contraseña larga inventada por ti (mínimo 12 caracteres, solo letras y números para evitar problemas en la dirección). Guarda y vuelve a desplegar si lo pide.
7. **Prueba.** Tu Worker tiene una dirección como `https://mi-base.TU-USUARIO.workers.dev`. Abre en el navegador:

   `https://mi-base.TU-USUARIO.workers.dev/stats?key=TU_CLAVE`

   Debe responder algo como `{"ok":true,"rows":0,...}`. Si dice que falta `DB` o `CLAVE`, revisa los pasos 5 y 6.

## Parte 2 · Tu PC (donde juegas)

1. Descarga e instala el **Albion Data Client** desde <https://www.albion-online-data.com>.
2. Hay que abrirlo con una opción extra, `-p`, que le dice a dónde mandar también tus datos:

   ```
   albiondata-client.exe -p "https://mi-base.TU-USUARIO.workers.dev/in/TU_CLAVE"
   ```

   En Windows lo más cómodo es un acceso directo: clic derecho sobre el acceso directo del programa → *Propiedades* → en *Destino*, después de la comilla final, agrega un espacio y `-p "https://mi-base.TU-USUARIO.workers.dev/in/TU_CLAVE"`.
3. Con eso sigue enviando a la base pública (ayudas a la comunidad y a ti misma) **y además** a la tuya.
   - Si quieres enviar **solo** a la tuya, usa `-i` en lugar de `-p`: `-i "https://mi-base.TU-USUARIO.workers.dev/in/TU_CLAVE"`.
   - Si con `-p` no llegan precios a tu base, usa las dos direcciones en `-i`, separadas por coma:
     `-i "https+pow://albion-online-data.com,https://mi-base.TU-USUARIO.workers.dev/in/TU_CLAVE"`.
4. Abre el juego, ve al mercado y mira algunos objetos (órdenes de venta y de compra).
5. Vuelve a abrir la dirección de prueba de la Parte 1: `rows` debe haber subido.

## Parte 3 · Silver Master

1. *Mi plata* → *Ajustes*.
2. **Base privada · dirección:** `https://mi-base.TU-USUARIO.workers.dev`
3. **Base privada · clave:** tu clave.
4. Pulsa **Probar base privada**. Debe decir «Conectada» y cuántos precios hay.
5. Pulsa **Guardar**. Hazlo también en el teléfono si quieres usarla ahí.

Desde ese momento, cuando la app carga precios pide también los tuyos y usa el **más reciente** de cada uno
(venta y compra por separado). Si tu base no responde, la app sigue con los datos públicos.

## Qué guarda

- **Precios:** por objeto, ciudad y calidad, la orden de venta más barata y la de compra más alta que viste, con fecha, cuántas órdenes había y cuántas unidades.
- **Órdenes:** la lista de precios y cantidades de la última vez que abriste ese objeto (hasta 50 por lado).
- **Tus ventas:** los avisos de venta y de órdenes vencidas que te llegan por correo en el juego.

## Cosas a saber

- Solo se captura lo que **tú** abres en el mercado, y solo en el PC con el programa abierto.
- La clave viaja en la dirección. No compartas capturas donde se vea, y no la publiques.
- El plan gratuito de Cloudflare alcanza de sobra para uso personal.
- Antes de usar el programa lector, revisa en la página del proyecto y en las reglas del juego que siga estando permitido.
- Si en la prueba aparecen «mercados sin nombre» (`loc:1234`), es un mercado cuyo identificador no está en la lista del Worker: se agrega editando `LOCATIONS` al inicio del código.
- Para borrar todo: en Cloudflare, borra la base D1 (o sus tablas).
