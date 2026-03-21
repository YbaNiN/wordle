/**
 * supabase.js — Cliente Supabase con autenticación completa
 * Auth (email/password), database, realtime
 */

const SUPABASE_URL = 'https://fjsfyosuoehdyhmwoupd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_jrBuYE2_z8sdedxXPGnR5A_-R9dJSC2';

let supabaseClient = null;
let supabaseReady = false;
let currentUser = null; // { id, email, username }
let _signingUp = false; // Flag para evitar race condition en onAuthStateChange

function initSupabase() {
  if (supabaseReady) return true; // Ya inicializado — evitar doble init
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        // Evitar problemas con navigator.locks
        lock: (name, acquireTimeout, fn) => fn()
      }
    });
    supabaseReady = true;
    console.log('Supabase inicializado');

    // Escuchar cambios de sesión
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      if (_signingUp) return; // Evitar race condition: signUp maneja el perfil
      if (session?.user) {
        await loadUserProfile(session.user.id);
      } else {
        currentUser = null;
      }
      updateAuthUI();
    });

    return true;
  }
  console.warn('Supabase SDK no disponible — modo offline');
  return false;
}

function isSupabaseReady() {
  return supabaseReady && supabaseClient !== null &&
    SUPABASE_URL !== 'https://YOUR_PROJECT.supabase.co';
}

function isLoggedIn() {
  return currentUser !== null && currentUser.id && !currentUser.id.startsWith('local_');
}

// ─── Auth: Registro ─────────────────────────────────
async function signUp(email, password, username) {
  if (!isSupabaseReady()) return { error: 'Supabase no conectado' };
  _signingUp = true;

  // Verificar que el username no exista
  const { data: existing } = await supabaseClient
    .from('players')
    .select('id')
    .eq('username', username)
    .maybeSingle();

  if (existing) { _signingUp = false; return { error: 'Ese nombre de usuario ya está en uso' }; }

  // Crear cuenta en Supabase Auth
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { username }
    }
  });

  if (error) {
    _signingUp = false;
    if (error.message.includes('already registered')) {
      return { error: 'Este email ya tiene una cuenta' };
    }
    return { error: error.message };
  }

  if (data.user) {
    // Crear perfil en tabla players
    await supabaseClient
      .from('players')
      .insert([{ id: data.user.id, username, email }]);

    // Crear entrada en leaderboard
    await supabaseClient
      .from('leaderboard')
      .insert([{ player_id: data.user.id, score: 0, wins: 0, losses: 0 }]);

    currentUser = { id: data.user.id, email, username };
    localStorage.setItem('wordle_player_id', data.user.id);
    localStorage.setItem('wordle_username', username);

    _signingUp = false;
    return { user: currentUser };
  }
  _signingUp = false;
  return { error: 'Error desconocido al registrarse' };
}

// ─── Auth: Login ────────────────────────────────────
async function logIn(email, password) {
  if (!isSupabaseReady()) return { error: 'Supabase no conectado' };

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      if (error.message.includes('Invalid login')) {
        return { error: 'Email o contraseña incorrectos' };
      }
      return { error: error.message };
    }

    if (data.user) {
      await loadUserProfile(data.user.id);
      return { user: currentUser };
    }
    return { error: 'Error desconocido al iniciar sesión' };
  } catch (e) {
    console.error('Error en logIn:', e);
    return { error: 'Error de conexión. Inténtalo de nuevo.' };
  }
}

// ─── Auth: Logout ───────────────────────────────────
async function logOut() {
  if (isSupabaseReady()) {
    await supabaseClient.auth.signOut();
  }
  currentUser = null;
  localStorage.removeItem('wordle_player_id');
  localStorage.removeItem('wordle_username');
  updateAuthUI();
  showMenu();
}

// ─── Auth: Restaurar sesión ─────────────────────────
async function restoreSession() {
  if (!isSupabaseReady()) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      await loadUserProfile(session.user.id);
      updateAuthUI();
    }
  } catch (e) {
    console.error('Error restaurando sesión:', e);
  }
}

// ─── Cargar perfil ──────────────────────────────────
async function loadUserProfile(userId) {
  if (!isSupabaseReady()) return;
  try {
    const { data } = await supabaseClient
      .from('players')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      currentUser = { id: data.id, email: data.email, username: data.username };
      localStorage.setItem('wordle_player_id', data.id);
      localStorage.setItem('wordle_username', data.username);
    }
  } catch (e) {
    console.error('Error cargando perfil:', e);
  }
}

// ─── Actualizar username ────────────────────────────
async function updateUsername(newUsername) {
  if (!isLoggedIn() || !isSupabaseReady()) return { error: 'No has iniciado sesión' };

  const { data: existing } = await supabaseClient
    .from('players')
    .select('id')
    .eq('username', newUsername)
    .neq('id', currentUser.id)
    .maybeSingle();

  if (existing) return { error: 'Ese nombre ya está en uso' };

  const { error } = await supabaseClient
    .from('players')
    .update({ username: newUsername })
    .eq('id', currentUser.id);

  if (error) return { error: error.message };

  currentUser.username = newUsername;
  localStorage.setItem('wordle_username', newUsername);
  updateAuthUI();
  return { success: true };
}

// ─── Player helpers ─────────────────────────────────
function getLocalPlayer(username) {
  let id = localStorage.getItem('wordle_player_id');
  if (!id) {
    id = 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('wordle_player_id', id);
  }
  if (username) localStorage.setItem('wordle_username', username);
  return { id, username: username || localStorage.getItem('wordle_username') || 'Invitado' };
}

function getCurrentPlayer() {
  if (isLoggedIn()) return currentUser;
  return getLocalPlayer();
}

function getCurrentUsername() {
  if (isLoggedIn()) return currentUser.username;
  return localStorage.getItem('wordle_username') || 'Invitado';
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
      player_id: r.player_id,
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
  return [{ username: getCurrentUsername(), score: stats.totalScore || 0, wins: stats.wins || 0, losses: stats.losses || 0 }];
}

async function updateLeaderboard(scoreData) {
  if (!isSupabaseReady() || !isLoggedIn()) return;
  const playerId = currentUser.id;
  try {
    const { data: existing } = await supabaseClient
      .from('leaderboard').select('*').eq('player_id', playerId).maybeSingle();

    if (existing) {
      await supabaseClient.from('leaderboard').update({
        score: existing.score + (scoreData.score || 0),
        wins: existing.wins + (scoreData.win ? 1 : 0),
        losses: existing.losses + (scoreData.win ? 0 : 1)
      }).eq('player_id', playerId);
    } else {
      await supabaseClient.from('leaderboard').insert([{
        player_id: playerId, score: scoreData.score || 0,
        wins: scoreData.win ? 1 : 0, losses: scoreData.win ? 0 : 1
      }]);
    }
  } catch (e) {
    console.error('Error actualizando leaderboard:', e);
  }
}

// ─── Multiplayer ────────────────────────────────────
async function createMatch(word) {
  if (!isSupabaseReady()) return null;
  const playerId = getCurrentPlayer().id;
  const roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  try {
    const { data, error } = await supabaseClient
      .from('matches')
      .insert([{ player1: playerId, word, room_code: roomCode, status: 'waiting' }])
      .select().single();
    if (error) throw error;
    return { match: data, roomCode };
  } catch (e) {
    console.error('Error creando partida:', e);
    return null;
  }
}

async function joinMatch(roomCode) {
  if (!isSupabaseReady()) return null;
  const playerId = getCurrentPlayer().id;
  try {
    const { data: match, error: findErr } = await supabaseClient
      .from('matches').select('*')
      .eq('room_code', roomCode.toUpperCase())
      .eq('status', 'waiting').maybeSingle();
    if (findErr || !match) return null;

    const { data, error } = await supabaseClient
      .from('matches')
      .update({ player2: playerId, status: 'playing' })
      .eq('id', match.id).select().single();
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'moves', filter: `match_id=eq.${matchId}` }, payload => callback(payload))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, payload => callback(payload))
    .subscribe();
}

async function sendMove(matchId, guess, attemptNumber) {
  if (!isSupabaseReady()) return;
  const playerId = getCurrentPlayer().id;
  try {
    await supabaseClient.from('moves').insert([{ match_id: matchId, player_id: playerId, guess, attempt_number: attemptNumber }]);
  } catch (e) { console.error('Error enviando movimiento:', e); }
}

async function endMatch(matchId, winnerId) {
  if (!isSupabaseReady()) return;
  try {
    await supabaseClient.from('matches').update({ winner: winnerId, status: 'finished' }).eq('id', matchId);
  } catch (e) { console.error('Error finalizando partida:', e); }
}

function unsubscribeFromMatch(channel) {
  if (channel && isSupabaseReady()) supabaseClient.removeChannel(channel);
}
