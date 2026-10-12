
// CALCULADORA DE INGRESOS del portal público
function initSimCalc(){
  const primaRange = document.getElementById('primaRange');
  if(!primaRange || primaRange.dataset.simBound) return;
  primaRange.dataset.simBound = '1';
  const primaDisplay = document.getElementById('primaDisplay');
  const commissionAmount = document.getElementById('commissionAmount');
  const commissionBreak = document.getElementById('commissionBreak');
  const ramoRadios = document.querySelectorAll('#public-portal input[name="ramo"]');
  const RATES = { autos: 0.15, vida: 0.22, gmm: 0.18 };
  const fmtMXN = n => new Intl.NumberFormat('es-MX', {style:'currency', currency:'MXN', maximumFractionDigits:0}).format(n);
  function calcUpdate(){
    const prima = parseInt(primaRange.value, 10);
    const checked = document.querySelector('#public-portal input[name="ramo"]:checked');
    const ramo = checked ? checked.value : 'autos';
    const rate = RATES[ramo] || 0.18;
    const comision = Math.round(prima * rate);
    const anual = comision * 12;
    if(primaDisplay) primaDisplay.textContent = fmtMXN(prima);
    if(commissionAmount) commissionAmount.textContent = fmtMXN(comision) + ' /mes';
    if(commissionBreak) commissionBreak.innerHTML = `Prima: ${fmtMXN(prima)}<br>Comisión: <strong>${Math.round(rate*100)}%</strong><br>Anual estimado: <strong>${fmtMXN(anual)}</strong>`;
  }
  primaRange.addEventListener('input', calcUpdate);
  ramoRadios.forEach(r => r.addEventListener('change', calcUpdate));
  calcUpdate();
  // Contador real de socios
  try {
    const el = document.getElementById('socios-activos-count');
    if (el && typeof db !== 'undefined' && db.users) {
      const count = db.users.length;
      el.textContent = count;
    }
  } catch(e){}
}

function agregarAgente(){
    // Solo agentes registrados en "Usuarios" y sin agencia asignada pueden agregarse al equipo
    const rolesAgente=['agente','agente_agencia','agente_desarrollo'];
    const disponibles = db.users.filter(u=>rolesAgente.includes(u.role) && !u.agenciaId && !u.parentId);
    if(!disponibles.length){
        showModal(`<div class="p-6 max-w-sm text-center"><i class="fas fa-circle-info text-3xl text-slate-300"></i><h3 class="font-bold mt-2">Sin agentes disponibles</h3><p class="text-sm text-slate-500 mt-2">No hay agentes libres por asignar. Crea primero el agente en <strong>Usuarios</strong> (rol Agente en Desarrollo o Agente de Agencia); solo aparecerán aquí los que aún no pertenezcan a una agencia.</p><div class="mt-4"><button onclick="closeModal()" class="px-4 py-2 border rounded-lg">Entendido</button></div></div>`);
        return;
    }
    const opts = disponibles.map(u=>`<option value="${u.id}">${escapeHTML(u.name||u.nombre||'')} (${escapeHTML(u.email||'')})</option>`).join('');
    showModal(`<form id="af" class="p-4 space-y-3"><h3 class="font-bold">Agregar agente a mi equipo</h3><p class="text-xs text-slate-500">Solo se listan agentes registrados en <strong>Usuarios</strong> (rol Agente en Desarrollo o Agente de Agencia) que todavía no pertenecen a ninguna agencia. También puedes asignar la agencia desde <strong>Usuarios</strong> editando el agente.</p><select name="agenteId" required class="w-full border rounded px-2 py-2 bg-white text-slate-900 border-slate-300">${opts}</select><div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Agregar</button></div></form>`);
    document.getElementById('af').onsubmit=e=>{e.preventDefault();const id=Number(new FormData(e.target).get('agenteId'));const u=db.users.find(x=>x.id===id);if(u&&rolesAgente.includes(u.role)&&!u.agenciaId&&!u.parentId){u.agenciaId=currentUser.id;u.agencia=currentUser.id;u.parentId=currentUser.id;u.assignedTo=currentUser.id;saveDB();}closeModal();render();};
}
function quitarAgente(id){
    if(!confirm('¿Quitar agente del equipo?')) return;
    const u=db.users.find(x=>x.id===id);if(u){delete u.agenciaId;delete u.agencia;delete u.parentId;delete u.assignedTo;saveDB();render();}
}

function asignarMeta(id){
    const a=db.users.find(u=>u.id===id);
    showModal(`<form id="mf" class="p-4 space-y-2"><h3 class="font-bold">Meta para ${a.name}</h3><select name="periodo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></select><div class="grid grid-cols-3 gap-2"><input name="anio" type="number" value="${new Date().getFullYear()}" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="mes" type="number" placeholder="Mes" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="trimestre" type="number" placeholder="Trim" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>DAÑOS</option><option>AUTOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><input name="objetivo" type="number" placeholder="Prima neta objetivo" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('mf').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.id=Date.now();d.agenteId=id;d.agenciaId=a.agenciaId;d.objetivo=Number(d.objetivo);d.anio=Number(d.anio);d.mes=d.mes?Number(d.mes):null;d.trimestre=d.trimestre?Number(d.trimestre):null;db.metas=db.metas||[];db.metas=db.metas.filter(m=>!(m.agenteId===id&&m.periodo===d.periodo&&m.ramo===d.ramo&&m.anio===d.anio));db.metas.push(d);saveDB();closeModal();render();};
}
function registrarVenta(id){
    const a=db.users.find(u=>u.id===id);
    showModal(`<form id="vf" class="p-4 space-y-2"><h3 class="font-bold">Registrar venta - ${a.name}</h3><input name="contratante" placeholder="Contratante" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="fecha" type="date" required value="${new Date().toISOString().split('T')[0]}" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>DAÑOS</option><option>AUTOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><select name="compania" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>AXA</option><option>PS</option><option>MAPFRE</option><option>HDI</option><option>QLTS</option><option>SKANDIA</option><option>OTROS</option></select><input name="producto" placeholder="Producto" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="prima" type="number" placeholder="Prima neta" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-emerald-600 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('vf').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const v={id:Date.now(),agenteId:id,agenciaId:a.agenciaId,contratante:f.get('contratante'),fecha:f.get('fecha'),ramo:f.get('ramo'),compania:f.get('compania'),producto:f.get('producto'),prima:Number(f.get('prima'))};db.ventas=db.ventas||[];db.ventas.push(v); try{ const agente = db.users.find(u=>String(u.id)===String(v.agenteId)); if(agente) enviarAviso('ventas', [agente], {total: '$'+(v.prima||0).toLocaleString('es-MX'), mes: new Date(v.fecha).toLocaleDateString('es-MX',{month:'long'})}); }catch(e){} if(!db.notifications) db.notifications=[]; db.notifications.push({id:Date.now(),type:'venta',msg:'Nueva venta: '+(v.cliente||'Cliente')+' - $'+Number(v.prima).toLocaleString('es-MX'),agente:v.agente||currentUser.id,ts:new Date().toISOString(),readBy:[]}); saveDB();closeModal();render();};
}

function borrarConv(id){
    if(!confirm('¿Borrar convención?')) return;
    db.convenciones = (db.convenciones||[]).filter(c=>c.id!==id);
    saveDB(); render();
}
function openConv(){
    showModal(`<form id="cf" class="p-4 space-y-2 max-w-md"><h3 class="font-bold">Nueva Convención</h3><input name="nombre" placeholder="Nombre" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="destino" placeholder="Destino" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="imagenFile" type="file" accept="image/*" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="grid grid-cols-2 gap-2"><input name="fechaInicio" type="date" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="fechaFin" type="date" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><select name="periodo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual" selected>Anual</option></select><div class="grid grid-cols-2 gap-2"><input name="metaVIDA" type="number" placeholder="Meta VIDA" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaGMM" type="number" placeholder="Meta GMM" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaDANOS" type="number" placeholder="Meta DAÑOS" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaAUTOS" type="number" placeholder="Meta AUTOS" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaINV" type="number" placeholder="Meta INVERSIÓN" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaINV Elite" type="number" placeholder="Meta INVERSIÓN ELITE" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><div class="flex justify-end gap-2"><button type="button" onclick="closeModal()" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('cf').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const file=f.get('imagenFile');const reader=new FileReader();reader.onload=()=>{const d={id:Date.now(),nombre:f.get('nombre'),destino:f.get('destino'),fechaInicio:f.get('fechaInicio'),fechaFin:f.get('fechaFin'),periodo:f.get('periodo'),imagen:reader.result,metas:{VIDA:Number(f.get('metaVIDA')||0),GMM:Number(f.get('metaGMM')||0),DAÑOS:Number(f.get('metaDANOS')||0),AUTOS:Number(f.get('metaAUTOS')||0),'INVERSIÓN':Number(f.get('metaINV')||0),'INVERSIÓN ELITE':Number(f.get('metaINV Elite')||0)},creadoPor:currentUser.id,agenciaId:(currentUser.role||'').toLowerCase()==='maestro'?currentUser.id:null};db.convenciones=db.convenciones||[];db.convenciones.push(d);saveDB();closeModal();render();}; if(file&&file.size){reader.readAsDataURL(file);}else{reader.onload();}};
}
