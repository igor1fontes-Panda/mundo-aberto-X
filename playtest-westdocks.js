/* Playtest headless do Reino de WestDocks (v10) — simula uma sessão real do Criador.
   Uso: node playtest-westdocks.js   (script temporário de verificação) */
const E = require('./engine.js');
const CFG = require('./mundo.json');

let falhas = 0;
function passo(nome, fn) {
  try { fn(); console.log('  ✓', nome); }
  catch (e) { falhas++; console.error('  ✗', nome, '→', e.message); }
}
function expect(c, m) { if (!c) throw new Error(m || 'falhou'); }
function hipot(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

console.log('== 🎮 Playtest WestDocks · sessão do Criador ==');
const t0 = Date.now();
const m = E.criarMundo(CFG);
const j = E.entrarComoJogador(m, 'Criador');
j.necessidades.dinheiro = 5000;

passo('⚓ Anexar WestDocks pelo botão do jogador (custo 1618)', () => {
  const r = E.jogadorAnexarWestDocks(m);
  expect(r.ok, r.erro || 'anexação falhou');
  expect(m.westdocks.anexado && m.westdocks.fundadoEm === 0, 'reino fundado no tick 0');
  expect(j.necessidades.dinheiro === 5000 - CFG.westdocks.custoAnexar, 'custo debitado: ' + j.necessidades.dinheiro);
});

passo('🏗️ Bairro completo: docas, pub, loja, caserna, farol + 4 casas', () => {
  const wd = m.construcoes.filter(c => c.criadoPor === 'westdocks');
  expect(wd.length === CFG.westdocks.edificios.length, wd.length + '/' + CFG.westdocks.edificios.length + ' edifícios');
  const tipos = wd.map(c => c.tipo);
  ['docas', 'pub', 'loja', 'caserna', 'farol'].forEach(t => expect(tipos.includes(t), 'falta ' + t));
  expect(tipos.filter(t => t === 'casa').length === 4, 'deviam ser 4 casas');
  expect(wd.every(c => Number.isFinite(c.wx) && Number.isFinite(c.wy)), 'posição real (wx/wy)');
});

passo('🌊 Frota nasce dentro do Mar de West', () => {
  const mar = CFG.westdocks.mar;
  expect(m.barcos.length >= 2, 'ferri + pesca');
  m.barcos.forEach(b => {
    expect(Number.isFinite(b.x) && Number.isFinite(b.y), b.nome + ' com coordenada NaN');
    expect(b.y >= mar.y0 - 30 && b.y <= mar.y0 + mar.altura, b.nome + ' fora do mar (y=' + b.y.toFixed(1) + ')');
  });
});

passo('⛵ Travessia completa: cais → Ponte do Leste → docas', () => {
  const wd = m.westdocks;
  const ponte = { x: wd.ponte.x + wd.ponte.comprimento, y: wd.ponte.y };
  // ancorar o ferri no cais (o spawn é aleatório no mar; a travessia em si é o que se mede)
  const f0 = m.barcos.find(b => b.tipo === 'ferri');
  f0.x = wd.cais.x; f0.y = wd.cais.y + 18; f0.espera = 0;
  // ida: embarcar no cais
  j.x = wd.cais.x; j.y = wd.cais.y;
  expect(E.jogadorNavegar(m).ok, 'embarque no cais');
  const ferri = m.barcos.find(b => b.tipo === 'ferri');
  let ticks = 0;
  while (ferri.passageiro === j.id && ticks++ < 140) E.tick(m);
  expect(ferri.passageiro !== j.id, 'devia desembarcar na travessia (140 ticks)');
  expect(hipot(j, ponte) < 45, 'devia ter chegado à Ponte do Leste (d=' + hipot(j, ponte).toFixed(0) + ')');
  // volta: embarcar na ponte
  expect(E.jogadorNavegar(m).ok, 'embarque na ponte');
  ticks = 0;
  while (ferri.passageiro === j.id && ticks++ < 140) E.tick(m);
  expect(hipot(j, wd.cais) < 45, 'devia ter voltado às Docas Reais (d=' + hipot(j, wd.cais).toFixed(0) + ')');
});

passo('👮 NPCs portuários interagem com o Criador (falas PT)', () => {
  for (let i = 0; i < 60; i++) E.tick(m);
  const wdTipos = ['policia', 'estivador', 'taberneiro', 'marinheiro', 'faroleiro'];
  const portuarios = m.npcs.filter(n => wdTipos.includes(n.tipo));
  expect(portuarios.length >= 4, 'só chegaram ' + portuarios.length + ': ' + portuarios.map(n => n.tipo).join(','));
  expect(portuarios.some(n => n.tipo === 'policia'), 'polícia em falta');
  portuarios.forEach(n => {
    const r = E.falarNpc(m, n.id);
    expect(r.ok && r.texto && r.texto.length > 0, n.nome + ' não respondeu');
    expect(!/undefined|NaN/.test(r.texto), n.nome + ' com fala corrompida: ' + r.texto);
  });
});

passo('🛒 Loja de WestDocks: desconto de 15% aplicado na compra', () => {
  const precoBase = CFG.ferramentas.semente.custo;
  const esperado = Math.round(precoBase * 0.85);
  expect(E.custoFerramenta(m, 'semente') === esperado, 'custoFerramenta devia aplicar desconto');
  const carteira = j.necessidades.dinheiro;
  expect(E.jogadorComprar(m, 'semente').ok, 'compra falhou');
  expect(j.necessidades.dinheiro === carteira - esperado, 'devia pagar ' + esperado + ', pagou ' + (carteira - j.necessidades.dinheiro));
});

passo('⏱️ 160 ticks de vida portuária: economia roda e caps respeitados', () => {
  const fundo0 = m.fundoComum;
  for (let i = 0; i < 160; i++) E.tick(m);
  expect((m.wdNpcQueue || []).length === 0, 'fila de NPCs portuários devia esvaziar-se');
  const b = m.barcos;
  expect(b.filter(x => x.tipo === 'pirata').length <= CFG.westdocks.barcos.piratasMax, 'demasiados piratas');
  expect(b.filter(x => x.tipo === 'pesca').length <= 2, 'demasiados pesqueiros');
  expect(b.every(x => x.viva && Number.isFinite(x.x) && Number.isFinite(x.y)), 'frota corrompida');
  expect(m.fundoComum >= fundo0, 'fundo comum não devia encolher com a pesca');
  m.agentes.filter(a => a.estado === 'vivo').concat(m.npcs).forEach(s =>
    expect(Number.isFinite(s.x) && Number.isFinite(s.y), s.nome + ' com coordenada inválida'));
});

passo('💾 Export/import preserva o reino de WestDocks', () => {
  const dados = JSON.parse(E.serializar(m));
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'import falhou');
  expect(m2.westdocks && m2.westdocks.anexado, 'westdocks perdido no import');
  expect(m2.barcos.length === m.barcos.length, 'frota perdida no import');
  expect(m2.npcs.filter(n => n.tipo === 'policia').length >= 1, 'polícia perdida no import');
  expect(m2.construcoes.filter(c => c.criadoPor === 'westdocks').length === 9, 'edifícios do reino perdidos');
});

console.log('⏱  ' + (Date.now() - t0) + 'ms · ticks: ' + m.tickCount + ' · vivos: ' +
  m.agentes.filter(a => a.estado === 'vivo').length + ' · NPCs: ' + m.npcs.length + ' · barcos: ' + m.barcos.length);
console.log(falhas === 0 ? '✅ Playtest completo — WestDocks está jogável.' : '❌ ' + falhas + ' passo(s) falhado(s).');
process.exit(falhas === 0 ? 0 : 1);
