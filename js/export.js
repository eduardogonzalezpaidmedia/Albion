/* Silver Master — exportación CSV / JSON (Excel queda preparado: el CSV abre en Excel). */
(function (root) {
  const SM = root.SM = root.SM || {};
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toCSV(rows, cols) {
    const esc = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [cols.map(c => esc(c.label)).join(';'), ...rows.map(r => cols.map(c => esc(c.get(r))).join(';'))].join('\n');
  }
  SM.export = {
    csv: (name, rows, cols) => download(name, toCSV(rows, cols), 'text/csv;charset=utf-8'),
    json: (name, obj) => download(name, JSON.stringify(obj, null, 2), 'application/json'),
    toCSV
  };
})(typeof window !== 'undefined' ? window : globalThis);
