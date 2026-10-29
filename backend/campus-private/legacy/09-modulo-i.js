
/* EN VIVO STUDIO - LOGICA POR ROLES */
let enVivoState = {
  role: null, // se setea desde currentUser
  isPresenter: false,
  micOn: true,
  camOn: true,
  isScreenSharing: false,
  isRecording: false,
  filterId: 'normal',
  activeTab: 'chat',
  chatMsgs: [],
  forumQs: [],
  notes: [],
  participants: [],
  floatingEmojis: [],
  nowTick: Date.now(),
  stream: null,
  mediaRecorder: null,
  recordedChunks: [],
  rafId: null,
  tickInterval: null
};

const EN_VIVO_FILTERS = {
  normal: 'none',
  bn: 'grayscale(1)',
  sepia: 'sepia(0.8)',
  vivid: 'saturate(1.6) contrast(1.2)',
  warm: 'sepia(0.25) saturate(1.35) hue-rotate(-12deg) brightness(1.05)',
  cold: 'hue-rotate(170deg) saturate(1.2) brightness(1.05)'
};

function isCapacitacionRole(role) {
  const r = (role||'').toLowerCase();
  return ['capacitador','maestro','admin','gm','desarrollador','agencia','capacitación comercial','capacitación administrativa','capacitacion'].some(x=>r.includes(x));
}

function initEnVivoStudio(liveClassId) {
  const userRole = (currentUser.role||'').toLowerCase();
  enVivoState.role = userRole;
  enVivoState.isPresenter = isCapacitacionRole(userRole);
  enVivoState.participants = [];
  enVivoState.chatMsgs = [];
  enVivoState.forumQs = [];
  enVivoState.notes = [];
  enVivoState.nowTick = Date.now();
  
  // Agregar host si es presentador
  if (enVivoState.isPresenter) {
    enVivoState.participants.push({
      id: String(Date.now()),
      name: currentUser.name,
      email: currentUser.email,
      fecha: new Date().toLocaleDateString('es-MX'),
      entradaTs: Date.now(),
      entrada: new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
      role: currentUser.role,
      duracion: '0 min'
    });
  }
  
  // v6.6 FIX: Guardar en db.liveClasses y asignar a TODOS los roles con acceso live-classes
  if (db.liveClasses) {
    let lc = db.liveClasses.find(c=>String(c.id)===String(liveClassId));
    // Si es nueva transmisión, crear clase EN VIVO asignada a todos
    if (!lc && liveClassId==='nueva') {
      const todosConAcceso = (db.users||[]).filter(u=>{
        const perms = db.rolePermissions && db.rolePermissions[u.role];
        return perms && perms.includes('live-classes');
      }).map(u=>u.id);
      lc = {
        id: 'en-vivo-'+Date.now(),
        title: '🔴 Sesión EN VIVO - '+new Date().toLocaleDateString('es-MX'),
        start: new Date().toISOString(),
        end: new Date(Date.now()+3600000*2).toISOString(),
        zoomUrl: '',
        assignedTo: todosConAcceso,
        createdBy: currentUser.id,
        instructorId: currentUser.id,
        esEnVivoNuevo: true,
        tipo: 'en_vivo_studio',
        participantesReales: []
      };
      db.liveClasses.push(lc);
      liveClassId = lc.id;
      saveDB();
      if (window.showToast) showToast('Sala EN VIVO creada y visible para todos los roles con acceso a Clases en Vivo','success');
    }
    
    if (lc) {
      if (!lc.participantesReales) lc.participantesReales = [];
      // Agregar currentUser si no existe
      if (!lc.participantesReales.find(p=>p.id===currentUser.id)) {
        lc.participantesReales.push({
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          fecha: new Date().toLocaleDateString('es-MX'),
          entradaTs: Date.now(),
          entrada: new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
          role: currentUser.role
        });
        saveDB();
      }
      enVivoState.participants = lc.participantesReales.map(p=>({
        ...p,
        duracion: getDuracionEnVivo(p.entradaTs)
      }));
    }
  }
  
  // Mostrar modal estudio
  showEnVivoModal(liveClassId);
  
  // Si es presentador, pedir cámara
  if (enVivoState.isPresenter) {
    startEnVivoCamera();
  } else {
    // Viewer - no pide cámara, solo muestra video del presentador (simulado)
    setTimeout(()=>{ 
      const canvas = document.getElementById('en-vivo-canvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a2540';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('En vivo - Transmisión de Capacitación', canvas.width/2, canvas.height/2);
      }
    }, 100);
  }
  
  // Interval para duración (v6.9 FIX: reutilizable y limpiable en closeEnVivoModal)
  if (enVivoState.tickInterval) { try { clearInterval(enVivoState.tickInterval); } catch(e) {} }
  enVivoState.tickInterval = setInterval(()=>{ 
    enVivoState.nowTick = Date.now();
    updateDuraciones();
  }, 1000);
}

function getDuracionEnVivo(entradaTs) {
  const diff = Math.max(0, enVivoState.nowTick - entradaTs);
  const mins = Math.floor(diff/60000);
  const secs = Math.floor((diff%60000)/1000);
  if (mins < 60) return `${mins} min ${secs} seg`;
  const hrs = Math.floor(mins/60);
  const rmins = mins%60;
  return `${hrs} h ${rmins} min`;
}

function updateDuraciones() {
  const container = document.getElementById('en-vivo-participants-list');
  if (!container) return;
  // Actualiza duraciones en UI si es necesario
}

async function startEnVivoCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
    enVivoState.stream = stream;
    const video = document.getElementById('en-vivo-video');
    const canvas = document.getElementById('en-vivo-canvas');
    if (video) {
      video.srcObject = stream;
      await video.play();
    }
    // Render loop
    function draw() {
      const canvas = document.getElementById('en-vivo-canvas');
      const video = document.getElementById('en-vivo-video');
      if (!canvas || !video) { enVivoState.rafId = requestAnimationFrame(draw); return; }
      const ctx = canvas.getContext('2d');
      if (video.readyState < 2) { enVivoState.rafId = requestAnimationFrame(draw); return; }
      const W = canvas.width, H = canvas.height;
      const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
      const filter = EN_VIVO_FILTERS[enVivoState.filterId] || 'none';
      ctx.filter = filter;
      const scale = Math.max(W/vw, H/vh);
      const dw = vw*scale, dh = vh*scale;
      const dx = (W-dw)/2, dy = (H-dh)/2;
      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.filter = 'none';
      enVivoState.rafId = requestAnimationFrame(draw);
    }
    draw();
  } catch(e) {
    console.warn('Camera error', e);
    uiToast('No se pudo acceder a cámara/mic. Verifica permisos.');
  }
}

function showEnVivoModal(liveClassId) {
  if (!enVivoChannel) initEnVivoSync();
  const isPresenter = enVivoState.isPresenter;
  const roleLabel = isPresenter ? 'Presentador (Capacitación)' : 'Participante';
  const roleColor = isPresenter ? 'bg-[#0a2540] text-white' : 'bg-slate-100 text-slate-700';
  
  const html = `
  <div id="en-vivo-modal" class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-2 sm:p-4 overflow-auto" data-bx-dblclick="a634">
    <div class="bg-[#f8fafc] w-full max-w-[1600px] h-[95vh] rounded-[16px] overflow-hidden flex flex-col shadow-2xl" data-bx-click="a141" data-bx-dblclick="a278">
      <!-- Header -->
      <div class="h-[64px] bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-[10px] bg-[#0a2540] grid place-items-center text-white font-bold text-[13px] tracking-widest">LIVE</div>
          <div>
            <div class="font-semibold leading-none text-[15px]">En Vivo</div>
            <div class="text-[11px] text-slate-500 mt-[2px]">Clase en directo • Solo Capacitación transmite</div>
          </div>
          <span class="ml-3 hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 text-red-600 text-[11px] font-semibold border border-red-100">
            <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span> EN VIVO
          </span>
          <span class="ml-2 px-2.5 py-1 rounded-full text-[11px] font-medium ${roleColor}">${roleLabel}: ${currentUser.role}</span>
        </div>
        <div class="flex items-center gap-2">
          ${isPresenter ? `<button data-bx-click="a635" class="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-white border border-slate-200 text-[12px] font-medium hover:bg-slate-50"><i class="fa-solid fa-download text-[12px]"></i> Descargar participantes</button>` : ''}
          ${isPresenter ? `<button data-bx-click="a636" data-p0="${bxE(function(){return liveClassId})}" class="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-[#c9a86a] text-[#0a2540] text-[12px] font-semibold hover:bg-[#b8945a]">Guardar como curso</button>` : ''}
          <button data-bx-click="a637" class="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 grid place-items-center"><i class="fa-solid fa-xmark text-[14px]"></i></button>
        </div>
      </div>
      
      <div class="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 p-3 sm:p-4 overflow-auto">
        <!-- Video -->
        <div class="flex flex-col gap-3 min-w-0">
          <div class="relative w-full aspect-video bg-[#0a2540] rounded-[16px] overflow-hidden shadow-[0_8px_30px_rgba(10,37,64,0.18)]">
            <video id="en-vivo-video" playsinline muted class="hidden"></video>
            <canvas id="en-vivo-canvas" width="1280" height="720" class="absolute inset-0 w-full h-full object-cover"></canvas>
            <div id="en-vivo-overlay" class="absolute inset-0 pointer-events-none"></div>
            ${!isPresenter ? `<div class="absolute inset-0 grid place-items-center bg-[#0a2540]/90 text-white/80"><div class="text-center"><div class="w-16 h-16 mx-auto bg-white/10 rounded-full grid place-items-center mb-3"><i class="fa-solid fa-video text-2xl"></i></div><p class="text-sm font-medium">En vivo - Transmisión de Capacitación</p><p class="text-xs opacity-60 mt-1">Solo el equipo de Capacitación transmite</p></div></div>` : ''}
          </div>
          
          <!-- Controles -->
          <div class="rounded-[14px] bg-white border border-slate-200 p-2.5 flex flex-wrap items-center gap-2">
            ${isPresenter ? `
            <button data-bx-click="a638" class="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium bg-slate-900 text-white"><i class="fa-solid fa-microphone text-[14px]"></i> Mic</button>
            <button data-bx-click="a639" class="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium bg-slate-900 text-white"><i class="fa-solid fa-video text-[14px]"></i> Cámara</button>
            <button data-bx-click="a640" class="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium bg-white border border-slate-200"><i class="fa-solid fa-display text-[14px]"></i> Compartir</button>
            <button data-bx-click="a641" class="h-9 px-3 rounded-full flex items-center gap-1.5 text-[13px] font-medium bg-white border border-slate-200"><i class="fa-solid fa-circle text-[12px] text-red-500"></i> Grabar</button>
            <div class="h-6 w-px bg-slate-200 mx-1 hidden sm:block"></div>
            <div class="flex items-center gap-1.5">
              ${Object.keys(EN_VIVO_FILTERS).map(k=>`<button data-bx-click="a642" data-p0="${bxE(function(){return k})}" class="h-8 px-2.5 rounded-full text-[11px] font-medium border ${enVivoState.filterId===k ? 'bg-[#0a2540] text-white border-[#0a2540]' : 'bg-white border-slate-200'}">${k}</button>`).join('')}
            </div>
            ` : `
            <div class="text-[12px] text-slate-500">Estás viendo como Participante - Solo Capacitación transmite</div>
            `}
            <div class="ml-auto flex items-center gap-1">
              ${['❤️','🔥','👏','😂','😮','🎉'].map(em=>`<button data-bx-click="a643" data-p0="${bxE(function(){return em})}" class="w-8 h-8 rounded-full bg-[#f8fafc] hover:bg-white border border-slate-200 grid place-items-center text-[16px]">${em}</button>`).join('')}
            </div>
          </div>
        </div>
        
        <!-- Panel derecho -->
        <div class="min-w-0 flex flex-col gap-3">
          <div class="rounded-[16px] bg-white border border-slate-200 overflow-hidden flex flex-col h-[520px]">
            <div class="flex border-b border-slate-100">
              <button data-bx-click="a644" id="tab-chat" class="flex-1 h-11 text-[12px] font-medium border-b-2 border-[#0a2540] text-[#0a2540] bg-[#f8fafc]">Chat</button>
              <button data-bx-click="a645" id="tab-foro" class="flex-1 h-11 text-[12px] font-medium border-b-2 border-transparent text-slate-500">Foro</button>
              <button data-bx-click="a646" id="tab-notas" class="flex-1 h-11 text-[12px] font-medium border-b-2 border-transparent text-slate-500">Notas</button>
            </div>
            <div class="flex-1 overflow-auto p-3 space-y-2" id="en-vivo-tab-content">
              <div class="h-[360px] grid place-items-center text-[12px] text-slate-400">Sin mensajes aún</div>
            </div>
            <div class="p-3 border-t border-slate-100 flex gap-2">
              <input id="en-vivo-input" placeholder="Escribe un mensaje..." class="flex-1 h-10 px-3 rounded-xl bg-[#f8fafc] border border-slate-200 text-[13px] outline-none" data-bx-keydown="a647">
              <button data-bx-click="a648" class="h-10 px-4 rounded-xl bg-[#0a2540] text-white text-[13px]">Enviar</button>
            </div>
          </div>
          
          <div class="rounded-xl bg-white border border-slate-200 p-3">
            <div class="flex items-center justify-between">
              <div class="text-[11px] font-semibold tracking-wide">Participantes conectados</div>
              <div class="text-[11px] text-slate-500">${enVivoState.participants.length} conectados</div>
            </div>
            <div class="mt-2 space-y-2 max-h-[160px] overflow-auto" id="en-vivo-participants-list">
              ${enVivoState.participants.length===0 ? '<div class="text-[11px] text-slate-400 py-4 text-center">Solo el instructor conectado - Sin ficticios, solo reales</div>' : enVivoState.participants.map(p=>`
                <div class="flex items-center justify-between text-[11px] border-b border-slate-50 pb-2">
                  <div><div class="font-medium text-[12px]">${p.name}</div><div class="text-slate-500">${p.email||''}</div></div>
                  <div class="text-right"><div class="text-slate-600">${p.fecha} • ${p.entrada}</div><div class="text-[#0a2540] font-medium">${getDuracionEnVivo(p.entradaTs)}</div></div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}

function closeEnVivoModal() {
  const modal = document.getElementById('en-vivo-modal');
  if (modal) modal.remove();
  if (enVivoState.tickInterval) { try { clearInterval(enVivoState.tickInterval); } catch(e) {} enVivoState.tickInterval = null; }
  if (enVivoState.stream) {
    enVivoState.stream.getTracks().forEach(t=>t.stop());
  }
  if (enVivoState.rafId) cancelAnimationFrame(enVivoState.rafId);
}

function switchEnVivoTab(tab) {
  enVivoState.activeTab = tab;
  document.querySelectorAll('[id^=tab-]').forEach(b=>{ b.className='flex-1 h-11 text-[12px] font-medium border-b-2 border-transparent text-slate-500'; });
  const active = document.getElementById('tab-'+tab);
  if (active) active.className='flex-1 h-11 text-[12px] font-medium border-b-2 border-[#0a2540] text-[#0a2540] bg-[#f8fafc]';
  // Render content según tab
  const content = document.getElementById('en-vivo-tab-content');
  if (!content) return;
  if (tab==='chat') {
    content.innerHTML = enVivoState.chatMsgs.length ? enVivoState.chatMsgs.map(m=>`<div class="flex gap-2"><div class="h-6 w-6 rounded-full bg-[#0a2540] text-white grid place-items-center text-[10px] font-bold">${m.author[0]}</div><div><div class="text-[12px] font-semibold">${m.author} <span class="text-[10px] text-slate-400">${m.time}</span></div><div class="text-[12px]">${m.text}</div></div></div>`).join('') : '<div class="h-[360px] grid place-items-center text-[12px] text-slate-400">Sin mensajes aún</div>';
  } else if (tab==='foro') {
    content.innerHTML = '<div class="space-y-2"><input id="foro-q" placeholder="Escribe tu duda..." class="w-full h-10 px-3 rounded-xl bg-[#f8fafc] border border-slate-200 text-[13px]"><button data-bx-click="a649" class="w-full h-9 rounded-full bg-[#0a2540] text-white text-[12px] mt-2">Publicar duda</button><div class="mt-3 space-y-2">'+(enVivoState.forumQs.map(q=>`<div class="p-3 rounded-xl bg-[#f8fafc] border border-slate-100"><div class="text-[12px] font-semibold">${q.author}</div><div class="text-[13px] mt-1">${q.text}</div></div>`).join('') || '<div class="text-[12px] text-slate-400 text-center py-8">Sin dudas aún</div>')+'</div></div>';
  } else if (tab==='notas') {
    content.innerHTML = '<div class="space-y-2"><textarea id="nota-text" placeholder="Escribe una nota..." class="w-full h-20 p-3 rounded-xl bg-[#f8fafc] border border-slate-200 text-[13px]"></textarea><button data-bx-click="a650" class="w-full h-9 rounded-full bg-[#0a2540] text-white text-[12px]">Guardar nota</button><div class="mt-3 space-y-2">'+(enVivoState.notes.map(n=>`<div class="p-3 rounded-xl bg-[#fffbeb] border border-amber-200"><div class="text-[12px]">${n.text}</div><div class="text-[10px] text-slate-400">${n.time}</div></div>`).join('') || '<div class="text-[12px] text-slate-400 text-center py-8">Sin notas aún</div>')+'</div></div>';
  }
}

function sendEnVivoChat() {
  const input = document.getElementById('en-vivo-input');
  if (!input || !input.value.trim()) return;
  enVivoState.chatMsgs.push({ id: Date.now(), author: currentUser.name, time: new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}), text: input.value.trim() });
  input.value = '';
  switchEnVivoTab('chat');
}

function sendEnVivoEmoji(em) {
  // Flotante
  const overlay = document.getElementById('en-vivo-overlay');
  if (!overlay) return;
  const id = Date.now();
  const div = document.createElement('div');
  div.textContent = em;
  div.style.position = 'absolute';
  div.style.left = (20+Math.random()*60)+'%';
  div.style.bottom = '18%';
  div.style.fontSize = '28px';
  div.style.animation = 'floatUp 2.5s ease-out forwards';
  div.style.pointerEvents = 'none';
  overlay.appendChild(div);
  setTimeout(()=>div.remove(), 2500);
}

function downloadEnVivoParticipants() {
  if (!enVivoState.isPresenter) { uiToast('Solo el equipo de Capacitación puede descargar participantes'); return; }
  const header = "Nombre,Email,Fecha,Hora Entrada,Duración,Rol\n";
  const rows = enVivoState.participants.map(p=>`${p.name},${p.email||''},${p.fecha},${p.entrada},${getDuracionEnVivo(p.entradaTs)},${p.role||p.rol||''}`).join("\n");
  const blob = new Blob([header+rows], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='participantes_en_vivo_'+new Date().toISOString().slice(0,10)+'.csv'; a.click(); URL.revokeObjectURL(url);
}

function guardarComoCursoEnVivo(liveClassId) {
  if (!enVivoState.isPresenter) return;
  const titulo = prompt('Título del curso:', 'Clase en vivo - '+new Date().toLocaleDateString('es-MX'));
  if (!titulo) return;
  if (!db.lessons) db.lessons = [];
  db.lessons.push({
    id: Date.now(),
    categoryId: 1,
    title: titulo,
    content: 'Clase grabada en vivo el '+new Date().toLocaleDateString('es-MX'),
    videoType: 'enVivo',
    videoUrl: '',
    videoData: null,
    quiz: [],
    flashcards: [],
    views: [],
    enVivoData: {
      chat: enVivoState.chatMsgs,
      foro: enVivoState.forumQs,
      notas: enVivoState.notes,
      participantes: enVivoState.participants,
      fecha: new Date().toISOString()
    }
  });
  saveDB();
  uiToast('Curso guardado en Academia');
  closeEnVivoModal();
  render();
}

// v6.6 FIX ROLES: Todos los roles pueden entrar a sala EN VIVO nueva, alumno como viewer
const originalOpenLiveClassDetail = window.openLiveClassDetail;
window.openLiveClassDetail = function(ev) {
  // Si es clase con formato nuevo EN VIVO, abrir directo el estudio por roles
  if (ev.esEnVivoNuevo || ev.tipo==='en_vivo_studio' || String(ev.id).includes('en-vivo') || String(ev.id).includes('demo')) {
    initEnVivoStudio(ev.id);
    return;
  }
  
  // Si es rol capacitacion, abre nuestro estudio, si no abre detalle normal pero con botón para entrar
  if (isCapacitacionRole(currentUser.role)) {
    initEnVivoStudio(ev.id);
  } else {
    // Para participantes/alumnos, mostrar detalle con botón Entrar a clase en vivo (YouTube style) - SIEMPRE visible
    if (originalOpenLiveClassDetail) originalOpenLiveClassDetail(ev);
    setTimeout(()=>{
      const modal = document.querySelector('.fixed.inset-0');
      if (modal) {
        // Evitar duplicar botón
        if (modal.querySelector('#btn-entrar-en-vivo-nuevo')) return;
        const container = modal.querySelector('.p-6') || modal;
        const btn = document.createElement('button');
        btn.id = 'btn-entrar-en-vivo-nuevo';
        btn.innerHTML = '🔴 Entrar a sala EN VIVO nueva (formato YouTube - solo ver, sin cámara)';
        btn.className = 'w-full mt-4 h-12 rounded-xl bg-gradient-to-r from-red-600 to-red-700 text-white font-bold shadow-lg hover:from-red-700 hover:to-red-800 flex items-center justify-center gap-2';
        btn.onclick = ()=>{ closeModal(); initEnVivoStudio(ev.id); };
        container.appendChild(btn);
        
        // También agregar explicación para alumno
        const info = document.createElement('div');
        info.className = 'mt-3 p-3 bg-blue-50 border border-blue-200 rounded-xl text-[12px] text-blue-800';
        info.innerHTML = '<strong>Como '+currentUser.role+' ves como Participante:</strong> No necesitas cámara ni mic. Solo ves la transmisión de Capacitación, puedes chatear, preguntar en foro y tomar notas.';
        container.appendChild(info);
      }
    }, 150);
  }
};

// v6.6 FIX: Banner EN VIVO visible para TODOS los roles con acceso a live-classes
const originalRenderLiveClasses = window.renderLiveClasses;
window.renderLiveClasses = function() {
  const html = originalRenderLiveClasses ? originalRenderLiveClasses() : '';
  const esTeacher = isCapacitacionRole(currentUser.role);
  
  // Banner para todos los roles
  let banner = '';
  if (esTeacher) {
    banner = `
      <div class="mb-6 bg-gradient-to-r from-[#0a2540] to-[#1e3a5f] text-white p-5 rounded-xl shadow-sm flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center"><i class="fas fa-video"></i></div>
          <div>
            <p class="font-bold">Estudio EN VIVO - Solo Capacitación transmite</p>
            <p class="text-xs opacity-80">YouTube style: tú transmites, los demás solo ven. Sin pedir cámara a participantes.</p>
          </div>
        </div>
        <button data-bx-click="a651" class="px-4 py-2.5 bg-[#c9a86a] text-[#0a2540] rounded-lg font-semibold hover:bg-[#b8945a]">Iniciar transmisión</button>
      </div>
    `;
  } else {
    // Para alumno y demás roles - banner de que hay sala nueva disponible
    const enVivoActivas = (db.liveClasses||[]).filter(c => c.participantesReales && c.participantesReales.length > 0);
    const tieneEnVivo = enVivoActivas.length > 0 || (db.liveClasses||[]).some(c=>c.esEnVivoNuevo || c.tipo==='en_vivo_studio');
    banner = `
      <div class="mb-6 bg-gradient-to-r from-red-600 to-red-700 text-white p-5 rounded-xl shadow-sm flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse"><i class="fas fa-broadcast-tower"></i></div>
          <div>
            <p class="font-bold">🔴 Sala EN VIVO Nueva - Formato YouTube</p>
            <p class="text-xs opacity-90">Eres ${currentUser.role} - Solo ves, no necesitas cámara. ${tieneEnVivo ? 'Hay transmisión activa ahora' : 'Cuando Capacitación inicie, aparecerá aquí'}</p>
          </div>
        </div>
        <button data-bx-click="a652" class="px-4 py-2.5 bg-white text-red-600 rounded-lg font-semibold hover:bg-red-50 flex items-center gap-2"><i class="fas fa-eye"></i> Entrar a sala nueva</button>
      </div>
    `;
  }
  return banner + html;
};
