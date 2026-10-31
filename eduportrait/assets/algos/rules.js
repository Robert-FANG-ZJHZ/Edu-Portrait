/* =============================================================================
 * rules.js —— 关联规则挖掘（Apriori，纯 JS 实现）
 * 用途：课后错题的知识点共现模式 → 认知根源定位
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});
  var round = function (x, d) { var p = Math.pow(10, d === undefined ? 3 : d); return Math.round(x * p) / p; };

  function keyOf(set) { return set.slice().sort().join('|'); }

  /**
   * @param transactions 二维字符串数组（每个学生一个错题知识点集合）
   * @param minSup 最小支持度（0-1）
   * @param minConf 最小置信度（0-1）
   * @returns {{freq:Array, rules:Array}}
   */
  function apriori(transactions, minSup, minConf) {
    minSup = minSup === undefined ? 0.2 : minSup;
    minConf = minConf === undefined ? 0.6 : minConf;
    var N = transactions.length || 1;
    var minCount = Math.max(1, Math.ceil(minSup * N));

    // ---- 1 项集
    var counts = {};
    transactions.forEach(function (t) {
      var seen = {};
      t.forEach(function (x) { seen[x] = 1; });
      Object.keys(seen).forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
    });
    var L1 = Object.keys(counts).filter(function (x) { return counts[x] >= minCount; })
      .map(function (x) { return [x]; }).sort(function (a, b) { return counts[b[0]] - counts[a[0]]; });
    var allFreq = L1.map(function (s) { return { set: s, count: counts[s[0]], support: round(counts[s[0]] / N, 3) }; });

    function countSet(set) {
      var c = 0;
      for (var i = 0; i < transactions.length; i++) {
        var ok = true;
        for (var j = 0; j < set.length; j++) {
          if (transactions[i].indexOf(set[j]) < 0) { ok = false; break; }
        }
        if (ok) c++;
      }
      return c;
    }
    function joinGen(prev, k) {
      var cand = [], seen = {};
      for (var i = 0; i < prev.length; i++) {
        for (var j = i + 1; j < prev.length; j++) {
          var a = prev[i], b = prev[j], eq = true;
          for (var t = 0; t < k - 2; t++) if (a[t] !== b[t]) { eq = false; break; }
          if (!eq) continue;
          if (a[k - 2] >= b[k - 2]) continue;
          var s = a.slice(0, k - 2).concat([a[k - 2], b[k - 2]]);
          var kk = keyOf(s);
          if (seen[kk]) continue;
          seen[kk] = 1; cand.push(s);
        }
      }
      return cand;
    }

    var Lk = L1, k = 2;
    while (Lk.length > 1 && k <= 5) {
      var cand = joinGen(Lk, k);
      var next = [];
      cand.forEach(function (s) {
        var c = countSet(s);
        if (c >= minCount) {
          next.push(s);
          allFreq.push({ set: s, count: c, support: round(c / N, 3) });
        }
      });
      Lk = next; k++;
    }

    // ---- 规则生成
    var supMap = {};
    allFreq.forEach(function (f) { supMap[keyOf(f.set)] = f.support; });
    var rules = [];
    allFreq.forEach(function (f) {
      if (f.set.length < 2) return;
      for (var i = 0; i < f.set.length; i++) {
        var ante = f.set.filter(function (_, j) { return j !== i; });
        var cons = [f.set[i]];
        var supA = supMap[keyOf(ante)];
        if (!supA) continue;
        var conf = f.support / supA;
        if (conf < minConf) continue;
        var supC = supMap[keyOf(cons)] || 0;
        rules.push({
          antecedent: ante, consequent: cons,
          support: round(f.support, 3),
          confidence: round(conf, 3),
          lift: supC > 0 ? round(conf / supC, 3) : null
        });
      }
    });
    rules.sort(function (a, b) { return (b.lift || 0) - (a.lift || 0) || b.confidence - a.confidence; });
    return { freq: allFreq, rules: rules, n: N, minSup: minSup, minConf: minConf };
  }

  EP.rules = { apriori: apriori };
})(window);
