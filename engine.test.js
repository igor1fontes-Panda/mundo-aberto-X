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
  expect(m.fauna && m.fauna.length === 15, 'fauna inicial devia ser 15 (6 terra + 3 aves + 2 peixes + 4 fazenda)');
  const habitats = new Set(m.fauna.map(an => an.habitat || 'terra'));
  expect(habitats.has('ar') && habitats.has('agua'), 'aves e peixes presentes desde o início');
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
  // v8.1: movimento por toque dá passos suaves — andar até cruzar a fronteira
  for (let i = 0; i < 60; i++) E.jogadorMover(m, 1000, 160); // x > 640: só possível no novo chunk
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

// ============ v8: combate, itens, profissões novas, mundo expandido ============

teste('v8: Criador ataca habitante — nunca mata e guarda defende', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const alvo = m.agentes.find(a => !a.isCriador);
  alvo.x = m.jogador.x; alvo.y = m.jogador.y; // alcançável
  const saudeAntes = alvo.necessidades.saude;
  const r = E.jogadorAtacar(m, alvo.id);
  expect(r.ok, 'ataque falhou: ' + r.erro);
  expect(alvo.necessidades.saude < saudeAntes, 'dano não aplicado');
  expect(alvo.necessidades.saude >= 1, 'ataque não pode matar diretamente');
  expect(alvo.estado === 'vivo', 'ataque não pode matar');
  // Criador é intocável
  const r2 = E.atacarAgente(m, alvo.id, m.jogador.id);
  expect(!r2.ok && /fora da simulação/.test(r2.erro), 'Criador devia ser intocável');
});

teste('v8: defesa reduz o dano e reflite; expira no tick seguinte', () => {
  const m = E.criarMundo(CFG);
  const at = m.agentes[0], alvo = m.agentes[1];
  at.x = alvo.x; at.y = alvo.y;
  E.defenderAtivado(m, alvo.id);
  expect(alvo.defesaAtiva === true, 'defesa não ativou');
  const r = E.atacarAgente(m, at.id, alvo.id);
  expect(r.ok && r.defendido, 'defesa não refletiu no resultado');
  E.tick(m); // expirarDefesas
  expect(alvo.defesaAtiva === false, 'defesa devia expirar');
});

teste('v8: gerar item no chão e pegar perto', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 1000;
  const rg = E.jogadorGerarItem(m, 'comida');
  expect(rg.ok, 'gerar item falhou: ' + rg.erro);
  expect(m.itensNoChao.length === 1, 'item não spawnou');
  // coloca o jogador em cima do item e apanha
  const it = m.itensNoChao[0];
  E.jogadorMover(m, it.x, it.y);
  const rp = E.jogadorPegar(m);
  expect(rp.ok, 'pegar falhou: ' + rp.erro);
  expect(m.itensNoChao.length === 0, 'item não foi consumido');
  // comida recolhida não vai para o inventário (uso imediato)
  expect(!m.jogador.inventario.includes('comida'), 'comida não é inventariável');
});

teste('v8: expandir mundo semeia itens e 20 profissões carregam', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000;
  const r = E.jogadorExpandirMapa(m);
  expect(r.ok, 'expansão falhou: ' + r.erro);
  expect(m.chunksComprados === 1, 'chunk não registado');
  expect((m.itensNoChao || []).length >= 2, 'expansão não semeou itens');
  expect(Object.keys(CFG.profissoes).length >= 20, 'profissões novas em falta');
  // deserializar mantém itensNoChao
  const dados = JSON.parse(E.serializar(m));
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'reimport falhou');
  expect(m2.itensNoChao.length === m.itensNoChao.length, 'itensNoChao perdido no ciclo JSON');
});

// ============ v8.1: touchscreen, fauna variada, NPCs de ambiente ============

teste('v8.1: movimento por toque dá passos suaves (correr dá passos maiores)', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const j = m.jogador;
  const x0 = j.x, y0 = j.y;
  E.jogadorMover(m, x0 + 500, y0, false);
  const passoNormal = Math.hypot(j.x - x0, j.y - y0);
  E.jogadorMover(m, j.x + 500, j.y, true);
  const passoCorrer = Math.hypot(j.x - x0, j.y - y0) - passoNormal;
  expect(Math.abs(passoNormal - 20) < 0.01, 'passo normal devia ser 20: ' + passoNormal);
  expect(Math.abs(passoCorrer - 42) < 0.01, 'passo a correr devia ser 42: ' + passoCorrer);
});

teste('v8.1: fauna nasce com forma, temperamento e rumo; move-se de forma direcional', () => {
  const m = E.criarMundo(CFG);
  expect(m.fauna.every(an => an.temperamento), 'temperamento em falta');
  expect(Object.keys(CFG.fauna.especies).length >= 8, 'devia haver 8 espécies');
  const an = m.fauna[0];
  an.temperamento = 'curioso';
  const x0 = an.x, y0 = an.y;
  for (let i = 0; i < 30; i++) E.tick(m);
  expect(an.x !== x0 || an.y !== y0, 'animal devia ter-se mexido');
  expect(typeof an.energia === 'number' && an.energia <= 100, 'energia devia gastar-se');
});

teste('v8.1: NPCs de ambiente vivem tarefas próprias (sem economia, sem Lume)', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  for (let i = 0; i < 26; i++) E.tick(m);
  expect(m.npcs && m.npcs.length >= 6, 'deviam existir NPCs de ambiente');
  expect(m.npcs.every(n => n.tarefa && n.pontoA && n.pontoB), 'NPC sem tarefa ou rota');
  // pausam ao chegar ao ponto (a fazer o seu ofício)
  expect(m.npcs.some(n => n.pausa > 0 || n.pausa === 0), 'campo pausa inexistente');
  const n0 = m.npcs[0];
  const dist0 = Math.hypot(n0.alvo.x - n0.x, n0.alvo.y - n0.y);
  E.tick(m);
  const dist1 = Math.hypot(n0.alvo.x - n0.x, n0.alvo.y - n0.y);
  expect(n0.pausa > 0 ? true : dist1 < dist0 || dist0 < 12, 'NPC devia aproximar-se do alvo');
  // sobrevive ao ciclo JSON
  const dados = JSON.parse(E.serializar(m));
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'import falhou');
  expect(m2.npcs.length === m.npcs.length, 'NPCs perdidos no ciclo JSON');
  // mundos antigos (sem npcs) ganham-nos na migração
  delete dados.npcs;
  const m3 = E.criarMundo(CFG);
  expect(E.deserializar(m3, dados), 'import legado falhou');
  expect(m3.npcs && m3.npcs.length > 0, 'migração v7 → v8.1 devia criar NPCs');
});

// ============ v9: RPG anime — missões, diplomacia, justiça, história, Kardashev ============

teste('v9: quest board gera missões e o Criador recolhe recompensas', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  for (let i = 0; i < 40; i++) E.tick(m);
  expect(m.missoes && m.missoes.length > 0, 'board devia ter missões');
  expect(m.missoes.every(q => q.nome && q.meta > 0 && q.recompensa > 0), 'missão mal formada');
  // determinismo: semeia uma missão comunitária (sem alvo) e força trabalho coletivo
  m.agentes.forEach(a => { if (a.estado === 'vivo' && !a.isCriador) a.profissao = 'mercador'; });
  m.missoes.push({ id: 'qT', tipo: 'colher', nome: 'Colheita de Teste', emoji: '🌾', descricao: 'x', dono: 'Aria', donoId: m.agentes[0].id,
    dificuldade: 1, recompensa: 60, progresso: 0, meta: 10, alvo: null, pronta: false, concluida: false, aceite: false, criadaEm: 0 });
  for (let i = 0; i < 12; i++) E.tick(m);
  const pronta = m.missoes.find(q => q.id === 'qT');
  expect(pronta.pronta, 'missão semeada devia ficar pronta com trabalhadores');
  const moedasAntes = m.jogador.necessidades.dinheiro;
  expect(E.completarMissao(m, 'qT').ok, 'recolha falhou');
  expect(m.jogador.necessidades.dinheiro > moedasAntes, 'recompensa não chegou');
  expect(m.diplomacia.reputacaoCriador > 20, 'reputação devia subir');
});

teste('v9: guerra rebenta com a tensão e a mediação do Criador traz a paz', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.diplomacia = { pactos: [], guerra: null, tensao: 86, reputacaoCriador: 80, processoPaz: 0 };
  m.agentes[0].faccao = 'mafia'; m.agentes[2].faccao = 'elite';
  m.agentes[0].necessidades.dinheiro = 900; m.agentes[2].necessidades.dinheiro = 0;
  for (let i = 0; i < 6 && !m.diplomacia.guerra; i++) E.tick(m);
  expect(m.diplomacia.guerra, 'guerra devia rebentar (tensão ≥ 89)');
  let guard = 0;
  while (m.diplomacia.guerra && guard++ < 30) { E.mediarPaz(m); E.tick(m); }
  expect(!m.diplomacia.guerra, 'mediação devia terminar a guerra');
  expect(m.diplomacia.pactos.some(p => p.tipo === 'paz'), 'pacto de paz devia existir');
});

teste('v9: tribunal julga com veredicto e Kardashev sobe com o mundo', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.tribunal = { casos: [{ id: 'c1', acusadoId: m.agentes[0].id, acusado: m.agentes[0].nome, crime: 'Furto de Dados', pena: 40, julgado: false, veredicto: null, criadoEm: 0 }] };
  let guard = 0;
  while (!m.tribunal.casos[0].julgado && guard++ < 10) E.tick(m);
  expect(m.tribunal.casos[0].julgado, 'caso devia ser julgado (julgamento a cada fib(5))');
  expect(['absolvido', 'culpado'].includes(m.tribunal.casos[0].veredicto), 'veredicto inválido');
  // Kardashev: mundo rico em cultura/construções deve subir de tipo
  m.culturaGlobal = 3000; m.construcoes = new Array(10).fill({}); m.ideias = ['a', 'b', 'c', 'd'];
  expect(E.nivelKardashev(m) >= 2, 'Kardashev devia subir com civilização avançada');
  // sobrevive ao ciclo JSON
  const dados = JSON.parse(E.serializar(m));
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'import v9 falhou');
  expect(m2.diplomacia && m2.tribunal && m2.historia && m2.kardashev, 'estado v9 perdido no ciclo JSON');
});

// ============ v9.1: missões físicas no terreno + tribunal 3D ============

teste('v9.1: missão física tem alvo no terreno e progride com o Criador lá', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  // criar missão física manualmente (determinismo): modelo 'explorar' tem alvo 'ponto'
  const q = { id: 'q1', tipo: 'explorar', nome: 'Mapear Terras Selvagens', emoji: '🧭', descricao: 'x', dono: 'Aria', donoId: m.agentes[0].id,
    dificuldade: 1, recompensa: 80, progresso: 0, meta: 10, alvo: { x: 600, y: 60 }, pronta: false, concluida: false, aceite: false, criadaEm: 0 };
  m.missoes = [q];
  E.aceitarMissao(m, 'q1');
  expect(q.aceite, 'missão devia ficar aceite');
  // progresso base da sociedade em 8 ticks (a sociedade avança devagar: 1 a cada 3 ticks)
  for (let i = 0; i < 8; i++) E.tick(m);
  const base = q.progresso;
  expect(base > 0, 'sociedade devia avançar devagar mesmo sem o Criador: ' + base);
  // no alvo: o esforço físico do Criador dobra o ritmo (+2/tick) — viaja até chegar
  for (let i = 0; i < 60 && Math.hypot(m.jogador.x - q.alvo.x, m.jogador.y - q.alvo.y) > 30; i++) {
    E.jogadorMover(m, q.alvo.x, q.alvo.y, true);
  }
  expect(Math.hypot(m.jogador.x - q.alvo.x, m.jogador.y - q.alvo.y) <= 45, 'Criador devia chegar ao marcador');
  for (let i = 0; i < 6; i++) E.tick(m);
  const ganhoComCriador = q.progresso - base;
  expect(ganhoComCriador > 6, 'no marcador devia progredir rápido (2/tick): +' + ganhoComCriador);
});

teste('v9.1: Tribunal acelera julgamentos e suaviza penas', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 9999;
  E.construir(m, m.jogador.id, 'praca_missoes');
  expect(m.construcoes.some(c => c.tipo === 'praca_missoes'), 'praça devia construir (custo 900)');
  E.pesquisarIdea(m, m.jogador.id, 'blockchain');
  expect(E.construir(m, m.jogador.id, 'tribunal').ok, 'tribunal devia construir com blockchain');
  m.tribunal = { casos: [{ id: 'c9', acusadoId: m.agentes[0].id, acusado: m.agentes[0].nome, crime: 'Furto de Dados', pena: 40, julgado: false, veredicto: null, criadoEm: 0 }] };
  m.diplomacia = { pactos: [], guerra: null, tensao: 10, reputacaoCriador: 20, processoPaz: 0 };
  const t0 = m.tickCount;
  // com Tribunal (fib(3)=2 ticks), o caso julga-se em ≤3 ticks
  while (!m.tribunal.casos[0].julgado && m.tickCount < t0 + 4) E.tick(m);
  expect(m.tribunal.casos[0].julgado, 'Tribunal devia julgar depressa (fib(3)): ' + (m.tickCount - t0) + ' ticks');
  expect(['absolvido', 'culpado'].includes(m.tribunal.casos[0].veredicto), 'veredicto inválido');
});

// ============ v9.2: comboio, baú físico, fundo comum ergue o Tribunal ============

teste('v9.2: comboio — NPC escoltado segue o Criador e chega ao destino', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  expect(m.npcs && m.npcs.length > 0, 'NPCs deviam existir desde o criarMundo (comboios)');
  const npc = m.npcs[0];
  npc.x = 200; npc.y = 150;
  const q = { id: 'qC', tipo: 'escoltar_menestrel', nome: 'Comboio do Menestrel', emoji: '🎻', descricao: 'x', dono: 'Aria', donoId: m.agentes[0].id,
    dificuldade: 1, recompensa: 140, progresso: 0, meta: 20, alvo: { x: 380, y: 200 }, escoltadoId: npc.id, comboio: true,
    pronta: false, concluida: false, aceite: false, criadaEm: 0 };
  m.missoes = [q];
  E.aceitarMissao(m, 'qC');
  expect(q.aceite, 'comboio devia aceitar-se');
  // Criador anda ao lado do NPC — o NPC persegue-o e o progresso avança
  for (let i = 0; i < 30; i++) {
    E.jogadorMover(m, npc.x + 12, npc.y + 5, true);
    E.tick(m);
  }
  expect(q.progresso > 0, 'escolta devia progredir: ' + q.progresso);
  expect(Math.hypot(npc.x - m.jogador.x, npc.y - m.jogador.y) < 80, 'NPC devia seguir o Criador');
});

teste('v9.2: recompensa física — baú cai no chão e paga ao ser apanhado', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const q = { id: 'qB', tipo: 'colher', nome: 'Colheita', emoji: '🌾', descricao: 'x', dono: 'Aria', donoId: m.agentes[0].id,
    dificuldade: 2, recompensa: 100, progresso: 10, meta: 10, alvo: null, pronta: true, concluida: false, aceite: true, criadaEm: 0 };
  m.missoes = [q];
  const moedas0 = m.jogador.necessidades.dinheiro;
  const r = E.completarMissao(m, 'qB');
  expect(r.ok, 'recolha falhou');
  // metade direto, metade no baú
  expect(m.jogador.necessidades.dinheiro === moedas0 + 50, 'metade devia vir direta: +' + (m.jogador.necessidades.dinheiro - moedas0));
  const bau = (m.itensNoChao || []).find(it => it.itemKey === 'bau_missao');
  expect(bau && bau.valor === 50, 'baú devia existir com valor 50');
  E.jogadorMover(m, bau.x, bau.y, true);
  const peg = E.jogadorPegar(m);
  expect(peg.ok && peg.msg.indexOf('70') === -1, 'baú devia ser apanhável');
  expect(m.jogador.necessidades.dinheiro === moedas0 + 100, 'total devia somar a recompensa completa');
});

teste('v9.2: fundo comum ergue a Praça das Missões e o Tribunal sozinho', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.fundoComum = 12000;
  for (let i = 0; i < 40; i++) E.tick(m);
  expect(m.construcoes.some(c => c.tipo === 'escola'), 'escola continua com prioridade');
  expect(m.construcoes.some(c => c.tipo === 'praca_missoes'), 'Praça das Missões devia ser erguida pelo fundo');
  expect(m.construcoes.some(c => c.tipo === 'tribunal'), 'Tribunal devia ser erguido pelo fundo (com blockchain financiada)');
  expect(m.ideias.includes('blockchain'), 'blockchain devia ter sido financiada para o Tribunal');
});

// ============ v10: Reino de WestDocks — ilha, docas, frota, polícia ============

teste('v10: anexar WestDocks cria reino, edifícios, mar e frota — e custa moedas', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  // sem dinheiro não anexa
  const r0 = E.anexarWestDocks(m);
  expect(!r0.ok, 'devia falhar sem moedas');
  m.jogador.necessidades.dinheiro = 5000;
  const r = E.anexarWestDocks(m);
  expect(r.ok, 'anexação devia funcionar: ' + (r.erro || ''));
  expect(m.westdocks && m.westdocks.anexado, 'westdocks devia existir e estar anexado');
  expect(m.jogador.necessidades.dinheiro === 5000 - CFG.westdocks.custoAnexar, 'custo devia ser debitado');
  // edifícios entram com posição real (wx/wy) e criadoPor=westdocks
  const wdB = m.construcoes.filter(c => c.criadoPor === 'westdocks');
  expect(wdB.length >= CFG.westdocks.edificios.length, 'edifícios em falta');
  expect(wdB.every(c => c.wx != null && c.wy != null), 'edifício sem posição real');
  ['docas', 'pub', 'loja', 'farol', 'caserna'].forEach(t => expect(wdB.some(c => c.tipo === t), 'falta edifício ' + t));
  // frota inicial: ferri + pesca (pirata é aleatório)
  expect(m.barcos.length >= 2, 'frota devia ter ferri e pesca');
  expect(m.barcos.some(b => b.tipo === 'ferri') && m.barcos.some(b => b.tipo === 'pesca'), 'ferri/pesca em falta');
  // fauna marítima coloniza o mar
  const mar = CFG.fauna.especies.golfinho && CFG.fauna.especies.golfinho.habitat === 'mar';
  expect(mar, 'golfinho devia ser marítimo na config');
  // segunda anexação falha
  expect(!E.anexarWestDocks(m).ok, 'devia recusar segunda anexação');
});

teste('v10: frota navega, pesca enche carga, ferri transporta o Criador entre margens', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000;
  E.anexarWestDocks(m);
  const ferri = m.barcos.find(b => b.tipo === 'ferri');
  const pesca = m.barcos.find(b => b.tipo === 'pesca');
  const x0 = ferri.x, y0 = ferri.y;
  for (let i = 0; i < 30; i++) E.tick(m);
  expect(Math.hypot(ferri.x - x0, ferri.y - y0) > 5, 'ferri devia navegar');
  expect(typeof pesca.carga === 'number', 'barco de pesca devia ter carga');
  // embarcar exige estar no cais ou na ponte
  const wd = m.westdocks;
  const rLonge = E.jogadorNavegar(m);
  expect(!rLonge.ok, 'não devia embarcar longe do cais');
  m.jogador.x = wd.cais.x; m.jogador.y = wd.cais.y;
  const r = E.jogadorNavegar(m);
  expect(r.ok, 'embarque no cais devia funcionar: ' + (r.erro || ''));
  expect(ferri.passageiro === m.jogador.id, 'ferri devia ter o Criador a bordo');
  expect(ferri.destino, 'ferri devia ter destino');
  // desembarque (toggle)
  const r2 = E.jogadorNavegar(m);
  expect(r2.ok && ferri.passageiro === null, 'desembarque devia funcionar');
  // rede enche longe do cais
  pesca.carga = 0; pesca.espera = 0;
  pesca.x += 180; pesca.y += 40;
  E.tick(m);
  expect(pesca.carga > 0, 'rede devia encher longe do cais');
  // descarrega junto ao cais (farol aumenta o rendimento e o fundo comum recebe)
  pesca.carga = 40; pesca.x = wd.cais.x; pesca.y = wd.cais.y + 18;
  const fundo0 = m.fundoComum;
  E.tick(m);
  expect(pesca.carga === 0, 'pesqueiro devia descarregar no cais');
  expect(m.fundoComum > fundo0, 'fundo comum devia receber o pescado');
  // pirata forçado caça sem rebentar o tick
  m.barcos.push({ ...m.barcos[0], id: E.gerarId(), tipo: 'pirata', nome: 'Teste Negro', viva: true, rendicao: 0, carga: 0, espera: 0 });
  for (let i = 0; i < 12; i++) E.tick(m);
  expect(m.barcos.length >= 2, 'frota devia continuar ativa');
});

teste('v10: NPCs portuários chegam em saltos fib(7), polícia patrulha, falas PT/EN', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000;
  E.anexarWestDocks(m);
  for (let i = 0; i < 60; i++) E.tick(m);
  const wdTipos = ['policia', 'estivador', 'taberneiro', 'marinheiro', 'faroleiro'];
  const wdNpcs = m.npcs.filter(n => wdTipos.includes(n.tipo));
  expect(wdNpcs.length >= 4, 'NPCs portuários deviam ter chegado: ' + wdNpcs.map(n => n.tipo).join(','));
  expect(wdNpcs.some(n => n.tipo === 'policia'), 'polícia devia existir');
  const pol = m.npcs.find(n => n.tipo === 'policia');
  const d0 = Math.hypot(pol.alvo.x - pol.x, pol.alvo.y - pol.y);
  E.tick(m);
  const d1 = Math.hypot(pol.alvo.x - pol.x, pol.alvo.y - pol.y);
  expect(pol.pausa > 0 || d1 < d0 || d0 < 12, 'polícia devia patrulhar');
  // falas ao Criador em PT e EN (nunca Lume)
  const rPt = E.falarNpc(m, pol.id);
  expect(rPt.ok && rPt.texto && rPt.nome, 'falarNpc devia responder');
  m.jogador.idioma = 'en';
  const rEn = E.falarNpc(m, pol.id);
  expect(rEn.ok && rEn.texto, 'fala EN devia existir');
  expect(!/[⟨⟩|]/.test(rEn.texto), 'falas não deviam conter tokens Lume');
  m.jogador.idioma = 'pt';
  expect(!E.falarNpc(m, 'id-inexistente').ok, 'NPC desconhecido devia falhar');
});

teste('v10: loja dá desconto, farol aumenta rendimento da pesca, serialização completa', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  const item = 'picareta';
  const precoSemLoja = E.custoFerramenta(m, item);
  expect(precoSemLoja === CFG.ferramentas[item].custo, 'sem loja não há desconto');
  m.jogador.necessidades.dinheiro = 5000;
  E.anexarWestDocks(m);
  const precoComLoja = E.custoFerramenta(m, item);
  expect(precoComLoja < precoSemLoja, 'loja devia dar desconto: ' + precoComLoja + ' vs ' + precoSemLoja);
  expect(precoComLoja === Math.round(precoSemLoja * 0.85), 'desconto devia ser 15%');
  // ciclo JSON completo: reino, frota, fila de NPCs e edifícios sobrevivem
  for (let i = 0; i < 30; i++) E.tick(m);
  const dados = JSON.parse(E.serializar(m));
  expect(dados.westdocks && dados.westdocks.anexado, 'westdocks devia serializar');
  expect((dados.barcos || []).length === m.barcos.length, 'frota devia serializar');
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados), 'import falhou');
  expect(m2.westdocks && m2.westdocks.anexado, 'westdocks devia sobreviver ao ciclo JSON');
  expect(m2.barcos.length === m.barcos.length, 'barcos perdidos no ciclo JSON');
  expect(m2.construcoes.filter(c => c.criadoPor === 'westdocks').length === m.construcoes.filter(c => c.criadoPor === 'westdocks').length, 'edifícios WD perdidos');
  expect(E.custoFerramenta(m2, item) === precoComLoja, 'desconto da loja devia sobreviver');
  // mundos antigos sem westdocks migram limpos
  delete dados.westdocks; delete dados.barcos; delete dados.wdNpcQueue;
  const m3 = E.criarMundo(CFG);
  expect(E.deserializar(m3, dados), 'import legado falhou');
  expect(m3.westdocks === null && m3.barcos.length === 0, 'migração v9.2 → v10 devia ficar sem WestDocks');
});

teste('v10.1: travessia completa do ferri chega ao atracadouro e volta ao cais', () => {
  const m = E.criarMundo(CFG);
  const j = E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000;
  E.anexarWestDocks(m);
  const wd = m.westdocks;
  const ponte = { x: wd.ponte.x + wd.ponte.comprimento, y: wd.ponte.y };
  const ferri = m.barcos.find(b => b.tipo === 'ferri');
  ferri.x = wd.cais.x; ferri.y = wd.cais.y + 18; ferri.espera = 0;
  // ida: do cais até à cabeceira da ponte
  j.x = wd.cais.x; j.y = wd.cais.y;
  expect(E.jogadorNavegar(m).ok, 'embarque no cais');
  let t = 0;
  while (ferri.passageiro === j.id && t++ < 140) E.tick(m);
  expect(ferri.passageiro !== j.id, 'devia desembarcar na ida (140 ticks)');
  expect(Math.hypot(j.x - ponte.x, j.y - ponte.y) < 30, 'devia estar na cabeceira da ponte (d=' + Math.hypot(j.x - ponte.x, j.y - ponte.y).toFixed(0) + ')');
  // volta: da ponte até ao cais
  expect(E.jogadorNavegar(m).ok, 'embarque na ponte');
  t = 0;
  while (ferri.passageiro === j.id && t++ < 140) E.tick(m);
  expect(Math.hypot(j.x - wd.cais.x, j.y - wd.cais.y) < 30, 'devia voltar ao cais (d=' + Math.hypot(j.x - wd.cais.x, j.y - wd.cais.y).toFixed(0) + ')');
});

teste('v10.1: polícia de WestDocks afasta piratas (rendição com caserna/polícia)', () => {
  const m = E.criarMundo(CFG);
  E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000;
  E.anexarWestDocks(m);
  for (let i = 0; i < 60; i++) E.tick(m); // polícia chega em fib(7)
  expect(m.npcs.some(n => n.tipo === 'policia'), 'polícia devia existir');
  // pirata forçado junto da presa, com a guarda em terra (caserna presente na ilha)
  const presa = m.barcos.find(b => b.tipo !== 'pirata');
  const pirata = { ...presa, id: E.gerarId(), tipo: 'pirata', nome: 'Teste Negro', viva: true, rendicao: 0, carga: 0, espera: 0, destino: null, passageiro: null };
  pirata.x = presa.x + 10; pirata.y = presa.y + 5;
  m.barcos.push(pirata);
  let rendiu = false;
  for (let i = 0; i < 120 && !rendiu; i++) {
    E.tick(m);
    rendiu = !m.barcos.includes(pirata);
  }
  expect(rendiu, 'pirata devia render-se à guarda (caserna + polícia no mar)');
  expect(m.barcos.some(b => b.tipo !== 'pirata'), 'presa devia sobreviver ao abordamento');
});

teste('v10.2: capitão fala no embarque e pescaria a bordo paga com cooldown fib(4)', () => {
  const m = E.criarMundo(CFG);
  const j = E.entrarComoJogador(m, 'Criador');
  m.jogador.necessidades.dinheiro = 5000;
  E.anexarWestDocks(m);
  const wd = m.westdocks;
  const ferri = m.barcos.find(b => b.tipo === 'ferri');
  ferri.x = wd.cais.x; ferri.y = wd.cais.y + 18; ferri.espera = 0;
  j.x = wd.cais.x; j.y = wd.cais.y;
  // fala do capitão no embarque (PT; EN quando o Criador fala EN)
  const rb = E.jogadorNavegar(m);
  expect(rb.ok && rb.msg.includes('A bordo'), 'embarque devia ter msg');
  expect(/[a-zà-ú]/i.test(rb.msg), 'capitão devia falar no embarque: ' + rb.msg);
  expect(!/[⟨⟩|]/.test(rb.msg), 'capitão nunca fala Lume');
  m.jogador.idioma = 'en';
  let rbEn = E.jogadorNavegar(m); // ainda a bordo → desembarca por toggle
  if (rbEn.msg && rbEn.msg.includes('Desembarcaste')) rbEn = E.jogadorNavegar(m); // volta a embarcar com o capitão em EN
  expect(!rbEn.ok || /(Welcome|sailing|lighthouse|Hold|ship)/.test(rbEn.msg), 'capitão devia ter falas EN: ' + rbEn.msg);
  m.jogador.idioma = 'pt';
  // pescaria a bordo: paga, com cooldown fib(4)=3
  const carteira0 = j.necessidades.dinheiro;
  const r1 = E.jogadorPescarNoFerri(m);
  expect(r1.ok, 'pescaria a bordo devia funcionar: ' + (r1.erro || ''));
  expect(j.necessidades.dinheiro > carteira0, 'pescado devia pagar');
  expect(!E.jogadorPescarNoFerri(m).ok, 'linha devia estar a descansar (cooldown)');
  E.tick(m); E.tick(m); E.tick(m);
  expect(E.jogadorPescarNoFerri(m).ok, 'após 3 ticks devia poder pescar outra vez');
  // desembarca (toggle): fora do ferri a pescaria é recusada
  E.jogadorNavegar(m);
  expect(!E.jogadorPescarNoFerri(m).ok, 'fora do ferri não se pesca');
  // serialização preserva a frota com cooldown
  const dados = JSON.parse(E.serializar(m));
  const m2 = E.criarMundo(CFG);
  expect(E.deserializar(m2, dados) && m2.barcos.length === m.barcos.length, 'frota devia sobreviver ao ciclo JSON');
});

console.log(falhas === 0 ? '\n✅ Tudo passou.' : `\n❌ ${falhas} teste(s) falharam.`);
process.exit(falhas === 0 ? 0 : 1);
