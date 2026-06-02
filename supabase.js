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

// Utilidad: timeout para promesas que pueden colgar
function withTimeout(promise, ms = 10000) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tiempo de espera agotado')), ms)
    )
  ]);
}

function initSupabase() {
  if (supabaseReady) return true; // Ya inicializado — evitar doble init
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {

    // Limpiar tokens de sesiones de usuarios borrados que causan locks
    try {
      const storageKey = 'sb-fjsfyosuoehdyhmwoupd-auth-token';
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const session = JSON.parse(raw);
        // Si el token expiró hace más de 7 días, limpiar
        if (session.expires_at && session.expires_at * 1000 < Date.now() - 7 * 86400000) {
          localStorage.removeItem(storageKey);
          console.log('Sesión expirada eliminada');
        }
      }
    } catch (e) { /* ignorar */ }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabaseReady = true;
    console.log('Supabase inicializado');

    // Escuchar cambios de sesión
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      try {
        if (_signingUp) return;
        if (session?.user) {
          await withTimeout(loadUserProfile(session.user.id), 5000);
        } else {
          currentUser = null;
        }
        updateAuthUI();
      } catch (e) {
        console.warn('Error en onAuthStateChange:', e.message);
      }
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

  try {
    // Verificar que el username no exista
    const { data: existing } = await supabaseClient
      .from('players')
      .select('id')
      .eq('username', username)
      .maybeSingle();

    if (existing) { _signingUp = false; return { error: 'Ese nombre de usuario ya está en uso' }; }

    // Crear cuenta en Supabase Auth
    console.log('[signUp] Creando cuenta en Auth...');
    const { data, error } = await withTimeout(
      supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      })
    );

    console.log('[signUp] Auth response:', { userId: data?.user?.id, identities: data?.user?.identities?.length, error: error?.message });

    if (error) {
      _signingUp = false;
      if (error.message.includes('already registered')) {
        return { error: 'Este email ya tiene una cuenta. Inicia sesión.' };
      }
      return { error: error.message };
    }

    // Supabase devuelve user con identities vacío si el email ya existe
    if (!data.user || !data.user.identities || data.user.identities.length === 0) {
      console.warn('[signUp] Identities vacío — email duplicado');
      _signingUp = false;
      return { error: 'Este email ya tiene una cuenta. Inicia sesión.' };
    }

    console.log('[signUp] User creado:', data.user.id, '— insertando en players...');

    // Crear perfil en tabla players (upsert por si existe parcialmente)
    const { data: playerData, error: playerErr } = await supabaseClient
      .from('players')
      .upsert([{ id: data.user.id, username }], { onConflict: 'id' })
      .select();

    console.log('[signUp] Players result:', { data: playerData, error: playerErr?.message });

    // Crear entrada en leaderboard (upsert)
    const { data: lbData, error: lbErr } = await supabaseClient
      .from('leaderboard')
      .upsert([{ player_id: data.user.id, score: 0, wins: 0, losses: 0 }], { onConflict: 'player_id' })
      .select();

    console.log('[signUp] Leaderboard result:', { data: lbData, error: lbErr?.message });

    currentUser = { id: data.user.id, email, username };
    localStorage.setItem('wordle_player_id', data.user.id);
    localStorage.setItem('wordle_username', username);

    _signingUp = false;
    return { user: currentUser };
  } catch (e) {
    console.error('Error en signUp:', e);
    _signingUp = false;
    return { error: 'Error de conexión. Inténtalo de nuevo.' };
  }
}

// ─── Auth: Login ────────────────────────────────────
async function logIn(email, password) {
  if (!isSupabaseReady()) return { error: 'Supabase no conectado' };

  try {
    const { data, error } = await withTimeout(
      supabaseClient.auth.signInWithPassword({ email, password })
    );

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

    // El email vive en auth.users, no en players.
    let email = '';
    try {
      const { data: authData } = await supabaseClient.auth.getUser();
      email = authData?.user?.email || '';
    } catch (_) { /* ignorar */ }

    if (data) {
      currentUser = { id: data.id, email, username: data.username };
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
  try {
    // El score lo calcula el SERVIDOR. El cliente solo informa
    // si ganó y en cuántos intentos; los puntos no se confían al navegador.
    const { error } = await supabaseClient.rpc('record_game_result', {
      p_won: !!scoreData.win,
      p_attempts: scoreData.attempts || 6
    });
    if (error) throw error;
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
  try {
    // RPC del servidor: une al jugador y devuelve solo id + status.
    // Nunca expone la palabra al cliente.
    const { data, error } = await supabaseClient.rpc('join_match_by_code', {
      p_code: roomCode.toUpperCase()
    });
    if (error) throw error;
    if (!data || data.length === 0) return null; // sala no encontrada
    const row = data[0];
    return { match: { id: row.match_id, status: row.status } };
  } catch (e) {
    console.error('Error uniéndose a partida:', e);
    return null;
  }
}

// Evalúa un intento del versus EN EL SERVIDOR. Devuelve { states, won, attempt }
// sin que el cliente conozca nunca la palabra objetivo.
async function submitVersusGuess(matchId, guess) {
  if (!isSupabaseReady()) return null;
  try {
    const { data, error } = await supabaseClient.rpc('submit_versus_guess', {
      p_match_id: matchId,
      p_guess: guess
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return { states: row.states, won: row.won, attempt: row.attempt_number, revealWord: row.reveal_word };
  } catch (e) {
    console.error('Error evaluando intento:', e);
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
    // Solo fijar winner si aún no hay uno (gana quien acierta primero).
    const { data: current } = await supabaseClient
      .from('matches').select('winner').eq('id', matchId).maybeSingle();
    if (current && current.winner) return; // ya hay ganador
    await supabaseClient.from('matches')
      .update({ winner: winnerId, status: 'finished' })
      .eq('id', matchId);
  } catch (e) { console.error('Error finalizando partida:', e); }
}

// Notifica al rival que he terminado (haya ganado o no) con un move-señal.
async function reportVersusFinish(matchId, playerId, won, attempts) {
  if (!isSupabaseReady()) return;
  try {
    await supabaseClient.from('moves').insert([{
      match_id: matchId,
      player_id: playerId,
      guess: won ? 'WON' : 'LOST',
      attempt_number: 99 // señal de "terminé"
    }]);
  } catch (e) { console.error('Error reportando fin:', e); }
}

function unsubscribeFromMatch(channel) {
  if (channel && isSupabaseReady()) supabaseClient.removeChannel(channel);
}
