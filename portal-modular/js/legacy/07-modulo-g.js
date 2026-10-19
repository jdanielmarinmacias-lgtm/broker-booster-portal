
// === AGENDA PROSPECTOS COMPLETA - PUNTO 5 ===
(function(){
    const FUENTES = [
        {id:'A', nombre:'Familia'},
        {id:'B', nombre:'Amigos propios y de la Familia'},
        {id:'C', nombre:'Vecinos'},
        {id:'D', nombre:'Conocidos de la esposa'},
        {id:'E', nombre:'Conocidos por los hijos'},
        {id:'F', nombre:'Conocidos a través del pasatiempo'},
        {id:'G', nombre:'Conocidos por la iglesia'},
        {id:'H', nombre:'Conocidos a través de Grupos Sociales'},
        {id:'I', nombre:'Conocidos por la actividad de la comunidad'},
        {id:'J', nombre:'Conocidos de antiguos empleos'},
        {id:'K', nombre:'Recién casados'},
        {id:'L', nombre:'Nuevos papás'},
        {id:'M', nombre:'Estrenando casa'},
        {id:'N', nombre:'Nuevo empleo'},
        {id:'O', nombre:'Personas con las que haces negocios'}
    ];
    
    const OPCIONES = {
        ingreso: ['C - Menos de $15,000','16,000 a 26,000','C+ - $26,001 a $36,000','A/B - más de $40,000'],
        edad: ['Menos de 18 años','19 a 25 años','26 a 35 años','36 a 45 años','46 a 55 años','55 a 65 años'],
        ocupacion: ['Estudiante','Ama de Casa','Profesional, Técnico','Emprendedor (iniciando un negocio)','Empresario (negocio con más de 3 años)','Empleado a nivel gerencial','Empleado','Vendedor','Jubilado','Retirado'],
        estadoCivil: ['Soltero, Viudo o Divorciado','Casado O Unión libre','Casado con hijos'],
        tiempo: ['Más de 5 años','2 a 5 años','menos de 2 años'],
        relacion: ['familia o Amigo íntimo','Amigo casual','Conocido'],
        frecuencia: ['Más de 5 veces','De 3 a 5 veces','De 1 a 2 veces','No lo vio'],
        probabilidad: ['Fácilmente','No muy Fácil','Con dificultad','Probablemente no'],
        habilidad: ['Excelente','Buena','Regular','Mala']
    };
    
    function calcularScore(p){
        let s=0;
        s += {'C - Menos de $15,000':1,'16,000 a 26,000':2,'C+ - $26,001 a $36,000':3,'A/B - más de $40,000':4}[p.ingreso]||0;
        s += {'26 a 35 años':3,'36 a 45 años':3,'19 a 25 años':2,'46 a 55 años':2,'Menos de 18 años':1,'55 a 65 años':1}[p.edad]||0;
        s += {'Empresario (negocio con más de 3 años)':4,'Empleado a nivel gerencial':3,'Profesional, Técnico':3,'Emprendedor (iniciando un negocio)':2,'Vendedor':2}[p.ocupacion]||1;
        s += {'Casado con hijos':3,'Casado O Unión libre':2,'Soltero, Viudo o Divorciado':1}[p.estadoCivil]||0;
        s += {'Más de 5 años':3,'2 a 5 años':2,'menos de 2 años':1}[p.tiempo]||0;
        s += {'familia o Amigo íntimo':3,'Amigo casual':2,'Conocido':1}[p.relacion]||0;
        s += {'Más de 5 veces':3,'De 3 a 5 veces':2,'De 1 a 2 veces':1,'No lo vio':0}[p.frecuencia]||0;
        s += {'Fácilmente':4,'No muy Fácil':3,'Con dificultad':2,'Probablemente no':1}[p.probabilidad]||0;
        s += {'Excelente':4,'Buena':3,'Regular':2,'Mala':1}[p.habilidad]||0;
        return s;
    }
    
    function getProspectos(){
        if(!db.expedientesProspectos) db.expedientesProspectos={};
        if(!db.expedientesProspectos[currentUser.id]) db.expedientesProspectos[currentUser.id]={};
        return db.expedientesProspectos[currentUser.id].prospectos || [];
    }
    
    function saveProspectos(list){
        if(!db.expedientesProspectos[currentUser.id]) db.expedientesProspectos[currentUser.id]={};
        db.expedientesProspectos[currentUser.id].prospectos = list;
        db.expedientesProspectos[currentUser.id].nombre = currentUser.name;
        db.expedientesProspectos[currentUser.id].email = currentUser.email;
        db.expedientesProspectos[currentUser.id].fechaActualizacion = new Date().toISOString();
        saveDB();
    }
    
    window.renderAgendaProspectos = function(){
        const prospectos = getProspectos().map(p=>({...p, score: calcularScore(p)})).sort((a,b)=>b.score-a.score);
        
        return `<div class="max-w-7xl mx-auto p-4">
            <div class="bg-white rounded-2xl shadow-sm border p-6">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><span class="font-bold text-red-600">5</span></div>
                        <div>
                            <h1 class="text-2xl font-black text-gray-900">Agenda de Prospectos - Proyecto 200</h1>
                            <p class="text-sm text-gray-600">${prospectos.length} prospectos capturados</p>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="exportarAgenda()" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold">Exportar Excel</button>
                        <button onclick="abrirModalProspecto()" class="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-bold">+ Agregar Prospecto</button>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4 p-3 bg-gray-50 rounded-xl">
                    <select id="filtro-fuente" onchange="filtrarAgenda()" class="p-2 border rounded text-xs bg-white"><option value="">Todas las fuentes</option>${FUENTES.map(f=>`<option value="${f.id}">${f.id}. ${f.nombre}</option>`).join('')}</select>
                    <select id="filtro-ingreso" onchange="filtrarAgenda()" class="p-2 border rounded text-xs bg-white"><option value="">Todos ingresos</option>${OPCIONES.ingreso.map(o=>`<option>${o}</option>`).join('')}</select>
                    <select id="filtro-prob" onchange="filtrarAgenda()" class="p-2 border rounded text-xs bg-white"><option value="">Probabilidad</option>${OPCIONES.probabilidad.map(o=>`<option>${o}</option>`).join('')}</select>
                    <select id="filtro-hab" onchange="filtrarAgenda()" class="p-2 border rounded text-xs bg-white"><option value="">Habilidad ref.</option>${OPCIONES.habilidad.map(o=>`<option>${o}</option>`).join('')}</select>
                    <button onclick="limpiarFiltros()" class="p-2 bg-gray-200 rounded text-xs font-bold">Limpiar</button>
                </div>
                
                <div class="overflow-auto max-h-[60vh] border rounded-xl">
                    <table class="w-full text-xs">
                        <thead class="bg-gray-100 sticky top-0">
                            <tr>
                                <th class="p-2 text-left">#</th>
                                <th class="p-2 text-left">Nombre</th>
                                <th class="p-2">Fuente</th>
                                <th class="p-2">Ingreso</th>
                                <th class="p-2">Edad</th>
                                <th class="p-2">Ocupación</th>
                                <th class="p-2">Relación</th>
                                <th class="p-2">Prob.</th>
                                <th class="p-2">Ref.</th>
                                <th class="p-2">Score</th>
                                <th class="p-2">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="tabla-prospectos">
                            ${prospectos.map((p,i)=>`
                                <tr class="border-t hover:bg-gray-50 ${p.score>=20?'bg-green-50':p.score>=11?'bg-yellow-50':'bg-red-50'}">
                                    <td class="p-2 font-bold">${i+1}</td>
                                    <td class="p-2 font-medium">${p.nombre}</td>
                                    <td class="p-2 text-center"><span class="px-2 py-1 bg-blue-100 text-blue-800 rounded">${p.fuente}</span></td>
                                    <td class="p-2">${(p.ingreso||'').split(' - ')[0]}</td>
                                    <td class="p-2">${(p.edad||'').split(' ')[0]}</td>
                                    <td class="p-2">${(p.ocupacion||'').substring(0,12)}</td>
                                    <td class="p-2">${(p.relacion||'').split(' ')[0]}</td>
                                    <td class="p-2">${p.probabilidad}</td>
                                    <td class="p-2">${p.habilidad}</td>
                                    <td class="p-2 font-bold text-center ${p.score>=20?'text-green-600':p.score>=11?'text-yellow-600':'text-red-600'}">${p.score}</td>
                                    <td class="p-2"><button onclick="editarProspecto('${p.id}')" class="text-blue-600">Editar</button></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${prospectos.length===0?'<div class="p-8 text-center text-gray-500">No hay prospectos. Haz clic en + Agregar Prospecto</div>':''}
                </div>
                
                <div class="mt-4 flex justify-between items-center">
                    <p class="text-xs text-gray-500">Los 10 primeros son tus mejores prospectos (verde). Score máximo: 30</p>
                    <button onclick="finalizarAgenda()" class="px-6 py-2.5 bg-green-600 text-white rounded-xl font-bold">Finalizar y Guardar →</button>
                </div>
            </div>
        </div>
        
        <div id="modal-prospecto" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" ondblclick="if(event.target.id==='modal-prospecto') cerrarModalProspecto()">
            <div class="relative bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-auto p-6" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">
                <div class="flex items-center justify-between mb-4">
                    <h3 class="text-xl font-black" id="modal-titulo">Nuevo Prospecto</h3>
                    <button type="button" onclick="cerrarModalProspecto()" aria-label="Cerrar" class="w-8 h-8 rounded-full bg-gray-100 hover:bg-red-100 text-gray-500 hover:text-red-600 flex items-center justify-center transition"><i class="fas fa-times"></i></button>
                </div>
                <div class="grid md:grid-cols-2 gap-3">
                    <div class="md:col-span-2"><label class="text-xs font-bold">Nombre completo *</label><input id="mp-nombre" class="w-full p-2 border rounded bg-white"></div>
                    <div><label class="text-xs font-bold">Fuente (A-O) *</label><select id="mp-fuente" class="w-full p-2 border rounded bg-white">${FUENTES.map(f=>`<option value="${f.id}">${f.id}. ${f.nombre}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Ingreso Mensual</label><select id="mp-ingreso" class="w-full p-2 border rounded bg-white">${OPCIONES.ingreso.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Edad</label><select id="mp-edad" class="w-full p-2 border rounded bg-white">${OPCIONES.edad.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Ocupación</label><select id="mp-ocupacion" class="w-full p-2 border rounded bg-white">${OPCIONES.ocupacion.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Estado Civil</label><select id="mp-estado" class="w-full p-2 border rounded bg-white">${OPCIONES.estadoCivil.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Tiempo de conocerlo</label><select id="mp-tiempo" class="w-full p-2 border rounded bg-white">${OPCIONES.tiempo.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Tipo de Relación</label><select id="mp-relacion" class="w-full p-2 border rounded bg-white">${OPCIONES.relacion.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Frecuencia último año</label><select id="mp-frecuencia" class="w-full p-2 border rounded bg-white">${OPCIONES.frecuencia.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Probabilidad de Acercamiento</label><select id="mp-probabilidad" class="w-full p-2 border rounded bg-white">${OPCIONES.probabilidad.map(o=>`<option>${o}</option>`).join('')}</select></div>
                    <div><label class="text-xs font-bold">Habilidad para Referencias</label><select id="mp-habilidad" class="w-full p-2 border rounded bg-white">${OPCIONES.habilidad.map(o=>`<option>${o}</option>`).join('')}</select></div>
                </div>
                <div class="flex gap-2 mt-6">
                    <button onclick="cerrarModalProspecto()" class="flex-1 py-2 border rounded-xl">Cancelar</button>
                    <button onclick="guardarProspecto()" class="flex-1 py-2 bg-red-600 text-white rounded-xl font-bold">Guardar</button>
                </div>
            </div>
        </div>`;
    };
    
    window.abrirModalProspecto = function(id=null){
        document.getElementById('modal-prospecto').classList.remove('hidden');
        window.editandoId = id;
        if(id){
            const p = getProspectos().find(x=>x.id===id);
            document.getElementById('modal-titulo').textContent = 'Editar Prospecto';
            document.getElementById('mp-nombre').value = p.nombre||'';
            document.getElementById('mp-fuente').value = p.fuente||'A';
            ['ingreso','edad','ocupacion','estado','tiempo','relacion','frecuencia','probabilidad','habilidad'].forEach(k=>{
                const el = document.getElementById('mp-'+k);
                if(el && p[k]) el.value = p[k];
            });
        } else {
            document.getElementById('modal-titulo').textContent = 'Nuevo Prospecto';
            document.querySelectorAll('#modal-prospecto input, #modal-prospecto select').forEach(e=>{if(e.tagName==='INPUT')e.value='';});
        }
    };
    
    window.cerrarModalProspecto = function(){
        document.getElementById('modal-prospecto').classList.add('hidden');
    };
    
    window.guardarProspecto = function(){
        const nombre = document.getElementById('mp-nombre').value.trim();
        if(!nombre){alert('Nombre requerido'); return;}
        const p = {
            id: window.editandoId || 'p'+Date.now(),
            nombre,
            fuente: document.getElementById('mp-fuente').value,
            ingreso: document.getElementById('mp-ingreso').value,
            edad: document.getElementById('mp-edad').value,
            ocupacion: document.getElementById('mp-ocupacion').value,
            estadoCivil: document.getElementById('mp-estado').value,
            tiempo: document.getElementById('mp-tiempo').value,
            relacion: document.getElementById('mp-relacion').value,
            frecuencia: document.getElementById('mp-frecuencia').value,
            probabilidad: document.getElementById('mp-probabilidad').value,
            habilidad: document.getElementById('mp-habilidad').value,
            fecha: new Date().toISOString()
        };
        p.score = calcularScore(p);
        let list = getProspectos();
        if(window.editandoId){
            list = list.map(x=>x.id===window.editandoId?p:x);
        } else {
            list.push(p);
        }
        saveProspectos(list);
        cerrarModalProspecto();
        document.getElementById('main-content').innerHTML = renderAgendaProspectos();
        showToast('Prospecto guardado','success');
    };
    
    window.editarProspecto = abrirModalProspecto;
    
    window.filtrarAgenda = function(){
        const f1 = document.getElementById('filtro-fuente').value;
        const f2 = document.getElementById('filtro-ingreso').value;
        const f3 = document.getElementById('filtro-prob').value;
        const f4 = document.getElementById('filtro-hab').value;
        let list = getProspectos().map(p=>({...p, score: calcularScore(p)})).sort((a,b)=>b.score-a.score);
        if(f1) list = list.filter(p=>p.fuente===f1);
        if(f2) list = list.filter(p=>p.ingreso===f2);
        if(f3) list = list.filter(p=>p.probabilidad===f3);
        if(f4) list = list.filter(p=>p.habilidad===f4);
        document.getElementById('tabla-prospectos').innerHTML = list.map((p,i)=>`
            <tr class="border-t hover:bg-gray-50">
                <td class="p-2 font-bold">${i+1}</td>
                <td class="p-2">${p.nombre}</td>
                <td class="p-2 text-center"><span class="px-2 py-1 bg-blue-100 rounded">${p.fuente}</span></td>
                <td class="p-2">${(p.ingreso||'').split(' ')[0]}</td>
                <td class="p-2">${p.edad}</td>
                <td class="p-2">${(p.ocupacion||'').substring(0,10)}</td>
                <td class="p-2">${p.relacion}</td>
                <td class="p-2">${p.probabilidad}</td>
                <td class="p-2">${p.habilidad}</td>
                <td class="p-2 font-bold text-center ${p.score>=20?'text-green-600':p.score>=11?'text-yellow-600':'text-red-600'}">${p.score}</td>
                <td class="p-2"><button onclick="editarProspecto('${p.id}')" class="text-blue-600">Editar</button></td>
            </tr>
        `).join('');
    };
    
    window.limpiarFiltros = function(){
        ['filtro-fuente','filtro-ingreso','filtro-prob','filtro-hab'].forEach(id=>document.getElementById(id).value='');
        filtrarAgenda();
    };
    
    window.exportarAgenda = function(){
        const list = getProspectos().map(p=>({...p, score: calcularScore(p)})).sort((a,b)=>b.score-a.score);
        let csv = 'Ranking,Nombre,Fuente,Ingreso,Edad,Ocupacion,EstadoCivil,Tiempo,Relacion,Frecuencia,Probabilidad,Habilidad,Score,Color\n';
        list.forEach((p,i)=>{
            const color = p.score>=20?'VERDE':p.score>=11?'AMARILLO':'ROJO';
            csv += `${i+1},"${p.nombre}","${p.fuente}","${p.ingreso}","${p.edad}","${p.ocupacion}","${p.estadoCivil}","${p.tiempo}","${p.relacion}","${p.frecuencia}","${p.probabilidad}","${p.habilidad}",${p.score},"${color}"
`;
        });
        const blob = new Blob([csv],{type:'text/csv'});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'Agenda_Prospectos_'+currentUser.name.replace(/\s/g,'_')+'.csv';
        a.click();
    };
    
    window.finalizarAgenda = function(){
        const list = getProspectos().map(p=>({...p, score: calcularScore(p)}));
        if(list.length<10){ if(!confirm('Tienes menos de 10 prospectos. ¿Continuar?')) return; }
        const tieneVerde = list.some(p=>p.score>=20);
        if(!tieneVerde){ alert('Necesitas al menos 1 prospecto en VERDE (20+ puntos) para finalizar.'); return; }
        markProspectStep(currentUser.id,'agenda-prospectos',{total:list.length, fecha:new Date().toISOString()});
        if(!db.expedientesProspectos[currentUser.id]) db.expedientesProspectos[currentUser.id]={};
        db.expedientesProspectos[currentUser.id].completado = true;
        saveDB();
        alert('¡Agenda completada! '+list.length+' prospectos guardados. Tu reclutador los revisará.');
    };
})();

        
        function renderResultadosProspectos(){
            if(!isAdmin(currentUser) && !isGM(currentUser) && (currentUser.role||'').toLowerCase()!=='desarrollador'){
                return '<div class="p-8 text-center">Sin permisos</div>';
            }
            const prospectUsers = (db.users||[]).filter(u=> (u.role||'').toLowerCase()==='prospecto');
            const rows = prospectUsers.map(u=>{
                const prog = (typeof getProspectProgress==='function'?getProspectProgress(u.id):{});
                const data1 = (db.prospectos||{})[u.id] || {};
                const expData = prog['mi-experiencia_data'] || data1 || {};
                const agenda = ((db.expedientesProspectos||{})[u.id]||{}).prospectos || [];
                const agendaScores = agenda.map(p=>({...p, score: p.score || (typeof calcularScore==='function'?calcularScore(p):0)}));
                const verdes = agendaScores.filter(p=>p.score>=20).length;
                const amarillos = agendaScores.filter(p=>p.score>=11 && p.score<=19).length;
                const rojos = agendaScores.filter(p=>p.score<=10).length;
                const topScore = agendaScores.length? Math.max(...agendaScores.map(p=>p.score)) : 0;
                const detalleId = 'detalle-'+u.id;
                const agendaHtml = agendaScores.length ? agendaScores.sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="flex justify-between py-1 border-b last:border-0">
                    <span class="font-medium">${i+1}. ${p.nombre}</span>
                    <span class="font-bold ${p.score>=20?'text-green-600':p.score>=11?'text-yellow-600':'text-red-600'}">${p.score} pts - ${p.score>=20?'VERDE':p.score>=11?'AMARILLO':'ROJO'}</span>
                </div>`).join('') : '<div class="text-gray-500 text-center py-4">Sin prospectos capturados</div>';
                const experienciaHtml = prog['mi-experiencia'] ? `<div class="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-200">
                    <div class="font-bold text-blue-900 mb-2 flex items-center gap-2"><i class="fa-solid fa-id-badge"></i> Mi Experiencia</div>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div><span class="font-semibold text-gray-700">1. Experiencia laboral:</span><div class="bg-white p-2 rounded mt-1 whitespace-pre-wrap">${(expData.experiencia_laboral||'No capturado').replace(/</g,'&lt;')}</div></div>
                        <div><span class="font-semibold text-gray-700">2. Perspectiva ingresos:</span><div class="bg-white p-2 rounded mt-1 whitespace-pre-wrap">${(expData.perspectiva_ingresos||'No capturado').replace(/</g,'&lt;')}</div></div>
                        <div><span class="font-semibold text-gray-700">3. Equipo ventas:</span><div class="bg-white p-2 rounded mt-1">${expData.equipo_ventas||'—'}</div></div>
                        <div><span class="font-semibold text-gray-700">4. Oficina:</span><div class="bg-white p-2 rounded mt-1">${expData.oficina||'—'}</div></div>
                        <div class="md:col-span-2"><span class="font-semibold text-gray-700">5. Motivo:</span><div class="bg-white p-2 rounded mt-1 whitespace-pre-wrap">${(expData.motivo||'No capturado').replace(/</g,'&lt;')}</div></div>
                    </div>
                </div>` : '<div class="mb-4 p-3 bg-gray-50 rounded-xl text-center text-gray-500 text-xs">Mi Experiencia no completada</div>';
                const detalleHtml = experienciaHtml + `<div class="bg-white rounded-xl border p-3 max-h-64 overflow-auto"><div class="font-bold mb-2 text-sm">Agenda de ${u.name||'prospecto'} (${agendaScores.length} contactos):</div>${agendaHtml}</div>`;
                return `<tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="document.getElementById('${detalleId}').classList.toggle('hidden')">
                    <td class="p-2 font-medium">${u.name||''} <i class="fa-solid fa-chevron-down ml-1 text-gray-400 text-xs"></i></td>
                    <td class="p-2 text-xs">${u.email||''}</td>
                    <td class="p-2 text-center">${prog['mi-experiencia']?'<span class="text-green-600">✓</span>':'<span class="text-gray-400">—</span>'}</td>
                    <td class=\"p-2 text-center\">${prog['mi-experiencia']?`<button onclick=\"event.stopPropagation(); document.getElementById('${detalleId}').classList.toggle('hidden')\" class=\"text-blue-600 hover:underline text-xs font-medium\"><i class=\"fa-solid fa-eye mr-1\"></i>Ver</button>`:'<span class=\"text-gray-400\">—</span>'}</td>
                    <td class="p-2 text-center">${prog['oferta-valor']?'<span class="text-green-600">✓</span>':'—'}</td>
                    <td class="p-2 text-center">${prog['plan-carrera']?'<span class="text-green-600">✓</span>':'—'}</td>
                    <td class="p-2 text-center font-bold">${agenda.length}</td>
                    <td class="p-2 text-center"><span class="text-green-600 font-bold">${verdes}</span> / <span class="text-yellow-600">${amarillos}</span> / <span class="text-red-600">${rojos}</span></td>
                    <td class="p-2 text-center font-bold ${topScore>=20?'text-green-600':topScore>=11?'text-yellow-600':'text-red-600'}">${topScore}</td>
                    <td class="p-2 text-center">${prog['agenda-prospectos']?'<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">COMPLETADO</span>':''}</td>
                </tr>
                <tr id="${detalleId}" class="hidden bg-gray-50"><td colspan="10" class="p-4"><div class="bg-white rounded-xl border p-3 max-h-64 overflow-auto"><div class="font-bold mb-2 text-sm">Agenda de ${u.name||'prospecto'} (${agendaScores.length} contactos):</div>${detalleHtml}</div></td></tr>`;
            }).join('');
            return `<div class="max-w-7xl mx-auto p-4">
                <div class="bg-white rounded-2xl shadow-sm border p-6">
                    <div class="flex items-center justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center"><i class="fa-solid fa-user-check text-indigo-600"></i></div>
                            <div>
                                <h1 class="text-2xl font-black">Resultados Prospectos - Punto 1 y 5</h1>
                                <p class="text-sm text-gray-600">${prospectUsers.length} prospectos registrados - Haz clic en una fila para ver detalle</p>
                            </div>
                        </div>
                        <button onclick="exportarResultadosProspectos()" class="px-4 py-2 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 text-sm"><i class="fa-solid fa-file-excel mr-2"></i>Exportar Excel</button>
                    </div>
                    <div class="overflow-auto border rounded-xl max-h-[70vh]">
                        <table class="w-full text-sm">
                            <thead class="bg-gray-100 sticky top-0 text-xs">
                                <tr>
                                    <th class="p-2 text-left">Prospecto</th>
                                    <th class="p-2 text-left">Email</th>
                                    <th class="p-2">P1: Mi Exp.</th>
                                    <th class="p-2">Mi Experiencia</th>
                                    <th class="p-2">P2: Oferta</th>
                                    <th class="p-2">P3: Plan</th>
                                    <th class="p-2">P5: Total Agenda</th>
                                    <th class="p-2">Verdes / Amarillos / Rojos</th>
                                    <th class="p-2">Top Score</th>
                                    <th class="p-2">Estado P5</th>
                                </tr>
                            </thead>
                            <tbody>${rows || '<tr><td colspan=10 class="p-8 text-center text-gray-500">Sin datos</td></tr>'}</tbody>
                        </table>
                    </div>
                    <p class="text-xs text-gray-500 mt-3">Verde ≥20, Amarillo 11-19, Rojo ≤10. Los scores ahora se guardan al capturar.</p>
                </div>
            </div>`;
        }
        window.renderResultadosProspectos = renderResultadosProspectos;

        
        window.verExperiencia = function(uid){
            const prog = (typeof getProspectProgress==='function'?getProspectProgress(uid):{});
            const data = prog['mi-experiencia_data'] || ((db.prospectos||{})[uid] || {});
            const user = (db.users||[]).find(u=>u.id===uid) || {};
            const html = `<div id="modal-exp" class="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4" ondblclick="if(event.target.id==='modal-exp') this.remove()">
                <div class="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto" onclick="event.stopPropagation()" ondblclick="event.stopPropagation()">
                    <div class="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
                        <div>
                            <h3 class="text-xl font-black">Mi Experiencia - ${user.name||'Prospecto'}</h3>
                            <p class="text-xs text-gray-500">${user.email||''}</p>
                        </div>
                        <button onclick="document.getElementById('modal-exp').remove()" class="w-8 h-8 rounded-full hover:bg-gray-100"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    <div class="p-6 space-y-4 text-sm">
                        <div><div class="font-bold text-gray-700 mb-1">1. Experiencia laboral:</div><div class="bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">${(data.experiencia_laboral||'No capturado').replace(/</g,'&lt;')}</div></div>
                        <div><div class="font-bold text-gray-700 mb-1">2. Perspectiva de ingresos:</div><div class="bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">${(data.perspectiva_ingresos||'No capturado').replace(/</g,'&lt;')}</div></div>
                        <div class="grid grid-cols-2 gap-4">
                            <div><div class="font-bold text-gray-700 mb-1">3. Equipo de ventas:</div><div class="bg-gray-50 p-3 rounded-xl">${data.equipo_ventas||'—'}</div></div>
                            <div><div class="font-bold text-gray-700 mb-1">4. Oficina:</div><div class="bg-gray-50 p-3 rounded-xl">${data.oficina||'—'}</div></div>
                        </div>
                        <div><div class="font-bold text-gray-700 mb-1">5. Motivo para unirse:</div><div class="bg-gray-50 p-3 rounded-xl whitespace-pre-wrap">${(data.motivo||'No capturado').replace(/</g,'&lt;')}</div></div>
                    </div>
                    <div class="p-4 border-t text-right">
                        <button onclick="document.getElementById('modal-exp').remove()" class="px-4 py-2 bg-gray-900 text-white rounded-xl font-bold">Cerrar</button>
                    </div>
                </div>
            </div>`;
            document.body.insertAdjacentHTML('beforeend', html);
        };

        window.exportarResultadosProspectos = function(){
            const prospectUsers = (db.users||[]).filter(u=> (u.role||'').toLowerCase()==='prospecto');
            let csv = 'Prospecto,Email,P1_Mi_Experiencia,P2_Oferta_Valor,P3_Plan_Carrera,Total_Agenda,Verdes,Amarillos,Rojos,Top_Score,Estado_P5\n';
            prospectUsers.forEach(u=>{
                const prog = (typeof getProspectProgress==='function'?getProspectProgress(u.id):{});
                const agenda = ((db.expedientesProspectos||{})[u.id]||{}).prospectos || [];
                const agendaScores = agenda.map(p=>({...p, score: p.score || (typeof calcularScore==='function'?calcularScore(p):0)}));
                const verdes = agendaScores.filter(p=>p.score>=20).length;
                const amarillos = agendaScores.filter(p=>p.score>=11 && p.score<=19).length;
                const rojos = agendaScores.filter(p=>p.score<=10).length;
                const topScore = agendaScores.length? Math.max(...agendaScores.map(p=>p.score)) : 0;
                csv += `"${(u.name||'').replace(/"/g,'""')}","${(u.email||'').replace(/"/g,'""')}","${prog['mi-experiencia']?'SI':'NO'}","${prog['oferta-valor']?'SI':'NO'}","${prog['plan-carrera']?'SI':'NO'}",${agenda.length},${verdes},${amarillos},${rojos},${topScore},"${prog['agenda-prospectos']?'COMPLETADO':'PENDIENTE'}"\n`;
                // detalle de cada contacto
                if(agendaScores.length){
                    csv += ' , , , , ,Contacto,Score,Color,,,,\n';
                    agendaScores.sort((a,b)=>b.score-a.score).forEach(p=>{
                        const color = p.score>=20?'VERDE':p.score>=11?'AMARILLO':'ROJO';
                        csv += ` , , , , ,"${p.nombre.replace(/"/g,'""')}",${p.score},${color},,,\n`;
                    });
                }
            });
            const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Resultados_Prospectos_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        };


