# 🗓️ Solapamiento de Horarios y Casos Borde

[[00 - Index & Architecture Overview]]

---

## 📐 Fórmula Matemática de Solapamiento

Dos rangos de tiempo $[A_{\text{start}}, A_{\text{end}})$ y $[B_{\text{start}}, B_{\text{end}})$ se solapan **si y solo si**:

$$A_{\text{start}} < B_{\text{end}} \quad \land \quad A_{\text{end}} > B_{\text{start}}$$

---

## 🔍 Consulta SQL Implementada

```sql
SELECT s.id, s.title, s.starts_at, s.duration_minutes
FROM bookings b
JOIN sessions s ON b.session_id = s.id
WHERE b.user_id = $userId
  AND s.starts_at < $newEndISO
  AND (s.starts_at + (s.duration_minutes || ' minutes')::interval) > $newStartISO;
```

---

## 🧪 Casos Evaluados en la Test Suite (`tests/overlap.test.ts`)

| Caso | Configuración de Sesión B | Resultado Esperado | Explicación |
| :--- | :--- | :--- | :--- |
| **Cruzo Inicial** | Inicia antes de A y termina durante A | `409 Conflict` | Solapamiento al inicio de A |
| **Cruzo Final** | Inicia durante A y termina después de A | `409 Conflict` | Solapamiento al final de A |
| **Sesión Envolvente** | Inicia antes de A y termina después de A | `409 Conflict` | La sesión B cubre completamente a A |
| **Sesión Consecutiva** | Inicia exactamente cuando A termina | `201 Created` | Válido, no hay solapamiento |
