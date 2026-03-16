/**
 * multiplayer.js — Módulo multijugador 1vs1 en tiempo real
 */

let vsState = {
  matchId: null,
  roomCode: null,
  channel: null,
  isHost: false,
  opponentGuesses: 0,
  opponentDone: false,
  opponentWon: false,
  opponentTime: null,
  myFinished: false,
  myWon: false,
  myAttempts: 0,
  startTime: null
};

// ─── Crear sala ─────────────────────────────────────
async function createRoom() {
  const word = getRandomWord();
  if (isSupabaseReady()) {
    const result = await createMatch(word);
    if (result) {
      vsState.matchId = result.match.id;
      vsState.roomCode = result.roomCode;
      vsState.isHost = true;
      gameState.matchId = result.match.id;
      gameState.targetWord = word;
      showWaitingRoom(result.roomCode);
      subscribeToMatchUpdates(result.match.id);
      return;
    }
  }
  // Modo local (sin Supabase)
  vsState.roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  vsState.isHost = true;
  gameState.targetWord = word;
  showWaitingRoom(vsState.roomCode);
  showToast('Modo local — Supabase no conectado');
}

// ─── Unirse a sala ──────────────────────────────────
async function joinRoom(code) {
  if (isSupabaseReady()) {
    const result = await joinMatch(code);
    if (result) {
      vsState.matchId = result.match.id;
      vsState.roomCode = code.toUpperCase();
      vsState.isHost = false;
      gameState.matchId = result.match.id;
      gameState.targetWord = result.match.word.toUpperCase();
      subscribeToMatchUpdates(result.match.id);
      startVersusGame();
      return;
    }
    showToast('Sala no encontrada');
    return;
  }
  showToast('Supabase no conectado');
}

// ─── Suscribirse a actualizaciones ──────────────────
function subscribeToMatchUpdates(matchId) {
  vsState.channel = subscribeToMatch(matchId, (payload) => {
    const { eventType, table, new: record } = payload;

    if (table === 'moves') {
      const playerId = localStorage.getItem('wordle_player_id');
      if (record.player_id !== playerId) {
        vsState.opponentGuesses = record.attempt_number;
        updateOpponentProgress();
      }
    }

    if (table === 'matches' && record.status === 'playing') {
      if (vsState.isHost) startVersusGame();
    }

    if (table === 'matches' && record.status === 'finished') {
      handleMatchFinished(record);
    }
  });
}

// ─── Iniciar partida versus ─────────────────────────
function startVersusGame() {
  vsState.startTime = Date.now();
  vsState.opponentGuesses = 0;
  vsState.opponentDone = false;
  vsState.myFinished = false;

  gameState.mode = 'versus';
  gameState.startTime = Date.now();
  gameState.guesses = [];
  gameState.currentGuess = '';
  gameState.currentRow = 0;
  gameState.gameOver = false;
  gameState.won = false;
  gameState.letterStates = {};

  hideAllModals();
  showVersusUI();
  renderBoard();
  renderKeyboard();
}

// ─── Manejar fin de mi partida versus ───────────────
function handleVersusEnd(won, attempts) {
  vsState.myFinished = true;
  vsState.myWon = won;
  vsState.myAttempts = attempts;

  if (isSupabaseReady() && vsState.matchId) {
    if (won) {
      endMatch(vsState.matchId, localStorage.getItem('wordle_player_id'));
    }
  }

  // Si el oponente ya terminó, mostrar resultado
  if (vsState.opponentDone) {
    showVersusResult();
  }
}

function handleMatchFinished(record) {
  const playerId = localStorage.getItem('wordle_player_id');
  vsState.opponentDone = true;
  vsState.opponentWon = record.winner && record.winner !== playerId;

  if (vsState.myFinished) {
    showVersusResult();
  }
}

// ─── UI Multiplayer ─────────────────────────────────
function showWaitingRoom(code) {
  hideAllModals();
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <h2>Esperando rival...</h2>
    </div>
    <div class="waiting-room">
      <p class="room-label">Código de sala</p>
      <div class="room-code" id="room-code-display">${code}</div>
      <button class="btn btn-secondary" onclick="copyRoomCode()">
        Copiar código
      </button>
      <div class="waiting-spinner">
        <div class="spinner"></div>
        <p>Esperando a que se una otro jugador...</p>
      </div>
    </div>
    <button class="btn btn-ghost modal-close" onclick="cancelVersus()">Cancelar</button>
  `;
  modal.classList.add('active');
}

function copyRoomCode() {
  const code = vsState.roomCode;
  navigator.clipboard.writeText(code).then(() => {
    showToast('¡Código copiado!');
  }).catch(() => {
    showToast(code);
  });
}

function showVersusUI() {
  const opBar = document.getElementById('opponent-bar');
  if (opBar) {
    opBar.classList.add('active');
    opBar.innerHTML = `
      <div class="opponent-info">
        <span class="opponent-label">Rival</span>
        <div class="opponent-progress">
          <span id="opponent-attempts">0</span>/6 intentos
        </div>
      </div>
    `;
  }
}

function updateOpponentProgress() {
  const el = document.getElementById('opponent-attempts');
  if (el) el.textContent = vsState.opponentGuesses;
}

function showVersusResult() {
  const elapsed = Date.now() - vsState.startTime;
  const mins = Math.floor(elapsed / 60000);
  const secs = Math.floor((elapsed % 60000) / 1000);
  const timeStr = `${mins}:${String(secs).padStart(2, '0')}`;

  let resultHTML = '';
  if (vsState.myWon && !vsState.opponentWon) {
    resultHTML = '<h2 class="vs-win">¡Has ganado! 🎉</h2>';
  } else if (!vsState.myWon && vsState.opponentWon) {
    resultHTML = '<h2 class="vs-lose">Has perdido 😔</h2>';
  } else if (vsState.myWon && vsState.opponentWon) {
    resultHTML = '<h2 class="vs-draw">¡Empate!</h2>';
  } else {
    resultHTML = '<h2 class="vs-lose">Ninguno acertó</h2>';
  }

  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="modal-header">${resultHTML}</div>
    <div class="vs-results">
      <div class="vs-stat">
        <span class="vs-stat-label">Tus intentos</span>
        <span class="vs-stat-value">${vsState.myWon ? vsState.myAttempts : 'X'}/6</span>
      </div>
      <div class="vs-stat">
        <span class="vs-stat-label">Intentos rival</span>
        <span class="vs-stat-value">${vsState.opponentGuesses}/6</span>
      </div>
      <div class="vs-stat">
        <span class="vs-stat-label">Tiempo</span>
        <span class="vs-stat-value">${timeStr}</span>
      </div>
      <div class="vs-stat">
        <span class="vs-stat-label">Palabra</span>
        <span class="vs-stat-value word-reveal">${gameState.targetWord}</span>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" onclick="hideAllModals(); showMenu()">Volver al menú</button>
    </div>
  `;
  modal.classList.add('active');

  // Ocultar barra oponente
  const opBar = document.getElementById('opponent-bar');
  if (opBar) opBar.classList.remove('active');
}

function cancelVersus() {
  if (vsState.channel) {
    unsubscribeFromMatch(vsState.channel);
  }
  vsState = {
    matchId: null, roomCode: null, channel: null,
    isHost: false, opponentGuesses: 0, opponentDone: false,
    opponentWon: false, opponentTime: null, myFinished: false,
    myWon: false, myAttempts: 0, startTime: null
  };
  hideAllModals();
  showMenu();
}

function showJoinModal() {
  const modal = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <div class="modal-header">
      <h2>Unirse a sala</h2>
    </div>
    <div class="join-room">
      <input type="text" id="room-code-input" class="room-input"
             placeholder="Código de sala" maxlength="6" autocapitalize="characters"
             spellcheck="false" autocomplete="off">
      <button class="btn btn-primary" onclick="handleJoin()">Unirse</button>
    </div>
    <button class="btn btn-ghost modal-close" onclick="hideAllModals(); showMenu()">Cancelar</button>
  `;
  modal.classList.add('active');
  setTimeout(() => document.getElementById('room-code-input')?.focus(), 100);
}

function handleJoin() {
  const input = document.getElementById('room-code-input');
  const code = input?.value?.trim();
  if (!code || code.length < 4) {
    showToast('Introduce un código válido');
    return;
  }
  joinRoom(code);
}
