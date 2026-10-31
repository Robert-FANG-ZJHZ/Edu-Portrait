# EduPortrait 源码地图

> 在线链接 https://abe63f7604a9e56bc.app.workbuddy.host/?sharecode=JM3SAR2THJ 背后的全部源码
> 目录：`/workspace/eduportrait`　技术栈：原生 HTML + CSS + JavaScript，**零依赖、零构建、可离线**

## 目录树

```
eduportrait/
├── index.html                 单页应用骨架（7 个页签的容器 + 脚本加载顺序）        289 行
├── LICENSE                    MIT                                                    21 行
├── README.md                  项目说明、快速开始、数据格式、伦理声明               122 行
├── eduportrait-standalone.html  由脚本内联打包的单文件版（file:// 双击即用）      3131 行
├── assets/
│   ├── style.css              界面样式（浅色学术风、响应式、图表容器）            165 行
│   ├── charts.js              手写 SVG 图表库（13 类图）                           516 行
│   ├── pipeline.js            画像装配线：把采集数据算成画像                      361 行
│   ├── app.js                 界面逻辑：采集 → 分析 → 渲染                         629 行
│   ├── algos/
│   │   ├── text.js            分词 / TF-IDF / LDA / 布鲁姆词典 / 困惑编码          373 行
│   │   ├── psych.js           CTT / IRT-2PL(EM) / 掌握概率 / BKT                   297 行
│   │   ├── cluster.js         z-score / k-means++ / 轮廓系数 / 类型命名            141 行
│   │   ├── rules.js           Apriori 关联规则                                     104 行
│   │   └── interaction.js     改进版 FIAS / 社会网络分析                           135 行
│   └── data/
│       └── sample.js          示例课数据（模拟生成，学号匿名）                      92 行
├── .gitignore                （构建产物与临时文件不入库）
├── CONTRIBUTING.md           贡献指南：目录约定、提交规范、PR 自检
├── CHANGELOG.md              v1.0.0 变更记录与已知限制
└── tools/
    ├── gen_sample.py          示例数据生成器（固定种子 20261005，可复现）        284 行
    └── build_standalone.py    打包为单文件 HTML（产物不入仓）                     64 行
```

## Git 仓库状态

```
分支  main
提交  12176e6  feat: 课程数字画像 EduPortrait v1.0.0
标签  v1.0.0
文件  19 个，3 879 行
```

`eduportrait-standalone.html` 为构建产物，已在 `.gitignore` 中排除，
需要时用 `python3 tools/build_standalone.py` 重新生成。

合计：源码（不含单文件版）约 **2 845 行**。

## 加载顺序（必须按此顺序，均为经典 script 标签，无模块化）

```
text.js → psych.js → cluster.js → rules.js → interaction.js
        → charts.js → pipeline.js → data/sample.js → app.js
```

`charts.js` 必须先于 `pipeline.js`（pipeline 会用到 `EP.charts.C` 的配色常量）。

## 各文件职责与关键函数

### assets/algos/text.js —— 教师侧文本分析
| 函数 | 作用 |
| --- | --- |
| `tokenize(s)` | CJK 一元+二元字组，拉丁词整词；虚词字符过滤 |
| `splitSentences(s)` | 按标点切句 |
| `extractObjectives(plan)` | 从教案文本抽取教学目标句（剔除小标题） |
| `buildVocab / vectorize / cosine` | TF-IDF 向量空间 |
| `standardsAlignment(obj, std, opt)` | 余弦相似度矩阵 + IDF 加权词条覆盖率 → 契合度 |
| `lda(docs, K, opt)` | Collapsed Gibbs Sampling 主题模型 |
| `cognitiveDepth(obj)` | 布鲁姆六层动词词典 → 知识深度 |
| `literacyCoverage(text)` | 素养关键词词典命中 |
| `encodeConfusion(text)` | 四类困惑词典编码（概念/方法/审题/迁移） |
| `kpCoverage(plan, kpName)` | 知识点名切实词二字片段，判定教案是否覆盖 |

### assets/algos/psych.js —— 学生侧测量
| 函数 | 作用 |
| --- | --- |
| `ctt(resp, items)` | 难度 P、点二列区分度、高低 27% 分组 D、离散度 |
| `flagItems(rows, opt)` | 可疑题项判定（区分度<0.2 / 极端难度 / 负区分） |
| `irt2pl(resp, opt)` | 2PL MML-EM；数值牛顿 M 步；`log-normal(0,0.5²)` 先验抑制小样本边界解；EAP 估 θ |
| `masteryMatrix(resp, irt, items)` | 掌握概率矩阵 + 按知识点聚合 |
| `bkt(sequences)` | BKT 四参数坐标下降极大似然 + 掌握概率轨迹 |

### assets/algos/cluster.js
`standardize`（z-score）· `kmeans`（k-means++，固定种子 42）· `nameTypes`（按主动性综合分排序命名：主动探究型 / 任务驱动型 / 被动接受型）

### assets/algos/rules.js
`apriori(transactions, minSup, minConf)` → 频繁项集 + 规则（支持度 / 置信度 / 提升度）

### assets/algos/interaction.js
| 函数 | 作用 |
| --- | --- |
| `fias(codes, segSizes)` | 10×10 迁移矩阵 + 教师/学生/沉默比率 + I/D 比 + 提问类型/应答层次/沉默性质三维扩展 |
| `sna(edges, opt)` | 加权度中心度（以学生最大交互量为基准）、网络密度、边缘参与者（交互量 < 学生中位数×40%） |

### assets/charts.js —— 13 类手写 SVG 图表
`cleveland`（克利夫兰点图）· `heatmap`（热力图）· `stackedBar` · `donut` · `hbar` · `lollipop`（棒棒糖）· `slope`（斜率图）· `parallel`（平行坐标）· `fiasMatrix` · `timeline`（时序条带）· `network`（SNA 拓扑）· `waterfall` · `scatter`
统一返回 SVG 字符串；`ramp(t, kind)` 提供线性色阶；每个图元带 `<title>` 悬停提示。

### assets/pipeline.js —— `analyse(input)` 装配线
输入：采集工作台的原始数据；输出：`{teacher, student, inClass, after, comprehensive}` 五段画像。
内嵌 CSV 解析器 `parseCsv`（支持引号与逗号转义）与教学模式×学习类型适配规则表 `FIT_TABLE`（可在源码中直接改写）。

### assets/app.js —— 界面逻辑
`loadSample`（载入示例）· `renderSegTable`（可编辑环节表）· `renderChecklist`（11 项完整性核对）· `readForm`（表单→输入对象）· `run`（执行分析）· `renderAnalysis / renderViz / renderStages / renderComp / nextActions`（渲染与结论生成）· 文件读取用 `FileReader`，全程无网络请求。

## 二次开发指引

| 想改什么 | 改哪里 |
| --- | --- |
| 换示例课数据 | `assets/data/sample.js`，或用 `tools/gen_sample.py` 重新生成 |
| 改适配度规则矩阵 | `pipeline.js` 顶部的 `FIT_TABLE` 与 `MODE_KEYS` |
| 改困惑词典 / 布鲁姆词典 / 素养词典 | `text.js` 的 `CONFUSION` / `BLOOM` / `LITERACY` |
| 改图表配色 | `charts.js` 顶部的 `C` 与 `PALETTE` |
| 改阈值为默认（非界面参数） | `pipeline.js`：`THR`(课标覆盖) / `TARGET`(达标线) / `flagItems` 参数 |
| 新增图表类型 | 在 `charts.js` 增加函数，再到 `app.js` 的 `renderViz` 中用 `chartBox()` 挂载 |
| 新增指标 | 在 `pipeline.js` 的 `analyse()` 中计算，再到 `app.js` 渲染 |

## 本地运行

```bash
cd eduportrait
python3 -m http.server 8000     # 然后打开 http://localhost:8000

# 打包单文件版（file:// 双击即用，适合离线分发）
python3 tools/build_standalone.py
```

## 推送到远端（本沙箱未登录 GitHub，需你自行执行或在授权后由我代跑）

```bash
git remote add origin https://github.com/<你的用户名>/eduportrait.git
git push -u origin main
git push origin v1.0.0
```

## 数据格式速查

```csv
# items.csv      qid,kp,kp_name,lit,main_confusion,text
# responses.csv  sid,Q01,Q02,...[,t_Q01,t_Q02,...]   # 0/1，可选用时列
# interest.csv   sid,i_主题1,i_主题2,...,q_auto,q_ext # 1–5 分
# confusion.csv  sid,text
# FIAS           1–10 逗号分隔，每格 3 秒
# sns.csv        from,to,weight
```
