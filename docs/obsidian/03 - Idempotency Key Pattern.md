# 🔑 Patrón de Idempotencia (`Idempotency-Key`)

[[00 - Index & Architecture Overview]] | [[01 - Overbooking & Concurrency Control]]

---

## 🎯 Requisito de Negocio
Si el cliente envía dos veces una petición `POST /bookings` con el mismo header `Idempotency-Key: <key>` (debido a un timeout de red o reintento de cliente):
- Debe crearse **una sola reserva**.
- Ambas peticiones deben retornar la **misma respuesta** (status HTTP + body).

---

## 🗄️ Tabla de Idempotencia (`idempotency_keys`)

```sql
CREATE TABLE idempotency_keys (
    key VARCHAR(255) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🔁 Flujo de Ejecución

```mermaid
sequenceDiagram
    autonumber
    actor Client
    participant API as Express API
    participant DB as PostgreSQL

    Client->>API: POST /bookings (Idempotency-Key: ABC-123)
    API->>DB: SELECT response_status, response_body FROM idempotency_keys WHERE key = 'ABC-123'
    alt Key existe en DB
        DB-->>API: Retorna status (201) y body cacheado
        API-->>Client: HTTP 201 Created (Cacheado)
    else Key no existe
        API->>DB: BEGIN Transaction -> Lock & Create Booking
        DB-->>API: Booking creado
        API->>DB: INSERT INTO idempotency_keys VALUES ('ABC-123', 201, body)
        API->>DB: COMMIT Transaction
        API-->>Client: HTTP 201 Created (Nuevo)
    end
```
