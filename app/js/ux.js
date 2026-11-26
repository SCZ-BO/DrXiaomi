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

/* PDF profesional (solo al tocar el botón) */
const NA=[255,105,0], NA2=[230,81,0], GR=[34,34,34], MU=[110,110,110], CL=[255,243,232];

const imgData=url=>new Promise(res=>{const i=new Image();i.crossOrigin='anonymous';
  i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;c.getContext('2d').drawImage(i,0,0);res({d:c.toDataURL('image/png'),w:i.width,h:i.height});};
  i.onerror=()=>res(null);i.src=url;});

function qrData(text){try{const d=document.createElement('div');new window.QRCode(d,{text,width:200,height:200});
  return d.querySelector('canvas')?.toDataURL('image/png');}catch{return null;}}

async function crearPdf(r){
  const {jsPDF}=window.jspdf, doc=new jsPDF({unit:'mm',format:'a4'});
  const W=210, M=14;
  const fecha=new Date().toLocaleDateString('es-BO',{day:'2-digit',month:'long',year:'numeric'});

  // Cabecera naranja
  doc.setFillColor(...NA);doc.rect(0,0,W,38,'F');
  doc.setFillColor(...NA2);doc.rect(0,38,W,2,'F');
  const logo=await imgData(CONFIG.logoUrl);
  let x=M;
  if(logo){doc.setFillColor(255,255,255);doc.roundedRect(M,7,24,24,3,3,'F');doc.addImage(logo.d,'PNG',M+2,9,20,20);x=M+30;}
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(20);doc.text(CONFIG.nombreTienda,x,17);
  doc.setFont('helvetica','normal');doc.setFontSize(9);
  doc.text(CONFIG.eslogan,x,23);doc.text(`${CONFIG.direccion}  ·  WhatsApp ${CONFIG.telefono}`,x,28.5);
  doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text('RECIBO DE INGRESO',W-M,14,{align:'right'});
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(r.numeroRecibo,W-M,20,{align:'right'});doc.text(fecha,W-M,25.5,{align:'right'});

  // Cajas cliente / equipo
  const caja=(x0,tit,lineas)=>{
    doc.setFillColor(...CL);doc.roundedRect(x0,48,(W-2*M-6)/2,36,3,3,'F');
    doc.setFillColor(...NA);doc.rect(x0,48,1.8,36,'F');
    doc.setTextColor(...NA2);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(tit,x0+6,55);
    doc.setTextColor(...GR);let y=62;
    lineas.forEach(([k,v])=>{doc.setFont('helvetica','bold');doc.setFontSize(8);doc.setTextColor(...MU);doc.text(k,x0+6,y);
      doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...GR);doc.text(String(v).slice(0,34),x0+6,y+4.5);y+=10;});
  };
  const cw=(W-2*M-6)/2;
  caja(M,'CLIENTE',[['Nombre',r.cliente],['Teléfono',r.telefono]]);
  caja(M+cw+6,'EQUIPO',[['Marca y modelo',`${r.marca} ${r.modelo}`],['Color',r.color||'No indicado']]);

  // Reparaciones y estado
  const estado={bueno:'Buen estado',regular:'Con detalles',malo:'Muy dañado'}[r.estadoLlegada]||'No evaluado';
  let y=92;
  doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...NA2);doc.text('TRABAJO SOLICITADO',M,y);
  doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(...GR);
  const rep=doc.splitTextToSize((r.motivoIngreso||[]).join('  +  ')||'Diagnóstico (equipo apagado)',W-2*M);
  doc.text(rep,M,y+5.5);y+=5.5+rep.length*4.6;
  doc.setFontSize(9);doc.setTextColor(...MU);
  doc.text(`Estado de llegada: ${estado}   ·   ¿Enciende?: ${r.enciende}`,M,y+2);y+=6;
  if(r.checklist){const c=doc.splitTextToSize('Revisión: '+r.checklist,W-2*M);doc.text(c,M,y+2);y+=c.length*4+2;}

  // Tabla de servicios
  doc.autoTable({startY:y+4,margin:{left:M,right:M},
    head:[['Servicio','Costo']],body:r.servicios.map(s=>[s.desc,formatBs(s.costo)]),
    theme:'plain',styles:{fontSize:10,cellPadding:3.2,textColor:GR},
    headStyles:{fillColor:NA,textColor:255,fontStyle:'bold'},
    alternateRowStyles:{fillColor:[252,248,244]},
    columnStyles:{1:{halign:'right',cellWidth:38}}});
  y=doc.lastAutoTable.finalY+6;

  // Totales
  const bx=W-M-78;
  doc.setFillColor(...CL);doc.roundedRect(bx,y,78,r.saldo>0?30:22,3,3,'F');
  doc.setFontSize(10);doc.setTextColor(...GR);doc.setFont('helvetica','normal');
  doc.text('Total',bx+5,y+8);doc.text(formatBs(r.total),bx+73,y+8,{align:'right'});
  doc.text('Adelanto',bx+5,y+15);doc.text(formatBs(r.adelanto),bx+73,y+15,{align:'right'});
  if(r.saldo>0){doc.setFillColor(...NA);doc.roundedRect(bx,y+19,78,11,3,3,'F');
    doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(11);
    doc.text('SALDO',bx+5,y+26.4);doc.text(formatBs(r.saldo),bx+73,y+26.4,{align:'right'});}
  else{doc.setTextColor(34,160,80);doc.setFont('helvetica','bold');doc.text('PAGADO',bx+73,y+21,{align:'right'});}

  // QR del recibo en línea
  const qr=qrData(linkRecibo(r));
  if(qr){doc.addImage(qr,'PNG',M,y,24,24);doc.setFontSize(8);doc.setTextColor(...MU);doc.setFont('helvetica','normal');
    doc.text('Escanea para ver',M+28,y+10);doc.text('tu recibo en línea',M+28,y+14.5);}
  y+=38;

  // Fotos
  const fotos=(r.fotos||[]).slice(0,4);
  if(fotos.length){
    if(y>215){doc.addPage();y=20;}
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor(...NA2);doc.text('FOTOS AL INGRESO',M,y);
    const fw=(W-2*M-3*4)/4;
    fotos.forEach((f,i)=>{try{doc.addImage(f,'JPEG',M+i*(fw+4),y+4,fw,fw*0.75);}catch{}});
    y+=fw*0.75+12;
  }

  // Pie
  const H=297;
  doc.setDrawColor(...NA);doc.setLineWidth(0.6);doc.line(M,H-22,W-M,H-22);
  doc.setFont('helvetica','normal');doc.setFontSize(7.5);doc.setTextColor(...MU);
  doc.text('Conserve este recibo para retirar su equipo. Pasados 30 días sin recoger, el taller no se responsabiliza por el equipo.',W/2,H-16,{align:'center'});
  doc.setFont('helvetica','bold');doc.setTextColor(...NA2);
  doc.text(`${CONFIG.nombreTienda}  ·  ${CONFIG.web}`,W/2,H-11,{align:'center'});
  return doc;
}

$('btnPdf')?.addEventListener('click',async()=>{
  const r=window._ultimoRecibo; if(!r||!window.jspdf) return toast('PDF no disponible','error');
  const b=$('btnPdf'); b.disabled=true; haptic(15);
  try{(await crearPdf(r)).save(`${r.numeroRecibo}.pdf`);}catch(e){console.error(e);toast('No se pudo crear el PDF','error');}
  b.disabled=false;
});
