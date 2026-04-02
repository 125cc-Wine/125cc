<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>125cc · Stats</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --wine:#8B0000;--wine2:#a01010;--gold:#C9A84C;
    --dark:#1c1917;--dark2:#242120;--dark3:#2e2b29;
    --card:#2a2320;--border:rgba(255,255,255,.08);
    --text:#e8e0d8;--muted:#9e9087;--sub:#c8bbb0;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--dark);color:var(--text);font-family:'DM Sans',sans-serif;min-height:100vh}

  /* LOGIN */
  #loginScreen{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
  .login-box{background:var(--card);border:.5px solid var(--border);border-radius:20px;padding:40px 32px;width:100%;max-width:340px;text-align:center}
  .login-logo{font-family:'Cormorant Garamond',serif;font-size:52px;color:var(--wine);margin-bottom:4px}
  .login-sub{font-size:11px;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;margin-bottom:32px}
  .login-box input{width:100%;background:var(--dark3);border:.5px solid var(--border);border-radius:12px;padding:14px 16px;color:var(--text);font-size:16px;font-family:'DM Sans',sans-serif;outline:none;text-align:center;letter-spacing:.2em;margin-bottom:14px}
  .login-box input:focus{border-color:var(--wine)}
  .login-btn{width:100%;background:var(--wine);border:none;border-radius:12px;padding:14px;color:#fff;font-size:14px;font-weight:500;font-family:'DM Sans',sans-serif;cursor:pointer;transition:background .15s}
  .login-btn:hover{background:var(--wine2)}
  .login-error{font-size:12px;color:#f87171;margin-top:10px;display:none}

  /* DASHBOARD */
  #dashboard{display:none;padding:0 0 64px}
  .top-bar{background:var(--dark2);border-bottom:.5px solid var(--border);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:50}
  .top-logo{font-family:'Cormorant Garamond',serif;font-size:26px;color:var(--wine)}
  .top-label{font-size:10px;letter-spacing:.2em;color:var(--muted);text-transform:uppercase}
  .logout-btn{font-size:12px;color:var(--muted);cursor:pointer;background:none;border:none;font-family:'DM Sans',sans-serif}
  .logout-btn:hover{color:var(--text)}

  /* TABS NAV */
  .dash-tabs{display:flex;background:var(--dark3);border-bottom:.5px solid var(--border)}
  .dash-tab{flex:1;padding:12px 8px;text-align:center;font-size:11px;font-weight:500;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;transition:all .15s;background:none;border-top:none;border-left:none;border-right:none;font-family:'DM Sans',sans-serif}
  .dash-tab.active{color:var(--text);border-bottom-color:var(--wine)}
  .dash-panel{display:none;padding:20px 16px 0}
  .dash-panel.active{display:block}

  /* SUMMARY */
  .summary-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px}
  .summary-card{background:var(--card);border:.5px solid var(--border);border-radius:14px;padding:16px;text-align:center}
  .summary-val{font-family:'Cormorant Garamond',serif;font-size:36px;color:var(--wine);line-height:1}
  .summary-label{font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin-top:4px}
  .section-title{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:12px}

  /* RANKING */
  .wine-card{background:var(--card);border:.5px solid var(--border);border-radius:14px;padding:16px;margin-bottom:10px;transition:border-color .15s;cursor:pointer}
  .wine-card:hover{border-color:rgba(139,0,0,.4)}
  .wine-card.expanded{border-color:rgba(139,0,0,.5)}
  .wc-top{display:flex;align-items:center;gap:12px}
  .wc-rank{font-family:'Cormorant Garamond',serif;font-size:22px;color:var(--wine);width:28px;flex-shrink:0}
  .wc-info{flex:1;min-width:0}
  .wc-name{font-size:14px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .wc-bodega{font-size:11px;color:var(--muted);margin-top:1px}
  .wc-score{text-align:right;flex-shrink:0}
  .wc-score-val{font-family:'Cormorant Garamond',serif;font-size:28px;color:var(--text);line-height:1}
  .wc-score-max{font-size:11px;color:var(--muted)}
  .wc-count{font-size:10px;color:var(--muted);margin-top:2px}
  .score-bars{margin-top:14px;display:grid;gap:7px}
  .sb-row{display:flex;align-items:center;gap:8px}
  .sb-label{font-size:10px;color:var(--muted);width:52px;flex-shrink:0;text-align:right}
  .sb-bg{flex:1;height:5px;background:var(--dark3);border-radius:3px;overflow:hidden}
  .sb-fill{height:100%;border-radius:3px;transition:width .4s ease}
  .sb-val{font-size:10px;color:var(--sub);width:22px;text-align:right;flex-shrink:0}
  .tipo-badge{display:inline-block;font-size:9px;padding:2px 8px;border-radius:10px;color:#fff;margin-top:4px;letter-spacing:.05em}
  .opiniones-section{margin-top:14px;border-top:.5px solid var(--border);padding-top:12px;display:none}
  .wine-card.expanded .opiniones-section{display:block}
  .opinion-item{background:var(--dark3);border-radius:10px;padding:10px 12px;margin-bottom:8px;font-size:12.5px;color:var(--sub);line-height:1.55;font-style:italic}
  .opinion-fecha{font-size:10px;color:var(--muted);margin-top:4px;font-style:normal}
  .no-opiniones{font-size:12px;color:var(--muted);text-align:center;padding:8px 0}
  .chevron{color:var(--muted);font-size:14px;transition:transform .2s;flex-shrink:0}
  .wine-card.expanded .chevron{transform:rotate(180deg)}
  .loading{text-align:center;padding:48px 0;color:var(--muted);font-size:13px}
  .empty-msg{text-align:center;padding:32px 16px;color:var(--muted);font-size:13px;line-height:1.6}

  /* ══════════════════════════
     EDITOR DE MAPA
  ══════════════════════════ */
  .map-editor-wrap{display:grid;grid-template-columns:1fr 220px;gap:16px;align-items:start}
  @media(max-width:700px){.map-editor-wrap{grid-template-columns:1fr}}

  .map-stage{
    background:linear-gradient(145deg,#F0E8DC,#E8DDD0,#EDE4D8);
    border-radius:16px;aspect-ratio:1/.8;position:relative;
    overflow:hidden;border:1px solid rgba(60,40,20,.1);
    box-shadow:0 4px 20px rgba(0,0,0,.3);
    touch-action:none;
  }
  .map-axis-h{position:absolute;top:50%;left:5%;right:5%;height:.5px;background:rgba(80,55,35,.2);pointer-events:none}
  .map-axis-v{position:absolute;left:50%;top:5%;bottom:5%;width:.5px;background:rgba(80,55,35,.2);pointer-events:none}
  .map-ax-lbl{position:absolute;font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:rgba(80,60,40,.45);pointer-events:none;font-weight:500;font-family:'DM Sans',sans-serif}
  .map-wmark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;letter-spacing:.4em;text-transform:uppercase;color:rgba(100,75,50,.05);font-weight:700;pointer-events:none}

  /* Pin draggable */
  .map-pin{
    position:absolute;transform:translate(-50%,-50%);
    cursor:grab;z-index:5;
    transition:filter .15s;
    user-select:none;-webkit-user-select:none;
  }
  .map-pin:active{cursor:grabbing;z-index:20;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
  .map-pin.selected-pin svg path{stroke:var(--gold);stroke-width:1.5}
  .map-pin-label{
    position:absolute;bottom:calc(100% + 4px);left:50%;transform:translateX(-50%);
    background:rgba(28,25,23,.92);color:var(--text);
    font-size:10px;padding:4px 8px;border-radius:6px;
    white-space:nowrap;pointer-events:none;
    border:1px solid rgba(196,160,90,.2);
    opacity:0;transition:opacity .15s;
  }
  .map-pin:hover .map-pin-label{opacity:1}
  .map-pin.below-mid .map-pin-label{bottom:auto;top:calc(100% + 4px)}

  /* Panel lateral */
  .map-sidebar{display:flex;flex-direction:column;gap:10px}
  .map-info-box{background:var(--card);border:.5px solid var(--border);border-radius:14px;padding:14px}
  .map-info-title{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin-bottom:8px}
  .map-selected-name{font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px;min-height:20px}
  .map-selected-coords{font-size:12px;color:var(--muted);font-family:monospace;margin-bottom:12px;min-height:16px}
  .map-coord-inputs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
  .map-coord-input{background:var(--dark3);border:.5px solid var(--border);border-radius:8px;padding:8px 10px;color:var(--text);font-size:13px;font-family:monospace;outline:none;width:100%;text-align:center}
  .map-coord-input:focus{border-color:var(--wine)}
  .map-coord-label{font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);text-align:center;margin-top:3px}

  .map-save-btn{
    width:100%;background:var(--wine);border:none;border-radius:10px;
    padding:11px;color:#fff;font-size:12px;font-weight:500;
    font-family:'DM Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;
    cursor:pointer;transition:background .15s,opacity .15s;
  }
  .map-save-btn:hover{background:var(--wine2)}
  .map-save-btn:disabled{opacity:.4;cursor:not-allowed}

  .map-save-all-btn{
    width:100%;background:transparent;border:.5px solid var(--gold);border-radius:10px;
    padding:11px;color:var(--gold);font-size:12px;font-weight:500;
    font-family:'DM Sans',sans-serif;letter-spacing:.06em;text-transform:uppercase;
    cursor:pointer;transition:all .15s;margin-top:4px;
  }
  .map-save-all-btn:hover{background:rgba(201,168,76,.1)}

  .map-wine-list{background:var(--card);border:.5px solid var(--border);border-radius:14px;overflow:hidden}
  .map-wine-item{
    padding:10px 14px;cursor:pointer;border-bottom:.5px solid var(--border);
    display:flex;align-items:center;gap:8px;transition:background .1s;
  }
  .map-wine-item:last-child{border-bottom:none}
  .map-wine-item:hover{background:var(--dark3)}
  .map-wine-item.active-item{background:rgba(139,0,0,.15);border-left:2px solid var(--wine)}
  .map-wine-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
  .map-wine-item-name{font-size:12px;color:var(--text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .map-wine-item-num{font-size:10px;color:var(--muted);flex-shrink:0}

  /* Toast */
  .toast{
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(20px);
    background:var(--card);border:.5px solid var(--border);
    color:var(--text);padding:10px 20px;border-radius:20px;
    font-size:13px;opacity:0;transition:all .3s;pointer-events:none;white-space:nowrap;z-index:200;
    box-shadow:0 4px 20px rgba(0,0,0,.4);
  }
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .toast.success{border-color:rgba(100,200,100,.3);color:#90ee90}
  .toast.error{border-color:rgba(200,80,80,.3);color:#f87171}
</style>
</head>
<body>

<div class="toast" id="toast"></div>

<!-- LOGIN -->
<div id="loginScreen">
  <div class="login-box">
    <div class="login-logo">125cc</div>
    <div class="login-sub">Wine Bar · Dashboard</div>
    <input type="password" id="passInput" placeholder="••••••" maxlength="20"
      onkeydown="if(event.key==='Enter') tryLogin()">
    <button class="login-btn" onclick="tryLogin()">Entrar</button>
    <div class="login-error" id="loginError">Contraseña incorrecta</div>
  </div>
</div>

<!-- DASHBOARD -->
<div id="dashboard">
  <div class="top-bar">
    <div>
      <div class="top-logo">125cc</div>
      <div class="top-label">Dashboard</div>
    </div>
    <button class="logout-btn" onclick="logout()">Salir</button>
  </div>

  <!-- TABS -->
  <div class="dash-tabs">
    <button class="dash-tab active" onclick="switchTab('stats')">Estadísticas</button>
    <button class="dash-tab" onclick="switchTab('mapa')">Editor de Mapa</button>
  </div>

  <!-- PANEL STATS -->
  <div class="dash-panel active" id="panel-stats">
    <div class="summary-bar">
      <div class="summary-card"><div class="summary-val" id="statTotal">—</div><div class="summary-label">Degustaciones</div></div>
      <div class="summary-card"><div class="summary-val" id="statVinos">—</div><div class="summary-label">Vinos puntuados</div></div>
      <div class="summary-card"><div class="summary-val" id="statProm">—</div><div class="summary-label">Puntuación prom.</div></div>
    </div>
    <div class="section-title">Ranking por vino</div>
    <div id="rankingList"><div class="loading">Cargando datos...</div></div>
  </div>

  <!-- PANEL EDITOR DE MAPA -->
  <div class="dash-panel" id="panel-mapa">
    <div class="section-title" style="margin-bottom:16px">
      Arrastrá las copitas para reposicionar cada vino en el mapa
    </div>
    <div class="map-editor-wrap">

      <!-- MAPA -->
      <div>
        <div class="map-stage" id="mapStage">
          <div class="map-axis-h"></div>
          <div class="map-axis-v"></div>
          <div class="map-wmark">WINE BAR · 125CC</div>
          <div class="map-ax-lbl" style="top:3%;left:50%;transform:translateX(-50%)">Potente</div>
          <div class="map-ax-lbl" style="bottom:2%;left:50%;transform:translateX(-50%)">Suave</div>
          <div class="map-ax-lbl" style="left:2%;top:48%;transform:translateY(-140%)">Fresco</div>
          <div class="map-ax-lbl" style="right:1%;top:48%;transform:translateY(-140%)">Complejo</div>
          <div id="mapPins"></div>
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--muted);text-align:center;font-weight:300">
          Los ejes van de −100 a +100. Centro = 0,0
        </div>
      </div>

      <!-- SIDEBAR -->
      <div class="map-sidebar">
        <!-- Info vino seleccionado -->
        <div class="map-info-box">
          <div class="map-info-title">Vino seleccionado</div>
          <div class="map-selected-name" id="selName">—</div>
          <div class="map-selected-coords" id="selCoords">x: — · y: —</div>
          <div class="map-coord-inputs">
            <div>
              <input class="map-coord-input" id="inputX" type="number" min="-100" max="100"
                placeholder="X" oninput="updateFromInput()">
              <div class="map-coord-label">← Fresco / Complejo →</div>
            </div>
            <div>
              <input class="map-coord-input" id="inputY" type="number" min="-100" max="100"
                placeholder="Y" oninput="updateFromInput()">
              <div class="map-coord-label">↑ Potente / Suave ↓</div>
            </div>
          </div>
          <button class="map-save-btn" id="saveSingleBtn" onclick="saveSingle()" disabled>
            Guardar este vino
          </button>
        </div>

        <!-- Guardar todos -->
        <button class="map-save-all-btn" onclick="saveAll()">
          ✦ Guardar todos los cambios
        </button>

        <!-- Lista de vinos -->
        <div class="map-info-title" style="margin-top:4px">Vinos en carta</div>
        <div class="map-wine-list" id="mapWineList">
          <div class="loading" style="padding:20px 0">Cargando vinos...</div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const PASS = "125cc2025";
const SESSION_KEY = "125cc_stats_auth";
const TYPE_COLOR = {Tinto:"#8B0000",Blanco:"#7ab83a",Rosado:"#d94060",Naranja:"#d4721a"};
const ATTR_COLOR = {Acidez:"#1a7fd4",Cuerpo:"#c8463a",Taninos:"#b06010",Visual:"#c8a018",Gusto:"#c03070"};

let wines = [];
let selectedWineId = null;
let pendingChanges = {}; // {id: {x, y}}

// ── AUTH ──────────────────────────────────────────────────────────
function tryLogin(){
  const val = document.getElementById('passInput').value;
  if(val === PASS){
    sessionStorage.setItem(SESSION_KEY,'1');
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('dashboard').style.display='block';
    loadStats();
    loadWinesForMap();
  } else {
    document.getElementById('loginError').style.display='block';
    document.getElementById('passInput').value='';
  }
}
function logout(){
  sessionStorage.removeItem(SESSION_KEY);
  document.getElementById('dashboard').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('passInput').value='';
}
if(sessionStorage.getItem(SESSION_KEY)==='1'){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('dashboard').style.display='block';
}

// ── TABS ──────────────────────────────────────────────────────────
function switchTab(tab){
  document.querySelectorAll('.dash-panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.dash-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('panel-'+tab).classList.add('active');
  event.target.classList.add('active');
  if(tab==='mapa' && wines.length===0) loadWinesForMap();
}

// ── STATS ─────────────────────────────────────────────────────────
async function loadStats(){
  try{
    const res = await fetch('/api/stats');
    const data = await res.json();
    if(data.error){
      document.getElementById('rankingList').innerHTML=
        `<div class="empty-msg">Error: ${data.detail||data.error}</div>`;
      return;
    }
    const {total,resumen} = data;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statVinos').textContent = resumen.length;
    const prom = resumen.length
      ? (resumen.reduce((s,v)=>s+v.puntuacion*v.count,0)/total).toFixed(1) : '—';
    document.getElementById('statProm').textContent = prom;
    if(!resumen.length){
      document.getElementById('rankingList').innerHTML=
        `<div class="empty-msg">Todavía no hay degustaciones registradas.</div>`;
      return;
    }
    document.getElementById('rankingList').innerHTML = resumen.map((v,i)=>buildWineCard(v,i+1)).join('');
  }catch(e){
    document.getElementById('rankingList').innerHTML=
      `<div class="empty-msg">No se pudo conectar con el servidor.</div>`;
  }
}

function buildWineCard(v,rank){
  const color = TYPE_COLOR[v.tipo]||'#888';
  const bars = [
    {l:'Acidez',val:v.acidez,color:ATTR_COLOR.Acidez},
    {l:'Cuerpo',val:v.cuerpo,color:ATTR_COLOR.Cuerpo},
    {l:'Taninos',val:v.taninos,color:ATTR_COLOR.Taninos},
    {l:'Visual',val:v.visual,color:ATTR_COLOR.Visual},
    {l:'Gusto',val:v.gusto,color:ATTR_COLOR.Gusto},
  ].map(a=>`<div class="sb-row">
    <div class="sb-label">${a.l}</div>
    <div class="sb-bg"><div class="sb-fill" style="width:${a.val/5*100}%;background:${a.color}"></div></div>
    <div class="sb-val">${a.val}</div>
  </div>`).join('');

  const opinionesHTML = v.opiniones&&v.opiniones.length
    ? v.opiniones.map(o=>`<div class="opinion-item">"${o.texto}"${o.fecha?`<div class="opinion-fecha">${o.fecha}</div>`:''}</div>`).join('')
    : `<div class="no-opiniones">Sin opiniones todavía</div>`;

  return `<div class="wine-card" onclick="toggleCard(this)">
    <div class="wc-top">
      <div class="wc-rank">${rank}</div>
      <div class="wc-info">
        <div class="wc-name">${v.vino}</div>
        <div class="wc-bodega">${v.bodega}</div>
        <div class="tipo-badge" style="background:${color}">${v.tipo}</div>
      </div>
      <div class="wc-score">
        <div class="wc-score-val">${v.puntuacion}</div>
        <div class="wc-score-max">/10</div>
        <div class="wc-count">${v.count} copa${v.count!==1?'s':''}</div>
      </div>
      <div class="chevron">▾</div>
    </div>
    <div class="score-bars">${bars}</div>
    <div class="opiniones-section">
      <div class="section-title" style="margin-bottom:8px">Opiniones de clientes</div>
      ${opinionesHTML}
    </div>
  </div>`;
}
function toggleCard(el){ el.classList.toggle('expanded'); }

// ── EDITOR DE MAPA ────────────────────────────────────────────────
async function loadWinesForMap(){
  try{
    const res = await fetch('/api/obtener-vinos');
    const data = await res.json();
    wines = data.vinos || [];
    renderMapPins();
    renderMapWineList();
  }catch(e){
    document.getElementById('mapWineList').innerHTML=
      '<div class="loading">Error cargando vinos</div>';
  }
}

function copaSVG(color, size, num){
  const w=size, h=Math.round(size*1.4);
  const numEl = num!=null
    ? `<text x="10" y="10.5" text-anchor="middle" font-size="5.5" font-weight="700" fill="rgba(255,255,255,0.95)" font-family="sans-serif">${num}</text>`
    : '';
  return `<svg width="${w}" height="${h}" viewBox="0 0 20 30" fill="none">
    <path d="M7 2 C7 2 5.5 6 5.5 8.5 C5.5 11.5 7.2 13.5 9.5 14.2 L9.5 22 L7.5 22 L7 24 L13 24 L12.5 22 L10.5 22 L10.5 14.2 C12.8 13.5 14.5 11.5 14.5 8.5 C14.5 6 13 2 13 2 Z"
      fill="${color}" stroke="rgba(255,255,255,0.45)" stroke-width="0.6"/>
    ${numEl}
  </svg>`;
}

function renderMapPins(){
  const stage = document.getElementById('mapStage');
  const container = document.getElementById('mapPins');
  container.innerHTML = '';

  wines.forEach((w, idx) => {
    const coords = pendingChanges[w.id] || {x: parseFloat(w.x)||0, y: parseFloat(w.y)||0};
    const color = TYPE_COLOR[w.tipo] || '#888';
    const num = idx + 1;

    // Convert x,y (-100 to 100) to percentage (5% to 95%)
    const px = mapToPercent(coords.x);
    const py = mapToPercent(-coords.y); // Y invertido: positivo = arriba

    const pin = document.createElement('div');
    pin.className = 'map-pin' + (w.id===selectedWineId?' selected-pin':'');
    pin.id = 'pin-'+w.id;
    pin.style.left = px+'%';
    pin.style.top = py+'%';
    if(py > 50) pin.classList.add('below-mid');

    pin.innerHTML = `
      <div class="map-pin-label">${num}. ${w.nombre}</div>
      ${copaSVG(color, 28, num)}
    `;

    // Click to select
    pin.addEventListener('click', e => { e.stopPropagation(); selectWine(w.id); });

    // Drag & drop
    makeDraggable(pin, w.id);

    container.appendChild(pin);
  });
}

function mapToPercent(val){
  // val: -100 to 100 → 5% to 95%
  return 5 + ((val + 100) / 200) * 90;
}
function percentToMap(pct){
  // pct: 0-100 → -100 to 100
  return Math.round(((pct - 5) / 90) * 200 - 100);
}

function makeDraggable(pin, wineId){
  let dragging = false;
  let startX, startY, startLeft, startTop;
  const stage = document.getElementById('mapStage');

  function onStart(e){
    e.preventDefault();
    dragging = true;
    selectWine(wineId);
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX;
    startY = pt.clientY;
    startLeft = parseFloat(pin.style.left);
    startTop  = parseFloat(pin.style.top);
    pin.style.zIndex = 20;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend', onEnd);
  }

  function onMove(e){
    if(!dragging) return;
    e.preventDefault();
    const pt = e.touches ? e.touches[0] : e;
    const rect = stage.getBoundingClientRect();
    const dx = ((pt.clientX - startX) / rect.width) * 100;
    const dy = ((pt.clientY - startY) / rect.height) * 100;
    let newLeft = Math.max(2, Math.min(98, startLeft + dx));
    let newTop  = Math.max(2, Math.min(98, startTop  + dy));
    pin.style.left = newLeft+'%';
    pin.style.top  = newTop+'%';

    // Update coords
    const mapX = percentToMap(newLeft);
    const mapY = -percentToMap(newTop); // invertir Y
    const clamped = {x: Math.max(-100,Math.min(100,mapX)), y: Math.max(-100,Math.min(100,mapY))};
    pendingChanges[wineId] = clamped;
    updateSidebar(wineId, clamped);
    if(newTop > 50) pin.classList.add('below-mid');
    else pin.classList.remove('below-mid');
  }

  function onEnd(){
    if(!dragging) return;
    dragging = false;
    pin.style.zIndex = 5;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  }

  pin.addEventListener('mousedown', onStart);
  pin.addEventListener('touchstart', onStart, {passive:false});
}

function selectWine(id){
  selectedWineId = id;
  // Update pin styling
  document.querySelectorAll('.map-pin').forEach(p=>p.classList.remove('selected-pin'));
  const pin = document.getElementById('pin-'+id);
  if(pin) pin.classList.add('selected-pin');
  // Update list
  document.querySelectorAll('.map-wine-item').forEach(el=>{
    el.classList.toggle('active-item', el.dataset.id==id);
  });
  const w = wines.find(w=>w.id===id);
  const coords = pendingChanges[id] || {x:parseFloat(w.x)||0, y:parseFloat(w.y)||0};
  updateSidebar(id, coords);
  document.getElementById('saveSingleBtn').disabled = false;
}

function updateSidebar(id, coords){
  const w = wines.find(w=>w.id===id);
  if(!w) return;
  document.getElementById('selName').textContent = w.nombre;
  document.getElementById('selCoords').textContent = `x: ${coords.x} · y: ${coords.y}`;
  document.getElementById('inputX').value = coords.x;
  document.getElementById('inputY').value = coords.y;
}

function updateFromInput(){
  if(!selectedWineId) return;
  const x = Math.max(-100, Math.min(100, parseInt(document.getElementById('inputX').value)||0));
  const y = Math.max(-100, Math.min(100, parseInt(document.getElementById('inputY').value)||0));
  pendingChanges[selectedWineId] = {x, y};
  document.getElementById('selCoords').textContent = `x: ${x} · y: ${y}`;
  // Move pin
  const pin = document.getElementById('pin-'+selectedWineId);
  if(pin){
    pin.style.left = mapToPercent(x)+'%';
    pin.style.top  = mapToPercent(-y)+'%';
  }
}

function renderMapWineList(){
  document.getElementById('mapWineList').innerHTML = wines.map((w,i)=>`
    <div class="map-wine-item${w.id===selectedWineId?' active-item':''}"
      data-id="${w.id}" onclick="selectWine(${w.id})">
      <div class="map-wine-dot" style="background:${TYPE_COLOR[w.tipo]||'#888'}"></div>
      <div class="map-wine-item-name">${w.nombre}</div>
      <div class="map-wine-item-num">${i+1}</div>
    </div>`).join('');
}

// ── GUARDAR EN SHEET ──────────────────────────────────────────────
async function saveSingle(){
  if(!selectedWineId) return;
  const w = wines.find(w=>w.id===selectedWineId);
  const coords = pendingChanges[selectedWineId];
  if(!w || !coords){ showToast('Nada que guardar','error'); return; }
  await saveCoords([{id:w.id, nombre:w.nombre, x:coords.x, y:coords.y}]);
}

async function saveAll(){
  const changes = Object.entries(pendingChanges).map(([id,c])=>{
    const w = wines.find(w=>w.id==id);
    return w ? {id:w.id, nombre:w.nombre, x:c.x, y:c.y} : null;
  }).filter(Boolean);
  if(!changes.length){ showToast('No hay cambios pendientes','error'); return; }
  await saveCoords(changes);
}

async function saveCoords(changes){
  showToast('Guardando...');
  try{
    const res = await fetch('/api/actualizar-mapa', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({cambios: changes})
    });
    const data = await res.json();
    if(data.ok){
      showToast(`✓ ${changes.length===1?'Posición guardada':'Todos los cambios guardados'}`, 'success');
      // Update local wines array
      changes.forEach(c=>{
        const w = wines.find(w=>w.id===c.id);
        if(w){ w.x=c.x; w.y=c.y; }
        delete pendingChanges[c.id];
      });
    } else {
      showToast('Error al guardar: '+( data.error||''), 'error');
    }
  }catch(e){
    showToast('Error de conexión','error');
  }
}

// ── TOAST ─────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type=''){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type?' '+type:'');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.className='toast', 2500);
}

// Auto-login
if(sessionStorage.getItem(SESSION_KEY)==='1'){
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('dashboard').style.display='block';
  loadStats();
  loadWinesForMap();
}
</script>
</body>
</html>
