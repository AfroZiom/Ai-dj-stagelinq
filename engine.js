/* AI DJ ASSISTANT - silnik rankingowy (port scoring.py 1:1). Działa w przeglądarce i w Node (testy). */
(function (root) {
  const CAMELOT = {"1A":"Abm","1B":"B","2A":"Ebm","2B":"F#","3A":"Bbm","3B":"Db","4A":"Fm","4B":"Ab","5A":"Cm","5B":"Eb","6A":"Gm","6B":"Bb","7A":"Dm","7B":"F","8A":"Am","8B":"C","9A":"Em","9B":"G","10A":"Bm","10B":"D","11A":"F#m","11B":"A","12A":"Dbm","12B":"E"};
  const FLAT = {CB:"B",DB:"C#",EB:"D#",FB:"E",GB:"F#",AB:"G#",BB:"A#"};
  const SHARPS = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const MODE_TARGETS = {WARM_UP:[40,60],BUILDING:[55,72],MAIN:[65,82],PEAK_TIME:[84,97],AFTER_PEAK:[72,86],CLOSING:[55,72],CUSTOM:[0,100]};
  const NIGHT = [[18,40],[22,55],[23,65],[24,78],[25,90],[26,96],[27,88],[28,70],[30,50]];
  const DEFAULT_WEIGHTS = {music_compatibility:.25,energy_flow:.20,bpm:.15,harmonic:.10,danceability:.10,popularity:.10,crowd:.05,set_history:.05};
  const GENRE_SYN = {commercial:["commercial","pop","dance","top 40","hits"],polish:["polish","polskie","polski","disco polo"],"hip-hop":["hip-hop","hip hop","hiphop","rap","trap"]};
  const ERA = {"1980s":[1980,1989],"1990s":[1990,1999],"2000s":[2000,2009],"2010s":[2010,2019],"2020s":[2020,2035]};
  const PL = "ąćęłńóśźż";

  const num = (v, d) => { if (v === null || v === undefined || v === "") return d; const x = parseFloat(v); return isNaN(x) ? d : x; };
  const str = v => typeof v === "string" ? v.trim().toLowerCase() : "";
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function normalizeMode(m) { const k = String(m || "MAIN").trim().toUpperCase().replace(/[\s\-]+/g, "_"); return MODE_TARGETS[k] ? k : "MAIN"; }
  function parseNote(s) {
    s = s.toUpperCase().replace("♯", "#").replace("♭", "B");
    const m = s.match(/^([A-G])([#B])?$/); if (!m) return null;
    let n = m[1] + (m[2] || ""); if (n.length === 2 && n[1] === "B") n = FLAT[n] || n;
    const i = SHARPS.indexOf(n); return i < 0 ? null : i;
  }
  function normalizeKey(key) {
    if (!key || typeof key !== "string") return null;
    const k = key.trim(); let m = k.match(/^(\d{1,2})\s*([ABab])$/);
    if (m && +m[1] >= 1 && +m[1] <= 12) return (+m[1]) + m[2].toUpperCase();
    m = k.match(/^([A-Ga-g])([#b♯♭]?)\s*(.*)$/); if (!m) return null;
    const tonic = parseNote(m[1].toUpperCase() + m[2]); if (tonic === null) return null;
    const rest = m[3].trim().toLowerCase(); let minor;
    if (rest.startsWith("maj") || rest === "") minor = false; else if (rest.startsWith("m")) minor = true; else return null;
    for (const [code, name] of Object.entries(CAMELOT)) {
      const cm = name.endsWith("m");
      if (parseNote(cm ? name.slice(0, -1) : name) === tonic && cm === minor) return code;
    }
    return null;
  }
  function camelotDistance(a, b) {
    if (!a || !b) return null;
    const na = parseInt(a), nb = parseInt(b), la = a.slice(-1), lb = b.slice(-1);
    const nd = Math.min(Math.abs(na - nb), 12 - Math.abs(na - nb));
    return la === lb ? nd : (nd === 0 ? 0.5 : nd + 0.5);
  }
  function harmonic(k1, k2) {
    const d = camelotDistance(k1, k2); if (d === null) return 50;
    const t = {0:100,0.5:80,1:90,1.5:60,2:60,2.5:45,3:45}; return t[d] !== undefined ? t[d] : 25;
  }
  function foldBpm(b, ref) { const r = b / ref; if (r >= .46 && r <= .54) return b * 2; if (r >= 1.96 && r <= 2.04) return b / 2; return b; }
  function bpmCompat(tb, cb) {
    if (!tb || !cb) return 50; const d = Math.abs(foldBpm(tb, cb) - cb);
    if (d <= 1) return 100; if (d >= 12) return 10; return 100 - (d / 12) * 90;
  }
  const energyFlow = (te, tg) => (tg == null || te == null) ? 50 : Math.max(0, 100 - Math.abs(te - tg) * 6);
  function nightCurve(hour) {
    let h = +hour; if (h < 12) h += 24;
    if (h <= NIGHT[0][0]) return NIGHT[0][1]; if (h >= NIGHT[NIGHT.length - 1][0]) return NIGHT[NIGHT.length - 1][1];
    for (let i = 0; i < NIGHT.length - 1; i++) { const [x0, y0] = NIGHT[i], [x1, y1] = NIGHT[i + 1]; if (h >= x0 && h <= x1) return y0 + (y1 - y0) * (h - x0) / (x1 - x0); }
    return 60;
  }
  function energyTarget(mode, hour, recent, crowdE, delta, curE) {
    const key = normalizeMode(mode), [lo, hi] = MODE_TARGETS[key]; let t;
    if (key === "CUSTOM") t = (hour != null) ? nightCurve(hour) : num(curE, 60);
    else { t = (lo + hi) / 2; if (hour != null) t = .7 * t + .3 * nightCurve(hour); }
    if (recent && recent.length) t = .75 * t + .25 * recent[recent.length - 1];
    if (crowdE != null) t = .85 * t + .15 * crowdE;
    if (delta) { const base = curE != null ? curE : (recent && recent.length ? recent[recent.length - 1] : t); t = base + delta; }
    return clamp(t, 5, 100);
  }
  const STOP = new Set(["polish", "the", "music"]);
  const normGenre = g => str(g).replace("hip hop", "hip-hop").replace("hiphop", "hip-hop");
  function genreMatch(a, b) {
    if (!a || !b) return 50;
    const A = new Set(normGenre(a).split(/\s+/)), B = new Set(normGenre(b).split(/\s+/));
    for (const x of A) if (!STOP.has(x) && B.has(x)) return 100;
    const fam = [["house","deep","tech","techhouse","progressive","afro"],["edm","bigroom","electro","festival","trance","hardstyle"],["hip-hop","rap","trap","rnb","r&b"],["pop","dance","commercial","dancepop","club"],["reggaeton","latin","moombahton","salsa","afrobeat"],["rock","indie","alternative","punk"]];
    for (const f of fam) if (f.some(x => A.has(x)) && f.some(x => B.has(x))) return 78;
    if (A.has("polish") && B.has("polish")) return 65;
    return 35;
  }
  function musicCompat(t, c) {
    c = c || {}; let s = .6 * genreMatch(t.genre, c.genre) + .4 * harmonic(normalizeKey(t.key), normalizeKey(c.key));
    const y = parseInt(t.year) || 0, cy = parseInt(c.year) || 0;
    if (y && cy) { if (Math.abs(y - cy) <= 8) s += 6; else if (Math.abs(y - cy) >= 15) s -= 4; }
    return clamp(s, 0, 100);
  }
  function crowdScore(t, cr) {
    if (!cr) return 50; let s = 50; const genre = str(t.genre), tags = genre.split(/\s+/).concat((t.tags || []).map(str));
    const music = (cr.music_preferences || []).map(str);
    if (music.length && !(music.length === 1 && music[0] === "mixed")) {
      let hit = 0;
      for (const m of music) {
        if (tags.includes(m)) hit = Math.max(hit, 30);
        else if (genre.includes(m)) hit = Math.max(hit, 20);
        else if (ERA[m]) { const y = parseInt(t.year); if (y >= ERA[m][0] && y <= ERA[m][1]) hit = Math.max(hit, 15); }
      }
      s += hit;
    }
    const ages = (cr.age_groups || []).map(a => String(a).replace(/[–—]/g, "-").replace(/\s/g, "")), y = parseInt(t.year);
    if (y) { if (ages.includes("18-24") && y >= 2015) s += 8; if (ages.includes("25-34") && y >= 2005) s += 8; if (ages.includes("35-44") && y >= 1995 && y <= 2015) s += 8; if (ages.includes("45+") && y <= 2010) s += 8; }
    const pop = num(t.popularity, 50), ev = str(cr.event_type);
    if (ev === "wedding" && pop >= 75) s += 10;
    if (ev === "club" && ["house","tech","edm","dance","club"].some(x => genre.includes(x))) s += 10;
    if (ev === "student party" && pop >= 65) s += 8;
    if (["Large","Very Large"].includes(cr.crowd_size) && pop >= 70) s += 6;
    return clamp(s, 0, 100);
  }
  function historyScore(t, hist, played) {
    if (t.id != null && played && played.has(t.id)) return 0;
    let s = 100; hist = hist || []; const artists = hist.map(h => str(h.artist)), ta = str(t.artist);
    if (ta && artists.length) { if (artists.includes(ta)) s -= 45; if (artists[artists.length - 1] === ta) s -= 25; }
    const genres = hist.slice(-4).map(h => str(h.genre)), tg = str(t.genre);
    if (genres.length >= 3 && tg && !genres.includes(tg)) s -= 12;
    return Math.max(0, s);
  }
  function djMult(t, p) {
    if (!p) return 1; let m = 1; const tg = str(t.genre), ta = str(t.artist);
    for (const [g, v] of Object.entries(p.genre_affinity || {})) if (g && tg.includes(g.toLowerCase())) m += v * .10;
    for (const [a, v] of Object.entries(p.artist_affinity || {})) if (a && ta.includes(a.toLowerCase())) m += v * .15;
    if (p.bpm_center && t.bpm) m -= Math.min(.10, Math.abs(t.bpm - p.bpm_center) / 400);
    return clamp(m, .5, 1.35);
  }
  const GP = {"hip-hop":/hip[- ]?hop|\brap(?![a-ząćęłńóśźż])|\btrap/,"tech house":/tech[ -]?house/,house:/\bhouse/,edm:/\bedm/,dance:/\bdance/,pop:/\bpop(?![a-ząćęłńóśźż])/,reggaeton:/reggaeton|latin/,rock:/\brock/,trance:/\btrance/,"disco polo":/disco polo/,polish:/polsk|polish/,commercial:/commercial|komercyjn/};
  function detectGenres(t, allowCom) {
    const out = []; for (const [g, re] of Object.entries(GP)) { if (g === "commercial" && !allowCom) continue; if (re.test(t)) out.push(g); }
    if (out.includes("tech house") && out.includes("house")) out.splice(out.indexOf("house"), 1); return out;
  }
  function parseCommand(text) {
    const t = (text || "").toLowerCase();
    const m = {energy_delta:0,bpm_lock:false,widen_bpm:false,genres:[],exclude_genres:[],era:null,commercial:0,surprise:false,emergency:false,peak:false};
    if (/parkiet (umiera|zdycha)|emergency|dance ?floor (is )?dying/.test(t)) { m.emergency = true; m.energy_delta = 15; }
    else if (/siada|sit(s|ting)? down/.test(t)) { m.commercial = 2; m.energy_delta = 10; }
    if (/(?<!after )(?<!po )peak/.test(t)) { m.peak = true; m.energy_delta = 18; }
    const down = /(zejd[zźs]|obni[zż]|zmniejsz|spu[sś][cć]|lower|reduce|drop|mniej).{0,25}energ/.test(t);
    const up = /(zwi[eę]ksz|podnie[sś]|podbij|raise|increase|more|wi[eę]cej).{0,25}energ/.test(t);
    const nm = t.match(/energ\w*\W{0,12}(?:o\s*)?(\d{1,3})/) || t.match(/\bo\s*(\d{1,3})\s*%?\s*(?:w\s*)?energ/);
    if (down) m.energy_delta = -(nm ? +nm[1] : 12); else if (up) m.energy_delta = nm ? +nm[1] : Math.max(12, m.energy_delta);
    if (/nie zmieniaj bpm|keep bpm|zosta[nń] przy bpm|utrzymaj bpm|keep tempo|to samo bpm/.test(t)) m.bpm_lock = true;
    else if (/zmie[nń] bpm|change bpm|inny bpm|przyspiesz|zwolnij/.test(t)) m.widen_bpm = true;
    const ft = t.match(new RegExp("(?:^|\\s)z\\s+([\\w" + PL + "\\- ]+?)\\s+(?:do|na)\\s+([\\w" + PL + "\\- ]+)"));
    if (ft) { m.exclude_genres = detectGenres(ft[1], true); m.genres = detectGenres(ft[2], true); } else m.genres = detectGenres(t, false);
    if (/zmie[nń] gatunek|change genre|inny gatunek/.test(t)) m.exclude_genres.push("__CURRENT__");
    const em = t.match(/\b(19[89]0|20[012]0)s?\b/); if (em) m.era = em[1] + "s";
    if (/surprise|zaskocz|co[sś] innego|nieoczywist/.test(t)) m.surprise = true;
    if (/wszyscy zna|everyone knows|rozpoznawaln|klasyk|classic/.test(t)) m.commercial = 2;
    if (/bardziej komercyjn|more commercial|not commercial enough|za ma[lł]o komercyjn/.test(t)) m.commercial = 1;
    else if (/mniej komercyjn|less commercial|too commercial|za komercyjn/.test(t)) m.commercial = -1;
    return m;
  }
  const genreHit = (tg, g) => (GENRE_SYN[g.toLowerCase()] || [g.toLowerCase()]).some(a => tg.includes(a));
  function hardFilter(t, cur, played, black, o) {
    o = o || {};
    if (t.id != null && played && played.has(t.id)) return false;
    if (black && black.has(str(t.artist))) return false;
    const tg = str(t.genre);
    if (o.genres && o.genres.length && !o.genres.some(g => genreHit(tg, g))) return false;
    for (const g of o.exclude_genres || []) {
      if (g === "__CURRENT__") { const cg = str((cur || {}).genre).split(/\s+/)[0]; if (cg && tg.includes(cg)) return false; }
      else if (genreHit(tg, g)) return false;
    }
    if (o.era) { const [lo, hi] = ERA[o.era] || [1900, 2100], y = parseInt(t.year); if (!y || y < lo || y > hi) return false; }
    const ref = (cur || {}).bpm;
    if (t.bpm && ref) { const b = foldBpm(t.bpm, ref), allowed = o.bpm_lock ? 1.5 : (o.widen_bpm ? 20 : (o.max_bpm_diff == null ? 8 : o.max_bpm_diff)); if (Math.abs(b - ref) > allowed) return false; }
    return true;
  }
  function filterCandidates(tracks, cur, ctx, minNeeded) {
    minNeeded = minNeeded || 8; const mods = ctx.mods || {}, played = new Set(ctx.played_ids || []);
    if (cur && cur.id != null) played.add(cur.id);
    const black = ctx.blacklist || new Set(), md = ctx.max_bpm_diff == null ? 8 : ctx.max_bpm_diff;
    const base = {max_bpm_diff: md, bpm_lock: !!mods.bpm_lock, widen_bpm: !!mods.widen_bpm}, ex = mods.exclude_genres;
    const levels = [Object.assign({}, base, {genres: mods.genres, era: mods.era, exclude_genres: ex}), Object.assign({}, base, {exclude_genres: ex}),
      Object.assign({}, base, {max_bpm_diff: Math.max(md, 14), bpm_lock: false, exclude_genres: ex}), Object.assign({}, base, {max_bpm_diff: 1000, bpm_lock: false})];
    let best = [], lvl = 0;
    for (let i = 0; i < levels.length; i++) { best = tracks.filter(t => hardFilter(t, cur, played, black, levels[i])); lvl = i; if (best.length >= minNeeded) break; }
    return [best, lvl];
  }
  function scoreTrack(t, cur, ctx) {
    const mods = ctx.mods || {}, w = ctx.weights || DEFAULT_WEIGHTS; cur = cur || {}; let target;
    if (ctx.target_override != null) target = ctx.target_override;
    else {
      target = energyTarget(ctx.mode, ctx.hour, ctx.recent_energies, (ctx.crowd || {}).crowd_energy, mods.energy_delta || 0, cur.energy);
      if (mods.emergency) target = 88; else if (mods.peak) target = 92;
    }
    const p = {music_compatibility: musicCompat(t, cur), energy_flow: energyFlow(t.energy, target), bpm: bpmCompat(t.bpm, cur.bpm),
      harmonic: harmonic(normalizeKey(t.key), normalizeKey(cur.key)), danceability: num(t.danceability, 50), popularity: num(t.popularity, 50),
      crowd: crowdScore(t, ctx.crowd), set_history: historyScore(t, ctx.history, new Set(ctx.played_ids || []))};
    const com = mods.commercial || 0; if (com) p.popularity = clamp(p.popularity + ({1:20,"-1":-25,2:35})[com], 0, 100);
    if (mods.emergency) { p.popularity = Math.min(100, p.popularity + 30); p.danceability = Math.min(100, p.danceability + 25); }
    let wsum = 0, tot = 0; for (const k in p) { const x = w[k] || 0; wsum += x; tot += p[k] * x; } tot /= Math.max(1e-9, wsum);
    tot *= djMult(t, ctx.dj_profile);
    const d = mods.energy_delta || 0;
    if (d && t.energy != null && cur.energy != null) { const mv = t.energy - cur.energy; if (d > 0 && mv < 0) tot *= Math.max(.55, 1 + mv / 40); else if (d < 0 && mv > 0) tot *= Math.max(.55, 1 - mv / 40); }
    if (mods.surprise) tot *= 1 - .004 * Math.max(0, p.popularity - 60);
    return [Math.round(clamp(tot, 0, 100) * 10) / 10, p, target];
  }
  function reason(t, cur, p, target, mods) {
    const bits = [];
    if (p.harmonic >= 80) bits.push("pasuje harmonicznie"); else if (p.harmonic >= 55) bits.push("w miarę zgodna tonacja");
    if (t.bpm && cur && cur.bpm) { const d = foldBpm(t.bpm, cur.bpm) - cur.bpm; if (Math.abs(d) <= 1) bits.push("utrzymuje BPM (" + Math.round(t.bpm) + ")"); else if (d > 0) bits.push("podnosi BPM o +" + Math.round(d)); else bits.push("obniża BPM o " + Math.round(d)); }
    if (t.energy != null && target != null) { const d = t.energy - target; if (Math.abs(d) <= 4) bits.push("idealna energia dla tej fazy seta (cel " + Math.round(target) + ")"); else if (d > 0) bits.push("zwiększa energię parkietu (+" + Math.round(d) + ")"); else bits.push("łagodnie schodzi z energii (" + Math.round(d) + ")"); }
    if (mods.emergency) bits.push("bardzo rozpoznawalny - ratunek dla parkietu");
    if (mods.commercial === 2) bits.push("klasyk, który wszyscy znają");
    if (!bits.length) bits.push("dobrze pasuje do aktualnego kontekstu");
    const s = bits.join(", ") + "."; return s[0].toUpperCase() + s.slice(1);
  }
  function decorate(t, s, p, cur, target, mods) {
    cur = cur || {};
    return Object.assign({}, t, {_score: s, _parts: p, _target: target, _energy_change: num(t.energy, 0) - num(cur.energy, 0),
      _bpm_change: (t.bpm && cur.bpm) ? Math.round((t.bpm - cur.bpm) * 10) / 10 : 0, _reason: reason(t, cur, p, target, mods)});
  }
  function recommend(tracks, cur, ctx, n, maxPer) {
    n = n || 5; maxPer = maxPer || 2; const mods = ctx.mods || {}, [c, lvl] = filterCandidates(tracks, cur, ctx);
    const sc = c.map(t => { const [s, p, tg] = scoreTrack(t, cur, ctx); return decorate(t, s, p, cur, tg, mods); }).sort((a, b) => b._score - a._score);
    const out = [], per = {}; for (const t of sc) { const a = str(t.artist); if ((per[a] || 0) >= maxPer) continue; per[a] = (per[a] || 0) + 1; out.push(t); if (out.length >= n) break; }
    return [out, lvl, sc];
  }
  function planNext5(tracks, cur, ctx, n) {
    n = n || 5; const mods = ctx.mods || {}; cur = cur || {}; const start = num(cur.energy, 75);
    let goal = energyTarget(ctx.mode, ctx.hour, null, (ctx.crowd || {}).crowd_energy, mods.energy_delta || 0, start);
    if (mods.peak || normalizeMode(ctx.mode) === "PEAK_TIME") goal = Math.max(goal, 92);
    goal = clamp(goal, start - 15, start + 15);
    const played = new Set(ctx.played_ids || []), seq = []; let prev = cur;
    for (let i = 0; i < n; i++) {
      const step = start + (goal - start) * (i + 1) / n;
      const c2 = Object.assign({}, ctx, {played_ids: [...played, ...seq.map(x => x.id)], target_override: step, recent_energies: null});
      const [cands] = filterCandidates(tracks, prev, c2, 3); let best = null;
      for (const t of cands) { const [s, p, tg] = scoreTrack(t, prev, c2); if (!best || s > best[0]) best = [s, p, tg, t]; }
      if (!best) break; seq.push(decorate(best[3], best[0], best[1], prev, best[2], mods)); prev = best[3];
    }
    return seq;
  }
  function detectIssues(h) {
    const out = []; if (h.length < 2) return out; const artists = h.map(x => str(x.artist)), cnt = {};
    artists.forEach(a => { if (a) cnt[a] = (cnt[a] || 0) + 1; }); for (const a in cnt) if (cnt[a] >= 3) out.push("Artysta " + a + " zagrany " + cnt[a] + "x tej nocy");
    if (artists[artists.length - 1] && artists[artists.length - 1] === artists[artists.length - 2]) out.push("Ten sam artysta dwa razy pod rząd");
    for (let i = 1; i < h.length; i++) {
      const b0 = h[i-1].bpm, b1 = h[i].bpm; if (b0 && b1 && Math.abs(b1 - b0) > 10) out.push("Skok BPM " + Math.round(b0) + "→" + Math.round(b1) + " (pozycja " + (i+1) + ")");
      const e0 = h[i-1].energy, e1 = h[i].energy; if (e0 != null && e1 != null && e0 - e1 > 15) out.push("Spadek energii " + Math.round(e0) + "→" + Math.round(e1) + " (pozycja " + (i+1) + ")");
    }
    let last = null, sw = 0; h.slice(-6).forEach(x => { const g = str(x.genre).split(/\s+/)[0] || null; if (g && last && g !== last) sw++; if (g) last = g; });
    if (sw >= 4) out.push("Bardzo częste zmiany gatunku w ostatnich utworach"); return out;
  }
  const api = {CAMELOT, MODE_TARGETS, DEFAULT_WEIGHTS, normalizeMode, normalizeKey, nightCurve, energyTarget, parseCommand, recommend, planNext5, scoreTrack, filterCandidates, detectIssues, foldBpm, harmonic, genreMatch};
  if (typeof module !== "undefined") module.exports = api; else root.Engine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
