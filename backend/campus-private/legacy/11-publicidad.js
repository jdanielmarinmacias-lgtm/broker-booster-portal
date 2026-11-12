/* ============================================================================
 * campus-private/legacy/11-publicidad.js — SECCIÓN PRIVADA (solo con sesión)
 *
 * Material de Publicidad del campus. Antes vivía en el núcleo público
 * (01-core-db-roles-portal.js); se sirve desde /api/campus/* con requireAuth y
 * lo carga js/core/lazy-app.js al entrar al campus. La portada no lo necesita.
 * ========================================================================== */
const PUB_CATS = [['folleto','Folletos'],['imagen','Imagen corporativa'],['redes','Redes sociales'],['video','Videos'],['drive','Material Drive']];
const PUB_RAMOS = ['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
function pubCompanias(){
  const asegs=(db.settings && Array.isArray(db.settings.aseguradoras))?db.settings.aseguradoras.map(a=>a.nombre).filter(Boolean):[];
  return asegs.length?asegs:['Skandia','Plan Seguro','GNP','AXA','Mapfre','HDI','Qualitas'];
}
function renderPublicidad(){
  if(!db.settings) db.settings={};
  if(!Array.isArray(db.settings.publicidad)) db.settings.publicidad=[];
  const puede=['admin','gm','editor','desarrollador'].includes((currentUser.role||'').toLowerCase());
  const f=window.pubFiltros||(window.pubFiltros={q:'',cat:'',comp:'',ramo:''});
  let items=[...db.settings.publicidad].sort((a,b)=>(b.fecha||0)-(a.fecha||0));
  if(f.q){ const q=f.q.toLowerCase(); items=items.filter(p=>((p.titulo||'')+' '+(p.descripcion||'')).toLowerCase().includes(q)); }
  if(f.cat) items=items.filter(p=>p.cat===f.cat);
  if(f.comp) items=items.filter(p=>p.compania===f.comp);
  if(f.ramo) items=items.filter(p=>p.ramo===f.ramo);
  const catLbl=id=>{ const c=PUB_CATS.find(x=>x[0]===id); return c?c[1]:id; };
  return `<div class="max-w-6xl mx-auto p-6">
    <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div>
        <h2 class="text-2xl font-bold text-slate-900 flex items-center gap-2"><i class="fas fa-bullhorn text-emerald-600"></i> Publicidad</h2>
        <p class="text-slate-500 text-sm mt-1">Material descargable y enlaces (Drive o web) para toda la fuerza comercial, organizado por categoría, compañía y ramo.</p>
      </div>
      ${puede?`<button data-bx-click="a122" class="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"><i class="fas fa-plus mr-1"></i> Nuevo contenido</button>`:''}
    </div>
    <div class="bg-white rounded-2xl border border-slate-200 p-4 mb-5 grid md:grid-cols-4 gap-3">
      <div class="relative">
        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
        <input value="${psEscape(f.q)}" data-bx-input="a123" placeholder="Buscar material..." class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
      </div>
      <select data-bx-change="a124" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
        <option value="">Todas las categorías</option>
        ${PUB_CATS.map(([id,lbl])=>`<option value="${id}" ${f.cat===id?'selected':''}>${lbl}</option>`).join('')}
      </select>
      <select data-bx-change="a125" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
        <option value="">Todas las compañías</option>
        ${pubCompanias().map(c=>`<option value="${psEscape(c)}" ${f.comp===c?'selected':''}>${psEscape(c)}</option>`).join('')}
      </select>
      <select data-bx-change="a126" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
        <option value="">Todos los ramos</option>
        ${PUB_RAMOS.map(r=>`<option value="${r}" ${f.ramo===r?'selected':''}>${r}</option>`).join('')}
      </select>
    </div>
    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      ${items.map(p=>`
      <div class="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col hover:shadow-md transition">
        ${pubEsImagen(p)?`<button type="button" data-bx-click="a127" data-p0="${bxE(function(){return p.id})}" title="Ver imagen completa" class="block w-full mb-3 -mx-4 -mt-4"><img src="${p.fileData}" alt="${psEscape(p.titulo)}" class="h-64 sm:h-80 w-full object-cover rounded-t-2xl border-b border-slate-200" loading="lazy"></button>`:''}
        <div class="flex items-start justify-between mb-2">
          <div class="w-10 h-10 rounded-xl bg-emerald-50 grid place-items-center"><i class="fas ${p.tipo==='enlace'?'fa-link':'fa-file-lines'} text-emerald-600"></i></div>
          ${puede?`<div class="flex gap-2"><button data-bx-click="a128" data-p0="${bxE(function(){return p.id})}" class="text-slate-400 hover:text-indigo-600 text-xs"><i class="fas fa-pen"></i></button><button data-bx-click="a129" data-p0="${bxE(function(){return p.id})}" class="text-slate-400 hover:text-red-600 text-xs"><i class="fas fa-trash"></i></button></div>`:''}
        </div>
        <div class="font-semibold text-slate-900 text-sm">${psEscape(p.titulo)}</div>
        ${p.descripcion?`<p class="text-xs text-slate-500 mt-1 flex-1">${psEscape(p.descripcion)}</p>`:'<div class="flex-1"></div>'}
        <div class="flex flex-wrap gap-1.5 mt-3">
          ${p.cat?`<span class="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">${catLbl(p.cat)}</span>`:''}
          ${p.compania?`<span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">${psEscape(p.compania)}</span>`:''}
          ${p.ramo?`<span class="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">${psEscape(p.ramo)}</span>`:''}
        </div>
        <div class="mt-3">
          ${p.fileData?`<a href="${p.fileData}" download="${psEscape(p.archivoNombre||p.titulo)}" class="block text-center px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"><i class="fas fa-download mr-1"></i> Descargar</a>`:''}
          ${p.url?`<a href="${psEscape(p.url)}" target="_blank" rel="noopener" class="block text-center px-3 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"><i class="fas fa-external-link-alt mr-1"></i> Abrir</a>`:''}
        </div>
      </div>`).join('') || '<p class="col-span-3 text-center text-slate-400 py-12 bg-white border rounded-2xl">Sin material todavía. '+(puede?'Usa «Nuevo contenido» para cargar el primero.':'Pide a un editor que cargue el material.')+'</p>'}
    </div>
  </div>`;
}
/* ¿El material subido es una imagen? (data URL image/*) */
/* ¿El contenido de Publicidad es una imagen mostrable? Acepta la ruta relativa
 * del proxy (/media/…) además de data: y URLs absolutas: al reescribir las
 * imágenes a /media/…, la comprobación anterior las descartaba y ningún
 * contenido de Publicidad mostraba su vista previa. */
function pubEsImagen(p){ const f=String((p&&p.fileData)||''); if(!f) return false; if(/^data:image\//i.test(f) || /^blob:/i.test(f)) return true; if(/^image\//i.test(String((p&&p.mime)||''))) return true; return /^\/(media|uploads)\//.test(f) || /(^|\/)[^/?]+\.(png|jpe?g|webp|gif|avif|bmp|svg)(\?|#|$)/i.test(f); }
/* Vista ampliada de la imagen publicitaria (modal ligero) */
function pubVerImagen(id){
  const p=(db.settings&&db.settings.publicidad||[]).find(x=>String(x.id)===String(id));
  if(!p||!pubEsImagen(p)){ showToast('No hay imagen para mostrar','warning'); return; }
  showModal(`<div class="p-4 max-w-3xl w-full text-center">
    <div class="flex items-center justify-between mb-3"><h3 class="text-base font-bold truncate">${psEscape(p.titulo)}</h3><button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button></div>
    <img src="${p.fileData}" alt="${psEscape(p.titulo)}" class="w-full max-h-[78vh] object-contain rounded-xl border border-slate-200 bg-white">
    ${p.descripcion?`<p class="text-xs text-slate-500 mt-2">${psEscape(p.descripcion)}</p>`:''}
  </div>`);
}
function pubFilaArchivo(p){
  return `<div><label class="text-sm font-medium">Archivo (opcional si usas enlace)</label>
  <div class="flex items-center gap-3 mt-1">
    <label class="px-4 py-2 bg-slate-100 rounded-xl cursor-pointer hover:bg-slate-200 text-sm"><i class="fas fa-upload mr-1"></i> Subir documento
      <input type="file" class="hidden" data-bx-change="a130">
    </label>
    <span id="pb-file-name" class="text-xs text-slate-500">${psEscape(p&&p.archivoNombre||'Ningún archivo seleccionado')}</span>
  </div>
  <div id="pb-previa" class="empty:hidden"></div></div>`;
}
/* Previa compacta en el modal al seleccionar archivo (si es imagen) */
function pbPreviaArchivo(){
  const caja=document.getElementById('pb-previa'); if(!caja) return;
  const f=window._pbFileSel;
  if(!f||!f.type||!f.type.startsWith('image/')){ caja.innerHTML=''; return; }
  const reader=new FileReader();
  reader.onload=ev=>{ if(document.getElementById('pb-previa')) caja.innerHTML=`<img loading="lazy" decoding="async" src="${ev.target.result}" class="mt-2 h-32 w-full object-cover rounded-xl border border-slate-200" alt="Vista previa">`; };
  reader.readAsDataURL(f);
}
function openPublicidadModal(id){
  const puede=['admin','gm','editor','desarrollador'].includes((currentUser.role||'').toLowerCase());
  if(!puede){ showToast('No tienes permiso para administrar la publicidad','warning'); return; }
  window._pbFile=null; window._pbFileSel=null;
  const p = id ? (db.settings.publicidad||[]).find(x=>String(x.id)===String(id)) : null;
  showModal(`<div class="p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-4"><h3 class="text-xl font-bold">${p?'Editar':'Nuevo'} contenido publicitario</h3><button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button></div>
    <div class="space-y-3">
      <div><label class="text-sm font-medium">Título *</label><input id="pb-titulo" value="${psEscape(p?p.titulo:'')}" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
      <div><label class="text-sm font-medium">Descripción</label><textarea id="pb-desc" rows="2" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${psEscape(p?p.descripcion:'')}</textarea></div>
      <div class="grid grid-cols-3 gap-2">
        <div><label class="text-xs font-medium text-slate-500">Categoría</label><select id="pb-cat" class="w-full mt-1 px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${PUB_CATS.map(([idc,lbl])=>`<option value="${idc}" ${p&&p.cat===idc?'selected':''}>${lbl}</option>`).join('')}</select></div>
        <div><label class="text-xs font-medium text-slate-500">Compañía</label><select id="pb-comp" class="w-full mt-1 px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="">—</option>${pubCompanias().map(c=>`<option ${p&&p.compania===c?'selected':''}>${psEscape(c)}</option>`).join('')}</select></div>
        <div><label class="text-xs font-medium text-slate-500">Ramo</label><select id="pb-ramo" class="w-full mt-1 px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="">—</option>${PUB_RAMOS.map(r=>`<option ${p&&p.ramo===r?'selected':''}>${r}</option>`).join('')}</select></div>
      </div>
      <div><label class="text-sm font-medium">Enlace (Google Drive, carpeta compartida o web)</label><input id="pb-url" type="url" value="${psEscape(p?p.url:'')}" placeholder="https://drive.google.com/..." class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
      ${pubFilaArchivo(p)}
      <p class="text-[11px] text-slate-400">Consejo: en Google Drive usa «Compartir → Cualquier persona con el enlace → Lector» para que todos puedan abrirlo.</p>
    </div>
    <div class="flex justify-end gap-2 mt-4"><button data-bx-click="a1" class="px-4 py-2 border border-slate-300 rounded-xl">Cancelar</button><button data-bx-click="a131" data-p0="${bxE(function(){return p?p.id:''})}" class="px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700">Guardar</button></div>
  </div>`);
}
function guardarPublicidad(idStr){
  try{
    const titulo=document.getElementById('pb-titulo').value.trim();
    if(!titulo){ showToast('Escribe un título','warning'); return; }
    const item={ titulo, descripcion:document.getElementById('pb-desc').value.trim(), cat:document.getElementById('pb-cat').value, compania:document.getElementById('pb-comp').value, ramo:document.getElementById('pb-ramo').value, url:document.getElementById('pb-url').value.trim() };
    const finalizar=(fileData, archivoNombre)=>{
      if(!db.settings) db.settings={};
      if(!Array.isArray(db.settings.publicidad)) db.settings.publicidad=[];
      const existente=idStr?(db.settings.publicidad.find(x=>String(x.id)===String(idStr))):null;
      if(existente){ Object.assign(existente,item,{ fileData: fileData||existente.fileData||'', archivoNombre: archivoNombre||existente.archivoNombre||'' }); cmLog('Publicidad','Editó contenido',titulo); }
      else { db.settings.publicidad.push({ id:Date.now(), ...item, fileData:fileData||'', archivoNombre:archivoNombre||'', fecha:Date.now() }); cmLog('Publicidad','Agregó contenido',titulo); }
      saveDB(); closeModal(); showToast('Contenido guardado','success'); render();
    };
    /* El archivo va al Storage y se guarda su URL. Antes se guardaba el
     * dataURL base64 dentro de db.settings: un solo documento de MBs que
     * hacía timeout el guardado (HTTP 500) y tardaba en cargar la sección. */
    const file=window._pbFileSel;
    if(file){
      if(window.Media && typeof window.Media.subirOUrl==='function'){
        showToast('Subiendo archivo...','info');
        window.Media.subirOUrl(file,'publicidad',{ title: window._pbFileName||file.name })
          .then(url=>finalizar(url||'', window._pbFileName))
          .catch(err=>{ showToast('No se pudo subir: '+(err.message||err),'error'); finalizar('',''); });
      } else {
        const reader=new FileReader(); reader.onload=ev=>finalizar(ev.target.result, window._pbFileName); reader.readAsDataURL(file);
      }
    }
    else finalizar('','');
  }catch(e){ uiToast('Error: '+e.message); }
}
function borrarPublicidad(id){
  const p=(db.settings&&db.settings.publicidad||[]).find(x=>String(x.id)===String(id)); if(!p) return;
  if(!confirm('¿Eliminar "'+p.titulo+'"?')) return;
  db.settings.publicidad=db.settings.publicidad.filter(x=>String(x.id)!==String(id));
  cmLog('Publicidad','Eliminó contenido',p.titulo);
  saveDB(); render();
}
