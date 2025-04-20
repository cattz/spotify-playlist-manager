require('dotenv').config();
const express = require('express');
const app = express(); // 🛑 Creamos la app aquí inmediatamente
const session = require('express-session');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const axios = require('axios');
const path = require('path');
const db = require('./db.js');

const PORT = 3000;

// Función sleep para evitar rate limit
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Configuración de sesión
app.use(session({ secret: 'spotifysecret', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Serialización de sesión
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Configurar estrategia de Spotify
passport.use(new SpotifyStrategy({
  clientID: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/callback'
},
(accessToken, refreshToken, expires_in, profile, done) => {
  profile.accessToken = accessToken;
  profile.user_id = profile.id;
  return done(null, profile);
}));

// Ruta de login
app.get('/auth/spotify', passport.authenticate('spotify', {
  scope: ['playlist-read-private', 'playlist-read-collaborative']
}));

// Callback de login
app.get('/callback', passport.authenticate('spotify', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// API normal para cargar playlists de SQLite
app.get('/api/playlists', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No autorizado' });

  try {
    const playlistsFromDB = await db.getAllPlaylists();

    return res.json({
      playlists: playlistsFromDB,
      user_id: req.user.user_id
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Error al leer base de datos' });
  }
});

// STREAMING SSE de playlists
app.get('/stream/playlists', async (req, res) => {
  if (!req.user) {
    res.writeHead(401);
    res.end();
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });

  try {
    const allPlaylists = [];
    let url = 'https://api.spotify.com/v1/me/playlists';

    while (url) {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${req.user.accessToken}` }
      });

      allPlaylists.push(...response.data.items);
      url = response.data.next;

      if (url) await sleep(300); // Pequeño delay entre páginas
    }

    for (const pl of allPlaylists) {
      const tracksRes = await axios.get(pl.tracks.href, {
        headers: { Authorization: `Bearer ${req.user.accessToken}` }
      });

      let totalDuration = 0;
      let latestDate = null;

      tracksRes.data.items.forEach(item => {
        if (item.track) {
          totalDuration += item.track.duration_ms || 0;
          const addedAt = new Date(item.added_at);
          if (!latestDate || addedAt > latestDate) latestDate = addedAt;
        }
      });

      await sleep(150); // Delay entre cada playlist

      const enhanced = {
        id: pl.id,
        name: pl.name,
        description: pl.description || '',
        images: pl.images || [],
        total_tracks: pl.tracks.total,
        total_duration_ms: totalDuration,
        last_added_at: latestDate ? latestDate.toISOString().split('T')[0] : null,
        owner_id: pl.owner.id
      };

      // Opcional: guardar en SQLite
      // await db.insertPlaylists([enhanced]);

      // Enviar vía SSE
      res.write(`data: ${JSON.stringify(enhanced)}\n\n`);
    }

    res.write(`event: end\ndata: done\n\n`);
    res.end();

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.write(`event: error\ndata: ${JSON.stringify(error.message)}\n\n`);
    res.end();
  }
});

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
