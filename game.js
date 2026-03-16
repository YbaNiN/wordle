/**
 * game.js — Lógica principal del juego Wordle
 */

const MAX_ATTEMPTS = 6;
const WORD_LENGTH = 5;

// Estado del juego
let gameState = {
  mode: 'daily',        // 'daily' | 'infinite' | 'versus'
  targetWord: '',
  guesses: [],
  currentGuess: '',
  gameOver: false,
  won: false,
  currentRow: 0,
  letterStates: {},      // { a: 'correct' | 'present' | 'absent' }
  startTime: null,
  matchId: null
};

// ─── Selección de palabra ───────────────────────────
function getDailyWord() {
  const epoch = new Date(2024, 0, 1);
  const today = new Date();
  const diff = Math.floor((today - epoch) / (1000 * 60 * 60 * 24));
  const index = diff % SOLUTIONS.length;
  return SOLUTIONS[index].toUpperCase();
}

function getRandomWord() {
  const idx = Math.floor(Math.random() * SOLUTIONS.length);
  return SOLUTIONS[idx].toUpperCase();
}

function getDailyNumber() {
  const epoch = new Date(2024, 0, 1);
  const today = new Date();
  return Math.floor((today - epoch) / (1000 * 60 * 60 * 24));
}

// ─── Iniciar juego ──────────────────────────────────
function initGame(mode = 'daily') {
  // Resetear estado
  gameState = {
    mode,
    targetWord: '',
    guesses: [],
    currentGuess: '',
    gameOver: false,
    won: false,
    currentRow: 0,
    letterStates: {},
    startTime: Date.now(),
    matchId: null
  };

  if (mode === 'daily') {
    // Intentar restaurar estado diario
    const saved = getDailyState();
    if (saved && saved.guesses && saved.guesses.length > 0) {
      gameState.targetWord = getDailyWord();
      gameState.guesses = saved.guesses;
      gameState.currentRow = saved.guesses.length;
      gameState.gameOver = saved.gameOver || false;
      gameState.won = saved.won || false;
      // Reconstruir letterStates
      saved.guesses.forEach(g => {
        const result = evaluateGuess(g, gameState.targetWord);
        result.forEach(r => {
          const prev = gameState.letterStates[r.letter];
          if (r.state === 'correct' || (!prev && r.state !== 'absent') || (prev === 'absent')) {
            gameState.letterStates[r.letter] = r.state;
          }
          if (r.state === 'correct') gameState.letterStates[r.letter] = 'correct';
        });
      });
      renderRestoredGame();
      return gameState;
    }
    gameState.targetWord = getDailyWord();
  } else if (mode === 'infinite') {
    gameState.targetWord = getRandomWord();
  }

  renderBoard();
  renderKeyboard();
  return gameState;
}

// ─── Evaluar intento ────────────────────────────────
function evaluateGuess(guess, target) {
  const g = guess.toUpperCase().split('');
  const t = target.toUpperCase().split('');
  const result = g.map((letter, i) => ({ letter, state: 'absent', index: i }));

  // Primero: letras correctas (verde)
  const tRemaining = [...t];
  result.forEach((r, i) => {
    if (r.letter === t[i]) {
      r.state = 'correct';
      tRemaining[i] = null;
    }
  });

  // Segundo: letras presentes (amarillo)
  result.forEach((r, i) => {
    if (r.state !== 'correct') {
      const idx = tRemaining.indexOf(r.letter);
      if (idx !== -1) {
        r.state = 'present';
        tRemaining[idx] = null;
      }
    }
  });

  return result;
}

// ─── Validar palabra ────────────────────────────────
function isValidWord(word) {
  const w = word.toLowerCase();
  return SOLUTIONS.includes(w) || VALID_GUESSES.includes(w);
}

// ─── Procesar intento ───────────────────────────────
function submitGuess() {
  if (gameState.gameOver) return;
  if (gameState.currentGuess.length !== WORD_LENGTH) {
    shakeCurrentRow();
    showToast('Faltan letras');
    return;
  }
  if (!isValidWord(gameState.currentGuess)) {
    shakeCurrentRow();
    showToast('Palabra no válida');
    return;
  }

  const guess = gameState.currentGuess.toUpperCase();
  const result = evaluateGuess(guess, gameState.targetWord);

  // Actualizar estado de letras para teclado
  result.forEach(r => {
    const prev = gameState.letterStates[r.letter];
    if (r.state === 'correct') {
      gameState.letterStates[r.letter] = 'correct';
    } else if (r.state === 'present' && prev !== 'correct') {
      gameState.letterStates[r.letter] = 'present';
    } else if (!prev) {
      gameState.letterStates[r.letter] = r.state;
    }
  });

  gameState.guesses.push(guess);

  // Animar revelación
  revealRow(gameState.currentRow, result, () => {
    updateKeyboard();

    // ¿Ganó?
    if (guess === gameState.targetWord) {
      gameState.won = true;
      gameState.gameOver = true;
      setTimeout(() => {
        bounceRow(gameState.currentRow - 1);
        showEndScreen(true);
      }, 300);
    }
    // ¿Perdió?
    else if (gameState.guesses.length >= MAX_ATTEMPTS) {
      gameState.gameOver = true;
      setTimeout(() => showEndScreen(false), 600);
    }

    // Guardar estado diario
    if (gameState.mode === 'daily') {
      saveDailyState({
        guesses: gameState.guesses,
        gameOver: gameState.gameOver,
        won: gameState.won
      });
    }

    // Enviar movimiento multijugador
    if (gameState.mode === 'versus' && gameState.matchId) {
      if (typeof sendMove === 'function') {
        sendMove(gameState.matchId, guess, gameState.guesses.length);
      }
      if (gameState.gameOver && typeof handleVersusEnd === 'function') {
        handleVersusEnd(gameState.won, gameState.guesses.length);
      }
    }
  });

  gameState.currentRow++;
  gameState.currentGuess = '';
}

// ─── Entrada del teclado ────────────────────────────
function addLetter(letter) {
  if (gameState.gameOver) return;
  if (gameState.currentGuess.length >= WORD_LENGTH) return;
  gameState.currentGuess += letter.toUpperCase();
  updateCurrentRow();
  popTile(gameState.currentRow, gameState.currentGuess.length - 1);
}

function removeLetter() {
  if (gameState.gameOver) return;
  if (gameState.currentGuess.length === 0) return;
  gameState.currentGuess = gameState.currentGuess.slice(0, -1);
  updateCurrentRow();
}

// ─── Puntuación ─────────────────────────────────────
function calculateScore(won, attempts, timeMs) {
  if (!won) return 0;
  const base = (7 - attempts) * 100;
  const timeBonus = Math.max(0, Math.floor((300000 - timeMs) / 10000)); // Bonus por rapidez
  return base + timeBonus;
}

// ─── Compartir resultado ────────────────────────────
function generateShareText() {
  const modeLabel = gameState.mode === 'daily' ? `#${getDailyNumber()}` : '∞';
  const result = gameState.won ? `${gameState.guesses.length}/6` : 'X/6';
  let grid = '';

  gameState.guesses.forEach(guess => {
    const evaluation = evaluateGuess(guess, gameState.targetWord);
    const row = evaluation.map(r => {
      if (r.state === 'correct') return '🟩';
      if (r.state === 'present') return '🟨';
      return '⬜';
    }).join('');
    grid += row + '\n';
  });

  return `Wordle Español ${modeLabel}\n${grid}\n${result}`;
}

async function shareResult() {
  const text = generateShareText();
  try {
    await navigator.clipboard.writeText(text);
    showToast('¡Copiado al portapapeles!');
  } catch {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('¡Copiado al portapapeles!');
  }
}
