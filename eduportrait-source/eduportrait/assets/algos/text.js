/* =============================================================================
 * text.js —— 教师侧文本分析内核（零依赖）
 *   1. 中文无词典分词：CJK 一元 + 二元字组，拉丁词/数字整词
 *   2. TF-IDF 向量空间 + 余弦相似度  → 教案目标 × 课标条目 契合度
 *   3. Collapsed Gibbs LDA 主题模型  → 素养活动主题分布
 *   4. 布鲁姆认知动词词典            → 知识深度
 *   5. 素养关键词词典                → 多元素养活动覆盖度
 *   6. 困惑自述词典编码              → 四类困惑（概念/方法/审题/迁移）
 * 所有函数均为纯函数，输入确定则输出确定，不含任何随机生成式内容。
 * ========================================================================== */
(function (global) {
  'use strict';
  var EP = (global.EP = global.EP || {});

  /* ---------------------------------------------------------------- 1. 分词 */
  var STOP = ('的 了 和 与 或 在 是 有 也 就 都 而 及 其 之 于 以 为 对 把 被 让 使 从 到 由 个 们 这 那 你 我 他 它 并 等 更 最 很 不 无 一个 我们 可以 通过 进行 能够 以及 因此 但是 如果 所以 学生 教师 教学 过程 内容 目标 要求 及其 中的 这种 他们 自己').split(/\s+/);
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = 1; });

  // 虚词字符：含这些字符的 n-gram 直接丢弃（保留实词组合，显著降低向量噪声）
  var FUNC = '的了和与是有着也就都而及其之于以为对把被让使从到由能会可并等更最很不但无中个们这那将或且则若如因所、，；：（）()·「」《》0123456789 \t';
  function hasFunc(s) {
    for (var i = 0; i < s.length; i++) if (FUNC.indexOf(s[i]) >= 0) return true;
    return false;
  }

  function isCJK(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0x4e00 && c <= 0x9fff) || (c >= 0x3400 && c <= 0x4dbf);
  }

  /** 把一段文本切成 token 数组（CJK 一元+二元，拉丁/数字整词） */
  function tokenize(text) {
    text = String(text || '').toLowerCase();
    var out = [];
    var buf = '';
    var i;
    for (i = 0; i < text.length; i++) {
      var ch = text[i];
      if (isCJK(ch)) {
        if (buf) { out.push(buf); buf = ''; }
        out.push(ch);                                  // 一元
        if (i + 1 < text.length && isCJK(text[i + 1])) {
          out.push(ch + text[i + 1]);                  // 二元（顺序敏感）
        }
      } else if (/[a-z0-9]/.test(ch)) {
        buf += ch;
      } else {
        if (buf) { out.push(buf); buf = ''; }
      }
    }
    if (buf) out.push(buf);
    return out.filter(function (t) { return !STOPSET[t] && !hasFunc(t); });
  }

  /** 从教案文本中抽取教学目标条目（剔除章节标题、空行、标点结尾的短句） */
  function extractObjectives(plan) {
    var sents = splitSentences(plan);
    var out = sents.filter(function (s) {
      if (s.length < 10) return false;
      if (/[：:]$/.test(s)) return false;          // "教学目标：" 这类小标题
      if (/^课题|^教学重点|^教学难点|^教学过程|^教学模式/.test(s)) return false;
      return true;
    });
    // 优先保留编号条目与目标段
    var numbered = out.filter(function (s) { return /^[0-9①-⑩]/.test(s.replace(/^[一二三四五六七八九十]/, '1')); });
    return (numbered.length >= 3 ? numbered : out).slice(0, 12);
  }

  /** 按标点切句 */
  function splitSentences(text) {
    return String(text || '')
      .split(/[\n；;。！？!?\r]+/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length >= 4; });
  }

  /* ------------------------------------------------------------ 2. TF-IDF */
  function buildVocab(docs) {
    var vocab = {};
    docs.forEach(function (d) {
      d.forEach(function (t) {
        if (!vocab[t]) vocab[t] = { df: 0, id: Object.keys(vocab).length };
      });
    });
    docs.forEach(function (d) {
      var seen = {};
      d.forEach(function (t) { if (!seen[t]) { seen[t] = 1; vocab[t].df++; } });
    });
    var N = docs.length || 1;
    Object.keys(vocab).forEach(function (t) {
      vocab[t].idf = Math.log(1 + N / (1 + vocab[t].df)) + 0.0;
    });
    return vocab;
  }

  function vectorize(tokens, vocab) {
    var tf = {};
    tokens.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
    var vec = [];
    Object.keys(tf).forEach(function (t) {
      if (!vocab[t]) return;
      vec.push([vocab[t].id, (1 + Math.log(tf[t])) * vocab[t].idf]);
    });
    return vec;
  }

  function l2norm(vec) {
    var s = 0;
    vec.forEach(function (p) { s += p[1] * p[1]; });
    s = Math.sqrt(s);
    if (s > 0) vec.forEach(function (p) { p[1] = p[1] / s; });
    return vec;
  }

  function cosine(a, b) {
    var i = 0, j = 0, s = 0;
    while (i < a.length && j < b.length) {
      if (a[i][0] === b[j][0]) { s += a[i][1] * b[j][1]; i++; j++; }
      else if (a[i][0] < b[j][0]) i++;
      else j++;
    }
    return s;
  }

  /**
   * 计算「教案目标句」与「课标条目」的语义相似度矩阵
   * @returns {{matrix:number[][], stdBest:number[], objBest:number[], align:number, pairs:Array}}
   *   align = 课标契合度（0-100）：双向最佳匹配的加权平均
   */
  /**
   * 教案目标 × 课标条目：余弦相似度矩阵 + IDF 加权词条覆盖率
   *   相似度  —— TF-IDF 向量的余弦，反映"哪条目标对应哪条课标"（量级 0~1，句级文本天然偏低）
   *   覆盖率  —— 课标条目中长度≥2 的实词 n-gram，按 IDF 加权后有多少比例出现在教案目标集合中
   *   契合度  —— 各课标条目覆盖率的均值 ×100（可解释为"教案语言对课标语言的覆盖程度"）
   * @returns {{matrix,stdBest,objBest,stdCoverage,covered,align,raw,pairs}}
   */
  function standardsAlignment(objectives, standards, opts) {
    opts = opts || {};
    var threshold = opts.threshold === undefined ? 0.25 : opts.threshold;
    var objTok = objectives.map(tokenize);
    var stdTok = standards.map(tokenize);
    var vocab = buildVocab(objTok.concat(stdTok));
    var O = objTok.map(function (t) { return l2norm(vectorize(t, vocab)); });
    var S = stdTok.map(function (t) { return l2norm(vectorize(t, vocab)); });
    var matrix = O.map(function (o) {
      return S.map(function (s) { return cosine(o, s); });
    });
    var stdBest = S.map(function (_, j) {
      return matrix.reduce(function (m, row) { return Math.max(m, row[j]); }, 0);
    });
    var objBest = matrix.map(function (row) {
      return row.reduce(function (m, v) { return Math.max(m, v); }, 0);
    });
    var pairs = [];
    matrix.forEach(function (row, i) {
      var best = 0, bj = -1;
      row.forEach(function (v, j) { if (v > best) { best = v; bj = j; } });
      if (bj >= 0) pairs.push({ obj: i, std: bj, sim: best });
    });
    // ---- IDF 加权词条覆盖率（只看长度≥2 的实词 n-gram，避免单字虚词虚高）
    var objSet = {};
    objTok.forEach(function (d) { d.forEach(function (t) { if (t.length >= 2) objSet[t] = 1; }); });
    var stdCoverage = stdTok.map(function (d) {
      var seen = {}, u = [];
      d.forEach(function (t) { if (t.length >= 2 && !seen[t]) { seen[t] = 1; u.push(t); } });
      var tot = 0, hit = 0;
      u.forEach(function (w) { var w2 = vocab[w] ? vocab[w].idf : 0; tot += w2; if (objSet[w]) hit += w2; });
      return tot > 0 ? hit / tot : 0;
    });
    var covered = stdCoverage.filter(function (v) { return v >= threshold; }).length;
    var mO = mean(objBest), mS = mean(stdBest);
    // 原始契合度（余弦量级）与契合度指数（0-100，基于词条覆盖率）
    var raw = Math.sqrt(Math.max(0, mO) * Math.max(0, mS));
    var align = round(100 * mean(stdCoverage), 1);
    return {
      matrix: matrix, stdBest: stdBest, objBest: objBest,
      stdCoverage: stdCoverage.map(function (v) { return round(v, 4); }),
      covered: covered, threshold: threshold,
      raw: round(raw, 4), align: align, pairs: pairs
    };
  }

  /**
   * 知识点覆盖判定：把知识点名切成实词二字片段，只要有一个片段在教案中出现即视为覆盖
   * @returns {{hit:boolean, count:number, parts:string[]}}
   */
  function kpCoverage(planText, kpName) {
    var parts = [], i;
    for (i = 0; i + 2 <= kpName.length; i++) {
      var g = kpName.substr(i, 2);
      if (!hasFunc(g) && parts.indexOf(g) < 0) parts.push(g);
    }
    if (!parts.length) parts = [kpName];
    var count = 0, hitParts = [];
    parts.forEach(function (g) {
      var c = countOccur(planText, g);
      if (c > 0) { count += c; hitParts.push(g); }
    });
    return { hit: hitParts.length > 0, count: count, parts: hitParts };
  }

  /* --------------------------------------------------------------- 3. LDA */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Collapsed Gibbs Sampling LDA（固定种子，结果可复现）
   * @param docs token 数组构成的文档集合
   * @param K 主题数
   * @returns {{topics:Array, docTopic:number[][], perplexity:number}}
   */
  function lda(docs, K, opts) {
    opts = opts || {};
    var iters = opts.iters || 220, burn = opts.burn || 60;
    var alpha = opts.alpha || 0.5, beta = opts.beta || 0.02;
    var rnd = mulberry32(opts.seed || 20261005);
    var V = {}, vocab = [];
    var docWords = docs.map(function (d) {
      return d.map(function (w) {
        if (V[w] === undefined) { V[w] = vocab.length; vocab.push(w); }
        return V[w];
      });
    });
    var nw = [], nd = [], nwsum = [], ndsum = [], z = [];
    var k, i;
    for (k = 0; k < K; k++) { nw.push(new Float64Array(vocab.length)); nwsum.push(0); }
    docWords.forEach(function (ws) {
      var row = new Float64Array(K), zs = new Int32Array(ws.length);
      for (i = 0; i < ws.length; i++) {
        var t = Math.floor(rnd() * K) % K;
        zs[i] = t; nw[t][ws[i]]++; nwsum[t]++; row[t]++;
      }
      nd.push(row); ndsum.push(ws.length); z.push(zs);
    });
    var Vlen = vocab.length;
    for (var it = 0; it < iters; it++) {
      for (var d = 0; d < docWords.length; d++) {
        var ws = docWords[d];
        for (i = 0; i < ws.length; i++) {
          var w = ws[i], old = z[d][i];
          nw[old][w]--; nwsum[old]--; nd[d][old]--; ndsum[d]--;
          var p = new Float64Array(K), sum = 0;
          for (k = 0; k < K; k++) {
            p[k] = ((nw[k][w] + beta) / (nwsum[k] + Vlen * beta)) *
                   ((nd[d][k] + alpha) / (ndsum[d] + K * alpha));
            sum += p[k];
          }
          var u = rnd() * sum, acc = 0, nk = K - 1;
          for (k = 0; k < K; k++) { acc += p[k]; if (u <= acc) { nk = k; break; } }
          z[d][i] = nk; nw[nk][w]++; nwsum[nk]++; nd[d][nk]++; ndsum[d]++;
        }
      }
    }
    // 主题词（按 P(w|k) 降序，过滤停用词与单字噪声优先保留二元词）
    var topics = [];
    for (k = 0; k < K; k++) {
      var arr = [];
      for (var v = 0; v < Vlen; v++) {
        arr.push({ w: vocab[v], p: (nw[k][v] + beta) / (nwsum[k] + Vlen * beta) });
      }
      arr.sort(function (a, b) { return b.p - a.p; });
      var picked = [], seenRoot = {};
      arr.forEach(function (e) {
        if (picked.length >= 8) return;
        var root = e.w.length > 1 ? e.w[0] : e.w;
        if (seenRoot[root] >= 2) return;
        seenRoot[root] = (seenRoot[root] || 0) + 1;
        picked.push(e);
      });
      topics.push({
        id: k,
        weight: round(ndsum.reduce(function (s, _, di) { return s + nd[di][k]; }, 0), 0),
        top: picked.map(function (e) { return { w: e.w, p: round(e.p * 1000, 2) }; })
      });
    }
    var docTopic = nd.map(function (row) {
      var s = 0;
      for (k = 0; k < K; k++) s += row[k];
      return Array.prototype.map.call(row, function (v) { return round(s ? v / s : 0, 3); });
    });
    return { topics: topics, docTopic: docTopic, vocabSize: Vlen, K: K };
  }

  /* ------------------------------------------------- 4. 布鲁姆认知层级词典 */
  var BLOOM = [
    { lv: 1, name: '记忆', words: ['说出', '写出', '记住', '复述', '背诵', '辨认', '指出', '回忆'] },
    { lv: 2, name: '理解', words: ['说明', '解释', '概括', '举例', '判断', '比较', '理解', '体会', '识别', '区分'] },
    { lv: 3, name: '应用', words: ['运用', '使用', '计算', '画出', '求解', '求', '列出', '演示', '会用'] },
    { lv: 4, name: '分析', words: ['分析', '归纳', '推导', '探究', '发现', '比较', '剖析', '拆解'] },
    { lv: 5, name: '评价', words: ['评价', '质疑', '论证', '检验', '反思', '判断优劣'] },
    { lv: 6, name: '创造', words: ['设计', '构建', '建立', '建模', '提出', '编制', '创造', '解决', '模型'] }
  ];

  /** 知识深度：命中动词所在层级（取最高）的均值，归一化到 0-100 */
  function cognitiveDepth(objectives) {
    var hits = [];
    objectives.forEach(function (o) {
      var best = 0, name = '未标注';
      BLOOM.forEach(function (g) {
        g.words.forEach(function (w) {
          if (o.indexOf(w) >= 0 && g.lv > best) { best = g.lv; name = g.name; }
        });
      });
      hits.push({ text: o, level: best, levelName: name });
    });
    var lv = hits.filter(function (h) { return h.level > 0; }).map(function (h) { return h.level; });
    var score = lv.length ? 100 * mean(lv) / 6 : 0;
    return { score: round(score, 1), hits: hits, coverage: round(100 * lv.length / (objectives.length || 1), 1) };
  }

  /* ------------------------------------------------------- 5. 素养词典 */
  var LITERACY = ['抽象能力', '运算能力', '几何直观', '空间观念', '推理能力',
    '数据观念', '模型观念', '应用意识', '创新意识', '合作交流', '科学态度',
    '数形结合', '符号意识', '模型意识'];

  function literacyCoverage(text) {
    var hit = [];
    LITERACY.forEach(function (w) {
      var n = countOccur(text, w);
      if (n > 0) hit.push({ name: w, count: n });
    });
    return { hit: hit, count: hit.length, total: LITERACY.length, score: round(100 * hit.length / 8, 1) };
  }

  /* ------------------------------------------------- 6. 困惑自述词典编码 */
  var CONFUSION = [
    { key: '概念理解不清', words: ['不懂', '不明白', '不清楚', '概念', '定义', '记混', '分不清', '什么意思', '没弄懂', '混淆'] },
    { key: '方法应用错误', words: ['算错', '步骤', '方法', '不会用', '写反', '出错', '公式', '代入', '不知道先', '总错'] },
    { key: '审题遗漏', words: ['漏看', '没注意', '看错', '漏了', '条件', '没看全', '答非所问', '审题', '没看到'] },
    { key: '知识迁移困难', words: ['换个', '情境', '不会了', '联系不起来', '迁移', '变式', '实际', '换说法', '生活中'] }
  ];
  var CONF_KEYS = CONFUSION.map(function (c) { return c.key; });

  /** 对一条自述编码：返回各类命中分与首选类别 */
  function encodeConfusion(text) {
    var t = String(text || '');
    var scores = {};
    CONFUSION.forEach(function (c) {
      var s = 0;
      c.words.forEach(function (w) { s += countOccur(t, w) * (w.length >= 3 ? 2 : 1); });
      scores[c.key] = s;
    });
    var top = CONF_KEYS[0], tv = -1;
    CONF_KEYS.forEach(function (k) { if (scores[k] > tv) { tv = scores[k]; top = k; } });
    return { scores: scores, primary: tv > 0 ? top : '未编码', strength: tv };
  }

  /* --------------------------------------------------------------- 工具 */
  function mean(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; }
  function round(x, d) { var p = Math.pow(10, d || 0); return Math.round(x * p) / p; }
  function countOccur(s, sub) {
    var n = 0, i = 0;
    while ((i = s.indexOf(sub, i)) >= 0) { n++; i += sub.length; }
    return n;
  }

  EP.text = {
    tokenize: tokenize, splitSentences: splitSentences,
    buildVocab: buildVocab, vectorize: vectorize, cosine: cosine,
    standardsAlignment: standardsAlignment, lda: lda, kpCoverage: kpCoverage,
    extractObjectives: extractObjectives,
    cognitiveDepth: cognitiveDepth, literacyCoverage: literacyCoverage,
    encodeConfusion: encodeConfusion, CONF_KEYS: CONF_KEYS,
    mean: mean, round: round, countOccur: countOccur, mulberry32: mulberry32
  };
})(window);
