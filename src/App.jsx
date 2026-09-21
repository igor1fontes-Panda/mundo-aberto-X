import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import Mapa3D from './Mapa3D.jsx';
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
  const [novoSer, setNovoSer] = useState({ nome: '', arquetipo: 'humano', faccao: 'independente' });
  const [chatInput, setChatInput] = useState('');
  const [toast, setToast] = useState(null);
  const [alvoFauna, setAlvoFauna] = useState(null);
  const dirRef = useRef(null);
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
  const moverMapa = (x, y) => {
    if (!jogador) return;
    E.jogadorMover(mundoRef.current, x, y);
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

  // ----- Movimento contínuo (d-pad/touch) -----
  useEffect(() => {
    const iv = setInterval(() => {
      const d = dirRef.current;
      if (d && mundoRef.current.jogador) {
        const j = mundoRef.current.jogador;
        const passo = 14;
        const nx = j.x + (d === 'right' ? passo : d === 'left' ? -passo : (d === 'upright' ? passo * 0.7 : d === 'upleft' ? -passo * 0.7 : d === 'downright' ? passo * 0.7 : d === 'downleft' ? -passo * 0.7 : 0));
        const ny = j.y + (d === 'down' ? passo : d === 'up' ? -passo : (d.indexOf('up') === 0 ? -passo * 0.7 : d.indexOf('down') === 0 ? passo * 0.7 : 0));
        E.jogadorMover(mundoRef.current, nx, ny);
      }
    }, 90);
    return () => clearInterval(iv);
  }, [velIdx]);
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
  const definirCarreira = (prof) => {
    if (!selecionado) return;
    const r = E.jogadorDefinirCarreira(mundoRef.current, selecionado.id, prof);
    mostrarToast(r.ok ? `${selecionado.nome} é agora ${CFG.profissoes[prof].nome}` : r.erro, !r.ok);
    repintar();
  };

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
            <span className="ml-2 text-[10px] font-mono text-slate-500">v{CFG.meta.versao} · tick {m.tickCount} · fib {FIB8}</span>
          </h1>
          <div className="flex items-center gap-1.5 flex-wrap ml-auto">
            <StatPill emoji="👥" valor={vivos.length} titulo="População viva" />
            <StatPill emoji="🎨" valor={Math.round(m.culturaGlobal)} titulo="Cultura global" />
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
        {/* ============ COLUNA ESQUERDA: HABITANTES ============ */}
        <section className="rounded-2xl border border-slate-800 p-3 order-2 lg:order-1" style={{ background: CORES.painel }}>
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

        {/* ============ CENTRO: MAPA 3D / ABAS ============ */}
        <section className="order-1 lg:order-2 space-y-3">
          <div className="flex gap-1.5">
            {[['mundo', '🗺️ Mundo'], ['construir', '🏛️ Construir'], ['sociedade', '🏫 Sociedade'], ['regras', '✨ Regras']].map(([t, l]) => (
              <button key={t} onClick={() => setTab(t)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                style={{ background: tab === t ? 'linear-gradient(135deg,#0891b2,#7c3aed)' : 'rgba(15,23,42,0.8)', color: tab === t ? '#fff' : '#94a3b8', border: '1px solid #1e293b' }}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'mundo' && (
            <div>
              <Mapa3D
                m={m} CFG={CFG} dim={dim} jogador={jogador}
                selecionadoId={selecionadoId} alvoFauna={alvoFauna}
                onMover={moverMapa} onSelecionar={setSelecionadoId} onFauna={setAlvoFauna}
              />

              {/* ===== Controlos touch (Android/mobile) ===== */}
              <div className="flex items-center justify-between gap-2 mt-2" style={{ touchAction: 'none' }}>
                <div className="grid grid-cols-3 gap-1" style={{ width: 126 }}>
                  {[['', '↖', '↑', '↗'], ['←', '·', '→'], ['↙', '↓', '↘']].flat().map((d, i) => {
                    const dirs = { '↑': 'up', '↓': 'down', '←': 'left', '→': 'right' };
                    return (
                      <button key={i}
                        onPointerDown={() => { if (dirs[d]) dirRef.current = dirs[d]; }}
                        onPointerUp={() => { dirRef.current = null; }}
                        onPointerLeave={() => { dirRef.current = null; }}
                        onPointerCancel={() => { dirRef.current = null; }}
                        className="rounded-xl border border-slate-700 text-sm font-bold select-none"
                        style={{ height: 38, background: '#0f172a', color: dirs[d] ? '#67e8f9' : '#334155', touchAction: 'none' }}>
                        {d}
                      </button>
                    );
                  })}
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

          {tab === 'sociedade' && (
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
                      className="px-2 py-1 rounded-xl border text-[11px] font-semibold transition-all hover:scale-105"
                      style={{ borderColor: alvoFauna === an.id ? CORES.vida : '#1e293b', background: '#020617aa', color: an.ferido ? CORES.perigo : '#cbd5e1' }}>
                      {an.emoji} {an.nome}{an.ferido ? ' (ferido)' : ''}
                    </button>
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

          {tab === 'construir' && (
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

          {tab === 'regras' && (
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

        {/* ============ COLUNA DIREITA: PAINEL DO SELECCIONADO ============ */}
        <section className="rounded-2xl border border-slate-800 p-3 order-3" style={{ background: CORES.painel }}>
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

      {/* ============ GRÁFICO CULTURA ============ */}
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
