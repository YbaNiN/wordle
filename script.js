/**
 * script.js — Controlador principal de la UI
 * Renderizado DOM, eventos, modales, tema, autenticación
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ─── Inicialización ─────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initSupabase();
  showMenu();
  setupKeyboardListeners();
  registerSW();
});

// ─── Auth UI ────────────────────────────────────
function updateAuthUI() {
  const userArea = $('#user-area');
  const menuUser = $('#menu-user-area');
  if (!userArea) return;

  if (isLoggedIn()) {
    const name = getCurrentUsername();
    userArea.innerHTML = `
      <button class="user-badge" onclick="showProfileModal()" title="Mi perfil">
        <span class="user-avatar">${name[0].toUpperCase()}</span>
        <span class="user-name">${escapeHTML(name)}</span>
      </button>`;
    if (menuUser) {
      menuUser.innerHTML = `
        <div class="menu-user-badge">
          <span class="menu-user-avatar">${name[0].toUpperCase()}</span>
          <span class="menu-user-name">${escapeHTML(name)}</span>
        </div>`;
    }
  } else {
    userArea.innerHTML = `
      <button class="icon-btn" onclick="showAuthModal('login')" aria-label="Iniciar sesión" title="Iniciar sesión">👤</button>`;
    if (menuUser) {
      menuUser.innerHTML = `
        <button class="btn btn-secondary menu-auth-btn" onclick="showAuthModal('login')">
          Iniciar sesión
        </button>`;
    }
  }
}

function showAuthModal(mode = 'login') {
  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  const isLogin = mode === 'login';

  content.innerHTML = `
    <div class="modal-header">
      <h2>${isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
    </div>
    <div class="auth-form" id="auth-form">
      ${!isLogin ? `
        <div class="form-group">
          <label class="form-label" for="auth-username">Nombre de usuario</label>
          <input type="text" id="auth-username" class="form-input" placeholder="Tu nombre público"
                 maxlength="20" autocomplete="username" spellcheck="false">
        </div>` : ''}
      <div class="form-group">
        <label class="form-label" for="auth-email">Email</label>
        <input type="email" id="auth-email" class="form-input" placeholder="tu@email.com"
               autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="auth-password">Contraseña</label>
        <input type="password" id="auth-password" class="form-input"
               placeholder="${isLogin ? 'Tu contraseña' : 'Mínimo 6 caracteres'}"
               autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="6">
      </div>
      <div class="form-error" id="auth-error"></div>
      <button class="btn btn-primary" id="auth-submit" onclick="handleAuth('${mode}')">
        ${isLogin ? 'Entrar' : 'Crear cuenta'}
      </button>
      <div class="auth-switch">
        ${isLogin
          ? '¿No tienes cuenta? <a href="#" onclick="event.preventDefault(); showAuthModal(\'signup\')">Regístrate</a>'
          : '¿Ya tienes cuenta? <a href="#" onclick="event.preventDefault(); showAuthModal(\'login\')">Inicia sesión</a>'}
      </div>
    </div>
    <button class="btn btn-ghost modal-close" onclick="hideAllModals()">Cancelar</button>
  `;
  modal.classList.add('active');

  // Focus primer campo
  setTimeout(() => {
    const first = !isLogin ? $('#auth-username') : $('#auth-email');
    first?.focus();
  }, 150);

  // Enter para enviar
  content.querySelectorAll('.form-input').forEach(input => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAuth(mode);
      }
    });
  });
}

async function handleAuth(mode) {
  const email = $('#auth-email')?.value?.trim();
  const password = $('#auth-password')?.value;
  const username = $('#auth-username')?.value?.trim();
  const errorEl = $('#auth-error');
  const submitBtn = $('#auth-submit');

  // Validaciones
  if (mode === 'signup' && (!username || username.length < 2)) {
    errorEl.textContent = 'El nombre debe tener al menos 2 caracteres';
    return;
  }
  if (mode === 'signup' && username.length > 20) {
    errorEl.textContent = 'El nombre no puede superar 20 caracteres';
    return;
  }
  if (mode === 'signup' && !/^[a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]+$/.test(username)) {
    errorEl.textContent = 'Solo letras, números y guiones bajos';
    return;
  }
  if (!email || !email.includes('@')) {
    errorEl.textContent = 'Introduce un email válido';
    return;
  }
  if (!password || password.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  submitBtn.textContent = 'Cargando...';
  errorEl.textContent = '';

  try {
    let result;
    if (mode === 'signup') {
      result = await signUp(email, password, username);
    } else {
      result = await logIn(email, password);
    }

    if (result.error) {
      errorEl.textContent = result.error;
      submitBtn.disabled = false;
      submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Crear cuenta';
      return;
    }

    // Éxito
    hideAllModals();
    showToast(`¡Bienvenido, ${getCurrentUsername()}!`);
    updateAuthUI();
  } catch (e) {
    console.error('Error en handleAuth:', e);
    errorEl.textContent = 'Error de conexión. Inténtalo de nuevo.';
    submitBtn.disabled = false;
    submitBtn.textContent = mode === 'login' ? 'Entrar' : 'Crear cuenta';
  }
}

function showProfileModal() {
  const user = getCurrentPlayer();
  const modal = $('#modal-overlay');
  const content = $('#modal-content');

  content.innerHTML = `
    <div class="modal-header">
      <div class="profile-avatar-lg">${user.username[0].toUpperCase()}</div>
      <h2>${escapeHTML(user.username)}</h2>
      <p class="profile-email">${escapeHTML(user.email || '')}</p>
    </div>
    <div class="profile-section">
      <h3 class="profile-section-title">Cambiar nombre</h3>
      <div class="form-row">
        <input type="text" id="new-username" class="form-input" value="${escapeHTML(user.username)}"
               maxlength="20" spellcheck="false">
        <button class="btn btn-secondary btn-sm" onclick="handleChangeUsername()">Guardar</button>
      </div>
      <div class="form-error" id="username-error"></div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-ghost btn-danger" onclick="confirmLogout()">Cerrar sesión</button>
    </div>
    <button class="btn btn-ghost modal-close" onclick="hideAllModals()">Cerrar</button>
  `;
  modal.classList.add('active');
}

async function handleChangeUsername() {
  const input = $('#new-username');
  const errorEl = $('#username-error');
  const name = input?.value?.trim();

  if (!name || name.length < 2) {
    errorEl.textContent = 'Mínimo 2 caracteres';
    return;
  }
  if (!/^[a-zA-Z0-9_áéíóúñÁÉÍÓÚÑ]+$/.test(name)) {
    errorEl.textContent = 'Solo letras, números y guiones bajos';
    return;
  }

  const result = await updateUsername(name);
  if (result.error) {
    errorEl.textContent = result.error;
  } else {
    showToast('Nombre actualizado');
    showProfileModal(); // Refrescar modal
  }
}

function confirmLogout() {
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <h2>¿Cerrar sesión?</h2>
    </div>
    <p style="text-align:center; color:var(--text-muted); margin-bottom:16px;">
      Tus estadísticas locales se mantendrán, pero no podrás participar en el ranking ni en partidas 1vs1.
    </p>
    <div class="modal-actions">
      <button class="btn btn-primary btn-danger" onclick="logOut(); hideAllModals();">Sí, cerrar sesión</button>
      <button class="btn btn-secondary" onclick="showProfileModal()">Cancelar</button>
    </div>
  `;
}

// ─── Menú principal ─────────────────────────────
function showMenu() {
  hideGame();
  const menu = $('#menu-screen');
  menu.classList.add('active');
  updateAuthUI();
}

function hideMenu() {
  $('#menu-screen').classList.remove('active');
}

function showGame() {
  $('#game-area').style.display = 'flex';
}

function hideGame() {
  $('#game-area').style.display = 'none';
}

function startDaily() {
  hideMenu(); showGame(); initGame('daily');
}

function startInfinite() {
  hideMenu(); showGame(); initGame('infinite');
}

function startVersus() {
  if (!isLoggedIn()) {
    showToast('Inicia sesión para jugar 1vs1');
    showAuthModal('login');
    return;
  }
  hideMenu();
  showVersusMenu();
}

function showVersusMenu() {
  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header"><h2>1 vs 1 Online</h2></div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="hideAllModals(); createRoom()">Crear sala</button>
      <button class="btn btn-secondary" onclick="hideAllModals(); showJoinModal()">Unirse a sala</button>
    </div>
    <button class="btn btn-ghost modal-close" onclick="hideAllModals(); showMenu()">Volver</button>
  `;
  modal.classList.add('active');
}

// ─── Renderizado del tablero ────────────────────
function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  for (let r = 0; r < MAX_ATTEMPTS; r++) {
    const row = document.createElement('div');
    row.className = 'row'; row.id = `row-${r}`;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile'; tile.id = `tile-${r}-${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
}

function renderRestoredGame() {
  renderBoard(); renderKeyboard();
  gameState.guesses.forEach((guess, rowIdx) => {
    const result = evaluateGuess(guess, gameState.targetWord);
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = $(`#tile-${rowIdx}-${c}`);
      tile.textContent = guess[c];
      tile.classList.add('filled', result[c].state);
    }
  });
  updateKeyboard();
  if (gameState.gameOver) setTimeout(() => showEndScreen(gameState.won), 400);
}

function updateCurrentRow() {
  const row = gameState.currentRow;
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`#tile-${row}-${c}`);
    if (!tile) return;
    const letter = gameState.currentGuess[c] || '';
    tile.textContent = letter;
    tile.className = 'tile' + (letter ? ' filled' : '');
  }
}

function popTile(row, col) {
  const tile = $(`#tile-${row}-${col}`);
  if (tile) { tile.classList.remove('filled'); void tile.offsetWidth; tile.classList.add('filled'); }
}

// ─── Animaciones de fila ────────────────────────
function revealRow(row, result, callback) {
  const tiles = [];
  for (let c = 0; c < WORD_LENGTH; c++) tiles.push($(`#tile-${row}-${c}`));

  tiles.forEach((tile, i) => {
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.textContent = result[i].letter;
        tile.className = `tile filled ${result[i].state}`;
      }, 250);
    }, i * 300);
  });

  setTimeout(() => { if (callback) callback(); }, WORD_LENGTH * 300 + 300);
}

function shakeCurrentRow() {
  const row = $(`#row-${gameState.currentRow}`);
  if (row) { row.classList.add('shake'); setTimeout(() => row.classList.remove('shake'), 500); }
}

function bounceRow(row) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`#tile-${row}-${c}`);
    if (tile) setTimeout(() => tile.classList.add('bounce'), c * 80);
  }
}

// ─── Teclado virtual ────────────────────────────
const KEYBOARD_LAYOUT = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L','Ñ'],
  ['ENVIAR','Z','X','C','V','B','N','M','⌫']
];

function renderKeyboard() {
  const kb = $('#keyboard');
  kb.innerHTML = '';
  KEYBOARD_LAYOUT.forEach(row => {
    const rowEl = document.createElement('div');
    rowEl.className = 'keyboard-row';
    row.forEach(key => {
      const btn = document.createElement('button');
      btn.className = 'key' + (key === 'ENVIAR' || key === '⌫' ? ' wide' : '');
      btn.dataset.key = key; btn.textContent = key;
      btn.addEventListener('click', () => handleKey(key));
      btn.addEventListener('mousedown', e => e.preventDefault());
      rowEl.appendChild(btn);
    });
    kb.appendChild(rowEl);
  });
}

function updateKeyboard() {
  $$('.key').forEach(btn => {
    const key = btn.dataset.key;
    if (key.length === 1) {
      const state = gameState.letterStates[key];
      btn.classList.remove('correct','present','absent');
      if (state) btn.classList.add(state);
    }
  });
}

function handleKey(key) {
  if (gameState.gameOver) return;
  if (key === 'ENVIAR') submitGuess();
  else if (key === '⌫') removeLetter();
  else addLetter(key);
}

// ─── Teclado físico ─────────────────────────────
function setupKeyboardListeners() {
  document.addEventListener('keydown', (e) => {
    if ($('.modal-overlay.active input:focus')) return;
    if (e.key === 'Enter') { e.preventDefault(); submitGuess(); }
    else if (e.key === 'Backspace') { e.preventDefault(); removeLetter(); }
    else {
      const letter = e.key.toUpperCase();
      if (/^[A-ZÑ]$/.test(letter)) addLetter(letter);
    }
  });
}

// ─── Toast ──────────────────────────────────────
function showToast(message, duration = 1500) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('out'); setTimeout(() => toast.remove(), 300); }, duration);
}

// ─── Modales ────────────────────────────────────
function hideAllModals() {
  $('#modal-overlay').classList.remove('active');
}

function showStatsModal() {
  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header"><h2>Estadísticas</h2></div>
    ${renderStatsModal()}
    <button class="btn btn-ghost modal-close" onclick="hideAllModals()">Cerrar</button>
  `;
  modal.classList.add('active');
}

async function showLeaderboardModal() {
  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header"><h2>Ranking</h2></div>
    <div style="text-align:center; padding:20px;"><div class="spinner"></div></div>
  `;
  modal.classList.add('active');

  const data = await fetchLeaderboard();
  const myId = isLoggedIn() ? currentUser.id : null;
  let listHTML = '<ul class="leaderboard-list">';
  data.forEach((item, i) => {
    const isMe = myId && item.player_id === myId;
    listHTML += `
      <li class="leaderboard-item ${isMe ? 'leaderboard-me' : ''}">
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-name">${escapeHTML(item.username)}${isMe ? ' (tú)' : ''}</span>
        <span class="leaderboard-wins">${item.wins}W</span>
        <span class="leaderboard-score">${item.score}</span>
      </li>`;
  });
  listHTML += '</ul>';

  if (!isLoggedIn()) {
    listHTML += `<p class="leaderboard-hint">Inicia sesión para aparecer en el ranking</p>`;
  }

  content.innerHTML = `
    <div class="modal-header"><h2>Ranking</h2></div>
    ${listHTML}
    <button class="btn btn-ghost modal-close" onclick="hideAllModals()">Cerrar</button>
  `;
}

function showSettingsModal() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header"><h2>Ajustes</h2></div>
    <div class="settings-list">
      <div class="setting-row">
        <span class="setting-label">Modo oscuro</span>
        <label class="theme-switch">
          <input type="checkbox" id="theme-toggle" ${isDark ? 'checked' : ''} onchange="toggleTheme(this.checked)">
          <span class="theme-slider"></span>
        </label>
      </div>
    </div>
    <button class="btn btn-ghost modal-close" onclick="hideAllModals()">Cerrar</button>
  `;
  modal.classList.add('active');
}

// ─── Pantalla de fin ────────────────────────────
function showEndScreen(won) {
  if (gameState.mode === 'daily') recordResult(won, gameState.guesses.length, 'daily');
  else if (gameState.mode === 'infinite') recordResult(won, gameState.guesses.length, 'infinite');

  const elapsed = Date.now() - gameState.startTime;
  const score = calculateScore(won, gameState.guesses.length, elapsed);

  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <h2>${won ? '¡Enhorabuena! 🎉' : 'Casi...'}</h2>
    </div>
    <div style="text-align:center">
      ${won ? `<p class="end-message">${getWinMessage(gameState.guesses.length)}</p>` :
              `<p class="end-message">La palabra era:</p>`}
      <p class="end-word">${gameState.targetWord}</p>
      ${score > 0 ? `<p class="end-message">+${score} puntos</p>` : ''}
      ${!isLoggedIn() ? `<p class="end-hint">Inicia sesión para guardar tu puntuación</p>` : ''}
    </div>
    ${renderStatsModal()}
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="shareResult()">Compartir resultado</button>
      ${gameState.mode === 'infinite' ? `<button class="btn btn-secondary" onclick="hideAllModals(); startInfinite()">Jugar otra</button>` : ''}
      <button class="btn btn-ghost" onclick="hideAllModals(); hideGame(); showMenu()">Menú</button>
    </div>
  `;
  modal.classList.add('active');
}

function getWinMessage(attempts) {
  const msgs = { 1:'¡Increíble! 🧠', 2:'¡Impresionante!', 3:'¡Genial!', 4:'¡Bien hecho!', 5:'¡Por poco!', 6:'¡Uf, por los pelos!' };
  return msgs[attempts] || '¡Bien!';
}

// ─── Tema ───────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('wordle_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  else if (window.matchMedia('(prefers-color-scheme: dark)').matches) document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleTheme(dark) {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('wordle_theme', theme);
}

// ─── PWA ────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
}

// ─── Utilidades ─────────────────────────────────
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
