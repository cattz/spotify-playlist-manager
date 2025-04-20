require('dotenv').config();
const express = require('express');
const app = express(); // Importante: app debe estar creado antes de usarlo
const session = require('express-session');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const axios = require('axios');
const path = require('path');
const db = require('./db.js');

const PORT = 3000;

// Sleep para controlar rate limits
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Configurar sesión
app.use(session({ secret: 'spotifysecret', resave: true, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());

// Configurar Passport
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// Spotify Strategy
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

// Login
app.get('/auth/spotify', passport.authenticate('spotify', {
  scope: ['playlist-read-private', 'playlist-read-collaborative']
}));

// Callback
app.get('/callback', passport.authenticate('spotify', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

// API normal (carga rápida desde SQLite)
app.get('/api/playlists', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'No autorizado' });

  try {
    const playlistsFromDB = await db.getAllPlaylists();
    res.json({
      playlists: playlistsFromDB,
      user_id: req.user.user_id
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: 'Error al leer base de datos' });
  }
});

// STREAM de playlists con SSE
app.get('/stream/playlists', async (req, res) => {
  if (!req.user) {
    res.status(401).end();
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

      if (url) await sleep(300);
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

      await sleep(150);

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

      res.write(`data: ${JSON.stringify(enhanced)}\n\n`);
    }

    res.write(`event: end\ndata: done\n\n`);
    res.end();

  } catch (error) {
    console.error(error.message);
    res.write(`event: error\ndata: ${JSON.stringify(error.message)}\n\n`);
    res.end();
  }
});

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// Lanzar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
