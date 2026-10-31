/* =============================================================================
 * psych.js —— 学生侧测量内核（零依赖）
 *   1. CTT 经典测量理论：难度 P、区分度（点二列相关 / 高低分组法）、离散度
 *   2. IRT 二参数 Logistic（2PL）：Bock-Aitkin MML-EM 估计 a、b，EAP 估计能力 θ
 *   3. 知识点掌握概率矩阵、可疑题项识别
 *   4. BKT 贝叶斯知识追踪：坐标下降极大似然估计 pInit / pLearn / pGuess / pSlip
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});
  var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
  var round = function (x, d) { var p = Math.pow(10, d === undefined ? 3 : d); return Math.round(x * p) / p; };

  function sd(a) {
    if (a.length < 2) return 0;
    var m = mean(a);
    return Math.sqrt(mean(a.map(function (x) { return (x - m) * (x - m); })));
  }

  /** 皮尔逊相关 */
  function corr(x, y) {
    var mx = mean(x), my = mean(y), sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < x.length; i++) {
      var a = x[i] - mx, b = y[i] - my;
      sxy += a * b; sxx += a * a; syy += b * b;
    }
    var d = Math.sqrt(sxx * syy);
    return d > 0 ? sxy / d : 0;
  }

  /* ------------------------------------------------------------- 1. CTT */
  /**
   * @param resp 二维 0/1 作答矩阵 [学生][题]
   * @param items 题项元信息数组（含 kp, kpName）
   */
  function ctt(resp, items) {
    var n = resp.length, m = items.length;
    var total = resp.map(function (r) { return r.reduce(function (a, b) { return a + b; }, 0); });
    var out = [];
    for (var j = 0; j < m; j++) {
      var col = resp.map(function (r) { return r[j]; });
      var p = mean(col);
      // 点二列相关（区分度）
      var d = corr(col, total);
      // 高低分组法（前后 27%）
      var idx = total.map(function (v, i) { return [v, i]; }).sort(function (a, b) { return a[0] - b[0]; });
      var g = Math.max(1, Math.round(n * 0.27));
      var lo = idx.slice(0, g).map(function (x) { return resp[x[1]][j]; });
      var hi = idx.slice(n - g).map(function (x) { return resp[x[1]][j]; });
      var D = mean(hi) - mean(lo);
      out.push({
        qid: items[j].qid, kp: items[j].kp, kpName: items[j].kpName,
        lit: items[j].lit,
        difficultyP: round(p, 3),              // 答对率（P 越大越易）
        difficultyIndex: round(1 - p, 3),      // 难度指数
        discrimination: round(d, 3),           // 点二列区分度
        D: round(D, 3),                        // 高低分组区分度
        sd: round(sd(col), 3),                 // 离散度
        cv: p > 0 && p < 1 ? round(sd(col) / p, 3) : 0
      });
    }
    return out;
  }

  /** 可疑题项：区分度过低 / 难度极端 / 负区分 */
  function flagItems(cttRows, opt) {
    opt = opt || {};
    var minD = opt.minD === undefined ? 0.2 : opt.minD;
    var loP = opt.loP === undefined ? 0.15 : opt.loP;
    var hiP = opt.hiP === undefined ? 0.95 : opt.hiP;
    return cttRows.map(function (r) {
      var reasons = [];
      if (r.discrimination < minD) reasons.push('区分度不足(< ' + minD + ')');
      if (r.D < minD) reasons.push('高低分组区分度不足');
      if (r.difficultyP > hiP) reasons.push('过易(P>' + hiP + ')');
      if (r.difficultyP < loP) reasons.push('过难(P<' + loP + ')');
      if (r.discrimination < 0) reasons.push('负区分（需核查答案或表述）');
      return Object.assign({}, r, { flag: reasons.length > 0, reasons: reasons });
    });
  }

  /* ------------------------------------------------------------- 2. IRT */
  function logistic(a, b, t) {
    var z = 1.702 * a * (t - b);
    if (z > 30) return 1;
    if (z < -30) return 0;
    return 1 / (1 + Math.exp(-z));
  }

  /**
   * 2PL MML-EM（Bock & Aitkin，固定 Gauss-Hermite 网格）
   * 为抑制小样本（n≈30）下的边界解，对区分度 a 施加 log-normal(0, 0.5²) 弱先验。
   * @returns {{items:Array, ability:number[], theta:number[], loglik:number, iters:number}}
   */
  function irt2pl(resp, opts) {
    opts = opts || {};
    var n = resp.length, m = resp[0].length;
    var Q = opts.nodes || 21, span = opts.span || 4;
    var nodes = [], wts = [], s = 0;
    for (var q = 0; q < Q; q++) {
      var t = -span + (2 * span) * q / (Q - 1);
      var w = Math.exp(-0.5 * t * t);
      nodes.push(t); wts.push(w); s += w;
    }
    wts = wts.map(function (w) { return w / s; });

    var a = [], b = [];
    for (var j = 0; j < m; j++) {
      var p = mean(resp.map(function (r) { return r[j]; }));
      p = Math.min(0.98, Math.max(0.02, p));
      b.push(-Math.log(p / (1 - p)) / 1.702);
      a.push(1.0);
    }
    var post = [], loglik = 0, iters = 0;
    for (var it = 0; it < (opts.maxIter || 60); it++) {
      iters = it + 1;
      // ---- E 步
      post = [];
      var rjk = [], fjk = [];
      for (j = 0; j < m; j++) { rjk.push(new Float64Array(Q)); fjk.push(new Float64Array(Q)); }
      loglik = 0;
      for (var i = 0; i < n; i++) {
        var L = new Float64Array(Q), tot = 0;
        for (q = 0; q < Q; q++) {
          var lq = 1;
          for (j = 0; j < m; j++) {
            var pj = logistic(a[j], b[j], nodes[q]);
            lq *= (resp[i][j] ? pj : (1 - pj));
            if (lq < 1e-300) lq = 1e-300;
          }
          L[q] = wts[q] * lq; tot += L[q];
        }
        if (tot <= 0) tot = 1e-300;
        var pi = new Float64Array(Q);
        for (q = 0; q < Q; q++) { pi[q] = L[q] / tot; }
        post.push(pi);
        loglik += Math.log(tot);
        for (q = 0; q < Q; q++) {
          for (j = 0; j < m; j++) { rjk[j][q] += pi[q]; if (resp[i][j]) fjk[j][q] += pi[q]; }
        }
      }
      // ---- M 步（每道题数值牛顿法最大化边际似然）
      for (j = 0; j < m; j++) {
        var aj = a[j], bj = b[j];
        for (var st = 0; st < 12; st++) {
          var g = grad(j, aj, bj, nodes, rjk, fjk), H = hess(j, aj, bj, nodes, rjk, fjk);
          var det = H[0] * H[3] - H[1] * H[2];
          if (!isFinite(det) || Math.abs(det) < 1e-12) break;
          var da = (H[3] * g[0] - H[1] * g[1]) / det;
          var db = (H[0] * g[1] - H[2] * g[0]) / det;
          var step = 1, ok = false;
          for (var ls = 0; ls < 6; ls++) {
            var na = clamp(aj - step * da, 0.35, 2.5);
            var nb = clamp(bj - step * db, -4, 4);
            if (ll(j, na, nb, nodes, rjk, fjk) >= ll(j, aj, bj, nodes, rjk, fjk) - 1e-9) {
              aj = na; bj = nb; ok = true; break;
            }
            step *= 0.5;
          }
          if (!ok) break;
        }
        a[j] = aj; b[j] = bj;
      }
    }
    // EAP 能力估计
    var ability = post.map(function (pi) {
      var t = 0;
      for (var q = 0; q < Q; q++) t += pi[q] * nodes[q];
      return t;
    });
    var items = [];
    for (j = 0; j < m; j++) {
      var info = 0;
      for (q = 0; q < Q; q++) {
        var p = logistic(a[j], b[j], nodes[q]);
        info += wts[q] * Math.pow(1.702 * a[j], 2) * p * (1 - p);
      }
      items.push({
        a: round(a[j], 3), b: round(b[j], 3),
        info: round(info, 3),
        se: round(1 / Math.sqrt(Math.max(1e-6, info)), 3)
      });
    }
    return { items: items, ability: ability.map(function (t) { return round(t, 3); }), nodes: nodes, loglik: round(loglik, 3), iters: iters };
  }

  function ll(j, a, b, nodes, rjk, fjk) {
    var s = 0;
    for (var q = 0; q < nodes.length; q++) {
      var p = Math.min(1 - 1e-12, Math.max(1e-12, logistic(a, b, nodes[q])));
      s += fjk[j][q] * Math.log(p) + (rjk[j][q] - fjk[j][q]) * Math.log(1 - p);
    }
    // log-normal(0, 0.5²) 弱先验：把 a 拉回 1 附近，避免小样本下 a→0 的退化解
    var la = Math.log(Math.max(a, 1e-3));
    return s - (la * la) / (2 * 0.25);
  }
  function grad(j, a, b, nodes, rjk, fjk) {
    var h = 1e-4;
    return [(ll(j, a + h, b, nodes, rjk, fjk) - ll(j, a - h, b, nodes, rjk, fjk)) / (2 * h),
            (ll(j, a, b + h, nodes, rjk, fjk) - ll(j, a, b - h, nodes, rjk, fjk)) / (2 * h)];
  }
  function hess(j, a, b, nodes, rjk, fjk) {
    var h = 1e-3, f0 = ll(j, a, b, nodes, rjk, fjk);
    var faa = (ll(j, a + h, b, nodes, rjk, fjk) - 2 * f0 + ll(j, a - h, b, nodes, rjk, fjk)) / (h * h);
    var fbb = (ll(j, a, b + h, nodes, rjk, fjk) - 2 * f0 + ll(j, a, b - h, nodes, rjk, fjk)) / (h * h);
    var fab = (ll(j, a + h, b + h, nodes, rjk, fjk) - ll(j, a + h, b - h, nodes, rjk, fjk)
             - ll(j, a - h, b + h, nodes, rjk, fjk) + ll(j, a - h, b - h, nodes, rjk, fjk)) / (4 * h * h);
    return [faa, fab, fab, fbb];
  }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /** 掌握概率矩阵：P(θ_i, item_j)，并按知识点聚合 */
  function masteryMatrix(resp, irt, items) {
    var M = resp.map(function (row, i) {
      return row.map(function (_, j) { return logistic(irt.items[j].a, irt.items[j].b, irt.ability[i]); });
    });
    var kpMap = {};
    items.forEach(function (it, j) {
      if (!kpMap[it.kp]) kpMap[it.kp] = { kp: it.kp, name: it.kpName, cols: [] };
      kpMap[it.kp].cols.push(j);
    });
    var kps = Object.keys(kpMap).map(function (k) {
      var cols = kpMap[k].cols;
      var perStudent = M.map(function (row) {
        return round(mean(cols.map(function (c) { return row[c]; })), 3);
      });
      return {
        kp: k, name: kpMap[k].name, cols: cols,
        perStudent: perStudent,
        classMastery: round(mean(perStudent), 3),
        observed: round(mean(resp.map(function (r) { return mean(cols.map(function (c) { return r[c]; })); })), 3)
      };
    });
    return { M: M, kps: kps };
  }

  /* ------------------------------------------------------------- 3. BKT */
  /**
   * BKT：坐标下降极大似然。sequences 为多条 0/1 观测序列（按时序）。
   * @returns {{pInit,pLearn,pGuess,pSlip,loglik,curves:Array}}
   */
  function bkt(sequences, opts) {
    opts = opts || {};
    var p = { pInit: 0.3, pLearn: 0.3, pGuess: 0.2, pSlip: 0.15 };
    var keys = ['pInit', 'pLearn', 'pGuess', 'pSlip'];
    var grid = [];
    for (var i = 0; i <= 20; i++) grid.push(0.02 + i * 0.046);   // 0.02 ~ 0.94

    function seqLogLik(seq, p) {
      var L = p.pInit, ll = 0;
      for (var t = 0; t < seq.length; t++) {
        var pc = L * (1 - p.pSlip) + (1 - L) * p.pGuess;
        if (seq[t] === 1) { ll += Math.log(Math.max(1e-12, pc)); L = L * (1 - p.pSlip) / Math.max(1e-12, pc); }
        else { ll += Math.log(Math.max(1e-12, 1 - pc)); L = L * p.pSlip / Math.max(1e-12, 1 - pc); }
        L = L + (1 - L) * p.pLearn;
      }
      return ll;
    }
    function total(p) {
      var s = 0;
      for (var k = 0; k < sequences.length; k++) s += seqLogLik(sequences[k], p);
      return s;
    }
    for (var roundI = 0; roundI < 8; roundI++) {
      keys.forEach(function (key) {
        var best = p[key], bestLL = -Infinity;
        grid.forEach(function (v) {
          var trial = Object.assign({}, p); trial[key] = v;
          var l = total(trial);
          if (l > bestLL) { bestLL = l; best = v; }
        });
        p[key] = best;
      });
    }
    // 逐条序列的掌握概率轨迹
    var curves = sequences.map(function (seq) {
      var L = p.pInit, traj = [round(L, 3)];
      for (var t = 0; t < seq.length; t++) {
        var pc = L * (1 - p.pSlip) + (1 - L) * p.pGuess;
        L = seq[t] === 1 ? L * (1 - p.pSlip) / Math.max(1e-12, pc) : L * p.pSlip / Math.max(1e-12, 1 - pc);
        traj.push(round(L, 3));
        L = L + (1 - L) * p.pLearn;
      }
      return traj;
    });
    return {
      pInit: round(p.pInit, 3), pLearn: round(p.pLearn, 3),
      pGuess: round(p.pGuess, 3), pSlip: round(p.pSlip, 3),
      loglik: round(total(p), 3), curves: curves
    };
  }

  EP.psych = {
    ctt: ctt, flagItems: flagItems, irt2pl: irt2pl, logistic: logistic,
    masteryMatrix: masteryMatrix, bkt: bkt, mean: mean, sd: sd, corr: corr, round: round
  };
})(window);
