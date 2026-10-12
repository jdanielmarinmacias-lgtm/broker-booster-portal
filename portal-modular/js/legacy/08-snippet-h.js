
const GAS_URL = 'https://script.google.com/macros/s/AKfycbzB65mzG4DeltqoptKxgXRaMmy0nHSyc2hvdvW8Vdpg2X5lzWbE4G0s_HXFX7URRKXr9w/exec'; // <-- reemplaza con tu URL /exec
window.enviarAviso = async function(tipo, usuarios, datos={}) {
  try {
    const para = usuarios.filter(u=>u && u.email).map(u=>({email:u.email, name:u.name||u.nombre||''}));
    if(!para.length) return;
    await fetch(GAS_URL, {
      method:'POST',
      mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({tipo, para, datos})
    });
    console.log('Aviso enviado:', tipo, para.length);
  } catch(e){ console.error('Error enviando aviso', e); }
};
