# 🔒 Prevención de Sobreventa & Control de Concurrencia

[[00 - Index & Architecture Overview]]

---

## 💥 El Problema Original
En producción se vendieron **43 lugares para una sala de 30 personas** debido a una **Condición de Carrera (Race Condition)**:
1. Petición A y Petición B leen simultáneamente `cupos_ocupados = 29`.
2. Ambas evalúan `29 < 30` como `TRUE`.
3. Ambas insertan una reserva.
4. Resultado: `cupos_ocupados = 31` (sobreventa).

---

## 🛡️ Solución Implementada: Pessimistic Locking (`FOR UPDATE`)

En el servicio de reservas (`src/services/booking.service.ts`), la operación se envuelve dentro de una transacción PostgreSQL con **bloqueo pesimista de fila**:

```typescript
const result = await withTransaction(async (client) => {
  // 1. Bloqueo de fila a nivel de sesión
  const sessionRes = await client.query(
    `SELECT id, capacity FROM sessions WHERE id = $1 FOR UPDATE`,
    [sessionId]
  );

  // 2. Conteo de reservas actuales
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS booked_seats FROM bookings WHERE session_id = $1`,
    [sessionId]
  );

  if (countRes.rows[0].booked_seats >= session.capacity) {
    throw new ConflictError('Session capacity reached');
  }

  // 3. Inserción garantizada atómicamente
  await client.query(
    `INSERT INTO bookings (session_id, user_id) VALUES ($1, $2)`,
    [sessionId, userId]
  );
});
```

---

## 💡 ¿Por qué esta solución escala a Múltiples Instancias?
Si corremos **3 o 10 instancias** de la API detrás de un Load Balancer (Nginx/AWS ALB):
- El bloqueo se gestiona **en el motor de base de datos PostgreSQL**.
- Cuando 200 peticiones llegan a distintas instancias de la API simultáneamente, todas intentan ejecutar `SELECT ... FOR UPDATE` sobre la fila `session_id = 42`.
- PostgreSQL encola las 199 peticiones restantes. Las procesa secuencialmente en microsegundos.
- Las primeras 10 completan la inserción (201 Created). Las 190 restantes leen `booked_seats = 10` y retornan **409 Conflict** inmediatamente.

---

## 🧪 Resultado de la Prueba de Fuego (`stress.js`)

```text
$ node stress.js --session=42 --concurrency=200

  201 Created  ·············  10
  409 Conflict ·············  190
  500 Error    ·············   0

  SELECT COUNT(*) FROM bookings WHERE session_id = 42;
  → 10

  PASS — sin sobreventa en 5 ejecuciones consecutivas
```
