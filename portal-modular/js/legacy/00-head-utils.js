
/* ¿Es una URL de imagen que el navegador puede pintar? Acepta http(s),
 * protocolo relativo (//cdn…), la ruta del proxy /media/… (la API reescribe
 * así las URLs del bucket por mediaProxy), /uploads/… del modo local, data:image
 * y blob:. Las portadas de Academia (categorías, planes, generaciones, grupos)
 * usaban una regla más estricta que rechazaba /media/: la subida funcionaba y
 * el formulario avisaba "No se pudo cargar la imagen. Usa JPG o PNG.". Una
 * sola regla compartida evita que vuelvan a divergir. */
function psImgUrl(v) {
    return typeof v === 'string' && v.length > 0 && (/^(https?:)?\/\//i.test(v) || /^\/(media|uploads)\//.test(v) || /^data:image\//i.test(v) || /^blob:/i.test(v));
}

/* Plural de un día de la semana. En español lunes, martes, miércoles, jueves
 * y viernes ya terminan en -s y NO llevan otra: el portal pintaba "Martess" y
 * "Miércoless" porque añadía 's' a todo. Solo sábado y domingo la necesitan. */
function psDiaPlural(dia) {
    const d = String(dia == null ? '' : dia).trim();
    if (!d) return '';
    return /s$/i.test(d) ? d : d + 's';
}

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
    }catch(e){ console.log('exportarEquipoCSV error', e); alert('Error exportando: '+e.message); }
}

function borrarVenta(id){
    try{
        if (typeof db === 'undefined' || typeof currentUser === 'undefined') { console.log('borrarVenta: contexto no listo'); return; }
        const puede = isAdmin(currentUser)||isGM(currentUser)||['agencia','maestro'].includes((currentUser.role||'').toLowerCase());
        if(!puede){ alert('Sin permisos'); return; }
        if(!confirm('¿Borrar esta venta?')) return;
        const v = (db.ventas||[]).find(x=>String(x.id)===String(id));
        db.ventas = (db.ventas||[]).filter(x=>String(x.id)!==String(id));
        db.auditoria = db.auditoria||[];
        db.auditoria.push({id:Date.now(),tipo:'borrado_venta',ventaId:id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:v,despues:null});
        saveDB();
        closeModal();
        render();
        if(window.showToast) showToast('Venta borrada','success');
    }catch(e){ alert('Error: '+e.message); }
}

function editarVenta(id){
    try{
        if (typeof db === 'undefined' || typeof currentUser === 'undefined') { console.log('editarVenta: contexto no listo'); return; }
        const puede = isAdmin(currentUser)||isGM(currentUser)||['agencia','maestro'].includes((currentUser.role||'').toLowerCase());
        if(!puede){ alert('Sin permisos'); return; }
        const v = (db.ventas||[]).find(x=>String(x.id)===String(id));
        if(!v) return;
        const antes = JSON.parse(JSON.stringify(v));
        showModal('<form id="editV" class="p-6 space-y-3"><h3 class="font-bold text-lg">Editar Venta</h3><input name="contratante" value="'+(v.contratante||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300" placeholder="Contratante"><input name="fecha" type="date" value="'+(v.fecha||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><select name="ramo" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">                        <option'+(v.ramo==='VIDA'?' selected':'')+'>VIDA</option><option'+(v.ramo==='GMM'?' selected':'')+'>GMM</option><option'+(v.ramo==='DAÑOS'?' selected':'')+'>DAÑOS</option><option'+(v.ramo==='AUTOS'?' selected':'')+'>AUTOS</option><option'+(v.ramo==='INVERSIÓN'?' selected':'')+'>INVERSIÓN</option><option'+(v.ramo==='INVERSIÓN ELITE'?' selected':'')+'>INVERSIÓN ELITE</option></select><select name="compania" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><option'+(v.compania==='AXA'?' selected':'')+'>AXA</option><option'+(v.compania==='PS'?' selected':'')+'>PS</option><option'+(v.compania==='MAPFRE'?' selected':'')+'>MAPFRE</option><option'+(v.compania==='HDI'?' selected':'')+'>HDI</option><option'+(v.compania==='QLTS'?' selected':'')+'>QLTS</option><option'+(v.compania==='OTROS'?' selected':'')+'>OTROS</option></select><input name="producto" value="'+(v.producto||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300" placeholder="Producto"><input name="prima" type="number" value="'+(v.prima||0)+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><div class="flex gap-2"><button type="button" data-bx-click="a1" class="flex-1 border py-2 rounded">Cancelar</button><button class="flex-1 bg-indigo-600 text-white py-2 rounded">Guardar</button></div></form>');
        document.getElementById('editV').onsubmit = function(e){ e.preventDefault(); const f=new FormData(e.target); v.contratante=f.get('contratante'); v.fecha=f.get('fecha'); v.ramo=f.get('ramo'); v.compania=f.get('compania'); v.producto=f.get('producto'); v.prima=Number(f.get('prima')); db.auditoria=db.auditoria||[]; db.auditoria.push({id:Date.now(),tipo:'edicion_venta',ventaId:id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:antes,despues:JSON.parse(JSON.stringify(v))}); saveDB(); closeModal(); render(); if(window.showToast) showToast('Venta actualizada','success'); };
    }catch(e){ alert('Error: '+e.message); }
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
    }catch(e){ alert('PDF error: '+e.message); }
}

function exportarAuditoriaCSV(){
    try{
        const logs = (db.auditoria||[]).slice().reverse();
        let csv = 'ID,Fecha,Usuario,Tipo,Detalle\n';
        logs.forEach(l=>{
            const det = JSON.stringify({ventaId:l.ventaId, clave:l.clave, antes:l.antes, despues:l.despues}).replace(/"/g,'""');
            csv += `"${l.id||''}","${l.fecha||''}","${(l.usuarioNombre||'').replace(/"/g,'""')}","${(l.tipo||'').replace(/"/g,'""')}","${det}"\n`;
        });
        const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download='auditoria_portal.csv'; a.click(); URL.revokeObjectURL(url);
    }catch(e){ alert('Error exportando auditoría: '+e.message); }
}

function verAuditoriaVentas(){
    try{
        if (typeof db === 'undefined') { console.log('verAuditoriaVentas: db no disponible'); return; }
        if (Array.isArray(db.auditoria) && db.auditoria.length > 500) db.auditoria = db.auditoria.slice(-500);
    const logs=(db.auditoria||[]).slice(-100).reverse();
    let html='<div class="p-6"><div class="flex items-center justify-between mb-3"><h3 class="font-bold text-lg">Auditoría (últimos '+logs.length+' de máx. 500)</h3><button data-bx-click="a2" class="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold"><i class="fas fa-file-csv mr-1"></i>Exportar CSV</button></div><div class="max-h-96 overflow-auto"><table class="w-full text-xs"><thead><tr class="bg-slate-100"><th class="p-2 text-left">Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>';
    logs.forEach(l=>{ html+='<tr class="border-t"><td class="p-1">'+new Date(l.fecha).toLocaleString('es-MX')+'</td><td class="p-1">'+(l.usuarioNombre||'')+'</td><td class="p-1">'+l.tipo+'</td><td class="p-1">'+(l.antes?.contratante||l.clave||'')+' '+(l.antes?.prima?'$'+l.antes.prima:'')+'</td></tr>'; });
    html+='</tbody></table></div><div class="text-right mt-3"><button aria-label="Cerrar" data-bx-click="a1" class="border px-3 py-1 rounded">Cerrar</button></div></div>';
    showModal(html);
    }catch(e){ console.log('verAuditoriaVentas error', e); alert('Error auditoría: '+e.message); }
}

// === FASE 2 (#3): PWA Service Worker + Instalación y Notificaciones Nativas ===
window.isPWAStandalone = function(){
    try {
        return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
               window.navigator.standalone === true;
    } catch (e) {
        return false;
    }
};

window.syncPWAInstallUI = function(){
    try {
        const installed = window.isPWAStandalone();
        const sidebarWrap = document.getElementById('pwa-install-sidebar-wrap');
        const headerBtn = document.getElementById('btn-install-pwa-header');
        if (sidebarWrap) {
            sidebarWrap.classList.toggle('hidden', installed);
        }
        if (headerBtn) {
            headerBtn.classList.toggle('hidden', installed);
            headerBtn.classList.toggle('flex', !installed);
        }
    } catch (e) {}
};

(function initPWAAndNotifications(){
    try {
        if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
            window.addEventListener('load', function(){
                navigator.serviceWorker.register('./sw.js').then(function(reg){
                    if (reg && typeof reg.update === 'function') {
                        setInterval(function(){ reg.update().catch(function(){}); }, 60 * 60 * 1000);
                    }
                }).catch(function(){
                    navigator.serviceWorker.register('/sw.js').catch(function(){});
                });
            });
        }
        window._deferredPwaPrompt = null;
        window.addEventListener('beforeinstallprompt', function(e){
            e.preventDefault();
            window._deferredPwaPrompt = e;
            window.syncPWAInstallUI();
        });
        window.addEventListener('appinstalled', function(){
            window._deferredPwaPrompt = null;
            window.syncPWAInstallUI();
            if (window.showToast) showToast('Aplicación instalada en tu dispositivo', 'success');
        });
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', window.syncPWAInstallUI);
        } else {
            setTimeout(window.syncPWAInstallUI, 0);
        }
    } catch (e) {}
})();

window.instalarPWA = async function(){
    if (window.isPWAStandalone && window.isPWAStandalone()) {
        if (window.showToast) showToast('La aplicación ya está instalada en tu dispositivo', 'success');
        return;
    }
    if (window._deferredPwaPrompt) {
        window._deferredPwaPrompt.prompt();
        try {
            const choice = await window._deferredPwaPrompt.userChoice;
            if (choice && choice.outcome === 'accepted' && window.showToast) {
                showToast('Instalando Broker Booster...', 'success');
            }
        } catch (e) {}
        window._deferredPwaPrompt = null;
        window.syncPWAInstallUI();
        return;
    }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (typeof showModal === 'function') {
        showModal(`<div class="p-6 max-w-md w-full">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 rounded-2xl bg-slate-900 text-amber-300 flex items-center justify-center shrink-0 shadow-sm">
                    <i class="fas fa-mobile-screen-button text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-bold text-slate-900">Instalar Broker Booster</h3>
                    <p class="text-xs text-slate-500">Acceso directo en pantalla completa como App nativa</p>
                </div>
            </div>
            ${isIOS ? `
                <div class="space-y-3 text-sm text-slate-700 bg-amber-50/60 border border-amber-200 rounded-xl p-4">
                    <p class="font-semibold text-slate-900 flex items-center gap-2"><i class="fab fa-apple text-base"></i> En iPhone o iPad (Safari):</p>
                    <ol class="list-decimal list-inside space-y-2 text-xs text-slate-700">
                        <li>Toca el botón <b>Compartir</b> <span class="inline-block px-1.5 py-0.5 bg-white border rounded text-slate-800 font-semibold"><i class="fas fa-arrow-up-from-bracket"></i></span> en la barra de Safari.</li>
                        <li>Desliza hacia abajo y selecciona <b>"Agregar a pantalla de inicio"</b> <i class="fas fa-plus-square text-slate-600"></i>.</li>
                        <li>Toca <b>Agregar</b> en la esquina superior derecha.</li>
                    </ol>
                </div>
            ` : `
                <div class="space-y-3 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p class="font-semibold text-slate-900 flex items-center gap-2"><i class="fab fa-chrome text-amber-600"></i> En Android o Escritorio (Chrome / Edge):</p>
                    <ol class="list-decimal list-inside space-y-2 text-xs text-slate-700">
                        <li>Abre el menú del navegador <span class="inline-block px-1.5 py-0.5 bg-white border rounded font-bold">⋮</span> en la esquina superior derecha.</li>
                        <li>Selecciona <b>"Instalar aplicación"</b> o <b>"Agregar a pantalla principal"</b>.</li>
                        <li>Confirma tocando <b>Instalar</b>.</li>
                    </ol>
                </div>
            `}
            <div class="mt-5 flex justify-end">
                <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-xl bg-slate-900 text-amber-300 text-xs font-semibold hover:bg-slate-800">Entendido</button>
            </div>
        </div>`);
    } else if (window.showToast) {
        showToast(isIOS ? 'En iPhone/iPad toca Compartir y luego "Agregar a pantalla de inicio"' : 'Usa el menú del navegador → "Instalar aplicación"', 'info');
    }
};

window.activarNotificacionesPush = async function(){
    if (!('Notification' in window)) {
        if (window.showToast) showToast('Tu navegador no soporta notificaciones nativas', 'warning');
        return;
    }
    if (Notification.permission === 'granted') {
        new Notification('Broker Booster — Notificaciones activas', {
            body: 'Recibirás avisos inmediatos de mensajes nuevos, cotizaciones y solicitudes.',
            icon: 'https://ui-avatars.com/api/?name=BB&background=0a2540&color=c9a86a&size=192'
        });
        if (window.showToast) showToast('Notificaciones activas en este dispositivo', 'success');
        return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
        new Notification('¡Notificaciones activadas!', {
            body: 'Te avisaremos cuando lleguen mensajes o actualizaciones de tus trámites.',
            icon: 'https://ui-avatars.com/api/?name=BB&background=0a2540&color=c9a86a&size=192'
        });
        if (window.showToast) showToast('Notificaciones del navegador activadas', 'success');
    } else {
        if (window.showToast) showToast('Permiso de notificaciones denegado en el navegador', 'warning');
    }
};

window.emitirNotificacionNativa = function(titulo, cuerpo){
    try {
        if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
            new Notification(titulo || 'Broker Booster', {
                body: cuerpo || 'Tienes una nueva actualización en el portal.',
                icon: 'https://ui-avatars.com/api/?name=BB&background=0a2540&color=c9a86a&size=192'
            });
        }
    } catch (e) {}
};

// === FASE 2 (#14): BUSCADOR UNIVERSAL INSTANTÁNEO (Ctrl + K) ===
window.openGlobalSearch = function(){
    if (typeof db === 'undefined' || !currentUser) return;
    showModal(`<div class="p-5 max-w-2xl w-full">
        <div class="flex items-center gap-3 pb-3 border-b border-amber-200">
            <i class="fas fa-search text-amber-600 text-lg"></i>
            <input id="global-search-input" type="text" data-bx-input="a3" placeholder="Busca clientes, pólizas, folios de cotización, autos, propiedades, lecciones o usuarios..." class="flex-1 text-sm bg-transparent outline-none text-slate-900 font-medium" autofocus>
            <button data-bx-click="a1" class="px-2 py-1 text-xs rounded bg-slate-100 text-slate-500 hover:bg-slate-200">ESC</button>
        </div>
        <div id="global-search-results" class="mt-3 max-h-[60vh] overflow-y-auto space-y-2"></div>
    </div>`);
    setTimeout(function(){
        const inp = document.getElementById('global-search-input');
        if (inp) { inp.focus(); renderGlobalSearchResults(''); }
    }, 50);
};

window.renderGlobalSearchResults = function(rawQ){
    const box = document.getElementById('global-search-results');
    if (!box || typeof db === 'undefined') return;
    const q = String(rawQ || '').trim().toLowerCase();
    const hits = [];
    const match = function(txt){ return !q || String(txt || '').toLowerCase().includes(q); };

    // 1. Clientes
    (db.clientes || []).forEach(function(c){
        if (match(c.nombre + ' ' + c.poliza + ' ' + c.compania + ' ' + c.ramo)) {
            hits.push({
                cat: 'Cliente / Póliza',
                icon: 'fa-address-book text-indigo-600',
                title: (c.nombre || 'Cliente') + (c.poliza ? ' · Póliza ' + c.poliza : ''),
                sub: (c.compania || '') + ' · ' + (c.ramo || '') + ' · $' + Number(c.primaTotal || 0).toLocaleString('es-MX'),
                run: function () { closeModal(); window.filtroClienteQ = String(c.nombre || '').replace(/'/g, ''); navigateTo('mis-clientes'); }
            });
        }
    });
    // 2. Cotizaciones
    (db.cotizaciones || []).forEach(function(s){
        const nom = (s.cliente && s.cliente.nombre) || '';
        if (match(s.id + ' ' + nom + ' ' + s.ramoNombre + ' ' + s.compania)) {
            hits.push({
                cat: 'Cotización',
                icon: 'fa-file-signature text-emerald-600',
                title: s.id + ' — ' + nom,
                sub: (s.ramoNombre || '') + ' · ' + (s.compania || '') + ' · Estado: ' + (s.estado || ''),
                run: function () { closeModal(); navigateTo('cotizaciones'); setTimeout(function () { if (window.cotAbrir) cotAbrir(s.id); }, 120); }
            });
        }
    });
    // 3. Autos
    ((db.autoHub && db.autoHub.unidades) || []).forEach(function(u){
        if (match((u.marca || '') + ' ' + (u.modelo || '') + ' ' + (u.anio || '') + ' ' + (u.sucursal || ''))) {
            hits.push({
                cat: 'Inventario Automotriz',
                icon: 'fa-car-side text-amber-600',
                title: (u.marca || '') + ' ' + (u.modelo || '') + ' ' + (u.anio || ''),
                sub: '$' + Number(u.precio || 0).toLocaleString('es-MX') + ' · ' + (u.estado || 'Disponible'),
                run: function () { closeModal(); navigateTo('auto-unidades'); }
            });
        }
    });
    // 4. Propiedades
    ((db.inmPublica && db.inmPublica.props) || []).forEach(function(p){
        if (match((p.titulo || '') + ' ' + (p.colonia || '') + ' ' + (p.ciudad || ''))) {
            hits.push({
                cat: 'Propiedad Inmobiliaria',
                icon: 'fa-building text-teal-600',
                title: p.titulo || 'Propiedad',
                sub: (p.colonia || '') + ', ' + (p.ciudad || '') + ' · $' + Number(p.precio || 0).toLocaleString('es-MX'),
                run: function () { closeModal(); navigateTo('inm-unidades'); }
            });
        }
    });
    // 5. Usuarios / Mensajes
    (db.users || []).forEach(function(u){
        if (u.id !== currentUser.id && match((u.name || '') + ' ' + (u.email || '') + ' ' + (u.role || ''))) {
            hits.push({
                cat: 'Mensaje Directo',
                icon: 'fa-comments text-amber-700',
                title: u.name || u.username,
                sub: (u.role || '').toUpperCase() + ' · ' + (u.email || ''),
                run: function () { closeModal(); navigateTo('messages'); setTimeout(function () { if (window.openChat) openChat(u.id); }, 120); }
            });
        }
    });
    // 6. Lecciones
    (db.lessons || []).forEach(function(l){
        if (match(l.title + ' ' + (l.description || ''))) {
            hits.push({
                cat: 'Lección Academia',
                icon: 'fa-book-open text-purple-600',
                title: l.title,
                sub: 'Ir a lección académica',
                run: function () { closeModal(); navigateTo('lessons'); }
            });
        }
    });

    const top = hits.slice(0, 18);
    if (!top.length) {
        box.innerHTML = '<p class="text-center text-sm text-slate-400 py-8">Sin resultados para "' + (rawQ || '') + '"</p>';
        return;
    }
    box.innerHTML = top.map(function(h, i){
        return `<div data-bx-hit="${i}" class="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200/80 hover:border-amber-400 hover:bg-amber-50/40 cursor-pointer transition">
            <div class="flex items-center gap-3 min-w-0">
                <div class="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><i class="fas ${h.icon}"></i></div>
                <div class="min-w-0">
                    <p class="text-sm font-semibold text-slate-900 truncate">${h.title}</p>
                    <p class="text-xs text-slate-500 truncate">${h.sub}</p>
                </div>
            </div>
            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 shrink-0 uppercase">${h.cat}</span>
        </div>`;
    }).join('');
    box.onclick = function (e) {
        var el = e.target && e.target.closest ? e.target.closest('[data-bx-hit]') : null;
        if (!el || !box.contains(el)) return;
        var h = top[Number(el.getAttribute('data-bx-hit'))];
        if (h && typeof h.run === 'function') h.run();
    };
};

document.addEventListener('keydown', function(e){
    if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === 'k') {
        if (typeof currentUser !== 'undefined' && currentUser) {
            e.preventDefault();
            window.openGlobalSearch();
        }
    }
});



