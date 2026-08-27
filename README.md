# Plataforma de Reserva de Talleres Presenciales

Solución al reto técnico fullstack para la plataforma de reserva de talleres presenciales. Garantiza **cero sobreventa** bajo alta concurrencia, paginación por cursor en `GET /sessions` (< 1 ms de latencia), soporte de `Idempotency-Key` y validación estricta de solapamiento de horarios.

---

## Requisitos Previos

- **Node.js**: v18+
- **pnpm**: v9+ o v10+ (`npm install -g pnpm`)
- **Docker & Docker Compose**: Para levantar PostgreSQL en un contenedor de 1-comando.

---

## Inicio Rápido (Paso a Paso)

### 1. Clonar e instalar dependencias con `pnpm`
```bash
git clone <URL_DEL_REPOSITORIO>
cd Reto-tecnico-Fullstack
pnpm install
```

### 2. Levantar la Base de Datos PostgreSQL (Docker)
```bash
pnpm db:up
```

### 3. Inicializar Tablas y Sembrar Datos (~5.000 sesiones y ~100.000 reservas)
```bash
pnpm db:init
pnpm seed
```

### 4. Iniciar el Servidor de Desarrollo
```bash
pnpm dev
```
El servidor estará corriendo en: `http://localhost:3001`
La Interfaz Web estará disponible en: `http://localhost:3001`

---

## La Prueba de Fuego (`stress.js` y Panel Web)

### Opción A: Desde Terminal (Script CLI)
Para verificar que el sistema soporta **200 peticiones simultáneas** contra una sesión con **10 lugares** sin sobreventa durante **5 ejecuciones consecutivas**:

```bash
pnpm stress
```

#### Resultado Esperado:
```text
  201 Created  ·············   10
  409 Conflict ·············  190
  500 Error    ·············    0

  SELECT COUNT(*) FROM bookings WHERE session_id = 42;
  → 10

  PASS — SIN SOBREVENTA EN 5 EJECUCIONES CONSECUTIVAS
```

### Opción B: Desde la Interfaz Web (Panel Interactivo de Pruebas)
Abre `http://localhost:3001` en tu navegador y selecciona la pestaña **"Panel de Pruebas & Concurrencia"**.
1. Haz clic en **"Ejecutar Simulación de Carga"** para disparar 200 peticiones concurrentes en vivo directamente desde el cliente.
2. Observa el tablero de métricas en tiempo real (`201 Created: 10`, `409 Conflict: 190`, `500 Error: 0`) y la verificación automática de registros en base de datos.
3. Prueba el botón **"Idempotencia Concurrente"** para disparar 10 solicitudes con la misma `Idempotency-Key` simultáneamente.

---

## Ejecución de Tests Automatizados

Ejecuta la suite completa de pruebas unitarias e integración:

```bash
pnpm test
```

Los tests cubren:
- Concurrencia masiva y prevención de sobreventa (`concurrency.test.ts`).
- Idempotencia secuencial y concurrente check-lock-recheck (`idempotency.test.ts` e `idempotency-concurrency.test.ts`).
- Regla de solapamiento de horarios (`overlap.test.ts`).
- Cancelación con ventana de 2 horas y propiedad de usuario (`cancellation.test.ts`).
- Paginación por cursor y filtros (`sessions.test.ts`).

---

## Estructura del Proyecto

```text
.
├── schema.sql                      # Tablas DDL e Índices de Rendimiento
├── seed.sql / src/db/seed.ts       # Sembrado de 5.000 sesiones y ~100.000 reservas
├── stress.js                       # Script de prueba de carga concurrente
├── DECISIONS.md                    # Respuestas fundamentadas a las 5 preguntas del reto
├── README.md                       # Instrucciones de instalación y uso
├── src/
│   ├── config/                     # Variables de entorno
│   ├── db/                         # Pool de conexiones pg y helper transaccional
│   ├── middlewares/                # Autenticación JWT
│   ├── services/                   # Lógica de concurrencia FOR UPDATE, cursor y solapamiento
│   ├── controllers/                # Handlers HTTP
│   ├── routes/                     # Definición de endpoints
│   ├── app.ts                      # Configuración de Express y estáticos
│   └── server.ts                   # Entrypoint del servidor
├── tests/                          # Suite de Vitest (6 archivos de pruebas)
└── public/                         # Interfaz Web (HTML5 + CSS Glassmorphism + JS)
```

---

## Endpoints de la API

| Método | Ruta | Descripción | Autenticación |
| :--- | :--- | :--- | :--- |
| `POST` | `/login` | Autenticación simple (Retorna Token JWT) | Pública |
| `GET` | `/sessions` | Lista sesiones con paginación por cursor e `available_seats` | Pública |
| `POST` | `/bookings` | Crea reserva (Soporta `Idempotency-Key` header) | Bearer JWT |
| `DELETE` | `/bookings/:id` | Cancela reserva (Requiere > 2 horas de anticipación) | Bearer JWT |
| `GET` | `/my-bookings` | Lista las reservas activas del usuario autenticado | Bearer JWT |
| `POST` | `/api/test/reset-session` | Endpoint auxiliar para reiniciar datos en tests | Pública |
| `GET` | `/api/test/session-status/:id` | Consulta rápida de métricas de sesión para runner web | Pública |

---

## Video de 5 Minutos

Grabación de 5 minutos, en una sola toma, mostrando la aplicación funcionando (incluida una corrida de `stress.js`), el mecanismo usado para evitar la sobreventa, y una cosa que quedó peor de lo deseado.
