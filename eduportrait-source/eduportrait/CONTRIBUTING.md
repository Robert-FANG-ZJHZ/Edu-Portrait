# 贡献指南

## 环境

本项目**零依赖、零构建**，只需要：

- 一个现代浏览器（Chrome / Edge / Firefox / Safari）
- 可选：Python 3（跑 `tools/gen_sample.py`、`tools/build_standalone.py`）

不需要 `npm install`，不需要打包器，不改任何构建配置。

## 本地跑起来

```bash
python3 -m http.server 8000     # 然后打开 http://localhost:8000
# 或者
python3 tools/build_standalone.py && 双击 eduportrait-standalone.html
```

## 目录约定

| 目录 | 放什么 |
| --- | --- |
| `assets/algos/` | 纯算法内核。必须是纯函数，输入确定则输出确定，不碰 DOM |
| `assets/charts.js` | 图表库。新增图表在此加函数，返回 SVG 字符串 |
| `assets/pipeline.js` | 装配线。把采集数据算成画像，不碰 DOM |
| `assets/app.js` | 界面逻辑。唯一允许操作 DOM 与读表单的入口 |
| `assets/data/` | 示例数据 |
| `tools/` | 一次性脚本（数据生成、打包） |

三条硬规矩：

1. **算法层不碰 DOM**：`assets/algos/*`、`charts.js`、`pipeline.js` 不得出现 `document`、`$()`。
2. **不引入任何外部依赖**：不引 CDN、不引 npm 包、不发网络请求（这是"数据不出本机"承诺的一部分）。
3. **脚本加载顺序固定**：`text → psych → cluster → rules → interaction → charts → pipeline → sample → app`，
   改 `index.html` 时不要调换。

## 提交规范

```
<type>(<scope>): <简短说明>

type:  feat | fix | docs | refactor | perf | test | chore
scope: text | psych | cluster | rules | interaction | charts | pipeline | app | data | tools | docs
```

示例：

```
feat(charts): 新增桑基图用于展示错因流向
fix(psych): 修正 IRT 小样本下 a 参数的边界解
docs(readme): 补充课后练习 CSV 的格式说明
```

## 提 PR 前自检

- [ ] 浏览器打开示例课，**控制台无报错**；
- [ ] 点「运行分析」，19 个 KPI 全部有值，预备/课中/综合三处图表都渲染出来；
- [ ] 改算法后，示例课的基线值仍可复现（契合度 70.2、IRT a∈[0.56,1.31]）；若刻意改动算法，请在 PR 里说明并同步更新基线；
- [ ] 没有引入任何外部依赖或网络请求；
- [ ] 新增指标同步更新「算法与说明」页与 `README.md` 的算法清单。

## 数据伦理红线

- 不采集、不存储任何可识别到真实个人的信息；示例数据一律匿名编号（S01…S30）；
- 不采集生物识别类高敏感数据；
- 画像结果不得用于排名、分班或问责。

## 许可证

贡献即视为同意以 MIT 许可证发布。
