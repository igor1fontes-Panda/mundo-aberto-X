import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ============================================================
   MAPA 3D — Three.js (câmara em perspetiva 3/4 com órbita livre)
   v8: estilo jogo moderno —
   - Habitantes anime chibi: cabeça grande, cabelo, olhos com brilho,
     braços/pernas animados, andar interpolado (sem teleportes)
   - Fauna fofa: corpo arredondado, orelhas, rabinho a abanar, hop
   - Mundo vivo: ciclo dia/noite, céu dinâmico, nuvens à deriva,
     lago com ondas, árvores, rochas, flores, vagalumes noturnos,
     postes de luz que acendem ao anoitecer, casas com telhado
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
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(mt => mt.dispose());
    }
  });
}

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

// PRNG determinístico por seed — decoração do mundo estável entre rebuilds
function prng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rectContem(x, z, rx, rz, rw, rh, margem = 0) {
  return x > rx - margem && x < rx + rw + margem && z > rz - margem && z < rz + rh + margem;
}
function rectCruza(x, z, w, h, rx, rz, rw, rh, margem = 0) {
  return x < rx + rw + margem && x + w > rx - margem && z < rz + rh + margem && z + h > rz - margem;
}

// Paletas estilo anime/cozy — tons de pele e cabelo variados por habitante
const SKINS = ['#ffd9b3', '#f5c396', '#e8a870', '#c98a5b', '#8d5a3a', '#6b4226'];
const HAIRS = ['#1e1b2e', '#4a2c17', '#8b4513', '#c2743f', '#e0b34d', '#f9a8d4', '#7dd3fc', '#a78bfa', '#86efac', '#e2e8f0'];

/* ------------------------------------------------------------
   TRAJES POR SETOR (polígonos médios — orçamento de performance)
   · terra:    agricultura/comércio — tons terra e fibras naturais,
               Lambert barato, texturas detalhadas sem exagero de normal maps
   · formal:   economia/bancos — estética polida, bordas vincadas (caixas
               de alfaiataria), paleta sóbria, postura ereta e elegante
   · policial: funcional — maior densidade de polígonos nas articulações
               (liberdade de movimento), acessórios rígidos (cinto
               utilitário, emblemas) e reflexo diferenciado metal/couro
   ------------------------------------------------------------ */
const SETOR_TRAJE = {
  agricultor: 'terra', mercador: 'terra', minerador: 'terra', cuidador: 'terra', estudante: 'terra',
  trader: 'formal', professor: 'formal', professor_aula: 'formal', academico: 'formal',
  researcher: 'formal', medico: 'formal', engenheiro: 'formal',
  guarda: 'policial',
};
const COR_ROUPA = {
  agricultor: '#5a7d3a', // verde-campo
  mercador: '#8b5a2b',   // castanho de feira
  minerador: '#7a5c3e',  // casaco de trabalho
  cuidador: '#a89163',   // bege de fibras
  estudante: '#8d6e63',  // túnica simples
  trader: '#1f2a44',     // fato azul-noite
  professor: '#2c3e50',
  professor_aula: '#34495e',
  academico: '#23324d',
  researcher: '#e2e8f0', // jaleco
  medico: '#f1f5f9',     // jaleco branco
  engenheiro: '#37474f', // fato de obra
  guarda: '#1e3a5f',     // uniforme policial
};
const matCouro = () => new THREE.MeshPhongMaterial({ color: '#3b2a1e', shininess: 38, specular: '#5a3a22' });
const matMetal = () => new THREE.MeshPhongMaterial({ color: '#fbbf24', shininess: 110, specular: '#cccccc', emissive: '#fbbf24', emissiveIntensity: 0.25 });

// Acessórios rígidos e peças de vestuário por setor (anexados ao grupo do habitante)
function aplicarTraje(g, setor, prof) {
  if (setor === 'terra') {
    if (prof === 'agricultor') {
      // chapéu de palha (fibras naturais)
      const palha = new THREE.MeshLambertMaterial({ color: '#d9b44a' });
      const aba = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 6.9, 0.55, 12), palha);
      aba.position.y = 22.4; g.add(aba);
      const topo = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.8, 2.4, 12), palha);
      topo.position.y = 23.7; g.add(topo);
    }
    if (prof === 'minerador') {
      // capacete rígido de obra
      const capacete = new THREE.Mesh(
        new THREE.SphereGeometry(5.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: '#fbbf24' })
      );
      capacete.position.y = 19.2; g.add(capacete);
      const abaC = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 5.9, 0.5, 12), new THREE.MeshLambertMaterial({ color: '#d97706' }));
      abaC.position.y = 19.3; g.add(abaC);
    }
    // avental de fibras naturais (o sinal da terra)
    if (prof !== 'minerador') {
      const corAv = { agricultor: '#4a7c3f', mercador: '#6b4226', cuidador: '#d6c8a8', estudante: '#bcaaa4' }[prof] || '#8b5a2b';
      const avental = new THREE.Mesh(new THREE.BoxGeometry(6.2, 6.6, 0.9), new THREE.MeshLambertMaterial({ color: corAv }));
      avental.position.set(0, 7.2, 3.5); g.add(avental);
    }
    if (prof === 'mercador') {
      // faixa vermelha de feira à cintura
      const faixa = new THREE.Mesh(new THREE.TorusGeometry(4.0, 0.85, 8, 14), new THREE.MeshLambertMaterial({ color: '#c0392b' }));
      faixa.rotation.x = Math.PI / 2; faixa.position.y = 4.9; g.add(faixa);
    }
  }
  if (setor === 'formal') {
    const jaleco = prof === 'medico' || prof === 'researcher';
    if (!jaleco) {
      // camisa branca + gravata — bordas vincadas de alfaiataria
      const camisa = new THREE.Mesh(new THREE.BoxGeometry(2.6, 5.2, 0.8), new THREE.MeshLambertMaterial({ color: '#f8fafc' }));
      camisa.position.set(0, 8.9, 3.3); g.add(camisa);
      const gravata = new THREE.Mesh(new THREE.BoxGeometry(1.15, 4.4, 0.55), new THREE.MeshLambertMaterial({ color: prof === 'trader' ? '#7f1d1d' : '#1d4ed8' }));
      gravata.position.set(0, 8.9, 3.85); g.add(gravata);
    } else {
      // gola de jaleco clínico
      const gola = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.9, 0.8), new THREE.MeshLambertMaterial({ color: '#334155' }));
      gola.position.set(0, 11.4, 3.1); g.add(gola);
    }
    // óculos de bastidor (paleta sóbria)
    if (prof === 'trader' || prof === 'researcher' || prof === 'medico') {
      const aro = new THREE.MeshLambertMaterial({ color: '#1e1b2e' });
      for (const sx of [-2.1, 2.1]) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.22, 6, 12), aro);
        r.position.set(sx, 16.6, 4.7); g.add(r);
      }
    }
    // maleta de couro do trader
    if (prof === 'trader') {
      const maleta = new THREE.Mesh(new THREE.BoxGeometry(3.8, 3.0, 1.0), matCouro());
      maleta.position.set(5.4, 5.2, 0); g.add(maleta);
    }
  }
  if (setor === 'policial') {
    // emblema metálico no peito (reflexo de metal diferenciado)
    const badge = new THREE.Mesh(new THREE.OctahedronGeometry(1.15), matMetal());
    badge.scale.set(1, 1.35, 0.5); badge.position.set(2.7, 10.6, 3.5); g.add(badge);
    // cinto utilitário de couro + fivela metálica
    const cinto = new THREE.Mesh(new THREE.TorusGeometry(4.15, 0.85, 8, 18), matCouro());
    cinto.rotation.x = Math.PI / 2; cinto.position.y = 4.7; g.add(cinto);
    const fivela = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 0.7), matMetal());
    fivela.position.set(0, 4.7, 4.35); g.add(fivela);
    // bolsas rígidas do cinto
    for (const sx of [-1, 1]) {
      const bolsa = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.0, 1.2), matCouro());
      const ang = sx * 1.1;
      bolsa.position.set(Math.sin(ang) * 4.4, 4.7, Math.cos(ang) * 4.4);
      bolsa.rotation.y = ang; g.add(bolsa);
    }
    // ombreiras rígidas
    for (const sx of [-4.6, 4.6]) {
      const ombreira = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.1, 3.4), matCouro());
      ombreira.position.set(sx, 12.0, 0); g.add(ombreira);
    }
    // gorra com viseira polida + emblema da patrulha
    const gorra = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.75, 2.3, 14), new THREE.MeshLambertMaterial({ color: '#1e3a5f' }));
      gorra.position.y = 22.3; g.add(gorra);
      const viseira = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.55, 3.2), new THREE.MeshPhongMaterial({ color: '#14203a', shininess: 60, specular: '#334455' }));
      viseira.position.set(0, 21.25, 4.9); g.add(viseira);
      const emblema = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 10), matMetal());
      emblema.scale.set(1, 1, 0.45); emblema.position.set(0, 23.6, 4.5); g.add(emblema);
  }
}

const COR_NIGHT_SKY = new THREE.Color('#0b1026');
const COR_DAY_SKY = new THREE.Color('#7ec8e3');
const COR_DUSK_SKY = new THREE.Color('#c2743f');
const COR_LAMP_ON = new THREE.Color('#ffd27a');
const COR_LAMP_OFF = new THREE.Color('#4a4536');

export default function Mapa3D({ m, CFG, dim, jogador, selecionadoId, alvoFauna, onMover, onSelecionar, onFauna }) {
  const mountRef = useRef(null);
  const threeRef = useRef(null);
  const cbRef = useRef({});
  cbRef.current = { m, CFG, dim, jogador, selecionadoId, alvoFauna, onMover, onSelecionar, onFauna };
  const [seguir, setSeguir] = useState(false);
  const [tiltNome, setTiltNome] = useState('3D');
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
    renderer.setClearColor(0x0b1026, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0b1026, 900, 3000); // névoa de profundidade (ajustada por frame)
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 10, 4600);
    const amb = new THREE.AmbientLight(0xbfd4ff, 0.85);
    const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x24352a, 0.55); // céu/solo — volume nas faces verticais
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(300, 400, -420); // sol rasante → sombras longas = leitura 3D
    scene.add(amb, hemi, dir);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 50;
    dir.shadow.camera.far = 2400;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.02;
    // pós-processamento: bloom ligeiro (lamps/vagalumes/emojis brilham)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(800, 420), 0.45, 0.7, 0.82);
    composer.addPass(bloomPass);

    const terrainGroup = new THREE.Group();
    const agentsGroup = new THREE.Group();
    const npcGroup = new THREE.Group();
    const faunaGroup = new THREE.Group();
    const ringsGroup = new THREE.Group();
    const envGroup = new THREE.Group(); // nuvens, estrelas, vagalumes (uma vez só)
    const itemsGroup = new THREE.Group();
    scene.add(terrainGroup, agentsGroup, npcGroup, faunaGroup, ringsGroup, envGroup, itemsGroup);

    let groundMesh = null;
    let zoom = 1;
    let target = new THREE.Vector2(320, 160);
    // câmara orbital: yaw (rotação) + elev (inclinação) — a perspetiva dá o feel 3D
    let yaw = 0;
    let elev = 55 * Math.PI / 180; // vista 3/4 por omissão (não top-down)
    const FOV = 42;
    const TILT_PRESETS = [55, 38, 76]; // 3D · cinematográfica · quase-topo
    const CAM_BASE = 640; // distância = CAM_BASE / zoom
    let lastM = null;
    let lastChunks = -1;
    let lastBuilds = -1;
    let envBuilt = false;
    const waters = [];      // lagos animados
    const birds = [];       // aves voadoras do ambiente (águia/coruja/papagaio)
    const lamps = [];       // postes (acendem à noite)
    const clouds = [];      // nuvens à deriva
    let stars = null;
    let fireflies = null;
    const agentsMap = new Map();
    const npcMap = new Map();
    const faunaMap = new Map();
    const itemsMap = new Map();
    const boatMap = new Map(); // v10: frota do Mar de West

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
    // marcador de missão física (v9.1): coluna de luz dourada com anel no chão
    const misRing = new THREE.Mesh(
      new THREE.TorusGeometry(8, 1.1, 8, 36),
      new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.85 })
    );
    misRing.rotation.x = Math.PI / 2;
    misRing.visible = false;
    const misBeam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.6, 46, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
    );
    misBeam.position.y = 23;
    misBeam.visible = false;
    ringsGroup.add(misRing, misBeam);

    function updateFrustum() {
      const w = mount.clientWidth || 800;
      const h = mount.clientHeight || 420;
      camera.aspect = w / h;
      camera.fov = FOV;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
    }

    /* ---------- HABITANTE ANIME CHIBI ---------- */
    function makeAgente(ag) {
      const CFGn = cbRef.current.CFG;
      const arq = CFGn.arquetipos[ag.arquetipo] || CFGn.arquetipos.humano;
      const cor = new THREE.Color(arq.cor || '#7dd3fc');
      const h = hashId(ag.id);
      const skin = new THREE.Color(SKINS[h % SKINS.length]);
      const hairC = new THREE.Color(HAIRS[(h >> 3) % HAIRS.length]);
      // setor do traje e cor de roupa da profissão (paletas por setor)
      const setor = ag.isCriador ? 'casual' : (SETOR_TRAJE[ag.profissao] || 'casual');
      const corRoupa = setor === 'casual' ? cor : new THREE.Color(COR_ROUPA[ag.profissao] || arq.cor || '#7dd3fc');

      const g = new THREE.Group();
      g.userData = {
        kind: ag.isCriador ? 'jogador' : 'agente',
        id: ag.id,
        tx: ag.x, tz: ag.y, // alvo vindo do engine (render interpola)
      };

      const matCorpo = new THREE.MeshLambertMaterial({ color: corRoupa, emissive: corRoupa.clone().multiplyScalar(0.15) });
      const matSkin = new THREE.MeshLambertMaterial({ color: skin });
      const matHair = new THREE.MeshLambertMaterial({ color: hairC, emissive: hairC.clone().multiplyScalar(0.12) });
      const matOlho = new THREE.MeshBasicMaterial({ color: 0x1e1b2e });
      const matGlint = new THREE.MeshBasicMaterial({ color: 0xffffff });

      // pernas (esferas pequenas — estilo chibi)
      // polícia: maior densidade de polígonos nas articulações (liberdade de movimento)
      const segJ = setor === 'policial' ? 14 : 8;
      const legGeo = new THREE.SphereGeometry(1.7, segJ, segJ);
      const legs = [];
      for (const sx of [-1.9, 1.9]) {
        const leg = new THREE.Mesh(legGeo, matCorpo);
        leg.position.set(sx, 1.8, 0);
        g.add(leg);
        legs.push(leg);
      }
      // corpo pequeno (roupa na cor do arquétipo)
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(3.6, 4.2, 4, 10), matCorpo);
      body.position.y = 7.4;
      g.add(body);
      // braços com pivot no ombro (para balançar ao andar)
      const armGeo = new THREE.CapsuleGeometry(1.15, 3.2, 4, segJ);
      const arms = [];
      for (const sx of [-4.4, 4.4]) {
        const pivot = new THREE.Group();
        pivot.position.set(sx, 9.8, 0);
        const arm = new THREE.Mesh(armGeo, matSkin);
        arm.position.y = -2.3;
        pivot.add(arm);
        g.add(pivot);
        arms.push(pivot);
      }
      // cabeça grande — a assinatura do estilo chibi
      const head = new THREE.Mesh(new THREE.SphereGeometry(5.4, 18, 16), matSkin);
      head.position.y = 16.4;
      g.add(head);
      // cabelo (calota no topo/atrás)
      const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(5.8, 18, 16), matHair);
      hairMesh.scale.set(1, 0.86, 1);
      hairMesh.position.set(0, 17.6, -1.1);
      g.add(hairMesh);
      // olhos grandes com brilho (olhar anime)
      const eyeGeo = new THREE.SphereGeometry(0.95, 10, 10);
      const glintGeo = new THREE.SphereGeometry(0.32, 8, 8);
      for (const sx of [-2.1, 2.1]) {
        const eye = new THREE.Mesh(eyeGeo, matOlho);
        eye.position.set(sx, 16.6, 4.5);
        g.add(eye);
        const gl = new THREE.Mesh(glintGeo, matGlint);
        gl.position.set(sx + 0.32, 17.0, 5.15);
        g.add(gl);
      }
      aplicarTraje(g, setor, ag.profissao);
      // Criador: coroa dourada
      if (ag.isCriador) {
        const crown = new THREE.Mesh(
          new THREE.CylinderGeometry(1.7, 2.3, 1.8, 5),
          new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.5 })
        );
        crown.position.y = 22.3;
        g.add(crown);
      }
      // etiqueta de nome (sem ícone flutuante sobre a cabeça)
      const nome = labelSprite(ag.nome, arq.cor || '#94a3b8');
      nome.position.y = 30;
      g.add(nome);

      g.userData.anim = { legs, arms, head, body };
      // postura por setor (rigging): banqueiro ereto e elegante · polícia largura de ombros
      if (setor === 'formal') g.userData.anim.bodyScale = { x: 0.94, y: 1.1, z: 0.94 };
      if (setor === 'policial') g.userData.anim.bodyScale = { x: 1.08, y: 1.0, z: 1.06 };
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }
    /* ---------- ITENS NO CHÃO ---------- */
    const ITEM_EMOJI = { comida: '🍖', kit_medico: '💗', semente: '🌱', picareta: '⛏', livro: '📖', laptop: '💻' };
    function makeItem(it) {
      const g = new THREE.Group();
      if (it.itemKey === 'bau_missao') {
        // baú da missão (v9.2): madeira escura, faixas douradas, aura brilhante
        const madeira = new THREE.MeshLambertMaterial({ color: 0x6b4226 });
        const ouro = new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.45 });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(5, 3.2, 3.6), madeira);
        corpo.position.y = 1.6; corpo.castShadow = true; g.add(corpo);
        const tampa = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 3.6, 12, 1, false, 0, Math.PI), ouro);
        tampa.rotation.z = Math.PI / 2; tampa.position.y = 3.2; g.add(tampa);
        for (const fx of [-1.4, 1.4]) {
          const faixa = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 3.8), ouro);
          faixa.position.set(fx, 1.7, 0); g.add(faixa);
        }
        // aura de "vem buscá-me"
        const aura = new THREE.Mesh(
          new THREE.TorusGeometry(3.6, 0.35, 8, 24),
          new THREE.MeshBasicMaterial({ color: 0xfde68a, transparent: true, opacity: 0.7 })
        );
        aura.rotation.x = Math.PI / 2; aura.position.y = 0.4;
        aura.userData.kind = 'aura-bau';
        g.add(aura);
        return g;
      }
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.2),
        new THREE.MeshLambertMaterial({ color: 0xfbbf24, emissive: 0xfbbf24, emissiveIntensity: 0.5 })
      );
      gem.position.y = 1.5;
      g.add(gem);
      const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(ITEM_EMOJI[it.itemKey] || '📦'), depthTest: false, transparent: true }));
      emoji.scale.set(9, 9, 1);
      emoji.position.y = 8;
      emoji.renderOrder = 9;
      g.add(emoji);
      return g;
    }

    /* ---------- NPCs DE AMBIENTE ---------- */
    function makeNpc(np) {
      const cor = new THREE.Color(np.cor || '#94a3b8');
      const g = new THREE.Group();
      g.userData = { kind: 'npc', id: np.id, tx: np.x, tz: np.y };
      const matRoupa = new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.12) });
      const matPele = new THREE.MeshLambertMaterial({ color: 0xd8b58f });

      const body = new THREE.Mesh(new THREE.ConeGeometry(3.6, 9.5, 10), matRoupa); // manto cónico
      body.position.y = 5.2;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(2.9, 12, 10), matPele);
      head.position.y = 11.4;
      g.add(head);
      // chapéu de aba (assinatura dos NPCs de ofício)
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 0.6, 14), matRoupa);
      brim.position.y = 12.9;
      g.add(brim);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 2.2, 12), matRoupa);
      top.position.y = 14.2;
      g.add(top);
      const eyeGeo = new THREE.SphereGeometry(0.42, 8, 8);
      const matOlho = new THREE.MeshBasicMaterial({ color: 0x1e1b2e });
      for (const sx of [-1.1, 1.1]) {
        const eye = new THREE.Mesh(eyeGeo, matOlho);
        eye.position.set(sx, 11.8, 2.55);
        g.add(eye);
      }
      // fardo/cesta às costas
      const pack = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.0, 2.2), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
      pack.position.set(0, 6.4, -3.4);
      g.add(pack);
      const nome = labelSprite(np.nome, np.cor || '#94a3b8');
      nome.position.y = 22;
      nome.scale.multiplyScalar(0.85); // etiqueta mais discreta que a dos agentes
      g.add(nome);
      g.userData.anim = { body, head, pack };
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }

    /* ---------- FAUNA FOFA ---------- */
    function makeFauna(an) {
      const cor = new THREE.Color(an.cor || '#fb923c');
      const g = new THREE.Group();
      g.userData = { kind: 'fauna', id: an.id, tx: an.x, tz: an.y };
      const mat = new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.22) });
      const matOlho = new THREE.MeshBasicMaterial({ color: 0x1e1b2e });

      const body = new THREE.Mesh(new THREE.SphereGeometry(4.6, 12, 10), mat);
      body.scale.set(1, 0.82, 1.15);
      body.position.y = 4.4;
      g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(3.1, 12, 10), mat);
      head.position.set(0, 8.2, 2.4);
      g.add(head);
      const earGeo = new THREE.ConeGeometry(1.2, 2.6, 6);
      for (const sx of [-1.5, 1.5]) {
        const ear = new THREE.Mesh(earGeo, mat);
        ear.position.set(sx, 10.9, 2.2);
        ear.rotation.z = sx * 0.18;
        g.add(ear);
      }
      const eyeGeo = new THREE.SphereGeometry(0.5, 8, 8);
      for (const sx of [-1.2, 1.2]) {
        const eye = new THREE.Mesh(eyeGeo, matOlho);
        eye.position.set(sx, 8.6, 5.0);
        g.add(eye);
      }
      const tail = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 8), mat);
      tail.position.set(0, 5.2, -5.0);
      g.add(tail);
      // variedade por forma (v8.1): cada espécie tem a sua silhueta
      const extras = {};
      const matAsa = new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.6), transparent: true, opacity: 0.85, side: THREE.DoubleSide });
      if (an.forma === 'borboleta') {
        const asaGeo = new THREE.CircleGeometry(3.4, 10);
        const wL = new THREE.Mesh(asaGeo, matAsa); wL.position.set(-3.2, 8.0, -0.4); wL.rotation.y = 0.5;
        const wR = new THREE.Mesh(asaGeo, matAsa); wR.position.set(3.2, 8.0, -0.4); wR.rotation.y = -0.5;
        g.add(wL, wR); extras.wingL = wL; extras.wingR = wR;
      } else if (an.forma === 'tartaruga') {
        const casco = new THREE.Mesh(new THREE.SphereGeometry(4.9, 12, 9), new THREE.MeshLambertMaterial({ color: 0x2f5d3a }));
        casco.scale.set(1, 0.55, 1.12); casco.position.y = 5.6; g.add(casco);
      } else if (an.forma === 'ouriço') {
        const spikes = new THREE.Group();
        const spGeo = new THREE.ConeGeometry(0.42, 2.4, 5);
        const spMat = new THREE.MeshLambertMaterial({ color: 0x7cf03d, emissive: 0x7cf03d, emissiveIntensity: 0.35 });
        for (let i = 0; i < 16; i++) {
          const sp = new THREE.Mesh(spGeo, spMat);
          const a = (i / 16) * Math.PI * 2;
          sp.position.set(Math.cos(a) * 3.1, 6.8, Math.sin(a) * 3.4);
          sp.rotation.x = Math.PI / 2.4;
          spikes.add(sp);
        }
        spikes.position.y = 1.4; g.add(spikes); extras.spikes = spikes;
      } else if (an.forma === 'lobo') {
        const focinho = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 7), mat);
        focinho.rotation.x = Math.PI / 2; focinho.position.set(0, 7.8, 5.4); g.add(focinho);
        earGeo.radiusTop = 0.4;
      } else if (an.forma === 'ave') {
        const bico = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.9, 6), new THREE.MeshLambertMaterial({ color: 0xf59e0b }));
        bico.rotation.x = Math.PI / 2; bico.position.set(0, 8.1, 5.3); g.add(bico);
      } else if (an.forma === 'aguia' || an.forma === 'coruja' || an.forma === 'papagaio') {
        // aves voadoras: corpo aerodinâmico, bico grande, cauda em leme (v9.3)
        const bico = new THREE.Mesh(new THREE.ConeGeometry(0.9, an.forma === 'papagaio' ? 2.4 : 1.8, 6),
          new THREE.MeshLambertMaterial({ color: an.forma === 'papagaio' ? 0xf97316 : 0xf59e0b }));
        bico.rotation.x = Math.PI / 2; bico.position.set(0, 7.4, 5.6); g.add(bico);
        const cauda = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 4.2), mat);
        cauda.position.set(0, 4.6, -6.2); cauda.rotation.x = 0.22; g.add(cauda);
        extras.tail = cauda;
        const coroa = new THREE.Mesh(new THREE.SphereGeometry(1.0, 8, 8), mat);
        coroa.position.set(0, 10.9, 2.0); g.add(coroa);
        const asaGeoAve = new THREE.BoxGeometry(7.5, 0.35, 3.2);
        const wLA = new THREE.Mesh(asaGeoAve, mat); wLA.position.set(-4.2, 8.6, 0); wLA.rotation.z = 0.3; g.add(wLA);
        const wRA = new THREE.Mesh(asaGeoAve, mat); wRA.position.set(4.2, 8.6, 0); wRA.rotation.z = -0.3; g.add(wRA);
        extras.wingL = wLA; extras.wingR = wRA;
      } else if (an.forma === 'peixe') {
        // peixe de lago: corpo fusiforme, cauda em V, barbatana dorsal (v9.3)
        body.scale.set(0.62, 0.72, 1.75);
        const caudaP = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.2, 4), mat);
        caudaP.rotation.x = -Math.PI / 2; caudaP.scale.set(1, 1, 0.5);
        caudaP.position.set(0, 4.4, -5.8); g.add(caudaP);
        const dorsal = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.4, 4), mat);
        dorsal.position.set(0, 8.0, -0.6); g.add(dorsal);
        extras.dorsal = dorsal;
        head.visible = false; // peixe não tem cabeça de mamífero
      } else if (an.forma === 'vaca' || an.forma === 'cavalo' || an.forma === 'ovelha' || an.forma === 'galo') {
        // gado: corpo maior com manchas/pelos, focinho claro (v9.3)
        body.scale.set(1.25, 1.05, 1.6);
        if (an.forma === 'vaca') {
          const mancha = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 7), new THREE.MeshLambertMaterial({ color: 0x1e1b2e }));
          mancha.scale.set(1.2, 0.7, 1.5); mancha.position.set(1.6, 5.6, 2.2); g.add(mancha);
          const mancha2 = mancha.clone(); mancha2.position.set(-2.0, 4.6, -2.4); mancha2.scale.setScalar(0.7); g.add(mancha2);
        }
        if (an.forma === 'cavalo') {
          const juba = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 4.4), new THREE.MeshLambertMaterial({ color: 0x1e1b2e }));
          juba.position.set(0, 9.6, 0.6); g.add(juba);
          body.scale.set(1.05, 1.05, 1.85); // alongado
        }
        if (an.forma === 'ovelha') {
          const la = new THREE.Mesh(new THREE.SphereGeometry(4.4, 10, 8), new THREE.MeshLambertMaterial({ color: 0xfafaf9 }));
          la.scale.set(1.2, 1.0, 1.4); la.position.y = 4.8; g.add(la);
        }
        if (an.forma === 'galo') {
          const crista = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.4, 2.6), new THREE.MeshLambertMaterial({ color: 0xdc2626 }));
          crista.position.set(0, 11.0, 2.2); g.add(crista);
          const penaC = new THREE.Mesh(new THREE.ConeGeometry(1.6, 4.4, 6), mat);
          penaC.position.set(0, 6.0, -5.6); penaC.rotation.x = 0.9; g.add(penaC);
        }
        const focinho = new THREE.Mesh(new THREE.SphereGeometry(1.3, 8, 7),
          new THREE.MeshLambertMaterial({ color: an.forma === 'galo' ? 0xf59e0b : 0xe7d7c9 }));
        focinho.scale.set(1, 0.72, 1); focinho.position.set(0, 7.8, 4.6); g.add(focinho);
      } else if (an.forma === 'axolote') {
        // guelros rosa salientes
        for (const sx of [-2.6, 2.6]) {
          const guelra = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 6), new THREE.MeshLambertMaterial({ color: 0xf472b6 }));
          guelra.position.set(sx, 8.6, 1.4); guelra.rotation.z = sx > 0 ? -0.9 : 0.9; g.add(guelra);
        }
      }
      g.userData.forma = an.forma || null;
      g.userData.habitat = an.habitat || 'terra';
      g.userData.anim = { head, tail, body, ...extras };
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }

    /* ---------- DECORAÇÃO: árvores, rochas, flores, postes ---------- */
    function makeTree(rand) {
      const g = new THREE.Group();
      const trunkH = 4 + rand() * 3;
      const matTrunk = new THREE.MeshLambertMaterial({ color: 0x6b4226 });
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, trunkH, 6), matTrunk);
      trunk.position.y = trunkH / 2;
      g.add(trunk);
      const verdes = [0x2d6a4f, 0x40916c, 0x52b788];
      const matFolha = new THREE.MeshLambertMaterial({ color: verdes[Math.floor(rand() * verdes.length)] });
      if (rand() < 0.55) {
        // pinheiro: dois cones empilhados
        const c1 = new THREE.Mesh(new THREE.ConeGeometry(3.8 + rand() * 1.4, 7.5, 8), matFolha);
        c1.position.y = trunkH + 2.8;
        g.add(c1);
        const c2 = new THREE.Mesh(new THREE.ConeGeometry(2.6, 5, 8), matFolha);
        c2.position.y = trunkH + 6.4;
        g.add(c2);
      } else {
        // copa redonda fofa
        const copa = new THREE.Mesh(new THREE.SphereGeometry(3.3 + rand() * 1.3, 10, 8), matFolha);
        copa.scale.y = 0.85;
        copa.position.y = trunkH + 2.4;
        g.add(copa);
      }
      g.rotation.y = rand() * Math.PI * 2;
      return g;
    }
    // aves de ambiente (v9.3): silhueta leve — corpo + asas a bater + cauda
    function makeBird(rand, i) {
      const g = new THREE.Group();
      const esp = i % 4; // 0 águia · 1 corvo · 2 coruja · 3 papagaio
      const cores = [0x8a6432, 0x1e1b26, 0x92766b, 0x22c55e];
      const tam = esp === 0 ? 1.5 : esp === 1 ? 0.95 : 1.05;
      const mat = new THREE.MeshLambertMaterial({ color: cores[esp] });
      const corpo = new THREE.Mesh(new THREE.SphereGeometry(1.6 * tam, 8, 7), mat);
      corpo.scale.set(1.15, 0.85, 1.7);
      g.add(corpo);
      const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.95 * tam, 8, 7), mat);
      cabeca.position.set(0, 0.85 * tam, 2.3 * tam);
      g.add(cabeca);
      const bico = new THREE.Mesh(
        new THREE.ConeGeometry(esp === 3 ? 0.55 : 0.35, esp === 3 ? 1.4 : 0.9, 6),
        new THREE.MeshLambertMaterial({ color: esp === 1 ? 0x64748b : 0xf59e0b })
      );
      bico.rotation.x = Math.PI / 2;
      bico.position.set(0, 0.8 * tam, 3.4 * tam);
      g.add(bico);
      const asaGeo = new THREE.BoxGeometry(6.5 * tam, 0.18, 2.3 * tam);
      const wL = new THREE.Mesh(asaGeo, mat); wL.position.set(-3.6 * tam, 0.4 * tam, 0); wL.rotation.z = 0.3; g.add(wL);
      const wR = new THREE.Mesh(asaGeo, mat); wR.position.set(3.6 * tam, 0.4 * tam, 0); wR.rotation.z = -0.3; g.add(wR);
      const cauda = new THREE.Mesh(new THREE.BoxGeometry(1.5 * tam, 0.15, 2.6 * tam), mat);
      cauda.position.set(0, 0.25 * tam, -3.2 * tam);
      g.add(cauda);
      g.userData = { wingL: wL, wingR: wR, ang: (i / 8) * Math.PI * 2, h: 60 + (i % 3) * 22, r: 140 + (i % 4) * 55, speed: 0.12 + (i % 5) * 0.05 };
      return g;
    }
    // carroça de tração animal (v9.3): caixa de madeira + rodas + canga
    function makeCarroca() {
      const g = new THREE.Group();
      const madeira = new THREE.MeshLambertMaterial({ color: 0x7c5230 });
      const caixa = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.4, 4.6), madeira);
      caixa.position.y = 2.1; caixa.castShadow = true; g.add(caixa);
      const carga = new THREE.Mesh(new THREE.BoxGeometry(5.4, 1.6, 3.8), new THREE.MeshLambertMaterial({ color: 0xc9a227 }));
      carga.position.y = 4.4; g.add(carga);
      const rodas = [];
      const rodaGeo = new THREE.TorusGeometry(1.7, 0.42, 8, 16);
      const raioGeo = new THREE.CylinderGeometry(0.14, 0.14, 4.6, 6);
      for (const sx of [-3.0, 3.0]) {
        for (const sz of [-1.4, 1.4]) {
          const roda = new THREE.Mesh(rodaGeo, madeira);
          roda.position.set(sx, 1.7, sz);
          roda.rotation.y = Math.PI / 2;
          const raio = new THREE.Mesh(raioGeo, madeira);
          raio.rotation.z = Math.PI / 2;
          roda.add(raio);
          g.add(roda);
          rodas.push(roda);
        }
      }
      const canga = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 5.4, 6), madeira);
      canga.rotation.x = Math.PI / 2; canga.position.set(0, 2.4, -3.8); g.add(canga);
      g.userData.rodas = rodas;
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }
    // barco da frota de WestDocks (v10): casco, mastro, vela (negra se pirata)
    function makeBarco(b) {
      const g = new THREE.Group();
      const pirata = b.tipo === 'pirata';
      const corCasco = pirata ? 0x2a1e2e : 0x7c5230;
      const corVela = pirata ? 0x1e1b26 : 0xf1f5f9;
      const matCasco = new THREE.MeshLambertMaterial({ color: corCasco });
      const matVela = new THREE.MeshLambertMaterial({ color: corVela, emissive: corVela, emissiveIntensity: 0.08 });
      const matMastro = new THREE.MeshLambertMaterial({ color: 0x5c3a1e });
      const casco = new THREE.Mesh(new THREE.CylinderGeometry(1, 2.6, 10, 3), matCasco);
      casco.rotation.z = -Math.PI / 2; casco.scale.set(1, 1, 0.6);
      casco.position.y = 1.4; casco.castShadow = true; g.add(casco);
      const borda = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.7, 3.2), matCasco);
      borda.position.y = 2.6; g.add(borda);
      const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 11, 6), matMastro);
      mastro.position.y = 7.5; g.add(mastro);
      const vela = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 6.4), matVela);
      vela.position.set(0.12, 7.6, 0); vela.rotation.y = Math.PI / 2;
      vela.userData.kind = 'vela'; g.add(vela);
      const bandeira = new THREE.Mesh(
        new THREE.PlaneGeometry(2.2, 1.3),
        new THREE.MeshBasicMaterial({ color: pirata ? 0x111114 : 0x0e7490, side: THREE.DoubleSide })
      );
      bandeira.position.set(0, 13.4, 0);
      g.add(bandeira);
      if (b.tipo === 'pesca') {
        // rede na popa
        const rede = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 2.6), new THREE.MeshLambertMaterial({ color: 0x9a7b4f }));
        rede.position.set(-5.4, 2.4, 0); g.add(rede);
      }
      if (pirata) {
        // farol de nível dos piratas: luzinha vermelha
        const luz = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
        luz.position.set(0, 13.4, 0); g.add(luz);
      }
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      return g;
    }

    function makeLamp(x, z) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.7, 7, 6),
        new THREE.MeshLambertMaterial({ color: 0x334155 })
      );
      pole.position.y = 3.5;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(1.5, 10, 8), new THREE.MeshBasicMaterial({ color: COR_LAMP_OFF.clone() }));
      bulb.position.y = 7.6;
      g.add(pole, bulb);
      g.position.set(x, 0, z);
      lamps.push(bulb.material);
      return g;
    }

    function rebuildTerrain() {
      const { CFG: C, dim: D, m: mundo } = cbRef.current;
      [...terrainGroup.children].forEach(ch => { disposeDeep(ch); terrainGroup.remove(ch); });
      waters.length = 0;
      lamps.length = 0;
      boatMap.forEach(g => { disposeDeep(g); terrainGroup.remove(g); });
      boatMap.clear();
      const w = D.w, h = D.h;
      const WD = (mundo.westdocks && mundo.westdocks.anexado) ? mundo.westdocks : null;
      const NAT = C.natureza || {}; // densidades/relevo vêm da configuração (fonte de verdade)
      // chão base — verde profundo em vez de grelha navy (menos quadrado, mais natureza)
      groundMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshLambertMaterial({ color: 0x12331f })
      );
      groundMesh.rotation.x = -Math.PI / 2;
      groundMesh.position.set(w / 2, 0, h / 2);
      groundMesh.receiveShadow = true;
      groundMesh.userData = { kind: 'terreno' };
      terrainGroup.add(groundMesh);
      const mapa = C.mapa;
      (mundo.chunks || []).forEach((chunk, ci) => {
        const offX = ci === 0 ? 0 : (ci % 2) * mapa.chunkLargura;
        const offY = ci === 0 ? 0 : Math.floor(ci / 2) * mapa.chunkAltura;
        const rand = prng(1234 + ci * 7919);
        const zonas = chunk.zonas || [];
        const ruas = chunk.ruas || [];
        // lagos (procuram espaço livre fora de zonas/ruas)
        let lagosFeitos = 0;
        for (let tent = 0; tent < 26 && lagosFeitos < 2; tent++) {
          const lw = 46 + rand() * 34;
          const lh = 34 + rand() * 24;
          const lx = offX + 10 + rand() * (mapa.chunkLargura - lw - 20);
          const lz = offY + 10 + rand() * (mapa.chunkAltura - lh - 20);
          const livre = zonas.every(z => !rectCruza(lx, lz, lw, lh, offX + z.x, offY + z.y, z.w, z.h, 9))
            && ruas.every(r => !rectCruza(lx, lz, lw, lh, offX + r.x, offY + r.y, r.w, r.h, 9));
          if (!livre) continue;
          // areia à volta + água animada
          const areia = new THREE.Mesh(
            new THREE.PlaneGeometry(lw + 10, lh + 10),
            new THREE.MeshLambertMaterial({ color: 0xb08d57 })
          );
          areia.rotation.x = -Math.PI / 2;
          areia.receiveShadow = true;
          areia.position.set(lx + lw / 2, 0.06, lz + lh / 2);
          terrainGroup.add(areia);
          const geo = new THREE.PlaneGeometry(lw, lh, 12, 8);
          const agua = new THREE.Mesh(
            geo,
            new THREE.MeshLambertMaterial({ color: 0x1d5fa8, transparent: true, opacity: 0.88, emissive: 0x0a2a55 })
          );
          agua.rotation.x = -Math.PI / 2;
          agua.position.set(lx + lw / 2, 0.14, lz + lh / 2);
          agua.userData.base = geo.attributes.position.array.slice();
          terrainGroup.add(agua);
          waters.push(agua);
          if (!mundo.lagos) mundo.lagos = [];
          mundo.lagos.push({ cx: lx + lw / 2, cz: lz + lh / 2, w: lw, h: lh });
          lagosFeitos++;
        }
        // zonas e ruas
        zonas.forEach(z => {
          const zm = new THREE.Mesh(
            new THREE.PlaneGeometry(z.w, z.h),
            new THREE.MeshLambertMaterial({ color: new THREE.Color(z.cor), transparent: true, opacity: 0.92 })
          );
          zm.rotation.x = -Math.PI / 2;
          zm.receiveShadow = true;
          zm.position.set(offX + z.x + z.w / 2, 0.08, offY + z.y + z.h / 2);
          terrainGroup.add(zm);
          const zn = labelSprite(z.nome, 'rgba(255,255,255,0.55)');
          zn.position.set(offX + z.x + 26, 3, offY + z.y + 10);
          zn.scale.set(34, 7.4, 1);
          terrainGroup.add(zn);
        });
        ruas.forEach(r => {
          const rm = new THREE.Mesh(
            new THREE.PlaneGeometry(r.w, r.h),
            new THREE.MeshLambertMaterial({ color: 0x57503c })
          );
          rm.rotation.x = -Math.PI / 2;
          rm.receiveShadow = true;
          rm.position.set(offX + r.x + r.w / 2, 0.12, offY + r.y + r.h / 2);
          terrainGroup.add(rm);
          // postes de luz ao longo da rua (máx 6)
          const horizontal = r.w >= r.h;
          const comprimento = horizontal ? r.w : r.h;
          const passo = Math.max(60, comprimento / 6);
          const nLamps = Math.min(6, Math.floor(comprimento / passo));
          for (let li = 0; li < nLamps; li++) {
            const d = r.x + 24 + li * passo;
            if (horizontal && d < offX + r.x + r.w - 8) terrainGroup.add(makeLamp(d, offY + r.y + r.h + 3));
            else if (!horizontal && d < offY + r.y + r.h - 8) terrainGroup.add(makeLamp(offX + r.x + r.w + 3, offY + d));
          }
        });
        // árvores fora de zonas/ruas/lagos — floresta densa (v9.3)
        let plantadas = 0;
        const alvoArvores = NAT.arvoresPorChunk || 21;
        for (let tent = 0; tent < alvoArvores * 3 + 10 && plantadas < alvoArvores; tent++) {
          const x = offX + 8 + rand() * (mapa.chunkLargura - 16);
          const z = offY + 8 + rand() * (mapa.chunkAltura - 16);
          const livre = zonas.every(zz => !rectContem(x, z, offX + zz.x, offY + zz.y, zz.w, zz.h, 6))
            && ruas.every(rr => !rectContem(x, z, offX + rr.x, offY + rr.y, rr.w, rr.h, 6));
          if (!livre) continue;
          const tr = makeTree(rand);
          tr.position.set(x, 0, z);
          tr.traverse(o => { if (o.isMesh) o.castShadow = true; });
          terrainGroup.add(tr);
          plantadas++;
        }
        // montes suaves (relevo decorativo fora de zonas/ruas/lagos)
        for (let mi = 0; mi < (NAT.montesPorChunk || 2); mi++) {
          const x = offX + 20 + rand() * (mapa.chunkLargura - 40);
          const z = offY + 20 + rand() * (mapa.chunkAltura - 40);
          const livre = zonas.every(zz => !rectCruza(x - 30, z - 30, 60, 60, offX + zz.x, offY + zz.y, zz.w, zz.h, 8))
            && ruas.every(rr => !rectCruza(x - 30, z - 30, 60, 60, offX + rr.x, offY + rr.y, rr.w, rr.h, 8));
          if (!livre) continue;
          const monte = new THREE.Mesh(
            new THREE.SphereGeometry((NAT.monte || {}).raio || 26, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshLambertMaterial({ color: 0x2f5d3a })
          );
          monte.scale.y = ((NAT.monte || {}).altura || 14) / ((NAT.monte || {}).raio || 26);
          monte.position.set(x, 0, z);
          monte.castShadow = true;
          terrainGroup.add(monte);
        }
        // rochas
        for (let ri = 0; ri < (NAT.rochasPorChunk || 8); ri++) {
          const x = offX + 8 + rand() * (mapa.chunkLargura - 16);
          const z = offY + 8 + rand() * (mapa.chunkAltura - 16);
          const livre = zonas.every(zz => !rectContem(x, z, offX + zz.x, offY + zz.y, zz.w, zz.h, 3))
            && ruas.every(rr => !rectContem(x, z, offX + rr.x, offY + rr.y, rr.w, rr.h, 3));
          if (!livre) continue;
          const rocha = new THREE.Mesh(
            new THREE.DodecahedronGeometry(1.4 + rand() * 1.8),
            new THREE.MeshLambertMaterial({ color: 0x64748b })
          );
          rocha.position.set(x, 0.9, z);
          rocha.castShadow = true;
          rocha.rotation.set(rand() * 3, rand() * 3, rand() * 3);
          terrainGroup.add(rocha);
        }
        // flores dentro das zonas (campo de cor)
        if (zonas.length) {
          for (let fi = 0; fi < (NAT.floresPorZona || 26); fi++) {
            const z = zonas[Math.floor(rand() * zonas.length)];
            const x = offX + z.x + 6 + rand() * (z.w - 12);
            const zz = offY + z.y + 6 + rand() * (z.h - 12);
            const cores = [0xf9a8d4, 0xfde68a, 0xffffff, 0x86efac];
            const flor = new THREE.Mesh(
              new THREE.SphereGeometry(0.8, 6, 6),
              new THREE.MeshLambertMaterial({ color: cores[Math.floor(rand() * cores.length)], emissive: 0x222222 })
            );
            flor.position.set(x, 0.8, zz);
            terrainGroup.add(flor);
          }
        }
        // flores selvagens nos prados livres (prados floridos entre a floresta e as ruas)
        for (let fi = 0; fi < 21; fi++) {
          const x = offX + 8 + rand() * (mapa.chunkLargura - 16);
          const z = offY + 8 + rand() * (mapa.chunkAltura - 16);
          const livre = zonas.every(zz => !rectContem(x, z, offX + zz.x, offY + zz.y, zz.w, zz.h, 2))
            && ruas.every(rr => !rectContem(x, z, offX + rr.x, offY + rr.y, rr.w, rr.h, 2));
          if (!livre) continue;
          const cor = [0xf9a8d4, 0xfde68a, 0xffffff, 0x86efac, 0xfb7185][Math.floor(rand() * 5)];
          const haste = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 2.2, 4),
            new THREE.MeshLambertMaterial({ color: 0x3f7d3a })
          );
          haste.position.set(x, 1.1, z);
          terrainGroup.add(haste);
          const flor = new THREE.Mesh(
            new THREE.SphereGeometry(0.75, 6, 6),
            new THREE.MeshLambertMaterial({ color: cor, emissive: cor.clone().multiplyScalar(0.25) })
          );
          flor.position.set(x, 2.3, z);
          terrainGroup.add(flor);
        }
      });
      /* ---------- v10: Reino de WestDocks — ilha, mar e costa ---------- */
      if (WD) {
        const marY0 = (WD.mar.y0 != null) ? WD.mar.y0 : 330;
        const marY1 = marY0 + ((WD.mar.altura != null) ? WD.mar.altura : 150);
        // Mar de West: água animada com ondas (entra na lista `waters`)
        const marGeo = new THREE.PlaneGeometry(w, marY1 - marY0, 26, 10);
        const mar = new THREE.Mesh(
          marGeo,
          new THREE.MeshLambertMaterial({ color: 0x14507e, transparent: true, opacity: 0.92, emissive: 0x06203f })
        );
        mar.rotation.x = -Math.PI / 2;
        mar.position.set(w / 2, 0.05, (marY0 + marY1) / 2);
        mar.userData.base = marGeo.attributes.position.array.slice();
        terrainGroup.add(mar);
        waters.push(mar);
        // costa da ilha: terra clara entre a ponte e as docas
        const costa = new THREE.Mesh(
          new THREE.PlaneGeometry(w - 640 + 6, marY0 - 40),
          new THREE.MeshLambertMaterial({ color: 0x3d6b35 })
        );
        costa.rotation.x = -Math.PI / 2;
        costa.receiveShadow = true;
        costa.position.set((640 + w) / 2, 0.02, (marY0 - 40) / 2);
        terrainGroup.add(costa);
        // palmeiras ao longo da costa (3 por registo determinístico)
        const randWd = prng(998877);
        for (let pi = 0; pi < 9; pi++) {
          const px = 660 + randWd() * (w - 680);
          const pz = marY0 - 14 - randWd() * 26;
          const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 10, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
          tronco.position.set(px, 5, pz); tronco.rotation.z = (randWd() - 0.5) * 0.3; tronco.castShadow = true;
          terrainGroup.add(tronco);
          for (let f = 0; f < 5; f++) {
            const folha = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5.4, 4), new THREE.MeshLambertMaterial({ color: 0x2d8a4e }));
            folha.position.set(px, 10.4, pz);
            folha.rotation.z = 0.7 + f * (Math.PI * 2 / 5);
            folha.rotation.x = Math.PI / 2.6;
            folha.castShadow = true;
            terrainGroup.add(folha);
          }
        }
        // Ponte do Leste: tabuleiro + pilares (ligação ilha ↔ continente)
        const pb = WD.ponte || { x: 640, y: 120, comprimento: 70 };
        const tab = new THREE.Mesh(new THREE.BoxGeometry(pb.comprimento + 8, 1.6, 14), new THREE.MeshLambertMaterial({ color: 0x7c5230 }));
        tab.position.set(pb.x + pb.comprimento / 2, 1.4, pb.y);
        tab.receiveShadow = true; terrainGroup.add(tab);
        for (let pP = 0; pP <= 2; pP++) {
          const pilar = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 2), new THREE.MeshLambertMaterial({ color: 0x5c3a1e }));
          pilar.position.set(pb.x + pP * (pb.comprimento / 2), 3, pb.y);
          terrainGroup.add(pilar);
        }
        // Cais: estrado de madeira que avança sobre o mar
        const cais = WD.cais;
        const estrado = new THREE.Mesh(new THREE.BoxGeometry(46, 1.4, 16), new THREE.MeshLambertMaterial({ color: 0x8a6a45 }));
        estrado.position.set(cais.x, 1.1, cais.y + 10);
        estrado.receiveShadow = true; terrainGroup.add(estrado);
        for (let st = 0; st < 4; st++) {
          const est = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 6), new THREE.MeshLambertMaterial({ color: 0x5c3a1e }));
          est.position.set(cais.x - 18 + st * 12, 2.6, cais.y + 17);
          terrainGroup.add(est);
        }
      }

      /* ---------- montanhas de fundo: horizonte com neve (v9.3) ---------- */
      /* ---------- aves de ambiente: águias/corujas/papagaios a voar (v9.3) ---------- */
      birds.forEach(b => { envGroup.remove(b); disposeDeep(b); });
      birds.length = 0;
      for (let bi = 0; bi < 8; bi++) {
        const ave = makeBird(rand2, bi);
        envGroup.add(ave);
        birds.push(ave);
      }
      const NM = NAT.montanhas || 3;
      for (let mi = 0; mi < NM; mi++) {
        const mont = NAT.montanha || { raio: 34, altura: 88 };
        const mx = w * (0.15 + (mi / Math.max(1, NM - 1)) * 0.7);
        const mz = mi % 2 === 0 ? -70 : h + 70;
        const escala = 0.85 + ((mi * 7919) % 30) / 100;
        const montanha = new THREE.Mesh(
          new THREE.ConeGeometry(mont.raio * escala, mont.altura * escala, 6),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(mont.cor || '#5b6472') })
        );
        montanha.position.set(mx, (mont.altura * escala) / 2, mz);
        montanha.castShadow = true;
        terrainGroup.add(montanha);
        const neve = new THREE.Mesh(
          new THREE.ConeGeometry(mont.raio * escala * 0.34, mont.altura * escala * 0.34, 6),
          new THREE.MeshLambertMaterial({ color: new THREE.Color(mont.neve || '#f8fafc') })
        );
        neve.position.set(mx, mont.altura * escala * 0.835, mz);
        terrainGroup.add(neve);
      }
      /* ---------- construções com arquitetura por setor ---------- */
      const addEmoji = (emojiChar, x, y, z, tam = 18) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emojiChar), depthTest: false, transparent: true }));
        sprite.scale.set(tam, tam, 1);
        sprite.position.set(x, y, z);
        sprite.renderOrder = 9;
        terrainGroup.add(sprite);
      };
      // mercado: barracas de feira com toldos às riscas + caixas de produits (estilo praça)
      function buildMercado(bx, bz, def) {
        const madeira = new THREE.MeshLambertMaterial({ color: '#8b5a2b' });
        const toldos = [['#c0392b', '#f8fafc'], ['#7c3aed', '#f8fafc'], ['#2563eb', '#f8fafc'], ['#ea580c', '#f8fafc']];
        const frutas = [0xef4444, 0x84cc16, 0xf97316, 0xeab308];
        for (let s = 0; s < 4; s++) {
          const sx = bx - 21 + (s % 2) * 42;
          const sz = bz - 12 + Math.floor(s / 2) * 26;
          // mesa de feira
          const mesa = new THREE.Mesh(new THREE.BoxGeometry(16, 5, 9), madeira);
          mesa.position.set(sx, 4.5, sz); mesa.castShadow = true; terrainGroup.add(mesa);
          // pernas
          for (const px of [-7, 7]) for (const pz of [-3.5, 3.5]) {
            const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.5, 6), madeira);
            perna.position.set(sx + px, 2.2, sz + pz); terrainGroup.add(perna);
          }
          // produtos coloridos na mesa
          for (let p = 0; p < 5; p++) {
            const fruta = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshLambertMaterial({ color: frutas[(s + p) % frutas.length] }));
            fruta.position.set(sx - 5 + p * 2.5, 8.2, sz + ((p % 2) - 0.5) * 3); terrainGroup.add(fruta);
          }
          // toldo às riscas (postes + faixas alternadas)
          const [corA, corB] = toldos[s % toldos.length];
          for (const px of [-7.5, 7.5]) for (const pz of [-4, 4]) {
            const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 12, 6), madeira);
            poste.position.set(sx + px, 6, sz + pz); terrainGroup.add(poste);
          }
          for (let st = 0; st < 6; st++) {
            const risca = new THREE.Mesh(
              new THREE.BoxGeometry(2.7, 0.5, 10.5),
              new THREE.MeshLambertMaterial({ color: st % 2 ? corB : corA })
            );
            risca.position.set(sx - 6.75 + st * 2.7, 12.3, sz); risca.castShadow = true; terrainGroup.add(risca);
          }
        }
        addEmoji(def.emoji, bx, 24, bz, 16);
      }
      // banco: edifício clássico polido — degraus, colunas, frontão triangular e letreiro dourado
      function buildBanco(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#e8e2d4' });
        const colunaMat = new THREE.MeshLambertMaterial({ color: '#f5f1e6' });
        const ouro = new THREE.MeshPhongMaterial({ color: '#fbbf24', shininess: 90, specular: '#ffe9a8' });
        // degraus de entrada
        for (let d = 0; d < 2; d++) {
          const degrau = new THREE.Mesh(new THREE.BoxGeometry(38 - d * 4, 1.6, 28 - d * 4), pedra);
          degrau.position.set(bx, 0.8 + d * 1.6, bz); terrainGroup.add(degrau);
        }
        // corpo do edifício
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(32, 20, 22), pedra);
        corpo.position.set(bx, 12, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        // colunata frontal (5 colunas)
        for (let cIdx = 0; cIdx < 5; cIdx++) {
          const col = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.2, 17, 12), colunaMat);
          col.position.set(bx - 12 + cIdx * 6, 11, bz + 13); col.castShadow = true; terrainGroup.add(col);
          const capitel = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1, 4.6), colunaMat);
          capitel.position.set(bx - 12 + cIdx * 6, 19.8, bz + 13); terrainGroup.add(capitel);
        }
        // frontão triangular (prisma de 3 lados)
        const frontao = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 33, 3, 1), pedra);
        frontao.rotation.z = Math.PI / 2; frontao.rotation.y = 0;
        frontao.position.set(bx, 25.5, bz); frontao.scale.set(1, 1, 0.62); frontao.castShadow = true;
        terrainGroup.add(frontao);
        // letreiro dourado sobre as colunas
        const letreiro = new THREE.Mesh(new THREE.BoxGeometry(24, 2.2, 1), ouro);
        letreiro.position.set(bx, 21.5, bz + 12.5); terrainGroup.add(letreiro);
        // porta de vidro
        const porta = new THREE.Mesh(new THREE.BoxGeometry(6, 9, 0.8), new THREE.MeshPhongMaterial({ color: '#1e3a5f', shininess: 70, specular: '#6688aa' }));
        porta.position.set(bx, 6.5, bz + 11.4); terrainGroup.add(porta);
        addEmoji(def.emoji, bx, 34, bz, 16);
      }
      // hospital: bloco branco com cruz vermelha e telhado plano
      function buildHospital(bx, bz, def) {
        const branco = new THREE.MeshLambertMaterial({ color: '#f8fafc' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(28, 22, 24), branco);
        corpo.position.set(bx, 11, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        const cruzMat = new THREE.MeshLambertMaterial({ color: '#dc2626', emissive: '#dc2626', emissiveIntensity: 0.25 });
        const cruzV = new THREE.Mesh(new THREE.BoxGeometry(4, 10, 1), cruzMat);
        cruzV.position.set(bx, 14, bz + 12.4); terrainGroup.add(cruzV);
        const cruzH = new THREE.Mesh(new THREE.BoxGeometry(10, 4, 1), cruzMat);
        cruzH.position.set(bx, 14, bz + 12.4); terrainGroup.add(cruzH);
        addEmoji(def.emoji, bx, 30, bz, 16);
      }
      // escola: casarão acolhedor com telhado de duas águas, sino e pátio de recreio
      function buildEscola(bx, bz, def) {
        const parede = new THREE.MeshLambertMaterial({ color: '#f5e0c3' });
        const tinta = new THREE.MeshLambertMaterial({ color: '#d97706' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 20), parede);
        corpo.position.set(bx, 8, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        // telhado de duas águas (prisma rodado 90°)
        const telhado = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 14.6, 30, 3), new THREE.MeshLambertMaterial({ color: '#b45309' }));
        telhado.rotation.z = Math.PI / 2; telhado.scale.set(1, 1, 0.72);
        telhado.position.set(bx, 19.5, bz); telhado.castShadow = true; terrainGroup.add(telhado);
        // torre sineira
        const torre = new THREE.Mesh(new THREE.BoxGeometry(4.6, 12, 4.6), parede);
        torre.position.set(bx - 17, 10, bz); terrainGroup.add(torre);
        const capTorre = new THREE.Mesh(new THREE.ConeGeometry(4, 4.6, 4), tinta);
        capTorre.position.set(bx - 17, 18.4, bz); capTorre.rotation.y = Math.PI / 4; terrainGroup.add(capTorre);
        const sino = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), new THREE.MeshLambertMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.4 }));
        sino.position.set(bx - 17, 15.6, bz + 2.6); terrainGroup.add(sino);
        // porta e janelas altas
        const porta = new THREE.Mesh(new THREE.BoxGeometry(5, 8, 0.8), new THREE.MeshLambertMaterial({ color: '#7c2d12' }));
        porta.position.set(bx, 4, bz + 10.2); terrainGroup.add(porta);
        for (const jx of [-8, 8]) {
          const janela = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.4, 0.8), new THREE.MeshLambertMaterial({ color: '#7dd3fc', emissive: '#0ea5e9', emissiveIntensity: 0.18 }));
          janela.position.set(bx + jx, 9, bz + 10.2); terrainGroup.add(janela);
        }
        // pátio de recreio: baloiço simples + flores
        for (const px of [-6, 2]) {
          const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 7, 6), tinta);
          poste.position.set(bx + 19, 3.5, bz + 6 + px); terrainGroup.add(poste);
        }
        const travessa = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 8.6, 6), tinta);
        travessa.rotation.x = Math.PI / 2; travessa.position.set(bx + 19, 7, bz + 8); terrainGroup.add(travessa);
        for (const bx2 of [-2.4, 2.4]) {
          const bancoPatio = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 0.5), new THREE.MeshLambertMaterial({ color: '#334155' }));
          bancoPatio.position.set(bx + 19 + bx2, 5.2, bz + 8); terrainGroup.add(bancoPatio);
        }
        addEmoji(def.emoji, bx, 30, bz, 16);
      }
      // universidade: campus monumental em H — dois pavilhões ligados por arco central
      function buildUniversidade(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#e2d9c8' });
        const teto = new THREE.MeshLambertMaterial({ color: '#6d28d9' });
        // dois pavilhões
        for (const dx of [-16, 16]) {
          const pav = new THREE.Mesh(new THREE.BoxGeometry(14, 22, 20), pedra);
          pav.position.set(bx + dx, 11, bz); pav.castShadow = true; terrainGroup.add(pav);
          const telhU = new THREE.Mesh(new THREE.BoxGeometry(15.4, 1.4, 21.4), teto);
          telhU.position.set(bx + dx, 22.6, bz); terrainGroup.add(telhU);
        }
        // arco central de ligação
        const ponte = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 12), pedra);
        ponte.position.set(bx, 16, bz); ponte.castShadow = true; terrainGroup.add(ponte);
        for (const sx of [-6, 6]) {
          const pilar = new THREE.Mesh(new THREE.BoxGeometry(3, 26, 12), pedra);
          pilar.position.set(bx + sx, 13, bz); terrainGroup.add(pilar);
        }
        // torre do relógio no arco
        const torreR = new THREE.Mesh(new THREE.BoxGeometry(5, 10, 5), pedra);
        torreR.position.set(bx, 27, bz); terrainGroup.add(torreR);
        const relogio = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.7, 14), new THREE.MeshLambertMaterial({ color: '#fde68a', emissive: '#f59e0b', emissiveIntensity: 0.35 }));
        relogio.rotation.x = Math.PI / 2; relogio.position.set(bx, 29.6, bz + 2.7); terrainGroup.add(relogio);
        const capR = new THREE.Mesh(new THREE.ConeGeometry(4, 5, 8), teto);
        capR.position.set(bx, 34.6, bz); capR.castShadow = true; terrainGroup.add(capR);
        // escadaria
        for (let d = 0; d < 2; d++) {
          const degrau = new THREE.Mesh(new THREE.BoxGeometry(30 - d * 5, 1.4, 10 - d * 2.4), pedra);
          degrau.position.set(bx, 0.7 + d * 1.4, bz + 16.4 - d * 1.2); terrainGroup.add(degrau);
        }
        addEmoji(def.emoji, bx, 44, bz, 16);
      }
      // biblioteca: livraria antiga de pedra com estantes visíveis e lanternas
      function buildBiblioteca(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#8b7355' });
        const madeira = new THREE.MeshLambertMaterial({ color: '#5c3a1e' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(26, 18, 22), pedra);
        corpo.position.set(bx, 9, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        // estantes de livros salientes na fachada (lombadas coloridas)
        const lombadas = [0xef4444, 0x3b82f6, 0x22c55e, 0xf59e0b, 0xa855f7];
        for (let pr = 0; pr < 5; pr++) {
          for (let est = 0; est < 4; est++) {
            const livro = new THREE.Mesh(new THREE.BoxGeometry(1.7, 3.6, 0.9), new THREE.MeshLambertMaterial({ color: lombadas[(pr + est) % lombadas.length] }));
            livro.position.set(bx - 8 + est * 5.3, 3.5 + pr * 3.7, bz + 11.2); terrainGroup.add(livro);
          }
        }
        // janelas em arco altas (vidro emissivo)
        for (const jx of [-7, 7]) {
          const arco = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.8, 12, 1, false, 0, Math.PI), new THREE.MeshLambertMaterial({ color: '#fde68a', emissive: '#f59e0b', emissiveIntensity: 0.3 }));
          arco.rotation.y = Math.PI / 2; arco.position.set(bx + jx, 12.5, bz + 11.1); terrainGroup.add(arco);
          const vidro = new THREE.Mesh(new THREE.BoxGeometry(3.6, 6.4, 0.7), new THREE.MeshLambertMaterial({ color: '#cfe8ff', emissive: '#7dd3fc', emissiveIntensity: 0.25 }));
          vidro.position.set(bx + jx, 9.5, bz + 11.1); terrainGroup.add(vidro);
        }
        // telhado de xisto
        const telhB = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 16.6, 28, 3), new THREE.MeshLambertMaterial({ color: '#3f3f46' }));
        telhB.rotation.z = Math.PI / 2; telhB.scale.set(1, 1, 0.66);
        telhB.position.set(bx, 21.8, bz); telhB.castShadow = true; terrainGroup.add(telhB);
        // duas lanternas de entrada
        for (const lx of [-9.5, 9.5]) {
          const lanterna = new THREE.Mesh(new THREE.OctahedronGeometry(1.3), new THREE.MeshLambertMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.7 }));
          lanterna.position.set(bx + lx, 6.5, bz + 12); terrainGroup.add(lanterna);
        }
        addEmoji(def.emoji, bx, 32, bz, 16);
      }
      // academia: torres de investigação roxas com anéis de energia em rotação
      function buildAcademia(bx, bz, def) {
        const torreMat = new THREE.MeshLambertMaterial({ color: '#4c1d95' });
        const vidroMat = new THREE.MeshPhongMaterial({ color: '#a78bfa', shininess: 80, specular: '#ddd6fe', emissive: '#7c3aed', emissiveIntensity: 0.3 });
        for (let t = 0; t < 3; t++) {
          const tx = bx - 13 + t * 13;
          const altT = 20 + (t % 2) * 7;
          const torre = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.4, altT, 8), torreMat);
          torre.position.set(tx, altT / 2, bz); torre.castShadow = true; terrainGroup.add(torre);
          const cupula = new THREE.Mesh(new THREE.SphereGeometry(3.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), vidroMat);
          cupula.position.set(tx, altT, bz); terrainGroup.add(cupula);
          // anel de energia em volta da torre (roda no frame loop)
          const anel = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.55, 8, 26), vidroMat);
          anel.rotation.x = Math.PI / 2;
          anel.position.set(tx, 6 + t * 4, bz);
          anel.userData.kind = 'anel-academia';
          terrainGroup.add(anel);
        }
        addEmoji(def.emoji, bx, 36, bz, 16);
      }
      // fábrica: galpão industrial com chaminé a fumegar e roda de engrenagem
      function buildFabrica(bx, bz, def) {
        const zinco = new THREE.MeshLambertMaterial({ color: '#946b3d' });
        const tijolo = new THREE.MeshLambertMaterial({ color: '#8c3d2e' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 20), zinco);
        corpo.position.set(bx, 7, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        // dente de serra no telhado (skylights industriais)
        for (let s = 0; s < 3; s++) {
          const dente = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 6.4, 12, 3), new THREE.MeshLambertMaterial({ color: '#7c5230' }));
          dente.rotation.z = Math.PI / 2; dente.scale.set(1, 1, 0.5);
          dente.position.set(bx - 10 + s * 10, 15.6, bz - 2); dente.castShadow = true; terrainGroup.add(dente);
        }
        // chaminé alta com faixa vermelha
        const chamine = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 2.6, 26, 10), tijolo);
        chamine.position.set(bx + 17, 13, bz - 6); chamine.castShadow = true; terrainGroup.add(chamine);
        const faixa = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 3, 10), new THREE.MeshLambertMaterial({ color: '#dc2626' }));
        faixa.position.set(bx + 17, 23, bz - 6); terrainGroup.add(faixa);
        // fumo (esferas translúcidas — animadas no frame loop)
        for (let f = 0; f < 4; f++) {
          const fumo = new THREE.Mesh(new THREE.SphereGeometry(1.7 + f * 0.35, 8, 6), new THREE.MeshLambertMaterial({ color: '#cbd5e1', transparent: true, opacity: 0.4 - f * 0.07 }));
          fumo.position.set(bx + 17, 27 + f * 2.6, bz - 6);
          fumo.userData.kind = 'fumo-fabrica'; fumo.userData.fase = f;
          terrainGroup.add(fumo);
        }
        // engrenagem decorativa na fachada
        const engrenagem = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.8, 8, 16), new THREE.MeshLambertMaterial({ color: '#334155' }));
        engrenagem.position.set(bx, 6, bz + 10.2);
        engrenagem.userData.kind = 'engrenagem-fabrica';
        terrainGroup.add(engrenagem);
        addEmoji(def.emoji, bx, 34, bz, 16);
      }
      // tribunal: templo neoclássico com a BALANÇA DA JUSTIÇA no frontão (v9.1)
      function buildTribunal(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#cbd5e1' });
        const pedraEscura = new THREE.MeshLambertMaterial({ color: '#64748b' });
        const ouroMat = new THREE.MeshLambertMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.35 });
        // corpo do templo + escadaria frontal
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(34, 14, 22), pedra);
        corpo.position.set(bx, 7, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        for (let esc = 0; esc < 3; esc++) {
          const degrau = new THREE.Mesh(new THREE.BoxGeometry(30 - esc * 3, 1.2, 4), pedraEscura);
          degrau.position.set(bx, 0.6 + esc * 1.2, bz + 13 - esc * 1.6); terrainGroup.add(degrau);
        }
        // colunas dóricas
        for (let col = 0; col < 5; col++) {
          const cx = bx - 14 + col * 7;
          const coluna = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, 16, 10), pedra);
          coluna.position.set(cx, 8, bz + 11); coluna.castShadow = true; terrainGroup.add(coluna);
          const capitel = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 4), pedraEscura);
          capitel.position.set(cx, 16.6, bz + 11); terrainGroup.add(capitel);
        }
        // frontão triangular
        const frontao = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 20, 8, 3), pedra);
        frontao.rotation.z = Math.PI / 2; frontao.scale.set(0.5, 1, 1);
        frontao.position.set(bx, 19.5, bz + 10); frontao.castShadow = true; terrainGroup.add(frontao);
        // === BALANÇA DA JUSTIÇA (animada no frame loop) ===
        const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.9, 9, 8), pedraEscura);
        poste.position.set(bx, 24, bz + 10); terrainGroup.add(poste);
        const travessa = new THREE.Mesh(new THREE.BoxGeometry(13, 0.7, 0.7), ouroMat);
        travessa.position.set(bx, 28, bz + 10);
        travessa.userData.kind = 'balanca-justica'; // oscila no frame loop
        terrainGroup.add(travessa);
        for (const sx of [-5.5, 5.5]) {
          const corda = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.2, 5), ouroMat);
          corda.position.set(bx + sx, 26.4, bz + 10); terrainGroup.add(corda);
          const prato = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 0.8, 12), ouroMat);
          prato.position.set(bx + sx, 24.6, bz + 10);
          prato.userData.kind = 'prato-justica'; prato.userData.lado = Math.sign(sx);
          terrainGroup.add(prato);
        }
        addEmoji(def.emoji, bx, 36, bz, 16);
      }
      // praça das missões: quest board físico com pergaminhos e "!" pulsante (v9.1)
      function buildPracaMissoes(bx, bz, def) {
        const madeira = new THREE.MeshLambertMaterial({ color: '#8a5a33' });
        const madeiraEscura = new THREE.MeshLambertMaterial({ color: '#5f3d1e' });
        // estrado circular de pedra
        const estrado = new THREE.Mesh(new THREE.CylinderGeometry(13, 14, 1.4, 20), new THREE.MeshLambertMaterial({ color: '#94a3b8' }));
        estrado.position.set(bx, 0.7, bz); terrainGroup.add(estrado);
        // estrutura do quadro: duas pernas + tábua grande
        for (const sx of [-6, 6]) {
          const perna = new THREE.Mesh(new THREE.BoxGeometry(1.6, 12, 1.6), madeiraEscura);
          perna.position.set(bx + sx, 6, bz); perna.castShadow = true; terrainGroup.add(perna);
        }
        const tabua = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 1.4), madeira);
        tabua.position.set(bx, 12.5, bz); tabua.castShadow = true; terrainGroup.add(tabua);
        const teto = new THREE.Mesh(new THREE.BoxGeometry(22, 1, 4), madeiraEscura);
        teto.position.set(bx, 18.2, bz); terrainGroup.add(teto);
        // pergaminhos pregados no quadro (mini-planos claros)
        for (let pg = 0; pg < 3; pg++) {
          const perg = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4.4, 0.5), new THREE.MeshLambertMaterial({ color: '#f1e4c3' }));
          perg.position.set(bx - 5.5 + pg * 5.5, 12.5 + (pg % 2) * 1.4, bz + 0.9);
          perg.rotation.z = (pg - 1) * 0.09; terrainGroup.add(perg);
        }
        // "!" dourado que flutua e pulsa (assinatura RPG de missão disponível)
        const exclama = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), new THREE.MeshLambertMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.8 }));
        exclama.position.set(bx, 21, bz);
        exclama.userData.kind = 'quest-exclama';
        terrainGroup.add(exclama);
        const ponto = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshLambertMaterial({ color: '#fbbf24', emissive: '#fbbf24', emissiveIntensity: 0.8 }));
        ponto.position.set(bx, 18.6, bz); terrainGroup.add(ponto);
        // dois postes de pregaminho aos lados (avisos)
        for (const sx of [-10, 10]) {
          const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 9, 7), madeiraEscura);
          poste.position.set(bx + sx, 4.5, bz + 5); terrainGroup.add(poste);
          const perg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 0.4), new THREE.MeshLambertMaterial({ color: '#e7d7ae' }));
          perg.position.set(bx + sx, 7.5, bz + 5); terrainGroup.add(perg);
        }
        addEmoji(def.emoji, bx, 28, bz, 15);
      }
      // v10 — taberna/pub: fachada acolhedora, toldo, letreiro e bancos exteriores
      function buildPub(bx, bz, def) {
        const parede = new THREE.MeshLambertMaterial({ color: '#e8c9a0' });
        const madeira = new THREE.MeshLambertMaterial({ color: '#6b4226' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(22, 12, 16), parede);
        corpo.position.set(bx, 6, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        const telh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 10.2, 24, 3), new THREE.MeshLambertMaterial({ color: '#7c2d12' }));
        telh.rotation.z = Math.PI / 2; telh.scale.set(1, 1, 0.7);
        telh.position.set(bx, 14.6, bz); telh.castShadow = true; terrainGroup.add(telh);
        // toldo às riscas sobre a porta
        for (let st = 0; st < 4; st++) {
          const risca = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 6), new THREE.MeshLambertMaterial({ color: st % 2 ? '#f8fafc' : '#b91c1c' }));
          risca.position.set(bx - 3.6 + st * 2.4, 8.6, bz + 9.6); terrainGroup.add(risca);
        }
        const porta = new THREE.Mesh(new THREE.BoxGeometry(4.5, 6.5, 0.8), madeira);
        porta.position.set(bx, 3.4, bz + 8.1); terrainGroup.add(porta);
        // canecas/potinhos no peitoril
        for (const cx of [-6, 6]) {
          const caneca = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 8), new THREE.MeshLambertMaterial({ color: '#fbbf24' }));
          caneca.position.set(bx + cx, 8.4, bz + 8.2); terrainGroup.add(caneca);
        }
        // bancos exteriores
        for (const bxs of [-7, 7]) {
          const banco = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.6), madeira);
          banco.position.set(bx + bxs, 1.2, bz + 11); terrainGroup.add(banco);
        }
        addEmoji(def.emoji, bx, 21, bz, 14);
      }
      // v10 — loja do porto: montra ampla, toldo ciano, caixotes à porta
      function buildLoja(bx, bz, def) {
        const parede = new THREE.MeshLambertMaterial({ color: '#cbe7ee' });
        const madeira = new THREE.MeshLambertMaterial({ color: '#5c3a1e' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), parede);
        corpo.position.set(bx, 5, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        const telh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 8.6, 20, 3), new THREE.MeshLambertMaterial({ color: '#0e7490' }));
        telh.rotation.z = Math.PI / 2; telh.scale.set(1, 1, 0.72);
        telh.position.set(bx, 11.8, bz); telh.castShadow = true; terrainGroup.add(telh);
        const montra = new THREE.Mesh(new THREE.BoxGeometry(9, 4.4, 0.7), new THREE.MeshLambertMaterial({ color: '#a5f3fc', emissive: '#22d3ee', emissiveIntensity: 0.25 }));
        montra.position.set(bx, 4.4, bz + 7.1); terrainGroup.add(montra);
        const porta = new THREE.Mesh(new THREE.BoxGeometry(3.4, 6, 0.8), madeira);
        porta.position.set(bx + 5.5, 3, bz + 7.1); terrainGroup.add(porta);
        for (const cxs of [-6, -3.4]) {
          const caixote = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), madeira);
          caixote.position.set(bx + cxs, 1, bz + 10); caixote.castShadow = true; terrainGroup.add(caixote);
        }
        addEmoji(def.emoji, bx, 17, bz, 13);
      }
      // v10 — docas reais: armazém de pedra com guindaste e pilhas de contentores
      function buildDocas(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#8f8577' });
        const madeira = new THREE.MeshLambertMaterial({ color: '#5c3a1e' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(26, 13, 18), pedra);
        corpo.position.set(bx, 6.5, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        const telh = new THREE.Mesh(new THREE.BoxGeometry(27.5, 1.2, 19.5), new THREE.MeshLambertMaterial({ color: '#3f3f46' }));
        telh.position.set(bx, 13.6, bz); terrainGroup.add(telh);
        const porta = new THREE.Mesh(new THREE.BoxGeometry(7, 8.5, 0.9), madeira);
        porta.position.set(bx, 4.2, bz + 9.1); terrainGroup.add(porta);
        // guindaste do porto
        const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2, 8, 8), new THREE.MeshLambertMaterial({ color: '#f59e0b' }));
        base.position.set(bx + 17, 4, bz + 2); base.castShadow = true; terrainGroup.add(base);
        const braco = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 13), new THREE.MeshLambertMaterial({ color: '#d97706' }));
        braco.position.set(bx + 17, 8.6, bz - 4); braco.castShadow = true; terrainGroup.add(braco);
        const gancho = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.4, 5), new THREE.MeshLambertMaterial({ color: '#334155' }));
        gancho.position.set(bx + 17, 6.4, bz - 9); terrainGroup.add(gancho);
        // contentores empilhados
        const coresCt = [0x1d4ed8, 0xb91c1c, 0x15803d];
        for (let ct = 0; ct < 3; ct++) {
          const ct1 = new THREE.Mesh(new THREE.BoxGeometry(6, 2.6, 3), new THREE.MeshLambertMaterial({ color: coresCt[ct] }));
          ct1.position.set(bx - 16 + ct * 7.4, 1.3, bz + 12); ct1.castShadow = true; terrainGroup.add(ct1);
          if (ct !== 1) {
            const ct2 = ct1.clone(); ct2.position.y = 3.9; terrainGroup.add(ct2);
          }
        }
        addEmoji(def.emoji, bx, 22, bz, 15);
      }
      // v10 — farol: torre às riscas com luz rotativa (animada no frame loop)
      function buildFarol(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#f1f5f9' });
        const vermelho = new THREE.MeshLambertMaterial({ color: '#dc2626' });
        for (let s = 0; s < 5; s++) {
          const faixa = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - s * 0.42, 3.8 - s * 0.42, 5.6, 12), s % 2 ? vermelho : pedra);
          faixa.position.set(bx, 2.8 + s * 5.6, bz); faixa.castShadow = true; terrainGroup.add(faixa);
        }
        const lanterna = new THREE.Mesh(
          new THREE.CylinderGeometry(2.2, 2.2, 3.4, 10),
          new THREE.MeshLambertMaterial({ color: '#fde68a', emissive: '#fbbf24', emissiveIntensity: 0.9 })
        );
        lanterna.position.set(bx, 30.6, bz);
        lanterna.userData.kind = 'farol-luz'; // roda no frame loop
        terrainGroup.add(lanterna);
        const cupula = new THREE.Mesh(new THREE.SphereGeometry(2.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#1e293b' }));
        cupula.position.set(bx, 32.3, bz); terrainGroup.add(cupula);
        // rochedo base
        const rocha = new THREE.Mesh(new THREE.DodecahedronGeometry(5.4), new THREE.MeshLambertMaterial({ color: '#64748b' }));
        rocha.position.set(bx, 1.2, bz); rocha.castShadow = true; terrainGroup.add(rocha);
        addEmoji(def.emoji, bx, 40, bz, 14);
      }
      // v10 — caserna: forte azul com ameias e bandeira da guarda
      function buildCaserna(bx, bz, def) {
        const pedra = new THREE.MeshLambertMaterial({ color: '#cbd5e1' });
        const azul = new THREE.MeshLambertMaterial({ color: '#1e40af' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(20, 11, 16), pedra);
        corpo.position.set(bx, 5.5, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        const telh = new THREE.Mesh(new THREE.BoxGeometry(21.4, 1.2, 17.4), azul);
        telh.position.set(bx, 11.6, bz); terrainGroup.add(telh);
        // ameias
        for (let am = 0; am < 5; am++) {
          const ameia = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), pedra);
          ameia.position.set(bx - 8 + am * 4, 13.2, bz); terrainGroup.add(ameia);
        }
        // torre com bandeira
        const torre = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.4, 15, 10), azul);
        torre.position.set(bx - 12, 7.5, bz); torre.castShadow = true; terrainGroup.add(torre);
        const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 7, 6), new THREE.MeshLambertMaterial({ color: '#64748b' }));
        mastro.position.set(bx - 12, 18.4, bz); terrainGroup.add(mastro);
        const bandeira = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.4), new THREE.MeshBasicMaterial({ color: '#2563eb', side: THREE.DoubleSide }));
        bandeira.position.set(bx - 9.8, 20.8, bz);
        bandeira.userData.kind = 'bandeira-caserna';
        terrainGroup.add(bandeira);
        const porta = new THREE.Mesh(new THREE.BoxGeometry(4.4, 6.4, 0.8), new THREE.MeshLambertMaterial({ color: '#172554' }));
        porta.position.set(bx, 3.2, bz + 8.1); terrainGroup.add(porta);
        addEmoji(def.emoji, bx, 26, bz, 14);
      }
      // v10 — casa do porto: casinha colorida com varanda
      function buildCasa(bx, bz, def) {
        const tons = ['#fde8d7', '#d7e8fd', '#e8fdd7', '#fdd7e8'];
        const h = Math.abs(Math.round(bx * 13.7 + bz * 7.3));
        const parede = new THREE.MeshLambertMaterial({ color: tons[h % tons.length] });
        const madeira = new THREE.MeshLambertMaterial({ color: '#7c5230' });
        const corpo = new THREE.Mesh(new THREE.BoxGeometry(13, 8.5, 11), parede);
        corpo.position.set(bx, 4.2, bz); corpo.castShadow = true; terrainGroup.add(corpo);
        const telh = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 7.6, 15, 3), new THREE.MeshLambertMaterial({ color: '#b45309' }));
        telh.rotation.z = Math.PI / 2; telh.scale.set(1, 1, 0.66);
        telh.position.set(bx, 10.4, bz); telh.castShadow = true; terrainGroup.add(telh);
        const porta = new THREE.Mesh(new THREE.BoxGeometry(2.6, 4.6, 0.6), madeira);
        porta.position.set(bx, 2.3, bz + 5.6); terrainGroup.add(porta);
        const janela = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.6), new THREE.MeshLambertMaterial({ color: '#fde68a', emissive: '#f59e0b', emissiveIntensity: 0.2 }));
        janela.position.set(bx + 3.8, 5, bz + 5.6); terrainGroup.add(janela);
        addEmoji(def.emoji, bx, 16, bz, 10);
      }
      // fazenda: rancho rural — casa com telhado vermelho, silo, cercas e fardos de feno (v9.3)
      function buildFazenda(bx, bz, def) {
        const parede = new THREE.MeshLambertMaterial({ color: '#fde8d7' });
        const madeira = new THREE.MeshLambertMaterial({ color: '#7c5230' });
        const telhadoVerm = new THREE.MeshLambertMaterial({ color: '#b91c1c' });
        // casa grande
        const casa = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 14), parede);
        casa.position.set(bx - 8, 5, bz); casa.castShadow = true; terrainGroup.add(casa);
        const telhFz = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 8.6, 24, 3), telhadoVerm);
        telhFz.rotation.z = Math.PI / 2; telhFz.scale.set(1, 1, 0.75);
        telhFz.position.set(bx - 8, 12.4, bz); telhFz.castShadow = true; terrainGroup.add(telhFz);
        const portaFz = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.8), madeira);
        portaFz.position.set(bx - 8, 3, bz + 7.2); terrainGroup.add(portaFz);
        // silo de grãos
        const silo = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.4, 16, 12), new THREE.MeshLambertMaterial({ color: '#cbd5e1' }));
        silo.position.set(bx + 10, 8, bz - 6); silo.castShadow = true; terrainGroup.add(silo);
        const cúpula = new THREE.Mesh(new THREE.SphereGeometry(4.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), telhadoVerm);
        cúpula.position.set(bx + 10, 16, bz - 6); terrainGroup.add(cúpula);
        // cercas de madeira à volta do terreiro
        for (let l = 0; l < 2; l++) {
          const cerca = new THREE.Mesh(new THREE.BoxGeometry(l ? 30 : 34, 0.4, 0.4), madeira);
          cerca.position.set(bx + (l ? 2 : 0), 1.6, bz + (l ? 12 : -12)); terrainGroup.add(cerca);
        }
        for (let p = 0; p < 6; p++) {
          const posteFz = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 6), madeira);
          posteFz.position.set(bx - 16 + p * 6.4, 1.1, bz + (p % 2 ? 12 : -12)); terrainGroup.add(posteFz);
        }
        // fardos de feno
        for (const [hx, hz] of [[4, 6], [8, 8], [12, 4]]) {
          const fardo = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 3, 10), new THREE.MeshLambertMaterial({ color: '#d4a437' }));
          fardo.rotation.z = Math.PI / 2; fardo.position.set(bx + hx, 1.6, bz + hz); fardo.castShadow = true;
          terrainGroup.add(fardo);
        }
        addEmoji(def.emoji, bx, 26, bz, 16);
      }
      // restantes: casa com telhado (estilo geral)
      // v10: edifícios de WestDocks têm posição própria (wx/wy); os restantes ficam na grelha
      const buildsWd = mundo.construcoes.filter(c => c.wx != null);
      const buildsBase = mundo.construcoes.filter(c => c.wx == null);
      buildsBase.forEach((c, i) => {
        const def = C.construcoes[c.tipo] || { cor: '#94a3b8', emoji: '🏛️', nome: c.tipo };
        const bx = 44 + (i % 8) * 68;
        const bz = 30 + Math.floor(i / 8) * 90;
        if (c.tipo === 'mercado') { buildMercado(bx, bz, def); return; }
        if (c.tipo === 'banco') { buildBanco(bx, bz, def); return; }
        if (c.tipo === 'hospital') { buildHospital(bx, bz, def); return; }
        if (c.tipo === 'escola') { buildEscola(bx, bz, def); return; }
        if (c.tipo === 'universidade') { buildUniversidade(bx, bz, def); return; }
        if (c.tipo === 'biblioteca') { buildBiblioteca(bx, bz, def); return; }
        if (c.tipo === 'academia') { buildAcademia(bx, bz, def); return; }
        if (c.tipo === 'fabrica') { buildFabrica(bx, bz, def); return; }
        if (c.tipo === 'tribunal') { buildTribunal(bx, bz, def); return; }
        if (c.tipo === 'praca_missoes') { buildPracaMissoes(bx, bz, def); return; }
        if (c.tipo === 'fazenda') { buildFazenda(bx, bz, def); return; }
        const altura = 16 + (i % 3) * 6;
        const corBase = new THREE.Color(def.cor);
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(24, altura, 24),
          new THREE.MeshLambertMaterial({ color: corBase, emissive: corBase.clone().multiplyScalar(0.22) })
        );
        box.position.set(bx, altura / 2, bz);
        box.castShadow = true;
        box.userData = { kind: 'construcao', nome: def.nome, efeito: def.efeito };
        terrainGroup.add(box);
        const telhado = new THREE.Mesh(
          new THREE.ConeGeometry(18.5, 10, 4),
          new THREE.MeshLambertMaterial({ color: corBase.clone().multiplyScalar(0.5) })
        );
        telhado.position.set(bx, altura + 5, bz);
        telhado.rotation.y = Math.PI / 4;
        terrainGroup.add(telhado);
        addEmoji(def.emoji, bx, altura + 16, bz);
      });
      // v10: edifícios do reino de WestDocks nas suas posições na ilha
      buildsWd.forEach(c => {
        const def = C.construcoes[c.tipo] || { cor: '#94a3b8', emoji: '🏛️', nome: c.tipo };
        const bx = c.wx, bz = c.wy;
        if (c.tipo === 'pub') { buildPub(bx, bz, def); return; }
        if (c.tipo === 'loja') { buildLoja(bx, bz, def); return; }
        if (c.tipo === 'docas') { buildDocas(bx, bz, def); return; }
        if (c.tipo === 'farol') { buildFarol(bx, bz, def); return; }
        if (c.tipo === 'caserna') { buildCaserna(bx, bz, def); return; }
        if (c.tipo === 'casa') { buildCasa(bx, bz, def); return; }
        // fallback: caixa com telhado
        const altura = 14;
        const corBase = new THREE.Color(def.cor);
        const box = new THREE.Mesh(new THREE.BoxGeometry(20, altura, 20), new THREE.MeshLambertMaterial({ color: corBase, emissive: corBase.clone().multiplyScalar(0.22) }));
        box.position.set(bx, altura / 2, bz); box.castShadow = true; terrainGroup.add(box);
        addEmoji(def.emoji, bx, altura + 12, bz);
      });
      // luz direcional centrada no mundo (rasante → sombras longas e visíveis)
      dir.position.set(w / 2, 470, h / 2 - 460);
      dir.shadow.camera.left = -Math.max(w, 700);
      dir.shadow.camera.right = Math.max(w, 700);
      dir.shadow.camera.top = Math.max(h, 700);
      dir.shadow.camera.bottom = -Math.max(h, 700);
      dir.shadow.camera.updateProjectionMatrix();
      dir.target.position.set(w / 2, 0, h / 2);

      // ---------- ambiente vivo (uma vez só) ----------
      if (!envBuilt) {
        envBuilt = true;
        // nuvens fofas à deriva
        for (let i = 0; i < 7; i++) {
          const cg = new THREE.Group();
          const matNuvem = new THREE.MeshLambertMaterial({ color: 0xf8fafc, transparent: true, opacity: 0.85 });
          const nBlobs = 3 + Math.floor(rand2() * 3);
          for (let b = 0; b < nBlobs; b++) {
            const blob = new THREE.Mesh(new THREE.SphereGeometry(7 + rand2() * 6, 8, 6), matNuvem);
            blob.scale.y = 0.55;
            blob.position.set(b * 9 - nBlobs * 4 + rand2() * 4, rand2() * 3, rand2() * 6 - 3);
            cg.add(blob);
          }
          cg.position.set(rand2() * (w + 400) - 200, 120 + rand2() * 70, rand2() * (h + 200) - 100);
          envGroup.add(cg);
          clouds.push({ g: cg, speed: 2 + rand2() * 4 });
        }
        // estrelas (domo)
        const starGeo = new THREE.BufferGeometry();
        const starPos = new Float32Array(260 * 3);
        for (let i = 0; i < 260; i++) {
          const a = rand2() * Math.PI * 2;
          const el = 0.15 + rand2() * 1.35; // elevação
          const r = 1400;
          starPos[i * 3] = w / 2 + Math.cos(a) * Math.cos(el) * r;
          starPos[i * 3 + 1] = Math.sin(el) * r;
          starPos[i * 3 + 2] = h / 2 + Math.sin(a) * Math.cos(el) * r;
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
        stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
          color: 0xe2e8f0, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false,
        }));
        envGroup.add(stars);
        // vagalumes
        const ffGeo = new THREE.BufferGeometry();
        const ffPos = new Float32Array(70 * 3);
        for (let i = 0; i < 70; i++) {
          ffPos[i * 3] = rand2() * w;
          ffPos[i * 3 + 1] = 4 + rand2() * 11;
          ffPos[i * 3 + 2] = rand2() * h;
        }
        ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
        fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({
          color: 0xfde68a, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0,
          blending: THREE.AdditiveBlending, depthWrite: false,
        }));
        envGroup.add(fireflies);
      }
    }
    const rand2 = prng(424242); // seed fixa para nuvens/estrelas/vagalumes

    // ----- interação -----
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let pointer = null;
    let lastTapT = 0;

    function pick(clientX, clientY) {
      const rect = renderer.domElement.getBoundingClientRect();
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const seres = raycaster.intersectObjects([...agentsGroup.children, ...npcGroup.children, ...faunaGroup.children], true);
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
      const agora = performance.now();
      const duplo = agora - lastTapT < 320; // duplo-toque = correr
      lastTapT = agora;
      pointer = { x: ev.clientX, y: ev.clientY, tx: target.x, tz: target.y, moved: false, correr: duplo, orbita: ev.button === 2 || ev.shiftKey };
      renderer.domElement.setPointerCapture?.(ev.pointerId);
    };
    const onMove = (ev) => {
      if (!pointer) return;
      const dx = ev.clientX - pointer.x;
      const dy = ev.clientY - pointer.y;
      if (!pointer.moved && Math.hypot(dx, dy) < 5) return;
      pointer.moved = true;
      if (pointer.orbita) {
        // botão direito / Shift+arrastar = orbitar a câmara (rodar + inclinar)
        yaw -= dx * 0.005;
        elev = Math.min(Math.max(elev + dy * 0.004, 0.32), 1.5);
        return;
      }
      // pan no plano do terreno, corrigido pelo ângulo da câmara (yaw + inclinação)
      const w = mount.clientWidth, h = mount.clientHeight;
      const dist = CAM_BASE / zoom;
      const tanF = Math.tan((FOV * Math.PI / 180) / 2);
      const wpX = (2 * tanF * dist * (w / h)) / w;
      const wpYf = (2 * tanF * dist) / h / Math.sin(elev); // foreshortening da vista inclinada
      const rightX = Math.cos(yaw), rightZ = -Math.sin(yaw);
      const awayX = -Math.sin(yaw), awayZ = -Math.cos(yaw);
      const { dim: D } = cbRef.current;
      const nx = pointer.tx - dx * wpX * rightX - dy * wpYf * awayX;
      const nz = pointer.tz - dx * wpX * rightZ - dy * wpYf * awayZ;
      target.x = Math.min(Math.max(nx, 0), D.w);
      target.y = Math.min(Math.max(nz, 0), D.h);
    };
    const onUp = (ev) => {
      if (pointer && !pointer.moved) {
        const hit = pick(ev.clientX, ev.clientY);
        const cb = cbRef.current;
        if (hit) {
          if (hit.kind === 'agente' || hit.kind === 'jogador') cb.onSelecionar(hit.id);
          else if (hit.kind === 'fauna') cb.onFauna(hit.id);
          else if (hit.kind === 'terreno') cb.onMover(hit.x, hit.y, pointer.correr);
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
    const orbitar = (dyaw, delev) => {
      yaw += dyaw;
      elev = Math.min(Math.max(elev + delev, 0.32), 1.5);
    };
    const cicloTilt = () => {
      const graus = Math.round((elev * 180) / Math.PI);
      const idx = TILT_PRESETS.findIndex(g => Math.abs(g - graus) < 3);
      const prox = TILT_PRESETS[(idx + 1) % TILT_PRESETS.length];
      elev = (prox * Math.PI) / 180;
      return prox;
    };
    threeRef.current = { zoomPor, orbitar, cicloTilt };

    const dom = renderer.domElement;
    const noCtx = (e) => e.preventDefault(); // botão direito = órbita, não menu
    dom.addEventListener('pointerdown', onDown);
    dom.addEventListener('pointermove', onMove);
    dom.addEventListener('pointerup', onUp);
    dom.addEventListener('pointerleave', () => { pointer = null; });
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', noCtx);

    const ro = new ResizeObserver(() => updateFrustum());
    ro.observe(mount);
    updateFrustum();

    // ----- loop -----
    let raf = 0;
    let t0 = performance.now();
    let lastNow = t0;
    const DAY_T = 180; // segundos por dia completo
    const _sky = new THREE.Color();
    const _amb = new THREE.Color();
    const _dir = new THREE.Color();
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const t = (now - t0) / 1000;
      const dt = Math.min(0.1, (now - lastNow) / 1000);
      lastNow = now;
      const cb = cbRef.current;
      const mundo = cb.m;
      if (mundo !== lastM) {
        lastM = mundo;
        lastChunks = -1; // força rebuild
        agentsMap.forEach(g => { disposeDeep(g); agentsGroup.remove(g); });
        agentsMap.clear();
        boatMap.forEach(g => { disposeDeep(g); terrainGroup.remove(g); });
        boatMap.clear();
        faunaMap.forEach(g => { disposeDeep(g); faunaGroup.remove(g); });
        faunaMap.clear();
        itemsMap.forEach(g => { disposeDeep(g); itemsGroup.remove(g); });
        itemsMap.clear();
      }
      if (mundo.chunks.length !== lastChunks || mundo.construcoes.length !== lastBuilds) {
        lastChunks = mundo.chunks.length;
        lastBuilds = mundo.construcoes.length;
        rebuildTerrain();
      }

      /* ----- ciclo dia/noite ----- */
      const ang = (t / DAY_T) * Math.PI * 2;
      const s = Math.sin(ang);
      const dayF = THREE.MathUtils.smoothstep(s, -0.12, 0.3);
      const nightF = 1 - dayF;
      const duskF = Math.exp(-Math.pow(s / 0.2, 2)); // pico no horizonte
      _sky.copy(COR_NIGHT_SKY).lerp(COR_DAY_SKY, dayF).lerp(COR_DUSK_SKY, duskF * 0.5);
      renderer.setClearColor(_sky, 1);
      scene.fog.color.copy(_sky);
      _amb.set(0x8ea2ff).lerp(new THREE.Color(0xffffff), dayF);
      amb.color.copy(_amb);
      amb.intensity = 0.4 + dayF * 0.7;
      _dir.set(0x8ea2ff).lerp(new THREE.Color(0xffffff), dayF).lerp(new THREE.Color(0xffab6b), duskF * 0.5);
      dir.color.copy(_dir);
      dir.intensity = 0.25 + dayF * 0.95;
      if (stars) stars.material.opacity = nightF * 0.9;
      if (fireflies) {
        fireflies.material.opacity = nightF * (0.55 + 0.35 * Math.sin(t * 2.2));
        fireflies.position.y = Math.sin(t * 0.7) * 1.5;
      }
      const lampCor = COR_LAMP_OFF.clone().lerp(COR_LAMP_ON, Math.max(nightF, duskF * 0.6));
      // (vaga-lume sintético usa nightF/duskF mais abaixo no bloco fauna)
      lamps.forEach(mt => mt.color.copy(lampCor));
      // nuvens à deriva
      const { dim: Dd } = cbRef.current;
      // vida nas construções: anéis da academia giram, fumo da fábrica sobe, engrenagem roda
      terrainGroup.children.forEach(ch => {
        const ud = ch.userData || {};
        if (ud.kind === 'anel-academia') ch.rotation.z = t * 0.8 + ch.position.y;
        else if (ud.kind === 'fumo-fabrica') {
          const fase = (t * 0.35 + ud.fase * 0.25) % 1; // 0..1 ciclo de subida
          ch.position.y = 27 + fase * 8;
          ch.material.opacity = 0.4 * (1 - fase);
          ch.scale.setScalar(1 + fase * 1.6);
        }
        else if (ud.kind === 'engrenagem-fabrica') ch.rotation.z = t * 1.2;
        else if (ud.kind === 'balanca-justica') ch.rotation.z = Math.sin(t * 0.9) * 0.18; // oscila devagar
        else if (ud.kind === 'prato-justica') {
          // os pratos sobem/descem em contra-fase, presos à travessa
          const ang = Math.sin(t * 0.9) * 0.18;
          ch.position.y = 24.6 - Math.sin(ang) * ud.lado * 5.5;
          ch.rotation.z = -ang * ud.lado * 0.6;
        }
        else if (ud.kind === 'quest-exclama') {
          ch.position.y = 21 + Math.sin(t * 2.6) * 1.2; // flutua
          ch.material.emissiveIntensity = 0.6 + Math.abs(Math.sin(t * 2.6)) * 0.7; // pulsa
        }
        else if (ud.kind === 'farol-luz') ch.rotation.y = t * 0.9; // v10: luz do farol gira
        else if (ud.kind === 'bandeira-caserna') ch.rotation.y = Math.sin(t * 2.2) * 0.35; // v10: bandeira acena
      });
      clouds.forEach(c => {
        c.g.position.x += c.speed * dt;
        if (c.g.position.x > Dd.w + 240) c.g.position.x = -240;
      });
      // v10: frota do Mar de West — barcos balançam nas ondas e viram para o rumo
      {
        const vivos = new Set();
        (mundo.barcos || []).forEach(b => {
          vivos.add(b.id);
          let g = boatMap.get(b.id);
          if (!g) { g = makeBarco(b); boatMap.set(b.id, g); terrainGroup.add(g); }
          g.position.set(b.x, Math.sin(t * 1.4 + b.fase) * 0.5, b.y);
          g.rotation.y = -b.rumo + Math.PI / 2;
          g.rotation.z = Math.sin(t * 1.1 + b.fase) * 0.06; // rolamento nas ondas
          const vela = g.children.find(ch => ch.userData && ch.userData.kind === 'vela');
          if (vela) vela.rotation.x = Math.sin(t * 2 + b.fase) * 0.08;
        });
        for (const [id, g] of boatMap) {
          if (!vivos.has(id)) { disposeDeep(g); terrainGroup.remove(g); boatMap.delete(id); }
        }
      }
      // aves de ambiente: círculos amplos no céu, asas a bater (v9.3)
      birds.forEach(b => {
        const U = b.userData;
        U.ang += U.speed * dt;
        b.position.set(Dd.w / 2 + Math.cos(U.ang) * U.r, U.h + Math.sin(U.ang * 2.3) * 6, Dd.h / 2 + Math.sin(U.ang) * U.r * 0.72);
        b.rotation.y = -U.ang + Math.PI / 2;
        const bat = Math.sin(t * 8 + U.ang * 3);
        U.wingL.rotation.z = 0.25 + bat * 0.55;
        U.wingR.rotation.z = -0.25 - bat * 0.55;
      });
      // água animada
      waters.forEach(ag => {
        const pos = ag.geometry.attributes.position;
        const base = ag.userData.base;
        for (let i = 0; i < pos.count; i++) {
          const bx = base[i * 3], by = base[i * 3 + 1];
          pos.setZ(i, Math.sin(t * 2 + bx * 0.14 + by * 0.2) * 1.1 + Math.sin(t * 3.1 + by * 0.3) * 0.5);
        }
        pos.needsUpdate = true;
      });

      /* ----- habitantes: interpolar andar + animação ----- */
      const vivos = new Set();
      mundo.agentes.forEach(ag => {
        if (ag.estado === 'morto' && !ag.isCriador) return;
        vivos.add(ag.id);
        let g = agentsMap.get(ag.id);
        if (!g) { g = makeAgente(ag); agentsMap.set(ag.id, g); agentsGroup.add(g); }
        const ud = g.userData;
        ud.tx = ag.x; ud.tz = ag.y;
        const px = g.position.x, pz = g.position.z;
        const dx = ud.tx - px, dz = ud.tz - pz;
        const dist = Math.hypot(dx, dz);
        const k = Math.min(1, dt * 6);
        g.position.x += dx * k;
        g.position.z += dz * k;
        const sel = ag.id === cb.selecionadoId;
        const h = hashId(ag.id);
        const moving = dist > 0.8;
        // virar para a direção do movimento (câmino suave)
        if (moving) {
          const alvoRot = Math.atan2(dx, dz);
          let dr = alvoRot - g.rotation.y;
          dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          g.rotation.y += dr * Math.min(1, dt * 8);
        }
        // ciclo de andar: braços/pernas alternados + bob de corpo
        const A = ud.anim;
        const walkT = t * 9 + h * 0.13;
        const swing = moving ? Math.sin(walkT) * 0.75 : Math.sin(t * 1.8 + h * 0.05) * 0.07;
        A.arms[0].rotation.x = swing;
        A.arms[1].rotation.x = -swing;
        A.legs[0].position.y = 1.8 + Math.max(0, Math.sin(walkT)) * (moving ? 1.0 : 0);
        A.legs[1].position.y = 1.8 + Math.max(0, -Math.sin(walkT)) * (moving ? 1.0 : 0);
        const bob = moving ? Math.abs(Math.sin(walkT)) * 0.9 : Math.sin(t * 2 + h * 0.05) * 0.3;
        g.position.y = bob + (sel ? 2 + Math.sin(t * 3) * 0.6 : 0);
        // poses idle: respiração subtil e olhar curioso quando parado
        const BS = A.bodyScale || { x: 1, y: 1, z: 1 };
        A.body.scale.set(BS.x, BS.y * (1 + Math.sin(t * 2.1 + h * 0.07) * 0.03), BS.z);
        A.head.rotation.y = moving ? 0 : Math.sin(t * 0.55 + h * 0.11) * 0.22;
        A.head.rotation.z = moving ? 0 : Math.sin(t * 0.4 + h * 0.05) * 0.05;
      });
      for (const [id, g] of agentsMap) {
        if (!vivos.has(id)) { disposeDeep(g); agentsGroup.remove(g); agentsMap.delete(id); }
      }

      /* ----- NPCs de ambiente: atravessam o mundo nas suas tarefas ----- */
      const npcVivos = new Set();
      (mundo.npcs || []).forEach(np => {
        npcVivos.add(np.id);
        let g = npcMap.get(np.id);
        if (!g) { g = makeNpc(np); npcMap.set(np.id, g); npcGroup.add(g); }
        const ud = g.userData;
        ud.tx = np.x; ud.tz = np.y;
        const dx = ud.tx - g.position.x, dz = ud.tz - g.position.z;
        const k = Math.min(1, dt * 4);
        g.position.x += dx * k;
        g.position.z += dz * k;
        const h = hashId(np.id);
        const andando = Math.hypot(dx, dz) > 0.6;
        const A = ud.anim;
        if (andando) {
          const alvoRot = Math.atan2(dx, dz);
          let dr = alvoRot - g.rotation.y;
          dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          g.rotation.y += dr * Math.min(1, dt * 6);
        }
        // balanço de caminhada suave; em pausa, olha em volta devagar
        A.body.rotation.z = andando ? Math.sin(t * 5 + h) * 0.06 : 0;
        A.head.rotation.y = andando ? 0 : Math.sin(t * 0.8 + h * 0.3) * 0.5;
        A.pack.rotation.x = andando ? Math.sin(t * 5 + h) * 0.08 : Math.sin(t * 1.2 + h) * 0.03;
        g.position.y = andando ? Math.abs(Math.sin(t * 6 + h)) * 0.7 : 0;
        // v9.3: o cocheiro puxa uma carroça de tração animal atrás de si
        if (np.tipo === 'cocheiro') {
          let carroca = g.userData.carroca;
          if (!carroca) {
            carroca = makeCarroca();
            g.add(carroca);
            g.userData.carroca = carroca;
          }
          carroca.position.set(0, 0.6, -7.5);
          carroca.rotation.z = andando ? Math.sin(t * 6 + h) * 0.05 : 0;
          const rodaF = carroca.userData.rodas || [];
          rodaF.forEach(r => { r.rotation.x = t * 4; });
        }
      });
      for (const [id, g] of npcMap) {
        if (!npcVivos.has(id)) { disposeDeep(g); npcGroup.remove(g); npcMap.delete(id); }
      }

      /* ----- fauna: hop fofo, formas por espécie ----- */
      const bichos = new Set();
      (mundo.fauna || []).forEach(an => {
        bichos.add(an.id);
        let g = faunaMap.get(an.id);
        if (!g) { g = makeFauna(an); faunaMap.set(an.id, g); faunaGroup.add(g); }
        const ud = g.userData;
        ud.tx = an.x; ud.tz = an.y;
        const dx = ud.tx - g.position.x, dz = ud.tz - g.position.z;
        const k = Math.min(1, dt * 5);
        g.position.x += dx * k;
        g.position.z += dz * k;
        const h = hashId(an.id);
        const moving = Math.hypot(dx, dz) > 0.8;
        if (moving) {
          const alvoRot = Math.atan2(dx, dz);
          let dr = alvoRot - g.rotation.y;
          dr = Math.atan2(Math.sin(dr), Math.cos(dr));
          g.rotation.y += dr * Math.min(1, dt * 7);
        }
        const A = ud.anim;
        const forma = ud.forma;
        const hop = moving ? Math.abs(Math.sin(t * 7 + h * 0.11)) * (forma === 'coelho' ? 3.4 : forma === 'borboleta' ? 2.6 : 2.2)
                           : Math.sin(t * 2.2 + h * 0.07) * 0.35;
        g.position.y = hop + (forma === 'borboleta' ? 6 : 0); // borboleta voa
        A.tail.rotation.x = Math.sin(t * 9 + h * 0.05) * (forma === 'tartaruga' ? 0.12 : 0.5); // rabinho
        A.head.rotation.z = Math.sin(t * 1.6 + h * 0.09) * 0.12; // curiosidade
        if (ud.habitat === 'ar') {
          // voo: mergulhos suaves + asas a bater (v9.3)
          const bat = Math.sin(t * (ud.forma === 'coruja' ? 5.5 : 7.5) + h * 0.07);
          g.position.y = 42 + Math.sin(t * 0.5 + h * 0.05) * 10;
          if (A.wingL) A.wingL.rotation.z = 0.35 + bat * 0.75;
          if (A.wingR) A.wingR.rotation.z = -0.35 - bat * 0.75;
          if (A.tail) A.tail.rotation.x = Math.sin(t * 1.2 + h) * 0.28; // leme
        } else if (ud.habitat === 'agua') {
          // peixe: salta em arco quando o engine sinaliza (v9.3)
          const salto = an.saltando || 0;
          g.position.y = salto > 0 ? Math.sin((3 - salto) / 3 * Math.PI) * 7 : 0.4;
          if (A.dorsal) A.dorsal.rotation.x = Math.sin(t * 6 + h) * 0.3;
        } else if (ud.forma === 'vaca' || ud.forma === 'ovelha' || ud.forma === 'cavalo' || ud.forma === 'galo') {
          A.head.rotation.x = moving ? Math.sin(t * 8 + h * 0.11) * 0.1 : 0.35; // pastar
        }
        A.body.scale.y = 0.82 + Math.sin(t * 3 + h * 0.07) * 0.03; // respiração
        if (forma === 'borboleta') {
          // asas a bater + brilho ao anoitecer (vaga-lume sintético)
          const bate = Math.sin(t * 14 + h) * 0.8;
          A.wingL.rotation.y = 0.5 + bate;
          A.wingR.rotation.y = -0.5 - bate;
          A.body.material.emissiveIntensity = 0.35 + Math.max(nightF, duskF * 0.5) * Math.abs(Math.sin(t * 2.4)) * 1.3;
        }
        if (forma === 'ouriço' && an.ferido) {
          A.spikes.rotation.y = t * 0.8; // enrolado em espinhos
        }
      });
      for (const [id, g] of faunaMap) {
        if (!bichos.has(id)) { disposeDeep(g); faunaGroup.remove(g); faunaMap.delete(id); }
      }

      // itens no chão: gemas flutuantes que giram
      const itens = new Set();
      (mundo.itensNoChao || []).forEach(it => {
        itens.add(it.id);
        let g = itemsMap.get(it.id);
        if (!g) { g = makeItem(it); itemsMap.set(it.id, g); itemsGroup.add(g); }
        if (it.itemKey === 'bau_missao') {
          // baú assenta no chão (não flutua); a aura roda e sobe/desce
          g.position.set(it.x, 0, it.y);
          g.rotation.y = t * 0.6;
          const aura = g.children.find(ch => ch.userData && ch.userData.kind === 'aura-bau');
          if (aura) { aura.rotation.z = t * 1.8; aura.position.y = 0.4 + Math.sin(t * 2.4) * 0.3; }
        } else {
          g.position.set(it.x, 2.2 + Math.sin(t * 2.6 + hashId(it.id)) * 0.8, it.y);
          g.rotation.y = t * 1.4;
        }
      });
      for (const [id, g] of itemsMap) {
        if (!itens.has(id)) { disposeDeep(g); itemsGroup.remove(g); itemsMap.delete(id); }
      }
      // anéis de seleção/alvo
      const selAg = mundo.agentes.find(a => a.id === cb.selecionadoId && (a.estado === 'vivo' || a.isCriador));
      if (selAg) { selRing.visible = true; selRing.position.set(selAg.x, 0.3, selAg.y); selRing.rotation.z = t * 1.2; }
      else selRing.visible = false;
      const alvo = (mundo.fauna || []).find(a => a.id === cb.alvoFauna);
      if (alvo) { faunaRing.visible = true; faunaRing.position.set(alvo.x, 0.25, alvo.y); faunaRing.rotation.z = -t; }
      else faunaRing.visible = false;
      // marcador da missão física ativa (aceite e não concluída)
      const misAtiva = (mundo.missoes || []).find(q => q.aceite && !q.concluida && q.alvo);
      if (misAtiva) {
        misRing.visible = true;
        misRing.position.set(misAtiva.alvo.x, 0.5 + Math.sin(t * 2.2) * 0.4, misAtiva.alvo.y);
        misRing.rotation.z = t * 1.6;
        misBeam.visible = true;
        misBeam.position.set(misAtiva.alvo.x, 23, misAtiva.alvo.y);
        misBeam.material.opacity = 0.2 + Math.abs(Math.sin(t * 2.2)) * 0.14;
      } else { misRing.visible = false; misBeam.visible = false; }

      // câmera
      const j = cb.jogador;
      if (j && seguirRef.current) {
        target.x += (j.x - target.x) * 0.08;
        target.y += (j.y - target.y) * 0.08;
      }
      // câmara orbital em perspetiva — o ângulo 3/4 dá profundidade real ao mundo
      const dist = CAM_BASE / zoom;
      const cosE = Math.cos(elev), sinE = Math.sin(elev);
      camera.position.set(
        target.x + Math.sin(yaw) * cosE * dist,
        sinE * dist,
        target.y + Math.cos(yaw) * cosE * dist
      );
      camera.lookAt(target.x, 0, target.y);
      // névoa acompanha a distância → plano de profundidade sempre visível
      scene.fog.near = dist + 260;
      scene.fog.far = dist + 2400;
      hemi.intensity = 0.3 + dayF * 0.4;
      composer.render();
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointermove', onMove);
      dom.removeEventListener('pointerup', onUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', noCtx);
      disposeDeep(scene);
      renderer.dispose();
      composer.dispose?.();
      if (dom.parentNode === mount) mount.removeChild(dom);
      threeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative rounded-2xl border border-slate-800 overflow-hidden"
      style={{ height: 440, touchAction: 'none', background: '#0b1026' }}>
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
          <button onClick={() => { const t = threeRef.current; if (t) { const g = t.cicloTilt(); setTiltNome(g === 38 ? '🎬' : g === 76 ? '⬆' : '3D'); } }}
            className="px-2 py-1 rounded-lg text-[10px] font-bold" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid #334155', color: '#cbd5e1' }}>📐 {tiltNome}</button>
          <button onClick={() => threeRef.current && threeRef.current.orbitar(-0.35, 0)}
            className="px-2 py-1 rounded-lg text-xs font-black" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid #334155', color: '#cbd5e1' }}>⟲</button>
          <button onClick={() => threeRef.current && threeRef.current.orbitar(0.35, 0)}
            className="px-2 py-1 rounded-lg text-xs font-black" style={{ background: 'rgba(15,23,42,.85)', border: '1px solid #334155', color: '#cbd5e1' }}>⟳</button>
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
