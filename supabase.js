/**
 * supabase.js — Configuración del cliente Supabase
 * Manejar auth, database y realtime
 */

const SUPABASE_URL = 'https://fjsfyosuoehdyhmwoupd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jrBuYE2_z8sdedxXPGnR5A_-R9dJSC2';

let supabaseClient = null;
let supabaseReady = false;

function initSupabase() {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseReady = true;
    console.log('Supabase inicializado');
    return true;
  }
  console.warn('Supabase SDK no disponible — modo offline');
  return false;
}

function isSupabaseReady() {
  return supabaseReady && supabaseClient !== null &&
    SUPABASE_URL !== 'https://YOUR_PROJECT.supabase.co';
}

// ─── Auth ───────────────────────────────────────────
async function signUpAnon(username) {
  if (!isSupabaseReady()) return { player: getLocalPlayer(username) };
  try {
    const { data, error } = await supabaseClient
      .from('players')
      .insert([{ username }])
      .select()
      .single();
    if (error) throw error;
    localStorage.setItem('wordle_player_id', data.id);
    localStorage.setItem('wordle_username', username);
    return { player: data };
  } catch (e) {
    console.error('Error creando jugador:', e);
    return { player: getLocalPlayer(username) };
  }
}

function getLocalPlayer(username) {
  let id = localStorage.getItem('wordle_player_id');
  if (!id) {
    id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('wordle_player_id', id);
  }
  if (username) localStorage.setItem('wordle_username', username);
  return {
    id,
    username: username || localStorage.getItem('wordle_username') || 'Jugador'
  };
}

function getCurrentPlayer() {
  return getLocalPlayer();
}

// ─── Leaderboard ────────────────────────────────────
async function fetchLeaderboard(limit = 20) {
  if (!isSupabaseReady()) return getLocalLeaderboard();
  try {
    const { data, error } = await supabaseClient
      .from('leaderboard')
      .select('*, players(username)')
      .order('score', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data.map(r => ({
      username: r.players?.username || 'Anónimo',
      score: r.score,
      wins: r.wins,
      losses: r.losses
    }));
  } catch (e) {
    console.error('Error obteniendo leaderboard:', e);
    return getLocalLeaderboard();
  }
}

function getLocalLeaderboard() {
  const stats = JSON.parse(localStorage.getItem('wordle_stats') || '{}');
  const username = localStorage.getItem('wordle_username') || 'Tú';
  return [{
    username,
    score: stats.totalScore || 0,
    wins: stats.wins || 0,
    losses: stats.losses || 0
  }];
}

async function updateLeaderboard(scoreData) {
  if (!isSupabaseReady()) return;
  const playerId = localStorage.getItem('wordle_player_id');
  if (!playerId || playerId.startsWith('local_')) return;
  try {
    const { data: existing } = await supabaseClient
      .from('leaderboard')
      .select('*')
      .eq('player_id', playerId)
      .single();

    if (existing) {
      await supabaseClient
        .from('leaderboard')
        .update({
          score: existing.score + (scoreData.score || 0),
          wins: existing.wins + (scoreData.win ? 1 : 0),
          losses: existing.losses + (scoreData.win ? 0 : 1)
        })
        .eq('player_id', playerId);
    } else {
      await supabaseClient
        .from('leaderboard')
        .insert([{
          player_id: playerId,
          score: scoreData.score || 0,
          wins: scoreData.win ? 1 : 0,
          losses: scoreData.win ? 0 : 1
        }]);
    }
  } catch (e) {
    console.error('Error actualizando leaderboard:', e);
  }
}

// ─── Multiplayer ────────────────────────────────────
async function createMatch(word) {
  if (!isSupabaseReady()) return null;
  const playerId = localStorage.getItem('wordle_player_id');
  const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  try {
    const { data, error } = await supabaseClient
      .from('matches')
      .insert([{
        player1: playerId,
        word,
        room_code: roomCode,
        status: 'waiting'
      }])
      .select()
      .single();
    if (error) throw error;
    return { match: data, roomCode };
  } catch (e) {
    console.error('Error creando partida:', e);
    return null;
  }
}

async function joinMatch(roomCode) {
  if (!isSupabaseReady()) return null;
  const playerId = localStorage.getItem('wordle_player_id');
  try {
    const { data: match, error: findErr } = await supabaseClient
      .from('matches')
      .select('*')
      .eq('room_code', roomCode.toUpperCase())
      .eq('status', 'waiting')
      .single();
    if (findErr || !match) return null;

    const { data, error } = await supabaseClient
      .from('matches')
      .update({ player2: playerId, status: 'playing' })
      .eq('id', match.id)
      .select()
      .single();
    if (error) throw error;
    return { match: data };
  } catch (e) {
    console.error('Error uniéndose a partida:', e);
    return null;
  }
}

function subscribeToMatch(matchId, callback) {
  if (!isSupabaseReady()) return null;
  return supabaseClient
    .channel(`match_${matchId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'moves',
      filter: `match_id=eq.${matchId}`
    }, payload => callback(payload))
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'matches',
      filter: `id=eq.${matchId}`
    }, payload => callback(payload))
    .subscribe();
}

async function sendMove(matchId, guess, attemptNumber) {
  if (!isSupabaseReady()) return;
  const playerId = localStorage.getItem('wordle_player_id');
  try {
    await supabaseClient
      .from('moves')
      .insert([{
        match_id: matchId,
        player_id: playerId,
        guess,
        attempt_number: attemptNumber
      }]);
  } catch (e) {
    console.error('Error enviando movimiento:', e);
  }
}

async function endMatch(matchId, winnerId) {
  if (!isSupabaseReady()) return;
  try {
    await supabaseClient
      .from('matches')
      .update({ winner: winnerId, status: 'finished' })
      .eq('id', matchId);
  } catch (e) {
    console.error('Error finalizando partida:', e);
  }
}

function unsubscribeFromMatch(channel) {
  if (channel && isSupabaseReady()) {
    supabaseClient.removeChannel(channel);
  }
}
