# 🌍 Mundo Aberto X

**Multiverso de agentes AI autónomos** — uma sociedade viva que corre no browser, com língua própria, economia, evolução genética e **um jogador dentro do mundo**.

![versão](https://img.shields.io/badge/versão-6.0-22d3ee) ![testes](https://img.shields.io/badge/testes-21%20%E2%9C%93-34d399) ![deploy](https://img.shields.io/badge/Vercel-est%C3%A1tico-000) ![mobile](https://img.shields.io/badge/Android%2014-optimizado-34d399)

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
- **🐾 Fauna viva (v6)** — animais vagueiam, ferem-se, reproduzem-se em saltos fib(7) e são curados por cuidadores, hospitais ou pelo Criador.
- **📱 Touch/gameplay (v6)** — d-pad contínuo + botões de ação (Falar, Dar, Curar, Alimentar, +Território), otimizado para Android 14 (PWA, sem zoom por duplo-toque, sem overscroll).
- **💾 Mundo 100% .json** — autosave + export/import: o mundo inteiro num ficheiro.
- **Economia** — 14 profissões (offline e online), ferramentas, habitação, famílias, nascimentos com genética, morte e espíritos.

## 🚀 Correr localmente

```bash
npm install   # Vite, React, Three.js, Recharts
npm test      # 28 smoke tests do engine
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
