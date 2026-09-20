# CLAUDE.md

Guia para agentes AI (Claude Code, Codebuff, Cursor, etc.) a trabalharem neste repositório.

## O que é este projeto

**Mundo Aberto X** — multiverso de agentes AI autónomos, frontend estático servido como ficheiros planos. O JSX é **pré-compilado** com esbuild (devDependency) em `app.compiled.js` — o browser nunca transpila. Deploy no Vercel como site estático (`vercel.json` fixa `buildCommand: null`).

## Estrutura (ficheiros que importam)

| Ficheiro | Papel |
|---|---|
| `mundo.json` | **Fonte de verdade da configuração**: profissões, ferramentas, construções, ideias, zonas do mapa, eventos do Gauntlet, sementes da língua Lume, parâmetros do LumeBrain. Números de balance mudam AQUI, não no código. |
| `engine.js` | Motor puro (sem React). Fibonacci, língua Lume, LumeBrain, loop de críticos, Gauntlet, jogador, serialização. Expõe `window.Engine` no browser e `module.exports` em Node. |
| `app.js` | UI React **fonte JSX** (não é carregado diretamente pelo browser). Mapa, jogador jogável, chat, painéis, gráficos Recharts. |
| `app.compiled.js` | **Artefacto gerado** por `npm run build:local` a partir de `app.js` — é isto que o browser carrega. Re-gerar sempre que `app.js` mudar. |
| `mundo.js` | **Artefacto gerado** a partir de `mundo.json` (`window.WORLD=...`) — JSON puro não é JS executável. |
| `index.html` | Shell. Carrega React/Recharts por CDN (afixados, `defer`) + `mundo.js`, `engine.js`, `app.compiled.js`. Tem painel de erro de boot — se algo falhar, o erro aparece no ecrã em vez de loading eterno. |
| `serve.js` | Servidor estático zero-dependências (`node serve.js`, `PORT` env, bind 0.0.0.0). |
| `engine.test.js` | Smoke tests em Node puro (`npm test`, sem framework). |
| `vercel.json` | Fixa `buildCommand: null` + `outputDirectory: "."` — a Vercel serve os artefactos commitados sem tentar construir. |

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
npm install        # instala esbuild (devDependency) — necessário para o build
npm test           # 28 smoke tests do engine (Node puro)
npm run build:local # re-gera app.compiled.js + mundo.js (correr após editar app.js ou mundo.json)
npm start          # build:local + serve em http://localhost:3000 (usa PORT para mudar)
```

Deploy: **Vercel estático** — `vercel.json` desativa o build (`buildCommand: null`); os artefactos (`app.compiled.js`, `mundo.js`) vão commitados e são servidos tal e qual. O `serve.js` serve como fallback local/preview.

## Ao mudar o código

- Testar sempre `npm test` após tocar no `engine.js` — os 28 testes cobrem Fibonacci, Lume, LumeBrain, críticos, Gauntlet, chat PT/EN, jogador, import/export, morte, v6 (escola/skills/fauna/chunks/conduta) e v6.1 (Protocolos da Continuidade + dimensões do mundo/colocação/bolsa).
- **JSX nunca vai direto ao browser.** Depois de editar `app.js`, correr `npm run build:local` e commitar também `app.compiled.js` (e `mundo.js` se `mundo.json` mudou). O `index.html` tem painel de erro de boot que mostra a exceção em vez do loading eterno.
- Manter o engine livre de React/DOM — tem de continuar a correr em Node para os testes.
- Idioma dos textos de UI: português (o mundo pertence ao Criador falante de PT). Código e identificadores: inglês.

## Convenções de estilo

- Engine: funções puras, mutação local de objetos cópia, sem classes.
- UI: componentes pequenos, cores vindas de `CFG`/constantes `CORES`, sem CSS-in-JS pesado.
- Emojis como ícones dos sistemas (🐾 ⚔️ 🕯️ 👑 ✨) — manter coerência com os já usados.
