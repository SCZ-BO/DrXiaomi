/* Cárgalo DESPUÉS de cliente.js:  <script type="module" src="/js/ux.js"></script> */
import { datos, CONFIG, formatBs, toast, haptic } from './cliente.js';
const $ = id => document.getElementById(id);
const NOMBRES = ['Cliente','Equipo','Recepción','Seguridad','Fotos','Costos','Listo'];

/* Etiqueta + progreso */
const label = $('stepLabel');
function pasoVisible(){ const p=[...document.querySelectorAll('.wizard-panel')].find(x=>!x.classList.contains('hidden')); return p?+p.dataset.panel:1; }
function actualizarLabel(){ const n=pasoVisible(); label.innerHTML=`<span>Paso <b>${n}</b> de 7</span><span>${NOMBRES[n-1]}</span>`; }
new MutationObserver(actualizarLabel).observe($('wizardContent'),{subtree:true,attributes:true,attributeFilter:['class']});
actualizarLabel();

/* Avance automático */
$('marcasGrid')?.addEventListener('click',()=>setTimeout(()=>$('modelo')?.focus(),250));
$('enciendeGroup')?.addEventListener('click',()=>setTimeout(()=>{
  if(pasoVisible()===2 && $('marca').value && $('modelo').value.trim()) $('btnNext').click();
},350));
$('semaforoGroup')?.addEventListener('click',()=>{ /* un toque y listo, sin pasar solo: el técnico puede seguir con la auditoría */ });

/* Menú ⋯ */
$('menuBtn')?.addEventListener('click',e=>{e.stopPropagation();$('menuPop').classList.toggle('show');});
document.addEventListener('click',()=>$('menuPop')?.classList.remove('show'));

/* Sin conexión */
const onoff=()=>document.body.classList.toggle('offline',!navigator.onLine);
addEventListener('online',onoff);addEventListener('offline',onoff);onoff();

/* Mantener pantalla encendida */
try{navigator.wakeLock?.request('screen');}catch{}

/* Guardar y generar link (usa el guardado de cliente.js) */
$('btnGuardarFinal')?.addEventListener('click',()=>{
  const b=$('btnGuardarFinal'); b.disabled=true; haptic(20);
  window._ultimoRecibo=null;
  $('btnGenerate').click();
  const t0=Date.now();
  const w=setInterval(()=>{
    if(window._ultimoRecibo){ clearInterval(w); mostrarExito(window._ultimoRecibo); }
    else if(Date.now()-t0>20000){ clearInterval(w); b.disabled=false; }
  },150);
});

function linkRecibo(r){ return `${CONFIG.urlApp}/recibo/?id=${r.numeroRecibo}`; }

function mostrarExito(r){
  $('finalActions').classList.add('hidden');
  $('previewContainer').classList.add('hidden');
  $('successNum').textContent=r.numeroRecibo;
  $('linkRecibo').value=linkRecibo(r);
  $('successBox').classList.remove('hidden');
  $('wizardFooter').classList.add('hidden');
  window.scrollTo(0,0);
}

$('btnCopiar')?.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText($('linkRecibo').value);toast('Link copiado','success',1500);haptic(15);}
  catch{$('linkRecibo').select();document.execCommand('copy');}
});

$('btnWa')?.addEventListener('click',()=>{
  const r=window._ultimoRecibo; if(!r) return; haptic(15);
  const msg=`Hola ${r.cliente.split(' ')[0]},\n\nRecibimos tu equipo *${r.marca} ${r.modelo}*.\n\n📄 Tu recibo:\n${linkRecibo(r)}\n\nTotal: ${formatBs(r.total)}\n${r.saldo>0?'Saldo pendiente: '+formatBs(r.saldo):'✅ Pagado'}\n\n${CONFIG.nombreTienda}`;
  window.open(`https://wa.me/591${r.telefono.replace(/\D/g,'')}?text=${encodeURIComponent(msg)}`,'_blank');
});

/* PDF: solo al tocar el botón, nunca automático */
$('btnPdf')?.addEventListener('click',()=>{
  const r=window._ultimoRecibo; if(!r||!window.jspdf) return toast('PDF no disponible','error');
  const doc=new window.jspdf.jsPDF({unit:'mm',format:'a5'});
  doc.setFontSize(16);doc.text(CONFIG.nombreTienda,10,14);
  doc.setFontSize(9);doc.text(`${CONFIG.direccion} · Tel ${CONFIG.telefono}`,10,20);
  doc.setFontSize(11);
  let y=30;
  [`Recibo: ${r.numeroRecibo}`,`Cliente: ${r.cliente}  (${r.telefono})`,`Equipo: ${r.marca} ${r.modelo} ${r.color||''}`,
   `Reparaciones: ${(r.motivoIngreso||[]).join(', ')||'-'}`].forEach(t=>{doc.text(t,10,y);y+=6;});
  doc.autoTable({startY:y+2,head:[['Servicio','Costo']],body:r.servicios.map(s=>[s.desc,formatBs(s.costo)]),
    foot:[['Total',formatBs(r.total)],['Adelanto',formatBs(r.adelanto)],['Saldo',formatBs(r.saldo)]],
    headStyles:{fillColor:[255,105,0]},footStyles:{fillColor:[240,240,240],textColor:0},styles:{fontSize:10}});
  doc.save(`${r.numeroRecibo}.pdf`);
  haptic(15);
});
