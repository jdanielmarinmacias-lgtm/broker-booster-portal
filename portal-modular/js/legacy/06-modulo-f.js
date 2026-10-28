
// === PARCHE PROSPECTO - SECCIONES 3 Y 5 ===
(function(){
    // Asegurar estructuras
    if (!window.db) window.db = {};
    if (!db.expedientesProspectos) db.expedientesProspectos = {};
    if (!Array.isArray(db.notifications)) db.notifications = [];

    // Helper progreso
    window.getProspectProgress = window.getProspectProgress || function(userId){
        const u = db.users.find(x=>x.id===userId);
        return u?.prospectProgress || {};
    };

    // Candados
    window.canAccessProspectStep = function(userId, stepId){
        const user = db.users.find(u=>u.id===userId);
        if (!user) return false;
        if (!user.prospectProgress) user.prospectProgress = {};
        const p = user.prospectProgress;
        if (stepId === 'chat-reclutador') return true;
        if (stepId === 'mi-experiencia') return true;
        if (stepId === 'oferta-valor') return !!p['mi-experiencia'];
        if (stepId === 'plan-carrera') return !!p['oferta-valor'];
        if (stepId === 'agenda-prospectos') return true; // desbloqueado
        return true;
    };

    // Marcar paso
    window.markProspectStep = function(userId, stepId, data={}){
        const user = db.users.find(u=>u.id===userId);
        if (!user) return;
        if (!user.prospectProgress) user.prospectProgress = {};
        user.prospectProgress[stepId] = true;
        user.prospectProgress[stepId+'_fecha'] = new Date().toISOString();
        user.prospectProgress[stepId+'_data'] = data;
        
        if (!db.expedientesProspectos[userId]) {
            db.expedientesProspectos[userId] = {userId, fecha:new Date().toISOString(), datos:{}, nombre:user.name, email:user.email};
        }
        db.expedientesProspectos[userId].datos[stepId] = data;
        db.expedientesProspectos[userId].nombre = user.name;
        db.expedientesProspectos[userId].email = user.email;
        
        if (window.saveDB) saveDB();
        
        // Notificación
        db.notifications.unshift({
            id: Date.now(),
            tipo: 'expediente',
            mensaje: `${user.name} completó ${stepId}`,
            fecha: new Date().toISOString(),
            paraRoles: ['admin','gm','desarrollador'],
            readBy: []
        });
    };

    // SECCIÓN 1 - Mi Experiencia
    window.renderMiExperiencia = function(){
        const p = getProspectProgress(currentUser.id);
        const saved = p['mi-experiencia_data'] || {};
        return `<div class="max-w-3xl mx-auto p-6"><div class="bg-white rounded-2xl shadow-sm border p-8">
            <div class="flex items-center gap-3 mb-6"><div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><span class="font-bold text-red-600">1</span></div>
            <h1 class="text-2xl font-black text-gray-900">Mi experiencia</h1>${p['mi-experiencia']?'<span class="ml-auto bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">COMPLETADO</span>':''}</div>
            <div class="space-y-4">
                <div><label class="text-sm font-bold text-gray-700">1. Experiencia laboral *</label><textarea id="exp-laboral" class="w-full mt-1 p-3 border border-gray-300 rounded-xl bg-white text-gray-900" rows="3" required>${saved.experiencia_laboral||''}</textarea></div>
                <div><label class="text-sm font-bold text-gray-700">2. Perspectiva de ingresos *</label><input id="exp-ingresos" class="w-full mt-1 p-3 border border-gray-300 rounded-xl bg-white text-gray-900" value="${saved.perspectiva_ingresos||''}" required></div>
                <div><label class="text-sm font-bold text-gray-700">3. ¿Equipo de ventas? *</label><select id="exp-equipo" class="w-full mt-1 p-3 border border-gray-300 rounded-xl bg-white text-gray-900" required><option value="">Selecciona</option><option ${saved.equipo_ventas==='Sí'?'selected':''}>Sí</option><option ${saved.equipo_ventas==='No'?'selected':''}>No</option><option ${saved.equipo_ventas==='En proceso'?'selected':''}>En proceso</option></select></div>
                <div><label class="text-sm font-bold text-gray-700">4. ¿Oficina? *</label><select id="exp-oficina" class="w-full mt-1 p-3 border border-gray-300 rounded-xl bg-white text-gray-900" required><option value="">Selecciona</option><option ${saved.oficina==='Sí propia'?'selected':''}>Sí propia</option><option ${saved.oficina==='Sí rentada'?'selected':''}>Sí rentada</option><option ${saved.oficina==='Home office'?'selected':''}>Home office</option><option ${saved.oficina==='No'?'selected':''}>No</option></select></div>
                <div><label class="text-sm font-bold text-gray-700">5. ¿Por qué ser agente? *</label><textarea id="exp-motivo" class="w-full mt-1 p-3 border border-gray-300 rounded-xl bg-white text-gray-900" rows="3" required>${saved.motivo||''}</textarea></div>
            </div>
            <button data-bx-click="a423" type="button" class="mt-6 w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Guardar y continuar →</button>
        </div></div>`;
    };
    
    window.guardarMiExperiencia = function(){
        try {
            const data = {
                experiencia_laboral: document.getElementById('exp-laboral')?.value.trim()||'',
                perspectiva_ingresos: document.getElementById('exp-ingresos')?.value.trim()||'',
                equipo_ventas: document.getElementById('exp-equipo')?.value||'',
                oficina: document.getElementById('exp-oficina')?.value||'',
                motivo: document.getElementById('exp-motivo')?.value.trim()||''
            };
            if (!data.experiencia_laboral || !data.perspectiva_ingresos || !data.equipo_ventas || !data.oficina || !data.motivo) {
                alert('Completa los 5 campos obligatorios'); return;
            }
            markProspectStep(currentUser.id, 'mi-experiencia', data);
            if (window.showToast) showToast('Guardado', 'success');
            setTimeout(()=>navigateTo('oferta-valor'), 500);
        } catch(e){ alert('Error: '+e.message); }
    };

    // SECCIÓN 3 - Plan de Carrera (CORREGIDA)
    window.renderPlanCarrera = function(){
        const progress = getProspectProgress(currentUser.id);
        if (!progress['plan-carrera']) setTimeout(()=>markProspectStep(currentUser.id, 'plan-carrera', {visto:true}), 2000);
        
        const etapas = [
            { tiempo: 'Semana 1-2', titulo: 'PROSPECTO', desc: 'Registro y evaluación inicial', metas: ['Completar Mi experiencia','Revisar Oferta de valor','Entender el plan'] },
            { tiempo: 'Semana 3-4', titulo: 'AGENTE EN DESARROLLO', desc: 'Capacitación básica y simuladores', metas: ['Curso introductorio','Primeras prácticas','Evaluación inicial'] },
            { tiempo: 'Mes 2', titulo: 'AGENTE CON CEDULA', desc: 'Trámite CNSF y primeras ventas', metas: ['Obtener cédula','3 pólizas iniciales','Capacitación producto'] },
            { tiempo: 'Mes 3', titulo: 'AGENTE PRODUCTIVO', desc: 'Cartera inicial y bonos', metas: ['$50k prima mensual','10 clientes activos','Bono productividad'] },
            { tiempo: 'Mes 6-12', titulo: 'AGENTE CONSOLIDADO', desc: 'Cartera estable y especialización', metas: ['$150k prima','Especialidad elegida','Mentoría a nuevos'] },
            { tiempo: 'Año 1+', titulo: 'DESARROLLO A AGENCIA', desc: 'Recluta y desarrolla tu equipo', metas: ['3 agentes reclutados','$500k equipo','Ingresos residuales'] }
        ];
        
        return `<div class="max-w-5xl mx-auto p-6">
            <h1 class="text-3xl font-black mb-2 text-gray-900">Plan de carrera</h1>
            <p class="text-gray-600 mb-8">Tu ruta de crecimiento paso a paso</p>
            <div class="relative">
                <div class="absolute left-8 top-0 bottom-0 w-1 bg-gray-200 hidden md:block"></div>
                ${etapas.map((e,i)=>`
                    <div class="relative flex gap-6 mb-8">
                        <div class="hidden md:flex w-16 h-16 rounded-full ${i===0?'bg-red-600':'bg-gray-300'} items-center justify-center text-white font-black z-10">${i+1}</div>
                        <div class="flex-1 bg-white rounded-2xl border-2 ${i===0?'border-red-200':'border-gray-100'} p-6">
                            <div class="flex items-start justify-between mb-3">
                                <div>
                                    <div class="text-xs font-bold text-red-600 mb-1">${e.tiempo}</div>
                                    <h3 class="text-xl font-black text-gray-900">${e.titulo}</h3>
                                    <p class="text-gray-600 mt-1">${e.desc}</p>
                                </div>
                                ${i===0?'<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold">ESTÁS AQUÍ</span>':''}
                            </div>
                            <div class="mt-4">
                                <p class="text-xs font-bold text-gray-500 mb-2">3 METAS:</p>
                                <div class="grid md:grid-cols-3 gap-2">
                                    ${e.metas.map(m=>`<div class="text-sm flex items-center gap-2"><i class="fas fa-check text-green-500"></i><span class="text-gray-700">${m}</span></div>`).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    };

    // SECCIÓN 5 - Agenda
    window.renderAgendaProspectos = function(){
        const p = getProspectProgress(currentUser.id);
        const saved = p['agenda-prospectos_data'] || {};
        return `<div class="max-w-4xl mx-auto p-6"><div class="bg-white rounded-2xl shadow-sm border p-8">
            <div class="flex items-center gap-3 mb-6"><div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><span class="font-bold text-red-600">5</span></div>
            <h1 class="text-2xl font-black text-gray-900">Agenda de prospectos</h1></div>
            <p class="text-gray-600 mb-4">Pega datos desde Excel o sube archivo .xlsx</p>
            <textarea id="agenda-data" class="w-full h-40 p-4 border border-gray-300 rounded-xl bg-white text-gray-900 font-mono text-sm" placeholder="Pega aquí desde Excel...">${saved.tabla||''}</textarea>
            <div class="mt-3"><label class="text-sm font-bold text-gray-700">Subir archivo</label><input type="file" id="agenda-file" accept=".xlsx,.xls,.csv" class="w-full p-2 border rounded-lg bg-white mt-1"></div>
            <div class="grid md:grid-cols-2 gap-4 mt-4">
                <div><label class="text-sm font-bold text-gray-700">Fecha</label><input id="agenda-fecha" type="date" class="w-full mt-1 p-3 border rounded-xl bg-white" value="${saved.fecha||''}"></div>
                <div><label class="text-sm font-bold text-gray-700">Hora</label><input id="agenda-hora" type="time" class="w-full mt-1 p-3 border rounded-xl bg-white" value="${saved.hora||''}"></div>
            </div>
            <button data-bx-click="a620" type="button" class="mt-6 w-full py-3 bg-green-600 text-white rounded-xl font-bold">Finalizar proceso →</button>
        </div></div>`;
    };

    window.guardarAgendaProspectos = function(){
        try {
            const data = {
                tabla: document.getElementById('agenda-data')?.value||'',
                archivo: document.getElementById('agenda-file')?.files[0]?.name||'',
                fecha: document.getElementById('agenda-fecha')?.value||'',
                hora: document.getElementById('agenda-hora')?.value||''
            };
            markProspectStep(currentUser.id, 'agenda-prospectos', data);
            if (!db.expedientesProspectos[currentUser.id]) db.expedientesProspectos[currentUser.id] = {userId:currentUser.id};
            db.expedientesProspectos[currentUser.id].agenda = data;
            db.expedientesProspectos[currentUser.id].completado = true;
            db.expedientesProspectos[currentUser.id].nombre = currentUser.name;
            db.expedientesProspectos[currentUser.id].email = currentUser.email;
            saveDB();
            alert('Proceso finalizado');
            if (window.showToast) showToast('Expediente completado','success');
        } catch(e){ alert('Error: '+e.message); }
    };

    // Asegurar navigateTo maneje plan-carrera
    const _nav = window.navigateTo;
    window.navigateTo = function(page, opts){
        if (page === 'plan-carrera') {
            window.lastPage = page;
            if (!opts || !opts.keepSidebar) document.getElementById('sidebar')?.classList.add('-translate-x-full');
            document.getElementById('main-content').innerHTML = renderPlanCarrera();
            return;
        }
        if (page === 'agenda-prospectos') {
            window.lastPage = page;
            if (!opts || !opts.keepSidebar) document.getElementById('sidebar')?.classList.add('-translate-x-full');
            document.getElementById('main-content').innerHTML = renderAgendaProspectos();
            return;
        }
        if (page === 'mi-experiencia') {
            window.lastPage = page;
            if (!opts || !opts.keepSidebar) document.getElementById('sidebar')?.classList.add('-translate-x-full');
            document.getElementById('main-content').innerHTML = renderMiExperiencia();
            return;
        }
        _nav(page, opts);
        // Botón oferta valor
        if (page === 'oferta-valor' && currentUser?.role==='prospecto') {
            setTimeout(()=>{
                // botón eliminado para evitar duplicado
            },300);
        }
    };
})();
/* Hook global: refrescar gráficas de Mis Metas tras cada navegación (routers envueltos) */
(function(){
    const _navHook = window.navigateTo;
    window.navigateTo = function(page, opts){
        const r = _navHook ? _navHook.call(this, page, opts) : undefined;
        try{ if(page==='mis-metas' && typeof window.mmRenderCharts==='function'){ setTimeout(function(){ try{ window.mmRenderCharts(); }catch(e){} }, 280); } }catch(e){}
        return r;
    };
})();
