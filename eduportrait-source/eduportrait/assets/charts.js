/* =============================================================================
 * charts.js —— 手写 SVG 图表库（零依赖、无构建、离线可用）
 * 全部函数返回 SVG 字符串，直接 innerHTML 到容器即可。
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});

  var C = {
    ink: '#1f2933', sub: '#52606d', grid: '#e4e7eb', axis: '#9aa5b1',
    blue: '#2b6cb0', blueL: '#bee3f8', red: '#c53030', orange: '#dd6b20',
    green: '#2f855a', purple: '#6b46c1', teal: '#319795', gray: '#a0aec0',
    yellow: '#d69e2e', pink: '#d53f8c'
  };
  var PALETTE = [C.blue, C.teal, C.green, C.orange, C.purple, C.red, C.yellow, C.pink, C.gray];

  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function t(x, y, s, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" fill="' + (o.fill || C.sub) + '" font-size="' +
      (o.size || 11) + '" text-anchor="' + (o.anchor || 'start') + '"' +
      (o.weight ? ' font-weight="' + o.weight + '"' : '') +
      (o.rotate ? ' transform="rotate(' + o.rotate + ' ' + x + ' ' + y + ')"' : '') + '>' + esc(s) + '</text>';
  }
  function rect(x, y, w, h, fill, extra) {
    return '<rect x="' + x + '" y="' + y + '" width="' + Math.max(0, w) + '" height="' + Math.max(0, h) +
      '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function line(x1, y1, x2, y2, stroke, w) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
      '" stroke="' + (stroke || C.grid) + '" stroke-width="' + (w || 1) + '"/>';
  }
  function open(w, h) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" xmlns="http://www.w3.org/2000/svg" ' +
      'font-family="system-ui,-apple-system,\'Segoe UI\',\'Noto Sans SC\',sans-serif">';
  }
  function tip(s) { return '<title>' + esc(s) + '</title>'; }
  function fmt(v) { return (Math.round(v * 1000) / 1000).toFixed(v % 1 === 0 ? 0 : 2); }

  /** 线性色阶：t∈[0,1] → 颜色 */
  function ramp(t, kind) {
    var stops = kind === 'red'
      ? [[255, 255, 255], [254, 235, 200], [246, 173, 85], [197, 48, 48]]
      : [[247, 251, 255], [190, 227, 248], [66, 153, 225], [43, 108, 176]];
    t = Math.max(0, Math.min(1, t));
    var seg = (stops.length - 1) * t, i = Math.min(stops.length - 2, Math.floor(seg)), f = seg - i;
    var a = stops[i], b = stops[i + 1];
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')';
  }

  /* =================================================== 1. 克利夫兰点图 */
  /** rows: [{label, value, target}]  value 0-100 */
  function cleveland(rows, o) {
    o = o || {};
    var w = o.width || 680, padL = o.padL || 132, padR = 44, padT = 26, rowH = 34;
    var h = padT + rows.length * rowH + 34;
    var x0 = padL, x1 = w - padR;
    var s = open(w, h);
    s += t(x0, 16, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    [0, 20, 40, 60, 80, 100].forEach(function (v) {
      var x = x0 + (x1 - x0) * v / 100;
      s += line(x, padT - 4, x, h - 30, C.grid);
      s += t(x, h - 16, v, { size: 10, anchor: 'middle' });
    });
    if (o.target !== undefined) {
      var xt = x0 + (x1 - x0) * o.target / 100;
      s += '<line x1="' + xt + '" y1="' + (padT - 8) + '" x2="' + xt + '" y2="' + (h - 28) +
        '" stroke="' + C.red + '" stroke-width="1.4" stroke-dasharray="4 3"/>';
      s += t(xt + 3, padT - 12, '达标线 ' + o.target, { size: 10, fill: C.red });
    }
    rows.forEach(function (r, i) {
      var y = padT + i * rowH + rowH / 2;
      var xv = x0 + (x1 - x0) * Math.max(0, Math.min(100, r.value)) / 100;
      s += t(x0 - 10, y + 4, r.label, { size: 12, anchor: 'end', fill: C.ink });
      s += line(x0, y, x1, y, C.grid);
      var ok = r.target === undefined || r.value >= r.target;
      var col = ok ? C.blue : C.red;
      s += line(x0, y, xv, y, ok ? C.blueL : '#fed7d7', 6);
      s += '<circle cx="' + xv + '" cy="' + y + '" r="6" fill="' + col + '" stroke="#fff" stroke-width="1.6">' +
        tip(r.label + '：' + fmt(r.value)) + '</circle>';
      s += t(xv + 11, y + 4, fmt(r.value) + (r.unit || ''), { size: 11.5, fill: col, weight: 600 });
      if (!ok) s += t(x1 + 2, y + 4, '未达标', { size: 10, fill: C.red });
      else if (o.showOk !== false) s += t(x1 + 2, y + 4, '达标', { size: 10, fill: C.green });
    });
    return s + '</svg>';
  }

  /* =================================================== 2. 热力图 */
  /** mat: 二维数值; rowLabels, colLabels */
  function heatmap(mat, rowLabels, colLabels, o) {
    o = o || {};
    var w = o.width || 680, padL = o.padL || 118, padT = 60, cellH = o.cellH || 30;
    var padB = 34, padR = 60;
    var n = mat.length || 1, m = (mat[0] || []).length || 1;
    var cellW = Math.min(o.cellW || 74, (w - padL - padR) / m);
    var h = padT + n * cellH + padB;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    if (o.subtitle) s += t(padL, 34, o.subtitle, { size: 10.5 });
    var max = 0;
    mat.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    if (!max) max = 1;
    colLabels.forEach(function (c, j) {
      s += t(padL + j * cellW + cellW / 2, padT - 6, c, { size: 10.5, anchor: 'middle', fill: C.ink });
    });
    mat.forEach(function (row, i) {
      s += t(padL - 8, padT + i * cellH + cellH / 2 + 4, rowLabels[i], { size: 11, anchor: 'end', fill: C.ink });
      row.forEach(function (v, j) {
        var x = padL + j * cellW, y = padT + i * cellH;
        s += rect(x, y, cellW - 2, cellH - 2, ramp(v / max, o.kind || 'blue'), ' rx="2"') ;
        s += '<g>' + tip(rowLabels[i] + ' × ' + colLabels[j] + '：' + fmt(v)) + '</g>';
        if (o.showValue !== false) {
          s += t(x + (cellW - 2) / 2, y + cellH / 2 + 3, fmt(v),
            { size: 10, anchor: 'middle', fill: v / max > 0.55 ? '#fff' : C.ink });
        }
      });
    });
    // 图例
    var lx = padL, ly = h - 22, lw = Math.min(200, w - padL - padR);
    for (var k = 0; k < 40; k++) {
      s += rect(lx + k * (lw / 40), ly, lw / 40 + 1, 9, ramp(k / 39, o.kind || 'blue'));
    }
    s += t(lx, ly - 4, '0', { size: 9.5 });
    s += t(lx + lw, ly - 4, fmt(max) + (o.unit || ''), { size: 9.5, anchor: 'middle' });
    return s + '</svg>';
  }

  /* =================================================== 3. 堆叠条 */
  /** rows: [{label, parts:[{name,value,color}]}] */
  function stackedBar(rows, seriesNames, o) {
    o = o || {};
    var w = o.width || 680, padL = o.padL || 118, padR = 120, padT = 44, barH = 30, gap = 12;
    var h = padT + rows.length * (barH + gap) + 40;
    var x0 = padL, x1 = w - padR;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    // 图例
    var lx = padL;
    seriesNames.forEach(function (n, i) {
      s += rect(lx, 28, 10, 10, PALETTE[i % PALETTE.length], ' rx="2"');
      s += t(lx + 14, 37, n, { size: 10.5 });
      lx += 20 + n.length * 11;
    });
    var max = 0;
    rows.forEach(function (r) {
      var t2 = r.parts.reduce(function (a, b) { return a + b.value; }, 0);
      if (o.mode === 'percent') r._total = t2 || 1; else if (t2 > max) max = t2;
    });
    if (o.mode === 'percent') max = 1;
    rows.forEach(function (r, i) {
      var y = padT + i * (barH + gap);
      s += t(padL - 8, y + barH / 2 + 4, r.label, { size: 11.5, anchor: 'end', fill: C.ink });
      var acc = 0;
      r.parts.forEach(function (p, j) {
        var v = o.mode === 'percent' ? p.value / r._total : p.value;
        var bw = (x1 - x0) * v / max;
        s += rect(x0 + acc, y, bw, barH, p.color || PALETTE[j % PALETTE.length], ' rx="2"') +
          '';
        s += '<g>' + tip(r.label + ' · ' + (p.name || seriesNames[j]) + '：' + fmt(p.value) +
          (o.mode === 'percent' ? '（' + Math.round(v * 100) + '%）' : '')) + '</g>';
        if (bw > 26) {
          s += t(x0 + acc + bw / 2, y + barH / 2 + 4,
            o.mode === 'percent' ? Math.round(v * 100) + '%' : fmt(p.value),
            { size: 10, anchor: 'middle', fill: '#fff', weight: 600 });
        }
        acc += bw;
      });
      s += t(x0 + acc + 8, y + barH / 2 + 4, o.mode === 'percent' ? '' : fmt(r.parts.reduce(function (a, b) { return a + b.value; }, 0)), { size: 10.5, fill: C.sub });
    });
    return s + '</svg>';
  }

  /* =================================================== 4. 环形图 */
  function donut(parts, o) {
    o = o || {};
    var w = o.width || 300, h = o.height || 240, cx = w / 2, cy = h / 2 + 4;
    var R = o.R || 82, r = o.r || 48;
    var total = parts.reduce(function (a, b) { return a + Math.abs(b.value); }, 0) || 1;
    var s = open(w, h);
    s += t(cx, 16, o.title || '', { size: 12, weight: 600, anchor: 'middle', fill: C.ink });
    var ang = -Math.PI / 2;
    parts.forEach(function (p, i) {
      var frac = Math.abs(p.value) / total;
      var a2 = ang + frac * Math.PI * 2;
      var large = frac > 0.5 ? 1 : 0;
      var x1 = cx + R * Math.cos(ang), y1 = cy + R * Math.sin(ang);
      var x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
      var x3 = cx + r * Math.cos(a2), y3 = cy + r * Math.sin(a2);
      var x4 = cx + r * Math.cos(ang), y4 = cy + r * Math.sin(ang);
      var d = 'M' + x1 + ' ' + y1 + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 +
        ' L' + x3 + ' ' + y3 + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + x4 + ' ' + y4 + ' Z';
      s += '<path d="' + d + '" fill="' + (p.color || PALETTE[i % PALETTE.length]) + '" stroke="#fff" stroke-width="1.5">' +
        tip(p.name + '：' + fmt(p.value) + '（' + Math.round(frac * 100) + '%）') + '</path>';
      var mid = (ang + a2) / 2;
      if (frac > 0.06) {
        s += t(cx + (R + 16) * Math.cos(mid), cy + (R + 16) * Math.sin(mid) + 3,
          Math.round(frac * 100) + '%', { size: 10, anchor: 'middle', fill: C.sub });
      }
      ang = a2;
    });
    s += t(cx, cy + 3, o.centerValue !== undefined ? fmt(o.centerValue) : '', { size: 17, weight: 700, anchor: 'middle', fill: C.ink });
    s += t(cx, cy + 19, o.centerLabel || '', { size: 10, anchor: 'middle' });
    var ly = h - 12, lxx = 8;
    parts.forEach(function (p, i) {
      s += rect(lxx, ly - 8, 9, 9, p.color || PALETTE[i % PALETTE.length], ' rx="2"');
      s += t(lxx + 13, ly, p.name, { size: 10 });
      lxx += 18 + p.name.length * 10.5;
      if (lxx > w - 60) { lxx = 8; ly += 16; }
    });
    return s + '</svg>';
  }

  /* =================================================== 5. 水平条形图 */
  function hbar(rows, o) {
    o = o || {};
    var w = o.width || 680, padL = o.padL || 130, padR = 56, padT = 34, barH = 22, gap = 9;
    var h = padT + rows.length * (barH + gap) + 26;
    var x0 = padL, x1 = w - padR;
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    rows.forEach(function (r, i) {
      var y = padT + i * (barH + gap);
      s += t(padL - 8, y + barH / 2 + 4, r.label, { size: 11.5, anchor: 'end', fill: C.ink });
      var bw = (x1 - x0) * r.value / max;
      s += rect(x0, y, bw, barH, r.color || C.blue, ' rx="2"') ;
      s += '<g>' + tip(r.label + '：' + fmt(r.value) + (o.unit || '')) + '</g>';
      s += t(x0 + bw + 7, y + barH / 2 + 4, fmt(r.value) + (o.unit || ''), { size: 10.5, fill: C.sub });
    });
    s += line(x0, padT - 6, x0, h - 20, C.axis);
    return s + '</svg>';
  }

  /* =================================================== 6. 棒棒糖图 */
  function lollipop(rows, o) {
    o = o || {};
    var w = o.width || 680, padL = o.padL || 132, padR = 46, padT = 34, rowH = 30;
    var h = padT + rows.length * rowH + 30;
    var x0 = padL, x1 = w - padR;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      var x = x0 + (x1 - x0) * v;
      s += line(x, padT - 4, x, h - 22, C.grid);
      s += t(x, h - 8, Math.round(v * 100) + '%', { size: 9.5, anchor: 'middle' });
    });
    rows.forEach(function (r, i) {
      var y = padT + i * rowH + rowH / 2;
      var xv = x0 + (x1 - x0) * Math.max(0, Math.min(1, r.value));
      s += t(padL - 8, y + 4, r.label, { size: 11.5, anchor: 'end', fill: C.ink });
      var col = r.color || (r.value >= 0.6 ? C.green : (r.value >= 0.4 ? C.orange : C.red));
      s += line(x0, y, xv, y, C.gray, 2);
      s += '<circle cx="' + xv + '" cy="' + y + '" r="6.5" fill="' + col + '" stroke="#fff" stroke-width="1.5">' +
        tip(r.label + '：' + Math.round(r.value * 100) + '%') + '</circle>';
      s += t(xv + 10, y + 4, Math.round(r.value * 100) + '%', { size: 11, fill: col, weight: 600 });
      if (r.note) s += t(x1, y + 4, r.note, { size: 9.5, anchor: 'end', fill: C.sub });
    });
    return s + '</svg>';
  }

  /* =================================================== 7. 斜率图 */
  function slope(rows, o) {
    o = o || {};
    var w = o.width || 680, padL = o.padL || 128, padR = 78, padT = 40, rowH = 0;
    var h = o.height || 420;
    var x0 = padL, x1 = w - padR;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    s += t(x0, 34, o.leftLabel || '课前', { size: 11, anchor: 'middle', fill: C.ink, weight: 600 });
    s += t(x1, 34, o.rightLabel || '课后', { size: 11, anchor: 'middle', fill: C.ink, weight: 600 });
    var yTop = 52, yBot = h - 34;
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      var y = yBot - (yBot - yTop) * v;
      s += line(x0 - 6, y, x1 + 6, y, C.grid);
      s += t(x0 - 12, y + 3, Math.round(v * 100) + '%', { size: 9.5, anchor: 'end' });
    });
    var step = (yBot - yTop) / Math.max(1, rows.length - 1);
    rows.forEach(function (r, i) {
      var ya = yBot - (yBot - yTop) * r.from, yb = yBot - (yBot - yTop) * r.to;
      s += t(padL - 14, yTop + i * step + 4, r.label, { size: 10.5, anchor: 'end', fill: C.ink });
      var up = r.to >= r.from;
      s += '<line x1="' + x0 + '" y1="' + ya + '" x2="' + x1 + '" y2="' + yb + '" stroke="' +
        (up ? C.green : C.red) + '" stroke-width="2" opacity="0.75"/>';
      s += '<circle cx="' + x0 + '" cy="' + ya + '" r="4.5" fill="' + C.blue + '"><title>' + esc(r.label) +
        ' 课前 ' + Math.round(r.from * 100) + '%</title></circle>';
      s += '<circle cx="' + x1 + '" cy="' + yb + '" r="4.5" fill="' + (up ? C.green : C.red) + '"><title>' +
        esc(r.label) + ' 课后 ' + Math.round(r.to * 100) + '%</title></circle>';
      s += t(x1 + 9, yb + 4, (r.to >= r.from ? '+' : '') + Math.round((r.to - r.from) * 100),
        { size: 10, fill: up ? C.green : C.red, weight: 600 });
    });
    return s + '</svg>';
  }

  /* =================================================== 8. 平行坐标图 */
  function parallel(rows, axes, o) {
    o = o || {};
    var w = o.width || 680, h = o.height || 360, padT = 46, padB = 44, padL = 46, padR = 56;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    var nA = axes.length, yT = padT, yB = h - padB;
    var xs = axes.map(function (_, i) { return padL + (w - padL - padR) * i / (nA - 1 || 1); });
    axes.forEach(function (a, i) {
      s += line(xs[i], yT - 8, xs[i], yB + 6, C.axis);
      s += t(xs[i], yT - 14, a.name, { size: 10.5, anchor: 'middle', fill: C.ink, weight: 600 });
      s += t(xs[i], yB + 20, a.min + ' ~ ' + a.max, { size: 9.5, anchor: 'middle' });
    });
    var maxN = Math.max.apply(null, rows.map(function (r) { return r.values.length; }).concat([1]));
    rows.forEach(function (r) {
      r.values.forEach(function (v) {
        var pts = v.map(function (val, i) {
          var a = axes[i];
          var f = (val - a.min) / ((a.max - a.min) || 1);
          f = Math.max(0, Math.min(1, f));
          return [xs[i], yB - (yB - yT) * f];
        });
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
        s += '<path d="' + d + '" fill="none" stroke="' + r.color + '" stroke-width="1.5" opacity="' +
          (r.highlight ? 0.95 : 0.32) + '">' + tip(r.name) + '</path>';
        pts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2" fill="' + r.color + '" opacity="' + (r.highlight ? 0.9 : 0.3) + '"/>'; });
      });
    });
    return s + '</svg>';
  }

  /* =================================================== 9. FIAS 矩阵 */
  function fiasMatrix(res, o) {
    o = o || {};
    var n = 10, cell = o.cell || 44, padL = 108, padT = 96;
    var w = padL + n * cell + 150, h = padT + n * cell + 40;
    var s = open(w, h);
    s += t(padL, 18, o.title || '改进版 FIAS 互动迁移矩阵（10×10）', { size: 12.5, weight: 600, fill: C.ink });
    s += t(padL, 34, '行 = 前一编码，列 = 后一编码；对角线为持续区，4→8/4→9 为提问—应答链', { size: 10 });
    var max = 0;
    res.matrix.forEach(function (r) { r.forEach(function (v) { if (v > max) max = v; }); });
    if (!max) max = 1;
    res.labels.forEach(function (l, j) {
      s += t(padL + j * cell + cell / 2, padT - 8, l, { size: 9, anchor: 'start', rotate: -45, fill: C.ink });
      s += t(padL - 6, padT + j * cell + cell / 2 + 3, l, { size: 9, anchor: 'end', fill: C.ink });
    });
    res.matrix.forEach(function (row, i) {
      row.forEach(function (v, j) {
        var x = padL + j * cell, y = padT + i * cell;
        var fill = ramp(v / max, 'red');
        var border = (i === j) ? C.blue : 'transparent';
        s += rect(x, y, cell - 2, cell - 2, fill, ' rx="2" stroke="' + border + '" stroke-width="' + (i === j ? 1.4 : 0) + '"');
        s += '<g>' + tip(res.labels[i] + ' → ' + res.labels[j] + '：' + v + ' 次') + '</g>';
        if (v > 0) s += t(x + (cell - 2) / 2, y + cell / 2 + 2, v, { size: 10, anchor: 'middle', fill: v / max > 0.5 ? '#fff' : C.ink });
      });
    });
    // 区域标注
    var x1 = padL, y1 = padT;
    s += '<rect x="' + x1 + '" y="' + (y1 + 3 * cell) + '" width="' + (7 * cell) + '" height="' + (3 * cell) +
      '" fill="none" stroke="' + C.blue + '" stroke-width="1.2" stroke-dasharray="4 3"/>';
    s += t(x1 + 4, y1 + 3 * cell - 4, '直接影响区（讲授/指令/批评）', { size: 9, fill: C.blue });
    s += '<rect x="' + x1 + '" y="' + y1 + '" width="' + (4 * cell) + '" height="' + (3 * cell) +
      '" fill="none" stroke="' + C.green + '" stroke-width="1.2" stroke-dasharray="4 3"/>';
    s += t(x1 + 4, y1 - 6, '间接影响区（接纳/表扬/采纳/提问）', { size: 9, fill: C.green });
    var rx = padL + n * cell + 14;
    var rr = res.ratios;
    var items = [['教师言语比率', rr.teacherTalk], ['学生言语比率', rr.studentTalk],
      ['安静或混乱', rr.quiet], ['I/D 比', rr.ID], ['主动发言率', rr.activeSpeech]];
    s += t(rx, padT + 4, '关键比率', { size: 11, weight: 600, fill: C.ink });
    items.forEach(function (it, i) {
      s += t(rx, padT + 26 + i * 22, it[0], { size: 10 });
      s += t(rx, padT + 42 + i * 22, it[1] === null ? '—' : (typeof it[1] === 'number' ? (it[1] * 100).toFixed(1) + '%' : it[1]), { size: 13, weight: 700, fill: C.ink });
    });
    return s + '</svg>';
  }

  /* =================================================== 10. 时序条带 */
  function timeline(codes, o) {
    o = o || {};
    var w = o.width || 680, h = o.height || 96, padL = 76, padT = 30;
    var cell = Math.min(10, (w - padL - 20) / codes.length);
    var s = open(w, h);
    s += t(padL, 16, o.title || '课堂互动时序（每格 3 秒）', { size: 12.5, weight: 600, fill: C.ink });
    var colors = {
      1: '#90cdf4', 2: '#9ae6b4', 3: '#b794f4', 4: '#f6ad55', 5: '#fc8181',
      6: '#f6e05e', 7: '#e53e3e', 8: '#63b3ed', 9: '#38a169', 10: '#cbd5e0'
    };
    codes.forEach(function (c, i) {
      var x = padL + i * cell, y = padT;
      s += rect(x, y, cell - 1, 34, colors[c] || C.gray, ' rx="1"');
      s += '<g>' + tip('第 ' + (i * 3) + 's：' + c + ' 类') + '</g>';
    });
    s += t(padL - 6, padT + 22, '编码', { size: 10, anchor: 'end', fill: C.ink });
    var lx = padL, ly = h - 12;
    [[1, '接纳情感'], [2, '表扬'], [3, '采纳观点'], [4, '提问'], [5, '讲授'], [6, '指令'],
     [7, '批评'], [8, '被动应答'], [9, '主动发言'], [10, '沉默']].forEach(function (p) {
      s += rect(lx, ly - 8, 9, 9, colors[p[0]], ' rx="1"');
      s += t(lx + 12, ly, p[1], { size: 9 });
      lx += 22 + p[1].length * 9.5;
    });
    return s + '</svg>';
  }

  /* =================================================== 11. 社会网络拓扑 */
  function network(res, o) {
    o = o || {};
    var w = o.width || 460, h = o.height || 420, cx = w / 2, cy = h / 2 + 6, R = o.R || 150;
    var nodes = res.nodes.filter(function (n) { return n.id !== 'T'; });
    var teacher = res.nodes.filter(function (n) { return n.id === 'T'; })[0];
    var s = open(w, h);
    s += t(cx, 16, o.title || '师生互动网络拓扑', { size: 12.5, weight: 600, anchor: 'middle', fill: C.ink });
    var pos = {};
    pos['T'] = [cx, cy];
    nodes.forEach(function (n, i) {
      var a = -Math.PI / 2 + i * 2 * Math.PI / nodes.length;
      pos[n.id] = [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
    res.edges.forEach(function (e) {
      var p1 = pos[e.from], p2 = pos[e.to];
      if (!p1 || !p2) return;
      var wgt = Math.min(3.2, 0.6 + (e.weight || 1) * 0.5);
      var mx = (p1[0] + p2[0]) / 2, my = (p1[1] + p2[1]) / 2;
      var dx = my - cy, dy = -(mx - cx), len = Math.sqrt(dx * dx + dy * dy) || 1;
      var qx = mx + dx / len * 22, qy = my + dy / len * 22;
      s += '<path d="M' + p1[0] + ' ' + p1[1] + ' Q' + qx + ' ' + qy + ' ' + p2[0] + ' ' + p2[1] +
        '" fill="none" stroke="' + C.gray + '" stroke-width="' + wgt + '" opacity="0.5"/>';
    });
    nodes.forEach(function (n) {
      var p = pos[n.id];
      var marginal = res.marginal.indexOf(n.id) >= 0;
      var rr = 3.5 + 7 * n.centrality;
      s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + rr + '" fill="' +
        (marginal ? '#cbd5e0' : C.blue) + '" stroke="' + (marginal ? C.red : '#fff') +
        '" stroke-width="' + (marginal ? 1.4 : 1.2) + '" stroke-dasharray="' + (marginal ? '3 2' : '0') + '">' +
        tip(n.id + '｜中心度 ' + n.centrality + (marginal ? '（边缘参与者）' : '')) + '</circle>';
      s += t(p[0], p[1] - rr - 3, n.id, { size: 8, anchor: 'middle', fill: marginal ? C.red : C.sub });
    });
    if (teacher) {
      s += '<circle cx="' + cx + '" cy="' + cy + '" r="13" fill="' + C.orange + '" stroke="#fff" stroke-width="2">' +
        tip('教师 T') + '</circle>';
      s += t(cx, cy + 4, 'T', { size: 11, anchor: 'middle', fill: '#fff', weight: 700 });
    }
    s += t(cx, h - 26, '网络密度 ' + res.density + '｜平均度 ' + res.avgDeg + '｜节点 ' + res.nodeCount, { size: 10, anchor: 'middle' });
    s += t(cx, h - 10, '灰色虚线圈 = 边缘参与者（交互量 < 学生中位数 ' + res.medianDeg + ' 的 ' + Math.round(res.marginalRatio * 100) + '%）：' + (res.marginal.join('、') || '无'), { size: 10, anchor: 'middle', fill: C.red });
    return s + '</svg>';
  }

  /* =================================================== 12. 瀑布图 */
  function waterfall(rows, o) {
    o = o || {};
    var w = o.width || 680, h = o.height || 320, padL = 54, padR = 24, padT = 46, padB = 66;
    var x0 = padL, x1 = w - padR, yT = padT, yB = h - padB;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    var max = 0, acc = 0;
    rows.forEach(function (r) { acc += r.value; max = Math.max(max, Math.abs(acc), Math.abs(r.value)); });
    max = max || 1;
    var bw = (x1 - x0) / rows.length * 0.62;
    var step = (x1 - x0) / rows.length;
    acc = 0;
    rows.forEach(function (r, i) {
      var start = r.type === 'total' ? 0 : acc;
      var end = r.type === 'total' ? r.value : acc + r.value;
      var yA = yB - (yB - yT) * (start / max);
      var yB2 = yB - (yB - yT) * (end / max);
      var x = x0 + i * step + (step - bw) / 2;
      var top = Math.min(yA, yB2), hh = Math.abs(yB2 - yA);
      var col = r.type === 'total' ? C.blue : (r.value < 0 ? C.red : C.orange);
      s += rect(x, top, bw, hh, col, ' rx="2"');
      s += '<g>' + tip(r.label + '：' + fmt(r.value)) + '</g>';
      s += t(x + bw / 2, top - 5, (r.value > 0 ? '+' : '') + fmt(r.value), { size: 10, anchor: 'middle', fill: col, weight: 600 });
      s += t(x0 + i * step + step / 2, yB + 16, r.label, { size: 9.5, anchor: 'middle', fill: C.ink });
      if (i > 0) s += line(x0 + i * step, Math.min(yA, yB2), x0 + i * step, Math.max(yA, yB2), C.axis, 1);
      if (r.type !== 'total') acc = end;
    });
    s += line(x0, yB, x1, yB, C.axis);
    return s + '</svg>';
  }

  /* =================================================== 13. 散点（能力—掌握概率） */
  function scatter(points, o) {
    o = o || {};
    var w = o.width || 680, h = o.height || 300, padL = 54, padR = 24, padT = 40, padB = 46;
    var x0 = padL, x1 = w - padR, yT = padT, yB = h - padB;
    var s = open(w, h);
    s += t(padL, 18, o.title || '', { size: 12.5, weight: 600, fill: C.ink });
    var xmin = o.xMin, xmax = o.xMax, ymin = o.yMin === undefined ? 0 : o.yMin, ymax = o.yMax === undefined ? 1 : o.yMax;
    function px(v) { return x0 + (x1 - x0) * (v - xmin) / ((xmax - xmin) || 1); }
    function py(v) { return yB - (yB - yT) * (v - ymin) / ((ymax - ymin) || 1); }
    [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
      s += line(x0, py(v), x1, py(v), C.grid);
      s += t(x0 - 8, py(v) + 3, Math.round(v * 100) + '%', { size: 9.5, anchor: 'end' });
    });
    for (var gx = Math.ceil(xmin); gx <= xmax; gx++) {
      s += line(px(gx), yT, px(gx), yB, C.grid);
      s += t(px(gx), yB + 15, gx, { size: 9.5, anchor: 'middle' });
    }
    if (o.lineFn) {
      var d = [];
      for (var x = xmin; x <= xmax + 1e-9; x += (xmax - xmin) / 60) d.push(px(x).toFixed(1) + ' ' + py(o.lineFn(x)).toFixed(1));
      s += '<polyline points="' + d.join(' ') + '" fill="none" stroke="' + C.blue + '" stroke-width="2"/>';
    }
    points.forEach(function (p) {
      if (p.x === null || p.x === undefined || !isFinite(p.x)) return;
      s += '<circle cx="' + px(Math.max(xmin, Math.min(xmax, p.x))) + '" cy="' + py(Math.max(ymin, Math.min(ymax, p.y))) +
        '" r="' + (p.r || 4.5) + '" fill="' + (p.color || C.blue) + '" opacity="0.78" stroke="#fff" stroke-width="1">' +
        tip((p.label || '') + '｜θ=' + (Math.round(p.x * 100) / 100) + '，掌握率 ' + Math.round(p.y * 100) + '%') + '</circle>';
    });
    s += t((x0 + x1) / 2, h - 8, o.xLabel || '', { size: 10, anchor: 'middle' });
    return s + '</svg>';
  }

  EP.charts = {
    cleveland: cleveland, heatmap: heatmap, stackedBar: stackedBar, donut: donut,
    hbar: hbar, lollipop: lollipop, slope: slope, parallel: parallel,
    fiasMatrix: fiasMatrix, timeline: timeline, network: network,
    waterfall: waterfall, scatter: scatter, ramp: ramp, PALETTE: PALETTE, C: C, esc: esc, fmt: fmt
  };
})(window);
