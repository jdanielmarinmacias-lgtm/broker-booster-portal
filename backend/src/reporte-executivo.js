'use strict';
/* ------------------------------------------------------------------
 * Reporte Ejecutivo PDF server-side (jsPDF + jspdf-autotable).
 * Espejo del reporte del Dashboard (portal-modular)/ pero generado en el
 * servidor para el envío programado por correo (cron semanal).
 * Entrada: { users, ventas, clientes, solicitudes, cotizaciones, settings }
 * Salida:  Buffer (PDF A4) + resumen de KPIs para el cuerpo del correo.
 * ------------------------------------------------------------------ */
const { jsPDF } = require('jspdf');
require('jspdf-autotable');

const ROL_DIRECCION = ['admin', 'gm', 'maestro', 'agencia'];
const TASA = { vida: 0.30, gmm: 0.18, autos: 0.12 };

function tasaRamo(ramo) {
  const r = String(ramo || '').toUpperCase();
  if (r.includes('VIDA') || r.includes('INVERSI')) return TASA.vida;
  if (r.includes('GMM')) return TASA.gmm;
  if (r.includes('AUTO')) return TASA.autos;
  return 0.15;
}

/* Los destinatarios "directivos": dirección con email registrado.
 * El export puede reemplazarlos con REPORT_RECIPIENTS (csv). */
function destinatarios(users, overrideCsv) {
  if (overrideCsv && overrideCsv.trim()) {
    return overrideCsv.split(',').map((e) => e.trim()).filter((e) => /.+@.+\..+/.test(e))
      .map((email) => ({ id: null, name: email, email }));
  }
  return (users || []).filter((u) => ROL_DIRECCION.includes(normRole(u)) && u.email && /.+@.+\..+/.test(u.email))
    .map((u) => ({ id: u.id, name: u.name || u.nombre || u.email, email: u.email }));
}
function normRole(u) { return String((u && u.role) || '').toLowerCase(); }

function construir(data) {
  const users = Array.isArray(data.users) ? data.users : [];
  const ventas = Array.isArray(data.ventas) ? data.ventas : [];
  const clientes = Array.isArray(data.clientes) ? data.clientes : [];
  const solicitudes = Array.isArray(data.solicitudes) ? data.solicitudes : [];
  const cotizaciones = Array.isArray(data.cotizaciones) ? data.cotizaciones : [];
  const s = data.settings || {};
  const primary = s.primaryColor || '#0a2540';
  const LogoRGB = hexToRgb(primary);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();

  // --- Primes y comisiones ---
  const primaTotal = ventas.reduce((t, v) => t + num(v.prima), 0);
  const primaMes = ventas.filter((v) => { const d = fecha(v); return d.getMonth() === mesActual && d.getFullYear() === anioActual; }).reduce((t, v) => t + num(v.prima), 0);
  const primaCartera = clientes.reduce((t, c) => t + num(c.primaTotal || c.primaNeta), 0);
  const comisionVentas = ventas.reduce((t, v) => t + num(v.prima) * tasaRamo(v.ramo), 0);
  const comisionConciliada = clientes.filter((c) => c.fechaCobranza || (c.recibosConciliados || 0) > 0)
    .reduce((t, c) => t + num(c.primaNeta || c.primaTotal) * tasaRamo(c.ramo), 0);

  // --- Renovaciones (motor 60/30/15, útil sin SmartCode) ---
  const vigenciaFin = (c) => {
    const ancla = c.fechaEmision ? fecha(c) : (c.fechaCobranza ? new Date(c.fechaCobranza) : (c.fecha ? new Date(c.fecha) : null));
    if (!ancla || isNaN(ancla)) return null;
    const fin = new Date(ancla.getTime()); fin.setHours(0, 0, 0, 0); fin.setMonth(fin.getMonth() + 12);
    return fin;
  };
  const ren = clientes.map((c) => {
    const fin = vigenciaFin(c); const dias = fin ? Math.round((fin.getTime() - hoy.getTime()) / 86400000) : 999;
    return { c, fin, dias, vigente: dias >= 0 };
  });
  const ren15 = ren.filter((x) => x.vigente && x.dias <= 15);
  const ren30 = ren.filter((x) => x.vigente && x.dias > 15 && x.dias <= 30);
  const ren60 = ren.filter((x) => x.vigente && x.dias > 30 && x.dias <= 60);
  const primaRenovables = [...ren15, ...ren30, ...ren60].reduce((t, x) => t + num(x.c.primaTotal || x.c.primaNeta), 0);

  // --- Embudo ---
  const nSols = solicitudes.length, nCots = cotizaciones.length;
  const enProceso = cotizaciones.filter((c) => String(c.estado || '').toLowerCase() === 'enviada' || String(c.estado || '').toLowerCase() === 'cotizando' || String(c.estado || '').toLowerCase() === 'nueva').length;
  const emitidas = cotizaciones.filter((c) => ['emitida', 'pagada', 'cerrada'].includes(String(c.estado || '').toLowerCase())).length;
  const tasaSolCot = nSols > 0 ? Math.round((nCots / nSols) * 100) : (nCots > 0 ? 100 : 0);
  const tasaCotVenta = nCots > 0 ? Math.round((emitidas / nCots) * 100) : 0;

  // --- Serie por mes (13 pts = 12 meses + proyección a partir del promedio) ---
  const serie = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(anioActual, mesActual - i, 1);
    serie.push({ label: fmtMes(d), y: d.getFullYear(), m: d.getMonth(), total: 0 });
  }
  ventas.forEach((v) => {
    const d = fecha(v);
    const diff = (anioActual - d.getFullYear()) * 12 + (mesActual - d.getMonth());
    if (diff >= 0 && diff < 12) serie[11 - diff].total += num(v.prima);
  });

  // --- Ramo/producción ---
  const ramos = {};
  ventas.forEach((v) => { const r = String(v.ramo || 'Otro').toUpperCase(); ramos[r] = ramos[r] || { n: 0, prima: 0, com: 0 }; ramos[r].n++; ramos[r].prima += num(v.prima); ramos[r].com += num(v.prima) * tasaRamo(v.ramo); });

  const resumen = {
    generados: hoy.toISOString(),
    primas: { total: primaTotal, mes: primaMes, cartera: primaCartera },
    comisiones: { ventas: comisionVentas, conciliadas: comisionConciliada },
    renovaciones: { u15: ren15.length, d16a30: ren30.length, d31a60: ren60.length, primaRenovables },
    embudo: { solicitudes: nSols, cotizaciones: nCots, enProceso, emitidas, tasaSolCot, tasaCotVenta },
    serie,
    destinatarios: destinatarios(users).length,
  };

  // ================= PDF =================
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  doc.setFillColor(LogoRGB.r, LogoRGB.g, LogoRGB.b);
  doc.rect(0, 0, W, 92, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20); doc.setFont(undefined, 'bold');
  doc.text(s.institutionName || 'Portal Ejecutivo', 40, 40);
  doc.setFontSize(11); doc.setFont(undefined, 'normal');
  doc.text('Reporte Ejecutivo Semanal · Primas, Comisiones, Renovaciones y Embudo', 40, 58);
  doc.setFontSize(9);
  doc.text('Semana al ' + hoy.toLocaleDateString('es-MX') + '  ·  Ámbito: toda la organización', 40, 76);

  let y = 118;
  doc.setTextColor(LogoRGB.r, LogoRGB.g, LogoRGB.b); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text('1 · Primas y Comisiones', 40, y); y += 12;
  doc.autoTable({
    startY: y,
    head: [['Concepto', 'Valor']],
    body: [
      ['Primas facturadas (ventas registradas)', fmt(primaTotal)],
      ['Primas en el mes en curso', fmt(primaMes)],
      ['Prima anual acumulada en cartera', fmt(primaCartera)],
      ['Ventas registradas', String(ventas.length)],
      ['Comisiones estimadas por ramo', fmt(comisionVentas)],
      ['Comisiones conciliadas / cobradas', fmt(comisionConciliada)],
      ['Comisión promedio ponderada', ventas.length ? Math.round((comisionVentas / Math.max(primaTotal, 1)) * 100) + '%' : '—'],
    ],
    theme: 'grid', headStyles: { fillColor: [LogoRGB.r, LogoRGB.g, LogoRGB.b], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 }, columnStyles: { 1: { halign: 'right' } },
  });

  let y2 = doc.lastAutoTable.finalY + 22;
  doc.setTextColor(LogoRGB.r, LogoRGB.g, LogoRGB.b); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text('2 · Renovaciones por Vencer', 40, y2); y2 += 12;
  doc.autoTable({
    startY: y2,
    head: [['Horizonte', 'Pólizas', 'Prima anual en riesgo', 'Acción']],
    body: [
      ['Urgentes (≤ 15 días)', String(ren15.length), fmt(ren15.reduce((t, x) => t + num(x.c.primaTotal || x.c.primaNeta), 0)), 'Contactar hoy'],
      ['Próximas (16–30 días)', String(ren30.length), fmt(ren30.reduce((t, x) => t + num(x.c.primaTotal || x.c.primaNeta), 0)), 'Propuesta de renovación'],
      ['Preventivas (31–60 días)', String(ren60.length), fmt(ren60.reduce((t, x) => t + num(x.c.primaTotal || x.c.primaNeta), 0)), 'Seguimiento preventivo'],
      ['Total renovable a 60 días', String(ren15.length + ren30.length + ren60.length), fmt(primaRenovables), '—'],
    ],
    theme: 'grid', headStyles: { fillColor: [LogoRGB.r, LogoRGB.g, LogoRGB.b], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'center' } },
  });

  let y3 = doc.lastAutoTable.finalY + 22;
  doc.setTextColor(LogoRGB.r, LogoRGB.g, LogoRGB.b); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text('3 · Embudo Comercial', 40, y3); y3 += 12;
  doc.autoTable({
    startY: y3,
    head: [['Etapa', 'Casos', 'Tasa hacia la etapa siguiente']],
    body: [
      ['Solicitudes / Prospectos (web)', String(nSols), tasaSolCot + '%'],
      ['Cotizaciones recibidas', String(nCots), nCots > 0 ? Math.round((enProceso / nCots) * 100) + '%' : '0%'],
      ['En cotización / propuesta enviada', String(enProceso), nCots > 0 ? Math.round((emitidas / nCots) * 100) + '%' : '0%'],
      ['Pólizas / ventas emitidas', String(emitidas), 'Cierre: ' + tasaCotVenta + '%'],
    ],
    theme: 'grid', headStyles: { fillColor: [LogoRGB.r, LogoRGB.g, LogoRGB.b], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
  });

  // --- 4 · Tendencia (barras vectoriales: ligera y nítida) ---
  let y4 = doc.lastAutoTable.finalY + 22;
  doc.setFontSize(13);
  doc.text('4 · Tendencia de Primas por Mes (12 meses)', 40, y4); y4 += 14;
  const activ = serie.reduce((t, x) => t + x.total, 0);
  if (activ > 0) {
    const chartX = 40, chartW = W - 80, chartH = Math.min(190, H - 60 - y4);
    const maxY = Math.max(...serie.map((x) => x.total), 1) * 1.12;
    const bw = chartW / 12, labelY = y4 + chartH + 12;
    serie.forEach((x, i) => {
      const bh = x.total > 0 ? Math.max(3, Math.round((x.total / maxY) * chartH)) : 2;
      const bx = chartX + i * bw + 3;
      doc.setFillColor(30, 64, 175); doc.rect(bx, y4 + chartH - bh, bw - 6, bh, 'F');
      doc.setTextColor(51, 65, 85); doc.setFontSize(9); doc.setFont(undefined, 'normal');
      doc.text(x.label, chartX + i * bw + bw / 2, labelY, { align: 'center' });
    });
    doc.setTextColor(100, 116, 139); doc.setFontSize(8);
    doc.text('Total ' + fmt(activ), W - 40, y4 - 2, { align: 'right' });
    doc.lastAutoTable = { finalY: labelY + 8 };
  } else {
    doc.setFontSize(10); doc.setFont(undefined, 'normal'); doc.setTextColor(71, 85, 105);
    doc.text('Sin ventas registradas en los últimos 12 meses.', 40, y4 + 6);
    doc.lastAutoTable = { finalY: y4 + 14 };
  }

  // --- 5 · Producción por ramo ---
  const y5 = doc.lastAutoTable.finalY + 22;
  doc.setTextColor(LogoRGB.r, LogoRGB.g, LogoRGB.b); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text('5 · Producción por Ramo', 40, y5);
  const bodyR = Object.keys(ramos).sort((a, b) => ramos[b].prima - ramos[a].prima).map((r) => [r, String(ramos[r].n), fmt(ramos[r].prima), fmt(ramos[r].com)]);
  if (bodyR.length) bodyR.push(['TOTAL', String(ventas.length), fmt(primaTotal), fmt(comisionVentas)]);
  doc.autoTable({
    startY: y5 + 14,
    head: [['Ramo', 'Ventas', 'Prima', 'Comisión estimada']],
    body: bodyR.length ? bodyR : [['Sin ventas registradas', '0', '$0', '$0']],
    theme: 'grid', headStyles: { fillColor: 30, textColor: 20, fontSize: 10 }, // accent
    bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 }, columnStyles: { 1: { halign: 'center' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  // --- 6 · Agenda de renovaciones (detalle máx. 12) ---
  const renTop = [...ren15, ...ren30, ...ren60].sort((a, b) => a.dias - b.dias).slice(0, 12);
  const y6 = doc.lastAutoTable.finalY + 22;
  doc.setTextColor(LogoRGB.r, LogoRGB.g, LogoRGB.b); doc.setFontSize(13); doc.setFont(undefined, 'bold');
  doc.text('6 · Agenda de Renovación (próximas 12)', 40, y6);
  doc.autoTable({
    startY: y6 + 14,
    head: [['Cliente', 'Compañía', 'Ramo', 'Aniversario', 'Prima anual']],
    body: renTop.length ? renTop.map((x) => {
      const f = x.fin && !isNaN(x.fin) ? x.fin.toLocaleDateString('es-MX') : '—';
      return [String(x.c.nombre || '—'), String(x.c.compania || '—'), String(x.c.ramo || '—'), f + ' (en ' + x.dias + 'd)', fmt(num(x.c.primaTotal || x.c.primaNeta))];
    }) : [['Sin renovaciones próximas', '—', '—', '—', '—']],
    theme: 'grid', headStyles: { fillColor: [LogoRGB.r, LogoRGB.g, LogoRGB.b], textColor: 255, fontSize: 10 },
    bodyStyles: { fontSize: 9 }, alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 }, columnStyles: { 4: { halign: 'right' } },
  });

  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(150);
    doc.text(s.footerText || 'Documento interno — uso ejecutivo', 40, H - 24);
    doc.text('Página ' + i + ' de ' + total, W - 40, H - 24, { align: 'right' });
  }

  return { buffer: Buffer.from(doc.output('arraybuffer')), pages: total, resumen };
}

/* Utilidades */
function num(x) { const n = Number(x || 0); return isNaN(n) ? 0 : n; }
function fecha(v) { const d = new Date(v.fecha || v.ts || 0); return isNaN(d) ? new Date(0) : d; }
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function fmtMes(d) { return MESES[d.getMonth()] + ' ' + String(d.getFullYear()).slice(-2); }
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return { r: 10, g: 37, b: 64 };
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}

module.exports = { construir, destinatarios, ROL_DIRECCION };
