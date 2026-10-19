
        // Sistema de Noticias v4 — banda automática: recoge novedades de TODAS las secciones
        const NEWS_VENTANA_NUEVO = 48*60*60*1000; // una noticia se marca NUEVO durante 48 h
        const NEWS_MAX_ITEMS = 14;
        function newsTs(...vals){
            for(const v of vals){
                if(v===undefined||v===null||v==='') continue;
                const n = typeof v==='number' ? v : new Date(v).getTime();
                if(!isNaN(n) && n>0) return n;
            }
            return 0;
        }
        function newsHace(ts){
            if(!ts) return '';
            const d = Date.now()-ts;
            if(d < 0) return new Date(ts).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
            if(d < 60e3) return 'hace un momento';
            if(d < 3600e3) return 'hace '+Math.floor(d/60e3)+' min';
            if(d < 86400e3) return 'hace '+Math.floor(d/3600e3)+' h';
            if(d < 7*86400e3) return 'hace '+Math.floor(d/86400e3)+' d';
            return new Date(ts).toLocaleDateString('es-MX',{day:'2-digit',month:'short'});
        }
        function newsRol(u){
            const r=(u.role||'').toLowerCase();
            return ({gm:'GM',admin:'Administrador',desarrollador:'Desarrollador',agencia:'Agencia',agente:'Agente','agente_agencia':'Agente de Agencia','agente_desarrollo':'Agente en Desarrollo',maestro:'Capacitador',capacitador:'Capacitador',alumno:'Alumno',editor:'Editor'})[r] || (u.role||'usuario');
        }
        // Genera las noticias desde todas las colecciones del portal
        function newsItems(){
            const out=[];
            try{ (db.clientes||[]).forEach(c=> out.push({icon:'fa-user-plus',sec:'Cliente',txt:(c.nombre||'Cliente')+(c.compania?' · '+c.compania:'')+(c.ramo?' · '+c.ramo:''),ts:newsTs(c.fecha,c.fechaAlta,c.creado)})); }catch(e){}
            try{ (db.users||[]).forEach(u=>{ const ts=newsTs(u.creadoEn,u.creado,u.fechaAlta,(Number(u.id)>1e12?Number(u.id):0)); if(ts) out.push({icon:'fa-id-badge',sec:'Usuario',txt:(u.name||u.username||'')+' ('+newsRol(u)+')',ts:ts}); }); }catch(e){}
            try{ (db.cotizaciones||[]).forEach(s=>{ out.push({icon:'fa-file-signature',sec:'Cotización',txt:(s.id||'')+' · '+(s.ramoNombre||s.ramo||'')+' — '+((s.cliente&&s.cliente.nombre)||'cliente')+((s.estado)?' ('+(((typeof COT_ESTADO_LABEL!=='undefined')&&COT_ESTADO_LABEL[s.estado])||s.estado)+')':''),ts:newsTs(s.creado)}); const ia=s.cotizacion&&s.cotizacion.ia; if(ia) out.push({icon:'fa-wand-magic-sparkles',sec:'Análisis IA',txt:'póliza analizada para '+(s.id||'')+' — '+((s.cliente&&s.cliente.nombre)||'cliente'),ts:newsTs(ia.fecha,s.creado)}); }); }catch(e){}
            try{ (db.siniestros||[]).forEach(s=> out.push({icon:(s.tipo==='cancelacion')?'fa-ban':'fa-triangle-exclamation',sec:(s.tipo==='cancelacion')?'Cancelación':'Siniestro',txt:(s.clienteNombre||'cliente')+(s.compania?' · '+s.compania:'')+(s.estado?' ('+s.estado+')':''),ts:newsTs(s.fechaReporte,s.fechaActualizacion,s.creado)})); }catch(e){}
            try{ (db.ventas||[]).forEach(v=> out.push({icon:'fa-hand-holding-dollar',sec:'Venta',txt:(v.ramo||'')+' — '+(v.contratante||'cliente')+(v.prima?' ($'+Number(v.prima).toLocaleString('es-MX')+')':''),ts:newsTs(v.fecha?(v.fecha+'T12:00:00'):null,(Number(v.id)>1e12?Number(v.id):0))})); }catch(e){}
            try{ (db.solicitudes||[]).forEach(s=> out.push({icon:'fa-envelope-open-text',sec:'Solicitud',txt:(s.nombre||'prospecto')+(s.ciudad?' · '+s.ciudad:'')+(s.tipo?' — '+s.tipo:''),ts:newsTs(s.fecha,s.creado)})); }catch(e){}
            try{ (db.liveClasses||[]).forEach(c=> out.push({icon:'fa-video',sec:'Capacitación',txt:(c.title||'')+' · '+new Date(c.start).toLocaleString('es-MX',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),ts:newsTs(c.creadoEn,(Number(c.id)>1e12?Number(c.id):0),c.start)})); }catch(e){}
            try{ (db.convenciones||[]).forEach(c=> out.push({icon:'fa-umbrella-beach',sec:'Convención',txt:(c.nombre||'')+(c.destino?' · '+c.destino:''),ts:newsTs(c.creadoEn,c.creado,(Number(c.id)>1e12?Number(c.id):0))})); }catch(e){}
            try{ (db.metas||[]).forEach(m=>{ const a=(db.users||[]).find(u=>String(u.id)===String(m.agenteId)); out.push({icon:'fa-bullseye',sec:'Meta',txt:(a?a.name:'agente')+' · '+(m.ramo||'')+(m.objetivo?' · $'+Number(m.objetivo).toLocaleString('es-MX'):''),ts:newsTs(m.creadoEn,(Number(m.id)>1e12?Number(m.id):0))}); }); }catch(e){}
            try{ ((db.guiaBase&&db.guiaBase.docs)||[]).forEach(d=> out.push({icon:'fa-robot',sec:'Gu-IA',txt:'nueva base de conocimiento: '+(d.titulo||''),ts:newsTs(d.fecha,d.creadoEn)})); }catch(e){}
            try{ (db.lessons||[]).slice(-2).forEach(l=> out.push({icon:'fa-book-open',sec:'Lección',txt:l.title||'',ts:newsTs(l.creadoEn,l.creado)})); }catch(e){}
            try{ (db.exams||[]).slice(-2).forEach(x=> out.push({icon:'fa-clipboard-check',sec:'Examen',txt:x.title||'',ts:newsTs(x.creadoEn,x.creado)})); }catch(e){}
            try{ (db.groups||[]).slice(-1).forEach(g=> out.push({icon:'fa-users-rectangle',sec:'Grupo',txt:g.name||'',ts:newsTs(g.creadoEn)})); }catch(e){}
            try{ (db.generations||[]).slice(-1).forEach(g=> out.push({icon:'fa-layer-group',sec:'Generación',txt:g.name||'',ts:newsTs(g.creadoEn)})); }catch(e){}
            try{ const top=[...(db.users||[])].filter(u=>isStudent(u)).sort((a,b)=>(b.xp||0)-(a.xp||0)).slice(0,3); if(top.length) out.push({icon:'fa-trophy',sec:'Ranking',txt:top.map((u,i)=>((i+1)+'° '+u.name+' ('+(u.xp||0)+' XP)')).join(' • '),ts:0}); }catch(e){}
            const conFecha = out.filter(i=>i.ts>0).sort((a,b)=>b.ts-a.ts);
            const sinFecha = out.filter(i=>!(i.ts>0));
            return conFecha.concat(sinFecha).slice(0, NEWS_MAX_ITEMS+4);
        }
        function newsVistoTs(){
            try{ return newsTs(currentUser && currentUser.newsVistoHasta); }catch(e){ return 0; }
        }
        function newsNoVistas(){
            try{
                const visto = newsVistoTs(); const now = Date.now();
                return newsItems().filter(i=>i.ts>0 && i.ts>visto && (now-i.ts)<NEWS_VENTANA_NUEVO).length;
            }catch(e){ return 0; }
        }
        function newsUpdateBadges(){
            try{
                const n = newsNoVistas();
                ['news-badge-nuevas','news-badge-btn'].forEach(id=>{
                    const b=document.getElementById(id); if(!b) return;
                    if(n>0){ b.textContent = n>9?'9+':String(n); b.classList.remove('hidden'); }
                    else { b.classList.add('hidden'); b.textContent='0'; }
                });
            }catch(e){}
        }
        function newsMarcarVistas(){
            try{
                if(currentUser){
                    const iso = new Date().toISOString();
                    currentUser.newsVistoHasta = iso;
                    const udb = (db.users||[]).find(u=>String(u.id)===String(currentUser.id));
                    if(udb) udb.newsVistoHasta = iso;
                    saveDB();
                }
            }catch(e){}
            try{ updateNewsTicker(true); }catch(e){}
        }
        function updateNewsTicker(force = false){
            const ticker = document.getElementById('news-ticker-content');
            if(!ticker || typeof db === 'undefined') return;
            let items=[];
            try{ items = newsItems(); }catch(e){ items=[]; }
            if(!items.length) items = [{icon:'fa-bullhorn',sec:'Bienvenido',txt:'Portal Broker Booster',ts:0}];
            const visto = newsVistoTs(); const now = Date.now();
            const sep = ' <span class="text-slate-500 mx-4">•</span> ';
            const mk = it=>{
                const nuevo = it.ts>0 && it.ts>visto && (now-it.ts)<NEWS_VENTANA_NUEVO;
                return '<span class="mx-8 inline-flex items-center gap-2"><i class="fas '+it.icon+'" style="color: var(--news-accent, #dc2626)"></i> <span class="uppercase tracking-wide text-xs opacity-75">'+escapeHTML(it.sec)+'</span> <strong>'+escapeHTML(it.txt)+'</strong>'+(it.ts>0?' <span class="text-xs opacity-60">'+newsHace(it.ts)+'</span>':'')+(nuevo?' <span class="news-chip-nuevo">NUEVO</span>':'')+'</span>';
            };
            const visibles = items.slice(0, NEWS_MAX_ITEMS);
            const content = visibles.map(mk).join(sep);
            const html = content + sep + content;
            const hash = visto + '¦' + visibles.map(i=>(i.ts+'|'+i.sec+'|'+i.txt)).join('¦');
            if(force || ticker.dataset.newsHash !== hash){
                ticker.dataset.newsHash = hash;
                ticker.innerHTML = html;
            }
            newsUpdateBadges();
        }
        
        document.addEventListener('DOMContentLoaded', () => setTimeout(() => updateNewsTicker(true), 600));
        
        const _origLogin = window.login;
        if (_origLogin) {
            window.login = function(...a){ const r=_origLogin.apply(this,a); setTimeout(()=>{ window._newsKeysPrev=null; updateNewsTicker(true); },900); return r; };
        }
        
        // Refresco instantáneo: cualquier sección que guarda cambios alimenta la banda
        const _origSaveDB = window.saveDB;
        if (typeof _origSaveDB === 'function') {
            window.saveDB = function(...a){
                const r=_origSaveDB.apply(this,a);
                try{ clearTimeout(window._newsTimer); window._newsTimer=setTimeout(()=>updateNewsTicker(true),400); }catch(e){}
                return r;
            };
        }
        
        // Vigilancia cada 20 s: detecta novedades (aunque las genere otra sesión) y avisa
        setInterval(function(){
            try{
                if(!currentUser || document.hidden) return;
                const keys = newsItems().filter(i=>i.ts>0).slice(0,8).map(i=>(i.ts+'|'+i.sec+'|'+i.txt));
                const prev = window._newsKeysPrev;
                window._newsKeysPrev = keys;
                if(!prev){ updateNewsTicker(true); return; }
                const frescas = keys.filter(k=>prev.indexOf(k)<0);
                if(frescas.length){
                    updateNewsTicker(true);
                    const visto = newsVistoTs(); const now = Date.now();
                    const it = newsItems().find(i=>i.ts>0 && frescas.indexOf(i.ts+'|'+i.sec+'|'+i.txt)>=0 && i.ts>visto && (now-i.ts)<NEWS_VENTANA_NUEVO);
                    if(it && typeof window.showToast==='function' && (!window._newsToastAt || Date.now()-window._newsToastAt>60000)){
                        window._newsToastAt = Date.now();
                        window.showToast('📰 '+(it.sec||'Novedad')+': '+it.txt, 'info');
                    }
                } else {
                    newsUpdateBadges();
                }
            }catch(e){}
        }, 20000);

        // --- FASE 1 - PDF REAL ---
        function exportReportsPDF() {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'pt' });
            const s = db.settings || {};
            const primary = s.primaryColor || '#0a2540';
            const accent = s.accent || '#c9a86a';
            
            // Header
            doc.setFillColor(primary);
            doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, 'F');
            if (s.logo) {
                try {
                    doc.addImage(s.logo, 'PNG', 40, 15, 40, 40);
                } catch(e) {}
            }
            doc.setTextColor(255,255,255);
            doc.setFontSize(18);
            doc.text(s.institutionName || 'Academia', 95, 35);
            doc.setFontSize(10);
            doc.text('Reporte de Progreso Académico', 95, 52);
            doc.setTextColor(0,0,0);
            
            // Filtros activos
            const fAlumno = document.getElementById('filter-alumno')?.value || 'all';
            const fCategoria = document.getElementById('filter-categoria')?.value || 'all';
            const fLeccion = document.getElementById('filter-leccion')?.value || 'all';
            const fMaestro = document.getElementById('filter-maestro')?.value || 'all';
            
            const alumnos = db.users.filter(u => isStudent(u));
            const maestros = db.users.filter(u => isTeacher(u));
            
            let data = [];
            alumnos.forEach(al => {
                if (fAlumno !== 'all' && String(al.id) !== fAlumno) return;
                const assignedCats = al.categories || [];
                const lessons = db.lessons.filter(l => assignedCats.length === 0 || assignedCats.includes(l.categoryId));
                const maestrosDelAlumno = maestros.filter(m => (m.students||[]).includes(al.id));
                const maestrosIds = maestrosDelAlumno.map(m=>String(m.id));
                
                lessons.forEach(les => {
                    const cat = db.categories.find(c => c.id === les.categoryId);
                    if (fCategoria !== 'all' && String(cat?.id) !== fCategoria) return;
                    if (fLeccion !== 'all' && String(les.id) !== fLeccion) return;
                    if (fMaestro !== 'all' && !maestrosIds.includes(fMaestro)) return;
                    
                    const prog = db.progress.find(p => p.userId === al.id && p.lessonId === les.id);
                    const estado = !prog ? 'No iniciado' : prog.completed ? 'Completado' : 'En progreso';
                    const score = prog ? (prog.score || 0) + '%' : '-';
                    const fecha = prog && prog.date ? new Date(prog.date).toLocaleDateString('es-MX') : '-';
                    data.push([al.name, cat ? cat.name : '-', les.title, estado, score, fecha]);
                });
            });
            
            // Info filtros
            let filtrosTexto = [];
            if (fAlumno !== 'all') filtrosTexto.push('Alumno: ' + (alumnos.find(a=>String(a.id)===fAlumno)?.name || ''));
            if (fCategoria !== 'all') filtrosTexto.push('Categoría: ' + (db.categories.find(c=>String(c.id)===fCategoria)?.name || ''));
            if (fLeccion !== 'all') filtrosTexto.push('Lección: ' + (db.lessons.find(l=>String(l.id)===fLeccion)?.title || ''));
            if (fMaestro !== 'all') filtrosTexto.push('Maestro: ' + (maestros.find(m=>String(m.id)===fMaestro)?.name || ''));
            
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text('Generado: ' + new Date().toLocaleString('es-MX'), 40, 90);
            if (filtrosTexto.length) {
                doc.text('Filtros: ' + filtrosTexto.join(' | '), 40, 105);
            }
            
            doc.autoTable({
                startY: filtrosTexto.length ? 120 : 105,
                head: [['Alumno', 'Categoría', 'Lección', 'Estado', 'Calificación', 'Fecha']],
                body: data,
                theme: 'grid',
                headStyles: { fillColor: primary, textColor: 255, fontSize: 10 },
                bodyStyles: { fontSize: 9 },
                alternateRowStyles: { fillColor: [248,250,252] },
                margin: { left: 40, right: 40 }
            });
            
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(s.footerText || '', 40, doc.internal.pageSize.getHeight() - 30);
            doc.save('reporte-progreso-' + new Date().toISOString().slice(0,10) + '.pdf');
        }


                function renderEditor() {
            if (!['admin','gm','desarrollador','editor'].includes((currentUser?.role || '').toLowerCase())) {
                return '<div class="p-8 text-center"><p class="text-red-600">Acceso denegado</p></div>';
            }
            
            // Inicializar db.settings
            if (!db.settings) db.settings = {};
            if (!db.settings.hero) db.settings.hero = {titulo1:'Construye tu carrera en la industria financiera', monto:'$27,000', subtitulo:'Desarrollo profesional con formación certificada, acompañamiento cercano y un plan de carrera transparente. Sin inversión inicial.', imagenFondo:'', textoBoton1:'Calcula tu ingreso', textoBoton2:'Conocer el plan de carrera'};
            comisionesPortal();
            if (!db.settings.historias) db.settings.historias = [
                {nombre:'María González', tiempo:'8 meses en la agencia', monto:'$52,000', testimonio:'Pasé de $0 a ingresos estables en 3 meses. El sistema funciona.', foto:''},
                {nombre:'Carlos Ruiz', tiempo:'1 año en la agencia', monto:'$78,000', testimonio:'Las comisiones reales superaron mis expectativas. Sin letras chiquitas.', foto:''},
                {nombre:'Laura Méndez', tiempo:'5 meses en la agencia', monto:'$41,500', testimonio:'Empecé sin experiencia. Hoy tengo mi cartera propia.', foto:''}
            ];
            if (!db.settings.aseguradoras) db.settings.aseguradoras = [
                {nombre:'AXA', logo:''},
                {nombre:'GNP', logo:''},
                {nombre:'MetLife', logo:''}
            ];

            // Funciones de upload globales
            window.uploadImageBase64 = function(input, previewId, hiddenId) {
                const file = input.files[0];
                if (!file) return;
                // Paso 4: si hay backend, la imagen vive en Supabase Storage (URL
                // compartida en tiempo real). Si falla o no hay backend, base64 local.
                if (window.Media && window.Backend && window.Backend.available) {
                    window.Media.subir(file, { scope: 'media' }).then(function(item){
                        if (previewId && document.getElementById(previewId)) {
                            const pv = document.getElementById(previewId);
                            pv.src = item.url; pv.classList.remove('hidden');
                        }
                        if (hiddenId && document.getElementById(hiddenId)) {
                            document.getElementById(hiddenId).value = item.url;
                        }
                        if (window.showToast) window.showToast('Imagen subida','success');
                    }).catch(function(){ uploadImageBase64Local(input, previewId, hiddenId); });
                    return;
                }
                uploadImageBase64Local(input, previewId, hiddenId);
            };
            window.uploadImageBase64Local = function(input, previewId, hiddenId) {
                const file = input.files[0];
                if (!file) return;

                // Comprimir imagen antes de guardar (para evitar límite localStorage)
                const maxWidth = 800; // Para fotos de historias
                const maxHeight = 800;
                const quality = 0.8;
                
                // Si es logo de aseguradora, usar tamaño menor
                const isLogo = hiddenId && hiddenId.includes('logo');
                const targetWidth = isLogo ? 400 : maxWidth;
                const targetHeight = isLogo ? 200 : maxHeight;
                const targetQuality = isLogo ? 0.9 : quality;
                
                const img = new Image();
                const reader = new FileReader();
                
                reader.onload = function(e) {
                    img.src = e.target.result;
                };
                
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    
                    // Calcular nuevo tamaño manteniendo proporción
                    if (width > height) {
                        if (width > targetWidth) {
                            height = Math.round(height * targetWidth / width);
                            width = targetWidth;
                        }
                    } else {
                        if (height > targetHeight) {
                            width = Math.round(width * targetHeight / height);
                            height = targetHeight;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Convertir a base64 comprimido
                    const compressedDataUrl = canvas.toDataURL('image/jpeg', targetQuality);
                    
                    if (previewId && document.getElementById(previewId)) {
                        const preview = document.getElementById(previewId);
                        preview.src = compressedDataUrl;
                        preview.classList.remove('hidden');
                    }
                    if (hiddenId && document.getElementById(hiddenId)) {
                        document.getElementById(hiddenId).value = compressedDataUrl;
                    }
                    
                    // Mostrar ahorro
                    const originalSize = Math.round(e.target.result.length / 1024);
                    const compressedSize = Math.round(compressedDataUrl.length / 1024);
                    console.log(`Imagen comprimida: ${originalSize}KB → ${compressedSize}KB (${Math.round((1-compressedSize/originalSize)*100)}% ahorro)`);
                };
                
                reader.readAsDataURL(file);
            };

            window.agregarAseguradora = function() {
                const cont = document.getElementById('lista-aseguradoras');
                const idx = cont.children.length;
                const div = document.createElement('div');
                div.className = 'aseguradora-item p-3 border rounded-lg bg-slate-50';
                div.innerHTML = '<div class="flex gap-2 items-start"><div class="flex-1 space-y-2"><input placeholder="Nombre aseguradora" class="aseg-nombre w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"><div class="flex items-center gap-2"><input type="file" accept="image/*" onchange="uploadImageBase64(this, \'aseg-prev-'+idx+'\', \'aseg-logo-'+idx+'\')" class="text-xs flex-1 bg-white text-slate-900 border border-slate-300"><img id="aseg-prev-'+idx+'" src="" class="h-8 w-12 object-contain border rounded bg-white hidden"></div><input type="hidden" id="aseg-logo-'+idx+'" class="aseg-logo bg-white text-slate-900 border border-slate-300"></div><button type="button" onclick="this.closest(\'.aseguradora-item\').remove()" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash text-xs"></i></button></div>';
                cont.appendChild(div);
            };

            window.guardarTodoEditor = function() {
                try {
                    // HERO
                    db.settings.hero.titulo1 = document.getElementById('hero-titulo1').value.trim();
                    db.settings.hero.monto = document.getElementById('hero-monto').value.trim();
                    db.settings.hero.subtitulo = document.getElementById('hero-subtitulo').value.trim();
                    db.settings.hero.imagenFondo = document.getElementById('hero-imagen').value.trim();
                    db.settings.hero.textoBoton1 = document.getElementById('hero-btn1').value.trim();
                    db.settings.hero.textoBoton2 = document.getElementById('hero-btn2').value.trim();
                    
                    // CAMINOS (Elige tu camino)
                    db.settings.caminos = db.settings.caminos || {};
                    db.settings.caminos.titulo = document.getElementById('cam-titulo-sec').value.trim();
                    db.settings.caminos.subtitulo = document.getElementById('cam-sub-sec').value.trim();
                    db.settings.caminos.cards = [];
                    for (let ci2=0; ci2<3; ci2++) {
                        const t=document.getElementById('cam-titulo-'+ci2).value.trim();
                        if(!t) continue;
                        db.settings.caminos.cards.push({
                            titulo:t,
                            desc:document.getElementById('cam-desc-'+ci2).value.trim(),
                            items:document.getElementById('cam-items-'+ci2).value.split('\n').map(x=>x.trim()).filter(Boolean),
                            cta:document.getElementById('cam-cta-'+ci2).value.trim()||'Aplicar',
                            origen:document.getElementById('cam-origen-'+ci2).value.trim()||'cero',
                            destacado:document.getElementById('cam-dest-'+ci2).checked
                        });
                    }
                    
                    // TITULOS DE SECCIONES
                    db.settings.caminos.tituloHistorias = document.getElementById('cam-hist-titulo').value.trim();
                    
                    // COMISIONES
                    db.settings.comisiones.vida = parseFloat(document.getElementById('com-vida').value) || 0;
                    db.settings.comisiones.gmm = parseFloat(document.getElementById('com-gmm').value) || 0;
                    db.settings.comisiones.autosUnidad = parseFloat(document.getElementById("com-autosunidad").value); if(isNaN(db.settings.comisiones.autosUnidad)) db.settings.comisiones.autosUnidad = 0.03;
                    db.settings.comisiones.autosFin = parseFloat(document.getElementById("com-autosfin").value); if(isNaN(db.settings.comisiones.autosFin)) db.settings.comisiones.autosFin = 0.30;
                    db.settings.comisiones.propValor = parseFloat(document.getElementById("com-prop").value); if(isNaN(db.settings.comisiones.propValor)) db.settings.comisiones.propValor = 0.03;
                    db.settings.comisiones.autos = db.settings.comisiones.autosUnidad;
                    
                    // HISTORIAS (dinámicas)
                    db.settings.historias = [];
                    document.querySelectorAll('#lista-historias .historia-item').forEach(function(item) {
                        const nombre = item.querySelector('.hist-nombre') ? item.querySelector('.hist-nombre').value.trim() : '';
                        if (!nombre) return;
                        db.settings.historias.push({
                            nombre: nombre,
                            tiempo: item.querySelector('.hist-tiempo') ? item.querySelector('.hist-tiempo').value.trim() : '',
                            monto: item.querySelector('.hist-monto') ? item.querySelector('.hist-monto').value.trim() : '',
                            testimonio: item.querySelector('.hist-test') ? item.querySelector('.hist-test').value.trim() : '',
                            foto: item.querySelector('.hist-foto') ? item.querySelector('.hist-foto').value : ''
                        });
                    });
                    
                    // ASEGURADORAS
                    db.settings.aseguradoras = [];
                    document.querySelectorAll('#lista-aseguradoras .aseguradora-item').forEach(function(item) {
                        const nombre = item.querySelector('.aseg-nombre').value.trim();
                        const logo = item.querySelector('.aseg-logo').value;
                        if (nombre) db.settings.aseguradoras.push({nombre:nombre, logo:logo});
                    });
                    
                    if(!db.inmPublica) db.inmPublica = { props: [] };
                    if(!Array.isArray(db.inmPublica.props)) db.inmPublica.props = [];
                    const nuevosProps = (window.propsGlobales||[]).map(function(p, ix){
                        const prev = db.inmPublica.props[ix];
                        return { id: p.id, titulo: document.getElementById("prop-titulo-"+ix) ? document.getElementById("prop-titulo-"+ix).value.trim() : (p.titulo||""), tipo: p.tipo, precio: Number(document.getElementById("prop-precio-"+ix) ? document.getElementById("prop-precio-"+ix).value : 0) || 0, colonia: document.getElementById("prop-colonia-"+ix) ? document.getElementById("prop-colonia-"+ix).value.trim() : "", ciudad: document.getElementById("prop-ciudad-"+ix) ? document.getElementById("prop-ciudad-"+ix).value.trim() : "", recs: Number(document.getElementById("prop-recs-"+ix) ? document.getElementById("prop-recs-"+ix).value : 0) || 0, banios: Number(document.getElementById("prop-banios-"+ix) ? document.getElementById("prop-banios-"+ix).value : 0) || 0, m2: Number(document.getElementById("prop-m2-"+ix) ? document.getElementById("prop-m2-"+ix).value : 0) || 0, desc: document.getElementById("prop-desc-"+ix) ? document.getElementById("prop-desc-"+ix).value.trim() : "", fotos: p.fotos, vendida: p.vendida };
                    });
                    db.inmPublica.props = nuevosProps;
                    
                    // SERVICIOS
                    if(document.getElementById('serv-titulo')){
                        const gserv = servData();
                        gserv.titulo = document.getElementById('serv-titulo').value.trim() || gserv.titulo;
                        gserv.subtitulo = document.getElementById('serv-subtitulo').value.trim() || gserv.subtitulo;
                        const gruposActuales = gserv.grupos;
                        const nuevosServ = [];
                        document.querySelectorAll('#lista-servicios .serv-item').forEach(function(item) {
                            const n = item.querySelector('.serv-n') ? item.querySelector('.serv-n').value.trim() : '';
                            if (!n) return;
                            nuevosServ.push({
                                g: item.querySelector('.serv-g') ? item.querySelector('.serv-g').value : 'fin',
                                ico: item.querySelector('.serv-ico') ? item.querySelector('.serv-ico').value.trim() : '',
                                n: n,
                                d: item.querySelector('.serv-d') ? item.querySelector('.serv-d').value.trim() : '',
                                tag: item.querySelector('.serv-tag') ? item.querySelector('.serv-tag').value.trim() : ''
                            });
                        });
                        if(nuevosServ.length){ db.settings.servicios = { titulo: gserv.titulo, subtitulo: gserv.subtitulo, grupos: gruposActuales, servicios: nuevosServ }; }
                    }
                    
                    // BLOG
                    if(document.getElementById('blog-titulo')){
                        const gblog = blogData();
                        const postsNuevos = [];
                        document.querySelectorAll('#lista-blog .blog-item').forEach(function(item, bix) {
                            const t = item.querySelector('.blog-tit') ? item.querySelector('.blog-tit').value.trim() : '';
                            if (!t) return;
                            postsNuevos.push({
                                id: 'b'+Date.now()+'-'+bix,
                                ico: item.querySelector('.blog-ico') ? item.querySelector('.blog-ico').value.trim() : '',
                                tag: item.querySelector('.blog-tag') ? item.querySelector('.blog-tag').value.trim() : '',
                                titulo: t,
                                resumen: item.querySelector('.blog-res') ? item.querySelector('.blog-res').value.trim() : '',
                                cuerpo: item.querySelector('.blog-cue') ? item.querySelector('.blog-cue').value : '',
                                fecha: item.querySelector('.blog-fec') ? item.querySelector('.blog-fec').value.trim() : '',
                                autor: item.querySelector('.blog-aut') ? item.querySelector('.blog-aut').value.trim() : ''
                            });
                        });
                        db.settings.blog = {
                            titulo: document.getElementById('blog-titulo').value.trim() || gblog.titulo,
                            subtitulo: document.getElementById('blog-subtitulo').value.trim() || gblog.subtitulo,
                            posts: postsNuevos
                        };
                    }
                    
                    // AVISO DE PRIVACIDAD
                    if(document.getElementById('priv-texto')){
                        db.settings.privacidad = {
                            actualizado: document.getElementById('priv-actualizado').value.trim() || privacidadData().actualizado,
                            texto: document.getElementById('priv-texto').value
                        };
                    }
                    
                    // DATOS EMPRESA
                    if(document.getElementById('emp-ciudad')){
                        if(!db.settings.empresa) db.settings.empresa = {};
                        db.settings.empresa.ciudad = document.getElementById('emp-ciudad').value.trim() || 'San Pedro Garza García, NL';
                    }
                    
                    saveDB();
                    if (window.showToast) showToast('Editor guardado correctamente','success'); else alert('Guardado');
                } catch(e) {
                    console.error(e);
                    alert('Error al guardar: '+e.message);
                }
            };

            // Construir HTML con concatenación
            var h = db.settings.hero;
            var c = db.settings.comisiones;
            var hist = db.settings.historias;
            var aseg = db.settings.aseguradoras;
            
            var html = '';
            html += '<div class="max-w-6xl mx-auto">';
            html += '<div class="flex justify-between items-center mb-6">';
            html += '<div><h2 class="text-2xl font-bold">Editor Página Reclutamiento</h2><p class="text-slate-600 text-sm">Edita el portal sin tocar código</p></div>';
            html += '<div class="flex gap-2"><button onclick="guardarTodoEditor()" class="px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"><i class="fas fa-save mr-2"></i>Guardar todo</button></div>';
            html += '</div>';
            
            html += '<div class="grid lg:grid-cols-2 gap-6">';
            
            // HERO
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200">';
            html += '<h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-bullhorn text-indigo-600"></i>HERO</h3>';
            html += '<div class="space-y-4">';
            html += '<div><label class="text-xs text-slate-600 font-medium">Título línea 1</label><input id="hero-titulo1" value="'+escapeHTML(h.titulo1)+'" class="w-full px-3 py-2 border rounded-lg text-sm mt-1 bg-white text-slate-900 border-slate-300"></div>';
            html += '<div><label class="text-xs text-slate-600 font-medium">Monto destacado</label><input id="hero-monto" value="'+escapeHTML(h.monto)+'" placeholder="$27,000" class="w-full px-3 py-2 border rounded-lg text-sm mt-1 font-bold text-indigo-600 bg-white text-slate-900 border-slate-300"></div>';
            html += '<div><label class="text-xs text-slate-600 font-medium">Subtítulo</label><textarea id="hero-subtitulo" class="w-full px-3 py-2 border rounded-lg text-sm mt-1 h-20 bg-white text-slate-900 border-slate-300">'+escapeHTML(h.subtitulo)+'</textarea></div>';
            html += '<div><label class="text-xs text-slate-600 font-medium">Imagen de fondo</label><div class="mt-1 space-y-2"><input type="file" accept="image/*" onchange="uploadImageBase64(this, \'hero-preview\', \'hero-imagen\')" class="w-full text-xs bg-white text-slate-900 border border-slate-300"><div class="flex gap-2 items-center"><img id="hero-preview" src="'+(h.imagenFondo||'')+'" class="h-16 w-24 object-cover rounded border '+(h.imagenFondo?'':'hidden')+'"><input id="hero-imagen" value="'+escapeHTML(h.imagenFondo)+'" placeholder="URL alternativa o base64" class="flex-1 px-2 py-1.5 border rounded text-xs bg-white text-slate-900 border-slate-300"></div></div></div>';
            html += '<div class="grid grid-cols-2 gap-3"><div><label class="text-xs text-slate-600 font-medium">Texto botón 1</label><input id="hero-btn1" value="'+escapeHTML(h.textoBoton1)+'" class="w-full px-3 py-2 border rounded-lg text-sm mt-1 bg-white text-slate-900 border-slate-300"></div><div><label class="text-xs text-slate-600 font-medium">Texto botón 2</label><input id="hero-btn2" value="'+escapeHTML(h.textoBoton2)+'" class="w-full px-3 py-2 border rounded-lg text-sm mt-1 bg-white text-slate-900 border-slate-300"></div></div>';
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-route text-emerald-600"></i>ELIGE TU CAMINO (3 tarjetas)</h3>';
            var cam=(db.settings.caminos && db.settings.caminos.cards)?db.settings.caminos.cards:[];
            html += '<div class="grid md:grid-cols-3 gap-3">';
            for (let ci=0; ci<3; ci++) {
                var cc = cam[ci] || {titulo:'',desc:'',items:'',cta:'',origen:'cero',destacado:false};
                var its = Array.isArray(cc.items)?cc.items.join(' | '):(cc.items||'');
                html += '<div class="p-4 border rounded-xl bg-slate-50 space-y-2'+(cc.destacado?' ring-2 ring-emerald-500':'')+'">';
                html += '<label class="flex items-center gap-2 text-xs font-medium text-slate-600"><input type="checkbox" id="cam-dest-'+ci+'" '+(cc.destacado?'checked':'')+' class="w-4 h-4 text-emerald-600 rounded bg-white border-slate-300"> Destacada (MÁS POPULAR)</label>';
                html += '<input id="cam-titulo-'+ci+'" value="'+escapeHTML(cc.titulo||'')+'" placeholder="Título" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">';
                html += '<input id="cam-desc-'+ci+'" value="'+escapeHTML(cc.desc||'')+'" placeholder="Descripción corta" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">';
                html += '<textarea id="cam-items-'+ci+'" rows="4" placeholder="Un beneficio por línea" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'+escapeHTML(its)+'</textarea>';
                html += '<div class="flex gap-2"><input id="cam-cta-'+ci+'" value="'+escapeHTML(cc.cta||'')+'" placeholder="Texto botón" class="flex-1 px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"><input id="cam-origen-'+ci+'" value="'+escapeHTML(cc.origen||'cero')+'" placeholder="origen" class="w-24 px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
                html += '</div>';
            }
            html += '</div>';
            html += '<div class="grid md:grid-cols-2 gap-3 mt-3"><div><label class="text-xs text-slate-600 font-medium">Título de la sección</label><input id="cam-titulo-sec" value="'+escapeHTML((db.settings.caminos||{}).titulo||'Elige tu camino')+'" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"></div><div><label class="text-xs text-slate-600 font-medium">Subtítulo</label><input id="cam-sub-sec" value="'+escapeHTML((db.settings.caminos||{}).subtitulo||'Tenemos un plan para cada etapa')+'" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"></div></div>';
            html += '<div class="grid md:grid-cols-2 gap-3 mt-3"><div><label class="text-xs text-slate-600 font-medium">Título sección HISTORIAS</label><input id="cam-hist-titulo" value="'+escapeHTML((db.settings.caminos||{}).tituloHistorias||'Historias de Éxito')+'" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"></div><div class="text-xs text-slate-400 self-end pb-2">La sección duplicada "¿Cómo ganas con nosotros?" fue eliminada; el contenido vive en "¿Quieres ser parte de nosotros?".</div></div>';
            html += '</div>';
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-flag-checkered text-emerald-600"></i>CTA FINAL</h3>';
            var cf = db.settings.ctaFinal || {};
            html += '<div class="space-y-2"><input id="cta-titulo" value="'+escapeHTML(cf.titulo||'')+'" placeholder="Título (ej. Da el siguiente paso en tu carrera)" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"><input id="cta-sub" value="'+escapeHTML(cf.subtitulo||'')+'" placeholder="Subtítulo" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"><input id="cta-boton" value="'+escapeHTML(cf.boton||'')+'" placeholder="Texto del botón (ej. Agendar ahora)" class="w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
            html += '<p class="text-xs text-slate-500 mt-2">La sección usa fondo negro con botón verde según la identidad del portal.</p>';
            html += '</div>';
            html += '</div></div>';
            
            // COMISIONES
            html += '<div class="bg-white p-5 rounded-2xl border border-slate-200">';
            html += '<h3 class="font-semibold mb-3 flex items-center gap-2"><i class="fas fa-percentage text-emerald-600"></i>COMISIONES REALES (Simulador)</h3>';
            html += '<div class="grid sm:grid-cols-2 gap-x-4 gap-y-2">';
            html += '<div class="flex items-center gap-2"><label class="text-xs text-slate-600 font-medium whitespace-nowrap flex-1">Vida %</label><input id="com-vida" type="number" step="0.01" min="0" max="1" value="'+c.vida+'" class="w-24 px-2 py-1 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
            html += '<div class="flex items-center gap-2"><label class="text-xs text-slate-600 font-medium whitespace-nowrap flex-1">GMM %</label><input id="com-gmm" type="number" step="0.01" min="0" max="1" value="'+c.gmm+'" class="w-24 px-2 py-1 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
            html += '<div class="flex items-center gap-2"><label class="text-xs text-slate-600 font-medium whitespace-nowrap flex-1">Autos: % valor unidad (0-1, ej: 0.03 = 3%)</label><input id="com-autosunidad" type="number" step="0.01" min="0" max="1" value="'+(c.autosUnidad!=null?c.autosUnidad:0.03)+'" class="w-24 px-2 py-1 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
            html += '<div class="flex items-center gap-2"><label class="text-xs text-slate-600 font-medium whitespace-nowrap flex-1">Autos: % monto financiado (0-1, ej: 0.30 = 30%)</label><input id="com-autosfin" type="number" step="0.01" min="0" max="1" value="'+(c.autosFin!=null?c.autosFin:0.30)+'" class="w-24 px-2 py-1 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
            html += '<div class="flex items-center gap-2"><label class="text-xs text-slate-600 font-medium whitespace-nowrap flex-1">Propiedades: % del valor (0-1, ej: 0.03 = 3%)</label><input id="com-prop" type="number" step="0.01" min="0" max="1" value="'+(c.propValor!=null?c.propValor:0.03)+'" class="w-24 px-2 py-1 border rounded text-sm bg-white text-slate-900 border-slate-300"></div>';
            html += '<p class="text-xs text-slate-500 mt-2 sm:col-span-2">Estos valores se usan en el simulador público de ingresos.</p>';
            html += '</div></div>';
            
            html += '</div>'; // fin grid 2 cols
            
            // HISTORIAS
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<div class="flex justify-between items-center mb-4"><h3 class="font-semibold flex items-center gap-2"><i class="fas fa-star text-amber-500"></i>HISTORIAS DE ÉXITO</h3><button type="button" onclick="addHistEditor()" class="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 text-xs font-medium"><i class="fas fa-plus mr-1"></i>Agregar historia</button></div>';
            html += '<div id="lista-historias" class="grid md:grid-cols-3 gap-4"></div>';
            html += '</div>';
            
            // ASEGURADORAS
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<div class="flex justify-between items-center mb-4"><h3 class="font-semibold flex items-center gap-2"><i class="fas fa-building text-blue-600"></i>COMPAÑÍAS</h3><button type="button" onclick="agregarAseguradora()" class="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-xs font-medium"><i class="fas fa-plus mr-1"></i>Agregar</button></div>';
            html += '<div id="lista-aseguradoras" class="grid md:grid-cols-2 gap-3">';
            for (let j=0; j<aseg.length; j++) {
                var a = aseg[j];
                html += '<div class="aseguradora-item p-3 border rounded-lg bg-slate-50"><div class="flex gap-2 items-start"><div class="flex-1 space-y-2"><input placeholder="Nombre aseguradora" value="'+escapeHTML(a.nombre)+'" class="aseg-nombre w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300"><div class="flex items-center gap-2"><input type="file" accept="image/*" onchange="uploadImageBase64(this, \'aseg-prev-'+j+'\', \'aseg-logo-'+j+'\')" class="text-xs flex-1 bg-white text-slate-900 border border-slate-300"><img id="aseg-prev-'+j+'" src="'+(a.logo||'')+'" class="h-8 w-12 object-contain border rounded bg-white '+(a.logo?'':'hidden')+'"></div><input type="hidden" id="aseg-logo-'+j+'" value="'+escapeHTML(a.logo)+'" class="aseg-logo bg-white text-slate-900 border border-slate-300"></div><button type="button" onclick="this.closest(\'.aseguradora-item\').remove()" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash text-xs"></i></button></div></div>';
            }
            html += '</div>';
            html += '<p class="text-xs text-slate-500 mt-3">Sube logos en PNG con fondo transparente para mejor resultado.</p>';
            html += '</div>';
                        html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
                        html += '<div class="flex justify-between items-center mb-4"><h3 class="font-semibold flex items-center gap-2"><i class="fas fa-house text-sky-600"></i>PROPIEDADES EN PORTADA (sección Propiedades)</h3><div class="flex gap-2"><button type="button" onclick="addPropPortada()" class="px-3 py-1.5 bg-sky-50 text-sky-600 rounded-lg hover:bg-sky-100 text-xs font-medium"><i class="fas fa-plus mr-1"></i>Agregar</button></div></div>';
                        html += '<p class="text-xs text-slate-500 mb-3">Publica casas y departamentos en la sub-página Propiedades de la página principal (venta, renta o preventa). Guarda con "Guardar todo".</p>';
                        html += '<div id="lista-props-portada" class="grid md:grid-cols-2 gap-3"></div>';
                        html += '</div>';

            // SERVICIOS (landing)
            var sv = servData();
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<div class="flex justify-between items-center mb-4"><h3 class="font-semibold flex items-center gap-2"><i class="fas fa-layer-group text-emerald-600"></i>SERVICIOS (landing: 13 divisiones)</h3><button type="button" onclick="addServEditor()" class="px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 text-xs font-medium"><i class="fas fa-plus mr-1"></i>Agregar servicio</button></div>';
            html += '<div class="grid md:grid-cols-2 gap-3 mb-4"><div><label class="text-xs text-slate-600 font-medium">Título de la sección</label><input id="serv-titulo" value="'+escapeHTML(sv.titulo)+'" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300"></div><div><label class="text-xs text-slate-600 font-medium">Subtítulo</label><input id="serv-subtitulo" value="'+escapeHTML(sv.subtitulo)+'" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300"></div></div>';
            html += '<p class="text-xs text-slate-500 mb-3">Cada tarjeta: grupo (pestaña), ícono Font Awesome, nombre, descripción y etiqueta opcional. Guarda con "Guardar todo".</p>';
            html += '<div id="lista-servicios" class="grid md:grid-cols-2 gap-3"></div>';
            html += '</div>';

            // BLOG
            var bg = blogData();
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<div class="flex justify-between items-center mb-4"><h3 class="font-semibold flex items-center gap-2"><i class="fas fa-newspaper text-amber-600"></i>BLOG</h3><button type="button" onclick="addBlogEditor()" class="px-3 py-1.5 bg-amber-50 text-amber-600 rounded-lg hover:bg-amber-100 text-xs font-medium"><i class="fas fa-plus mr-1"></i>Agregar artículo</button></div>';
            html += '<div class="grid md:grid-cols-2 gap-3 mb-4"><div><label class="text-xs text-slate-600 font-medium">Título del blog</label><input id="blog-titulo" value="'+escapeHTML(bg.titulo)+'" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300"></div><div><label class="text-xs text-slate-600 font-medium">Subtítulo</label><input id="blog-subtitulo" value="'+escapeHTML(bg.subtitulo)+'" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300"></div></div>';
            html += '<p class="text-xs text-slate-500 mb-3">Artículos: etiqueta, ícono, título, resumen, cuerpo (párrafos separados por línea en blanco), fecha, autor.</p>';
            html += '<div id="lista-blog" class="grid md:grid-cols-2 gap-3"></div>';
            html += '</div>';

            // AVISO DE PRIVACIDAD
            var pv = privacidadData();
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-user-shield text-slate-700"></i>AVISO DE PRIVACIDAD</h3>';
            html += '<div class="space-y-3"><div><label class="text-xs text-slate-600 font-medium">Fecha de última actualización</label><input id="priv-actualizado" value="'+escapeHTML(pv.actualizado||'')+'" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300"></div><div><label class="text-xs text-slate-600 font-medium">Texto completo del aviso</label><textarea id="priv-texto" rows="10" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300">'+escapeHTML(pv.texto||'')+'</textarea></div></div>';
            html += '</div>';

            // DATOS EMPRESA
            html += '<div class="bg-white p-6 rounded-2xl border border-slate-200 mt-6">';
            html += '<h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-location-dot text-rose-600"></i>DATOS EMPRESA</h3>';
            html += '<div><label class="text-xs text-slate-600 font-medium">Ciudad / domicilio (aparece en footer, diferenciales y avisos)</label><input id="emp-ciudad" value="'+escapeHTML(ciudadBB())+'" class="w-full px-2 py-1.5 border rounded text-sm mt-1 bg-white text-slate-900 border-slate-300"></div>';
            html += '</div>';
            
            html += '</div>'; // container
            
            window.propsGlobales = (db.inmPublica && Array.isArray(db.inmPublica.props)) ? db.inmPublica.props.map(function(p){ return { id:p.id, titulo:p.titulo, tipo:p.tipo, precio:p.precio, colonia:p.colonia, ciudad:p.ciudad, recs:p.recs, banios:p.banios, m2:p.m2, desc:p.desc, fotos:p.fotos||[], vendida:p.vendida }; }) : [];
            window.renderPropsPortada = function(){
                const wrap = document.getElementById('lista-props-portada'); if(!wrap) return;
                wrap.innerHTML = window.propsGlobales.map(function(p, ix){
                    return '<div class="p-4 border rounded-xl bg-slate-50" data-ix="'+ix+'"><div class="flex items-center gap-3 mb-2"><img id="prop-prev-'+ix+'" src="'+((p.fotos||[])[0]||'')+'" class="w-12 h-12 rounded-lg object-cover border '+(p.fotos&&p.fotos.length?'':'hidden')+' bg-white"><div class="flex-1"><input type="file" accept="image/*" multiple onchange="propsFoto(this,'+ix+')" class="text-xs w-full bg-white text-slate-900 border border-slate-300"></div><div class="flex flex-col gap-1"><select onchange="propsGlobales['+ix+'].tipo=this.value" class="text-xs border rounded px-1 py-1 bg-white text-slate-900 border-slate-300"><option '+(p.tipo==='Venta'?'selected':'')+'>Venta</option><option '+(p.tipo==='Renta'?'selected':'')+'>Renta</option><option '+(p.tipo==='Preventa'?'selected':'')+'>Preventa</option></select><button type="button" onclick="propsDel('+ix+')" class="text-red-500 hover:text-red-700 text-xs"><i class="fas fa-trash"></i> Quitar</button></div></div>'
                    + '<div class="grid grid-cols-2 gap-2">'
                    + '<input id="prop-titulo-'+ix+'" value="'+escapeHTML(p.titulo||'')+'" placeholder="Título (ej. Casa 2 niveles Villa Jardín)" class="col-span-2 px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input id="prop-colonia-'+ix+'" value="'+escapeHTML(p.colonia||'')+'" placeholder="Colonia / zona" class="px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input id="prop-ciudad-'+ix+'" value="'+escapeHTML(p.ciudad||'')+'" placeholder="Ciudad" class="px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input id="prop-precio-'+ix+'" type="number" value="'+(p.precio||'')+'" placeholder="Precio (MXN, vacío = a consultar)" class="px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input id="prop-m2-'+ix+'" type="number" value="'+(p.m2||'')+'" placeholder="m² terreno/const." class="px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input id="prop-recs-'+ix+'" type="number" value="'+(p.recs||'')+'" placeholder="Recámaras" class="px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input id="prop-banios-'+ix+'" type="number" value="'+(p.banios||'')+'" placeholder="Baños" class="px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<textarea id="prop-desc-'+ix+'" rows="2" placeholder="Descripción corta" class="col-span-2 px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'+escapeHTML(p.desc||'')+'</textarea>'
                    + '</div></div>';
                }).join('') || '<p class="text-xs text-slate-400">Sin propiedades publicadas. Usa "Agregar" para crear la primera.</p>';
            };
            window.propsFoto = function(input, ix){
                const files = Array.from(input.files||[]); if(!files.length) return;
                // Paso 4: servidor primero (URLs compartidas en vivo), base64 si falla.
                if (window.Media && window.Backend && window.Backend.available) {
                    if (window.showToast) window.showToast('Subiendo fotos…','info');
                    window.Media.subirMuchos(files, 'inmPublica').then(function(items){
                        const urls = items.map(function(x){ return x.url; });
                        window.propsGlobales[ix].fotos = (window.propsGlobales[ix].fotos||[]).concat(urls).slice(0,8);
                        renderPropsPortada();
                        if (window.showToast) window.showToast('Fotos subidas','success');
                    }).catch(function(){ propsFotoLocal(input, ix); });
                    return;
                }
                propsFotoLocal(input, ix);
            };
            window.propsFotoLocal = function(input, ix){
                const files = Array.from(input.files||[]); if(!files.length) return;
                let pending = files.length; const results = [];
                files.forEach(function(file){
                    const reader = new FileReader();
                    reader.onload = function(e){ results.push(e.target.result); if(--pending===0){ window.propsGlobales[ix].fotos = (window.propsGlobales[ix].fotos||[]).concat(results).slice(0,8); renderPropsPortada(); } };
                    reader.readAsDataURL(file);
                });
            };
            window.propsDel = function(ix){ window.propsGlobales.splice(ix,1); renderPropsPortada(); };
            window.addPropPortada = function(){ window.propsGlobales.push({ id: Date.now(), titulo:'', tipo:'Venta', precio:0, colonia:'', ciudad:'San Pedro Garza García', recs:0, banios:0, m2:0, desc:'', fotos:[], vendida:false }); renderPropsPortada(); };
            setTimeout(function(){ renderPropsPortada(); renderServEditor(); renderBlogEditor(); renderHistsEditor(); }, 0);

            // --- Render dinámico: SERVICIOS ---
            window.renderServEditor = function(){
                const wrap = document.getElementById('lista-servicios'); if(!wrap) return;
                const grupos = servData().grupos;
                const lista = servData().servicios;
                wrap.innerHTML = lista.map(function(x, ix){
                    const opts = grupos.map(g=>'<option value="'+escapeHTML(g.id)+'"'+(x.g===g.id?' selected':'')+'>'+escapeHTML(g.n)+'</option>').join('');
                    return '<div class="serv-item p-4 border rounded-xl bg-slate-50">'
                    + '<div class="flex justify-between items-center mb-2"><span class="text-xs font-semibold text-slate-400">#'+(ix+1)+'</span><button type="button" onclick="this.closest(\'.serv-item\').remove()" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash text-xs"></i></button></div>'
                    + '<select class="serv-g w-full px-2 py-1.5 border rounded text-sm mb-2 bg-white text-slate-900 border-slate-300">'+opts+'</select>'
                    + '<input placeholder="Ícono Font Awesome (ej. fa-shield-halved)" value="'+escapeHTML(x.ico||'')+'" class="serv-ico w-full px-2 py-1.5 border rounded text-sm mb-2 bg-white text-slate-900 border-slate-300">'
                    + '<input placeholder="Nombre del servicio" value="'+escapeHTML(x.n||'')+'" class="serv-n w-full px-2 py-1.5 border rounded text-sm mb-2 bg-white text-slate-900 border-slate-300">'
                    + '<textarea placeholder="Descripción" rows="2" class="serv-d w-full px-2 py-1.5 border rounded text-sm mb-2 bg-white text-slate-900 border-slate-300">'+escapeHTML(x.d||'')+'</textarea>'
                    + '<input placeholder="Etiqueta opcional (ej. CNSF, Online)" value="'+escapeHTML(x.tag||'')+'" class="serv-tag w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '</div>';
                }).join('') || '<p class="text-xs text-slate-400">Sin servicios. Usa "Agregar servicio".</p>';
            };
            window.addServEditor = function(){
                const s = servData(); s.servicios.push({ g:(s.grupos[0]||{}).id||'fin', ico:'fa-circle-check', n:'', d:'', tag:'' });
                renderServEditor();
            };

            // --- Render dinámico: BLOG ---
            window.renderBlogEditor = function(){
                const wrap = document.getElementById('lista-blog'); if(!wrap) return;
                const lista = blogData().posts||[];
                wrap.innerHTML = lista.map(function(p, ix){
                    return '<div class="blog-item p-4 border rounded-xl bg-slate-50">'
                    + '<div class="flex justify-between items-center mb-2"><span class="text-xs font-semibold text-slate-400">#'+(ix+1)+'</span><button type="button" onclick="this.closest(\'.blog-item\').remove()" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash text-xs"></i></button></div>'
                    + '<div class="grid grid-cols-2 gap-2 mb-2">'
                    + '<input placeholder="Etiqueta (ej. Gastos Médicos)" value="'+escapeHTML(p.tag||'')+'" class="blog-tag px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input placeholder="Ícono (ej. fa-shield-halved)" value="'+escapeHTML(p.ico||'')+'" class="blog-ico px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '</div>'
                    + '<input placeholder="Título del artículo" value="'+escapeHTML(p.titulo||'')+'" class="blog-tit w-full px-2 py-1.5 border rounded text-sm mb-2 font-semibold bg-white text-slate-900 border-slate-300">'
                    + '<textarea placeholder="Resumen corto (tarjeta)" rows="2" class="blog-res w-full px-2 py-1.5 border rounded text-sm mb-2 bg-white text-slate-900 border-slate-300">'+escapeHTML(p.resumen||'')+'</textarea>'
                    + '<textarea placeholder="Cuerpo completo (párrafos separados por línea en blanco)" rows="6" class="blog-cue w-full px-2 py-1.5 border rounded text-sm mb-2 bg-white text-slate-900 border-slate-300">'+escapeHTML(p.cuerpo||'')+'</textarea>'
                    + '<div class="grid grid-cols-2 gap-2">'
                    + '<input placeholder="Fecha (ej. 2026-10-06)" value="'+escapeHTML(p.fecha||'')+'" class="blog-fec px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input placeholder="Autor" value="'+escapeHTML(p.autor||'')+'" class="blog-aut px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '</div>'
                    + '</div>';
                }).join('') || '<p class="text-xs text-slate-400">Sin artículos. Usa "Agregar artículo".</p>';
            };
            window.addBlogEditor = function(){
                const b = blogData(); b.posts.push({ id:'b'+Date.now(), ico:'fa-newspaper', tag:'', titulo:'', resumen:'', cuerpo:'', fecha:new Date().toISOString().slice(0,10), autor:'Equipo Broker Booster' });
                renderBlogEditor();
            };

            // --- Render dinámico: HISTORIAS ---
            window.renderHistsEditor = function(){
                const wrap = document.getElementById('lista-historias'); if(!wrap) return;
                const lista = db.settings.historias||[];
                wrap.innerHTML = lista.map(function(hi, i){
                    return '<div class="historia-item p-4 border rounded-xl bg-slate-50">'
                    + '<div class="flex justify-between items-center mb-2"><span class="text-xs font-semibold text-slate-400">#'+(i+1)+'</span><button type="button" onclick="this.closest(\'.historia-item\').remove()" class="text-red-500 hover:text-red-700 p-1"><i class="fas fa-trash text-xs"></i></button></div>'
                    + '<div class="flex items-center gap-3 mb-2"><img id="hist-prev-'+i+'" src="'+(hi.foto||'')+'" class="w-12 h-12 rounded-full object-cover border '+(hi.foto?'':'hidden')+' bg-white"><div class="flex-1"><input type="file" accept="image/*" onchange="uploadImageBase64(this, \'hist-prev-'+i+'\', \'hist-foto-'+i+'\')" class="text-xs w-full bg-white text-slate-900 border border-slate-300"><input type="hidden" id="hist-foto-'+i+'" value="'+escapeHTML(hi.foto||'')+'" class="hist-foto bg-white text-slate-900 border border-slate-300"></div></div>'
                    + '<div class="space-y-2">'
                    + '<input placeholder="Nombre" value="'+escapeHTML(hi.nombre||'')+'" class="hist-nombre w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input placeholder="Tiempo en la agencia" value="'+escapeHTML(hi.tiempo||'')+'" class="hist-tiempo w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'
                    + '<input placeholder="Monto logrado" value="'+escapeHTML(hi.monto||'')+'" class="hist-monto w-full px-2 py-1.5 border rounded text-sm font-semibold text-emerald-600 bg-white text-slate-900 border-slate-300">'
                    + '<textarea placeholder="Testimonio" rows="3" class="hist-test w-full px-2 py-1.5 border rounded text-sm bg-white text-slate-900 border-slate-300">'+escapeHTML(hi.testimonio||'')+'</textarea>'
                    + '</div>'
                    + '</div>';
                }).join('') || '<p class="text-xs text-slate-400">Sin historias. Usa "Agregar historia".</p>';
            };
            window.addHistEditor = function(){ db.settings.historias.push({nombre:'',tiempo:'',monto:'',testimonio:'',foto:''}); renderHistsEditor(); };
            html += '</div>'; // container
            return html;
        }


        function uploadHeroImage(input) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById('hero-preview').src = e.target.result;
                document.getElementById('edit-hero-bg').value = e.target.result;
                db.settings.portalContent.hero.backgroundUrl = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function uploadProgramaImage(input, idx) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById(`prog-preview-${idx}`).src = e.target.result;
                const hidden = document.querySelector(`input[data-idx="${idx}"][data-field="imagen"].prog-input`);
                if (hidden) hidden.value = e.target.result;
                db.settings.portalContent.programas[idx].imagen = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function uploadTestimonioImage(input, idx) {
            const file = input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = e => {
                document.getElementById(`test-preview-${idx}`).src = e.target.result;
                const hidden = document.querySelector(`input[data-idx="${idx}"][data-field="avatar"].test-input`);
                if (hidden) hidden.value = e.target.result;
                db.settings.portalContent.testimonios[idx].avatar = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        function savePortalContent() {
            const content = db.settings.portalContent;
            
            // Hero
            content.hero.title = document.getElementById('edit-hero-title').value;
            content.hero.subtitle = document.getElementById('edit-hero-subtitle').value;
            content.hero.backgroundUrl = document.getElementById('edit-hero-bg').value;
            content.hero.cta1 = document.getElementById('edit-hero-cta1').value;
            content.hero.cta2 = document.getElementById('edit-hero-cta2').value;
            
            // Cómo estudiar
            content.como.titulo = document.getElementById('edit-como-titulo').value;
            content.como.subtitulo = document.getElementById('edit-como-subtitulo').value;
            
            // Campus
            content.campus.titulo = document.getElementById('edit-campus-titulo').value;
            content.campus.descripcion = document.getElementById('edit-campus-desc').value;
            
            // Pilares
            document.querySelectorAll('.pilar-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                content.pilares[idx][field] = inp.value;
            });
            
            // Programas
            document.querySelectorAll('.prog-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                if (content.programas[idx]) content.programas[idx][field] = inp.value;
            });
            
            // Testimonios
            document.querySelectorAll('.test-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                content.testimonios[idx][field] = inp.value;
            });
            
            // FAQ
            document.querySelectorAll('.faq-input').forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                const field = inp.dataset.field;
                content.faq[idx][field] = inp.value;
            });
            
            saveDB();
            alert('¡Portal actualizado correctamente!');
            renderPublicPortal();
        }

        function previewPortal() {
            window.open(window.location.href, '_blank');
        }

        function addPrograma() {
            const newId = Date.now();
            db.settings.portalContent.programas.push({
                id: newId,
                tipo: "Curso",
                titulo: "Nuevo Programa",
                descripcion: "Descripción del programa",
                duracion: "3 meses",
                modalidad: "Online",
                precio: "$499 USD",
                imagen: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=800"
            });
            saveDB();
            navigateTo('editor');
        }

        function removePrograma(idx) {
            if (confirm('¿Eliminar este programa?')) {
                db.settings.portalContent.programas.splice(idx, 1);
                saveDB();
                navigateTo('editor');
            }
        }

        function addFaq() {
            db.settings.portalContent.faq.push({ q: "Nueva pregunta", a: "Respuesta" });
            saveDB();
            navigateTo('editor');
        }


        function openSolicitudModal(origen='general') {
            const html = `
                <div class="p-0 max-w-lg">
<div class="bg-gradient-to-br from-emerald-700 to-slate-950 p-8 text-white relative overflow-hidden">
                        <button aria-label="Cerrar" onclick="closeModal()" class="absolute top-4 right-4 w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30"><i class="fas fa-times"></i></button>
                        <div class="relative">
                            <div class="inline-flex items-center gap-2 px-3 py-1 bg-white/20 rounded-full text-xs font-medium mb-3">
                                <i class="fas fa-gift"></i> GRATIS
                            </div>
                            <h3 class="text-3xl font-black mb-2">Guía CNSF 2026 + Simulador</h3>
                            <p class="opacity-90">Incluidos en nuestro portal de formación</p>
                        </div>
                    </div>
                    <form id="solicitud-form" onsubmit="submitSolicitudV2(event)" class="p-8 space-y-4">
                        <input type="hidden" id="sol-origen" value="${origen}" class="bg-white text-slate-900 border border-slate-300">
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-sm font-medium text-slate-700 mb-1 block">Nombre</label>
                                <input required id="sol-nombre" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900 border border-slate-300" placeholder="Tu nombre">
                            </div>
                            <div>
                                <label class="text-sm font-medium text-slate-700 mb-1 block">WhatsApp</label>
                                <input required id="sol-whatsapp" type="tel" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900 border border-slate-300" placeholder="664 364 0670">
                            </div>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-slate-700 mb-1 block">¿Te recomendó alguien?</label>
                            <input id="sol-referido" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900 border border-slate-300" placeholder="Nombre de quien te refiere (opcional)">
                        </div>
                        <div>
                            <label class="text-sm font-medium text-slate-700 mb-1 block">¿Tienes cédula CNSF?</label>
                            <div class="grid grid-cols-3 gap-2">
                                <label class="cursor-pointer"><input type="radio" name="cedula" value="si" class="sr-only peer bg-white text-slate-900 border border-slate-300" required><div class="py-2.5 text-center border-2 border-slate-200 rounded-xl peer-checked:border-emerald-500 peer-checked:bg-emerald-50 font-medium">Sí</div></label>
                                <label class="cursor-pointer"><input type="radio" name="cedula" value="no" class="sr-only peer bg-white text-slate-900 border border-slate-300"><div class="py-2.5 text-center border-2 border-slate-200 rounded-xl peer-checked:border-emerald-500 peer-checked:bg-emerald-50 font-medium">No</div></label>
                                <label class="cursor-pointer"><input type="radio" name="cedula" value="proceso" class="sr-only peer bg-white text-slate-900 border border-slate-300"><div class="py-2.5 text-center border-2 border-slate-200 rounded-xl peer-checked:border-emerald-500 peer-checked:bg-emerald-50 font-medium">En trámite</div></label>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="text-sm font-medium text-slate-700 mb-1 block">Interés</label>
                                <select required id="sol-interes" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900">
                                    <option value="Desarrollarme como agente Booster">Desarrollarme como agente Booster</option>
                                    <option value="Ya soy Agente con cédula">Ya soy Agente con cédula</option>
                                    <option value="Quiero tener mi agencia">Quiero tener mi agencia</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-sm font-medium text-slate-700 mb-1 block">¿Cuánto esperas ganar?</label>
                                <input id="sol-ganancia" type="number" min="0" step="1000" inputmode="numeric" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900" placeholder="Ingreso mensual (MXN)">
                            </div>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-slate-700 mb-1 block">Estado</label>
                            <select required id="sol-estado" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900">
                                <option value="" disabled selected>Selecciona tu estado</option>
                                <option value="Aguascalientes">Aguascalientes</option>\n                                <option value="Baja California">Baja California</option>\n                                <option value="Baja California Sur">Baja California Sur</option>\n                                <option value="Campeche">Campeche</option>\n                                <option value="Chiapas">Chiapas</option>\n                                <option value="Chihuahua">Chihuahua</option>\n                                <option value="Ciudad de México">Ciudad de México</option>\n                                <option value="Coahuila">Coahuila</option>\n                                <option value="Colima">Colima</option>\n                                <option value="Durango">Durango</option>\n                                <option value="Estado de México">Estado de México</option>\n                                <option value="Guanajuato">Guanajuato</option>\n                                <option value="Guerrero">Guerrero</option>\n                                <option value="Hidalgo">Hidalgo</option>\n                                <option value="Jalisco">Jalisco</option>\n                                <option value="Michoacán">Michoacán</option>\n                                <option value="Morelos">Morelos</option>\n                                <option value="Nayarit">Nayarit</option>\n                                <option value="Nuevo León">Nuevo León</option>\n                                <option value="Oaxaca">Oaxaca</option>\n                                <option value="Puebla">Puebla</option>\n                                <option value="Querétaro">Querétaro</option>\n                                <option value="Quintana Roo">Quintana Roo</option>\n                                <option value="San Luis Potosí">San Luis Potosí</option>\n                                <option value="Sinaloa">Sinaloa</option>\n                                <option value="Sonora">Sonora</option>\n                                <option value="Tabasco">Tabasco</option>\n                                <option value="Tamaulipas">Tamaulipas</option>\n                                <option value="Tlaxcala">Tlaxcala</option>\n                                <option value="Veracruz">Veracruz</option>\n                                <option value="Yucatán">Yucatán</option>\n                                <option value="Zacatecas">Zacatecas</option>
                            </select>
                        </div>
                        <div>
                            <label class="text-sm font-medium text-slate-700 mb-1 block">Mensaje</label>
                            <textarea id="sol-mensaje-user" rows="3" class="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-emerald-500 focus:outline-none bg-white text-slate-900" placeholder="Cuéntanos más sobre ti (opcional)"></textarea>
                        </div>
                        <input type="hidden" id="sol-email" value="" class="bg-white text-slate-900 border border-slate-300">
                        <input type="hidden" id="sol-ciudad" value="San Pedro Garza García" class="bg-white text-slate-900 border border-slate-300">
                        <input type="hidden" id="sol-tipo" value="PROSPECTO" class="bg-white text-slate-900 border border-slate-300">
                        <input type="hidden" id="sol-plan" value="" class="bg-white text-slate-900 border border-slate-300">
                        <input type="hidden" id="sol-mensaje" value="" class="bg-white text-slate-900 border border-slate-300">
                        <button type="submit" class="w-full py-4 bg-slate-900 text-white font-bold rounded-xl hover:bg-black transition flex items-center justify-center gap-2">
                            <i class="fab fa-whatsapp"></i> Enviar solicitud
                        </button>
                        <p class="text-xs text-center text-slate-500">Se guardará en Solicitudes. Respuesta en menos de 5 horas.</p>
                    </form>
                </div>
            `;
            showModal(html, 'max-w-lg');
        }
        
        function submitSolicitudV2(e) {
            e.preventDefault();
            const cedula = document.querySelector('input[name="cedula"]:checked')?.value || '';
            const origen = document.getElementById('sol-origen').value;
            const referido = document.getElementById('sol-referido')?.value.trim() || '';
const interes = document.getElementById('sol-interes')?.value || '';
            const ganancia = document.getElementById('sol-ganancia')?.value || '';
            const estadoUser = document.getElementById('sol-estado')?.value || '';
            const mensajeUser = document.getElementById('sol-mensaje-user')?.value.trim() || '';
            const ciudadUser = (estadoUser || 'San Pedro Garza García');
            const gananciaTxt = ganancia ? ('$' + Number(ganancia).toLocaleString('es-MX') + ' MXN') : 'No especificada';
            const mensajeCompuesto = [mensajeUser, 'Cédula: ' + cedula, 'Origen: ' + origen, 'Referido: ' + (referido||'Ninguno')].filter(Boolean).join(' | ');
            const solicitud = {
                id: Date.now(),
                nombre: document.getElementById('sol-nombre').value.trim(),
                whatsapp: document.getElementById('sol-whatsapp').value.trim(),
                email: '',
                ciudad: ciudadUser,
                tipo: 'PROSPECTO RECLUTAMIENTO',
                plan: origen,
                interes: interes,
                gananciaEsperada: gananciaTxt,
                mensaje: mensajeCompuesto,
                estado: 'nuevo',
                fecha: new Date().toISOString(),
                referido: referido
            };
            if (!db.solicitudes) db.solicitudes = [];
            db.solicitudes.unshift(solicitud);

            if (typeof updateBadgeSolicitudes === 'function') updateBadgeSolicitudes(solicitudesSinVer());            // AVISO PARA ADMIN/GM
            if (!db.notifications) db.notifications = [];
            db.notifications.unshift({
                id: 'notif-' + Date.now(),
                tipo: 'nuevo-prospecto',
                titulo: 'Nuevo prospecto registrado',
                mensaje: solicitud.nombre + ' — ' + (solicitud.interes || 'Nuevo prospecto') + ' (' + (solicitud.whatsapp || '') + ')',
                fecha: new Date().toISOString(),
                leidoPor: []
            });
            saveDB();
            closeModal();
            showToast('¡Solicitud recibida! Te contactamos por WhatsApp', 'success');
            // Aquí se conectará WhatsApp Business después
        }

        /* ===== Mapa interactivo de México: prospectos por estado ===== */
        const ESTADOS_MEX = [
            {"n":"Baja California","ab":"BC","d":"M106 138 105 138 104 139 103 140 103 139 103 138 106 134 107 134 107 135 106 136 106 137 106 138ZM79 126 80 126 80 129 80 130 81 133 80 134 80 136 79 135 79 136 78 135 78 134 77 134 76 134 78 130 79 130 78 128 78 126 79 126ZM137 117 138 117 141 120 140 120 140 119 138 118 137 117ZM146 116 146 117 145 118 144 116 146 116ZM3 103 2 104 2 105 4 106 4 109 3 111 2 110 2 109 2 107 0 106 1 105 0 104 1 103 2 103 3 103ZM121 92 121 93 122 92 122 93 123 93 124 95 125 95 126 97 125 98 125 99 127 100 130 100 130 105 131 106 132 107 132 109 129 106 127 104 124 102 124 100 122 100 122 99 120 97 120 96 120 94 120 93 121 92ZM99 80 100 81 99 81 99 80ZM89 7 88 7 87 7 86 9 85 10 85 11 84 13 85 15 84 17 85 18 84 21 84 22 84 23 85 24 86 24 90 27 89 28 90 32 89 34 88 36 88 40 87 43 88 44 87 46 88 48 89 49 89 50 89 51 92 53 92 56 92 61 94 65 94 67 93 69 94 70 93 72 94 72 93 74 94 76 95 76 96 80 97 81 98 82 99 82 99 83 99 85 100 86 101 86 101 87 102 87 103 86 104 87 106 88 107 90 108 90 108 91 110 92 112 94 114 95 114 96 115 96 117 99 119 100 119 101 118 102 120 105 121 106 121 108 121 109 121 110 121 111 122 111 123 111 122 110 123 110 124 110 125 110 125 111 125 113 126 114 127 114 128 113 129 113 131 118 131 119 132 122 135 124 137 123 138 123 138 124 138 125 138 126 138 128 140 131 139 133 140 135 140 136 141 137 140 140 140 138 139 138 107 138 107 137 107 136 108 137 109 135 107 135 107 133 108 130 108 129 107 130 106 129 108 126 108 123 107 121 106 120 105 118 103 118 103 117 102 117 101 116 101 115 101 114 100 113 99 112 99 111 98 111 97 110 96 110 96 109 95 109 94 106 94 105 93 105 92 105 91 104 91 103 90 102 89 102 86 98 83 96 80 96 78 93 76 92 75 92 73 90 72 91 70 88 69 88 67 87 67 84 67 83 66 81 64 81 65 77 64 76 64 72 63 69 61 68 61 66 60 66 61 67 60 67 59 67 60 68 59 68 58 66 59 61 58 57 58 56 57 56 56 55 55 55 53 52 51 52 51 51 52 46 50 43 48 41 46 38 45 37 44 37 44 36 43 35 42 35 42 34 43 34 43 33 43 31 42 30 41 29 43 30 44 29 44 26 43 25 42 25 41 24 40 23 40 22 39 22 37 21 37 18 37 15 36 14 34 14 33 13 31 7 31 6 92 0 90 3 89 3 90 5 89 5 89 7Z","lx":82,"ly":63},
            {"n":"Baja California Sur","ab":"BCS","d":"M91 398 93 398 92 398 91 399 91 398ZM185 385 186 385 187 386 187 388 186 389 185 388 184 388 183 386 185 385ZM190 372 190 373 189 374 189 373 190 372ZM211 237 214 242 215 244 213 243 212 242 211 238 211 237ZM160 233 163 233 164 235 165 235 166 235 167 238 167 239 160 234 160 233ZM201 233 202 234 202 236 201 236 200 235 200 234 200 233 201 233ZM200 231 201 233 200 233 199 232 200 231ZM192 217 193 219 195 219 195 220 195 221 196 223 193 221 193 219 192 219 192 217ZM156 213 157 214 155 217 156 220 155 221 155 222 155 224 154 224 154 225 156 226 155 226 156 227 157 229 156 230 157 230 158 232 158 233 157 232 157 231 155 230 155 229 156 229 156 227 155 226 154 226 153 226 152 226 152 225 154 220 156 213ZM192 211 192 213 191 213 191 212 192 211ZM157 206 157 211 157 212 156 212 157 206ZM157 201 157 203 157 206 157 201ZM190 200 191 204 190 203 190 202 190 200ZM184 200 184 202 183 200 184 200ZM183 191 183 192 183 193 182 192 180 195 180 196 180 197 179 197 179 196 179 194 180 193 180 191 181 191 182 191 183 191ZM178 189 177 189 178 189ZM129 172 130 172 131 174 130 173 128 173 129 172ZM157 157 158 158 158 160 157 159 157 158 157 157ZM162 152 163 152 162 153 162 152ZM79 139 80 140 80 141 79 140 79 139ZM106 138 107 138 139 138 140 138 140 140 142 141 142 143 143 145 144 145 145 146 148 147 148 148 149 148 151 149 151 150 152 154 154 156 155 158 154 159 157 161 159 161 160 162 161 162 161 163 160 163 159 164 159 165 161 168 162 168 162 169 163 169 163 171 162 171 162 172 163 173 163 174 164 175 165 177 166 177 168 176 164 173 164 170 163 168 164 167 166 169 167 170 168 171 168 172 171 173 170 177 171 177 173 178 173 180 173 181 174 183 175 183 175 184 175 185 177 190 176 191 176 193 176 194 176 195 176 197 177 198 177 199 179 200 180 203 182 206 184 206 184 207 185 211 186 211 186 212 186 213 186 214 187 215 187 216 188 217 188 218 189 218 189 219 190 219 191 220 191 221 193 223 193 225 193 226 192 228 191 229 191 232 191 233 192 235 193 238 194 239 194 240 196 242 200 243 201 243 202 243 200 243 199 243 199 244 201 244 201 243 202 242 202 241 201 239 202 238 204 238 204 239 205 239 205 240 207 241 210 243 210 246 211 247 214 246 215 247 214 248 214 250 217 253 217 255 217 256 218 257 223 260 224 262 224 263 224 264 224 268 223 269 221 272 220 272 218 273 217 274 215 275 214 277 213 277 212 277 212 278 211 278 208 276 207 273 206 266 203 262 201 259 195 256 183 244 173 238 173 237 172 236 170 236 169 235 168 232 169 232 168 232 167 232 167 233 165 232 165 233 164 233 164 232 163 230 161 227 162 227 161 227 160 227 159 227 157 226 157 225 157 224 157 223 157 222 157 221 157 220 156 221 156 222 156 223 156 225 155 225 155 224 156 222 155 221 156 221 157 219 157 218 156 218 156 216 157 214 157 212 158 212 158 210 157 210 157 209 158 208 157 207 158 206 158 203 158 202 157 201 157 198 155 193 154 191 152 190 151 188 149 186 148 185 148 186 147 186 144 184 143 183 143 184 142 183 140 181 139 181 136 178 137 178 138 179 138 178 137 178 136 177 135 178 133 176 133 175 133 174 131 172 130 170 130 171 129 171 129 170 131 169 131 168 130 165 129 169 128 169 128 170 128 172 127 172 125 170 124 170 124 169 125 170 125 169 124 169 123 169 122 170 121 172 120 173 119 173 119 172 118 171 116 170 115 167 113 165 111 165 110 165 108 164 107 162 106 161 105 161 103 160 102 161 100 159 99 160 99 159 98 158 98 159 97 158 97 155 97 153 94 151 91 150 90 148 88 146 88 145 87 146 86 146 86 145 85 144 84 144 83 142 82 141 83 140 84 141 87 141 88 141 88 142 90 142 91 142 92 142 93 143 96 143 97 143 99 142 100 142 101 142 101 141 100 141 101 140 102 140 102 143 102 144 104 145 105 146 106 147 107 147 108 146 108 145 110 146 112 149 113 149 113 148 112 146 112 145 113 146 112 145 113 145 112 143 112 142 111 141 110 142 110 144 107 145 105 144 105 143 106 143 105 142 106 140 106 139 106 138Z","lx":158,"ly":194},
            {"n":"Sonora","ab":"SON","d":"M230 184 229 183 230 183 230 184ZM229 183 229 181 229 182 229 183ZM195 154 195 155 195 156 196 156 196 157 195 156 195 154ZM153 102 153 103 153 104 154 105 155 108 154 108 154 110 153 114 153 115 152 115 151 115 149 114 148 114 148 113 147 113 145 112 147 111 147 110 147 106 148 103 150 103 151 102 153 102ZM94 29 93 29 94 29ZM90 27 91 27 92 29 93 30 93 31 92 31 91 30 90 29 89 28 90 27ZM240 41 241 42 241 43 241 45 243 48 243 50 242 51 242 53 241 53 244 56 244 59 245 59 244 61 244 62 245 63 245 65 247 71 247 72 246 73 246 74 248 75 248 76 246 79 246 84 246 85 247 85 247 86 248 92 248 95 247 96 247 97 247 102 247 103 246 103 246 106 244 107 245 110 244 111 244 114 243 116 243 118 244 119 243 122 245 124 247 125 246 126 245 126 245 128 243 128 242 129 241 129 240 127 239 127 237 128 235 129 234 130 234 131 236 132 235 134 235 135 237 136 239 139 240 141 239 143 240 144 242 145 243 147 244 149 246 153 246 155 244 158 245 161 244 162 248 164 250 163 251 164 251 166 248 169 248 172 246 172 244 176 240 177 240 178 240 181 238 181 236 182 234 184 233 184 233 183 233 182 232 181 231 182 231 180 230 180 231 182 230 182 230 183 229 181 229 180 227 177 225 175 224 174 223 174 224 174 224 173 223 173 223 172 222 172 222 171 221 171 221 172 221 173 219 173 218 174 215 173 214 172 213 170 213 169 212 167 211 165 212 166 212 165 212 164 212 163 210 161 210 162 209 161 208 162 207 162 202 160 199 157 198 157 198 156 198 155 198 154 197 154 196 154 196 152 195 152 195 149 194 148 195 148 194 147 194 146 195 145 194 146 195 144 194 143 195 143 195 142 195 141 196 141 195 140 194 140 193 140 189 139 189 138 187 139 188 140 188 141 186 140 186 139 185 139 185 138 184 138 183 138 181 137 180 137 179 135 178 135 178 134 177 133 176 132 176 131 176 130 175 130 175 129 174 129 173 128 173 126 172 126 167 124 167 122 165 120 161 116 161 115 162 115 162 114 163 115 163 114 162 114 162 113 161 114 160 113 159 112 158 111 157 110 155 109 156 108 155 107 155 106 155 105 155 104 155 103 154 103 154 101 154 99 153 99 152 99 151 99 149 98 149 97 150 94 149 93 149 92 148 91 146 89 145 88 144 86 143 84 143 83 142 82 141 82 141 80 141 78 141 75 140 73 138 71 138 68 137 66 135 64 132 60 131 56 132 54 132 51 133 50 133 49 133 46 132 46 132 45 129 44 129 43 128 44 124 43 124 42 123 43 121 42 120 41 119 41 119 40 119 38 119 37 118 36 117 35 113 34 112 33 111 33 110 33 110 34 110 35 109 35 109 36 106 36 103 35 101 33 98 32 98 31 97 31 95 29 93 29 91 28 90 27 89 27 86 24 85 24 84 23 84 22 84 21 85 18 84 17 85 15 83 13 85 11 85 10 86 9 86 7 88 7 89 7 183 41 240 41Z","lx":191,"ly":88},
            {"n":"Chihuahua","ab":"CHIH","d":"M375 107 373 112 375 113 375 114 374 115 373 114 373 115 371 119 369 120 368 120 365 124 365 125 366 127 365 128 362 135 360 135 360 136 361 136 361 138 359 139 360 140 360 141 359 142 360 142 360 143 359 144 360 149 361 149 361 150 361 151 361 152 362 156 362 161 362 162 364 162 364 164 363 164 362 165 360 166 360 167 360 168 362 170 363 172 362 172 361 171 360 172 361 171 360 171 357 172 355 171 354 172 353 172 352 171 351 171 349 170 348 171 349 171 350 171 350 172 348 173 347 174 345 175 343 178 343 179 343 180 341 180 339 181 338 181 337 180 335 178 332 178 331 178 330 177 330 178 328 179 327 179 326 179 325 180 324 179 323 179 322 179 321 177 319 177 318 176 317 176 316 175 314 175 313 174 312 173 311 171 310 171 308 170 307 170 306 169 305 170 305 171 304 171 304 173 303 174 302 177 302 179 301 180 301 181 302 181 302 182 302 183 300 184 299 185 299 186 298 186 298 188 297 189 296 193 297 194 297 196 295 199 291 202 290 204 289 202 287 202 286 201 285 201 284 201 283 199 281 200 281 201 279 198 278 195 275 190 273 189 270 189 266 188 265 183 261 178 261 176 260 175 260 174 260 172 260 171 260 169 259 167 258 167 257 167 257 164 256 163 251 164 250 163 248 164 244 162 245 161 244 158 246 155 246 153 244 149 243 147 242 145 240 144 239 143 240 141 239 139 237 136 235 135 235 134 236 132 234 131 234 130 235 129 238 128 239 127 240 127 242 129 243 128 245 128 246 126 247 125 245 124 243 122 244 119 243 118 243 116 245 114 244 111 245 110 244 107 246 106 246 103 247 103 247 102 247 97 247 96 248 95 248 92 247 86 247 85 246 85 246 84 246 79 248 76 248 75 246 74 246 73 247 72 247 71 245 65 245 63 244 62 244 61 245 59 244 59 244 56 241 53 242 53 242 51 243 50 243 48 241 45 241 43 241 42 240 41 255 41 255 28 297 28 298 29 299 29 300 29 301 30 303 34 304 35 305 37 308 39 310 39 311 40 312 42 313 42 315 45 315 46 317 46 317 47 319 47 320 48 321 51 322 52 323 52 324 54 325 54 325 55 326 55 327 56 328 56 328 57 329 56 330 57 331 57 331 58 332 58 333 59 334 60 335 60 335 62 337 62 337 63 338 65 338 67 339 68 338 68 340 69 339 69 341 71 341 72 342 73 343 74 342 76 343 77 342 79 343 79 343 80 343 81 343 82 344 83 345 85 346 89 350 92 350 93 351 93 352 93 354 94 355 95 354 95 356 97 357 97 359 99 361 100 364 100 365 101 366 102 367 103 368 103 369 104 371 104 373 106 374 106 374 107Z","lx":298,"ly":112},
            {"n":"Coahuila","ab":"COAH","d":"M464 143 464 144 463 145 462 145 460 146 454 145 450 145 449 146 449 148 447 151 447 152 447 154 446 154 444 154 442 155 441 155 440 156 438 159 438 162 441 164 442 161 443 161 445 163 445 168 444 170 443 171 442 173 439 173 436 175 433 175 432 176 431 179 429 181 429 182 433 187 436 189 437 192 438 193 439 193 440 194 439 197 439 199 440 201 441 201 442 202 444 202 445 206 445 207 449 209 448 210 452 210 452 211 453 211 454 212 453 213 453 214 452 215 450 214 447 214 446 212 444 212 443 212 443 213 442 214 440 217 441 220 441 222 438 222 438 223 438 224 438 225 439 226 440 228 440 229 439 232 437 232 436 232 436 233 435 233 433 232 431 231 429 227 428 227 425 226 423 227 422 228 419 228 418 224 417 224 416 224 414 221 412 219 409 218 407 217 397 216 392 217 391 218 391 219 388 221 388 222 387 224 388 226 387 227 384 226 382 225 378 224 377 223 376 222 376 219 373 217 373 215 371 213 370 210 372 208 374 208 373 207 372 206 371 206 371 205 373 203 374 202 375 199 374 194 374 192 374 190 372 186 372 185 373 182 371 178 369 175 368 174 367 173 364 172 363 172 362 170 360 168 360 167 360 166 362 165 363 164 364 164 364 162 362 162 362 161 362 156 361 152 361 151 361 150 361 149 360 149 359 144 360 143 360 142 359 142 360 141 360 140 359 139 361 138 361 136 360 136 360 135 362 135 365 128 366 127 365 125 365 124 368 120 369 120 371 119 373 115 373 114 374 115 375 114 375 113 373 112 375 107 376 108 376 107 377 107 376 108 378 108 378 109 378 108 379 109 380 109 381 109 382 109 382 106 383 107 383 106 384 105 385 104 385 103 386 103 387 103 387 102 388 102 388 101 387 101 388 100 388 98 389 98 389 97 389 96 390 94 390 93 391 91 391 90 393 89 392 88 393 87 394 87 396 87 397 86 400 86 401 84 402 83 403 83 403 84 405 84 407 86 408 86 409 86 409 85 410 85 412 85 412 86 412 85 414 85 415 85 415 86 416 86 417 86 418 86 418 87 418 86 419 87 421 86 421 85 421 86 423 86 424 87 425 86 425 87 425 88 426 90 427 89 427 90 427 91 428 92 428 91 428 90 429 90 429 92 428 93 429 93 431 94 431 95 433 95 435 98 436 98 438 99 438 100 440 101 441 103 443 105 443 106 444 110 444 111 445 111 446 113 447 114 447 115 447 116 447 118 449 118 449 119 450 120 450 121 450 122 452 122 451 123 451 124 451 125 453 128 453 129 454 130 455 131 458 132 459 134 460 135 460 136 461 137 461 138 462 139 462 140 463 141 463 142 464 142Z","lx":408,"ly":156},
            {"n":"Nuevo León","ab":"NL","d":"M467 146 466 146 465 148 462 149 461 149 462 150 461 151 462 152 466 152 466 153 465 154 466 155 466 158 466 159 467 160 468 163 466 165 465 167 465 168 467 168 468 169 469 170 468 171 468 174 469 175 470 175 471 177 473 177 474 181 476 184 478 184 477 185 479 186 480 186 481 186 481 187 481 188 480 189 481 189 482 190 485 190 486 191 487 193 488 194 490 192 491 192 495 192 496 193 496 194 496 198 497 199 496 200 496 202 497 204 496 205 497 205 499 206 500 206 500 207 498 208 498 210 496 210 495 212 494 212 493 213 489 214 488 215 487 217 484 217 484 216 483 216 482 218 480 218 481 221 481 223 480 223 479 223 479 225 478 225 477 224 477 225 475 226 474 227 472 227 471 229 468 230 466 232 466 234 468 234 469 237 468 244 470 246 471 249 473 250 473 252 471 252 470 254 469 254 468 255 465 254 463 255 462 258 461 260 461 261 461 264 461 265 458 265 457 266 457 267 457 268 453 267 451 270 449 269 448 268 448 266 447 262 447 261 448 255 448 254 447 253 447 248 446 246 444 243 444 241 442 240 442 239 443 237 442 237 443 235 441 235 440 235 439 233 439 232 440 229 440 228 439 226 438 225 438 224 438 223 438 222 441 222 441 220 440 217 442 214 443 213 443 212 444 212 446 212 447 214 450 214 452 215 453 214 453 213 454 212 453 211 452 211 452 210 448 210 449 209 445 207 445 206 444 202 442 202 441 201 440 201 439 199 439 197 440 194 439 193 438 193 437 192 436 189 433 187 429 182 429 181 431 179 432 176 433 175 436 175 439 173 442 173 443 171 444 170 445 168 445 163 443 161 442 161 441 164 438 162 438 159 440 156 441 155 442 155 444 154 446 154 447 154 447 152 447 151 449 148 449 146 450 145 454 145 460 146 462 145 463 145 464 144 464 143 465 143 465 144 466 144Z","lx":460,"ly":204},
            {"n":"Tamaulipas","ab":"TAM","d":"M517 240 517 244 517 240ZM524 213 524 214 522 221 521 219 521 218 522 218 522 217 524 213ZM515 295 513 296 512 294 511 293 510 292 509 292 507 291 506 291 505 289 503 290 502 290 503 291 501 291 500 291 499 290 498 290 494 290 492 291 491 291 489 292 487 290 487 291 484 291 482 291 480 291 478 288 477 286 477 285 475 284 473 283 473 282 472 281 471 282 471 283 470 283 468 283 465 282 461 281 460 280 460 279 459 276 460 273 459 272 458 271 458 269 457 268 457 267 457 266 458 265 461 265 461 264 461 261 461 260 462 258 463 255 465 254 468 255 469 255 470 254 471 252 473 252 473 250 471 249 470 246 468 244 469 237 468 234 466 234 466 232 468 230 471 229 473 227 474 227 475 226 477 225 477 224 478 225 479 225 479 223 480 223 481 223 481 221 480 218 482 218 483 216 484 216 484 217 487 217 488 215 489 214 493 213 494 212 495 212 496 210 498 210 498 208 500 207 500 206 499 206 497 205 496 205 497 204 496 202 496 200 497 199 496 198 496 194 496 193 495 192 491 192 490 192 488 194 487 193 486 191 485 190 482 190 481 189 480 189 481 188 481 187 481 186 480 186 479 186 477 185 478 184 476 184 474 181 473 177 471 177 470 175 469 175 468 174 468 171 469 170 468 169 467 168 465 168 465 167 466 165 468 163 467 160 466 159 466 158 466 155 465 154 466 153 466 152 462 152 461 151 462 150 461 149 462 149 465 148 466 146 467 146 468 146 468 147 469 147 470 147 471 148 471 147 471 148 472 149 472 151 473 151 473 154 472 156 473 156 473 157 474 157 474 158 474 160 474 162 474 163 474 164 475 164 475 165 475 166 476 167 477 167 477 168 478 169 479 171 480 172 480 175 481 175 481 177 482 178 483 179 482 180 483 181 484 181 485 182 486 181 486 182 487 182 488 183 488 182 490 182 490 183 492 183 493 185 495 185 495 186 496 186 497 186 497 187 499 186 499 187 500 188 502 188 502 189 502 190 504 190 505 191 506 190 506 191 508 191 509 191 510 191 511 191 513 191 514 191 515 191 516 192 519 192 520 194 521 194 522 196 524 196 524 197 526 197 526 195 526 194 527 195 527 194 528 194 530 193 531 193 531 194 531 199 530 202 524 214 524 213 525 210 525 209 525 208 524 208 522 208 522 207 521 208 522 209 523 210 522 210 521 210 521 211 522 212 521 212 521 211 520 212 519 211 519 210 518 210 517 211 517 212 517 213 516 212 515 213 516 213 517 214 517 213 518 214 517 215 518 215 517 216 518 218 516 220 517 221 518 222 519 222 517 223 517 224 516 224 516 225 517 225 517 226 517 229 517 230 516 234 516 232 515 232 514 232 514 233 514 234 514 235 515 237 515 238 515 236 516 235 516 238 516 245 515 245 516 246 516 253 517 253 517 254 516 254 516 256 516 257 516 255 516 254 517 254 516 263 516 274 516 278 515 279 515 280 514 282 513 284 513 285 514 286 514 289 513 289 513 290 514 292 515 294 515 295Z","lx":493,"ly":239},
            {"n":"Sinaloa","ab":"SIN","d":"M317 284 318 284 318 285 318 286 317 284ZM256 219 257 220 258 220 258 221 259 222 259 225 258 225 257 223 256 222 256 219ZM251 217 253 217 256 222 257 223 257 225 254 220 251 217ZM251 214 253 215 253 216 251 215 251 214ZM229 183 230 184 231 184 231 185 230 185 232 187 232 186 232 185 232 184 232 185 232 184 231 183 231 182 230 180 231 180 231 182 232 181 233 182 233 183 233 184 234 184 236 182 238 181 240 181 240 178 240 177 244 176 247 172 248 172 248 169 251 165 252 164 256 163 257 164 257 167 258 167 259 167 260 169 260 171 260 172 260 174 260 175 261 176 261 178 265 183 266 188 270 189 273 189 275 190 278 195 279 198 281 201 282 201 282 202 281 203 279 205 279 206 280 206 279 210 279 215 278 217 279 217 280 219 280 220 281 222 281 224 282 224 283 224 285 224 286 227 287 227 289 232 290 231 290 232 291 236 292 237 292 239 293 239 294 239 295 239 296 239 299 237 299 236 303 237 305 238 306 239 307 239 307 240 309 243 309 245 310 246 310 247 310 249 311 250 312 253 313 255 314 257 315 258 316 261 317 264 317 265 317 267 319 268 319 270 319 271 321 272 322 271 323 271 325 273 324 274 324 277 322 279 322 280 322 282 323 283 323 284 324 285 324 287 324 288 320 287 318 286 318 285 317 283 318 282 317 282 317 284 318 285 317 286 318 288 317 289 314 283 311 280 309 279 305 274 300 269 302 270 300 269 299 269 299 268 298 268 298 266 297 264 294 261 293 260 292 259 290 257 290 256 288 253 288 252 280 245 281 245 281 244 281 243 280 243 280 244 276 241 274 241 269 237 265 234 265 233 266 234 269 236 270 236 271 237 272 238 273 238 272 238 272 237 273 237 273 236 273 235 271 233 270 233 270 235 269 235 268 233 267 234 266 234 266 233 264 231 262 230 261 230 260 230 259 229 260 228 258 226 259 226 260 227 261 226 260 225 260 224 260 223 259 223 259 222 260 222 260 221 259 220 259 218 258 218 257 217 256 217 254 215 252 215 252 213 251 213 250 214 250 215 248 213 243 210 243 209 242 209 240 207 241 206 240 205 239 205 239 204 237 204 237 205 237 206 238 206 237 207 236 207 236 206 235 206 234 206 234 207 232 205 233 205 233 204 234 205 235 204 235 203 236 203 237 203 236 201 235 201 234 202 233 204 232 203 232 204 231 204 231 203 229 201 228 202 230 203 230 204 228 203 226 202 225 202 227 202 227 200 225 199 224 199 224 198 224 196 224 195 224 194 223 194 224 191 225 191 227 187 227 185 228 184 229 184 228 185 227 188 228 188 228 187 228 186 228 187 229 185 229 183Z","lx":272,"ly":220},
            {"n":"Durango","ab":"DGO","d":"M281 201 281 200 283 199 284 201 285 201 286 201 287 202 289 202 290 204 291 202 295 199 297 196 297 194 296 193 297 189 298 188 298 186 299 186 299 185 300 184 302 183 302 182 302 181 301 181 301 180 302 179 302 177 303 174 304 173 304 171 305 171 305 170 306 169 307 170 308 170 310 171 311 171 312 173 313 174 314 175 316 175 317 176 318 176 319 177 321 177 322 179 323 179 324 179 325 180 326 179 327 179 328 179 330 178 330 177 331 178 332 178 335 178 337 180 338 181 339 181 341 180 343 180 343 179 343 178 345 175 347 174 348 173 350 172 350 171 349 171 348 171 349 170 351 171 352 171 353 172 354 172 355 171 357 172 360 171 361 171 360 172 361 171 362 172 363 172 364 172 367 173 368 174 369 175 371 178 373 182 372 185 372 186 374 190 374 192 374 194 375 199 374 202 373 203 371 205 371 206 372 206 373 207 374 208 372 208 370 210 371 213 373 215 373 217 376 219 376 222 377 223 378 224 382 225 384 226 387 227 388 226 387 224 388 222 388 221 391 219 392 220 392 221 392 222 393 223 394 224 395 225 394 229 395 230 396 234 395 234 395 235 396 235 396 236 390 236 388 236 387 237 385 236 384 236 383 235 380 236 378 236 374 235 372 237 372 238 370 240 368 243 365 245 363 245 363 247 364 249 363 251 364 253 363 254 364 258 361 260 359 263 359 265 358 271 357 271 356 274 356 275 357 278 356 284 356 285 353 286 352 288 351 291 348 292 347 293 345 292 344 290 342 288 340 287 339 286 337 288 336 289 334 284 335 283 337 282 338 281 337 280 336 280 336 279 335 277 333 277 332 276 330 274 329 276 327 276 325 273 323 271 322 271 321 272 319 271 319 270 319 268 317 267 317 265 317 264 316 261 315 258 314 257 313 255 312 253 311 250 310 249 310 247 310 246 309 245 309 243 307 240 307 239 306 239 305 238 303 237 299 236 299 237 296 239 295 239 294 240 293 239 292 239 292 237 291 236 290 232 290 231 289 232 287 227 286 227 285 224 283 224 282 225 281 224 281 222 280 220 280 219 279 217 278 217 279 215 279 210 280 206 279 206 279 205 281 203 282 202 282 201 281 201Z","lx":335,"ly":222},
            {"n":"Zacatecas","ab":"ZAC","d":"M391 219 391 218 392 217 397 216 407 217 409 218 412 219 414 221 416 224 417 224 418 224 419 228 422 228 423 227 425 226 428 227 429 227 431 231 433 232 435 233 436 233 436 232 437 232 439 232 439 233 438 233 437 235 436 236 436 238 435 238 433 238 432 239 432 240 431 242 430 243 428 243 427 244 426 247 428 248 426 251 425 253 420 254 417 260 413 262 411 263 410 264 410 265 407 266 405 265 404 265 403 267 404 267 403 269 404 272 403 276 403 277 403 279 404 280 408 282 409 284 411 284 413 285 413 287 415 289 417 289 419 288 424 283 425 283 426 283 428 285 428 287 425 294 426 298 426 300 425 300 425 301 423 305 422 306 421 306 421 305 419 304 416 302 414 301 411 300 409 298 409 296 404 293 403 292 402 290 401 292 400 293 396 295 395 295 394 296 393 299 389 303 388 306 388 308 391 310 390 312 391 314 394 316 393 318 392 320 390 321 387 324 385 323 384 324 383 324 383 326 381 327 379 327 378 327 378 328 377 328 376 328 373 327 371 327 370 326 369 325 368 324 366 323 370 321 371 320 371 319 371 318 370 318 369 318 368 318 367 315 369 315 371 313 371 311 371 309 374 307 375 305 379 303 380 303 381 302 382 300 383 296 382 296 380 296 379 295 380 294 380 293 378 293 376 293 375 295 377 296 374 298 373 300 372 300 371 300 370 300 368 300 367 300 367 299 371 293 371 292 371 290 369 289 368 288 364 289 364 296 363 298 362 297 361 296 361 292 363 288 364 286 365 285 365 284 364 283 361 284 359 285 359 286 360 290 361 291 360 293 358 294 357 293 359 290 358 290 355 291 355 294 353 294 352 295 351 294 351 293 351 291 352 288 353 286 356 285 356 284 357 278 356 275 356 274 357 271 358 271 359 265 359 263 361 260 364 258 363 254 364 253 363 251 364 249 363 247 363 245 365 245 368 243 370 240 372 238 372 237 374 235 378 236 380 236 383 235 384 236 385 236 387 237 388 236 390 236 396 236 396 235 395 235 395 234 396 234 395 230 394 229 395 225 394 224 393 223 392 222 392 221 392 220Z","lx":392,"ly":267},
            {"n":"San Luis Potosí","ab":"SLP","d":"M439 233 440 235 441 235 443 235 442 237 443 237 442 239 442 240 444 241 444 243 446 246 447 248 447 253 448 254 448 255 447 261 447 262 448 266 448 268 449 269 451 270 453 267 457 268 458 269 458 271 459 272 460 273 459 276 459 279 460 280 461 281 465 282 468 283 470 283 471 283 471 282 472 281 473 282 473 283 475 284 477 285 477 286 478 288 480 291 482 291 484 291 487 291 487 290 489 292 491 291 492 291 493 292 493 293 495 293 500 294 501 295 502 298 499 298 498 299 498 302 496 302 495 303 496 303 497 303 496 304 497 304 496 305 497 306 498 306 499 307 497 308 497 309 496 309 494 309 494 310 495 314 496 314 497 317 495 317 493 319 492 322 491 321 490 323 489 323 487 322 486 320 484 320 483 320 482 319 479 315 478 313 477 313 476 313 475 316 473 316 470 316 469 315 469 314 467 313 466 313 465 314 463 316 461 316 461 315 460 315 458 316 457 313 456 314 456 313 453 311 449 310 448 310 447 312 447 313 446 314 443 314 440 312 435 309 434 309 433 308 428 307 427 306 424 306 423 305 425 301 425 300 426 300 426 298 425 294 428 287 428 285 426 283 425 283 424 283 419 288 417 289 415 289 413 287 413 285 411 284 409 284 408 282 404 280 403 279 403 277 403 276 404 272 403 269 404 267 403 267 404 265 405 265 407 266 410 265 410 264 411 263 413 262 417 260 420 254 425 253 426 251 428 248 426 247 427 244 428 243 430 243 431 242 432 240 432 239 433 238 435 238 436 238 436 236 437 235 438 233Z","lx":449,"ly":285},
            {"n":"Nayarit","ab":"NAY","d":"M304 319 304 320 303 320 303 319 304 319ZM299 315 300 315 301 316 300 316 300 317 298 316 297 316 299 315ZM293 310 296 310 296 311 297 312 297 313 296 313 294 312 293 311 293 310ZM293 307 293 308 293 309 293 308 293 307ZM318 286 318 287 318 289 319 289 318 290 319 296 318 292 316 287 317 289 318 289 317 286 318 286ZM325 273 327 276 329 276 330 274 332 276 333 277 335 277 336 279 336 280 337 280 338 281 337 282 335 283 334 284 336 289 337 288 339 286 340 287 342 288 344 290 345 292 347 293 348 292 351 291 351 293 351 294 352 295 351 300 352 303 353 303 354 304 355 304 356 304 356 307 357 309 361 309 363 314 365 315 365 316 364 321 362 323 360 323 359 324 358 324 354 324 353 333 352 333 351 334 352 335 352 336 353 338 353 339 352 338 352 337 349 335 348 334 346 331 342 330 341 329 340 328 339 328 335 331 333 330 332 331 327 336 326 335 325 335 322 334 323 334 324 331 324 332 325 330 326 329 327 328 327 327 328 328 329 326 329 325 329 322 329 319 330 316 330 315 329 314 328 314 324 311 322 308 319 303 318 300 319 297 319 296 320 298 321 299 323 300 323 298 322 297 322 298 321 297 320 297 321 296 320 296 319 296 320 295 319 294 319 291 319 290 319 289 318 289 318 288 318 286 320 287 324 288 324 287 324 285 323 284 323 283 322 282 321 280 322 279 323 277 324 274 325 273Z","lx":339,"ly":307},
            {"n":"Jalisco","ab":"JAL","d":"M391 310 393 309 397 309 399 310 401 311 402 311 405 310 406 310 408 306 413 304 411 302 411 301 411 300 414 301 416 302 419 304 421 305 421 306 420 307 421 308 420 309 420 310 418 315 419 315 418 318 419 318 418 319 418 320 417 320 416 321 415 324 413 326 411 330 409 331 409 332 407 334 407 335 409 336 410 339 409 342 408 345 405 345 403 346 402 346 400 346 399 346 398 347 395 348 394 348 393 349 392 349 392 351 389 352 387 351 385 351 385 352 384 352 383 352 383 354 383 356 383 357 384 357 384 356 386 356 389 357 390 358 391 360 390 361 389 362 391 366 391 369 394 368 395 369 395 371 392 373 392 376 389 375 388 376 384 379 382 380 380 382 379 381 378 380 376 382 374 382 373 382 373 380 372 379 372 377 372 374 373 372 372 372 371 371 370 370 371 369 370 366 367 369 364 370 362 371 359 370 356 373 355 373 354 373 350 373 349 373 348 374 347 375 346 374 345 376 343 376 342 375 341 375 340 375 340 374 340 373 339 373 338 374 336 373 334 371 334 370 334 369 333 369 333 368 333 366 332 366 331 366 331 365 328 363 328 362 327 361 326 360 322 354 321 352 321 350 321 349 320 348 318 346 317 344 318 343 319 342 327 341 328 340 329 338 329 337 327 336 332 331 333 330 335 331 339 328 340 328 341 329 343 330 346 331 348 334 349 335 352 337 353 339 353 338 352 336 352 335 351 334 352 333 353 333 354 324 358 324 359 324 360 323 362 323 364 321 365 316 365 315 363 314 361 309 357 309 356 307 356 304 355 304 354 304 353 303 352 303 351 300 352 295 353 294 355 294 355 291 358 290 359 290 357 293 358 294 360 293 361 291 360 290 359 286 359 285 361 284 364 283 365 284 365 285 364 286 363 288 361 292 361 296 362 297 363 298 364 296 364 289 368 288 369 289 371 290 371 292 371 293 367 299 367 300 368 300 370 300 371 300 372 300 373 300 374 298 377 296 375 295 376 293 378 293 380 293 380 294 379 295 380 296 382 296 383 296 382 300 381 302 380 303 379 303 375 305 374 307 371 309 371 311 371 313 369 315 367 315 368 318 369 318 370 318 371 318 371 319 371 320 370 321 366 323 368 324 369 325 370 326 371 327 373 327 376 328 377 328 378 328 378 327 379 327 381 327 383 326 383 324 384 324 385 323 387 324 390 321 392 320 393 318 394 316 391 314 390 312Z","lx":369,"ly":340},
            {"n":"Colima","ab":"COL","d":"M373 382 370 384 369 384 369 386 367 387 366 389 361 385 355 382 351 381 352 380 352 379 351 378 349 379 349 378 347 378 342 376 343 376 345 376 346 374 347 375 348 374 349 373 350 373 354 373 355 373 356 373 359 370 362 371 364 370 367 369 370 366 371 369 370 370 371 371 372 372 373 372 372 374 372 377 372 379 373 380Z","lx":362,"ly":377},
            {"n":"Aguascalientes","ab":"AGU","d":"M391 310 388 308 388 306 389 303 393 299 394 296 395 295 396 295 400 293 401 292 402 290 403 292 404 293 409 296 409 298 411 300 411 301 411 302 413 304 408 306 406 310 405 310 402 311 401 311 399 310 397 309 393 309Z","lx":400,"ly":302},
            {"n":"Guanajuato","ab":"GTO","d":"M465 314 466 315 466 317 465 319 467 319 467 321 466 322 465 323 464 324 463 324 462 322 460 323 458 326 458 328 457 329 456 329 456 330 453 330 451 331 447 331 446 332 445 336 446 337 447 339 447 342 448 344 450 345 451 347 451 348 451 349 451 350 451 352 451 353 450 354 448 355 447 355 447 357 446 357 447 356 446 355 444 356 443 357 439 357 437 356 435 356 435 355 434 353 432 354 431 353 430 354 430 355 429 355 427 354 425 354 424 354 424 350 424 349 425 349 426 349 424 347 423 346 422 347 421 346 419 347 417 350 416 349 414 349 413 349 412 350 411 350 411 349 410 346 411 346 410 345 409 346 409 345 408 345 409 342 410 339 409 336 407 335 407 334 409 332 409 331 411 330 413 326 415 324 416 321 417 320 418 320 418 319 419 318 418 318 419 315 418 315 420 310 420 309 421 308 420 307 421 306 422 306 423 305 424 306 427 306 428 307 433 308 434 309 435 309 440 312 443 314 446 314 447 313 447 312 448 310 449 310 453 311 456 313 456 314 457 313 458 316 460 315 461 315 461 316 463 316Z","lx":434,"ly":331},
            {"n":"Michoacán","ab":"MICH","d":"M408 345 409 345 409 346 410 345 411 346 410 346 411 349 411 350 412 350 413 349 414 349 416 349 417 350 419 347 421 346 422 347 423 346 424 347 426 349 425 349 424 349 424 350 424 354 425 354 427 354 429 355 430 355 430 354 431 353 432 354 434 353 435 355 435 356 437 356 439 357 443 357 444 356 446 355 447 356 446 357 447 357 447 355 448 355 450 354 451 353 451 352 451 350 451 349 451 348 451 347 452 348 454 350 454 351 457 354 457 356 458 357 456 359 456 361 456 362 454 362 453 362 454 364 454 365 455 370 454 370 453 371 453 373 453 374 452 376 450 378 450 379 449 380 447 381 446 383 445 384 443 387 442 385 441 386 440 387 441 391 442 394 445 398 444 399 443 399 443 398 442 398 440 398 440 397 439 396 438 396 437 397 436 397 436 396 435 394 434 394 432 394 430 394 430 393 428 393 426 394 422 395 420 394 419 392 418 392 417 392 417 393 417 392 416 393 416 392 415 392 415 393 414 392 414 393 413 393 413 394 412 394 413 396 412 397 413 398 413 399 413 400 415 400 414 401 412 400 411 401 410 402 409 402 406 402 406 403 405 407 406 408 406 409 405 410 402 408 398 407 390 405 385 403 381 402 376 400 372 398 370 394 367 392 368 391 366 389 367 387 369 386 369 384 370 384 373 382 374 382 376 382 378 380 379 381 380 382 382 380 384 379 388 376 389 375 392 376 392 373 395 371 395 369 394 368 391 369 391 366 389 362 390 361 391 360 390 358 389 357 386 356 384 356 384 357 383 357 383 356 383 354 383 352 384 352 385 352 385 351 387 351 389 352 392 351 392 349 393 349 394 348 395 348 398 347 399 346 400 346 402 346 403 346 405 345Z","lx":413,"ly":376},
            {"n":"Querétaro","ab":"QRO","d":"M484 320 483 323 479 325 477 324 476 325 476 327 475 328 475 330 474 332 473 332 472 335 472 337 470 338 467 339 466 340 464 340 463 347 462 347 462 348 462 349 461 348 460 349 461 350 461 351 459 353 457 354 454 351 454 350 452 348 451 347 450 345 448 344 447 342 447 339 446 337 445 336 446 332 447 331 451 331 453 330 456 330 456 329 457 329 458 328 458 326 460 323 462 322 463 324 464 324 465 323 466 322 467 321 467 319 465 319 466 317 466 315 465 314 466 313 467 313 469 314 469 315 470 316 473 316 475 316 476 313 477 313 478 313 479 315 482 319 483 320Z","lx":463,"ly":332},
            {"n":"Hidalgo","ab":"HGO","d":"M497 317 498 318 497 321 499 322 501 323 502 323 503 322 505 323 507 326 505 329 505 331 505 332 505 333 504 333 502 332 499 334 499 335 498 335 498 339 498 340 497 342 498 345 499 346 500 346 501 344 504 343 506 341 507 340 509 338 510 337 512 338 512 341 509 344 508 345 504 347 505 348 507 348 508 350 507 355 505 358 506 363 504 362 503 364 501 365 499 365 498 365 493 367 493 365 495 361 495 359 489 360 487 363 486 362 485 360 486 359 487 359 488 354 488 353 487 353 485 354 481 355 480 359 480 360 477 359 477 361 476 362 476 360 476 358 475 358 475 356 473 355 474 354 473 351 472 351 472 350 467 349 465 348 463 347 464 340 466 340 467 339 470 338 472 337 472 335 473 332 474 332 475 330 475 328 476 327 476 325 477 324 479 325 483 323 484 320 486 320 487 322 489 323 490 323 491 321 492 322 493 319 495 317Z","lx":489,"ly":342},
            {"n":"Estado de México","ab":"MEX","d":"M455 398 454 399 454 398 455 398ZM463 347 465 348 467 349 472 350 472 351 473 351 474 354 473 355 475 356 475 358 476 358 476 360 476 362 477 361 477 359 480 360 480 359 481 355 485 354 487 353 488 353 488 354 487 359 486 359 485 360 486 361 486 362 487 363 487 362 489 360 495 359 495 361 493 365 493 367 494 368 495 368 495 369 496 371 495 371 495 372 496 376 496 380 495 381 493 383 490 382 489 380 488 379 488 378 489 377 488 375 487 374 485 372 485 370 483 368 483 367 481 369 480 371 477 374 477 375 480 379 476 386 475 387 474 389 473 390 472 390 470 390 469 389 468 389 468 390 467 391 466 392 465 392 464 392 464 393 461 393 460 393 459 393 459 394 459 395 457 396 455 398 454 398 452 396 452 395 450 395 449 395 448 395 450 393 450 392 450 391 448 390 448 389 449 384 450 382 449 379 450 379 450 378 452 376 453 374 453 373 453 371 454 370 455 370 454 364 453 362 454 362 456 362 456 361 456 359 458 357 457 356 457 354 459 353 461 351 461 349 460 349 461 348 462 349 462 348 462 347 463 347Z","lx":469,"ly":372},
            {"n":"Puebla","ab":"PUE","d":"M512 338 512 336 513 335 513 334 514 333 514 332 516 332 518 332 518 334 516 335 517 335 518 335 518 336 518 337 519 338 521 339 522 340 520 343 519 342 517 343 517 347 518 349 519 350 521 349 521 351 522 351 524 350 525 348 526 347 533 350 531 353 529 358 529 359 529 360 528 361 527 364 526 365 528 368 527 369 527 370 529 371 533 371 535 373 536 373 536 374 536 375 535 375 531 375 530 376 531 382 531 383 529 385 529 388 529 389 530 390 534 391 534 392 536 395 537 395 538 394 539 393 542 394 544 396 543 397 541 400 539 401 537 402 537 401 537 402 535 404 531 403 530 403 528 406 527 408 526 408 525 408 525 406 523 403 522 402 521 401 522 400 522 399 522 398 520 398 519 399 517 403 517 404 519 406 518 408 517 408 516 408 514 406 512 407 509 407 507 407 505 408 504 410 502 409 501 407 499 407 498 408 496 408 496 407 492 405 493 404 493 403 490 404 488 401 487 401 486 399 486 398 488 396 489 395 490 395 491 393 492 393 494 396 495 395 494 387 496 380 496 376 495 372 495 371 496 371 495 369 496 369 497 369 500 371 502 373 502 374 503 375 507 378 508 377 511 375 512 375 513 376 514 376 515 375 517 372 518 373 520 372 521 372 521 371 520 370 519 369 518 367 516 367 515 367 515 366 511 362 511 361 510 361 509 363 508 363 506 363 505 358 507 355 508 350 507 348 505 348 504 347 508 345 509 344 512 341Z","lx":515,"ly":380},
            {"n":"Tlaxcala","ab":"TLAX","d":"M506 363 508 363 509 363 510 361 511 361 511 362 515 366 515 367 516 367 518 367 519 369 520 370 521 371 521 372 520 372 518 373 517 372 515 375 514 376 513 376 512 375 511 375 508 377 507 378 503 375 502 374 502 373 500 371 497 369 496 369 495 369 495 368 494 368 493 367 498 365 499 365 501 365 503 364 504 362Z","lx":538,"ly":349,"nl":true,"cx":508,"cy":369},
            {"n":"Ciudad de México","ab":"CDMX","d":"M488 379 487 379 485 380 484 379 482 380 481 379 480 379 477 375 477 374 480 371 481 369 483 367 483 368 485 370 485 372 487 374 488 375 489 377 488 378Z","lx":449,"ly":399,"nl":true,"cx":483,"cy":375},
            {"n":"Morelos","ab":"MOR","d":"M480 379 481 379 482 380 484 379 485 380 487 379 488 379 489 380 490 382 493 383 495 381 496 380 494 387 495 395 494 396 492 393 491 393 490 395 489 395 488 396 486 398 483 396 478 395 476 393 475 392 474 392 473 392 474 391 473 390 474 389 475 387 476 386Z","lx":485,"ly":388},
            {"n":"Veracruz","ab":"VER","d":"M525 315 524 317 523 318 523 317 525 315ZM518 305 519 308 518 307 518 305ZM520 306 522 308 527 313 526 316 525 320 524 321 524 319 526 315 525 314 524 312 522 310 520 307 518 304 518 303 520 306ZM492 291 494 290 498 290 499 290 500 291 501 291 503 291 502 290 503 290 505 289 506 291 507 291 509 292 510 292 511 293 512 294 513 296 515 295 516 300 518 305 517 306 518 307 518 310 519 311 519 313 521 316 522 315 523 316 522 317 523 319 524 320 524 321 525 321 525 324 530 334 531 337 531 338 536 343 536 344 542 350 546 355 546 356 549 359 550 362 550 364 551 365 551 366 552 368 552 370 553 373 554 374 556 375 557 376 558 377 557 378 558 379 561 380 561 382 562 384 563 385 566 387 564 386 563 386 564 386 564 387 565 388 564 388 564 389 565 388 566 388 567 387 568 388 571 389 581 389 584 391 584 392 586 393 590 393 590 394 591 395 592 396 592 397 594 400 595 402 598 403 601 403 609 401 607 402 609 402 609 403 608 402 607 403 608 404 608 406 608 408 608 411 609 412 611 412 612 414 613 414 614 415 616 416 617 416 618 419 618 421 618 422 618 424 620 425 616 427 614 428 613 429 585 428 585 426 584 426 584 425 581 422 578 418 578 416 579 416 580 415 578 414 577 415 573 416 570 418 567 419 566 419 564 419 562 414 562 413 561 412 562 412 563 409 564 408 564 407 563 403 563 402 561 402 559 402 558 402 556 402 555 402 555 401 554 401 553 399 552 398 550 399 548 397 548 396 547 394 548 392 547 392 546 391 545 391 545 392 545 393 545 394 544 396 542 394 539 393 538 394 537 395 536 395 534 392 534 391 530 390 529 389 529 388 529 385 531 383 531 382 530 376 531 375 535 375 536 375 536 374 536 373 535 373 533 371 529 371 527 370 527 369 528 368 526 365 527 364 528 361 529 360 529 359 529 358 531 353 533 350 526 347 525 348 524 350 522 351 521 351 521 349 519 350 518 349 517 347 517 343 518 342 520 343 522 340 521 339 519 338 518 337 518 336 518 335 517 335 516 335 518 334 518 332 516 333 514 332 514 333 513 334 513 335 512 336 512 338 510 337 509 338 507 340 506 341 504 343 501 344 500 346 499 346 498 345 497 342 498 340 498 339 498 335 499 335 499 334 502 332 504 333 505 333 505 332 505 331 505 329 507 326 505 323 503 322 502 323 501 323 499 323 497 321 498 318 497 317 496 314 495 314 494 310 494 309 496 309 497 309 497 308 499 307 497 306 496 305 497 304 496 304 497 303 496 303 495 303 496 302 498 302 498 299 499 298 502 298 500 295 500 294 495 293 493 293 492 292 492 291Z","lx":550,"ly":371},
            {"n":"Guerrero","ab":"GRO","d":"M449 380 450 382 449 384 448 389 448 390 450 391 450 392 450 393 448 395 449 395 450 395 452 395 452 397 454 398 455 398 457 396 459 395 459 394 459 393 460 393 461 393 464 393 464 392 465 392 466 392 467 391 468 390 468 389 469 389 470 390 472 390 473 390 474 391 473 392 474 392 475 392 476 393 478 395 483 396 486 398 486 400 487 401 488 401 490 404 493 403 493 404 492 405 496 407 496 408 498 408 499 407 501 407 502 409 504 410 502 414 502 415 505 421 505 426 504 427 504 429 505 429 507 430 507 431 507 433 508 434 509 434 510 436 509 439 508 440 506 440 506 441 505 442 501 446 501 448 496 451 493 448 491 445 489 445 489 446 487 446 477 442 474 442 470 442 468 441 466 440 464 439 463 438 464 438 464 437 463 437 463 438 462 438 461 436 460 436 434 426 433 425 431 423 430 422 424 420 424 419 423 418 422 417 420 417 420 416 419 416 418 414 416 413 415 410 411 408 409 408 408 408 407 409 406 408 405 407 406 403 409 402 410 402 411 401 412 401 414 401 415 400 413 400 413 399 413 398 412 397 413 396 412 394 413 394 413 393 414 393 414 392 415 393 415 392 416 392 416 393 417 392 417 393 417 392 418 392 419 392 420 394 422 395 426 394 428 393 430 393 430 394 432 394 434 394 435 394 436 396 436 397 437 397 438 396 439 397 440 397 441 398 442 398 443 398 443 399 444 399 445 398 442 395 441 391 440 387 441 386 442 385 443 387 445 384 446 383 447 381 449 380ZM454 398 454 399 455 398 454 398Z","lx":463,"ly":416},
            {"n":"Oaxaca","ab":"OAX","d":"M544 396 545 394 545 393 545 392 545 391 546 391 547 392 548 392 547 394 548 396 548 397 550 399 552 398 553 399 554 401 555 401 555 402 556 402 558 402 559 402 561 402 563 402 563 403 564 407 564 408 563 409 562 412 561 412 562 413 562 414 564 419 566 419 567 419 570 418 573 416 577 415 578 414 580 415 579 416 578 416 578 418 581 422 584 425 584 426 585 426 585 428 613 430 613 432 612 433 611 437 609 440 606 446 606 447 607 450 607 451 607 453 607 454 605 455 605 454 604 454 603 454 603 453 602 453 601 452 600 452 600 453 599 453 599 454 600 455 605 455 608 457 607 458 603 456 600 455 592 454 592 453 594 453 595 452 596 451 593 450 592 451 592 452 591 452 590 452 591 451 590 450 590 449 589 448 587 449 586 451 584 451 583 452 584 453 583 453 589 453 591 454 587 454 583 455 581 454 581 455 579 455 579 456 578 456 578 457 576 458 576 459 575 459 574 460 573 460 571 460 571 461 569 462 566 462 565 463 561 464 558 465 557 466 554 468 550 467 548 468 546 468 543 467 539 466 537 465 535 464 534 464 534 463 530 461 527 461 525 461 522 460 521 460 519 460 518 460 516 460 510 456 505 453 500 453 496 451 501 448 501 446 505 442 506 441 506 440 508 440 509 439 509 436 509 434 508 434 507 433 507 431 507 430 505 429 504 429 504 427 505 426 505 421 502 415 502 414 504 410 505 408 507 407 509 407 512 407 514 406 516 408 517 408 518 408 519 406 517 404 517 403 519 399 520 398 522 398 522 399 522 400 521 401 522 402 523 403 525 406 525 408 526 408 527 408 528 406 530 403 531 403 535 404 537 402 537 401 537 402 539 401 541 400 543 397Z","lx":549,"ly":435},
            {"n":"Chiapas","ab":"CHIS","d":"M607 458 608 457 609 458 607 458ZM607 454 607 453 607 451 607 450 606 447 606 446 608 440 611 437 612 433 613 432 613 430 614 428 616 428 620 425 622 421 623 420 624 418 625 417 626 416 626 409 628 409 629 408 631 409 632 411 633 411 636 411 635 413 634 415 634 416 636 418 636 420 636 421 638 421 638 420 639 420 640 422 640 423 640 424 641 424 643 423 646 421 651 417 652 416 655 415 656 414 655 412 656 412 656 411 658 412 660 412 660 410 662 410 662 411 663 411 664 411 665 411 666 412 666 414 669 415 670 419 669 421 674 423 675 424 676 426 675 426 675 427 674 427 675 428 676 428 677 429 678 429 678 430 679 431 680 431 680 432 681 433 682 433 682 434 684 436 685 437 686 437 687 437 687 438 688 438 689 439 690 439 692 441 694 443 694 446 695 446 695 447 694 447 695 447 696 447 697 447 697 448 698 447 698 448 698 449 700 449 700 450 700 451 699 452 700 452 699 454 700 455 699 456 700 456 699 456 699 458 667 457 655 478 659 483 658 485 657 485 657 486 657 488 656 490 657 494 656 495 655 497 650 493 639 482 639 481 638 481 627 470 622 466 616 462 612 460 612 459 613 459 613 460 614 460 614 459 613 457 608 456 607 455 607 454Z","lx":648,"ly":447},
            {"n":"Tabasco","ab":"TAB","d":"M620 397 616 399 614 399 620 397ZM649 390 650 394 650 395 652 396 653 396 653 397 654 397 655 398 655 400 656 400 657 403 658 405 662 407 662 409 664 409 665 409 667 410 669 410 670 409 671 409 670 407 671 406 673 405 677 406 679 408 680 408 681 409 682 409 686 411 686 412 685 427 675 427 675 426 676 426 675 424 674 423 669 421 670 419 669 415 666 414 666 412 665 411 664 411 663 411 662 411 662 410 660 410 659 412 658 412 656 411 656 412 655 412 656 414 655 415 652 416 651 417 646 421 643 423 641 424 640 424 640 423 640 422 639 420 638 420 636 421 636 420 636 418 634 416 634 415 635 413 636 411 633 411 632 411 631 409 629 408 628 409 626 409 626 416 625 417 624 418 622 420 622 421 620 425 618 424 618 422 618 421 618 419 617 416 616 416 614 415 613 414 612 414 611 412 609 412 608 411 608 408 608 406 608 404 607 403 608 402 609 403 609 402 607 402 609 401 613 400 613 401 616 400 617 400 616 399 617 399 618 399 619 399 620 399 621 398 621 397 624 396 624 397 625 396 631 396 631 397 631 398 632 398 632 397 633 397 634 397 632 396 633 396 636 396 638 396 641 394 643 391 649 390Z","lx":645,"ly":409},
            {"n":"Campeche","ab":"CAM","d":"M672 387 672 388 671 389 670 388 670 389 669 390 668 389 668 390 666 391 664 391 664 390 667 390 672 387ZM701 333 701 341 705 341 706 343 707 343 708 344 709 344 709 343 710 342 710 343 711 344 711 345 712 346 714 347 715 352 719 354 721 356 724 360 724 364 725 364 726 366 732 370 735 375 735 381 734 381 733 382 733 384 733 390 733 391 734 392 734 393 733 394 734 395 734 396 734 398 734 402 734 404 731 406 732 409 732 412 686 412 686 411 682 409 681 409 680 409 679 408 677 406 673 405 671 406 670 407 671 409 670 409 669 410 667 410 665 409 664 409 662 409 662 407 658 405 657 403 656 400 655 400 655 398 654 397 653 397 653 396 652 396 650 395 650 394 649 390 652 390 661 389 662 391 664 391 663 393 663 392 663 393 662 391 661 392 660 392 660 393 660 394 662 394 661 393 662 393 663 393 664 394 671 396 672 396 672 395 673 394 678 393 678 390 679 390 679 388 679 387 678 386 677 387 676 387 676 386 676 385 676 384 677 383 676 384 676 385 675 386 674 386 673 387 675 384 682 380 687 377 692 372 692 371 692 370 693 368 692 366 693 364 693 363 694 362 694 361 698 358 699 356 698 353 698 352 698 350 698 346 698 345 698 341 699 338 700 335 701 333Z","lx":703,"ly":385},
            {"n":"Yucatán","ab":"YUC","d":"M772 315 772 320 772 321 771 322 771 325 772 328 772 329 771 331 770 334 769 335 769 337 768 338 767 339 763 341 760 343 759 343 757 343 756 342 755 343 754 346 754 348 753 348 752 346 751 346 751 347 750 349 750 350 744 352 742 353 741 354 741 355 739 354 738 356 736 357 734 357 731 358 730 359 727 359 726 360 726 361 726 362 725 364 724 364 724 360 721 356 719 354 715 352 714 347 712 346 711 345 711 344 710 343 710 342 709 343 709 344 708 344 707 343 706 343 705 341 701 341 701 333 701 332 702 330 702 329 700 333 700 332 701 329 702 328 708 324 710 323 712 322 713 322 714 322 715 321 718 321 719 320 723 320 739 318 744 316 745 314 750 313 754 313 755 313 757 311 759 312 761 313 764 313 765 314 766 315 768 315 770 315 767 314Z","lx":737,"ly":334},
            {"n":"Quintana Roo","ab":"ROO","d":"M792 339 791 342 790 343 787 346 785 347 785 346 785 344 787 340 788 340 789 340 791 340 792 339ZM732 409 731 406 734 404 734 402 734 398 734 396 734 395 733 394 734 393 734 392 733 391 733 390 733 384 733 382 734 381 735 381 735 375 732 370 726 366 725 364 726 362 726 361 726 360 727 359 730 359 731 358 734 357 736 357 738 356 739 354 741 355 741 354 742 353 744 352 750 350 750 349 751 347 751 346 752 346 753 348 754 348 754 346 755 343 756 342 757 343 759 343 760 343 763 341 767 339 768 338 769 337 769 335 770 334 771 331 772 329 772 328 771 325 771 322 772 321 772 320 772 315 773 315 773 316 774 316 776 316 777 317 777 316 779 317 780 317 780 316 783 316 783 314 782 313 783 313 783 312 784 313 785 313 786 314 787 314 787 315 788 317 789 321 790 321 790 320 791 319 790 318 790 317 791 319 790 321 790 322 790 323 790 324 792 325 791 327 790 327 790 328 789 332 787 333 786 335 785 336 785 337 783 339 779 342 777 344 776 347 775 349 773 353 773 355 774 356 774 357 775 358 774 359 773 360 774 359 775 358 775 357 774 357 774 358 773 360 772 360 771 360 769 363 767 363 767 365 768 366 768 367 769 366 768 367 769 367 769 368 770 367 772 366 772 367 773 366 774 365 775 366 774 369 772 371 772 370 769 371 769 373 769 374 768 375 768 376 770 376 772 373 773 373 773 374 773 373 774 373 772 376 772 379 770 383 768 388 768 389 767 393 766 394 766 396 765 399 764 402 763 402 763 401 763 400 763 398 763 397 762 397 762 396 759 395 758 394 759 393 759 391 760 390 760 389 760 388 760 387 759 386 759 385 756 388 755 389 756 389 753 394 751 395 751 394 749 395 748 394 747 395 746 398 745 399 745 401 744 403 743 406 741 406 741 408 739 409 739 411 738 410 737 409 737 408 736 408 735 407 733 408 732 409ZM782 312 782 313 780 314 779 314 778 314 777 314 777 313 778 314 780 314 782 312Z","lx":757,"ly":364}
        ];
        const CIUDADES_A_ESTADO = {
            'los mochis':'Sinaloa','culiacan':'Sinaloa','mazatlan':'Sinaloa','guasave':'Sinaloa','ahome':'Sinaloa','guamuchil':'Sinaloa','escuinapa':'Sinaloa','el fuerte':'Sinaloa','choix':'Sinaloa','sinaloa':'Sinaloa','topolobampo':'Sinaloa','elota':'Sinaloa','salvador alvarado':'Sinaloa',
            'hermosillo':'Sonora','ciudad obregon':'Sonora','obregon':'Sonora','nogales':'Sonora','guaymas':'Sonora','agua prieta':'Sonora','puerto penasco':'Sonora','san luis rio colorado':'Sonora','navojoa':'Sonora','etchojoa':'Sonora','cananea':'Sonora','caborca':'Sonora',
            'mexicali':'Baja California','tijuana':'Baja California','ensenada':'Baja California','rosarito':'Baja California','playas de rosarito':'Baja California','tecate':'Baja California','valle de guadalupe':'Baja California',
            'la paz':'Baja California Sur','cabo san lucas':'Baja California Sur','los cabos':'Baja California Sur','san jose del cabo':'Baja California Sur','comondu':'Baja California Sur','loreto':'Baja California Sur','santa rosalia':'Baja California Sur','guerrero negro':'Baja California Sur',
            'ciudad juarez':'Chihuahua','chihuahua':'Chihuahua','cuauhtemoc':'Chihuahua','delicias':'Chihuahua','parral':'Chihuahua','hidalgo del parral':'Chihuahua','nuevo casas grandes':'Chihuahua','camargo':'Chihuahua','meoqui':'Chihuahua',
            'saltillo':'Coahuila','torreon':'Coahuila','monclova':'Coahuila','piedras negras':'Coahuila','ramos arizpe':'Coahuila','sabinas':'Coahuila','frontera':'Coahuila','ciudad acuna':'Coahuila',
            'monterrey':'Nuevo León','san pedro garza garcia':'Nuevo León','guadalupe':'Nuevo León','apodaca':'Nuevo León','juarez':'Nuevo León','san nicolas de los garza':'Nuevo León','escobedo':'Nuevo León','garcia':'Nuevo León','salinas victoria':'Nuevo León',
            'reynosa':'Tamaulipas','matamoros':'Tamaulipas','tampico':'Tamaulipas','nuevo laredo':'Tamaulipas','ciudad victoria':'Tamaulipas','rio bravo':'Tamaulipas','valle hermoso':'Tamaulipas','altamira':'Tamaulipas','ciudad madero':'Tamaulipas',
            'durango':'Durango','victoria de durango':'Durango','gomez palacio':'Durango','lerdo':'Durango','santiago papasquiaro':'Durango',
            'zacatecas':'Zacatecas','fresnillo':'Zacatecas','jerez':'Zacatecas','rio grande':'Zacatecas','calera':'Zacatecas','pinos':'Zacatecas',
            'san luis potosi':'San Luis Potosí','slp':'San Luis Potosí','matehuala':'San Luis Potosí','ciudad valles':'San Luis Potosí','rioverde':'San Luis Potosí','tamazunchale':'San Luis Potosí',
            'tepic':'Nayarit','bahia de banderas':'Nayarit','compostela':'Nayarit','tuxpan':'Nayarit','ruiz':'Nayarit','san blas':'Nayarit','acaponeta':'Nayarit',
            'guadalajara':'Jalisco','zapopan':'Jalisco','tlaquepaque':'Jalisco','puerto vallarta':'Jalisco','tonala':'Jalisco','lagos de moreno':'Jalisco','ajijic':'Jalisco','chapala':'Jalisco','tepatitlan':'Jalisco','ocotlan':'Jalisco','talpa de allende':'Jalisco',
            'colima':'Colima','manzanillo':'Colima','villa de alvarez':'Colima','tecoman':'Colima','coquimatlan':'Colima',
            'morelia':'Michoacán','uruapan':'Michoacán','zamora':'Michoacán','lazaro cardenas':'Michoacán','patzcuaro':'Michoacán','la piedad':'Michoacán','apatzingan':'Michoacán','zitacuaro':'Michoacán','sahuayo':'Michoacán',
            'guanajuato':'Guanajuato','leon':'Guanajuato','irapuato':'Guanajuato','celaya':'Guanajuato','salamanca':'Guanajuato','san miguel de allende':'Guanajuato','dolores hidalgo':'Guanajuato','silao':'Guanajuato','acambaro':'Guanajuato','penjamo':'Guanajuato','salvatierra':'Guanajuato','moroleon':'Guanajuato','uriangato':'Guanajuato',
            'queretaro':'Querétaro','santiago de queretaro':'Querétaro','san juan del rio':'Querétaro','amealco':'Querétaro','cadereyta':'Querétaro','corregidora':'Querétaro','ezequiel montes':'Querétaro',
            'pachuca':'Hidalgo','pachuca de soto':'Hidalgo','tulancingo':'Hidalgo','tula':'Hidalgo','tula de allende':'Hidalgo','huejutla':'Hidalgo','huejutla de reyes':'Hidalgo','mineral de la reforma':'Hidalgo','ciudad sahagun':'Hidalgo',
            'toluca':'Estado de México','ecatepec':'Estado de México','nezahualcoyotl':'Estado de México','naucalpan':'Estado de México','cuautitlan':'Estado de México','metepec':'Estado de México','atizapan':'Estado de México','texcoco':'Estado de México','valle de bravo':'Estado de México','huixquilucan':'Estado de México','lerma':'Estado de México','almoloya de juarez':'Estado de México','xonacatlan':'Estado de México','tultitlan':'Estado de México','tultepec':'Estado de México','coacalco':'Estado de México','chimalhuacan':'Estado de México','la paz':'Estado de México','ixtapaluca':'Estado de México','chalco':'Estado de México','cuautitlan izcalli':'Estado de México','zumpango':'Estado de México','teotihuacan':'Estado de México','nicolas romero':'Estado de México',
            'mexico d.f.':'Ciudad de México','df':'Ciudad de México','mexico df':'Ciudad de México','cdmx':'Ciudad de México','ciudad de mexico':'Ciudad de México','alvaro obregon':'Ciudad de México','benito juarez':'Ciudad de México','miguel hidalgo':'Ciudad de México','coyoacan':'Ciudad de México','cuauhtemoc':'Ciudad de México','santa fe':'Ciudad de México','polanco':'Ciudad de México','condesa':'Ciudad de México','roma':'Ciudad de México',
            'cuernavaca':'Morelos','cuautla':'Morelos','jiutepec':'Morelos','temixco':'Morelos','jojutla':'Morelos','tepoztlan':'Morelos','yautepec':'Morelos','atlanatlahuca':'Morelos','axochiapan':'Morelos',
            'puebla':'Puebla','puebla de zaragoza':'Puebla','cholula':'Puebla','san andres cholula':'Puebla','tehuacan':'Puebla','atlixco':'Puebla','san martin texmelucan':'Puebla','huauchinango':'Puebla','amozoc':'Puebla',
            'tlaxcala':'Tlaxcala','apizaco':'Tlaxcala','huamantla':'Tlaxcala','calpulalpan':'Tlaxcala','chiautempan':'Tlaxcala',
            'veracruz':'Veracruz','xalapa':'Veracruz','xalapa enriquez':'Veracruz','cordoba':'Veracruz','orizaba':'Veracruz','boca del rio':'Veracruz','poza rica':'Veracruz','coatzacoalcos':'Veracruz','minatitlan':'Veracruz','tuxpan':'Veracruz','papantla':'Veracruz','perote':'Veracruz','cosamaloapan':'Veracruz','fortin':'Veracruz','alvarado':'Veracruz','tierra blanca':'Veracruz','acayucan':'Veracruz','cosoleacaque':'Veracruz','las choapas':'Veracruz',
            'acapulco':'Guerrero','acapulco de juarez':'Guerrero','chilpancingo':'Guerrero','iguala':'Guerrero','taxco':'Guerrero','zihuatanejo':'Guerrero','ixtapa':'Guerrero','petatlan':'Guerrero','chilapa':'Guerrero','tlapa':'Guerrero','coyuca de benitez':'Guerrero',
            'oaxaca':'Oaxaca','puerto escondido':'Oaxaca','huatulco':'Oaxaca','salina cruz':'Oaxaca','tuxtepec':'Oaxaca','tehuantepec':'Oaxaca','juchitan':'Oaxaca','pinotepa nacional':'Oaxaca','huajuapan':'Oaxaca',
            'tuxtla gutierrez':'Chiapas','tuxtla':'Chiapas','tapachula':'Chiapas','san cristobal de las casas':'Chiapas','chiapa de corzo':'Chiapas','comitan':'Chiapas','tonala':'Chiapas','arriaga':'Chiapas','pichucalco':'Chiapas','ocosingo':'Chiapas','palenque':'Chiapas','huixtla':'Chiapas','motozintla':'Chiapas',
            'villahermosa':'Tabasco','cardenas':'Tabasco','comalcalco':'Tabasco','teapa':'Tabasco','paraiso':'Tabasco','centla':'Tabasco','huimanguillo':'Tabasco','macuspana':'Tabasco','tenosique':'Tabasco','jalpa':'Tabasco','tacotalpa':'Tabasco',
            'campeche':'Campeche','san francisco de campeche':'Campeche','ciudad del carmen':'Campeche','carmen':'Campeche','champoton':'Campeche','escarcega':'Campeche','calkini':'Campeche','tenabo':'Campeche',
            'merida':'Yucatán','valladolid':'Yucatán','progreso':'Yucatán','uman':'Yucatán','tizimin':'Yucatán','motul':'Yucatán','izamal':'Yucatán','maxcanu':'Yucatán','oxkutzcab':'Yucatán','chichen itza':'Yucatán',
            'cancun':'Quintana Roo','playa del carmen':'Quintana Roo','chetumal':'Quintana Roo','tulum':'Quintana Roo','cozumel':'Quintana Roo','felipe carrillo puerto':'Quintana Roo','isla mujeres':'Quintana Roo','puerto morelos':'Quintana Roo','akumal':'Quintana Roo','riviera maya':'Quintana Roo','bacalar':'Quintana Roo',
            'aguascalientes':'Aguascalientes','jesus maria':'Aguascalientes','calvillo':'Aguascalientes','rincon de romos':'Aguascalientes','asientos':'Aguascalientes','pabellon de arteaga':'Aguascalientes','tepezala':'Aguascalientes'
        };
        function normTxt(s){ return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
        function estadoFromCiudad(c){
            const raw = (c || '').trim(); if(!raw) return null;
            const n = normTxt(raw);
            for(const e of ESTADOS_MEX){ if(normTxt(e.n) === n) return e.n; }
            if(CIUDADES_A_ESTADO[n]) return CIUDADES_A_ESTADO[n];
            for(const e of ESTADOS_MEX){ const en = normTxt(e.n); if(en.length > 4 && (n.includes(en) || en.includes(n))) return e.n; }
            for(const k in CIUDADES_A_ESTADO){ if((k.length > 5 && n.includes(k)) || (n.length > 5 && k.includes(n))) return CIUDADES_A_ESTADO[k]; }
            return null;
        }
        let solEstadoFiltro = null;
        function seleccionarEstadoMapa(estado){
            solEstadoFiltro = (solEstadoFiltro === estado) ? null : estado;
            navigateTo('solicitudes');
        }
        function limpiarFiltroEstado(){ solEstadoFiltro = null; navigateTo('solicitudes'); }
        function renderMapaEstados(solicitudes){
            const conteos = {}; const nuevosX = {}; let sinEstado = 0;
            solicitudes.forEach(s => {
                const e = estadoFromCiudad(s.ciudad);
                if(e){ conteos[e] = (conteos[e] || 0) + 1; if(s.estado === 'nuevo') nuevosX[e] = (nuevosX[e] || 0) + 1; }
                else sinEstado++;
            });
            const maxC = Math.max(1, ...Object.values(conteos));
            const top = Object.entries(conteos).sort((a,b) => b[1] - a[1]).slice(0, 6);
                            const pieza = e => {
                    const c = conteos[e.n] || 0;
                    const t = c / maxC;
                    const sel = solEstadoFiltro === e.n;
                    const fill = c === 0 ? '#eef2f1' : 'hsl(145,' + Math.round(45 + t * 35) + '%,' + Math.round(96 - t * 76) + '%)';
                    const tooltip = '<title>' + escapeHTML(e.n) + ': ' + c + ' prospecto' + (c === 1 ? '' : 's') + (nuevosX[e.n] ? ' (' + nuevosX[e.n] + ' nuevo' + (nuevosX[e.n] === 1 ? '' : 's') + ')' : '') + '</title>';
                    const path = '<path d="' + e.d + '" class="cursor-pointer transition duration-150 ' + (sel ? '' : 'hover:opacity-80') + '" style="fill:' + fill + ';stroke:' + (sel ? '#f59e0b' : '#ffffff') + ';stroke-width:' + (sel ? 2.5 : 1.2) + ';stroke-linejoin:round" onclick="seleccionarEstadoMapa(\'' + escapeHTML(e.n) + '\')">' + tooltip + '</path>';
                    let labels = '';
                    if(e.nl){
                        labels = '<line x1="' + e.cx + '" y1="' + e.cy + '" x2="' + e.lx + '" y2="' + e.ly + '" stroke="#94a3b8" stroke-width="1" pointer-events="none"/><circle cx="' + e.cx + '" cy="' + e.cy + '" r="1.8" fill="#64748b" pointer-events="none"/>'
                            + '<text x="' + e.lx + '" y="' + e.ly + '" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-weight="700" fill="#475569" style="paint-order:stroke;stroke:rgba(255,255,255,.92);stroke-width:2px;pointer-events:none">' + e.ab + (c > 0 ? ' ' + c : '') + '</text>';
                    } else {
                        labels = '<text x="' + e.lx + '" y="' + (e.ly - (c > 0 ? 5.5 : 0)) + '" text-anchor="middle" dominant-baseline="central" font-size="7.5" font-weight="700" fill="#64748b" style="paint-order:stroke;stroke:rgba(255,255,255,.85);stroke-width:1.8px;pointer-events:none">' + e.ab + '</text>';
                    }
                    return { path: path, labels: labels };
                };
return '<div class="mb-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">'
                + '<div class="flex items-start justify-between flex-wrap gap-2 mb-3">'
                + '<div><h3 class="text-lg font-bold text-slate-900 flex items-center gap-2"><i class="fas fa-map-marked-alt text-emerald-600"></i> Mapa de prospectos por estado</h3>'
                + '<p class="text-xs text-slate-500 mt-0.5">Los estados se pintan en intensidades de verde según el número de prospectos. Pasa el cursor para ver el detalle y da clic en un estado para filtrar la tabla.</p></div>'
                + (solEstadoFiltro ? '<button onclick="limpiarFiltroEstado()" class="text-xs font-semibold px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 hover:bg-emerald-200 shrink-0"><i class="fas fa-filter mr-1"></i>' + escapeHTML(solEstadoFiltro) + ' <i class="fas fa-times ml-1"></i></button>' : '')
                + '</div>'
                + '<div class="flex flex-col lg:flex-row gap-4">'
                + '<div class="flex-1 min-w-0 bg-slate-50 rounded-xl border border-slate-100 p-2"><svg viewBox="0 0 793 498" class="w-full h-auto select-none" role="img" aria-label="Mapa de México con prospectos por estado">' + (() => { const ps = ESTADOS_MEX.map(pieza); return ps.map(p => p.path).join('') + ps.map(p => p.labels).join(''); })() + '</svg></div>'
                + '<div class="lg:w-60 shrink-0 space-y-3">'
                + '<div class="bg-slate-50 rounded-xl border border-slate-100 p-3"><p class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Top estados</p>'
                + (top.length ? top.map(([n,c]) => '<button onclick="seleccionarEstadoMapa(\'' + escapeHTML(n) + '\')" class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm hover:bg-emerald-50 ' + (solEstadoFiltro === n ? 'bg-emerald-100 ring-1 ring-emerald-300' : '') + '"><span class="w-2.5 h-2.5 rounded-sm shrink-0" style="background:hsl(145,60%,' + Math.round(96 - (c / maxC) * 76) + '%)"></span><span class="flex-1 text-left truncate font-medium text-slate-700">' + escapeHTML(n) + '</span><span class="font-bold text-emerald-700">' + c + '</span></button>').join('') : '<p class="text-xs text-slate-400">Sin prospectos todavía</p>')
                + '</div>'
                + (sinEstado ? '<div class="bg-slate-50 rounded-xl border border-slate-100 p-3"><p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sin estado identificado</p><p class="text-sm font-bold text-slate-700 mt-1">' + sinEstado + ' solicitud' + (sinEstado === 1 ? '' : 'es') + '</p></div>' : '')
                + '<div class="bg-slate-50 rounded-xl border border-slate-100 p-3"><p class="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Escala</p><div class="h-2.5 rounded-full" style="background:linear-gradient(90deg,hsl(145,45%,96%),hsl(145,55%,72%),hsl(145,75%,40%),hsl(145,80%,20%))"></div><div class="flex justify-between text-[10px] text-slate-500 mt-1"><span>0</span><span>' + maxC + ' prospecto' + (maxC === 1 ? '' : 's') + '</span></div></div>'
                + '</div></div></div>';
        }

        function renderSolicitudes() {
            const solicitudes = (db.solicitudes || []).sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
            const estF = window.solEstatusFiltro || 'all';
            const qF = (window.solSearchQ || '').trim().toLowerCase();
            const filtradas = solicitudes.filter(s => {
                const okMapa = !solEstadoFiltro || estadoFromCiudad(s.ciudad) === solEstadoFiltro;
                const okEst = estF === 'all' || (s.estado || 'nuevo') === estF;
                const okQ = !qF || [s.nombre, s.ciudad, s.email, s.whatsapp, s.interes, s.tipo, s.referido].some(v => String(v || '').toLowerCase().includes(qF));
                return okMapa && okEst && okQ;
            });
            return `
                <div>
                    <div class="flex items-center justify-between mb-6 flex-wrap gap-3">
                        <div>
                            <h2 class="text-2xl font-semibold">Solicitudes de Información</h2>
                            <p class="text-xs text-slate-500 mt-0.5">${filtradas.length} registro${filtradas.length === 1 ? '' : 's'} mostrado${filtradas.length === 1 ? '' : 's'} de ${solicitudes.length} en total</p>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <div class="relative">
                                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                                <input value="${escapeHTML(window.solSearchQ||'')}" oninput="window.solSearchQ=this.value;navigateTo('solicitudes')" placeholder="Buscar prospecto, ciudad, WhatsApp..." class="pl-8 pr-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900 w-56">
                            </div>
                            <select onchange="window.solEstatusFiltro=this.value;navigateTo('solicitudes')" class="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white text-slate-900">
                                <option value="all" ${estF==='all'?'selected':''}>Todos los estados (${solicitudes.length})</option>
                                <option value="nuevo" ${estF==='nuevo'?'selected':''}>Nuevos (${solicitudes.filter(s=>s.estado==='nuevo').length})</option>
                                <option value="contactado" ${estF==='contactado'?'selected':''}>Contactados (${solicitudes.filter(s=>s.estado==='contactado').length})</option>
                                <option value="convertido" ${estF==='convertido'?'selected':''}>Convertidos (${solicitudes.filter(s=>s.estado==='convertido').length})</option>
                            </select>
                            ${solEstadoFiltro ? `<button onclick="limpiarFiltroEstado()" class="text-xs font-semibold px-2.5 py-1.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300 hover:bg-emerald-200"><i class="fas fa-filter mr-1"></i>${escapeHTML(solEstadoFiltro)} <i class="fas fa-times ml-1"></i></button>` : ''}
                        </div>
                    </div>
                    ${solicitudes.filter(s => s.estado === 'nuevo').length ? `
                    <div class="mb-4 flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <div class="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0"><i class="fas fa-user-clock text-white"></i></div>
                        <div class="flex-1">
                            <p class="font-semibold text-emerald-900 text-sm"><i class="fas fa-bell mr-1"></i> Tienes ${solicitudes.filter(s => s.estado === 'nuevo').length} prospecto(s) nuevo(s) sin contactar</p>
                            <p class="text-xs text-emerald-700 mt-0.5">Recién llegados desde "Quiero aplicar". Contáctalos por WhatsApp y márcalos como contactados o conviértelos en usuario.</p>
                        </div>
                    </div>` : ''}
                    ${renderMapaEstados(solicitudes)}
                    <div class="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                        <div class="overflow-x-auto">
                            <table class="w-full">
                                <thead class="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th class="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Fecha</th>
                                        <th class="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Nombre / Ubicación</th>
                                        <th class="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Contacto</th>
                                        <th class="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Interés</th>
                                        <th class="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Referido</th>
                                        <th class="text-left px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Estado</th>
                                        <th class="text-right px-4 py-3 text-xs font-semibold text-slate-600 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-slate-100">
                                    ${filtradas.length ? filtradas.map(s => {
                                        const estGeo = estadoFromCiudad(s.ciudad);
                                        const uCreado = s.usuarioCreadoId ? (db.users||[]).find(u => String(u.id) === String(s.usuarioCreadoId)) : (db.users||[]).find(u => u.username && s.usuarioCreadoUsername && String(u.username).toLowerCase() === String(s.usuarioCreadoUsername).toLowerCase());
                                        return `
                                        <tr class="hover:bg-slate-50">
                                            <td class="px-4 py-3 text-sm text-slate-600">${new Date(s.fecha).toLocaleDateString('es-MX')} <span class="text-xs">${new Date(s.fecha).toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'})}</span></td>
                                            <td class="px-4 py-3">
                                                <div class="font-medium text-slate-900">${escapeHTML(s.nombre)}</div>
                                                <div class="text-xs text-slate-500">${escapeHTML(s.ciudad || '-')}${estGeo ? ` <span class="text-emerald-700 font-medium">(${escapeHTML(estGeo)})</span>` : ''}</div>
                                            </td>
                                            <td class="px-4 py-3 text-sm">
                                                <div>${escapeHTML(s.email || '-')}</div>
                                                <div class="text-xs text-slate-500">${escapeHTML(s.whatsapp || '-')}</div>
                                                ${s.gananciaEsperada ? `<div class="text-xs text-slate-600 mt-0.5"><i class="fas fa-sack-dollar mr-1"></i>Gana: ${escapeHTML(s.gananciaEsperada)}</div>` : ''}
                                            </td>
                                            <td class="px-4 py-3 text-sm">
                                                ${s.interes ? `<span class="inline-block px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-semibold max-w-[190px]">${escapeHTML(s.interes)}</span>` : `<div class="font-medium">${escapeHTML(s.tipo)}</div>`}
                                                <div class="text-xs text-slate-500 mt-0.5">${escapeHTML(s.plan || '-')}</div>
                                            </td>
                                            <td class="px-4 py-3 text-sm">
                                                ${s.referido ? `<span class="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs">${escapeHTML(s.referido)}</span>` : '-'}
                                            </td>
                                            <td class="px-4 py-3">
                                                <span class="px-2 py-1 text-xs rounded-full font-medium ${s.estado==='nuevo'?'bg-blue-100 text-blue-700':s.estado==='contactado'?'bg-amber-100 text-amber-700':s.estado==='convertido'?'bg-emerald-100 text-emerald-700':'bg-green-100 text-green-700'}">${escapeHTML(s.estado)}</span>
                                                ${uCreado ? `<div class="text-[11px] text-slate-500 mt-0.5 font-mono">@${escapeHTML(uCreado.username)}</div>` : ''}
                                            </td>
                                            <td class="px-4 py-3 text-right">
                                                <div class="flex items-center justify-end gap-2">
                                                    <a href="https://wa.me/${(s.whatsapp||'').replace(/[^0-9]/g,'')}?text=Hola%20${encodeURIComponent(s.nombre)}%2C%20vimos%20tu%20solicitud%20de%20informaci%C3%B3n%20sobre%20${encodeURIComponent(s.plan||s.tipo)}.%20%C2%BFTe%20ayudo%3F" target="_blank" class="px-2 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
                                                    <button onclick="marcarContactado('${s.id}')" class="px-2 py-1.5 bg-amber-500 text-white rounded-lg text-xs hover:bg-amber-600" title="Marcar contactado"><i class="fas fa-check"></i></button>
                                                    ${s.estado!=='convertido' ? `<button onclick="crearUsuarioDesdeSolicitud('${s.id}')" class="px-2 py-1.5 bg-indigo-600 text-white rounded-lg text-xs hover:bg-indigo-700" title="Crear usuario"><i class="fas fa-user-plus"></i></button>` : `<button onclick="navigateTo('users')" class="px-2 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-xs hover:bg-emerald-200" title="Ver en Usuarios"><i class="fas fa-user-check"></i></button>`}
                                                </div>
                                            </td>
                                        </tr>
                                        ${s.mensaje ? `<tr><td colspan="7" class="px-4 pb-3 -mt-2"><div class="text-xs text-slate-500 bg-slate-50 rounded p-2"><strong>Mensaje:</strong> ${escapeHTML(String(s.mensaje).replace(/\s*\|\s*Prima calculada: [^|]*/g, ''))}</div></td></tr>` : ''}`;
                                    }).join('') : `<tr><td colspan="7" class="px-4 py-12 text-center text-slate-500">No hay solicitudes${solEstadoFiltro ? ' en ' + escapeHTML(solEstadoFiltro) : ''} aún</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            `;
        }

        function marcarContactado(id) {
            const s = (db.solicitudes || []).find(x => String(x.id) === String(id));
            if (s) {
                s.estado = s.estado === 'contactado' ? 'nuevo' : 'contactado';
                saveDB();
                navigateTo('solicitudes');
            }
        }

        let solUsuarioActiva = null;
        function crearUsuarioDesdeSolicitud(id) {
            const s = (db.solicitudes || []).find(x => String(x.id) === String(id));
            if (!s) return;
            solUsuarioActiva = s;
            const base = (s.nombre || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'').slice(0, 12) || 'prospecto';
            const taken = new Set((db.users || []).map(u => (u.username || '').toLowerCase()));
            let sugerido = base, n = 2;
            while (taken.has(sugerido)) { sugerido = base + n; n++; }
            const estadoDetectado = estadoFromCiudad(s.ciudad) || '';
            const agenciasList = (db.users || []).filter(u => u.role === 'agencia');
            const estadosOpts = ESTADOS_MEX.map(e => `<option value="${escapeHTML(e.n)}" ${estadoDetectado===e.n?'selected':''}>${escapeHTML(e.n)}</option>`).join('');
            const passSugerida = 'BB-' + Math.random().toString(36).slice(2, 6).toUpperCase() + '26';
            const html = `
                <div class="p-6">
                    <div class="flex items-center gap-3 mb-2">
                        <div class="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center"><i class="fas fa-user-plus text-emerald-700"></i></div>
                        <div>
                            <h3 class="text-lg font-bold text-slate-900">Crear usuario para ${escapeHTML(s.nombre)}</h3>
                            <p class="text-xs text-slate-500">Se conservarán su WhatsApp (${escapeHTML(s.whatsapp || '—')}) y ubicación para el mapa de Usuarios.</p>
                        </div>
                    </div>
                    <form id="form-crear-usuario" onsubmit="confirmarCrearUsuario(event)" class="mt-4 space-y-3">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs font-semibold text-slate-700 mb-1 block">Usuario</label>
                                <input required id="nuevo-usuario" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900" value="${escapeHTML(sugerido)}" placeholder="usuario">
                            </div>
                            <div>
                                <label class="text-xs font-semibold text-slate-700 mb-1 block">Contraseña inicial</label>
                                <input required id="nuevo-password" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900 font-mono" value="${escapeHTML(passSugerida)}" placeholder="contraseña">
                            </div>
                        </div>
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="text-xs font-semibold text-slate-700 mb-1 block">Rol inicial</label>
                                <select id="nuevo-rol-sol" onchange="const w=document.getElementById('sol-agencia-wrap');if(w)w.classList.toggle('hidden',!['agente_desarrollo','agente_agencia'].includes(this.value));" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900">
                                    <option value="prospecto" selected>Prospecto</option>
                                    <option value="agente_desarrollo">Agente en Desarrollo</option>
                                    <option value="agente_agencia">Agente de Agencia</option>
                                    <option value="alumno">Alumno</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-xs font-semibold text-slate-700 mb-1 block">Ubicación (Estado)</label>
                                <select id="nuevo-ubicacion-sol" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900">
                                    <option value="">— Sin estado —</option>
                                    ${estadosOpts}
                                </select>
                            </div>
                        </div>
                        <div id="sol-agencia-wrap" class="hidden">
                            <label class="text-xs font-semibold text-slate-700 mb-1 block">Agencia asignada (opcional)</label>
                            <select id="nuevo-agencia-sol" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900">
                                <option value="">— Sin asignar —</option>
                                ${agenciasList.map(a => `<option value="${a.id}">${escapeHTML(a.name || a.username)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="flex gap-2 pt-2">
                            <button type="button" onclick="closeModal()" class="flex-1 py-2.5 border border-slate-300 text-slate-600 font-semibold rounded-xl hover:bg-slate-50 text-sm">Cancelar</button>
                            <button type="submit" class="flex-1 py-2.5 bg-emerald-600 text-white font-semibold rounded-xl hover:bg-emerald-700 text-sm"><i class="fas fa-user-plus mr-1"></i> Crear y copiar acceso</button>
                        </div>
                    </form>
                </div>
            `;
            showModal(html);
            setTimeout(() => { const inp = document.getElementById('nuevo-usuario'); if (inp) { inp.focus(); inp.select(); } }, 50);
        }

        function confirmarCrearUsuario(e) {
            e.preventDefault();
            const s = solUsuarioActiva;
            const username = (document.getElementById('nuevo-usuario')?.value || '').trim();
            const password = (document.getElementById('nuevo-password')?.value || '').trim();
            const role = (document.getElementById('nuevo-rol-sol')?.value || 'prospecto').trim();
            const ubicacion = (document.getElementById('nuevo-ubicacion-sol')?.value || estadoFromCiudad(s?.ciudad) || '').trim();
            const agenciaIdRaw = (document.getElementById('nuevo-agencia-sol')?.value || '').trim();
            if (!s || !username || !password) return;
            if ((db.users || []).some(u => (u.username || '').toLowerCase() === username.toLowerCase())) {
                showToast('Ese usuario ya existe, elige otro', 'error');
                return;
            }
            const nuevoUser = {
                id: Date.now(),
                username: username,
                password: password,
                role: role,
                name: s.nombre,
                email: s.email || '',
                phone: s.whatsapp || '',
                ciudad: s.ciudad || '',
                ubicacion: ubicacion,
                avatar: `https://i.pravatar.cc/40?u=${encodeURIComponent(username)}`,
                xp: 0,
                students: []
            };
            if (['agente_desarrollo', 'agente_agencia'].includes(role) && agenciaIdRaw) {
                const ag = (db.users || []).find(u => String(u.id) === String(agenciaIdRaw) && u.role === 'agencia');
                if (ag) {
                    nuevoUser.agenciaId = ag.id;
                    nuevoUser.agencia = ag.id;
                    nuevoUser.parentId = ag.id;
                    nuevoUser.assignedTo = ag.id;
                }
            }
            db.users.push(nuevoUser);
            s.estado = 'convertido';
            s.usuarioCreadoId = nuevoUser.id;
            s.usuarioCreadoUsername = nuevoUser.username;
            saveDB();
            try {
                const msgAcceso = `Hola ${s.nombre}, bienvenido a Broker Booster.\nPortal: ${window.location.origin}\nUsuario: ${username}\nContraseña: ${password}`;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(msgAcceso).catch(() => {});
                }
            } catch (err) {}
            closeModal();
            showToast(`Usuario "${username}" (${role}) creado y acceso copiado al portapapeles`, 'success');
            navigateTo('solicitudes');
        }

        function exportMyProgressPDF() {

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ unit: 'pt' });
            const s = db.settings || {};
            const primary = s.primaryColor || '#0a2540';
            
            // Header
            doc.setFillColor(primary);
            doc.rect(0, 0, doc.internal.pageSize.getWidth(), 70, 'F');
            if (s.logo) {
                try { doc.addImage(s.logo, 'PNG', 40, 15, 40, 40); } catch(e) {}
            }
            doc.setTextColor(255,255,255);
            doc.setFontSize(18);
            doc.text(s.institutionName || 'Academia', 95, 35);
            doc.setFontSize(10);
            doc.text('Mi Reporte de Progreso', 95, 52);
            doc.setTextColor(0,0,0);
            
            doc.setFontSize(11);
            doc.text('Alumno: ' + (currentUser.name || currentUser.username), 40, 95);
            doc.setFontSize(9);
            doc.setTextColor(100);
            doc.text('Generado: ' + new Date().toLocaleString('es-MX'), 40, 112);
            
            const myProgress = db.progress.filter(p => p.userId === currentUser.id);
            const data = myProgress.map(p => {
                const lesson = db.lessons.find(l=>l.id===p.lessonId);
                const cat = db.categories.find(c => c.id === lesson?.categoryId);
                const estado = p.completed ? 'Completado' : 'En progreso';
                const fecha = p.date ? new Date(p.date).toLocaleDateString('es-MX') : '-';
                return [lesson?.title || 'N/A', cat?.name || '-', estado, (p.score || 0) + '%', fecha];
            });
            
            doc.autoTable({
                startY: 130,
                head: [['Lección', 'Categoría', 'Estado', 'Calificación', 'Última actividad']],
                body: data.length ? data : [['Sin progreso registrado', '', '', '', '']],
                theme: 'grid',
                headStyles: { fillColor: primary, textColor: 255 },
                bodyStyles: { fontSize: 9 },
                alternateRowStyles: { fillColor: [248,250,252] },
                margin: { left: 40, right: 40 }
            });
            
            // Resumen
            const completadas = myProgress.filter(p=>p.completed).length;
            const promedio = myProgress.length ? Math.round(myProgress.reduce((a,p)=>a+(p.score||0),0)/myProgress.length) : 0;
            const finalY = doc.lastAutoTable.finalY + 20;
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text('Resumen:', 40, finalY);
            doc.setFontSize(9);
            doc.setTextColor(80);
            doc.text(`• Lecciones completadas: ${completadas} de ${myProgress.length}`, 40, finalY + 16);
            doc.text(`• Promedio general: ${promedio}%`, 40, finalY + 32);
            doc.text(`• XP acumulado: ${currentUser.xp || 0}`, 40, finalY + 48);
            
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(s.footerText || '', 40, doc.internal.pageSize.getHeight() - 30);
            doc.save('mi-progreso-' + currentUser.username + '-' + new Date().toISOString().slice(0,10) + '.pdf');
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
