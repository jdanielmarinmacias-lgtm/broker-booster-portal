

/* === v6.5 MEJORAS PERFECTO - UTILIDADES === */

/* === v6.7 FIX SYNC TIEMPO REAL ENTRE PESTAÑAS - BROADCASTCHANNEL === */
let enVivoChannel = null;
let enVivoHostInterval = null;

function initEnVivoSync() {
  try {
    enVivoChannel = new BroadcastChannel('guia-en-vivo-v67');
    console.log('BroadcastChannel EN VIVO iniciado');
    
    enVivoChannel.onmessage = function(e) {
      const msg = e.data;
      if (!msg || !msg.type) return;
      
      // Si soy viewer y recibo video del host
      if (!enVivoState.isPresenter && msg.type === 'video-frame' && msg.fromRole && isCapacitacionRole(msg.fromRole)) {
        const canvas = document.getElementById('en-vivo-canvas');
        if (canvas && msg.data) {
          const ctx = canvas.getContext('2d');
          const img = new Image();
          img.onload = function() {
            ctx.clearRect(0,0,canvas.width,canvas.height);
            // Dibujar frame del host
            const scale = Math.max(canvas.width/img.width, canvas.height/img.height);
            const w = img.width*scale, h = img.height*scale;
            const x = (canvas.width-w)/2, y = (canvas.height-h)/2;
            ctx.drawImage(img, x, y, w, h);
            // Quitar placeholder de "Esperando transmisión"
            const placeholder = document.querySelector('#en-vivo-canvas + div');
            if (placeholder && placeholder.textContent.includes('Esperando')) placeholder.style.display='none';
            // Mostrar badge de que está recibiendo transmisión
            let badge = document.getElementById('en-vivo-sync-badge');
            if (!badge) {
              badge = document.createElement('div');
              badge.id = 'en-vivo-sync-badge';
              badge.className = 'absolute top-3 left-3 px-3 h-7 rounded-full bg-[#22c55e] text-white text-[11px] font-semibold flex items-center gap-1.5';
              badge.innerHTML = '<span class="w-2 h-2 bg-white rounded-full animate-pulse"></span> En vivo de '+msg.fromName;
              document.querySelector('.relative.w-full.aspect-video')?.appendChild(badge);
            }
          };
          img.src = msg.data;
        }
      }
      
      // Sync chat entre pestañas
      if (msg.type === 'chat' && msg.authorId !== currentUser.id) {
        enVivoState.chatMsgs.push(msg.payload);
        if (enVivoState.activeTab==='chat') switchEnVivoTab('chat');
      }
      
      // Sync foro
      if (msg.type === 'foro' && msg.authorId !== currentUser.id) {
        enVivoState.forumQs.push(msg.payload);
        if (enVivoState.activeTab==='foro') switchEnVivoTab('foro');
      }
      
      // Sync participantes
      if (msg.type === 'participante-join' && msg.authorId !== currentUser.id) {
        if (!enVivoState.participants.find(p=>p.id===msg.payload.id)) {
          enVivoState.participants.push({...msg.payload, duracion: getDuracionEnVivo(msg.payload.entradaTs)});
          updateEnVivoParticipantsUI();
        }
      }
      
      // Sync emojis
      if (msg.type === 'emoji') {
        showFloatingEmoji(msg.payload.emoji);
      }
      
      // Host avisa que inició transmisión
      if (msg.type === 'host-started' && !enVivoState.isPresenter) {
        if (window.showToast) showToast('🔴 '+msg.fromName+' inició transmisión EN VIVO - Ya puedes verlo', 'success');
        // Quitar placeholder
        const ph = document.querySelector('.absolute.inset-0.grid.place-items-center');
        if (ph) ph.style.display='none';
      }
      
      // Host avisa que terminó
      if (msg.type === 'host-ended') {
        const canvas = document.getElementById('en-vivo-canvas');
        if (canvas) {
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#0a2540';
          ctx.fillRect(0,0,canvas.width,canvas.height);
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '14px Inter';
          ctx.textAlign = 'center';
          ctx.fillText('Transmisión finalizada', canvas.width/2, canvas.height/2);
        }
        if (window.showToast) showToast('Transmisión finalizada por '+msg.fromName, 'info');
      }
    };
  } catch(e) {
    console.warn('BroadcastChannel no disponible, fallback a localStorage', e);
    // Fallback a localStorage events
    window.addEventListener('storage', function(ev) {
      if (ev.key && ev.key.startsWith('guia-en-vivo-')) {
        try {
          const msg = JSON.parse(ev.newValue||'{}');
          if (enVivoChannel && enVivoChannel.onmessage) enVivoChannel.onmessage({data: msg});
        } catch(e) {}
      }
    });
  }
}

function broadcastEnVivo(type, payload) {
  if (!enVivoChannel) return;
  const msg = {
    type: type,
    payload: payload,
    authorId: currentUser.id,
    fromName: currentUser.name,
    fromRole: currentUser.role,
    timestamp: Date.now()
  };
  try {
    enVivoChannel.postMessage(msg);
    // Fallback localStorage para compatibilidad
    localStorage.setItem('guia-en-vivo-'+type+'-'+Date.now(), JSON.stringify(msg));
  } catch(e) { console.warn('broadcast error', e); }
}

function startHostBroadcast() {
  if (!enVivoState.isPresenter || !enVivoChannel) return;
  // Avisar que host inició
  broadcastEnVivo('host-started', {liveClassId: 'current'});
  
  // Enviar video frames cada 100ms (~10fps) - optimizado para no saturar
  const canvas = document.getElementById('en-vivo-canvas');
  if (!canvas) return;
  
  if (enVivoHostInterval) clearInterval(enVivoHostInterval);
  enVivoHostInterval = setInterval(()=>{
    try {
      const canvas = document.getElementById('en-vivo-canvas');
      if (!canvas) return;
      // Solo enviar si hay contenido (no canvas vacío)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.4); // Comprimido
      // No enviar si es muy grande o igual al anterior
      if (dataUrl.length > 1000) {
        enVivoChannel.postMessage({
          type: 'video-frame',
          data: dataUrl,
          fromName: currentUser.name,
          fromRole: currentUser.role,
          authorId: currentUser.id
        });
      }
    } catch(e) {
      // Canvas tainted o error - ignorar
    }
  }, 120); // ~8fps para no saturar
  
  console.log('Host broadcast iniciado - enviando video a viewers');
}

function stopHostBroadcast() {
  if (enVivoHostInterval) { clearInterval(enVivoHostInterval); enVivoHostInterval=null; }
  if (enVivoChannel) {
    broadcastEnVivo('host-ended', {});
  }
}

function showFloatingEmoji(emoji) {
  const overlay = document.getElementById('en-vivo-overlay');
  if (!overlay) return;
  const div = document.createElement('div');
  div.textContent = emoji;
  div.style.position = 'absolute';
  div.style.left = (20+Math.random()*60)+'%';
  div.style.bottom = '18%';
  div.style.fontSize = '28px';
  div.style.animation = 'floatUp 2.5s ease-out forwards';
  div.style.pointerEvents = 'none';
  overlay.appendChild(div);
  setTimeout(()=>div.remove(), 2500);
}

function updateEnVivoParticipantsUI() {
  const container = document.getElementById('en-vivo-participants-list');
  if (!container) return;
  if (enVivoState.participants.length===0) {
    container.innerHTML = '<div class="text-[11px] text-slate-400 py-4 text-center">Solo el instructor conectado - Sin ficticios, solo reales</div>';
  } else {
    container.innerHTML = enVivoState.participants.map(p=>`
      <div class="flex items-center justify-between text-[11px] border-b border-slate-50 pb-2">
        <div><div class="font-medium text-[12px]">${escapeHTML(p.name)}</div><div class="text-slate-500">${escapeHTML(p.email||'')}</div></div>
        <div class="text-right"><div class="text-slate-600">${escapeHTML(p.fecha)} • ${escapeHTML(p.entrada)}</div><div class="text-[#0a2540] font-medium">${getDuracionEnVivo(p.entradaTs)}</div></div>
      </div>
    `).join('');
  }
  // Actualizar contador
  const counter = document.querySelector('#en-vivo-participants-list')?.parentElement?.querySelector('.text-slate-500');
  if (counter) counter.textContent = enVivoState.participants.length + ' conectados';
}

// Override initEnVivoSync en initEnVivoStudio
const originalInitEnVivoStudio = window.initEnVivoStudio;
window.initEnVivoStudio = function(liveClassId) {
  // Inicializar sync primero
  initEnVivoSync();
  
  // Llamar original
  if (typeof originalInitEnVivoStudio === 'function') {
    // Guardar referencia original y llamar lógica interna
  }
  
  // Lógica original de initEnVivoStudio (copiada para asegurar sync)
  const userRole = (currentUser.role||'').toLowerCase();
  enVivoState.role = userRole;
  enVivoState.isPresenter = isCapacitacionRole(userRole);
  enVivoState.participants = [];
  enVivoState.chatMsgs = [];
  enVivoState.forumQs = [];
  enVivoState.notes = [];
  enVivoState.nowTick = Date.now();
  
  if (enVivoState.isPresenter) {
    enVivoState.participants.push({
      id: String(currentUser.id),
      name: currentUser.name,
      email: currentUser.email,
      fecha: new Date().toLocaleDateString('es-MX'),
      entradaTs: Date.now(),
      entrada: new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
      role: currentUser.role
    });
  }
  
  if (db.liveClasses) {
    let lc = db.liveClasses.find(c=>String(c.id)===String(liveClassId));
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
    }
    
    if (lc) {
      if (!lc.participantesReales) lc.participantesReales = [];
      if (!lc.participantesReales.find(p=>String(p.id)===String(currentUser.id))) {
        lc.participantesReales.push({
          id: currentUser.id,
          name: currentUser.name,
          email: currentUser.email,
          fecha: new Date().toLocaleDateString('es-MX'),
          entradaTs: Date.now(),
          entrada: new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}),
          role: currentUser.role
        });
        // v6.9: asistencia + XP AUTOMÁTICOS al entrar a la sala (una sola vez por clase)
        try {
          const u = db.users.find(x=>String(x.id)===String(currentUser.id));
          if (u && !isCapacitacionRole(u.role)) {
            u.attendance = u.attendance || [];
            if (!u.attendance.includes(lc.id)) {
              u.attendance.push(lc.id);
              u.xp = (u.xp||0) + 10;
              if (window.showToast) showToast('Asistencia registrada (+10 XP)', 'success');
            }
          }
        } catch(e) {}
        saveDB();
      }
      enVivoState.participants = lc.participantesReales.map(p=>({...p, duracion: getDuracionEnVivo(p.entradaTs)}));
    }
  }
  
  showEnVivoModal(liveClassId);
  
  if (enVivoState.isPresenter) {
    startEnVivoCamera().then(()=>{ 
      setTimeout(startHostBroadcast, 500); 
    });
    broadcastEnVivo('participante-join', enVivoState.participants[0]);
  }
  
  // v6.9 FIX: guardar el intervalo y limpiar el anterior al re-entrar (evita acumulación de intervals y degrada el rendimiento)
  if (enVivoState.tickInterval) { try { clearInterval(enVivoState.tickInterval); } catch(e) {} }
  enVivoState.tickInterval = setInterval(()=>{ enVivoState.nowTick = Date.now(); }, 1000);
};

// Override close para detener broadcast
const originalCloseEnVivoModal = window.closeEnVivoModal;
window.closeEnVivoModal = function() {
  stopHostBroadcast();
  if (enVivoChannel) {
    try { enVivoChannel.close(); } catch(e) {}
    enVivoChannel = null;
  }
  // v6.9 FIX: detener el intervalo de TICK al cerrar la sala (no más intervals fugados)
  if (enVivoState.tickInterval) { try { clearInterval(enVivoState.tickInterval); } catch(e) {} enVivoState.tickInterval = null; }
  const modal = document.getElementById('en-vivo-modal');
  if (modal) modal.remove();
  if (enVivoState.stream) enVivoState.stream.getTracks().forEach(t=>t.stop());
  if (enVivoState.rafId) cancelAnimationFrame(enVivoState.rafId);
};

// Override chat y emojis para broadcast
const originalSendEnVivoChat = window.sendEnVivoChat;
window.sendEnVivoChat = function() {
  const input = document.getElementById('en-vivo-input');
  if (!input || !input.value.trim()) return;
  const msg = { id: Date.now(), author: currentUser.name, time: new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'}), text: input.value.trim() };
  enVivoState.chatMsgs.push(msg);
  broadcastEnVivo('chat', msg);
  input.value = '';
  switchEnVivoTab('chat');
};

const originalSendEnVivoEmoji = window.sendEnVivoEmoji;
window.sendEnVivoEmoji = function(em) {
  showFloatingEmoji(em);
  broadcastEnVivo('emoji', {emoji: em});
};

console.log('v6.7 SYNC: BroadcastChannel listo para sync entre pestañas - alumno ya ve a capacitador');

/* === FIN v6.7 SYNC === */
/* === v6.5 MEJORAS PERFECTO - UTILIDADES === */

window.showToast = window.showToast || function(msg, type='info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-4 right-4 z-[9999] space-y-2';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg ${type==='success' ? 'bg-[#22c55e] text-white' : type==='error' ? 'bg-red-600 text-white' : 'bg-[#0a2540] text-white'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(()=>{ toast.style.opacity='0'; toast.style.transform='translateY(10px)'; setTimeout(()=>toast.remove(), 300); }, 3000);
};

function debounce(fn, delay=300) { let t; return function(...args) { clearTimeout(t); t=setTimeout(()=>fn.apply(this,args), delay); }; }
function escapeHTML(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, function(m) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]; }); }
function hashPass(p) { try { return btoa(unescape(encodeURIComponent(p))).split('').reverse().join(''); } catch(e) { return btoa(p); } }
function sanitizeInput(str) { return escapeHTML(str).trim().substring(0,500); }

// IndexedDB para grabaciones grandes (evita límite 5MB localStorage)
let guiaIDB = null;
function initIDB() {
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open('guia_portal_v65', 2);
    req.onupgradeneeded = function(e) {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('grabaciones')) db.createObjectStore('grabaciones', {keyPath:'id'});
      if (!db.objectStoreNames.contains('lessons_media')) db.createObjectStore('lessons_media', {keyPath:'id'});
    };
    req.onsuccess = function(e) { guiaIDB = e.target.result; resolve(guiaIDB); };
    req.onerror = function(e) { reject(e); };
  });
}
function saveGrabacionIDB(grab) {
  if (!guiaIDB) return Promise.resolve();
  return new Promise((resolve, reject)=>{
    const tx = guiaIDB.transaction(['grabaciones'], 'readwrite');
    tx.objectStore('grabaciones').put(grab);
    tx.oncomplete = ()=>resolve();
    tx.onerror = (e)=>reject(e);
  });
}

// Lazy loading + IntersectionObserver
function initLazyLoad() {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if (entry.isIntersecting) {
          const img = entry.target;
          if (img.dataset.src) { img.src = img.dataset.src; img.removeAttribute('data-src'); }
          observer.unobserve(img);
        }
      });
    });
    document.querySelectorAll('img[data-src]').forEach(img=>observer.observe(img));
  }
}

// Limpiar Service Workers viejos (blob/guia-v65) que interceptaban fetch('/api/...') y dejaban el portal en blanco
if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistrations) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => { try { r.unregister(); } catch (e) {} });
  }).catch(() => {});
  if (window.caches && caches.keys) {
    caches.keys().then(keys => {
      keys.forEach(k => { if (k.indexOf('guia-') === 0) caches.delete(k).catch(() => {}); });
    }).catch(() => {});
  }
}

// Mejora debounce para búsquedas existentes
window.debouncedRenderLiveClasses = debounce(function() {
  const el = document.getElementById('live-classes');
  if (el && typeof renderLiveClasses==='function') el.innerHTML = renderLiveClasses() /* v6.5: sanitizado con escapeHTML dentro de render */;
}, 300);

console.log('v6.5 Perfecto: utils cargados - debounce, escapeHTML, IDB, lazy, PWA');


function exportarEquipoCSV(){
    try{
        if (typeof db === 'undefined') { console.log('exportarEquipoCSV: db no disponible'); return; }
        const agentes = (db.users||[]).filter(u=> (u.role==='agente' || u.role==='agente_agencia' || u.role==='agente_desarrollo'));
        const ventas = db.ventas||[];
        let csv = 'Agente,Email,Contratante,Fecha,Ramo,Producto,Prima\n';
        agentes.forEach(a=>{
            const vs = ventas.filter(v=>String(v.agenteId)===String(a.id));
            if(vs.length===0){
                csv += `"${(a.nombre||a.name||'').replace(/"/g,'')}","${(a.email||'').replace(/"/g,'')}","","","","","0"\n`;
            }else{
                vs.forEach(v=>{
                    csv += `"${(a.nombre||a.name||'').replace(/"/g,'')}","${(a.email||'').replace(/"/g,'')}","${(v.contratante||'').replace(/"/g,'')}","${v.fecha||''}","${v.ramo||''}","${(v.producto||'').replace(/"/g,'')}","${v.prima||0}"\n`;
                });
            }
        });
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download='equipo_comercial.csv'; a.click(); URL.revokeObjectURL(url);
    }catch(e){ console.log('exportarEquipoCSV error', e); uiToast('Error exportando: '+e.message); }
}

function borrarVenta(id){
    try{
        if (typeof db === 'undefined' || typeof currentUser === 'undefined') { console.log('borrarVenta: contexto no listo'); return; }
        const puede = isAdmin(currentUser)||isGM(currentUser)||['agencia','maestro'].includes((currentUser.role||'').toLowerCase());
        if(!puede){ uiToast('Sin permisos'); return; }
        if(!confirm('¿Borrar esta venta?')) return;
        const v = (db.ventas||[]).find(x=>String(x.id)===String(id));
        db.ventas = (db.ventas||[]).filter(x=>String(x.id)!==String(id));
        db.auditoria = db.auditoria||[];
        db.auditoria.push({id:Date.now(),tipo:'borrado_venta',ventaId:id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:v,despues:null});
        saveDB();
        closeModal();
        render();
        if(window.showToast) showToast('Venta borrada','success');
    }catch(e){ uiToast('Error: '+e.message); }
}

function editarVenta(id){
    try{
        if (typeof db === 'undefined' || typeof currentUser === 'undefined') { console.log('editarVenta: contexto no listo'); return; }
        const puede = isAdmin(currentUser)||isGM(currentUser)||['agencia','maestro'].includes((currentUser.role||'').toLowerCase());
        if(!puede){ uiToast('Sin permisos'); return; }
        const v = (db.ventas||[]).find(x=>String(x.id)===String(id));
        if(!v) return;
        const antes = JSON.parse(JSON.stringify(v));
        showModal('<form id="editV" class="p-6 space-y-3"><h3 class="font-bold text-lg">Editar Venta</h3><input name="contratante" value="'+(v.contratante||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300" placeholder="Contratante"><input name="fecha" type="date" value="'+(v.fecha||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><select name="ramo" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">                        <option'+(v.ramo==='VIDA'?' selected':'')+'>VIDA</option><option'+(v.ramo==='GMM'?' selected':'')+'>GMM</option><option'+(v.ramo==='DAÑOS'?' selected':'')+'>DAÑOS</option><option'+(v.ramo==='AUTOS'?' selected':'')+'>AUTOS</option><option'+(v.ramo==='INVERSIÓN'?' selected':'')+'>INVERSIÓN</option><option'+(v.ramo==='INVERSIÓN ELITE'?' selected':'')+'>INVERSIÓN ELITE</option></select><select name="compania" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><option'+(v.compania==='AXA'?' selected':'')+'>AXA</option><option'+(v.compania==='PS'?' selected':'')+'>PS</option><option'+(v.compania==='MAPFRE'?' selected':'')+'>MAPFRE</option><option'+(v.compania==='HDI'?' selected':'')+'>HDI</option><option'+(v.compania==='QLTS'?' selected':'')+'>QLTS</option><option'+(v.compania==='OTROS'?' selected':'')+'>OTROS</option></select><input name="producto" value="'+(v.producto||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300" placeholder="Producto"><input name="prima" type="number" value="'+(v.prima||0)+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><div class="flex gap-2"><button type="button" data-bx-click="a1" class="flex-1 border py-2 rounded">Cancelar</button><button class="flex-1 bg-indigo-600 text-white py-2 rounded">Guardar</button></div></form>');
        document.getElementById('editV').onsubmit = function(e){ e.preventDefault(); const f=new FormData(e.target); v.contratante=f.get('contratante'); v.fecha=f.get('fecha'); v.ramo=f.get('ramo'); v.compania=f.get('compania'); v.producto=f.get('producto'); v.prima=Number(f.get('prima')); db.auditoria=db.auditoria||[]; db.auditoria.push({id:Date.now(),tipo:'edicion_venta',ventaId:id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:antes,despues:JSON.parse(JSON.stringify(v))}); saveDB(); closeModal(); render(); if(window.showToast) showToast('Venta actualizada','success'); };
    }catch(e){ uiToast('Error: '+e.message); }
}

function exportarEquipoPDF(){
    try{
        if (typeof db === 'undefined' || typeof window.jspdf === 'undefined') { console.log('exportarEquipoPDF: contexto no listo'); return; }
        const {jsPDF}=window.jspdf;
        const doc=new jsPDF({orientation:'landscape'});
        const agentes=db.users.filter(u=>['agente','agente_agencia','agente_desarrollo'].includes((u.role||'').toLowerCase()));
        const ventas=db.ventas||[];
        doc.setFontSize(14); doc.text('Reporte Mi Equipo',14,15);
        const body=[];
        agentes.forEach(a=>{ const vs=ventas.filter(v=>String(v.agenteId)===String(a.id)); vs.forEach(v=>{ body.push([a.name||a.nombre||'',v.contratante||'',v.fecha||'',v.ramo||'',v.producto||'',Number(v.prima||0).toLocaleString('es-MX')]); }); });
        doc.autoTable({head:[['Agente','Contratante','Fecha','Ramo','Producto','Prima']],body:body,startY:22,styles:{fontSize:8}});
        doc.save('equipo.pdf');
    }catch(e){ uiToast('PDF error: '+e.message); }
}

function verAuditoriaVentas(){
    try{
        if (typeof db === 'undefined') { console.log('verAuditoriaVentas: db no disponible'); return; }
    const logs=(db.auditoria||[]).filter(l=>l.tipo&&l.tipo.includes('venta')).slice(-50).reverse();
    let html='<div class="p-6"><h3 class="font-bold text-lg mb-3">Auditoría</h3><div class="max-h-96 overflow-auto"><table class="w-full text-xs"><thead><tr class="bg-slate-100"><th class="p-2 text-left">Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>';
    logs.forEach(l=>{ html+='<tr class="border-t"><td class="p-1">'+new Date(l.fecha).toLocaleString('es-MX')+'</td><td class="p-1">'+(l.usuarioNombre||'')+'</td><td class="p-1">'+l.tipo+'</td><td class="p-1">'+(l.antes?.contratante||'')+' $'+(l.antes?.prima||0)+'</td></tr>'; });
    html+='</tbody></table></div><div class="text-right mt-3"><button aria-label="Cerrar" data-bx-click="a1" class="border px-3 py-1 rounded">Cerrar</button></div></div>';
    showModal(html);
    }catch(e){ console.log('verAuditoriaVentas error', e); uiToast('Error auditoría: '+e.message); }
}


