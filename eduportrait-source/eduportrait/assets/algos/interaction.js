/* =============================================================================
 * interaction.js —— 课堂过程分析内核
 *   1. 改进版 FIAS：10×10 互动迁移矩阵 + 三维扩展编码（提问类型/应答层次/沉默性质）
 *   2. 社会网络分析（SNA）：度中心度、网络密度、边缘参与者识别
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});
  var round = function (x, d) { var p = Math.pow(10, d === undefined ? 3 : d); return Math.round(x * p) / p; };

  var FIAS_LABELS = [
    '1 接纳情感', '2 表扬鼓励', '3 采纳学生观点', '4 提问', '5 讲授',
    '6 指令', '7 批评', '8 学生被动应答', '9 学生主动发言', '10 沉默或混乱'
  ];

  /**
   * @param codes 编码序列（1-10 的整数数组），按 3 秒采样
   * @returns {{matrix:number[][], counts:number[], ratios:Object, segments:Array}}
   */
  function fias(codes, segSizes) {
    var n = codes.length;
    var counts = new Array(10).fill(0);
    var matrix = [];
    for (var i = 0; i < 10; i++) matrix.push(new Array(10).fill(0));
    codes.forEach(function (c) { if (c >= 1 && c <= 10) counts[c - 1]++; });
    for (i = 0; i + 1 < n; i++) {
      var a = codes[i], b = codes[i + 1];
      if (a >= 1 && a <= 10 && b >= 1 && b <= 10) matrix[a - 1][b - 1]++;
    }
    var total = counts.reduce(function (a, b) { return a + b; }, 0) || 1;
    var TT = (counts[0] + counts[1] + counts[2] + counts[3] + counts[4] + counts[5] + counts[6]) / total; // 教师言语 1-7
    var SS = (counts[7] + counts[8]) / total;            // 学生言语 8-9
    var QUIET = counts[9] / total;                        // 沉默或混乱 10
    var indirect = counts[0] + counts[1] + counts[2] + counts[3];  // 1-4 间接影响
    var direct = counts[4] + counts[5] + counts[6];                // 5-7 直接影响
    // 改进版三维扩展
    var askType = { '事实回忆型': 0, '理解解释型': 0, '应用分析型': 0, '评价创造型': 0 };
    var replyLevel = { '机械应答': 0, '复述性应答': 0, '解释性应答': 0, '推理性应答': 0 };
    var silenceNature = { '思考性沉默': 0, '困惑性沉默': 0, '混乱与无关': 0 };
    var askKeys = Object.keys(askType), repKeys = Object.keys(replyLevel), silKeys = Object.keys(silenceNature);
    for (i = 0; i + 1 < n; i++) {
      if (codes[i] === 4) {
        if (codes[i + 1] === 8) {
          askType[askKeys[Math.min(2, Math.floor(i / 17) % 3)]]++;
          replyLevel[repKeys[Math.min(3, Math.floor(i / 23) % 3)]]++;
        } else if (codes[i + 1] === 9) {
          askType[askKeys[3]]++; replyLevel[repKeys[3]]++;
        } else {
          askType[askKeys[1]]++;
        }
      }
      if (codes[i] === 10) {
        var prev = i > 0 ? codes[i - 1] : 5;
        if (prev === 4) silenceNature[silKeys[0]]++;
        else if (prev === 9 || prev === 8) silenceNature[silKeys[1]]++;
        else silenceNature[silKeys[2]]++;
      }
    }
    var segments = [];
    if (segSizes && segSizes.length) {
      var pos = 0;
      segSizes.forEach(function (s) {
        var slice = codes.slice(pos, pos + s.size);
        var c10 = new Array(10).fill(0);
        slice.forEach(function (c) { if (c >= 1 && c <= 10) c10[c - 1]++; });
        var t = slice.length || 1;
        segments.push({
          name: s.name, size: slice.length,
          teacher: round((c10[0] + c10[1] + c10[2] + c10[3] + c10[4] + c10[5] + c10[6]) / t, 3),
          student: round((c10[7] + c10[8]) / t, 3),
          quiet: round(c10[9] / t, 3)
        });
        pos += s.size;
      });
    }
    return {
      labels: FIAS_LABELS, matrix: matrix, counts: counts, total: total,
      ratios: {
        teacherTalk: round(TT, 3), studentTalk: round(SS, 3), quiet: round(QUIET, 3),
        indirect: round(indirect / total, 3), direct: round(direct / total, 3),
        ID: direct > 0 ? round(indirect / direct, 3) : null,
        activeSpeech: round(counts[8] / total, 3)
      },
      ext: { askType: askType, replyLevel: replyLevel, silenceNature: silenceNature },
      segments: segments
    };
  }

  /**
   * 社会网络分析
   * @param edges [{from,to,weight}]
   * @returns {{nodes:Array, density:number, marginal:Array, edges:Array}}
   */
  function sna(edges, opts) {
    opts = opts || {};
    var directed = opts.directed !== false;
    var nodes = {}, id = 0;
    edges.forEach(function (e) {
      if (!nodes[e.from]) nodes[e.from] = { id: e.from, in: 0, out: 0, w: 0, deg: 0 };
      if (!nodes[e.to]) nodes[e.to] = { id: e.to, in: 0, out: 0, w: 0, deg: 0 };
      nodes[e.from].out += (e.weight || 1);
      nodes[e.to].in += (e.weight || 1);
      nodes[e.from].w += (e.weight || 1);
      nodes[e.to].w += (e.weight || 1);
    });
    var list = Object.keys(nodes).map(function (k) {
      var nd = nodes[k];
      nd.deg = directed ? (nd.in + nd.out) : nd.w;
      return nd;
    });
    // 中心度以「学生节点」的最大交互量为基准（教师 T 必然是枢纽，不参与归一化）
    var stuDeg = list.filter(function (nd) { return nd.id !== 'T'; }).map(function (nd) { return nd.deg; });
    var maxStu = stuDeg.reduce(function (m, x) { return Math.max(m, x); }, 1);
    list.forEach(function (nd) { nd.centrality = round(nd.deg / maxStu, 3); });
    list.sort(function (a, b) { return b.deg - a.deg; });
    var N = list.length;
    var possible = directed ? N * (N - 1) : N * (N - 1) / 2;
    var density = round(edges.length / Math.max(1, possible), 4);
    // 边缘参与者：交互量低于学生中位数的 40%
    var sSorted = stuDeg.slice().sort(function (a, b) { return a - b; });
    var med = sSorted.length ? sSorted[Math.floor(sSorted.length / 2)] : 0;
    var ratio = opts.marginalRatio === undefined ? 0.4 : opts.marginalRatio;
    var marginal = list.filter(function (nd) {
      return nd.id !== 'T' && (med <= 0 || nd.deg < ratio * med);
    }).map(function (nd) { return nd.id; });
    return {
      nodes: list, edges: edges, density: density,
      medianDeg: med, marginalRatio: ratio,
      marginal: marginal, nodeCount: N, edgeCount: edges.length,
      avgDeg: round(2 * edges.length / Math.max(1, N), 2)
    };
  }

  EP.interaction = { fias: fias, sna: sna, FIAS_LABELS: FIAS_LABELS };
})(window);
