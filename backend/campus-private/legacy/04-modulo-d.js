
                /* ==================== PROSPECTO RECLUTAMIENTO ==================== */
        function getProspectoData() {
            if (!db.prospectos) db.prospectos = {};
            const uid = currentUser?.id || 'guest_prospecto';
            if (!db.prospectos[uid]) db.prospectos[uid] = {};
            const p = db.prospectos[uid];
            // migración: experiencia -> experiencia_laboral
            if (p.experiencia && !p.experiencia_laboral) {
                p.experiencia_laboral = p.experiencia;
            }
            // defaults
            p.experiencia_laboral = p.experiencia_laboral || '';
            p.perspectiva_ingresos = p.perspectiva_ingresos || '';
            p.equipo_ventas = p.equipo_ventas || 'No';
            p.oficina = p.oficina || 'No';
            p.cv_name = p.cv_name || '';
            return p;
        }
        function saveProspectoData() { saveDB(); }

        // 1. MI EXPERIENCIA
        function renderMiExperiencia() {
            const progress = getProspectProgress(currentUser.id);
            const saved = progress['mi-experiencia_data'] || {};
            return `<div class="max-w-3xl mx-auto p-6">
                <div class="bg-white rounded-2xl shadow-sm border p-8">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><span class="font-bold text-red-600">1</span></div>
                        <h1 class="text-2xl font-black">Mi experiencia</h1>
                        ${progress['mi-experiencia'] ? '<span class="ml-auto bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">COMPLETADO</span>' : ''}
                    </div>
                    <p class="text-gray-600 mb-6">Cuéntanos sobre ti. Esta información crea tu expediente y es visible para el equipo de reclutamiento.</p>
                    <div class="space-y-4">
                        <div><label class="text-sm font-bold">Experiencia laboral</label><textarea id="me-experiencia" class="w-full mt-1 p-3 border rounded-xl" rows="3" placeholder="Cuéntanos tu experiencia laboral previa...">${escapeHTML(saved.experiencia_laboral||'')}</textarea></div>
                        <div><label class="text-sm font-bold">¿Cuál es la perspectiva de ingresos que espera?</label><input id="me-ingresos" type="text" class="w-full mt-1 p-3 border rounded-xl" placeholder="Ej: $25,000 mensuales" value="${escapeHTML(saved.perspectiva_ingresos||'')}"></div>
                        <div class="grid md:grid-cols-2 gap-4">
                            <div><label class="text-sm font-bold">¿Cuenta con equipo de ventas?</label><select id="me-equipo" class="w-full mt-1 p-3 border rounded-xl"><option value="">Selecciona</option><option value="Sí" ${saved.equipo_ventas==='Sí'?'selected':''}>Sí</option><option value="No" ${saved.equipo_ventas==='No'?'selected':''}>No</option><option value="En proceso" ${saved.equipo_ventas==='En proceso'?'selected':''}>En proceso</option></select></div>
                            <div><label class="text-sm font-bold">¿Cuenta con oficina?</label><select id="me-oficina" class="w-full mt-1 p-3 border rounded-xl"><option value="">Selecciona</option><option value="Sí propia" ${saved.oficina==='Sí propia'?'selected':''}>Sí propia</option><option value="Sí rentada" ${saved.oficina==='Sí rentada'?'selected':''}>Sí rentada</option><option value="Home office" ${saved.oficina==='Home office'?'selected':''}>Home office</option><option value="No" ${saved.oficina==='No'?'selected':''}>No</option></select></div>
                        </div>
                        <div><label class="text-sm font-bold">¿Por qué quieres ser agente de seguros?</label><textarea id="me-motivo" class="w-full mt-1 p-3 border rounded-xl" rows="3" placeholder="Tu motivación...">${escapeHTML(saved.motivo||'')}</textarea></div>
                    </div>
                    <button data-bx-click="a423" class="mt-6 w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Guardar y continuar →</button>
                    <p class="text-xs text-gray-500 mt-3">* Esta información será visible para roles Admin, GM y Desarrollador</p>
                </div>
            </div>`;
        }
        function guardarMiExperiencia() {
            const data = {
                experiencia_laboral: document.getElementById('me-experiencia').value.trim(),
                perspectiva_ingresos: document.getElementById('me-ingresos').value.trim(),
                equipo_ventas: document.getElementById('me-equipo').value,
                oficina: document.getElementById('me-oficina').value,
                motivo: document.getElementById('me-motivo').value.trim()
            };
            if (!data.experiencia_laboral || !data.perspectiva_ingresos || !data.equipo_ventas || !data.oficina || !data.motivo) {
                showToast('Completa los 5 campos para continuar', 'warning');
                return;
            }
            markProspectStep(currentUser.id, 'mi-experiencia', data);
            showToast('Experiencia guardada', 'success');
            setTimeout(()=>navigateTo('oferta-valor'), 800);
        }
        function guardarExperiencia(){
            const pd = getProspectoData();
            pd.experiencia_laboral = document.getElementById('exp_laboral').value.trim();
            pd.perspectiva_ingresos = document.getElementById('perspectiva_ingresos').value.trim();
            const eq = document.querySelector('input[name="equipo_ventas"]:checked');
            pd.equipo_ventas = eq ? eq.value : 'No';
            const of = document.querySelector('input[name="oficina"]:checked');
            pd.oficina = of ? of.value : 'No';
            const f = document.getElementById('cv_file').files[0];
            if(f) pd.cv_name = f.name;
            // compatibilidad legacy
            pd.experiencia = pd.experiencia_laboral;
            saveProspectoData();
            const s = document.getElementById('expStatus');
            if(s){ s.textContent = 'Guardado ✓'; setTimeout(()=> s.textContent='', 2000); }
        }

        // 2. OFERTA DE VALOR
        function getOfertaValor(){
            if(!db.oferta_valor) db.oferta_valor = { video_url: '', poster_url: '', slides: [] };
            const ov = db.oferta_valor;
            if(!Array.isArray(ov.slides) || ov.slides.length === 0){
                ov.slides = [
                    {t:'¿Por qué unirte a nosotros?', d:'Comisiones competitivas, capacitación CNSF incluida, acompañamiento 1-a-1.'},
                    {t:'Comisiones claras', d:'Vida, GMM, Daños y Autos. Bonos por producción y por equipo.'},
                    {t:'Capacitación CNSF', d:'Te preparamos para tu cédula, con simuladores y mentor.'},
                    {t:'Acompañamiento comercial', d:'Speeches, scripts y leads de práctica.'},
                    {t:'Crece a Director', d:'Forma tu equipo y gana override. Ruta Agente → Director de Agencia.'}
                ];
            }
            return ov;
        }
        function canEditOferta(){
            return ['admin','gm','desarrollador','editor'].includes(currentUser?.role);
        }
        let ov_idx = 0;
        function ovRender(){
            const ov = getOfertaValor();
            const slides = ov.slides || [];
            if(slides.length === 0) return;
            if(ov_idx >= slides.length) ov_idx = 0;
            const s = slides[ov_idx];
            const el = document.getElementById('ov_slide_content');
            if(el) el.innerHTML = `<div class="font-bold text-lg">${escapeHTML(s.t)}</div><div class="text-sm text-slate-600 mt-2">${escapeHTML(s.d)}</div>`;
            const dots = document.getElementById('ov_dots');
            if(dots) dots.textContent = slides.map((_,i)=> i===ov_idx?'●':'○').join(' ');
        }
        function ovNext(){ const ov = getOfertaValor(); ov_idx = (ov_idx+1) % ov.slides.length; ovRender(); }
        function ovPrev(){ const ov = getOfertaValor(); ov_idx = (ov_idx-1+ov.slides.length) % ov.slides.length; ovRender(); }

        function renderOfertaValor(){
            const ov = getOfertaValor();
            const canEdit = canEditOferta();
            const videoUrl = ov.video_url || '';
            let embed = '';
            if(videoUrl){
                if(videoUrl.includes('drive.google.com')){
                    const m = videoUrl.match(/\/d\/([^\/]+)/);
                    if(m) embed = `https://drive.google.com/file/d/${m[1]}/preview`;
                } else if(videoUrl.includes('youtu.be/')){
                    const v = videoUrl.split('youtu.be/')[1].split('?')[0];
                    embed = `https://www.youtube.com/embed/${v}`;
                } else if(videoUrl.includes('youtube.com')){
                    const vm = videoUrl.match(/[?&]v=([^&]+)/);
                    const v = vm ? vm[1] : videoUrl.split('/').pop();
                    embed = `https://www.youtube.com/embed/${v}`;
                } else {
                    embed = videoUrl;
                }
            }
            const slides = ov.slides || [];
            return `<div class="max-w-4xl mx-auto space-y-6 p-6">
                <h2 class="text-2xl font-bold">Oferta de valor</h2>
                <div class="bg-white rounded-2xl p-6 border border-slate-200">
                    <h3 class="font-semibold mb-3">Video propuesta</h3>
                    ${embed ? `<div class="aspect-video bg-slate-900 rounded-xl overflow-hidden"><iframe src="${embed}" class="w-full h-full" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe></div>` : `<div class="aspect-video bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 text-sm">Video no configurado</div>`}
                    ${canEdit ? `<div class="flex gap-2 mt-3">
                        <input id="ov_video" type="url" placeholder="https://drive.google.com/... / https://youtube.com/..." value="${escapeHTML(videoUrl)}" class="flex-1 border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300">
                        <button data-bx-click="a424" class="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm">Guardar link</button>
                    </div><p class="text-xs text-slate-500 mt-2">Drive: compartir como "Cualquiera con el enlace". YouTube: link público / no listado.</p>`:''}
                </div>
                <div class="bg-white rounded-2xl p-6 border border-slate-200">
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="font-semibold">Presentación</h3>
                        <span class="text-xs text-slate-500">Solo lectura</span>
                    </div>
                    <div id="ov_slides" class="relative bg-slate-50 rounded-xl p-8 text-center min-h-[200px] flex items-center justify-center">
                        <div id="ov_slide_content"></div>
                        <button data-bx-click="a425" class="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border rounded-full shadow-sm hover:bg-slate-50">‹</button>
                        <button data-bx-click="a426" class="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 bg-white border rounded-full shadow-sm hover:bg-slate-50">›</button>
                    </div>
                    <div id="ov_dots" class="text-center mt-3 text-slate-400 text-sm"></div>
                </div>
                ${canEdit ? `<div class="bg-white rounded-2xl p-6 border border-slate-200">
                    <h3 class="font-semibold mb-3">Editor – Presentación (Admin / GM / Desarrollador)</h3>
                    <div id="ov_editor_list" class="space-y-2 mb-4">
                        ${slides.map((s,i)=>`<div class="flex items-start gap-3 p-3 border rounded-lg bg-slate-50">
                            <div class="flex-1 text-sm"><b>${escapeHTML(s.t)}</b><br><span class="text-slate-600">${escapeHTML(s.d)}</span></div>
                            <button data-bx-click="a427" data-p0="${bxE(function(){return i})}" class="text-xs px-2 py-1 border rounded hover:bg-white">Editar</button>
                            <button data-bx-click="a428" data-p0="${bxE(function(){return i})}" class="text-xs px-2 py-1 border rounded text-red-600 hover:bg-white">Eliminar</button>
                        </div>`).join('')}
                    </div>
                    <div class="border-t pt-4 grid md:grid-cols-2 gap-3">
                        <input id="ov_new_t" type="text" placeholder="Título slide" class="border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300">
                        <input id="ov_new_d" type="text" placeholder="Descripción" class="border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300">
                    </div>
                    <button data-bx-click="a429" class="mt-3 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Agregar slide</button>
                    <span id="ov_editor_status" class="text-xs text-emerald-600 ml-3"></span>
                </div>`:''}
            </div>`;
        }
        function guardarOfertaVideo(){
            if(!canEditOferta()) return;
            const ov = getOfertaValor();
            const inp = document.getElementById('ov_video');
            if(inp) ov.video_url = inp.value.trim();
            saveDB();
            navigateTo('oferta-valor');
        }
        function addOfertaSlide(){
            if(!canEditOferta()) return;
            const t = document.getElementById('ov_new_t').value.trim();
            const d = document.getElementById('ov_new_d').value.trim();
            if(!t) return;
            const ov = getOfertaValor();
            ov.slides.push({t, d});
            saveDB();
            document.getElementById('ov_new_t').value = '';
            document.getElementById('ov_new_d').value = '';
            const st = document.getElementById('ov_editor_status');
            if(st){ st.textContent = 'Slide agregado ✓'; setTimeout(()=>st.textContent='',1500); }
            navigateTo('oferta-valor');
        }
        function editOfertaSlide(i){
            if(!canEditOferta()) return;
            const ov = getOfertaValor();
            const s = ov.slides[i];
            if(!s) return;
            const nt = prompt('Título:', s.t);
            if(nt === null) return;
            const nd = prompt('Descripción:', s.d);
            if(nd === null) return;
            s.t = nt.trim() || s.t;
            s.d = nd.trim() || s.d;
            saveDB();
            navigateTo('oferta-valor');
        }
        function deleteOfertaSlide(i){
            if(!canEditOferta()) return;
            if(!confirm('¿Eliminar slide?')) return;
            const ov = getOfertaValor();
            ov.slides.splice(i,1);
            if(ov_idx >= ov.slides.length) ov_idx = 0;
            saveDB();
            navigateTo('oferta-valor');
        }

                // 3. Simulador de ingresos (editable solo por GM; persiste en db.settings.simuladorConfig)
        const SIM_RAMOS_INFO = {
            vida:{nombre:'VIDA', desc:'Protección patrimonial para la familia del cliente: si falta el proveedor, el seguro responde. Prima baja, alta comisión inicial y es la puerta de entrada a la venta cruzada.'},
            gmm:{nombre:'GMM', desc:'Gastos Médicos Mayores: cuida la salud sin arruinar el bolsillo. Renovable año tras año: comisión que se repite y cliente que se visita cada año.'},
            danos:{nombre:'DAÑOS', desc:'Hogar, negocio y responsabilidad civil. Cartera estable, poca competencia de asesores y renovaciones constantes.'},
            autos:{nombre:'AUTOS', desc:'El más fácil de vender: todo mundo tiene auto. Volumen rápido, ticket bajo, ideal para abrir la relación y después ofrecer vida e inversión.'},
            inversion:{nombre:'INVERSIÓN', desc:'Ahorro para el retiro con aportación mensual. Es el ramo que paga comisión año tras año mientras el cliente aporta: tu ingreso recurrente de largo plazo.'},
            inversion_elite:{nombre:'INVERSIÓN ELITE', desc:'Segmento premium de inversión. Ticket alto y pocos asesores lo trabajan: comisiones grandes con pocas pólizas.'}
        };
        function simConfig(){
            if(!db.settings) db.settings={};
            if(!db.settings.simuladorConfig){
                db.settings.simuladorConfig = {
                    vida:{prima:8500, com:25, bonoMensual:7000, bonoTrimestral:4000, trail:0, plazo:10},
                    gmm:{prima:12000, com:15, bonoMensual:7000, bonoTrimestral:4000, trail:0, plazo:10},
                    danos:{prima:6000, com:20, bonoMensual:7000, bonoTrimestral:4000, trail:0, plazo:10},
                    autos:{prima:4500, com:10, bonoMensual:7000, bonoTrimestral:4000, trail:0, plazo:10},
                    inversion:{prima:2000, com:2.7, bonoMensual:7000, bonoTrimestral:4000, trail:1, plazo:17},
                    inversion_elite:{prima:35000, com:22, bonoMensual:7000, bonoTrimestral:4000, trail:0, plazo:10}
                };
            }
            ['vida','gmm','danos','autos','inversion','inversion_elite'].forEach(k=>{
                const c=db.settings.simuladorConfig[k];
                if(c){ if(c.bonoMensual===undefined) c.bonoMensual=7000; if(c.bonoTrimestral===undefined) c.bonoTrimestral=4000; if(c.trail===undefined) c.trail=0; if(c.plazo===undefined) c.plazo=10; }
            });
            return db.settings.simuladorConfig;
        }
        function esGMSim(){ return (currentUser.role||'').toLowerCase()==='gm'; }
        function simBono(v, prima){
            const s=String(v==null?'':v).trim();
            if(s.indexOf('%')>-1){ const p=parseFloat(s); return isNaN(p)?0:(Number(prima)||0)*p/100; }
            return parseFloat(s)||0;
        }

                function renderSimulador(){
            const cfg=simConfig();
            const esGM=esGMSim();
            const recomendacion='Vender de todos los ramos te hace un asesor completo: cada ramo abre una puerta distinta y cada cliente satisfecho te presenta a dos más. AUTOS y DAÑOS te dan volumen y flujo rápido; GMM y VIDA te dan renovaciones y confianza; INVERSIÓN e INVERSIÓN ELITE construyen tu ingreso recurrente de largo plazo. La venta cruzada multiplica tu cartera: el cliente de auto necesita vida, el de vida necesita ahorro para el retiro, y el de inversión te presenta a su socio. Un ramo solo te limita; la mezcla te hace indispensable para tu cliente y estable en tu ingreso.';
            const ro=esGM?'':'disabled';
            const filas = ['vida','gmm','danos','autos','inversion','inversion_elite'].map(k=>{
                const c=cfg[k]; const info=SIM_RAMOS_INFO[k];
                return `<tr class="border-b border-slate-100" data-simkey="${k}">
                    <td class="py-3 pr-3"><b>${info.nombre}</b><div class="text-xs text-slate-500">${info.desc}</div></td>
                    <td><input type="number" value="${c.prima}" ${ro} class="sim-prima w-24 border rounded px-2 py-1 text-sm bg-white text-slate-900 border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"></td>
                    <td><input type="number" value="${c.com}" step="0.01" ${ro} class="sim-com w-16 border rounded px-2 py-1 text-sm bg-white text-slate-900 border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"></td>
                    ${(k==='inversion')?`<td><input type="number" value="${c.plazo}" min="10" max="17" ${ro} class="sim-plazo w-16 border rounded px-2 py-1 text-sm bg-white text-slate-900 border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"></td><td><input type="number" value="${c.trail}" step="0.1" ${ro} class="sim-trail w-16 border rounded px-2 py-1 text-sm bg-white text-slate-900 border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"></td>`:'<td class="text-center text-slate-300">—</td><td class="text-center text-slate-300">—</td>'}
                    <td><input type="text" value="${psEscape(String(c.bonoMensual==null?'':c.bonoMensual))}" placeholder="7000 o 5%" ${ro} class="sim-bonomes w-24 border rounded px-2 py-1 text-sm bg-white text-slate-900 border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"></td>
                    <td><input type="text" value="${psEscape(String(c.bonoTrimestral==null?'':c.bonoTrimestral))}" placeholder="4000 o 3%" ${ro} class="sim-bonotrim w-24 border rounded px-2 py-1 text-sm bg-white text-slate-900 border-slate-300 disabled:bg-slate-50 disabled:text-slate-500"></td>
                    <td class="sim-comtotal font-medium">-</td>
                    <td class="sim-polizas font-bold text-indigo-600">-</td>
                    <td class="sim-ingreso text-slate-600">-</td>
                </tr>`;
            }).join('');
            return `<div class="max-w-6xl mx-auto">
                <div class="flex items-start justify-between flex-wrap gap-2 mb-1">
                    <h2 class="text-2xl font-bold">Simulador de ingresos</h2>
                    ${esGM?`<button data-bx-click="a430" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"><i class="fas fa-floppy-disk mr-1"></i> Guardar configuración</button>`:`<span class="text-[11px] text-slate-400 max-w-[280px] text-right">Parámetros definidos por la dirección (GM). Usa las cifras para planear cuánto vender.</span>`}
                </div>
                <p class="text-slate-500 mb-5">Cálculo real por ramo: comisión, trail fee, bonos y plazos reales. Para GM: editable y guardado para toda la promotoría.</p>
                <div class="bg-white rounded-2xl p-5 border border-slate-200 mb-4 grid md:grid-cols-3 gap-4">
                    <div><label class="text-sm font-medium">¿Cuánto necesitas ganar al mes? $</label>
                    <input id="sim-meta" type="number" value="35000" class="w-full mt-1 border rounded-lg px-3 py-2 bg-white text-slate-900 border-slate-300"></div>
                    <div><label class="text-sm font-medium">Modalidad</label>
                    <select id="sim-modalidad" class="w-full mt-1 border rounded-lg px-3 py-2 bg-white text-slate-900 border-slate-300">
                        <option value="solo">Trabajaré solo</option>
                        <option value="equipo">Formaré equipo</option>
                    </select></div>
                    <div id="sim-override-wrap" class="hidden"><label class="text-sm font-medium">Override equipo %</label>
                    <input id="sim-override" type="number" value="3" step="0.5" class="w-full mt-1 border rounded-lg px-3 py-2 bg-white text-slate-900 border-slate-300"></div>
                </div>
                <div class="bg-white rounded-2xl p-5 border border-slate-200 overflow-x-auto">
                    <table class="w-full text-sm" id="sim-table">
                        <thead><tr class="text-left text-slate-500 border-b">
                            <th class="py-2">Ramo</th><th>Prima prom. $</th><th>Comisión %</th><th>Plazo (años)</th><th>Trail fee %</th><th>Bono mensual (monto o %)</th><th>Bono trimestral (monto o %)</th><th>Comisión por póliza $</th><th>Pólizas/mes</th><th>Ingreso estimado</th>
                        </tr></thead>
                        <tbody id="sim-tbody">${filas}</tbody>
                    </table>
                    <p class="text-xs text-slate-500 mt-3">Comisión por póliza: <strong>INVERSIÓN</strong> = prima prom. × 12 × plazo (años) × comisión % · los demás ramos = prima prom. × comisión %. Trail fee aplica solo a INVERSIÓN (anual sobre la aportación). Bonos: monto fijo $ o % de la prima (ej. 7000 o 5%); el trimestral se divide entre 3 para el promedio mensual. El cálculo se actualiza en vivo.</p>
                </div>
                <div id="sim-resumen" class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm"></div>
                <div class="mt-5 bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
                    <h3 class="font-bold text-emerald-900 mb-2"><i class="fas fa-layer-group mr-2"></i>¿Por qué vender de todos los ramos?</h3>
                    <div class="grid md:grid-cols-3 gap-3 mb-3">
                        ${['vida','gmm','danos','autos','inversion','inversion_elite'].map(k=>`<div class="bg-white border border-emerald-100 rounded-xl p-3"><p class="font-semibold text-sm">${SIM_RAMOS_INFO[k].nombre}</p><p class="text-xs text-slate-600 mt-1">${SIM_RAMOS_INFO[k].desc}</p></div>`).join('')}
                    </div>
                    <p class="text-sm text-emerald-900"><strong>Recomendación:</strong> ${recomendacion}</p>
                </div>
            </div>`;
        }
        function initSimulador(){
            const tbody = document.getElementById('sim-tbody');
            if(!tbody) return;
            const recalc = () => {
                const cfg=simConfig();
                const meta = parseInt(document.getElementById('sim-meta')?.value) || 35000;
                const modalidad = document.getElementById('sim-modalidad')?.value || 'solo';
                document.getElementById('sim-override-wrap')?.classList.toggle('hidden', modalidad !== 'equipo');
                const rows = tbody.querySelectorAll('tr');
                let resumen = [];
                rows.forEach(row => {
                    const key = row.getAttribute('data-simkey');
                    const c = cfg[key]; if(!c) return;
                    if(esGMSim()){
                        c.prima = parseFloat(row.querySelector('.sim-prima').value) || 0;
                        c.com = parseFloat(row.querySelector('.sim-com').value) || 0;
                        const ip=row.querySelector('.sim-plazo'); if(ip) c.plazo = Math.min(17, Math.max(10, parseInt(ip.value) || 10));
                        const it=row.querySelector('.sim-trail'); if(it) c.trail = parseFloat(it.value) || 0;
                        const bm=row.querySelector('.sim-bonomes'); if(bm) c.bonoMensual = bm.value.trim();
                        const bt=row.querySelector('.sim-bonotrim'); if(bt) c.bonoTrimestral = bt.value.trim();
                    }
                    const esInv = (key==='inversion');
                    const comPorPoliza = esInv ? ((c.prima||0) * 12 * (c.plazo||10)) * ((c.com||0)/100) : (c.prima||0) * ((c.com||0)/100);
                    const trailAnual = (esInv && parseFloat(c.trail)>0) ? ((c.prima||0)*12) * (parseFloat(c.trail)/100) : 0;
                    const bonoMes = simBono(c.bonoMensual, c.prima) + simBono(c.bonoTrimestral, c.prima)/3;
                    const ingresoPorPoliza = comPorPoliza + trailAnual;
                    const polizas = ingresoPorPoliza > 0 ? Math.ceil(Math.max(0, meta - bonoMes) / ingresoPorPoliza) : 0;
                    const ingresoEst = polizas * ingresoPorPoliza + bonoMes;
                    row.querySelector('.sim-comtotal').textContent = '$' + Math.round(comPorPoliza).toLocaleString('es-MX');
                    row.querySelector('.sim-polizas').textContent = polizas || '-';
                    row.querySelector('.sim-ingreso').textContent = '$' + Math.round(ingresoEst).toLocaleString('es-MX');
                    resumen.push({nombre:SIM_RAMOS_INFO[key].nombre, polizas, ingresoPorPoliza, bonoMes});
                });
                const resHTML = resumen.map(r=>`${r.polizas} póliza${r.polizas===1?'':'s'} de ${r.nombre}`).join(' · ');
                document.getElementById('sim-resumen').innerHTML = `<b>Para ganar $${meta.toLocaleString('es-MX')} al mes necesitas aprox:</b><br>${resHTML}<br><span class="text-xs text-slate-500">Pólizas = (meta − bonos del mes) ÷ (comisión por póliza + trail, solo INVERSIÓN). Los bonos (mensual + trimestral ÷ 3) se suman una vez al mes, no por póliza.</span>`;
            };
            tbody.addEventListener('input', recalc);
            document.getElementById('sim-meta')?.addEventListener('input', recalc);
            document.getElementById('sim-modalidad')?.addEventListener('change', recalc);
            document.getElementById('sim-override')?.addEventListener('input', recalc);
            recalc();
        }
        function simGuardar(){
            try{
                if(!esGMSim()){ showToast('Solo el rol GM puede modificar el simulador','warning'); return; }
                const tbody = document.getElementById('sim-tbody');
                if(tbody){
                    const evt=new Event('input',{bubbles:true});
                    tbody.dispatchEvent(evt);
                }
                cmLog('Simulador','Editó configuración', 'Primas/comisiones/bonos actualizados');
                saveDB(); showToast('Configuración guardada para toda la promotoría','success');
            }catch(e){ uiToast('Error: '+e.message); }
        }

        
        /* === END PROSPECTO === */



// === FUNCIONES AGENCIAS V17 ===
function renderMisMetas(){
    try{
        db.ventas=db.ventas||[]; db.metas=db.metas||[];
        const tab = localStorage.getItem('metaTab') || 'mensual';
        const ramoFilter = localStorage.getItem('metaRamo') || 'Todos';
        const now = new Date(); const anio = now.getFullYear(); const mes = now.getMonth()+1; const trim = Math.ceil(mes/3);
        const isAgencia = ['agencia','maestro','gm','admin'].includes(currentUser.role);
        let agenteId = currentUser.id;
        let agenteSel = null;
        if(isAgencia){
            const equipo = db.users.filter(u=>u.agenciaId===currentUser.agenciaId && u.role==='agente');
            agenteId = localStorage.getItem('metaAgenteId') || (equipo[0]?.id || currentUser.id);
            agenteSel = equipo.find(e=>String(e.id)===String(agenteId)) || null;
        }
        const ventasBase = db.ventas.filter(v=>String(v.agenteId)===String(agenteId));
        const metas = db.metas.filter(m=>String(m.agenteId)===String(agenteId) && m.periodo===tab);

        function inPeriodo(v){
            const d = new Date(v.fecha); if(isNaN(d)) return false;
            if(tab==='mensual') return d.getFullYear()===anio && d.getMonth()+1===mes;
            if(tab==='trimestral') return d.getFullYear()===anio && Math.ceil((d.getMonth()+1)/3)===trim;
            return d.getFullYear()===anio;
        }
        function real(ramo){
            return ventasBase.filter(v=>v.ramo===ramo && inPeriodo(v)).reduce((s,v)=>s+Number(v.prima||0),0);
        }
        function meta(ramo){
            const m = metas.find(x=>x.ramo===ramo && x.anio===anio && (tab!=='mensual'||x.mes===mes) && (tab!=='trimestral'||x.trimestre===trim));
            return m?Number(m.objetivo)||0:0;
        }
        const ramos=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
        const cards = ramos.map(r=>{
            const re=real(r); const me=meta(r); const pct=me>0?Math.min(100,Math.round(re/me*100)):0;
            const color=pct>=100?'bg-emerald-500':pct>=70?'bg-amber-500':'bg-slate-400';
            return `<div class="bg-white border rounded-2xl p-5"><div class="flex justify-between"><span class="font-semibold">${r}</span><span class="text-xs">${pct}%</span></div><div class="text-2xl font-bold mt-1">$${re.toLocaleString('es-MX')}</div><div class="text-xs text-slate-500">Meta: $${me.toLocaleString('es-MX')}</div><div class="w-full bg-slate-200 h-2 rounded mt-2"><div class="${color} h-2 rounded" style="width:${pct}%"></div></div></div>`;
        }).join('');

        const ventasPeriodo = ventasBase.filter(inPeriodo);
        const ventasFiltradas = ramoFilter==='Todos' ? ventasPeriodo : ventasPeriodo.filter(v=>v.ramo===ramoFilter);
        const totalPrima = ventasFiltradas.reduce((s,v)=>s+Number(v.prima||0),0);

        const equipo = isAgencia ? db.users.filter(u=>u.agenciaId===currentUser.agenciaId && u.role==='agente') : [];
        const selectorAgencia = isAgencia ? `<div class="flex gap-2 items-center">
            <select data-bx-change="a431" class="border rounded-lg px-3 py-1.5 text-sm bg-white text-slate-900 border-slate-300">
                ${equipo.map(e=>`<option value="${e.id}" ${String(e.id)===String(agenteId)?'selected':''}>${e.nombre}</option>`).join('')}
            </select>
            <button data-bx-click="a432" class="px-3 py-1.5 text-sm rounded-lg bg-slate-900 text-white hover:bg-black">Asignar meta</button>
        </div>` : '';

        const filtroRamos = ['Todos',...ramos].map(r=>`<button data-bx-click="a433" data-p0="${bxE(function(){return r})}" class="px-2.5 py-1 text-xs rounded-lg border ${ramoFilter===r?'bg-slate-900 text-white border-slate-900':'bg-white hover:bg-slate-50'}">${r}</button>`).join('');

        const filas = ventasFiltradas.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(v=>{
            const fecha = new Date(v.fecha); const f = isNaN(fecha)? v.fecha : fecha.toLocaleDateString('es-MX');
            return `<tr class="border-b last:border-0 hover:bg-slate-50">
                <td class="px-3 py-2">${v.contratante||'-'}</td>
                <td class="px-3 py-2 whitespace-nowrap">${f}</td>
                <td class="px-3 py-2">${v.ramo||'-'}</td>
                <td class="px-3 py-2">${v.producto||'-'}</td>
                <td class="px-3 py-2 text-right font-medium">$${Number(v.prima||0).toLocaleString('es-MX')}</td>
            </tr>`;
        }).join('');

        return `<div class="p-6 max-w-6xl mx-auto">
            <div class="flex flex-wrap gap-3 justify-between items-center mb-4">
                <h2 class="text-2xl font-bold">Mis Metas ${isAgencia && agenteSel ? `<span class="text-slate-500 text-lg font-normal">· ${agenteSel.nombre}</span>`:''}</h2>
                <div class="flex gap-2 items-center">
                    ${selectorAgencia}
                    <div class="flex gap-1 bg-white border rounded-lg p-1">
                        ${['mensual','trimestral','anual'].map(t=>`<button data-bx-click="a434" data-p0="${bxE(function(){return t})}" class="px-3 py-1 text-sm rounded ${tab===t?'bg-slate-900 text-white':'hover:bg-slate-100'}">${t}</button>`).join('')}
                    </div>
                </div>
            </div>
            <div class="grid md:grid-cols-4 gap-4">${cards}</div>
            
            <div class="mt-8 bg-white border rounded-2xl">
                <div class="p-4 border-b flex flex-wrap gap-2 justify-between items-center">
                    <div>
                        <h3 class="font-semibold">Desglose de ventas</h3>
                        <p class="text-xs text-slate-500">Periodo: ${tab==='mensual'?mes+'/'+anio:tab==='trimestral'?'Q'+trim+' '+anio:anio} · Total: $${totalPrima.toLocaleString('es-MX')}</p>
                    </div>
                    <div class="flex gap-1.5 flex-wrap">${filtroRamos}</div>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-slate-600">
                            <tr>
                                <th class="text-left px-3 py-2 font-medium">Contratante</th>
                                <th class="text-left px-3 py-2 font-medium">Fecha</th>
                                <th class="text-left px-3 py-2 font-medium">Ramo</th>
                                <th class="text-left px-3 py-2 font-medium">Producto</th>
                                <th class="text-right px-3 py-2 font-medium">Prima neta</th>
                            </tr>
                        </thead>
                        <tbody>${filas || `<tr><td colspan="5" class="px-3 py-8 text-center text-slate-500">Sin ventas en este periodo</td></tr>`}</tbody>
                    </table>
                </div>
            </div>
            <div class="grid md:grid-cols-2 gap-4 mt-8">
                <div class="bg-white border rounded-2xl p-5">
                    <h3 class="font-semibold mb-3">Producción por compañía <span class="text-xs font-normal text-slate-400">(periodo: ${tab})</span></h3>
                    <div class="h-[260px]"><canvas id="mm-chart-comp"></canvas></div>
                </div>
                <div class="bg-white border rounded-2xl p-5">
                    <h3 class="font-semibold mb-3">Producción por ramo <span class="text-xs font-normal text-slate-400">(periodo: ${tab})</span></h3>
                    <div class="h-[260px]"><canvas id="mm-chart-ramo"></canvas></div>
                </div>
            </div>
        </div>`;
    }catch(e){ return `<div class="p-8 text-red-600">Error Mis Metas: ${e.message}</div>`; }
}
window.mmRenderCharts=function(reintento){
    try{
        const cEl=document.getElementById('mm-chart-comp');
        const rEl=document.getElementById('mm-chart-ramo');
        if(!cEl && !rEl) return;
        if(!window.Chart){ if(!reintento){ setTimeout(function(){ try{ window.mmRenderCharts(true); }catch(e){} }, 700); } return; }
        const tabMM = localStorage.getItem('metaTab') || 'mensual';
        const anioMM = new Date().getFullYear();
        const mesMM = new Date().getMonth()+1;
        const trimMM = Math.ceil(mesMM/3);
        const agenteIdMM = (function(){ try{ const isAgM=['agencia','maestro','gm','admin'].includes(currentUser.role); if(isAgM && localStorage.getItem('metaAgenteId')) return localStorage.getItem('metaAgenteId'); }catch(e){} return currentUser.id; })();
        const vsMM=(db.ventas||[]).filter(v=>String(v.agenteId)===String(agenteIdMM)).filter(v=>{ const d=new Date(v.fecha); if(isNaN(d)) return false; if(d.getFullYear()!==anioMM) return false; if(tabMM==='mensual') return (d.getMonth()+1)===mesMM; if(tabMM==='trimestral') return Math.ceil((d.getMonth()+1)/3)===trimMM; return true; });
        const porRamoMM={}, porCompMM={};
        vsMM.forEach(v=>{ const r=String(v.ramo||'OTROS'); const c=String(v.compania||'OTROS').toUpperCase(); porRamoMM[r]=(porRamoMM[r]||0)+Number(v.prima||0); porCompMM[c]=(porCompMM[c]||0)+Number(v.prima||0); });
        const ramosMM=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'].filter(r=>porRamoMM[r]>0);
        const compsMM=companiasGraficas(vsMM).filter(c=>porCompMM[c]>0).sort((a,b)=>porCompMM[b]-porCompMM[a]);
        if(window.Chart){
            if(window._mmChart1){ try{window._mmChart1.destroy();}catch(e){} }
            if(window._mmChart2){ try{window._mmChart2.destroy();}catch(e){} }
            if(cEl && window.Chart && compsMM.length){
                const mmD1={type:'doughnut',data:{labels:compsMM,datasets:[{data:compsMM.map(c=>porCompMM[c]),backgroundColor:compsMM.map((c,i)=>gfColorPara('compania',c,i)),borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c2=>c2.label+': $'+Number(c2.raw).toLocaleString('es-MX')}}}}};
                window._mmChart1=new Chart(cEl,mmD1);
            }
            if(rEl && window.Chart && ramosMM.length){
                const mmD2={type:'bar',data:{labels:ramosMM,datasets:[{data:ramosMM.map(r=>porRamoMM[r]),backgroundColor:ramosMM.map((r,i)=>gfColorPara('ramo',r,i)),borderRadius:6}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c2=>'$'+Number(c2.raw).toLocaleString('es-MX')}}},scales:{y:{ticks:{callback:v=>'$'+Number(v).toLocaleString('es-MX')},beginAtZero:true}}}};
                window._mmChart2=new Chart(rEl,mmD2);
            }
        }
    }catch(e){ console.warn('Mis Metas charts:',e); }
};
setTimeout(()=>{ try{ window.mmRenderCharts(); }catch(e){} }, 300);
function renderMisLogros(){
    try{
        db.ventas=db.ventas||[]; db.metas=db.metas||[]; db.convenciones=db.convenciones||[];
        const tab = localStorage.getItem('logroTab') || 'mensual';
        const now = new Date(); const anio = now.getFullYear(); const mes = now.getMonth()+1; const trim = Math.ceil(mes/3);
        const ventas = db.ventas.filter(v=>v.agenteId===currentUser.id);
        
        function real(ramo){
            return ventas.filter(v=>{
                const d=new Date(v.fecha); if(isNaN(d)||v.ramo!==ramo) return false;
                if(tab==='mensual') return d.getFullYear()===anio && d.getMonth()+1===mes;
                if(tab==='trimestral') return d.getFullYear()===anio && Math.ceil((d.getMonth()+1)/3)===trim;
                return d.getFullYear()===anio;
            }).reduce((s,v)=>s+Number(v.prima||0),0);
        }
        function meta(ramo){
            const m = db.metas.find(x=>x.agenteId===currentUser.id && x.periodo===tab && x.ramo===ramo && x.anio===anio && (tab!=='mensual'||x.mes===mes) && (tab!=='trimestral'||x.trimestre===trim));
            return m?Number(m.objetivo)||0:0;
        }
        const ramos=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
        const logros = ramos.map(r=>{ const re=real(r); const me=meta(r); return {ramo:r, re, me, ok: me>0 && re>=me}; }).filter(l=>l.ok);
        
        const convs = db.convenciones.filter(c=>!c.agenciaId || String(c.agenciaId)===String(currentUser.agenciaId)).map(c=>{
            const ok = ramos.every(r=>{ const req = (c.metas||{})[r]||0; return req===0 || real(r)>=req; });
            return {...c, ok};
        });
        
        return `<div class="p-6 max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold">Mis Logros</h2>
                <div class="flex gap-1 bg-white border rounded-lg p-1">
                    ${['mensual','trimestral','anual'].map(t=>`<button data-bx-click="a435" data-p0="${bxE(function(){return t})}" class="px-3 py-1 text-sm rounded ${tab===t?'bg-slate-900 text-white':'hover:bg-slate-100'}">${t}</button>`).join('')}
                </div>
            </div>
            <div class="grid md:grid-cols-2 gap-4 mb-6">
                ${logros.length?logros.map(l=>`<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3"><i class="fa-solid fa-medal text-emerald-600 text-2xl"></i><div><div class="font-semibold">${l.ramo} Completado</div><div class="text-xs text-slate-600">$${l.re.toLocaleString('es-MX')} / $${l.me.toLocaleString('es-MX')}</div></div></div>`).join(''):`<div class="col-span-2 bg-white border rounded-xl p-8 text-center text-slate-500">Aún no hay metas alcanzadas en este periodo</div>`}
            </div>
            <h3 class="font-semibold mb-2">Convenciones</h3>
            <div class="grid md:grid-cols-3 gap-4">
                ${convs.map(c=>`<div class="bg-white border rounded-xl overflow-hidden ${c.ok?'ring-2 ring-emerald-500':''}"><img loading="lazy" decoding="async" src="${c.imagen||'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800'}" class="w-full h-48 object-cover"><div class="p-3"><div class="font-semibold flex justify-between">${c.nombre} ${c.ok?'<span class="text-emerald-600 text-xs">✓</span>':''}</div><div class="text-xs text-slate-500">${c.destino||''}</div></div></div>`).join('')}
            </div>
        </div>`;
    }catch(e){ return `<div class="p-8 text-red-600">Error: ${e.message}</div>`; }
}
function renderMiEquipo(){
    try{
        const isAdminGM = isAdmin(currentUser)||isGM(currentUser);
        const isAg = isAdminGM || ['maestro','agencia'].includes((currentUser.role||'').toLowerCase());
        const myId = String(currentUser.id);
        const agentes = db.users.filter(u=>{
            const isAgent = (u.role==='agente' || u.role==='agente_agencia' || u.role==='agente_desarrollo');
            if(!isAgent) return false;
            // Solo agentes CON agencia asignada desde "Usuarios" aparecen aquí
            if(String(u.agenciaId||'')==='' && String(u.parentId||'')==='') return false;
            if(isAdminGM) return true;
            return String(u.agenciaId)===myId || String(u.parentId)===myId;
        });
        const ventas = db.ventas||[];
        const metas = db.metas||[];
        const ramos=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
        
        const prodTotal = agentes.reduce((s,a)=> s + ventas.filter(v=>String(v.agenteId)===String(a.id)).reduce((t,v)=>t+Number(v.prima||0),0),0);
        const metaTotal = agentes.reduce((s,a)=> s + metas.filter(m=>String(m.agenteId)===String(a.id) && m.periodo==='mensual').reduce((t,m)=>t+Number(m.objetivo||0),0),0);
        const cumplimiento = metaTotal>0 ? Math.round(prodTotal/metaTotal*100) : 0;
        
        const porRamo = ramos.map(r=>{
            const total = ventas.filter(v=> agentes.some(a=>String(a.id)===String(v.agenteId)) && v.ramo===r).reduce((s,v)=>s+Number(v.prima||0),0);
            return {ramo:r,total};
        });
        const maxRamo = Math.max(1, ...porRamo.map(p=>p.total));
        
        const detalleId = localStorage.getItem('detalleAgenteId');
        const agenteDetalle = detalleId ? agentes.find(a=>String(a.id)===String(detalleId)) : null;
        const ventasDetalle = agenteDetalle ? ventas.filter(v=>String(v.agenteId)===String(agenteDetalle.id)).sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)) : [];
        
        const lista = agentes.map(a=>{
            const v = ventas.filter(x=>String(x.agenteId)===String(a.id));
            const total = v.reduce((s,x)=>s+Number(x.prima||0),0);
            return `<tr class="border-t hover:bg-slate-50">
                <td class="p-2 font-medium">${a.nombre||a.name||'-'}</td>
                <td class="p-2 text-xs text-slate-500">${a.email||''}</td>
                <td class="text-right pr-2 font-semibold">$${total.toLocaleString('es-MX')}</td>
                <td class="text-center whitespace-nowrap">
                    <button data-bx-click="a436" data-p0="${bxE(function(){return a.id})}" class="text-slate-700 text-xs mr-2 hover:underline">Detalle</button>
                    <button data-bx-click="a437" data-p0="${bxE(function(){return a.id})}" class="text-indigo-600 text-xs mr-2">Meta</button>
                    <button data-bx-click="a438" data-p0="${bxE(function(){return a.id})}" class="text-emerald-600 text-xs mr-2">Venta</button>
                    <button data-bx-click="a439" data-p0="${bxE(function(){return a.id})}" class="text-red-500 text-xs">Quitar</button>
                </td>
            </tr>`;
        }).join('');
        
        const detalleHTML = agenteDetalle ? `<div class="mt-6 bg-white border rounded-2xl">
            <div class="p-4 border-b flex justify-between items-center">
                <div>
                    <h3 class="font-semibold">Detalle de ${agenteDetalle.nombre||agenteDetalle.name}</h3>
                    <p class="text-xs text-slate-500">${ventasDetalle.length} ventas · Total $${ventasDetalle.reduce((s,v)=>s+Number(v.prima||0),0).toLocaleString('es-MX')}</p>
                </div>
                <button data-bx-click="a440" class="text-sm px-3 py-1 border rounded-lg hover:bg-slate-50">Cerrar</button>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50"><tr>
                        <th class="text-left px-3 py-2">Contratante</th>
                        <th class="text-left px-3 py-2">Fecha</th>
                        <th class="text-left px-3 py-2">Ramo</th>
                        <th class="text-left px-3 py-2">Compañia</th>
                        <th class="text-left px-3 py-2">Producto</th>
                        <th class="text-right px-3 py-2">Prima</th>
                        <th class="text-right px-3 py-2">Acciones</th>
                    </tr></thead>
                    <tbody>${ventasDetalle.map(v=>{
                        const f = new Date(v.fecha); const fecha = isNaN(f)? v.fecha : f.toLocaleDateString('es-MX');
                        return `<tr class="border-b last:border-0"><td class="px-3 py-2">${v.contratante||'-'}</td><td class="px-3 py-2">${fecha}</td><td class="px-3 py-2">${v.ramo||'-'}</td><td class="px-3 py-2">${v.compania||'-'}</td><td class="px-3 py-2">${v.producto||'-'}</td><td class="px-3 py-2 text-right">$${Number(v.prima||0).toLocaleString('es-MX')}</td><td class="px-3 py-2 text-right">${isAg ? `<button data-bx-click="a441" data-p0="${bxE(function(){return v.id})}" class="text-indigo-600 text-xs mr-2 hover:underline" title="Editar"><i class="fas fa-edit"></i></button><button data-bx-click="a442" data-p0="${bxE(function(){return v.id})}" class="text-red-500 text-xs hover:underline" title="Borrar"><i class="fas fa-trash"></i></button>` : '<span class="text-xs text-slate-400">-</span>'}</td></tr>`;
                    }).join('') || `<tr><td colspan="7" class="p-6 text-center text-slate-500">Sin ventas</td></tr>`}</tbody>
                </table>
            </div>
        </div>` : '';
        
        return `<div class="p-6 max-w-6xl mx-auto">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-2xl font-bold">Mi Equipo</h2>
                <div class="flex gap-2">
                    <button data-bx-click="a443" class="bg-white border px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50">Exportar CSV</button>
                    <button data-bx-click="a444" class="bg-white border px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-file-pdf mr-1 text-red-600"></i>Exportar PDF</button>
                    ${isAg ? `<button data-bx-click="a445" class="bg-white border px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-history mr-1"></i>Auditoría</button>` : ''}
                    ${(currentUser.role||'').toLowerCase()==='gm' ? `<button data-bx-click="a446" class="bg-white border px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-palette mr-1 text-indigo-600"></i>Colores</button>` : ''}
                    ${isAdminGM ? `<button data-bx-click="a420" class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm"><i class="fas fa-users-gear mr-1"></i> Asignar agentes (Usuarios)</button>` : `<span class="text-[11px] text-slate-400 max-w-[240px] text-right">Los agentes se asignan desde la sección <strong>Usuarios</strong>; aquí solo aparece tu equipo asignado.</span>`}
                </div>
            </div>
            
            <div class="grid md:grid-cols-3 gap-4 mb-6">
                <div class="bg-white border rounded-2xl p-5"><div class="text-xs text-slate-500">Producción total</div><div class="text-2xl font-bold mt-1">$${prodTotal.toLocaleString('es-MX')}</div></div>
                <div class="bg-white border rounded-2xl p-5"><div class="text-xs text-slate-500">Agentes activos</div><div class="text-2xl font-bold mt-1">${agentes.length}</div></div>
                <div class="bg-white border rounded-2xl p-5"><div class="text-xs text-slate-500">Cumplimiento meta mensual</div><div class="text-2xl font-bold mt-1">${cumplimiento}%</div><div class="w-full bg-slate-200 h-1.5 rounded mt-2"><div class="h-1.5 rounded ${cumplimiento>=100?'bg-emerald-500':cumplimiento>=70?'bg-amber-500':'bg-slate-400'}" style="width:${Math.min(100,cumplimiento)}%"></div></div></div>
            </div>
            
            ${(() => {
                const rank = agentes.map(a=>{
                    const v = ventas.filter(x=>String(x.agenteId)===String(a.id));
                    return { id:a.id, name:a.nombre||a.name||'—', avatar:a.avatar, total:v.reduce((s,x)=>s+Number(x.prima||0),0), count:v.length };
                }).sort((x,y)=>y.total-x.total);
                const top3 = rank.slice(0,3);
                const top10 = rank.slice(0,10);
                const fila10 = (pos,r) => `<tr class="border-t hover:bg-slate-50 ${pos<=3?'bg-amber-50/40':''}">
                    <td class="p-2 text-center font-bold">${pos===1?'🥇':pos===2?'🥈':pos===3?'🥉':pos}</td>
                    <td class="p-2"><div class="flex items-center gap-2"><img loading="lazy" decoding="async" src="${r.avatar||('https://i.pravatar.cc/40?u='+r.id)}" class="w-7 h-7 rounded-full object-cover"><span class="font-medium">${r.name}</span></div></td>
                    <td class="text-center">${r.count}</td>
                    <td class="text-right pr-3 font-semibold">$${r.total.toLocaleString('es-MX')}</td></tr>`;
                return `<div class="bg-white border rounded-2xl p-5 mb-6">
                    <h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-medal text-amber-500"></i> Ranking del equipo <span class="text-xs font-normal text-slate-400">Oro · Plata · Bronce</span></h3>
                    ${top3.length ? `<div class="grid md:grid-cols-3 gap-4 mb-5">${top3.map((r,i)=>`
                        <div class="rounded-2xl border p-5 text-center ${i===0?'border-amber-300 bg-gradient-to-b from-amber-50 to-white':i===1?'border-slate-300 bg-gradient-to-b from-slate-50 to-white':'border-orange-200 bg-gradient-to-b from-orange-50 to-white'}">
                            <div class="text-4xl">${i===0?'🥇':i===1?'🥈':'🥉'}</div>
                            <img loading="lazy" decoding="async" src="${r.avatar||('https://i.pravatar.cc/40?u='+r.id)}" class="w-12 h-12 rounded-full object-cover mx-auto mt-2 border-2 ${i===0?'border-amber-400':i===1?'border-slate-400':'border-orange-400'}">
                            <p class="font-bold mt-2">${r.name}</p>
                            <p class="text-sm text-slate-500">${r.count} venta${r.count===1?'':'s'}</p>
                            <p class="text-lg font-bold ${r.total>0?'text-emerald-600':'text-slate-400'} mt-1">$${r.total.toLocaleString('es-MX')}</p>
                        </div>`).join('')}</div>` : '<p class="text-xs text-slate-400 text-center py-3">Aún no hay agentes con producción</p>'}
                    ${top10.length>3 ? `<div class="overflow-x-auto"><table class="w-full text-sm"><thead class="bg-slate-50 text-xs uppercase text-slate-500"><tr><th class="p-2 text-center w-12">#</th><th class="text-left p-2">Agente</th><th class="text-center p-2">Ventas</th><th class="text-right p-2 pr-3">Producción</th></tr></thead><tbody>${top10.slice(3).map((r,i)=>fila10(i+4,r)).join('')}</tbody></table></div>` : ''}
                </div>`;
            })()}
            
            <div class="grid md:grid-cols-2 gap-4 mb-6">
                <div class="bg-white border rounded-2xl p-5">
                    <h3 class="font-semibold mb-3">Producción por ramo</h3>
                    <div class="space-y-2">${porRamo.map((p,i)=>{
                        const pct = maxRamo>0 ? Math.round(p.total/maxRamo*100) : 0;
                        return `<div><div class="flex justify-between text-xs mb-1"><span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${gfColorPara('ramo',p.ramo,i)}"></span>${p.ramo}</span><span class="font-medium">$${p.total.toLocaleString('es-MX')}</span></div><div class="w-full bg-slate-100 h-2 rounded"><div class="h-2 rounded" style="width:${pct}%;background:${gfColorPara('ramo',p.ramo,i)}"></div></div></div>`;
                    }).join('')}</div>
                </div>
                <div class="bg-white border rounded-2xl p-5">
                    ${(()=>{
                        const ramosE=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
                        const porComp={};
                        ventas.filter(v=>agentes.some(a=>String(a.id)===String(v.agenteId))).forEach(v=>{ const c=String(v.compania||'OTROS').toUpperCase(); porComp[c]=(porComp[c]||0)+Number(v.prima||0); });
                        const comps=companiasGraficas(ventas.filter(v=>agentes.some(a=>String(a.id)===String(v.agenteId)))).filter(c=>porComp[c]>0).sort((a,b)=>(porComp[b]||0)-(porComp[a]||0));
                        const maxC=Math.max(1,...comps.map(c=>porComp[c]||0));
                        return `<h3 class="font-semibold mb-3">Producción por compañía</h3>
                        <div class="space-y-2">${comps.map((c,i)=>{
                            const pct=Math.round((porComp[c]||0)/maxC*100);
                            return `<div><div class="flex justify-between text-xs mb-1"><span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-sm" style="background:${gfColorPara('compania',c,i)}"></span>${c}</span><span class="font-medium">$${(porComp[c]||0).toLocaleString('es-MX')}</span></div><div class="w-full bg-slate-100 h-2 rounded"><div class="h-2 rounded" style="width:${pct}%;background:${gfColorPara('compania',c,i)}"></div></div></div>`;
                        }).join('') || '<p class="text-xs text-slate-400 py-3">Sin ventas registradas para el equipo todavía.</p>'}</div>`;
                    })()}
                </div>
            </div>
            
            <div class="bg-white border rounded-xl overflow-hidden">
                <!-- Vista de tarjetas móviles para Agentes del Equipo (< md) -->
                <div class="md:hidden divide-y divide-slate-100">
                    ${agentes.map(a=>{
                        const v = ventas.filter(x=>String(x.agenteId)===String(a.id));
                        const total = v.reduce((s,x)=>s+Number(x.prima||0),0);
                        return `<div class="p-3.5 space-y-2">
                            <div class="flex items-center justify-between gap-2">
                                <div class="min-w-0">
                                    <p class="font-bold text-slate-900 text-sm truncate">${escapeHTML(a.nombre||a.name||'-')}</p>
                                    <p class="text-xs text-slate-500 truncate">${escapeHTML(a.email||'')}</p>
                                </div>
                                <div class="text-right shrink-0">
                                    <p class="font-bold text-emerald-700 text-sm">$${total.toLocaleString('es-MX')}</p>
                                    <p class="text-[11px] text-slate-400">${v.length} venta${v.length===1?'':'s'}</p>
                                </div>
                            </div>
                            <div class="grid grid-cols-4 gap-1.5 pt-1">
                                <button data-bx-click="a436" data-p0="${bxE(function(){return a.id})}" class="py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">Detalle</button>
                                <button data-bx-click="a437" data-p0="${bxE(function(){return a.id})}" class="py-1.5 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-semibold">Meta</button>
                                <button data-bx-click="a438" data-p0="${bxE(function(){return a.id})}" class="py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold">Venta</button>
                                <button data-bx-click="a439" data-p0="${bxE(function(){return a.id})}" class="py-1.5 rounded-lg bg-rose-50 text-rose-600 text-xs font-semibold">Quitar</button>
                            </div>
                        </div>`;
                    }).join('') || `<div class="p-6 text-center text-slate-500 text-sm">Sin agentes asignados. El administrador asigna agentes desde la sección Usuarios.</div>`}
                </div>
                <!-- Tabla de escritorio (md+) -->
                <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50"><tr><th class="p-2 text-left">Agente</th><th class="text-left">Email</th><th class="text-right pr-2">Producción</th><th class="w-56"></th></tr></thead>
                    <tbody>${lista || '<tr><td colspan=4 class="p-6 text-center text-slate-500">Sin agentes asignados. El administrador asigna agentes desde la sección Usuarios (editar usuario → Agencia asignada).</td></tr>'}</tbody>
                </table>
                </div>
            </div>
            ${detalleHTML}
        </div>`;
    }catch(e){ return `<div class="p-8 text-red-600">Error Mi Equipo: ${e.message}</div>`; }
}
function agregarAgente(){
    // Solo agentes registrados en "Usuarios" y sin agencia asignada pueden agregarse al equipo
    const rolesAgente=['agente','agente_agencia','agente_desarrollo'];
    const disponibles = db.users.filter(u=>rolesAgente.includes(u.role) && !u.agenciaId && !u.parentId);
    if(!disponibles.length){
        showModal(`<div class="p-6 max-w-sm text-center"><i class="fas fa-circle-info text-3xl text-slate-300"></i><h3 class="font-bold mt-2">Sin agentes disponibles</h3><p class="text-sm text-slate-500 mt-2">No hay agentes libres por asignar. Crea primero el agente en <strong>Usuarios</strong> (rol Agente en Desarrollo o Agente de Agencia); solo aparecerán aquí los que aún no pertenezcan a una agencia.</p><div class="mt-4"><button data-bx-click="a1" class="px-4 py-2 border rounded-lg">Entendido</button></div></div>`);
        return;
    }
    const opts = disponibles.map(u=>`<option value="${u.id}">${escapeHTML(u.name||u.nombre||'')} (${escapeHTML(u.email||'')})</option>`).join('');
    showModal(`<form id="af" class="p-4 space-y-3"><h3 class="font-bold">Agregar agente a mi equipo</h3><p class="text-xs text-slate-500">Solo se listan agentes registrados en <strong>Usuarios</strong> (rol Agente en Desarrollo o Agente de Agencia) que todavía no pertenecen a ninguna agencia. También puedes asignar la agencia desde <strong>Usuarios</strong> editando el agente.</p><select name="agenteId" required class="w-full border rounded px-2 py-2 bg-white text-slate-900 border-slate-300">${opts}</select><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Agregar</button></div></form>`);
    document.getElementById('af').onsubmit=e=>{e.preventDefault();const id=Number(new FormData(e.target).get('agenteId'));const u=db.users.find(x=>x.id===id);if(u&&rolesAgente.includes(u.role)&&!u.agenciaId&&!u.parentId){u.agenciaId=currentUser.id;u.agencia=currentUser.id;u.parentId=currentUser.id;u.assignedTo=currentUser.id;saveDB();}closeModal();render();};
}
function quitarAgente(id){
    if(!confirm('¿Quitar agente del equipo?')) return;
    const u=db.users.find(x=>x.id===id);if(u){delete u.agenciaId;delete u.agencia;delete u.parentId;delete u.assignedTo;saveDB();render();}
}

function asignarMeta(id){
    const a=db.users.find(u=>u.id===id);
    showModal(`<form id="mf" class="p-4 space-y-2"><h3 class="font-bold">Meta para ${a.name}</h3><select name="periodo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></select><div class="grid grid-cols-3 gap-2"><input name="anio" type="number" value="${new Date().getFullYear()}" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="mes" type="number" placeholder="Mes" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="trimestre" type="number" placeholder="Trim" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>DAÑOS</option><option>AUTOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><input name="objetivo" type="number" placeholder="Prima neta objetivo" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('mf').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.id=Date.now();d.agenteId=id;d.agenciaId=a.agenciaId;d.objetivo=Number(d.objetivo);d.anio=Number(d.anio);d.mes=d.mes?Number(d.mes):null;d.trimestre=d.trimestre?Number(d.trimestre):null;db.metas=db.metas||[];db.metas=db.metas.filter(m=>!(m.agenteId===id&&m.periodo===d.periodo&&m.ramo===d.ramo&&m.anio===d.anio));db.metas.push(d);saveDB();closeModal();render();};
}
function registrarVenta(id){
    const a=db.users.find(u=>u.id===id);
    showModal(`<form id="vf" class="p-4 space-y-2"><h3 class="font-bold">Registrar venta - ${a.name}</h3><input name="contratante" placeholder="Contratante" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="fecha" type="date" required value="${new Date().toISOString().split('T')[0]}" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>DAÑOS</option><option>AUTOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><select name="compania" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>AXA</option><option>PS</option><option>MAPFRE</option><option>HDI</option><option>QLTS</option><option>SKANDIA</option><option>OTROS</option></select><input name="producto" placeholder="Producto" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="prima" type="number" placeholder="Prima neta" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-emerald-600 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('vf').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const v={id:Date.now(),agenteId:id,agenciaId:a.agenciaId,contratante:f.get('contratante'),fecha:f.get('fecha'),ramo:f.get('ramo'),compania:f.get('compania'),producto:f.get('producto'),prima:Number(f.get('prima'))};db.ventas=db.ventas||[];db.ventas.push(v); try{ const agente = db.users.find(u=>String(u.id)===String(v.agenteId)); if(agente) enviarAviso('ventas', [agente], {total: '$'+(v.prima||0).toLocaleString('es-MX'), mes: new Date(v.fecha).toLocaleDateString('es-MX',{month:'long'})}); }catch(e){} if(!db.notifications) db.notifications=[]; db.notifications.push({id:Date.now(),type:'venta',msg:'Nueva venta: '+(v.cliente||'Cliente')+' - $'+Number(v.prima).toLocaleString('es-MX'),agente:v.agente||currentUser.id,ts:new Date().toISOString(),readBy:[]}); saveDB();closeModal();render();};
}
function asignarMeta(id){const a=db.users.find(u=>u.id===id);showModal('<form id="mf" class="p-4 space-y-2"><h3 class="font-bold">Meta para '+a.name+'</h3><select name="periodo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></select><div class="grid grid-cols-3 gap-2"><input name="anio" type="number" value="'+new Date().getFullYear()+'" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="mes" type="number" placeholder="Mes" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="trimestre" type="number" placeholder="Trim" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>AUTOS</option><option>DAÑOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><input name="objetivo" type="number" placeholder="Monto" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-indigo-600 text-white px-3 py-1 rounded">Guardar</button></div></form>');document.getElementById('mf').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.id=Date.now();d.agenteId=id;d.agenciaId=a.agenciaId;d.objetivo=Number(d.objetivo);d.anio=Number(d.anio);d.mes=d.mes?Number(d.mes):null;d.trimestre=d.trimestre?Number(d.trimestre):null;db.metas=db.metas||[];db.metas=db.metas.filter(m=>!(m.agenteId===id&&m.periodo===d.periodo&&m.ramo===d.ramo&&m.anio===d.anio&&m.mes===d.mes&&m.trimestre===d.trimestre));db.metas.push(d);saveDB();closeModal();render();};}

function borrarConv(id){
    if(!confirm('¿Borrar convención?')) return;
    db.convenciones = (db.convenciones||[]).filter(c=>c.id!==id);
    saveDB(); render();
}
function agregarAgente(){
    // Solo agentes registrados en "Usuarios" y sin agencia asignada pueden agregarse al equipo
    const rolesAgente=['agente','agente_agencia','agente_desarrollo'];
    const disponibles = db.users.filter(u=>rolesAgente.includes(u.role) && !u.agenciaId && !u.parentId);
    if(!disponibles.length){
        showModal(`<div class="p-6 max-w-sm text-center"><i class="fas fa-circle-info text-3xl text-slate-300"></i><h3 class="font-bold mt-2">Sin agentes disponibles</h3><p class="text-sm text-slate-500 mt-2">No hay agentes libres por asignar. Crea primero el agente en <strong>Usuarios</strong> (rol Agente en Desarrollo o Agente de Agencia); solo aparecerán aquí los que aún no pertenezcan a una agencia.</p><div class="mt-4"><button data-bx-click="a1" class="px-4 py-2 border rounded-lg">Entendido</button></div></div>`);
        return;
    }
    const opts = disponibles.map(u=>`<option value="${u.id}">${escapeHTML(u.name||u.nombre||'')} (${escapeHTML(u.email||'')})</option>`).join('');
    showModal(`<form id="af" class="p-4 space-y-3"><h3 class="font-bold">Agregar agente a mi equipo</h3><p class="text-xs text-slate-500">Solo se listan agentes registrados en <strong>Usuarios</strong> (rol Agente en Desarrollo o Agente de Agencia) que todavía no pertenecen a ninguna agencia. También puedes asignar la agencia desde <strong>Usuarios</strong> editando el agente.</p><select name="agenteId" required class="w-full border rounded px-2 py-2 bg-white text-slate-900 border-slate-300">${opts}</select><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Agregar</button></div></form>`);
    document.getElementById('af').onsubmit=e=>{e.preventDefault();const id=Number(new FormData(e.target).get('agenteId'));const u=db.users.find(x=>x.id===id);if(u&&rolesAgente.includes(u.role)&&!u.agenciaId&&!u.parentId){u.agenciaId=currentUser.id;u.agencia=currentUser.id;u.parentId=currentUser.id;u.assignedTo=currentUser.id;saveDB();}closeModal();render();};
}
function quitarAgente(id){
    if(!confirm('¿Quitar agente del equipo?')) return;
    const u=db.users.find(x=>x.id===id);if(u){delete u.agenciaId;delete u.agencia;delete u.parentId;delete u.assignedTo;saveDB();render();}
}

function asignarMeta(id){
    const a=db.users.find(u=>u.id===id);
    showModal(`<form id="mf" class="p-4 space-y-2"><h3 class="font-bold">Meta para ${a.name}</h3><select name="periodo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option></select><div class="grid grid-cols-3 gap-2"><input name="anio" type="number" value="${new Date().getFullYear()}" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="mes" type="number" placeholder="Mes" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="trimestre" type="number" placeholder="Trim" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>DAÑOS</option><option>AUTOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><input name="objetivo" type="number" placeholder="Prima neta objetivo" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('mf').onsubmit=e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));d.id=Date.now();d.agenteId=id;d.agenciaId=a.agenciaId;d.objetivo=Number(d.objetivo);d.anio=Number(d.anio);d.mes=d.mes?Number(d.mes):null;d.trimestre=d.trimestre?Number(d.trimestre):null;db.metas=db.metas||[];db.metas=db.metas.filter(m=>!(m.agenteId===id&&m.periodo===d.periodo&&m.ramo===d.ramo&&m.anio===d.anio));db.metas.push(d);saveDB();closeModal();render();};
}
function registrarVenta(id){
    const a=db.users.find(u=>u.id===id);
    showModal(`<form id="vf" class="p-4 space-y-2"><h3 class="font-bold">Registrar venta - ${a.name}</h3><input name="contratante" placeholder="Contratante" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="fecha" type="date" required value="${new Date().toISOString().split('T')[0]}" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><select name="ramo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>VIDA</option><option>GMM</option><option>DAÑOS</option><option>AUTOS</option><option>INVERSIÓN</option><option>INVERSIÓN ELITE</option></select><select name="compania" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option>AXA</option><option>PS</option><option>MAPFRE</option><option>HDI</option><option>QLTS</option><option>SKANDIA</option><option>OTROS</option></select><input name="producto" placeholder="Producto" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="prima" type="number" placeholder="Prima neta" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-emerald-600 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('vf').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const v={id:Date.now(),agenteId:id,agenciaId:a.agenciaId,contratante:f.get('contratante'),fecha:f.get('fecha'),ramo:f.get('ramo'),compania:f.get('compania'),producto:f.get('producto'),prima:Number(f.get('prima'))};db.ventas=db.ventas||[];db.ventas.push(v); try{ const agente = db.users.find(u=>String(u.id)===String(v.agenteId)); if(agente) enviarAviso('ventas', [agente], {total: '$'+(v.prima||0).toLocaleString('es-MX'), mes: new Date(v.fecha).toLocaleDateString('es-MX',{month:'long'})}); }catch(e){} if(!db.notifications) db.notifications=[]; db.notifications.push({id:Date.now(),type:'venta',msg:'Nueva venta: '+(v.cliente||'Cliente')+' - $'+Number(v.prima).toLocaleString('es-MX'),agente:v.agente||currentUser.id,ts:new Date().toISOString(),readBy:[]}); saveDB();closeModal();render();};
}
function renderConvenciones(){
    try{
        const cs=(db.convenciones||[]);
        const concursos=(db.concursos||[]);
        const companias=(db.settings && db.settings.convencionCompanias)||[];
        const puedeBorrar = isAdmin(currentUser)||isGM(currentUser)||(currentUser.role||'').toLowerCase()==='maestro';
        const cardConv = c => `<div class="bg-white border rounded-2xl overflow-hidden relative"><img loading="lazy" decoding="async" src="${c.imagen||''}" class="w-full h-56 object-cover bg-slate-100" alt="${c.nombre||''}">${puedeBorrar?`<button data-bx-click="a447" data-p0="${bxE(function(){return c.id})}" title="Borrar" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 text-xs shadow-lg hover:bg-red-700"><i class="fa-solid fa-trash"></i></button>`:''}<div class="p-4"><div class="font-semibold">${c.nombre||'Convención'}</div><div class="text-xs text-slate-500">${c.destino||''} ${c.fecha? '· '+c.fecha : ''}</div>${c.descripcion?`<p class="text-xs mt-2 text-slate-600">${c.descripcion}</p>`:''}</div></div>`;
        const cardConc = c => `<div class="bg-white border-2 border-amber-200 rounded-2xl overflow-hidden relative"><img loading="lazy" decoding="async" src="${c.imagen||''}" class="w-full h-40 object-cover bg-amber-50" alt="${c.nombre||''}">${puedeBorrar?`<button data-bx-click="a448" data-p0="${bxE(function(){return c.id})}" title="Borrar" class="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 text-xs shadow-lg hover:bg-red-700"><i class="fa-solid fa-trash"></i></button>`:''}<div class="p-4"><div class="font-semibold flex items-center gap-1.5"><i class="fas fa-trophy text-amber-500 text-sm"></i>${c.nombre||'Concurso'}</div>${c.premio?`<div class="text-sm font-bold text-amber-600 mt-1">${c.premio}</div>`:''}<div class="text-xs text-slate-500">${c.fechaInicio?'Del '+c.fechaInicio:''} ${c.fechaFin?' al '+c.fechaFin:''}</div>${c.descripcion?`<p class="text-xs mt-2 text-slate-600">${c.descripcion}</p>`:''}</div></div>`;
        return `<div class="p-6 max-w-6xl mx-auto">
            <div class="flex justify-between mb-4 flex-wrap gap-2">
                <h2 class="text-2xl font-bold">Convenciones y Concursos</h2>
                <div class="flex gap-2 flex-wrap">
                    ${puedeBorrar?`<button data-bx-click="a449" class="bg-white border px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-building mr-1 text-slate-400"></i>Compañías</button>
                    <button data-bx-click="a450" class="bg-white border px-3 py-1.5 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-trophy mr-1 text-amber-500"></i>Concurso</button>`:''}
                    <button data-bx-click="a451" class="bg-slate-900 text-white px-3 py-1.5 rounded-lg text-sm">Nueva convención</button>
                </div>
            </div>
            ${companias.length?`<div class="flex flex-wrap gap-2 mb-5">${companias.map(c=>`<span class="px-3 py-1 bg-slate-100 rounded-full text-xs font-medium text-slate-700"><i class="fas fa-building mr-1 text-slate-400"></i>${psEscape(c)}</span>`).join('')}</div>`:''}
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${cs.map(cardConv).join('') || '<div class="col-span-3 text-center text-slate-400 p-12 bg-white border rounded-2xl">Sin convenciones aún</div>'}</div>
            <h3 class="text-lg font-bold mt-8 mb-3 flex items-center gap-2"><i class="fas fa-trophy text-amber-500"></i> Concursos vigentes</h3>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${concursos.map(cardConc).join('') || '<div class="col-span-3 text-center text-slate-400 p-8 bg-white border rounded-2xl">Sin concursos publicados</div>'}</div>
        </div>`;
    }catch(e){ return `<div class="p-8 text-red-600">Error Convenciones: ${e.message}</div>`; }
}
function openConc(){
    showModal(`<form id="ccf" class="p-4 space-y-2 max-w-md"><h3 class="font-bold">Nuevo Concurso</h3><input name="nombre" placeholder="Nombre del concurso" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="premio" placeholder="Premio (ej. $50,000 o viaje)" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><textarea name="descripcion" placeholder="Bases y reglas" rows="3" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></textarea><div class="grid grid-cols-2 gap-2"><div><label class="text-xs text-slate-500">Inicio</label><input name="fechaInicio" type="date" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><div><label class="text-xs text-slate-500">Fin</label><input name="fechaFin" type="date" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div></div><input name="imagenFile" type="file" accept="image/*" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-amber-500 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('ccf').onsubmit=e=>{
        e.preventDefault(); const f=new FormData(e.target); const file=f.get('imagenFile');
        const d={ id:Date.now(), nombre:f.get('nombre'), premio:f.get('premio'), descripcion:f.get('descripcion'), fechaInicio:f.get('fechaInicio'), fechaFin:f.get('fechaFin'), creadoPor:currentUser.id };
        const guardar=(imagen)=>{ if(imagen) d.imagen=imagen; db.concursos=db.concursos||[]; db.concursos.push(d); cmLog('Convenciones','Creó concurso', d.nombre); saveDB(); closeModal(); render(); };
        if(file&&file.size){ const reader=new FileReader(); reader.onload=()=>guardar(reader.result); reader.readAsDataURL(file); } else guardar('');
    };
}
function borrarConc(id){
    if(!confirm('¿Borrar concurso?')) return;
    db.concursos=(db.concursos||[]).filter(c=>c.id!==id);
    cmLog('Convenciones','Borró concurso','');
    saveDB(); render();
}
function openCompModal(){
    const companias=(db.settings && db.settings.convencionCompanias)||[];
    showModal(`<div class="p-6 max-w-md w-full"><h3 class="text-xl font-bold mb-2">Compañías participantes</h3><p class="text-sm text-slate-500 mb-3">Una por línea. Estas compañías se muestran como lista editable en esta sección.</p>
    <textarea id="comp-lista" rows="7" class="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white text-slate-900">${psEscape(companias.join('\n'))}</textarea>
    <div class="flex justify-end gap-2 mt-4"><button data-bx-click="a1" class="px-4 py-2 border border-slate-300 rounded-xl">Cancelar</button><button data-bx-click="a452" class="px-5 py-2 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800">Guardar</button></div></div>`);
}
function guardarCompaniasConv(){
    const lista=document.getElementById('comp-lista').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(!db.settings) db.settings={};
    db.settings.convencionCompanias=lista;
    cmLog('Convenciones','Editó compañías', `${lista.length} compañías`);
    saveDB(); closeModal(); showToast('Compañías actualizadas','success'); render();
}
function borrarConv(id){
    if(!confirm('¿Borrar convención?')) return;
    db.convenciones = (db.convenciones||[]).filter(c=>c.id!==id);
    saveDB(); render();
}
function openConv(){
    showModal(`<form id="cf" class="p-4 space-y-2 max-w-md"><h3 class="font-bold">Nueva Convención</h3><input name="nombre" placeholder="Nombre" required class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="destino" placeholder="Destino" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="imagenFile" type="file" accept="image/*" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><div class="grid grid-cols-2 gap-2"><input name="fechaInicio" type="date" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="fechaFin" type="date" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><select name="periodo" class="w-full border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual" selected>Anual</option></select><div class="grid grid-cols-2 gap-2"><input name="metaVIDA" type="number" placeholder="Meta VIDA" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaGMM" type="number" placeholder="Meta GMM" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaDANOS" type="number" placeholder="Meta DAÑOS" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaAUTOS" type="number" placeholder="Meta AUTOS" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaINV" type="number" placeholder="Meta INVERSIÓN" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"><input name="metaINV Elite" type="number" placeholder="Meta INVERSIÓN ELITE" class="border rounded px-2 py-1 bg-white text-slate-900 border-slate-300"></div><div class="flex justify-end gap-2"><button type="button" data-bx-click="a1" class="border px-3 py-1 rounded">Cancelar</button><button class="bg-slate-900 text-white px-3 py-1 rounded">Guardar</button></div></form>`);
    document.getElementById('cf').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const file=f.get('imagenFile');const reader=new FileReader();reader.onload=()=>{const d={id:Date.now(),nombre:f.get('nombre'),destino:f.get('destino'),fechaInicio:f.get('fechaInicio'),fechaFin:f.get('fechaFin'),periodo:f.get('periodo'),imagen:reader.result,metas:{VIDA:Number(f.get('metaVIDA')||0),GMM:Number(f.get('metaGMM')||0),DAÑOS:Number(f.get('metaDANOS')||0),AUTOS:Number(f.get('metaAUTOS')||0),'INVERSIÓN':Number(f.get('metaINV')||0),'INVERSIÓN ELITE':Number(f.get('metaINV Elite')||0)},creadoPor:currentUser.id,agenciaId:(currentUser.role||'').toLowerCase()==='maestro'?currentUser.id:null};db.convenciones=db.convenciones||[];db.convenciones.push(d);saveDB();closeModal();render();}; if(file&&file.size){reader.readAsDataURL(file);}else{reader.onload();}};
}


function renderMonitoreoAgencias(){
    try{
        const ventas = db.ventas||[];
        const users = db.users||[];
        const metas = db.metas||[];
        const roleNorm = u => (u.role||'').toLowerCase();
        
        const agenciasMap = {};
        users.filter(u=> roleNorm(u)==='agencia' || roleNorm(u)==='maestro').forEach(a=>{
            agenciasMap[a.id] = { id:a.id, nombre:a.name||a.nombre||('Agencia '+a.id), agentes:[] };
        });
        ventas.forEach(v=>{
            if(v.agenciaId && !agenciasMap[v.agenciaId]){
                const agUser = users.find(u=>u.id==v.agenciaId);
                agenciasMap[v.agenciaId] = { id:v.agenciaId, nombre: agUser ? (agUser.name||agUser.nombre) : ('Agencia '+v.agenciaId), agentes:[] };
            }
        });
        users.filter(u=> ['agente','agente_agencia','agente_desarrollo'].includes(roleNorm(u))).forEach(ag=>{
            const aid = ag.agenciaId || ag.agencia || ag.parentId || null;
            if(aid && agenciasMap[aid]) agenciasMap[aid].agentes.push(ag);
            else {
                if(!agenciasMap['sin']) agenciasMap['sin']={id:'sin',nombre:'Sin Agencia',agentes:[]};
                agenciasMap['sin'].agentes.push(ag);
            }
        });
        const agencias = Object.values(agenciasMap);
        
        if(!window.monitoreoState){
            const now = new Date();
            window.monitoreoState = { anio: now.getFullYear(), periodo: 'mensual', mes: now.getMonth()+1, trimestre: Math.floor(now.getMonth()/3)+1, agenciaId: 'todas' };
        }
        const st = window.monitoreoState;
        
        const anios = [...new Set(ventas.map(v=> new Date(v.fecha).getFullYear()))].sort((a,b)=>b-a);
        if(anios.length===0) anios.push(st.anio);
        if(!anios.includes(st.anio)) anios.unshift(st.anio);
        
        const enPeriodo = (fechaStr)=>{
            const d = new Date(fechaStr);
            if(isNaN(d)) return false;
            if(d.getFullYear()!==st.anio) return false;
            if(st.periodo==='mensual') return (d.getMonth()+1)===st.mes;
            if(st.periodo==='trimestral') return Math.floor(d.getMonth()/3)+1===st.trimestre;
            return true;
        };
        
        const ventasFiltradas = ventas.filter(v=> enPeriodo(v.fecha));
        const ramos = ['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
        const companiasMonitoreo = ['AXA','PS','MAPFRE','HDI','QLTS','SKANDIA','OTROS'];
        const datosAgencias = agencias.map(ag=>{
            const agentesIds = ag.agentes.map(a=>String(a.id));
            const vs = ventasFiltradas.filter(v=> String(v.agenciaId)===String(ag.id) || agentesIds.includes(String(v.agenteId)));
            const total = vs.reduce((s,v)=> s + Number(v.prima||0),0);
            const porRamo = {};
            ramos.forEach(r=> porRamo[r]= vs.filter(v=> (v.ramo||'').toUpperCase()===r).reduce((s,v)=>s+Number(v.prima||0),0));
            const metasAg = metas.filter(m=> agentesIds.includes(String(m.agenteId)) && Number(m.anio)===st.anio && (
                (st.periodo==='mensual' && Number(m.mes)===st.mes) ||
                (st.periodo==='trimestral' && Number(m.trimestre)===st.trimestre) ||
                (st.periodo==='anual')
            ));
            const metaTotal = metasAg.reduce((s,m)=> s + Number(m.objetivo||0),0);
            const agentesActivos = new Set(vs.map(v=>String(v.agenteId))).size;
            const porCompania = {};
            companiasMonitoreo.forEach(c=> porCompania[c]= vs.filter(v=> (v.compania||'').toUpperCase()===c).reduce((s,v)=>s+Number(v.prima||0),0));
            return { ...ag, total, porRamo, porCompania, metaTotal, agentesActivos, ventas:vs };
        });
        
        const datosFiltrados = st.agenciaId==='todas' ? datosAgencias : datosAgencias.filter(a=>String(a.id)===String(st.agenciaId));
        const produccionPeriodo = datosFiltrados.reduce((s,a)=>s+a.total,0);
        const metaPeriodo = datosFiltrados.reduce((s,a)=>s+a.metaTotal,0);
        const cumplimiento = metaPeriodo>0 ? Math.round((produccionPeriodo/metaPeriodo)*100) : 0;
        const agentesActivosTotal = datosFiltrados.reduce((s,a)=>s+a.agentesActivos,0);
        const topAgencias = [...datosAgencias].sort((a,b)=>b.total-a.total).slice(0,10);
        
        // Guardar datos para gráficos
        window._monitoreoCharts = {
            agenciasLabels: topAgencias.map(a=>a.nombre),
            agenciasData: topAgencias.map(a=>a.total),
            ramosLabels: topAgencias.slice(0,5).map(a=>a.nombre),
            ramosVIDA: topAgencias.slice(0,5).map(a=>a.porRamo.VIDA),
            ramosGMM: topAgencias.slice(0,5).map(a=>a.porRamo.GMM),
            ramosDANOS: topAgencias.slice(0,5).map(a=>a.porRamo.DAÑOS),
            ramosAUTOS: topAgencias.slice(0,5).map(a=>a.porRamo.AUTOS),
            ramosINV: topAgencias.slice(0,5).map(a=>a.porRamo['INVERSIÓN']),
            ramosINV_ELITE: topAgencias.slice(0,5).map(a=>a.porRamo['INVERSIÓN ELITE']),
            compNombres: (function(){ try{ return companiasGraficas(ventasFiltradas); }catch(e){ return ['AXA','PS','SKANDIA']; } })()
        };
        
        // Programar render de gráficos después de insertar HTML
        setTimeout(()=>{
            const ctx1 = document.getElementById('chart-agencias');
            if(ctx1 && window.Chart){
                if(window._chart1) window._chart1.destroy();
                window._chart1 = new Chart(ctx1, {
                    type:'bar',
                    data:{ labels: window._monitoreoCharts.agenciasLabels, datasets:[{ label:'Producción', data: window._monitoreoCharts.agenciasData, backgroundColor:'#0a2540', borderRadius:6 }] },
                    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}, tooltip:{callbacks:{label:c=>'$'+Number(c.raw).toLocaleString('es-MX')}}}, scales:{x:{ticks:{callback:v=>'$'+Number(v).toLocaleString('es-MX')}, grid:{display:false}}, y:{grid:{display:false}}} }
                });
            }
            const ctxC = document.getElementById('chart-companias');
            if(ctxC && window.Chart){
                if(window._chartC) window._chartC.destroy();
                const compsC=(window._monitoreoCharts.compNombres||[]);
                window._chartC=new Chart(ctxC,{type:'bar',data:{labels:window._monitoreoCharts.ramosLabels,datasets:compsC.slice(0,12).map((c,i)=>({label:c,data:topAgencias.slice(0,5).map(a=>(a.porCompania||{})[c]||0),backgroundColor:gfColorPara('compania',c,i)}))},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:c2=>c2.dataset.label+': $'+Number(c2.raw).toLocaleString('es-MX')}}},scales:{y:{ticks:{callback:v=>'$'+Number(v).toLocaleString('es-MX')},beginAtZero:true}}}});
            }
            const ctx2 = document.getElementById('chart-ramos');
            if(ctx2 && window.Chart){
                if(window._chart2) window._chart2.destroy();
                window._chart2 = new Chart(ctx2, {
                    type:'bar',                    data:{ labels: window._monitoreoCharts.ramosLabels, datasets:(function(){
                        const ramosChart=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
                        const map={VIDA:'ramosVIDA',GMM:'ramosGMM','DAÑOS':'ramosDANOS',AUTOS:'ramosAUTOS','INVERSIÓN':'ramosINV','INVERSIÓN ELITE':'ramosINV_ELITE'};
                        return ramosChart.map((r,i)=>({label:r, data:window._monitoreoCharts[map[r]], backgroundColor:gfColorPara('ramo',r,i)}));
                    })()},
                    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}, tooltip:{callbacks:{label:c=>c.dataset.label+': $'+Number(c.raw).toLocaleString('es-MX')}}}, scales:{y:{ticks:{callback:v=>'$'+Number(v).toLocaleString('es-MX')}, beginAtZero:true}} }
                });
            }
        }, 100);
        
        return `<div class="p-6 max-w-7xl mx-auto">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h2 class="text-2xl font-bold text-slate-900 flex items-center gap-2"><i class="fas fa-chart-line text-indigo-600"></i> Monitoreo Agencias</h2>
                    <p class="text-sm text-slate-500">Seguimiento de producción por periodo y ramo</p>
                </div>
                <div class="flex gap-2">
                ${(currentUser.role||'').toLowerCase()==='gm' ? `<button data-bx-click="a446" class="px-4 py-2 bg-white border text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50"><i class="fas fa-palette mr-2 text-indigo-600"></i>Colores</button>` : ''}
                <button data-bx-click="a453" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"><i class="fas fa-file-csv mr-2"></i>Exportar CSV</button>
                </div>
            </div>
            
            <div class="bg-white border rounded-2xl p-4 mb-6 shadow-sm">
                <div class="grid md:grid-cols-5 gap-4 items-end">
                    <div>
                        <label class="text-xs font-medium text-slate-600">Año</label>
                        <select class="w-full border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300" data-bx-change="a454">
                            ${anios.map(a=>`<option ${a===st.anio?'selected':''}>${a}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-xs font-medium text-slate-600">Periodo</label>
                        <div class="flex gap-1">
                            ${['mensual','trimestral','anual'].map(p=>`<button data-bx-click="a455" data-p0="${bxE(function(){return p})}" class="px-3 py-2 text-xs rounded-lg border ${st.periodo===p?'bg-indigo-600 text-white border-indigo-600':'bg-white text-slate-600'}">${p.charAt(0).toUpperCase()+p.slice(1)}</button>`).join('')}
                        </div>
                    </div>
                    <div class="${st.periodo!=='mensual'?'hidden':''}">
                        <label class="text-xs font-medium text-slate-600">Mes</label>
                        <select class="w-full border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300" data-bx-change="a456">
                            ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<option value="${m}" ${m===st.mes?'selected':''}>${new Date(2000,m-1).toLocaleString('es',{month:'long'})}</option>`).join('')}
                        </select>
                    </div>
                    <div class="${st.periodo!=='trimestral'?'hidden':''}">
                        <label class="text-xs font-medium text-slate-600">Trimestre</label>
                        <select class="w-full border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300" data-bx-change="a457">
                            ${[1,2,3,4].map(t=>`<option value="${t}" ${t===st.trimestre?'selected':''}>Q${t}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="text-xs font-medium text-slate-600">Agencia</label>
                        <select class="w-full border rounded-lg px-3 py-2 text-sm bg-white text-slate-900 border-slate-300" data-bx-change="a458">
                            <option value="todas" ${st.agenciaId==='todas'?'selected':''}>Todas</option>
                            ${agencias.map(a=>`<option value="${a.id}" ${String(st.agenciaId)===String(a.id)?'selected':''}>${a.nombre}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="grid md:grid-cols-4 gap-4 mb-6">
                ${[
                    {label:'Producción periodo', valor:'$'+produccionPeriodo.toLocaleString('es-MX'), icon:'fa-sack-dollar'},
                    {label:'Meta periodo', valor:'$'+metaPeriodo.toLocaleString('es-MX'), icon:'fa-bullseye'},
                    {label:'% Cumplimiento', valor:cumplimiento+'%', icon:'fa-chart-pie'},
                    {label:'Agentes activos', valor:agentesActivosTotal, icon:'fa-user-check'}
                ].map(k=>`<div class="bg-white border rounded-2xl p-4"><div class="flex items-center justify-between"><div><p class="text-xs text-slate-500">${k.label}</p><p class="text-2xl font-bold text-slate-900 mt-1">${k.valor}</p></div><div class="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600"><i class="fas ${k.icon}"></i></div></div></div>`).join('')}
            </div>
            
            <div class="grid lg:grid-cols-2 gap-6 mb-6">
                <div class="bg-white border rounded-2xl p-5 h-[320px]">
                    <h3 class="font-semibold mb-3">Producción total por agencia</h3>
                    <div class="h-[260px]"><canvas id="chart-agencias"></canvas></div>
                </div>
                <div class="bg-white border rounded-2xl p-5 h-[320px]">
                    <h3 class="font-semibold mb-3">Comparativo por ramo (Top 5)</h3>
                    <div class="h-[260px]"><canvas id="chart-ramos"></canvas></div>
                </div>
                <div class="bg-white border rounded-2xl p-5 h-[320px] lg:col-span-2">
                    <h3 class="font-semibold mb-3">Comparativo por compañía (Top 5)</h3>
                    <div class="h-[260px]"><canvas id="chart-companias"></canvas></div>
                </div>
            </div>
            
            <div class="bg-white border rounded-2xl overflow-hidden">
                <div class="px-5 py-3 border-b flex items-center justify-between">
                    <h3 class="font-semibold">Detalle por agencia</h3>
                    <span class="text-xs text-slate-500">${datosFiltrados.length} agencias</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50 text-xs uppercase text-slate-500">
                            <tr><th class="text-left px-4 py-2">Agencia</th><th class="text-center px-3 py-2">Agentes</th><th class="text-right px-3 py-2">VIDA</th><th class="text-right px-3 py-2">GMM</th><th class="text-right px-3 py-2">DAÑOS</th><th class="text-right px-3 py-2">AUTOS</th><th class="text-right px-3 py-2">INVERSIÓN</th><th class="text-right px-3 py-2">INV. ELITE</th><th class="text-right px-4 py-2">Total</th><th class="text-right px-4 py-2">% Meta</th></tr>
                        </thead>
                        <tbody class="divide-y">
                            ${datosFiltrados.map(ag=>{
                                const pct = ag.metaTotal>0 ? Math.round((ag.total/ag.metaTotal)*100) : 0;
                                return `<tr class="hover:bg-slate-50 cursor-pointer" data-bx-click="a459" data-p0="${bxE(function(){return ag.id})}"><td class="px-4 py-2 font-medium">${ag.nombre}</td><td class="text-center">${ag.agentes.length}</td><td class="text-right">$${ag.porRamo.VIDA.toLocaleString('es-MX')}</td><td class="text-right">$${ag.porRamo.GMM.toLocaleString('es-MX')}</td><td class="text-right">$${ag.porRamo.DAÑOS.toLocaleString('es-MX')}</td><td class="text-right">$${ag.porRamo.AUTOS.toLocaleString('es-MX')}</td><td class="text-right">$${(ag.porRamo['INVERSIÓN']||0).toLocaleString('es-MX')}</td><td class="text-right">$${(ag.porRamo['INVERSIÓN ELITE']||0).toLocaleString('es-MX')}</td><td class="text-right font-semibold">$${ag.total.toLocaleString('es-MX')}</td><td class="text-right"><span class="px-2 py-0.5 rounded-full text-xs ${pct>=100?'bg-emerald-100 text-emerald-700':pct>=70?'bg-amber-100 text-amber-700':'bg-slate-100'}">${pct}%</span></td></tr>`;
                            }).join('') || `<tr><td colspan="10" class="text-center py-8 text-slate-400">Sin datos para el periodo</td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    }catch(e){ return `<div class="p-8 text-red-600">Error Monitoreo: ${e.message}</div>`; }
}

function verDetalleAgencia(agenciaId){
    const esSin = String(agenciaId)==='sin';
    const ag = esSin ? {name:'Sin Agencia'} : ((db.users||[]).find(u=>String(u.id)===String(agenciaId)) || {name:'Agencia '+agenciaId});
    // SOLO agentes asignados a ESTA agencia (vía agenciaId, agencia o parentId); 'sin' = agentes sin agencia
    const rolesAg = ['agente','agente_agencia','agente_desarrollo'];
    const agentes = (db.users||[]).filter(u=>{
        if(!rolesAg.includes((u.role||'').toLowerCase())) return false;
        const asignadoA = [u.agenciaId, u.agencia, u.parentId].find(x=> x!==undefined && x!==null && String(x)!=='');
        if(esSin) return !asignadoA;
        return asignadoA!==undefined && String(asignadoA)===String(agenciaId);
    });
    const ventas = (db.ventas||[]).filter(v=> agentes.some(a=>String(a.id)===String(v.agenteId)) || (!esSin && String(v.agenciaId)===String(agenciaId)));
    const ultimas = [...ventas].sort((a,b)=> new Date(b.fecha)-new Date(a.fecha)).slice(0,10);
    const prodPorAgente = agentes.map(a=>{
        const vs = ventas.filter(v=>String(v.agenteId)===String(a.id));
        const total = vs.reduce((s,v)=>s+Number(v.prima||0),0);
        return {agente:a, total, count:vs.length};
    }).sort((a,b)=>b.total-a.total);
    
    showModal(`<div class="p-6 max-w-[95vw] max-h-[95vh] overflow-y-auto w-full" style="width: 95vw; max-width: 1400px;">
        <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold">Detalle - ${ag.name||ag.nombre}</h3>
            <button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times"></i></button>
        </div>
        <div class="grid md:grid-cols-2 gap-6">
            <div>
                <h4 class="font-semibold mb-2 text-sm uppercase text-slate-500">Producción por agente <span class="normal-case text-xs text-slate-400">(${agentes.length} asignado${agentes.length===1?'':'s'} a esta agencia)</span></h4>
                <div class="border rounded-xl overflow-auto">
                    <table class="w-full text-sm">
                        <thead class="bg-slate-50"><tr><th class="text-left px-3 py-2">Agente</th><th class="text-left px-3 py-2">Rol</th><th class="text-right px-3 py-2">Ventas</th><th class="text-right px-3 py-2">Total</th></tr></thead>
                        <tbody class="divide-y">
                            ${prodPorAgente.map(p=>`<tr><td class="px-3 py-1.5">${p.agente.name||p.agente.nombre}</td><td class="px-3 py-1.5 text-xs text-slate-500">${p.agente.role==='agente_desarrollo'?'Agente en Desarrollo':p.agente.role==='agente_agencia'?'Agente de Agencia':(p.agente.role||'')}</td><td class="text-right px-3">${p.count}</td><td class="text-right px-3 font-medium">$${p.total.toLocaleString('es-MX')}</td></tr>`).join('') || '<tr><td colspan=4 class="text-center py-4 text-slate-400">Sin agentes asignados a esta agencia</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
            <div>
                <h4 class="font-semibold mb-2 text-sm uppercase text-slate-500">Últimas 10 ventas</h4>
                <div class="border rounded-xl overflow-auto">
                    <table class="w-full text-xs">
                        <thead class="bg-slate-50"><tr><th class="text-left px-2 py-1.5">Fecha</th><th class="text-left px-2">Contratante</th><th class="px-2">Ramo</th><th class="text-right px-2">Prima</th></tr></thead>
                        <tbody class="divide-y">
                            ${ultimas.map(v=>`<tr><td class="px-2 py-1">${v.fecha}</td><td class="px-2">${v.contratante||'-'}</td><td class="px-2 text-center">${v.ramo}</td><td class="text-right px-2">$${Number(v.prima||0).toLocaleString('es-MX')}</td></tr>`).join('') || '<tr><td colspan=4 class="text-center py-4 text-slate-400">Sin ventas</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>`);
}

function exportarMonitoreoCSV(){
    try{
        const st = window.monitoreoState || {};
        const ventas = db.ventas||[];
        const enPeriodo = v=>{
            const d=new Date(v.fecha); if(d.getFullYear()!==st.anio) return false;
            if(st.periodo==='mensual') return (d.getMonth()+1)===st.mes;
            if(st.periodo==='trimestral') return Math.floor(d.getMonth()/3)+1===st.trimestre;
            return true;
        };
        const filtradas = ventas.filter(enPeriodo).filter(v=> st.agenciaId==='todas' || String(v.agenciaId)===String(st.agenciaId));
        let csv = 'Agencia,Agente,Fecha,Ramo,Producto,Prima,Contratante\n';
        filtradas.forEach(v=>{
            const ag = (db.users||[]).find(u=>String(u.id)===String(v.agenciaId));
            const agente = (db.users||[]).find(u=>String(u.id)===String(v.agenteId));
            csv += `"${ag? (ag.name||ag.nombre):''}","${agente? (agente.name||agente.nombre):''}","${v.fecha}","${v.ramo}","${(v.producto||'').replace(/"/g,'')}","${v.prima}","${(v.contratante||'').replace(/"/g,'')}"\n`;
        });
        const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`monitoreo_${st.anio}_${st.periodo}.csv`; a.click(); URL.revokeObjectURL(url);
    }catch(e){ uiToast('Error exportando: '+e.message); }
}

// === MIS CLIENTES - IMPLEMENTACIÓN AISLADA ===
/* ==================== COMPAÑÍAS DINÁMICAS + COLORES DE GRÁFICAS ==================== */
function companiasClientes(){
    if(!db.settings) db.settings={};
    if(!Array.isArray(db.settings.companiasClientes) || !db.settings.companiasClientes.length){
        db.settings.companiasClientes=['SKANDIA','PLAN SEGURO','MAPFRE','HDI','QUALITAS','AXA'];
    }
    return db.settings.companiasClientes;
}
function gfColores(){
    if(!db.settings) db.settings={};
    if(!db.settings.coloresGraficas || typeof db.settings.coloresGraficas!=='object') db.settings.coloresGraficas={ramo:{}, compania:{}};
    if(!db.settings.coloresGraficas.ramo) db.settings.coloresGraficas.ramo={};
    if(!db.settings.coloresGraficas.compania) db.settings.coloresGraficas.compania={};
    return db.settings.coloresGraficas;
}
const GF_RAMO_DEF={'VIDA':'#0a2540','GMM':'#c9a86a','DAÑOS':'#64748b','AUTOS':'#0ea5e9','INVERSIÓN':'#7c3aed','INVERSIÓN ELITE':'#b45309'};
const GF_PALETA=['#2563eb','#16a34a','#dc2626','#f59e0b','#0d9488','#6366f1','#be185d','#059669','#7c3aed','#475569'];
function gfColorPara(tipo, nombre, idx){
    const cfg=gfColores();
    if(cfg[tipo] && cfg[tipo][nombre]) return cfg[tipo][nombre];
    if(tipo==='ramo' && GF_RAMO_DEF[nombre]) return GF_RAMO_DEF[nombre];
    return GF_PALETA[(idx||0)%GF_PALETA.length];
}
function companiasGraficas(ventasLista){
    const s={};
    companiasClientes().forEach(c=>{ s[String(c).toUpperCase()]=1; });
    (ventasLista||[]).forEach(v=>{ const c=String(v.compania||'').toUpperCase(); if(c) s[c]=1; });
    return Object.keys(s).sort();
}
function openGestionarCompanias(){
    if((currentUser.role||'').toLowerCase()!=='gm'){ showToast('Solo el rol GM puede administrar las compañías','warning'); return; }
    const lista=companiasClientes();
    const uso=(nombre)=>{
        const n=String(nombre).toUpperCase();
        return { cli:(db.clientes||[]).filter(c=>String(c.compania||'').toUpperCase()===n).length, ven:(db.ventas||[]).filter(v=>String(v.compania||'').toUpperCase()===n).length };
    };
    showModal(`<div class="p-6 max-w-md w-full max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-3"><h3 class="text-lg font-bold">Administrar compañías</h3><button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button></div>
    <div class="flex gap-2 mb-3"><input id="nc-comp-nombre" placeholder="Nueva compañía (ej. GNP)" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white text-slate-900"><button data-bx-click="a460" class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 text-sm">Agregar</button></div>
    <div class="space-y-1 max-h-[45vh] overflow-y-auto">${lista.map(c=>{
        const u=uso(c);
        const usada=u.cli>0||u.ven>0;
        return `<div class="flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2"><span class="text-sm font-medium">${escapeHTML(c)}</span><span class="flex items-center gap-2">${usada?`<span class="text-[10px] text-slate-400">${u.cli} cliente${u.cli===1?'':'s'} · ${u.ven} venta${u.ven===1?'':'s'}</span>`:''}<button data-bx-click="a461" data-p0="${bxE(function(){return escapeHTML(c)})}" class="text-slate-400 hover:text-red-600" title="Eliminar"><i class="fas fa-trash text-xs"></i></button></span></div>`;
    }).join('')}</div>
    <p class="text-[11px] text-slate-400 mt-3">No se puede eliminar una compañía que ya tiene clientes o ventas registrados.</p>
  </div>`);
}
function openAgregarCompania(){ openGestionarCompanias(); }
function gfGuardarCompania(){
    try{
        if((currentUser.role||'').toLowerCase()!=='gm'){ showToast('Solo el rol GM puede agregar compañías','warning'); return; }
        const nom=String((document.getElementById('nc-comp-nombre')||{}).value||'').trim().toUpperCase();
        if(!nom){ showToast('Escribe el nombre de la compañía','warning'); return; }
        const lista=companiasClientes();
        if(lista.some(c=>String(c).toUpperCase()===nom)){ showToast('Esa compañía ya existe','warning'); return; }
        lista.push(nom);
        cmLog('Mis Clientes','Agregó compañía',nom);
        saveDB(); showToast('Compañía agregada: '+nom,'success'); render(); setTimeout(function(){ try{ openGestionarCompanias(); }catch(e){} },80);
    }catch(e){ uiToast('Error: '+e.message); }
}
function gfBorrarCompania(nombre){
    try{
        if((currentUser.role||'').toLowerCase()!=='gm'){ showToast('Solo el rol GM puede eliminar compañías','warning'); return; }
        const n=String(nombre||'').toUpperCase();
        const lista=companiasClientes();
        const enUso=(db.clientes||[]).filter(c=>String(c.compania||'').toUpperCase()===n).length + (db.ventas||[]).filter(v=>String(v.compania||'').toUpperCase()===n).length;
        if(enUso>0){ showToast('No se puede eliminar: hay '+enUso+' registro(s) de clientes/ventas con esta compañía','warning'); return; }
        if(!confirm('¿Eliminar la compañía "'+n+'"?')) return;
        db.settings.companiasClientes=lista.filter(c=>String(c).toUpperCase()!==n);
        const cfg=gfColores(); if(cfg.compania) delete cfg.compania[n];
        cmLog('Mis Clientes','Eliminó compañía',n);
        saveDB(); showToast('Compañía eliminada: '+n,'success'); render(); setTimeout(function(){ try{ openGestionarCompanias(); }catch(e){} },80);
    }catch(e){ uiToast('Error: '+e.message); }
}
/* ==================== SINIESTROS Y CANCELACIONES (ligado a Mis Clientes) ==================== */
function sinDB(){
    if(!Array.isArray(db.siniestros)) db.siniestros = [];
    return db.siniestros;
}
// Estados de seguimiento por tipo de caso
function sinEstado(tipo){
    return String(tipo)==='cancelacion'
        ? ['Solicitada','En proceso','Documentación','Efectiva','Rechazada']
        : ['Reportado','En revisión','Documentación','Aprobado','Pagado','Cerrado'];
}
const SIN_ETIQUETA = {
    'Reportado':'Siniestro reportado a la aseguradora. Pide el número de reporte/siniestro y anótalo en notas.',
    'En revisión':'La aseguradora asignó ajustador. Confirmar datos del caso y mantener contacto cercano con el cliente.',
    'Documentación':'Reunir y entregar los documentos requeridos del ramo (ver checklist). Vigilar fechas límite de respuesta.',
    'Aprobado':'Procedente: acordar forma y fecha de pago/indemnización con la aseguradora.',
    'Pagado':'Pago/indemnización emitido. Confirmar depósito con el cliente y cerrar el caso.',
    'Cerrado':'Caso cerrado. Da seguimiento a la renovación o nueva oportunidad comercial.',
    'Solicitada':'El cliente solicita cancelar su póliza. Confirmar motivo (retención y siniestralidad).',
    'En proceso':'Trámite en curso con la aseguradora: carta instrucción / solicitud en revisión.',
    'Efectiva':'Cancelación efectiva. Verificar fin de vigencia, devolución de prima si aplica y liberar la cobranza.',
    'Rechazada':'La aseguradora no autorizó (o el cliente desistió). Explicar opciones al cliente.'
};
// Checklist de documentos por ramo (apoyo al agente en siniestros y cancelaciones)
const SIN_DOCS = {
    'VIDA': ['Identificación oficial del beneficiario','Acta de defunción (si aplica)','Carátula de póliza','Certificado médico / clínico','Formato de reclamación de la aseguradora','Comprobante bancario del beneficiario'],
    'GMM': ['Identificación oficial','Carátula de póliza','Nota médica / expediente clínico','Facturas y recetas médicas','Orden de estudios','Formato de reclamación'],
    'DAÑOS': ['Identificación oficial','Carátula de póliza','Averiguación previa / carta de buena conducta','Cotización de reparación','Fotografías del daño','Formato de reclamación'],
    'AUTOS': ['Licencia de conducir','Tarjeta de circulación','Reporte policial / constancia de hechos','Fotografías del vehículo y daños','Carátula de póliza','Formato de reclamación'],
    'INVERSIÓN': ['Identificación oficial','Contrato / solicitud','Estado de cuenta de la póliza','Carta instrucción firmada'],
    'INVERSIÓN ELITE': ['Identificación oficial','Contrato / solicitud','Estado de cuenta de la póliza','Carta instrucción firmada']
};
// Catálogo editable de checklists (GM/admin/desarrollador) — SIN_DOCS son los defaults de fábrica
function sinDocsConfig(){
    if(!db.settings) db.settings={};
    if(!db.settings.siniestrosDocs || typeof db.settings.siniestrosDocs!=='object'){
        db.settings.siniestrosDocs = JSON.parse(JSON.stringify(SIN_DOCS));
    }
    return db.settings.siniestrosDocs;
}
function sinPuedeEditarChecklist(){
    return ['gm','admin','desarrollador'].includes((currentUser.role||'').toLowerCase());
}
function sinDocsDe(ramo){
    const cfg = sinDocsConfig();
    const clave = Object.keys(cfg).find(k=>String(ramo||'').toUpperCase()===k) || String(ramo||'').toUpperCase();
    return cfg[clave] || SIN_DOCS[clave] || SIN_DOCS['DAÑOS'];
}
// Plazos/fechas límite típicas de aviso por ramo (referencia de apoyo, no sustituye a la póliza)
function sinPlazoRamo(ramo){
    const r = String(ramo||'').toUpperCase();
    if(r.includes('GMM')) return 'GMM: aviso de siniestro idealmente en las primeras 24-72 h; gastos mayores suelen exigir aviso previo a hospitalización programada.';
    if(r.includes('AUTOS')) return 'AUTOS: aviso inmediato al ajustador; la póliza suele pedir reporte dentro de las primeras 24 h y deslinde dentro de ~10 días.';
    if(r.includes('VIDA')) return 'VIDA: notificar a la aseguradora tan pronto ocurra el siniestro; el pago procede tras entrega completa de documentos (usualmente 5-30 días).';
    if(r.includes('DAÑOS')) return 'DAÑOS: aviso dentro de las primeras 24-72 h; conservar bienes dañados para inspección del ajustador.';
    if(r.includes('INVERSIÓN')) return 'INVERSIÓN: sin siniestro como tal; para rescates/cancelaciones la carta instrucción tarda ~5-15 días hábiles.';
    return 'Avisa a la aseguradora lo antes posible; la póliza define los plazos exactos de aviso y respuesta.';
}
function sinDiasSinActualizar(s){
    const d = new Date(s.fechaActualizacion || s.fechaReporte);
    if(isNaN(d)) return 0;
    return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}
function sinBadge(estado){
    const colores = { 'Reportado':'bg-amber-100 text-amber-800', 'En revisión':'bg-sky-100 text-sky-800', 'Documentación':'bg-purple-100 text-purple-800', 'Aprobado':'bg-emerald-100 text-emerald-800', 'Pagado':'bg-emerald-600 text-white', 'Cerrado':'bg-slate-200 text-slate-700', 'Solicitada':'bg-amber-100 text-amber-800', 'En proceso':'bg-sky-100 text-sky-800', 'Efectiva':'bg-slate-600 text-white', 'Rechazada':'bg-rose-100 text-rose-700' };
    const c = colores[estado] || 'bg-slate-100 text-slate-700';
    return `<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${c}">${psEscape(estado)}</span>`;
}
function sinProgreso(estado){
    const tipo = (estado && typeof estado==='object') ? estado.tipo : 'siniestro';
    const nombre = (estado && typeof estado==='object') ? estado.estado : estado;
    const etapas = sinEstado(tipo);
    const idx = etapas.indexOf(nombre);
    return etapas.length ? Math.max(0, Math.round((idx+1) / etapas.length * 100)) : 0;
}
// ===== Alcance por rol =====
// GM / desarrollador / admin: ven y modifican TODO. Agencia: solo los expedientes de SUS agentes asignados. Agente: solo lo suyo.
function sinPuedeTodo(){
    return ['gm','desarrollador','admin'].includes((currentUser.role||'').toLowerCase());
}
function sinIdsMiAgencia(){
    const u = currentUser;
    const ids = new Set([String(u.id)]);
    (db.users||[]).forEach(x=>{
        if(String(x.agenciaId)===String(u.id) || String(x.parentId)===String(u.id) || String(x.agencia)===String(u.id)) ids.add(String(x.id));
    });
    return ids;
}
function sinAgenteVisible(agenteId){
    const rol = (currentUser.role||'').toLowerCase();
    if(sinPuedeTodo()) return true;
    if(rol==='agencia') return sinIdsMiAgencia().has(String(agenteId));
    return String(agenteId)===String(currentUser.id);
}
function sinVisible(s){ return sinAgenteVisible(s.agenteId); }
// Clientes que puede seleccionar el usuario al crear un expediente (mismo alcance)
function sinClientesVisibles(){
    const rol = (currentUser.role||'').toLowerCase();
    if(sinPuedeTodo()) return [...db.clientes];
    if(rol==='agencia'){ const ids = sinIdsMiAgencia(); return db.clientes.filter(c=>ids.has(String(c.agenteId))); }
    return db.clientes.filter(c=>String(c.agenteId)===String(currentUser.id));
}
// Estado del checklist marcado por expediente (clave: texto del documento; sobrevive a ediciones del catálogo)
function sinChecksDe(s){ return window['sinChecks_'+s.id] || {}; }

function renderSiniestros(){
    if(!db.clientes) db.clientes = [];
    const casos = sinDB().filter(sinVisible);
    const puedeVerTodos = sinPuedeTodo() || (currentUser.role||'').toLowerCase()==='agencia'; // filtro de agente para roles con vista de equipo
    const esGMRol = (currentUser.role||'').toLowerCase()==='gm';
    const vencidos = casos.filter(s=>!['Cerrado','Pagado','Efectiva','Rechazada'].includes(s.estado) && sinDiasSinActualizar(s)>=21).length;
    const siniestrosActivos = casos.filter(s=>s.tipo==='siniestro' && !['Pagado','Cerrado'].includes(s.estado)).length;
    const cancelEnProceso = casos.filter(s=>s.tipo==='cancelacion' && ['Solicitada','En proceso','Documentación'].includes(s.estado)).length;
    const cerrados = casos.filter(s=>['Cerrado','Pagado','Efectiva','Rechazada'].includes(s.estado)).length;
    
    const fQ = String(window.sinFQ||'').toLowerCase().trim();
    const fRamo = window.sinFRamo || '';
    const fComp = window.sinFComp || '';
    const fEstado = window.sinFEstado || '';
    const fTipo = window.sinFTipo || '';
    const fAgente = window.sinFAgente || '';
    
    let lista = casos.slice();
    if(fQ) lista = lista.filter(s=> String(s.clienteNombre||'').toLowerCase().includes(fQ) || String(s.poliza||'').toLowerCase().includes(fQ) || String(s.numeroReporte||'').toLowerCase().includes(fQ));
    if(fRamo) lista = lista.filter(s=>(s.ramo||'')===fRamo);
    if(fComp) lista = lista.filter(s=>String(s.compania||'').toUpperCase()===String(fComp).toUpperCase());
    if(fEstado) lista = lista.filter(s=>s.estado===fEstado);
    if(fTipo) lista = lista.filter(s=>s.tipo===fTipo);
    if(fAgente && puedeVerTodos) lista = lista.filter(s=>String(s.agenteId)===String(fAgente));
    
    const orden = {'Reportado':0,'Solicitada':0,'En proceso':1,'En revisión':1,'Documentación':2,'Aprobado':3,'Pagado':4,'Efectiva':4,'Cerrado':5,'Rechazada':5};
    lista.sort((a,b)=> (orden[a.estado]!==undefined?orden[a.estado]:3) - (orden[b.estado]!==undefined?orden[b.estado]:3) || new Date(b.fechaReporte) - new Date(a.fechaReporte));
    
    const ramosUnicos = [...new Set(db.clientes.map(c=>c.ramo).filter(Boolean))];
    const agentesUnicos = [...new Map(casos.map(s=>[String(s.agenteId), {id:s.agenteId, nombre:s.agenteNombre}])).values()];
    const estadosTodos = [...sinEstado('siniestro'), ...sinEstado('cancelacion')];
    
    const fila = (s)=>{
        const dias = sinDiasSinActualizar(s);
        const urgente = !['Cerrado','Pagado','Efectiva','Rechazada'].includes(s.estado) && dias>=21;
        return `<tr class="border-t ${urgente?'bg-orange-50/70':''} hover:bg-slate-50">
            <td class="p-3">${s.tipo==='cancelacion'
                ? '<span class="px-2 py-1 rounded text-[11px] font-semibold bg-rose-100 text-rose-700 whitespace-nowrap">Cancelación</span>'
                : '<span class="px-2 py-1 rounded text-[11px] font-semibold bg-indigo-100 text-indigo-700 whitespace-nowrap">Siniestro</span>'}</td>
            <td class="p-3 font-medium">${escapeHTML(s.clienteNombre)}</td>
            <td class="p-3 font-mono text-xs">${escapeHTML(s.poliza)}</td>
            <td class="p-3"><span class="px-2 py-1 bg-slate-100 rounded text-xs">${escapeHTML(s.compania)}</span></td>
            <td class="p-3 text-xs">${escapeHTML(s.ramo)}</td>
            <td class="p-3">${sinBadge(s.estado)}</td>
            <td class="p-3 text-xs ${urgente?'text-orange-600 font-bold':'text-slate-500'}">${dias===0?'Hoy':dias+' d'}${urgente?' <i class="fas fa-triangle-exclamation"></i>':''}</td>
            <td class="p-3 text-xs text-slate-500">${new Date(s.fechaReporte).toLocaleDateString('es-MX')}</td>
            <td class="p-3 text-xs">${escapeHTML(s.agenteNombre)}</td>
            <td class="p-3"><div class="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden" title="${sinProgreso(s)}% del proceso"><div class="h-full rounded-full ${['Cerrado','Pagado','Efectiva'].includes(s.estado)?'bg-emerald-500':'bg-indigo-500'}" style="width:${sinProgreso(s)}%"></div></div></td>
            <td class="p-3"><button data-bx-click="a462" data-p0="${bxE(function(){return s.id})}" class="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-700"><i class="fas fa-folder-open mr-1"></i>Seguimiento</button></td>
        </tr>`;
    };
    
    return `<div class="max-w-7xl mx-auto space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
                <h2 class="text-2xl font-bold text-slate-900">Procesos, Siniestros y Cancelaciones</h2>
                <p class="text-slate-500 text-sm mt-1">${sinPuedeTodo()?'Seguimiento de siniestros y cancelaciones de todos los agentes (ligado a Mis Clientes)':((currentUser.role||'').toLowerCase()==='agencia'?'Siniestros y cancelaciones de tus agentes asignados':'Seguimiento de siniestros y cancelaciones de tus clientes')}</p>
            </div>
            <div class="flex gap-2">
                ${esGMRol?`<button data-bx-click="a463" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-building mr-1"></i> Compañías</button>`:''}
                <button data-bx-click="a464" class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium shadow-sm"><i class="fas fa-file-circle-plus mr-1"></i> Reportar siniestro</button>
                <button data-bx-click="a465" class="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm"><i class="fas fa-file-circle-xmark mr-1"></i> Solicitar cancelación</button>
            </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Siniestros activos</p><p class="text-3xl font-bold text-slate-900 mt-1">${siniestrosActivos}</p><p class="text-xs text-slate-400 mt-1">Reportados, en revisión o por pagar</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Cancelaciones en proceso</p><p class="text-3xl font-bold text-slate-900 mt-1">${cancelEnProceso}</p><p class="text-xs text-slate-400 mt-1">Solicitadas o en trámite con la aseguradora</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Casos cerrados</p><p class="text-3xl font-bold text-slate-900 mt-1">${cerrados}</p><p class="text-xs text-slate-400 mt-1">Pagados, efectivos o rechazados</p></div>
            <div class="rounded-2xl border p-5 ${vencidos>0?'bg-orange-50 border-orange-300':'bg-white border-slate-200'}"><p class="text-xs uppercase font-semibold ${vencidos>0?'text-orange-500':'text-slate-400'}">+21 días sin actualizar</p><p class="text-3xl font-bold mt-1 ${vencidos>0?'text-orange-600':'text-slate-900'}">${vencidos}</p><p class="text-xs ${vencidos>0?'text-orange-500':'text-slate-400'} mt-1">Requieren empujar el trámite hoy</p></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <h3 class="font-semibold text-lg">Expedientes (${lista.length})</h3>
                <div class="flex flex-wrap gap-2">
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input value="${psEscape(window.sinFQ||'')}" data-bx-input="a466" placeholder="Cliente, póliza o No. de reporte..." class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    </div>
                    <select data-bx-change="a467" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los ramos</option>
                        ${ramosUnicos.map(r=>`<option ${fRamo===r?'selected':''}>${escapeHTML(r)}</option>`).join('')}
                    </select>
                    <select data-bx-change="a468" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todas las compañías</option>
                        ${companiasClientes().map(c=>`<option value="${escapeHTML(c)}" ${String(fComp).toUpperCase()===String(c).toUpperCase()?'selected':''}>${escapeHTML(c)}</option>`).join('')}
                    </select>
                    <select data-bx-change="a469" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Siniestros y cancelaciones</option>
                        <option value="siniestro" ${fTipo==='siniestro'?'selected':''}>Solo siniestros</option>
                        <option value="cancelacion" ${fTipo==='cancelacion'?'selected':''}>Solo cancelaciones</option>
                    </select>
                    <select data-bx-change="a470" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los estados</option>
                        ${estadosTodos.map(e=>`<option ${fEstado===e?'selected':''}>${e}</option>`).join('')}
                    </select>
                    ${puedeVerTodos?`<select data-bx-change="a471" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los agentes</option>
                        ${agentesUnicos.map(a=>`<option value="${a.id}" ${String(fAgente)===String(a.id)?'selected':''}>${escapeHTML(a.nombre)}</option>`).join('')}
                    </select>`:''}
                    <button data-bx-click="a472" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-eraser mr-1"></i>Limpiar</button>
                </div>
            </div>
            <div>
                <!-- Vista de tarjetas táctiles para móviles (< md) en Siniestros y Cancelaciones -->
                <div class="md:hidden space-y-3">
                    ${lista.map(s => {
                        const dias = sinDiasSinActualizar(s);
                        const urgente = !['Cerrado','Pagado','Efectiva','Rechazada'].includes(s.estado) && dias>=21;
                        return `<div class="rounded-2xl border ${urgente?'border-orange-300 bg-orange-50/50':'border-slate-200 bg-white'} p-3.5 shadow-xs space-y-2.5">
                            <div class="flex items-start justify-between gap-2">
                                <div class="min-w-0">
                                    <div class="flex items-center gap-1.5 flex-wrap mb-1">
                                        ${s.tipo==='cancelacion'
                                            ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Cancelación</span>'
                                            : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700">Siniestro</span>'}
                                        ${sinBadge(s.estado)}
                                        ${urgente ? `<span class="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px] font-bold"><i class="fas fa-triangle-exclamation mr-0.5"></i>${dias}d</span>` : `<span class="text-[11px] text-slate-400">${dias===0?'Hoy':dias+' d'}</span>`}
                                    </div>
                                    <h4 class="font-bold text-slate-900 text-sm truncate">${escapeHTML(s.clienteNombre)}</h4>
                                    <p class="text-xs text-slate-500 truncate">${escapeHTML(s.compania)} · ${escapeHTML(s.ramo)} · Póliza <span class="font-mono font-semibold text-slate-700">${escapeHTML(s.poliza)}</span></p>
                                </div>
                                <button data-bx-click="a462" data-p0="${bxE(function(){return s.id})}" class="px-3 py-2 bg-slate-900 text-amber-300 rounded-xl text-xs font-semibold shrink-0 flex items-center gap-1"><i class="fas fa-folder-open"></i><span>Abrir</span></button>
                            </div>
                            <div class="flex items-center justify-between gap-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                                <span class="truncate"><i class="fas fa-user-tie mr-1 text-slate-400"></i>${escapeHTML(s.agenteNombre)} · ${new Date(s.fechaReporte).toLocaleDateString('es-MX')}</span>
                                <div class="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0" title="${sinProgreso(s)}% del proceso"><div class="h-full rounded-full ${['Cerrado','Pagado','Efectiva'].includes(s.estado)?'bg-emerald-500':'bg-indigo-500'}" style="width:${sinProgreso(s)}%"></div></div>
                            </div>
                        </div>`;
                    }).join('') || `<div class="p-8 text-center text-slate-500 text-sm">No hay expedientes que coincidan. Reporta un siniestro o solicita una cancelación desde tus clientes.</div>`}
                </div>
                <!-- Tabla para escritorio (md+) -->
                <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-left text-slate-600">
                        <tr>
                            <th class="p-3 font-medium">Tipo</th>
                            <th class="p-3 font-medium">Cliente</th>
                            <th class="p-3 font-medium">Póliza</th>
                            <th class="p-3 font-medium">Compañía</th>
                            <th class="p-3 font-medium">Ramo</th>
                            <th class="p-3 font-medium">Estado</th>
                            <th class="p-3 font-medium">Sin act.</th>
                            <th class="p-3 font-medium">Reporte</th>
                            <th class="p-3 font-medium">Agente</th>
                            <th class="p-3 font-medium">Avance</th>
                            <th class="p-3 font-medium">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lista.map(fila).join('') || `<tr><td colspan="11" class="p-8 text-center text-slate-500">No hay expedientes que coincidan. Reporta un siniestro o solicita una cancelación desde tus clientes.</td></tr>`}
                    </tbody>
                </table>
                </div>
            </div>
        </div>
        ${sinPanelSiniestralidad(casos)}
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h3 class="font-semibold text-lg flex items-center gap-2"><i class="fas fa-clipboard-check text-orange-600"></i> Checklist de documentos por ramo y plazos de la aseguradora</h3>
                ${sinPuedeEditarChecklist()?`<button data-bx-click="a473" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-pen-to-square mr-1"></i> Editar checklists</button>`:''}
            </div>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                ${Object.keys(sinDocsConfig()).map(r=>`
                    <div class="border border-slate-200 rounded-xl p-4">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="w-3 h-3 rounded-full" style="background:${gfColorPara('ramo',r,0)}"></span>
                            <h4 class="font-semibold text-sm">${r}</h4>
                        </div>
                        <ul class="text-xs text-slate-600 space-y-1">${sinDocsDe(r).map(d=>`<li class="flex gap-2"><i class="fas fa-circle-check text-emerald-500 mt-0.5"></i>${d}</li>`).join('')}</ul>
                        <p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-3"><i class="fas fa-clock mr-1"></i>${sinPlazoRamo(r)}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    </div>`;
}

// ===== Siniestralidad: % de expedientes sobre la cartera de Mis Clientes =====
function sinPanelSiniestralidad(casos){
    const totalClientes = db.clientes.length;
    const porCompania = companiasClientes().map((c,i)=>{
        const cli = db.clientes.filter(x=>String(x.compania||'').toUpperCase()===String(c).toUpperCase()).length;
        const sin = casos.filter(s=>String(s.compania||'').toUpperCase()===String(c).toUpperCase()).length;
        return { nombre:c, cli, sin, pct: cli>0 ? (sin/cli*100) : 0, color: gfColorPara('compania', c, i) };
    });
    const ramosVisibles = [...new Set([...db.clientes.map(x=>x.ramo).filter(Boolean), ...casos.map(s=>s.ramo).filter(Boolean)])];
    const porRamo = ramosVisibles.map((r,i)=>{
        const cli = db.clientes.filter(x=>(x.ramo||'')===r).length;
        const sin = casos.filter(s=>(s.ramo||'')===r).length;
        return { nombre:r, cli, sin, pct: cli>0 ? (sin/cli*100) : 0, color: gfColorPara('ramo', r, i) };
    });
    const barras = (arr)=>arr.slice().sort((a,b)=>b.pct-a.pct).map(x=>`
        <div class="mb-3">
            <div class="flex items-center justify-between text-xs mb-1">
                <span class="font-semibold text-slate-700 flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full inline-block" style="background:${x.color}"></span>${escapeHTML(x.nombre||'Sin especificar')}</span>
                <span class="text-slate-500">${x.sin} caso${x.sin===1?'':'s'} / ${x.cli} cliente${x.cli===1?'':'s'} · <b class="text-slate-800">${x.pct.toFixed(1)}%</b></span>
            </div>
            <div class="h-2.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${Math.min(100,x.pct).toFixed(1)}%;background:${x.color}"></div></div>
        </div>`).join('') || '<p class="text-sm text-slate-400">Sin datos todavía.</p>';
    const general = totalClientes>0 ? (casos.length/totalClientes*100) : 0;
    const topComp = porCompania.slice().sort((a,b)=>b.sin-a.sin)[0];
    const topRamo = porRamo.slice().sort((a,b)=>b.sin-a.sin)[0];
    return `
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h3 class="font-semibold text-lg flex items-center gap-2"><i class="fas fa-chart-column text-orange-600"></i> Siniestralidad</h3>
                <p class="text-xs text-slate-400">Casos sobre la cartera de Mis Clientes (${casos.length} expedientes / ${totalClientes} clientes = <b class="text-slate-700">${general.toFixed(1)}%</b>)</p>
            </div>
            <div class="grid lg:grid-cols-2 gap-6">
                <div>
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Por compañía ${topComp&&topComp.sin>0?`<span class="ml-1 text-[11px] font-normal text-orange-600"><i class="fas fa-arrow-trend-up mr-1"></i>más siniestros: ${escapeHTML(topComp.nombre)}</span>`:''}</h4>
                    ${barras(porCompania)}
                </div>
                <div>
                    <h4 class="text-sm font-semibold text-slate-700 mb-3">Por ramo ${topRamo&&topRamo.sin>0?`<span class="ml-1 text-[11px] font-normal text-orange-600"><i class="fas fa-arrow-trend-up mr-1"></i>más golpeado: ${escapeHTML(topRamo.nombre)}</span>`:''}</h4>
                    ${barras(porRamo)}
                </div>
            </div>
            <p class="text-[11px] text-slate-400 mt-3"><i class="fas fa-circle-info mr-1"></i>El porcentaje compara los expedientes (siniestros + cancelaciones) contra el total de clientes de esa compañía o ramo en Mis Clientes. Permite detectar qué aseguradora o producto está generando más incidencias.</p>
        </div>`;
}

// ===== Nuevo expediente: seleccionar cliente de Mis Clientes =====
function sinNuevo(tipo){
    tipo = tipo==='cancelacion' ? 'cancelacion' : 'siniestro';
    const clientes = sinClientesVisibles();
    if(!clientes.length){ showToast('Primero registra un cliente en Mis Clientes','warning'); return; }
    showModal(`
        <form id="sin-form" class="p-6">
            <h3 class="text-xl font-bold mb-1">${tipo==='cancelacion'?'Solicitar cancelación':'Reportar siniestro'}</h3>
            <p class="text-xs text-slate-500 mb-4">Selecciona el cliente de Mis Clientes; ramo, compañía, póliza y agente se llenan solos.</p>
            <div class="space-y-4">
                <div>
                    <label class="text-sm font-medium text-slate-700 mb-1 block">Cliente con siniestro/cancelación *</label>
                    <input id="sin-busca" data-bx-input="a474" placeholder="Buscar por nombre o póliza..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900 mb-2">
                    <select id="sin-cliente" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Seleccionar cliente...</option>
                        ${clientes.map(c=>`<option value="${c.id}" data-ramo="${psEscape(c.ramo||'')}" data-compania="${psEscape(c.compania||'')}" data-poliza="${psEscape(c.poliza||'')}" data-agente="${psEscape(c.agenteNombre||'')}" data-agente-id="${psEscape(c.agenteId)}" data-whats="${psEscape(c.whatsapp||'')}">${psEscape(c.nombre)} — ${psEscape(c.compania||'')} / ${psEscape(c.poliza||'')} / ${psEscape(c.ramo||'')}</option>`).join('')}
                    </select>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-sm font-medium text-slate-700 mb-1 block">Fecha del evento *</label>
                        <input type="date" id="sin-fecha" required value="${new Date().toISOString().slice(0,10)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    </div>
                    <div>
                        <label class="text-sm font-medium text-slate-700 mb-1 block">${tipo==='cancelacion'?'Fecha solicitada':'No. de reporte / siniestro'}</label>
                        ${tipo==='cancelacion'
                            ? '<input type="date" id="sin-num-rep" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">'
                            : '<input type="text" id="sin-num-rep" placeholder="Ej. AAA-123456" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">'}
                    </div>
                </div>
                ${tipo==='cancelacion'?`
                <div>
                    <label class="text-sm font-medium text-slate-700 mb-1 block">Motivo de cancelación</label>
                    <select id="sin-motivo" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Seleccionar...</option>
                        <option>Precio / prima alta</option><option>Cambio de aseguradora</option><option>Venta de vehículo / bien</option>
                        <option>Insatisfacción con el servicio</option><option>Siniestro</option><option>Situación económica</option>
                        <option>Duplicidad de póliza</option><option>Otro</option>
                    </select>
                </div>`:''}
                <div>
                    <label class="text-sm font-medium text-slate-700 mb-1 block">Descripción del caso</label>
                    <textarea id="sin-desc" rows="3" placeholder="Qué ocurrió, cómo contactar al cliente, ajustador asignado..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea>
                </div>
                <div class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2"><i class="fas fa-lightbulb mr-1"></i><b>Apoyo:</b> ${sinPlazoRamo('')} Al guardar, revisa el checklist de documentos del ramo en esta sección.</div>
            </div>
            <div class="flex justify-end gap-3 mt-6">
                <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-lg border">Cancelar</button>
                <button type="submit" class="px-5 py-2 rounded-lg ${tipo==='cancelacion'?'bg-rose-600 hover:bg-rose-700':'bg-orange-600 hover:bg-orange-700'} text-white font-semibold"><i class="fas fa-save mr-1"></i> Guardar expediente</button>
            </div>
        </form>`);
    setTimeout(()=>{
        const form = document.getElementById('sin-form');
        if(form) form.onsubmit = (e)=>{ e.preventDefault(); sinGuardar(tipo); };
    },0);
}
function sinFiltrarClientes(){
    const q = String((document.getElementById('sin-busca')||{}).value||'').toLowerCase().trim();
    const sel = document.getElementById('sin-cliente');
    if(!sel) return;
    const opts = [...sel.options].filter(o=>o.value!=='');
    opts.forEach(o=>{ o.hidden = q ? !o.textContent.toLowerCase().includes(q) : false; });
    const vis = opts.filter(o=>!o.hidden);
    if(vis.length===1) sel.value = vis[0].value;
}
function sinGuardar(tipo){
    const sel = document.getElementById('sin-cliente');
    const cli = db.clientes.find(c=>String(c.id)===String(sel.value));
    if(!cli){ showToast('Selecciona un cliente de la lista','warning'); return; }
    const opt = sel.selectedOptions[0];
    const fecha = document.getElementById('sin-fecha').value;
    const numRep = (document.getElementById('sin-num-rep')||{}).value || '';
    const motivo = tipo==='cancelacion' ? ((document.getElementById('sin-motivo')||{}).value || '') : '';
    const desc = (document.getElementById('sin-desc')||{}).value || '';
    const nuevo = {
        id: Date.now(),
        tipo,
        clienteId: cli.id,
        clienteNombre: cli.nombre,
        compania: opt.dataset.compania || cli.compania || '',
        poliza: opt.dataset.poliza || cli.poliza || '',
        ramo: opt.dataset.ramo || cli.ramo || '',
        agenteId: opt.dataset.agenteId || cli.agenteId,
        agenteNombre: opt.dataset.agente || cli.agenteNombre || '',
        whatsapp: opt.dataset.whats || cli.whatsapp || '',
        numeroReporte: tipo==='siniestro' ? numRep : '',
        fechaSolicitada: tipo==='cancelacion' && numRep ? new Date(numRep+'T00:00:00').toISOString() : '',
        motivoCancelacion: motivo,
        fechaReporte: fecha ? new Date(fecha+'T00:00:00').toISOString() : new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
        estado: tipo==='cancelacion' ? 'Solicitada' : 'Reportado',
        descripcion: desc,
        notas: [{ ts: new Date().toISOString(), autor: currentUser.name, texto: tipo==='cancelacion' ? ('Expediente de cancelación creado'+(motivo?'. Motivo: '+motivo:'.')+' Estado inicial: Solicitada.') : 'Expediente de siniestro creado. Estado inicial: Reportado.' }]
    };
    sinDB().unshift(nuevo);
    cmLog('Siniestros y Cancelaciones', tipo==='cancelacion'?'Nueva cancelación':'Nuevo siniestro', nuevo.clienteNombre+' ('+nuevo.compania+' / '+nuevo.poliza+')');
    notificarNuevoTramite(tipo, (tipo==='cancelacion'?'⚠️ Nueva cancelación registrada: ':'⚠️ Nuevo siniestro registrado: ')+nuevo.clienteNombre+' ('+nuevo.compania+' / '+(nuevo.poliza||'s/n')+')');
    try{ window.sinSnapPrev = JSON.stringify(sinDB().map(x=>({id:x.id, e:x.estado}))); }catch(e){}
    updateBadgeTramites();
    saveDB();
    closeModal();
    showToast(tipo==='cancelacion'?'Cancelación registrada':'Siniestro registrado','success');
    render();
}

// ===== Detalle / seguimiento del expediente =====
function sinDetalle(id){
    const s = sinDB().find(x=>x.id===id);
    if(!s) return;
    if(!sinAgenteVisible(s.agenteId)){ showToast('No tienes acceso a este expediente','warning'); return; }
    const etapas = sinEstado(s.tipo);
    const idx = etapas.indexOf(s.estado);
    const docs = sinDocsDe(s.ramo);
    const checks = sinChecksDe(s);
    const cliente = db.clientes.find(c=>String(c.id)===String(s.clienteId));
    const cerrado = ['Cerrado','Efectiva','Rechazada'].includes(s.estado);
    const editarHabilitado = sinAgenteVisible(s.agenteId); // GM/desarrollador/admin: todos; agencia: sus agentes; agente: lo suyo
    showModal(`
        <div class="p-6">
            <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${s.tipo==='cancelacion'?'bg-rose-100 text-rose-700':'bg-indigo-100 text-indigo-700'}">${s.tipo==='cancelacion'?'Cancelación':'Siniestro'}</span>
                        ${sinBadge(s.estado)}
                    </div>
                    <h3 class="text-xl font-bold">${escapeHTML(s.clienteNombre)}</h3>
                    <p class="text-xs text-slate-500">${escapeHTML(s.compania)} · Póliza <span class="font-mono">${escapeHTML(s.poliza)}</span> · ${escapeHTML(s.ramo)} · Agente: ${escapeHTML(s.agenteNombre)}</p>
                    ${s.numeroReporte?`<p class="text-xs text-slate-500 mt-0.5"><i class="fas fa-hashtag mr-1"></i>No. de reporte: <b>${escapeHTML(s.numeroReporte)}</b></p>`:''}
                    ${s.fechaSolicitada?`<p class="text-xs text-slate-500 mt-0.5"><i class="fas fa-calendar mr-1"></i>Fecha solicitada: ${new Date(s.fechaSolicitada).toLocaleDateString('es-MX')}</p>`:''}
                    ${s.motivoCancelacion?`<p class="text-xs text-slate-500 mt-0.5"><i class="fas fa-circle-question mr-1"></i>Motivo: ${escapeHTML(s.motivoCancelacion)}</p>`:''}
                    ${cliente&&cliente.whatsapp?`<p class="text-xs text-slate-500 mt-0.5"><i class="fab fa-whatsapp text-emerald-600 mr-1"></i>${escapeHTML(cliente.whatsapp)}</p>`:''}
                </div>
                <button data-bx-click="a1" class="text-slate-400 hover:text-slate-600" title="Cerrar"><i class="fas fa-times text-lg"></i></button>
            </div>
            ${s.descripcion?`<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 mb-4"><b>Descripción:</b> ${escapeHTML(s.descripcion)}</div>`:''}
            ${!cerrado && editarHabilitado ? `
            <div class="grid md:grid-cols-3 gap-3 mb-4">
                <div>
                    <label class="text-xs font-medium text-slate-600 mb-1 block">Cambiar estado</label>
                    <select id="sin-nuevo-estado" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        ${etapas.map(e=>`<option ${e===s.estado?'selected':''}>${e}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label class="text-xs font-medium text-slate-600 mb-1 block">${s.tipo==='siniestro'?'Fecha de pago (si aplica)':'Fecha efectiva (si aplica)'}</label>
                    <input type="date" id="sin-fecha-cierre" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                </div>
                <div class="flex items-end">
                    <button data-bx-click="a475" data-p0="${bxE(function(){return s.id})}" class="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-rotate mr-1"></i> Actualizar</button>
                </div>
            </div>`:''}
            <div class="mb-4">
                <h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Progreso</h4>
                <div class="flex items-center gap-1">
                    ${etapas.map((e,i)=>`
                        <div class="flex-1">
                            <div class="h-1.5 rounded-full ${i<=idx?'bg-indigo-500':'bg-slate-200'}"></div>
                            <p class="text-[9px] mt-1 text-center ${i===idx?'font-bold text-indigo-600':'text-slate-400'}">${e}</p>
                        </div>`).join('')}
                </div>
            </div>
            <div class="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-semibold uppercase text-slate-400">Checklist de documentos (${docs.length})</h4>
                        ${sinPuedeEditarChecklist()?`<button data-bx-click="a473" class="text-[11px] text-indigo-600 hover:underline font-medium"><i class="fas fa-pen-to-square mr-1"></i>Editar</button>`:''}
                    </div>
                    <div class="border border-slate-200 rounded-lg divide-y">
                        ${docs.map((d,i)=>`
                            <label class="flex items-center gap-2 p-2 text-xs cursor-pointer hover:bg-slate-50">
                                <input type="checkbox" data-doc="${psEscape(d)}" ${checks[d]?'checked':''} data-bx-change="a476" data-p0="${bxE(function(){return s.id})}" class="w-4 h-4 text-emerald-600 rounded">
                                <span class="${checks[d]?'line-through text-slate-400':''}">${d}</span>
                            </label>`).join('')}
                    </div>
                    <p class="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mt-2"><i class="fas fa-clock mr-1"></i>${sinPlazoRamo(s.ramo)}</p>
                </div>
                <div>
                    <h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Historial de notas (${(s.notas||[]).length})</h4>
                    <div class="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 mb-2">
                        ${(s.notas||[]).slice().reverse().map(n=>`
                            <div class="text-xs border-l-2 border-indigo-200 pl-2">
                                <p class="text-slate-500">${new Date(n.ts).toLocaleString('es-MX')} · ${escapeHTML(n.autor)}</p>
                                <p class="text-slate-700">${escapeHTML(n.texto)}</p>
                            </div>`).join('') || '<p class="text-xs text-slate-400">Sin notas.</p>'}
                    </div>
                    ${editarHabilitado?`
                    <textarea id="sin-nueva-nota" rows="2" placeholder="Agregar nota de seguimiento..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea>
                    <button data-bx-click="a477" data-p0="${bxE(function(){return s.id})}" class="mt-2 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"><i class="fas fa-comment-medical mr-1"></i> Agregar nota</button>`:''}
                </div>
            </div>
            <div class="border border-indigo-100 bg-indigo-50/40 rounded-xl p-4 mb-4">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <h4 class="text-xs font-semibold uppercase text-indigo-500"><i class="fas fa-comments mr-1"></i> Chat de seguimiento con el agente (${(s.chat||[]).length})</h4>
                    <button data-bx-click="a478" data-p0="${bxE(function(){return s.id})}" class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"><i class="fas fa-up-right-from-square mr-1"></i> Abrir chat</button>
                </div>
                <div class="space-y-1.5 max-h-24 overflow-y-auto">
                    ${(s.chat||[]).slice(-2).map(m=>`<p class="text-xs text-slate-600"><b>${psEscape(m.de)}:</b> ${psEscape(m.texto)} <span class="text-slate-400">· ${new Date(m.ts).toLocaleString('es-MX')}</span></p>`).join('') || '<p class="text-xs text-slate-400">Sin mensajes todavía. Abre el chat para escribirle al agente sobre este caso.</p>'}
                </div>
            </div>
            <div class="flex items-center justify-between gap-2 flex-wrap">
                <div class="text-[11px] text-slate-500">Última actualización: ${new Date(s.fechaActualizacion||s.fechaReporte).toLocaleString('es-MX')} · ${sinDiasSinActualizar(s)} día(s) sin movimiento</div>
                ${cliente?`<div class="flex gap-2">
                    <button data-bx-click="a479" class="text-xs px-3 py-1.5 border border-slate-300 rounded-lg hover:bg-slate-50"><i class="fas fa-address-book mr-1"></i>Ver cliente</button>
                    <button data-bx-click="a480" data-p0="${bxE(function(){return s.id})}" class="text-xs px-3 py-1.5 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50" title="Eliminar expediente (GM/admin)"><i class="fas fa-trash mr-1"></i>Eliminar</button>
                </div>`:`<button data-bx-click="a480" data-p0="${bxE(function(){return s.id})}" class="text-xs px-3 py-1.5 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50" title="Eliminar expediente (GM/admin)"><i class="fas fa-trash mr-1"></i>Eliminar</button>`}
            </div>
        </div>`);
}
function sinToggleDoc(el, id){
    const doc = el.getAttribute('data-doc');
    const key = 'sinChecks_'+id;
    const checks = window[key] || {};
    if(el.checked) checks[doc] = true; else delete checks[doc];
    window[key] = checks;
    const span = el.parentElement ? el.parentElement.querySelector('span') : null;
    if(span) span.className = el.checked ? 'line-through text-slate-400' : '';
}
// ===== Chat interno de seguimiento (GM/desarrollador/admin/agencia ↔ agente del caso) =====
function sinChat(id){
    const s = sinDB().find(x=>x.id===id);
    if(!s) return;
    if(!sinAgenteVisible(s.agenteId)){ showToast('No tienes acceso a este expediente','warning'); return; }
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div>
                <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-comments text-indigo-600"></i> Chat de seguimiento</h3>
                <p class="text-xs text-slate-500">${psEscape(s.clienteNombre)} · ${psEscape(s.compania)} / ${psEscape(s.poliza)} · Agente: <b>${psEscape(s.agenteNombre)}</b></p>
            </div>
            <button data-bx-click="a1" class="text-slate-400 hover:text-slate-600" title="Cerrar"><i class="fas fa-times text-lg"></i></button>
        </div>
        <div id="sin-chat-msgs" class="border border-slate-200 rounded-xl p-3 h-64 overflow-y-auto space-y-2 bg-slate-50 mb-3">
            ${(s.chat||[]).map(m=>`
                <div class="flex ${String(m.deId)===String(currentUser.id)?'justify-end':''}">
                    <div class="max-w-[80%] rounded-xl px-3 py-2 text-xs ${String(m.deId)===String(currentUser.id)?'bg-indigo-600 text-white':'bg-white border border-slate-200 text-slate-700'}">
                        <p class="font-semibold ${String(m.deId)===String(currentUser.id)?'text-indigo-100':'text-slate-500'}">${psEscape(m.de)} · ${new Date(m.ts).toLocaleString('es-MX')}</p>
                        <p class="whitespace-pre-wrap">${psEscape(m.texto)}</p>
                    </div>
                </div>`).join('') || '<p class="text-xs text-slate-400 text-center py-10">Sin mensajes todavía.</p>'}
        </div>
        <textarea id="sin-chat-input" rows="3" placeholder="Escribe al agente sobre este caso (documentos pendientes, fechas límite, indicaciones del ajustador...)..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea>
        <div class="flex justify-between items-center gap-3 mt-2">
            <p class="text-[11px] text-slate-400">El historial queda guardado en el expediente; el agente lo ve en el detalle del caso.</p>
            <button data-bx-click="a481" data-p0="${bxE(function(){return s.id})}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium whitespace-nowrap"><i class="fas fa-paper-plane mr-1"></i> Enviar</button>
        </div>
    </div>`);
    setTimeout(()=>{ const box=document.getElementById('sin-chat-msgs'); if(box) box.scrollTop=box.scrollHeight; const ta=document.getElementById('sin-chat-input'); if(ta) ta.focus(); },0);
}
function sinEnviarChat(id){
    const s = sinDB().find(x=>x.id===id);
    if(!s) return;
    if(!sinAgenteVisible(s.agenteId)){ showToast('No tienes acceso a este expediente','warning'); return; }
    const ta = document.getElementById('sin-chat-input');
    const texto = ((ta||{}).value||'').trim();
    if(!texto){ showToast('Escribe el mensaje antes de enviar','warning'); return; }
    s.chat = s.chat||[];
    s.chat.push({ ts: new Date().toISOString(), deId: currentUser.id, de: currentUser.name, deRol: (currentUser.role||''), texto });
    s.fechaActualizacion = new Date().toISOString();
    cmLog('Siniestros y Cancelaciones','Mensaje de seguimiento', s.clienteNombre+': '+texto.slice(0,80));
    saveDB();
    showToast('Mensaje enviado','success');
    sinChat(id);
    render();
}
// ===== Editor del catálogo de checklists por ramo (GM / admin / desarrollador) =====
function sinEditarChecklist(){
    if(!sinPuedeEditarChecklist()){ showToast('Solo GM, admin o desarrollador pueden editar los checklists','warning'); return; }
    const cfg = sinDocsConfig();
    showModal(`<div class="p-6 max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div>
                <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-clipboard-list text-indigo-600"></i> Editar checklists por ramo</h3>
                <p class="text-xs text-slate-500">Un documento por línea. Los cambios se aplican a los expedientes de ese ramo.</p>
            </div>
            <button data-bx-click="a1" class="text-slate-400 hover:text-slate-600" title="Cerrar"><i class="fas fa-times text-lg"></i></button>
        </div>
        <div class="space-y-3">
            ${Object.keys(cfg).map(r=>`
                <div>
                    <label class="text-xs font-semibold text-slate-600 mb-1 block">${r}</label>
                    <textarea data-sin-ramo="${psEscape(r)}" rows="4" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900">${psEscape((cfg[r]||[]).join('\n'))}</textarea>
                </div>`).join('')}
        </div>
        <div class="flex justify-end gap-2 mt-4">
            <button data-bx-click="a1" class="px-4 py-2 border border-slate-300 rounded-lg">Cancelar</button>
            <button data-bx-click="a482" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"><i class="fas fa-save mr-1"></i> Guardar checklists</button>
        </div>
    </div>`);
}
function sinGuardarChecklist(){
    if(!sinPuedeEditarChecklist()){ showToast('Solo GM, admin o desarrollador pueden editar los checklists','warning'); return; }
    const cfg = sinDocsConfig();
    let n=0;
    document.querySelectorAll('textarea[data-sin-ramo]').forEach(ta=>{
        const r = ta.getAttribute('data-sin-ramo');
        const items = String(ta.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean);
        cfg[r] = items; n += items.length;
    });
    cmLog('Siniestros y Cancelaciones','Editar checklists', Object.keys(cfg).length+' ramos, '+n+' documentos');
    saveDB();
    closeModal();
    showToast('Checklists actualizados','success');
    render();
}
function sinCambiarEstado(id){
    const s = sinDB().find(x=>x.id===id);
    if(!s) return;
    if(!sinAgenteVisible(s.agenteId)){ showToast('No tienes acceso a este expediente','warning'); return; }
    const nuevo = (document.getElementById('sin-nuevo-estado')||{}).value;
    const fechaCierre = (document.getElementById('sin-fecha-cierre')||{}).value;
    if(!nuevo) return;
    const anterior = s.estado;
    s.estado = nuevo;
    s.fechaActualizacion = new Date().toISOString();
    if(fechaCierre){
        if(s.tipo==='siniestro') s.fechaPago = new Date(fechaCierre+'T00:00:00').toISOString();
        else s.fechaEfectiva = new Date(fechaCierre+'T00:00:00').toISOString();
    }
    s.notas = s.notas||[];
    s.notas.push({ ts: new Date().toISOString(), autor: currentUser.name, texto: 'Estado: '+anterior+' → '+nuevo+(fechaCierre?(' (fecha registrada: '+fechaCierre+')'):'')+'.' });
    cmLog('Siniestros y Cancelaciones','Cambio de estado', s.clienteNombre+': '+anterior+' → '+nuevo);
    saveDB();
    showToast('Estado actualizado: '+nuevo,'success');
    sinDetalle(id);
    render();
}
function sinAgregarNota(id){
    const s = sinDB().find(x=>x.id===id);
    if(!s) return;
    if(!sinAgenteVisible(s.agenteId)){ showToast('No tienes acceso a este expediente','warning'); return; }
    const ta = document.getElementById('sin-nueva-nota');
    const texto = ((ta||{}).value||'').trim();
    if(!texto){ showToast('Escribe la nota antes de guardar','warning'); return; }
    s.notas = s.notas||[];
    s.notas.push({ ts: new Date().toISOString(), autor: currentUser.name, texto });
    s.fechaActualizacion = new Date().toISOString();
    cmLog('Siniestros y Cancelaciones','Nota', s.clienteNombre+': '+texto.slice(0,80));
    saveDB();
    showToast('Nota agregada','success');
    sinDetalle(id);
    render();
}
// Abrir el formulario desde un cliente específico de Mis Clientes
function sinDesdeCliente(clienteId, tipo){
    const t = tipo==='cancelacion' ? 'cancelacion' : 'siniestro';
    sinNuevo(t);
    setTimeout(()=>{ const sel = document.getElementById('sin-cliente'); if(sel) sel.value = String(clienteId); },60);
}
function sinEliminar(id){
    const rol = (currentUser.role||'').toLowerCase();
    if(rol!=='gm' && rol!=='admin'){ showToast('Solo GM/admin puede eliminar expedientes','warning'); return; }
    if(!confirm('¿Eliminar este expediente de la sección Siniestros y Cancelaciones? (el cliente NO se borra)')) return;
    const s = sinDB().find(x=>x.id===id);
    db.siniestros = sinDB().filter(x=>x.id!==id);
    cmLog('Siniestros y Cancelaciones','Eliminar expediente', s?(s.clienteNombre+' ('+s.poliza+')'):'');
    saveDB();
    closeModal();
    showToast('Expediente eliminado','success');
    render();
}
/* ==================== AGENCIA AUTOMOTRIZ VIRTUAL (hub auto-cartera) ==================== */
const AU_ENTIDADES = ['Aguascalientes','Baja California','Baja California Sur','Campeche','Chiapas','Chihuahua','Ciudad de M\u00e9xico','Coahuila','Colima','Durango','Estado de M\u00e9xico','Guanajuato','Guerrero','Hidalgo','Jalisco','Michoac\u00e1n','Morelos','Nayarit','Nuevo Le\u00f3n','Oaxaca','Puebla','Quer\u00e9taro','Quintana Roo','San Luis Potos\u00ed','Sinaloa','Sonora','Tabasco','Tamaulipas','Tlaxcala','Veracruz','Yucat\u00e1n','Zacatecas'];
const AU_TABS = [
    ['unidades','Inventario','fa-warehouse'],
    ['clientes','Clientes','fa-address-book'],
    ['equipo','Mi Equipo','fa-people-group'],
    ['monitoreo','Monitoreo','fa-chart-line'],
    ['metas','Mis Metas','fa-bullseye'],
    ['simulador','Simulador de ingresos','fa-calculator'],
    ['guion','Guion de llamadas','fa-phone-volume'],
    ['pauta','Publicidad','fa-bullhorn'],
    ['practica','Practica tus sesiones','fa-chalkboard-user']
];
function auTab(){ return ['unidades','clientes','equipo','monitoreo','metas','simulador','guion','pauta','practica'].includes(window.auTabId||'') ? window.auTabId : 'unidades'; }
function auSetTab(t){ window.auTabId=t; navigateTo('auto-'+t); }
function renderAutoAgencia(){
    const tabsHtml = AU_TABS.map(t=>`<button data-bx-click="a483" data-p0="${bxE(function(){return t[0]})}" class="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${auTab()===t[0]?'bg-slate-900 text-white':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}"><i class="fas ${t[2]} mr-1"></i>${t[1]}</button>`).join('');
    const abierto = localStorage.getItem('auTabsOpen')!=='0';
    return auHeaderHtml('Agencia Automotriz', 'Agencia virtual: inventario en venta, clientes, equipo, monitoreo, metas y herramientas comerciales enfocadas en la venta de autos.', true)
        + `<div class="flex items-center gap-2">
            <button data-bx-click="a484" class="text-xs text-indigo-600 font-medium hover:underline">${abierto?'Ocultar m\u00f3dulos':'Ver m\u00f3dulos'}</button>
        </div>
        <div id="au-tabs-wrap" class="flex gap-2 overflow-x-auto pb-1 ${abierto?'':'hidden'}">${tabsHtml}</div>
        <div>${auTabHtml(auTab())}</div>`;
}
function auHeaderHtml(titulo, subtitulo, conBtnInventario, conKPIs){
    return `<div class="max-w-7xl mx-auto space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
                <h2 class="text-2xl font-bold text-slate-900"><i class="fas fa-car-side text-indigo-600 mr-2"></i>${titulo}</h2>
                <p class="text-slate-500 text-sm mt-1">${subtitulo}</p>
            </div>
            ${conBtnInventario?`<button data-bx-click="a485" class="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium shadow-sm"><i class="fas fa-plus mr-1"></i> Cargar unidad</button>`:''}
        </div>
        ${conKPIs!==false?auContadoresHtml():''}
    </div>`;
}
function auContadoresHtml(){
    const d = auD();
    const activas = d.unidades.filter(u=>!u.estado||u.estado==='Disponible').length;
    const reservadas = d.unidades.filter(u=>u.estado==='Reservada').length;
    const vendidas = d.unidades.filter(u=>u.estado==='Vendida').length;
    const valorInv = d.unidades.filter(u=>!u.estado||u.estado==='Disponible').reduce((s,u)=>s+(Number(u.precio)||0),0);
    const mesActual = new Date().toISOString().slice(0,7);
    const ventasMes = (d.ventas||[]).filter(v=>(v.fecha||'').slice(0,7)===mesActual);
    const montoMes = ventasMes.reduce((s,v)=>s+(Number(v.precio)||0),0);
    const total = activas+reservadas+vendidas;
    const rot = total>0 ? Math.round(vendidas/total*100) : 0;
    return `<div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Disponibles</p><p class="text-3xl font-bold text-slate-900 mt-1">${activas}</p><p class="text-xs text-slate-400 mt-1">Unidades en piso</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Reservadas</p><p class="text-3xl font-bold text-slate-900 mt-1">${reservadas}</p><p class="text-xs text-slate-400 mt-1">Con cliente en proceso</p></div>
            <div class="bg-emerald-50 rounded-2xl border border-emerald-200 p-5"><p class="text-xs uppercase font-semibold text-emerald-500">Vendidas</p><p class="text-3xl font-bold text-emerald-700 mt-1">${vendidas}</p><p class="text-xs text-emerald-600/70 mt-1">Hist\u00f3rico del inventario</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Ventas del mes</p><p class="text-3xl font-bold text-slate-900 mt-1">$${Math.round(montoMes).toLocaleString('es-MX')}</p><p class="text-xs text-slate-400 mt-1">${ventasMes.length} operaci\u00f3n(es)</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Rotaci\u00f3n</p><p class="text-3xl font-bold text-slate-900 mt-1">${rot}%</p><p class="text-xs text-slate-400 mt-1">Vendidas \u00f7 inventario total</p></div>
        </div>
        <p class="text-xs text-slate-400 -mt-2">Valor de inventario disponible: <b class="text-slate-600">$${Math.round(valorInv).toLocaleString('es-MX')}</b></p>`;
}
const AU_PAGINAS = {
    unidades:  { titulo:'Inventario de Autos',   sub:'Unidades del piso en venta: carga, reserva y vende con seguimiento de estado.', btn:true,  kpis:true },
    clientes:  { titulo:'Clientes de Auto',      sub:'Compradores de la agencia automotriz: etapas de venta, seguimientos y venta cruzada de seguros.', btn:false, kpis:true },
    equipo:    { titulo:'Equipo de Ventas',      sub:'Agentes del piso automotriz: produccion, unidades cargadas y avance contra meta.', btn:false, kpis:false },
    monitoreo: { titulo:'Monitoreo de Autos',    sub:'Rendimiento de la agencia: ventas del mes, ticket promedio, marcas y estado del inventario.', btn:false, kpis:false },
    metas:     { titulo:'Metas Automotrices',    sub:'Meta mensual en pesos de unidades vendidas por agente, con avance en vivo.', btn:false, kpis:false },
    simulador: { titulo:'Simulador Automotriz',  sub:'Calcula tu ingreso por unidad (comision + financiamiento + bonos) y cuantas unidades vender para tu meta.', btn:false, kpis:false },
    guion:     { titulo:'Guion de Ventas',       sub:'Guion de llamadas del piso: apertura, descubrimiento, prueba de manejo, credito y cierre.', btn:false, kpis:false },
    pauta:     { titulo:'Publicidad Autos',      sub:'Piezas listas para WhatsApp y redes: promociones, enganches y stock destacado.', btn:false, kpis:false },
    practica:  { titulo:'Practica de Venta',     sub:'Entrenador con comprador virtual: objeciones reales de piso, calificacion y tips.', btn:false, kpis:false }
};
function auPagina(t){
    const p = AU_PAGINAS[t] || AU_PAGINAS.unidades;
    return auHeaderHtml(p.titulo, p.sub, p.btn, p.kpis) + '<div>' + auTabHtml(t) + '</div>';
}
function auTabHtml(tab){
    if(tab==='clientes') return auClientesHtml();
    if(tab==='equipo') return auEquipoHtml();
    if(tab==='monitoreo') return auMonitoreoHtml();
    if(tab==='metas') return auMetasHtml();
    if(tab==='simulador') return auSimHtml();
    if(tab==='guion') return auGuionHtml();
    if(tab==='pauta') return auPautaHtml();
    if(tab==='practica') return auPracticaHtml();
    return auInventarioHtml();
}
function auInventarioHtml(){
    const d = auD();
    const fQ = String(window.auInvQ||'').toLowerCase().trim();
    const fEst = window.auInvEst||'';
    const fMarca = window.auInvMarca||'';
    const fOrig = window.auInvOrig||'';
    const fEnt = window.auInvEnt||'';
    const fSuc = window.auInvSuc||'';
    const fTrans = window.auInvTrans||'';
    const orden = window.auInvOrden||'recientes';
    let lista = d.unidades.slice();
    if(fQ) lista = lista.filter(u=>[u.marca,u.modelo,u.vin,u.descripcion,u.color,u.anio].some(x=>String(x||'').toLowerCase().includes(fQ)));
    if(fEst) lista = lista.filter(u=>(u.estado||'Disponible')===fEst);
    if(fMarca) lista = lista.filter(u=>(u.marca||'')===fMarca);
    if(fOrig) lista = lista.filter(u=>(u.origen||'Mexicano')===fOrig);
    if(fEnt) lista = lista.filter(u=>(u.entidad||'')===fEnt);
    if(fSuc) lista = lista.filter(u=>(u.sucursal||'')===fSuc);
    if(fTrans) lista = lista.filter(u=>(u.transmision||'')===fTrans);
    if(orden==='precio-asc') lista.sort((a,b)=>(a.precio||0)-(b.precio||0));
    else if(orden==='precio-desc') lista.sort((a,b)=>(b.precio||0)-(a.precio||0));
    else if(orden==='km-asc') lista.sort((a,b)=>(a.km||0)-(b.km||0));
    else if(orden==='anio-desc') lista.sort((a,b)=>(b.anio||0)-(a.anio||0));
    else lista.sort((a,b)=>(b.destacada?1:0)-(a.destacada?1:0) || new Date(b.fechaAlta||0)-new Date(a.fechaAlta||0) || b.id-a.id);
    const marcas = [...new Set(d.unidades.map(u=>u.marca).filter(Boolean))].sort();
    const entidades = [...new Set(d.unidades.map(u=>u.entidad).filter(Boolean))].sort();
    const sucursales = [...new Set(d.unidades.map(u=>u.sucursal).filter(Boolean))];
    const fichaCampo = (ico, lb, v)=> v ? `<div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"><i class="fas ${ico} text-slate-400 text-[10px] w-4"></i><div><p class="text-[9px] uppercase text-slate-400 leading-none">${lb}</p><p class="text-xs font-semibold text-slate-700">${psEscape(String(v))}</p></div></div>` : '';
    const card = (u)=>{
        const est = u.estado||'Disponible';
        const fotos = (u.fotos||[]);
        const desc = u.precioLista && u.precioLista>u.precio ? Math.round((1-u.precio/u.precioLista)*100) : 0;
        const cliRes = u.clienteId ? d.clientes.find(c=>String(c.id)===String(u.clienteId)) : null;
        return `<div class="bg-white border rounded-2xl overflow-hidden ${est==='Vendida'?'opacity-80 border-emerald-400':(est==='Reservada'?'border-amber-300 ring-1 ring-amber-200':'border-slate-200')} hover:shadow-lg transition flex flex-col">
            <div class="relative group">
                ${fotos[0]?`<img loading="lazy" decoding="async" src="${fotos[0]}" class="w-full h-44 object-cover cursor-pointer group-hover:scale-[1.02] transition" data-bx-click="a486" data-p0="${bxE(function(){return u.id})}">`:`<div class="w-full h-44 bg-slate-100 flex items-center justify-center cursor-pointer" data-bx-click="a486" data-p0="${bxE(function(){return u.id})}"><i class="fas fa-car-side text-slate-300 text-4xl"></i></div>`}
                <div class="absolute top-2 left-2 flex flex-wrap gap-1">${auEstadoBadge(est)}${auOrigenBadge(u.origen||'Mexicano')}${desc>0?`<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">-${desc}%</span>`:''}${u.destacada?'<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">Destacada</span>':''}</div>
                ${fotos.length>0?`<span data-bx-click="a486" data-p0="${bxE(function(){return u.id})}" class="absolute bottom-2 right-2 px-2.5 py-0.5 rounded-full bg-black/70 hover:bg-black/85 text-white text-[10px] font-semibold cursor-pointer"><i class="fas fa-images mr-1"></i>${fotos.length} foto${fotos.length===1?'':'s'}</span>`:''}
            </div>
            ${fotos.length>1?`<div class="flex gap-1.5 px-4 pt-2.5 overflow-x-auto">${fotos.slice(0,5).map((f,idx)=>`<img loading="lazy" decoding="async" src="${f}" data-bx-click="a487" data-p0="${bxE(function(){return u.id})}" data-p1="${bxE(function(){return idx})}" class="w-12 h-9 object-cover rounded-md border border-slate-200 cursor-pointer hover:ring-2 hover:ring-indigo-500 shrink-0 transition" title="Foto ${idx+1}">`).join('')}${fotos.length>5?`<button data-bx-click="a488" data-p0="${bxE(function(){return u.id})}" class="w-12 h-9 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-600 shrink-0 hover:bg-slate-200">+${fotos.length-5}</button>`:''}</div>`:''}
            <div class="p-4 flex-1 flex flex-col">
                <div class="flex items-start justify-between gap-2">
                    <div>
                        <p class="text-xs text-slate-400 uppercase font-semibold">${psEscape(u.marca||'')} ${u.anio?'· '+psEscape(String(u.anio)):''}</p>
                        <h4 class="font-bold text-slate-900 leading-tight">${psEscape(u.modelo||'')}</h4>
                    </div>
                    <select data-bx-change="a489" data-p0="${bxE(function(){return u.id})}" title="Cambiar estatus de disponibilidad" class="text-[11px] font-semibold rounded-lg border px-2 py-1 cursor-pointer ${est==='Vendida'?'bg-emerald-50 border-emerald-300 text-emerald-800':(est==='Reservada'?'bg-amber-50 border-amber-300 text-amber-900':'bg-slate-50 border-slate-200 text-slate-700')}">
                        <option value="Disponible" ${est==='Disponible'?'selected':''}>🟢 Disponible</option>
                        <option value="Reservada" ${est==='Reservada'?'selected':''}>🟡 Reservada</option>
                        <option value="Vendida" ${est==='Vendida'?'selected':''}>✅ Vendida</option>
                    </select>
                </div>
                <div class="flex items-baseline gap-2 mt-1">
                    <p class="text-xl font-black text-indigo-700">$${Number(u.precio||0).toLocaleString('es-MX')}</p>
                    ${desc>0?`<p class="text-xs text-slate-400 line-through">$${Number(u.precioLista).toLocaleString('es-MX')}</p>`:''}
                </div>
                ${est==='Reservada' && (u.anticipo || u.reservaHasta || cliRes) ? `<div class="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
                    ${cliRes?`<div><i class="fas fa-user mr-1"></i><b>Apartado por:</b> ${psEscape(cliRes.nombre)}</div>`:''}
                    ${u.anticipo?`<div><i class="fas fa-coins mr-1"></i><b>Anticipo:</b> $${Number(u.anticipo).toLocaleString('es-MX')}</div>`:''}
                    ${u.reservaHasta?`<div><i class="fas fa-calendar-day mr-1"></i><b>Vence:</b> ${psEscape(u.reservaHasta)}</div>`:''}
                </div>` : ''}
                <div class="grid grid-cols-2 gap-1.5 mt-3">
                    ${fichaCampo('fa-road','Kilómetros', u.km?Number(u.km).toLocaleString('es-MX')+' km':'')}
                    ${fichaCampo('fa-gears','Transmisión', u.transmision)}
                    ${fichaCampo('fa-gas-pump','Combustible', u.combustible)}
                    ${fichaCampo('fa-users','Pasajeros', u.pasajeros?u.pasajeros+' pax':'')}
                    ${fichaCampo('fa-location-dot','Entidad', u.entidad)}
                    ${fichaCampo('fa-warehouse','Agencia', u.sucursal)}
                </div>
                ${u.descripcion?`<p class="text-xs text-slate-500 mt-2 line-clamp-2">${psEscape(u.descripcion)}</p>`:''}
                <div class="flex flex-wrap gap-1.5 mt-auto pt-3">
                    <button data-bx-click="a486" data-p0="${bxE(function(){return u.id})}" class="flex-1 text-xs px-2.5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 font-medium"><i class="fas fa-expand mr-1"></i>Ficha</button>
                    <button data-bx-click="a490" data-p0="${bxE(function(){return u.id})}" class="text-xs px-2.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-medium" title="Compartir ficha con cliente"><i class="fas fa-share-nodes mr-1"></i>Compartir</button>
                    ${est!=='Vendida'?`<button data-bx-click="a491" data-p0="${bxE(function(){return u.id})}" class="text-xs px-2.5 py-2 border ${est==='Reservada'?'bg-amber-100 border-amber-300 text-amber-900':'hover:bg-slate-50'} rounded-lg" title="${est==='Reservada'?'Gestionar o liberar reserva':'Apartar / Reservar'}"><i class="fas fa-hand"></i></button>`:''}
                    ${est!=='Vendida'?`<button data-bx-click="a492" data-p0="${bxE(function(){return u.id})}" class="text-xs px-2.5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700" title="Registrar venta"><i class="fas fa-handshake"></i></button>`:''}
                    <button data-bx-click="a493" data-p0="${bxE(function(){return u.id})}" class="text-xs px-2.5 py-2 border rounded-lg hover:bg-slate-50" title="Editar unidad y galería"><i class="fas fa-pen"></i></button>
                    <button data-bx-click="a494" data-p0="${bxE(function(){return u.id})}" class="text-xs px-2.5 py-2 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50" title="Eliminar (GM/admin)"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    };
    const sel = (id, attr, label, todos, opciones, actual)=>`<select data-bx-change="a495" data-p0="${bxE(function(){return attr})}" id="${id}" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="">${todos}</option>${opciones.map(o=>`<option ${actual===o?'selected':''}>${psEscape(o)}</option>`).join('')}</select>`;
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
            <h3 class="font-semibold text-lg">Inventario (${lista.length})</h3>
            <div class="flex flex-wrap gap-2">
                <div class="relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input value="${psEscape(window.auInvQ||'')}" data-bx-input="a496" placeholder="Marca, modelo, color, año..." class="w-52 pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                </div>
                ${sel('','auInvEst','Estado','Todos los estados',['Disponible','Reservada','Vendida'],fEst)}
                ${sel('','auInvMarca','Marca','Todas las marcas',marcas,fMarca)}
                ${sel('','auInvOrig','Origen','Origen',['Mexicano','Americano','Legalizado'],fOrig)}
                ${sel('','auInvEnt','Entidad','Toda la República',entidades,fEnt)}
                ${sel('','auInvSuc','Agencia','Todas las agencias',sucursales,fSuc)}
                ${sel('','auInvTrans','Transmisión','Transmisión',['Automática','Manual','CVT'],fTrans)}
                <select data-bx-change="a497" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="recientes" ${orden==='recientes'?'selected':''}>Más recientes / destacadas</option>
                    <option value="precio-asc" ${orden==='precio-asc'?'selected':''}>Precio: menor a mayor</option>
                    <option value="precio-desc" ${orden==='precio-desc'?'selected':''}>Precio: mayor a menor</option>
                    <option value="km-asc" ${orden==='km-asc'?'selected':''}>Menor kilometraje</option>
                    <option value="anio-desc" ${orden==='anio-desc'?'selected':''}>Más nuevos</option>
                </select>
                <button data-bx-click="a498" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-eraser mr-1"></i>Limpiar</button>
            </div>
        </div>
        <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            ${lista.map(card).join('') || '<p class="text-sm text-slate-400 col-span-full">Sin unidades que coincidan con los filtros.</p>'}
        </div>
        <p class="text-xs text-slate-400 mt-4"><i class="fas fa-circle-info mr-1"></i>Las unidades disponibles se publican automáticamente en el escaparate público de la portada. Toca la foto o "Ver ficha" para la galería completa.</p>
    </div>`;
}
// ===== Ficha detallada (galeria grande + especificaciones + compartir) =====
function auUrlFichaPublica(id){
    const base = window.location.origin + window.location.pathname;
    return base + '#auto-' + id;
}
function auTextoCompartir(u){
    if(!u) return '';
    const precio = '$' + Number(u.precio||0).toLocaleString('es-MX');
    const partes = [
        '🚗 *' + [u.marca, u.modelo, u.anio].filter(Boolean).join(' ') + '*',
        '💰 Precio: *' + precio + '*' + (u.precioLista && u.precioLista>u.precio ? ' (Lista: $'+Number(u.precioLista).toLocaleString('es-MX')+')' : ''),
        '📌 Estatus: ' + (u.estado||'Disponible'),
        u.km ? '🛣️ Kilometraje: ' + Number(u.km).toLocaleString('es-MX') + ' km' : '',
        u.transmision ? '⚙️ Transmisión: ' + u.transmision : '',
        u.combustible ? '⛽ Combustible: ' + u.combustible : '',
        (u.sucursal || u.entidad) ? '📍 Ubicación: ' + [u.sucursal, u.entidad].filter(Boolean).join(', ') : '',
        u.descripcion ? '✨ Equipamiento: ' + u.descripcion : '',
        '🔗 Ver ficha y galería: ' + auUrlFichaPublica(u.id)
    ].filter(Boolean);
    return partes.join('\n');
}
function auCopiarLinkFicha(id){
    const url = auUrlFichaPublica(id);
    if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(()=>{ if(window.showToast) showToast('Enlace de la ficha copiado al portapapeles','success'); }).catch(()=>auFallbackCopy(url));
    } else auFallbackCopy(url);
}
function auCopiarResumenFicha(id){
    const d = auD();
    const u = d.unidades.find(x=>String(x.id)===String(id)); if(!u) return;
    const txt = auTextoCompartir(u);
    if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(()=>{ if(window.showToast) showToast('Ficha completa copiada para pegar','success'); }).catch(()=>auFallbackCopy(txt));
    } else auFallbackCopy(txt);
}
function auFallbackCopy(txt){
    try{
        const ta = document.createElement('textarea');
        ta.value = txt; document.body.appendChild(ta); ta.select();
        document.execCommand('copy'); document.body.removeChild(ta);
        if(window.showToast) showToast('Copiado al portapapeles','success');
    }catch(e){}
}
function auWhatsAppFicha(id){
    const d = auD();
    const u = d.unidades.find(x=>String(x.id)===String(id)); if(!u) return;
    const msg = auTextoCompartir(u);
    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}
function auAbrirVistaPublica(id){
    closeModal();
    window._forceApp = false;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('public-portal').classList.remove('hidden');
    auVerAuto(id);
    window.scrollTo(0,0);
}
function auCompartirFichaModal(id){
    const d = auD();
    const u = d.unidades.find(x=>String(x.id)===String(id)); if(!u) return;
    const url = auUrlFichaPublica(u.id);
    const resumen = auTextoCompartir(u);
    const fotos = (u.fotos||[]);
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-4">
            <div>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 uppercase">Ficha compartible</span>
                <h3 class="text-xl font-bold text-slate-900 mt-1">${psEscape(u.marca||'')} ${psEscape(u.modelo||'')} ${psEscape(String(u.anio||''))}</h3>
                <p class="text-xs text-slate-500">Comparte esta unidad con tu cliente por WhatsApp, enlace directo o vista pública imprimible.</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
        </div>
        <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 mb-4">
            ${fotos[0]?`<img loading="lazy" decoding="async" src="${fotos[0]}" class="w-20 h-14 object-cover rounded-lg border">`:`<div class="w-20 h-14 rounded-lg bg-slate-200 flex items-center justify-center"><i class="fas fa-car text-slate-400"></i></div>`}
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">${auEstadoBadge(u.estado||'Disponible')}<span class="text-xs font-bold text-indigo-700">$${Number(u.precio||0).toLocaleString('es-MX')}</span></div>
                <p class="text-xs text-slate-500 truncate mt-0.5">${psEscape(u.sucursal||'')} · ${psEscape(u.entidad||'')}</p>
            </div>
        </div>
        <div class="space-y-3">
            <div>
                <label class="text-xs font-semibold text-slate-600 block mb-1">Enlace directo a la ficha pública</label>
                <div class="flex gap-2">
                    <input readonly value="${psEscape(url)}" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-700 font-mono">
                    <button type="button" data-bx-click="a6" data-p0="${bxE(function(){return u.id})}" class="px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"><i class="fas fa-copy mr-1"></i>Copiar link</button>
                </div>
            </div>
            <div>
                <label class="text-xs font-semibold text-slate-600 block mb-1">Mensaje con ficha técnica lista para enviar</label>
                <textarea readonly rows="6" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-700">${psEscape(resumen)}</textarea>
            </div>
        </div>
        <div class="grid sm:grid-cols-3 gap-2 mt-5">
            <button type="button" data-bx-click="a7" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><i class="fab fa-whatsapp text-sm"></i>Enviar por WhatsApp</button>
            <button type="button" data-bx-click="a499" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><i class="fas fa-clipboard-check"></i>Copiar texto completo</button>
            <button type="button" data-bx-click="a500" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><i class="fas fa-up-right-from-square"></i>Abrir ficha pública</button>
        </div>
    </div>`);
}
function auFichaGalGo(idx){
    const fotos = window._auFichaFotos || [];
    if(!fotos.length) return;
    const n = fotos.length;
    window._auFichaIdx = ((idx % n) + n) % n;
    const main = document.getElementById('au-ficha-principal');
    if(main) main.src = fotos[window._auFichaIdx];
    const cnt = document.getElementById('au-ficha-counter');
    if(cnt) cnt.textContent = (window._auFichaIdx + 1) + ' / ' + n;
    document.querySelectorAll('.au-ficha-thumb').forEach((el, i)=>{
        el.classList.toggle('ring-2', i === window._auFichaIdx);
        el.classList.toggle('ring-indigo-600', i === window._auFichaIdx);
    });
}
function auFichaGalStep(delta){
    auFichaGalGo((window._auFichaIdx || 0) + delta);
}
function auPagGalGo(idx){
    const d = auD();
    const u = d.unidades.find(x=>String(x.id)===String(window._auVerId));
    const fotos = (u && u.fotos) || [];
    if(!fotos.length) return;
    const n = fotos.length;
    window._auPagIdx = ((idx % n) + n) % n;
    const main = document.getElementById('au-pag-principal');
    if(main) main.src = fotos[window._auPagIdx];
    const cnt = document.getElementById('au-pag-counter');
    if(cnt) cnt.textContent = (window._auPagIdx + 1) + ' / ' + n;
    document.querySelectorAll('.au-pag-thumb').forEach((el, i)=>{
        el.classList.toggle('ring-2', i === window._auPagIdx);
        el.classList.toggle('ring-emerald-500', i === window._auPagIdx);
    });
}
function auPagGalStep(delta){
    auPagGalGo((window._auPagIdx || 0) + delta);
}
function auFicha(id, startIdx){
    const d = auD();
    const u = d.unidades.find(x=>x.id===id); if(!u) return;
    const fotos = (u.fotos||[]);
    window._auFichaFotos = fotos;
    window._auFichaIdx = (typeof startIdx==='number' && startIdx>=0 && startIdx<fotos.length) ? startIdx : 0;
    const est = u.estado||'Disponible';
    const cliRes = u.clienteId ? d.clientes.find(c=>String(c.id)===String(u.clienteId)) : null;
    const desc = u.precioLista && u.precioLista>u.precio ? Math.round((1-u.precio/u.precioLista)*100) : 0;
    const filaSpec = (lb, v)=> v ? `<div class="flex justify-between py-1.5 border-b border-slate-100 text-sm"><span class="text-slate-400">${lb}</span><b class="text-slate-700">${psEscape(String(v))}</b></div>` : '';
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1">${auEstadoBadge(est)}${auOrigenBadge(u.origen||'Mexicano')}${desc>0?`<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-600 text-white">-${desc}% vs lista</span>`:''}</div>
                <h3 class="text-2xl font-bold text-slate-900">${psEscape(u.marca||'')} ${psEscape(u.modelo||'')} ${psEscape(String(u.anio||''))}</h3>
                <p class="text-sm text-slate-500"><i class="fas fa-location-dot mr-1"></i>${psEscape(u.sucursal||'')} · ${psEscape(u.entidad||'')}</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
        </div>
        ${fotos[0]?`<div class="relative rounded-xl overflow-hidden border bg-slate-50">
            <img loading="lazy" decoding="async" id="au-ficha-principal" src="${fotos[window._auFichaIdx]}" class="w-full h-80 object-cover">
            ${fotos.length>1?`
                <button type="button" data-bx-click="a501" class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow"><i class="fas fa-chevron-left text-xs"></i></button>
                <button type="button" data-bx-click="a502" class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow"><i class="fas fa-chevron-right text-xs"></i></button>
                <span id="au-ficha-counter" class="absolute bottom-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-black/65 text-white text-xs font-semibold">${window._auFichaIdx+1} / ${fotos.length}</span>
            `:''}
        </div>`:''}
        ${fotos.length>1?`<div class="flex gap-2 mt-2 overflow-x-auto pb-1">${fotos.map((f,i)=>`<img loading="lazy" decoding="async" src="${f}" data-bx-click="a503" data-p0="${bxE(function(){return i})}" class="au-ficha-thumb w-24 h-16 object-cover rounded-lg border cursor-pointer shrink-0 ${i===window._auFichaIdx?'ring-2 ring-indigo-600':''} hover:ring-2 hover:ring-indigo-400 transition">`).join('')}</div>`:''}
        <div class="flex items-baseline justify-between flex-wrap gap-3 mt-4">
            <div class="flex items-baseline gap-3">
                <p class="text-3xl font-black text-indigo-700">$${Number(u.precio||0).toLocaleString('es-MX')}</p>
                ${desc>0?`<p class="text-lg text-slate-400 line-through">$${Number(u.precioLista).toLocaleString('es-MX')}</p>`:''}
            </div>
            <div class="flex items-center gap-1.5">
                <button type="button" data-bx-click="a6" data-p0="${bxE(function(){return u.id})}" class="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"><i class="fas fa-link mr-1 text-indigo-600"></i>Copiar link</button>
                <button type="button" data-bx-click="a7" data-p0="${bxE(function(){return u.id})}" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"><i class="fab fa-whatsapp mr-1"></i>WhatsApp</button>
                <button type="button" data-bx-click="a500" data-p0="${bxE(function(){return u.id})}" class="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold"><i class="fas fa-up-right-from-square mr-1"></i>Vista cliente</button>
            </div>
        </div>
        ${est==='Reservada' && (u.anticipo || u.reservaHasta || cliRes || u.reservaNotas) ? `<div class="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap gap-x-5 gap-y-1">
            ${cliRes?`<span><i class="fas fa-user mr-1"></i><b>Cliente:</b> ${psEscape(cliRes.nombre)}</span>`:''}
            ${u.anticipo?`<span><i class="fas fa-coins mr-1"></i><b>Anticipo:</b> $${Number(u.anticipo).toLocaleString('es-MX')}</span>`:''}
            ${u.reservaHasta?`<span><i class="fas fa-calendar-day mr-1"></i><b>Vence:</b> ${psEscape(u.reservaHasta)}</span>`:''}
            ${u.reservaNotas?`<span class="w-full text-amber-800"><i class="fas fa-comment-dots mr-1"></i>${psEscape(u.reservaNotas)}</span>`:''}
        </div>` : ''}
        <div class="grid md:grid-cols-2 gap-x-8 mt-3">
            <div>
                ${filaSpec('Estatus', est)}
                ${filaSpec('Kilometraje', u.km?Number(u.km).toLocaleString('es-MX')+' km':'')}
                ${filaSpec('Transmisión', u.transmision)}
                ${filaSpec('Combustible', u.combustible)}
                ${filaSpec('Motor', u.motor)}
                ${filaSpec('Color', u.color)}
            </div>
            <div>
                ${filaSpec('Puertas', u.puertas)}
                ${filaSpec('Pasajeros', u.pasajeros?u.pasajeros+' personas':'')}
                ${filaSpec('Origen', u.origen||'Mexicano')}
                ${filaSpec('VIN', u.vin)}
                ${filaSpec('Agente responsable', u.agenteNombre)}
            </div>
        </div>
        ${u.descripcion?`<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 mt-3"><b>Equipamiento:</b> ${psEscape(u.descripcion)}</div>`:''}
        <div class="flex justify-end gap-2 mt-4 flex-wrap">
            <button data-bx-click="a504" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 text-sm font-medium"><i class="fas fa-share-nodes mr-1"></i>Compartir ficha</button>
            ${est!=='Vendida'?`<button data-bx-click="a505" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm"><i class="fas fa-hand mr-1"></i>${est==='Reservada'?'Gestionar reserva':'Reservar'}</button>`:''}
            ${est!=='Vendida'?`<button data-bx-click="a506" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm font-medium"><i class="fas fa-handshake mr-1"></i>Vender</button>`:''}
            <button data-bx-click="a507" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm"><i class="fas fa-pen mr-1"></i>Editar</button>
        </div>
    </div>`);
}
function auRenderDraftFotos(){
    const wrap = document.getElementById('au-draft-fotos-wrap');
    if(!wrap) return;
    const arr = window._auDraftFotos || [];
    if(!arr.length){
        wrap.innerHTML = `<div class="border border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-400">Sin fotos cargadas todavía. Sube hasta 10 fotos o agrega una URL de imagen.</div>`;
        return;
    }
    wrap.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">${arr.map((src, i)=>`
        <div class="relative group rounded-xl overflow-hidden border ${i===0?'border-indigo-500 ring-2 ring-indigo-500/30':'border-slate-200'} bg-slate-50">
            <img loading="lazy" decoding="async" src="${src}" class="w-full h-24 object-cover">
            ${i===0?`<span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-indigo-600 text-white text-[9px] font-bold shadow">Portada</span>`:`<button type="button" data-bx-click="a508" data-p0="${bxE(function(){return i})}" class="
            absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/65 hover:bg-indigo-600 text-white text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition">Hacer portada</button>`}
            <button type="button" data-bx-click="a509" data-p0="${bxE(function(){return i})}" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] flex items-center justify-center shadow" title="Quitar foto"><i class="fas fa-trash"></i></button>
        </div>`).join('')}</div>`;
}
function auDraftSetPortada(idx){
    const arr = window._auDraftFotos || [];
    if(idx<=0 || idx>=arr.length) return;
    const item = arr.splice(idx, 1)[0];
    arr.unshift(item);
    auRenderDraftFotos();
}
function auDraftQuitarFoto(idx){
    const arr = window._auDraftFotos || [];
    if(idx<0 || idx>=arr.length) return;
    arr.splice(idx, 1);
    auRenderDraftFotos();
}
function auDraftAgregarUrl(){
    const inp = document.getElementById('au-foto-url');
    if(!inp) return;
    const url = inp.value.trim();
    if(!url) return;
    window._auDraftFotos = window._auDraftFotos || [];
    if(window._auDraftFotos.length >= 10){ showToast('Máximo 10 fotos por unidad','warning'); return; }
    window._auDraftFotos.push(url);
    inp.value = '';
    auRenderDraftFotos();
}
function auDraftSubirArchivos(inputEl){
    const files = (inputEl && inputEl.files) ? [...inputEl.files] : [];
    if(!files.length) return;
    window._auDraftFotos = window._auDraftFotos || [];
    const disp = Math.max(0, 10 - window._auDraftFotos.length);
    if(disp <= 0){ showToast('Ya tienes el máximo de 10 fotos','warning'); inputEl.value=''; return; }
    const primeros = files.slice(0, disp);
    const anexar = (nuevas)=>{
        (nuevas||[]).filter(Boolean).forEach(u=>{ if(window._auDraftFotos.length<10) window._auDraftFotos.push(u); });
        inputEl.value = '';
        auRenderDraftFotos();
    };
    if (window.Media && window.Backend && window.Backend.available) {
        if (window.showToast) window.showToast('Subiendo fotos…','info');
        window.Media.subirMuchos(primeros, 'autoHub').then(items=>anexar(items.map(x=>x.url))).catch(()=>auFotosLocal(primeros, anexar));
    } else auFotosLocal(primeros, anexar);
}
function auAltaUnidad(id){
    const d = auD();
    const u = id ? d.unidades.find(x=>x.id===id) : null;
    window._auDraftFotos = u && Array.isArray(u.fotos) ? u.fotos.slice() : [];
    const opt = (arr, sel)=>arr.map(v=>`<option ${v===(sel||'')?'selected':''}>${v}</option>`).join('');
    showModal(`<form id="au-unidad-form" class="p-6">
        <h3 class="text-xl font-bold mb-1">${u?'Editar unidad':'Cargar unidad al inventario'}</h3>
        <p class="text-xs text-slate-500 mb-4">Ficha completa estilo portal de venta: administra la galería de fotos, elige portada y define su disponibilidad.</p>
        <div class="grid md:grid-cols-3 gap-3">
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Marca *</label><input id="au-marca" required value="${psEscape(u&&u.marca||'')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Modelo *</label><input id="au-modelo" required value="${psEscape(u&&u.modelo||'')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">A\u00f1o *</label><input id="au-anio" type="number" required value="${psEscape(String(u&&u.anio||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Precio de venta ($) *</label><input id="au-precio" type="number" step="0.01" required value="${psEscape(String(u&&u.precio||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Precio de lista ($) <span class="text-slate-400 font-normal">(opcional, para mostrar descuento)</span></label><input id="au-precio-lista" type="number" step="0.01" value="${psEscape(String(u&&u.precioLista||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Origen *</label><select id="au-origen" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option ${(u&&u.origen!=='Americano')||!u?'selected':''}>Mexicano</option><option ${u&&u.origen==='Americano'?'selected':''}>Americano</option><option ${u&&u.origen==='Legalizado'?'selected':''}>Legalizado</option></select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Entidad (estado) *</label><select id="au-entidad" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(AU_ENTIDADES, u&&u.entidad||'Estado de M\u00e9xico')}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Agencia / Sucursal *</label><input id="au-sucursal" required value="${psEscape(u&&u.sucursal||'')}" placeholder="Escribe la agencia o sucursal" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Kilometraje</label><input id="au-km" type="number" value="${psEscape(String(u&&u.km||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Color</label><input id="au-color" value="${psEscape(u&&u.color||'')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Transmisi\u00f3n</label><select id="au-trans" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['Autom\u00e1tica','Manual','CVT'], u&&u.transmision)}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Combustible</label><select id="au-comb" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['Gasolina','H\u00edbrido','El\u00e9ctrico','Di\u00e9sel'], u&&u.combustible)}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Motor</label><input id="au-motor" value="${psEscape(u&&u.motor||'')}" placeholder="Ej. 1.6L 4 cil" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">VIN / N\u00fam. de serie</label><input id="au-vin" value="${psEscape(u&&u.vin||'')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Puertas</label><select id="au-puertas" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['2','4','5'], u&&String(u.puertas||''))}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Pasajeros</label><select id="au-pasajeros" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['2','4','5','7','8'], u&&String(u.pasajeros||''))}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Estado de disponibilidad</label><select id="au-estado" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['Disponible','Reservada','Vendida'], u&&u.estado)}</select></div>
            <div class="md:col-span-2"><label class="text-sm font-medium text-slate-700 mb-1 block">Descripci\u00f3n / equipamiento</label><input id="au-desc" value="${psEscape(u&&u.descripcion||'')}" placeholder="Ej. C\u00e1mara reversa, bluetooth, aire acondicionado, rines de aleaci\u00f3n" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Destacar en portada</label><select id="au-destacada" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option ${(u&&u.destacada)?'selected':''}>S\u00ed</option><option ${(!u||!u.destacada)?'selected':''}>No</option></select></div>
            <div class="md:col-span-3 border-t border-slate-200 pt-3 mt-1">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <label class="text-sm font-semibold text-slate-800"><i class="fas fa-images mr-1 text-indigo-600"></i>Galer\u00eda de fotos de la unidad (hasta 10, elige cu\u00e1l es portada)</label>
                    <span class="text-[11px] text-slate-400">Puedes subir varias tandas o pegar URLs</span>
                </div>
                <div class="grid sm:grid-cols-2 gap-2 mb-3">
                    <input id="au-fotos" type="file" accept="image/*" multiple data-bx-change="a510" class="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-900">
                    <div class="flex gap-1.5">
                        <input id="au-foto-url" type="url" placeholder="O pega URL de imagen (https://...)" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900">
                        <button type="button" data-bx-click="a511" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 whitespace-nowrap"><i class="fas fa-plus mr-1"></i>Agregar URL</button>
                    </div>
                </div>
                <div id="au-draft-fotos-wrap"></div>
            </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-lg border">Cancelar</button>
            <button type="submit" class="px-5 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white font-semibold"><i class="fas fa-save mr-1"></i> Guardar unidad</button>
        </div>
    </form>`);
    setTimeout(()=>{
        auRenderDraftFotos();
        const form = document.getElementById('au-unidad-form');
        if(form) form.onsubmit = (e)=>{ e.preventDefault(); auGuardarUnidad(id); };
    },0);
}
/* Paso 4: lectura base64 local (fallback cuando no hay backend/sube falla). */
function auFotosLocal(primeros, guardar){
    if(window.Media && typeof window.Media.comprimirImagen==='function'){
        Promise.all(primeros.map(f=>window.Media.comprimirImagen(f))).then(arr=>guardar(arr.filter(Boolean)));
        return;
    }
    let pend = primeros.length; const arr = [];
    primeros.forEach(f=>{ const r=new FileReader(); r.onload=()=>{ arr.push(r.result); pend--; if(pend===0) guardar(arr); }; r.onerror=()=>{ pend--; if(pend===0) guardar(arr); }; r.readAsDataURL(f); });
}
function auFileLocal(f, guardar){
    if(window.Media && typeof window.Media.comprimirImagen==='function'){
        window.Media.comprimirImagen(f).then(guardar);
        return;
    }
    const r=new FileReader(); r.onload=()=>guardar(r.result); r.onerror=()=>guardar(null); r.readAsDataURL(f);
}
function auGuardarUnidad(id){
    const d = auD();
    const lee = (k)=>{ const el=document.getElementById(k); return el?el.value.trim():''; };
    const fotosFinales = (window._auDraftFotos || []).slice(0, 10);
    const datos = { marca:lee('au-marca'), modelo:lee('au-modelo'), anio:parseInt(lee('au-anio'))||'', precio:parseFloat(lee('au-precio'))||0, precioLista:parseFloat(lee('au-precio-lista'))||0, origen:lee('au-origen'), entidad:lee('au-entidad'), sucursal:lee('au-sucursal'), km:parseInt(lee('au-km'))||'', color:lee('au-color'), transmision:lee('au-trans'), combustible:lee('au-comb'), motor:lee('au-motor'), vin:lee('au-vin'), placas:lee('au-placas'), puertas:lee('au-puertas'), pasajeros:lee('au-pasajeros'), estado:lee('au-estado')||'Disponible', descripcion:lee('au-desc'), destacada:lee('au-destacada')==='S\u00ed', fotos:fotosFinales };
    if(!datos.marca||!datos.modelo){ showToast('Marca y modelo son obligatorios','warning'); return; }
    if(id){
        const u = d.unidades.find(x=>x.id===id); if(!u) return;
        Object.assign(u, datos);
    } else {
        d.unidades.unshift(Object.assign({ id:Date.now(), fechaAlta:new Date().toISOString(), clienteId:null, agenteId:currentUser.id, agenteNombre:currentUser.name }, datos));
    }
    cmLog('Agencia Automotriz', id?'Edit\u00f3 unidad':'Carg\u00f3 unidad', datos.marca+' '+datos.modelo+' ('+datos.origen+', '+datos.sucursal+')');
    saveDB(); closeModal(); showToast('Unidad guardada','success'); render();
}
function auCambioRapidoEstado(id, nuevoEst){
    const d = auD();
    const u = d.unidades.find(x=>x.id===id); if(!u) return;
    if(nuevoEst==='Reservada' && (u.estado||'Disponible')!=='Reservada'){
        auReservar(id);
        return;
    }
    if(nuevoEst==='Vendida' && (u.estado||'Disponible')!=='Vendida'){
        auVender(id);
        return;
    }
    u.estado = nuevoEst || 'Disponible';
    if(u.estado === 'Disponible'){
        u.clienteId = null; u.anticipo = 0; u.reservaHasta = ''; u.reservaNotas = '';
    }
    cmLog('Agencia Automotriz','Cambi\u00f3 estatus a '+u.estado, u.marca+' '+u.modelo);
    saveDB(); showToast('Estatus actualizado: '+u.estado,'success'); render();
}
function auReservar(id){
    const d = auD(); const u = d.unidades.find(x=>x.id===id); if(!u) return;
    const opts = d.clientes.map(c=>`<option value="${c.id}" ${String(u.clienteId||'')===String(c.id)?'selected':''}>${psEscape(c.nombre)}</option>`).join('');
    const defHasta = u.reservaHasta || new Date(Date.now() + 3*86400000).toISOString().slice(0,10);
    const defEntrega = u.fechaEntrega || new Date(Date.now() + 7*86400000).toISOString().slice(0,10);
    showModal(`<div class="p-6">
        <h3 class="text-lg font-bold mb-1">Apartar / Reservar \u2014 ${psEscape(u.marca+' '+u.modelo)}</h3>
        <p class="text-xs text-slate-500 mb-4">Registra los datos del apartado para bloquear la unidad en piso, vigencia y fecha compromiso de entrega.</p>
        <div class="space-y-3">
            <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Cliente que aparta</label><select id="au-res-cli" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="">Sin cliente vinculado</option>${opts}</select></div>
            <div class="grid grid-cols-3 gap-3">
                <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Monto de anticipo ($)</label><input id="au-res-anticipo" type="number" step="100" value="${psEscape(String(u.anticipo||5000))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
                <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Vigencia del apartado</label><input id="au-res-hasta" type="date" value="${psEscape(defHasta)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
                <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Fecha compromiso de entrega</label><input id="au-res-entrega" type="date" value="${psEscape(defEntrega)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            </div>
            <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Notas o condiciones del apartado</label><input id="au-res-notas" value="${psEscape(u.reservaNotas||'')}" placeholder="Ej. Pendiente autorizaci\u00f3n de cr\u00e9dito / entrega el s\u00e1bado" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
        </div>
        <div class="flex items-center justify-between gap-2 mt-5">
            ${(u.estado||'Disponible')==='Reservada'?`<button type="button" data-bx-click="a512" data-p0="${bxE(function(){return u.id})}" class="px-4 py-2 border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-semibold"><i class="fas fa-unlock mr-1"></i>Liberar a Disponible</button>`:'<span></span>'}
            <div class="flex gap-2">
                <button type="button" data-bx-click="a513" class="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button type="button" data-bx-click="a514" data-p0="${bxE(function(){return u.id})}" class="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold"><i class="fas fa-hand mr-1"></i>Guardar apartado</button>
            </div>
        </div>
    </div>`);
}
function auLiberarReserva(id){
    const d = auD(); const u = d.unidades.find(x=>x.id===id); if(!u) return;
    u.estado='Disponible'; u.clienteId=null; u.anticipo=0; u.reservaHasta=''; u.fechaEntrega=''; u.reservaNotas='';
    cmLog('Agencia Automotriz','Liber\u00f3 unidad', u.marca+' '+u.modelo);
    saveDB(); closeModal(); showToast('Unidad liberada como Disponible','success'); render();
}
function auConfirmaReserva(id){
    const d = auD(); const u = d.unidades.find(x=>x.id===id); if(!u) return;
    u.estado='Reservada';
    u.clienteId=(document.getElementById('au-res-cli')||{}).value||null;
    u.anticipo=parseFloat((document.getElementById('au-res-anticipo')||{}).value)||0;
    u.reservaHasta=((document.getElementById('au-res-hasta')||{}).value||'').trim();
    u.fechaEntrega=((document.getElementById('au-res-entrega')||{}).value||'').trim();
    u.reservaNotas=((document.getElementById('au-res-notas')||{}).value||'').trim();
    cmLog('Agencia Automotriz','Reserv\u00f3 unidad', u.marca+' '+u.modelo+(u.anticipo?' (anticipo $'+u.anticipo+')':''));
    saveDB(); closeModal(); showToast('Unidad apartada con fecha de entrega','success'); render();
}
function auVender(id){
    const d = auD(); const u = d.unidades.find(x=>x.id===id); if(!u) return;
    const opts = d.clientes.map(c=>`<option value="${c.id}">${psEscape(c.nombre)}</option>`).join('');
    showModal(`<div class="p-6"><h3 class="text-lg font-bold mb-2">Registrar venta \u2014 ${psEscape(u.marca+' '+u.modelo)}</h3><div class="space-y-3"><div><label class="text-sm font-medium text-slate-700 mb-1 block">Comprador</label><select id="au-v-cli" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="">Sin registro de cliente</option>${opts}</select></div><div><label class="text-sm font-medium text-slate-700 mb-1 block">Precio final de venta ($)</label><input id="au-v-precio" type="number" value="${u.precio||''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div><div><label class="text-sm font-medium text-slate-700 mb-1 block">Financiera (opcional)</label><input id="au-v-fin" placeholder="Ej. Ford Credit" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div></div><div class="flex justify-end gap-2 mt-4"><button data-bx-click="a1" class="px-4 py-2 border rounded-lg">Cancelar</button><button data-bx-click="a515" data-p0="${bxE(function(){return u.id})}" class="px-5 py-2 bg-emerald-600 text-white rounded-lg font-semibold"><i class="fas fa-handshake mr-1"></i> Confirmar venta</button></div></div>`);
}
function auConfirmaVenta(id){
    const d = auD(); const u = d.unidades.find(x=>x.id===id); if(!u) return;
    const cid = (document.getElementById('au-v-cli')||{}).value||null;
    const precio = parseFloat((document.getElementById('au-v-precio')||{}).value)||u.precio||0;
    const fin = ((document.getElementById('au-v-fin')||{}).value||'').trim();
    const cli = d.clientes.find(c=>String(c.id)===String(cid));
    u.estado='Vendida'; u.clienteId=cid;
    d.ventas.unshift({ id:Date.now(), fecha:new Date().toISOString(), unidadId:u.id, marca:u.marca, modelo:u.modelo, anio:u.anio, precio, fin, clienteId:cid, clienteNombre:cli?cli.nombre:'P\u00fablico general', agenteId:currentUser.id, agenteNombre:currentUser.name });
    cmLog('Agencia Automotriz','Venta registrada', u.marca+' '+u.modelo+' \u2014 $'+precio);
    saveDB(); closeModal(); showToast('\u00a1Venta registrada!','success'); render();
}
function auBorrarUnidad(id){
    const rol=(currentUser.role||'').toLowerCase();
    if(rol!=='gm' && rol!=='admin'){ showToast('Solo GM/admin puede eliminar unidades','warning'); return; }
    if(!confirm('\u00bfEliminar esta unidad del inventario?')) return;
    const d = auD(); const u = d.unidades.find(x=>x.id===id);
    d.unidades = d.unidades.filter(x=>x.id!==id);
    cmLog('Agencia Automotriz','Elimin\u00f3 unidad', u?(u.marca+' '+u.modelo):'');
    saveDB(); showToast('Unidad eliminada','success'); render();
}
function auClientesHtml(){
    const d = auD();
    const fQ = String(window.auCliQ||'').toLowerCase().trim();
    const fEst = window.auCliEst||'';
    const etapas = ['Prospección','Interés','Prueba de manejo','Crédito / Financiamiento','Cierre'];
    const ids = sinPuedeTodo() ? null : ((currentUser.role||'').toLowerCase()==='agencia' ? sinIdsMiAgencia() : new Set([String(currentUser.id)]));
    let lista = d.clientes.filter(c=>ids ? ids.has(String(c.agenteId)) : true);
    if(fQ) lista = lista.filter(c=>[c.nombre,c.tel].some(x=>String(x||'').toLowerCase().includes(fQ)));
    if(fEst) lista = lista.filter(c=>(c.estado||'Prospección')===fEst);
    lista.sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));
    const porAgente = {};
    lista.forEach(c=>{ const k=c.agenteId||'—'; porAgente[k]=porAgente[k]||{n:0,monto:0}; porAgente[k].n++; porAgente[k].monto+=(Number(c.interesMonto)||0); });
    const fila = (c)=>{
        const u = c.unidadId ? d.unidades.find(x=>String(x.id)===String(c.unidadId)) : null;
        return `<tr class="border-t hover:bg-slate-50">
        <td class="p-3 font-medium">${psEscape(c.nombre)}</td>
        <td class="p-3 text-xs">${psEscape(c.tel||'')}${c.tel?` <a href="https://wa.me/${String(c.tel).replace(/[^0-9]/g,'')}" target="_blank" class="text-emerald-600 ml-1" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>`:''}</td>
        <td class="p-3 text-xs">${u?psEscape(u.marca+' '+u.modelo):'<span class="text-slate-300">—</span>'}</td>
        <td class="p-3 text-xs">${c.unidadId?'$'+Number(c.interesMonto||0).toLocaleString('es-MX'):'<span class="text-slate-300">—</span>'}</td>
        <td class="p-3"><span class="px-2 py-1 rounded text-[11px] font-semibold bg-sky-100 text-sky-800 whitespace-nowrap">${psEscape(c.estado||'Prospección')}</span></td>
        <td class="p-3 text-xs">${psEscape(c.agenteNombre||'')}</td>
        <td class="p-3"><button data-bx-click="a516" data-p0="${bxE(function(){return c.id})}" class="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-700"><i class="fas fa-folder-open mr-1"></i>Expediente</button></td>
    </tr>`;
    };
    const cuentas = Object.keys(porAgente).map(k=>{ const m=(db.users||[]).find(u=>String(u.id)===String(k)); return { nombre:(m&&m.name)||(k==='—'?'Sin agente':('Agente '+k)), n:porAgente[k].n, monto:porAgente[k].monto, mes:lista.filter(c=>String(c.agenteId)===String(k)&&(c.fecha||'').slice(0,7)===new Date().toISOString().slice(0,7)).length }; }).sort((a,b)=>b.n-a.n);
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
            <h3 class="font-semibold text-lg">Clientes de la agencia (${lista.length})</h3>
            <div class="flex flex-wrap gap-2">
                <div class="relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input value="${psEscape(window.auCliQ||'')}" data-bx-input="a517" placeholder="Nombre o teléfono..." class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                </div>
                <select data-bx-change="a518" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">Todas las etapas</option>${etapas.map(s=>`<option ${fEst===s?'selected':''}>${s}</option>`).join('')}
                </select>
                <button data-bx-click="a519" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fas fa-plus mr-1"></i> Agregar cliente</button>
            </div>
        </div>
        ${cuentas.length>1?`<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">${cuentas.map(x=>`<div class="border border-slate-200 rounded-xl p-3"><p class="text-xs font-semibold text-slate-700 truncate">${psEscape(x.nombre)}</p><p class="text-[11px] text-slate-400">${x.n} cliente(s) · ${x.mes} este mes</p><p class="text-sm font-bold text-indigo-700">$${Math.round(x.monto).toLocaleString('es-MX')}</p></div>`).join('')}</div>`:''}
        <p class="p-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg mb-4"><i class="fas fa-lightbulb mr-1"></i>Apoyo: al pasar a Crédito / Financiamiento pide identificación, comprobante de ingresos y de domicilio; al entregar la unidad ofrece la póliza de auto (enlaza con Comercial Asegurador).</p>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-left text-slate-600"><tr><th class="p-3 font-medium">Nombre</th><th class="p-3 font-medium">Teléfono</th><th class="p-3 font-medium">Unidad de interés</th><th class="p-3 font-medium">Interés $</th><th class="p-3 font-medium">Etapa</th><th class="p-3 font-medium">Agente</th><th class="p-3 font-medium">Acción</th></tr></thead>
                <tbody>${lista.map(fila).join('') || '<tr><td colspan="7" class="p-8 text-center text-slate-500">Sin clientes aún.</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
}
function auNuevoCliente(){
    const d = auD();
    const puedeTodo = sinPuedeTodo();
    const esAgenciaRol = (currentUser.role||'').toLowerCase()==='agencia';
    const agentesDisponibles = puedeTodo ? (db.users||[]).filter(u=>['agente','agente_agencia','agente_desarrollo','agencia'].includes((u.role||'').toLowerCase())) : (esAgenciaRol ? (db.users||[]).filter(u=>sinIdsMiAgencia().has(String(u.id))) : [currentUser]);
    const libres = d.unidades.filter(u=>(!u.estado||u.estado==='Disponible'));
    showModal(`<form id="au-cli-form" class="p-6">
        <h3 class="text-xl font-bold mb-4">Nuevo cliente de la agencia</h3>
        <div class="space-y-3">
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Nombre *</label><input id="au-c-nombre" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">WhatsApp</label><input id="au-c-tel" placeholder="5216641234567" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Unidad de interés</label><select id="au-c-unidad" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="">— Ninguna —</option>${libres.map(u=>`<option value="${u.id}">${psEscape(u.marca+' '+u.modelo+' '+String(u.anio||''))} — $${Number(u.precio||0).toLocaleString('es-MX')}</option>`).join('')}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Etapa</label><select id="au-c-estado" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${['Prospección','Interés','Prueba de manejo','Crédito / Financiamiento','Cierre'].map(s=>`<option>${s}</option>`).join('')}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Agente responsable</label><select id="au-c-agente" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${agentesDisponibles.map(a=>`<option value="${a.id}" ${a.id===currentUser.id?'selected':''}>${psEscape(a.name||a.username)}</option>`).join('')}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Notas</label><textarea id="au-c-notas" rows="2" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea></div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-lg border">Cancelar</button>
            <button type="submit" class="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">Guardar</button>
        </div>
    </form>`);
    setTimeout(()=>{ const f=document.getElementById('au-cli-form'); if(f) f.onsubmit=(e)=>{ e.preventDefault(); auGuardarCliente(); }; },0);
}
function auGuardarCliente(){
    const d = auD();
    const lee=(k)=>{ const el=document.getElementById(k); return el?el.value.trim():''; };
    const uniId = lee('au-c-unidad');
    const uni = d.unidades.find(u=>String(u.id)===String(uniId));
    const agSel = (document.getElementById('au-c-agente')||{}).value;
    const ag = (db.users||[]).find(u=>String(u.id)===String(agSel)) || currentUser;
    const c = { id:Date.now(), fecha:new Date().toISOString(), nombre:lee('au-c-nombre'), tel:lee('au-c-tel'), unidadId:uniId||null, interesMonto:uni?uni.precio:0, estado:lee('au-c-estado')||'Prospección', notas:lee('au-c-notas'), agenteId:ag.id, agenteNombre:ag.name||ag.username, seguimientos:[] };
    if(!c.nombre){ showToast('Escribe el nombre del cliente','warning'); return; }
    d.clientes.unshift(c);
    cmLog('Agencia Automotriz','Nuevo cliente', c.nombre);
    saveDB(); closeModal(); showToast('Cliente agregado','success'); render();
}
function auDetalleCliente(id){
    const d = auD();
    const c = d.clientes.find(x=>x.id===id); if(!c) return;
    if(!vcVisible(c)){ showToast('No tienes acceso a este cliente','warning'); return; }
    const segs = (c.seguimientos||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:1);
    const etapas = ['Prospección','Interés','Prueba de manejo','Crédito / Financiamiento','Cierre'];
    const idx = etapas.indexOf(c.estado||'Prospección');
    const u = c.unidadId ? d.unidades.find(x=>String(x.id)===String(c.unidadId)) : null;
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div>
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800">${psEscape(c.estado||'Prospección')}</span>
                <h3 class="text-xl font-bold mt-1">${psEscape(c.nombre)}</h3>
                <p class="text-xs text-slate-500">${psEscape(c.tel||'sin teléfono')} · Agente: ${psEscape(c.agenteNombre||'')}</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
        </div>
        <div class="mb-3">
            <h4 class="text-xs font-semibold uppercase text-slate-400 mb-1">Progreso</h4>
            <div class="flex items-center gap-1">${etapas.map((e,i)=>`<div class="flex-1"><div class="h-1.5 rounded-full ${i<=idx?'bg-indigo-500':'bg-slate-200'}"></div><p class="text-[9px] mt-1 text-center ${i===idx?'font-bold text-indigo-600':'text-slate-400'}">${e}</p></div>`).join('')}</div>
        </div>
        ${u?`<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm mb-3"><b>Unidad de interés:</b> ${psEscape(u.marca+' '+u.modelo+' '+String(u.anio||''))} — $${Number(u.precio||0).toLocaleString('es-MX')}</div>`:''}
        ${c.notas?`<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 mb-3"><b>Notas:</b> ${psEscape(c.notas)}</div>`:''}
        <div class="grid md:grid-cols-3 gap-3 mb-4">
            <div><label class="text-xs font-medium text-slate-600 mb-1 block">Cambiar etapa</label><select id="au-c-estado-nuevo" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${etapas.map(e=>`<option ${e===(c.estado||'Prospección')?'selected':''}>${e}</option>`).join('')}</select></div>
            <div class="flex items-end"><button data-bx-click="a520" data-p0="${bxE(function(){return c.id})}" class="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-rotate mr-1"></i> Actualizar</button></div>
            <div class="flex items-end"><button data-bx-click="a521" data-p0="${bxE(function(){return c.id})}" class="w-full px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-sm font-medium"><i class="fas fa-trash mr-1"></i> Eliminar</button></div>
        </div>
        <div class="grid md:grid-cols-2 gap-4">
            <div><h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Historial (${segs.length})</h4><div class="border border-slate-200 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2">${segs.map(sg=>`<div class="text-xs border-l-2 border-indigo-200 pl-2"><p class="text-slate-500">${new Date(sg.fecha+'T00:00:00').toLocaleDateString('es-MX')} · ${psEscape(sg.autor)}</p><p class="text-slate-700">${psEscape(sg.texto)}</p></div>`).join('') || '<p class="text-xs text-slate-400">Sin seguimientos.</p>'}</div></div>
            <div><h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Nuevo seguimiento</h4><input type="date" id="au-seg-fecha" value="${new Date().toISOString().slice(0,10)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><textarea id="au-seg-texto" rows="2" placeholder="Qué se hizo / compromiso..." class="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea><button data-bx-click="a522" data-p0="${bxE(function(){return c.id})}" class="mt-2 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"><i class="fas fa-calendar-plus mr-1"></i> Agregar seguimiento</button></div>
        </div>
    </div>`);
}
function auCambiarEstado(id){
    const d = auD(); const c = d.clientes.find(x=>x.id===id); if(!c) return;
    if(!vcVisible(c)){ showToast('No tienes acceso a este cliente','warning'); return; }
    const nuevo = (document.getElementById('au-c-estado-nuevo')||{}).value; if(!nuevo) return;
    const anterior = c.estado||'Prospección';
    c.estado = nuevo; c.seguimientos = c.seguimientos||[];
    c.seguimientos.push({ fecha:new Date().toISOString().slice(0,10), autor:currentUser.name, texto:'Etapa: '+anterior+' → '+nuevo+'.' });
    cmLog('Agencia Automotriz','Cambio de etapa', c.nombre+': '+anterior+' → '+nuevo);
    saveDB(); showToast('Etapa actualizada','success'); auDetalleCliente(id); render();
}
function auAddSeg(id){
    const d = auD(); const c = d.clientes.find(x=>x.id===id); if(!c) return;
    if(!vcVisible(c)){ showToast('No tienes acceso a este cliente','warning'); return; }
    const fecha = (document.getElementById('au-seg-fecha')||{}).value || new Date().toISOString().slice(0,10);
    const texto = ((document.getElementById('au-seg-texto')||{}).value||'').trim();
    if(!texto){ showToast('Escribe el detalle del seguimiento','warning'); return; }
    c.seguimientos = c.seguimientos||[];
    c.seguimientos.push({ fecha, autor:currentUser.name, texto });
    cmLog('Agencia Automotriz','Seguimiento', c.nombre+': '+texto.slice(0,80));
    saveDB(); showToast('Seguimiento registrado','success'); auDetalleCliente(id); render();
}
function auBorrarCliente(id){
    const rol=(currentUser.role||'').toLowerCase();
    if(rol!=='gm' && rol!=='admin'){ showToast('Solo GM/admin puede eliminar clientes','warning'); return; }
    if(!confirm('¿Eliminar este cliente de la agencia automotriz?')) return;
    const d = auD(); const c = d.clientes.find(x=>x.id===id);
    d.clientes = d.clientes.filter(x=>x.id!==id);
    cmLog('Agencia Automotriz','Eliminó cliente', c?c.nombre:'');
    saveDB(); closeModal(); showToast('Cliente eliminado','success'); render();
}
function auEquipoHtml(){
    const d = auD();
    const ids = sinPuedeTodo() ? null : ((currentUser.role||'').toLowerCase()==='agencia' ? sinIdsMiAgencia() : new Set([String(currentUser.id)]));
    const miembros = (db.users||[]).filter(u=>{ const rol=(u.role||'').toLowerCase(); if(!['agente','agente_agencia','agente_desarrollo','agencia'].includes(rol)) return false; if(ids) return ids.has(String(u.id)); return true; });
    const mesActual = new Date().toISOString().slice(0,7);
    const filas = miembros.map(m=>{
        const sus = d.ventas.filter(v=>String(v.agenteId)===String(m.id));
        const mes = sus.filter(v=>(v.fecha||'').slice(0,7)===mesActual);
        const logrado = mes.reduce((s,v)=>s+(Number(v.precio)||0),0);
        const mt = d.metas.find(x=>String(x.agenteId)===String(m.id) && x.mes===mesActual);
        const meta = mt?mt.monto:0;
        const pct = meta>0?Math.min(100,Math.round(logrado/meta*100)):(logrado>0?100:0);
        const uni = d.unidades.filter(u=>String(u.agenteId)===String(m.id));
        const disp = uni.filter(u=>(!u.estado||u.estado==='Disponible')).length;
        const pctColor = pct>=100?'bg-emerald-500':(pct>=50?'bg-indigo-500':(pct>0?'bg-amber-500':'bg-slate-300'));
        return `<tr class="border-t hover:bg-slate-50">
        <td class="p-3 font-medium">${psEscape(m.name)} <span class="text-[10px] uppercase text-slate-400">${psEscape(m.role||'')}</span></td>
        <td class="p-3 text-xs">${sus.length} ventas · $${Math.round(sus.reduce((s,v)=>s+(Number(v.precio)||0),0)).toLocaleString('es-MX')}</td>
        <td class="p-3 text-xs">$${Math.round(logrado).toLocaleString('es-MX')}${meta>0?' / $'+Number(meta).toLocaleString('es-MX'):' / sin meta'}</td>
        <td class="p-3 text-xs">${uni.length} · ${disp} disp.</td>
        <td class="p-3">${meta>0?`<div class="w-28 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${pctColor}" style="width:${pct}%"></div></div>`:'<span class="text-slate-300 text-xs">—</span>'}</td>
        <td class="p-3"><button data-bx-click="a523" data-p0="${bxE(function(){return m.id})}" class="text-xs px-2.5 py-1.5 border rounded-lg hover:bg-slate-50"><i class="fas fa-bullseye mr-1"></i>Meta</button></td>
    </tr>`;
    }).join('');
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h3 class="font-semibold text-lg">Equipo de la agencia (${miembros.length})</h3>
            <button data-bx-click="a524" class="text-sm text-indigo-600 font-medium hover:underline">Ver monitoreo <i class="fas fa-arrow-right ml-1"></i></button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-left text-slate-600"><tr><th class="p-3 font-medium">Miembro</th><th class="p-3 font-medium">Ventas acumuladas</th><th class="p-3 font-medium">Mes actual vs meta</th><th class="p-3 font-medium">Unidades (cargadas · disp.)</th><th class="p-3 font-medium">Avance</th><th class="p-3 font-medium">Meta</th></tr></thead>
                <tbody>${filas || '<tr><td colspan="6" class="p-8 text-center text-slate-500">Sin agentes en tu equipo todavía.</td></tr>'}</tbody>
            </table>
        </div>
        <p class="text-xs text-slate-400 mt-3"><i class="fas fa-circle-info mr-1"></i>Las unidades cargadas por cada agente cuentan para su tablero; las ventas se registran al vender unidades del inventario.</p>
    </div>`;
}
function auMetaEditor(agenteId){
    const d = auD();
    const mesActual = new Date().toISOString().slice(0,7);
    let mt = d.metas.find(x=>String(x.agenteId)===String(agenteId) && x.mes===mesActual);
    if(!mt){ mt={agenteId, mes:mesActual, monto:0}; d.metas.push(mt); }
    const m = (db.users||[]).find(u=>String(u.id)===String(agenteId))||{};
    showModal(`<div class="p-6">
        <h3 class="text-lg font-bold mb-1">Meta del mes — ${psEscape(m.name||'Agente')}</h3>
        <p class="text-xs text-slate-500 mb-3">Meta en pesos de unidades vendidas · ${mesActual}</p>
        <input id="au-meta-monto" type="number" value="${mt.monto||0}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
        <div class="flex justify-end gap-2 mt-4">
            <button data-bx-click="a1" class="px-4 py-2 border rounded-lg">Cancelar</button>
            <button data-bx-click="a525" data-p0="${bxE(function(){return agenteId})}" class="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold">Guardar</button>
        </div>
    </div>`);
}
function auMetaGuardar(agenteId){
    const d = auD();
    const mesActual = new Date().toISOString().slice(0,7);
    const monto = parseFloat((document.getElementById('au-meta-monto')||{}).value)||0;
    let mt = d.metas.find(x=>String(x.agenteId)===String(agenteId) && x.mes===mesActual);
    if(!mt){ mt={agenteId, mes:mesActual, monto:0}; d.metas.push(mt); }
    mt.monto = monto;
    cmLog('Agencia Automotriz','Meta definida', 'Agente '+agenteId+': $'+monto);
    saveDB(); closeModal(); showToast('Meta guardada','success'); render();
}
function auMonitoreoHtml(){
    const d = auD();
    const ids = sinPuedeTodo() ? null : ((currentUser.role||'').toLowerCase()==='agencia' ? sinIdsMiAgencia() : new Set([String(currentUser.id)]));
    const miembros = (db.users||[]).filter(u=>{ const rol=(u.role||'').toLowerCase(); if(!['agente','agente_agencia','agente_desarrollo','agencia'].includes(rol)) return false; if(ids) return ids.has(String(u.id)); return true; });
    const porAgente = miembros.map(m=>{ const sus = d.ventas.filter(v=>String(v.agenteId)===String(m.id)); return { nombre:m.name, n:sus.length, monto:sus.reduce((s,v)=>s+(Number(v.precio)||0),0) }; }).sort((a,b)=>b.monto-a.monto);
    const marcasAgg = {};
    d.ventas.forEach(v=>{ const k=v.marca||'Otra'; marcasAgg[k]=(marcasAgg[k]||0)+1; });
    const marcasRows = Object.keys(marcasAgg).sort((a,b)=>marcasAgg[b]-marcasAgg[a]).slice(0,6).map(m=>`<div class="flex items-center justify-between text-xs py-1 border-b border-slate-100"><span>${psEscape(m)}</span><b>${marcasAgg[m]}</b></div>`).join('');
    const estAgg = { 'Disponible':0, 'Reservada':0, 'Vendida':0 };
    d.unidades.forEach(u=>{ estAgg[u.estado||'Disponible']=(estAgg[u.estado||'Disponible']||0)+1; });
    const estRows = Object.keys(estAgg).map(e=>`<div class="flex items-center justify-between text-xs py-1 border-b border-slate-100"><span>${e}</span><b>${estAgg[e]}</b></div>`).join('');
    const mesActual = new Date().toISOString().slice(0,7);
    const ventasPropias = d.ventas.filter(v=>(v.fecha||'').slice(0,7)===mesActual && (ids ? ids.has(String(v.agenteId)) : true));
    const ventasMes = ventasPropias;
    const montoMes = ventasPropias.reduce((s,v)=>s+(Number(v.precio)||0),0);
    const porAgencia = {};
    d.ventas.forEach(v=>{ const ag=(db.users||[]).find(u=>String(u.id)===String(v.agenteId)); let nombre='Venta directa';
        if(ag){ if((ag.role||'').toLowerCase()==='agencia'){ nombre=ag.name; } else { const agn=(db.users||[]).find(x=>String(x.id)===String(ag.agenciaId||ag.parentId||ag.agencia||'')&&(x.role||'').toLowerCase()==='agencia'); nombre=agn?agn.name:'Venta directa'; } }
        porAgencia[nombre]=porAgencia[nombre]||{n:0,monto:0}; porAgencia[nombre].n++; porAgencia[nombre].monto+=(Number(v.precio)||0); });
    const agenciaRows = Object.keys(porAgencia).sort((a,b)=>porAgencia[b].monto-porAgencia[a].monto).map(n=>`<div class="flex items-center justify-between text-xs py-1 border-b border-slate-100"><span class="truncate">${psEscape(n)}</span><b>${porAgencia[n].n} · $${Math.round(porAgencia[n].monto).toLocaleString('es-MX')}</b></div>`).join('');
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 class="font-semibold text-lg mb-4"><i class="fas fa-chart-line text-indigo-600 mr-2"></i>Monitoreo de la agencia automotriz</h3>
        <div class="grid grid-cols-3 gap-3 mb-5">
            <div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] uppercase text-slate-400">Ventas del mes</p><p class="text-xl font-bold mt-1">${ventasMes.length}</p></div>
            <div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] uppercase text-slate-400">Monto del mes</p><p class="text-xl font-bold mt-1">$${Math.round(montoMes).toLocaleString('es-MX')}</p></div>
            <div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] uppercase text-slate-400">Ticket promedio</p><p class="text-xl font-bold mt-1">$${Math.round(ventasMes.length?montoMes/ventasMes.length:0).toLocaleString('es-MX')}</p></div>
        </div>
        <div class="grid lg:grid-cols-2 gap-6">
            <div><h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Resultados por agencia</h4>${agenciaRows || '<p class="text-xs text-slate-400">Sin ventas registradas todavía.</p>'}</div>
            <div><h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Ventas por agente</h4>${porAgente.map(x=>`<div class="flex items-center justify-between text-xs py-1 border-b border-slate-100"><span>${psEscape(x.nombre)}</span><b>${x.n} · $${Math.round(x.monto).toLocaleString('es-MX')}</b></div>`).join('') || '<p class="text-xs text-slate-400">Sin ventas aún.</p>'}</div>
        </div>
        <div class="grid lg:grid-cols-2 gap-6 mt-6">
            <div><h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Ventas por marca</h4>${marcasRows || '<p class="text-xs text-slate-400">Sin ventas aún.</p>'}</div>
            <div><h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Inventario por estado</h4>${estRows}</div>
        </div>
    </div>`;
}
function auMetasHtml(){
    const d = auD();
    const mesActual = new Date().toISOString().slice(0,7);
    const ids = sinPuedeTodo() ? null : ((currentUser.role||'').toLowerCase()==='agencia' ? sinIdsMiAgencia() : new Set([String(currentUser.id)]));
    const miembros = (db.users||[]).filter(u=>{ const rol=(u.role||'').toLowerCase(); if(!['agente','agente_agencia','agente_desarrollo','agencia'].includes(rol)) return false; if(ids) return ids.has(String(u.id)); return true; });
    const filas = miembros.map(m=>{
        const mt = d.metas.find(x=>String(x.agenteId)===String(m.id) && x.mes===mesActual);
        const logrado = d.ventas.filter(v=>String(v.agenteId)===String(m.id) && (v.fecha||'').slice(0,7)===mesActual).reduce((s,v)=>s+(Number(v.precio)||0),0);
        const pct = mt&&mt.monto>0?Math.min(100,Math.round(logrado/mt.monto*100)):0;
        const pctColor = pct>=100?'bg-emerald-500':(pct>=50?'bg-indigo-500':(pct>0?'bg-amber-500':'bg-slate-300'));
        return `<tr class="border-t hover:bg-slate-50">
        <td class="p-3 font-medium">${psEscape(m.name)}</td>
        <td class="p-3">${mt?'$'+Number(mt.monto).toLocaleString('es-MX'):'<span class="text-slate-300">—</span>'}</td>
        <td class="p-3 text-xs">$${Math.round(logrado).toLocaleString('es-MX')}</td>
        <td class="p-3"><div class="flex items-center gap-2"><div class="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div class="h-full ${pctColor}" style="width:${pct}%"></div></div><span class="text-xs font-semibold">${pct}%</span></div></td>
        <td class="p-3"><button data-bx-click="a523" data-p0="${bxE(function(){return m.id})}" class="text-xs px-2.5 py-1.5 border rounded-lg hover:bg-slate-50"><i class="fas fa-pen mr-1"></i>Meta</button></td>
    </tr>`;
    }).join('');
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h3 class="font-semibold text-lg">Metas de venta por agente — ${mesActual}</h3>
            <p class="text-xs text-slate-400">En pesos de unidades vendidas del mes</p>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm">
                <thead class="bg-slate-50 text-left text-slate-600"><tr><th class="p-3 font-medium">Agente</th><th class="p-3 font-medium">Meta del mes</th><th class="p-3 font-medium">Logrado</th><th class="p-3 font-medium">Avance</th><th class="p-3 font-medium">Acción</th></tr></thead>
                <tbody>${filas || '<tr><td colspan="5" class="p-8 text-center text-slate-500">Sin agentes.</td></tr>'}</tbody>
            </table>
        </div>
    </div>`;
}
function auSimHtml(){
    const d = auD();
    const esGM = sinPuedeTodo();
    const c = d.simConfig || { comisionPct:5, comisionBancoPct:2, finMovies:'', unidadesMes:8, metaMes:60000, bonoUnidad:500, bonoQuincena:1500 };
    const ro = esGM?'':'disabled';
    const inp = (id,val,label,ph,suffix)=>`<div><label class="text-sm font-medium text-slate-700 mb-1 block">${label}</label><input id="${id}" type="number" step="0.01" ${ro} value="${val}" placeholder="${ph||''}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${suffix?`<p class="text-[11px] text-slate-400 mt-1">${suffix}</p>`:''}</div>`;
    return `<div class="space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h3 class="font-semibold text-lg"><i class="fas fa-calculator text-orange-600 mr-2"></i>Simulador de ingresos — venta de autos</h3>
                ${esGM?`<button data-bx-click="a526" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"><i class="fas fa-floppy-disk mr-1"></i> Guardar configuración</button>`:`<span class="text-[11px] text-slate-400">Parámetros definidos por la dirección.</span>`}
            </div>
            <div class="grid md:grid-cols-4 gap-4 mb-4">
                ${inp('au-sim-meta', c.metaMes||60000, '¿Cuánto quieres ganar al mes? $')}
                ${inp('au-sim-precio', 280000, 'Precio promedio de unidad $')}
                ${inp('au-sim-com', c.comisionPct, 'Comisión por unidad %', '', 'Ej. 5% de una unidad vendida')}
                ${inp('au-sim-banco', c.comisionBancoPct, 'Comisión de financiamiento %', '', 'Lo que paga la financiera sobre el monto financiado')}
            </div>
            <div class="grid md:grid-cols-4 gap-4">
                ${inp('au-sim-eng', 20, 'Enganche típico %')}
                ${inp('au-sim-fin', 80, 'Monto típico financiado %')}
                ${inp('au-sim-bono1', c.bonoUnidad, 'Bono fijo por unidad $')}
                ${inp('au-sim-bono2', c.bonoQuincena, 'Bono quincenal $')}
            </div>
            <div id="au-sim-res" class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm"></div>
            <p class="text-xs text-slate-500 mt-3">Ingreso por unidad = precio × comisión% + (precio × financiado% × comisión banco%) + bono por unidad. Se muestra cuántas unidades necesitas vender al mes y tu ingreso estimado con bonos.</p>
        </div>

        <div class="bg-white rounded-2xl border border-amber-200/80 p-6">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                <div>
                    <h3 class="font-semibold text-lg flex items-center gap-2"><i class="fas fa-car text-emerald-600"></i> Simulador de Financiamiento para el Cliente (#13)</h3>
                    <p class="text-xs text-slate-500">Cotiza al instante enganche, plazo y mensualidad/quincena para compartir por WhatsApp con tu prospecto.</p>
                </div>
                <button type="button" data-bx-click="a527" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"><i class="fab fa-whatsapp"></i> Compartir corrida por WhatsApp</button>
            </div>
            <div class="grid md:grid-cols-4 gap-4 mb-4">
                <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Valor del Auto ($)</label><input id="au-cli-sim-precio" type="number" value="285000" data-bx-input="a528" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
                <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Enganche (%)</label><input id="au-cli-sim-eng" type="number" value="20" min="10" max="80" data-bx-input="a528" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
                <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Plazo (meses)</label><select id="au-cli-sim-plazo" data-bx-change="a529" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="12">12 meses</option><option value="24">24 meses</option><option value="36">36 meses</option><option value="48" selected>48 meses</option><option value="60">60 meses</option></select></div>
                <div><label class="text-xs font-semibold text-slate-600 mb-1 block">Tasa anual estimada (%)</label><input id="au-cli-sim-tasa" type="number" step="0.1" value="14.9" data-bx-input="a528" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            </div>
            <div id="au-cli-sim-out" class="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm"></div>
        </div>
    </div>`;
}
function auSimClienteCalc(){
    const precio = parseFloat((document.getElementById('au-cli-sim-precio')||{}).value)||285000;
    const engPct = parseFloat((document.getElementById('au-cli-sim-eng')||{}).value)||20;
    const plazo = parseInt((document.getElementById('au-cli-sim-plazo')||{}).value,10)||48;
    const tasaAnual = parseFloat((document.getElementById('au-cli-sim-tasa')||{}).value)||14.9;
    const enganche = precio * (engPct / 100);
    const financiar = Math.max(0, precio - enganche);
    const r = (tasaAnual / 100) / 12;
    const mensual = r > 0 ? (financiar * r) / (1 - Math.pow(1 + r, -plazo)) : (financiar / plazo);
    const quincenal = mensual / 2;
    const out = document.getElementById('au-cli-sim-out');
    if(out){
        out.innerHTML = `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><p class="text-xs text-slate-500">Enganche (${engPct}%)</p><p class="text-lg font-bold text-slate-900">$${Math.round(enganche).toLocaleString('es-MX')}</p></div>
            <div><p class="text-xs text-slate-500">Monto a financiar</p><p class="text-lg font-bold text-slate-900">$${Math.round(financiar).toLocaleString('es-MX')}</p></div>
            <div><p class="text-xs text-slate-500">Mensualidad (${plazo} m)</p><p class="text-xl font-black text-emerald-700">$${Math.round(mensual).toLocaleString('es-MX')}</p></div>
            <div><p class="text-xs text-slate-500">Pago Quincenal aprox.</p><p class="text-xl font-black text-amber-700">$${Math.round(quincenal).toLocaleString('es-MX')}</p></div>
        </div>`;
    }
    return { precio, engPct, enganche, financiar, plazo, tasaAnual, mensual, quincenal };
}
function auSimClienteWhatsApp(){
    const c = auSimClienteCalc();
    const txt = `🚗 *Cotización Estimada de Financiamiento*\n• Precio unidad: $${Math.round(c.precio).toLocaleString('es-MX')}\n• Enganche (${c.engPct}%): $${Math.round(c.enganche).toLocaleString('es-MX')}\n• Plazo: ${c.plazo} meses\n• Mensualidad aprox.: *$${Math.round(c.mensual).toLocaleString('es-MX')}*\n• Quincena aprox.: *$${Math.round(c.quincenal).toLocaleString('es-MX')}*\n¿Agendamos tu prueba de manejo hoy?`;
    window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
}
function auSimCalc(){
    const meta = parseFloat((document.getElementById('au-sim-meta')||{}).value)||0;
    const precio = parseFloat((document.getElementById('au-sim-precio')||{}).value)||0;
    const com = parseFloat((document.getElementById('au-sim-com')||{}).value)||0;
    const banco = parseFloat((document.getElementById('au-sim-banco')||{}).value)||0;
    const eng = parseFloat((document.getElementById('au-sim-eng')||{}).value)||0;
    const fin = parseFloat((document.getElementById('au-sim-fin')||{}).value)||0;
    const bono1 = parseFloat((document.getElementById('au-sim-bono1')||{}).value)||0;
    const bono2 = parseFloat((document.getElementById('au-sim-bono2')||{}).value)||0;
    const comUnidad = precio*(com/100);
    const comFin = precio*(Math.min(100,Math.max(0,fin))/100)*(banco/100);
    const porUnidad = comUnidad + comFin + bono1;
    const porMes = porUnidad + bono2*2;
    const unidades = porMes>0?Math.ceil(meta/porMes):0;
    const ingreso = unidades*porMes;
    const res = document.getElementById('au-sim-res');
    if(res) res.innerHTML = `<b>Resultado:</b> con un ticket de <b>$${Math.round(precio).toLocaleString('es-MX')}</b> ganas <b>$${Math.round(porUnidad).toLocaleString('es-MX')}</b> por unidad (comisión $${Math.round(comUnidad).toLocaleString('es-MX')} + financiamiento $${Math.round(comFin).toLocaleString('es-MX')} + bono $${Math.round(bono1).toLocaleString('es-MX')}), y <b>$${Math.round(porMes).toLocaleString('es-MX')}</b> al mes por agente con bonos quincenales. Para ganar <b>$${Math.round(meta).toLocaleString('es-MX')}</b> necesitas vender aprox <b>${unidades} unidad(es) al mes</b> → ingreso estimado <b>$${Math.round(ingreso).toLocaleString('es-MX')}</b>.`;
}
function auSimBind(){
    ['au-sim-meta','au-sim-precio','au-sim-com','au-sim-banco','au-sim-eng','au-sim-fin','au-sim-bono1','au-sim-bono2'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input', auSimCalc); });
    auSimCalc();
    auSimClienteCalc();
}
function auSimGuardar(){
    if(!sinPuedeTodo()){ showToast('Solo GM/desarrollador/admin puede editar el simulador','warning'); return; }
    const d = auD();
    const lee=(id)=>parseFloat((document.getElementById(id)||{}).value)||0;
    d.simConfig = { comisionPct:lee('au-sim-com'), comisionBancoPct:lee('au-sim-banco'), unidadesMes:lee('au-sim-unidades')||8, metaMes:lee('au-sim-meta'), bonoUnidad:lee('au-sim-bono1'), bonoQuincena:lee('au-sim-bono2') };
    cmLog('Agencia Automotriz','Guardó simulador', 'Comisión '+d.simConfig.comisionPct+'% · banco '+d.simConfig.comisionBancoPct+'%');
    saveDB(); showToast('Configuración guardada','success'); render();
}
function auGuionHtml(){
    const d = auD();
    const esGM = sinPuedeTodo();
    const g = d.guion;
    const ro = esGM?'':'disabled';
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
            <h3 class="font-semibold text-lg"><i class="fas fa-phone-volume text-indigo-600 mr-2"></i>Guion de llamadas — piso de venta</h3>
            ${esGM?`<button data-bx-click="a530" class="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700"><i class="fas fa-floppy-disk mr-1"></i> Guardar guion</button>`:`<span class="text-[11px] text-slate-400">Definido por la dirección.</span>`}
        </div>
        <div class="space-y-4">
            ${[['apertura','1. Apertura (primer contacto)'],['interes','2. Descubrimiento de interés'],['prueba','3. Invitación a prueba de manejo'],['credito','4. Precalificación de crédito'],['cierre','5. Cierre / apartado']].map(([k,lb])=>`<div><label class="text-sm font-medium text-slate-700 mb-1 block">${lb}</label><textarea id="au-g-${k}" rows="2" ${ro} class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${psEscape(g[k]||'')}</textarea></div>`).join('')}
        </div>
        <div class="mt-4 p-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg"><i class="fas fa-lightbulb mr-1"></i>Tip: nunca cotices por WhatsApp sin antes agendar visita o prueba de manejo; el objetivo de cada llamada es traer al cliente al piso.</div>
    </div>`;
}
function auGuionGuardar(){
    if(!sinPuedeTodo()){ showToast('Solo GM/desarrollador/admin puede editar el guion','warning'); return; }
    const d = auD();
    const lee=(k)=>((document.getElementById('au-g-'+k)||{}).value||'').trim();
    d.guion = { apertura:lee('apertura'), interes:lee('interes'), prueba:lee('prueba'), credito:lee('credito'), cierre:lee('cierre') };
    cmLog('Agencia Automotriz','Editó guion de llamadas','');
    saveDB(); showToast('Guion guardado','success'); render();
}
function auPautaHtml(){
    const d = auD();
    const esGM = sinPuedeTodo();
    const fQ = String(window.auPubQ||'').toLowerCase().trim();
    let lista = d.publicidad.slice();
    if(fQ) lista = lista.filter(p=>[p.titulo,p.texto].some(x=>String(x||'').toLowerCase().includes(fQ)));
    const card = (p)=>`<div class="bg-white border border-slate-200 rounded-xl p-4">
        <div class="flex items-start justify-between gap-2 mb-1">
            <h4 class="font-bold text-sm">${psEscape(p.titulo)}</h4>
            ${esGM?`<button data-bx-click="a531" data-p0="${bxE(function(){return p.id})}" class="text-rose-400 hover:text-rose-600 text-xs"><i class="fas fa-trash"></i></button>`:''}
        </div>
        ${p.imagen?`<img loading="lazy" decoding="async" src="${p.imagen}" class="w-full h-36 object-cover rounded-lg mb-2 border">`:''}
        <p class="text-xs text-slate-600 whitespace-pre-wrap">${psEscape(p.texto)}</p>
        <div class="flex gap-1.5 mt-2 flex-wrap">${(p.tags||[]).map(t=>`<span class="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-600">#${psEscape(t)}</span>`).join('')}</div>
        <div class="flex gap-2 mt-3">
            <button data-bx-click="a532" data-p0="${bxE(function(){return p.id})}" class="text-xs px-2.5 py-1.5 bg-slate-900 text-white rounded-lg hover:bg-slate-700"><i class="fas fa-copy mr-1"></i> Copiar texto</button>
            ${p.imagen?`<a href="${p.imagen}" download="promocion" class="text-xs px-2.5 py-1.5 border rounded-lg hover:bg-slate-50"><i class="fas fa-download mr-1"></i> Imagen</a>`:''}
        </div>
    </div>`;
    return `<div class="space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-4">
                <h3 class="font-semibold text-lg"><i class="fas fa-bullhorn text-indigo-600 mr-2"></i>Publicidad y pauta del piso</h3>
                <div class="flex gap-2">
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input value="${psEscape(window.auPubQ||'')}" data-bx-input="a533" placeholder="Buscar pieza..." class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    </div>
                    ${esGM?`<button data-bx-click="a534" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><i class="fas fa-plus mr-1"></i> Nueva pieza</button>`:''}
                </div>
            </div>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">${lista.map(card).join('') || '<p class="text-sm text-slate-400 col-span-full">Sin piezas publicitarias todavía.</p>'}</div>
        </div>
    </div>`;
}
function auPautaNueva(){
    if(!sinPuedeTodo()){ showToast('Solo GM/desarrollador/admin puede crear piezas','warning'); return; }
    showModal(`<form id="au-pub-form" class="p-6">
        <h3 class="text-xl font-bold mb-4">Nueva pieza publicitaria</h3>
        <div class="space-y-3">
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Título *</label><input id="au-p-titulo" required class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Texto para WhatsApp / redes</label><textarea id="au-p-texto" rows="4" placeholder="Ej. 🔥 SEMANA DE OFERTA: Enganche desde $35,000 en Chevy 2023..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Imagen (opcional)</label><input id="au-p-img" type="file" accept="image/*" class="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Etiquetas (separadas por coma)</label><input id="au-p-tags" placeholder="oferta, sedan, enganche" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-lg border">Cancelar</button>
            <button type="submit" class="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">Guardar</button>
        </div>
    </form>`);
    setTimeout(()=>{ const f=document.getElementById('au-pub-form'); if(f) f.onsubmit=(e)=>{ e.preventDefault(); auPautaGuardar(); }; },0);
}
function auPautaGuardar(){
    const d = auD();
    const lee=(k)=>((document.getElementById(k)||{}).value||'').trim();
    const p = { id:Date.now(), titulo:lee('au-p-titulo'), texto:lee('au-p-texto'), tags:lee('au-p-tags').split(',').map(x=>x.trim()).filter(Boolean) };
    if(!p.titulo){ showToast('Escribe el título de la pieza','warning'); return; }
    const guardar=(img)=>{ if(img) p.imagen=img; d.publicidad.unshift(p); cmLog('Agencia Automotriz','Nueva pieza publicitaria', p.titulo); saveDB(); closeModal(); showToast('Pieza guardada','success'); render(); };
    const f = document.getElementById('au-p-img').files[0];
    if(f){
        if (window.Media && window.Backend && window.Backend.available) {
            window.Media.subir(f, { scope:'autoHub' }).then(item=>guardar(item.url)).catch(()=>auFileLocal(f, guardar));
        } else auFileLocal(f, guardar);
    } else guardar(null);
}
function auPautaCopiar(id){
    const p = auD().publicidad.find(x=>x.id===id); if(!p) return;
    const txt = p.titulo+'\n\n'+(p.texto||'')+'\n'+(p.tags||[]).map(t=>'#'+t).join(' ');
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(()=>showToast('Texto copiado','success')).catch(()=>showToast('Copia manual: '+txt.slice(0,40)+'…','warning')); }
    else showToast('Tu navegador no permite copiar automático','warning');
}
function auPautaBorrar(id){
    if(!sinPuedeTodo()){ showToast('Solo GM/desarrollador/admin puede eliminar piezas','warning'); return; }
    if(!confirm('¿Eliminar esta pieza publicitaria?')) return;
    const d = auD();
    d.publicidad = d.publicidad.filter(x=>x.id!==id);
    saveDB(); showToast('Pieza eliminada','success'); render();
}
function auPracticaHtml(){
    const d = auD();
    const mis = d.practica.filter(s=>String(s.usuarioId)===String(currentUser.id));
    const prom = mis.length?Math.round(mis.reduce((s,x)=>s+(Number(x.score)||0),0)/mis.length):0;
    return `<div class="space-y-4">
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 class="font-semibold text-lg"><i class="fas fa-chalkboard-user text-indigo-600 mr-2"></i>Practica tus sesiones — comprador de autos</h3>
                <button data-bx-click="a535" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-play mr-1"></i> Iniciar práctica</button>
            </div>
            <div class="grid grid-cols-3 gap-3 mb-4">
                <div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] uppercase text-slate-400">Sesiones</p><p class="text-xl font-bold mt-1">${mis.length}</p></div>
                <div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] uppercase text-slate-400">Score promedio</p><p class="text-xl font-bold mt-1">${prom||'—'}</p></div>
                <div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] uppercase text-slate-400">Mejor score</p><p class="text-xl font-bold mt-1">${mis.length?Math.max(...mis.map(x=>Number(x.score)||0)):'—'}</p></div>
            </div>
            <div id="au-practica-chat" class="border border-slate-200 rounded-xl p-4 bg-slate-50 min-h-[120px] space-y-2">
                <p class="text-xs text-slate-400">Presiona <b>Iniciar práctica</b>: el comprador virtual te hará preguntas reales de piso (precio, crédito, prueba de manejo) y al terminar recibes una calificación con tips.</p>
            </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <h4 class="font-semibold text-sm mb-2">Historial</h4>
            ${mis.slice().reverse().map((s,i)=>`<div class="text-xs py-1.5 border-b border-slate-100 flex items-center justify-between"><span>${new Date(s.ts).toLocaleString('es-MX')} · ${psEscape((s.obstaculo||'').slice(0,40))}</span><b class="${(Number(s.score)||0)>=70?'text-emerald-600':'text-amber-600'}">${s.score||0}/100</b></div>`).join('') || '<p class="text-xs text-slate-400">Sin sesiones todavía.</p>'}
        </div>
    </div>`;
}
const AU_PRACTICA_OBSTACULOS = [
    { q:'¿Es el último precio? Deme un descuento y me lo llevo hoy.', tips:'Evita regalar descuento: cambia el valor por accesorios, garantía extendida o tasa preferencial. Ancla primero el valor de la unidad.' },
    { q:'Lo voy a pensar con mi esposa, mándeme información por WhatsApp.', tips:'Objeción de dilación: agenda la prueba de manejo antes de despedirte. "¿Qué le parecería que se la lleve a probar el sábado por la mañana?"' },
    { q:'En la agencia de enfrente me la dejan más barata.', tips:'No compitas solo por precio: pregunta por qué les conviene, compara garantía, servicio y financiación. Pide ver la unidad competidora.' },
    { q:'No traigo para el enganche ahorita.', tips:'Explora esquemas: enganche diferido, toma a cuenta tu auto usado, o financiamiento del enganche. Pregunta cuánto tendría disponible y para cuándo.' },
    { q:'Mejor espero al Buen Fin / fin de año que habrá ofertas.', tips:'Cuantifica el costo de esperar: disponibilidad de la unidad exacta, alza de precios de año modelo y tasa actual. Crea urgencia real, no falsa.' }
];
function auPracticaIniciar(){
    const d = auD();
    const obst = AU_PRACTICA_OBSTACULOS[Math.floor(Math.random()*AU_PRACTICA_OBSTACULOS.length)];
    const chat = document.getElementById('au-practica-chat');
    if(!chat) return;
    chat.innerHTML = `<div class="flex justify-start"><div class="max-w-[85%] rounded-xl px-3 py-2 text-xs bg-white border border-slate-200"><p class="font-semibold text-slate-500">Comprador virtual</p><p>${psEscape(obst.q)}</p></div></div>
    <textarea id="au-practica-resp" rows="3" placeholder="Tu respuesta como asesor de piso..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea>
    <button ${bxOn('click','auPracticaCalificar',[obst.q, obst.tips])} class="px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-medium"><i class="fas fa-paper-plane mr-1"></i> Terminar y calificar</button>`;
}
function auPracticaCalificar(qEnc, tipsEnc){
    const resp = ((document.getElementById('au-practica-resp')||{}).value||'').trim();
    if(!resp){ showToast('Escribe tu respuesta antes de calificar','warning'); return; }
    const d = auD();
    const largo = Math.min(20, Math.round(resp.length/15));
    const claves = ['precio','enganche','financ','cr\u00e9dito','prueba','manejo','garant\u00eda','apartado','se\u00f1al','meses','tasa','hoy','ma\u00f1ana','s\u00e1bado','unidad','auto'];
    const hits = claves.filter(k=>resp.toLowerCase().includes(k)).length;
    const score = Math.max(10, Math.min(100, 30 + largo + hits*8));
    const tips = decodeURIComponent(tipsEnc);
    const chat = document.getElementById('au-practica-chat');
    if(chat) chat.innerHTML = `<div class="bg-white border rounded-xl p-3 text-sm"><p class="font-bold ${score>=70?'text-emerald-600':'text-amber-600'}">Calificación: ${score}/100</p><p class="text-xs text-slate-600 mt-1"><b>Obstáculo:</b> ${psEscape(decodeURIComponent(qEnc))}</p><p class="text-xs text-slate-600 mt-1"><b>Tip del entrenador:</b> ${psEscape(tips)}</p></div>`;
    d.practica.push({ ts:new Date().toISOString(), usuarioId:currentUser.id, usuario:currentUser.name, obstaculo:decodeURIComponent(qEnc), score });
    cmLog('Agencia Automotriz','Práctica de venta', currentUser.name+': '+score+'/100');
    saveDB(); showToast('Sesión calificada: '+score+'/100','success');
    setTimeout(()=>{ if(window.render) render(); }, 50);
}
function auInitTab(){
    try{
        const tab = auTab();
        if(tab==='simulador') auSimBind();
    }catch(e){}
}

/* ==================== VERTICALES COMERCIALES (Automotriz / Financiero / Inmobiliario) ==================== */
const VC_CONFIG = {
'auto-cartera': {
        nombre: 'Cartera Automotriz', agencia: 'Agencia de autos', unidad: 'Vehículo', tabla: 'autoCartera',
        secciones: ['Prospección', 'Interés', 'Prueba de manejo', 'Crédito / Financiamiento', 'Cierre'],
        campos: [
            { k:'auto', label:'Vehículo de interés', ph:'Marca, modelo, año' },
            { k:'precio', label:'Precio / valor ($)', t:'number' },
            { k:'enganche', label:'Enganche ($)', t:'number' },
            { k:'financiera', label:'Financiera / banco', ph:'Ej. Banorte, BBVA, Ford Credit' },
            { k:'monto', label:'Monto del crédito ($)', t:'number' },
            { k:'plazo', label:'Plazo (meses)', t:'number' },
            { k:'asesor', label:'Asesor de piso', ph:'Nombre del asesor de la agencia' }
        ]
    },
    'fin-cartera': {
        nombre: 'Cartera Financiera', agencia: 'Agencia financiera / hipotecaria', unidad: 'Caso', tabla: 'finCartera',
        secciones: ['Prospección', 'Perfilamiento', 'Solicitud', 'Análisis / Dictamen', 'Formalización'],
        campos: [
            { k:'producto', label:'Producto de interés', ph:'Hipotecario, póliza de inversión, préstamo, retiro' },
            { k:'monto', label:'Monto solicitado / a invertir ($)', t:'number' },
            { k:'institucion', label:'Institución', ph:'Banco, SOFOM o aseguradora' },
            { k:'plazo', label:'Plazo (meses o años)', ph:'Ej. 240 meses / 20 años' },
            { k:'destino', label:'Destino / propósito', ph:'Adquisición de vivienda, retiro, ahorro...' },
            { k:'asesor', label:'Asesor', ph:'Nombre del asesor financiero' }
        ]
    },
    'inm-cartera': {
        nombre: 'Cartera Inmobiliaria', agencia: 'Inmobiliaria / cartera de propiedades', unidad: 'Propiedad', tabla: 'inmCartera',
        secciones: ['Captación', 'Publicación', 'Visitas', 'Negociación', 'Cierre / Escrituración'],
        campos: [
            { k:'rol', label:'El cliente es', t:'select', opciones:['Propietario (venta)','Propietario (renta)','Comprador','Rentador'] },
            { k:'propiedad', label:'Propiedad', ph:'Dirección o nombre del desarrollo' },
            { k:'tipo', label:'Tipo', t:'select', opciones:['Casa','Departamento','Terreno','Local / Oficina','Desarrollo'] },
            { k:'precio', label:'Precio / renta mensual ($)', t:'number' },
            { k:'credito', label:'Crédito del comprador', ph:'Infonavit, Fovissste, hipotecario, contado' },
            { k:'asesor', label:'Asesor inmobiliario', ph:'Nombre del asesor' }
        ]
    }
};
function vcCfg(id){ return VC_CONFIG[id]; }
function vcCartera(id){ const t=vcCfg(id).tabla; if(!Array.isArray(db[t])) db[t]=[]; return db[t]; }
/* Antes escribía SÓLO en localStorage, así que la Cartera (Auto/Financiera/
 * Inmobiliaria) nunca llegaba al servidor: el registro vivía en este equipo y
 * desaparecía al cambiar de máquina. Ahora pasa por saveDB, que persiste local
 * Y dispara la sincronización con Supabase. */
function vcSave(id){ void id; saveDB(); }
// Visibilidad: mismo modelo que Siniestros — gm/dev/admin todo; agencia lo de sus agentes; agente lo suyo
function vcVisible(r){
    if(sinPuedeTodo()) return true;
    if((currentUser.role||'').toLowerCase()==='agencia') return sinIdsMiAgencia().has(String(r.agenteId));
    return String(r.agenteId)===String(currentUser.id);
}
function vcRender(id){
    const cfg = vcCfg(id);
    if(!cfg){ return '<p class="text-slate-500">Vertical no encontrada.</p>'; }
    const registros = vcCartera(id).filter(vcVisible);
    const activos = registros.filter(r=>!r.cerrado).length;
    const cerrados = registros.filter(r=>r.cerrado).length;
    const valorTotal = registros.reduce((s,r)=>s+(Number(r.precio)||Number(r.monto)||0),0);
    const fQ = String(window['vcFQ_'+id]||'').toLowerCase().trim();
    const fSec = window['vcFSec_'+id]||'';
    let lista = registros.slice();
    if(fQ) lista = lista.filter(r=> Object.keys(r).some(k=>typeof r[k]==='string' && r[k].toLowerCase().includes(fQ)));
    if(fSec) lista = lista.filter(r=>(r.seccion||cfg.secciones[0])===fSec);
    lista.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
    const cell = (r,k)=>{ const v=r[k]; if(v==null||v==='') return '<span class="text-slate-300">—</span>'; if(k==='precio'||k==='monto'||k==='enganche') return '$'+Number(v).toLocaleString('es-MX'); return psEscape(v); };
    const filas = lista.map(r=>{
        const seg = (r.seguimientos||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:1);
        const prox = seg.find(x=>x.fecha>=new Date().toISOString().slice(0,10));
        return `<tr class="border-t hover:bg-slate-50 ${r.cerrado?'opacity-60':''}">
            <td class="p-3 font-medium">${psEscape(r.cliente)}${r.cerrado?' <span class="ml-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-600">Cerrado</span>':''}</td>
            ${cfg.campos.slice(0,3).map(c=>`<td class="p-3 text-xs">${cell(r,c.k)}</td>`).join('')}
            <td class="p-3">${(cfg.campos.find(c=>c.k==='rol')&&r.rol)?`<span class="px-2 py-0.5 rounded text-[11px] bg-indigo-50 text-indigo-700">${psEscape(r.rol)}</span>`:'<span class="text-slate-300">—</span>'}</td>
            <td class="p-3">${(cfg.campos.find(c=>c.k==='tipo')&&r.tipo)?`<span class="px-2 py-0.5 rounded text-[11px] bg-purple-50 text-purple-700">${psEscape(r.tipo)}</span>`:'<span class="text-slate-300">—</span>'}</td>
            <td class="p-3"><span class="px-2 py-1 rounded text-[11px] font-semibold bg-sky-100 text-sky-800 whitespace-nowrap">${psEscape(r.seccion||cfg.secciones[0])}</span></td>
            <td class="p-3 text-xs ${prox?'text-orange-600 font-semibold':'text-slate-400'}">${prox?new Date(prox.fecha+'T00:00:00').toLocaleDateString('es-MX'):'—'}</td>
            <td class="p-3 text-xs">${psEscape(r.agenteNombre||'')}</td>
            <td class="p-3"><button data-bx-click="a536" data-p0="${bxE(function(){return id})}" data-p1="${bxE(function(){return r.id})}" class="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-700"><i class="fas fa-folder-open mr-1"></i>Expediente</button></td>
        </tr>`;
    }).join('');
    const ths = `<th class="p-3 font-medium">Cliente</th>${cfg.campos.slice(0,3).map(c=>`<th class="p-3 font-medium">${c.label}</th>`).join('')}<th class="p-3 font-medium">Rol</th><th class="p-3 font-medium">Tipo</th><th class="p-3 font-medium">Etapa</th><th class="p-3 font-medium">Próx. seg.</th><th class="p-3 font-medium">Agente</th><th class="p-3 font-medium">Acción</th>`;
    const icono = id==='auto-cartera'?'fa-car-side':(id==='fin-cartera'?'fa-landmark':'fa-house');
    return `<div class="max-w-7xl mx-auto space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
                <h2 class="text-2xl font-bold text-slate-900">${cfg.nombre}</h2>
                <p class="text-slate-500 text-sm mt-1">${cfg.agencia} — mismas etapas y control que Mis Clientes, enfocado a ${id==='auto-cartera'?'venta y financiamiento de vehículos':(id==='fin-cartera'?'créditos hipotecarios, inversión y retiro':'venta, renta y escrituración de propiedades')}.</p>
            </div>
            <button data-bx-click="a537" data-p0="${bxE(function(){return id})}" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm"><i class="fas fa-plus mr-1"></i> Agregar ${cfg.unidad.toLowerCase()}</button>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">En proceso</p><p class="text-3xl font-bold text-slate-900 mt-1">${activos}</p><p class="text-xs text-slate-400 mt-1">Seguimiento activo</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Cerrados</p><p class="text-3xl font-bold text-slate-900 mt-1">${cerrados}</p><p class="text-xs text-slate-400 mt-1">Vendidos / concretados</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Valor en cartera</p><p class="text-3xl font-bold text-slate-900 mt-1">$${Math.round(valorTotal).toLocaleString('es-MX')}</p><p class="text-xs text-slate-400 mt-1">Suma de precios/montos</p></div>
            <div class="rounded-2xl border p-5 ${proxSegCount(lista)>0?'bg-orange-50 border-orange-300':'bg-white border-slate-200'}"><p class="text-xs uppercase font-semibold ${proxSegCount(lista)>0?'text-orange-500':'text-slate-400'}">Seguimientos pautados</p><p class="text-3xl font-bold mt-1 ${proxSegCount(lista)>0?'text-orange-600':'text-slate-900'}">${proxSegCount(lista)}</p><p class="text-xs ${proxSegCount(lista)>0?'text-orange-500':'text-slate-400'} mt-1">Con próxima fecha agendada</p></div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
                <h3 class="font-semibold text-lg">Cartera (${lista.length})</h3>
                <div class="flex flex-wrap gap-2">
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input value="${psEscape(window['vcFQ_'+id]||'')}" data-bx-input="a538" data-p0="${bxE(function(){return id})}" placeholder="Buscar en cartera..." class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    </div>
                    <select data-bx-change="a539" data-p0="${bxE(function(){return id})}" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todas las etapas</option>
                        ${cfg.secciones.map(s=>`<option ${fSec===s?'selected':''}>${s}</option>`).join('')}
                    </select>
                    <button data-bx-click="a540" data-p0="${bxE(function(){return id})}" data-p1="${bxE(function(){return id})}" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-eraser mr-1"></i>Limpiar</button>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-left text-slate-600"><tr>${ths}</tr></thead>
                    <tbody>${filas || `<tr><td colspan="9" class="p-8 text-center text-slate-500">Cartera vacía. Agrega tu primer ${cfg.unidad.toLowerCase()} con el botón de arriba.</td></tr>`}</tbody>
                </table>
            </div>
        </div>
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 class="font-semibold text-lg mb-3 flex items-center gap-2"><i class="fas ${icono} text-indigo-600"></i> Proceso de trabajo de la ${cfg.nombre}</h3>
            <div class="grid md:grid-cols-5 gap-3">
                ${cfg.secciones.map((s,i)=>`<div class="border border-slate-200 rounded-xl p-3"><p class="text-[10px] font-bold text-indigo-500">PASO ${i+1}</p><p class="text-sm font-semibold mt-0.5">${s}</p></div>`).join('')}
            </div>
        </div>
    </div>`;
}
function proxSegCount(lista){ return lista.filter(r=>(r.seguimientos||[]).some(x=>x.fecha>=new Date().toISOString().slice(0,10))).length; }
function vcAltaModal(id){
    const cfg = vcCfg(id);
    const clientes = sinClientesVisibles();
    showModal(`<form id="vc-form" class="p-6">
        <h3 class="text-xl font-bold mb-1">Agregar ${cfg.unidad.toLowerCase()}</h3>
        <p class="text-xs text-slate-500 mb-4">Si el registro pertenece a un cliente del portal, selecciónalo y se autocompleta; si es prospecto nuevo, escribe el nombre.</p>
        <div class="space-y-4">
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Cliente</label>
                <select id="vc-cliente" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">— Prospecto nuevo (capturar nombre) —</option>
                    ${clientes.map(c=>`<option value="${c.id}">${psEscape(c.nombre)} — ${psEscape(c.compania||'')} / ${psEscape(c.poliza||'')}</option>`).join('')}
                </select>
                <input id="vc-cliente-nombre" placeholder="Nombre del cliente o prospecto" required class="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
            </div>
            <div class="grid md:grid-cols-2 gap-3">
                ${cfg.campos.map(c=>`<div>
                    <label class="text-sm font-medium text-slate-700 mb-1 block">${c.label}${c.req?' *':''}</label>
                    ${c.t==='number'
                        ?`<input type="number" id="vc-${c.k}" step="0.01" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">`
                        :(c.t==='select'
                            ?`<select id="vc-${c.k}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${(c.opciones||[]).map(o=>`<option>${o}</option>`).join('')}</select>`
                            :`<input type="text" id="vc-${c.k}" placeholder="${psEscape(c.ph||'')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">`)}
                </div>`).join('')}
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Etapa inicial</label>
                <select id="vc-seccion" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${cfg.secciones.map((s,i)=>`<option ${i===0?'selected':''}>${s}</option>`).join('')}</select>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Notas iniciales</label>
                <textarea id="vc-notas" rows="2" placeholder="Contexto, compromisos, observaciones..." class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea>
            </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-lg border">Cancelar</button>
            <button type="submit" class="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"><i class="fas fa-save mr-1"></i> Guardar</button>
        </div>
    </form>`);
    setTimeout(()=>{
        const sel=document.getElementById('vc-cliente');
        if(sel) sel.onchange=()=>{ const c=db.clientes.find(x=>String(x.id)===String(sel.value)); const nom=document.getElementById('vc-cliente-nombre'); if(c&&nom&&!nom.value) nom.value=c.nombre; };
        const form=document.getElementById('vc-form');
        if(form) form.onsubmit=(e)=>{ e.preventDefault(); vcGuardar(id); };
    },0);
}
function vcGuardar(id){
    const cfg = vcCfg(id);
    const sel=document.getElementById('vc-cliente');
    const cli = db.clientes.find(c=>String(c.id)===String(sel.value));
    const nombre = (document.getElementById('vc-cliente-nombre').value||'').trim();
    if(!nombre){ showToast('Escribe el nombre del cliente o prospecto','warning'); return; }
    const r = { id: Date.now(), fecha: new Date().toISOString(), clienteId: cli?cli.id:null, cliente: nombre, seccion: document.getElementById('vc-seccion').value, notas: (document.getElementById('vc-notas').value||'').trim(), agenteId: cli?cli.agenteId:currentUser.id, agenteNombre: cli?(cli.agenteNombre||''):currentUser.name, seguimientos: [], cerrado: false };
    cfg.campos.forEach(c=>{ const el=document.getElementById('vc-'+c.k); if(el) r[c.k] = c.t==='number' ? (parseFloat(el.value)||0) : (el.value||''); });
    vcCartera(id).unshift(r);
    cmLog(cfg.nombre, 'Nuevo registro', r.cliente);
    saveDB(); closeModal(); showToast('Registro agregado a '+cfg.nombre,'success'); render();
}
function vcDetalle(id, rid){
    const cfg = vcCfg(id);
    const r = vcCartera(id).find(x=>x.id===rid);
    if(!r) return;
    if(!vcVisible(r)){ showToast('No tienes acceso a este registro','warning'); return; }
    const segs = (r.seguimientos||[]).slice().sort((a,b)=>a.fecha<b.fecha?-1:1);
    const idx = cfg.secciones.indexOf(r.seccion||cfg.secciones[0]);
    const puedeEditar = vcVisible(r);
    const campoTxt = (k)=>{ const v=r[k]; if(v==null||v==='') return ''; if(k==='precio'||k==='monto'||k==='enganche') return '$'+Number(v).toLocaleString('es-MX'); return psEscape(String(v)); };
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-sky-100 text-sky-800">${psEscape(r.seccion||cfg.secciones[0])}</span>
                    ${r.cerrado?'<span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-200 text-slate-600">Cerrado</span>':''}
                </div>
                <h3 class="text-xl font-bold">${psEscape(r.cliente)}</h3>
                <p class="text-xs text-slate-500">${cfg.unidad} · Agente: ${psEscape(r.agenteNombre||'')} · Alta: ${new Date(r.fecha).toLocaleDateString('es-MX')}</p>
            </div>
            <button data-bx-click="a1" class="text-slate-400 hover:text-slate-600" title="Cerrar"><i class="fas fa-times text-lg"></i></button>
        </div>
        <div class="grid md:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-4">
            ${cfg.campos.map(c=>`<p><span class="text-slate-400 text-xs uppercase">${c.label}:</span> <b>${campoTxt(c.k)||'—'}</b></p>`).join('')}
        </div>
        ${r.notas?`<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 mb-4"><b>Notas:</b> ${psEscape(r.notas)}</div>`:''}
        ${puedeEditar?`
        <div class="grid md:grid-cols-3 gap-3 mb-4">
            <div>
                <label class="text-xs font-medium text-slate-600 mb-1 block">Cambiar etapa</label>
                <select id="vc-nueva-seccion" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${cfg.secciones.map((s,i)=>`<option ${i===idx?'selected':''}>${s}</option>`).join('')}</select>
            </div>
            <div class="flex items-end gap-2">
                <button data-bx-click="a541" data-p0="${bxE(function(){return id})}" data-p1="${bxE(function(){return r.id})}" class="w-full px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-rotate mr-1"></i> Actualizar</button>
            </div>
            <div class="flex items-end">
                <button data-bx-click="a542" data-p0="${bxE(function(){return id})}" data-p1="${bxE(function(){return r.id})}" class="w-full px-3 py-2 ${r.cerrado?'bg-emerald-600 hover:bg-emerald-700':'bg-slate-600 hover:bg-slate-700'} text-white rounded-lg text-sm font-medium"><i class="fas fa-${r.cerrado?'lock-open':'lock'} mr-1"></i> ${r.cerrado?'Reabrir':'Cerrar'} registro</button>
            </div>
        </div>`:''}
        <div class="grid md:grid-cols-2 gap-4">
            <div>
                <h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Historial de seguimientos (${segs.length})</h4>
                <div class="border border-slate-200 rounded-lg p-3 max-h-44 overflow-y-auto space-y-2 mb-2">
                    ${segs.map(sg=>`<div class="text-xs border-l-2 border-indigo-200 pl-2"><p class="text-slate-500">${new Date(sg.fecha+'T00:00:00').toLocaleDateString('es-MX')} · ${psEscape(sg.autor)}</p><p class="text-slate-700">${psEscape(sg.texto)}</p></div>`).join('') || '<p class="text-xs text-slate-400">Sin seguimientos.</p>'}
                </div>
            </div>
            ${puedeEditar?`
            <div>
                <h4 class="text-xs font-semibold uppercase text-slate-400 mb-2">Nuevo seguimiento</h4>
                <label class="text-xs text-slate-500 mb-1 block">Fecha del seguimiento</label>
                <input type="date" id="vc-seg-fecha" value="${new Date().toISOString().slice(0,10)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                <textarea id="vc-seg-texto" rows="3" placeholder="Qué se hizo / qué sigue / compromiso..." class="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></textarea>
                <button data-bx-click="a543" data-p0="${bxE(function(){return id})}" data-p1="${bxE(function(){return r.id})}" class="mt-2 px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-xs font-medium"><i class="fas fa-calendar-plus mr-1"></i> Agregar seguimiento</button>
                <button data-bx-click="a544" data-p0="${bxE(function(){return id})}" data-p1="${bxE(function(){return r.id})}" class="mt-2 px-3 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium ml-2" title="Eliminar registro (GM/admin)"><i class="fas fa-trash mr-1"></i> Eliminar</button>
            </div>`:''}
        </div>
    </div>`);
}
function vcCambiarSeccion(id, rid){
    const r = vcCartera(id).find(x=>x.id===rid); if(!r) return;
    if(!vcVisible(r)){ showToast('No tienes acceso a este registro','warning'); return; }
    const nueva = (document.getElementById('vc-nueva-seccion')||{}).value; if(!nueva) return;
    const anterior = r.seccion;
    r.seccion = nueva;
    r.seguimientos = r.seguimientos||[];
    r.seguimientos.push({ fecha: new Date().toISOString().slice(0,10), autor: currentUser.name, texto: 'Etapa: '+anterior+' → '+nueva+'.' });
    cmLog(vcCfg(id).nombre, 'Cambio de etapa', r.cliente+': '+anterior+' → '+nueva);
    saveDB(); showToast('Etapa actualizada: '+nueva,'success'); vcDetalle(id, rid); render();
}
function vcToggleCerrado(id, rid){
    const r = vcCartera(id).find(x=>x.id===rid); if(!r) return;
    if(!vcVisible(r)){ showToast('No tienes acceso a este registro','warning'); return; }
    r.cerrado = !r.cerrado;
    r.seguimientos = r.seguimientos||[];
    r.seguimientos.push({ fecha: new Date().toISOString().slice(0,10), autor: currentUser.name, texto: r.cerrado?'Registro marcado como CERRADO.':'Registro reabierto.' });
    cmLog(vcCfg(id).nombre, r.cerrado?'Cerró registro':'Reabrió registro', r.cliente);
    saveDB(); showToast(r.cerrado?'Registro cerrado':'Registro reabierto','success'); vcDetalle(id, rid); render();
}
function vcAddSeg(id, rid){
    const r = vcCartera(id).find(x=>x.id===rid); if(!r) return;
    if(!vcVisible(r)){ showToast('No tienes acceso a este registro','warning'); return; }
    const fecha = (document.getElementById('vc-seg-fecha')||{}).value || new Date().toISOString().slice(0,10);
    const texto = ((document.getElementById('vc-seg-texto')||{}).value||'').trim();
    if(!texto){ showToast('Escribe el detalle del seguimiento','warning'); return; }
    r.seguimientos = r.seguimientos||[];
    r.seguimientos.push({ fecha, autor: currentUser.name, texto });
    cmLog(vcCfg(id).nombre, 'Seguimiento', r.cliente+': '+texto.slice(0,80));
    saveDB(); showToast('Seguimiento registrado','success'); vcDetalle(id, rid); render();
}
function vcBorrarRegistro(id, rid){
    const rol = (currentUser.role||'').toLowerCase();
    if(rol!=='gm' && rol!=='admin'){ showToast('Solo GM/admin puede eliminar registros','warning'); return; }
    if(!confirm('¿Eliminar este registro de la cartera?')) return;
    const t = vcCfg(id).tabla;
    const r = vcCartera(id).find(x=>x.id===rid);
    db[t] = db[t].filter(x=>x.id!==rid);
    cmLog(vcCfg(id).nombre, 'Eliminar registro', r?r.cliente:'');
    saveDB(); closeModal(); showToast('Registro eliminado','success'); render();
}

/* ==================== AGENCIA INMOBILIARIA (Inventario de Propiedades + Clientes) ==================== */
function inmD(){
    if(!db.inmPublica || typeof db.inmPublica!=='object') db.inmPublica = { props: [] };
    if(!Array.isArray(db.inmPublica.props)) db.inmPublica.props = [];
    return db.inmPublica;
}
function inmSetTab(t){
    window.inmTabId = t;
    render();
}
function renderInmAgencia(forcedTab){
    const tab = forcedTab || window.inmTabId || 'unidades';
    window.inmTabId = tab;
    const d = inmD();
    const props = d.props || [];
    const disp = props.filter(p=>inmEstadoProp(p)==='Disponible').length;
    const resv = props.filter(p=>inmEstadoProp(p)==='Reservada').length;
    const vend = props.filter(p=>inmEstadoProp(p)==='Vendida').length;
    const valorDisp = props.filter(p=>inmEstadoProp(p)==='Disponible').reduce((s,p)=>s+(Number(p.precio)||0),0);
    return `<div class="max-w-7xl mx-auto space-y-6">
        <div class="flex items-center justify-between flex-wrap gap-3">
            <div>
                <h2 class="text-2xl font-bold text-slate-900"><i class="fas fa-house-chimney text-emerald-600 mr-2"></i>Comercial Inmobiliario</h2>
                <p class="text-slate-500 text-sm mt-1">Carga propiedades al inventario con galería de fotos, administra disponibilidad y compártelas directo en el portal público.</p>
            </div>
            <div class="flex gap-2">
                <button data-bx-click="a545" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm"><i class="fas fa-plus mr-1"></i> Cargar propiedad</button>
                <button data-bx-click="a546" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium shadow-sm"><i class="fas fa-user-plus mr-1"></i> Nuevo expediente cliente</button>
            </div>
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Disponibles</p><p class="text-3xl font-bold text-slate-900 mt-1">${disp}</p><p class="text-xs text-slate-400 mt-1">Publicadas en el escaparate</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Reservadas</p><p class="text-3xl font-bold text-amber-600 mt-1">${resv}</p><p class="text-xs text-slate-400 mt-1">Con apartado en curso</p></div>
            <div class="bg-emerald-50 rounded-2xl border border-emerald-200 p-5"><p class="text-xs uppercase font-semibold text-emerald-600">Cerradas / Vendidas</p><p class="text-3xl font-bold text-emerald-700 mt-1">${vend}</p><p class="text-xs text-emerald-600/80 mt-1">Operaciones concluidas</p></div>
            <div class="bg-white rounded-2xl border border-slate-200 p-5"><p class="text-xs uppercase font-semibold text-slate-400">Valor en escaparate</p><p class="text-2xl font-bold text-slate-900 mt-1">$${Math.round(valorDisp).toLocaleString('es-MX')}</p><p class="text-xs text-slate-400 mt-1">Suma de disponibles</p></div>
        </div>
        <div class="flex gap-2 border-b border-slate-200 pb-2">
            <button data-bx-click="a547" class="px-4 py-2 rounded-lg text-sm font-semibold ${tab==='unidades'?'bg-slate-900 text-white':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}"><i class="fas fa-building mr-1.5"></i>Inventario de Propiedades (${props.length})</button>
            <button data-bx-click="a548" class="px-4 py-2 rounded-lg text-sm font-semibold ${tab==='clientes'?'bg-slate-900 text-white':'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}"><i class="fas fa-folder-open mr-1.5"></i>Expedientes y Cartera (${vcCartera('inm-cartera').filter(vcVisible).length})</button>
        </div>
        <div>${tab==='clientes' ? vcRender('inm-cartera') : inmInventarioHtml()}</div>
    </div>`;
}
function inmInventarioHtml(){
    const d = inmD();
    const fQ = String(window.inmInvQ||'').toLowerCase().trim();
    const fEst = window.inmInvEst||'';
    const fOp = window.inmInvOp||'';
    const fInm = window.inmInvTipo||'';
    const fRec = parseInt(window.inmInvRec||'0',10)||0;
    const fMaxP = parseFloat(window.inmInvMaxP||'0')||0;
    let lista = (d.props||[]).slice();
    if(fQ) lista = lista.filter(p=>[p.titulo,p.colonia,p.ciudad,p.desc,p.inmuebleTipo].some(x=>String(x||'').toLowerCase().includes(fQ)));
    if(fEst) lista = lista.filter(p=>inmEstadoProp(p)===fEst);
    if(fOp) lista = lista.filter(p=>(p.tipo||'Venta')===fOp);
    if(fInm) lista = lista.filter(p=>(p.inmuebleTipo||'Casa')===fInm);
    if(fRec) lista = lista.filter(p=>(parseInt(p.recs,10)||0)>=fRec);
    if(fMaxP) lista = lista.filter(p=>(Number(p.precio)||0)<=fMaxP);
    lista.sort((a,b)=>(b.destacada?1:0)-(a.destacada?1:0) || (b.id||0)-(a.id||0));
    const fichaCampo = (ico, lb, v)=> v ? `<div class="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"><i class="fas ${ico} text-slate-400 text-[10px] w-4"></i><div><p class="text-[9px] uppercase text-slate-400 leading-none">${lb}</p><p class="text-xs font-semibold text-slate-700">${psEscape(String(v))}</p></div></div>` : '';
    const card = (p)=>{
        const est = inmEstadoProp(p);
        const fotos = (p.fotos||[]);
        return `<div class="bg-white border rounded-2xl overflow-hidden ${est==='Vendida'?'opacity-80 border-emerald-400':(est==='Reservada'?'border-amber-300 ring-1 ring-amber-200':'border-slate-200')} hover:shadow-lg transition flex flex-col">
            <div class="relative group">
                ${fotos[0]?`<img loading="lazy" decoding="async" src="${fotos[0]}" class="w-full h-44 object-cover cursor-pointer group-hover:scale-[1.02] transition" data-bx-click="a549" data-p0="${bxE(function(){return p.id})}">`:`<div class="w-full h-44 bg-slate-100 flex items-center justify-center cursor-pointer" data-bx-click="a549" data-p0="${bxE(function(){return p.id})}"><i class="fas fa-house text-slate-300 text-4xl"></i></div>`}
                <div class="absolute top-2 left-2 flex flex-wrap gap-1">${auEstadoBadge(est)}${inmPBadge(p.tipo||'Venta')}${p.destacada?'<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white">Destacada</span>':''}</div>
                ${fotos.length>0?`<span data-bx-click="a549" data-p0="${bxE(function(){return p.id})}" class="absolute bottom-2 right-2 px-2.5 py-0.5 rounded-full bg-black/70 hover:bg-black/85 text-white text-[10px] font-semibold cursor-pointer"><i class="fas fa-images mr-1"></i>${fotos.length} foto${fotos.length===1?'':'s'}</span>`:''}
            </div>
            ${fotos.length>1?`<div class="flex gap-1.5 px-4 pt-2.5 overflow-x-auto">${fotos.slice(0,5).map((f,idx)=>`<img loading="lazy" decoding="async" src="${f}" data-bx-click="a550" data-p0="${bxE(function(){return p.id})}" data-p1="${bxE(function(){return idx})}" class="w-12 h-9 object-cover rounded-md border border-slate-200 cursor-pointer hover:ring-2 hover:ring-emerald-500 shrink-0 transition" title="Foto ${idx+1}">`).join('')}${fotos.length>5?`<button data-bx-click="a551" data-p0="${bxE(function(){return p.id})}" class="w-12 h-9 rounded-md border border-slate-200 bg-slate-100 text-[10px] font-bold text-slate-600 shrink-0 hover:bg-slate-200">+${fotos.length-5}</button>`:''}</div>`:''}
            <div class="p-4 flex-1 flex flex-col">
                <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                        <p class="text-xs text-slate-400 uppercase font-semibold truncate">${psEscape(p.colonia||'')} ${p.ciudad?'· '+psEscape(p.ciudad):''}</p>
                        <h4 class="font-bold text-slate-900 leading-tight truncate">${psEscape(p.titulo||'Propiedad')}</h4>
                    </div>
                    <select data-bx-change="a552" data-p0="${bxE(function(){return p.id})}" title="Cambiar estatus de disponibilidad" class="text-[11px] font-semibold rounded-lg border px-2 py-1 cursor-pointer ${est==='Vendida'?'bg-emerald-50 border-emerald-300 text-emerald-800':(est==='Reservada'?'bg-amber-50 border-amber-300 text-amber-900':'bg-slate-50 border-slate-200 text-slate-700')}">
                        <option value="Disponible" ${est==='Disponible'?'selected':''}>🟢 Disponible</option>
                        <option value="Reservada" ${est==='Reservada'?'selected':''}>🟡 Reservada</option>
                        <option value="Vendida" ${est==='Vendida'?'selected':''}>✅ Vendida</option>
                    </select>
                </div>
                <div class="flex items-baseline gap-2 mt-1">
                    <p class="text-xl font-black text-emerald-700">${p.precio?'$'+Number(p.precio).toLocaleString('es-MX'):'A consultar'}</p>
                    ${p.tipo==='Renta'&&p.precio?'<span class="text-xs text-slate-400">/mes</span>':''}
                </div>
                ${est==='Reservada' && (p.anticipo || p.reservaHasta || p.clienteNombre) ? `<div class="mt-2 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 space-y-0.5">
                    ${p.clienteNombre?`<div><i class="fas fa-user mr-1"></i><b>Apartada por:</b> ${psEscape(p.clienteNombre)}</div>`:''}
                    ${p.anticipo?`<div><i class="fas fa-coins mr-1"></i><b>Anticipo:</b> $${Number(p.anticipo).toLocaleString('es-MX')}</div>`:''}
                    ${p.reservaHasta?`<div><i class="fas fa-calendar-day mr-1"></i><b>Vence:</b> ${psEscape(p.reservaHasta)}</div>`:''}
                </div>` : ''}
                <div class="grid grid-cols-2 gap-1.5 mt-3">
                    ${fichaCampo('fa-building','Inmueble', p.inmuebleTipo||'Casa')}
                    ${fichaCampo('fa-ruler-combined','Superficie', p.m2?p.m2+' m²':'')}
                    ${fichaCampo('fa-bed','Recámaras', p.recs?p.recs+' rec':'')}
                    ${fichaCampo('fa-bath','Baños', p.banios?p.banios+' baños':'')}
                </div>
                ${p.desc?`<p class="text-xs text-slate-500 mt-2 line-clamp-2">${psEscape(p.desc)}</p>`:''}
                <div class="flex flex-wrap gap-1.5 mt-auto pt-3">
                    <button data-bx-click="a549" data-p0="${bxE(function(){return p.id})}" class="flex-1 text-xs px-2.5 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 font-medium"><i class="fas fa-expand mr-1"></i>Ficha</button>
                    <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([p.colonia,p.ciudad,p.titulo].filter(Boolean).join(', '))}" target="_blank" class="text-xs px-2.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 font-medium" title="Ver ubicación en Google Maps"><i class="fas fa-map-location-dot"></i></a>
                    <button data-bx-click="a553" data-p0="${bxE(function(){return p.id})}" class="text-xs px-2.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 font-medium" title="Compartir ficha"><i class="fas fa-share-nodes mr-1"></i>Compartir</button>
                    ${est!=='Vendida'?`<button data-bx-click="a554" data-p0="${bxE(function(){return p.id})}" class="text-xs px-2.5 py-2 border ${est==='Reservada'?'bg-amber-100 border-amber-300 text-amber-900':'hover:bg-slate-50'} rounded-lg" title="Apartar / Reservar"><i class="fas fa-hand"></i></button>`:''}
                    <button data-bx-click="a555" data-p0="${bxE(function(){return p.id})}" class="text-xs px-2.5 py-2 border rounded-lg hover:bg-slate-50" title="Editar propiedad y galería"><i class="fas fa-pen"></i></button>
                    <button data-bx-click="a556" data-p0="${bxE(function(){return p.id})}" class="text-xs px-2.5 py-2 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50" title="Eliminar"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`;
    };
    return `<div class="bg-white rounded-2xl border border-slate-200 p-6">
        <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4">
            <h3 class="font-semibold text-lg">Propiedades en inventario (${lista.length})</h3>
            <div class="flex flex-wrap gap-2">
                <div class="relative">
                    <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                    <input value="${psEscape(window.inmInvQ||'')}" data-bx-input="a557" placeholder="Título, colonia, ciudad..." class="w-52 pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                </div>
                <select data-bx-change="a558" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">Todos los estados</option>
                    ${['Disponible','Reservada','Vendida'].map(o=>`<option ${fEst===o?'selected':''}>${o}</option>`).join('')}
                </select>
                <select data-bx-change="a559" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">Operación</option>
                    ${['Venta','Renta','Preventa'].map(o=>`<option ${fOp===o?'selected':''}>${o}</option>`).join('')}
                </select>
                <select data-bx-change="a560" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">Tipo de inmueble</option>
                    ${['Casa','Departamento','Terreno','Local / Oficina','Bodega / Nave'].map(o=>`<option ${fInm===o?'selected':''}>${o}</option>`).join('')}
                </select>
                <select data-bx-change="a561" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <option value="">Recámaras (todas)</option>
                    ${[1,2,3,4].map(n=>`<option value="${n}" ${fRec===n?'selected':''}>${n}+ recámaras</option>`).join('')}
                </select>
                <input type="number" value="${window.inmInvMaxP||''}" data-bx-input="a562" placeholder="Precio máx $" class="w-32 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                <button data-bx-click="a563" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-eraser mr-1"></i>Limpiar</button>
            </div>
        </div>
        <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
            ${lista.map(card).join('') || '<p class="text-sm text-slate-400 col-span-full py-8 text-center">Sin propiedades cargadas. Usa el botón "Cargar propiedad" para publicar la primera en el portal.</p>'}
        </div>
        <p class="text-xs text-slate-400 mt-4"><i class="fas fa-circle-info mr-1"></i>Las propiedades Disponibles y Reservadas se muestran automáticamente en la sección "Propiedades" del portal público.</p>
    </div>`;
}
function inmUrlFichaPublica(id){
    const base = window.location.origin + window.location.pathname;
    return base + '#prop-' + id;
}
function inmTextoCompartir(p){
    if(!p) return '';
    const est = inmEstadoProp(p);
    const precio = p.precio ? '$' + Number(p.precio).toLocaleString('es-MX') + (p.tipo==='Renta'?' /mes':'') : 'Precio a consultar';
    const partes = [
        '🏠 *' + (p.titulo || 'Propiedad') + '*',
        '💼 Operación: *' + (p.tipo||'Venta') + '* (' + (p.inmuebleTipo||'Casa') + ')',
        '💰 Precio: *' + precio + '*',
        '📌 Estatus: ' + est,
        (p.colonia || p.ciudad) ? '📍 Ubicación: ' + [p.colonia, p.ciudad].filter(Boolean).join(', ') : '',
        p.m2 ? '📐 Superficie: ' + p.m2 + ' m²' : '',
        (p.recs || p.banios) ? '🛏️ Distribución: ' + [p.recs?p.recs+' recámaras':'', p.banios?p.banios+' baños':''].filter(Boolean).join(' · ') : '',
        p.desc ? '✨ Descripción: ' + p.desc : '',
        '🔗 Ver ficha y galería: ' + inmUrlFichaPublica(p.id)
    ].filter(Boolean);
    return partes.join('\n');
}
function inmCopiarLinkFicha(id){
    const url = inmUrlFichaPublica(id);
    if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(url).then(()=>{ if(window.showToast) showToast('Enlace de la propiedad copiado','success'); }).catch(()=>auFallbackCopy(url));
    } else auFallbackCopy(url);
}
function inmCopiarResumenFicha(id){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    const txt = inmTextoCompartir(p);
    if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(txt).then(()=>{ if(window.showToast) showToast('Ficha de propiedad copiada','success'); }).catch(()=>auFallbackCopy(txt));
    } else auFallbackCopy(txt);
}
function inmWhatsAppFicha(id){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    window.open('https://wa.me/?text=' + encodeURIComponent(inmTextoCompartir(p)), '_blank');
}
function inmAbrirVistaPublica(id){
    closeModal();
    window._forceApp = false;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('public-portal').classList.remove('hidden');
    inmVerProp(id);
    window.scrollTo(0,0);
}
function inmCompartirFichaModal(id){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    const url = inmUrlFichaPublica(p.id);
    const resumen = inmTextoCompartir(p);
    const fotos = (p.fotos||[]);
    const est = inmEstadoProp(p);
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-4">
            <div>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 uppercase">Ficha inmobiliaria compartible</span>
                <h3 class="text-xl font-bold text-slate-900 mt-1">${psEscape(p.titulo||'Propiedad')}</h3>
                <p class="text-xs text-slate-500">Comparte esta propiedad con tu cliente por WhatsApp, enlace directo o vista pública imprimible.</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
        </div>
        <div class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 mb-4">
            ${fotos[0]?`<img loading="lazy" decoding="async" src="${fotos[0]}" class="w-20 h-14 object-cover rounded-lg border">`:`<div class="w-20 h-14 rounded-lg bg-slate-200 flex items-center justify-center"><i class="fas fa-house text-slate-400"></i></div>`}
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">${auEstadoBadge(est)}${inmPBadge(p.tipo||'Venta')}<span class="text-xs font-bold text-emerald-700">${p.precio?'$'+Number(p.precio).toLocaleString('es-MX'):'A consultar'}</span></div>
                <p class="text-xs text-slate-500 truncate mt-0.5">${psEscape(p.colonia||'')} · ${psEscape(p.ciudad||'')}</p>
            </div>
        </div>
        <div class="space-y-3">
            <div>
                <label class="text-xs font-semibold text-slate-600 block mb-1">Enlace directo a la ficha pública</label>
                <div class="flex gap-2">
                    <input readonly value="${psEscape(url)}" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-700 font-mono">
                    <button type="button" data-bx-click="a564" data-p0="${bxE(function(){return p.id})}" class="px-3 py-2 bg-slate-900 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold whitespace-nowrap"><i class="fas fa-copy mr-1"></i>Copiar link</button>
                </div>
            </div>
            <div>
                <label class="text-xs font-semibold text-slate-600 block mb-1">Mensaje con ficha técnica lista para enviar</label>
                <textarea readonly rows="6" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-slate-50 text-slate-700">${psEscape(resumen)}</textarea>
            </div>
        </div>
        <div class="grid sm:grid-cols-3 gap-2 mt-5">
            <button type="button" data-bx-click="a565" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><i class="fab fa-whatsapp text-sm"></i>Enviar por WhatsApp</button>
            <button type="button" data-bx-click="a566" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2.5 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><i class="fas fa-clipboard-check"></i>Copiar texto completo</button>
            <button type="button" data-bx-click="a567" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"><i class="fas fa-up-right-from-square"></i>Abrir ficha pública</button>
        </div>
    </div>`);
}
function inmFichaGalGo(idx){
    const fotos = window._inmFichaFotos || [];
    if(!fotos.length) return;
    const n = fotos.length;
    window._inmFichaIdx = ((idx % n) + n) % n;
    const main = document.getElementById('inm-ficha-principal');
    if(main) main.src = fotos[window._inmFichaIdx];
    const cnt = document.getElementById('inm-ficha-counter');
    if(cnt) cnt.textContent = (window._inmFichaIdx + 1) + ' / ' + n;
    document.querySelectorAll('.inm-ficha-thumb').forEach((el, i)=>{
        el.classList.toggle('ring-2', i === window._inmFichaIdx);
        el.classList.toggle('ring-emerald-600', i === window._inmFichaIdx);
    });
}
function inmFichaGalStep(delta){
    inmFichaGalGo((window._inmFichaIdx || 0) + delta);
}
function inmPagGalGo(idx){
    const u = inmD().props.find(x=>String(x.id)===String(window._inmVerId));
    const fotos = (u && u.fotos) || [];
    if(!fotos.length) return;
    const n = fotos.length;
    window._inmPagIdx = ((idx % n) + n) % n;
    const main = document.getElementById('inm-pag-principal');
    if(main) main.src = fotos[window._inmPagIdx];
    const cnt = document.getElementById('inm-pag-counter');
    if(cnt) cnt.textContent = (window._inmPagIdx + 1) + ' / ' + n;
    document.querySelectorAll('.inm-pag-thumb').forEach((el, i)=>{
        el.classList.toggle('ring-2', i === window._inmPagIdx);
        el.classList.toggle('ring-emerald-500', i === window._inmPagIdx);
    });
}
function inmPagGalStep(delta){
    inmPagGalGo((window._inmPagIdx || 0) + delta);
}
function inmFicha(id, startIdx){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    const fotos = (p.fotos||[]);
    window._inmFichaFotos = fotos;
    window._inmFichaIdx = (typeof startIdx==='number' && startIdx>=0 && startIdx<fotos.length) ? startIdx : 0;
    const est = inmEstadoProp(p);
    const filaSpec = (lb, v)=> v ? `<div class="flex justify-between py-1.5 border-b border-slate-100 text-sm"><span class="text-slate-400">${lb}</span><b class="text-slate-700">${psEscape(String(v))}</b></div>` : '';
    showModal(`<div class="p-6">
        <div class="flex items-start justify-between gap-3 mb-3">
            <div>
                <div class="flex flex-wrap items-center gap-1.5 mb-1">${auEstadoBadge(est)}${inmPBadge(p.tipo||'Venta')}${p.inmuebleTipo?`<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">${psEscape(p.inmuebleTipo)}</span>`:''}</div>
                <h3 class="text-2xl font-bold text-slate-900">${psEscape(p.titulo||'Propiedad')}</h3>
                <p class="text-sm text-slate-500"><i class="fas fa-location-dot mr-1"></i>${psEscape(p.colonia||'')} · ${psEscape(p.ciudad||'')}</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="text-slate-400 hover:text-slate-600"><i class="fas fa-times text-lg"></i></button>
        </div>
        ${fotos[0]?`<div class="relative rounded-xl overflow-hidden border bg-slate-50">
            <img loading="lazy" decoding="async" id="inm-ficha-principal" src="${fotos[window._inmFichaIdx]}" class="w-full h-80 object-cover">
            ${fotos.length>1?`
                <button type="button" data-bx-click="a568" class="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow"><i class="fas fa-chevron-left text-xs"></i></button>
                <button type="button" data-bx-click="a569" class="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow"><i class="fas fa-chevron-right text-xs"></i></button>
                <span id="inm-ficha-counter" class="absolute bottom-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-black/65 text-white text-xs font-semibold">${window._inmFichaIdx+1} / ${fotos.length}</span>
            `:''}
        </div>`:''}
        ${fotos.length>1?`<div class="flex gap-2 mt-2 overflow-x-auto pb-1">${fotos.map((f,i)=>`<img loading="lazy" decoding="async" src="${f}" data-bx-click="a570" data-p0="${bxE(function(){return i})}" class="inm-ficha-thumb w-24 h-16 object-cover rounded-lg border cursor-pointer shrink-0 ${i===window._inmFichaIdx?'ring-2 ring-emerald-600':''} hover:ring-2 hover:ring-emerald-400 transition">`).join('')}</div>`:''}
        <div class="flex items-baseline justify-between flex-wrap gap-3 mt-4">
            <div class="flex items-baseline gap-2">
                <p class="text-3xl font-black text-emerald-700">${p.precio?'$'+Number(p.precio).toLocaleString('es-MX'):'Precio a consultar'}</p>
                ${p.tipo==='Renta'&&p.precio?'<span class="text-sm text-slate-400">/mes</span>':''}
            </div>
            <div class="flex items-center gap-1.5">
                <button type="button" data-bx-click="a564" data-p0="${bxE(function(){return p.id})}" class="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700"><i class="fas fa-link mr-1 text-indigo-600"></i>Copiar link</button>
                <button type="button" data-bx-click="a565" data-p0="${bxE(function(){return p.id})}" class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"><i class="fab fa-whatsapp mr-1"></i>WhatsApp</button>
                <button type="button" data-bx-click="a567" data-p0="${bxE(function(){return p.id})}" class="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold"><i class="fas fa-up-right-from-square mr-1"></i>Vista cliente</button>
            </div>
        </div>
        ${est==='Reservada' && (p.anticipo || p.reservaHasta || p.clienteNombre || p.reservaNotas) ? `<div class="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap gap-x-5 gap-y-1">
            ${p.clienteNombre?`<span><i class="fas fa-user mr-1"></i><b>Cliente:</b> ${psEscape(p.clienteNombre)}</span>`:''}
            ${p.anticipo?`<span><i class="fas fa-coins mr-1"></i><b>Anticipo:</b> $${Number(p.anticipo).toLocaleString('es-MX')}</span>`:''}
            ${p.reservaHasta?`<span><i class="fas fa-calendar-day mr-1"></i><b>Vence:</b> ${psEscape(p.reservaHasta)}</span>`:''}
            ${p.reservaNotas?`<span class="w-full text-amber-800"><i class="fas fa-comment-dots mr-1"></i>${psEscape(p.reservaNotas)}</span>`:''}
        </div>` : ''}
        <div class="grid md:grid-cols-2 gap-x-8 mt-3">
            <div>
                ${filaSpec('Estatus', est)}
                ${filaSpec('Operación', p.tipo||'Venta')}
                ${filaSpec('Tipo de inmueble', p.inmuebleTipo||'Casa')}
                ${filaSpec('Superficie', p.m2?p.m2+' m²':'')}
                ${filaSpec('Recámaras', p.recs)}
            </div>
            <div>
                ${filaSpec('Baños', p.banios)}
                ${filaSpec('Estacionamientos', p.estacionamientos)}
                ${filaSpec('Colonia / Zona', p.colonia)}
                ${filaSpec('Ciudad', p.ciudad)}
                ${filaSpec('Asesor', p.agenteNombre)}
            </div>
        </div>
        ${p.desc?`<div class="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm text-slate-700 mt-3"><b>Descripción:</b> ${psEscape(p.desc)}</div>`:''}
        <div class="flex justify-end gap-2 mt-4 flex-wrap">
            <button data-bx-click="a571" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 text-sm font-medium"><i class="fas fa-share-nodes mr-1"></i>Compartir ficha</button>
            ${est!=='Vendida'?`<button data-bx-click="a572" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm"><i class="fas fa-hand mr-1"></i>${est==='Reservada'?'Gestionar reserva':'Reservar'}</button>`:''}
            <button data-bx-click="a573" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2 border rounded-lg hover:bg-slate-50 text-sm"><i class="fas fa-pen mr-1"></i>Editar</button>
        </div>
    </div>`);
}
function inmRenderDraftFotos(){
    const wrap = document.getElementById('inm-draft-fotos-wrap');
    if(!wrap) return;
    const arr = window._inmDraftFotos || [];
    if(!arr.length){
        wrap.innerHTML = `<div class="border border-dashed border-slate-300 rounded-xl p-4 text-center text-xs text-slate-400">Sin fotos cargadas todavía. Sube hasta 10 fotos o agrega una URL de imagen.</div>`;
        return;
    }
    wrap.innerHTML = `<div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5">${arr.map((src, i)=>`
        <div class="relative group rounded-xl overflow-hidden border ${i===0?'border-emerald-500 ring-2 ring-emerald-500/30':'border-slate-200'} bg-slate-50">
            <img loading="lazy" decoding="async" src="${src}" class="w-full h-24 object-cover">
            ${i===0?`<span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-bold shadow">Portada</span>`:`<button type="button" data-bx-click="a574" data-p0="${bxE(function(){return i})}" class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-full bg-black/65 hover:bg-emerald-600 text-white text-[9px] font-semibold opacity-0 group-hover:opacity-100 transition">Hacer portada</button>`}
            <button type="button" data-bx-click="a575" data-p0="${bxE(function(){return i})}" class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-[10px] flex items-center justify-center shadow" title="Quitar foto"><i class="fas fa-trash"></i></button>
        </div>`).join('')}</div>`;
}
function inmDraftSetPortada(idx){
    const arr = window._inmDraftFotos || [];
    if(idx<=0 || idx>=arr.length) return;
    const item = arr.splice(idx, 1)[0];
    arr.unshift(item);
    inmRenderDraftFotos();
}
function inmDraftQuitarFoto(idx){
    const arr = window._inmDraftFotos || [];
    if(idx<0 || idx>=arr.length) return;
    arr.splice(idx, 1);
    inmRenderDraftFotos();
}
function inmDraftAgregarUrl(){
    const inp = document.getElementById('inm-foto-url');
    if(!inp) return;
    const url = inp.value.trim();
    if(!url) return;
    window._inmDraftFotos = window._inmDraftFotos || [];
    if(window._inmDraftFotos.length >= 10){ showToast('Máximo 10 fotos por propiedad','warning'); return; }
    window._inmDraftFotos.push(url);
    inp.value = '';
    inmRenderDraftFotos();
}
function inmDraftSubirArchivos(inputEl){
    const files = (inputEl && inputEl.files) ? [...inputEl.files] : [];
    if(!files.length) return;
    window._inmDraftFotos = window._inmDraftFotos || [];
    const disp = Math.max(0, 10 - window._inmDraftFotos.length);
    if(disp <= 0){ showToast('Ya tienes el máximo de 10 fotos','warning'); inputEl.value=''; return; }
    const primeros = files.slice(0, disp);
    const anexar = (nuevas)=>{
        (nuevas||[]).filter(Boolean).forEach(u=>{ if(window._inmDraftFotos.length<10) window._inmDraftFotos.push(u); });
        inputEl.value = '';
        inmRenderDraftFotos();
    };
    if (window.Media && window.Backend && window.Backend.available) {
        if (window.showToast) window.showToast('Subiendo fotos…','info');
        window.Media.subirMuchos(primeros, 'inmPublica').then(items=>anexar(items.map(x=>x.url))).catch(()=>auFotosLocal(primeros, anexar));
    } else auFotosLocal(primeros, anexar);
}
function inmAltaProp(id){
    const d = inmD();
    const p = id ? d.props.find(x=>String(x.id)===String(id)) : null;
    window._inmDraftFotos = p && Array.isArray(p.fotos) ? p.fotos.slice() : [];
    const est = p ? inmEstadoProp(p) : 'Disponible';
    const opt = (arr, sel)=>arr.map(v=>`<option ${v===(sel||'')?'selected':''}>${v}</option>`).join('');
    showModal(`<form id="inm-prop-form" class="p-6">
        <h3 class="text-xl font-bold mb-1">${p?'Editar propiedad':'Cargar propiedad al inventario'}</h3>
        <p class="text-xs text-slate-500 mb-4">Al guardar, la propiedad aparece tanto en Comercial Inmobiliario como en la sección Propiedades del portal público.</p>
        <div class="grid md:grid-cols-3 gap-3">
            <div class="md:col-span-2"><label class="text-sm font-medium text-slate-700 mb-1 block">Título de la propiedad *</label><input id="inm-titulo" required value="${psEscape(p&&p.titulo||'')}" placeholder="Ej. Residencia contemporánea en Valle Poniente" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Operación *</label><select id="inm-tipo" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['Venta','Renta','Preventa'], p&&p.tipo||'Venta')}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Tipo de inmueble</label><select id="inm-inm-tipo" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['Casa','Departamento','Terreno','Local / Oficina','Bodega / Nave'], p&&p.inmuebleTipo||'Casa')}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Precio ($ MXN)</label><input id="inm-precio" type="number" step="0.01" value="${psEscape(String(p&&p.precio||''))}" placeholder="0 = Precio a consultar" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Estatus de disponibilidad</label><select id="inm-estado" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${opt(['Disponible','Reservada','Vendida'], est)}</select></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Colonia / Zona *</label><input id="inm-colonia" required value="${psEscape(p&&p.colonia||'')}" placeholder="Ej. Del Valle" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Ciudad *</label><input id="inm-ciudad" required value="${psEscape(p&&p.ciudad||'San Pedro Garza García')}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Superficie (m²)</label><input id="inm-m2" type="number" value="${psEscape(String(p&&p.m2||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Recámaras</label><input id="inm-recs" type="number" value="${psEscape(String(p&&p.recs||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Baños</label><input id="inm-banios" type="number" step="0.5" value="${psEscape(String(p&&p.banios||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Estacionamientos</label><input id="inm-estac" type="number" value="${psEscape(String(p&&p.estacionamientos||''))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div class="md:col-span-2"><label class="text-sm font-medium text-slate-700 mb-1 block">Descripción y amenidades</label><input id="inm-desc" value="${psEscape(p&&p.desc||'')}" placeholder="Ej. Jardín amplio, terraza con asador, seguridad 24/7, cocina equipada" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div><label class="text-sm font-medium text-slate-700 mb-1 block">Destacar en portada</label><select id="inm-destacada" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option ${(p&&p.destacada)?'selected':''}>Sí</option><option ${(!p||!p.destacada)?'selected':''}>No</option></select></div>
            <div class="md:col-span-3 border-t border-slate-200 pt-3 mt-1">
                <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
                    <label class="text-sm font-semibold text-slate-800"><i class="fas fa-images mr-1 text-emerald-600"></i>Galería de fotos de la propiedad (hasta 10, elige cuál es portada)</label>
                    <span class="text-[11px] text-slate-400">Puedes subir archivos o pegar URLs</span>
                </div>
                <div class="grid sm:grid-cols-2 gap-2 mb-3">
                    <input id="inm-fotos" type="file" accept="image/*" multiple data-bx-change="a576" class="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-900">
                    <div class="flex gap-1.5">
                        <input id="inm-foto-url" type="url" placeholder="O pega URL de imagen (https://...)" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white text-slate-900">
                        <button type="button" data-bx-click="a577" class="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 whitespace-nowrap"><i class="fas fa-plus mr-1"></i>Agregar URL</button>
                    </div>
                </div>
                <div id="inm-draft-fotos-wrap"></div>
            </div>
        </div>
        <div class="flex justify-end gap-3 mt-6">
            <button type="button" data-bx-click="a1" class="px-4 py-2 rounded-lg border">Cancelar</button>
            <button type="submit" class="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"><i class="fas fa-save mr-1"></i> Guardar propiedad</button>
        </div>
    </form>`);
    setTimeout(()=>{
        inmRenderDraftFotos();
        const form = document.getElementById('inm-prop-form');
        if(form) form.onsubmit = (e)=>{ e.preventDefault(); inmGuardarProp(id); };
    },0);
}
function inmGuardarProp(id){
    const d = inmD();
    const lee = (k)=>{ const el=document.getElementById(k); return el?el.value.trim():''; };
    const fotosFinales = (window._inmDraftFotos || []).slice(0, 10);
    const est = lee('inm-estado') || 'Disponible';
    const datos = {
        titulo: lee('inm-titulo'),
        tipo: lee('inm-tipo') || 'Venta',
        inmuebleTipo: lee('inm-inm-tipo') || 'Casa',
        precio: parseFloat(lee('inm-precio')) || 0,
        estado: est,
        vendida: est === 'Vendida',
        colonia: lee('inm-colonia'),
        ciudad: lee('inm-ciudad') || 'San Pedro Garza García',
        m2: parseFloat(lee('inm-m2')) || 0,
        recs: parseInt(lee('inm-recs')) || 0,
        banios: parseFloat(lee('inm-banios')) || 0,
        estacionamientos: parseInt(lee('inm-estac')) || 0,
        desc: lee('inm-desc'),
        destacada: lee('inm-destacada') === 'Sí',
        fotos: fotosFinales
    };
    if(!datos.titulo){ showToast('El título de la propiedad es obligatorio','warning'); return; }
    if(id){
        const p = d.props.find(x=>String(x.id)===String(id)); if(!p) return;
        Object.assign(p, datos);
    } else {
        d.props.unshift(Object.assign({ id: Date.now(), fechaAlta: new Date().toISOString(), agenteId: currentUser?currentUser.id:null, agenteNombre: currentUser?currentUser.name:'' }, datos));
    }
    cmLog('Comercial Inmobiliario', id?'Editó propiedad':'Cargó propiedad', datos.titulo+' ('+datos.colonia+')');
    saveDB(); closeModal(); showToast('Propiedad guardada y publicada','success'); render();
}
function inmCambioRapidoEstado(id, nuevoEst){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    if(nuevoEst==='Reservada' && inmEstadoProp(p)!=='Reservada'){
        inmReservar(id);
        return;
    }
    p.estado = nuevoEst || 'Disponible';
    p.vendida = p.estado === 'Vendida';
    if(p.estado === 'Disponible'){
        p.clienteNombre = ''; p.anticipo = 0; p.reservaHasta = ''; p.reservaNotas = '';
    }
    cmLog('Comercial Inmobiliario', 'Cambió estatus a '+p.estado, p.titulo);
    saveDB(); showToast('Estatus actualizado: '+p.estado,'success'); render();
}
function inmReservar(id){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    const defHasta = p.reservaHasta || new Date(Date.now() + 7*86400000).toISOString().slice(0,10);
    showModal(`<div class="p-6">
        <h3 class="text-lg font-bold mb-1">Apartar / Reservar — ${psEscape(p.titulo||'Propiedad')}</h3>
        <p class="text-xs text-slate-500 mb-4">Registra los datos del apartado para mostrar su vigencia en inventario y escaparate.</p>
        <div class="space-y-3">
            <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Cliente que aparta</label><input id="inm-res-cli" value="${psEscape(p.clienteNombre||'')}" placeholder="Nombre del comprador o interesado" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            <div class="grid grid-cols-2 gap-3">
                <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Monto de apartado ($)</label><input id="inm-res-anticipo" type="number" step="1000" value="${psEscape(String(p.anticipo||20000))}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
                <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Vigencia del apartado</label><input id="inm-res-hasta" type="date" value="${psEscape(defHasta)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
            </div>
            <div><label class="text-xs font-semibold text-slate-700 mb-1 block">Notas o condiciones</label><input id="inm-res-notas" value="${psEscape(p.reservaNotas||'')}" placeholder="Ej. En trámite de avalúo hipotecario" class="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
        </div>
        <div class="flex items-center justify-between gap-2 mt-5">
            ${inmEstadoProp(p)==='Reservada'?`<button type="button" data-bx-click="a578" data-p0="${bxE(function(){return p.id})}" class="px-4 py-2 border border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg text-xs font-semibold"><i class="fas fa-unlock mr-1"></i>Liberar a Disponible</button>`:'<span></span>'}
            <div class="flex gap-2">
                <button type="button" data-bx-click="a513" class="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button type="button" data-bx-click="a579" data-p0="${bxE(function(){return p.id})}" class="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold"><i class="fas fa-hand mr-1"></i>Guardar apartado</button>
            </div>
        </div>
    </div>`);
}
function inmLiberarReserva(id){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    p.estado='Disponible'; p.vendida=false; p.clienteNombre=''; p.anticipo=0; p.reservaHasta=''; p.reservaNotas='';
    cmLog('Comercial Inmobiliario','Liberó propiedad', p.titulo);
    saveDB(); closeModal(); showToast('Propiedad liberada como Disponible','success'); render();
}
function inmConfirmaReserva(id){
    const p = inmD().props.find(x=>String(x.id)===String(id)); if(!p) return;
    p.estado='Reservada'; p.vendida=false;
    p.clienteNombre=((document.getElementById('inm-res-cli')||{}).value||'').trim();
    p.anticipo=parseFloat((document.getElementById('inm-res-anticipo')||{}).value)||0;
    p.reservaHasta=((document.getElementById('inm-res-hasta')||{}).value||'').trim();
    p.reservaNotas=((document.getElementById('inm-res-notas')||{}).value||'').trim();
    cmLog('Comercial Inmobiliario','Reservó propiedad', p.titulo);
    saveDB(); closeModal(); showToast('Propiedad apartada','success'); render();
}
function inmBorrarProp(id){
    const rol = (currentUser && currentUser.role || '').toLowerCase();
    if(rol!=='gm' && rol!=='admin'){ showToast('Solo GM/admin puede eliminar propiedades','warning'); return; }
    if(!confirm('¿Eliminar esta propiedad del inventario?')) return;
    const d = inmD();
    const p = d.props.find(x=>String(x.id)===String(id));
    d.props = d.props.filter(x=>String(x.id)!==String(id));
    cmLog('Comercial Inmobiliario','Eliminó propiedad', p?p.titulo:'');
    saveDB(); showToast('Propiedad eliminada','success'); render();
}
function openColoresGraficas(){
    if((currentUser.role||'').toLowerCase()!=='gm'){ showToast('Solo el rol GM puede editar los colores de las gráficas','warning'); return; }
    const ramos=['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'];
    const comps=companiasGraficas(db.ventas||[]);
    const fila=(tipo,nombre,i)=>`<label class="flex items-center justify-between gap-3 py-1"><span class="text-sm">${escapeHTML(nombre)}</span><input type="color" data-gt="${tipo}" data-gn="${escapeHTML(nombre)}" value="${gfColorPara(tipo,nombre,i)}" class="w-10 h-8 rounded cursor-pointer border border-slate-300 bg-white"></label>`;
    showModal(`<div class="p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"><div class="flex items-center justify-between mb-3"><h3 class="text-lg font-bold">Colores de gráficas</h3><button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button></div><p class="text-xs text-slate-500 mb-3">Los colores se aplican en Mi Equipo, Mis Metas y Monitoreo Agencias.</p><div class="border border-slate-200 rounded-xl p-3 mb-3"><p class="text-xs font-bold uppercase text-slate-500 mb-1">Por ramo</p>${ramos.map((r,i)=>fila('ramo',r,i)).join('')}</div><div class="border border-slate-200 rounded-xl p-3"><p class="text-xs font-bold uppercase text-slate-500 mb-1">Por compañía</p>${comps.map((c,i)=>fila('compania',c,i)).join('')||'<p class="text-xs text-slate-400">Sin compañías aún</p>'}</div><div class="flex justify-end gap-2 mt-4"><button data-bx-click="a1" class="px-4 py-2 border border-slate-300 rounded-xl">Cancelar</button><button data-bx-click="a580" class="px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700">Guardar colores</button></div></div>`);
}
function gfGuardarColores(){
    try{
        if((currentUser.role||'').toLowerCase()!=='gm'){ showToast('Solo el rol GM puede editar los colores','warning'); return; }
        const cfg=gfColores();
        let n=0;
        document.querySelectorAll('input[data-gt]').forEach(inp=>{
            const t=inp.getAttribute('data-gt'), nom=inp.getAttribute('data-gn');
            if(!t||!nom) return;
            cfg[t]=cfg[t]||{}; cfg[t][nom]=inp.value; n++;
        });
        cmLog('Gráficas','Editó colores', n+' colores actualizados');
        saveDB(); closeModal(); showToast('Colores actualizados','success'); render();
    }catch(e){ uiToast('Error: '+e.message); }
}

/* Estatus de la póliza: sustituye las etapas libres del Kanban por un ciclo
 * claro. Los registros viejos con etapaKanban Prospecto/Contactado se mapean
 * a «Propuesta» para no perder tarjetas al cambiar de tablero. */
const ESTATUS_CLIENTE = ['Propuesta','Emitido','Pagado','Siniestrado','Cancelado'];
function estatusCliente(c){
    const valor = String((c && (c.estatus || c.etapaKanban)) || '');
    if(ESTATUS_CLIENTE.includes(valor)) return valor;
    if(valor === 'Prospecto' || valor === 'Contactado') return 'Propuesta';
    return 'Emitido';
}
function estatusBadgeCliente(c){
    const e = estatusCliente(c);
    const color = {
        Propuesta: 'bg-amber-100 text-amber-800',
        Emitido: 'bg-indigo-100 text-indigo-800',
        Pagado: 'bg-emerald-100 text-emerald-800',
        Siniestrado: 'bg-orange-100 text-orange-800',
        Cancelado: 'bg-rose-100 text-rose-800'
    }[e] || 'bg-slate-100 text-slate-700';
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${color}">${e}</span>`;
}

function renderMisClientes(){
    if(!db.clientes) db.clientes = [];
    const puedeCargar = ['alumno','agente_desarrollo','agente_agencia'].includes((currentUser.role||'').toLowerCase());
    const puedeVerTodos = ['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
    
    let clientes = puedeVerTodos ? [...db.clientes] : db.clientes.filter(c=>String(c.agenteId)===String(currentUser.id));
    
    const fComp = window.filtroClienteCompania || '';
    const fRamo = window.filtroClienteRamo || '';
    const fAgente = window.filtroClienteAgente || '';
    const fQ = String(window.filtroClienteQ||'').toLowerCase().trim();
    const fMes = window.filtroClienteMes || '';
    const fTrim = window.filtroClienteTrim || '';
    const fAgencia = window.filtroClienteAgencia || '';
    
    if(fQ) clientes = clientes.filter(c=> String(c.nombre||'').toLowerCase().includes(fQ) || String(c.poliza||'').toLowerCase().includes(fQ));
    if(fMes) clientes = clientes.filter(c=>{ const d=new Date(c.fecha); return !isNaN(d) && (d.getMonth()+1)===Number(fMes); });
    if(fTrim) clientes = clientes.filter(c=>{ const d=new Date(c.fecha); return !isNaN(d) && Math.ceil((d.getMonth()+1)/3)===Number(fTrim); });
    if(fComp) clientes = clientes.filter(c=>c.compania===fComp);
    if(fRamo) clientes = clientes.filter(c=>(c.ramo||'').toLowerCase().includes(fRamo.toLowerCase()));
    if(fAgente && puedeVerTodos) clientes = clientes.filter(c=>String(c.agenteId)===String(fAgente));
    if(fAgencia && puedeVerTodos) clientes = clientes.filter(c=>{ const ag=(db.users||[]).find(u=>String(u.id)===String(c.agenteId)); return ag && String(ag.agenciaId||ag.parentId||'')===String(fAgencia); });
    
    clientes.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));
    
    const companias = companiasClientes();
    const esGMRol = (currentUser.role||'').toLowerCase()==='gm';
    const agentesUnicos = [...new Map(db.clientes.map(c=>[String(c.agenteId), {id:c.agenteId, nombre:c.agenteNombre}])).values()];
    const ramosUnicos = [...new Set(db.clientes.map(c=>c.ramo).filter(Boolean))];
    
    const formHtml = puedeCargar ? `
    <div class="bg-white rounded-2xl border border-slate-200 p-6">
        <h3 class="font-semibold text-lg mb-4 flex items-center gap-2"><i class="fas fa-user-plus text-indigo-600"></i> Registrar Nuevo Cliente</h3>
        <form id="form-cliente" class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Foto del cliente</label>
                <input type="file" id="foto-cliente" accept="image/*" class="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Nombre completo *</label>
                <input type="text" id="nombre-cliente" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 flex items-center justify-between">Compañía * ${esGMRol?`<button type="button" data-bx-click="a581" class="text-[11px] text-indigo-600 font-semibold hover:underline"><i class="fas fa-plus mr-0.5"></i> Agregar</button>`:''}</label>
                <select id="compania-cliente" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
                    <option value="">Seleccionar...</option>
                    ${companias.map(c=>`<option value="${c}">${c}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">N. de póliza *</label>
                <input type="text" id="poliza-cliente" required class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Ramo</label>
                <select id="ramo-cliente" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
                    <option value="">Seleccionar...</option>
                    ${['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'].map(r=>`<option value="${r}">${r}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Producto</label>
                <input type="text" id="producto-cliente" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Prima neta</label>
                <input type="number" id="prima-neta-cliente" step="0.01" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Prima total</label>
                <input type="number" id="prima-total-cliente" step="0.01" data-bx-input="a582" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Plazo de contratación (años)</label>
                <input type="number" id="plazo-cliente" min="1" max="30" step="1" placeholder="Ej: 10" data-bx-input="a582" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Aportación total</label>
                <input type="number" id="aportacion-cliente" step="0.01" readonly placeholder="Se calcula: prima total × plazo" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-slate-50 text-slate-900">
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Periodo de pago</label>
                <select id="periodo-cliente" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
                    <option>Mensual</option><option>Trimestral</option><option>Semestral</option><option>Anual</option><option>Único</option>
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Estatus</label>
                <select id="estatus-cliente" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
                    ${ESTATUS_CLIENTE.map(e=>`<option value="${e}" ${e==='Emitido'?'selected':''}>${e}</option>`).join('')}
                </select>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Fecha de emisión</label>
                <input type="date" id="emision-cliente" value="${new Date().toISOString().slice(0,10)}" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
                <p class="text-[11px] text-slate-400 mt-1">Ancla la cobranza: cada pago vence el mismo día de cada periodo. Ej. emitida 29-sep-2026: mensual → 29-oct-2026, trimestral → 29-dic-2026, semestral → 29-mar-2027, anual → 29-sep-2027 (plazo máximo).</p>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">WhatsApp (cobranza) *</label>
                <input type="tel" id="whatsapp-cliente" required placeholder="52 664 123 4567" class="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900">
                <p class="text-[11px] text-slate-400 mt-1">Con lada país (ej. 52 para México). Se usa para enviar recordatorios de pago por WhatsApp.</p>
            </div>
            <div>
                <label class="text-sm font-medium text-slate-700 mb-1 block">Evidencia póliza</label>
                <input type="file" id="evidencia-cliente" accept=".pdf,.jpg,.png" class="w-full text-sm border border-slate-300 rounded-lg p-2 bg-white text-slate-900">
            </div>
            <div class="md:col-span-2 lg:col-span-3 flex justify-end gap-2 pt-2">
                <button type="reset" class="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50">Limpiar</button>
                <button type="submit" class="px-5 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 shadow-sm"><i class="fas fa-save mr-1"></i> Guardar Cliente</button>
            </div>
        </form>
    </div>` : '';
    
    setTimeout(()=>{
        const form = document.getElementById('form-cliente');
        if(form){
            form.onsubmit = async (e)=>{
                e.preventDefault();
                const fotoFile = document.getElementById('foto-cliente').files[0];
                const evidenciaFile = document.getElementById('evidencia-cliente').files[0];
                const readFile = (file)=> new Promise(res=>{ if(!file) return res(null); const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
                const fotoBase64 = await readFile(fotoFile);
                const evidencia = await prepararEvidenciaCliente(evidenciaFile);
                
                const nuevo = {
                    id: Date.now(),
                    agenteId: currentUser.id,
                    agenteNombre: currentUser.name,
                    fecha: new Date().toISOString(),
                    fotoCliente: fotoBase64,
                    nombre: document.getElementById('nombre-cliente').value.trim(),
                    compania: document.getElementById('compania-cliente').value,
                    poliza: document.getElementById('poliza-cliente').value.trim(),
                    ramo: document.getElementById('ramo-cliente').value.trim(),
                    producto: document.getElementById('producto-cliente').value.trim(),
                    primaNeta: parseFloat(document.getElementById('prima-neta-cliente').value)||0,
                    primaTotal: parseFloat(document.getElementById('prima-total-cliente').value)||0,
                    plazoContratacion: parseInt(document.getElementById('plazo-cliente').value)||0,
                    aportacionTotal: parseFloat(document.getElementById('aportacion-cliente').value)||0,
                    periodo: document.getElementById('periodo-cliente').value,
                    estatus: document.getElementById('estatus-cliente').value,
                    fechaEmision: document.getElementById('emision-cliente').value ? new Date(document.getElementById('emision-cliente').value+'T00:00:00').toISOString() : '',
                    whatsapp: document.getElementById('whatsapp-cliente').value.trim(),
                    evidencia: evidencia.url,
                    evidenciaNombre: evidencia.nombre
                };
                db.clientes.push(nuevo);
                db.auditoria = db.auditoria||[];
                db.auditoria.push({id:Date.now(),tipo:'alta_cliente',clienteId:nuevo.id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:null,despues:JSON.parse(JSON.stringify(nuevo))});
                saveDB();
                if(window.showToast) showToast('Cliente guardado','success');
                render();
            };
        }
    },0);
    
    return `<div class="max-w-7xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
            <div>
                <h2 class="text-2xl font-bold text-slate-900">Mis Clientes</h2>
                <p class="text-slate-500 text-sm mt-1">${puedeVerTodos ? 'Vista completa de todos los agentes' : 'Tus clientes registrados'}</p>
            </div>
            <div class="flex flex-wrap gap-2">
                ${(currentUser.role||'').toLowerCase()==='gm' ? `<button data-bx-click="a463" class="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-building mr-1"></i> Compañías</button>` : ''}
                <button data-bx-click="a583" class="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><i class="fas fa-calculator mr-1"></i> Calculadoras por Ramo</button>
                <button data-bx-click="a584" class="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-amber-300 rounded-lg text-sm font-medium border border-amber-400/50"><i class="fas fa-rotate mr-1"></i> Renovaciones y Edad Actuarial</button>
                <button data-bx-click="a585" class="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-medium"><i class="fas fa-calendar-check mr-1"></i> Cobranza y Conciliación</button>
                <button data-bx-click="a586" class="px-3 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-sm font-semibold"><i class="fas fa-coins mr-1"></i> Estado de Cuenta Comisiones</button>
                <button data-bx-click="a587" class="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"><i class="fas fa-file-csv mr-1"></i> Exportar CSV</button>
                <button data-bx-click="a588" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm font-medium"><i class="fas fa-history mr-1"></i> Auditoría</button>
            </div>
        </div>
        ${formHtml}
        ${(() => {
            const ahora = Date.now();
            const sinSeguimiento = clientes.filter(c => {
                const ult = new Date(c.ultimaActividad || c.fecha || 0).getTime();
                return ult > 0 && (ahora - ult) > 7 * 86400000 && estatusCliente(c) === 'Propuesta';
            });
            return sinSeguimiento.length ? `<div class="p-4 rounded-2xl border border-amber-300 bg-amber-50/80 flex items-center justify-between gap-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0"><i class="fas fa-user-clock"></i></div>
                    <div>
                        <p class="text-xs font-bold uppercase text-amber-900">Alerta de seguimiento (#24)</p>
                        <p class="text-sm text-amber-800">Tienes <b>${sinSeguimiento.length}</b> prospecto(s)/cliente(s) en proceso con más de 7 días sin actividad.</p>
                    </div>
                </div>
                <button data-bx-click="a589" class="px-3.5 py-2 rounded-xl bg-slate-900 text-amber-300 text-xs font-semibold">Ver en Kanban</button>
            </div>` : '';
        })()}
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <div class="flex flex-col lg:items-end justify-between gap-4 mb-4">
                <div class="flex items-center gap-3 flex-wrap">
                    <h3 class="font-semibold text-lg">Listado de Clientes (${clientes.length})</h3>
                    <div class="flex rounded-xl border border-amber-300 bg-white overflow-hidden">
                        <button data-bx-click="a590" class="px-3 py-1.5 text-xs font-semibold ${(window.vistaMisClientes||'tabla')==='tabla'?'bg-slate-900 text-amber-300':'text-slate-600 hover:bg-slate-50'}"><i class="fas fa-table mr-1"></i>Tabla</button>
                        <button data-bx-click="a589" class="px-3 py-1.5 text-xs font-semibold ${window.vistaMisClientes==='kanban'?'bg-slate-900 text-amber-300':'text-slate-600 hover:bg-slate-50'}"><i class="fas fa-columns mr-1"></i>Kanban</button>
                    </div>
                </div>
                <div class="flex flex-wrap gap-2">
                    <div class="relative">
                        <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                        <input value="${psEscape(window.filtroClienteQ||'')}" data-bx-input="a591" placeholder="Buscar por nombre o póliza..." class="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    </div>
                    ${puedeVerTodos ? `<select data-bx-change="a592" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todas las agencias</option>
                        ${(db.users||[]).filter(u=>u.role==='agencia').map(a=>`<option value="${a.id}" ${String(fAgencia)===String(a.id)?'selected':''}>${escapeHTML(a.name||a.nombre||'')}</option>`).join('')}
                    </select>` : ''}
                    <select data-bx-change="a593" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los meses</option>
                        ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`<option value="${m}" ${fMes&&Number(fMes)===m?'selected':''}>${new Date(2000,m-1).toLocaleString('es',{month:'long'})}</option>`).join('')}
                    </select>
                    <select data-bx-change="a594" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los trimestres</option>
                        ${[1,2,3,4].map(t=>`<option value="${t}" ${fTrim&&Number(fTrim)===t?'selected':''}>Q${t}</option>`).join('')}
                    </select>
                    <select data-bx-change="a595" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todas las compañías</option>
                        ${companias.map(c=>`<option ${fComp===c?'selected':''}>${c}</option>`).join('')}
                    </select>
                    <select data-bx-change="a596" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los ramos</option>
                        ${ramosUnicos.map(r=>`<option ${fRamo===r?'selected':''}>${r}</option>`).join('')}
                    </select>
                    ${puedeVerTodos ? `<select data-bx-change="a597" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                        <option value="">Todos los agentes</option>
                        ${agentesUnicos.map(a=>`<option value="${a.id}" ${fAgente==a.id?'selected':''}>${escapeHTML(a.nombre)}</option>`).join('')}
                    </select>` : ''}
                    <button data-bx-click="a598" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"><i class="fas fa-eraser mr-1"></i>Limpiar</button>
                </div>
            </div>
            ${window.vistaMisClientes === 'kanban' ? (() => {
                const etapas = ESTATUS_CLIENTE;
                return `<div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                    ${etapas.map(et => {
                        const colItems = clientes.filter(c => estatusCliente(c) === et);
                        return `<div class="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 min-h-[260px] flex flex-col">
                            <div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
                                <span class="text-xs font-bold uppercase text-slate-700">${et}</span>
                                <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-white border border-slate-200">${colItems.length}</span>
                            </div>
                            <div class="space-y-2.5 flex-1">
                                ${colItems.map(c => {
                                    const diasInactivo = Math.floor((Date.now() - new Date(c.ultimaActividad || c.fecha || Date.now()).getTime()) / 86400000);
                                    const est = estatusCliente(c);
                                    const inactivo = diasInactivo > 7 && est === 'Propuesta';
                                    return `<div class="bg-white rounded-xl border ${inactivo ? 'border-amber-400' : 'border-slate-200'} p-3 shadow-sm">
                                        <div class="flex items-center justify-between gap-1 mb-1">
                                            <span class="flex items-center gap-1.5 min-w-0">${c.fotoCliente ? `<img loading="lazy" decoding="async" src="${c.fotoCliente}" class="w-6 h-6 rounded-full object-cover border shrink-0">` : `<span class="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center shrink-0"><i class="fas fa-user text-[10px] text-slate-400"></i></span>`}<span class="font-bold text-xs text-slate-900 truncate">${escapeHTML(c.nombre)}</span></span>
                                            ${inactivo ? `<span class="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold" title="Días sin actividad"><i class="fas fa-clock mr-0.5"></i>${diasInactivo}d</span>` : ''}
                                        </div>
                                        <p class="text-[11px] text-slate-500 truncate">${escapeHTML(c.compania || '')} · ${escapeHTML(c.ramo || '')} · $${Number(c.primaTotal||0).toLocaleString('es-MX')}</p>
                                        <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                                            <select data-bx-change="a599" data-p0="${bxE(function(){return c.id})}" class="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 bg-slate-50 text-slate-700">
                                                ${etapas.map(opt => `<option value="${opt}" ${est===opt?'selected':''}>${opt}</option>`).join('')}
                                            </select>
                                            <button data-bx-click="a600" data-p0="${bxE(function(){return c.id})}" class="text-xs text-amber-600 hover:text-amber-800 px-1.5" title="Seguimiento / Cobranza"><i class="fab fa-whatsapp"></i></button>
                                        </div>
                                    </div>`;
                                }).join('') || '<p class="text-xs text-slate-400 text-center py-6">Sin registros</p>'}
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            })() : `<div>
                <!-- Vista de tarjetas táctiles para móviles (< md) -->
                <div class="md:hidden space-y-3">
                    ${clientes.map(c => {
                        const puedeEditar = puedeVerTodos || String(c.agenteId)===String(currentUser.id);
                        const nivelCob = cbzNivel(c);
                        return `<div class="rounded-2xl border ${nivelCob==='rojo'?'border-red-300 bg-red-50/40':'border-slate-200 bg-white'} p-3.5 shadow-xs space-y-2.5">
                            <div class="flex items-start justify-between gap-2.5">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    ${c.fotoCliente ? `<img loading="lazy" decoding="async" src="${c.fotoCliente}" class="w-11 h-11 rounded-full object-cover border shrink-0">` : `<div class="w-11 h-11 rounded-full bg-slate-200 flex items-center justify-center shrink-0"><i class="fas fa-user text-slate-400"></i></div>`}
                                    <div class="min-w-0">
                                        <h4 class="font-bold text-slate-900 text-sm truncate">${escapeHTML(c.nombre)}</h4>
                                        <p class="text-xs text-slate-500 truncate">${escapeHTML(c.compania || '')} · Póliza <span class="font-mono font-semibold text-slate-700">${escapeHTML(c.poliza || '')}</span></p>
                                    </div>
                                </div>
                                <div class="text-right shrink-0">
                                    <p class="font-bold text-slate-900 text-sm">$${Number(c.primaTotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</p>
                                    <div class="flex items-center justify-end gap-1 mt-0.5"><span class="text-[11px] text-slate-500">${escapeHTML(c.periodo||'')}</span>${cbzBadge(c)}</div>
                                    <div class="flex justify-end mt-1">${estatusBadgeCliente(c)}</div>
                                </div>
                            </div>
                            <div class="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                                <span><i class="fas fa-user-tie mr-1 text-slate-400"></i>${escapeHTML(c.agenteNombre||'')}</span>
                                <span><i class="fas fa-calendar mr-1 text-slate-400"></i>${c.fechaEmision?new Date(c.fechaEmision).toLocaleDateString('es-MX'):new Date(c.fecha).toLocaleDateString('es-MX')}</span>
                                ${c.evidencia ? `<button data-bx-click="a601" data-p0="${bxE(function(){return c.id})}" class="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold"><i class="fas fa-eye mr-1"></i>Póliza</button>` : ''}
                            </div>
                            ${puedeEditar ? `<div class="grid grid-cols-5 gap-1.5 pt-1">
                                <button data-bx-click="a602" data-p0="${bxE(function(){return c.id})}" class="py-2 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 text-[11px] font-semibold flex flex-col items-center gap-0.5" title="Expediente 360°"><i class="fas fa-id-card-clip text-sm"></i><span>360°</span></button>
                                <button data-bx-click="a600" data-p0="${bxE(function(){return c.id})}" class="py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-[11px] font-semibold flex flex-col items-center gap-0.5" title="Cobranza"><i class="fas fa-hand-holding-dollar text-sm"></i><span>Cobro</span></button>
                                <button data-bx-click="a603" data-p0="${bxE(function(){return c.id})}" class="py-2 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 text-[11px] font-semibold flex flex-col items-center gap-0.5" title="Siniestro"><i class="fas fa-file-shield text-sm"></i><span>Siniestro</span></button>
                                <button data-bx-click="a604" data-p0="${bxE(function(){return c.id})}" class="py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 text-[11px] font-semibold flex flex-col items-center gap-0.5" title="Editar"><i class="fas fa-pen text-sm"></i><span>Editar</span></button>
                                <button data-bx-click="a605" data-p0="${bxE(function(){return c.id})}" class="py-2 rounded-xl bg-rose-50 text-rose-600 hover:bg-rose-100 text-[11px] font-semibold flex flex-col items-center gap-0.5" title="Borrar"><i class="fas fa-trash text-sm"></i><span>Borrar</span></button>
                            </div>` : ''}
                        </div>`;
                    }).join('') || `<div class="p-8 text-center text-slate-500 text-sm">No hay clientes registrados</div>`}
                </div>
                <!-- Tabla completa para escritorio (md+) -->
                <div class="hidden md:block overflow-x-auto">
                <table class="w-full text-sm">
                    <thead class="bg-slate-50 text-left text-slate-600">
                        <tr>
                            <th class="p-3 font-medium">Foto</th>
                            <th class="p-3 font-medium">Nombre</th>
                            <th class="p-3 font-medium">Compañía</th>
                            <th class="p-3 font-medium">Póliza</th>
                            <th class="p-3 font-medium">Prima Total</th>
                            <th class="p-3 font-medium">Aportación Total</th>
                            <th class="p-3 font-medium">Periodo</th>
                            <th class="p-3 font-medium">Estatus</th>
                            <th class="p-3 font-medium">Agente</th>
                            <th class="p-3 font-medium">Fecha</th>
                            <th class="p-3 font-medium">Emisión</th>
                            <th class="p-3 font-medium">Evidencia</th>
                            <th class="p-3 font-medium">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${clientes.map(c=>{
                            const puedeEditar = puedeVerTodos || String(c.agenteId)===String(currentUser.id);
                            const nivelCob = cbzNivel(c);
                            return `<tr class="border-t ${nivelCob==='rojo'?'bg-red-50/60':''} hover:bg-slate-50">
                                <td class="p-3">${c.fotoCliente ? `<img loading="lazy" decoding="async" src="${c.fotoCliente}" class="w-10 h-10 rounded-full object-cover border">` : `<div class="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center"><i class="fas fa-user text-slate-400"></i></div>`}</td>
                                <td class="p-3 font-medium">${escapeHTML(c.nombre)}</td>
                                <td class="p-3"><span class="px-2 py-1 bg-slate-100 rounded text-xs">${c.compania}</span></td>
                                <td class="p-3 font-mono text-xs">${escapeHTML(c.poliza)}</td>
                                <td class="p-3 font-semibold">$${Number(c.primaTotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
                                <td class="p-3">${Number(c.aportacionTotal||0)>0 ? `<span class="font-semibold">$${Number(c.aportacionTotal).toLocaleString('es-MX',{minimumFractionDigits:2})}</span>${c.plazoContratacion?` <span class="text-xs text-slate-400">(${c.plazoContratacion} años)</span>`:''}` : '<span class="text-slate-400 text-xs">-</span>'}</td>
                                <td class="p-3"><div class="flex items-center gap-1.5">${escapeHTML(c.periodo||'')}${cbzBadge(c)}</div></td>
                                <td class="p-3">${estatusBadgeCliente(c)}</td>
                                <td class="p-3 text-xs">${escapeHTML(c.agenteNombre)}</td>
                                <td class="p-3 text-xs text-slate-500">${new Date(c.fecha).toLocaleDateString('es-MX')}</td>
                                <td class="p-3 text-xs ${c.fechaEmision?'text-slate-600':'text-slate-300'}">${c.fechaEmision?new Date(c.fechaEmision).toLocaleDateString('es-MX'):'—'}</td>
                                <td class="p-3">${c.evidencia ? `<button data-bx-click="a601" data-p0="${bxE(function(){return c.id})}" class="text-indigo-600 hover:text-indigo-800 text-xs"><i class="fas fa-eye mr-1"></i>Ver</button>` : '<span class="text-slate-400 text-xs">-</span>'}</td>
                                <td class="p-3">${puedeEditar ? `<div class="flex gap-2"><button data-bx-click="a602" data-p0="${bxE(function(){return c.id})}" class="text-teal-600 hover:text-teal-800" title="Expediente 360° y Venta Cruzada (#6)"><i class="fas fa-id-card-clip"></i></button><button data-bx-click="a600" data-p0="${bxE(function(){return c.id})}" class="text-amber-500 hover:text-amber-700" title="Cobranza / recordatorio de pago"><i class="fas fa-hand-holding-dollar"></i></button><button data-bx-click="a603" data-p0="${bxE(function(){return c.id})}" class="text-orange-500 hover:text-orange-700" title="Siniestro / Cancelación"><i class="fas fa-file-shield"></i></button><button data-bx-click="a604" data-p0="${bxE(function(){return c.id})}" class="text-slate-500 hover:text-indigo-600" title="Modificar"><i class="fas fa-pen"></i></button><button data-bx-click="a605" data-p0="${bxE(function(){return c.id})}" class="text-slate-500 hover:text-red-600" title="Borrar"><i class="fas fa-trash"></i></button></div>` : ''}</td>
                            </tr>`;
                        }).join('') || `<tr><td colspan="13" class="p-8 text-center text-slate-500">No hay clientes registrados</td></tr>`}
                    </tbody>
                </table>
                </div>
            </div>`}
        </div>
    </div>`;
}

function cambiarEtapaKanbanCliente(id, etapa){
    const c = (db.clientes || []).find(x => String(x.id) === String(id));
    if(!c || !ESTATUS_CLIENTE.includes(etapa)) return;
    c.estatus = etapa;
    c.etapaKanban = etapa; // compatibilidad con registros/versiones previas
    c.ultimaActividad = new Date().toISOString();
    saveDB();
    if(window.showToast) showToast('Cliente movido a ' + etapa, 'success');
    render();
}

function actualizarAportacionCliente(){
    const pt = parseFloat((document.getElementById('prima-total-cliente')||{}).value)||0;
    const pl = parseInt((document.getElementById('plazo-cliente')||{}).value)||0;
    const out = document.getElementById('aportacion-cliente');
    if(out) out.value = (pt>0 && pl>0) ? (pt*pl) : '';
}

function cbzNormalizaTel(t){
    let d=String(t||'').replace(/[^0-9]/g,'');
    if(d.length===10) d='52'+d;
    return d;
}
function cbzMesesPeriodo(c){
    const per=String(c.periodo||'').toLowerCase();
    return per.startsWith('mens')?1:per.startsWith('trimes')?3:per.startsWith('semes')?6:per.startsWith('anual')?12:0;
}
function cbzPagosPorAnio(c){
    const per=String(c.periodo||'').toLowerCase();
    return per.startsWith('mens')?12:per.startsWith('trimes')?4:per.startsWith('semes')?2:1;
}
function cbzEtiquetaCuota(c){
    const per=String(c.periodo||'').toLowerCase();
    return per.startsWith('mens')?'cuota mensual':per.startsWith('trimes')?'cuota trimestral':per.startsWith('semes')?'cuota semestral':per.startsWith('anual')?'pago anual':'pago único';
}
function cbzMontoCuota(c){
    const n=cbzPagosPorAnio(c);
    return n>1?(Number(c.primaTotal||0)/n):Number(c.primaTotal||0);
}
function cbzVigenciaFin(c){
    const ancla=c.fechaEmision?new Date(c.fechaEmision):(c.fechaCobranza?new Date(c.fechaCobranza):new Date(c.fecha));
    if(isNaN(ancla)) return null;
    const fin=new Date(ancla.getTime()); fin.setHours(0,0,0,0); fin.setMonth(fin.getMonth()+12);
    return fin;
}
function cbzProximoVencimiento(c){
    const meses=cbzMesesPeriodo(c);
    if(!meses) return null;
    // Ancla del ciclo: último pago registrado > fecha de emisión > fecha de alta
    let base=c.fechaCobranza?new Date(c.fechaCobranza):(c.fechaEmision?new Date(c.fechaEmision):new Date(c.fecha));
    if(isNaN(base)) return null;
    base.setHours(0,0,0,0);
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    // El primer cargo vence un periodo completo después del ancla:
    // emisión 29-sep-2026 → mensual vence 29-oct-2026, trimestral 29-dic-2026, semestral 29-mar-2027, anual 29-sep-2027 (plazo máximo)
    const d=new Date(base.getTime());
    d.setMonth(d.getMonth()+meses);
    let guard=0;
    while(d.getTime() < hoy.getTime()-7*86400000 && guard<600){ d.setMonth(d.getMonth()+meses); guard++; }
    return d;
}
function cbzDiasPara(c){
    const v=cbzProximoVencimiento(c); if(!v) return null;
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    return Math.round((v.getTime()-hoy.getTime())/86400000);
}
function cbzNivel(c){
    const dias=cbzDiasPara(c);
    if(dias===null) return null;
    if(dias<0) return 'rojo';
    if(dias<=7) return 'amarillo';
    return 'verde';
}
function cbzBadge(c){
    const nivel=cbzNivel(c);
    if(nivel==='rojo'){ const d=Math.abs(cbzDiasPara(c)); return `<span title="Pago vencido hace ${d} día${d===1?'':'s'}" class="inline-grid place-items-center w-6 h-6 rounded-full bg-red-100 text-red-600"><i class="fas fa-circle-exclamation text-xs"></i></span>`; }
    if(nivel==='amarillo'){ const d=cbzDiasPara(c); return `<span title="Vence en ${d} día${d===1?'':'s'}" class="inline-grid place-items-center w-6 h-6 rounded-full bg-amber-100 text-amber-600 animate-pulse"><i class="fas fa-bell text-xs"></i></span>`; }
    if(nivel==='verde'){ const d=cbzDiasPara(c); return `<span title="Vence en ${d} días" class="inline-grid place-items-center w-6 h-6 rounded-full bg-emerald-50 text-emerald-500"><i class="fas fa-check text-xs"></i></span>`; }
    return `<span class="text-slate-300 text-xs" title="Pago único o sin ciclo de cobranza">—</span>`;
}
function cbzMensaje(c){
    const venc=cbzProximoVencimiento(c);
    const fechaStr=venc?venc.toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'la próxima fecha de su ciclo';
    const n=cbzPagosPorAnio(c);
    const monto='$'+cbzMontoCuota(c).toLocaleString('es-MX',{minimumFractionDigits:2})+(n>1?(' ('+cbzEtiquetaCuota(c)+' de $'+Number(c.primaTotal||0).toLocaleString('es-MX',{minimumFractionDigits:2})+')'):'');
    const per=String(c.periodo||'').toLowerCase();
    const NL='\n';
    return ['Hola '+(c.nombre||'cliente')+', le saluda '+currentUser.name+', su asesor de seguros.',
        '',
        'Le recuerdo con amabilidad que su pago '+((per&&per!=='único'&&per!=='unico')?('del periodo *'+per+'* '):'')+'de la póliza *'+(c.poliza||'')+'*'+(c.compania?' ('+c.compania+')':'')+' tiene como fecha límite el *'+fechaStr+'*.',
        '',
        '💰 Monto a pagar: *'+monto+'*',
        '',
        'Si ya realizó su pago, haga caso omiso de este mensaje. Cualquier duda o aclaración, estoy a sus órdenes.',
        '',
        '¡Gracias por su confianza! 🙌'].join(NL);
}
function cbzLink(c,msg){
    return 'https://wa.me/'+cbzNormalizaTel(c.whatsapp)+'?text='+encodeURIComponent(msg||cbzMensaje(c));
}
function cbzRegistrarLog(tipo,c,detalle){
    db.auditoria=db.auditoria||[];
    db.auditoria.push({id:Date.now(),tipo:tipo,clienteId:c.id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:null,despues:{nombre:c.nombre,poliza:c.poliza,detalle:detalle||''}});
}
function openCobranza(id){
    const c=(db.clientes||[]).find(x=>x.id===id); if(!c) return;
    const nivel=cbzNivel(c);
    const estadoTxt=nivel==='rojo'?'<span class="font-bold text-red-600">Vencido hace '+Math.abs(cbzDiasPara(c))+' días</span>':nivel==='amarillo'?'<span class="font-bold text-amber-600">Vence en '+cbzDiasPara(c)+' días</span>':nivel==='verde'?'<span class="font-semibold text-emerald-600">Al corriente (vence en '+cbzDiasPara(c)+' días)</span>':'<span class="text-slate-500">Pago único — sin ciclo de cobranza</span>';
    const fechaVal=c.fechaEmision?new Date(c.fechaEmision):(c.fechaCobranza?new Date(c.fechaCobranza):new Date(c.fecha));
    const fechaISO=isNaN(fechaVal)?'':fechaVal.toISOString().slice(0,10);
    const vig=cbzVigenciaFin(c);
    const ultimo=c.ultimoRecordatorio?'<p class="text-[11px] text-slate-400 mt-1">Último recordatorio: '+new Date(c.ultimoRecordatorio).toLocaleString('es-MX')+'</p>':'';
    showModal(`<div class="p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-3"><h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-hand-holding-dollar text-amber-500"></i> Cobranza — ${escapeHTML(c.nombre)}</h3><button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button></div>
    <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm grid grid-cols-2 gap-2 mb-3">
        <div><span class="text-[11px] uppercase text-slate-400 font-bold">Estado</span><div>${estadoTxt}</div></div>
        <div><span class="text-[11px] uppercase text-slate-400 font-bold">Periodo</span><div class="flex items-center gap-1.5">${escapeHTML(c.periodo||'—')}${cbzBadge(c)}</div></div>
        <div><span class="text-[11px] uppercase text-slate-400 font-bold">Cuota a cobrar</span><div class="font-bold">$${cbzMontoCuota(c).toLocaleString('es-MX',{minimumFractionDigits:2})}</div><div class="text-[10px] text-slate-400">${cbzEtiquetaCuota(c)}${Number(c.primaTotal||0)>0?' · prima total $'+Number(c.primaTotal).toLocaleString('es-MX',{minimumFractionDigits:2}):''}</div></div>
        <div><span class="text-[11px] uppercase text-slate-400 font-bold">WhatsApp</span><div class="font-mono text-xs">${escapeHTML(c.whatsapp||'Sin número — edítalo en el cliente')}</div></div>
        <div><span class="text-[11px] uppercase text-slate-400 font-bold">Emisión</span><div class="text-xs font-semibold">${fechaISO?new Date(fechaISO).toLocaleDateString('es-MX'):'—'}</div></div>
        <div><span class="text-[11px] uppercase text-slate-400 font-bold">Plazo máximo</span><div class="text-xs font-semibold">${vig?vig.toLocaleDateString('es-MX'):'—'}</div></div>
    </div>
    <div class="flex items-end gap-2 mb-3">
        <div class="flex-1"><label class="text-xs font-bold uppercase text-slate-500">Fecha de emisión (ancla del ciclo de cobranza)</label><input type="date" id="cbz-fecha" value="${fechaISO}" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"></div>
        <button data-bx-click="a606" data-p0="${bxE(function(){return c.id})}" class="px-3 py-2 border border-slate-300 rounded-lg text-sm hover:bg-slate-50">Guardar fecha</button>
    </div>
    <label class="text-xs font-bold uppercase text-slate-500">Mensaje del recordatorio (editable)</label>
    <textarea id="cbz-msg" rows="9" class="w-full mt-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${escapeHTML(cbzMensaje(c))}</textarea>
    ${ultimo}
    <div class="flex gap-2 mt-4">
        <button data-bx-click="a607" data-p0="${bxE(function(){return c.id})}" class="flex-1 px-4 py-2.5 bg-[#25D366] hover:brightness-95 text-white rounded-xl font-bold" ${c.whatsapp?'':'disabled'}><i class="fab fa-whatsapp mr-1"></i> Enviar por WhatsApp</button>
        <button data-bx-click="a608" data-p0="${bxE(function(){return c.id})}" class="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-sm"><i class="fas fa-check mr-1"></i> Pagó</button>
    </div>
    <p class="text-[11px] text-slate-400 mt-3">«Pagó» registra hoy como último pago y corre el siguiente vencimiento un periodo completo. Cambiar la fecha de emisión re-ancla el ciclo al día de emisión.</p>
  </div>`);
}
function cbzGuardarFecha(id){
    const c=(db.clientes||[]).find(x=>x.id===id); if(!c) return;
    const val=(document.getElementById('cbz-fecha')||{}).value;
    if(!val){ if(window.showToast) showToast('Selecciona una fecha','warning'); return; }
    c.fechaEmision=new Date(val+'T00:00:00').toISOString();
    c.fechaCobranza='';
    cbzRegistrarLog('cobranza_emision',c,'Fecha de emisión (ancla de cobranza): '+val);
    saveDB(); if(window.showToast) showToast('Fecha de emisión actualizada: ciclo re-anclado','success'); closeModal(); render();
}
function cbzEnviar(id){
    const c=(db.clientes||[]).find(x=>x.id===id); if(!c) return;
    if(!c.whatsapp){ if(window.showToast) showToast('El cliente no tiene WhatsApp registrado; edítalo primero','warning'); return; }
    const ta=document.getElementById('cbz-msg');
    const msg=ta?ta.value:cbzMensaje(c);
    window.open(cbzLink(c,msg),'_blank');
    c.ultimoRecordatorio=Date.now();
    cbzRegistrarLog('cobranza_whatsapp',c,'Recordatorio enviado por WhatsApp');
    saveDB(); if(window.showToast) showToast('WhatsApp abierto con el recordatorio','success'); closeModal(); render();
}
function cbzMarcarPagado(id){
    const c=(db.clientes||[]).find(x=>x.id===id); if(!c) return;
    c.fechaCobranza=new Date().toISOString();
    c.recibosConciliados = (c.recibosConciliados || 0) + 1;
    const prox=cbzProximoVencimiento(c);
    cbzRegistrarLog('cobranza_pago',c,'Pago conciliado'+(prox?'; siguiente vencimiento: '+prox.toLocaleDateString('es-MX'):''));
    saveDB(); if(window.showToast) showToast('Pago conciliado y comisión devengada actualizada','success'); closeModal(); render();
}

// === FASE 2 (#4): MOTOR DE RENOVACIONES A 60 / 30 / 15 DÍAS ===
function openRenovacionesMotor(){
    const puedeVerTodos=['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
    const base=puedeVerTodos?[...(db.clientes||[])]:[...(db.clientes||[])].filter(c=>String(c.agenteId)===String(currentUser.id));
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const items=base.map(c=>{
        const fin=cbzVigenciaFin(c);
        const dias=fin?Math.round((fin.getTime()-hoy.getTime())/86400000):999;
        return { c, fin, dias };
    }).filter(x=>x.dias<=90).sort((a,b)=>a.dias-b.dias);
    const b15=items.filter(x=>x.dias<=15).length;
    const b30=items.filter(x=>x.dias>15 && x.dias<=30).length;
    const b60=items.filter(x=>x.dias>30 && x.dias<=60).length;
    showModal(`<div class="p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-rotate text-amber-600"></i> Motor de Renovaciones Anuales (60 / 30 / 15 días)</h3>
            <button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button>
        </div>
        <div class="grid grid-cols-3 gap-2.5 mb-4 text-center text-xs">
            <div class="p-3 rounded-xl bg-red-50 border border-red-200"><div class="text-2xl font-black text-red-600">${b15}</div>Urgentes (≤15 días)</div>
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200"><div class="text-2xl font-black text-amber-600">${b30}</div>Próximas (16–30 días)</div>
            <div class="p-3 rounded-xl bg-blue-50 border border-blue-200"><div class="text-2xl font-black text-blue-600">${b60}</div>Preventivas (31–60 días)</div>
        </div>
        <div class="space-y-2 max-h-[50vh] overflow-y-auto">
            ${items.map(({c,fin,dias})=>{
                const badge = dias<0 ? `<span class="px-2 py-0.5 rounded bg-red-600 text-white text-[10px] font-bold">Vencida hace ${Math.abs(dias)}d</span>`
                            : dias<=15 ? `<span class="px-2 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold">Renueva en ${dias}d</span>`
                            : dias<=30 ? `<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">Renueva en ${dias}d</span>`
                            : `<span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">Renueva en ${dias}d</span>`;
                const esVidaGMM = /vida|gmm|m[eé]dico|inversi/i.test(c.ramo||'');
                const badgeActuarial = esVidaGMM ? `<span class="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold" title="En Vida y GMM la tarifa sube al cambiar la edad actuarial"><i class="fas fa-cake-candles mr-1"></i>Cambio Edad Actuarial</span>` : '';
                const msgRenov = encodeURIComponent(`Hola ${c.nombre}, te saluda ${currentUser.name}. Tu póliza ${c.poliza||''} (${c.compania||''}) cumple su aniversario el ${fin?fin.toLocaleDateString('es-MX'):'próximo mes'}. Ya preparé tu propuesta de renovación y blindaje de edad actuarial para mantener tu antigüedad y beneficios. ¿La revisamos hoy?`);
                return `<div class="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">${badge}${badgeActuarial}<span class="font-bold text-sm text-slate-900 truncate">${escapeHTML(c.nombre)}</span></div>
                        <p class="text-xs text-slate-500 mt-0.5">Póliza ${escapeHTML(c.poliza||'—')} · ${escapeHTML(c.compania||'')} · ${escapeHTML(c.ramo||'')} · Prima $${Number(c.primaTotal||0).toLocaleString('es-MX')} · Aniversario: ${fin?fin.toLocaleDateString('es-MX'):'—'}</p>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${c.whatsapp?`<a href="https://wa.me/${cbzNormalizaTel(c.whatsapp)}?text=${msgRenov}" target="_blank" class="px-2.5 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-bold" title="WhatsApp Renovación"><i class="fab fa-whatsapp"></i></a>`:''}
                        <button data-bx-click="a609" class="px-2.5 py-1.5 rounded-lg bg-slate-900 text-amber-300 text-xs font-semibold">Recotizar</button>
                    </div>
                </div>`;
            }).join('') || '<p class="text-center text-slate-400 py-8 text-sm">No hay pólizas próximas a renovar en los siguientes 90 días.</p>'}
        </div>
    </div>`);
}

// === FASE 2 (#6): EXPEDIENTE ÚNICO 360° Y VENTA CRUZADA (CROSS-SELLING) ===
function openExpediente360(clienteId){
    const c=(db.clientes||[]).find(x=>String(x.id)===String(clienteId)); if(!c) return;
    const nomNorm=String(c.nombre||'').toLowerCase().trim();
    const telNorm=cbzNormalizaTel(c.whatsapp||'').slice(-10);
    const polizas=(db.clientes||[]).filter(x=>String(x.nombre||'').toLowerCase().trim()===nomNorm || (telNorm && cbzNormalizaTel(x.whatsapp||'').endsWith(telNorm)));
    const cots=((typeof cotDB==='function'?cotDB():db.cotizaciones)||[]).filter(s=>String(s.cliente?.nombre||'').toLowerCase().trim()===nomNorm);
    const autos=((db.autoHub&&db.autoHub.clientes)||[]).filter(a=>String(a.nombre||'').toLowerCase().trim()===nomNorm || (telNorm && String(a.tel||'').replace(/\D/g,'').endsWith(telNorm)));
    const inm=(db.inmCartera||[]).filter(i=>String(i.cliente||'').toLowerCase().trim()===nomNorm);

    const tieneVida=polizas.some(p=>/vida|inversi/i.test(p.ramo||''));
    const tieneGMM=polizas.some(p=>/gmm|m[eé]dico/i.test(p.ramo||''));
    const tieneAuto=polizas.some(p=>/auto/i.test(p.ramo||'')) || autos.length>0;
    const tieneInm=inm.length>0;
    const oportunidades=[];
    if(!tieneVida) oportunidades.push('Plan de Vida / Ahorro para el Retiro');
    if(!tieneGMM) oportunidades.push('Gastos Médicos Mayores (Protección Familiar)');
    if(!tieneAuto) oportunidades.push('Póliza de Seguro de Auto / Cambio de Unidad en Agencia');
    if(!tieneInm) oportunidades.push('Inversión Patrimonial Inmobiliaria');

    showModal(`<div class="p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
            <div>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">Vista Ejecutiva 360° (#6)</span>
                <h3 class="text-xl font-bold text-slate-900 mt-1">${escapeHTML(c.nombre)}</h3>
                <p class="text-xs text-slate-500">WhatsApp: ${escapeHTML(c.whatsapp||'—')} · Asesor: ${escapeHTML(c.agenteNombre||'—')}</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><p class="text-[11px] text-slate-500">Pólizas Activas</p><p class="text-xl font-bold text-slate-900">${polizas.length}</p></div>
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><p class="text-[11px] text-slate-500">Prima Anual Acum.</p><p class="text-lg font-bold text-emerald-700">$${polizas.reduce((s,x)=>s+Number(x.primaTotal||0),0).toLocaleString('es-MX')}</p></div>
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><p class="text-[11px] text-slate-500">Cotizaciones</p><p class="text-xl font-bold text-indigo-700">${cots.length}</p></div>
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><p class="text-[11px] text-slate-500">Autos / Inmuebles</p><p class="text-xl font-bold text-amber-700">${autos.length + inm.length}</p></div>
        </div>
        <div class="mb-4 p-4 rounded-xl bg-amber-50/70 border border-amber-200">
            <h4 class="text-xs font-bold uppercase text-amber-900 mb-2"><i class="fas fa-lightbulb text-amber-600 mr-1"></i>Oportunidades de Venta Cruzada (Cross-Selling)</h4>
            ${oportunidades.length ? `<ul class="space-y-1 text-xs text-slate-700">${oportunidades.map(o=>`<li><i class="fas fa-arrow-trend-up text-emerald-600 mr-1.5"></i>${o}</li>`).join('')}</ul>` : '<p class="text-xs text-emerald-700 font-semibold">¡Cliente blindado en las 4 líneas de negocio!</p>'}
        </div>
        <div class="space-y-2">
            <h4 class="text-xs font-bold uppercase text-slate-500">Productos contratados y expedientes</h4>
            ${polizas.map(p=>`<div class="p-2.5 rounded-lg border border-slate-200 bg-white flex justify-between text-xs"><span><b>${escapeHTML(p.ramo||'Seguro')}</b> · ${escapeHTML(p.compania||'')} · Póliza ${escapeHTML(p.poliza||'')}</span><span class="font-bold text-emerald-700">$${Number(p.primaTotal||0).toLocaleString('es-MX')}</span></div>`).join('')}
        </div>
    </div>`);
}

// === ESTADO DE CUENTA DE COMISIONES, BONOS Y CONCILIACIÓN ===
/* Porcentajes elegibles por póliza (0–50 en pasos de 1%). «Auto» deja el
 * tabulador del ramo; cualquier otro valor se guarda en el cliente y manda
 * sobre el tabulador en todos los cálculos. */
const PCT_COMISION_OPCIONES = Array.from({length: 51}, (_, i) => i);

function pctComisionCliente(c, tasaRamo){
    const manual = Number(c && c.comisionPct);
    if(c && c.comisionPct !== undefined && c.comisionPct !== null && c.comisionPct !== ''
        && Number.isFinite(manual) && manual >= 0 && manual <= 100){
        return { pct: manual / 100, manual: manual };
    }
    return { pct: tasaRamo(c && c.ramo), manual: null };
}

function cambiarComisionCliente(id){
    const c = (db.clientes||[]).find(x=>String(x.id)===String(id));
    if(!c) return;
    const valor = (this && this.value !== undefined) ? String(this.value) : '';
    if(valor === ''){
        /* null se sincroniza; `delete` no borra la clave en el servidor porque
         * el PUT hace merge del registro y la volvería a traer en el pull. */
        c.comisionPct = null;
    } else {
        const n = Number(valor);
        if(Number.isFinite(n) && n >= 0 && n <= 100) c.comisionPct = n;
    }
    saveDB();
    openEstadoCuentaComisiones();
}

function openEstadoCuentaComisiones(){
    const puedeVerTodos=['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
    const lista=puedeVerTodos?[...(db.clientes||[])]:[...(db.clientes||[])].filter(c=>String(c.agenteId)===String(currentUser.id));
    const tasaRamo=(ramo)=>{
        const r=String(ramo||'').toUpperCase();
        if(r.includes('VIDA')||r.includes('INVERSI')) return 0.30;
        if(r.includes('GMM')) return 0.18;
        if(r.includes('AUTO')) return 0.12;
        return 0.15;
    };
    let primaTotalCartera=0, comisionProyectada=0, comisionDevengada=0;
    const filas=lista.map(c=>{
        /* Sobre la PRIMA TOTAL (lo que paga el cliente). La prima neta queda
         * solo como respaldo para registros viejos sin total capturado. */
        const prima=Number(c.primaTotal)||Number(c.primaNeta)||0;
        const tasa=pctComisionCliente(c, tasaRamo);
        const pct=tasa.pct;
        const comAnual=prima*pct;
        const pagado=Boolean(c.fechaCobranza) || (c.recibosConciliados||0)>0;
        primaTotalCartera+=prima;
        comisionProyectada+=comAnual;
        if(pagado) comisionDevengada+=comAnual;
        return `<tr class="border-t text-xs">
            <td class="p-2 font-semibold">${escapeHTML(c.nombre)}</td>
            <td class="p-2">
                <div class="flex items-center gap-1.5">
                    <span class="text-slate-600">${escapeHTML(c.ramo||'General')}</span>
                    <select data-bx-change="g:cambiarComisionCliente" data-p0="${bxE(function(){return c.id})}" title="Porcentaje de comisión sobre la prima total" class="border border-slate-300 rounded px-1 py-0.5 bg-white text-slate-900 text-xs">
                        <option value="" ${tasa.manual===null?'selected':''}>Auto (${Math.round(tasaRamo(c.ramo)*100)}%)</option>
                        ${PCT_COMISION_OPCIONES.map(n=>`<option value="${n}" ${tasa.manual===n?'selected':''}>${n}%</option>`).join('')}
                    </select>
                </div>
            </td>
            <td class="p-2">$${prima.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
            <td class="p-2 font-bold text-amber-800">$${comAnual.toLocaleString('es-MX',{minimumFractionDigits:2})}</td>
            <td class="p-2">${pagado?'<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">Conciliado</span>':'<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-600">Por conciliar</span>'}</td>
        </tr>`;
    }).join('');
    const bonoMeta = lista.length >= 10 ? 5000 : (lista.length >= 5 ? 2000 : 0);
    showModal(`<div class="modal-large p-6 max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between mb-4">
            <div>
                <h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-coins text-amber-600"></i> Estado de Cuenta de Comisiones y Conciliación</h3>
                <p class="text-xs text-slate-500">Cálculo automático sobre la prima total con el porcentaje que elijas por póliza; «Auto» usa el tabulador del ramo y los recibos conciliados marcan lo devengado.</p>
            </div>
            <button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div class="p-3 rounded-xl bg-slate-50 border border-slate-200"><p class="text-[11px] text-slate-500">Prima en Cartera</p><p class="text-lg font-bold text-slate-900">$${Math.round(primaTotalCartera).toLocaleString('es-MX')}</p></div>
            <div class="p-3 rounded-xl bg-amber-50 border border-amber-200"><p class="text-[11px] text-amber-900">Comisión Proyectada</p><p class="text-lg font-bold text-amber-800">$${Math.round(comisionProyectada).toLocaleString('es-MX')}</p></div>
            <div class="p-3 rounded-xl bg-emerald-50 border border-emerald-200"><p class="text-[11px] text-emerald-900">Comisión Conciliada</p><p class="text-lg font-bold text-emerald-700">$${Math.round(comisionDevengada).toLocaleString('es-MX')}</p></div>
            <div class="p-3 rounded-xl bg-indigo-50 border border-indigo-200"><p class="text-[11px] text-indigo-900">Bono de Productividad</p><p class="text-lg font-bold text-indigo-700">$${bonoMeta.toLocaleString('es-MX')}</p></div>
        </div>
        <div class="overflow-x-auto max-h-[45vh] border border-slate-200 rounded-xl">
            <table class="w-full text-left">
                <thead class="bg-slate-50 text-[11px] uppercase text-slate-500"><tr><th class="p-2">Cliente</th><th class="p-2">Ramo (% Com.)</th><th class="p-2">Prima Total</th><th class="p-2">Comisión</th><th class="p-2">Estatus Recibo</th></tr></thead>
                <tbody>${filas || '<tr><td colspan="5" class="p-6 text-center text-xs text-slate-400">Sin pólizas registradas</td></tr>'}</tbody>
            </table>
        </div>
    </div>`);
}
function openCobranzaPeriodo(){
    const puedeVerTodos=['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
    let lista=puedeVerTodos?[...(db.clientes||[])]:[...(db.clientes||[])].filter(c=>String(c.agenteId)===String(currentUser.id));
    lista=lista.filter(c=>cbzNivel(c)!==null);
    const orden={rojo:0,amarillo:1,verde:2};
    lista.sort((a,b)=>(orden[cbzNivel(a)]-orden[cbzNivel(b)])||((cbzDiasPara(a)||0)-(cbzDiasPara(b)||0)));
    const fila=c=>{
        const nivel=cbzNivel(c), dias=cbzDiasPara(c), venc=cbzProximoVencimiento(c);
        const est=nivel==='rojo'?'<span class="text-red-600 font-bold text-xs">Vencido '+Math.abs(dias)+'d</span>':nivel==='amarillo'?'<span class="text-amber-600 font-bold text-xs">Vence en '+dias+'d</span>':'<span class="text-slate-400 text-xs">Vence en '+dias+'d</span>';
        return `<div class="flex items-center gap-2 border border-slate-200 rounded-xl p-2.5 ${nivel==='rojo'?'bg-red-50/60':nivel==='amarillo'?'bg-amber-50/50':''}">
      ${cbzBadge(c)}
      <div class="flex-1 min-w-0"><p class="text-sm font-semibold text-slate-800 truncate">${escapeHTML(c.nombre)}</p><p class="text-[11px] text-slate-500 truncate">Póliza ${escapeHTML(c.poliza||'—')} · ${escapeHTML(c.periodo||'—')} · $${cbzMontoCuota(c).toLocaleString('es-MX',{minimumFractionDigits:2})} por periodo · ${est} · vence ${venc?venc.toLocaleDateString('es-MX'):'—'}</p></div>
      ${c.whatsapp?`<button data-bx-click="a607" data-p0="${bxE(function(){return c.id})}" class="px-2.5 py-1.5 bg-[#25D366] text-white rounded-lg text-xs font-bold" title="Enviar recordatorio"><i class="fab fa-whatsapp"></i></button>`:'<span class="text-[10px] text-slate-400 px-1">sin WhatsApp</span>'}
    </div>`;
    };
    const nRojo=lista.filter(c=>cbzNivel(c)==='rojo').length, nAmar=lista.filter(c=>cbzNivel(c)==='amarillo').length;
    showModal(`<div class="p-6 max-w-xl w-full max-h-[90vh] overflow-y-auto">
    <div class="flex items-center justify-between mb-3"><h3 class="text-lg font-bold flex items-center gap-2"><i class="fas fa-bell text-amber-500"></i> Cobranza del periodo</h3><button aria-label="Cerrar" data-bx-click="a1" class="w-8 h-8 rounded-lg hover:bg-slate-100"><i class="fas fa-times text-slate-500"></i></button></div>
    <div class="grid grid-cols-3 gap-2 mb-3 text-center text-xs">
        <div class="bg-red-50 border border-red-200 rounded-xl p-2"><div class="text-xl font-black text-red-600">${nRojo}</div>vencidos</div>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-2"><div class="text-xl font-black text-amber-600">${nAmar}</div>por vencer (7 días)</div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-2"><div class="text-xl font-black text-emerald-600">${lista.length-nRojo-nAmar}</div>al corriente</div>
    </div>
    <div class="space-y-2 max-h-[45vh] overflow-y-auto">${lista.map(fila).join('')||'<p class="text-center text-slate-400 py-6">Sin clientes con ciclo de cobranza registrado.</p>'}</div>
    <p class="text-[11px] text-slate-400 mt-3">Ordenado por urgencia: vencidos primero. Cada botón WhatsApp abre el chat con el recordatorio ya redactado (nombre, póliza, monto y fecha). Si tu navegador bloquea la ventana, permite los pop-ups del portal.</p>
  </div>`);
}

/* La evidencia se guardaba como base64 dentro del JSON del cliente. Al
 * migrarla al Storage, algunos registros quedaron con la URL sin la extensión
 * final («…-1.») aunque el objeto sí se guardó como «…-1.pdf»: el proxy
 * responde 400 y el visor no tenía nada que pintar. Las subidas nuevas ya van
 * directas al Storage con su extensión; estas dos funciones curan lo viejo. */
function archivoADataUrl(file){
    return new Promise(res=>{
        if(!file) return res('');
        const r = new FileReader();
        r.onload = ()=>res(String(r.result||''));
        r.onerror = ()=>res('');
        r.readAsDataURL(file);
    });
}

async function prepararEvidenciaCliente(file){
    if(!file) return {url:'', nombre:''};
    const nombre = file.name || 'evidencia';
    try{
        if(window.Media && typeof window.Media.subir === 'function'){
            const item = await window.Media.subir(file, {scope:'clientes', title:nombre});
            if(item && item.url) return {url:item.url, nombre:nombre};
        }
    }catch(e){ /* sin sesión/backend: se conserva base64 como respaldo */ }
    return {url: await archivoADataUrl(file), nombre:nombre};
}

function urlEvidenciaConExtension(url, ext){
    const s = String(url||'');
    const corte = s.search(/[?#]/);
    const base = corte === -1 ? s : s.slice(0, corte);
    const cola = corte === -1 ? '' : s.slice(corte);
    if(base.toLowerCase().endsWith(ext)) return s;
    return base + (base.endsWith('.') ? ext.slice(1) : ext) + cola;
}

async function resolverUrlEvidencia(c){
    const guardada = String((c && c.evidencia) || '');
    if(!guardada || /^data:/i.test(guardada)) return guardada;
    const nombre = String((c && c.evidenciaNombre) || '');
    const m = nombre.match(/\.(pdf|jpe?g|png|webp|gif|bmp|avif)$/i);
    if(!m) return guardada;
    const ext = m[0].toLowerCase();
    if(!/^(?:https?:|\/)/i.test(guardada)) return guardada;
    const base = guardada.split(/[?#]/)[0].toLowerCase();
    if(base.endsWith(ext)) return guardada;
    const candidatos = [guardada, urlEvidenciaConExtension(guardada, ext)];
    if(candidatos[1] === guardada) return guardada;
    for(const url of candidatos){
        try{
            const r = await fetch(url, {method:'HEAD', credentials:'same-origin'});
            if(r.ok){
                if(url !== guardada){
                    c.evidencia = url;
                    try{ if(typeof saveDB === 'function') saveDB(); }catch(e){ /* la vista sigue funcionando */ }
                }
                return url;
            }
        }catch(e){ /* se prueba el siguiente candidato */ }
    }
    return guardada;
}

async function verEvidenciaCliente(id){
    const c = (db.clientes||[]).find(x=>String(x.id)===String(id));
    if(!c) return;
    if(!c.evidencia){ if(window.showToast) showToast('Este cliente no tiene evidencia cargada','warning'); return; }
    const nombre = c.evidenciaNombre || 'evidencia';
    const src = await resolverUrlEvidencia(c);
    /* El PDF NO va en un <iframe>: el visor nativo bloquea el hilo de la página
     * (y en algunos equipos no pinta nada). Se renderiza con PDF.js, que ya
     * usa la biblioteca del portal, en un canvas. */
    const esPdf = /\.pdf(?:$|[?#])/i.test(nombre) || /\.pdf(?:$|[?#])/i.test(src) || /^data:application\/pdf/i.test(src);
    showModal(`<div class="modal-large p-4 w-full max-w-4xl">
        <div class="flex justify-between items-center gap-3 mb-3">
            <div class="min-w-0"><h3 class="font-bold truncate">Evidencia · ${escapeHTML(c.nombre||'Cliente')}</h3><p class="text-[11px] text-slate-500 truncate">${escapeHTML(nombre)}</p></div>
            <button aria-label="Cerrar" data-bx-click="a1" class="text-slate-500 hover:text-slate-700 shrink-0"><i class="fas fa-times"></i></button>
        </div>
        <div id="evidencia-preview" class="rounded-xl border border-slate-200 bg-slate-100 min-h-[220px] max-h-[70vh] overflow-auto flex items-start justify-center">
            <div class="text-center text-slate-500 py-16"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="text-xs mt-2">Preparando vista previa…</p></div>
        </div>
        <div class="flex justify-end items-center gap-2 mt-3">
            <a href="${escapeHTML(src)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 border border-slate-300 text-slate-700 rounded text-sm hover:bg-slate-50"><i class="fas fa-up-right-from-square mr-1"></i>Abrir</a>
            <a href="${escapeHTML(src)}" download="${escapeHTML(nombre)}" class="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"><i class="fas fa-download mr-1"></i>Descargar</a>
        </div>
    </div>`);
    const cont = document.getElementById('evidencia-preview');
    if(!cont) return;
    if(esPdf){ renderEvidenciaPdf(src, cont, nombre); return; }
    const esImagen = /^data:image\//i.test(src) || /\.(png|jpe?g|gif|webp|bmp|avif)(?:$|[?#])/i.test(src);
    if(esImagen){
        cont.innerHTML = `<img src="${escapeHTML(src)}" alt="Evidencia de ${escapeHTML(c.nombre||'cliente')}" class="max-w-full max-h-[70vh] object-contain bg-white">`;
        return;
    }
    cont.innerHTML = evidenciaFallbackHtml(src, nombre);
}

function evidenciaFallbackHtml(src, nombre){
    return `<div class="w-full text-center text-slate-600 p-8"><i class="fas fa-file-lines text-4xl text-slate-400"></i><p class="text-sm font-semibold mt-3">Vista previa no disponible</p><p class="text-xs text-slate-500 mt-1 truncate max-w-md mx-auto">${escapeHTML(nombre||'Documento')}</p><a href="${escapeHTML(src)}" target="_blank" rel="noopener noreferrer" class="inline-block mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Abrir documento</a></div>`;
}

function evidenciaDataUrlBuffer(dataUrl){
    const base64 = String(dataUrl).split(',')[1] || '';
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

async function renderEvidenciaPdf(src, cont, nombre){
    try{
        if(!window.pdfjsLib) throw new Error('lector de PDF no disponible');
        let buf;
        if(/^data:/i.test(src)){
            buf = evidenciaDataUrlBuffer(src);
        } else {
            const resp = await fetch(src, { credentials: 'same-origin' });
            if(!resp.ok) throw new Error('HTTP ' + resp.status);
            buf = await resp.arrayBuffer();
        }
        const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
        if(!document.body.contains(cont)) return;
        const maxPaginas = Math.min(pdf.numPages, 4);
        cont.innerHTML = '<div class="w-full p-3 space-y-3"></div>';
        const paginas = cont.firstElementChild;
        for(let n=1; n<=maxPaginas; n++){
            const page = await pdf.getPage(n);
            const vp = page.getViewport({ scale: 1.35 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(vp.width));
            canvas.height = Math.max(1, Math.floor(vp.height));
            canvas.className = 'mx-auto max-w-full h-auto bg-white rounded-lg shadow-sm';
            await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
            if(!document.body.contains(cont)) return;
            paginas.appendChild(canvas);
        }
        if(pdf.numPages > maxPaginas){
            const aviso = document.createElement('p');
            aviso.className = 'text-center text-[11px] text-slate-500 py-1';
            aviso.textContent = 'Vista previa de ' + maxPaginas + ' de ' + pdf.numPages + ' páginas. Abre o descarga el documento para verlo completo.';
            paginas.appendChild(aviso);
        }
    }catch(e){
        if(!document.body.contains(cont)) return;
        cont.innerHTML = evidenciaFallbackHtml(src, nombre);
    }
}

function borrarCliente(id){
    try{
        const c = (db.clientes||[]).find(x=>x.id===id);
        if(!c) return;
        const puedeVerTodos = ['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
        const puede = puedeVerTodos || String(c.agenteId)===String(currentUser.id);
        if(!puede){ uiToast('Sin permisos'); return; }
        if(!confirm('¿Borrar este cliente?')) return;
        db.clientes = db.clientes.filter(x=>x.id!==id);
        db.auditoria = db.auditoria||[];
        db.auditoria.push({id:Date.now(),tipo:'borrado_cliente',clienteId:id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:c,despues:null});
        saveDB();
        closeModal();
        render();
        if(window.showToast) showToast('Cliente borrado','success');
    }catch(e){ uiToast('Error: '+e.message); }
}

function editarCliente(id){
    const c = (db.clientes||[]).find(x=>x.id===id);
    if(!c) return;
    const puedeVerTodos = ['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
    const puede = puedeVerTodos || String(c.agenteId)===String(currentUser.id);
    if(!puede){ uiToast('Sin permisos'); return; }
    const antes = JSON.parse(JSON.stringify(c));
    const companias = [...companiasClientes()]; if(!companias.includes('OTROS')) companias.push('OTROS');
    showModal(`<form id="editCliente" class="p-6 space-y-3 max-w-2xl max-h-[90vh] overflow-y-auto"><h3 class="font-bold text-lg">Modificar Cliente</h3>
        <div class="grid md:grid-cols-2 gap-3">
            <div><label class="text-sm">Nombre</label><input name="nombre" value="${escapeHTML(c.nombre)}" required class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Compañía</label><select name="compania" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">${companias.map(co=>`<option ${c.compania===co?'selected':''}>${co}</option>`).join('')}</select></div>
            <div><label class="text-sm">Póliza</label><input name="poliza" value="${escapeHTML(c.poliza)}" required class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Ramo</label><select name="ramo" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">${['VIDA','GMM','DAÑOS','AUTOS','INVERSIÓN','INVERSIÓN ELITE'].map(r=>`<option ${(c.ramo||'')===r?'selected':''}>${r}</option>`).join('')}</select></div>
            <div><label class="text-sm">Producto</label><input name="producto" value="${escapeHTML(c.producto||'')}" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Prima Neta</label><input name="primaNeta" type="number" step="0.01" value="${c.primaNeta||0}" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Prima Total</label><input name="primaTotal" type="number" step="0.01" value="${c.primaTotal||0}" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Plazo de contratación (años)</label><input name="plazoContratacion" id="edit-plazo" type="number" min="1" max="30" step="1" value="${c.plazoContratacion||''}" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Aportación Total (prima total × plazo)</label><input name="aportacionTotal" id="edit-aportacion" type="number" step="0.01" value="${c.aportacionTotal||0}" readonly class="w-full border px-3 py-2 rounded bg-slate-50 text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Periodo</label><select name="periodo" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">${['Mensual','Trimestral','Semestral','Anual','Único'].map(p=>`<option ${c.periodo===p?'selected':''}>${p}</option>`).join('')}</select></div>
            <div><label class="text-sm">Estatus</label><select name="estatus" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300">${ESTATUS_CLIENTE.map(e=>`<option ${estatusCliente(c)===e?'selected':''}>${e}</option>`).join('')}</select></div>
            <div><label class="text-sm">Fecha de emisión</label><input name="emision" type="date" value="${c.fechaEmision?new Date(c.fechaEmision).toISOString().slice(0,10):''}" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">WhatsApp (cobranza)</label><input name="whatsapp" type="tel" value="${escapeHTML(c.whatsapp||'')}" placeholder="52 664 123 4567" class="w-full border px-3 py-2 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Nueva foto (opcional)</label><input type="file" id="edit-foto" accept="image/*" class="w-full text-sm border p-1 rounded bg-white text-slate-900 border-slate-300"></div>
            <div><label class="text-sm">Nueva evidencia (opcional)</label><input type="file" id="edit-evidencia" accept=".pdf,.jpg,.png" class="w-full text-sm border p-1 rounded bg-white text-slate-900 border-slate-300"></div>
        </div>
        <div class="flex gap-2 pt-2"><button type="button" data-bx-click="a1" class="flex-1 border py-2 rounded">Cancelar</button><button class="flex-1 bg-indigo-600 text-white py-2 rounded">Guardar</button></div>
    </form>`);
    document.getElementById('editCliente').querySelector('[name=primaTotal]').addEventListener('input', function(){
        const pt = parseFloat(this.value)||0;
        const pl = parseInt((document.getElementById('edit-plazo')||{}).value)||0;
        const out = document.getElementById('edit-aportacion');
        if(out) out.value = (pt>0 && pl>0) ? (pt*pl) : '';
    });
    document.getElementById('edit-plazo').addEventListener('input', function(){
        const pt = parseFloat((document.getElementById('editCliente').querySelector('[name=primaTotal]')||{}).value)||0;
        const pl = parseInt(this.value)||0;
        const out = document.getElementById('edit-aportacion');
        if(out) out.value = (pt>0 && pl>0) ? (pt*pl) : '';
    });
    document.getElementById('editCliente').onsubmit = async function(e){
        e.preventDefault();
        const f = new FormData(e.target);
        c.nombre = f.get('nombre').trim();
        c.compania = f.get('compania');
        c.poliza = f.get('poliza').trim();
        c.ramo = f.get('ramo').trim();
        c.producto = f.get('producto').trim();
        c.primaNeta = parseFloat(f.get('primaNeta'))||0;
        c.primaTotal = parseFloat(f.get('primaTotal'))||0;
        c.plazoContratacion = parseInt(f.get('plazoContratacion'))||0;
        c.aportacionTotal = parseFloat(f.get('aportacionTotal'))||0;
        c.periodo = f.get('periodo');
        const estatusSel = String(f.get('estatus')||'');
        if(ESTATUS_CLIENTE.includes(estatusSel)){ c.estatus = estatusSel; c.etapaKanban = estatusSel; }
        c.fechaEmision = f.get('emision') ? new Date(f.get('emision')+'T00:00:00').toISOString() : '';
        c.whatsapp = (f.get('whatsapp')||'').trim();
        const _pt = c.primaTotal, _pl = c.plazoContratacion;
        if(_pt>0 && _pl>0){ c.aportacionTotal = _pt*_pl; }
        const fotoFile = document.getElementById('edit-foto').files[0];
        const evidFile = document.getElementById('edit-evidencia').files[0];
        const readFile = (file)=> new Promise(res=>{ if(!file) return res(null); const r=new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(file); });
        if(fotoFile){ c.fotoCliente = await readFile(fotoFile); }
        if(evidFile){ const ev = await prepararEvidenciaCliente(evidFile); c.evidencia = ev.url; c.evidenciaNombre = ev.nombre; }
        db.auditoria = db.auditoria||[];
        db.auditoria.push({id:Date.now(),tipo:'edicion_cliente',clienteId:id,usuarioId:currentUser.id,usuarioNombre:currentUser.name,fecha:new Date().toISOString(),antes:antes,despues:JSON.parse(JSON.stringify(c))});
        saveDB(); closeModal(); render(); if(window.showToast) showToast('Cliente actualizado','success');
    };
}

function verAuditoriaClientes(){
    const logs=(db.auditoria||[]).filter(l=>l.tipo&&l.tipo.includes('cliente')).slice(-50).reverse();
    let html='<div class="p-6 max-w-4xl"><h3 class="font-bold text-lg mb-3">Auditoría - Mis Clientes</h3><div class="max-h-96 overflow-auto"><table class="w-full text-xs"><thead><tr class="bg-slate-100"><th class="p-2 text-left">Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>';
    logs.forEach(l=>{ html+=`<tr class="border-t"><td class="p-1">${new Date(l.fecha).toLocaleString('es-MX')}</td><td class="p-1">${l.usuarioNombre||''}</td><td class="p-1">${l.tipo}</td><td class="p-1">${l.despues?.nombre||l.antes?.nombre||''} - ${l.despues?.poliza||l.antes?.poliza||''}</td></tr>`; });
    html+='</tbody></table></div><div class="text-right mt-3"><button aria-label="Cerrar" data-bx-click="a1" class="border px-3 py-1 rounded">Cerrar</button></div></div>';
    showModal(html);
}

function exportarClientesCSV(){
    try{
        if(!db.clientes) db.clientes = [];
        const puedeVerTodos = ['agencia','desarrollador','admin','gm'].includes((currentUser.role||'').toLowerCase());
        let clientes = puedeVerTodos ? [...db.clientes] : db.clientes.filter(c=>String(c.agenteId)===String(currentUser.id));
        const fComp = window.filtroClienteCompania || '';
        const fRamo = window.filtroClienteRamo || '';
        const fAgente = window.filtroClienteAgente || '';
        if(fComp) clientes = clientes.filter(c=>c.compania===fComp);
        if(fRamo) clientes = clientes.filter(c=>(c.ramo||'').toLowerCase().includes(fRamo.toLowerCase()));
        if(fAgente && puedeVerTodos) clientes = clientes.filter(c=>String(c.agenteId)===String(fAgente));
        clientes.sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));
        let csv = 'Nombre,Compañia,Poliza,Ramo,Producto,Prima Neta,Prima Total,Plazo (años),Aportación Total,Periodo,Fecha Emisión,Agente,Fecha\n';
        clientes.forEach(c=>{
            csv += `"${(c.nombre||'').replace(/"/g,'')}","${c.compania||''}","${(c.poliza||'').replace(/"/g,'')}","${(c.ramo||'').replace(/"/g,'')}","${(c.producto||'').replace(/"/g,'')}",${c.primaNeta||0},${c.primaTotal||0},${c.plazoContratacion||0},${c.aportacionTotal||0},"${c.periodo||''}","${c.fechaEmision?new Date(c.fechaEmision).toLocaleDateString('es-MX'):''}","${(c.agenteNombre||'').replace(/"/g,'')}","${new Date(c.fecha).toLocaleDateString('es-MX')}"\n`;
        });
        const blob = new Blob([csv],{type:'text/csv;charset=utf-8;'});
        const url = URL.createObjectURL(blob);
        const a=document.createElement('a'); a.href=url; a.download=`mis_clientes_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
        if(window.showToast) showToast('CSV exportado','success');
    }catch(e){ uiToast('Error exportando: '+e.message); }
}





function renderMiAgenda(){
    const calId = currentUser.googleCalendarId || 'primary';
    const agenda = (db.agendas||{})[currentUser.id] || '';
    const ahora = new Date();
    const misClases = (db.liveClasses||[]).filter(c => c.assignedTo.includes(currentUser.id) && new Date(c.end) >= ahora).sort((a,b)=> new Date(a.start)-new Date(b.start));
    const proximasHtml = misClases.length ? misClases.map(c=>{
        const inicio = new Date(c.start);
        const fin = new Date(c.end);
        const instructor = db.users.find(u=>u.id===c.instructorId);
        return `<div class="flex items-center justify-between p-3 border border-slate-200 rounded-xl hover:bg-slate-50">
            <div class="flex items-center gap-3">
                <div class="w-12 h-12 bg-indigo-100 rounded-xl flex flex-col items-center justify-center">
                    <span class="text-[10px] font-bold text-indigo-600 uppercase">${inicio.toLocaleString('es-MX',{month:'short'})}</span>
                    <span class="text-lg font-bold text-indigo-700 leading-none">${inicio.getDate()}</span>
                </div>
                <div>
                    <p class="font-medium text-slate-900">${c.title}</p>
                    <p class="text-xs text-slate-500">${inicio.toLocaleString('es-MX',{hour:'2-digit',minute:'2-digit'})} - ${fin.toLocaleString('es-MX',{hour:'2-digit',minute:'2-digit'})} · ${instructor?.name||'Instructor'}</p>
                </div>
            </div>
            <a href="${c.zoomUrl}" target="_blank" class="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700"><i class="fas fa-video mr-1"></i>Entrar</a>
        </div>`;
    }).join('') : '<p class="text-sm text-slate-500 text-center py-8">No tienes clases programadas</p>';
    
    const otros = db.users.filter(u=>String(u.id)!==String(currentUser.id) && !['prospecto'].includes((u.role||'').toLowerCase()));
    const invUsuarioOpts = '<option value="">Selecciona a la persona…</option>' + otros.map(u=>`<option value="${psEscape(String(u.id))}">${psEscape(u.name||u.username||'')} (${psEscape(u.role||'')})</option>`).join('');
    const invs = invDB();
    const fmt = iso => new Date(iso).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'});
    const invRecibidasHtml = invs.filter(i=>String(i.paraId)===String(currentUser.id)).map(i=>`<div class="border border-slate-200 rounded-lg p-2 text-xs"><p class="font-medium text-slate-800">${psEscape(i.titulo)}</p><p class="text-slate-500">De ${psEscape(i.deNombre)} · ${fmt(i.inicio)}</p><p class="mt-1 font-semibold ${i.estado==='aceptada'?'text-emerald-600':i.estado==='rechazada'?'text-rose-600':'text-amber-600'}">${i.estado}</p>${i.estado==='pendiente'?`<div class="flex gap-1 mt-1"><button data-bx-click="a610" data-p0="${bxE(function(){return i.id})}" class="px-2 py-1 bg-emerald-600 text-white rounded">Aceptar</button><button data-bx-click="a611" data-p0="${bxE(function(){return i.id})}" class="px-2 py-1 bg-slate-200 rounded">Rechazar</button></div>`:''}</div>`).join('') || '<p class="text-xs text-slate-400">Sin invitaciones</p>';
    const invEnviadasHtml = invs.filter(i=>String(i.deId)===String(currentUser.id)).map(i=>`<div class="border border-slate-200 rounded-lg p-2 text-xs"><p class="font-medium text-slate-800">${psEscape(i.titulo)}</p><p class="text-slate-500">Para ${psEscape(i.paraNombre)} · ${fmt(i.inicio)}</p><p class="mt-1 font-semibold ${i.estado==='aceptada'?'text-emerald-600':i.estado==='rechazada'?'text-rose-600':'text-amber-600'}">${i.estado}</p></div>`).join('') || '<p class="text-xs text-slate-400">Sin invitaciones</p>';
    return `
    <div class="max-w-5xl mx-auto space-y-6">
        <div class="flex items-center justify-between">
            <h2 class="text-2xl font-bold">Mi Agenda</h2>
            <span class="text-sm text-slate-500">Clases + Google Calendar</span>
        </div>
        
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 class="font-semibold mb-4 flex items-center gap-2"><i class="fas fa-video text-indigo-600"></i> Próximas Clases En Vivo (${misClases.length})</h3>
            <div class="space-y-2 max-h-64 overflow-y-auto">
                ${proximasHtml}
            </div>
            <p class="text-xs text-slate-500 mt-3">Estas clases se agregan automáticamente cuando te asignan una sesión.</p>
        </div>
        
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 class="font-semibold mb-1 flex items-center gap-2"><i class="fas fa-user-plus text-indigo-600"></i> Invitaciones a sesiones</h3>
            <p class="text-xs text-slate-500 mb-4">Invita a otra persona a una sesión. Revisamos su disponibilidad antes de enviar para evitar empalmes.</p>
            <div class="grid md:grid-cols-4 gap-2">
                <select id="inv-usuario" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">${invUsuarioOpts}</select>
                <input id="inv-fecha" type="date" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                <input id="inv-hora" type="time" value="10:00" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                <select id="inv-duracion" class="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900"><option value="30">30 min</option><option value="60" selected>1 hora</option><option value="120">2 horas</option></select>
            </div>
            <input id="inv-titulo" placeholder="Motivo, p. ej. Acompañamiento a cita con cliente" class="w-full mt-2 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
            <div class="flex flex-wrap items-center gap-2 mt-3">
                <button data-bx-click="a612" class="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800">Revisar disponibilidad</button>
                <button data-bx-click="a613" class="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Enviar invitación</button>
                <span id="inv-disp" class="text-xs"></span>
            </div>
            <div class="grid md:grid-cols-2 gap-4 mt-5">
                <div><p class="text-xs font-semibold text-slate-600 mb-2">Recibidas</p><div class="space-y-2">${invRecibidasHtml}</div></div>
                <div><p class="text-xs font-semibold text-slate-600 mb-2">Enviadas</p><div class="space-y-2">${invEnviadasHtml}</div></div>
            </div>
        </div>

        <div class="bg-white rounded-2xl border border-slate-200 p-4">
            <h3 class="font-semibold mb-3">Google Calendar</h3>
            <div id="cal-embed-zone" class="text-center py-6">
                <button data-bx-click="a614" class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"><i class="fab fa-google mr-2"></i>Cargar mi Google Calendar</button>
            </div>
            <div class="mt-3 pt-3 border-t border-slate-100">
                <label class="text-xs font-medium text-slate-600">Tu Calendar ID (opcional)</label>
                <div class="flex gap-2 mt-1">
                    <input id="cal-id-input" value="${psEscape(currentUser.googleCalendarId||'')}" placeholder="ej. abc123@group.calendar.google.com" class="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white text-slate-900">
                    <button data-bx-click="a615" class="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800">Guardar</button>
                </div>
                <p class="text-xs text-slate-500 mt-1">Cópialo desde Google Calendar → Configuración → «Integrar calendario» → ID del calendario. Déjalo vacío para usar tu calendario principal.</p>
            </div>
        </div>
        
        <div class="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 class="font-semibold mb-3">Anotaciones personales</h3>
            <textarea id="notas-agenda" class="w-full h-32 border border-slate-300 rounded-xl p-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white text-slate-900" placeholder="Escribe tus notas, recordatorios, pendientes...">${agenda.replace(/</g,'&lt;')}</textarea>
            <div class="flex justify-end mt-3">
                <button data-bx-click="a616" class="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">Guardar notas</button>
            </div>
        </div>
    </div>`;
}
function invDB(){ if(!Array.isArray(db.invitaciones)) db.invitaciones=[]; return db.invitaciones; }
/* Eventos de un usuario en un rango: clases asignadas y sesiones ya aceptadas/pendientes que se empalman. */
function invOcupacion(userId, ini, fin, ignorarId){
    const choques = [];
    (db.liveClasses||[]).forEach(c=>{ if((c.assignedTo||[]).map(String).includes(String(userId)) && new Date(c.start)<fin && new Date(c.end)>ini) choques.push('clase: '+c.title); });
    invDB().forEach(i=>{ if(i.id!==ignorarId && ['pendiente','aceptada'].includes(i.estado) && [String(i.paraId),String(i.deId)].includes(String(userId)) && new Date(i.inicio)<fin && new Date(i.fin)>ini) choques.push('invitación: '+i.titulo); });
    return choques;
}
function invLeerForm(){
    const uid=(document.getElementById('inv-usuario')||{}).value||'';
    const fecha=(document.getElementById('inv-fecha')||{}).value||'';
    const hora=(document.getElementById('inv-hora')||{}).value||'';
    const dur=Number((document.getElementById('inv-duracion')||{}).value||60);
    const titulo=((document.getElementById('inv-titulo')||{}).value||'').trim();
    if(!uid||!fecha||!hora){ showToast('Elige persona, fecha y hora','warning'); return null; }
    const ini=new Date(fecha+'T'+hora); const fin=new Date(ini.getTime()+dur*60000);
    const para=db.users.find(u=>String(u.id)===uid);
    return { uid, para, ini, fin, dur, titulo: titulo || 'Sesión en agenda' };
}
function invRevisarDisponibilidad(){
    const f=invLeerForm(); if(!f) return;
    const ch=invOcupacion(f.uid, f.ini, f.fin);
    const el=document.getElementById('inv-disp'); if(!el) return;
    el.innerHTML = ch.length ? '<span class="text-rose-600">'+psEscape(f.para.name)+' está ocupado: '+psEscape(ch.join('; '))+'</span>' : '<span class="text-emerald-600">'+psEscape(f.para.name)+' está disponible en ese horario</span>';
}
function invEnviar(){
    const f=invLeerForm(); if(!f) return;
    const ch=invOcupacion(f.uid, f.ini, f.fin);
    if(ch.length){ showToast('Empalme: '+ch.join('; '),'error'); invRevisarDisponibilidad(); return; }
    const inv={ id:'inv-'+Date.now(), deId:currentUser.id, deNombre:currentUser.name, paraId:f.uid, paraNombre:f.para.name, titulo:f.titulo, inicio:f.ini.toISOString(), fin:f.fin.toISOString(), estado:'pendiente', ts:new Date().toISOString() };
    invDB().unshift(inv);
    if(!Array.isArray(db.notifications)) db.notifications=[];
    db.notifications.unshift({ id:'inv-n-'+inv.id, type:'invitacion', userId:f.uid, msg:'Invitación de '+currentUser.name+': '+inv.titulo+' ('+f.ini.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})+')', ts:inv.ts, readBy:[] });
    if(db.notifications.length>300) db.notifications.length=300;
    saveDB(); showToast('Invitación enviada a '+f.para.name,'success');
    if(window.render) render();
}
function invResponder(id, estado){
    const inv=invDB().find(i=>i.id===id); if(!inv || String(inv.paraId)!==String(currentUser.id)) return;
    if(estado==='aceptada'){ const ch=invOcupacion(currentUser.id, new Date(inv.inicio), new Date(inv.fin), inv.id); if(ch.length){ showToast('Tienes un empalme: '+ch.join('; '),'error'); return; } }
    inv.estado=estado;
    if(!Array.isArray(db.notifications)) db.notifications=[];
    db.notifications.unshift({ id:'inv-r-'+inv.id+'-'+Date.now(), type:'invitacion', userId:inv.deId, msg:currentUser.name+' '+(estado==='aceptada'?'aceptó':'rechazó')+' la invitación: '+inv.titulo, ts:new Date().toISOString(), readBy:[] });
    saveDB(); showToast('Invitación '+estado,'success');
    if(window.render) render();
}
function cargarCalAgenda(){
    const calId = (currentUser && currentUser.googleCalendarId) || 'primary';
    const zone = document.getElementById('cal-embed-zone');
    if (zone) zone.innerHTML = '<iframe title="Google Calendar" src="https://calendar.google.com/calendar/embed?src=' + encodeURIComponent(calId) + '&ctz=America/Mazatlan" style="border:0" width="100%" height="400" frameborder="0" scrolling="no"></iframe>';
}
function guardarCalId(){
    const val=document.getElementById('cal-id-input').value.trim();
    currentUser.googleCalendarId=val;
    const u=db.users.find(x=>String(x.id)===String(currentUser.id));
    if(u) u.googleCalendarId=val;
    sessionStorage.setItem('pepes_user', JSON.stringify(currentUser));
    saveDB();
    if(window.showToast) showToast(val?'Calendar ID guardado':'Se usará tu calendario principal','success');
    cargarCalAgenda();
}
function guardarAgenda(){
    db.agendas = db.agendas||{};
    db.agendas[currentUser.id] = document.getElementById('notas-agenda').value;
    saveDB();
    if(window.showToast) showToast('Agenda guardada','success');
}

