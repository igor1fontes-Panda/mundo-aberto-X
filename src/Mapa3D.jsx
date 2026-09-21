import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/* ============================================================
   MAPA 3D TOP-DOWN — Three.js (câmera ortográfica inclinada)
   - Terreno por chunk (grelha do engine: 1º à direita, depois abaixo)
   - Zonas e ruas em planos, construções em caixas 3D com emoji
   - Agentes, fauna e Criador sincronizados a cada frame (rAF)
   - Interação: toque/clique no terreno = mover, num ser = selecionar,
     arrastar = pan, roda/botões = zoom, 🎯 = seguir o Criador
   ============================================================ */

const emojiCache = new Map();
function emojiTexture(emoji) {
  if (emojiCache.has(emoji)) return emojiCache.get(emoji);
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = '64px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  emojiCache.set(emoji, tex);
  return tex;
}

function labelSprite(texto, cor) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(2,6,23,0.78)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(8, 4, 240, 48, 12) : ctx.rect(8, 4, 240, 48);
  ctx.fill();
  ctx.font = 'bold 26px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = cor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto.slice(0, 16), 128, 29);
  const tex = new THREE.CanvasTexture(canvas);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(30, 6.6, 1);
  sp.renderOrder = 10;
  return sp;
}

function disposeDeep(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => {
        if (mt.map && !emojiCache.has(emojiCacheKeyOf(mt.map))) mt.map.dispose?.();
        mt.dispose();
      });
    }
  });
}
function emojiCacheKeyOf() { return null; } // mapas de emoji são partilhados — não dispõe

const FIB = n => { let a = 1, b = 1; for (let i = 0; i < n; i++) { [a, b] = [b, a + b]; } return a; };
const FIB8 = FIB(8); // 21 — igual ao engine

// IDs do engine são strings ("m1abc123") — hash numérico estável p/ variações/rotação
// (aritmética direta com string → NaN → posição invisível no Three.js)
function hashId(id) {
  if (typeof id === 'number') return id;
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default function Mapa3D({ m, CFG, dim, jogador, selecionadoId, alvoFauna, onMover, onSelecionar, onFauna }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { m, CFG, dim, jogador, selecionadoId, alvoFauna, onMover, onSelecionar, onFauna };
  const [seguir, setSeguir] = useState(false);
  const seguirRef = useRef(false);
  seguirRef.current = seguir;
  const [webglErro, setWebglErro] = useState(false);
  const flash = m.tickCount > 0 && m.tickCount % FIB8 === FIB8 - 1;

  useEffect(() => {
    const mount = mountRef.current;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (e) {
      setWebglErro(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x020617, 1);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x020617, 1000, 2600);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    const lights = new THREE.Group();
    lights.add(new THREE.AmbientLight(0xbfd4ff, 1.05));
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(300, 400, -160);
    lights.add(dir);
    scene.add(lights);

    const terrainGroup = new THREE.Group();
    const agentsGroup = new THREE.Group();
    const faunaGroup = new THREE.Group();
    const ringsGroup = new THREE.Group();
    scene.add(terrainGroup, agentsGroup, faunaGroup, ringsGroup);

    let groundMesh = null;
    let zoom = 1;
    let target = new THREE.Vector2(320, 160);
    let lastM = null;
    let lastChunks = -1;
    let lastBuilds = -1;
    const agentsMap = new Map();
    const faunaMap = new Map();

    const selRing = new THREE.Mesh(
      new THREE.TorusGeometry(11, 1.4, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x22d3ee })
    );
    selRing.rotation.x = Math.PI / 2;
    selRing.visible = false;
    const faunaRing = new THREE.Mesh(
      new THREE.TorusGeometry(9, 1.2, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0x34d399 })
    );
    faunaRing.rotation.x = Math.PI / 2;
    faunaRing.visible = false;
    ringsGroup.add(selRing, faunaRing);

    function updateFrustum() {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 420;
      const aspect = w / h;
      const view = 560 / zoom;
      camera.left = (-view * aspect) / 2;
      camera.right = (view * aspect) / 2;
      camera.top = view / 2;
      camera.bottom = -view / 2;
      camera.near = 1;
      camera.far = 4000;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    }

    function makeAgente(ag) {
      const CFGn = cbRef.current.CFG;
      const arq = CFGn.arquetipos[ag.arquetipo] || CFGn.arquetipos.humano;
      const cor = new THREE.Color(arq.cor || '#7dd3fc');
      const g = new THREE.Group();
      g.userData = { kind: ag.isCriador ? 'jogador' : 'agente', id: ag.id };
      const corpo = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 7.5, 15, 14),
        new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.35) })
      );
      corpo.position.y = 8;
      g.add(corpo);
      const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(arq.emoji || '👤'), depthTest: false, transparent: true }));
      emoji.scale.set(17, 17, 1);
      emoji.position.y = 26;
      emoji.renderOrder = 9;
      g.add(emoji);
      const nome = labelSprite(ag.nome, sel2cor(ag));
      nome.position.y = 36;
      g.add(nome);
      return g;
    }
    function sel2cor(ag) {
      const CFGn = cbRef.current.CFG;
      const arq = CFGn.arquetipos[ag.arquetipo] || CFGn.arquetipos.humano;
      return arq.cor || '#94a3b8';
    }

    function makeFauna(an) {
      const g = new THREE.Group();
      g.userData = { kind: 'fauna', id: an.id };
      const cor = new THREE.Color(an.cor || '#fb923c');
      const corpo = new THREE.Mesh(
        new THREE.OctahedronGeometry(5.5),
        new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.4) })
      );
      corpo.position.y = 7;
      g.add(corpo);
      const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(an.emoji || '🐾'), depthTest: false, transparent: true }));
      emoji.scale.set(13, 13, 1);
      emoji.position.y = 20;
      emoji.renderOrder = 9;
      g.add(emoji);
      return g;
    }

    function rebuildTerrain() {
      const { CFG: C, dim: D, m: mundo } = cbRef.current;
      // limpar
      [...terrainGroup.children].forEach(ch => { disposeDeep(ch); terrainGroup.remove(ch); });
      const w = D.w, h = D.h;
      // chão base
      groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshLambertMaterial({ color: 0x0e1626 })
      );
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.set(w / 2, 0, h / 2);
      groundMesh.userData = { kind: 'terreno' };
      terrainGroup.add(groundMesh);
      const grid = new THREE.GridHelper(Math.max(w, h), Math.round(Math.max(w, h) / 40), 0x1b2a44, 0x131f33);
      grid.position.set(w / 2, 0.02, h / 2);
      terrainGroup.add(grid);
      const mapa = C.mapa;
      // chunks: grelha do engine (idx ímpar → direita, par → abaixo)
      (mundo.chunks || []).forEach((chunk, ci) => {
        const idx = ci;
        const offX = idx === 0 ? 0 : (idx % 2) * mapa.chunkLargura;
        const offY = idx === 0 ? 0 : Math.floor(idx / 2) * mapa.chunkAltura;
        const plate = new THREE.Mesh(
          new THREE.PlaneGeometry(mapa.chunkLargura, mapa.chunkAltura),
          new THREE.MeshLambertMaterial({ color: ci % 2 ? 0x0f1b2e : 0x0d1728 })
        );
        plate.rotation.x = -Math.PI / 2;
        plate.position.set(offX + mapa.chunkLargura / 2, 0.04, offY + mapa.chunkAltura / 2);
        terrainGroup.add(plate);
        (chunk.zonas || []).forEach(z => {
          const zm = new THREE.Mesh(
            new THREE.PlaneGeometry(z.w, z.h),
            new THREE.MeshLambertMaterial({ color: new THREE.Color(z.cor), transparent: true, opacity: 0.92 })
          );
          zm.rotation.x = -Math.PI / 2;
          zm.position.set(offX + z.x + z.w / 2, 0.08, offY + z.y + z.h / 2);
          terrainGroup.add(zm);
          const zn = labelSprite(z.nome, 'rgba(255,255,255,0.55)');
          zn.position.set(offX + z.x + 26, 3, offY + z.y + 10);
          zn.scale.set(34, 7.4, 1);
          terrainGroup.add(zn);
        });
        (chunk.ruas || []).forEach(r => {
          const rm = new THREE.Mesh(
            new THREE.PlaneGeometry(r.w, r.h),
            new THREE.MeshLambertMaterial({ color: 0x22314a })
          );
          rm.rotation.x = -Math.PI / 2;
          rm.position.set(offX + r.x + r.w / 2, 0.12, offY + r.y + r.h / 2);
          terrainGroup.add(rm);
        });
      });
      // construções 3D (caixas com cor do tipo + emoji no topo)
      mundo.construcoes.forEach((c, i) => {
        const def = C.construcoes[c.tipo] || { cor: '#94a3b8', emoji: '🏛️', nome: c.tipo };
        const altura = 18 + (i % 3) * 7;
        const bx = 44 + (i % 8) * 68;
        const bz = 30;
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(24, altura, 24),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(def.cor), emissive: new THREE.Color(def.cor).multiplyScalar(0.22) })
        );
        box.position.set(bx, altura / 2, bz);
        box.userData = { kind: 'construcao', nome: def.nome, efeito: def.efeito };
        terrainGroup.add(box);
        const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(def.emoji), depthTest: false, transparent: true }));
        emoji.scale.set(18, 18, 1);
        emoji.position.set(bx, altura + 12, bz);
        emoji.renderOrder = 9;
        terrainGroup.add(emoji);
      });
      // luz direcional centrada no mundo
      dir.position.set(w / 2, 420, h / 2 - 180);
      dir.target.position.set(w / 2, 0, h / 2);
    }

    // ----- interação -----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointer = null;

    function pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const seres = raycaster.intersectObjects([...agentsGroup.children, ...faunaGroup.children], true);
      if (seres.length) {
        let obj = seres[0].object;
        while (obj && !(obj.userData && obj.userData.kind)) obj = obj.parent;
        if (obj) return obj.userData;
      }
      if (groundMesh) {
        const hits = raycaster.intersectObject(groundMesh);
        if (hits.length) return { kind: 'terreno', x: hits[0].point.x, y: hits[0].point.z };
      }
      return null;
    }

    const onDown = (ev) => {
      pointer = { x: ev.clientX, y: ev.clientY, tx: target.x, tz: target.y, moved: false };
      renderer.domElement.setPointerCapture?.(ev.pointerId);
    };
    const onMove = (ev) => {
      if (!pointer) return;
      const dx = ev.clientX - pointer.x;
      const dy = ev.clientY - pointer.y;
      if (!pointer.moved && Math.hypot(dx, dy) < 5) return;
      pointer.moved = true;
      const w = mount.clientWidth, h = mount.clientHeight;
      const view = 560 / zoom;
      const worldPerPxY = view / h;
      const worldPerPxX = (view * (w / h)) / w;
      const { dim: D } = cbRef.current;
      target.x = Math.min(Math.max(pointer.tx - dx * worldPerPxX, 0), D.w);
      target.y = Math.min(Math.max(pointer.tz - dy * worldPerPxY, 0), D.h);
    };
    const onUp = (ev) => {
      if (pointer && !pointer.moved) {
        const hit = pick(ev.clientX, ev.clientY);
        const cb = cbRef.current;
        if (hit) {
          if (hit.kind === 'agente' || hit.kind === 'jogador') cb.onSelecionar(hit.id);
          else if (hit.kind === 'fauna') cb.onFauna(hit.id);
          else if (hit.kind === 'terreno') cb.onMover(hit.x, hit.y);
        }
      }
      pointer = null;
    };
    const onWheel = (ev) => {
      ev.preventDefault();
      zoom = Math.min(Math.max(zoom * (ev.deltaY < 0 ? 1.12 : 1 / 1.12), 0.35), 5);
      updateFrustum();
    };
    const zoomPor = (f) => { zoom = Math.min(Math.max(zoom * f, 0.35), 5); updateFrustum(); };
    threeRef.current = { zoomPor };

    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointerleave', () => { pointer = null; });
    dom.addEventListener('wheel', onWheel, { passive: false });

    const ro = new ResizeObserver(() => updateFrustum());
    ro.observe(mount);
    updateFrustum();

    // ----- loop -----
    let raf = 0;
    let t0 = performance.now();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      const cb = cbRef.current;
      const mundo = cb.m;
      if (mundo !== lastM) {
        lastM = mundo;
        lastChunks = -1; // força rebuild
        agentsMap.forEach(g => { disposeDeep(g); agentsGroup.remove(g); });
        agentsMap.clear();
        faunaMap.forEach(g => { disposeDeep(g); faunaGroup.remove(g); });
        faunaMap.clear();
      }
      if (mundo.chunks.length !== lastChunks || mundo.construcoes.length !== lastBuilds) {
        lastChunks = mundo.chunks.length;
        lastBuilds = mundo.construcoes.length;
        rebuildTerrain();
      }
      // sincronizar agentes
      const vivos = new Set();
      mundo.agentes.forEach(ag => {
        if (ag.estado === 'morto' && !ag.isCriador) return;
        vivos.add(ag.id);
        let g = agentsMap.get(ag.id);
        if (!g) { g = makeAgente(ag); agentsMap.set(ag.id, g); agentsGroup.add(g); }
        const sel = ag.id === cb.selecionadoId;
        g.position.set(ag.x, sel ? 2 + Math.sin(t * 3) * 0.6 : Math.sin(t * 2 + hashId(ag.id)) * 0.5, ag.y);
        g.children[1].material.opacity = ag.estado === 'morto' ? 0.35 : 1;
      });
      for (const [id, g] of agentsMap) {
        if (!vivos.has(id)) { disposeDeep(g); agentsGroup.remove(g); agentsMap.delete(id); }
      }
      // fauna
      const bichos = new Set();
      (mundo.fauna || []).forEach(an => {
        bichos.add(an.id);
        let g = faunaMap.get(an.id);
        if (!g) { g = makeFauna(an); faunaMap.set(an.id, g); faunaGroup.add(g); }
        g.position.set(an.x, Math.sin(t * 2.4 + hashId(an.id)) * 1.6, an.y);
        g.rotation.y = t * (0.6 + (hashId(an.id) % 3) * 0.2);
      });
      for (const [id, g] of faunaMap) {
        if (!bichos.has(id)) { disposeDeep(g); faunaGroup.remove(g); faunaMap.delete(id); }
      }
      // anéis de seleção/alvo
      const selAg = mundo.agentes.find(a => a.id === cb.selecionadoId && (a.estado === 'vivo' || a.isCriador));
      if (selAg) { selRing.visible = true; selRing.position.set(selAg.x, 0.3, selAg.y); selRing.rotation.z = t * 1.2; }
      else selRing.visible = false;
      const alvo = (mundo.fauna || []).find(a => a.id === cb.alvoFauna);
      if (alvo) { faunaRing.visible = true; faunaRing.position.set(alvo.x, 0.25, alvo.y); faunaRing.rotation.z = -t; }
      else faunaRing.visible = false;
      // câmera
      const j = cb.jogador;
      if (j && seguirRef.current) {
        target.x += (j.x - target.x) * 0.08;
        target.y += (j.y - target.y) * 0.08;
      }
      camera.position.set(target.x, 400, target.y + 170);
      camera.lookAt(target.x, 0, target.y);
      renderer.render(scene, camera);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('wheel', onWheel);
      disposeDeep(scene);
      renderer.dispose();
      if (dom.parentNode === mount) mount.removeChild(dom);
      threeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-2xl border border-slate-800 overflow-hidden"
      style={{ height: 440, touchAction: 'none', background: '#020617' }}>
      <style>{`
        @keyframes mu-gauntlet-pulse { 0%,100% { opacity:.25 } 50% { opacity:.8 } }
      `}</style>
      <div ref={mountRef} style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }} />
      {flash && !webglErro && (
        <div className="absolute inset-0 pointer-events-none" style={{ animation: 'mu-gauntlet-pulse 1s infinite', background: 'radial-gradient(circle, transparent 40%, rgba(248,113,113,0.4))' }} />
      )}
      {!webglErro && (
        <div className="absolute top-2 right-2 flex gap-1 z-30">
          <button onClick={() => threeRef.current && threeRef.current.zoomPor(1.25)}
            className="px-2 py-1 rounded-lg text-xs font-black" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid #334155', color: '#cbd5e1' }}>＋</button>
          <button onClick={() => threeRef.current && threeRef.current.zoomPor(1 / 1.25)}
            className="px-2 py-1 rounded-lg text-xs font-black" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid #334155', color: '#cbd5e1' }}>－</button>
          <button onClick={() => setSeguir(s => !s)}
            className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ background: seguir ? '#0e7490' : 'rgba(15,23,42,.85)', border: '1px solid #334155', color: seguir ? '#fff' : '#94a3b8' }}>
            🎯 {seguir ? 'a seguir' : 'seguir'}
          </button>
        </div>
      )}
      {flash && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded-lg text-[10px] font-black" style={{ background: '#450a0acc', color: '#fecaca', border: '1px solid #f8717166' }}>
          ⚔️ GAUNTLET!
        </div>
      )}
      {webglErro && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500 text-center p-4">
          WebGL indisponível neste browser — o mundo continua vivo nos painéis.
        </div>
      )}
    </div>
  );
}
