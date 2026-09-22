import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import Mapa3D from './Mapa3D.jsx';
import Minimapa from './Minimapa.jsx';
import CFG from '../mundo.json';

/* ============================================================
   MUNDO ABERTO X — UI v7 (Vite + React + Three.js)
   v7: mapa 3D top-down, pan/zoom/seguir, flash de Gauntlet
   ============================================================ */

const E = window.Engine;
const FIB8 = E.fib(8); // 21 — intervalo do Gauntlet

// Migração v5 → v6+: mundos antigos ganham os novos campos
(function migrar() {
  try {
    const antigo = localStorage.getItem('mundo-aberto-x-v5');
    if (antigo && !localStorage.getItem(CFG.meta.storageKey)) {
      localStorage.setItem(CFG.meta.storageKey, antigo);
    }
  } catch (e) {}
})();

const CORES = {
  bg: '#020617', painel: 'rgba(15,23,42,0.85)', borda: '#1e293b',
  acento: '#22d3ee', ouro: '#fbbf24', vida: '#34d399', perigo: '#f87171',
};

const Icons = {
  User: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>,
  Crown: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z" /><path d="M5 20h14" /></svg>,
  Download: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>,
  Upload: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" x2="12" y1="3" y2="15" /></svg>,
  Plus: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>,
  Send: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>,
  X: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>,
};

/* ---------- Componentes pequenos ---------- */
function Bar({ label, valor, max = 100, cor }) {
  const p = Math.max(0, Math.min(100, (valor / max) * 100));
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-slate-400">
        <span>{label}</span><span>{Math.round(valor)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: p + '%', background: cor }} />
      </div>
    </div>
  );
}

function Chip({ children, cor = CORES.acento, onClick, active, title }) {
  return (
    <button title={title} onClick={onClick}
      className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border transition-all hover:scale-105"
      style={{ color: cor, borderColor: cor + '55', background: active ? cor + '22' : 'transparent' }}>
      {children}
    </button>
  );
}

function StatPill({ emoji, valor, titulo }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 bg-slate-900/70 border border-slate-800" title={titulo}>
      <span className="text-sm">{emoji}</span>
      <span className="text-xs font-bold text-slate-200">{valor}</span>
    </div>
  );
}

/* ---------- App ---------- */
export default function App() {
  const mundoRef = useRef(null);
  if (!mundoRef.current) {
    const m = E.criarMundo(CFG);
    let carregado = false;
    try {
      const salvo = localStorage.getItem(CFG.meta.storageKey);
      if (salvo) carregado = E.deserializar(m, JSON.parse(salvo));
    } catch (e) { console.warn('Falha ao carregar mundo salvo', e); }
    mundoRef.current = m;
  }
  const [, setPing] = useState(0);
  const repintar = useCallback(() => setPing(p => p + 1), []);

  const [velIdx, setVelIdx] = useState(0);
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [modalCriar, setModalCriar] = useState(false);
  const [tab, setTab] = useState('mundo'); // mundo | construir | sociedade | regras
  const [vista, setVista] = useState('jogo'); // jogo | dashboard — duas interfaces distintas
  const [novoSer, setNovoSer] = useState({ nome: '', arquetipo: 'humano', faccao: 'independente' });
  const [chatInput, setChatInput] = useState('');
  const [toast, setToast] = useState(null);
  const [alvoFauna, setAlvoFauna] = useState(null);
  const chatRef = useRef(null);
  const fileRef = useRef(null);
  const logRef = useRef(null);
  const ultimoTick = useRef(0);

  const mostrarToast = useCallback((msg, erro) => {
    setToast({ msg, erro: !!erro, id: Date.now() });
    setTimeout(() => setToast(null), 2600);
  }, []);

  // ----- Game loop — o mundo corre sempre; desinstalar a app é a única pausa -----
  useEffect(() => {
    const iv = setInterval(() => {
      const m = mundoRef.current;
      E.tick(m);
      if (m.tickCount % 10 === 0) {
        try { localStorage.setItem(CFG.meta.storageKey, E.serializar(m)); } catch (e) {}
      }
      // toast automático quando o Gauntlet dispara (fib(8)=21 ticks)
      if (m.tickCount > 0 && m.tickCount % FIB8 === 0 && m.tickCount !== ultimoTick.current) {
        ultimoTick.current = m.tickCount;
        mostrarToast('⚔️ GAUNTLET! A tempestade testa a sociedade…', true);
      }
      repintar();
    }, CFG.mundo.velocidades[velIdx]);
    return () => clearInterval(iv);
  }, [velIdx, repintar, mostrarToast]);

  const m = mundoRef.current;
  const jogador = m.jogador;
  const selecionado = useMemo(
    () => m.agentes.find(a => a.id === selecionadoId) || null,
    [m, selecionadoId, m.tickCount]
  );

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = 0; }, [m.tickCount]);

  // ----- Export / Import -----
  const exportar = () => {
    const dados = E.serializar(mundoRef.current);
    const blob = new Blob([dados], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mundo-aberto-x-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    mostrarToast('Mundo exportado como .json ✓');
  };
  const importar = (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const dados = JSON.parse(e.target.result);
        if (E.deserializar(mundoRef.current, dados)) {
          localStorage.setItem(CFG.meta.storageKey, E.serializar(mundoRef.current));
          setSelecionadoId(null);
          mostrarToast('Mundo importado com sucesso ✓');
          repintar();
        } else mostrarToast('Ficheiro inválido: sem agentes', true);
      } catch (err) { mostrarToast('JSON inválido', true); }
    };
    reader.readAsText(file);
    ev.target.value = '';
  };
  const novoMundo = () => {
    try { localStorage.removeItem(CFG.meta.storageKey); } catch (e) {}
    mundoRef.current = E.criarMundo(CFG);
    setSelecionadoId(null);
    mostrarToast('Um novo multiverso nasceu ✦');
    repintar();
  };

  // ----- Ações do jogador -----
  const entrarComoCriador = () => {
    const j = E.entrarComoJogador(mundoRef.current, 'Criador');
    setSelecionadoId(j.id);
    mostrarToast('Entraste no mundo como Avatar do Criador 👑');
    repintar();
  };
  const moverMapa = (x, y, correr) => {
    if (!jogador) return;
    E.jogadorMover(mundoRef.current, x, y, correr);
    repintar();
  };
  const comprar = (key) => {
    const r = E.jogadorComprar(mundoRef.current, key);
    mostrarToast(r.ok ? `Compraste: ${CFG.ferramentas[key].nome}` : r.erro, !r.ok);
    repintar();
  };
  const ofertar = (quantia) => {
    if (!selecionado) return;
    const r = E.jogadorOfertar(mundoRef.current, selecionado.id, quantia);
    mostrarToast(r.ok ? `Ofereceste ${r.quantia} moedas a ${selecionado.nome}` : r.erro, !r.ok);
    repintar();
  };
  const darFerramenta = (key) => {
    if (!selecionado) return;
    const r = E.jogadorDarFerramenta(mundoRef.current, selecionado.id, key);
    mostrarToast(r.ok ? `Entregue: ${CFG.ferramentas[key].nome}` : r.erro, !r.ok);
    repintar();
  };
  const construir = (tipo) => {
    const r = jogador ? E.jogadorConstruir(mundoRef.current, tipo) : { ok: false, erro: 'Entra como Criador primeiro' };
    mostrarToast(r.ok ? `Construção iniciada: ${CFG.construcoes[tipo].nome}` : r.erro, !r.ok);
    repintar();
  };
  const pesquisar = (ideaId) => {
    const r = jogador ? E.jogadorPesquisar(mundoRef.current, ideaId) : { ok: false, erro: 'Entra como Criador primeiro' };
    const idea = CFG.ideias.find(i => i.id === ideaId);
    mostrarToast(r.ok ? `Ideia descoberta: ${idea.nome}` : r.erro, !r.ok);
    repintar();
  };
  const criarSer = () => {
    if (!novoSer.nome.trim()) return;
    const novo = E.criarAgente(CFG, novoSer.nome.trim(), novoSer.arquetipo, novoSer.faccao);
    mundoRef.current.agentes.push(novo);
    E.logMundo(mundoRef.current, `✨ ${novo.nome} surgiu no multiverso (${CFG.arquetipos[novo.arquetipo].label}).`);
    setModalCriar(false);
    setNovoSer({ nome: '', arquetipo: 'humano', faccao: 'independente' });
    repintar();
  };
  const enviarMsg = () => {
    if (!chatInput.trim() || !selecionado) return;
    E.enviarChat(mundoRef.current, selecionado.id, chatInput.trim());
    setChatInput('');
    repintar();
  };
  const mudarIdioma = (lang) => {
    if (!selecionado) return;
    E.mudarIdioma(mundoRef.current, selecionado.id, lang);
    mostrarToast(lang === 'pt' ? `${selecionado.nome} agora fala português` : `${selecionado.nome} now speaks English`);
    repintar();
  };

  const interagirFauna = (acao) => {
    if (!alvoFauna) return;
    const r = E.jogadorInteragirAnimal(mundoRef.current, alvoFauna, acao);
    mostrarToast(r.ok ? (acao === 'curar' ? 'Animal curado 💗' : 'Animal alimentado 🍖') : r.erro, !r.ok);
    if (r.ok) setAlvoFauna(null);
    repintar();
  };
  const expandirMundo = () => {
    const r = jogador ? E.jogadorExpandirMapa(mundoRef.current) : { ok: false, erro: 'Entra como Criador primeiro' };
    mostrarToast(r.ok ? `Território anexado: ${r.chunk}` : r.erro, !r.ok);
    repintar();
  };
  const aceitarMissao = (id) => {
    const r = E.aceitarMissao(mundoRef.current, id);
    if (r.ok && r.missao.alvo) {
      // missão física: no comboio, o Criador parte ao encontro do NPC; nas outras,
      // vai direto ao marcador no terreno
      const m2 = mundoRef.current;
      const destino = r.missao.comboio
        ? ((m2.npcs || []).find(nn => nn.id === r.missao.escoltadoId) || r.missao.alvo)
        : r.missao.alvo;
      m2.jogador.x = destino.x; m2.jogador.y = destino.y;
      mostrarToast('📜 ' + (r.missao.comboio ? 'Comboio aceite — parte ao encontro do escoltado ' : 'Missão aceite — o avatar partiu para o marcador ') + r.missao.emoji);
      setVista('jogo'); // ver a viagem no mapa
    } else mostrarToast(r.ok ? '📜 Missão aceite' : r.erro, !r.ok);
    repintar();
  };
  const concluirMissao = (id) => {
    const r = E.completarMissao(mundoRef.current, id);
    mostrarToast(r.ok ? ('✅ +' + r.recompensa + '🪙 · cultura e reputação') : r.erro, !r.ok);
    repintar();
  };
  const mediar = () => {
    const r = E.mediarPaz(mundoRef.current);
    mostrarToast(r.ok ? ('🕊️ Mediação: ' + Math.round(r.processo) + '% do processo de paz') : r.erro, !r.ok);
    repintar();
  };
  const definirCarreira = (prof) => {
    if (!selecionado) return;
    const r = E.jogadorDefinirCarreira(mundoRef.current, selecionado.id, prof);
    mostrarToast(r.ok ? `${selecionado.nome} é agora ${CFG.profissoes[prof].nome}` : r.erro, !r.ok);
    repintar();
  };

  // ----- Ações de jogo (pegar/gerar/atacar/defender/interagir) -----
  const acaoPegar = useCallback(() => {
    const r = E.jogadorPegar(mundoRef.current);
    mostrarToast(r.ok ? r.msg : r.erro, !r.ok);
    repintar();
  }, [mostrarToast, repintar]);
  const acaoGerar = useCallback(() => {
    const r = E.jogadorGerarItem(mundoRef.current, 'comida');
    mostrarToast(r.ok ? r.msg : r.erro, !r.ok);
    repintar();
  }, [mostrarToast, repintar]);
  const acaoDefender = useCallback(() => {
    const r = E.jogadorDefender(mundoRef.current);
    mostrarToast(r.ok ? '🛡️ Defesa ativa — golpes refletidos' : r.erro, !r.ok);
    repintar();
  }, [mostrarToast, repintar]);
  const acaoAtacar = useCallback(() => {
    const m2 = mundoRef.current;
    const alvo = m2.agentes.find(a => a.id === selecionadoId);
    if (!alvo || alvo.isCriador) { mostrarToast('Seleciona um habitante no mapa para atacar', true); return; }
    const r = E.jogadorAtacar(m2, alvo.id);
    mostrarToast(r.ok ? `⚔️ Golpe em ${alvo.nome} (−${r.dano} saúde${r.defendido ? ' · defendido' : ''})` : r.erro, !r.ok);
    repintar();
  }, [selecionadoId, mostrarToast, repintar]);
  const acaoInteragir = useCallback(() => {
    const m2 = mundoRef.current;
    const alvo = m2.agentes.find(a => a.id === selecionadoId);
    if (!alvo || alvo.isCriador) { mostrarToast('Seleciona um habitante para interagir', true); return; }
    const r = E.jogadorInteragirSer(m2, alvo.id, 'elogiar');
    mostrarToast(r.ok ? r.msg : r.erro, !r.ok);
    repintar();
  }, [selecionadoId, mostrarToast, repintar]);

  // ----- Gamepad (Android/comandos): stick esquerdo move · A=pegar · B=atacar · X=interagir · Y=defender -----
  useEffect(() => {
    let rafId = 0;
    let prevButtons = [];
    let lastMove = 0;
    const step = (now) => {
      rafId = requestAnimationFrame(step);
      try {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = pads && (pads[0] || Array.from(pads).find(pp => pp));
        if (!gp) return;
        const m2 = mundoRef.current;
        const dz = v => (Math.abs(v) > 0.25 ? v : 0);
        const vx = dz(gp.axes[0] || 0), vy = dz(gp.axes[1] || 0);
        if (m2.jogador && (vx || vy) && now - lastMove > 90) {
          lastMove = now;
          E.jogadorMover(m2, m2.jogador.x + vx * 14, m2.jogador.y + vy * 14);
          repintar();
        }
        const pressed = i => !!(gp.buttons[i] && gp.buttons[i].pressed);
        const just = i => pressed(i) && !prevButtons[i];
        if (just(0)) acaoPegar();
        if (just(1)) acaoAtacar();
        if (just(2)) acaoInteragir();
        if (just(3)) acaoDefender();
        prevButtons = gp.buttons.map(b => b.pressed);
      } catch (e) { /* gamepad indisponível — silencioso */ }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [acaoPegar, acaoAtacar, acaoInteragir, acaoDefender, repintar]);

  // ----- Derivados -----
  const vivos = m.agentes.filter(a => a.estado === 'vivo');
  const ticksParaGauntlet = FIB8 - (m.tickCount % FIB8);
  const histCultura = useMemo(() => {
    const h = m.histCultura || (m.histCultura = []);
    const ultimo = h[h.length - 1];
    if (!ultimo || ultimo.tick !== m.tickCount) {
      h.push({ tick: m.tickCount, cultura: Math.round(m.culturaGlobal) });
      if (h.length > 60) h.shift();
    }
    return h;
  }, [m, m.tickCount]);

  const chatSel = selecionado ? (m.chats[selecionado.id] || []) : [];
  const dim = E.dimensoesMundo(m);

  return (
    <div className="min-h-screen text-slate-200" style={{ background: `radial-gradient(1200px 600px at 70% -10%, #0b2b3a55, transparent), ${CORES.bg}` }}>
      {/* ============ TOP BAR ============ */}
      <header className="sticky top-0 z-30 backdrop-blur border-b border-slate-800" style={{ background: CORES.painel }}>
        <div className="max-w-7xl mx-auto px-3 py-2 flex flex-wrap items-center gap-2">
          <h1 className="text-sm sm:text-base font-black tracking-tight mr-2">
            <span style={{ color: CORES.ouro }}>🌍</span> MUNDO ABERTO <span style={{ color: CORES.acento }}>X</span>
            <span className="ml-2 text-[10px] font-mono text-slate-500">tick {m.tickCount} · fib {FIB8}</span>
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            {/* Jogo ↔ Dashboard: duas interfaces distintas */}
            <div className="flex rounded-xl overflow-hidden border border-slate-700 mr-1" title="Jogo: mapa 3D e ações · Dashboard: informação e política">
              <button onClick={() => setVista('jogo')}
                className="px-3 py-1.5 text-xs font-black transition-colors"
                style={{ background: vista === 'jogo' ? 'linear-gradient(135deg,#0891b2,#7c3aed)' : 'transparent', color: vista === 'jogo' ? '#fff' : '#94a3b8' }}>
                🎮 Jogo
              </button>
              <button onClick={() => setVista('dashboard')}
                className="px-3 py-1.5 text-xs font-black transition-colors"
                style={{ background: vista === 'dashboard' ? 'linear-gradient(135deg,#0891b2,#7c3aed)' : 'transparent', color: vista === 'dashboard' ? '#fff' : '#94a3b8' }}>
                📊 Dashboard
              </button>
            </div>
            <StatPill emoji="👥" valor={vivos.length} titulo="População viva" />
            <StatPill emoji="🎨" valor={Math.round(m.culturaGlobal)} titulo="Cultura global" />
            <StatPill emoji="🌟" valor={'K' + ((m.kardashev && m.kardashev.nivel) || 0)} titulo="Escala de Kardashev (sociedade tipo 0→III)" />
            <StatPill emoji="🕊️" valor={m.diplomacia ? Math.round(m.diplomacia.reputacaoCriador) : 20} titulo="Reputação do Criador (diplomacia)" />
            <StatPill emoji="⚔️" valor={ticksParaGauntlet} titulo="Ticks até ao próximo Gauntlet" />
            <StatPill emoji="🕯️" valor={'ronda ' + m.criticos.ronda} titulo="Ronda dos críticos (intervalo fib(N))" />
            <div className="flex rounded-lg overflow-hidden border border-slate-700" title="Velocidade do mundo — corre sempre">
              {['▶', '⏩', '⚡'].map((s, i) => (
                <button key={i} onClick={() => setVelIdx(i)}
                  className="px-2 py-1 text-xs font-bold transition-colors"
                  style={{ background: velIdx === i ? '#0e7490' : 'transparent', color: velIdx === i ? '#fff' : '#94a3b8' }}>
                  {s}
                </button>
              ))}
            </div>
            {!jogador && (
              <button onClick={entrarComoCriador}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-900 transition-transform hover:scale-105"
                style={{ background: `linear-gradient(135deg, ${CORES.ouro}, #f59e0b)` }}>
                👑 Entrar como Criador
              </button>
            )}
            <button onClick={exportar} title="Exportar mundo .json" className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800"><Icons.Download className="w-4 h-4" /></button>
            <button onClick={() => fileRef.current && fileRef.current.click()} title="Importar mundo .json" className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800"><Icons.Upload className="w-4 h-4" /></button>
            <button onClick={novoMundo} title="Novo mundo" className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs">✦</button>
            <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={importar} />
          </div>
        </div>
      </header>

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-sm font-semibold shadow-2xl border mu-fade"
          style={{ background: toast.erro ? '#450a0a' : '#052e16', borderColor: toast.erro ? CORES.perigo : CORES.vida, color: toast.erro ? '#fecaca' : '#bbf7d0' }}>
          {toast.msg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-3 py-3 grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-3">
        {/* ============ COLUNA ESQUERDA: HABITANTES (só na vista Jogo) ============ */}
        <section className="rounded-2xl border border-slate-800 p-3 order-2 lg:order-1" style={{ background: CORES.painel, display: vista === 'jogo' ? undefined : 'none' }}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">Habitantes ({m.agentes.length})</h2>
            <button onClick={() => setModalCriar(true)} className="p-1 rounded-lg border border-slate-700 hover:bg-slate-800" title="Criar habitante"><Icons.Plus className="w-3.5 h-3.5" /></button>
          </div>
          <div className="space-y-1.5 max-h-[300px] lg:max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
            {m.agentes.map(ag => {
              const arq = CFG.arquetipos[ag.arquetipo] || CFG.arquetipos.humano;
              const sel = ag.id === selecionadoId;
              return (
                <button key={ag.id} onClick={() => setSelecionadoId(ag.id)}
                  className="w-full text-left px-2 py-1.5 rounded-xl border transition-all hover:translate-x-0.5"
                  style={{ borderColor: sel ? arq.cor : '#1e293b', background: sel ? arq.cor + '14' : 'rgba(2,6,23,0.5)', opacity: ag.estado === 'morto' ? 0.45 : 1 }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base" style={{ filter: sel ? `drop-shadow(0 0 4px ${arq.cor})` : 'none' }}>{arq.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold truncate" style={{ color: sel ? arq.cor : '#e2e8f0' }}>
                        {ag.nome}{ag.isCriador && ' 👑'}{ag.gestor > 0.5 && ' 🧭'}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{(CFG.profissoes[ag.profissao] || {}).nome || ag.profissao} · ❤ {Math.round(ag.necessidades.saude)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {jogador && (
            <div className="mt-3 pt-3 border-t border-slate-800">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Mochila do Criador</h3>
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(CFG.ferramentas).map(([k, f]) => (
                  <button key={k} onClick={() => comprar(k)}
                    className="flex items-center justify-between px-2 py-1 rounded-lg border border-slate-800 hover:border-amber-500/50 hover:bg-amber-500/5 text-left transition-colors">
                    <span className="text-[11px] text-slate-300">{f.nome}</span>
                    <span className="text-[10px] font-mono" style={{ color: jogador.necessidades.dinheiro >= f.custo ? CORES.ouro : CORES.perigo }}>{f.custo}🪙</span>
                  </button>
                ))}
              </div>
              <div className="mt-1.5 text-[10px] text-slate-500">
                Inventário: {jogador.inventario.length ? jogador.inventario.map(k => (CFG.ferramentas[k] || {}).nome || k).join(', ') : 'vazio'}
              </div>
            </div>
          )}
        </section>

        {/* ============ CENTRO: MAPA 3D / ABAS / DASHBOARD ============ */}
        <section className="order-1 lg:order-2 space-y-3">
          {vista === 'dashboard' && (
            <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
              <h2 className="text-sm font-black" style={{ color: CORES.ouro }}>📊 Dashboard do Mundo</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Missões, diplomacia, justiça, história e a ascensão Kardashev — tudo o que a sociedade fez enquanto jogaste.
                Volta ao 🎮 Jogo para agir no mapa.
              </p>
            </div>
          )}
          <div className="flex gap-1.5" style={{ display: vista === 'jogo' ? undefined : 'none' }}>
            {[['mundo', '🗺️ Mundo'], ['construir', '🏛️ Construir'], ['sociedade', '🏫 Sociedade'], ['regras', '✨ Regras']].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: tab === t ? 'linear-gradient(135deg,#0891b2,#7c3aed)' : 'rgba(15,23,42,0.8)', color: tab === t ? '#fff' : '#94a3b8', border: '1px solid #1e293b' }}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'mundo' && vista === 'jogo' && (
            <div>
              <div className="relative">
                <Mapa3D
                  m={m} CFG={CFG} dim={dim} jogador={jogador}
                  selecionadoId={selecionadoId} alvoFauna={alvoFauna}
                  onMover={moverMapa} onSelecionar={setSelecionadoId} onFauna={setAlvoFauna}
                />
                {/* ===== MINIMAPA overlay (canto): dá acesso à vista estratégica ===== */}
                {/* canto superior ESQUERDO: os botões de ação da câmara (+/−/📐/⟲/⟳/🎯) vivem à direita e nunca ficam tapados */}
                <div className="absolute top-2 left-2 z-20 rounded-xl overflow-hidden shadow-2xl backdrop-blur"
                  style={{ background: 'rgba(2,6,23,0.72)', border: '1px solid #1e293b' }}>
                  <div className="px-2 pt-1 pb-0.5 flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: CORES.acento }}>🗺️ Minimapa</span>
                    <button onClick={() => setVista('dashboard')} title="Abrir dashboard (informação completa)"
                      className="text-[9px] font-bold px-1.5 rounded" style={{ background: '#1e293b', color: '#7dd3fc' }}>📊</button>
                  </div>
                  <div className="px-1.5 pb-1.5">
                    <Minimapa m={m} CFG={CFG} dim={dim} jogador={jogador}
                      onNavegar={(x, y) => { if (jogador) moverMapa(x, y, false); }}
                      width={186} height={104} />
                  </div>
                  {m.historia && m.historia.arcoAtivo && (
                    <div className="px-2 pb-1.5 text-[9px] leading-tight" style={{ color: '#c084fc' }}>
                      {m.historia.arcoAtivo.emoji} {m.historia.arcoAtivo.nome} · cap {m.historia.arcoAtivo.capitulo}/{m.historia.arcoAtivo.capituloMax}
                    </div>
                  )}
                </div>
              </div>

              {/* ===== HUD da missão ativa (v9.1): física ou de sociedade ===== */}
              {(() => {
                const ativa = (m.missoes || []).find(q => q.aceite && !q.concluida);
                if (!ativa) return null;
                const npcEsc = ativa.comboio && ativa.escoltadoId ? (m.npcs || []).find(nn => nn.id === ativa.escoltadoId) : null;
                return (
                  <div className="rounded-xl border p-2.5 flex items-center gap-2.5" style={{ background: 'rgba(2,6,23,0.8)', borderColor: ativa.pronta ? CORES.vida + '66' : '#1e293b' }}>
                    <span className="text-xl">{ativa.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-black text-slate-200 truncate">
                        {ativa.nome} {ativa.comboio && <span style={{ color: '#60a5fa' }}>🧍 comboio{npcEsc ? ': ' + npcEsc.nome : ''}</span>}
                        {!ativa.comboio && ativa.alvo && <span style={{ color: CORES.ouro }}>📍 físico</span>}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500" style={{ width: Math.min(100, (ativa.progresso / ativa.meta) * 100) + '%', background: ativa.pronta ? CORES.vida : CORES.acento }} />
                        </div>
                        <span className="text-[9px] font-mono text-slate-500">{ativa.progresso}/{ativa.meta}</span>
                      </div>
                      {ativa.comboio && npcEsc && !ativa.pronta && jogador && (
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          🧍 Mantém-te perto de {npcEsc.nome} — ele segue-te até ({Math.round(ativa.alvo.x)}, {Math.round(ativa.alvo.y)}) · distância {Math.round(Math.hypot(npcEsc.x - ativa.alvo.x, npcEsc.y - ativa.alvo.y))}m
                        </p>
                      )}
                      {!ativa.comboio && ativa.alvo && !ativa.pronta && jogador && (
                        <p className="text-[9px] text-slate-500 mt-0.5">
                          📍 Chega ao marcador dourado no mapa ({Math.round(ativa.alvo.x)}, {Math.round(ativa.alvo.y)}) · distância {Math.round(Math.hypot(jogador.x - ativa.alvo.x, jogador.y - ativa.alvo.y))}m
                        </p>
                      )}
                      {ativa.pronta && <p className="text-[9px] mt-0.5" style={{ color: CORES.ouro }}>💰 Metade da recompensa cai num baú no chão junto de ti — vai buscá-lo!</p>}
                    </div>
                    {ativa.pronta && (
                      <button onClick={() => concluirMissao(ativa.id)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-black" style={{ background: CORES.vida, color: '#052e16' }}>
                        ✅ Recolher {ativa.recompensa}🪙
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* ===== Controlos touchscreen (Android/mobile): tap no mapa para andar ===== */}
              <div className="flex items-start justify-between gap-2 mt-2">
                <div className="rounded-xl border border-slate-800 px-2.5 py-1.5 text-[10px] leading-snug text-slate-400 select-none" style={{ background: 'rgba(15,23,42,0.7)', maxWidth: 170 }}>
                  👆 Toca no terreno para andar · num ser para selecionar
                  {jogador && <> · duplo-toque no terreno corre para lá</>}
                </div>
                <div className="flex flex-wrap gap-1.5 justify-end flex-1">
                  {selecionado && selecionado.id !== (jogador && jogador.id) && (
                    <>
                      <button onClick={() => { if (chatRef.current) chatRef.current.focus(); }}
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#0e7490', color: '#fff' }}>🗨 Falar</button>
                      <button onClick={() => ofertar(10)}
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#713f12', color: '#fde68a' }}>🪙 Dar 10</button>
                    </>
                  )}
                  {alvoFauna && (
                    <>
                      <button onClick={() => interagirFauna('curar')}
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#052e16', color: '#bbf7d0' }}>💗 Curar</button>
                      <button onClick={() => interagirFauna('alimentar')}
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#052e16', color: '#bbf7d0' }}>🍖 Alimentar</button>
                    </>
                  )}
                  {jogador && (
                    <>
                      <button onClick={acaoPegar} title="Pegar item próximo"
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#1e293b', color: '#e2e8f0' }}>📦 Pegar</button>
                      <button onClick={acaoGerar} title="Colocar comida no chão"
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#1e293b', color: '#fde68a' }}>🍖 Gerar</button>
                      <button onClick={acaoDefender} title="Defesa ativa (reflete golpes)"
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#1e3a8a', color: '#bfdbfe' }}>🛡 Defender</button>
                    </>
                  )}
                  {jogador && selecionado && !selecionado.isCriador && (
                    <>
                      <button onClick={acaoAtacar}
                        className="px-3 py-2 rounded-xl text-xs font-black" style={{ background: '#7f1d1d', color: '#fecaca' }}>⚔ Atacar</button>
                      <button onClick={acaoInteragir}
                        className="px-3 py-2 rounded-xl text-xs font-bold" style={{ background: '#064e3b', color: '#a7f3d0' }}>✨ Interagir</button>
                    </>
                  )}
                  {jogador && (
                    <button onClick={expandirMundo}
                      className="px-3 py-2 rounded-xl text-xs font-black text-slate-900"
                      style={{ background: `linear-gradient(135deg, ${CORES.acento}, #7c3aed)` }}>
                      🗺️ + Território ({E.custoProximoChunk(m)}🪙)
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'mundo' && (
            <div ref={logRef} className="rounded-2xl border border-slate-800 p-3 h-44 overflow-y-auto custom-scrollbar" style={{ background: CORES.painel }}>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">Crónica do mundo</h3>
              {m.log.length === 0 && <p className="text-xs text-slate-600">O silêncio antes da primeira história…</p>}
              <div className="space-y-1">
                {m.log.map((l, i) => (
                  <p key={i} className="text-xs text-slate-300 leading-snug" style={{ opacity: Math.max(0.35, 1 - i * 0.03) }}>
                    <span className="font-mono text-[9px] text-slate-600 mr-1.5">t{m.tickCount - i}</span>{l.texto}
                  </p>
                ))}
              </div>
            </div>
          )}

          {tab === 'sociedade' && vista === 'jogo' && (
            <div className="space-y-3">
              {/* Escola / Academia */}
              <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
                <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: CORES.ouro }}>🏫 Escola & 🏛️ Academia</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {Object.entries(CFG.skills.catalogo).map(([k, s]) => {
                    const donos = m.agentes.filter(a => a.skills && a.skills[k]);
                    const nivelMedio = donos.length ? (donos.reduce((s2, a) => s2 + a.skills[k], 0) / donos.length).toFixed(1) : '—';
                    return (
                      <div key={k} className="rounded-xl border border-slate-800 p-2" style={{ background: '#020617aa' }}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-base">{s.emoji}</span>
                          <span className="text-[11px] font-bold text-slate-200">{s.nome}</span>
                          <span className="ml-auto text-[9px] font-mono text-slate-500">{donos.length} dono(s) · nível {nivelMedio}</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">{s.descricao} → desbloqueia <b>{(CFG.profissoes[s.desbloqueia] || {}).nome || s.desbloqueia}</b></p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Código de Conduta */}
              <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: CORES.ouro }}>📜 Código de Conduta</h3>
                  <span className="ml-auto text-[10px] font-mono text-slate-500">💰 Fundo comum: {m.fundoComum || 0}🪙</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {CFG.conduta.codigos.map(c => (
                    <div key={c.id} className="rounded-xl border border-slate-800 p-2" style={{ background: '#020617aa' }}>
                      <div className="text-[11px] font-bold text-slate-200">{c.emoji} {c.nome}</div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{c.regra}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fauna */}
              <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
                <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: CORES.ouro }}>🐾 Fauna do mundo</h3>
                <div className="flex flex-wrap gap-1.5">
                  {(m.fauna || []).map(an => (
                    <button key={an.id} onClick={() => setAlvoFauna(an.id)}
                      title={(CFG.fauna.especies[an.especie] || {}).descricao || ''}
                      className="px-2 py-1 rounded-xl border text-[11px] font-semibold transition-all hover:scale-105"
                      style={{ borderColor: alvoFauna === an.id ? CORES.vida : '#1e293b', background: '#020617aa', color: an.ferido ? CORES.perigo : '#cbd5e1' }}>
                      {an.emoji} {an.nome}{an.ferido ? ' (ferido)' : ''}
                      <span className="text-[9px] ml-1" style={{ color: '#64748b' }}>· {an.temperamento || ''}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* NPCs de ambiente (v8.1): figuras do mundo com afazeres próprios */}
              <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
                <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: CORES.ouro }}>🧍 Vida do mundo</h3>
                <p className="text-[10px] text-slate-500 mb-2">Não são agentes — não falam Lume, não pagam impostos. Só vivem as suas tarefas.</p>
                <div className="flex flex-wrap gap-1.5">
                  {(m.npcs || []).map(np => (
                    <div key={np.id}
                      title={np.tarefa}
                      className="px-2 py-1 rounded-xl border border-slate-800 text-[11px] font-semibold select-none"
                      style={{ background: '#020617aa', color: np.cor || '#cbd5e1' }}>
                      {np.emoji} {np.nome}
                      <span className="text-[9px] ml-1" style={{ color: '#64748b' }}>· {np.tarefa}</span>
                      {np.pausa > 0 && <span className="text-[9px] ml-1" style={{ color: '#475569' }}>(ocupado)</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Território */}
              <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
                <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: CORES.ouro }}>🗺️ Território</h3>
                <p className="text-[11px] text-slate-400">
                  Chunks anexados: <b className="text-cyan-300">{m.chunksComprados}</b> · próximo custa <b className="text-amber-300">{E.custoProximoChunk(m)}🪙</b> (régua fib)
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {(m.chunks || []).map(c => <Chip key={c.id} cor={CORES.acento} active>{c.nome}</Chip>)}
                </div>
              </div>
            </div>
          )}

          {tab === 'construir' && vista === 'jogo' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(CFG.construcoes).map(([k, c]) => {
                const qtd = m.construcoes.filter(x => x.tipo === k).length;
                const bloqueada = c.reqIdea && !m.ideias.includes(c.reqIdea);
                const podePagar = jogador && jogador.necessidades.dinheiro >= c.custo;
                return (
                  <button key={k} disabled={bloqueada || !jogador || !podePagar} onClick={() => construir(k)}
                    className="text-left rounded-2xl border p-3 transition-all hover:scale-[1.02] disabled:opacity-40 disabled:hover:scale-100"
                    style={{ background: CORES.painel, borderColor: podePagar && !bloqueada ? c.cor + '66' : '#1e293b' }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl" style={{ filter: `drop-shadow(0 0 5px ${c.cor})` }}>{c.emoji}</span>
                      <span className="text-xs font-bold" style={{ color: c.cor }}>{c.nome}{qtd > 0 && ` ×${qtd}`}</span>
                      <span className="ml-auto text-[10px] font-mono" style={{ color: podePagar ? CORES.ouro : CORES.perigo }}>{c.custo}🪙</span>
                    </div>
                    <p className="text-[10px] text-slate-400">{c.efeito}</p>
                    {bloqueada && <p className="text-[10px] mt-1" style={{ color: CORES.perigo }}>🔒 Requer ideia: {c.reqIdea}</p>}
                  </button>
                );
              })}
              <div className="sm:col-span-2 mt-1">
                <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">Pesquisa de ideias</h3>
                <div className="flex flex-wrap gap-1.5">
                  {CFG.ideias.map(i => {
                    const descoberta = m.ideias.includes(i.id);
                    return (
                      <button key={i.id} disabled={descoberta || !jogador} onClick={() => pesquisar(i.id)}
                        className="px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold transition-all hover:scale-105 disabled:opacity-40"
                        style={{ borderColor: descoberta ? CORES.vida + '66' : '#1e293b', background: descoberta ? '#052e1666' : 'transparent', color: descoberta ? CORES.vida : '#cbd5e1' }}>
                        {i.icone} {i.nome} — {descoberta ? '✓ descoberta' : i.custo + '🪙'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {tab === 'regras' && vista === 'jogo' && (
            <div className="rounded-2xl border border-slate-800 p-4 space-y-3 text-xs leading-relaxed" style={{ background: CORES.painel }}>
              <h3 className="text-sm font-black" style={{ color: CORES.ouro }}>As regras do multiverso</h3>
              <p><b style={{ color: CORES.acento }}>Réguas de Fibonacci.</b> O Gauntlet ataca a cada {FIB8} ticks (fib 8), o vocabulário Lume cresce a cada {E.fib(6)} ticks (fib 6), os críticos correm em rondas com intervalo fib(N) e limites na proporção áurea 0.618. A própria moeda de nascimento é 1, 1, 2, 3, 5, 8…</p>
              <p><b style={{ color: CORES.acento }}>Lume, a língua emergente.</b> Os agentes falam entre si num idioma próprio, comprimido: 13 sementes de símbolos que crescem até 21 tokens. Cada frase é gerada por um mini-modelo de Markov que aprende bigramas — quanto mais conversam, mais coerente fica.</p>
              <p><b style={{ color: CORES.acento }}>Contigo falam como tu.</b> Em português ou inglês, à tua escolha — muda o idioma no painel do habitante. Por dentro, porém, todos pensam em Lume.</p>
              <p><b style={{ color: CORES.acento }}>LumeBrain, o menor LLM.</b> Cada habitante carrega um modelo comprimido: 4 pesos de política (sobreviver · acumular · socializar · criar), aprendizagem por reforço com passos que encolhem na espiral áurea, e um <b>traço de gestor</b> que cresce quando gerem bem o mundo — gestores altos reinvestem, ajudam e lideram.</p>
              <p><b style={{ color: CORES.acento }}>Loop de críticos.</b> Uma assembleia invisível revisita cada habitante: a ronda N faz N passos de crítica e repete a cada fib(N) ticks. Quem corrige crises ganha experiência de gestor.</p>
              <p><b style={{ color: CORES.acento }}>Mundo em 3D.</b> Arrasta para pan, roda/botões para zoom, clica no terreno para mover o Criador, clica num ser para o selecionar — e 🎯 segue-o pela câmera.</p>
              <p className="text-slate-500">Tudo é exportável como <code className="text-cyan-400">.json</code> — o mundo inteiro numa página.</p>
            </div>
          )}
        </section>

        {/* ============ COLUNA DIREITA: PAINEL DO SELECCIONADO (só no Jogo) ============ */}
        <section className="rounded-2xl border border-slate-800 p-3 order-3" style={{ background: CORES.painel, display: vista === 'jogo' ? undefined : 'none' }}>
          {!selecionado && (
            <div className="h-full flex flex-col items-center justify-center text-center py-10">
              <span className="text-4xl mb-3 opacity-40">🜂</span>
              <p className="text-xs text-slate-500">Selecciona um habitante no mapa 3D ou na lista</p>
              {jogador && <p className="text-[10px] text-slate-600 mt-2">Clica no terreno 3D para mover o teu Avatar</p>}
            </div>
          )}
          {selecionado && (() => {
            const ag = selecionado;
            const arq = CFG.arquetipos[ag.arquetipo] || CFG.arquetipos.humano;
            const dadosRadar = Object.entries(ag.tracos).map(([t, v]) => ({ traco: t, valor: Math.round(v) }));
            const chat = m.chats[ag.id] || [];
            return (
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <span className="text-3xl" style={{ filter: `drop-shadow(0 0 8px ${arq.cor})` }}>{arq.emoji}</span>
                  <div className="min-w-0">
                    <h2 className="text-sm font-black truncate" style={{ color: arq.cor }}>{ag.nome} {ag.isCriador && '👑'} {ag.gestor > 0.5 && '🧭'}</h2>
                    <p className="text-[10px] text-slate-500">{arq.label} · {(CFG.profissoes[ag.profissao] || {}).nome || '—'} · {(CFG.faccoes[ag.faccao] || {}).nome || ''}</p>
                    <div className="flex gap-1 mt-1">
                      <Chip active={ag.idioma === 'pt'} onClick={() => mudarIdioma('pt')}>PT</Chip>
                      <Chip active={ag.idioma === 'en'} cor="#38bdf8" onClick={() => mudarIdioma('en')}>EN</Chip>
                      <Chip cor={CORES.ouro} title="Traço de gestor">🧭 {Math.round(ag.gestor * 100)}%</Chip>
                    </div>
                  </div>
                  <button onClick={() => setSelecionadoId(null)} className="ml-auto p-1 rounded-lg hover:bg-slate-800 text-slate-500"><Icons.X className="w-3.5 h-3.5" /></button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Bar label="❤️ Saúde" valor={ag.necessidades.saude} cor={CORES.vida} />
                  <Bar label="⚡ Energia" valor={ag.necessidades.energia} cor="#facc15" />
                  <Bar label="🍖 Fome" valor={ag.necessidades.fome} cor={ag.necessidades.fome > 70 ? CORES.perigo : '#fb923c'} />
                  <Bar label="🪙 Moedas" valor={Math.min(ag.necessidades.dinheiro, 300)} max={300} cor={CORES.ouro} />
                </div>

                <div style={{ height: 130 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={dadosRadar} outerRadius="80%">
                      <PolarGrid stroke="#1e293b" />
                      <PolarAngleAxis dataKey="traco" tick={{ fill: '#64748b', fontSize: 8 }} />
                      <Radar dataKey="valor" stroke={arq.cor} fill={arq.cor} fillOpacity={0.35} />
                      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {ag.isCriador ? (
                  <p className="text-[11px] text-slate-400 border border-amber-500/30 rounded-xl p-2 bg-amber-500/5">
                    És o Avatar do Criador. Clica no <b>terreno 3D</b> para te moveres, compra ferramentas na coluna esquerda, constrói no separador 🏛️ e conversa com qualquer habitante.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 w-full">Oferecer moedas</span>
                    {[10, 50, 100].map(q => (
                      <Chip key={q} cor={CORES.ouro} onClick={() => ofertar(q)}>{q}🪙</Chip>
                    ))}
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 w-full mt-1">Dar ferramenta (da tua mochila)</span>
                    {jogador && jogador.inventario.length > 0 ? jogador.inventario.map(k => (
                      <Chip key={k} cor="#34d399" onClick={() => darFerramenta(k)}>➜ {(CFG.ferramentas[k] || {}).nome || k}</Chip>
                    )) : <span className="text-[10px] text-slate-600">Sem ferramentas na mochila {jogador ? '' : '(entra como Criador)'}</span>}
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 w-full mt-1">🎓 Skills de {ag.nome}</span>
                    <div className="flex flex-wrap gap-1 w-full">
                      {Object.keys(CFG.skills.catalogo).length === 0 && <span className="text-[10px] text-slate-600">—</span>}
                      {Object.entries(CFG.skills.catalogo).map(([k, s]) => {
                        const nivel = ag.skills && ag.skills[k];
                        const aula = ag.aulas && ag.aulas[k];
                        return (
                          <Chip key={k} cor={nivel ? CORES.vida : '#64748b'} title={s.descricao}>
                            {s.emoji} {s.nome}{nivel ? ' · nv' + nivel : aula ? ' (' + aula + ' aulas)' : ''}
                          </Chip>
                        );
                      })}
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500 w-full mt-1">💼 Definir carreira</span>
                    <div className="flex flex-wrap gap-1 w-full">
                      {Object.entries(CFG.profissoes).filter(([k]) => k !== 'desempregado').map(([k, p]) => {
                        const actual = ag.profissao === k;
                        return (
                          <Chip key={k} cor={actual ? CORES.ouro : '#94a3b8'} active={actual}
                            title={(p.descricao || '') + (p.reqSkill ? ' — requer ' + (CFG.skills.catalogo[p.reqSkill] || {}).nome : '')}
                            onClick={() => definirCarreira(k)}>
                            {p.nome}{actual ? ' ✓' : ''}
                          </Chip>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Chat com o habitante */}
                <div className="rounded-xl border border-slate-800 overflow-hidden" style={{ background: '#020617aa' }}>
                  <div className="px-2 py-1.5 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Conversa {ag.idioma === 'pt' ? '· PT' : '· EN'}</span>
                    <span className="text-[9px] text-slate-600">🕯️ pensa em Lume</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto custom-scrollbar p-2 space-y-1.5">
                    {chat.length === 0 && <p className="text-[11px] text-slate-600">Diz algo a {ag.nome}…</p>}
                    {chat.map((c, i) => (
                      <div key={i} className={c.de === 'criador' ? 'text-right' : ''}>
                        <div className="inline-block max-w-[85%] px-2 py-1 rounded-xl text-[11px] leading-snug"
                          style={c.de === 'criador'
                            ? { background: '#0e749033', color: '#a5f3fc', border: '1px solid #0e749055' }
                            : { background: arq.cor + '14', color: '#e2e8f0', border: '1px solid ' + arq.cor + '33' }}>
                          {c.texto}
                        </div>
                        {c.tokens && <div className="text-[10px] font-mono mt-0.5" style={{ color: '#a78bfa' }}>🕯️ {c.tokens}</div>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1 p-1.5 border-t border-slate-800">
                    <input ref={chatRef} value={chatInput} onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && enviarMsg()}
                      placeholder={ag.idioma === 'pt' ? `Fala com ${ag.nome}…` : `Talk to ${ag.nome}…`}
                      className="flex-1 bg-slate-900/80 rounded-lg px-2 py-1 text-[11px] outline-none border border-slate-800 focus:border-cyan-600" />
                    <button onClick={enviarMsg} className="p-1.5 rounded-lg" style={{ background: '#0e7490' }}><Icons.Send className="w-3.5 h-3.5 text-white" /></button>
                  </div>
                </div>

                {ag.memorias.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Memórias recentes</h3>
                    <div className="space-y-0.5 max-h-20 overflow-y-auto custom-scrollbar">
                      {ag.memorias.slice(0, 5).map((mem, i) => (
                        <p key={i} className="text-[10px] text-slate-400">• {mem.texto}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      </main>

      {/* ============ VISTA DASHBOARD: informação, política e sociedade ============ */}
      {vista === 'dashboard' && (
        <main className="max-w-7xl mx-auto px-3 pb-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* MISSÕES — quest board estilo anime */}
          <section className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: CORES.ouro }}>📜 Quadro de Missões</h3>
              <span className="text-[9px] font-mono text-slate-500">renova a cada fib(5) ticks</span>
            </div>
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {(m.missoes || []).filter(q => !q.concluida).length === 0 && (
                <p className="text-xs text-slate-600">O quadro aguarda novas comissões…</p>
              )}
              {(m.missoes || []).filter(q => !q.concluida).map(q => (
                <div key={q.id} className="rounded-xl border p-2" style={{ borderColor: q.pronta ? CORES.vida + '66' : '#1e293b', background: '#020617aa' }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">{q.emoji}</span>
                    <span className="text-[11px] font-bold text-slate-200">{q.nome}</span>
                    <span className="ml-auto text-[10px] font-mono" style={{ color: CORES.ouro }}>{q.recompensa}🪙</span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5">{q.descricao} · pedido por <b>{q.dono}</b> · dificuldade {'★'.repeat(q.dificuldade)}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: Math.min(100, (q.progresso / q.meta) * 100) + '%', background: q.pronta ? CORES.vida : CORES.acento }} />
                    </div>
                    <span className="text-[9px] font-mono text-slate-500">{q.progresso}/{q.meta}</span>
                    {q.pronta && (
                      <button onClick={() => concluirMissao(q.id)}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-black" style={{ background: CORES.vida, color: '#052e16' }}>
                        Recolher
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* DIPLOMACIA — guerra & paz */}
          <section className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-black uppercase tracking-widest" style={{ color: CORES.ouro }}>🕊️ Diplomacia & Guerra</h3>
              {m.diplomacia && m.diplomacia.guerra && (
                <button onClick={mediar} className="px-2.5 py-1 rounded-xl text-[10px] font-black" style={{ background: '#0e7490', color: '#fff' }}>
                  🕊️ Mediar paz ({Math.round(m.diplomacia.processoPaz)}%)
                </button>
              )}
            </div>
            {m.diplomacia && m.diplomacia.guerra ? (
              <div className="rounded-xl border p-2.5 mb-2" style={{ borderColor: CORES.perigo + '55', background: '#450a0a44' }}>
                <div className="text-xs font-black" style={{ color: CORES.perigo }}>
                  ⚔️ GUERRA ATIVA: {CFG.faccoes[m.diplomacia.guerra.faccaoA].nome} vs {CFG.faccoes[m.diplomacia.guerra.faccaoB].nome}
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Baixas — {CFG.faccoes[m.diplomacia.guerra.faccaoA].nome}: {m.diplomacia.guerra.baixasA} · {CFG.faccoes[m.diplomacia.guerra.faccaoB].nome}: {m.diplomacia.guerra.baixasB} · desde tick {m.diplomacia.guerra.desde}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 p-2.5 mb-2" style={{ background: '#052e1633' }}>
                <span className="text-[11px] font-bold" style={{ color: CORES.vida }}>🕊️ Paz no mundo</span>
                {m.diplomacia && <span className="text-[10px] text-slate-500 ml-2">tensão: {Math.round(m.diplomacia.tensao)}/89 (limiar fib)</span>}
              </div>
            )}
            {m.diplomacia && (
              <>
                <div className="mb-1.5">
                  <Bar label="Tensão social" valor={m.diplomacia.tensao} cor={m.diplomacia.tensao > 60 ? CORES.perigo : '#fb923c'} />
                  <Bar label="Reputação do Criador" valor={m.diplomacia.reputacaoCriador || 0} cor={CORES.ouro} />
                  {m.diplomacia.guerra && <Bar label="Processo de paz" valor={m.diplomacia.processoPaz} cor={CORES.vida} />}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(m.diplomacia.pactos || []).slice(-4).map((pl, i) => (
                    <Chip key={i} cor={pl.tipo === 'paz' ? CORES.vida : '#60a5fa'}>
                      {pl.tipo === 'paz' ? '🕊️' : '🤝'} {CFG.faccoes[pl.faccaoA].nome.slice(0, 10)}+{CFG.faccoes[pl.faccaoB].nome.slice(0, 10)}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* JUSTIÇA — tribunal */}
          <section className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
            <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: CORES.ouro }}>⚖️ Justiça do Mundo</h3>
            {(m.tribunal && m.tribunal.casos.length) ? (
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto custom-scrollbar pr-1">
                {m.tribunal.casos.slice(0, 8).map(c => (
                  <div key={c.id} className="rounded-xl border border-slate-800 p-2 flex items-center gap-2" style={{ background: '#020617aa' }}>
                    <span className="text-base">⚖️</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-bold text-slate-200 truncate">{c.acusado}</div>
                      <div className="text-[10px] text-slate-500">{c.crime} · pena {c.pena}🪙</div>
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                      style={{ background: !c.julgado ? '#1e293b' : c.veredicto === 'absolvido' ? '#052e16' : '#450a0a', color: !c.julgado ? '#94a3b8' : c.veredicto === 'absolvido' ? CORES.vida : CORES.perigo }}>
                      {c.julgado ? (c.veredicto === 'absolvido' ? '✓ inocente' : '✖ culpado') : 'em julgamento'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-600">Sem processos. Crimes nascem do stress social (guerra, feridos) e são julgados por jurados com maioria áurea.</p>
            )}
          </section>

          {/* HISTÓRIA + KARDASHEV */}
          <section className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
            <h3 className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: CORES.ouro }}>📖 História & Ascensão</h3>
            {m.historia && m.historia.arcoAtivo ? (
              <div className="rounded-xl border p-2.5 mb-2" style={{ borderColor: '#c084fc44', background: '#c084fc0d' }}>
                <div className="text-xs font-black" style={{ color: '#c084fc' }}>{m.historia.arcoAtivo.emoji} {m.historia.arcoAtivo.nome}</div>
                <p className="text-[10px] text-slate-400 mt-0.5">{m.historia.arcoAtivo.sinopse}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: Math.min(100, (m.historia.arcoAtivo.progresso / 10) * 100) + '%', background: '#c084fc' }} />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500">cap {m.historia.arcoAtivo.capitulo}/{m.historia.arcoAtivo.capituloMax}</span>
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 mb-2">Os bardos preparam o próximo arco narrativo… (verificação a cada fib(8) ticks)</p>
            )}
            {m.historia && m.historia.eventos.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {m.historia.eventos.slice(-3).map((ev, i) => <Chip key={i} cor="#c084fc">🌟 {ev.arco}</Chip>)}
              </div>
            )}
            {m.kardashev && (
              <div className="rounded-xl border border-slate-800 p-2.5" style={{ background: '#020617aa' }}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black" style={{ color: '#7dd3fc' }}>🌟 Escala de Kardashev</span>
                  <span className="text-[10px] font-mono text-slate-400">energia ≈ {m.kardashev.energia}%</span>
                </div>
                <div className="flex gap-1 mt-1.5">
                  {['Tipo 0', 'Tipo I', 'Tipo II', 'Tipo III'].map((nome, i) => (
                    <div key={i} className="flex-1 text-center py-1 rounded-lg text-[9px] font-black"
                      style={{ background: i <= m.kardashev.nivel ? 'linear-gradient(135deg,#0891b2,#7c3aed)' : '#1e293b', color: i <= m.kardashev.nivel ? '#fff' : '#64748b' }}>
                      {nome}
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-slate-500 mt-1">Cultura + construções + ideias + população, comprimidas por φ — a sociedade sobe de tipo ao evoluir.</p>
              </div>
            )}
          </section>

          {/* GRÁFICO CULTURA (movido para o dashboard) */}
          <section className="rounded-2xl border border-slate-800 p-3 lg:col-span-2" style={{ background: CORES.painel }}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cultura global ao longo dos ticks</h3>
              <span className="text-[10px] font-mono text-slate-600">Réguas de Fibonacci · φ = 0.618</span>
            </div>
            <div style={{ height: 120 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={histCultura}>
                  <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                  <XAxis dataKey="tick" tick={{ fill: '#475569', fontSize: 9 }} />
                  <YAxis tick={{ fill: '#475569', fontSize: 9 }} width={30} />
                  <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                  <Line type="monotone" dataKey="cultura" stroke={CORES.acento} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </main>
      )}

      {/* ============ GRÁFICO CULTURA (vista jogo) ============ */}
      {vista === 'jogo' && (
      <footer className="max-w-7xl mx-auto px-3 pb-6">
        <div className="rounded-2xl border border-slate-800 p-3" style={{ background: CORES.painel }}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cultura global ao longo dos ticks</h3>
            <span className="text-[10px] font-mono text-slate-600">Réguas de Fibonacci · φ = 0.618</span>
          </div>
          <div style={{ height: 110 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={histCultura}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="tick" tick={{ fill: '#475569', fontSize: 9 }} />
                <YAxis tick={{ fill: '#475569', fontSize: 9 }} width={30} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', fontSize: 11 }} />
                <Line type="monotone" dataKey="cultura" stroke={CORES.acento} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-600 mt-1">Mundo Aberto X — agentes AI autónomos em 3D, língua emergente Lume, LumeBrain gestor, Gauntlet de Fibonacci. Feito com Codebuff ✦</p>
        </div>
      </footer>
      )}

      {/* ============ MODAL CRIAR HABITANTE ============ */}
      {modalCriar && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4" style={{ background: '#020617cc' }} onClick={() => setModalCriar(false)}>
          <div className="rounded-2xl border border-slate-700 p-4 w-full max-w-sm space-y-3" style={{ background: '#0f172a' }} onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-black" style={{ color: CORES.ouro }}>✨ Criar um novo ser</h3>
            <input autoFocus value={novoSer.nome} onChange={e => setNovoSer(s => ({ ...s, nome: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && criarSer()}
              placeholder="Nome do habitante" className="w-full bg-slate-900 rounded-xl px-3 py-2 text-sm outline-none border border-slate-800 focus:border-cyan-600" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Arquétipo</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(CFG.arquetipos).filter(([k]) => k !== 'criador').map(([k, a]) => (
                  <Chip key={k} cor={a.cor} active={novoSer.arquetipo === k} onClick={() => setNovoSer(s => ({ ...s, arquetipo: k }))}>{a.emoji} {a.label}</Chip>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Facção</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(CFG.faccoes).map(([k, f]) => (
                  <Chip key={k} cor={f.cor} active={novoSer.faccao === k} onClick={() => setNovoSer(s => ({ ...s, faccao: k }))}>{f.nome}</Chip>
                ))}
              </div>
            </div>
            <button onClick={criarSer} className="w-full py-2 rounded-xl text-sm font-black text-slate-900 transition-transform hover:scale-[1.02]"
              style={{ background: `linear-gradient(135deg, ${CORES.acento}, #7c3aed)` }}>
              Dar vida ✦
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
