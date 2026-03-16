/**
 * stats.js — Módulo de estadísticas del jugador
 */

const STATS_KEY = 'wordle_stats';
const DAILY_KEY = 'wordle_daily';

function getDefaultStats() {
  return {
    played: 0,
    wins: 0,
    losses: 0,
    streak: 0,
    maxStreak: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
    totalScore: 0,
    lastPlayed: null
  };
}

function loadStats() {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return getDefaultStats();
    return { ...getDefaultStats(), ...JSON.parse(raw) };
  } catch {
    return getDefaultStats();
  }
}

function saveStats(stats) {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function recordResult(won, attempts, mode = 'daily') {
  const stats = loadStats();
  stats.played++;
  if (won) {
    stats.wins++;
    stats.streak++;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.distribution[attempts] = (stats.distribution[attempts] || 0) + 1;
    // Puntuación: más puntos por menos intentos
    const score = Math.max(0, (7 - attempts) * 100);
    stats.totalScore += score;
  } else {
    stats.losses++;
    stats.streak = 0;
  }
  stats.lastPlayed = new Date().toISOString();
  saveStats(stats);

  // Actualizar leaderboard en Supabase
  if (typeof updateLeaderboard === 'function') {
    updateLeaderboard({ win: won, score: won ? (7 - attempts) * 100 : 0 });
  }
  return stats;
}

function getWinPercentage() {
  const s = loadStats();
  return s.played === 0 ? 0 : Math.round((s.wins / s.played) * 100);
}

// ─── Estado diario ─────────────────────────────────
function getDailyState() {
  try {
    const raw = localStorage.getItem(DAILY_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    if (state.date !== getTodayStr()) return null;
    return state;
  } catch {
    return null;
  }
}

function saveDailyState(state) {
  localStorage.setItem(DAILY_KEY, JSON.stringify({
    ...state,
    date: getTodayStr()
  }));
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ─── Renderizado de estadísticas ────────────────────
function renderStatsModal() {
  const stats = loadStats();
  const pct = getWinPercentage();

  const maxDist = Math.max(1, ...Object.values(stats.distribution));

  let distHTML = '';
  for (let i = 1; i <= 6; i++) {
    const count = stats.distribution[i] || 0;
    const width = Math.max(8, (count / maxDist) * 100);
    distHTML += `
      <div class="dist-row">
        <span class="dist-label">${i}</span>
        <div class="dist-bar" style="width:${width}%">${count}</div>
      </div>`;
  }

  return `
    <div class="stats-grid">
      <div class="stat-item">
        <span class="stat-number">${stats.played}</span>
        <span class="stat-label">Jugadas</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${pct}%</span>
        <span class="stat-label">Victorias</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${stats.streak}</span>
        <span class="stat-label">Racha</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${stats.maxStreak}</span>
        <span class="stat-label">Mejor racha</span>
      </div>
    </div>
    <h3 class="dist-title">Distribución de intentos</h3>
    <div class="dist-chart">${distHTML}</div>
    <div class="stats-score">
      <span>Puntuación total: <strong>${stats.totalScore}</strong></span>
    </div>
  `;
}
