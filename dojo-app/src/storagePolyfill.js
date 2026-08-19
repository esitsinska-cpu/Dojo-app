/*
  Polyfill pour window.storage.
  App.jsx a été écrit dans un environnement d'aperçu (artefact) qui fournit
  window.storage.get/set/delete nativement, sauvegardé côté serveur.
  Sur un site déployé normalement (Netlify, etc.), cette API n'existe pas :
  ce fichier la recrée avec localStorage, pour que l'app fonctionne à
  l'identique, en local sur l'appareil de la personne (rien n'est envoyé
  à un serveur — cohérent avec ce que le journal d'incidents promet déjà).
*/

const PREFIX = "dojo:";

function readAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = localStorage.getItem(k);
  }
  return out;
}

window.storage = {
  async get(key /*, shared */) {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return { key, value: raw, shared: false };
  },

  async set(key, value /*, shared */) {
    localStorage.setItem(PREFIX + key, value);
    return { key, value, shared: false };
  },

  async delete(key /*, shared */) {
    const existed = localStorage.getItem(PREFIX + key) !== null;
    localStorage.removeItem(PREFIX + key);
    return { key, deleted: existed, shared: false };
  },

  async list(prefix = "" /*, shared */) {
    const all = readAll();
    const keys = Object.keys(all).filter((k) => k.startsWith(prefix));
    return { keys, prefix, shared: false };
  },
};
