# Torneo 3x3 benéfico por la Teletón

Página para reservar un cupo del torneo del **6 de noviembre de 2026**, a las **13:00**, en el Complejo Educacional Manuel Plaza Reyes. Hay **16 equipos**. La inscripción es de **$5.000** por equipo y todo lo recaudado se dona a la Teletón.

Al enviar el formulario el cupo queda **reservado** y ya no lo puede tomar otro equipo. Se confirma cuando el organizador ve el comprobante en Instagram y cambia el estado a **pagado**.

Los RUT no se publican en la página. Solo quedan en la Google Sheet de los organizadores.

## Lo que hace un equipo

1. Completa el formulario con un nombre respetuoso, 3 jugadores (el cuarto puede quedar pendiente) y el WhatsApp del capitán. Puede jugar cualquier persona, de cualquier edad y sexo. Si un RUT ya está en otro equipo, la página lo indica y no deja reservar.
2. Transfiere **$5.000** a esta cuenta:
   - Banco: Mercado Pago
   - Tipo: Cuenta vista
   - Número: 1077881431
   - Titular: Sebastian Alexis Amigo Vera
   - RUT: 19.341.577-6
   - Correo de aviso: redknights.bball.contacto@gmail.com
   - Referencia: RK-2026-000007
3. Manda el comprobante por Instagram a [@red_knights_basketball](https://ig.me/m/red_knights_basketball), con el código del equipo. Si falta el cuarto jugador, manda después el nombre y el RUT por el mismo chat.

## Activar las inscripciones

La página ya puede publicarse, pero no guarda equipos hasta conectar la planilla. Haz esto una vez:

1. Crea una Google Sheet nueva, por ejemplo `Inscripciones 3x3 Teletón`.
2. Ábrela y entra a **Extensiones > Apps Script**.
3. Borra el código de ejemplo y pega todo el archivo [`apps-script/Code.gs`](apps-script/Code.gs).
4. Guarda el proyecto (el nombre puede ser `Inscripciones 3x3`).
5. Arriba a la derecha, **Implementar > Nueva implementación**.
6. Elige el tipo **Aplicación web**.
7. Déjalo así:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquiera**
8. Autoriza los permisos. Google va a avisar que la app no está verificada: abre **Configuración avanzada** y continúa, porque el script es tuyo.
9. Copia la URL que termina en `/exec`.
10. Pégala en [`config.js`](config.js), en `scriptUrl`, entre las comillas:

```javascript
scriptUrl: "https://script.google.com/macros/s/......../exec",
```

11. Sube ese cambio al repositorio. Sin este paso la página sigue diciendo que las inscripciones no están activas.

Si más adelante cambias `Code.gs`, en Apps Script hay que usar **Implementar > Administrar implementaciones > Editar > Nueva versión**. La URL se mantiene.

## Confirmar un pago o liberar un cupo

Abre la hoja `Inscripciones`. Cada fila es un equipo.

- Cuando llegue el comprobante por Instagram, busca el código del equipo y cambia **Estado** de `reservado` a `pagado`.
- Si no pagan y quieres soltar el cupo, cambia **Estado** a `liberado`. La fila se conserva, pero deja de ocupar uno de los 16.
- Borrar la fila también libera el cupo.
- Para sumar al cuarto jugador, completa **Jugador 4** y **RUT 4** en esa fila.

Solo las filas `reservado` y `pagado` descuentan cupo. La página pública muestra cuántos quedan y los nombres de equipo. No muestra jugadores, RUT ni teléfonos.
