/* =============================================================================
 * pipeline.js —— 课程数字画像装配线
 * 输入：采集工作台的原始数据（教案、课标、题项、作答、量表、自述、课堂编码…）
 * 输出：教师画像 + 学生画像 + 三阶段综合画像（纯数值，可直接喂给 charts.js）
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});
  var T = EP.text, P = EP.psych, K = EP.cluster, R = EP.rules, I = EP.interaction;
  var round = function (x, d) { var p = Math.pow(10, d === undefined ? 3 : d); return Math.round(x * p) / p; };
  var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };

  /* ------------------------------------------------------------ CSV 解析 */
  function parseCsv(text) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim().length; });
    if (!lines.length) return { header: [], rows: [] };
    var header = splitLine(lines[0]);
    var rows = lines.slice(1).map(function (l) { return splitLine(l); });
    return { header: header, rows: rows };
  }
  function splitLine(l) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < l.length; i++) {
      var c = l[i];
      if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
      else if (c === ',' && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  /* --------------------------------------------------- 教学模式适配规则表 */
  var MODE_KEYS = [
    { key: '探究', words: ['探究', '探索', '发现', '猜想'] },
    { key: '合作', words: ['合作', '小组', '讨论', '交流'] },
    { key: '讲授', words: ['讲授', '讲解', '讲评', '讲述'] },
    { key: '练习', words: ['练习', '训练', '巩固', '检测'] },
    { key: '情境', words: ['情境', '生活', '真实', '问题情境'] }
  ];
  // 教学模式 × 学习类型 适配度（0-100，规则表，可在设置中改写）
  var FIT_TABLE = {
    '探究': { '主动探究型': 88, '任务驱动型': 62, '被动接受型': 35 },
    '合作': { '主动探究型': 80, '任务驱动型': 72, '被动接受型': 48 },
    '讲授': { '主动探究型': 45, '任务驱动型': 70, '被动接受型': 78 },
    '练习': { '主动探究型': 40, '任务驱动型': 80, '被动接受型': 70 },
    '情境': { '主动探究型': 72, '任务驱动型': 78, '被动接受型': 65 }
  };
  var TYPE_ORDER = ['主动探究型', '任务驱动型', '被动接受型'];

  /* ==================================================================== */
  function analyse(input) {
    var out = { meta: input.lesson || {}, warnings: [] };
    var i, j;

    /* ------------------------------ 教师侧 ------------------------------ */
    var objectives = (input.lessonPlanObjectives && input.lessonPlanObjectives.length)
      ? input.lessonPlanObjectives
      : T.extractObjectives(input.lessonPlan);

    var alignRes = T.standardsAlignment(objectives, input.standards, { threshold: input.simThreshold });
    var depth = T.cognitiveDepth(objectives);
    var lit = T.literacyCoverage(input.lessonPlan || '');

    // 知识种类：教案命中的知识点数（知识点名切分为实词二字片段，命中任一片段即算覆盖）
    var kpNames = [];
    input.items.forEach(function (it) { if (kpNames.indexOf(it.kpName) < 0) kpNames.push(it.kpName); });
    var kpCov = kpNames.map(function (n) { return T.kpCoverage(input.lessonPlan, n); });
    var kpHit = kpCov.filter(function (c) { return c.hit; }).length;
    var kindScore = round(100 * kpHit / Math.max(1, kpNames.length), 1);

    // 知识广度：被覆盖的课标条目占比（IDF 加权词条覆盖率 ≥ 阈值）
    var THR = input.simThreshold === undefined ? 0.25 : input.simThreshold;
    var covered = alignRes.covered;
    var breadthScore = round(100 * covered / Math.max(1, input.standards.length), 1);

    // 分布平衡性：知识点提及次数的归一化香农熵
    var kpCnt = kpCov.map(function (c) { return c.count; });
    var tot = kpCnt.reduce(function (a, b) { return a + b; }, 0);
    var H = 0;
    if (tot > 0) {
      kpCnt.forEach(function (c) { if (c > 0) { var p = c / tot; H -= p * Math.log(p); } });
      H = H / Math.log(kpNames.length || 2);
    }
    var balanceScore = round(100 * Math.max(0, Math.min(1, H)), 1);

    var TARGET = input.target === undefined ? 60 : input.target;
    var fourDims = [
      { label: '知识种类', value: kindScore, target: TARGET, hint: '教案覆盖 ' + kpHit.length + '/' + kpNames.length + ' 个知识点' },
      { label: '知识深度', value: depth.score, target: TARGET, hint: '布鲁姆层级均值 × 100' },
      { label: '知识广度', value: breadthScore, target: TARGET, hint: '课标条目覆盖 ' + covered + '/' + input.standards.length + '（覆盖率≥' + THR + '）' },
      { label: '分布平衡性', value: balanceScore, target: TARGET, hint: '知识点分布归一化熵' }
    ];

    // 环节用时占比
    var segTotal = input.segments.reduce(function (a, s) { return a + (+s.minutes || 0); }, 0) || 1;
    var keyMin = input.segments.reduce(function (a, s) { return a + (s.key ? (+s.minutes || 0) : 0); }, 0);
    var segments = input.segments.map(function (s) {
      return { name: s.name, minutes: +s.minutes || 0, key: !!s.key, share: round((+s.minutes || 0) / segTotal, 3) };
    });

    // 主题模型（LDA）
    var docs = T.splitSentences(input.lessonPlan)
      .concat(input.standards.map(function (s) { return s; }))
      .map(T.tokenize).filter(function (d) { return d.length >= 3; });
    var ldaRes = null;
    try {
      ldaRes = T.lda(docs, input.topics || 4, { iters: 160, seed: 20261005 });
    } catch (e) { out.warnings.push('主题模型未运行：' + e.message); }

    out.teacher = {
      objectives: objectives,
      align: alignRes.align,
      matrix: alignRes.matrix,
      stdBest: alignRes.stdBest,
      objBest: alignRes.objBest,
      stdCoverage: alignRes.stdCoverage,
      standards: input.standards,
      threshold: THR,
      covered: covered,
      fourDims: fourDims,
      depth: depth,
      literacy: lit,
      segments: segments,
      segTotal: segTotal,
      keyShare: round(keyMin / segTotal, 3),
      mode: input.lesson.teacherMode || '',
      lda: ldaRes
    };

    /* ------------------------------ 学生侧 ------------------------------ */
    var items = input.items, resp = input.resp;
    var cttRows = P.ctt(resp, items);
    var flagged = P.flagItems(cttRows, { minD: input.minD, loP: input.loP, hiP: input.hiP });
    var irt = P.irt2pl(resp, { nodes: 21, maxIter: 40 });
    var mm = P.masteryMatrix(resp, irt, items);

    // 兴趣聚类
    var X = input.interest;
    var featNames = input.interestNames || [];
    var activeIdx = [];
    featNames.forEach(function (n, idx) { if (/q_|自主|拓展/.test(n)) activeIdx.push(idx); });
    var km = K.kmeans(X, input.k || 3, { seed: 42, maxIter: 80 });
    var types = K.nameTypes(km, featNames, activeIdx.length ? activeIdx : null);
    var typeOf = {};
    km.labels.forEach(function (l, i) {
      var t2 = types.filter(function (x) { return x.cluster === l; })[0];
      typeOf[i] = t2 ? t2.name : '未分类';
    });

    // 兴趣主题频次（评分 ≥ 4 记一次"高兴趣"）
    var topicFreq = (input.interestTopics || []).map(function (name, j2) {
      var c = 0;
      X.forEach(function (row) { if ((+row[j2] || 0) >= 4) c++; });
      return { label: name, value: c, unit: ' 人' };
    });

    // 困惑编码（自述 + 题项预设错因兜底）
    var kpList = mm.kps;
    var confMat = kpList.map(function (k) { return new Array(4).fill(0); });
    var confSev = kpList.map(function (k) { return new Array(4).fill(0); });
    var confDetail = [];
    input.resp.forEach(function (row, si) {
      var wrongIdx = [];
      row.forEach(function (v, j2) { if (!v) wrongIdx.push(j2); });
      if (!wrongIdx.length) return;
      var raw = input.confusions[si] || '';
      var enc = T.encodeConfusion(raw);
      var cat = enc.primary;
      if (cat === '未编码') {
        // 兜底：用错题中最难一题的预设错因
        var hardest = wrongIdx[wrongIdx.length - 1];
        cat = items[hardest].main_confusion || T.CONF_KEYS[0];
      }
      var ci = T.CONF_KEYS.indexOf(cat);
      if (ci < 0) ci = 0;
      // 归属知识点：错题中错误率最高（最难）的知识点
      var kpCount = {};
      wrongIdx.forEach(function (j2) { kpCount[items[j2].kp] = (kpCount[items[j2].kp] || 0) + 1; });
      var bestKp = Object.keys(kpCount).sort(function (a, b) { return kpCount[b] - kpCount[a]; })[0];
      var ki = kpList.findIndex(function (k) { return k.kp === bestKp; });
      if (ki < 0) ki = 0;
      confMat[ki][ci] += 1;
      var errRate = kpCount[bestKp] / Math.max(1, kpList[ki].cols.length);
      confSev[ki][ci] += Math.min(3, 1 + 2 * errRate);
      confDetail.push({ sid: input.sids[si], kp: kpList[ki].name, cat: cat, text: raw, auto: enc.primary !== '未编码' });
    });
    kpList.forEach(function (k, ki) {
      for (j = 0; j < 4; j++) confSev[ki][j] = round(confSev[ki][j] / (confMat[ki][j] || 1) * confMat[ki][j], 2);
    });
    var confTotal = [0, 0, 0, 0];
    confMat.forEach(function (row) { row.forEach(function (v, j2) { confTotal[j2] += v; }); });

    // 适配度：教学模式 × 学习类型
    var modeHits = MODE_KEYS.filter(function (m) {
      return m.words.some(function (w) { return (input.lesson.teacherMode || '').indexOf(w) >= 0; });
    }).map(function (m) { return m.key; });
    if (!modeHits.length) modeHits = ['讲授'];
    var typeCount = {};
    TYPE_ORDER.forEach(function (n) { typeCount[n] = 0; });
    km.labels.forEach(function (l) {
      var t2 = types.filter(function (x) { return x.cluster === l; })[0];
      if (t2) typeCount[t2.name] = (typeCount[t2.name] || 0) + 1;
    });
    var fitRows = modeHits.map(function (mk) {
      var row = { mode: mk, parts: [] };
      var weighted = 0, totN = 0;
      TYPE_ORDER.forEach(function (tn) {
        var f = (FIT_TABLE[mk] && FIT_TABLE[mk][tn]) || 60;
        row.parts.push({ name: tn, value: f, n: typeCount[tn] || 0 });
        weighted += f * (typeCount[tn] || 0); totN += (typeCount[tn] || 0);
      });
      row.fit = round(totN ? weighted / totN : 0, 1);
      return row;
    });
    var overallFit = round(mean(fitRows.map(function (r) { return r.fit; })), 1);

    out.student = {
      sids: input.sids, items: items, ctt: cttRows, flagged: flagged,
      irt: irt, mastery: mm, ability: irt.ability,
      kps: kpList,
      cluster: km, types: types, typeOf: typeOf, typeCount: typeCount,
      interestNames: featNames, topicFreq: topicFreq,
      confMat: confMat, confSev: confSev, confKeys: T.CONF_KEYS, confTotal: confTotal,
      confDetail: confDetail,
      fit: { rows: fitRows, overall: overallFit, modes: modeHits, table: FIT_TABLE },
      scoreRate: round(mean(resp.map(function (r) { return mean(r); })), 3)
    };

    /* ------------------------------ 课堂教学 ----------------------------- */
    if (input.fiasCodes && input.fiasCodes.length) {
      out.inClass = {
        fias: I.fias(input.fiasCodes, input.fiasSegments),
        sns: I.sna(input.snsEdges, { marginalThreshold: input.marginalThreshold })
      };
    }

    /* ------------------------------ 课程延伸 ----------------------------- */
    if (input.post && input.post.length) {
      var postCtt = P.ctt(input.post, items);
      var mmPost = P.masteryMatrix(input.post, irt, items);
      var slopes = kpList.map(function (k, ki) {
        return {
          label: k.name,
          from: round(mean(resp.map(function (r) { return mean(k.cols.map(function (c) { return r[c]; })); })), 3),
          to: round(mean(input.post.map(function (r) { return mean(k.cols.map(function (c) { return r[c]; })); })), 3)
        };
      });
      // 错题关联规则
      var trans = [];
      input.post.forEach(function (row) {
        var set = [];
        row.forEach(function (v, j2) { if (!v) set.push(items[j2].kp + ' ' + items[j2].kpName); });
        if (set.length) trans.push(set);
      });
      var rules = R.apriori(trans, input.minSup === undefined ? 0.2 : input.minSup, input.minConf === undefined ? 0.6 : input.minConf);
      // BKT 序列（每个知识点：课前题 → 课后题）
      var seqs = [], seqMeta = [];
      kpList.forEach(function (k) {
        resp.forEach(function (_, si) {
          var seq = [];
          k.cols.forEach(function (c) { seq.push(resp[si][c] ? 1 : 0); });
          k.cols.forEach(function (c) { seq.push(input.post[si][c] ? 1 : 0); });
          if (seq.length >= 2) { seqs.push(seq); seqMeta.push({ kp: k.kp, sid: input.sids[si] }); }
        });
      });
      var bktRes = null;
      try { bktRes = P.bkt(seqs, {}); } catch (e) { out.warnings.push('BKT 未运行：' + e.message); }
      var kpBkt = [];
      if (bktRes) {
        kpList.forEach(function (k) {
          var idxs = [];
          seqMeta.forEach(function (m, mi) { if (m.kp === k.kp) idxs.push(mi); });
          var finals = idxs.map(function (mi) { return bktRes.curves[mi][bktRes.curves[mi].length - 1]; });
          var starts = idxs.map(function (mi) { return bktRes.curves[mi][0]; });
          kpBkt.push({
            kp: k.kp, name: k.name,
            pre: round(mean(starts), 3), post: round(mean(finals), 3),
            gain: round(mean(finals) - mean(starts), 3)
          });
        });
      }
      // 瀑布图：总体正确率 ← 各类错因扣减
      var postRate = round(mean(input.post.map(function (r) { return mean(r); })), 3);
      var wf = [{ label: '理想作答', value: 100, type: 'total' }];
      var lossSum = confTotal.reduce(function (a, b) { return a + b; }, 0) || 1;
      T.CONF_KEYS.forEach(function (key, idx) {
        var share = confTotal[idx] / lossSum;
        wf.push({ label: key, value: -round(100 * (1 - postRate) * share, 1) });
      });
      wf.push({ label: '课后正确率', value: round(100 * postRate, 1), type: 'total' });

      out.after = {
        postCtt: postCtt, masteryPost: mmPost, slopes: slopes,
        rules: rules, bkt: bktRes, kpBkt: kpBkt, waterfall: wf,
        postRate: postRate, retention: bktRes ? round(mean(kpBkt.map(function (k) { return k.post; })), 3) : null
      };
    }

    /* --------------------------- 三阶段综合评判 -------------------------- */
    var cent = {}, maxStu = 0.001;
    if (out.inClass) out.inClass.sns.nodes.forEach(function (n) { cent[n.id] = n.centrality; });
    input.sids.forEach(function (sid) { if (cent[sid] > maxStu) maxStu = cent[sid]; });
    var parRows = input.sids.map(function (sid, si) {
      var preMastery = mean(kpList.map(function (k) { return k.perStudent[si]; }));
      var postMastery = out.after ? mean(out.after.masteryPost.kps.map(function (k) { return k.perStudent[si]; })) : null;
      var engage = cent[sid] === undefined ? 0 : cent[sid] / maxStu;
      var errKinds = 0;
      if (out.after) {
        var seen = {};
        input.post[si].forEach(function (v, j2) { if (!v) seen[items[j2].main_confusion] = 1; });
        errKinds = Object.keys(seen).length;
      }
      return {
        name: sid, si: si, pre: preMastery,
        post: postMastery === null ? preMastery : postMastery,
        engage: engage, errKinds: errKinds
      };
    });
    // 持续性学习困难：课前、课后均处于班级后 30%，且课后掌握概率仍未过半
    var preRank = rankPct(parRows.map(function (r) { return r.pre; }));
    var postRank = rankPct(parRows.map(function (r) { return r.post; }));
    parRows.forEach(function (r) {
      r.persistent = preRank[r.si] <= 0.3 && postRank[r.si] <= 0.3 && r.post < 0.5;
      r.values = [[r.pre, r.engage, r.post, r.errKinds / 4]];
      r.highlight = r.persistent;
      r.color = r.persistent ? EP.charts.C.red : EP.charts.C.blue;
      delete r.si;
    });
    var skMat = input.sids.map(function (_, si) {
      return kpList.map(function (k, ki) {
        var v = out.after ? out.after.masteryPost.kps[ki].perStudent[si] : k.perStudent[si];
        return round(v, 3);
      });
    });
    out.comprehensive = {
      parallel: {
        rows: parRows,
        axes: [
          { name: '预备·掌握概率', min: 0, max: 1 },
          { name: '课中·互动中心度', min: 0, max: 1 },
          { name: '延伸·掌握概率', min: 0, max: 1 },
          { name: '延伸·错因复杂度', min: 0, max: 1 }
        ]
      },
      studentKp: { mat: skMat, rowLabels: input.sids, colLabels: kpList.map(function (k) { return k.name; }) },
      persistent: parRows.filter(function (r) { return r.highlight; }).map(function (r) { return r.name; })
    };

    return out;
  }

  function rankPct(arr) {
    var idx = arr.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return a[0] - b[0]; });
    var out = new Array(arr.length);
    idx.forEach(function (p, r) { out[p[1]] = (r + 1) / arr.length; });
    return out;
  }

  EP.pipeline = { analyse: analyse, parseCsv: parseCsv, FIT_TABLE: FIT_TABLE, MODE_KEYS: MODE_KEYS, TYPE_ORDER: TYPE_ORDER, rankPct: rankPct };
})(window);
