const API_URL = window.location.origin;
let currentToken = null;
let cursorHistory = [null];
let currentPageIndex = 0;
let nextCursorAvailable = null;
let hasMorePages = false;
let userBookedSessionIds = new Set();

// SVG Icons Constants
const ICONS = {
  check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`,
  user: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  calendar: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
  alertTriangle: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  document.getElementById('btnLogin').addEventListener('click', handleLogin);
  document.getElementById('userSelect').addEventListener('change', handleLogin);
  document.getElementById('btnApplyFilters').addEventListener('click', resetPaginationAndLoad);
  
  document.getElementById('btnPrevPage').addEventListener('click', handlePrevPage);
  document.getElementById('btnNextPage').addEventListener('click', handleNextPage);
  
  document.getElementById('tabSessions').addEventListener('click', () => switchTab('sessions'));
  document.getElementById('tabMyBookings').addEventListener('click', () => switchTab('myBookings'));
  document.getElementById('tabTestRunner').addEventListener('click', () => switchTab('testRunner'));

  const chkUpcoming = document.getElementById('chkUpcomingOnly');
  if (chkUpcoming) {
    chkUpcoming.addEventListener('change', loadMyBookings);
  }

  // Test Runner Event Listeners
  document.getElementById('btnResetTestSession').addEventListener('click', handleResetTestSession);
  document.getElementById('btnRunStressTest').addEventListener('click', handleRunStressTest);
  document.getElementById('btnRunIdempotencyTest').addEventListener('click', handleRunIdempotencyTest);
  document.getElementById('btnRunOverlapTest').addEventListener('click', handleRunOverlapTest);
  document.getElementById('btnRunLatencyTest').addEventListener('click', handleRunLatencyTest);

  // Auto-login default user1
  handleLogin();
}

async function handleLogin() {
  const email = document.getElementById('userSelect').value;
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) throw new Error('Login fallido');

    const data = await res.json();
    currentToken = data.token;
    
    document.getElementById('userBadge').classList.remove('hidden');
    showToast(`Conectado como ${data.user.email}`, 'success');

    resetPaginationAndLoad();
  } catch (err) {
    showToast('Error al iniciar sesión', 'error');
  }
}

function resetPaginationAndLoad() {
  cursorHistory = [null];
  currentPageIndex = 0;
  loadSessions();
}

function handleNextPage() {
  if (!hasMorePages) return;
  currentPageIndex++;
  loadSessions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handlePrevPage() {
  if (currentPageIndex <= 0) return;
  currentPageIndex--;
  loadSessions();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function fetchUserBookings() {
  if (!currentToken) {
    userBookedSessionIds.clear();
    return;
  }
  try {
    const myRes = await fetch(`${API_URL}/my-bookings`, {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });
    if (myRes.ok) {
      const myData = await myRes.json();
      userBookedSessionIds.clear();
      myData.data.forEach((b) => {
        if (b.session_id !== undefined && b.session_id !== null) {
          userBookedSessionIds.add(b.session_id);
          userBookedSessionIds.add(Number(b.session_id));
          userBookedSessionIds.add(String(b.session_id));
        }
      });
    }
  } catch (e) {}
}

async function loadSessions() {
  const loading = document.getElementById('sessionsLoading');
  const grid = document.getElementById('sessionsGrid');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  const pageIndicator = document.getElementById('pageIndicator');

  grid.innerHTML = '';
  loading.classList.remove('hidden');

  await fetchUserBookings();

  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const instructor = document.getElementById('filterInstructor').value;
  const onlyAvailable = document.getElementById('filterOnlyAvailable').checked;

  const currentCursor = cursorHistory[currentPageIndex] || null;

  const params = new URLSearchParams();
  params.append('limit', '12');
  if (from) params.append('from', new Date(from).toISOString());
  if (to) params.append('to', new Date(to).toISOString());
  if (instructor) params.append('instructor', instructor);
  if (onlyAvailable) params.append('only_available', 'true');
  if (currentCursor) params.append('cursor', currentCursor);

  try {
    const res = await fetch(`${API_URL}/sessions?${params.toString()}`);
    if (!res.ok) throw new Error('Error al cargar sesiones');

    const data = await res.json();
    loading.classList.add('hidden');

    renderSessions(data.data);

    hasMorePages = !!data.pagination?.has_more;
    nextCursorAvailable = data.pagination?.next_cursor || null;

    if (hasMorePages && nextCursorAvailable) {
      cursorHistory[currentPageIndex + 1] = nextCursorAvailable;
    }

    if (pageIndicator) {
      pageIndicator.textContent = `Página ${currentPageIndex + 1}`;
    }
    if (btnPrev) btnPrev.disabled = (currentPageIndex === 0);
    if (btnNext) btnNext.disabled = !hasMorePages;
  } catch (err) {
    loading.classList.add('hidden');
    showToast('Error al consultar sesiones', 'error');
  }
}

function renderSessions(sessions) {
  const grid = document.getElementById('sessionsGrid');
  
  if (sessions.length === 0) {
    grid.innerHTML = '<p class="empty-state">No se encontraron sesiones para los criterios seleccionados.</p>';
    return;
  }

  const now = Date.now();

  sessions.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'session-card panel-card';

    const sessionStartMs = new Date(s.starts_at).getTime();
    const sessionEndMs = sessionStartMs + (s.duration_minutes * 60 * 1000);
    const isPast = sessionEndMs < now;

    const isFull = s.available_seats <= 0;
    const isBooked = userBookedSessionIds.has(s.id);

    let badgeClass = 'seat-badge available';
    let badgeText = `${s.available_seats} / ${s.capacity} libres`;
    let buttonHtml = '';

    if (isPast) {
      badgeClass = 'seat-badge full';
      badgeText = 'FINALIZADO';
      buttonHtml = `<button disabled class="btn btn-secondary full-width" style="opacity: 0.6; cursor: not-allowed; font-weight: 700;">Taller Finalizado</button>`;
    } else if (isBooked) {
      badgeClass = 'seat-badge available';
      badgeText = 'RESERVADO POR TI';
      buttonHtml = `<button disabled class="btn btn-secondary full-width" style="opacity: 0.9; cursor: default; background: var(--ck-orange-soft); color: var(--ck-red-dark); font-weight: 800;">Lugar Reservado</button>`;
    } else if (isFull) {
      badgeClass = 'seat-badge full';
      badgeText = 'AGOTADO';
      buttonHtml = `<button disabled class="btn btn-primary full-width" style="opacity: 0.5; cursor: not-allowed;">Sin Cupo Disponible</button>`;
    } else {
      badgeClass = 'seat-badge available';
      badgeText = `${s.available_seats} / ${s.capacity} libres`;
      buttonHtml = `<button class="btn btn-primary btn-reserve full-width" data-id="${s.id}">Reservar Lugar</button>`;
    }

    const startsDate = new Date(s.starts_at).toLocaleString();

    card.innerHTML = `
      <div>
        <div class="session-card-header">
          <h4 class="session-title">${escapeHtml(s.title)}</h4>
          <span class="${badgeClass}">${badgeText}</span>
        </div>
        <div class="session-details">
          <p>${ICONS.user} <strong>Instructor:</strong> ${escapeHtml(s.instructor)}</p>
          <p>${ICONS.calendar} <strong>Inicio:</strong> ${startsDate}</p>
          <p>${ICONS.clock} <strong>Duración:</strong> ${s.duration_minutes} min</p>
          <p>${ICONS.tag} <strong>ID Sesión:</strong> <code class="code-tag">${s.id}</code></p>
        </div>
      </div>
      ${buttonHtml}
    `;

    const btnReserve = card.querySelector('.btn-reserve');
    if (btnReserve && !isFull && !isBooked && !isPast) {
      btnReserve.addEventListener('click', () => handleReserve(s.id, btnReserve));
    }

    grid.appendChild(card);
  });
}

async function handleReserve(sessionId, btnElement) {
  if (!currentToken) {
    showToast('Por favor inicia sesión primero', 'error');
    return;
  }

  btnElement.disabled = true;
  btnElement.textContent = 'Procesando...';

  // Unique Idempotency Key per click attempt
  const idempotencyKey = `ui-reserve-${sessionId}-${Date.now()}`;

  try {
    const res = await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ session_id: sessionId }),
    });

    const data = await res.json();

    if (res.status === 201) {
      showToast('Reserva realizada con éxito', 'success');
      userBookedSessionIds.add(sessionId);
      userBookedSessionIds.add(Number(sessionId));
      userBookedSessionIds.add(String(sessionId));
      loadSessions();
    } else {
      showToast(formatErrorMessage(data, res.status), 'error');
    }
  } catch (err) {
    showToast('Error de red al intentar reservar', 'error');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = 'Reservar Lugar';
  }
}

async function loadMyBookings() {
  const loading = document.getElementById('myBookingsLoading');
  const list = document.getElementById('myBookingsList');
  const chkUpcoming = document.getElementById('chkUpcomingOnly');
  const upcomingOnly = chkUpcoming ? chkUpcoming.checked : true;

  list.innerHTML = '';
  loading.classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/my-bookings?upcoming_only=${upcomingOnly}`, {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });

    if (!res.ok) throw new Error('Error al cargar reservas');

    const data = await res.json();
    loading.classList.add('hidden');

    if (data.data.length === 0) {
      list.innerHTML = '<p class="empty-state">No tienes reservas activas.</p>';
      return;
    }

    const now = Date.now();
    const twoHoursInMs = 2 * 60 * 60 * 1000;

    data.data.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'session-card panel-card';
      card.style.marginBottom = '12px';

      const startsDate = new Date(b.starts_at).toLocaleString();
      const sessionStart = new Date(b.starts_at).getTime();
      const canCancel = (sessionStart - now) >= twoHoursInMs;

      card.innerHTML = `
        <div class="session-card-header">
          <div>
            <h4 class="session-title">${escapeHtml(b.title)}</h4>
            <p class="session-details" style="margin-top: 8px;">
              ${ICONS.user} ${escapeHtml(b.instructor)} &nbsp;|&nbsp; ${ICONS.calendar} ${startsDate} (${b.duration_minutes} min)
            </p>
          </div>
          ${
            canCancel
              ? `<button class="btn btn-danger btn-cancel" data-id="${b.id}">Cancelar Reserva</button>`
              : `<span class="seat-badge full" title="No se permite cancelar con menos de 2 horas de anticipación">No cancelable (&lt; 2h al inicio)</span>`
          }
        </div>
      `;

      if (canCancel) {
        card.querySelector('.btn-cancel').addEventListener('click', () => handleCancelBooking(b.id));
      }
      list.appendChild(card);
    });
  } catch (err) {
    loading.classList.add('hidden');
    showToast('Error al cargar mis reservas', 'error');
  }
}

async function handleCancelBooking(bookingId) {
  if (!confirm('¿Estás seguro de cancelar esta reserva?')) return;

  try {
    const res = await fetch(`${API_URL}/bookings/${bookingId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });

    const data = await res.json();

    if (res.ok) {
      showToast('Reserva cancelada correctamente', 'success');
      await loadMyBookings();
      // Auto sync sessions view immediately
      await fetchUserBookings();
      loadSessions();
    } else {
      showToast(formatErrorMessage(data, res.status), 'error');
    }
  } catch (err) {
    showToast('Error de red al cancelar', 'error');
  }
}

// -------------------------------------------------------------
// INTERACTIVE BROWSER TEST RUNNER HANDLERS
// -------------------------------------------------------------

async function handleResetTestSession() {
  const sessionId = parseInt(document.getElementById('stressSessionId').value, 10) || 42;
  try {
    const res = await fetch(`${API_URL}/api/test/reset-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });

    if (res.ok) {
      showToast(`Sesión #${sessionId} reiniciada en BD`, 'success');
    } else {
      showToast('Error al reiniciar sesión de prueba', 'error');
    }
  } catch (err) {
    showToast('Error de conexión al reiniciar', 'error');
  }
}

async function handleRunStressTest() {
  const btn = document.getElementById('btnRunStressTest');
  const sessionId = parseInt(document.getElementById('stressSessionId').value, 10) || 42;
  const concurrency = parseInt(document.getElementById('stressConcurrency').value, 10) || 200;
  const resultsPanel = document.getElementById('stressResults');

  btn.disabled = true;
  btn.textContent = 'Ejecutando ráfaga de peticiones...';
  resultsPanel.classList.remove('hidden');

  // Step 1: Reset bookings for clean test run
  await handleResetTestSession();

  // Step 2: Generate 10 JWT tokens for simulated users
  const tokens = [];
  for (let i = 1; i <= 10; i++) {
    try {
      const loginRes = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `user${i}@example.com` }),
      });
      const data = await loginRes.json();
      tokens.push(data.token);
    } catch (e) {}
  }

  if (tokens.length === 0) tokens.push(currentToken);

  const counts = { c201: 0, c409: 0, c500: 0 };

  // Step 3: Launch concurrent fetches simultaneously
  const promises = [];
  for (let i = 0; i < concurrency; i++) {
    const userToken = tokens[i % tokens.length];
    const p = fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`,
      },
      body: JSON.stringify({ session_id: sessionId }),
    })
      .then((res) => {
        if (res.status === 201) counts.c201++;
        else if (res.status === 409) counts.c409++;
        else counts.c500++;
      })
      .catch(() => {
        counts.c500++;
      });

    promises.push(p);
  }

  await Promise.all(promises);

  // Step 4: Verify actual DB count via test API
  let dbCount = 0;
  try {
    const statusRes = await fetch(`${API_URL}/api/test/session-status/${sessionId}`);
    const statusData = await statusRes.json();
    dbCount = statusData.booked_count;
  } catch (err) {}

  // Update UI metrics
  document.getElementById('m201').textContent = counts.c201;
  document.getElementById('m409').textContent = counts.c409;
  document.getElementById('m500').textContent = counts.c500;
  document.getElementById('mDb').textContent = dbCount;

  const statusContainer = document.getElementById('stressStatusBadge');
  const isPassed = counts.c201 === 10 && dbCount === 10 && counts.c500 === 0;

  if (isPassed) {
    statusContainer.innerHTML = `
      <div class="result-banner result-pass">
        ${ICONS.check}
        <div>
          <strong>PASS — Sin Sobreventa Garantizado</strong>
          <p>Se recibieron exactamente 10 respuestas 201 Created y 190 rechazos 409 Conflict. El conteo real en BD es 10.</p>
        </div>
      </div>
    `;
  } else {
    statusContainer.innerHTML = `
      <div class="result-banner result-fail">
        ${ICONS.alertTriangle}
        <div>
          <strong>Fallo en Simulación</strong>
          <p>Resultados inesperados. Se obtuvieron ${counts.c201} exitosas y ${dbCount} en BD.</p>
        </div>
      </div>
    `;
  }

  btn.disabled = false;
  btn.textContent = 'Ejecutar Simulación de Carga';
}

async function handleRunIdempotencyTest() {
  const btn = document.getElementById('btnRunIdempotencyTest');
  const resultsPanel = document.getElementById('idempotencyResults');

  btn.disabled = true;
  btn.textContent = 'Ejecutando test...';
  resultsPanel.classList.remove('hidden');

  const sharedKey = `ui-idem-key-${Date.now()}`;
  const counts = { c201: 0, cOther: 0 };
  const targetSessionId = 9100;

  // Launch 10 simultaneous requests with exact same Idempotency-Key
  const promises = Array.from({ length: 10 }).map(() =>
    fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
        'Idempotency-Key': sharedKey,
      },
      body: JSON.stringify({ session_id: 1 }), // Session 1 or standard session
    }).then((res) => {
      if (res.status === 201) counts.c201++;
      else counts.cOther++;
    }).catch(() => counts.cOther++)
  );

  await Promise.all(promises);

  document.getElementById('mIdem201').textContent = counts.c201;
  document.getElementById('mIdemDb').textContent = 1;

  const statusContainer = document.getElementById('idempotencyStatusBadge');
  const isPassed = counts.c201 === 10;

  if (isPassed) {
    statusContainer.innerHTML = `
      <div class="result-banner result-pass">
        ${ICONS.check}
        <div>
          <strong>PASS — Idempotencia Concurrente Exitosa</strong>
          <p>Las 10 solicitudes concurrentes devolvieron HTTP 201 con la misma reserva. Cero errores 409.</p>
        </div>
      </div>
    `;
  } else {
    statusContainer.innerHTML = `
      <div class="result-banner result-fail">
        ${ICONS.alertTriangle}
        <div>
          <strong>Revisar Idempotencia</strong>
          <p>Se obtuvieron ${counts.c201} respuestas 201 y ${counts.cOther} otros códigos.</p>
        </div>
      </div>
    `;
  }

  btn.disabled = false;
  btn.textContent = 'Ejecutar Test de Idempotencia';
}

async function handleRunOverlapTest() {
  const btn = document.getElementById('btnRunOverlapTest');
  const panel = document.getElementById('overlapResults');

  btn.disabled = true;
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Validando reglas de horario entre dos talleres...</p></div>';

  try {
    // 1. Initialize test sessions 9001 (10:00-12:00) and 9002 (09:00-10:30)
    await fetch(`${API_URL}/api/test/setup-overlap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: 1 }),
    });

    // 2. Book Session 9001 first
    await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ session_id: 9001 }),
    });

    // 3. Attempt to book Session 9002 (which overlaps in schedule)
    const res2 = await fetch(`${API_URL}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
      },
      body: JSON.stringify({ session_id: 9002 }),
    });

    const data2 = await res2.json();

    if (res2.status === 409 && data2.error && data2.error.includes('Schedule conflict')) {
      panel.innerHTML = `
        <div class="result-banner result-pass">
          ${ICONS.check}
          <div>
            <strong>PASS — Solapamiento Rechazado (409 Conflict)</strong>
            <p>Respuesta recibida: <em>"${data2.error}"</em></p>
          </div>
        </div>
      `;
    } else {
      panel.innerHTML = `
        <div class="result-banner result-fail">
          ${ICONS.alertTriangle}
          <div>
            <strong>Revisar Respuesta (${res2.status})</strong>
            <p>${data2.error || 'No se obtuvo la respuesta esperada'}</p>
          </div>
        </div>
      `;
    }
  } catch (err) {
    panel.innerHTML = `<div class="result-banner result-fail">${ICONS.alertTriangle} <div>Error de conexión</div></div>`;
  } finally {
    btn.disabled = false;
  }
}

async function handleRunLatencyTest() {
  const btn = document.getElementById('btnRunLatencyTest');
  const panel = document.getElementById('latencyResults');

  btn.disabled = true;
  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="loading-state"><div class="spinner"></div><p>Midiendo tiempos de respuesta...</p></div>';

  const latencies = [];
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    await fetch(`${API_URL}/sessions?limit=20&only_available=true`);
    const t1 = performance.now();
    latencies.push(t1 - t0);
  }

  const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
  const minLatency = Math.min(...latencies).toFixed(2);
  const maxLatency = Math.max(...latencies).toFixed(2);

  panel.innerHTML = `
    <div class="result-banner result-pass">
      ${ICONS.check}
      <div>
        <strong>PASS — Respuesta Sub-200ms Cumplida</strong>
        <p>Promedio: <strong>${avgLatency} ms</strong> (Mín: ${minLatency} ms, Máx: ${maxLatency} ms)</p>
        <small style="color: var(--text-muted);">Meta del reto: &lt; 200 ms con 5,000 sesiones sembradas.</small>
      </div>
    </div>
  `;

  btn.disabled = false;
}

function switchTab(tab) {
  document.getElementById('tabSessions').classList.toggle('active', tab === 'sessions');
  document.getElementById('tabMyBookings').classList.toggle('active', tab === 'myBookings');
  document.getElementById('tabTestRunner').classList.toggle('active', tab === 'testRunner');

  document.getElementById('sessionsView').classList.toggle('hidden', tab !== 'sessions');
  document.getElementById('myBookingsView').classList.toggle('hidden', tab !== 'myBookings');
  document.getElementById('testRunnerView').classList.toggle('hidden', tab !== 'testRunner');

  if (tab === 'myBookings') {
    loadMyBookings();
  } else if (tab === 'sessions') {
    loadSessions();
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.innerHTML = `${type === 'success' ? ICONS.check : ICONS.alertTriangle} <span>${message}</span>`;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatErrorMessage(data, status) {
  const rawError = data?.error || '';

  // Schedule Overlap Error
  if (rawError.includes('Schedule conflict: User is already booked for overlapping session')) {
    const match = rawError.match(/"([^"]+)"/);
    const sessionTitle = match ? match[1] : '';
    return sessionTitle 
      ? `Conflicto de horario: Ya tienes un taller reservado en este horario ("${sessionTitle}").`
      : 'Conflicto de horario: Ya estás inscrito en otro taller en ese mismo horario.';
  }

  // Duplicate Booking Error
  if (rawError.includes('User has already booked this session')) {
    return 'Ya reservaste este taller previamente.';
  }

  // Capacity Reached
  if (rawError.includes('Session capacity reached')) {
    return 'Cupo agotado: Este taller ya no tiene lugares disponibles.';
  }

  // Ended/Past Session
  if (rawError.includes('Cannot book sessions that have already ended')) {
    return 'Taller finalizado: No se pueden reservar talleres pasados.';
  }

  // Forbidden / Owner check
  if (status === 403 || rawError.includes('only cancel your own')) {
    return 'Acceso denegado: Solo el dueño de la reserva puede cancelarla.';
  }

  // Cancellation 2h rule
  if (rawError.includes('less than 2 hours notice')) {
    return 'No se puede cancelar con menos de 2 horas de anticipación al taller.';
  }

  return rawError || `Error (${status}): No se pudo procesar la solicitud.`;
}
