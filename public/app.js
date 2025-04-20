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
    eventSource: null,
    loading: true,

    async init() {
      try {
        const res = await fetch('/api/playlists');
        if (res.status === 401) {
          this.isAuthenticated = false;
          return;
        }
        const data = await res.json();
        if (data.playlists.length > 0) {
          this.playlists = data.playlists;
          this.filteredPlaylists = data.playlists;
          this.userId = data.user_id;
          this.isAuthenticated = true;
          this.calculateTotalSongs();
          this.loading = false;
        } else {
          // Si no hay playlists guardadas, empieza a escuchar el stream
          this.startStream();
        }
      } catch (error) {
        console.error('Error inicial:', error);
      }
    },

    startStream() {
      this.eventSource = new EventSource('/stream/playlists');

      this.eventSource.onmessage = (event) => {
        try {
          const playlist = JSON.parse(event.data);
          this.playlists.push(playlist);
          this.filteredPlaylists.push(playlist);
          this.calculateTotalSongs();
        } catch (e) {
          console.error('Error parsing playlist event', e);
        }
      };

      this.eventSource.addEventListener('end', () => {
        console.log('Stream terminado');
        this.loading = false;
        this.eventSource.close();
      });

      this.eventSource.onerror = (event) => {
        console.error('Error en stream SSE', event);
        this.eventSource.close();
        this.loading = false;
      };
    }


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
      this.totalSongs = this.filteredPlaylists.reduce((sum, pl) => sum + pl.total_tracks, 0);
    }
  }));
});
