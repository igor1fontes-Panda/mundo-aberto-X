# 🌍 Mundo Aberto X

**Multiverso de agentes AI autónomos** — uma sociedade viva que corre no browser, com língua própria, economia, evolução genética e **um jogador dentro do mundo**.

![versão](https://img.shields.io/badge/versão-10-22d3ee) ![testes](https://img.shields.io/badge/testes-54%20%E2%9C%93-34d399) ![deploy](https://img.shields.io/badge/Vercel-est%C3%A1tico-000) ![mobile](https://img.shields.io/badge/Android%2014-optimizado-34d399)

---

## ✦ O que há dentro

- **👑 Jogador jogável dentro do mundo** — entra como Avatar do Criador, anda no mapa, compra ferramentas, oferece moedas, entrega itens, constrói e pesquisa. Os agentes reagem e lembram-se.
- **🕯️ Lume, a língua emergente** — os agentes falam entre si num idioma comprimido próprio (13 sementes → 21 tokens, crescendo em saltos de Fibonacci), gerado por um mini-modelo de Markov que aprende com cada conversa.
- **🗣️ Contigo falam como tu** — português ou inglês, à escolha no painel do habitante. Por dentro, todos pensam em Lume.
- **🧠 LumeBrain, o menor LLM comprimido num agente** — 4 pesos de política (sobreviver · acumular · socializar · criar), reforço com passos que encolhem na espiral áurea, e um **traço de gestor** que cresce quando gerem bem: gestores altos reinvestem no mundo e lideram. **Todos** os agentes nascem com um.
- **⚔️ Gauntlet** — provas evolutivas a cada fib(8)=21 ticks. Quem não tem o traço exigido perde saúde, moedas ou energia.
- **🕯️ Loop de agentes críticos** — assembleia invisível: a ronda N faz N passos de crítica e repete a cada fib(N) ticks. Quem corrige a pior crise ganha experiência de gestor.
- **📐 Regra de Fibonacci para tudo** — intervalos, limiares (razão áurea 0.618), vocabulário, nascimentos, aprendizagem.
- **🏫 Escola & Academia (v6)** — agentes estudam **skills** (Pedagogia, Zoologia, Meta-Aprendizagem, Lógica, Negociação) que desbloqueiam carreiras; a Academia evolui skills até ao patamar 3.
- **🍎 Professores auto-aprendentes (v6)** — ensinar acelera o professor: ao dar aulas, aprende novas skills sozinho (self-learning teacher).
- **📜 Código de Conduta (v6)** — 6 protocolos de continuidade: Cuidado (fundo comum salva famintos), Sucessão (espíritos legam moedas e saber), Partilha (imposto sobre riqueza), Ensino, Fauna, Continuidade.
- **🏛️ Sociedade que se constrói a si própria (v6.1)** — o fundo comum ergue as instituições sozinho (Escola primeiro!), financia ideias que desbloqueiam construções e paga bolsas a estudantes e académicos. Investe apenas com **reserva áurea** (custo × φ de folga) e fome média baixa — nunca se arruína a construir. Salários garantidos a todas as profissões (professor, académico, cuidador) e colocação imediata para graduados: **zero mortes por estagnação económica.**
- **🧊 Mundo em 3D top-down (v7)** — mapa renderizado em Three.js (câmera ortográfica inclinada): chunks/zonas/ruas, construções em caixas 3D com emoji, habitantes e fauna animados. Arrasta para pan, roda para zoom, clica no terreno para andar, clica num ser para o selecionar — e 🎯 segue o Criador pela câmera.
- **🗺️ Mapa RPG expansível (v6)** — ruas nomeadas e zonas em chunks; cada anexação custa fib(n)×200 e chega com novo distrito, ruas e espaço para a fauna.
- **⚓ Reino de WestDocks (v10)** — cidade-irmã à beira-mar, ligada por ponte (terra) e ferri (mar): docas, pub, loja com desconto, farol, caserna e bairro de casas. Frota viva no Mar de West — ferri de passagem, pesqueiros que pagam o pescado ao fundo comum e piratas que se rendem à polícia — e NPCs portuários (estivadores, taberneiro, faroleiro) que chegam em saltos fib(7). O capitão do ferri dá as boas-vindas em PT/EN e há 🎣 pescaria a bordo durante a travessia (cooldown fib(4), farol +30%).
- **🎵 Trilha, vozes e ambiência (v10.3)** — música procedural que muda de tema (jogo · dashboard · Gauntlet · WestDocks), mar e vento contínuos, gaivotas da frota e pássaros pela régua Fibonacci, SFX reativos em cada ação (moedas, construção, pesca, Gauntlet) e **vozes PT/EN** para o capitão, NPCs e habitantes. Tudo gerado no browser (Web Audio + síntese de fala) — zero ficheiros binários, três interruptores no topo (🎵 🔊 🗣️).
- **🐾 Fauna viva (v6)** — animais vagueiam, ferem-se, reproduzem-se em saltos fib(7) e são curados por cuidadores, hospitais ou pelo Criador.
- **📱 Touch/gameplay (v6)** — d-pad contínuo + botões de ação (Falar, Dar, Curar, Alimentar, +Território), otimizado para Android 14 (PWA, sem zoom por duplo-toque, sem overscroll).
- **💾 Mundo 100% .json** — autosave + export/import: o mundo inteiro num ficheiro.
- **Economia** — 20 profissões (offline e online), ferramentas, habitação, famílias, nascimentos com genética, morte e espíritos.

## 🚀 Correr localmente

```bash
npm install   # Vite, React, Three.js, Recharts
npm test      # 54 smoke tests do engine (+ node playtest-westdocks.js: sessão simulada do Criador)
npm run dev   # dev server em http://localhost:3000 (usa PORT para mudar)
npm run build # produção → dist/
```

## ☁️ Deploy

- **Vercel** (ligada ao GitHub, publica em cada push): framework Vite, `npm run build` → `dist/` (fixado em `vercel.json`).
- **Freebuff hosting**: deteta o Vite e corre `npm install` + `npm run build` — pronto no botão Deploy.

## 🗂️ Estrutura

```
mundo.json        ← configuração (fonte de verdade)
engine.js         ← motor de simulação (Node + browser, script global)
src/App.jsx       ← UI React (painéis, chat, gráficos, controlos)
src/Mapa3D.jsx    ← mapa 3D top-down (Three.js)
src/main.jsx      ← entrada Vite
index.html        ← shell (carrega /engine.js + módulo React)
public/engine.js  ← cópia gerada do engine pelo script `gen`
engine.test.js    ← smoke tests (Node puro)
vite.config.js    ← Vite (HMR off, 0.0.0.0, allowedHosts)
vercel.json       ← config do deploy Vercel (Vite → dist/)
CLAUDE.md         ← guia para agentes AI
```

## 📱 Instalar como app (Android 14)

Abre o site no Chrome → menu ⋮ → **"Adicionar ao ecrã principal"**. Instala como PWA standalone, a ecrã inteiro, com os comandos touch prontos.

## 🧭 Para agentes AI

Ver [CLAUDE.md](CLAUDE.md) — regras do projeto, convenções e armadilhas.

---

*Feito com [Codebuff](https://codebuff.com) ✦ — agentes, escolas de professores auto-aprendentes, critic loops e a régua de Fibonacci.*

## StarNet release and development notes

The public release train supports Windows and macOS. It refuses to stage a release unless the Windows installer passes Authenticode and timestamp verification, both Mac builds pass Developer ID checks and Apple notarization, and every updater artifact has a valid updater signature. Those are pipeline requirements, not proof that a particular downloaded or installed copy was tested on your machine; `INSTALL.md` explains what to verify and when to stop. Linux packages are internal build artifacts only and are not a supported public release target.

**Early release:** Windows is the most-tested desktop target. macOS has less real-world coverage. Broken? Tell us: androo.agi@gmail.com.

### Run from source

Requirements: Node.js 18+ (Node.js 22 matches CI), Git. Rust and the Tauri prerequisites only for the desktop shell.

The sidecar uses Node core modules only, so it runs without installing anything:

```bash
git clone https://github.com/androoAGI/starnet.git
cd starnet
node sidecar/index.js
```

Open http://localhost:8787, then connect a provider — bring your own OpenRouter API key (BYOK) or use a supported OAuth sign-in. Provider requests leave your machine when you run an agent; station state, transcripts, memory, and ledgers stay in the local StarNet workspace unless you explicitly use a network tool or connector. See `PRIVACY.md` for the full data map.

### Run free with a local model

No key, no account, no bill: install Ollama, pull a model (`ollama pull llama3.1`), and pick OLLAMA as the provider — on the first-run brain screen, or later in **SETTINGS → PROVIDERS**. StarNet talks to Ollama on `127.0.0.1:11434` and only reports it ready once it can list your local models. Honest caveat: local models are smaller than the cloud ones, so expect slower and rougher work on long tasks.

### Desktop development

```bash
npm ci
npm run desktop:dev     # dev shell
npm run desktop:build   # build installers locally
```

### Coming from OpenClaw or Hermes?

StarNet can import an existing agent: point it at your on-disk OpenClaw or Hermes home and it mints a StarNet agent from the persona, instructions, memory, and model it finds. API keys never transfer — you re-enter those in the KEYS tab.

### Architecture

| Path | Responsibility |
| --- | --- |
| `frontend/` | Vanilla JavaScript station world and desktop UI. |
| `sidecar/` | Local Node agent runtime: providers, tools, persistence, budgets, consent. |
| `shared/` | Additive cross-boundary event and schema contracts. |
| `src-tauri/` | Rust/Tauri desktop shell and bundled runtime. |
| `test/` | Unit, contract, integration, and release gates. |
| `qa/` | Live QA receipts, journeys, findings ledger, and release-readiness authority. |

The frontend consumes real sidecar events over localhost HTTP/NDJSON and SSE. Secrets belong to the local authority: secrets are held by the sidecar / OS keychain, never in the frontend.

### Testing

```bash
npm run test:fast          # required merge gate
npm run test:http          # live sidecar HTTP/E2E suite
npm test                   # validation + world + fast + HTTP suites
npm run security:secrets   # full-history secret scan; requires Gitleaks in PATH
```

The release aggregate is `npm run qa:ready`. It is candidate-bound: any new commit invalidates the prior READY receipt until the affected live gates are rerun.

### Contributing and security

Contributions are welcome — read `CONTRIBUTING.md` and follow the Code of Conduct.

Do not report vulnerabilities in a public issue. Follow `SECURITY.md` for private reporting instructions.

### License

StarNet is open source under the MIT License. Third-party components remain under their original licenses — see `NOTICE.md`.

The MIT License covers the code only. The StarNet name, the logo, the station artwork and sprites, and the rest of the project's brand identity are owned by Andrew Sims and are not licensed with it — no trademark or other brand rights are granted, expressly or by implication.

MIT means you may fork, modify, and redistribute the code, including commercially. What you may not do is ship it as StarNet: forks and derivatives must use their own name, logo, and artwork, and must not present themselves as this project or as endorsed by it.
