# DECISIONS.md — Respuestas y Criterios Técnicos

## 1. Sobreventa

### ¿Qué mecanismo exacto usaste para garantizar que nunca se supera la capacidad?

Para garantizar que una sesión con 10 lugares expuesta a 200 peticiones simultáneas nunca acepte 11 reservas, utilicé un **bloqueo pesimista a nivel de fila (`Pessimistic Locking`) mediante `SELECT ... FOR UPDATE` sobre la tabla `sessions` dentro de una transacción relacional de PostgreSQL**.

#### Flujo exacto de ejecución en `src/services/booking.service.ts`:
1. Se inicia una transacción PostgreSQL (`BEGIN`).
2. Se ejecuta `SELECT id, capacity FROM sessions WHERE id = $1 FOR UPDATE`. Esta instrucción adquiere un bloqueo exclusivo sobre la fila de la sesión.
3. Las peticiones concurrentes que intentan reservar la misma sesión quedan en espera bloqueadas por el Lock Manager nativo de PostgreSQL.
4. **Idempotencia Concurrente Post-Lock (Check-Lock-Recheck)**: Inmediatamente tras adquirir el lock, se consulta la tabla `idempotency_keys`. Si una petición previa con la misma clave acaba de hacer commit mientras esperábamos en cola, se retorna inmediatamente el HTTP `201 Created` con la misma respuesta cacheadas sin procesar de nuevo la reserva.
5. Dentro del bloqueo exclusivo, se cuenta el número real de reservas en `bookings`:
   `SELECT COUNT(*)::int AS booked_seats FROM bookings WHERE session_id = $1`.
6. Si `booked_seats < capacity` (primeras 10 peticiones): se valida solapamiento de horarios, se inserta la reserva en `bookings`, se guarda la clave en `idempotency_keys` y se hace `COMMIT`.
7. Si `booked_seats >= capacity` (siguientes 190 peticiones): se aborta la transacción (`ROLLBACK`) y se responde inmediatamente con HTTP `409 Conflict`.

### ¿Qué alternativas descartaste y por qué?

1. **Check Constraint con columna denormalizada (`booked_seats` en `sessions`)**:
   - *Idea*: Agregar `booked_seats INT` a `sessions` y hacer `UPDATE sessions SET booked_seats = booked_seats + 1 WHERE id = $1 AND booked_seats < capacity`.
   - *Por qué se descartó*: Aunque es rápido, exige sincronizar dos tablas (`sessions` y `bookings`) y decrementar en cancelaciones. En caso de anulaciones concurrentes o fallos transaccionales, la columna denormalizada corre riesgo de desfasarse de las filas reales en `bookings`.

2. **Bloqueo Optimista (`Optimistic Concurrency Control` / Versioning)**:
   - *Idea*: Usar una columna `version` en `sessions` y hacer `UPDATE ... WHERE version = N`.
   - *Por qué se descartó*: Bajo una ráfaga masiva de 200 peticiones simultáneas sobre 10 lugares, 190 peticiones fallarían por conflicto de versión y exigirían reintentos intensivos (retry loops), saturando la CPU y la base de datos con transacciones abortadas en lugar de ser rechazadas limpiamente con HTTP 409.

3. **Redis Distributed Lock (Redlock)**:
   - *Idea*: Adquirir un lock en Redis (`SET lock_session_42 NX PX 5000`) antes de tocar PostgreSQL.
   - *Por qué se descartó*: Añade una dependencia de infraestructura externa adicional que puede desincronizarse si la base de datos aborta la transacción pero Redis otorgó el lock. El lock nativo de PostgreSQL es 100% consistente dentro del mismo motor transaccional.

---

## 2. Múltiples instancias

### Si mañana corremos 3 instancias de la API detrás de un balanceador, ¿tu solución sigue funcionando? ¿Por qué?

**Sí, funciona exactamente igual sin ninguna modificación.**

### Razones Técnicas:
- **API Stateless**: El backend en Express no almacena estado de locks ni reservas en memoria de proceso Node.js.
- **Bloqueos Centralizados en el Motor de BD**: Cuando 3 instancias de la API reciben 200 peticiones distribuidas por un balanceador de carga (ej. Nginx o AWS ALB), las 3 instancias abren conexiones a la misma base de datos PostgreSQL.
- Cuando la Instancia 1 y la Instancia 2 ejecutan `SELECT ... FOR UPDATE` sobre `session_id = 42`, el Lock Manager de PostgreSQL serializa las peticiones a nivel de BD. Solo una transacción obtiene la cerradura a la vez, garantizando consistencia ACID absoluta.

---

## 3. Rendimiento del listado

### ¿Cómo lograste el tiempo de respuesta en GET /sessions?

Se logró mediante **Paginación por Cursor Opaco** (en lugar de `OFFSET`) e **Índices Compuestos B-Tree** en PostgreSQL.

#### 1. Evitar OFFSET:
En tablas con ~100.000 filas, `OFFSET 50000` exige a la base de datos escanear y descartar 50.000 filas anteriores ($O(N)$). Con Cursor Pagination, codificamos la tupla `(starts_at, id)` de la última sesión en `base64`. PostgreSQL salta directamente al lugar correcto del índice B-Tree en tiempo logarítmico ($O(\log N)$).

#### 2. Estrategia de Índices SQL (`schema.sql`):
```sql
CREATE INDEX idx_sessions_starts_at_id ON sessions (starts_at DESC, id DESC);
CREATE INDEX idx_bookings_session_id ON bookings (session_id);
```

#### 3. EXPLAIN ANALYZE Real de PostgreSQL:

Consulta ejecutada sobre la base sembrada con **5.000 sesiones** y **97.483 reservas**:

```text
EXPLAIN ANALYZE
SELECT 
  s.id,
  s.title,
  s.instructor,
  s.starts_at,
  s.duration_minutes,
  s.capacity,
  (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id) AS booked_seats,
  (s.capacity - (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id)) AS available_seats
FROM sessions s
WHERE s.starts_at >= '2026-06-01T00:00:00.000Z'
  AND (s.capacity - (SELECT COUNT(*)::int FROM bookings b WHERE b.session_id = s.id)) > 0
ORDER BY s.starts_at DESC, s.id DESC
LIMIT 20;

PLAN OBTENIDO:
Limit  (cost=0.28..476.06 rows=20 width=63) (actual time=0.047..0.235 rows=20 loops=1)
  ->  Index Scan using idx_sessions_starts_at_id on sessions s  (cost=0.28..39656.42 rows=1667 width=63) (actual time=0.046..0.233 rows=20 loops=1)
        Index Cond: (starts_at >= '2026-06-01 00:00:00+00'::timestamp with time zone)
        Filter: ((capacity - (SubPlan 3)) > 0)
        SubPlan 1
          ->  Aggregate  (cost=4.69..4.71 rows=1 width=4) (actual time=0.002..0.002 rows=1 loops=20)
                ->  Index Only Scan using idx_bookings_session_id on bookings b  (cost=0.29..4.64 rows=20 width=0) (actual time=0.001..0.001 rows=22 loops=20)
                      Index Cond: (session_id = s.id)
Planning Time: 0.635 ms
Execution Time: 0.311 ms
```

**Resultado**: Tiempo de ejecución **0.311 ms** (sub-milisegundo), cumpliendo con holgura la meta de < 200 ms.

---

## 4. Uso de IA

### ¿En qué partes te apoyaste en IA? ¿Qué te generó que estaba mal o incompleto, y cómo lo detectaste?

1. **En qué me apoyé**:
   - Generación inicial del boilerplate TypeScript/Express y estructuras de datos.
   - Script para generación masiva de datos en streaming para `seed.sql`.

2. **Qué generó mal o incompleto y cómo lo detecté**:
   - **Fallo 1: Condición de carrera en Idempotencia Concurrente**: La IA sugirió inicialmente verificar la tabla `idempotency_keys` únicamente fuera de la transacción. Al llegar dos peticiones simultáneas con la misma clave (ej. doble-clic rápido), la segunda entraba al lock después de que la primera había creado la reserva y era rechazada erróneamente con `409 Conflict ("Usuario ya reservó")` en vez de recibir el `201` duplicado. Se detectó creando la prueba de concurrencia de idempotencia en `tests/idempotency-concurrency.test.ts` y el runner interactivo web, y se resolvió realizando una re-verificación (*double-check*) dentro del lock transaccional.
   - **Fallo 2: Bloqueo sin FOR UPDATE**: La IA inicialmente sugirió un `SELECT COUNT(*)` previo al `INSERT` sin `FOR UPDATE`. Se detectó al ejecutar `stress.js` y `tests/concurrency.test.ts`, produciendo sobreventa bajo 200 conexiones.
   - **Fallo 3: Solapamiento incompleto de horarios**: La IA sugirió un `BETWEEN` que no cubría el caso donde una sesión de 6 horas envuelve por completo a una de 1 hora. Se detectó y corrigió con la prueba en `tests/overlap.test.ts`.

---

## 5. Lo que quedó fuera y Simplificaciones

### ¿Qué no hiciste y qué harías con una semana más?

1. **Columna denormalizada o Materialized View para `only_available`**:
   - Como se identificó en el `EXPLAIN ANALYZE`, el filtro `only_available` es un `Filter` evaluado post-escaneo. Para garantizar < 10 ms incluso si el 99% de los talleres están agotados, agregaría una columna `is_sold_out BOOLEAN` o `available_seats INT` indexada, o una vista materializada refrescada concurrentemente.
2. **Buffer / Cola de Mensajes para Picos Masivos**:
   - Con miles de peticiones simultáneas a `POST /bookings`, el pool de conexiones de Postgres (`max: 20`) se satura esperando locks. Con 1 semana más implementaría una cola (BullMQ + Redis) para procesar reservas de forma ordenada por sala.
3. **Decisión consciente en /login (Autenticación)**:
   - Siguiendo la indicación explícita del reto (*"No inviertas tiempo en registro, recuperación de contraseña ni refresh tokens: dos usuarios sembrados y un POST /login bastan"*), `/login` autentica por email y emite JWT firmado sin validar hash de bcrypt ni implementar registro, priorizando la simplicidad del flujo de prueba solicitado.
4. **Panel Interactivo de Pruebas en el Frontend**:
   - Se construyó una pestaña interactiva "Panel de Pruebas & Concurrencia" en la interfaz web para ejecutar la simulación de carga de 200 peticiones en vivo, test de idempotencia concurrente y benchmarks de latencia con 1 solo clic.
