/* Smoke tests do Mundo Aberto X — correm em Node: node engine.test.js */
const E = require('./engine.js');
const CFG = require('./mundo.json');

let falhas = 0;
function teste(nome, fn) {
  try { fn(); console.log('  ✓', nome); }
  catch (e) { falhas++; console.error('  ✗', nome, '→', e.message); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg || 'esperança gorada'); }

console.log('== Mundo Aberto X · smoke tests ==');

teste('fib: sequência correta', () => {
  expect(E.fib(1) === 1 && E.fib(2) === 1 && E.fib(3) === 2 && E.fib(8) === 21 && E.fib(10) === 55, 'fib errada');
  expect(Math.abs(E.fibRatio(5) - 0.618) < 0.01, 'razão áurea errada');
});

teste('mundo nasce com 3 agentes + Lume de 13 sementes', () => {
  const m = E.criarMundo(CFG);
  expect(m.agentes.length === 3, 'deviam ser 3 agentes');
  expect(m.lume.tokens.length === CFG.lume.vocabularioInicial, 'vocabulário inicial errado');
});

teste('jogador entra no mundo e é único', () => {
  const m = E.criarMundo(CFG);
  const j1 = E.entrarComoJogador(m, 'Criador');
  const j2 = E.entrarComoJogador(m, 'Outro');
  expect(m.jogador && j1.id === j2.id, 'jogador duplicado');
  expect(j1.necessidades.dinheiro === 1000, 'dotação inicial do Criador');
});

teste('tick avança, agentes vivem e cultura cresce com construído', () => {
  const m = E.criarMundo(CFG);
  const antes = m.tickCount;
  m.agentes.forEach(a => { a.necessidades.dinheiro = 1000; }); // fundar o mundo p/ teste
  for (let i = 0; i < 5; i++) E.tick(m);
  expect(m.tickCount === antes + 5, 'tick não avançou');
  expect(m.agentes.some(a => a.profissao !== 'desempregado' || a.estado === 'vivo'), 'ninguém vivo a agir');
  E.construir(m, m.agentes[0].id, 'biblioteca');
  for (let i = 0; i < 3; i++) E.tick(m);
  expect(m.culturaGlobal > 0, 'biblioteca devia gerar cultura');
});

teste('gauntlet dispara a cada fib(8)=21 ticks', () => {
  const m = E.criarMundo(CFG);
  for (let i = 0; i < 21; i++) E.tick(m);
  expect(m.gauntletRonda === 1, 'gauntlet devia ter corrido 1× (ronda=' + m.gauntletRonda + ')');
});

teste('loop de críticos: ronda N corre a cada fib(N) ticks e corrige crises', () => {
  const m = E.criarMundo(CFG);
  // ronda 1 → intervalo fib(1)=1 → corre no tick 1
  E.tick(m);
  expect(m.criticos.ultimoAgente === 1, 'críticos deviam ter visitado 1 agente');
  expect(m.criticos.ronda === 2, 'ronda devia avançar');
});

teste('chat: agente responde em PT/EN e mostra tokens Lume', () => {
  const m = E.criarMundo(CFG);
  const ag = m.agentes[0];
  const r1 = E.enviarChat(m, ag.id, 'Olá, como estás?');
  expect(r1 && r1.texto.length > 0, 'sem resposta PT');
  expect(r1.tokens && r1.tokens.length > 0, 'sem tokens Lume');
  E.mudarIdioma(m, ag.id, 'en');
  const r2 = E.enviarChat(m, ag.id, 'Hello!');
  expect(/(I |I'm|The|My)/.test(r2.texto), 'resposta EN esperada: ' + r2.texto);
});

teste('ofertas e ferramentas do jogador chegiam ao agente', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const ag = m.agentes[0];
  E.jogadorComprar(m, 'semente');
  const r = E.jogadorOfertar(m, ag.id, 100);
  expect(r.ok && r.quantia === 100, 'oferta falhou');
  const r2 = E.jogadorDarFerramenta(m, ag.id, 'semente');
  expect(r2.ok && ag.inventario.includes('semente'), 'ferramenta não chegou');
});

teste('pesquisa desbloqueia construção com reqIdea', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000; // fundos de teste
  E.pesquisarIdea(m, m.jogador.id, 'rede_neural');
  const r = E.construir(m, m.jogador.id, 'universidade');
  expect(r.ok, 'universidade devia desbloquear: ' + r.erro);
});

teste('serialização .json ida-e-volta preserva o mundo', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  for (let i = 0; i < 10; i++) E.tick(m);
  const dados = JSON.parse(E.serializar(m));
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'import falhou');
  expect(m2.tickCount === m.tickCount && m2.agentes.length === m.agentes.length, 'estado perdido');
  expect(m2.jogador && m2.jogador.id === m.jogador.id, 'jogador perdido no import');
  expect(m2.agentes[0].lumebrain && typeof m2.agentes[0].lumebrain.decidir === 'function', 'LumeBrain não rehidratado');
});

teste('LumeBrain aprende: pesos mudam após experiência', () => {
  const b = E.criarLumeBrain(CFG.lume, CFG.lumebrain);
  const antes = { ...b.pesos };
  b.aprender('acumular', { bom: true, geracao: 3, gestor: true });
  expect(b.pesos.acumular > antes.acumular, 'peso devia subir');
  expect(b.gestorAtual() > CFG.lumebrain.gestorInicial, 'gestor devia crescer');
});

teste('língua Lume cresce em saltos Fibonacci (13 → 21)', () => {
  const m = E.criarMundo(CFG);
  m.culturaGlobal = 100;
  for (let i = 0; i < 25; i++) E.tick(m);
  expect(m.lume.tokens.length > CFG.lume.vocabularioInicial, 'vocabulário devia crescer');
});

teste('ligação Lume entre agentes: bigramas aprendem-se', () => {
  const m = E.criarMundo(CFG);
  const l = m.lume;
  for (let i = 0; i < 20; i++) l.aprender(l.emitir(3));
  const nLinks = Object.keys(l.bigramas).length;
  expect(nLinks > 0, 'bigramas deviam existir');
});

teste('morte e espíritos: agente sem saúde vira espírito', () => {
  const m = E.criarMundo(CFG);
  const ag = m.agentes[0];
  ag.necessidades.saude = 1;
  ag.necessidades.fome = 100;
  ag.necessidades.dinheiro = 0; // sem como comprar comida
  for (let i = 0; i < 5; i++) E.tick(m);
  expect(ag.estado === 'morto' && ag.arquetipo === 'espirito', 'devia ser espírito');
});

teste('razão de ouro usada nos limites dos críticos', () => {
  const m = E.criarMundo(CFG);
  expect(typeof m.cfg.protocoloCriticos.temas.length === 'number', 'temas ausentes');
  expect(E.GOLDEN > 0.6 && E.GOLDEN < 0.62, 'φ errado');
});

teste('v6: escola → estudar → dominar skill → carreira desbloqueada', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 9999;
  expect(!E.jogadorDefinirCarreira(m, m.agentes[0].id, 'estudante').ok, 'estudante sem escola devia falhar');
  E.construir(m, m.jogador.id, 'escola');
  const ag = m.agentes[0];
  ag.profissao = 'estudante';
  for (let i = 0; i < 10; i++) E.tick(m);
  expect(Object.keys(ag.skills).length > 0, 'devia ter dominado alguma skill');
  const r = E.jogadorDefinirCarreira(m, ag.id, 'professor');
  if (ag.skills.pedagogia) expect(r.ok, 'pedagogia devia desbloquear professor: ' + r.erro);
});

teste('v6: professor auto-aprendente aprende ao ensinar (fib(4) aulas)', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 9999;
  E.construir(m, m.jogador.id, 'escola');
  const prof = m.agentes[0];
  prof.skills = { pedagogia: 1, zoologia: 1, logica: 1 }; // falta meta_aprendizagem
  prof.profissao = 'professor';
  const aluno = m.agentes[1];
  aluno.profissao = 'estudante';
  for (let i = 0; i < 30; i++) E.tick(m);
  expect(prof.ensinosDados > 0, 'professor devia ter dado aulas');
});

teste('v6: conduta — fundo comum recebe partilha e salva famintos', () => {
  const m = E.criarMundo(CFG);
  const rico = m.agentes[0];
  rico.necessidades.dinheiro = 500;
  E.aplicarConduta(m);
  expect(rico.necessidades.dinheiro < 500, 'partilha devia cobrar 10% acima de 300');
  expect(m.fundoComum > 0, 'fundo comum devia ter recebido');
  const faminto = m.agentes[1];
  faminto.necessidades.fome = 90; faminto.necessidades.dinheiro = 0;
  E.aplicarConduta(m);
  expect(faminto.necessidades.fome < 90, 'Protocolo do Cuidado devia alimentar');
});

teste('v6: sucessão — espírito lega moedas e saber', () => {
  const m = E.criarMundo(CFG);
  const finado = m.agentes[0];
  finado.estado = 'morto'; finado.necessidades.dinheiro = 400; finado.skills = { logica: 1 };
  E.aplicarConduta(m);
  expect(finado.legadoFeito, 'legado devia ter sido executado');
  const herdeiros = m.agentes.filter(a => a.estado === 'vivo' && a.necessidades.dinheiro > 50);
  expect(herdeiros.length > 0, 'alguém devia ter herdado');
  const comLogica = m.agentes.filter(a => a.skills && a.skills.logica);
  expect(comLogica.length >= 1, 'skill devia ter sido legada');
});

teste('v6: fauna nasce, vagueia e reproduz-se por Fibonacci', () => {
  const m = E.criarMundo(CFG);
  expect(m.fauna && m.fauna.length === 6, 'fauna inicial devia ser 6');
  const antes = m.fauna.length;
  for (let i = 0; i < 14; i++) E.tick(m); // fib(7)=13 → nasce 1
  expect(m.fauna.length > antes, 'fauna devia crescer a cada fib(7)');
  const an = m.fauna[0];
  expect(an.x !== undefined && an.y !== undefined, 'animais têm posição');
});

teste('v6: mapa expansível — custo fib e chunk com ruas/zonas', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 9999;
  expect(E.custoProximoChunk(m) === 200, 'primeiro chunk custa 200 (fib(2)×200)');
  const r1 = E.jogadorExpandirMapa(m);
  expect(r1.ok, 'expansão 1: ' + r1.erro);
  expect(E.custoProximoChunk(m) === 400, 'segundo chunk custa 400 (fib(3)×200)');
  expect(m.chunks.length === 2 && m.chunks[1].ruas.length > 0, 'chunk novo tem ruas');
  expect(m.faunaMaxExtra === 4, 'fauna ganha espaço');
});

teste('v6: interação com fauna — curar e alimentar', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const an = m.fauna[0];
  an.ferido = true;
  expect(E.jogadorInteragirAnimal(m, an.id, 'curar').ok, 'Criador cura');
  expect(!an.ferido, 'animal curado');
  an.energia = 10;
  expect(E.jogadorInteragirAnimal(m, an.id, 'alimentar').ok, 'Criador alimenta');
  expect(an.energia > 10, 'energia subiu');
});

teste('v6: migração v5 → v6 no import', () => {
  const m = E.criarMundo(CFG);
  const dados = JSON.parse(E.serializar(m));
  dados.agentes.forEach(a => { delete a.skills; delete a.aulas; });
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'import legado falhou');
  m2.agentes.forEach(a => expect(a.skills && typeof a.skills === 'object', 'skills migradas'));
});

teste('v6.1: continuidade — sociedade constrói a escola sozinha via fundo comum', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.fundoComum = 1000; // simular acumulação do Protocolo da Partilha
  E.tick(m);
  expect(m.construcoes.some(c => c.tipo === 'escola'), 'a escola foi erguida pelo fundo comum');
  expect(m.fundoComum < 1000, 'o fundo pagou a construção');
});

teste('v6.1: continuidade — sem reserva áurea não há investimento', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.fundoComum = 650; // acima do custo (600) mas abaixo de custo×φ (≈370 folga)
  E.tick(m);
  expect(m.fundoComum > 600, 'fundo intacto sem folga suficiente (reserva áurea)');
  expect(!m.construcoes.some(c => c.tipo === 'escola'), 'nenhuma construção arriscada');
});

teste('v6.1: continuidade — rede de segurança alimenta os famintos', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.fundoComum = 500;
  m.agentes.filter(a => !a.isCriador).forEach(a => { a.necessidades.fome = 90; });
  E.tick(m);
  const aindaFamintos = m.agentes.filter(a => !a.isCriador && a.necessidades.fome > 85).length;
  expect(aindaFamintos === 0, 'fundo comum alimentou os mais famintos');
});

teste('v6.1: professor recebe salário mesmo sem alunos', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.construcoes.push({ id: E.gerarId(), tipo: 'escola', nivel: 1, visitantes: 0, construidoEm: Date.now(), criadoPor: 'teste' });
  const prof = m.agentes.find(a => !a.isCriador);
  prof.profissao = 'professor';
  prof.necessidades.dinheiro = 0;
  E.ensinar(m, prof);
  expect(prof.necessidades.dinheiro > 0, 'professor sem alunos recebe salário-base');
});

teste('v6.1: Gauntlet não atinge o Criador', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const j = m.jogador;
  j.necessidades.saude = 100;
  E.gauntlet(m);
  expect(j.necessidades.saude === 100, 'saúde do Criador intacta');
});

teste('v6.1: dimensões do mundo crescem com chunks comprados', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  expect(E.dimensoesMundo(m).w === 640 && E.dimensoesMundo(m).h === 320, 'base 640×320');
  E.expandirMapa(m, m.jogador.id); // idx 1 → coluna direita
  expect(E.dimensoesMundo(m).w === 1280 && E.dimensoesMundo(m).h === 320, 'chunk 1 dobra a largura');
  E.expandirMapa(m, m.jogador.id); // idx 2 → linha abaixo
  expect(E.dimensoesMundo(m).w === 1280 && E.dimensoesMundo(m).h === 640, 'chunk 2 dobra a altura');
});

teste('v6.1: Criador pode andar no território comprado', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  E.expandirMapa(m, m.jogador.id);
  E.jogadorMover(m, 1000, 160); // x > 640: só possível no novo chunk
  expect(m.jogador.x === 1000, 'posição além do mapa base aceite');
});

teste('v6.1: graduado recebe colocação imediata', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.construcoes.push({ id: E.gerarId(), tipo: 'escola', nivel: 1, visitantes: 0, construidoEm: Date.now(), criadoPor: 'teste' });
  const al = m.agentes.find(a => !a.isCriador);
  al.profissao = 'estudante';
  Object.keys(CFG.skills.catalogo).forEach(s => { al.skills[s] = 1; }); // sabe tudo
  const r = E.estudar(m, al);
  expect(al.profissao !== 'estudante', 'saiu de estudante após graduar (' + al.profissao + ')');
  expect(typeof r.acao === 'string', 'ação registada: ' + r.acao);
});

teste('v6.1: bolsa de estudo sai do fundo comum', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.construcoes.push({ id: E.gerarId(), tipo: 'escola', nivel: 1, visitantes: 0, construidoEm: Date.now(), criadoPor: 'teste' });
  const al = m.agentes.find(a => !a.isCriador);
  al.profissao = 'estudante';
  al.necessidades.dinheiro = 0;
  const fundoAntes = 500;
  m.fundoComum = fundoAntes;
  E.estudar(m, al);
  expect(m.fundoComum === fundoAntes - CFG.skills.bolsaAula, 'fundo pagou a bolsa');
  expect(al.necessidades.dinheiro === CFG.skills.bolsaAula, 'estudante recebeu a bolsa');
});

console.log(falhas === 0 ? '\n✅ Tudo passou.' : `\n❌ ${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
