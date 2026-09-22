/* ============================================================
   ÁUDIO DO MUNDO ABERTO X (v10.3) — 100% procedural
   Trilha sonora, ambientes, efeitos e vozes gerados no browser
   (Web Audio API + SpeechSynthesis). Zero ficheiros binários.
   O engine.js continua livre de DOM — este módulo é só para a UI.
   ============================================================ */

const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
const SPEECH = (typeof window !== 'undefined') && window.speechSynthesis;

// Régua Fibonacci local (o módulo é autónomo do engine)
function fib(n) { let a = 0, b = 1; for (let i = 0; i < n; i++) { const t = a + b; a = b; b = t; } return a || 1; }

const estado = {
  ctx: null, master: null, busMusica: null, busAmb: null, busSfx: null,
  trilhaLigada: true, somLigado: true, vozLigada: true, iniciado: false,
  acordeIdx: 0, tema: 'jogo', timerTrilha: null, cfg: null,
  nosAmb: [], // nós da ambiência contínua (mar/vento)
};

/* ---------- infraestrutura ---------- */

function garantir() {
  if (!AC) return null;
  if (estado.ctx) return estado.ctx;
  const ctx = new AC();
  estado.ctx = ctx;
  estado.master = ctx.createGain(); estado.master.gain.value = 0.9; estado.master.connect(ctx.destination);
  estado.busMusica = ctx.createGain(); estado.busMusica.gain.value = 0.28; estado.busMusica.connect(estado.master);
  estado.busAmb = ctx.createGain(); estado.busAmb.gain.value = 0.4; estado.busAmb.connect(estado.master);
  estado.busSfx = ctx.createGain(); estado.busSfx.gain.value = 0.55; estado.busSfx.connect(estado.master);
  return ctx;
}

// Ruído branco reutilizável (mar, vento, salpicos)
function bufferRuido(ctx, segundos = 2) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * segundos, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/* ---------- trilha sonora (acordes + arpejo) ---------- */

function acorde(freqs, dur) {
  const ctx = garantir(); if (!ctx || !estado.trilhaLigada) return;
  const t = ctx.currentTime;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass'; filtro.frequency.value = 1400; filtro.Q.value = 0.4;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.9, t + 1.2);          // ataque lento
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);       // liberação longa
  filtro.connect(env); env.connect(estado.busMusica);
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = i === 0 ? 'sine' : 'triangle';
    o.frequency.value = f / (i === 0 ? 1 : 2);                  // baixa + harmonias
    o.detune.value = (i - 1) * 4;                               // largura estéreo leve
    o.connect(filtro); o.start(t); o.stop(t + dur + 0.1);
  });
  // arpejo cristalino por cima do acorde
  freqs.forEach((f, i) => pluck(f * 2, t + 0.9 + i * 0.35));
}

function pluck(freq, t0) {
  const ctx = estado.ctx; if (!ctx) return;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
  o.connect(g); g.connect(estado.busMusica);
  o.start(t0); o.stop(t0 + 1);
}

function agendarTrilha() {
  if (estado.timerTrilha) clearInterval(estado.timerTrilha);
  const cfgT = (estado.cfg && estado.cfg.trilha) || {};
  const dur = cfgT.segundosPorAcordo || 4;
  const mapa = cfgT.acordesPorTema || {};
  estado.timerTrilha = setInterval(() => {
    if (!estado.somLigado || !estado.trilhaLigada) return;
    const acordes = mapa[estado.tema] || mapa.jogo || [220, 261.63, 329.63];
    acorde(acordes, dur + 1.5);
    estado.acordeIdx++;
  }, dur * 1000);
}

function setTema(tema) {
  if (estado.tema === tema) return;
  estado.tema = tema;
  // transição: acorde imediato do novo tema
  if (estado.somLigado && estado.trilhaLigada && estado.iniciado) {
    const mapa = ((estado.cfg || {}).trilha || {}).acordesPorTema || {};
    acorde(mapa[tema] || mapa.jogo || [220, 261.63, 329.63], 5);
  }
}

/* ---------- ambiência contínua (mar + vento) ---------- */

function ligarAmbiencia() {
  const ctx = garantir(); if (!ctx || estado.nosAmb.length) return;
  const ruido = bufferRuido(ctx, 3);
  // mar: ruído grave com ondas lentas de volume
  const mar = ctx.createBufferSource(); mar.buffer = ruido; mar.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
  const gMar = ctx.createGain(); gMar.gain.value = 0.16;
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.14;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.07;
  lfo.connect(lfoG); lfoG.connect(gMar.gain);
  mar.connect(lp); lp.connect(gMar); gMar.connect(estado.busAmb);
  mar.start(); lfo.start();
  // vento: ruído médio uivante
  const vento = ctx.createBufferSource(); vento.buffer = ruido; vento.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 2.2;
  const gVento = ctx.createGain(); gVento.gain.value = 0.045;
  const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07;
  const lfo2G = ctx.createGain(); lfo2G.gain.value = 260;
  lfo2.connect(lfo2G); lfo2G.connect(bp.frequency);
  vento.connect(bp); bp.connect(gVento); gVento.connect(estado.busAmb);
  vento.start(); lfo2.start();
  estado.nosAmb = [mar, lfo, vento, lfo2];
}

function desligarAmbiencia() {
  estado.nosAmb.forEach(n => { try { n.stop(); } catch (e) {} });
  estado.nosAmb = [];
}

/* ---------- ambiência por tick (gaivotas, pássaros, guincho) ---------- */

function gaivota() {
  const ctx = garantir(); if (!ctx || !estado.somLigado) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(1250, t);
  o.frequency.exponentialRampToValueAtTime(620, t + 0.28);
  const v = ctx.createOscillator(); v.frequency.value = 26;
  const vG = ctx.createGain(); vG.gain.value = 90; v.connect(vG); vG.connect(o.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
  o.connect(lp); lp.connect(g); g.connect(estado.busAmb);
  o.start(t); o.stop(t + 0.35); v.start(t); v.stop(t + 0.35);
}

function passaro() {
  const ctx = garantir(); if (!ctx || !estado.somLigado) return;
  const t0 = ctx.currentTime;
  const n = 2 + Math.floor(Math.random() * 2);
  for (let i = 0; i < n; i++) {
    const t = t0 + i * 0.16;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(2300 + Math.random() * 500, t);
    o.frequency.exponentialRampToValueAtTime(3300, t + 0.05);
    o.frequency.exponentialRampToValueAtTime(2500, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.04, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g); g.connect(estado.busAmb);
    o.start(t); o.stop(t + 0.15);
  }
}

// chamado a cada tick do jogo; o módulo decide o que toca pela régua fib
function tick(mundo, extra) {
  if (!estado.iniciado || !estado.somLigado) return;
  const t = (mundo && mundo.tickCount) || 0;
  const amb = (estado.cfg && estado.cfg.ambientes) || {};
  if (amb.passaro && t % (amb.passaro.tickFib || fib(8)) === 0 && Math.random() < 0.6) passaro();
  if (amb.marOndas && t % (amb.marOndas.tickFib || fib(9)) === 0 && (mundo.barcos || []).length) gaivota();
  if (extra && extra.gauntlet) sfx('gauntlet');
  if (extra && extra.ferri) sfx('ondas');
}

/* ---------- efeitos sonoros ---------- */

function sfx(nome) {
  const ctx = garantir(); if (!ctx || !estado.somLigado) return;
  const t = ctx.currentTime;
  const vol = ((estado.cfg || {}).sfx || {}).volume != null ? estado.cfg.sfx.volume : 0.5;
  const tom = (tipo, f0, f1, dur, v, delay = 0) => {
    const o = ctx.createOscillator(); o.type = tipo;
    o.frequency.setValueAtTime(f0, t + delay);
    if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + delay + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.exponentialRampToValueAtTime(v * vol, t + delay + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
    o.connect(g); g.connect(estado.busSfx);
    o.start(t + delay); o.stop(t + delay + dur + 0.05);
  };
  const salpico = (dur, v, f = 900) => {
    const src = ctx.createBufferSource(); src.buffer = bufferRuido(ctx, 0.5);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(estado.busSfx);
    src.start(t); src.stop(t + dur);
  };
  switch (nome) {
    case 'clique': tom('square', 780, 640, 0.06, 0.10); break;
    case 'moeda': tom('sine', 1318, null, 0.09, 0.16); tom('sine', 1760, null, 0.12, 0.14, 0.07); break;
    case 'sucesso': tom('triangle', 523, null, 0.12, 0.16); tom('triangle', 659, null, 0.12, 0.15, 0.09); tom('triangle', 784, null, 0.2, 0.16, 0.18); break;
    case 'erro': tom('square', 200, 150, 0.16, 0.12); tom('square', 160, 120, 0.2, 0.12, 0.14); break;
    case 'chat': tom('sine', 940, 1180, 0.08, 0.09); break;
    case 'construir': tom('sine', 140, 90, 0.22, 0.2); tom('triangle', 880, null, 0.15, 0.1, 0.18); break;
    case 'gauntlet': tom('sawtooth', 110, 55, 0.9, 0.16); salpico(0.7, 0.10, 300); break;
    case 'ondas': salpico(0.45, 0.12); break;
    case 'pesca': salpico(0.3, 0.1, 1200); tom('sine', 660, 990, 0.14, 0.1, 0.18); break;
    case 'curar': tom('sine', 660, 990, 0.2, 0.1); tom('sine', 990, 1320, 0.2, 0.08, 0.12); break;
    default: tom('square', 700, 700, 0.05, 0.08);
  }
}

/* ---------- vozes (SpeechSynthesis, PT/EN) ---------- */

let vozCache = null;
function escolherVoz(idioma) {
  if (!SPEECH) return null;
  if (!vozCache) vozCache = SPEECH.getVoices() || [];
  const alvo = (idioma || 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt';
  const v = vozCache.find(v => v.lang.toLowerCase().startsWith(alvo))
    || vozCache.find(v => v.lang.toLowerCase().startsWith(alvo.split('-')[0]));
  return v || null;
}

function limparEmoji(txt) {
  return String(txt || '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').trim();
}

function voz(texto, idioma) {
  if (!SPEECH || !estado.vozLigada || !estado.somLigado) return;
  const frase = limparEmoji(texto);
  if (!frase || frase.length > 220) return; // só falas curtas
  try {
    const u = new SpeechSynthesisUtterance(frase);
    const v = escolherVoz(idioma);
    if (v) u.voice = v;
    u.lang = v ? v.lang : ((idioma || 'pt').startsWith('en') ? 'en-US' : 'pt-PT');
    const cfgV = (estado.cfg && estado.cfg.voz) || {};
    u.rate = cfgV.rate || 0.95; u.pitch = cfgV.pitch || 1; u.volume = 0.85;
    SPEECH.cancel(); // uma fala de cada vez — o mundo não sobrepõe vozes
    SPEECH.speak(u);
  } catch (e) { /* sem voz disponível: silêncio elegante */ }
}

/* ---------- controlo geral ---------- */

function iniciar(cfgAudio) {
  estado.cfg = cfgAudio || estado.cfg || {};
  const cfgVoz = estado.cfg.voz || {};
  estado.vozLigada = cfgVoz.comentar !== false;
  if (!AC) return false; // browser sem Web Audio: o jogo continua em silêncio
  const ctx = garantir();
  if (ctx.state === 'suspended') ctx.resume();
  if (estado.iniciado) return true;
  estado.iniciado = true;
  ligarAmbiencia();
  agendarTrilha();
  if (SPEECH) SPEECH.onvoiceschanged = () => { vozCache = null; };
  return true;
}

function setTrilha(ligado) { estado.trilhaLigada = !!ligado; if (ligado && estado.iniciado) agendarTrilha(); else if (estado.timerTrilha) clearInterval(estado.timerTrilha); return estado.trilhaLigada; }
function setSom(ligado) { estado.somLigado = !!ligado; if (estado.iniciado) ligado ? ligarAmbiencia() : desligarAmbiencia(); if (estado.master) estado.master.gain.value = ligado ? 0.9 : 0; return estado.somLigado; }
function setVoz(ligado) { estado.vozLigada = !!ligado; if (!ligado && SPEECH) { try { SPEECH.cancel(); } catch (e) {} } return estado.vozLigada; }

const audio = {
  iniciar, setTema, tick, sfx, voz,
  setTrilha, setSom, setVoz,
  get iniciado() { return estado.iniciado; },
  get disponivel() { return !!AC; },
};
export default audio;
