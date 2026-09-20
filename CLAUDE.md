# CLAUDE.md

Guia para agentes AI (Claude Code, Codebuff, Cursor, etc.) a trabalharem neste repositório.

## O que é este projeto

**Mundo Aberto X** — multiverso de agentes AI autónomos, 100% frontend estático (HTML/JS puro, zero build, zero dependências de runtime). Deploy no Vercel como site estático.

## Estrutura (ficheiros que importam)

| Ficheiro | Papel |
|---|---|
| `mundo.json` | **Fonte de verdade da configuração**: profissões, ferramentas, construções, ideias, zonas do mapa, eventos do Gauntlet, sementes da língua Lume, parâmetros do LumeBrain. Números de balance mudam AQUI, não no código. |
| `engine.js` | Motor puro (sem React). Fibonacci, língua Lume, LumeBrain, loop de críticos, Gauntlet, jogador, serialização. Expõe `window.Engine` no browser e `module.exports` em Node. |
| `app.js` | UI React (via Babel-standalone no browser). Mapa, jogador jogável, chat, painéis, gráficos Recharts. |
| `index.html` | Shell. Carrega React/Recharts por CDN + `mundo.json`, `engine.js`, `app.js`. Inclui CSS utilitário mínimo (a Tailwind CDN foi removida — não a reintroduzir sem necessidade). |
| `serve.js` | Servidor estático zero-dependências (`npm start`, `PORT` env, bind 0.0.0.0). |
| `engine.test.js` | Smoke tests em Node puro (`npm test`, sem framework). |
| `Readme-mundo-aberto` | Rascunho antigo; candidato a remover num cleanup futuro. |

## Regras de ouro

1. **Regra de Fibonacci governa tudo.** Intervalos de eventos (`fib(N)` ticks), limites de crítica (proporção áurea `fib(n)/fib(n+1) ≈ 0.618`), crescimento do vocabulário Lume (13→21→34…), passos de aprendizagem do LumeBrain. Ao adicionar mecânicas, pergunta primeiro: "qual é a régua de Fibonacci disto?"
2. **Língua dupla.** Agentes → agentes: Lume (tokens comprimidos, Markov de 1ª ordem). Agente → Criador: português ou inglês (campo `idioma` do agente). Nunca misturar Lume nas respostas ao jogador — Lume aparece como `tokens` decorativos no chat.
3. **LumeBrain = o "menor LLM" comprimido num agente.** 4 pesos de política + traço de gestor (0..1) + taxa de aprendizagem que decai na espiral áurea. Está em cada agente (`ag.lumebrain`); funções não sobrevivem a JSON, por isso `deserializar()` rehidrata sempre.
4. **Jogador dentro do mundo.** O Criador é um agente (`isCriador`, `isJogador`) criado por `entrarComoJogador()` — único, com 1000 moedas, movível pelo clique no mapa. Nunca criar um segundo avatar; usar sempre essa função.
5. **Persistência = JSON.** Autosave em `localStorage` (chave `mundo-aberto-x-v6`) a cada 10 ticks; export/import de ficheiro `.json` via `Engine.serializar/deserializar`. Ao acrescentar campos a agentes, garantir que sobrevivem ao ciclo JSON (funções à parte, rehidratação no load).
6. **Config data-driven.** Nada de hardcodar números de balance no engine — tudo vem de `mundo.json` (acessível como `window.WORLD` no browser, `require('./mundo.json')` em Node).
7. **Protocolos da Continuidade (v6.1).** O fundo comum é o motor da sociedade autónoma: ergue construções com **reserva áurea** (`custo × 1.618` de folga) e só com fome média < 50; financia pesquisas de ideias que bloqueiam construções; paga bolsas (`skills.bolsaAula`, `skills.bolsaAcademico`) a estudantes/académicos; e tem rede de segurança alimentar (dispara com φ dos vivos famintos). A Escola tem prioridade absoluta — é ela que desbloqueia estudantes → professores → academia.
8. **Ninguém trabalha de graça.** Toda a profissão paga (`ensinar` tem salário-base mesmo sem alunos; `cuidarFaunaAcao` paga o ganho; `evoluirSkill` recebe bolsa do fundo ou ganho/2). Qualquer desempregado procura vocação automaticamente — não há rentistas parados. Quem gradua recebe colocação imediata (`profissaoPorTracos`).
9. **O Criador está fora da simulação mortal.** `isCriador`: sem metabolismo, sem Gauntlet, sem adaptación evolutiva — regenera +2 saúde/tick. Nunca adicionar mecânicas que visem o jogador.

## Como correr

```bash
npm install   # instala apenas para ter npm confortável; não há dependências
npm test      # smoke tests do engine (Node puro)
npm start     # serve em http://localhost:3000 (usa PORT para mudar)
```

Deploy: **Vercel estático** — sem build step (`index.html` é a raiz). O `serve.js` serve como fallback local/preview.

## Ao mudar o código

- Testar sempre `npm test` após tocar no `engine.js` — os 20 testes cobrem Fibonacci, Lume, LumeBrain, críticos, Gauntlet, chat PT/EN, jogador, import/export, morte, v6 (escola/skills/fauna/chunks/conduta) e v6.1 (Protocolos da Continuidade).
- No browser, validar o console: erros de sintaxe no `app.js` deixam o `#root` vazio (existe um placeholder "A carregar o multiverso…" que permanece se o React não montar).
- Manter o engine livre de React/DOM — tem de continuar a correr em Node para os testes.
- Idioma dos textos de UI: português (o mundo pertence ao Criador falante de PT). Código e identificadores: inglês.

## Convenções de estilo

- Engine: funções puras, mutação local de objetos cópia, sem classes.
- UI: componentes pequenos, cores vindas de `CFG`/constantes `CORES`, sem CSS-in-JS pesado.
- Emojis como ícones dos sistemas (🐾 ⚔️ 🕯️ 👑 ✨) — manter coerência com os já usados.
