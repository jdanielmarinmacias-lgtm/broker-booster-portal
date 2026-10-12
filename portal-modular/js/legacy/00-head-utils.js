
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
        showModal('<form id="editV" class="p-6 space-y-3"><h3 class="font-bold text-lg">Editar Venta</h3><input name="contratante" value="'+(v.contratante||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300" placeholder="Contratante"><input name="fecha" type="date" value="'+(v.fecha||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><select name="ramo" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">                        <option'+(v.ramo==='VIDA'?' selected':'')+'>VIDA</option><option'+(v.ramo==='GMM'?' selected':'')+'>GMM</option><option'+(v.ramo==='DAÑOS'?' selected':'')+'>DAÑOS</option><option'+(v.ramo==='AUTOS'?' selected':'')+'>AUTOS</option><option'+(v.ramo==='INVERSIÓN'?' selected':'')+'>INVERSIÓN</option><option'+(v.ramo==='INVERSIÓN ELITE'?' selected':'')+'>INVERSIÓN ELITE</option></select><select name="compania" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><option'+(v.compania==='AXA'?' selected':'')+'>AXA</option><option'+(v.compania==='PS'?' selected':'')+'>PS</option><option'+(v.compania==='MAPFRE'?' selected':'')+'>MAPFRE</option><option'+(v.compania==='HDI'?' selected':'')+'>HDI</option><option'+(v.compania==='QLTS'?' selected':'')+'>QLTS</option><option'+(v.compania==='OTROS'?' selected':'')+'>OTROS</option></select><input name="producto" value="'+(v.producto||'')+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300" placeholder="Producto"><input name="prima" type="number" value="'+(v.prima||0)+'" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"><div class="flex gap-2"><button type="button" onclick="closeModal()" class="flex-1 border py-2 rounded">Cancelar</button><button class="flex-1 bg-indigo-600 text-white py-2 rounded">Guardar</button></div></form>');
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

function verAuditoriaVentas(){
    try{
        if (typeof db === 'undefined') { console.log('verAuditoriaVentas: db no disponible'); return; }
    const logs=(db.auditoria||[]).filter(l=>l.tipo&&l.tipo.includes('venta')).slice(-50).reverse();
    let html='<div class="p-6"><h3 class="font-bold text-lg mb-3">Auditoría</h3><div class="max-h-96 overflow-auto"><table class="w-full text-xs"><thead><tr class="bg-slate-100"><th class="p-2 text-left">Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>';
    logs.forEach(l=>{ html+='<tr class="border-t"><td class="p-1">'+new Date(l.fecha).toLocaleString('es-MX')+'</td><td class="p-1">'+(l.usuarioNombre||'')+'</td><td class="p-1">'+l.tipo+'</td><td class="p-1">'+(l.antes?.contratante||'')+' $'+(l.antes?.prima||0)+'</td></tr>'; });
    html+='</tbody></table></div><div class="text-right mt-3"><button aria-label="Cerrar" onclick="closeModal()" class="border px-3 py-1 rounded">Cerrar</button></div></div>';
    showModal(html);
    }catch(e){ console.log('verAuditoriaVentas error', e); alert('Error auditoría: '+e.message); }
}


