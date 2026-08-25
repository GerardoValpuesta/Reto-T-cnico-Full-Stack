const API_URL = window.location.origin;
let currentToken = null;
let currentCursor = null;

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  document.getElementById('btnLogin').addEventListener('click', handleLogin);
  document.getElementById('btnApplyFilters').addEventListener('click', () => {
    currentCursor = null;
    loadSessions();
  });
  document.getElementById('btnLoadMore').addEventListener('click', () => loadSessions(true));
  
  document.getElementById('tabSessions').addEventListener('click', () => switchTab('sessions'));
  document.getElementById('tabMyBookings').addEventListener('click', () => switchTab('myBookings'));

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

    currentCursor = null;
    loadSessions();
  } catch (err) {
    showToast('Error al iniciar sesión', 'error');
  }
}

async function loadSessions(append = false) {
  const loading = document.getElementById('sessionsLoading');
  const grid = document.getElementById('sessionsGrid');
  const btnLoadMore = document.getElementById('btnLoadMore');

  if (!append) {
    grid.innerHTML = '';
    loading.classList.remove('hidden');
  }

  const from = document.getElementById('filterFrom').value;
  const to = document.getElementById('filterTo').value;
  const instructor = document.getElementById('filterInstructor').value;
  const onlyAvailable = document.getElementById('filterOnlyAvailable').checked;

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

    renderSessions(data.data, append);

    if (data.pagination.has_more) {
      currentCursor = data.pagination.next_cursor;
      btnLoadMore.classList.remove('hidden');
    } else {
      btnLoadMore.classList.add('hidden');
    }
  } catch (err) {
    loading.classList.add('hidden');
    showToast('Error al consultar sesiones', 'error');
  }
}

function renderSessions(sessions, append) {
  const grid = document.getElementById('sessionsGrid');
  
  if (sessions.length === 0 && !append) {
    grid.innerHTML = '<p style="color: var(--text-muted); grid-column: 1/-1;">No se encontraron sesiones.</p>';
    return;
  }

  sessions.forEach((s) => {
    const card = document.createElement('div');
    card.className = 'session-card';

    const isFull = s.available_seats <= 0;
    const badgeClass = isFull ? 'seat-badge full' : 'seat-badge available';
    const badgeText = isFull ? 'AGOTADO' : `${s.available_seats} de ${s.capacity} libres`;

    const startsDate = new Date(s.starts_at).toLocaleString();

    card.innerHTML = `
      <div>
        <div class="session-card-header">
          <h4 class="session-title">${escapeHtml(s.title)}</h4>
          <span class="${badgeClass}">${badgeText}</span>
        </div>
        <div class="session-details" style="margin-top: 12px;">
          <p>👨‍🏫 <strong>Instructor:</strong> ${escapeHtml(s.instructor)}</p>
          <p>📅 <strong>Inicio:</strong> ${startsDate}</p>
          <p>⏱️ <strong>Duración:</strong> ${s.duration_minutes} min</p>
          <p>🔢 <strong>ID Sesión:</strong> ${s.id}</p>
        </div>
      </div>
      <button class="btn btn-primary btn-reserve" ${isFull ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''} data-id="${s.id}">
        ${isFull ? 'Sin Cupo' : 'Reservar Lugar'}
      </button>
    `;

    const btnReserve = card.querySelector('.btn-reserve');
    if (!isFull) {
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
  btnElement.textContent = 'Reservando...';

  // Generate unique Idempotency Key per click attempt
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
      showToast('🎉 ¡Reserva realizada con éxito!', 'success');
      currentCursor = null;
      loadSessions();
    } else if (res.status === 409) {
      showToast(`⚠️ 409 Conflict: ${data.error}`, 'error');
    } else {
      showToast(`❌ Error (${res.status}): ${data.error || 'Error inesperado'}`, 'error');
    }
  } catch (err) {
    showToast('❌ Error de red al intentar reservar', 'error');
  } finally {
    btnElement.disabled = false;
    btnElement.textContent = 'Reservar Lugar';
  }
}

async function loadMyBookings() {
  const loading = document.getElementById('myBookingsLoading');
  const list = document.getElementById('myBookingsList');

  list.innerHTML = '';
  loading.classList.remove('hidden');

  try {
    const res = await fetch(`${API_URL}/my-bookings`, {
      headers: { 'Authorization': `Bearer ${currentToken}` },
    });

    if (!res.ok) throw new Error('Error al cargar reservas');

    const data = await res.json();
    loading.classList.add('hidden');

    if (data.data.length === 0) {
      list.innerHTML = '<p style="color: var(--text-muted);">No tienes reservas activas.</p>';
      return;
    }

    data.data.forEach((b) => {
      const card = document.createElement('div');
      card.className = 'session-card';
      card.style.marginBottom = '12px';

      const startsDate = new Date(b.starts_at).toLocaleString();

      card.innerHTML = `
        <div class="session-card-header">
          <div>
            <h4 class="session-title">${escapeHtml(b.title)}</h4>
            <p class="session-details" style="margin-top: 6px;">
              👨‍🏫 ${escapeHtml(b.instructor)} | 📅 ${startsDate} (${b.duration_minutes} min)
            </p>
          </div>
          <button class="btn btn-danger btn-cancel" data-id="${b.id}">Cancelar Reserva</button>
        </div>
      `;

      card.querySelector('.btn-cancel').addEventListener('click', () => handleCancelBooking(b.id));
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
      showToast('✅ Reserva cancelada correctamente', 'success');
      loadMyBookings();
    } else {
      showToast(`❌ Error (${res.status}): ${data.error}`, 'error');
    }
  } catch (err) {
    showToast('Error de red al cancelar', 'error');
  }
}

function switchTab(tab) {
  document.getElementById('tabSessions').classList.toggle('active', tab === 'sessions');
  document.getElementById('tabMyBookings').classList.toggle('active', tab === 'myBookings');

  document.getElementById('sessionsView').classList.toggle('hidden', tab !== 'sessions');
  document.getElementById('myBookingsView').classList.toggle('hidden', tab !== 'myBookings');

  if (tab === 'myBookings') {
    loadMyBookings();
  }
}

function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('hidden');
  }, 4000);
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
