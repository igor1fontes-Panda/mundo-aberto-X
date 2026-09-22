import { useEffect, useRef, useMemo } from 'react';

/* ============================================================
   MINIMAPA — vista estratégica 2D do mundo inteiro (v9)
   - Zonas coloridas dos chunks + ruas
   - Construções (emoji), habitantes, fauna, NPCs, Criador
   - Retângulo da câmara do mapa 3D
   - Clique/tap: navega no mapa 3D (callback onNavegar)
   ============================================================ */

export default function Minimapa({ m, CFG, dim, jogador, onNavegar, width = 190, height = 120 }) {
  const canvasRef = useRef(null);
  const escala = useMemo(
    () => ({ x: width / Math.max(1, dim.w), y: height / Math.max(1, dim.h) }),
    [dim.w, dim.h, width, height]
  );

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const ex = W / Math.max(1, dim.w), ey = H / Math.max(1, dim.h);
    ctx.clearRect(0, 0, W, H);

    // fundo
    ctx.fillStyle = '#060b1c';
    ctx.fillRect(0, 0, W, H);

    // zonas dos chunks
    (m.chunks || []).forEach((c, ci) => {
      (c.zonas || []).forEach(z => {
        const zx = (z.x || 0) * ex, zy = (z.y || 0) * ey;
        const zw = Math.max(2, (z.w || 10) * ex), zh = Math.max(2, (z.h || 10) * ey);
        ctx.fillStyle = (z.cor || '#164e63') + 'cc';
        ctx.fillRect(zx, zy, zw, zh);
        ctx.strokeStyle = '#94a3b822';
        ctx.strokeRect(zx, zy, zw, zh);
      });
      // ruas
      ctx.fillStyle = '#475569aa';
      (c.ruas || []).forEach(r => {
        const rx = (r.x !== undefined ? r.x : (ci % 2) * 320) * ex;
        const ry = (r.y !== undefined ? r.y : 150 + ci * 20) * ey;
        ctx.fillRect(rx, ry, Math.max(1.5, (r.w || 200) * ex), Math.max(1.5, (r.h || 6) * ey));
      });
    });

    // construções (quadrados dourados) — WestDocks usa a posição real (wx/wy)
    (m.construcoes || []).forEach(c => {
      if (c.wx != null) {
        const x = c.wx * ex, y = c.wy * ey;
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x - 2, y - 2, 4.5, 4.5);
        return;
      }
      // posições determinísticas a partir do id (mesma dispersão do 3D)
      let h = 0; for (let i = 0; i < c.id.length; i++) h = (h * 31 + c.id.charCodeAt(i)) >>> 0;
      const x = ((h % (dim.w - 60)) + 30) * ex;
      const y = (((h >> 7) % (dim.h - 40)) + 20) * ey;
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(x - 1.5, y - 1.5, 3.5, 3.5);
    });

    // v10: frota do Mar de West (ferri dourado, pesca ciano, piratas vermelhos)
    (m.barcos || []).forEach(b => {
      ctx.fillStyle = b.tipo === 'pirata' ? '#f87171' : b.tipo === 'pesca' ? '#7dd3fc' : '#fde68a';
      const bx = b.x * ex, by = b.y * ey;
      ctx.beginPath();
      ctx.moveTo(bx, by - 2.4);
      ctx.lineTo(bx + 2.4, by + 2);
      ctx.lineTo(bx - 2.4, by + 2);
      ctx.closePath();
      ctx.fill();
    });

    // v10: Mar de West sombreado quando o reino está anexado
    if (m.westdocks && m.westdocks.anexado) {
      const my = (m.westdocks.mar.y0 || 330) * ey;
      ctx.fillStyle = 'rgba(20,80,126,0.35)';
      ctx.fillRect(0, my, W, H - my);
      // ponte
      const pb = m.westdocks.ponte;
      if (pb) {
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pb.x * ex, pb.y * ey);
        ctx.lineTo((pb.x + (pb.comprimento || 70)) * ex, pb.y * ey);
        ctx.stroke();
      }
    }

    // fauna (pontos verdes)
    ctx.fillStyle = '#34d399cc';
    (m.fauna || []).forEach(an => { ctx.fillRect(an.x * ex - 1, an.y * ey - 1, 2, 2); });

    // NPCs (pontos azul-claro)
    ctx.fillStyle = '#60a5facc';
    (m.npcs || []).forEach(np => { ctx.fillRect(np.x * ex - 1, np.y * ey - 1, 2, 2); });

    // habitantes (pontos ciano)
    ctx.fillStyle = '#22d3ee';
    m.agentes.forEach(ag => {
      if (ag.estado === 'morto') return;
      ctx.fillRect(ag.x * ex - 1.2, ag.y * ey - 1.2, 2.4, 2.4);
    });

    // Criador: marcador coroa pulsante
    if (jogador) {
      const px = jogador.x * ex, py = jogador.y * ey;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px, py, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [m, m.tickCount, m.agentes, m.construcoes, m.fauna, m.npcs, dim.w, dim.h, jogador]);

  // escala exposta para o clique
  const escalaRef = useRef(escala);
  escalaRef.current = escala;

  const clicar = (ev) => {
    if (!onNavegar) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const mx = ((ev.clientX - rect.left) / rect.width) * dim.w;
    const my = ((ev.clientY - rect.top) / rect.height) * dim.h;
    onNavegar(mx, my);
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-slate-700 group"
      title="Minimapa — toca para navigar no mundo"
      style={{ width, height, background: '#060b1c' }}>
      <canvas ref={canvasRef} width={width * 2} height={height * 2}
        onClick={clicar}
        className="absolute inset-0 w-full h-full cursor-crosshair select-none"
        style={{ imageRendering: 'auto' }} />
      <div className="absolute top-1 left-1.5 text-[8px] font-black uppercase tracking-widest pointer-events-none"
        style={{ color: '#7dd3fc88' }}>🗺️ Mundo</div>
      <div className="absolute bottom-1 right-1.5 text-[8px] pointer-events-none" style={{ color: '#fbbf24aa' }}>👑</div>
    </div>
  );
}
