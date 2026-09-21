import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ============================================================
   MAPA 3D TOP-DOWN — Three.js (câmera ortográfica inclinada)
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
    // gorra com viseira polida + emblema da patrulha      const gorra = new THREE.Mesh(new THREE.CylinderGeometry(4.55, 4.75, 2.3, 14), new THREE.MeshLambertMaterial({ color: '#1e3a5f' }));
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
    scene.fog = new THREE.Fog(0x0b1026, 1000, 2600);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
    const amb = new THREE.AmbientLight(0xbfd4ff, 1.05);
    const dir = new THREE.DirectionalLight(0xffffff, 1.15);
    dir.position.set(300, 400, -160);
    scene.add(amb, dir);
    dir.castShadow = true;
    dir.shadow.mapSize.set(2048, 2048);
    dir.shadow.camera.near = 50;
    dir.shadow.camera.far = 1400;
    dir.shadow.bias = -0.0005;
    dir.shadow.normalBias = 0.02;
    // pós-processamento: bloom ligeiro (lamps/vagalumes/emojis brilham)
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(800, 420), 0.45, 0.7, 0.82);
    composer.addPass(bloomPass);

    const terrainGroup = new THREE.Group();
    const agentsGroup = new THREE.Group();
    const faunaGroup = new THREE.Group();
    const ringsGroup = new THREE.Group();
    const envGroup = new THREE.Group(); // nuvens, estrelas, vagalumes (uma vez só)
    const itemsGroup = new THREE.Group();
    scene.add(terrainGroup, agentsGroup, faunaGroup, ringsGroup, envGroup, itemsGroup);

    let groundMesh = null;
    let zoom = 1;
    let target = new THREE.Vector2(320, 160);
    let lastM = null;
    let lastChunks = -1;
    let lastBuilds = -1;
    let envBuilt = false;
    const waters = [];      // lagos animados
    const lamps = [];       // postes (acendem à noite)
    const clouds = [];      // nuvens à deriva
    let stars = null;
    let fireflies = null;
    const agentsMap = new Map();
    const faunaMap = new Map();
    const itemsMap = new Map();

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
      // emoji flutuante + etiqueta de nome
      const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(arq.emoji || '👤'), depthTest: false, transparent: true }));
      emoji.scale.set(16, 16, 1);
      emoji.position.y = 30;
      emoji.renderOrder = 9;
      g.add(emoji);
      const nome = labelSprite(ag.nome, arq.cor || '#94a3b8');
      nome.position.y = 38;
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
      const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(an.emoji || '🐾'), depthTest: false, transparent: true }));
      emoji.scale.set(13, 13, 1);
      emoji.position.y = 19;
      emoji.renderOrder = 9;
      g.add(emoji);
      g.userData.anim = { head, tail, body };
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
      const w = D.w, h = D.h;
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
        // árvores fora de zonas/ruas/lagos
        let plantadas = 0;
        for (let tent = 0; tent < 40 && plantadas < 12; tent++) {
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
        // rochas
        for (let ri = 0; ri < 6; ri++) {
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
          for (let fi = 0; fi < 14; fi++) {
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
      });
      // construções: casa com telhado em vez de caixa crua
      mundo.construcoes.forEach((c, i) => {
        const def = C.construcoes[c.tipo] || { cor: '#94a3b8', emoji: '🏛️', nome: c.tipo };
        const altura = 16 + (i % 3) * 6;
        const bx = 44 + (i % 8) * 68;
        const bz = 30;
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
        const emoji = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(def.emoji), depthTest: false, transparent: true }));
        emoji.scale.set(18, 18, 1);
        emoji.position.set(bx, altura + 16, bz);
        emoji.renderOrder = 9;
        terrainGroup.add(emoji);
      });
      // luz direcional centrada no mundo
      dir.position.set(w / 2, 420, h / 2 - 180);
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
      lamps.forEach(mt => mt.color.copy(lampCor));
      // nuvens à deriva
      const { dim: Dd } = cbRef.current;
      clouds.forEach(c => {
        c.g.position.x += c.speed * dt;
        if (c.g.position.x > Dd.w + 240) c.g.position.x = -240;
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

      /* ----- fauna: hop fofo ----- */
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
        const hop = moving ? Math.abs(Math.sin(t * 7 + h * 0.11)) * 2.2 : Math.sin(t * 2.2 + h * 0.07) * 0.35;
        g.position.y = hop;
        A.tail.rotation.x = Math.sin(t * 9 + h * 0.05) * 0.5; // rabinho a abanar
        A.head.rotation.z = Math.sin(t * 1.6 + h * 0.09) * 0.12; // curiosidade
        A.body.scale.y = 0.82 + Math.sin(t * 3 + h * 0.07) * 0.03; // respiração
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
        g.position.set(it.x, 2.2 + Math.sin(t * 2.6 + hashId(it.id)) * 0.8, it.y);
        g.rotation.y = t * 1.4;
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

      // câmera
      const j = cb.jogador;
      if (j && seguirRef.current) {
        target.x += (j.x - target.x) * 0.08;
        target.y += (j.y - target.y) * 0.08;
      }
      camera.position.set(target.x, 400, target.y + 170);
      camera.lookAt(target.x, 0, target.y);
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
