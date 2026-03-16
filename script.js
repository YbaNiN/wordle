/**
 * script.js — Controlador principal de la UI
 * Maneja renderizado DOM, eventos de teclado, modales, tema
 */

// ─── Elementos ──────────────────────────────────
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

// ─── Menú principal ─────────────────────────────
function showMenu() {
  hideGame();
  const menu = $('#menu-screen');
  menu.classList.add('active');
}

function hideMenu() {
  const menu = $('#menu-screen');
  menu.classList.remove('active');
}

function showGame() {
  $('#game-area').style.display = 'flex';
}

function hideGame() {
  $('#game-area').style.display = 'none';
}

function startDaily() {
  hideMenu();
  showGame();
  initGame('daily');
}

function startInfinite() {
  hideMenu();
  showGame();
  initGame('infinite');
}

function startVersus() {
  hideMenu();
  showVersusMenu();
}

function showVersusMenu() {
  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <h2>1 vs 1 Online</h2>
    </div>
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
    row.className = 'row';
    row.id = `row-${r}`;
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.id = `tile-${r}-${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
}

function renderRestoredGame() {
  renderBoard();
  renderKeyboard();
  // Re-render guessed rows
  gameState.guesses.forEach((guess, rowIdx) => {
    const result = evaluateGuess(guess, gameState.targetWord);
    for (let c = 0; c < WORD_LENGTH; c++) {
      const tile = $(`#tile-${rowIdx}-${c}`);
      tile.textContent = guess[c];
      tile.classList.add('filled', result[c].state);
    }
  });
  updateKeyboard();
  if (gameState.gameOver) {
    setTimeout(() => showEndScreen(gameState.won), 400);
  }
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
  if (tile) {
    tile.classList.remove('filled');
    void tile.offsetWidth;
    tile.classList.add('filled');
  }
}

// ─── Animaciones de fila ────────────────────────
function revealRow(row, result, callback) {
  const tiles = [];
  for (let c = 0; c < WORD_LENGTH; c++) {
    tiles.push($(`#tile-${row}-${c}`));
  }

  tiles.forEach((tile, i) => {
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => {
        tile.textContent = result[i].letter;
        tile.className = `tile filled ${result[i].state}`;
      }, 250);
    }, i * 300);
  });

  setTimeout(() => {
    if (callback) callback();
  }, WORD_LENGTH * 300 + 300);
}

function shakeCurrentRow() {
  const row = $(`#row-${gameState.currentRow}`);
  if (row) {
    row.classList.add('shake');
    setTimeout(() => row.classList.remove('shake'), 500);
  }
}

function bounceRow(row) {
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = $(`#tile-${row}-${c}`);
    if (tile) {
      setTimeout(() => tile.classList.add('bounce'), c * 80);
    }
  }
}

// ─── Teclado virtual ────────────────────────────
const KEYBOARD_LAYOUT = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Ñ'],
  ['ENVIAR', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
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
      btn.dataset.key = key;
      btn.textContent = key;
      btn.addEventListener('click', () => handleKey(key));
      // Prevent focus (keeps physical keyboard working)
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
      btn.classList.remove('correct', 'present', 'absent');
      if (state) btn.classList.add(state);
    }
  });
}

function handleKey(key) {
  if (gameState.gameOver) return;
  if (key === 'ENVIAR') {
    submitGuess();
  } else if (key === '⌫') {
    removeLetter();
  } else {
    addLetter(key);
  }
}

// ─── Teclado físico ─────────────────────────────
function setupKeyboardListeners() {
  document.addEventListener('keydown', (e) => {
    // Ignorar si hay modal activo con input
    if ($('.modal-overlay.active input:focus')) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      submitGuess();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      removeLetter();
    } else {
      const letter = e.key.toUpperCase();
      if (/^[A-ZÑ]$/.test(letter)) {
        addLetter(letter);
      }
    }
  });
}

// ─── Toast ──────────────────────────────────────
function showToast(message, duration = 1500) {
  const container = $('#toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
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
  let listHTML = '<ul class="leaderboard-list">';
  data.forEach((item, i) => {
    listHTML += `
      <li class="leaderboard-item">
        <span class="leaderboard-rank">${i + 1}</span>
        <span class="leaderboard-name">${escapeHTML(item.username)}</span>
        <span class="leaderboard-wins">${item.wins}W</span>
        <span class="leaderboard-score">${item.score}</span>
      </li>`;
  });
  listHTML += '</ul>';

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
  if (gameState.mode === 'daily') {
    recordResult(won, gameState.guesses.length, 'daily');
  } else if (gameState.mode === 'infinite') {
    recordResult(won, gameState.guesses.length, 'infinite');
  }

  const elapsed = Date.now() - gameState.startTime;
  const score = calculateScore(won, gameState.guesses.length, elapsed);

  const modal = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <h2>${won ? '¡Enhorabuena! 🎉' : 'Casi...'}</h2>
    </div>
    <div style="text-align:center">
      ${won
        ? `<p class="end-message">${getWinMessage(gameState.guesses.length)}</p>`
        : `<p class="end-message">La palabra era:</p>`}
      <p class="end-word">${gameState.targetWord}</p>
      ${score > 0 ? `<p class="end-message">+${score} puntos</p>` : ''}
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
  const msgs = {
    1: '¡Increíble! 🧠',
    2: '¡Impresionante!',
    3: '¡Genial!',
    4: '¡Bien hecho!',
    5: '¡Por poco!',
    6: '¡Uf, por los pelos!'
  };
  return msgs[attempts] || '¡Bien!';
}

// ─── Tema ───────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('wordle_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme(dark) {
  const theme = dark ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('wordle_theme', theme);
}

// ─── PWA ────────────────────────────────────────
function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}

// ─── Utilidades ─────────────────────────────────
function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
