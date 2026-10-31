/* =============================================================================
 * app.js —— 界面逻辑：采集 → 分析 → 可视化
 * ========================================================================== */
(function () {
  'use strict';
  var EP = window.EP, CH = EP.charts, PL = EP.pipeline, T = EP.text;
  var $ = function (id) { return document.getElementById(id); };
  var round = T.round, esc = CH.esc, fmt = CH.fmt;

  var state = { result: null, confMode: 'freq', ready: false };
  window.__EP_STATE = state;   // 便于控制台调试与二次开发

  /* ------------------------------------------------------------ 基础工具 */
  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.classList.add('show');
    clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 2200);
  }
  function pct(x, d) { return (x === null || x === undefined) ? '—' : (x * 100).toFixed(d === undefined ? 1 : d) + '%'; }
  function chartBox(title, cap, svg, hint, full) {
    return '<div class="chart' + (full ? ' full' : '') + '"><h4>' + title + '</h4><p class="cap">' + cap + '</p>' +
      svg + (hint ? '<div class="hint">' + hint + '</div>' : '') + '</div>';
  }

  /* ============================================================ 载入示例 */
  function loadSample() {
    var S = window.EP_SAMPLE;
    var L = S.lesson;
    $('fTitle').value = L.title; $('fSubject').value = L.subject;
    $('fGrade').value = L.grade; $('fUnit').value = L.unit;
    $('fMode').value = L.teacherMode;
    $('fPlan').value = S.lessonPlan;
    $('fStd').value = S.standards.join('\n');
    $('fItems').value = S.itemsCsv;
    $('fResp').value = S.respCsv;
    $('fPost').value = S.postCsv;
    $('fInterest').value = S.interestCsv;
    $('fConf').value = S.confusionCsv;
    $('fFias').value = S.fiasSeq;
    $('fSns').value = S.snsCsv;
    window._segData = S.segments.map(function (s) { return { name: s.name, minutes: s.minutes, key: s.key }; });
    window._fiasSeg = S.fiasSegments;
    renderSegTable();
    $('lessonBadge').textContent = L.grade + ' · ' + L.subject + ' · ' + L.title;
    renderChecklist();
    toast('已载入示例数据（模拟数据，学号匿名）');
  }

  function renderSegTable() {
    var tb = $('segTable').querySelector('tbody');
    tb.innerHTML = '';
    (window._segData || []).forEach(function (s, i) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><input type="text" value="' + esc(s.name) + '" data-i="' + i + '" data-k="name"></td>' +
        '<td><input type="number" min="0" step="1" value="' + s.minutes + '" data-i="' + i + '" data-k="minutes"></td>' +
        '<td style="text-align:center"><input type="checkbox" ' + (s.key ? 'checked' : '') + ' data-i="' + i + '" data-k="key"></td>' +
        '<td><button class="mini" data-del="' + i + '">删除</button></td>';
      tb.appendChild(tr);
    });
    tb.querySelectorAll('input').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var i = +inp.dataset.i, k = inp.dataset.k;
        window._segData[i][k] = inp.type === 'checkbox' ? inp.checked : (k === 'minutes' ? (+inp.value || 0) : inp.value);
      });
    });
    tb.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        window._segData.splice(+b.dataset.del, 1); renderSegTable();
      });
    });
  }

  function renderChecklist() {
    var items = [
      ['教师侧 · 教案 / 支持文献文本', $('fPlan').value.trim().length > 50],
      ['教师侧 · 课程标准条目', $('fStd').value.trim().split('\n').length >= 3],
      ['教师侧 · 教学环节与预计用时', (window._segData || []).length >= 3],
      ['教师侧 · 教学模式自述', $('fMode').value.trim().length > 0],
      ['学生侧 · 题项—知识点映射', PL.parseCsv($('fItems').value).rows.length >= 3],
      ['学生侧 · 预习案作答矩阵', PL.parseCsv($('fResp').value).rows.length >= 5],
      ['学生侧 · 学习兴趣量表', PL.parseCsv($('fInterest').value).rows.length >= 5],
      ['学生侧 · 自主困惑（质性数据）', PL.parseCsv($('fConf').value).rows.length >= 3],
      ['课中 · FIAS 编码序列（可选）', $('fFias').value.trim().length > 10],
      ['课中 · 师生互动边表（可选）', PL.parseCsv($('fSns').value).rows.length >= 3],
      ['课后 · 课后练习作答（可选）', PL.parseCsv($('fPost').value).rows.length >= 5]
    ];
    $('checklist').innerHTML = items.map(function (it) {
      return '<li>' + (it[1] ? '<span class="pill green">已采集</span>' : '<span class="pill red">缺失</span>') +
        ' ' + esc(it[0]) + '</li>';
    }).join('');
  }

  /* ============================================================ 读取表单 */
  function readForm() {
    var itemsCsv = PL.parseCsv($('fItems').value);
    var items = itemsCsv.rows.map(function (r) {
      return { qid: r[0], kp: r[1], kpName: r[2], lit: r[3], main_confusion: r[4], text: r[5] || '' };
    }).filter(function (it) { return it.qid; });

    function readResp(text) {
      var c = PL.parseCsv(text);
      var sidIdx = c.header.indexOf('sid');
      if (sidIdx < 0) sidIdx = 0;
      var sids = c.rows.map(function (r) { return r[sidIdx]; });
      var cols = items.map(function (it) { return c.header.indexOf(it.qid); });
      var times = items.map(function (it) { return c.header.indexOf('t_' + it.qid); });
      var M = c.rows.map(function (r) {
        return cols.map(function (ci, j) {
          var v = ci >= 0 ? parseInt(r[ci], 10) : 0;
          return (v === 1 || v === 0) ? v : 0;
        });
      });
      var TM = c.rows.map(function (r) {
        return times.map(function (ti) { return ti >= 0 ? (parseFloat(r[ti]) || 0) : 0; });
      });
      return { sids: sids, M: M, TM: TM, missing: cols.filter(function (c2) { return c2 < 0; }).length };
    }

    var pre = readResp($('fResp').value);
    var post = readResp($('fPost').value);
    var ic = PL.parseCsv($('fInterest').value);
    var interestNames = ic.header.slice(1);
    var interest = ic.rows.map(function (r) {
      return r.slice(1).map(function (v) { return parseFloat(v) || 0; });
    });
    var topics = interestNames.filter(function (n) { return n.indexOf('i_') === 0; })
      .map(function (n) { return n.slice(2); });
    if (!topics.length) topics = interestNames.slice(0, interestNames.length);

    var cf = PL.parseCsv($('fConf').value);
    var confMap = {};
    cf.rows.forEach(function (r) { confMap[r[0]] = r.slice(1).join(','); });
    var confusions = pre.sids.map(function (s) { return confMap[s] || ''; });

    var sns = PL.parseCsv($('fSns').value).rows.map(function (r) {
      return { from: r[0], to: r[1], weight: parseFloat(r[2]) || 1 };
    }).filter(function (e) { return e.from && e.to; });

    var fiasCodes = $('fFias').value.split(/[,\s]+/).map(function (x) { return parseInt(x, 10); })
      .filter(function (x) { return x >= 1 && x <= 10; });

    return {
      lesson: {
        title: $('fTitle').value, subject: $('fSubject').value, grade: $('fGrade').value,
        unit: $('fUnit').value, teacherMode: $('fMode').value
      },
      standards: $('fStd').value.split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 4; }),
      lessonPlan: $('fPlan').value,
      segments: (window._segData || []).slice(),
      items: items,
      sids: pre.sids,
      resp: pre.M, times: pre.TM,
      interest: interest, interestNames: interestNames, interestTopics: topics,
      confusions: confusions,
      post: post.M.length ? post.M : null,
      fiasCodes: fiasCodes, fiasSegments: window._fiasSeg || [],
      snsEdges: sns,
      target: +$('pTarget').value, simThreshold: +$('pThr').value,
      minD: +$('pMinD').value, loP: 0.15, hiP: 0.95,
      topics: +$('pK').value, k: +$('pCluster').value,
      minSup: +$('pSup').value, minConf: +$('pConf').value,
      marginalThreshold: 0.18
    };
  }

  /* ============================================================ 运行分析 */
  function run() {
    var inp;
    try { inp = readForm(); } catch (e) { toast('读取采集数据失败：' + e.message); return; }
    if (!inp.items.length) { toast('题项映射为空，无法分析'); return; }
    if (!inp.resp.length) { toast('作答矩阵为空，无法分析'); return; }
    var t0 = performance.now();
    var res;
    try { res = PL.analyse(inp); } catch (e) {
      toast('分析失败：' + e.message); console.error(e.stack || e); return;
    }
    state.result = res; state.ready = true; state.input = inp;
    renderAnalysis(res); renderViz(res); renderStages(res); renderComp(res);
    toast('分析完成，用时 ' + Math.round(performance.now() - t0) + ' ms');
  }

  /* ============================================================ 分析页 */
  function renderAnalysis(r) {
    var t = r.teacher, s = r.student;
    var pass = t.fourDims.filter(function (d) { return d.value >= d.target; }).length;
    var badItems = s.flagged.filter(function (x) { return x.flag; });
    var html = '<div class="card"><h2>课程预备阶段 · 分析结果概览</h2><div class="kpis">' +
      kpi('教案—课标契合度', t.align, '', t.align >= 70 ? 'good' : (t.align >= 50 ? 'warn' : 'bad')) +
      kpi('四维达标数', pass + '/4', '', pass >= 3 ? 'good' : (pass >= 2 ? 'warn' : 'bad')) +
      kpi('重难点用时占比', pct(t.keyShare, 0), '', t.keyShare >= 0.5 ? 'good' : 'warn') +
      kpi('班级预习正确率', pct(s.scoreRate, 1), '', s.scoreRate >= 0.5 ? 'good' : 'warn') +
      kpi('可疑题项', badItems.length + ' / ' + s.items.length, '', badItems.length ? 'warn' : 'good') +
      kpi('教学模式适配度', s.fit.overall, '', s.fit.overall >= 70 ? 'good' : (s.fit.overall >= 55 ? 'warn' : 'bad')) +
      '</div>' + conclusion(t, s, pass, badItems) + '</div>';

    /* ---- 教师侧：相似度矩阵 */
    html += '<div class="card"><h3>教师侧 · 教学目标 × 课程标准 语义匹配矩阵</h3>' +
      '<p class="lead">底色 = TF-IDF 余弦相似度（句级文本量级天然偏低，用于判断"哪条目标对应哪条课标"）；' +
      '末行 = 课标条目的 <b>IDF 加权词条覆盖率</b>；契合度指数 ' + t.align + ' = 各条目覆盖率的均值 ×100。</p>' +
      '<div style="overflow-x:auto"><table class="tbl compact"><thead><tr><th>教学目标 / 课标条目</th>' +
      t.standards.map(function (_, j) { return '<th class="num">课标 ' + (j + 1) + '</th>'; }).join('') +
      '<th class="num">最佳匹配</th></tr></thead><tbody>' +
      t.objectives.map(function (o, i) {
        return '<tr><td>' + esc(o.length > 40 ? o.slice(0, 40) + '…' : o) + '</td>' +
          t.matrix[i].map(function (v) {
            return '<td class="num" style="background:' + CH.ramp(v / 0.6, 'blue') + '">' + v.toFixed(3) + '</td>';
          }).join('') +
          '<td class="num"><b>' + t.objBest[i].toFixed(3) + '</b></td></tr>';
      }).join('') +
      '<tr><td><b>课标被匹配程度（余弦）</b></td>' + t.stdBest.map(function (v) {
        return '<td class="num" style="background:' + CH.ramp(v / 0.6, 'blue') + '"><b>' + v.toFixed(3) + '</b></td>';
      }).join('') + '<td></td></tr>' +
      '<tr><td><b>课标词条覆盖率</b></td>' + t.stdCoverage.map(function (v) {
        var ok = v >= (state.input ? state.input.simThreshold : 0.25);
        return '<td class="num" style="background:' + CH.ramp(v, 'blue') + '">' +
          (ok ? '<span class="pill green">' : '<span class="pill red">') + v.toFixed(3) + '</span></td>';
      }).join('') + '<td></td></tr>' +
      '</tbody></table></div>' +
      '<p class="cap" style="margin-top:8px">课标条目前 6 字：' +
      t.standards.map(function (x, j) { return '<span class="tag">课标' + (j + 1) + ' ' + esc(x.slice(0, 6)) + '…</span>'; }).join('') +
      '</p></div>';

    /* ---- 教师侧：四维 + 深度 + 素养 + 用时 */
    html += '<div class="grid2"><div class="card"><h3>教师侧 · 四维画像得分</h3><table class="tbl">' +
      '<thead><tr><th>维度</th><th class="num">得分</th><th class="num">达标线</th><th>判定</th><th>计算说明</th></tr></thead><tbody>' +
      t.fourDims.map(function (d) {
        var ok = d.value >= d.target;
        return '<tr' + (ok ? '' : ' class="warn"') + '><td><b>' + d.label + '</b></td><td class="num">' + d.value +
          '</td><td class="num">' + d.target + '</td><td>' + (ok ? '<span class="pill green">达标</span>' : '<span class="pill red">未达标</span>') +
          '</td><td>' + esc(d.hint) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3 style="margin-top:14px">布鲁姆认知层级命中（知识深度）</h3><table class="tbl compact"><thead><tr><th>目标句</th><th class="num">层级</th><th>层级名</th></tr></thead><tbody>' +
      t.depth.hits.map(function (h2) {
        return '<tr><td>' + esc(h2.text.length > 34 ? h2.text.slice(0, 34) + '…' : h2.text) + '</td><td class="num">' +
          (h2.level || '—') + '</td><td>' + h2.levelName + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    html += '<div class="card"><h3>教师侧 · 素养覆盖与重难点用时</h3>' +
      '<p class="lead">多元素养活动：命中 ' + t.literacy.count + ' 类（词典共 ' + t.literacy.total + ' 项）</p>' +
      '<p>' + t.literacy.hit.map(function (h2) { return '<span class="pill blue">' + esc(h2.name) + ' ×' + h2.count + '</span>'; }).join(' ') + '</p>' +
      '<table class="tbl compact"><thead><tr><th>教学环节</th><th class="num">用时</th><th class="num">占比</th><th>属性</th></tr></thead><tbody>' +
      t.segments.map(function (s2) {
        return '<tr><td>' + esc(s2.name) + '</td><td class="num">' + s2.minutes + ' 分钟</td><td class="num">' +
          pct(s2.share, 1) + '</td><td>' + (s2.key ? '<span class="pill orange">重难点</span>' : '<span class="pill gray">常规</span>') + '</td></tr>';
      }).join('') +
      '<tr><td><b>合计</b></td><td class="num"><b>' + t.segTotal + '</b></td><td class="num">100%</td>' +
      '<td>重难点合计 <b>' + pct(t.keyShare, 1) + '</b></td></tr>' +
      '</tbody></table>' +
      (t.lda ? '<h3 style="margin-top:14px">主题模型 LDA（K=' + t.lda.K + '）</h3>' +
        t.lda.topics.map(function (tp) {
          return '<p style="margin:.3em 0"><span class="pill gray">主题 ' + (tp.id + 1) + '（' + tp.weight + ' 词）</span> ' +
            tp.top.slice(0, 6).map(function (w) { return esc(w.w); }).join('、') + '</p>';
        }).join('') : '') +
      '</div></div>';

    /* ---- 学生侧：CTT + IRT */
    html += '<div class="card"><h3>学生侧 · 题项质量（CTT + IRT 2PL）</h3>' +
      '<p class="lead">IRT 采用 Bock-Aitkin MML-EM（' + s.irt.iters + ' 次迭代，对数似然 ' + s.irt.loglik +
      '）；θ 为 EAP 估计；区分度下限 ' + state.input.minD + '，难度区间 [0.15, 0.95]。</p>' +
      '<div style="overflow-x:auto"><table class="tbl compact"><thead><tr>' +
      ['题号', '知识点', '素养', '难度P', '区分度r', '分组D', '离散度', 'IRT a', 'IRT b', '信息量', '判定'].map(function (x) { return '<th>' + x + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      s.items.map(function (it, j) {
        var c = s.ctt[j], ir = s.irt.items[j], f = s.flagged[j];
        return '<tr' + (f.flag ? ' class="warn"' : '') + '><td><b>' + esc(it.qid) + '</b></td><td>' + esc(it.kpName) +
          '</td><td>' + esc(it.lit) + '</td><td class="num">' + c.difficultyP.toFixed(2) + '</td><td class="num">' +
          c.discrimination.toFixed(3) + '</td><td class="num">' + c.D.toFixed(2) + '</td><td class="num">' + c.sd.toFixed(3) +
          '</td><td class="num">' + ir.a.toFixed(2) + '</td><td class="num">' + ir.b.toFixed(2) + '</td><td class="num">' +
          ir.info.toFixed(2) + '</td><td>' + (f.flag ? '<span class="pill red">' + esc(f.reasons[0]) + '</span>' : '<span class="pill green">合格</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (function () {
        var bad = s.flagged.filter(function (x) { return x.flag; });
        if (!bad.length) return '<div class="conclusion">全部题项通过质量检验，可直接用于学情诊断。</div>';
        return '<div class="conclusion"><b>需人工复核的题项：</b>' + bad.map(function (x) {
          return x.qid + '（' + x.reasons.join('；') + '）';
        }).join('；') + '。建议修改题干表述、核查标准答案或调整题项难度后重新采集。</div>';
      })() + '</div>';

    /* ---- 掌握概率 + 聚类 + 困惑 */
    html += '<div class="grid2"><div class="card"><h3>学生侧 · 知识点掌握概率（IRT）</h3><table class="tbl compact">' +
      '<thead><tr><th>知识点</th><th class="num">实测正确率</th><th class="num">模型掌握概率</th><th>判定</th></tr></thead><tbody>' +
      s.kps.map(function (k) {
        var lv = k.classMastery >= 0.7 ? '<span class="pill green">已掌握</span>' :
          (k.classMastery >= 0.45 ? '<span class="pill orange">部分掌握</span>' : '<span class="pill red">薄弱</span>');
        return '<tr><td>' + esc(k.name) + '</td><td class="num">' + pct(k.observed, 1) + '</td><td class="num"><b>' +
          pct(k.classMastery, 1) + '</b></td><td>' + lv + '</td></tr>';
      }).join('') + '</tbody></table></div>';

    html += '<div class="card"><h3>学生侧 · 学习兴趣聚类（K-Means，k=' + state.input.k + '）</h3>' +
      '<p class="lead">轮廓系数 ' + s.cluster.silhouette + '，组内平方和 ' + s.cluster.inertia + '</p>' +
      '<table class="tbl compact"><thead><tr><th>学习类型</th><th class="num">人数</th><th>中心（' +
      s.interestNames.join(' / ') + '）</th></tr></thead><tbody>' +
      s.types.map(function (tp) {
        return '<tr><td><b>' + tp.name + '</b></td><td class="num">' + tp.size + '</td><td style="font-size:11.5px">' +
          tp.centroid.join(', ') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<h3 style="margin-top:14px">教学模式 × 学习类型 适配度</h3><table class="tbl compact"><thead><tr><th>识别到的模式</th>' +
      s.fit.rows[0].parts.map(function (p) { return '<th class="num">' + p.name + '（' + p.n + '人）</th>'; }).join('') +
      '<th class="num">加权适配度</th></tr></thead><tbody>' +
      s.fit.rows.map(function (row) {
        return '<tr><td>' + esc(row.mode) + '式</td>' + row.parts.map(function (p) {
          return '<td class="num">' + p.value + '</td>';
        }).join('') + '<td class="num"><b>' + row.fit + '</b></td></tr>';
      }).join('') + '<tr><td><b>综合</b></td><td colspan="' + s.fit.rows[0].parts.length + '"></td><td class="num"><b>' +
      s.fit.overall + '</b></td></tr></tbody></table>' +
      '<h3 style="margin-top:14px">四类困惑编码统计</h3><p>' +
      s.confKeys.map(function (k, i) { return '<span class="pill gray">' + esc(k) + ' ' + s.confTotal[i] + ' 人次</span>'; }).join(' ') +
      '</p></div></div>';

    $('analysisOut').innerHTML = html;
  }

  function kpi(k, v, u, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k">' + k + '</div><div class="v">' + v +
      '<span class="u">' + (u || '') + '</span></div></div>';
  }

  function conclusion(t, s, pass, badItems) {
    var lines = [];
    lines.push(t.align >= 70 ? '教案目标与课程标准<b>高度契合</b>' :
      (t.align >= 50 ? '教案与课标<b>基本契合</b>，建议复核未覆盖条目' : '教案与课标<b>契合度偏低</b>，需重写目标表述'));
    var weak = t.fourDims.filter(function (d) { return d.value < d.target; });
    lines.push(weak.length ? '未达标维度：<b>' + weak.map(function (d) { return d.label + '(' + d.value + ')'; }).join('、') + '</b>'
      : '知识种类 / 深度 / 广度 / 平衡性<b>四项全部达标</b>');
    lines.push(t.keyShare >= 0.5 ? '重难点环节用时占比 <b>' + pct(t.keyShare, 0) + '</b>，时间配置合理'
      : '重难点环节用时仅 <b>' + pct(t.keyShare, 0) + '</b>，建议压缩常规环节');
    var weakest = s.kps.slice().sort(function (a, b) { return a.classMastery - b.classMastery; }).slice(0, 2);
    lines.push('前置知识薄弱点：<b>' + weakest.map(function (k) { return k.name + '（' + pct(k.classMastery, 0) + '）'; }).join('、') + '</b>');
    var dom = s.types[0];
    lines.push('班级以<b>' + dom.name + '</b>为主（' + dom.size + ' 人），当前教学模式适配度 <b>' + s.fit.overall + '</b>');
    if (badItems.length) lines.push('共 <b>' + badItems.length + '</b> 道题项需复核后再用于诊断');
    return '<div class="conclusion">' + lines.map(function (x, i) { return (i + 1) + '. ' + x + '；'; }).join(' ') +
      '<br><span style="color:#2f855a;font-weight:600">（以上结论由阈值规则生成，非生成式文本）</span></div>';
  }

  /* ============================================================ 可视化页 */
  function renderViz(r) {
    var t = r.teacher, s = r.student;
    var html = '<div class="card"><h2>课程预备阶段可视化面板</h2>' +
      '<p class="lead">对应论文图 2：教师画像（克利夫兰点图 + 用时结构）与学生画像（困惑热力图 + 错因构成 + 兴趣分布 + 掌握概率）。</p></div>';
    html += '<div class="chart-grid">';

    // 1 克利夫兰点图
    html += chartBox('① 教师画像 · 四维达标点图（克利夫兰点图）',
      '知识种类 / 知识深度 / 知识广度 / 分布平衡性，红色虚线为达标线 ' + t.fourDims[0].target,
      CH.cleveland(t.fourDims, { target: t.fourDims[0].target, width: 660, title: '' }),
      '<b>怎么读：</b>圆点越靠右越好；落在达标线左侧即未达标。<b>怎么做：</b>' +
      (t.fourDims.filter(function (d) { return d.value < d.target; }).map(function (d) { return d.label; }).join('、') || '四项达标') +
      '——知识种类不足就补充被遗漏的知识点，深度不足就把"说出/记住"改成"分析/建模"，广度不足就补挂课标条目，平衡性低就重排各环节比重。');

    // 2 环节用时结构
    html += chartBox('② 教师画像 · 教学环节用时结构',
      '堆叠占比，橙色为重难点环节；重难点合计 ' + pct(t.keyShare, 1),
      CH.stackedBar([{
        label: '本课', parts: t.segments.map(function (sg) {
          return { name: sg.name, value: sg.minutes, color: sg.key ? CH.C.orange : CH.C.blue };
        })
      }], t.segments.map(function (sg) { return sg.name; }), { mode: 'percent', padL: 60, padR: 30, width: 660, barH: 40 }),
      '<b>怎么读：</b>橙色越长，时间越集中在重难点。<b>怎么做：</b>占比低于一半时，压缩导入与小结，把时间还给探究与例题。');

    // 3 困惑热力图
    var mat = state.confMode === 'freq' ? s.confMat : s.confSev;
    html += chartBox('③ 学生画像 · 四类困惑 × 知识点热力图（' + (state.confMode === 'freq' ? '频次' : '严重度') + '）',
      '<div class="switch"><button data-mode="freq" class="' + (state.confMode === 'freq' ? 'on' : '') + '">频次</button>' +
      '<button data-mode="sev" class="' + (state.confMode === 'sev' ? 'on' : '') + '">严重度</button></div>',
      CH.heatmap(mat, s.kps.map(function (k) { return k.name; }), s.confKeys,
        { kind: 'red', width: 660, padL: 128, cellW: 108, cellH: 30, unit: state.confMode === 'freq' ? ' 人次' : '' }),
      '<b>怎么读：</b>颜色越红，该知识点上该类困惑越集中。<b>怎么做：</b>概念理解不清→课前补认知锚点；' +
      '方法应用错误→课上拆步骤示范；审题遗漏→训练圈画条件；知识迁移困难→增加变式与生活情境。', true);

    // 4 错因构成
    var confParts = s.confKeys.map(function (k, i) {
      return { name: k, value: s.confTotal[i], color: CH.PALETTE[i] };
    });
    html += chartBox('④ 学生画像 · 错因构成（环形图）',
      '四类困惑人次占比，合计 ' + s.confTotal.reduce(function (a, b) { return a + b; }, 0) + ' 人次',
      CH.donut(confParts, { width: 300, height: 250, centerLabel: '困惑人次' }),
      '<b>怎么读：</b>占比最大者为本课主要认知障碍类型。');

    html += chartBox('⑤ 学生画像 · 错因构成（按知识点堆叠）',
      '每行一个知识点，色段为四类困惑占比',
      CH.stackedBar(s.kps.map(function (k, ki) {
        return {
          label: k.name, parts: s.confKeys.map(function (ck, ci) {
            return { name: ck, value: s.confMat[ki][ci], color: CH.PALETTE[ci] };
          })
        };
      }), s.confKeys, { mode: 'percent', width: 660, padL: 128, padR: 20, barH: 22, gap: 8 }),
      '<b>怎么读：</b>同一知识点内若某一色段独大，说明障碍类型集中；若分散，说明需要个别化补偿。');

    // 6 兴趣主题
    html += chartBox('⑥ 学生画像 · 学习兴趣主题频次（评分 ≥ 4 的人数）',
      '水平条形图，反映班级兴趣分布',
      CH.hbar(s.topicFreq, { width: 660, padL: 128, unit: '' }),
      '<b>怎么读：</b>最长的条就是本班最买账的切入点。<b>怎么做：</b>把最热主题做成本课情境载体，把最冷主题放到拓展任务里。');

    // 7 掌握概率棒棒糖
    html += chartBox('⑦ 学生画像 · 知识点掌握概率（棒棒糖图）',
      'IRT 模型估计的班级掌握概率，绿 ≥70% / 橙 45–70% / 红 <45%',
      CH.lollipop(s.kps.map(function (k) { return { label: k.name, value: k.classMastery }; }), { width: 660, padL: 128 }),
      '<b>怎么读：</b>低于 45% 的知识点必须在课上重新教，不能只靠练习补救。', true);

    // 8 能力—掌握概率散点
    var pts = s.ability.map(function (th, i) {
      return { x: th, y: T.mean(s.kps.map(function (k) { return k.perStudent[i]; })), label: s.sids[i], r: 4.6 };
    });
    html += chartBox('⑧ 学生画像 · 能力 θ × 综合掌握概率（散点 + 班级 ICC）',
      '横轴 EAP 能力估计，纵轴各知识点平均掌握概率；曲线为能力—掌握概率关系',
      CH.scatter(pts, {
        width: 660, height: 300, xMin: -3, xMax: 3, yMin: 0, yMax: 1, xLabel: '能力 θ（标准分）',
        lineFn: function (x) {
          return T.mean(s.irt.items.map(function (it) { return EP.psych.logistic(it.a, it.b, x); }));
        }
      }),
      '<b>怎么读：</b>左侧下方是需要重点帮扶的学生；横轴中段密集说明班级分化不大，两端拉长说明两极分化。', true);

    html += '</div>';
    $('vizOut').innerHTML = html;
    $('vizOut').querySelectorAll('.switch button').forEach(function (b) {
      b.addEventListener('click', function () { state.confMode = b.dataset.mode; renderViz(state.result); });
    });
  }

  /* ============================================================ 课中课后 */
  function renderStages(r) {
    var html = '';
    if (r.inClass) {
      var f = r.inClass.fias, sn = r.inClass.sns;
      html += '<div class="card"><h2>课堂教学阶段 · 过程证据面板</h2>' +
        '<div class="kpis">' +
        kpi('教师言语比率', pct(f.ratios.teacherTalk, 1), '', f.ratios.teacherTalk > 0.7 ? 'bad' : 'good') +
        kpi('学生言语比率', pct(f.ratios.studentTalk, 1), '', f.ratios.studentTalk >= 0.3 ? 'good' : 'warn') +
        kpi('安静或混乱', pct(f.ratios.quiet, 1), '', f.ratios.quiet > 0.15 ? 'warn' : 'good') +
        kpi('间接/直接比 I/D', f.ratios.ID, '', f.ratios.ID >= 1 ? 'good' : 'warn') +
        kpi('网络密度', sn.density, '', '') +
        kpi('边缘参与者', sn.marginal.length + ' 人', '', sn.marginal.length ? 'warn' : 'good') +
        '</div></div>';
      html += '<div class="chart-grid">';
      html += chartBox('课堂互动时序（每格 3 秒）', '颜色区分教师主导 / 学生主导 / 沉默混乱',
        CH.timeline(state.input.fiasCodes, { width: 1000 }),
        '<b>怎么读：</b>连续灰色段是"冷场"，连续红/黄段是教师独白。<b>怎么做：</b>把独白段切成"提问—应答"链。', true);
      html += chartBox('改进版 FIAS 互动迁移矩阵', '对角线为持续区；4→8 / 4→9 为提问—应答链',
        CH.fiasMatrix(f, {}),
        '<b>怎么读：</b>4→9 频次高说明提问激发了主动表达；10 行高处说明提问后常冷场。', true);
      html += chartBox('课堂言语比率结构', '教师 / 学生 / 沉默混乱占比',
        CH.donut([
          { name: '教师言语', value: f.ratios.teacherTalk * 100, color: CH.C.orange },
          { name: '学生言语', value: f.ratios.studentTalk * 100, color: CH.C.green },
          { name: '安静或混乱', value: f.ratios.quiet * 100, color: CH.C.gray }
        ], { width: 300, height: 250, centerLabel: '言语构成' }), '');
      html += chartBox('师生互动网络拓扑', '节点半径映射中心度，灰色虚线圈为边缘参与者',
        CH.network(sn, {}),
        '<b>怎么读：</b>边缘参与者几乎不与教师连线。<b>怎么做：</b>下一课把这些学号放入提问名单与小组长轮换。');
      html += '</div>';
      html += '<div class="card"><h3>边缘参与者名单（进入下一课提问设计与分组安排）</h3><p>' +
        (sn.marginal.length ? sn.marginal.map(function (m) { return '<span class="pill red">' + m + '</span>'; }).join(' ')
          : '<span class="pill green">无</span>') + '</p></div>';
    } else {
      html += '<div class="card"><div class="empty">未采集 FIAS 编码序列或互动边表（可选数据）。</div></div>';
    }

    if (r.after) {
      var a = r.after;
      html += '<div class="card"><h2>课程延伸阶段 · 学习成效诊断面板</h2><div class="kpis">' +
        kpi('课后正确率', pct(a.postRate, 1), '', '') +
        kpi('知识留存率（BKT）', a.retention === null ? '—' : pct(a.retention, 1), '', a.retention >= 0.6 ? 'good' : 'warn') +
        kpi('平均掌握增益', pct(T.mean(a.slopes.map(function (s2) { return s2.to - s2.from; })), 1), '', '') +
        kpi('强关联规则', a.rules.rules.length + ' 条', '', '') +
        '</div></div>';
      html += '<div class="chart-grid">';
      html += chartBox('知识点掌握率变化（斜率图）', '从课前预习到课后练习的班级平均掌握率',
        CH.slope(a.slopes, { width: 660, padL: 128, leftLabel: '课前', rightLabel: '课后' }),
        '<b>怎么读：</b>下滑的知识点说明课上没讲透或练习设计有偏。<b>怎么做：</b>下滑项在下一课开头做 5 分钟回顾。');
      html += chartBox('BKT 知识追踪 · 各知识点掌握概率', '课前 → 课后的潜在掌握概率（贝叶斯知识追踪）',
        CH.lollipop((a.kpBkt || []).map(function (k) { return { label: k.name, value: k.post, note: '增益 ' + Math.round(k.gain * 100) }; }),
          { width: 660, padL: 128 }),
        '<b>怎么读：</b>增益小但课前低的知识点＝补偿教学未生效。', true);
      html += chartBox('错题损失瀑布图', '从理想作答 100% 出发，逐项扣减四类错因损失，落到实际课后正确率',
        CH.waterfall(a.waterfall, { width: 660, height: 320 }),
        '<b>怎么读：</b>最长的红色柱就是最该优先解决的认知根源。', true);
      html += '</div>';
      html += '<div class="card"><h3>错题关联规则（Apriori，minSup=' + a.rules.minSup + '，minConf=' + a.rules.minConf + '）</h3>' +
        (a.rules.rules.length ? '<table class="tbl compact"><thead><tr><th>前项（错）</th><th>后项（错）</th>' +
          '<th class="num">支持度</th><th class="num">置信度</th><th class="num">提升度</th></tr></thead><tbody>' +
          a.rules.rules.slice(0, 18).map(function (rr) {
            return '<tr><td>' + esc(rr.antecedent.join(' + ')) + '</td><td><b>' + esc(rr.consequent.join(' + ')) +
              '</b></td><td class="num">' + rr.support.toFixed(3) + '</td><td class="num">' + rr.confidence.toFixed(3) +
              '</td><td class="num"><b>' + (rr.lift === null ? '—' : rr.lift.toFixed(2)) + '</b></td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty">当前阈值下未挖掘到强关联规则，可降低 minSup 后重算。</div>') +
        '<div class="conclusion"><b>怎么用：</b>置信度高的规则说明"错 A 必错 B"，其公共前项即是共性错误的认知根源，应在下一课集中突破。</div></div>';
    }
    $('stagesOut').innerHTML = html || '<div class="empty">请先运行分析。</div>';
  }

  /* ============================================================ 三阶段综合 */
  function renderComp(r) {
    var c = r.comprehensive;
    var html = '<div class="card"><h2>三阶段综合评判 · 驱动下一课改进</h2>' +
      '<p class="lead">打通预备—课堂—延伸三阶段数据：平行坐标看个体演变轨迹，学生—知识矩阵定位持续性学习困难。</p>' +
      '<div class="kpis">' +
      kpi('持续性困难学生', c.persistent.length + ' 人', '', c.persistent.length ? 'warn' : 'good') +
      kpi('参与学生数', c.studentKp.rowLabels.length + ' 人', '', '') +
      kpi('知识点数', c.studentKp.colLabels.length + ' 个', '', '') +
      '</div></div>';
    html += '<div class="chart-grid">';
    html += chartBox('学生三阶段演变轨迹（平行坐标图）',
      '预备掌握概率 → 课中互动中心度 → 延伸掌握概率 → 错因复杂度；红色为持续性困难学生',
      CH.parallel(c.parallel.rows, c.parallel.axes, { width: 1000, height: 380 }),
      '<b>怎么读：</b>红色线在第 1、3 轴都偏低且第 4 轴高，即"课前不会、课中不说、课后仍错"。<b>怎么做：</b>进入个别辅导名单。', true);
    html += chartBox('学生 × 知识点 掌握概率矩阵（课后）',
      '红色虚线框出课前课后均薄弱的交叉点（可持续切换"课后/课前"）',
      CH.heatmap(c.studentKp.mat, c.studentKp.rowLabels, c.studentKp.colLabels,
        { kind: 'blue', width: 1000, padL: 46, cellW: 62, cellH: 20, showValue: false }),
      '<b>怎么读：</b>整片浅色的行＝该生系统性困难；整片浅色的列＝该知识点全班性困难。', true);
    html += '</div>';
    html += '<div class="card"><h3>下一课改进清单（自动生成，教师可编辑）</h3><table class="tbl compact">' +
      '<thead><tr><th>来源</th><th>证据</th><th>下一课动作</th></tr></thead><tbody>' +
      nextActions(r).map(function (a) {
        return '<tr><td>' + a.src + '</td><td>' + a.ev + '</td><td><b>' + a.act + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
    $('compOut').innerHTML = html;
  }

  function nextActions(r) {
    var out = [], s = r.student, t = r.teacher;
    var weak = s.kps.slice().sort(function (a, b) { return a.classMastery - b.classMastery; }).slice(0, 2);
    out.push({
      src: '课程预备 · 学生画像',
      ev: '薄弱知识点：' + weak.map(function (k) { return k.name + '（掌握概率 ' + pct(k.classMastery, 0) + '）'; }).join('、'),
      act: '下一课开头用 5 分钟回顾，并各配 2 道诊断题'
    });
    var dom = s.types[0];
    out.push({
      src: '课程预备 · 适配度',
      ev: '班级以' + dom.name + '为主（' + dom.size + ' 人），当前模式适配度 ' + s.fit.overall,
      act: s.fit.overall < 60 ? '增加探究/合作环节比例，减少连续讲授时长' : '保持现有模式，为少数派类型准备分层任务'
    });
    if (r.inClass) {
      var mg = r.inClass.sns.marginal;
      out.push({
        src: '课堂教学 · SNA',
        ev: '边缘参与者 ' + (mg.length ? mg.join('、') : '无') + '；I/D 比 ' + r.inClass.fias.ratios.ID,
        act: mg.length ? '把 ' + mg.slice(0, 4).join('、') + ' 列入下一课必提问名单，并安排为小组记录员' : '维持现有提问覆盖面'
      });
      var qt = r.inClass.fias.ext.silenceNature;
      out.push({
        src: '课堂教学 · FIAS',
        ev: '沉默性质分布：思考性 ' + qt['思考性沉默'] + '、困惑性 ' + qt['困惑性沉默'] + '、混乱 ' + qt['混乱与无关'],
        act: '困惑性沉默偏多处插入即时追问；混乱偏多处先立规矩再提问'
      });
    }
    if (r.after) {
      var down = r.after.slopes.filter(function (x) { return x.to < x.from; });
      out.push({
        src: '课程延伸 · 斜率图',
        ev: down.length ? '掌握率下滑：' + down.map(function (x) { return x.label; }).join('、') : '全部知识点掌握率上升',
        act: down.length ? '核查对应练习的表述与难度，下一课重讲并重测' : '进入下一单元，保留拓展任务'
      });
      var top = r.after.rules.rules[0];
      out.push({
        src: '课程延伸 · 关联规则',
        ev: top ? '最强规则：错「' + top.antecedent.join('+') + '」→ 错「' + top.consequent.join('+') +
          '」，置信度 ' + top.confidence + '，提升度 ' + top.lift : '无强关联规则',
        act: top ? '把「' + top.antecedent.join('+') + '」作为先行补救点' : '维持现有补偿路径'
      });
    }
    out.push({
      src: '三阶段综合',
      ev: '持续性困难学生 ' + (r.comprehensive.persistent.length ? r.comprehensive.persistent.join('、') : '无'),
      act: '安排个别辅导，结果回流下一课画像'
    });
    return out;
  }

  /* ============================================================ 事件绑定 */
  function bind() {
    $('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab'); if (!b) return;
      document.querySelectorAll('.tab').forEach(function (x) { x.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      $('panel-' + b.dataset.tab).classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('btnRun').addEventListener('click', run);
    $('btnReset').addEventListener('click', loadSample);
    $('btnExport').addEventListener('click', function () {
      if (!state.result) { toast('请先运行分析'); return; }
      var blob = new Blob([JSON.stringify({ meta: state.result.meta, teacher: state.result.teacher, student: state.result.student, comprehensive: state.result.comprehensive }, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'course-digital-profile.json';
      a.click();
      toast('已导出画像 JSON');
    });
    $('btnAddSeg').addEventListener('click', function () {
      window._segData.push({ name: '新环节', minutes: 5, key: false }); renderSegTable();
    });
    document.querySelectorAll('[data-file]').forEach(function (b) {
      b.addEventListener('click', function () { $('file' + b.dataset.file.slice(1)).click(); });
    });
    [['filePlan', 'fPlan'], ['fileItems', 'fItems'], ['fileResp', 'fResp'], ['filePost', 'fPost'],
     ['fileInterest', 'fInterest'], ['fileConf', 'fConf']].forEach(function (p) {
      var inp = $(p[0]);
      if (!inp) return;
      inp.addEventListener('change', function () {
        var f = inp.files[0]; if (!f) return;
        var fr = new FileReader();
        fr.onload = function () { $(p[1]).value = fr.result; renderChecklist(); toast('已读入 ' + f.name); };
        fr.readAsText(f, 'utf-8');
      });
    });
    ['fPlan', 'fStd', 'fItems', 'fResp', 'fPost', 'fInterest', 'fConf'].forEach(function (id) {
      $(id).addEventListener('input', function () { clearTimeout(window._cl); window._cl = setTimeout(renderChecklist, 260); });
    });
    document.querySelectorAll('.params input').forEach(function (i) {
      i.addEventListener('change', function () { if (state.ready) run(); });
    });
  }

  /* ============================================================ 启动 */
  window.addEventListener('DOMContentLoaded', function () {
    bind();
    loadSample();
    run();
  });
})();
