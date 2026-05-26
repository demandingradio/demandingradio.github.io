/* Cricket Sim — localStorage persistence */

window.CricketCareers = (function () {

  const KEY = 'cricketSim:careers:v2';
  const MAX_CAREERS = 12;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr;
    } catch (e) {
      console.warn('cricketSim: failed to load careers', e);
      return [];
    }
  }

  function save(careers) {
    try {
      // Trim if oversized
      while (careers.length > MAX_CAREERS) careers.shift();
      localStorage.setItem(KEY, JSON.stringify(careers));
      return true;
    } catch (e) {
      console.warn('cricketSim: failed to save careers', e);
      // If quota exceeded, drop oldest and retry
      if (careers.length > 1) {
        careers.shift();
        try {
          localStorage.setItem(KEY, JSON.stringify(careers));
          return true;
        } catch (e2) {
          return false;
        }
      }
      return false;
    }
  }

  function add(career) {
    const careers = load();
    careers.push(career);
    if (!save(careers)) {
      // Storage full — drop oldest two
      careers.shift(); careers.shift();
      careers.push(career);
      save(careers);
    }
    return careers;
  }

  function remove(id) {
    let careers = load();
    careers = careers.filter(c => c.id !== id);
    save(careers);
    return careers;
  }

  function clearAll() {
    localStorage.removeItem(KEY);
  }

  function get(id) {
    return load().find(c => c.id === id);
  }

  return { load, save, add, remove, clearAll, get };
})();
