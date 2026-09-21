# CLAUDE.md

Guia para agentes AI (Claude Code, Codebuff, Cursor, etc.) a trabalharem neste repositório.

## O que é este projeto

**Mundo Aberto X** — multiverso de agentes AI autónomos em **3D top-down**. Stack: **Vite + React + Three.js** (mapa 3D) + Recharts (gráficos). O motor (`engine.js`) é JavaScript puro partilhado entre Node (testes) e browser (script global). Deploy na Vercel (build Vite → `dist/`) e pronto para o hosting do Freebuff.

## Estrutura (ficheiros que importam)

| Ficheiro | Papel |
|---|---|
| `mundo.json` | **Fonte de verdade da configuração**: profissões, ferramentas, construções, ideias, zonas do mapa, eventos do Gauntlet, sementes da língua Lume, parâmetros do LumeBrain. Números de balance mudam AQUI, não no código. |
| `engine.js` | Motor puro (sem React/DOM). Fibonacci, língua Lume, LumeBrain, loop de críticos, Gauntlet, jogador, serialização. Expõe `window.Engine` no browser e `module.exports` em Node. O script `gen` copia-o para `public/engine.js`. |
| `src/App.jsx` | UI React (JSX transformado pelo Vite). Painéis, chat, gráficos Recharts, controlos touch. |
| `src/Mapa3D.jsx` | Mapa **3D top-down** (Three.js, câmera ortográfica): chunks/zonas/ruas, construções em caixas 3D, agentes/fauna animados, pan/zoom/clique. |
| `src/main.jsx` | Entrada Vite: monta o App e injeta o Vercel Speed Insights. |
| `index.html` | Shell Vite. Carrega `/engine.js` (global) antes do módulo React. Tem painel de erro de boot — se algo falhar, o erro aparece no ecrã em vez de loading eterno. |
| `public/engine.js` | **Cópia gerada** do `engine.js` pelo script `gen` (corre em `dev` e `build`) — é isto que o browser carrega. |
| `engine.test.js` | Smoke tests em Node puro (`npm test`, sem framework). |
| `vite.config.js` | Vite: HMR desativado (Freebuff), host 0.0.0.0, `allowedHosts` para o domínio de preview, build → `dist/`. |
| `vercel.json` | Framework `vite`, build `npm run build`, output `dist/`. |

## Regras de ouro

1. **Regra de Fibonacci governa tudo.** Intervalos de eventos (`fib(N)` ticks), limites de crítica (proporção áurea `fib(n)/fib(n+1) ≈ 0.618`), crescimento do vocabulário Lume (13→21→34…), passos de aprendizagem do LumeBrain. Ao adicionar mecânicas, pergunta primeiro: "qual é a régua de Fibonacci disto?"
2. **Língua dupla.** Agentes → agentes: Lume (tokens comprimidos, Markov de 1ª ordem). Agente → Criador: português ou inglês (campo `idioma` do agente). Nunca misturar Lume nas respostas ao jogador — Lume aparece como `tokens` decorativos no chat.
3. **LumeBrain = o "menor LLM" comprimido num agente.** 4 pesos de política + traço de gestor (0..1) + taxa de aprendizagem que decai na espiral áurea. Está em cada agente (`ag.lumebrain`); funções não sobrevivem a JSON, por isso `deserializar()` rehidrata sempre.
4. **Jogador dentro do mundo.** O Criador é um agente (`isCriador`, `isJogador`) criado por `entrarComoJogador()` — único, com 1000 moedas, movível pelo clique no mapa. Nunca criar um segundo avatar; usar sempre essa função.
5. **Persistência = JSON.** Autosave em `localStorage` (chave `mundo-aberto-x-v6`) a cada 10 ticks; export/import de ficheiro `.json` via `Engine.serializar/deserializar`. Ao acrescentar campos a agentes, garantir que sobrevivem ao ciclo JSON (funções à parte, rehidratação no load).
6. **Config data-driven.** Nada de hardcodar números de balance no engine — tudo vem de `mundo.json` (importado diretamente pela UI via `import CFG from '../mundo.json'`; `require('./mundo.json')` em Node).
7. **Protocolos da Continuidade (v6.1).** O fundo comum é o motor da sociedade autónoma: ergue construções com **reserva áurea** (`custo × 1.618` de folga) e só com fome média < 50; financia pesquisas de ideias que bloqueiam construções; paga bolsas (`skills.bolsaAula`, `skills.bolsaAcademico`) a estudantes/académicos; e tem rede de segurança alimentar (dispara com φ dos vivos famintos). A Escola tem prioridade absoluta — é ela que desbloqueia estudantes → professores → academia.
8. **Ninguém trabalha de graça.** Toda a profissão paga (`ensinar` tem salário-base mesmo sem alunos; `cuidarFaunaAcao` paga o ganho; `evoluirSkill` recebe bolsa do fundo ou ganho/2). Qualquer desempregado procura vocação automaticamente — não há rentistas parados. Quem gradua recebe colocação imediata (`profissaoPorTracos`).
9. **O Criador está fora da simulação mortal.** `isCriador`: sem metabolismo, sem Gauntlet, sem adaptación evolutiva — regenera +2 saúde/tick. Nunca adicionar mecânicas que visem o jogador.

## Como correr

```bash
npm install   # Vite, React, Three.js, Recharts
npm test      # 32 smoke tests do engine (Node puro)
npm run dev   # dev server Vite em http://localhost:3000 (0.0.0.0, usa PORT)
npm run build # gen + vite build → dist/ (produção)
```

Deploy: **Vercel** (framework Vite, output `dist/`) e **hosting Freebuff** (`npm install` + `npm run build`, mesmo `dist/`) — ambos detetam o Vite automaticamente.

## Ao mudar o código

- Testar sempre `npm test` após tocar no `engine.js` — os 39 testes cobrem Fibonacci, Lume, LumeBrain, críticos, Gauntlet, chat PT/EN, jogador, import/export, morte, v6 (escola/skills/fauna/chunks/conduta), v6.1 (Protocolos da Continuidade), v8 (combate ligado, itens no chão, 20 profissões, mundo com 7 territórios) e v8.1 (movimento por toque, fauna com temperamentos, NPCs de ambiente com tarefas).
- **Arquitetura Vite.** `src/` é a fonte; o bundle sai em `dist/` via `npm run build`. O `engine.js` NÃO é importado como módulo (é CJS para os testes Node): o script `gen` copia-o para `public/engine.js` e o `index.html` carrega-o como script global antes do React. Se mexeres no `engine.js`, o `gen` sincroniza automaticamente ao correr `dev`/`build`.
- O `index.html` tem painel de erro de boot que mostra a exceção em vez do loading eterno.
- Three.js: manter o mapa dentro de `src/Mapa3D.jsx`; sincronizações de estado correm no rAF loop lendo props via ref (evita re-renders por tick).
- Manter o engine livre de React/DOM — tem de continuar a correr em Node para os testes.
- Idioma dos textos de UI: português (o mundo pertence ao Criador falante de PT). Código e identificadores: inglês.

## Convenções de estilo

- Engine: funções puras, mutação local de objetos cópia, sem classes.
- UI: componentes pequenos, cores vindas de `CFG`/constantes `CORES`, sem CSS-in-JS pesado.
- Emojis como ícones dos sistemas (🐾 ⚔️ 🕯️ 👑 ✨) — manter coerência com os já usados.
