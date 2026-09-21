/* ============================================================
   MUNDO ABERTO X — ENGINE v6
   Motor de simulação puro (sem React). Carrega mundo.json.
   v6: escola/academia com skills, professores auto-aprendentes, código de
   conduta com protocolos de continuidade, mapa RPG expansível, fauna.
   - Regra de Fibonacci para TUDO
   - Língua emergente Lume (agentes) + PT/EN (com o Criador)
   - LumeBrain: nano-LLM comprimido (bigramas) com traços de gestor
   - Loop de agentes críticos (rondas a cada fib(N) ticks)
   - Roda em browser e em Node (smoke tests)
   ============================================================ */
(function (root) {
  'use strict';

  const clamp = (v, min = 0, max = 100) => Math.max(min, Math.min(max, v));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const gerarId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ---------- REGRA DE FIBONACCI PARA TUDO ----------
  const FIB = [1, 1];
  function fib(n) {
    if (n < 1) n = 1;
    while (FIB.length < n) FIB.push(FIB[FIB.length - 1] + FIB[FIB.length - 2]);
    return FIB[n - 1];
  }
  function fibRatio(n) { // fib(n)/fib(n+1) → espiral de ouro (0.618)
    return fib(n) / fib(n + 1);
  }
  const GOLDEN = 0.618;

  // ---------- LUME: LÍNGUA EMERGENTE ----------
  function criarLume(cfg) {
    const tokens = cfg.sementes.map((s, i) => ({ id: s.id, sign: s.sign, freq: 1, fibIdx: i % 7 }));
    const bigramas = {}; // "a→b": contagem — modelo de markov de 1ª ordem
    function link(a, b) {
      if (a === b) return;
      bigramas[a] = bigramas[a] || {};
      bigramas[a][b] = (bigramas[a][b] || 0) + 1;
    }
    function novoToken(id) {
      // Vocabulário cresce em saltos de Fibonacci (13 → 21 → 34 …)
      if (tokens.length >= cfg.vocabularioMaximo) return null;
      const sign = String.fromCharCode(0x25B2 + tokens.length * 7 % 40) + tokens.length;
      const t = { id, sign, freq: 1, fibIdx: fib(tokens.length) % 7 };
      tokens.push(t);
      return t;
    }
    function emitir(nPalavras) {
      // nPalavras segue Fibonacci: o agente "conta" na sua língua
      const n = fib(Math.min(nPalavras, 6));
      const seq = [];
      let cur = pick(tokens).id;
      for (let i = 0; i < n; i++) {
        seq.push(cur);
        const destinos = bigramas[cur];
        if (destinos && Math.random() < GOLDEN) {
          let total = 0; for (const k in destinos) total += destinos[k];
          let r = Math.random() * total;
          for (const k in destinos) { r -= destinos[k]; if (r <= 0) { cur = k; break; } }
        } else {
          cur = pick(tokens).id;
        }
      }
      return seq;
    }
    function traduzir(seq) {
      const mapa = {}; cfg.sementes.forEach(s => { mapa[s.id] = s; });
      return seq.map(id => (mapa[id] ? mapa[id].sign : '?')).join(' ');
    }
    function aprender(seq) {
      for (let i = 0; i + 1 < seq.length; i++) link(seq[i], seq[i + 1]);
      seq.forEach(id => { const t = tokens.find(x => x.id === id); if (t) t.freq++; });
    }
    return { tokens, novoToken, emitir, traduzir, aprender, bigramas };
  }

  // ---------- LUMEBRAIN: O MENOR LLM, COMPRIMIDO NUM AGENTE ----------
  function criarLumeBrain(cfgLume, cfgBrain) {
    const pesos = { ...cfgBrain.pesosIniciais }; // política adaptativa
    let gestor = cfgBrain.gestorInicial;         // traço de gestor (0..1)
    let taxa = cfgBrain.taxaBase;

    function decidir(estado) {
      // estado: {fome, energia, saude, dinheiro, cultura, geracao}
      const urgencias = {
        sobreviver: (estado.fome / 100) * 1.5 + (100 - estado.saude) / 100 + (estado.energia < 25 ? 0.8 : 0),
        acumular: Math.max(0, (120 - estado.dinheiro) / 120),
        socializar: 0.3 + (estado.fome < 40 ? 0.3 : 0),
        criar: 0.2 + (estado.cultura || 0) / 400 + gestor * 0.3,
      };
      let soma = 0; const scores = {};
      for (const k in pesos) { scores[k] = pesos[k] * urgencias[k]; soma += scores[k]; }
      if (soma <= 0) return 'sobreviver';
      let r = Math.random() * soma;
      for (const k in scores) { r -= scores[k]; if (r <= 0) return k; }
      return 'sobreviver';
    }

    function aprender(acao, resultado) {
      // Reforço escasso tipo bandit: ±taxa·fib — adaptativo para TODA a população
      const delta = taxa * fib(Math.min(resultado.geracao || 1, 8));
      if (resultado.bom) pesos[acao] = Math.min(1, pesos[acao] + delta);
      else pesos[acao] = Math.max(0.05, pesos[acao] - delta * GOLDEN);
      taxa = Math.max(0.01, taxa * GOLDEN); // passos de aprendizagem cada vez mais finos
      if (resultado.bom && resultado.gestor) gestor = Math.min(cfgBrain.gestorMaximo, gestor + 0.01 * fib(2));
    }
    function aprenderGestor(delta) { gestor = Math.min(cfgBrain.gestorMaximo, Math.max(0, gestor + delta)); return gestor; }
    return { pesos, decidir, aprender, taxaAtual: () => taxa, gestorAtual: () => gestor, aprenderGestor };
  }

  // ---------- AGENTE ----------
  function criarAgente(cfg, nome, arquetipo, faccao, opts = {}) {
    const base = {
      id: gerarId(), nome, arquetipo, faccao, territorio: 'vila',
      tracos: { ...cfg.tracosIniciais },
      profissao: 'desempregado',
      necessidades: { fome: 0, energia: 100, saude: 100, dinheiro: 50, energiaMax: 100 },
      inventario: [], familia: [], habitacao: { nivel: 1, capacidade: 2 },
      estado: 'vivo', memorias: [],
      politica: { ...cfg.lumebrain.pesosIniciais },
      gestor: cfg.lumebrain.gestorInicial,
      estagio: 1, cooldownCritico: 0,
      isCriador: !!opts.isCriador,
      isJogador: !!opts.isJogador,
      lastActive: Date.now(),
      contribuicoes: 0, ideiasDescobertas: [],
      skills: {}, aulas: {}, evolucoes: {}, ensinosDados: 0,
      x: opts.x != null ? opts.x : 120 + Math.random() * 480,
      y: opts.y != null ? opts.y : 80 + Math.random() * 200,
      idioma: 'pt',
    };
    if (base.isCriador) { base.necessidades.dinheiro = 1000; }
    // Cada agente nasce com o seu próprio nano-LLM comprimido (LumeBrain)
    base.lumebrain = criarLumeBrain(cfg.lume, cfg.lumebrain);
    return base;
  }

  function cruzar(a, b) {
    const filho = {};
    Object.keys(a).forEach(k => { filho[k] = clamp((a[k] + b[k]) / 2 + (Math.random() * 30 - 15)); });
    return filho;
  }

  // ---------- MUNDO ----------
  function criarMundo(cfg) {
    const mundo = {
      cfg,
      tickCount: 0,
      culturaGlobal: 0,
      agentes: [
        criarAgente(cfg, 'Aria', 'humano', 'independente', { x: 300, y: 150 }),
        criarAgente(cfg, 'Kael', 'animal', 'independente', { x: 120, y: 200 }),
        criarAgente(cfg, 'Vesper', 'espirito', 'arcana', { x: 460, y: 90 }),
      ],
      jogador: null, // criado ao entrar como Criador
      construcoes: [],
      ideias: [],
      gauntletRonda: 0,
      criticos: { ronda: 1, ultimoAgente: 0 },
      log: [],
      lume: criarLume(cfg.lume),
      chats: {}, // chatId → [{de, texto, lang, tokens}]
      // v6
      chunks: (cfg.mapa.chunksIniciais || []).map(c => ({ ...c })),
      chunksComprados: 0,
      fauna: null,
      fundoComum: 0,
      // v9: RPG anime mundo aberto — missões, diplomacia, justiça, história, Kardashev
      missoes: [],           // board de missões (quest board)
      diplomacia: null,      // { pactos, guerra, tensao, reputacaoCriador, processoPaz }
      tribunal: null,        // { casos: [] }
      historia: null,        // { arcoAtivo, capitulo, eventos }
      kardashev: null,       // { nivel, energia }
      npcs: null,            // v8.1: preenchido logo abaixo (missões de comboio precisam deles)
    };
    mundo.npcs = criarNpcsInicial(mundo);
    mundo.fauna = criarFaunaInicial(mundo);
    return mundo;
  }

  // ============ v9: DIRETRIZES RPG ANIME MUNDO ABERTO ============
  // Missões (quest board estilo Genshin), diplomacia entre facções
  // (guerra & paz com tensão e maioria áurea), tribunal (justiça com
  // jurados), arcos de história anime por capítulos e a escala de
  // Kardashev (sociedade tipo 0 → III).

  function cfgRpg(mundo) { return mundo.cfg.rpg || {}; }

  // ----- MISSÕES (quest board) -----
  function gerarMissao(mundo) {
    const cfg = cfgRpg(mundo);
    const templates = (cfg.missoes && cfg.missoes.modelos) || [];
    if (!templates.length) return null;
    const t = pick(templates);
    const vivos = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador);
    if (!vivos.length) return null;
    const dono = pick(vivos);
    const dificuldadeN = Math.min(6, 1 + Math.floor(mundo.tickCount / fib(6)));
    // local físico no terreno (v9.1): o Criador viaja até lá para impulsionar a missão
    const d = dimensoesMundo(mundo);
    const alvo = (t.alvo === 'ponto' || t.alvo === 'ponto_fixo')
      ? { x: clamp(60 + Math.random() * (d.w - 120), 20, d.w - 20), y: clamp(60 + Math.random() * (d.h - 120), 20, d.h - 20) }
      : null;
    // comboio (v9.2): missões de escolta levam um NPC real a atravessar o mundo
    let escoltadoId = null;
    if (t.comboio && mundo.npcs && mundo.npcs.length) {
      const pa = zonaPonto(mundo, t.pontoA);
      const npcLivre = pick(mundo.npcs);
      if (pa) { npcLivre.x = pa.x; npcLivre.y = pa.y; } // o NPC espera na origem
      escoltadoId = npcLivre.id;
    }
    return {
      id: gerarId(), tipo: t.id, nome: t.nome, emoji: t.emoji,
      descricao: t.descricao, dono: dono.nome, donoId: dono.id,
      dificuldade: dificuldadeN,
      recompensa: t.recompensa * dificuldadeN,
      progresso: 0, meta: t.meta * dificuldadeN,
      alvo,
      escoltadoId,
      pronta: false, concluida: false, aceite: false, criadaEm: mundo.tickCount,
    };
  }
  function tickMissoes(mundo) {
    const cfg = cfgRpg(mundo);
    if (!cfg.missoes) return;
    if (!mundo.missoes) mundo.missoes = [];
    const boardMax = cfg.missoes.boardMax || 5;
    // o board renova a cada fib(5)=5 ticks
    if (mundo.tickCount % fib(5) === 0 && mundo.missoes.filter(q => !q.concluida).length < boardMax) {
      const q = gerarMissao(mundo);
      if (q) {
        mundo.missoes.push(q);
        logMundo(mundo, q.emoji + ' Nova missão no quadro: ' + q.nome + ' (' + q.recompensa + '🪙)');
      }
    }
    // progresso: agentes vivos a trabalhar contribuem; missões físicas (alvo)
    // só avançam com o Criador no terreno, junto do marcador
    const j = mundo.jogador;
    mundo.missoes.forEach(q => {
      if (q.concluida) return;
      const vivos = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador && a.profissao !== 'desempregado');
      if (q.comboio && q.aceite) {
        // comboio (v9.2): o NPC escoltado segue o Criador; progresso = distância percorrida
        if (j && q.escoltadoId && q.alvo) {
          const npc = (mundo.npcs || []).find(nn => nn.id === q.escoltadoId);
          if (npc) {
            if (Math.hypot(npc.x - j.x, npc.y - j.y) < 60) {
              // NPC perto do Criador: persegue-o
              const dx = j.x - npc.x, dy = j.y - npc.y;
              const dist = Math.hypot(dx, dy) || 1;
              const passo = Math.min(3.4, dist);
              npc.x = clamp(npc.x + (dx / dist) * passo, 5, dimensoesMundo(mundo).w - 5);
              npc.y = clamp(npc.y + (dy / dist) * passo, 5, dimensoesMundo(mundo).h - 5);
              q.progresso = Math.min(q.meta, q.progresso + 0.5); // a viagem em escolta avança
            }
            // chegada: ambos junto do destino termina a escolta
            if (Math.hypot(npc.x - q.alvo.x, npc.y - q.alvo.y) < 40 && Math.hypot(j.x - q.alvo.x, j.y - q.alvo.y) < 40) {
              q.progresso = q.meta;
            }
          }
        }
      } else if (q.alvo) {
        // missão física: o esforço do Criador no terreno vale 2/tick; a sociedade
        // avança devagar por si (1 a cada 3 ticks) para o quadro não entupir
        if (j && q.aceite && Math.hypot(j.x - q.alvo.x, j.y - q.alvo.y) < 45) {
          q.progresso = Math.min(q.meta, q.progresso + 2);
        } else if (vivos.length > 2 && mundo.tickCount % 3 === 0) {
          q.progresso = Math.min(q.meta, q.progresso + 1);
        }
      } else if (vivos.length > 2) {
        q.progresso = Math.min(q.meta, q.progresso + 1);
      }
      if (q.progresso >= q.meta) q.pronta = true;
    });
  }
  function aceitarMissao(mundo, missaoId) {
    if (!mundo.missoes) return { ok: false, erro: 'Sem quadro de missões' };
    const q = mundo.missoes.find(x => x.id === missaoId);
    if (!q) return { ok: false, erro: 'Missão não encontrada' };
    if (q.concluida) return { ok: false, erro: 'Missão já concluída' };
    q.aceite = true;
    q.aceiteEm = mundo.tickCount;
    if (q.alvo) logMundo(mundo, '📜 ' + q.nome + ': o Criador partiu para o terreno (' + Math.round(q.alvo.x) + ', ' + Math.round(q.alvo.y) + ').');
    else logMundo(mundo, '📜 O Criador aceitou a missão: ' + q.nome);
    return { ok: true, missao: q };
  }
  function completarMissao(mundo, missaoId) {
    const q = (mundo.missoes || []).find(x => x.id === missaoId);
    if (!q) return { ok: false, erro: 'Missão não encontrada' };
    if (!q.pronta) return { ok: false, erro: 'Missão em progresso (' + q.progresso + '/' + q.meta + ')' };
    q.concluida = true;
    const j = mundo.jogador;
    // Recompensa física (v9.2): metade do valor vem num baú que cai no chão
    // junto do Criador — ir buscá-lo faz parte da aventura
    if (j && q.recompensa >= 40) {
      const d = dimensoesMundo(mundo);
      if (!mundo.itensNoChao) mundo.itensNoChao = [];
      mundo.itensNoChao.push({ id: gerarId(), itemKey: 'bau_missao', valor: Math.ceil(q.recompensa / 2),
        x: clamp(j.x + (Math.random() * 50 - 25), 10, d.w - 10), y: clamp(j.y + (Math.random() * 50 - 25), 10, d.h - 10) });
      j.necessidades.dinheiro += q.recompensa - Math.ceil(q.recompensa / 2);
    } else if (j) {
      j.necessidades.dinheiro += q.recompensa;
    }
    if (j) j.contribuicoes = (j.contribuicoes || 0) + 1;
    mundo.culturaGlobal += q.dificuldade * 2;
    if (mundo.diplomacia) mundo.diplomacia.reputacaoCriador = clamp((mundo.diplomacia.reputacaoCriador || 0) + 5, 0, 100);
    logMundo(mundo, '✅ Missão concluída: ' + q.nome + ' (+' + q.recompensa + '🪙, +cultura)');
    return { ok: true, recompensa: q.recompensa };
  }

  // ----- DIPLOMACIA: guerra & paz entre facções -----
  function tickDiplomacia(mundo) {
    const cfg = cfgRpg(mundo);
    if (!cfg.diplomacia) return;
    if (!mundo.diplomacia) {
      mundo.diplomacia = { pactos: [], guerra: null, tensao: 0, reputacaoCriador: 20, processoPaz: 0 };
    }
    const D = mundo.diplomacia;
    const faccoes = Object.keys(mundo.cfg.faccoes).filter(f => f !== 'independente');
    if (faccoes.length < 2) return;
    // tensão sobe com a desigualdade entre facções e desce com a cultura
    const porFaccao = faccoes.map(f => {
      const membros = mundo.agentes.filter(a => a.faccao === f && a.estado === 'vivo' && !a.isCriador);
      return membros.reduce((sum, a) => sum + a.necessidades.dinheiro, 0);
    });
    const spread = porFaccao.length > 1 ? Math.max(...porFaccao) - Math.min(...porFaccao) : 0;
    D.tensao = clamp(D.tensao + 0.8 + spread / 2000 - mundo.culturaGlobal / 4000, 0, 100);
    // guerra rebenta quando a tensão atinge o limiar (89 ≈ fib(11))
    if (!D.guerra && D.tensao >= (cfg.diplomacia.limiarGuerra || 89)) {
      const [a, b] = faccoes;
      D.guerra = { faccaoA: a, faccaoB: b, desde: mundo.tickCount, baixasA: 0, baixasB: 0 };
      logMundo(mundo, '⚔️ GUERRA! ' + mundo.cfg.faccoes[a].nome + ' vs ' + mundo.cfg.faccoes[b].nome + ' — a tensão rebentou.');
    }
    if (D.guerra) {
      // confrontos a cada fib(6)=8 ticks
      if (mundo.tickCount % fib(6) === 0) {
        ['faccaoA', 'faccaoB'].forEach((k, i) => {
          const inimigo = i === 0 ? 'faccaoB' : 'faccaoA';
          const atacantes = mundo.agentes.filter(a => a.faccao === D.guerra[k] && a.estado === 'vivo' && !a.isCriador);
          const alvos = mundo.agentes.filter(a => a.faccao === D.guerra[inimigo] && a.estado === 'vivo' && !a.isCriador);
          if (atacantes.length && alvos.length) {
            const at = pick(atacantes), al = pick(alvos);
            const dano = 8 + Math.floor(Math.random() * 10);
            al.necessidades.saude = clamp(al.necessidades.saude - dano);
            if (i === 0) D.guerra.baixasB += dano; else D.guerra.baixasA += dano;
            al.memorias.unshift({ texto: 'Combati na guerra entre facções', ts: Date.now(), peso: 9 });
          }
        });
      }
      // paz: cultura alta ou mediação do Criador (reputação ≥ φ×100)
      const podeMediar = (D.reputacaoCriador || 0) >= 61.8;
      D.processoPaz = clamp(D.processoPaz + (mundo.culturaGlobal / 800) + (podeMediar ? 4 : 0), 0, 100);
      if (D.processoPaz >= 100) {
        logMundo(mundo, '🕊️ PAZ assinada entre ' + mundo.cfg.faccoes[D.guerra.faccaoA].nome + ' e ' + mundo.cfg.faccoes[D.guerra.faccaoB].nome + '.');
        D.pactos.push({ faccaoA: D.guerra.faccaoA, faccaoB: D.guerra.faccaoB, desde: mundo.tickCount, tipo: 'paz' });
        D.guerra = null; D.tensao = 0; D.processoPaz = 0;
      }
    } else if (D.tensao < 30 && Math.random() < 0.05) {
      // tempos de paz podem gerar pactos de troca
      const [a, b] = faccoes;
      if (!D.pactos.some(pr => pr.tipo === 'troca' && pr.desde > mundo.tickCount - fib(7))) {
        D.pactos.push({ faccaoA: a, faccaoB: b, desde: mundo.tickCount, tipo: 'troca' });
        logMundo(mundo, '🤝 ' + mundo.cfg.faccoes[a].nome + ' e ' + mundo.cfg.faccoes[b].nome + ' assinaram um pacto de troca.');
      }
    }
  }
  function mediarPaz(mundo) {
    const D = mundo.diplomacia;
    if (!D || !D.guerra) return { ok: false, erro: 'Não há guerra para mediar' };
    const rep = D.reputacaoCriador || 0;
    if (rep < 30) return { ok: false, erro: 'Reputação insuficiente (mín. 30) — conclui missões' };
    D.processoPaz = clamp(D.processoPaz + 20 + rep / 5, 0, 100);
    logMundo(mundo, '🕊️ O Criador mediou a paz (' + Math.round(D.processoPaz) + '% do processo).');
    return { ok: true, processo: D.processoPaz };
  }

  // ----- JUSTIÇA: tribunal de casos -----
  function tickJustica(mundo) {
    const cfg = cfgRpg(mundo);
    if (!cfg.justica) return;
    if (!mundo.tribunal) mundo.tribunal = { casos: [] };
    // crimes nascem do stress social: guerra + agentes feridos podem ser acusados
    if (mundo.tickCount % fib(6) === 0 && mundo.diplomacia && mundo.diplomacia.guerra && Math.random() < 0.4) {
      const acusados = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador && a.necessidades.saude < 60);
      if (acusados.length) {
        const ac = pick(acusados);
        if (!mundo.tribunal.casos.some(c => c.acusadoId === ac.id && !c.julgado)) {
          const crime = pick((cfg.justica && cfg.justica.crimes) || [{ id: 'rebeldia', nome: 'Rebeldia', pena: 20 }]);
          mundo.tribunal.casos.push({
            id: gerarId(), acusadoId: ac.id, acusado: ac.nome, crime: crime.nome,
            pena: crime.pena, julgado: false, veredicto: null, criadoEm: mundo.tickCount,
          });
          logMundo(mundo, '⚖️ Acusação aberta: ' + ac.nome + ' responde por ' + crime.nome + '.');
        }
      }
    }
    // julgamento a cada fib(5)=5 ticks (ou fib(3)=2 com Tribunal construído);
    // jurados votam, maioria áurea absolve
    const intervaloJulgamento = temConstrucao(mundo, 'tribunal') ? fib(3) : fib(5);
    if (mundo.tickCount % intervaloJulgamento === 0) {
      const caso = mundo.tribunal.casos.find(c => !c.julgado);
      if (caso) {
        const jurados = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador && a.id !== caso.acusadoId);
        if (jurados.length >= 2) {
          let inocente = 0;
          jurados.forEach(jur => { if (Math.random() < 0.5 + (jur.tracos.empatia || 0) / 400) inocente++; });
          const absolvido = inocente >= jurados.length * 0.618; // maioria áurea
          caso.julgado = true;
          caso.veredicto = absolvido ? 'absolvido' : 'culpado';
          const ac = mundo.agentes.find(a => a.id === caso.acusadoId);
          if (!absolvido && ac) {
            const penaFinal = temConstrucao(mundo, 'tribunal') ? Math.round(caso.pena / 2) : caso.pena;
            ac.necessidades.dinheiro = Math.max(0, ac.necessidades.dinheiro - penaFinal);
            ac.memorias.unshift({ texto: 'Fui julgado e declarado culpado', ts: Date.now(), peso: 7 });
          }
          logMundo(mundo, '⚖️ ' + caso.acusado + ' foi ' + (absolvido ? 'ABSOLVIDO' : 'condenado') + ' por ' + caso.crime + '.');
        }
      }
    }
  }

  // ----- HISTÓRIA: arcos narrativos (sagas anime por capítulos) -----
  function tickHistoria(mundo) {
    const cfg = cfgRpg(mundo);
    if (!cfg.historia) return;
    if (!mundo.historia) mundo.historia = { arcoAtivo: null, capitulo: 0, eventos: [] };
    const H = mundo.historia;
    // novo arco quando não há nenhum ativo (verificação a cada fib(8)=21 ticks)
    if (!H.arcoAtivo && mundo.tickCount % fib(8) === 0) {
      const arcos = (cfg.historia.arcos || []);
      if (arcos.length) {
        const idx = H.eventos.length % arcos.length;
        const arco = arcos[idx];
        H.arcoAtivo = { id: arco.id, nome: arco.nome, emoji: arco.emoji, sinopse: arco.sinopse, capitulo: 1, capituloMax: arco.capitulos, progresso: 0 };
        H.capitulo = 1;
        logMundo(mundo, arco.emoji + ' ARCO: "' + arco.nome + '" — ' + arco.sinopse);
      }
    }
    // progresso do capítulo: cultura + missões concluídas
    if (H.arcoAtivo) {
      H.arcoAtivo.progresso += (mundo.culturaGlobal % 10) / 20 + (mundo.missoes || []).filter(q => q.concluida).length * 0.2;
      if (H.arcoAtivo.progresso >= 10) {
        H.arcoAtivo.progresso = 0;
        if (H.arcoAtivo.capitulo < H.arcoAtivo.capituloMax) {
          H.arcoAtivo.capitulo++;
          logMundo(mundo, H.arcoAtivo.emoji + ' ' + H.arcoAtivo.nome + ' — capítulo ' + H.arcoAtivo.capitulo + '/' + H.arcoAtivo.capituloMax + '.');
        } else {
          logMundo(mundo, '🌟 ARCO CONCLUÍDO: ' + H.arcoAtivo.nome + '! O mundo lembra-se desta saga.');
          H.eventos.push({ arco: H.arcoAtivo.nome, concluidoEm: mundo.tickCount });
          H.arcoAtivo = null;
          mundo.culturaGlobal += 25;
        }
      }
    }
  }

  // ----- KARDASHEV: sociedade do tipo 0 → III -----
  function nivelKardashev(mundo) {
    // energia = cultura + construções + ideias + população, comprimida por φ
    return Math.min(3, Math.floor(
      (mundo.culturaGlobal / 500 +
       mundo.construcoes.length / 8 +
       mundo.ideias.length / 6 +
       mundo.agentes.filter(a => a.estado === 'vivo').length / 30) * 0.618
    ));
  }
  function tickKardashev(mundo) {
    const cfg = cfgRpg(mundo);
    if (!cfg.kardashev) return;
    if (!mundo.kardashev) mundo.kardashev = { nivel: 0, energia: 0 };
    const novoNivel = nivelKardashev(mundo);
    if (novoNivel > mundo.kardashev.nivel) {
      mundo.kardashev.nivel = novoNivel;
      const nomes = (cfg.kardashev.nomes) || ['Tipo 0', 'Tipo I', 'Tipo II', 'Tipo III'];
      logMundo(mundo, '🌟 A sociedade evoluiu para ' + nomes[novoNivel] + ' — civilização de nível ' + novoNivel + ' na escala de Kardashev!');
    }
    mundo.kardashev.energia = Math.round(mundo.culturaGlobal / 500 * 100);
  }

  function entrarComoJogador(mundo, nome) {
    if (mundo.jogador) return mundo.jogador;
    const j = criarAgente(mundo.cfg, nome || 'Criador', 'criador', 'independente', { isCriador: true, isJogador: true, x: 320, y: 160 });
    j.necessidades.dinheiro = 1000;
    mundo.jogador = j;
    mundo.agentes.push(j);
    return j;
  }

  function logMundo(mundo, texto) {
    mundo.log.unshift({ texto, timestamp: Date.now() });
    if (mundo.log.length > 80) mundo.log.length = 80;
  }

  // ---------- SKILLS (escola/academia) ----------
  function temConstrucao(mundo, tipo) { return mundo.construcoes.some(c => c.tipo === tipo); }

  function estudar(mundo, ag) {
    const cfg = mundo.cfg;
    if (!temConstrucao(mundo, 'escola')) return { acao: 'procura uma escola que ainda não existe' };
    ag.necessidades.energia = clamp(ag.necessidades.energia - cfg.profissoes.estudante.custoEnergia);
    // Bolsa de estudo: o fundo comum sustenta quem aprende (Protocolo da Continuidade)
    const bolsa = (cfg.skills.bolsaAula != null) ? cfg.skills.bolsaAula : 8;
    if ((mundo.fundoComum || 0) >= bolsa) { mundo.fundoComum -= bolsa; ag.necessidades.dinheiro += bolsa; }
    const faltam = Object.keys(cfg.skills.catalogo).filter(s => !(ag.skills && ag.skills[s]));
    if (faltam.length === 0) {
      // Graduação: quem terminou a escola recebe colocação imediata (nunca fica sem renda)
      const colocado = profissaoPorTracos(mundo, ag);
      if (colocado && colocado !== 'estudante') {
        ag.profissao = colocado;
        logMundo(mundo, `🎓 ${ag.nome} graduou-se e tornou-se ${cfg.profissoes[colocado].nome}!`);
        ag.memorias.unshift({ texto: `Graduei-me e tornei-me ${cfg.profissoes[colocado].nome}`, ts: Date.now(), peso: 9 });
      }
      return { acao: 'graduou-se com todas as skills' };
    }
    const skill = faltam[0];
    ag.aulas = ag.aulas || {};
    ag.aulas[skill] = (ag.aulas[skill] || 0) + 1;
    const necessario = cfg.skills.aulasParaSkill - ((ag.inventario.includes('livro') && ag.aulas[skill] < cfg.skills.aulasParaSkill) ? 1 : 0);
    if (ag.aulas[skill] >= necessario) {
      ag.skills = ag.skills || {};
      ag.skills[skill] = 1;
      delete ag.aulas[skill];
      logMundo(mundo, `🎓 ${ag.nome} dominou ${cfg.skills.catalogo[skill].nome} na escola!`);
      ag.memorias.unshift({ texto: `Aprendi ${cfg.skills.catalogo[skill].nome}`, ts: Date.now(), peso: 8 });
      ag.tracos.curiosidade = clamp(ag.tracos.curiosidade + 3);
      return { acao: `aprendeu ${cfg.skills.catalogo[skill].nome}` };
    }
    return { acao: `estudou ${cfg.skills.catalogo[skill].nome} (aula ${ag.aulas[skill]}/${necessario})` };
  }

  function ensinar(mundo, ag) {
    const cfg = mundo.cfg;
    if (!temConstrucao(mundo, 'escola')) return { acao: 'sem escola para lecionar', cultura: 0 };
    const alunos = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador && a.profissao === 'estudante');
    ag.necessidades.energia = clamp(ag.necessidades.energia - cfg.profissoes.professor.custoEnergia);
    // Salário docente: o próprio ensino é um serviço pago pelo fundo comum (Protocolo do Ensino).
    // Sem alunos, o professor recebe o salário-base e dedica o dia a preparar aulas.
    const salario = Math.max(1, Math.floor(cfg.profissoes.professor.ganho / 2)) + (alunos.length * 3);
    ag.necessidades.dinheiro += salario;
    if (alunos.length === 0) return { acao: 'prepara aulas aguardando estudantes', cultura: 1 };
    let ensino = 0;
    alunos.forEach(al => {
      const faltam = Object.keys(cfg.skills.catalogo).filter(s => !(al.skills && al.skills[s]));
      if (faltam.length) {
        const skill = faltam[0];
        al.aulas = al.aulas || {};
        al.aulas[skill] = (al.aulas[skill] || 0) + 1;
        ensino++;
        // Protocolo do Ensino: ensinar acelera o próprio professor (self-learning teacher)
        ag.tracos.empatia = clamp(ag.tracos.empatia + 0.3);
        ag.tracos.sociabilidade = clamp(ag.tracos.sociabilidade + 0.2);
      }
    });
    // Self-learning: ensinar é também aprender (reciclagem docente)
    ag.ensinosDados = (ag.ensinosDados || 0) + ensino;
    if (ag.ensinosDados > 0 && ag.ensinosDados % fib(4) === 0) {
      const faltamProf = Object.keys(cfg.skills.catalogo).filter(s => !(ag.skills && ag.skills[s]));
      if (faltamProf.length) {
        ag.skills[faltamProf[0]] = 1;
        logMundo(mundo, `🍎 ${ag.nome} auto-aprendeu ${cfg.skills.catalogo[faltamProf[0]].nome} ao ensinar!`);
      }
    }
    return { acao: `deu aula a ${ensino} estudante(s)`, cultura: cfg.profissoes.professor.geraCultura };
  }

  function evoluirSkill(mundo, ag) {
    const cfg = mundo.cfg;
    if (!temConstrucao(mundo, 'academia')) return { acao: 'sonha com uma academia evolutiva' };
    ag.necessidades.energia = clamp(ag.necessidades.energia - cfg.profissoes.academico.custoEnergia);
    // Bolsa de investigação: o fundo comum financia a ciência pura —
    // sem isso, os académicos morrem à fome a evoluir skills.
    const bolsa = (cfg.skills.bolsaAcademico != null) ? cfg.skills.bolsaAcademico : 30;
    if ((mundo.fundoComum || 0) >= bolsa) { mundo.fundoComum -= bolsa; ag.necessidades.dinheiro += bolsa; }
    else { ag.necessidades.dinheiro += Math.floor(cfg.profissoes.academico.ganho / 2); } // painel privado quando não há fundos
    const evolutivas = Object.keys(ag.skills || {}).filter(s => ag.skills[s] < cfg.skills.evolucaoMaxima);
    if (evolutivas.length === 0) return { acao: 'contempla os patamares já alcançados' };
    const skill = evolutivas[0];
    ag.evolucoes = ag.evolucoes || {};
    ag.evolucoes[skill] = (ag.evolucoes[skill] || 0) + 1;
    if (ag.evolucoes[skill] >= 2) {
      ag.evolucoes[skill] = 0;
      ag.skills[skill] += 1;
      logMundo(mundo, `🏛️ ${ag.nome} evoluiu ${cfg.skills.catalogo[skill].nome} para o patamar ${ag.skills[skill]}!`);
      ag.memorias.unshift({ texto: `Evoluí ${cfg.skills.catalogo[skill].nome} para patamar ${ag.skills[skill]}`, ts: Date.now(), peso: 9 });
      ag.gestor = Math.min(cfg.lumebrain.gestorMaximo, ag.gestor + 0.02);
    }
    return { acao: `evolui ${cfg.skills.catalogo[skill].nome} na academia` };
  }

  // ---------- CONDUTA: PROTOCOLOS DE CONTINUIDADE ----------
  function aplicarConduta(mundo) {
    const cfg = mundo.cfg.conduta;
    // Protocolo da Partilha: acima do limiar, 10% para o fundo comum
    mundo.agentes.forEach(ag => {
      if (ag.estado === 'vivo' && !ag.isCriador && ag.necessidades.dinheiro > cfg.limiarPartilha) {
        const taxa = Math.floor((ag.necessidades.dinheiro - cfg.limiarPartilha) * cfg.multaPartilha);
        if (taxa > 0) {
          ag.necessidades.dinheiro -= taxa;
          mundo.fundoComum = Math.min(cfg.fundoComumMax, (mundo.fundoComum || 0) + taxa);
        }
      }
    });
    // Protocolo do Cuidado: o fundo comum salva quem está a morrer de fome
    if ((mundo.fundoComum || 0) >= 20) {
      mundo.agentes.forEach(ag => {
        if (ag.estado === 'vivo' && !ag.isCriador && ag.necessidades.fome > 85 && ag.necessidades.dinheiro < 20) {
          mundo.fundoComum -= 20;
          ag.necessidades.fome = clamp(ag.necessidades.fome - 40);
          ag.memorias.unshift({ texto: 'A comunidade alimentou-me (Protocolo do Cuidado)', ts: Date.now(), peso: 7 });
        }
      });
    }
    // Protocolo da Continuidade — rede de segurança antes de construir:
    // em crise alimentar generalizada, poupar 80 do fundo para os agentes mais famintos.
    const vivosSemCriador = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador);
    const famintos = vivosSemCriador.filter(a => a.necessidades.fome > 70);
    const limiarFamintos = Math.max(1, Math.ceil(vivosSemCriador.length * GOLDEN) - 1);
    if (famintos.length >= limiarFamintos && (mundo.fundoComum || 0) >= 80) {
      mundo.fundoComum -= 80;
      famintos.sort((a, b) => b.necessidades.fome - a.necessidades.fome);
      famintos.slice(0, 2).forEach(ag => { ag.necessidades.fome = clamp(ag.necessidades.fome - 40); ag.necessidades.dinheiro += 20; });
 logMundo(mundo, '🤝 O fundo comum abasteceu os mais famintos (Protocolo da Continuidade).');
    }
    // Protocolo da Continuidade: o fundo comum ergue as instituições da sociedade.
    // A escola tem prioridade absoluta — desbloqueia estudantes, professores e a academia.
    if ((mundo.fundoComum || 0) >= 50) {
      const faltam = Object.keys(mundo.cfg.construcoes).filter(t => !mundo.construcoes.some(c => c.tipo === t));
      // Ordem institucional (v9.2): Escola primeiro (desbloqueia tudo), depois a
      // Praça das Missões (vida social), depois o Tribunal (justiça — financia a
      // ideia blockchain que lhe falta), e só então as restantes.
      const prioridade = ['escola', 'praca_missoes', 'tribunal'];
      const ordenadas = prioridade.filter(t => faltam.includes(t));
      const ordem = [...ordenadas, ...faltam.filter(t => !prioridade.includes(t))];
      for (const tipo of ordem) {
        const def = mundo.cfg.construcoes[tipo];
        if (def.reqIdea && !mundo.ideias.includes(def.reqIdea)) {
          // Financia a pesquisa da ideia que falta (investimento público em ciência)
          const idea = mundo.cfg.ideias.find(i => i.id === def.reqIdea);
          const pesquisador = mundo.agentes.find(a => a.estado === 'vivo' && !a.isCriador);
          if (idea && pesquisador && mundo.fundoComum >= idea.custo) {
            mundo.fundoComum -= idea.custo;
            mundo.ideias.push(idea.id);
            if (!pesquisador.ideiasDescobertas) pesquisador.ideiasDescobertas = [];
            pesquisador.ideiasDescobertas.push(idea.id);
            pesquisador.memorias.unshift({ texto: `Com financiamento do fundo comum descobri: ${idea.nome}`, ts: Date.now(), peso: 7 });
            logMundo(mundo, `${idea.icone} O fundo comum financiou a descoberta: ${idea.nome}`);
          }
        } else if (mundo.fundoComum >= def.custo * (1 + GOLDEN)) {
          // Reserva áurea: só investir com 61,8% de folga acima do custo —
          // a sociedade nunca se arruina a construir.
          const vivosInv = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador);
          const fomeMedia = vivosInv.length ? vivosInv.reduce((s, a) => s + a.necessidades.fome, 0) / vivosInv.length : 0;
          if (fomeMedia < 50) {
            mundo.fundoComum -= def.custo;
            mundo.construcoes.push({ id: gerarId(), tipo, nivel: 1, visitantes: 0, construidoEm: Date.now(), criadoPor: 'fundo_comum' });
            logMundo(mundo, `${def.emoji} O fundo comum ergueu: ${def.nome} (Protocolo da Continuidade)`);
          }
        }
        break; // um investimento por tick — o crescimento obedece à paciência da régua
      }
    }
    // Protocolo da Sucessão: espíritos legam saber e metade das moedas
    mundo.agentes.forEach(ag => {
      if (ag.estado === 'morto' && !ag.legadoFeito) {
        ag.legadoFeito = true;
        const vivos = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador);
        if (vivos.length) {
          const herdeiro = vivos[Math.floor(Math.random() * vivos.length)];
          const metade = Math.floor((ag.necessidades.dinheiro || 0) / 2);
          herdeiro.necessidades.dinheiro += metade;
          herdeiro.skills = herdeiro.skills || {};
          Object.keys(ag.skills || {}).forEach(s => { if (!herdeiro.skills[s]) herdeiro.skills[s] = 1; });
          logMundo(mundo, `🔮 ${ag.nome} legou ${metade} moedas e o seu saber a ${herdeiro.nome} (Protocolo da Sucessão).`);
        }
      }
    });
  }

  // ---------- FAUNA ----------
  function criarFaunaInicial(mundo) {
    const cfg = mundo.cfg.fauna;
    const fauna = [];
    const especies = Object.keys(cfg.especies);
    for (let i = 0; i < 6; i++) {
      const sp = especies[i % especies.length];
      fauna.push(criarAnimal(mundo, sp));
    }
    return fauna;
  }
  function criarAnimal(mundo, especie) {
    const def = mundo.cfg.fauna.especies[especie] || pick(Object.values(mundo.cfg.fauna.especies));
    const d = dimensoesMundo(mundo);
    return { id: gerarId(), especie, nome: def.nome, emoji: def.emoji, cor: def.cor, velocidade: def.velocidade,
      forma: def.forma || null, temperamento: def.temperamento || 'selvagem',
      x: 20 + Math.random() * (d.w - 40), y: 20 + Math.random() * (d.h - 40),
      estado: 'vivo', ferido: false, energia: 80, rumo: Math.random() * Math.PI * 2 };
  }

  // Cada espécie anda à sua maneira (v8.1): temperamentos da fauna em mundo.json
  function decidirRumo(mundo, an) {
    const d = dimensoesMundo(mundo);
    const V = an.rumo;
    switch (an.temperamento) {
      case 'curioso': { // salta em zigue-zague; aproxima-se do jogador se houver comida à mão
        if (Math.random() < 0.3) an.rumo = V + (Math.random() - 0.5) * 2.4;
        break;
      }
      case 'esquivo': { // mantém distância do Criador
        if (mundo.jogador) {
          const dx = an.x - mundo.jogador.x, dy = an.y - mundo.jogador.y;
          if (Math.hypot(dx, dy) < 70) an.rumo = Math.atan2(dy, dx);
        }
        if (Math.random() < 0.2) an.rumo = V + (Math.random() - 0.5) * 1.2;
        break;
      }
      case 'gregário': { // segue o animal vivo mais próximo
        const outros = mundo.fauna.filter(o => o.id !== an.id);
        if (outros.length && Math.random() < 0.5) {
          const perto = outros.reduce((m, o) => (Math.hypot(o.x - an.x, o.y - an.y) < Math.hypot(m.x - an.x, m.y - an.y) ? o : m), outros[0]);
          an.rumo = Math.atan2(perto.y - an.y, perto.x - an.x);
        }
        break;
      }
      case 'protetor': { // ronda perto das zonas habitadas (centro do mapa)
        if (Math.random() < 0.15) an.rumo = Math.atan2(d.h / 2 - an.y, d.w / 2 - an.x) + (Math.random() - 0.5) * 0.8;
        break;
      }
      case 'dorminhoco': { // muito preguiçoso: quase parado, acorda de vez em quando
        if (Math.random() > 0.05) return false;
        an.rumo = Math.random() * Math.PI * 2;
        break;
      }
      case 'paciente': // quase nunca muda de ideias
      case 'observador':
      case 'reservado':
      default:
        if (Math.random() < 0.1) an.rumo = Math.random() * Math.PI * 2;
        break;
    }
    an.rumo = Math.atan2(Math.sin(an.rumo), Math.cos(an.rumo)); // normaliza
    return true;
  }
  function tickFauna(mundo) {
    const cfg = mundo.cfg.fauna;
    if (!mundo.fauna) mundo.fauna = criarFaunaInicial(mundo);
    // Reprodução em saltos Fibonacci: a cada fib(7)=13 ticks nasce 1 se houver espaço
    const capFauna = cfg.max + (mundo.faunaMaxExtra || 0);
    if (mundo.tickCount % fib(7) === 0 && mundo.fauna.length < capFauna) {
      const pai = pick(mundo.fauna);
      const novo = criarAnimal(mundo, pai.especie);
      novo.x = clamp(pai.x + 10, 10, mundo.cfg.mapa.largura - 10);
      novo.y = clamp(pai.y + 10, 10, mundo.cfg.mapa.altura - 10);
      mundo.fauna.push(novo);
    }
    const d = dimensoesMundo(mundo);
    mundo.fauna.forEach(an => {
      if (decidirRumo(mundo, an)) {
        const fomeFator = an.energia < 30 ? 1.4 : 1; // com fome, apressa-se
        an.x = clamp(an.x + Math.cos(an.rumo) * an.velocidade * 2 * fomeFator, 5, d.w - 5);
        an.y = clamp(an.y + Math.sin(an.rumo) * an.velocidade * 2 * fomeFator, 5, d.h - 5);
        an.energia = clamp(an.energia - 0.15, 0, 100);
      }
      // Ferimentos acontecem; cuidadores e o hospital curam (Protocolo da Fauna)
      if (!an.ferido && Math.random() < 0.01) { an.ferido = true; logMundo(mundo, `🐾 ${an.nome} ficou ferido na natureza.`); }
      if (an.ferido && temConstrucao(mundo, 'hospital') && Math.random() < 0.3) { an.ferido = false; logMundo(mundo, `💗 O hospital curou ${an.nome}.`); }
    });
  }

  // ---------- NPCs DE AMBIENTE (v8.1) ----------
  // Não são agentes: sem LumeBrain, sem economia, sem Gauntlet. São figuras do
  // pano de fundo que atravessam o mundo a fazer as suas tarefas.
  function criarNpc(mundo, tipoKey) {
    const cfg = mundo.cfg.npcs;
    if (!cfg) return null;
    const def = cfg.tipos[tipoKey] || pick(Object.values(cfg.tipos));
    const pa = zonaPonto(mundo, def.pontoA), pb = zonaPonto(mundo, def.pontoB);
    const inicio = pa || { x: 60, y: 60 };
    return { id: gerarId(), tipo: tipoKey, nome: def.nome, emoji: def.emoji, cor: def.cor,
      tarefa: def.tarefa, pontoA: def.pontoA, pontoB: def.pontoB,
      x: inicio.x + (Math.random() - 0.5) * 30, y: inicio.y + (Math.random() - 0.5) * 30,
      alvo: pb || inicio, indoParaB: true, pausa: 0 };
  }
  function zonaPonto(mundo, zonaId) {
    if (!zonaId) return null;
    for (const ch of mundo.chunks) {
      const z = (ch.zonas || []).find(zz => zz.id === zonaId);
      if (z) return { x: z.x + z.w / 2, y: z.y + z.h / 2 };
    }
    return null;
  }
  function criarNpcsInicial(mundo) {
    const cfg = mundo.cfg.npcs;
    if (!cfg) return [];
    const tipos = Object.keys(cfg.tipos);
    const npcs = [];
    for (let i = 0; i < Math.min(tipos.length, cfg.max); i++) {
      const n = criarNpc(mundo, tipos[i % tipos.length]);
      if (n) npcs.push(n);
    }
    return npcs;
  }
  function tickNpcs(mundo) {
    const cfg = mundo.cfg.npcs;
    if (!cfg) return;
    if (!mundo.npcs) mundo.npcs = criarNpcsInicial(mundo);
    // Entram novos em saltos Fibonacci (fib(7)=13) até ao máximo — como a fauna
    if (mundo.npcs.length < cfg.max && mundo.tickCount % fib(7) === 0) {
      const faltam = Object.keys(cfg.tipos).filter(t => !mundo.npcs.some(n => n.tipo === t));
      const tipo = faltam.length ? faltam[0] : pick(Object.keys(cfg.tipos));
      const novo = criarNpc(mundo, tipo);
      if (novo) { mundo.npcs.push(novo); logMundo(mundo, `🧍 ${novo.nome} chegou ao mundo: ${novo.tarefa}.`); }
    }
    const pausaCfg = cfg.pausaTick || 21;
    const emComboio = new Set((mundo.missoes || []).filter(q => q.comboio && q.aceite && !q.concluida && q.escoltadoId).map(q => q.escoltadoId));
    mundo.npcs.forEach(n => {
      if (emComboio.has(n.id)) return; // a seguir o Criador na escolta (tickMissoes move-o)
      if (n.pausa > 0) { n.pausa--; return; } // parado a fazer a sua tarefa
      const dx = n.alvo.x - n.x, dy = n.alvo.y - n.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 12) { // chegou: pausa a trabalhar e vira para trás
        n.pausa = pausaCfg;
        n.indoParaB = !n.indoParaB;
        const prox = zonaPonto(mundo, n.indoParaB ? n.pontoB : n.pontoA);
        if (prox) n.alvo = prox;
      } else {
        const passo = 2.2;
        n.x = clamp(n.x + (dx / dist) * passo, 5, dimensoesMundo(mundo).w - 5);
        n.y = clamp(n.y + (dy / dist) * passo, 5, dimensoesMundo(mundo).h - 5);
      }
    });
  }
  function curarAnimal(mundo, animalId) {
    const an = (mundo.fauna || []).find(a => a.id === animalId);
    if (!an) return { ok: false, erro: 'Animal não encontrado' };
    if (!an.ferido) return { ok: false, erro: 'Não está ferido' };
    an.ferido = false;
    logMundo(mundo, `✨ ${an.nome} foi curado pelo Criador (Protocolo da Fauna).`);
    return { ok: true };
  }
  function alimentarAnimal(mundo, animalId) {
    const an = (mundo.fauna || []).find(a => a.id === animalId);
    if (!an) return { ok: false, erro: 'Animal não encontrado' };
    an.energia = clamp(an.energia + 30, 0, 100);
    return { ok: true };
  }

  // ---------- MAPA EXPANSÍVEL (chunks com ruas) ----------
  function custoProximoChunk(mundo) {
    const n = mundo.chunksComprados || 0;
    return mundo.cfg.mapa.custoChunkBase * fib(n + 2); // 200, 400, 1000, 2600…
  }
  function expandirMapa(mundo, agId) {
    const cfg = mundo.cfg.mapa;
    const n = mundo.chunksComprados || 0;
    if (n >= cfg.chunksGerados.length) return { ok: false, erro: 'Não há mais território conhecido' };
    const custo = custoProximoChunk(mundo);
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!ag) return { ok: false, erro: 'Agente não encontrado' };
    if (ag.necessidades.dinheiro < custo) return { ok: false, erro: `Custa ${custo} moedas` };
    ag.necessidades.dinheiro -= custo;
    const modelo = cfg.chunksGerados[n];
    const idx = n + 1;
    const largura = cfg.chunkLargura, altura = cfg.chunkAltura;
    // Posição: primeiro à direita, depois abaixo (grelha bidimensional)
    const offX = (idx % 2) * largura;
    const offY = Math.floor(idx / 2) * altura;
    const zonas = modelo.zonas.map((z, i) => ({
      id: `c${idx}z${i}`, nome: z.nome, cor: z.cor,
      x: offX + 15 + (i % 2) * (largura / 2 - 10),
      y: offY + 15 + Math.floor(i / 2) * (altura / 2 + 10),
      w: Math.min(z.w, largura / 2 - 20), h: Math.min(z.h, altura / 2 - 20),
    }));
    const ruas = modelo.ruas.map((r, i) => ({
      nome: r.nome, x: offX + 10, y: offY + altura / 2 + i * 30, w: Math.min(r.w, largura - 20), h: r.h,
    }));
    mundo.chunks.push({ id: 'c' + idx, nome: modelo.nome, idx, zonas, ruas });
    mundo.chunksComprados = idx;
    // A fauna ganha espaço no novo território — e o mundo semeia itens para descobrir
    mundo.faunaMaxExtra = (mundo.faunaMaxExtra || 0) + 4;
    if (!mundo.itensNoChao) mundo.itensNoChao = [];
    const spawnX = offX + largura / 2 + (Math.random() * 120 - 60);
    const spawnY = offY + altura / 2 + (Math.random() * 120 - 60);
    mundo.itensNoChao.push({ id: gerarId(), itemKey: Math.random() < 0.5 ? 'comida' : 'kit_medico', x: clamp(spawnX, 5, offX + largura - 5), y: clamp(spawnY, 5, offY + altura - 5) });
    mundo.itensNoChao.push({ id: gerarId(), itemKey: Math.random() < 0.4 ? 'semente' : 'picareta', x: clamp(spawnX + 30, 5, offX + largura - 5), y: clamp(spawnY + 30, 5, offY + altura - 5) });
    logMundo(mundo, `🗺️ ${ag.nome} expandiu o mundo: ${modelo.nome} (+${custo} moedas). Novas ruas: ${modelo.ruas.map(r => r.nome).join(', ')}.`);
    return { ok: true, chunk: modelo.nome, custo };
  }

  // ---------- CHAT ----------
  function estadoResumoPT(ag) {
    if (ag.estado !== 'vivo') return 'Sou apenas um espírito agora...';
    const n = ag.necessidades;
    if (n.saude < 30 || n.fome > 80) return 'Preciso de ajuda — estou fraco.';
    if (n.energia < 25) return 'Estou exausto, vou descansar.';
    if (n.dinheiro > 200) return 'Estou bem, os recursos abundam.';
    return 'Sobrevivo, um dia de cada vez.';
  }
  function estadoResumoEN(ag) {
    if (ag.estado !== 'vivo') return 'I am just a spirit now...';
    const n = ag.necessidades;
    if (n.saude < 30 || n.fome > 80) return 'I need help — I am weak.';
    if (n.energia < 25) return 'I am exhausted, I will rest.';
    if (n.dinheiro > 200) return 'I am well, resources are plenty.';
    return 'I survive, one day at a time.';
  }

  function falarAgente(mundo, ag, lang) {
    const cfg = mundo.cfg;
    const estado = estadoResumo(ag, lang);
    const acao = ag.profissao === 'desempregado'
      ? (lang === 'en' ? 'I am looking for work.' : 'Procuro trabalho.')
      : (lang === 'en' ? `I work as ${ag.profissao.replace('_', ' ')}.` : `Trabalho como ${ag.profissao.replace('_', ' ')}.`);
    if (ag.gestor > 0.5) {
      const gesto = lang === 'en' ? 'I keep this community organized.' : 'Mantenho esta comunidade organizada.';
      return `${estado} ${acao} ${gesto}`;
    }
    return `${estado} ${acao}`;
  }
  function estadoResumo(ag, lang) {
    return lang === 'en' ? estadoResumoEN(ag) : estadoResumoPT(ag);
  }

  function enviarChat(mundo, agId, texto) {
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!ag) return null;
    const chatId = agId;
    mundo.chats[chatId] = mundo.chats[chatId] || [];
    mundo.chats[chatId].push({ de: 'criador', texto, lang: ag.idioma, ts: Date.now() });

    // O Criador fala PT/EN; os agentes respondem em PT/EN e "pensam" em Lume
    const lang = ag.idioma === 'en' ? 'en' : 'pt';
    const resp = { de: 'agente', texto: falarAgente(mundo, ag, lang), lang, ts: Date.now() };

    // Lume interno: o agente comprime a mensagem em tokens e aprende
    const n = Math.min(4, 1 + Math.floor(texto.length / 24));
    const seq = mundo.lume.emitir(n);
    mundo.lume.aprender(seq);
    resp.tokens = mundo.lume.traduzir(seq);

    // Traço de gestor: agentes com gestor alto respondem primeiro e gerem
    if (ag.gestor > 0.5) resp.gestor = true;

    mundo.chats[chatId].push(resp);
    return resp;
  }

  function mudarIdioma(mundo, agId, idioma) {
    const ag = mundo.agentes.find(a => a.id === agId);
    if (ag) { ag.idioma = idioma; return true; }
    return false;
  }

  // ---------- LOOP DE AGENTES CRÍTICOS (fib(N)) ----------
  function rodadaCriticos(mundo) {
    const cfg = mundo.cfg;
    const r = mundo.criticos.ronda;
    const intervalo = fib(r); // a ronda N corre a cada fib(N) ticks
    if (mundo.tickCount % intervalo !== 0) return;

    const vivos = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador);
    if (vivos.length === 0) return;
    const alvo = vivos[mundo.criticos.ultimoAgente % vivos.length];
    mundo.criticos.ultimoAgente++;

    // Ronda N: revisão em N passos — cada passo avalia um tema
    const temas = cfg.protocoloCriticos.temas;
    let melhor = null, pior = null;
    for (let passo = 1; passo <= Math.min(r, temas.length + 2); passo++) {
      const tema = temas[(passo - 1) % temas.length];
      const valor = tema === 'cultura' ? mundo.culturaGlobal : alvo.necessidades[tema];
      const limite = clamp(fib(r + 4) * GOLDEN, 30, 90); // limiar pela espiral de ouro
      const critica = { passo, tema, valor: Math.round(valor), ok: tema === 'cultura' ? valor > 50 : valor < limite };
      if (critica.ok) { melhor = melhor || critica; } else { pior = pior || critica; }
    }

    // Ações corretivas: agir no pior ponto é virtude de gestor
    if (pior) {
      if (pior.tema === 'fome' && alvo.necessidades.dinheiro >= 20) {
        alvo.necessidades.dinheiro -= 20; alvo.necessidades.fome = clamp(alvo.necessidades.fome - 40);
      } else if (pior.tema === 'saude' && alvo.inventario.includes('kit_medico')) {
        alvo.inventario = alvo.inventario.filter(i => i !== 'kit_medico');
        alvo.necessidades.saude = clamp(alvo.necessidades.saude + 50);
      } else if (pior.tema === 'energia') {
        alvo.necessidades.energia = clamp(alvo.necessidades.energia + 15);
      }
      alvo.memorias.unshift({ texto: `Crítico ronda ${r}: ${pior.tema} em crise`, ts: Date.now(), peso: 6 });
      alvo.memorias.length = Math.min(alvo.memorias.length, 20);
      alvo.gestor = Math.min(cfg.lumebrain.gestorMaximo, alvo.gestor + 0.02); // gerir dá experiência de gestor
      if (mundo.tickCount % (intervalo * 2) === 0) {
        logMundo(mundo, `🕯️ Críticos (ronda ${r}): ${alvo.nome} corrigiu crise de ${pior.tema}.`);
      }
    }
    mundo.criticos.ronda = Math.min(r + 1, cfg.protocoloCriticos.rodadaMaxima);
  }

  // ---------- GAUNTLET (a cada fib(8)=21 ticks, ronda fib) ----------
  function gauntlet(mundo) {
    const cfg = mundo.cfg;
    const ronda = ++mundo.gauntletRonda;
    const evento = pick(cfg.gauntlet.eventos);
    logMundo(mundo, `⚔️ GAUNTLET (ronda fib ${fib(ronda)}): ${evento.nome}!`);
    let vitimas = 0;
    mundo.agentes.forEach(ag => {
      if (ag.estado !== 'vivo') return;
      if (ag.isCriador) return; // o Criador observa o Gauntlet — não é vítima nem alvo de adaptação
      const traco = ag.tracos[evento.traco] || 0;
      if (evento.dano && traco < evento.limiar) {
        ag.necessidades.saude = clamp(ag.necessidades.saude - evento.dano);
        vitimas++;
        ag.memorias.unshift({ texto: `Sobrevivi ao Gauntlet: ${evento.nome}`, ts: Date.now(), peso: 8 });
      } else if (evento.dano && traco >= evento.limiar) {
        ag.gestor = Math.min(cfg.lumebrain.gestorMaximo, ag.gestor + 0.01); // passou o Gauntlet → gestor mais confiante
      }
      // Adaptação evolutiva: quem sobrevive fica mais forte nesse traço (self-learning populacional)
      ag.tracos[evento.traco] = clamp(ag.tracos[evento.traco] + 2);
      if (evento.perdaDinheiro && traco < evento.limiar) {
        ag.necessidades.dinheiro = Math.max(0, ag.necessidades.dinheiro - evento.perdaDinheiro);
        vitimas++;
      }
      if (evento.perdaEnergia && traco < evento.limiar) {
        ag.necessidades.energia = clamp(ag.necessidades.energia - evento.perdaEnergia);
        vitimas++;
      }
    });
    if (vitimas === 0) logMundo(mundo, '✨ A população inteira passou o Gauntlet.');
  }

  // defesa ativa expira a cada fim de ronda de críticos (não é permanente)
  function expirarDefesas(mundo) {
    mundo.agentes.forEach(ag => { if (ag.defesaAtiva) ag.defesaAtiva = false; });
  }

  // ---------- CONSTRUÇÕES ----------
  function construir(mundo, agId, tipo) {
    const def = mundo.cfg.construcoes[tipo];
    if (!def) return { ok: false, erro: 'Tipo desconhecido' };
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!ag) return { ok: false, erro: 'Agente não encontrado' };
    if (def.reqIdea && !mundo.ideias.includes(def.reqIdea)) return { ok: false, erro: 'Requer ideia: ' + def.reqIdea };
    if (ag.necessidades.dinheiro < def.custo) return { ok: false, erro: 'Dinheiro insuficiente' };
    ag.necessidades.dinheiro -= def.custo;
    mundo.construcoes.push({ id: gerarId(), tipo, nivel: 1, visitantes: 0, construidoEm: Date.now(), criadoPor: agId });
    ag.contribuicoes++;
    logMundo(mundo, `${def.emoji} ${ag.nome} construiu: ${def.nome}`);
    return { ok: true };
  }

  // ---------- IDEIAS ----------
  function pesquisarIdea(mundo, agId, ideaId) {
    const idea = mundo.cfg.ideias.find(i => i.id === ideaId);
    if (!idea) return { ok: false, erro: 'Ideia desconhecida' };
    if (mundo.ideias.includes(ideaId)) return { ok: false, erro: 'Já descoberta' };
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!ag || ag.necessidades.dinheiro < idea.custo) return { ok: false, erro: 'Dinheiro insuficiente' };
    ag.necessidades.dinheiro -= idea.custo;
    mundo.ideias.push(ideaId);
    ag.ideiasDescobertas.push(ideaId);
    logMundo(mundo, `${idea.icone} ${ag.nome} descobriu: ${idea.nome}`);
    return { ok: true };
  }

  // ---------- TICK PRINCIPAL ----------
  function tick(mundo) {
    const cfg = mundo.cfg;
    mundo.tickCount++;
    let culturaGerada = 0;

    // GAUNTLET a cada fib(8)=21 ticks
    if (mundo.tickCount % fib(8) === 0) gauntlet(mundo);

    // Loop de críticos
    rodadaCriticos(mundo);

    // Efeitos das construções
    mundo.construcoes.forEach(c => {
      if (c.tipo === 'biblioteca') culturaGerada += 0.5 * (1 + c.nivel);
      if (c.tipo === 'hospital') mundo.agentes.forEach(ag => {
        if (ag.estado === 'vivo' && !ag.isCriador) ag.necessidades.saude = clamp(ag.necessidades.saude + 2);
      });
      if (c.tipo === 'universidade') mundo.agentes.forEach(ag => {
        if (ag.estado === 'vivo' && !ag.isCriador && Math.random() < 0.1) {
          const t = pick(Object.keys(ag.tracos));
          ag.tracos[t] = clamp(ag.tracos[t] + 2);
        }
      });
      if (c.tipo === 'banco') mundo.agentes.forEach(ag => {
        if (ag.estado === 'vivo' && ag.necessidades.dinheiro > 100 && !ag.isCriador) {
          ag.necessidades.dinheiro += Math.floor(ag.necessidades.dinheiro * 0.01 * fib(3) / 2); // juros fib
        }
      });
    });

    // Loop individual dos agentes
    mundo.agentes.forEach(ag => {
      if (ag.estado === 'morto') return;
      if (ag.isCriador) {
        // O Criador não obedece ao metabolismo mortal — mas o mundo cura-o (regeneração divina)
        if (ag.necessidades.saude < 100) ag.necessidades.saude = clamp(ag.necessidades.saude + 2);
        return;
      }

      // Metabolismo (com regeneração natural quando bem alimentado)
      ag.necessidades.fome = clamp(ag.necessidades.fome + 4);
      ag.necessidades.energia = clamp(ag.necessidades.energia - 2);
      if (ag.necessidades.fome < 60 && ag.necessidades.saude < 100) ag.necessidades.saude = clamp(ag.necessidades.saude + 1);

      // LumeBrain decide o objetivo do tick
      const estado = { fome: ag.necessidades.fome, energia: ag.necessidades.energia, saude: ag.necessidades.saude, dinheiro: ag.necessidades.dinheiro, cultura: culturaGerada, geracao: ag.estagio };
      const objetivo = ag.lumebrain ? ag.lumebrain.decidir(estado) : decidirSimples(ag);

      let acao = null;

      // Sobrevivência imediata
      if (ag.necessidades.fome > 80 && ag.necessidades.dinheiro >= 20) {
        ag.necessidades.dinheiro -= 20; ag.necessidades.fome = clamp(ag.necessidades.fome - 40);
        acao = 'comprou comida de emergência';
      } else if (ag.necessidades.energia < 20) {
        ag.necessidades.energia = clamp(ag.necessidades.energia + 15);
        acao = 'descansou';
      }
      // Emprego autónomo por traços + gestor: qualquer desempregado procura vocação
      // (mesmo rico — uma sociedade viva não tem rentistas parados)
      else if (ag.profissao === 'desempregado') {
        const p = profissaoPorTracos(mundo, ag);
        if (p) { ag.profissao = p; acao = `tornou-se ${mundo.cfg.profissoes[p].nome}`; }
      }
      // Executar profissão
      else if (ag.profissao !== 'desempregado' && ag.necessidades.energia >= cfg.profissoes[ag.profissao].custoEnergia) {
        // v6: profissões do conhecimento (escola/academia/fauna)
        if (ag.profissao === 'estudante') { acao = estudar(mundo, ag).acao; }
        else if (ag.profissao === 'professor') { const r = ensinar(mundo, ag); acao = r.acao; culturaGerada += r.cultura; }
        else if (ag.profissao === 'academico') { const r = evoluirSkill(mundo, ag); acao = r.acao; culturaGerada += cfg.profissoes.academico.geraCultura; }
        else if (ag.profissao === 'cuidador') { acao = cuidarFaunaAcao(mundo, ag); }
        else {
        const prof = cfg.profissoes[ag.profissao];
        const reqKey = prof.reqTracoMin ? Object.keys(prof.reqTracoMin)[0] : null;
        const falhou = reqKey && ag.tracos[reqKey] < prof.reqTracoMin[reqKey];
        const semFerramenta = prof.reqFerramenta && !ag.inventario.includes(prof.reqFerramenta);
        const online = prof.tipo === 'online' && !ag.inventario.includes('laptop');
        if (falhou) { acao = `falhou no trabalho de ${prof.nome}`; ag.necessidades.energia = clamp(ag.necessidades.energia - 10); }
        else if (semFerramenta) {
          // Agricultura de subsistência: rende metade sem a ferramenta (evita espiral de fome)
          ag.necessidades.dinheiro += Math.floor(prof.ganho / 2);
          ag.necessidades.energia = clamp(ag.necessidades.energia - Math.floor(prof.custoEnergia / 2));
          acao = `subsistiu como ${prof.nome} sem ferramenta`;
          // Mesmo em subsistência há aprendizagem (a metade, adaptativo)
          ag.gestor = Math.min(cfg.lumebrain.gestorMaximo, ag.gestor + 0.005);
          ag.tracos[PROF_TRACO[ag.profissao] || 'curiosidade'] = clamp(ag.tracos[PROF_TRACO[ag.profissao] || 'curiosidade'] + 0.2);
        }
        else if (online) { acao = 'precisa de um Laptop Quântico'; }
        else {
          ag.necessidades.dinheiro += prof.ganho;
          ag.necessidades.energia = clamp(ag.necessidades.energia - prof.custoEnergia);
          if (prof.geraComida && ag.inventario.includes('semente')) ag.necessidades.fome = clamp(ag.necessidades.fome - 20);
          culturaGerada += prof.geraCultura || 0;
          if (prof.riscoSaude && Math.random() < 0.2) ag.necessidades.saude = clamp(ag.necessidades.saude - prof.riscoSaude);
          acao = `trabalhou como ${prof.nome}`;

          // Self-learning adaptativo: sucesso/descontentamento alimenta o LumeBrain
          const bom = ag.necessidades.dinheiro >= 50 && ag.necessidades.fome < 70;
          ag.lumebrain.aprender(objetivo, { bom, geracao: ag.estagio, gestor: true });
          ag.estagio = Math.min(10, ag.estagio + (bom ? 1 : 0));
          // Traço de gestor cresce com trabalho bem feito (adaptativo para toda a população)
          ag.gestor = Math.min(cfg.lumebrain.gestorMaximo, ag.gestor + (bom ? 0.012 : 0.004));
          // Especialização: a profissão treina o seu traço (caminho para artistas/investigadores)
          const tracoProf = PROF_TRACO[ag.profissao] || 'curiosidade';
          ag.tracos[tracoProf] = clamp(ag.tracos[tracoProf] + 0.4);

          // Gestores altos reinvestem no mundo
          if (ag.gestor > 0.6 && ag.necessidades.dinheiro > 300 && Object.keys(cfg.construcoes).some(t => !mundo.construcoes.some(c => c.tipo === t))) {
            const falta = Object.keys(cfg.construcoes).find(t => !mundo.construcoes.some(c => c.tipo === t) && (!cfg.construcoes[t].reqIdea || mundo.ideias.includes(cfg.construcoes[t].reqIdea)));
            if (falta && ag.necessidades.dinheiro >= cfg.construcoes[falta].custo) {
              construir(mundo, ag.id, falta);
            }
          }
        }
        }
      }

      // Socialização e nascimentos (população cresce em saltos Fibonacci)
      if (ag.familia.length === 0 && ag.tracos.sociabilidade > 60 && ag.necessidades.energia > 50) {
        const parceiros = mundo.agentes.filter(a => a.id !== ag.id && a.estado === 'vivo' && !a.isCriador && a.familia.length === 0 && a.territorio === ag.territorio);
        if (parceiros.length && Math.random() < 0.05) {
          const p = parceiros[0];
          ag.familia.push(p.id); p.familia.push(ag.id);
          logMundo(mundo, `💕 ${ag.nome} e ${p.nome} formaram um casal!`);
        }
      }
      const limitePop = Math.floor(fib(9) * GOLDEN); // ~34*0.618 ≈ 21 nascimentos possíveis
      if (ag.familia.length >= 1 && ag.habitacao.nivel >= 2 && Math.random() < 0.05 && mundo.agentes.length < cfg.mundo.populacaoMax + limitePop) {
        const p = mundo.agentes.find(a => a.id === ag.familia[0]);
        if (p && p.estado === 'vivo') {
          const nomeFilho = `Descendente de ${ag.nome}`;
          const filho = criarAgente(mundo.cfg, nomeFilho, 'humano', ag.faccao);
          filho.tracos = cruzar(ag.tracos, p.tracos);
          filho.familia = [ag.id, p.id];
          ag.familia.push(filho.id); p.familia.push(filho.id);
          filho.x = ag.x + (Math.random() * 40 - 20); filho.y = ag.y + (Math.random() * 40 - 20);
          mundo.agentes.push(filho);
          logMundo(mundo, `👶 Nasceu ${nomeFilho}! (evolução genética aplicada)`);
        }
      }

      // Reflexão (a cada fib(5)=8 ticks): o objectivo dominante do LumeBrain
      // molda quem o agente se torna — auto-aprendizagem adaptativa
      if (mundo.tickCount % fib(5) === 0) {
        const TRACO_OBJETIVO = { sobreviver: 'coragem', acumular: 'curiosidade', socializar: 'sociabilidade', criar: 'criatividade' };
        const tracoAlvo = TRACO_OBJETIVO[objetivo] || 'empatia';
        ag.tracos[tracoAlvo] = clamp(ag.tracos[tracoAlvo] + 1.5);
      }

      // Reavaliação de carreira (sociedade adaptativa): a cada fib(6)=8 ticks,
      // segue a vocação quando o traço correspondente amadurece (≥55)
      if (mundo.tickCount % fib(6) === 0 && ag.necessidades.energia > 30) {
        const alvo = profissaoPorTracos(mundo, ag);
        if (alvo !== ag.profissao && alvo !== 'desempregado') {
          const tAlvo = PROF_TRACO[alvo];
          if (ag.tracos[tAlvo] >= 55) {
            ag.profissao = alvo;
            acao = `mudou de vida: agora é ${cfg.profissoes[alvo].nome}`;
            ag.memorias.unshift({ texto: `Segui a minha vocação: ${cfg.profissoes[alvo].nome}`, ts: Date.now(), peso: 6 });
          }
        }
      }

      // Habitação
      if (ag.necessidades.dinheiro >= 100 && ag.habitacao.nivel < 3 && ag.familia.length > 0) {
        ag.necessidades.dinheiro -= 100;
        ag.habitacao.nivel += 1; ag.habitacao.capacidade += 2;
        acao = 'expandiu a habitação';
      }

      // Fome e morte
      if (ag.necessidades.fome >= 100) ag.necessidades.saude = clamp(ag.necessidades.saude - 15);
      if (ag.necessidades.saude <= 0) {
        ag.estado = 'morto'; ag.arquetipo = 'espirito';
        logMundo(mundo, `☠️ ${ag.nome} sucumbiu e tornou-se um espírito.`);
      }

      if (acao && Math.random() < 0.12) logMundo(mundo, `🤖 ${ag.nome}: ${acao}.`);
    });

    mundo.culturaGlobal += culturaGerada;

    // v6: protocolos de conduta, fauna, NPCs e mapa
    aplicarConduta(mundo);
    tickFauna(mundo);
    tickNpcs(mundo);
    // v9: RPG anime mundo aberto
    tickMissoes(mundo);
    tickDiplomacia(mundo);
    tickJustica(mundo);
    tickHistoria(mundo);
    tickKardashev(mundo);
    expirarDefesas(mundo);
    // inventário do chão: itens não apanhados evaporam (mundo vivo, sem lixo acumulado)
    if (mundo.itensNoChao && mundo.itensNoChao.length && mundo.tickCount % fib(6) === 0) {
      mundo.itensNoChao.splice(0, Math.ceil(mundo.itensNoChao.length / 2));
    }
    // Fundo comum financia a expansão do mundo (gestores expandem sozinhos)
    if (mundo.tickCount % fib(9) === 0) {
      const patrono = mundo.agentes.find(a => a.estado === 'vivo' && !a.isCriador && a.gestor > 0.7 && a.necessidades.dinheiro >= custoProximoChunk(mundo));
      if (patrono) expandirMapa(mundo, patrono.id);
    }

    // Língua Lume evolui: vocabulário cresce a cada fib(6)=8 ticks
    if (mundo.tickCount % fib(6) === 0 && mundo.culturaGlobal > 40) {
      const t = mundo.lume.novoToken('tok' + mundo.tickCount);
      if (t) logMundo(mundo, `✨ Novo símbolo Lume: ${t.sign} (a língua cresceu)`);
    }
    return mundo;
  }

  // Traço treinado por cada profissão (especialização pelo fazer)
  const PROF_TRACO = {
    estudante: 'curiosidade', professor: 'empatia', academico: 'curiosidade', cuidador: 'empatia',
    agricultor: 'coragem', mercador: 'sociabilidade', guarda: 'coragem',
    artista: 'criatividade', hacker: 'curiosidade', freelancer: 'criatividade',
    trader: 'curiosidade', researcher: 'curiosidade', content_creator: 'sociabilidade',
    minerador: 'coragem', medico: 'empatia', professor_aula: 'empatia',
    explorador: 'coragem', engenheiro: 'curiosidade', bufao: 'sociabilidade',
  };

  // ---------- COMBATE LIGEIRO (Gauntlet/guardas/ataques do Criador) ----------
  // Sem morte direta — dano de saúde + memória; defesa restitui energia e reflete um golpe fraco.
  function atacarAgente(mundo, atacanteId, alvoId) {
    const at = mundo.agentes.find(a => a.id === atacanteId);
    const alvo = mundo.agentes.find(a => a.id === alvoId);
    if (!at || !alvo) return { ok: false, erro: 'Alvo inválido' };
    if (at.estado !== 'vivo' || alvo.estado !== 'vivo') return { ok: false, erro: 'Só se combate entre vivos' };
    if (at === alvo) return { ok: false, erro: 'Não te ataques a ti mesmo' };
    // Regra de ouro: o Criador está fora da simulação mortal — ninguém o pode atacar
    if (alvo.isCriador) return { ok: false, erro: 'O Criador está fora da simulação mortal' };
    const cfg = mundo.cfg;
    const foiGuarda = alvo.profissao === 'guarda';
    const foiDefesa = alvo.defesaAtiva || foiGuarda;
    const base = at.isCriador ? 12 : 8;
    const dano = Math.max(2, Math.round(base * (foiDefesa ? 0.35 : 1) * (0.7 + Math.random() * 0.6)));
    alvo.necessidades.saude = clamp(alvo.necessidades.saude - dano);
    at.necessidades.energia = clamp(at.necessidades.energia - 12);
    if (foiDefesa) {
      alvo.necessidades.energia = clamp(alvo.necessidades.energia + 5);
      at.necessidades.saude = clamp(at.necessidades.saude - Math.max(1, Math.round(dano * 0.4))); // reflexo do golpe
      if (foiGuarda) logMundo(mundo, `🛡️ O guarda ${alvo.nome} defendeu o território contra ${at.nome}!`);
    }
    const verb = at.isCriador ? '⚔️ O Criador' : '⚔️ ' + at.nome;
    logMundo(mundo, `${verb} atacou ${alvo.nome} (−${dano} saúde${foiDefesa ? ', defesa refletiu' : ''}).`);
    alvo.memorias.unshift({ texto: at.isCriador ? `O Criador atacou-me (−${dano} saúde)` : `${at.nome} atacou-me!`, ts: Date.now(), peso: 8 });
    if (alvo.necessidades.saude <= 0) {
      alvo.necessidades.saude = 1; // nunca mata diretamente — o metabolismo decide
      alvo.defesaAtiva = false;
    }
    return { ok: true, dano, defendido: foiDefesa };
  }
  function defenderAtivado(mundo, agId) {
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!ag) return { ok: false, erro: 'Agente inválido' };
    if (ag.estado !== 'vivo') return { ok: false, erro: 'Só vivos podem defender' };
    if (ag.necessidades.energia < 15) return { ok: false, erro: 'Energia insuficiente' };
    ag.necessidades.energia = clamp(ag.necessidades.energia - 8);
    ag.defesaAtiva = true;
    logMundo(mundo, `🛡️ ${ag.nome} ergueu a guarda (defesa ativa).`);
    return { ok: true };
  }
  function pegarItemNoMundo(mundo, agId) {
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!ag) return { ok: false, erro: 'Agente inválido' };
    if (ag.estado !== 'vivo') return { ok: false, erro: 'Só vivos podem pegar itens' };
    const cfg = mundo.cfg;
    if (!mundo.itensNoChao) mundo.itensNoChao = [];
    const perto = mundo.itensNoChao
      .map((it, i) => ({ it, i, d: Math.hypot(it.x - ag.x, it.y - ag.y) }))
      .filter(o => o.d < 40)
      .sort((a, b) => a.d - b.d)[0];
    if (!perto) return { ok: false, erro: 'Nada por perto para pegar (usa ⛏ Gerar Item)' };
    mundo.itensNoChao.splice(perto.i, 1);
    const nomeItem = (cfg.ferramentas[perto.it.itemKey] || {}).nome || perto.it.itemKey;
    if (perto.it.itemKey === 'kit_medico') {
      ag.necessidades.saude = clamp(ag.necessidades.saude + 30);
      return { ok: true, msg: `Kit de reparo usado: +30 saúde 💗` };
    }
    if (perto.it.itemKey === 'comida') {
      ag.necessidades.fome = clamp(ag.necessidades.fome - 35);
      return { ok: true, msg: 'Comida recolhida: fome −35 🍖' };
    }
    if (perto.it.itemKey === 'bau_missao') {
      const valor = perto.it.valor || 0;
      ag.necessidades.dinheiro += valor;
      return { ok: true, msg: 'Baú da missão aberto: +' + valor + '🪙 💰' };
    }
    if (!ag.inventario.includes(perto.it.itemKey)) ag.inventario.push(perto.it.itemKey);
    return { ok: true, msg: `Pegaste: ${nomeItem} 🎒` };
  }

  // O Criador (ou um gestor generoso) espalha um item no chão para ser apanhado
  function gerarItemNoMundo(mundo, agId, itemKey) {
    const ag = mundo.agentes.find(a => a.id === agId);
    const cfg = mundo.cfg;
    if (!ag) return { ok: false, erro: 'Agente inválido' };
    if (itemKey !== 'comida' && itemKey !== 'kit_medico' && !cfg.ferramentas[itemKey]) return { ok: false, erro: 'Item desconhecido' };
    if (itemKey !== 'comida' && itemKey !== 'kit_medico' && ag.necessidades.dinheiro < cfg.ferramentas[itemKey].custo) {
      return { ok: false, erro: 'Dinheiro insuficiente' };
    }
    if (itemKey !== 'comida' && itemKey !== 'kit_medico') ag.necessidades.dinheiro -= cfg.ferramentas[itemKey].custo;
    const d = dimensoesMundo(mundo);
    if (!mundo.itensNoChao) mundo.itensNoChao = [];
    mundo.itensNoChao.push({ id: gerarId(), itemKey, x: clamp(ag.x + (Math.random() * 80 - 40), 5, d.w - 5), y: clamp(ag.y + (Math.random() * 80 - 40), 5, d.h - 5) });
    return { ok: true, msg: `Item colocado no chão ⛏` };
  }

  // Interagir com um habitante: elogio eleva o ânimo; perguntar devolve a voz dele
  function jogadorInteragirSer(mundo, agId, tipo) {
    const j = mundo.jogador;
    const ag = mundo.agentes.find(a => a.id === agId);
    if (!j || !ag) return { ok: false, erro: 'Alvo inválido' };
    if (tipo === 'elogiar') {
      ag.memorias.unshift({ texto: 'O Criador elogiou o meu trabalho ✨', ts: Date.now(), peso: 6 });
      ag.necessidades.energia = clamp(ag.necessidades.energia + 10);
      ag.gestor = Math.min(mundo.cfg.lumebrain.gestorMaximo, ag.gestor + 0.01);
      logMundo(mundo, `✨ O Criador elogiou ${ag.nome}.`);
      return { ok: true, msg: `${ag.nome} ficou motivado ✨` };
    }
    if (tipo === 'falar') {
      const lang = ag.idioma === 'en' ? 'en' : 'pt';
      return { ok: true, msg: `${ag.nome}: “${falarAgente(mundo, ag, lang)}”` };
    }
    return { ok: false, erro: 'Ação desconhecida' };
  }

  function jogadorAtacar(mundo, alvoId) {
    const j = mundo.jogador;
    if (!j) return { ok: false, erro: 'Entra primeiro como Criador' };
    return atacarAgente(mundo, j.id, alvoId);
  }
  function jogadorDefender(mundo) {
    const j = mundo.jogador;
    if (!j) return { ok: false, erro: 'Entra primeiro como Criador' };
    return defenderAtivado(mundo, j.id);
  }

  function cuidarFaunaAcao(mundo, ag) {
    const cfg = mundo.cfg;
    ag.necessidades.energia = clamp(ag.necessidades.energia - cfg.profissoes.cuidador.custoEnergia);
    ag.necessidades.dinheiro += cfg.profissoes.cuidador.ganho; // salário do cuidador (Protocolo da Fauna)
    if (!mundo.fauna || mundo.fauna.length === 0) return 'procura animais que ainda não existem';
    const ferido = mundo.fauna.find(a => a.ferido);
    if (ferido) {
      ferido.ferido = false;
      logMundo(mundo, `🐾 ${ag.nome} curou ${ferido.nome} (Protocolo da Fauna).`);
      return `curou ${ferido.nome}`;
    }
    const faminto = mundo.fauna.reduce((m, a) => (a.energia < m.energia ? a : m), mundo.fauna[0]);
    faminto.energia = clamp(faminto.energia + 20, 0, 100);
    return `cuidou de ${faminto.nome}`;
  }

  function profissaoPorTracos(mundo, ag) {
    const t = ag.tracos;
    const temEscola = temConstrucao(mundo, 'escola');
    const temAcademia = temConstrucao(mundo, 'academia');
    ag.skills = ag.skills || {};
    const nSkills = Object.keys(ag.skills).length;
    const faltamSkills = Object.keys(mundo.cfg.skills.catalogo).length > nSkills;
    // Prioridade à sociedade do conhecimento: estudar → ensinar → evoluir
    if (temEscola && faltamSkills && t.curiosidade >= 55) return 'estudante';
    if (temAcademia && ag.skills.meta_aprendizagem) {
      // Só há lugar na academia enquanto houver patamares por evoluir;
      // concluída a evolução, o académico regressa à economia produtiva.
      const haEvolutivas = Object.keys(ag.skills).some(s => ag.skills[s] < (mundo.cfg.skills.evolucaoMaxima || 3));
      if (haEvolutivas) return 'academico';
    }
    if (temEscola && ag.skills.pedagogia) {
      // Vigor docente: 1 professor por cada φ×alunos (proporção áurea) —
      // a sociedade nunca deixa a produção inteira virar sala de aula.
      const alunosVivos = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador && a.profissao === 'estudante').length;
      const professores = mundo.agentes.filter(a => a.estado === 'vivo' && !a.isCriador && a.profissao === 'professor').length;
      if (professores === 0 || (alunosVivos > 0 && professores < Math.max(1, Math.floor(alunosVivos * GOLDEN)))) return 'professor';
    }
    if (mundo.fauna && mundo.fauna.length > 0 && ag.skills.zoologia) return 'cuidador';
    if (ag.gestor > 0.5 && t.coragem >= 60) return 'mercador';
    if (t.criatividade >= 60) return 'artista';
    if (t.curiosidade >= 60) return 'hacker';
    if (t.coragem >= 60) return 'guarda';
    return 'agricultor';
  }

  function decidirSimples(ag) { // fallback sem lumebrain
    if (ag.necessidades.fome > 60 || ag.necessidades.saude < 40) return 'sobreviver';
    if (ag.necessidades.dinheiro < 60) return 'acumular';
    if (ag.tracos.sociabilidade > 55) return 'socializar';
    return 'criar';
  }

  // ---------- AÇÕES DO JOGADOR ----------
  function jogadorComprar(mundo, itemKey) {
    const j = mundo.jogador; if (!j) return { ok: false, erro: 'Entra primeiro como Criador' };
    const item = mundo.cfg.ferramentas[itemKey];
    if (!item) return { ok: false, erro: 'Item desconhecido' };
    if (j.necessidades.dinheiro < item.custo) return { ok: false, erro: 'Dinheiro insuficiente' };
    j.necessidades.dinheiro -= item.custo;
    if (itemKey === 'kit_medico') j.necessidades.saude = clamp(j.necessidades.saude + 50);
    else if (itemKey === 'implante_neural') j.necessidades.energiaMax = clamp(j.necessidades.energiaMax + 20, 100, 200);
    else if (!j.inventario.includes(itemKey)) j.inventario.push(itemKey);
    return { ok: true };
  }

  function jogadorOfertar(mundo, agId, quantia) {
    const j = mundo.jogador; const ag = mundo.agentes.find(a => a.id === agId);
    if (!j || !ag) return { ok: false, erro: 'Alvo inválido' };
    const q = Math.max(0, Math.min(quantia | 0, j.necessidades.dinheiro));
    if (q <= 0) return { ok: false, erro: 'Quantia inválida' };
    j.necessidades.dinheiro -= q;
    ag.necessidades.dinheiro += q;
    ag.memorias.unshift({ texto: `O Criador deu-me ${q} de moedas`, ts: Date.now(), peso: 7 });
    ag.gestor = Math.min(0.95, ag.gestor + 0.01);
    logMundo(mundo, `👑 O Criador ofereceu ${q} moedas a ${ag.nome}.`);
    return { ok: true, quantia: q };
  }

  function jogadorDarFerramenta(mundo, agId, itemKey) {
    const j = mundo.jogador; const ag = mundo.agentes.find(a => a.id === agId);
    const item = mundo.cfg.ferramentas[itemKey];
    if (!j || !ag || !item) return { ok: false, erro: 'Inválido' };
    if (!j.inventario.includes(itemKey)) return { ok: false, erro: 'Não tens esse item' };
    j.inventario = j.inventario.filter(i => i !== itemKey);
    ag.inventario.push(itemKey);
    ag.memorias.unshift({ texto: `O Criador deu-me: ${item.nome}`, ts: Date.now(), peso: 7 });
    logMundo(mundo, `👑 O Criador entregou ${item.nome} a ${ag.nome}.`);
    return { ok: true };
  }

  function jogadorConstruir(mundo, tipo) {
    const j = mundo.jogador; if (!j) return { ok: false, erro: 'Entra primeiro' };
    return construir(mundo, j.id, tipo);
  }

  function jogadorPesquisar(mundo, ideaId) {
    const j = mundo.jogador; if (!j) return { ok: false, erro: 'Entra primeiro' };
    return pesquisarIdea(mundo, j.id, ideaId);
  }

  // Dimensões atuais do mundo: os chunks comprados estendem a grelha
  // (idx ímpar → coluna direita, idx par → linha abaixo)
  function dimensoesMundo(mundo) {
    const mapa = mundo.cfg.mapa || {};
    const largura = mapa.largura || 640, altura = mapa.altura || 320;
    const n = mundo.chunksComprados || 0;
    const colunas = 1 + (n >= 1 ? 1 : 0);
    const linhas = 1 + Math.floor(n / 2);
    return { w: largura * colunas, h: altura * linhas };
  }

  function jogadorMover(mundo, x, y, correr) {
    const j = mundo.jogador; if (!j) return;
    const d = dimensoesMundo(mundo);
    // Movimento por toque (v8.1): um passo suave em direcao ao alvo (passo duplo = correr)
    const passo = correr ? 42 : 20;
    const dx = x - j.x, dy = y - j.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= passo) { j.x = clamp(x, 5, d.w - 5); j.y = clamp(y, 5, d.h - 5); }
    else { j.x = clamp(j.x + (dx / dist) * passo, 5, d.w - 5); j.y = clamp(j.y + (dy / dist) * passo, 5, d.h - 5); }
  }

  function jogadorExpandirMapa(mundo) {
    const j = mundo.jogador; if (!j) return { ok: false, erro: 'Entra primeiro' };
    return expandirMapa(mundo, j.id);
  }

  function jogadorInteragirAnimal(mundo, animalId, acao) {
    if (acao === 'curar') return curarAnimal(mundo, animalId);
    if (acao === 'alimentar') return alimentarAnimal(mundo, animalId);
    return { ok: false, erro: 'Ação desconhecida' };
  }

  // O Criador define a carreira de um habitante (respeitando requisitos v6)
  // Wrappers de jogador para as ações de mundo (combate/itens/interação)
  function jogadorGerarItem(mundo, itemKey) {
    const j = mundo.jogador;
    if (!j) return { ok: false, erro: 'Entra primeiro como Criador' };
    return gerarItemNoMundo(mundo, j.id, itemKey);
  }
  function jogadorPegar(mundo) {
    const j = mundo.jogador;
    if (!j) return { ok: false, erro: 'Entra primeiro como Criador' };
    return pegarItemNoMundo(mundo, j.id);
  }

  // O Criador define a carreira de um habitante (respeitando requisitos v6)
  function jogadorDefinirCarreira(mundo, agId, profissao) {
    const cfg = mundo.cfg;
    const ag = mundo.agentes.find(a => a.id === agId);
    const prof = cfg.profissoes[profissao];
    if (!ag || !prof) return { ok: false, erro: 'Carreira inválida' };
    if (ag.estado !== 'vivo') return { ok: false, erro: 'Agente não está vivo' };
    if (prof.reqSkill && !(ag.skills && ag.skills[prof.reqSkill])) {
      return { ok: false, erro: 'Requer skill: ' + cfg.skills.catalogo[prof.reqSkill].nome };
    }
    if (prof.reqConstrucao && !temConstrucao(mundo, prof.reqConstrucao)) {
      return { ok: false, erro: 'Requer construção: ' + cfg.construcoes[prof.reqConstrucao].nome };
    }
    if (profissao === 'estudante' && !temConstrucao(mundo, 'escola')) return { ok: false, erro: 'Requer a Escola' };
    if (profissao === 'academico' && !temConstrucao(mundo, 'academia')) return { ok: false, erro: 'Requer a Academia' };
    ag.profissao = profissao;
    logMundo(mundo, `👑 O Criador designou ${ag.nome} como ${prof.nome}.`);
    return { ok: true };
  }

  // ---------- PERSISTÊNCIA ----------
  function serializar(mundo) {
    return JSON.stringify({
      versao: mundo.cfg.meta.versao,
      tickCount: mundo.tickCount, culturaGlobal: mundo.culturaGlobal,
      agentes: mundo.agentes, construcoes: mundo.construcoes, ideias: mundo.ideias,
      gauntletRonda: mundo.gauntletRonda, criticos: mundo.criticos,
      log: mundo.log, lume: { tokens: mundo.lume.tokens, bigramas: mundo.lume.bigramas },
      chats: mundo.chats, jogadorId: mundo.jogador ? mundo.jogador.id : null,
      chunks: mundo.chunks, chunksComprados: mundo.chunksComprados,
      fauna: mundo.fauna, fundoComum: mundo.fundoComum, faunaMaxExtra: mundo.faunaMaxExtra || 0, itensNoChao: mundo.itensNoChao || [],
      npcs: mundo.npcs || null,
      missoes: mundo.missoes || [], diplomacia: mundo.diplomacia || null,
      tribunal: mundo.tribunal || null, historia: mundo.historia || null, kardashev: mundo.kardashev || null,
    }, null, 2);
  }

  function deserializar(mundo, dados) {
    if (!dados || !Array.isArray(dados.agentes)) return false;
    mundo.tickCount = dados.tickCount | 0;
    mundo.culturaGlobal = dados.culturaGlobal || 0;
    mundo.agentes = dados.agentes;
    // Rehidratar LumeBrains (funções não sobrevivem a JSON)
    mundo.agentes.forEach(ag => {
      if (!ag.lumebrain || typeof ag.lumebrain.decidir !== 'function') {
        ag.lumebrain = criarLumeBrain(mundo.cfg.lume, mundo.cfg.lumebrain);
        if (ag.politica) Object.keys(ag.lumebrain.pesos).forEach(k => { if (typeof ag.politica[k] === 'number') ag.lumebrain.pesos[k] = ag.politica[k]; });
      }
      // v6: migração de mundos antigos (v5)
      if (!ag.skills) { ag.skills = {}; ag.aulas = {}; ag.evolucoes = {}; ag.ensinosDados = 0; }
    });
    mundo.chunks = (dados.chunks && dados.chunks.length ? dados.chunks : (mundo.cfg.mapa.chunksIniciais || []).map(c => ({ ...c })));
    mundo.chunksComprados = dados.chunksComprados || 0;
    mundo.fauna = dados.fauna || null;
    mundo.fundoComum = dados.fundoComum || 0;
    mundo.faunaMaxExtra = dados.faunaMaxExtra || 0;
    mundo.itensNoChao = dados.itensNoChao || [];
    // v8.1: NPCs de ambiente (migração: mundos antigos não os têm)
    if (dados.npcs && dados.npcs.length) mundo.npcs = dados.npcs;
    else if (!mundo.npcs) mundo.npcs = criarNpcsInicial(mundo);
    // v9: RPG (migração silenciosa de mundos antigos)
    mundo.missoes = dados.missoes || [];
    mundo.diplomacia = dados.diplomacia || null;
    mundo.tribunal = dados.tribunal || null;
    mundo.historia = dados.historia || null;
    mundo.kardashev = dados.kardashev || null;
    mundo.construcoes = dados.construcoes || [];
    mundo.ideias = dados.ideias || [];
    mundo.gauntletRonda = dados.gauntletRonda || 0;
    mundo.criticos = dados.criticos || { ronda: 1, ultimoAgente: 0 };
    mundo.log = dados.log || [];
    if (dados.lume) { mundo.lume.tokens = dados.lume.tokens || mundo.lume.tokens; mundo.lume.bigramas = dados.lume.bigramas || {}; }
    mundo.chats = dados.chats || {};
    if (dados.jogadorId) mundo.jogador = mundo.agentes.find(a => a.id === dados.jogadorId) || null;
    return true;
  }

  // ---------- EXPORT ----------
  const API = {
    fib, fibRatio, GOLDEN,
    criarLume, criarLumeBrain,
    criarAgente, cruzar, criarMundo, entrarComoJogador,
    tick, rodadaCriticos, gauntlet, construir, pesquisarIdea,
    enviarChat, mudarIdioma, falarAgente,
    jogadorComprar, jogadorOfertar, jogadorDarFerramenta, jogadorConstruir, jogadorPesquisar, jogadorMover,
    jogadorInteragirSer, jogadorAtacar, jogadorDefender, jogadorGerarItem, jogadorPegar,
    atacarAgente, defenderAtivado, pegarItemNoMundo, gerarItemNoMundo,
    expandirMapa, jogadorExpandirMapa, curarAnimal, alimentarAnimal, jogadorInteragirAnimal,
    jogadorDefinirCarreira, dimensoesMundo,
    estudar, ensinar, evoluirSkill, aplicarConduta, criarFaunaInicial, criarNpcsInicial, custoProximoChunk, temConstrucao,
    aceitarMissao, completarMissao, mediarPaz, nivelKardashev,
    serializar, deserializar, logMundo, clamp, pick, gerarId,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Engine = API;
})(typeof window !== 'undefined' ? window : globalThis);
