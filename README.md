# Wordle Español 🟩

Wordle en español con modo diario, infinito y multijugador 1vs1 en tiempo real.

## Ejecutar en local

1. Clonar el repositorio
2. Servir con cualquier servidor estático:

```bash
# Python
python3 -m http.server 8000

# Node
npx serve .
```

3. Abrir `http://localhost:8000`

## Configurar Supabase

El juego funciona **sin Supabase** (modo offline). Para habilitar multijugador y ranking:

### 1. Crear proyecto en [supabase.com](https://supabase.com)

### 2. Configurar autenticación

En Supabase, ve a **Authentication → Providers → Email** y:

- Activa el proveedor de email
- **Desactiva "Confirm email"** (para que los usuarios puedan jugar al instante)

### 3. Ejecutar SQL para crear las tablas

En **SQL Editor**, ejecuta:

```sql
-- Jugadores (vinculados a Supabase Auth)
CREATE TABLE players (
  id UUID PRIMARY KEY,  -- mismo ID que auth.users
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partidas multijugador
CREATE TABLE matches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  player1 TEXT,
  player2 TEXT,
  word TEXT NOT NULL,
  winner TEXT,
  room_code TEXT UNIQUE,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Movimientos
CREATE TABLE moves (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id UUID REFERENCES matches(id),
  player_id TEXT NOT NULL,
  guess TEXT NOT NULL,
  attempt_number INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ranking
CREATE TABLE leaderboard (
  player_id TEXT PRIMARY KEY,
  score INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0
);

-- Habilitar Realtime en matches y moves
ALTER PUBLICATION supabase_realtime ADD TABLE matches;
ALTER PUBLICATION supabase_realtime ADD TABLE moves;

-- RLS (acceso público para demo — ajustar para producción)
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON matches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON moves FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access" ON leaderboard FOR ALL USING (true) WITH CHECK (true);
```

### 3. Configurar credenciales

En `supabase.js`, reemplazar:

```js
const SUPABASE_URL = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```

## Desplegar en GitHub Pages

1. Subir el repositorio a GitHub
2. Ir a Settings → Pages
3. Source: `main` branch, carpeta `/` (root)
4. Guardar — el sitio estará en `https://tu-usuario.github.io/wordle-es/`

> **Nota:** Ajustar `start_url` en `manifest.json` si el sitio no está en la raíz.

## Modificar palabras

Editar `words.js`:

- `SOLUTIONS`: palabras que pueden ser solución (5 letras, español)
- `VALID_GUESSES`: palabras adicionales aceptadas como intento

## Personalizar estilos

Las variables CSS están en `:root` y `[data-theme="dark"]` en `style.css`:

- `--correct`: color verde (acierto)
- `--present`: color amarillo (posición incorrecta)
- `--absent`: color gris (no existe)
- `--accent`: color principal de botones
- `--font-body` / `--font-mono`: tipografías

## Estructura

```
wordle-es/
├── index.html          ← Entrada principal
├── style.css           ← Estilos + tema oscuro
├── script.js           ← Controlador UI y eventos
├── game.js             ← Lógica del juego
├── multiplayer.js       ← 1vs1 en tiempo real
├── supabase.js         ← Cliente Supabase
├── words.js            ← Banco de palabras
├── stats.js            ← Estadísticas del jugador
├── manifest.json       ← PWA manifest
├── service-worker.js   ← Cache offline
├── icons/              ← Iconos PWA
└── README.md
```

## Licencia

MIT
