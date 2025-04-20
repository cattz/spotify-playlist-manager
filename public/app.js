function formatMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

document.addEventListener('alpine:init', () => {
  Alpine.data('appData', () => ({
    playlists: [],
    filteredPlaylists: [],
    tab: 'all',
    searchTags: '',
    searchMode: 'or',
    onlyMine: false,
    isAuthenticated: false,
    userId: null,
    totalSongs: 0,
    loading: true,

    async init() {
      try {
        const res = await fetch('/api/playlists');
        if (res.status === 401) {
          this.isAuthenticated = false;
          return;
        }
        const data = await res.json();
        this.playlists = data.playlists.map(pl => ({
          ...pl,
          tracksLoaded: pl.tracksLoaded || false,
          tracks: []
        }));
        this.filteredPlaylists = this.playlists;
        this.userId = data.user_id;
        this.isAuthenticated = true;
        this.calculateTotalSongs();
        this.loading = false;
      } catch (error) {
        console.error('Error inicial:', error);
      }
    },

    loadTracks(playlist) {
      if (playlist.tracksLoaded) return;

      playlist.tracksLoaded = true; // Marcar que ya estamos cargando

      const source = new EventSource(`/stream/tracks/${playlist.id}`);

      source.onmessage = (event) => {
        try {
          if (event.data) {
            const track = JSON.parse(event.data);
            playlist.tracks.push(track);
          }
        } catch (e) {
          console.error('Error parsing track data:', e);
        }
      };

      source.addEventListener('end', () => {
        console.log(`Tracks cargados para playlist: ${playlist.name}`);
        source.close();
      });

      source.onerror = (err) => {
        console.error('Error en stream de tracks:', err);
        source.close();
      };
    },

    formatDuration(ms) {
      return formatMs(ms);
    },

    login() {
      window.location.href = '/auth/spotify';
    },

    logout() {
      window.location.href = '/logout';
    },

    search() {
      this.applyFilters();
    },

    clearSearch() {
      this.searchTags = '';
      this.applyFilters();
    },

    applyFilters() {
      let results = [...this.playlists];

      if (this.onlyMine && this.userId) {
        results = results.filter(pl => pl.owner_id === this.userId);
      }

      const tags = this.searchTags.toLowerCase().split(/[,\\s]+/).filter(t => t.length > 0);

      if (tags.length > 0) {
        if (this.searchMode === 'or') {
          results = results.filter(pl => {
            const desc = (pl.description || '').toLowerCase();
            return tags.some(tag => desc.includes(tag));
          });
        } else if (this.searchMode === 'and') {
          results = results.filter(pl => {
            const desc = (pl.description || '').toLowerCase();
            return tags.every(tag => desc.includes(tag));
          });
        }
      }

      this.filteredPlaylists = results;
      this.calculateTotalSongs();
    },

    calculateTotalSongs() {
      this.totalSongs = this.filteredPlaylists.reduce((sum, pl) => sum + (pl.total_tracks || 0), 0);
    }
  }));
});
