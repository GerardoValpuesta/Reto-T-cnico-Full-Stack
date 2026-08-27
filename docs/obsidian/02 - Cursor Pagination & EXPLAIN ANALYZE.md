# ⚡ Paginación por Cursor y EXPLAIN ANALYZE

[[00 - Index & Architecture Overview]] | [[01 - Overbooking & Concurrency Control]]

---

## ⚡ ¿Por qué Cursor en lugar de Offset?

El offset tradicional (`OFFSET 10000 LIMIT 20`) obliga a la base de datos a **escanear y descartar 10.000 filas**, lo que degrada el rendimiento linealmente ($O(N)$).

Con **Cursor Pagination**, usamos un puntero opaco (codificado en `base64`) que contiene la tupla `(starts_at, id)` de la última sesión entregada.

### Fórmula del Cursor:
```sql
WHERE s.starts_at < $cursor_date OR (s.starts_at = $cursor_date AND s.id < $cursor_id)
ORDER BY s.starts_at DESC, s.id DESC
LIMIT 20;
```

---

## 📊 EXPLAIN ANALYZE Real de PostgreSQL

Consulta ejecutada en la base sembrada con **5.000 sesiones** y **~100.000 reservas**:

```text
Limit  (cost=0.28..476.06 rows=20 width=63) (actual time=0.047..0.235 rows=20 loops=1)
  ->  Index Scan using idx_sessions_starts_at_id on sessions s  (cost=0.28..39656.42 rows=1667 width=63) (actual time=0.046..0.233 rows=20 loops=1)
        Index Cond: (starts_at >= '2026-06-01 00:00:00+00'::timestamp with time zone)
        Filter: ((capacity - (SubPlan 3)) > 0)
        SubPlan 1
          ->  Aggregate  (cost=4.69..4.71 rows=1 width=4) (actual time=0.002..0.002 rows=1 loops=20)
                ->  Index Only Scan using idx_bookings_session_id on bookings b  (cost=0.29..4.64 rows=20 width=0) (actual time=0.001..0.001 rows=22 loops=20)
                      Index Cond: (session_id = s.id)
        SubPlan 2
          ->  Aggregate  (cost=4.69..4.71 rows=1 width=4) (actual time=0.002..0.002 rows=1 loops=20)
                ->  Index Only Scan using idx_bookings_session_id on bookings b_1  (cost=0.29..4.64 rows=20 width=0) (actual time=0.001..0.001 rows=22 loops=20)
                      Index Cond: (session_id = s.id)
        SubPlan 3
          ->  Aggregate  (cost=4.69..4.71 rows=1 width=4) (actual time=0.006..0.006 rows=1 loops=20)
                ->  Index Only Scan using idx_bookings_session_id on bookings b_2  (cost=0.29..4.64 rows=20 width=0) (actual time=0.004..0.005 rows=22 loops=20)
                      Index Cond: (session_id = s.id)
Planning Time: 0.635 ms
Execution Time: 0.311 ms
```

### 🎯 Conclusiones de Rendimiento:
1. **Tiempo total de ejecución**: `0.311 ms` (¡Sub-milisegundo!).
2. **Índice Utilizado**: `idx_sessions_starts_at_id` para realizar un B-Tree Index Scan instantáneo.
3. **Index Only Scan**: El cálculo de `available_seats` realiza subconsultas correlacionadas utilizando únicamente el índice `idx_bookings_session_id` solo para las 20 filas paginadas.
