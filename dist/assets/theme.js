// Applies the saved light/dark choice before the page draws, so it doesn't flash.
try { const t = localStorage.getItem('jj-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (_) { /* no storage */ }
