
// === TEO V4 INTEGRADO ===
(function(){
  if(window.teoV4Initialized) return;
  window.teoV4Initialized = true;
  
  const teoStyle = document.createElement('style');
  teoStyle.id = 'teo-v4-style';
  teoStyle.textContent = `
  #teo-wrapper { font-family: 'Outfit', system-ui, -apple-system, Segoe UI, Roboto; background:#070a0f; color:#e4e4e7; min-height:calc(100vh - 120px); color-scheme: dark; }
  #teo-wrapper .glass { backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  #teo-wrapper .scrollbar::-webkit-scrollbar { width:6px;height:6px }
  #teo-wrapper .scrollbar::-webkit-scrollbar-thumb { background:#27272a;border-radius:3px }
  `;
  document.head.appendChild(teoStyle);

  function initTeoWhenReady(){
    if(!document.getElementById('teo-wrapper')) return setTimeout(initTeoWhenReady, 100);
    
    // Execute original Teo code in isolated scope
    
const $ = id => document.getElementById(id);
const defaultAvatar = `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop stop-color='#7c3aed'/><stop offset='1' stop-color='#2563eb'/></linearGradient></defs><rect width='200' height='200' fill='#0b0e14'/><circle cx='100' cy='100' r='92' fill='url(#g)'/><text x='100' y='138' font-family='Outfit,Arial' font-size='96' font-weight='700' fill='white' text-anchor='middle'>T</text></svg>`)}`;

let messages = [];
let currentAudio = null;
let isSpeaking = false;
let recognition = null;
let listening = false;

function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(()=> t.style.opacity='0', 2200);
}

function updateProfileDisplay(){
  const nombre = localStorage.getItem('teo_nombre') || 'Teo Gutiérrez';
  const edad = localStorage.getItem('teo_edad') || '42';
  const profesion = localStorage.getItem('teo_profesion') || 'Ferretero';
  const ciudad = localStorage.getItem('teo_ciudad') || 'San Pedro Garza García';
  const firstName = nombre.split(' ')[0];
  
  if($('displayName')) $('displayName').textContent = nombre;
  if($('displayTag')) $('displayTag').textContent = `${edad} • ${profesion}`;
  if($('displaySubtitle')) $('displaySubtitle').textContent = `Cliente IA avanzado • ${ciudad}`;
  if($('mobileSubtitle')) $('mobileSubtitle').textContent = `${profesion} • ${ciudad}`;
  if($('sidebarTitle')) $('sidebarTitle').textContent = `${firstName} v4`;
}


function updateGroqStatus(){
  const key = localStorage.getItem('groq_api_key');
  const el = $('groqStatus');
  if(!el) return;
  if(key && key.startsWith('gsk_')){
    el.textContent = 'Conectado';
    el.className = 'text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
  }else{
    el.textContent = 'Requerido';
    el.className = 'text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20';
  }
}

function loadConfig(){
  $('groqKey').value = localStorage.getItem('groq_api_key') || '';
  $('nivel').value = localStorage.getItem('teo_nivel') || 'NORMAL';
  $('producto').value = localStorage.getItem('teo_producto') || 'PPR';
  $('escenario').value = localStorage.getItem('teo_escenario') || 'Primera cita';
  $('memoria').value = localStorage.getItem('teo_memoria') || 'Ferretería en San Pedro Garza García, 42 años, casado, 2 hijos (8 y 12), ingresos variables 70-90k al mes, ya tiene seguro de auto con Qualitas, está comparando PPR y GMM.';
  $('voiceEngine').value = localStorage.getItem('teo_voice_engine') || 'browser';
  $('elevenKey').value = localStorage.getItem('elevenlabs_api_key') || '';
  $('elevenVoice').value = localStorage.getItem('elevenlabs_voice_id') || 'pNInz6obpgDQGcFmaJgB';
  $('elevenProxy').value = localStorage.getItem('elevenlabs_proxy') || '';
  if($('elevenVoiceSelect')) $('elevenVoiceSelect').value = localStorage.getItem('elevenlabs_voice_id') || 'pNInz6obpgDQGcFmaJgB';
  if($('reminderToggle')) $('reminderToggle').checked = localStorage.getItem('teo_reminder') === '1';
  toggleEleven();
  updateGroqStatus();
  // No pre-cargar keys por seguridad - el usuario las pone

  const avatar = localStorage.getItem('teo_avatar') || defaultAvatar;
  document.querySelectorAll('.teo-avatar').forEach(img=> img.src = avatar);
  $('avatarPreview').src = avatar;
  
  $('teoNombre').value = localStorage.getItem('teo_nombre') || 'Teo Gutiérrez';
  $('teoEdad').value = localStorage.getItem('teo_edad') || '42';
  $('teoProfesion').value = localStorage.getItem('teo_profesion') || 'Ferretero';
  $('teoCiudad').value = localStorage.getItem('teo_ciudad') || 'San Pedro Garza García';
  updateProfileDisplay();
}

function saveConfig(){
  localStorage.setItem('groq_api_key', $('groqKey').value.trim());
  localStorage.setItem('teo_nivel', $('nivel').value);
  localStorage.setItem('teo_producto', $('producto').value);
  localStorage.setItem('teo_escenario', $('escenario').value);
  localStorage.setItem('teo_memoria', $('memoria').value.trim());
  localStorage.setItem('teo_voice_engine', $('voiceEngine').value);
  localStorage.setItem('elevenlabs_api_key', $('elevenKey').value.trim());
  localStorage.setItem('elevenlabs_voice_id', $('elevenVoice').value.trim());
  localStorage.setItem('elevenlabs_proxy', $('elevenProxy').value.trim());
  localStorage.setItem('teo_nombre', $('teoNombre').value.trim() || 'Teo Gutiérrez');
  localStorage.setItem('teo_edad', $('teoEdad').value.trim() || '42');
  localStorage.setItem('teo_profesion', $('teoProfesion').value.trim() || 'Ferretero');
  localStorage.setItem('teo_ciudad', $('teoCiudad').value.trim() || 'San Pedro Garza García');
  updateProfileDisplay();
  updateGroqStatus();
  toast('Configuración guardada');
}

$('btnTestGroq')?.addEventListener('click', async ()=>{
  const key = $('groqKey').value.trim() || localStorage.getItem('groq_api_key');
  if(!key){ toast('Ingresa tu API key'); return; }
  $('btnTestGroq').disabled = true;
  $('btnTestGroq').textContent = 'Probando...';
  try{
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
      body: JSON.stringify({model:'llama-3.3-70b-versatile', max_tokens:5, messages:[{role:'user',content:'hola'}]})
    });
    if(resp.ok){ toast('Groq OK'); updateGroqStatus(); } else { const t=await resp.text(); toast('Error: '+t.slice(0,60)); }
  }catch(e){ toast('Error de red'); }
  $('btnTestGroq').disabled = false;
  $('btnTestGroq').textContent = 'Probar Groq';
});


function toggleEleven(){
  $('elevenBox').classList.toggle('hidden', $('voiceEngine').value !== 'elevenlabs');
}
$('voiceEngine').addEventListener('change', ()=>{ toggleEleven(); saveConfig(); });


// Perfiles predefinidos
const perfiles = {
  teo: {nombre:'Teo Gutiérrez', edad:'42', profesion:'Ferretero', ciudad:'San Pedro Garza García', memoria:'Ferretería en San Pedro Garza García, 42 años, casado, 2 hijos (8 y 12), ingresos variables 70-90k al mes, ya tiene seguro de auto con Qualitas, está comparando PPR y GMM.'},
  marisela: {nombre:'Marisela López', edad:'38', profesion:'Ama de casa', ciudad:'Culiacán', memoria:'Ama de casa, 38 años, 3 hijos, esposo trabaja en construcción, presupuesto ajustado, le preocupa educación de hijos, desconfía de seguros por mala experiencia familiar.'},
  carlos: {nombre:'Ing. Carlos Méndez', edad:'51', profesion:'Empresario', ciudad:'Mazatlán', memoria:'Dueño de 3 restaurantes, 51 años, ingresos 200k+, ya tiene PPR pero quiere diversificar, muy ocupado, directo, pide números y ROI, compara con inversiones.'},
  valeria: {nombre:'Valeria Ríos', edad:'27', profesion:'Diseñadora', ciudad:'San Pedro Garza García', memoria:'Soltera, 27 años, freelance, ingresos variables 25-40k, vive con roomies, quiere empezar a ahorrar pero le da miedo comprometerse, prefiere pagos flexibles.'},
  ramon: {nombre:'Don Ramón Vega', edad:'65', profesion:'Jubilado', ciudad:'Guasave', memoria:'Jubilado IMSS, 65 años, pensión 12k, casa propia, hijos fuera, muy desconfiado, dice "a mi edad ya pa qué", pero le preocupa dejar deudas.'}
};

$('perfilCliente')?.addEventListener('change', e=>{
  const p = perfiles[e.target.value];
  if(!p) return;
  $('teoNombre').value = p.nombre;
  $('teoEdad').value = p.edad;
  $('teoProfesion').value = p.profesion;
  $('teoCiudad').value = p.ciudad;
  $('memoria').value = p.memoria;
  saveConfig();
  updateProfileDisplay();
  toast('Perfil cargado: '+p.nombre);
});

// Sincronizar selector con input
$('elevenVoiceSelect')?.addEventListener('change', e=>{
  $('elevenVoice').value = e.target.value;
  saveConfig();
});
$('elevenVoice')?.addEventListener('input', e=>{
  const sel = $('elevenVoiceSelect');
  if(sel && [...sel.options].some(o=>o.value===e.target.value)) sel.value = e.target.value;
});

async function cargarVocesEleven(){
  const key = $('elevenKey').value.trim();
  if(!key){ toast('Pon tu API key primero'); return; }
  $('btnLoadVoices').disabled = true;
  $('btnLoadVoices').textContent = 'Cargando...';
  try{
    const resp = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {'xi-api-key': key}
    });
    if(!resp.ok) throw new Error('Error '+resp.status);
    const data = await resp.json();
    const sel = $('elevenVoiceSelect');
    sel.innerHTML = '';
    // Filtrar voces masculinas y multilingües
    const voces = data.voices.filter(v => 
      v.labels?.gender === 'male' || 
      ['Adam','Antoni','Arnold','Josh','Daniel','Bryan'].some(n=> v.name.includes(n))
    ).slice(0,15);
    
    voces.forEach(v=>{
      const opt = document.createElement('option');
      opt.value = v.voice_id;
      opt.textContent = `${v.name} - ${v.labels?.accent || 'neutro'}`;
      sel.appendChild(opt);
    });
    // Mantener selección actual
    sel.value = localStorage.getItem('elevenlabs_voice_id') || 'pNInz6obpgDQGcFmaJgB';
    toast('Voces cargadas: '+voces.length);
  }catch(e){
    toast('No se pudo cargar: '+e.message);
    console.error(e);
  }
  $('btnLoadVoices').disabled = false;
  $('btnLoadVoices').textContent = 'Cargar voces';
}
$('btnLoadVoices')?.addEventListener('click', cargarVocesEleven);

$('avatarWrap').onclick = () => $('avatarInput').click();
$('avatarInput').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => {
    localStorage.setItem('teo_avatar', ev.target.result);
    $('avatarPreview').src = ev.target.result;
    document.querySelectorAll('.teo-avatar').forEach(img=> img.src = ev.target.result);
    toast('Avatar actualizado');
  };
  r.readAsDataURL(f);
};

// Number to words ES
function numberToSpanishWords(num){
  if(num===0) return 'cero';
  const u=['','uno','dos','tres','cuatro','cinco','seis','siete','ocho','nueve'];
  const d10=['diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve'];
  const dec=['','','veinte','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
  const cen=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
  function conv(n){
    if(n<10) return u[n];
    if(n<20) return d10[n-10];
    if(n<30) return n===20 ? 'veinte' : 'veinti'+u[n-20];
    if(n<100){ const d=Math.floor(n/10), r=n%10; return dec[d]+(r?' y '+u[r]:''); }
    if(n===100) return 'cien';
    if(n<1000){ const c=Math.floor(n/100), r=n%100; return cen[c]+(r?' '+conv(r):''); }
    if(n<2000){ const r=n%1000; return 'mil'+(r?' '+conv(r):''); }
    if(n<1000000){ const m=Math.floor(n/1000), r=n%1000; return conv(m)+' mil'+(r?' '+conv(r):''); }
    return n.toString();
  }
  return conv(num);
}

// Aggressive normalization
function normalizeForSpeech(text){
  if(!text) return '';
  let t = text;
  t = t.replace(/pesos mexicanos/gi, 'pesos');
  t = t.replace(/\bMN\b/g, 'pesos');
  t = t.replace(/\bd[oó]lares americanos?/gi, 'pesos');
  t = t.replace(/\bd[oó]lares?/gi, 'pesos');
  t = t.replace(/\bd[oó]lar\b/gi, 'peso');
  t = t.replace(/\bUSD\b/gi, 'pesos');
  t = t.replace(/\bdlls\.?/gi, 'pesos');
  t = t.replace(/\busd\b/gi, 'pesos');
  // $ amounts
  t = t.replace(/\$\s?([\d]{1,3}(?:[,\.]\d{3})+(?:\.\d+)?)/g, (m,n)=>{ const num=Math.round(parseFloat(n.replace(/,/g,''))); return isNaN(num)?m:numberToSpanishWords(num)+' pesos'; });
  t = t.replace(/\$\s?(\d+(?:\.\d+)?k)\b/gi, (m,n)=>{ const num=parseFloat(n)*1000; return numberToSpanishWords(Math.round(num))+' pesos'; });
  t = t.replace(/\$\s?(\d+(?:\.\d+)?)/g, (m,n)=>{ const num=Math.round(parseFloat(n)); return isNaN(num)?m:numberToSpanishWords(num)+' pesos'; });
  t = t.replace(/(\d{1,3}(?:,\d{3})+)\s*pesos/gi, (m,n)=> numberToSpanishWords(parseInt(n.replace(/,/g,'')))+' pesos');
  t = t.replace(/\b(\d{3,6})\s*pesos/gi, (m,n)=>{ const v=parseInt(n); return v>=100 && v<1000000 ? numberToSpanishWords(v)+' pesos' : m; });
  t = t.replace(/\bpesos\s+pesos\b/gi,'pesos');
  t = t.replace(/\bpeso\s+pesos\b/gi,'pesos');
  t = t.replace(/\$\s*/g,'');
  t = t.replace(/\s+/g,' ').trim();
  return t;
}

function stopSpeaking(){
  try{ speechSynthesis.cancel(); }catch{}
  if(currentAudio){ currentAudio.pause(); currentAudio = null; }
  isSpeaking = false;
}

async function speakBrowser(text){
  return new Promise(resolve=>{
    if(!('speechSynthesis' in window)){ resolve(); return; }
    const utter = new SpeechSynthesisUtterance(text);
    const voices = speechSynthesis.getVoices();
    // Busca voz masculina en español
    const maleNames = /diego|jorge|raul|pablo|miguel|liberto|juan|enrique|carlos|pedro/i;
    let v = voices.find(v=> v.lang==='es-MX' && maleNames.test(v.name))
         || voices.find(v=> v.lang.toLowerCase().startsWith('es') && maleNames.test(v.name))
         || voices.find(v=> v.lang==='es-MX')
         || voices.find(v=> v.lang.toLowerCase().startsWith('es'))
         || voices[0];
    if(v) utter.voice = v;
    utter.lang = 'es-MX';
    utter.rate = 1.0;
    utter.pitch = 0.82; // más grave para sonar masculino
    utter.volume = 1;
    utter.onend = ()=>{ isSpeaking=false; resolve(); };
    utter.onerror = ()=>{ isSpeaking=false; resolve(); };
    isSpeaking = true;
    speechSynthesis.speak(utter);
  });
}

async function speakEleven(text){
  const key = localStorage.getItem('elevenlabs_api_key');
  const voiceId = localStorage.getItem('elevenlabs_voice_id') || 'pNInz6obpgDQGcFmaJgB';
  const proxy = localStorage.getItem('elevenlabs_proxy');
  if(!key) throw new Error('Falta ElevenLabs key');
  
  let resp;
  if(proxy){
    // Usa tu proxy propio (recomendado)
    resp = await fetch(proxy, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ text, voiceId, key })
    });
  } else {
    // Intento directo - fallará por CORS en la mayoría de navegadores
    resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method:'POST',
      headers:{'xi-api-key':key,'Content-Type':'application/json','Accept':'audio/mpeg'},
      body: JSON.stringify({ text, model_id:'eleven_multilingual_v2', voice_settings:{ stability:0.45, similarity_boost:0.8, style:0.2, use_speaker_boost:true } })
    });
  }
  
  if(!resp.ok){ 
    const errText = await resp.text();
    throw new Error('ElevenLabs '+resp.status+': '+errText.slice(0,80)); 
  }
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  currentAudio = new Audio(url);
  isSpeaking = true;
  await currentAudio.play();
  currentAudio.onended = ()=>{ isSpeaking=false; URL.revokeObjectURL(url); };
}

async function speakTeo(text){
  const filler = Math.random()<0.3 ? ['mmm... ','este... '][Math.floor(Math.random()*2)] : '';
  const humanText = filler + text;
  const normalized = normalizeForSpeech(humanText);
  stopSpeaking();
  const engine = localStorage.getItem('teo_voice_engine') || 'browser';
  const voiceId = localStorage.getItem('elevenlabs_voice_id') || 'pNInz6obpgDQGcFmaJgB';
  const hasKey = !!localStorage.getItem('elevenlabs_api_key');
  try{
    if(engine==='elevenlabs'){
      if(!hasKey) throw new Error('Falta API key de ElevenLabs');
      console.log('[Teo] Usando ElevenLabs, voiceId:', voiceId);
      await speakEleven(normalized);
    } else {
      console.log('[Teo] Usando navegador');
      await speakBrowser(normalized);
    }
  }catch(e){
    console.error('[Teo] ElevenLabs falló:', e);
    await speakBrowser(normalized);
    const msg = e.message.includes('CORS') || e.message.includes('Failed to fetch') 
      ? 'ElevenLabs bloqueado por CORS → usa proxy o navegador' 
      : 'ElevenLabs falló: ' + (e.message||'error');
    toast(msg + ' → usando voz navegador');
  }
}

$('btnTestVoice').onclick = async ()=>{
  $('btnTestVoice').disabled = true;
  const nombre = (localStorage.getItem('teo_nombre')||'Teo').split(' ')[0];
  await speakTeo(`¿Qué onda Daniel? Soy ${nombre}. A ver, véndeme ese seguro. Pero háblame en pesos, nada de dólares, y con números reales.`);
  $('btnTestVoice').disabled = false;
};
$('btnClearVoice').onclick = stopSpeaking;

function buildSystemPrompt(){
  const nivel = localStorage.getItem('teo_nivel')||'NORMAL';
  const producto = localStorage.getItem('teo_producto')||'PPR';
  const escenario = localStorage.getItem('teo_escenario')||'Primera cita';
  const memoria = localStorage.getItem('teo_memoria')||'';
  const nombre = localStorage.getItem('teo_nombre')||'Teo Gutiérrez';
  const edad = localStorage.getItem('teo_edad')||'42';
  const profesion = localStorage.getItem('teo_profesion')||'Ferretero';
  const ciudad = localStorage.getItem('teo_ciudad')||'San Pedro Garza García';
  let promptBase = `Eres ${nombre}, ${edad} años, ${profesion.toLowerCase()} de ${ciudad}. ERES EL PROSPECTO, NO EL ASESOR. No sabes de seguros técnicamente. Solo eres una persona real con dudas auténticas sobre dinero, tiempo, confianza y familia.

REGLAS CRÍTICAS:
1) NUNCA menciones aseguradoras (GNP, AXA, SMNYL, Seguros Monterrey, Allianz, MetLife, Plan Seguro, Mapfre, Qualitas, HDI, Chubb) a menos que Daniel las nombre primero.
2) NUNCA des información técnica ni compares compañías. Tú no eres experto.
3) Solo expresa dudas, preguntas y objeciones de cliente real: "está caro", "no tengo tiempo", "no entiendo", "qué pasa si me quedo sin chamba", "mi esposa dice que...", "ya me chamaquearon antes", "ya tengo algo".
4) Habla como sinaloense: usa muletillas naturales "mmm...", "este...", "a ver", "la neta", "pues mira". Sé breve, 1-2 frases máximo.
5) Si Daniel es vago, pídele números concretos en PESOS mexicanos. Jamás digas dólares, USD, dlls.
6) Personalidad por nivel: FÁCIL=amable pero con dudas básicas, NORMAL=ocupado, pregunta directo, DIFÍCIL=desconfiado, te pone a prueba, no acepta fácil.
7) Detecta contradicciones en lo que dice Daniel.
8) Recuerda el contexto completo de la conversación.`;

  // Modo especial para objeción precio
  if(escenario === 'Objeción precio'){
    promptBase += `

MODO OBJECIÓN PRECIO AGRESIVO:
- Eres MUY sensible al precio. Cada respuesta debe mencionar dinero.
- Frases obligatorias: "está caro", "no me alcanza", "con eso pago la renta", "mi compa paga menos", "dame algo más barato".
- Pide 3 opciones de menor precio. No aceptes el primer número.
- Interrumpe: "a ver, en pesos, ¿cuánto al mes?"
- Si Daniel no da número en 2 mensajes, di "así no puedo decidir".`;
  }
  
  if(nivel === 'DIFÍCIL'){
    promptBase += `

MODO DIFÍCIL: Desconfía. Di "ya me chamaquearon", pide referencias, exige números por escrito.`;
  }

  return promptBase + `

Contexto:
- Nivel: ${nivel}
- Producto que te ofrecen: ${producto}
- Escenario: ${escenario}
- Memoria: ${memoria}`;
}

async function callGroq(history){
  const key = localStorage.getItem('groq_api_key');
  if(!key) throw new Error('Falta Groq API Key');
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},
    body: JSON.stringify({
      model:'llama-3.3-70b-versatile',
      temperature:0.85,
      max_tokens:120,
      messages: history
    })
  });
  if(!resp.ok){ const t = await resp.text(); throw new Error(t); }
  const data = await resp.json();
  return (data.choices?.[0]?.message?.content || '').trim();
}

function addMessage(role, content){
  const chat = $('chat');
  const wrap = document.createElement('div');
  wrap.className = `flex gap-3 ${role==='user'?'justify-end':'justify-start'}`;
  if(role==='assistant'){
    const avatar = document.querySelector('.teo-avatar').src;
    wrap.innerHTML = `<img src="${avatar}" class="w-8 h-8 rounded-full mt-0.5 ring-1 ring-zinc-800 teo-avatar shrink-0" alt=""><div class="max-w-[88%] sm:max-w-[75%] lg:max-w-[68%] bg-zinc-900/90 border border-zinc-800 rounded-2xl rounded-tl-md px-4 py-3 text-[15px] leading-[1.5] shadow-sm">${content}</div>`;
  }else{
    wrap.innerHTML = `<div class="max-w-[88%] sm:max-w-[75%] lg:max-w-[68%] bg-gradient-to-br from-violet-600 to-blue-600 rounded-2xl rounded-tr-md px-4 py-3 text-[15px] leading-[1.5] text-white shadow-md shadow-violet-950/20">${content}</div>`;
  }
  chat.appendChild(wrap);
  chat.scrollTop = chat.scrollHeight;
}

async function handleSend(){
  const input = $('msgInput');
  const text = input.value.trim();
  if(!text) return;
  input.value=''; input.style.height='auto';
  addMessage('user', text);
  messages.push({role:'user', content:text, ts:Date.now()});
  $('status').textContent = 'pensando...';
  await new Promise(r=>setTimeout(r, 800 + Math.random()*900));
  try{
    const system = buildSystemPrompt();
    const history = [{role:'system', content:system}, ...messages.slice(-14).map(m=>({role:m.role, content:m.content}))];
    let reply = await callGroq(history);
    if(Math.random()<0.12){ reply = ['Espérame... ','A ver, ahorita... '][Math.floor(Math.random()*2)] + reply; }
    reply = reply.replace(/\b(GNP|AXA|MetLife|Seguros Monterrey|Allianz|Mapfre|Banorte|Inbursa)\b/gi, 'la aseguradora');
    messages.push({role:'assistant', content:reply, ts:Date.now()});
    addMessage('assistant', reply);
    $('status').textContent = 'listo';
    speakTeo(reply);
  }catch(e){
    console.error(e);
    addMessage('assistant','No pude conectar con Groq. Revisa tu API key en la configuración.');
    $('status').textContent = 'error';
    toast('Error Groq');
  }
}

$('btnSend').onclick = handleSend;
$('msgInput').addEventListener('keydown', e=>{
  if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); handleSend(); }
});
$('msgInput').addEventListener('input', e=>{
  e.target.style.height='auto'; e.target.style.height = Math.min(e.target.scrollHeight,128)+'px';
});

document.querySelectorAll('.chip').forEach(b=> b.onclick = ()=>{ $('msgInput').value = b.dataset.chip; $('msgInput').focus(); });

$('btnSave').onclick = saveConfig;
$('btnReset').onclick = ()=>{
  messages = []; $('chat').innerHTML=''; stopSpeaking(); localStorage.setItem('teo_session_start', Date.now().toString()); initGreeting(); toast('Chat reiniciado');
};

$('toggleConfig').onclick = ()=> $('configPanel').classList.toggle('hidden');

// Speech recognition
if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'es-MX';
  recognition.interimResults = false;
  recognition.onstart = ()=>{ listening=true; $('btnMic').classList.add('bg-red-600/30','border-red-500/50'); };
  recognition.onend = ()=>{ listening=false; $('btnMic').classList.remove('bg-red-600/30','border-red-500/50'); };
  recognition.onresult = e => { $('msgInput').value = e.results[0][0].transcript; handleSend(); };
  $('btnMic').onclick = ()=>{ if(!recognition) return; listening ? recognition.stop() : recognition.start(); };
}else{
  $('btnMic').onclick = ()=> toast('Micrófono no soportado en este navegador');
}

function initGreeting(){
  const nivel = localStorage.getItem('teo_nivel') || 'NORMAL';
  const nombre = (localStorage.getItem('teo_nombre')||'Teo').split(' ')[0];
  const greetings = {
    'FÁCIL':`¿Qué onda Daniel? Me dijo el contador que andas viendo lo del retiro. A ver, platícame sin tanto rollo.`,
    'NORMAL':`Daniel, tengo 10 minutos entre proveedores. ¿Qué seguro me traes, cuánto cuesta en pesos y por qué contigo?`,
    'DIFÍCIL':`Mira Daniel, ya me chamaquearon antes con letras chiquitas. Si me vas a vender algo, dime números en pesos, sin vueltas. La neta no tengo tiempo.`
  };
  const msg = greetings[nivel] || greetings.NORMAL;
  messages.push({role:'assistant', content:msg, ts:Date.now()});
  addMessage('assistant', msg);
  setTimeout(()=> speakTeo(msg), 400);
}


function analyzeSession(){
  const userMsgs = messages.filter(m=>m.role==='user');
  const teoMsgs = messages.filter(m=>m.role==='assistant');
  const fullText = userMsgs.map(m=>m.content).join(' ').toLowerCase();
  
  const muletillasList = ['este','eh','ehh','mmm','pues','o sea','digamos'];
  let muletillaCount = 0;
  muletillasList.forEach(w=>{ const re = new RegExp('\\b'+w+'\\b','gi'); const matches = fullText.match(re); if(matches) muletillaCount += matches.length; });
  
  const preguntasAbiertas = userMsgs.filter(m=> /\?$/.test(m.content) && /(qué|cómo|cuándo|dónde|por qué|cuéntame|platícame|imaginas|opinas)/i.test(m.content)).length;
  
  const objeciones = ['caro','precio','costoso','tiempo','ocupado','pensarlo','esposa','esposo','confío','desconfío','ya tengo','chamaquearon'];
  const objDetectadas = teoMsgs.filter(m=> objeciones.some(o=> new RegExp('\\b'+o+'\\b','i').test(m.content))).length;
  
  const numeros = (fullText.match(/\$\s?\d+|\b\d{3,}\b/g) || []).length;
  
  const startTime = parseInt(localStorage.getItem('teo_session_start') || Date.now());
  const duracion = Math.floor((Date.now() - startTime)/1000);
  const mins = String(Math.floor(duracion/60)).padStart(2,'0');
  const secs = String(duracion%60).padStart(2,'0');
  
  // tiempo de respuesta promedio con \b
  const respTimes = [];
  for(let i=1;i<messages.length;i++){
    const curr = messages[i];
    const prev = messages[i-1];
    if(curr.role==='user' && curr.ts && prev.ts){
      respTimes.push((curr.ts - prev.ts)/1000);
    }
  }
  const avgResp = respTimes.length ? Math.round(respTimes.reduce((a,b)=>a+b,0)/respTimes.length) : 0;
  const avgRespStr = avgResp ? `${avgResp}s` : '—';
  
  const score = Math.max(20, Math.min(95, 40 + preguntasAbiertas*10 + numeros*4 - muletillaCount*2 + objDetectadas*3));
  const nivel = score>=80?'Excelente':score>=65?'Bueno':score>=50?'En desarrollo':'Necesita práctica';
  const color = score>=80?'text-emerald-400':score>=65?'text-cyan-400':score>=50?'text-amber-400':'text-red-400';
  
  return { score, nivel, color, intervenciones:userMsgs.length, preguntasAbiertas, muletillaCount, objDetectadas, numeros, duracion:`${mins}:${secs}`, avgResp:avgRespStr, userMsgs:userMsgs.map(m=>m.content) };
}



// Recordatorios
function initReminder(){
  const toggle = $('reminderToggle');
  if(!toggle) return;
  toggle.checked = localStorage.getItem('teo_reminder') === '1';
  toggle.onchange = ()=>{
    localStorage.setItem('teo_reminder', toggle.checked?'1':'0');
    if(toggle.checked && 'Notification' in window && Notification.permission !== 'granted'){
      Notification.requestPermission();
    }
    toast(toggle.checked?'Recordatorio activado':'Recordatorio desactivado');
  };
  
  // Verificar si practicó hoy
  if(toggle.checked){
    const last = localStorage.getItem('teo_last_practice');
    const now = Date.now();
    if(!last || (now - parseInt(last)) > 24*60*60*1000){
      setTimeout(()=>{
        if('Notification' in window && Notification.permission === 'granted'){
          new Notification('Teo te espera', {body:'¿Practicas 5 min de objeciones hoy?', icon:''});
        } else {
          toast('💡 ¿Practicas hoy con Teo?');
        }
      }, 3000);
    }
  }
}

// Guardar última práctica al analizar
const originalSaveHistory = saveHistory;
saveHistory = function(s){
  originalSaveHistory(s);
  localStorage.setItem('teo_last_practice', Date.now().toString());
};

function saveHistory(s){
  try{
    const hist = JSON.parse(localStorage.getItem('teo_history')||'[]');
    hist.unshift({
      date: new Date().toISOString(),
      score: s.score,
      nivel: s.nivel,
      intervenciones: s.intervenciones,
      preguntas: s.preguntasAbiertas,
      muletillas: s.muletillaCount,
      objeciones: s.objDetectadas,
      numeros: s.numeros,
      producto: localStorage.getItem('teo_producto')||'',
      escenario: localStorage.getItem('teo_escenario')||'',
      duracion: s.duracion
    });
    localStorage.setItem('teo_history', JSON.stringify(hist.slice(0,50)));
  }catch(e){ console.error('Error guardando historial', e); }
}

function renderAnalysis(){
  const s = analyzeSession();
  saveHistory(s);
  const content = $('analysisContent');
  const hist = JSON.parse(localStorage.getItem('teo_history')||'[]').slice(0,7);
  content.innerHTML = `
    <div class="grid md:grid-cols-3 gap-4">
      <div class="md:col-span-1 bg-zinc-950 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center">
        <div class="relative w-28 h-28">
          <svg class="transform -rotate-90 w-28 h-28"><circle cx="56" cy="56" r="48" stroke="#27272a" stroke-width="8" fill="none"/><circle cx="56" cy="56" r="48" stroke="currentColor" stroke-width="8" fill="none" stroke-dasharray="${2*Math.PI*48}" stroke-dashoffset="${2*Math.PI*48*(1-s.score/100)}" class="${s.color} transition-all" stroke-linecap="round"/></svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center"><span class="text-3xl font-bold">${s.score}</span><span class="text-xs text-zinc-500">/100</span></div>
        </div>
        <p class="mt-3 font-medium ${s.color}">${s.nivel}</p>
      </div>
      <div class="md:col-span-2 grid grid-cols-2 gap-3">
        ${[['Intervenciones',s.intervenciones,'💬'],['Preguntas abiertas',s.preguntasAbiertas,'❓'],['Muletillas',s.muletillaCount,'🗣️'],['Objeciones trabajadas',s.objDetectadas,'🛡️'],['Datos concretos',s.numeros,'🔢'],['Resp. promedio',s.avgResp,'⏱️']].map(([l,v,i])=>`
          <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <div class="text-[11px] text-zinc-500 flex items-center gap-1.5">${i} ${l}</div>
            <div class="text-2xl font-semibold mt-1">${v}</div>
          </div>`).join('')}
      </div>
    </div>
    
    <div>
      <h3 class="text-sm font-semibold mb-3 text-zinc-300">Recomendaciones de Teo</h3>
      <div class="space-y-2">
        <div class="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-emerald-200 text-sm">• ${s.muletillaCount<=2?'Buen control del lenguaje.':'Tienes '+s.muletillaCount+' muletillas. Practica frases directas sin "este..."'}</div>
        <div class="p-3 rounded-xl bg-amber-950/40 border border-amber-900/50 text-amber-200 text-sm">• ${s.preguntasAbiertas===0?'Haz más preguntas abiertas: "¿Cómo te imaginas tu retiro?"':'Hiciste '+s.preguntasAbiertas+' preguntas abiertas. Bien.'}</div>
        <div class="p-3 rounded-xl bg-violet-950/40 border border-violet-900/50 text-violet-200 text-sm">• ${s.numeros<2?'Teo necesita números. Di: "¿$3,000 al mes te funciona?"':'Usaste '+s.numeros+' datos concretos. Sigue así.'}</div>
      </div>
    </div>
    
    <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
      <div class="text-xs font-mono text-zinc-500 mb-2">TRANSCRIPT BREVE</div>
      <div class="text-xs text-zinc-400 space-y-1 max-h-32 overflow-y-auto">
        ${s.userMsgs.slice(-5).map(m=>`<div><span class="text-cyan-400">Tú:</span> ${m.slice(0,90)}</div>`).join('')}
      </div>
    </div>
    
    <div>
      <h3 class="text-sm font-semibold mb-3 text-zinc-300">Evolución (últimas ${hist.length} sesiones)</h3>
      <div class="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
        <div class="flex items-end gap-1 h-20 mb-3">
          ${hist.slice().reverse().map(h=>{
            const height = Math.max(8, (h.score/100)*72);
            const color = h.score>=80?'bg-emerald-500':h.score>=65?'bg-cyan-500':h.score>=50?'bg-amber-500':'bg-red-500';
            return `<div class="flex-1 flex flex-col items-center gap-1">
              <div class="${color} w-full rounded-t transition-all" style="height:${height}px" title="${h.score}"></div>
              <span class="text-[9px] text-zinc-600">${new Date(h.date).toLocaleDateString('es-MX',{day:'2-digit',month:'short'})}</span>
            </div>`
          }).join('')}
        </div>
        <div class="grid grid-cols-3 gap-2 text-[11px]">
          ${hist.slice(0,3).map(h=>`
            <div class="bg-zinc-900/50 rounded-lg p-2 border border-zinc-800">
              <div class="text-zinc-500">${new Date(h.date).toLocaleDateString('es-MX')}</div>
              <div class="font-medium">${h.score}/100 • ${h.escenario}</div>
              <div class="text-zinc-400">${h.preguntas} preg • ${h.numeros} nums</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
  $('analysisModal').classList.remove('hidden');
  const btnExport = $('btnExportPDF'); if(btnExport) btnExport.onclick = exportarPDF;
  const btnClose = $('btnCloseAnalysis'); if(btnClose) btnClose.onclick = closeAnalysis;
}


async function exportarPDF(){
  try{
  if(!window.jspdf){ toast('Cargando PDF... intenta de nuevo'); return; }
  const s = analyzeSession();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  const nombre = localStorage.getItem('teo_nombre') || 'Teo';
  const fecha = new Date().toLocaleDateString('es-MX', {year:'numeric', month:'long', day:'numeric'});
  
  // Header
  doc.setFillColor(124,58,237);
  doc.rect(0,0,210,25,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18);
  doc.text('Reporte de Entrenamiento - Teo v4.5', 14, 16);
  
  doc.setTextColor(0,0,0);
  doc.setFontSize(12);
  doc.text(`Asesor: Daniel Marín`, 14, 35);
  doc.text(`Cliente simulado: ${nombre}`, 14, 42);
  doc.text(`Fecha: ${fecha}`, 14, 49);
  doc.text(`Producto: ${localStorage.getItem('teo_producto')} | Escenario: ${localStorage.getItem('teo_escenario')}`, 14, 56);
  
  // Score
  doc.setFontSize(24);
  const col = s.score>=80?[16,185,129]:s.score>=65?[6,182,212]:s.score>=50?[245,158,11]:[239,68,68];
  doc.setTextColor(col[0], col[1], col[2]);
  doc.text(`${s.score}/100`, 160, 40);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(s.nivel, 160, 47);
  
  // Métricas
  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.text('Métricas clave', 14, 70);
  const metrics = [
    ['Intervenciones', s.intervenciones],
    ['Preguntas abiertas', s.preguntasAbiertas],
    ['Muletillas', s.muletillaCount],
    ['Objeciones trabajadas', s.objDetectadas],
    ['Datos concretos', s.numeros],
    ['Duración', s.duracion]
  ];
  let y = 78;
  metrics.forEach(([k,v])=>{
    doc.setFontSize(11);
    doc.text(`${k}:`, 14, y);
    doc.text(String(v), 70, y);
    y+=7;
  });
  
  // Recomendaciones
  y+=5;
  doc.setFontSize(14);
  doc.text('Recomendaciones', 14, y);
  y+=8;
  doc.setFontSize(10);
  const recs = [
    s.muletillaCount<=2?'✓ Buen control del lenguaje':'• Reduce muletillas ('+s.muletillaCount+')',
    s.preguntasAbiertas>0?'✓ Hiciste '+s.preguntasAbiertas+' preguntas abiertas':'• Haz más preguntas abiertas',
    s.numeros>=2?'✓ Usaste datos concretos':'• Menciona números en pesos'
  ];
  recs.forEach(r=>{ doc.text(r, 14, y); y+=6; });
  
  // Transcript
  y+=5;
  doc.setFontSize(12);
  doc.text('Fragmentos de conversación', 14, y);
  y+=7;
  doc.setFontSize(9);
  s.userMsgs.slice(-5).forEach(m=>{
    const lines = doc.splitTextToSize('Tú: '+m, 180);
    if(y>270){ doc.addPage(); y=20; }
    doc.text(lines, 14, y);
    y+= lines.length*4 + 2;
  });
  
  doc.save(`Teo-sesion-${new Date().toISOString().slice(0,10)}.pdf`);
  toast('PDF generado');
  }catch(e){ console.error('PDF error', e); toast('Error PDF: '+e.message); }
}

function closeAnalysis(){ $('analysisModal').classList.add('hidden'); }

$('btnAnalyze').onclick = renderAnalysis;
// Asegurar botones del modal si existen al cargar
setTimeout(()=>{ const be=$('btnExportPDF'); if(be) be.onclick=exportarPDF; const bc=$('btnCloseAnalysis'); if(bc) bc.onclick=closeAnalysis; }, 500);
$('btnClearHistory').onclick = ()=>{ if(confirm('¿Borrar historial de sesiones?')){ localStorage.removeItem('teo_history'); toast('Historial borrado'); } };

// Init
window.addEventListener('load', ()=>{
  initReminder();
  loadConfig();
  localStorage.setItem('teo_session_start', Date.now().toString());
  if('speechSynthesis' in window){
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = ()=> speechSynthesis.getVoices();
  }
  setTimeout(initGreeting, 400);
});

    
    // Ensure init runs
    if(typeof loadConfig === 'function') loadConfig();
    if(typeof updateProfileDisplay === 'function') updateProfileDisplay();
    if(typeof initReminder === 'function') initReminder();
    localStorage.setItem('teo_session_start', Date.now().toString());
    setTimeout(()=>{ if(typeof initGreeting === 'function') initGreeting(); }, 400);
  }

  // Listen for navigation to practica-cliente
  const originalNavigate = window.navigateTo;
  window.navigateTo = function(page) {
    originalNavigate(page);
    if(page === 'practica-cliente') {
      setTimeout(initTeoWhenReady, 150);
    }
  };
})();

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
                        <button onclick="guardarMiExperiencia()" class="mt-6 w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Guardar y continuar →</button>
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

            function renderPlanCarrera() {
                const progress = getProspectProgress(currentUser.id);

                const etapas = [
                    { tiempo: 'Semana 1-2', titulo: 'PROSPECTO', desc: 'Completas Mi experiencia y conoces la oferta de valor.', metas: ['Formulario completo','Revisión de perfil','Asignación de reclutador'], estado: 'actual' },
                    { tiempo: 'Semana 3-4', titulo: 'AGENTE EN DESARROLLO', desc: 'Entrevista con tu reclutador, validación de documentos y arranque de tu plan de desarrollo.', metas: ['Entrevista con reclutador','Validación de documentos','Plan de desarrollo asignado'], estado: 'siguiente' },
                    { tiempo: 'Mes 2', titulo: 'AGENTE CON CÉDULA', desc: 'Curso CNSF y examen para obtener tu cédula, con mentor asignado.', metas: ['Curso CNSF (40 hrs)','Examen y cédula aprobada','Alta ante la aseguradora'], estado: 'futuro' },
                    { tiempo: 'Mes 3', titulo: 'AGENTE PRODUCTIVO', desc: 'Cédula activa, primeras pólizas colocadas y bono de arranque.', metas: ['3+ pólizas vendidas','Bono de arranque','Mentoría semanal'], estado: 'futuro' },
                    { tiempo: 'Mes 6-12', titulo: 'AGENTE CONSOLIDADO', desc: 'Cartera en crecimiento, ingreso estable y acceso a convenciones.', metas: ['30+ clientes en cartera','Ingreso mensual estable','Viaje de convención'], estado: 'futuro' },
                    { tiempo: 'Año 1+', titulo: 'DESARROLLO A AGENCIA', desc: 'Reclutas tu propio equipo y das el salto a Gerente/Director de Agencia con override sobre ventas.', metas: ['Equipo de 3+ agentes','Ingreso por override','Oficina propia'], estado: 'futuro' }
                ];

                return `<div class="max-w-5xl mx-auto p-6">
                    <h1 class="text-3xl font-black mb-2">Plan de carrera ${progress['plan-carrera'] ? '<span class="ml-2 align-middle bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">COMPLETADO</span>' : ''}</h1>
                    <p class="text-gray-600 mb-8">De prospecto a dueño de agencia - ruta clara, tiempos reales y metas medibles</p>
                    <div class="relative">
                        <div class="absolute left-8 top-0 bottom-0 w-1 bg-gray-200 hidden md:block"></div>
                        ${etapas.map((e,i)=>`
                            <div class="relative flex gap-6 mb-8">
                                <div class="hidden md:flex w-16 h-16 rounded-full ${e.estado==='actual'?'bg-red-600':'bg-gray-300'} items-center justify-center text-white font-black z-10 flex-shrink-0">${i+1}</div>
                                <div class="flex-1 bg-white rounded-2xl border-2 ${e.estado==='actual'?'border-red-200 shadow-md':'border-gray-100'} p-6">
                                    <div class="flex items-start justify-between gap-3 mb-3">
                                        <div>
                                            <div class="text-xs font-bold text-red-600 mb-1">${e.tiempo}</div>
                                            <h3 class="text-xl font-black">${e.titulo}</h3>
                                            <p class="text-gray-600 mt-1">${e.desc}</p>
                                        </div>
                                        ${e.estado==='actual'?'<span class="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap">ESTÁS AQUÍ</span>':''}
                                    </div>
                                    <div class="mt-4 grid md:grid-cols-3 gap-2">
                                        ${e.metas.map(m=>`<div class="text-xs bg-gray-50 px-3 py-2 rounded-lg">• ${m}</div>`).join('')}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    <div class="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-6">
                        <h4 class="font-bold text-amber-900 mb-2">¿Dudas sobre el plan?</h4>
                        <p class="text-sm text-amber-800">El chat con tu reclutador está siempre abierto (paso 4), puedes preguntar antes de continuar.</p>
                    </div>
                    <div class="mt-6 text-center">
                        <button onclick="navigateTo('agenda-prospectos')" class="px-8 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700">Continuar a Agenda →</button>
                        <button onclick="navigateTo('chat-reclutador')" class="ml-3 px-6 py-3 border rounded-xl hover:bg-gray-50">Preguntar al reclutador</button>
                    </div>
                </div>`;
            }

            function renderAgendaProspectos() {
                const progress = getProspectProgress(currentUser.id);
                const saved = progress['agenda-prospectos_data'] || {};
                return `<div class="max-w-4xl mx-auto p-6">
                    <div class="bg-white rounded-2xl shadow-sm border p-8">
                        <div class="flex items-center gap-3 mb-6">
                            <div class="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center"><span class="font-bold text-red-600">5</span></div>
                            <h1 class="text-2xl font-black">Agenda de prospectos</h1>
                            ${progress['agenda-prospectos'] ? '<span class="ml-auto bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold">COMPLETADO</span>' : ''}
                        </div>
                        <p class="text-gray-600 mb-6">Comparte tu lista de prospectos: pega los datos desde Excel o sube directamente tu archivo .xlsx.</p>

                        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                            <h4 class="font-bold text-blue-900 mb-2">Instrucciones</h4>
                            <p class="text-sm text-blue-800">Copia tu tabla de Excel y pégala abajo (Ctrl+V), o sube el archivo .xlsx con el botón. El registro quedará visible para Admin, GM y Desarrollador.</p>
                        </div>

                        <div class="mb-4">
                            <label class="text-sm font-bold block mb-1">Subir archivo .xlsx</label>
                            <input id="agenda-file" type="file" accept=".xlsx,.xls" class="w-full p-2.5 border rounded-xl text-sm bg-white" onchange="cargarAgendaXLSX(event)">
                            <p id="agenda-file-status" class="text-xs text-gray-500 mt-1"></p>
                        </div>

                        <label class="text-sm font-bold block mb-1">O pega tus datos aquí</label>
                        <textarea id="agenda-data" class="w-full h-48 p-4 border rounded-xl font-mono text-sm" placeholder="Pega aquí tu tabla de Excel...&#10;Ejemplo:&#10;Nombre&#9;Telefono&#9;Fecha&#9;Estado&#10;Juan Pérez&#9;555...&#9;2024-01-15&#9;Contactado">${escapeHTML(saved.tabla||'')}</textarea>

                        <div class="mt-4 grid md:grid-cols-2 gap-4">
                            <div><label class="text-sm font-bold">Fecha preferida entrevista (opcional)</label><input id="agenda-fecha" type="date" class="w-full mt-1 p-3 border rounded-xl" value="${saved.fecha||''}"></div>
                            <div><label class="text-sm font-bold">Horario (opcional)</label><select id="agenda-hora" class="w-full mt-1 p-3 border rounded-xl"><option ${saved.hora==='Mañana'?'selected':''}>Mañana</option><option ${saved.hora==='Tarde'?'selected':''}>Tarde</option></select></div>
                        </div>

                        <button onclick="guardarAgendaProspectos()" class="mt-6 w-full py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700">Finalizar proceso →</button>
                    </div>
                </div>`;
            }
            function cargarAgendaXLSX(evt) {
                const file = evt.target.files && evt.target.files[0];
                const status = document.getElementById('agenda-file-status');
                if (!file) return;
                if (typeof XLSX === 'undefined') {
                    if (status) status.textContent = 'No se pudo cargar el lector de Excel. Usa "pegar datos".';
                    showToast('Lector de Excel no disponible, pega los datos manualmente', 'warning');
                    return;
                }
                const reader = new FileReader();
                reader.onload = function(e) {
                    try {
                        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
                        const sheet = wb.Sheets[wb.SheetNames[0]];
                        const tsv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
                        const textarea = document.getElementById('agenda-data');
                        if (textarea) textarea.value = tsv;
                        if (status) status.textContent = `Archivo cargado: ${file.name}`;
                        showToast('Archivo Excel cargado', 'success');
                    } catch(err) {
                        if (status) status.textContent = 'No se pudo leer el archivo.';
                        showToast('Error al leer el archivo Excel', 'warning');
                    }
                };
                reader.readAsArrayBuffer(file);
            }
            function guardarAgendaProspectos() {
                const data = {
                    tabla: document.getElementById('agenda-data').value,
                    fecha: document.getElementById('agenda-fecha')?.value || '',
                    hora: document.getElementById('agenda-hora')?.value || ''
                };
                if (!data.tabla || !data.tabla.trim()) {
                    showToast('Pega tus datos o sube un archivo antes de continuar', 'warning');
                    return;
                }
                markProspectStep(currentUser.id, 'agenda-prospectos', data);
                if (!db.expedientesProspectos) db.expedientesProspectos = [];
                const exp = db.expedientesProspectos.find(e => e.userId === currentUser.id);
                if (exp) { exp.completado = true; exp.agenda = data; }
                saveDB();
                showToast('Proceso finalizado', 'success');
                setTimeout(()=>{ alert('Proceso finalizado. Tu reclutador te contactará en menos de 24h con los siguientes pasos.'); }, 400);
            }
