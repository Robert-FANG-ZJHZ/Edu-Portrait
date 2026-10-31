/* =============================================================================
 * cluster.js —— K-Means 聚类（k-means++ 初始化，固定种子，可复现）
 * 用途：学习兴趣量表 → 主动探究型 / 任务驱动型 / 被动接受型
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});
  var round = function (x, d) { var p = Math.pow(10, d === undefined ? 3 : d); return Math.round(x * p) / p; };
  var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };

  /** 列标准化 z-score */
  function standardize(X) {
    var m = X.length, n = X[0].length, j, i;
    var mu = [], sg = [];
    for (j = 0; j < n; j++) {
      var col = [];
      for (i = 0; i < m; i++) col.push(X[i][j]);
      var mm = mean(col);
      var v = mean(col.map(function (x) { return (x - mm) * (x - mm); }));
      mu.push(mm); sg.push(Math.sqrt(v) || 1);
    }
    var Z = X.map(function (row) { return row.map(function (v, j) { return (v - mu[j]) / sg[j]; }); });
    return { Z: Z, mu: mu, sigma: sg };
  }

  function dist2(a, b) {
    var s = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; s += d * d; }
    return s;
  }

  /**
   * @param X 原始矩阵（行=样本，列=特征）
   * @param k 簇数
   * @returns {{labels:number[], centroids:number[][], sizes:number[], inertia:number, silhouette:number, Z:number[][]}}
   */
  function kmeans(X, k, opts) {
    opts = opts || {};
    var st = standardize(X);
    var Z = st.Z, m = Z.length, n = Z[0].length;
    var rnd = EP.text.mulberry32(opts.seed || 42);
    // ---- k-means++ 初始化
    var cent = [Z[Math.floor(rnd() * m) % m].slice()];
    var d2 = new Float64Array(m).fill(Infinity);
    for (var c = 1; c < k; c++) {
      var sum = 0;
      for (var i = 0; i < m; i++) {
        d2[i] = Math.min(d2[i], dist2(Z[i], cent[c - 1]));
        sum += d2[i];
      }
      var target = rnd() * sum, acc = 0, pick = m - 1;
      for (i = 0; i < m; i++) { acc += d2[i]; if (acc >= target) { pick = i; break; } }
      cent.push(Z[pick].slice());
    }
    var labels = new Int32Array(m).fill(-1);
    for (var it = 0; it < (opts.maxIter || 100); it++) {
      var moved = false;
      for (i = 0; i < m; i++) {
        var best = 0, bd = Infinity;
        for (c = 0; c < k; c++) {
          var d = dist2(Z[i], cent[c]);
          if (d < bd) { bd = d; best = c; }
        }
        if (labels[i] !== best) { labels[i] = best; moved = true; }
      }
      for (c = 0; c < k; c++) {
        var members = [];
        for (i = 0; i < m; i++) if (labels[i] === c) members.push(Z[i]);
        if (!members.length) { cent[c] = Z[Math.floor(rnd() * m) % m].slice(); continue; }
        var nc = new Array(n).fill(0);
        members.forEach(function (v) { for (var j = 0; j < n; j++) nc[j] += v[j]; });
        cent[c] = nc.map(function (v) { return v / members.length; });
      }
      if (!moved && it > 2) break;
    }
    var inertia = 0;
    for (i = 0; i < m; i++) inertia += dist2(Z[i], cent[labels[i]]);

    // 轮廓系数（简化：用簇内/最近簇间距离）
    var sil = 0;
    for (i = 0; i < m; i++) {
      var sumD = new Array(k).fill(0), cnt = new Array(k).fill(0);
      for (var j2 = 0; j2 < m; j2++) {
        if (i === j2) continue;
        sumD[labels[j2]] += Math.sqrt(dist2(Z[i], Z[j2])); cnt[labels[j2]]++;
      }
      var ai = cnt[labels[i]] ? sumD[labels[i]] / cnt[labels[i]] : 0;
      var bi = Infinity;
      for (c = 0; c < k; c++) {
        if (c === labels[i] || !cnt[c]) continue;
        bi = Math.min(bi, sumD[c] / cnt[c]);
      }
      sil += (bi - ai) / Math.max(ai, bi, 1e-9);
    }
    sil = sil / m;

    var sizes = [];
    for (c = 0; c < k; c++) {
      sizes.push(Array.prototype.filter.call(labels, function (l) { return l === c; }).length);
    }
    // 还原到原始量纲的簇中心
    var rawCent = cent.map(function (cc) {
      return cc.map(function (v, j) { return round(v * st.sigma[j] + st.mu[j], 2); });
    });
    return {
      labels: Array.prototype.slice.call(labels),
      centroids: rawCent,
      zCentroids: cent.map(function (cc) { return cc.map(function (v) { return round(v, 3); }); }),
      sizes: sizes,
      inertia: round(inertia, 3),
      silhouette: round(sil, 3),
      Z: Z.map(function (r) { return r.map(function (v) { return round(v, 3); }); })
    };
  }

  /**
   * 把簇按「主动性综合分」排序后命名为学习类型
   * @param res kmeans 结果
   * @param featureNames 特征名
   * @param activeIdx 用于判定主动性的列下标（兴趣分 + 自主行为列）
   */
  function nameTypes(res, featureNames, activeIdx) {
    var score = res.centroids.map(function (c, i) {
      var s = 0;
      (activeIdx || featureNames.map(function (_, j) { return j; })).forEach(function (j) { s += (c[j] - 3) / 2; });
      return { i: i, s: s / (activeIdx ? activeIdx.length : featureNames.length) };
    });
    score.sort(function (a, b) { return b.s - a.s; });
    var names = ['主动探究型', '任务驱动型', '被动接受型', '待观察型', '混合型'];
    var out = [];
    score.forEach(function (o, rank) {
      out.push({
        cluster: o.i, name: names[rank] || ('类型' + (rank + 1)),
        score: round(o.s, 3), size: res.sizes[o.i], centroid: res.centroids[o.i]
      });
    });
    return out;
  }

  EP.cluster = { kmeans: kmeans, standardize: standardize, nameTypes: nameTypes };
})(window);
