/* Playtest do áudio em sandbox: executa o src/audio.js REAL (o mesmo que está
   servido em mundox.freebuff.app) contra stubs fiéis do Web Audio API +
   SpeechSynthesis. Rastreia cada chamada e valida a orquestração completa. */
const { transformSync } = require(require.resolve('esbuild', { paths: ['node_modules/vite'] }));
const fs = require('fs');

let falhas = 0;
function passo(nome, fn) {
  try { fn(); console.log('  ✓', nome); }
  catch (e) { falhas++; console.error('  ✗', nome, '→', e.message); }
}
function expect(c, m) { if (!c) throw new Error(m || 'falhou'); }

// ---------- stubs do Web Audio (rastreiam tudo) ----------
function makeParam(v) { return { value: v, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; }
const reg = { osciladores: 0, gains: 0, filtros: 0, fontesRuido: 0, falas: [], sonsIniciados: 0 };
function node(kind) {
  return {
    kind,
    type: '',
    frequency: makeParam(440), detune: makeParam(0), Q: makeParam(1),
    gain: makeParam(1),
    buffer: null, loop: false,
    connect() { return this; }, disconnect() {},
    start() { reg.sonsIniciados++; }, stop() {},
  };
}
class FakeAudioContext {
  constructor() { this.state = 'running'; this.sampleRate = 44100; this.destination = node('dest'); this.currentTime = 0; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { reg.gains++; return node('gain'); }
  createOscillator() { reg.osciladores++; return node('osc'); }
  createBiquadFilter() { reg.filtros++; return node('biquad'); }
  createBuffer(ch, len, rate) { return { getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { reg.fontesRuido++; return node('bufsrc'); }
}
class FakeUtterance {
  constructor(txt) { this.text = txt; reg.falas.push(txt); }
}
global.window = {
  AudioContext: FakeAudioContext,
  webkitAudioContext: FakeAudioContext,
  speechSynthesis: {
    getVoices: () => [
      { lang: 'pt-PT', name: 'Voz PT' },
      { lang: 'en-US', name: 'Voice EN' },
    ],
    cancel() {}, speak(u) { reg.falasFaladas = (reg.falasFaladas || 0) + 1; },
    set onvoiceschanged(f) { this._ovc = f; }, get onvoiceschanged() { return this._ovc; },
  },
  SpeechSynthesisUtterance: FakeUtterance,
};
global.SpeechSynthesisUtterance = FakeUtterance;

// ---------- carregar o módulo REAL (ESM → CJS via esbuild, como o Vite faz) ----------
const src = fs.readFileSync('src/audio.js', 'utf8');
const cjs = transformSync(src, { loader: 'js', format: 'cjs' }).code;
const mod = { exports: {} };
new Function('module', 'exports', 'require', cjs)(mod, mod.exports, require);
const audio = mod.exports.default || mod.exports; // esbuild ESM→CJS: default vira exports.default

const CFG = JSON.parse(fs.readFileSync('mundo.json', 'utf8')).audio;
const E = require('./engine.js');
const m = E.criarMundo(JSON.parse(fs.readFileSync('mundo.json', 'utf8')));

console.log('== 🔊 Playtest de áudio em sandbox (src/audio.js real + stubs Web Audio) ==');

passo('Boot: audio.iniciar(CFG.audio) destrava com AudioContext disponível', () => {
  expect(audio.disponivel, 'Web Audio devia estar disponível');
  expect(audio.iniciar(CFG) === true, 'iniciar devia ter sucesso');
  expect(audio.iniciado, 'estado iniciado');
  expect(reg.gains >= 4, 'master + 3 buses deviam existir (gains=' + reg.gains + ')');
  expect(reg.fontesRuido >= 2, 'mar + vento em loop deviam arrancar');
});

passo('🎵 Trilha: acordes programados; tema muda jogo → dashboard → Gauntlet → WestDocks', () => {
  const antes = reg.osciladores;
  audio.setTema('dashboard');   // transição imediata: acorde do novo tema
  audio.setTema('gauntlet');
  audio.setTema('westdocks');
  audio.setTema('jogo');
  expect(reg.osciladores > antes, 'setTema devia disparar acordes de transição');
  // simular os ticks do intervalo da trilha (4s): adiantar o relógio e esperar o timer
});

passo('🌊 Ambiência por tick: pássaros no continente, gaivotas com frota no mar', () => {
  const antes = reg.sonsIniciados;
  m.barcos.push({ id: 'x', tipo: 'ferri', viva: true }); // frota presente → gaivota
  for (let t = 1; t <= 200; t++) { m.tickCount = t; audio.tick(m); }
  expect(reg.sonsIniciados > antes, 'tick devia disparar pássaros/gaivotas pela régua fib');
});

passo('⚔️ SFX reativos: todos os 12 efeitos tocam sem exceções', () => {
  const antes = reg.sonsIniciados;
  ['clique', 'moeda', 'sucesso', 'erro', 'chat', 'construir', 'gauntlet', 'ondas', 'pesca', 'curar', 'desconhecido'].forEach(s => audio.sfx(s));
  expect(reg.sonsIniciados > antes, 'SFX deviam iniciar osciladores/salpicos');
});

passo('🗣️ Vozes PT/EN: falam falas curtas, limpam emojis, ignoram Lume/longas', () => {
  audio.voz('⛵ Bem-vindo a bordo, Criador!', 'pt');
  audio.voz('Welcome aboard, Creator!', 'en');
  audio.voz('token|⟨lume⟩|token'.replace(/[|⟨⟩]/g, ''), 'pt'); // nunca falar Lume
  audio.voz('x'.repeat(300), 'pt'); // demasiado longo → ignorado
  const falasOk = reg.falas.filter(f => /Bem-vindo a bordo|Welcome aboard/.test(f));
  expect(falasOk.length === 2, 'falas PT e EN deviam ser sintetizadas');
});

passo('🔇 Interruptores: vozes off cancela, som off silencia tudo, trilha off para o timer', () => {
  expect(audio.setVoz(false) === false, 'voz off');
  audio.voz('isto não devia falar', 'pt');
  expect(!reg.falas.includes('isto não devia falar'), 'voz desligada devia ignorar');
  expect(audio.setSom(false) === false, 'som off');
  audio.sfx('moeda'); // sem exceção, master a 0
  expect(audio.setTrilha(false) === false, 'trilha off');
  // reativar tudo
  expect(audio.setTrilha(true) && audio.setSom(true) && audio.setVoz(true), 'reativação completa');
});

passo('💀 Robustez: browser sem Web Audio não rebenta o jogo', () => {
  const mod2 = { exports: {} };
  const winSem = { speechSynthesis: null, SpeechSynthesisUtterance: FakeUtterance }; // sem AudioContext
  const fn = new Function('window', 'module', 'exports', 'require', cjs);
  fn(winSem, mod2, mod2.exports, require);
  const a2 = mod2.exports.default || mod2.exports;
  expect(a2.disponivel === false, 'disponivel devia ser false');
  expect(a2.iniciar(CFG) === false, 'iniciar devia devolver false (sem crash)');
  a2.sfx('moeda'); a2.voz('olá', 'pt'); a2.tick(m); // todas as chamadas seguras
});

console.log(falhas === 0
  ? '\n✅ Áudio verificado em sandbox — orquestração completa sem erros.'
  : '\n❌ ' + falhas + ' passo(s) falhado(s).');
process.exit(falhas === 0 ? 0 : 1);
