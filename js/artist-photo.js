/* =========================================================================
 * artist-photo.js — Busca e compactação de dados do artista
 *
 * Fontes públicas (sem chave de API, com CORS):
 *   - Wikipédia (pt → en), API MediaWiki: foto real, título e biografia curta
 *     (prop=pageimages|extracts)
 *   - Apple Music / iTunes Search API: gênero musical (primaryGenreName) e,
 *     como último recurso, arte do álbum
 *
 * A imagem é recortada (quadrado central), compactada em JPEG e devolvida em
 * base64 para ser armazenada junto do cantor no localStorage.
 * ========================================================================= */
(function (global) {
  'use strict';

  var SIZE = 256;     // lado do quadrado em pixels
  var QUALITY = 0.78; // qualidade JPEG

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim();
  }

  /** Foto + biografia curta na Wikipédia de determinado idioma. */
  function wikiInfo(lang, name) {
    var url = 'https://' + lang + '.wikipedia.org/w/api.php?action=query' +
      '&generator=search&gsrsearch=' + encodeURIComponent(name) +
      '&gsrlimit=1&prop=pageimages|extracts&exintro=1&explaintext=1&exsentences=3' +
      '&pithumbsize=500&format=json&origin=*';
    return Net.getJson(url, { timeout: 8000, cacheTtl: 60 * 60 * 1000 }).then(function (data) {
      var pages = data.query && data.query.pages;
      if (!pages) return null;
      var page = pages[Object.keys(pages)[0]];
      if (!page) return null;
      return {
        url: (page.thumbnail && page.thumbnail.source) || null,
        title: page.title || null,
        bio: page.extract || '',
        source: 'Wikipédia (' + lang + ')'
      };
    }).catch(function () { return null; });
  }

  /** Gênero musical na Apple Music. */
  function itunesArtist(name) {
    var url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(name) +
      '&entity=musicArtist&limit=5&country=BR';
    return Net.getJson(url, { timeout: 8000, cacheTtl: 60 * 60 * 1000 }).then(function (data) {
      var results = data.results || [];
      if (!results.length) return null;
      var wanted = normalize(name);
      var match = results.find(function (r) { return normalize(r.artistName) === wanted; }) || results[0];
      return { genre: match.primaryGenreName || '', name: match.artistName, source: 'Apple Music' };
    }).catch(function () { return null; });
  }

  /** Arte do álbum como fallback de imagem. */
  function itunesArt(name) {
    var url = 'https://itunes.apple.com/search?term=' + encodeURIComponent(name) +
      '&entity=album&limit=8&country=BR';
    return Net.getJson(url, { timeout: 8000, cacheTtl: 60 * 60 * 1000 }).then(function (data) {
      var results = data.results || [];
      if (!results.length || !results[0].artworkUrl100) return null;
      var art = results[0].artworkUrl100.replace(/\/\d+x\d+bb(\.[a-z]+)$/i, '/600x600bb$1');
      return { url: art, title: results[0].artistName, source: 'Apple Music' };
    }).catch(function () { return null; });
  }

  /** Busca todos os dados: foto, gênero e biografia. */
  function search(name) {
    name = String(name || '').trim();
    if (!name) return Promise.resolve(null);
    return Promise.all([
      wikiInfo('pt', name).then(function (r) { return r || wikiInfo('en', name); }),
      itunesArtist(name)
    ]).then(function (res) {
      var wiki = res[0] || {};
      var artist = res[1] || {};
      function build(art) {
        return {
          queryName: name,
          url: wiki.url || (art && art.url) || null,
          title: wiki.title || artist.name || (art && art.title) || null,
          source: wiki.url ? wiki.source : (art ? art.source : (artist.name ? artist.source : null)),
          bio: wiki.bio || '',
          genre: artist.genre || ''
        };
      }
      if (wiki.url) return build(null);
      return itunesArt(name).then(build);
    });
  }

  function loadImage(url) {
    return Net.withTimeout(new Promise(function (resolve, reject) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('Não foi possível carregar a imagem')); };
      img.src = url;
    }), 8000, null).then(function (img) {
      if (!img) throw new Error('Tempo esgotado ao carregar a imagem');
      return img;
    });
  }

  /** Recorte central quadrado + compressão JPEG → data URL. */
  function toDataUrl(img) {
    var canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    var ctx = canvas.getContext('2d');
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    var side = Math.min(w, h);
    ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, SIZE, SIZE);
    return canvas.toDataURL('image/jpeg', QUALITY);
  }

  /** Busca, baixa e compacta. Retorna { url, dataUrl, title, source, bio, genre }. */
  function doFetchInfo(name) {
    return search(name).then(function (found) {
      if (!found) return null;
      if (!found.url) return found; // manteve gênero/biografia mesmo sem foto
      return loadImage(found.url).then(function (img) {
        var dataUrl = null;
        try { dataUrl = toDataUrl(img); } catch (e) { /* CORS: mantém só a URL */ }
        found.dataUrl = dataUrl;
        return found;
      }).catch(function () { return found; });
    });
  }

  /** Nunca deixa uma operação presa: no máximo 15 s de espera. */
  function fetchInfo(name) {
    return Net.withTimeout(doFetchInfo(name), 15000, null);
  }

  global.ArtistPhoto = {
    SIZE: SIZE,
    search: search,
    fetchInfo: fetchInfo,
    fetchPhoto: fetchInfo, // compatibilidade
    fromFile: function (file) {
      return new Promise(function (resolve, reject) {
        if (!file || !/^image\//.test(file.type)) {
          reject(new Error('Escolha um arquivo de imagem.'));
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          loadImage(reader.result).then(function (img) {
            resolve({
              dataUrl: toDataUrl(img),
              url: null,
              source: 'Enviada pelo usuário',
              queryName: null
            });
          }).catch(reject);
        };
        reader.onerror = function () { reject(new Error('Falha ao ler o arquivo.')); };
        reader.readAsDataURL(file);
      });
    }
  };
})(window);
