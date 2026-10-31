# -*- coding: utf-8 -*-
"""生成 eduportrait 演示数据集（固定种子，可复现）。
输出: /workspace/eduportrait/assets/data/sample.js
说明: 全部为模拟数据，学号匿名化，不指向任何真实师生。
"""
import math
import random
import json
import io

R = random.Random(20261005)

# ---------------------------------------------------------------- 题项设计
ITEMS = [
    ("Q01", "K1", "变量与常量", "抽象能力", -1.20, 0.90, "指出气温变化情境中的常量与变量", "概念理解不清"),
    ("Q02", "K1", "常量与变量辨识", "抽象能力", -0.80, 1.10, "判断关系式中的自变量与因变量", "概念理解不清"),
    ("Q03", "K2", "函数概念判断", "抽象能力", -0.30, 1.20, "依据函数定义判断对应关系是否为函数", "概念理解不清"),
    ("Q04", "K2", "函数关系识别", "抽象能力", 0.20, 1.00, "从表格与图象中识别函数关系", "审题遗漏"),
    ("Q05", "K3", "正比例函数识别", "运算能力", -0.50, 1.00, "判断给定解析式是否为正比例函数", "概念理解不清"),
    ("Q06", "K3", "正比例函数解析式", "运算能力", 0.40, 1.30, "由已知条件求正比例函数解析式", "方法应用错误"),
    ("Q07", "K4", "待定系数法求解析式", "运算能力", 0.60, 1.40, "已知两点坐标求一次函数解析式", "方法应用错误"),
    ("Q08", "K4", "由图象求解析式", "几何直观", 1.00, 1.20, "读取图象交点与截距求解析式", "方法应用错误"),
    ("Q09", "K5", "描点法画图象", "几何直观", 0.00, 0.90, "列表描点并画出 y=2x+1 的图象", "方法应用错误"),
    ("Q10", "K6", "k的符号与倾斜方向", "几何直观", 0.50, 1.10, "判断 k>0 与 k<0 时图象的倾斜方向", "概念理解不清"),
    ("Q11", "K7", "b的意义与平移", "推理能力", 1.10, 1.00, "说明 b 的几何意义及图象平移规律", "知识迁移困难"),
    ("Q12", "K8", "水费计费建模", "模型观念", 1.50, 1.30, "建立分段计费情境中的一次函数模型", "知识迁移困难"),
]

LIT_POOL = ["抽象能力", "运算能力", "几何直观", "模型观念", "应用意识", "推理能力"]

# ---------------------------------------------------------------- 学生
N = 30
theta = [round(R.gauss(0.0, 1.0), 3) for _ in range(N)]
effort = [round(min(1.0, max(0.15, R.gauss(0.62, 0.18))), 3) for _ in range(N)]


def logistic(a, b, t):
    return 1.0 / (1.0 + math.exp(-1.702 * a * (t - b)))


def gen_resp(delta=0.0):
    """delta: 课后测能力增量"""
    rows = []
    for i in range(N):
        cells = []
        for (_, _, _, _, b, a, _, _) in ITEMS:
            p = logistic(a, b, theta[i] + delta)
            p = 0.05 + 0.90 * p * (0.55 + 0.45 * effort[i])
            cells.append(1 if R.random() < p else 0)
        rows.append(cells)
    return rows


pre = gen_resp(0.0)
post = gen_resp(0.85)

# 用时（秒）：基础用时 + 难度 + 噪声
def gen_time(resp):
    out = []
    for i in range(N):
        row = []
        for j, (_, _, _, _, b, a, _, _) in enumerate(ITEMS):
            base = 22 + 16 * max(0.0, b + 1.5) + (14 if resp[i][j] == 0 else 0)
            row.append(int(base * (1.25 - 0.45 * effort[i]) + R.uniform(-4, 6)))
        out.append(row)
    return out


time_pre = gen_time(pre)

# ---------------------------------------------------------------- 兴趣量表
INTEREST_TOPICS = ["数与代数探究", "图形与几何", "生活中的数学", "数学史与故事", "数学游戏与竞赛", "数学阅读"]


def gen_interest():
    rows = []
    for i in range(N):
        base = 0.55 * theta[i] + 0.9 * effort[i]
        scores = []
        for t in range(len(INTEREST_TOPICS)):
            bias = 0.45 if t in (0, 2) else (-0.25 if t in (3, 5) else 0.0)
            v = 3.0 + 0.62 * base + bias + R.gauss(0, 0.72)
            scores.append(int(min(5, max(1, round(v)))))
        q_auto = int(min(5, max(0, round(1.1 + 0.75 * base + R.gauss(0, 0.8)))))
        q_ext = int(min(5, max(0, round(0.9 + 0.62 * base + R.gauss(0, 0.8)))))
        rows.append(scores + [q_auto, q_ext])
    return rows


interest = gen_interest()

# ---------------------------------------------------------------- 困惑自述
CONF_TPL = {
    "概念理解不清": [
        "我不太清楚{kn}到底在问什么，概念没弄明白。",
        "{kn}的定义我记混了，分不清几个概念。",
        "看课本还是不懂{kn}是什么意思。",
    ],
    "方法应用错误": [
        "{kn}这道题我会列式子，但算到最后一步总出错。",
        "方法我背下来了，可是一换数字就不会用{kn}了。",
        "做{kn}时步骤写反了，不知道先求哪一个。",
    ],
    "审题遗漏": [
        "{kn}这道题我漏看了条件，做完才发现。",
        "没注意到{kn}题目里给的范围，答非所问。",
        "{kn}的图表我没看全就下笔了。",
    ],
    "知识迁移困难": [
        "{kn}换成生活里的情境我就不会了。",
        "课堂例题懂了，{kn}换个说法就做不出来。",
        "{kn}和之前学的知识联系不起来。",
    ],
}


def gen_confusion(resp):
    rows = []
    for i in range(N):
        wrong = [j for j in range(len(ITEMS)) if resp[i][j] == 0]
        if not wrong:
            rows.append("预习基本顺利，暂时没有明显困惑。")
            continue
        j = R.choice(wrong)
        cat = ITEMS[j][7]
        # 20% 概率由相邻题的错因类型混入
        if R.random() < 0.2:
            cat = R.choice(list(CONF_TPL.keys()))
        tpl = R.choice(CONF_TPL[cat])
        rows.append(tpl.format(kn=ITEMS[j][2]))
    return rows


confusion = gen_confusion(pre)

# ---------------------------------------------------------------- 环节用时
SEGMENTS = [
    ("情境导入·气温变化图", 5, 0),
    ("探究·变量对应关系", 8, 1),
    ("探究·描点画图象", 12, 1),
    ("例题·待定系数法", 10, 1),
    ("练习·分层任务", 8, 0),
    ("小结与检测", 7, 0),
]

# ---------------------------------------------------------------- FIAS 序列
FIAS_PROFILE = [
    ("导入", 14, [1, 2, 3, 4, 8, 9, 5]),
    ("探究", 40, [4, 8, 3, 9, 9, 4, 5, 10, 8, 2]),
    ("讲授", 26, [5, 4, 8, 5, 6, 5, 4, 8, 10]),
    ("练习", 22, [6, 10, 8, 4, 9, 7, 6, 10]),
    ("小结", 12, [4, 8, 3, 2, 5, 9]),
]


def gen_fias():
    seq = []
    for _, cnt, pool in FIAS_PROFILE:
        for _ in range(cnt):
            seq.append(R.choice(pool))
    # 保证有一定主动发言与沉默
    seq[3] = 9
    seq[7] = 9
    seq[11] = 10
    return seq


fias = gen_fias()

# ---------------------------------------------------------------- SNA 边表
def gen_sns():
    edges = []
    for i in range(N):
        sid = "S%02d" % (i + 1)
        w = max(1, int(round(1 + 3.2 * logistic(1.0, 0.1, theta[i]) * (0.5 + effort[i]) + R.uniform(-0.4, 0.9))))
        edges.append(("T", sid, w))
        if R.random() < 0.45:
            edges.append((sid, "T", max(1, w - R.randint(0, 2))))
    for i in range(N):
        for _ in range(R.randint(0, 2)):
            j = R.randrange(N)
            if j != i:
                edges.append(("S%02d" % (i + 1), "S%02d" % (j + 1), R.randint(1, 3)))
    return edges


sns_edges = gen_sns()

# ---------------------------------------------------------------- 输出 CSV
def resp_csv(resp, tm):
    head = "sid," + ",".join(r[0] for r in ITEMS) + "," + ",".join("t_" + r[0] for r in ITEMS)
    lines = [head]
    for i in range(N):
        lines.append("S%02d," % (i + 1) + ",".join(str(v) for v in resp[i]) + "," + ",".join(str(v) for v in tm[i]))
    return "\n".join(lines)


def interest_csv():
    cols = ["i_" + t for t in INTEREST_TOPICS] + ["q_auto", "q_ext"]
    head = "sid," + ",".join(cols)
    lines = [head]
    for i in range(N):
        lines.append("S%02d," % (i + 1) + ",".join(str(v) for v in interest[i]))
    return "\n".join(lines)


def confusion_csv():
    lines = ["sid,text"]
    for i in range(N):
        lines.append("S%02d,%s" % (i + 1, confusion[i]))
    return "\n".join(lines)


def items_csv():
    lines = ["qid,kp,kp_name,lit,main_confusion,text"]
    for (qid, kp, name, lit, b, a, text, cf) in ITEMS:
        lines.append("%s,%s,%s,%s,%s,%s" % (qid, kp, name, lit, cf, text))
    return "\n".join(lines)


STANDARDS = [
    "结合具体情境体会函数的意义，了解常量、变量的意义，能结合图象对变量间的对应关系进行讨论。",
    "能画出一次函数的图象，根据图象和表达式 y=kx+b（k≠0）探索并理解 k>0 和 k<0 时图象的变化情况。",
    "理解正比例函数，体会一次函数与正比例函数的关系，能根据已知条件确定一次函数的表达式。",
    "能用一次函数刻画现实情境中变量之间的关系，解决简单的实际问题，发展模型观念与应用意识。",
    "经历从具体情境中抽象出数学问题、建立模型、求解验证的过程，形成模型观念。",
    "能借助图象直观分析数量关系，探索函数性质，发展几何直观与推理能力。",
    "在探究函数性质的过程中经历观察、猜想、实验、归纳等思维活动，发展抽象能力与运算能力。",
    "愿意参与数学探究活动，能与他人合作交流，敢于质疑与表达，形成严谨求实的科学态度。",
]

LESSON_PLAN = """课题：一次函数的图象与性质（八年级·第十九章）
教学目标：
1. 观察气温变化折线图与行程问题表格，抽象出常量与变量，理解函数的对应关系。
2. 会用描点法画出一次函数 y=kx+b 的图象，根据图象和表达式探索并理解 k>0 与 k<0 时图象的变化情况。
3. 能根据两点坐标用待定系数法求一次函数解析式，理解正比例函数与一次函数的关系。
4. 借助图象直观分析数量关系，归纳 k、b 的几何意义，发展几何直观与推理能力。
5. 通过水费计费情境建立一次函数模型，经历从具体情境中抽象出数学问题、求解验证的过程，解决简单的实际问题，发展模型观念与应用意识。
6. 在小组合作交流中表达猜想与验证过程，敢于质疑与表达，形成严谨求实的科学态度。
教学重点：一次函数图象的画法与 k、b 的几何意义。
教学难点：从图象与情境中抽象函数关系，建立一次函数模型解决实际问题。
教学模式：情境探究式讲授 + 小组合作 + 分层练习。
教学过程：
一、情境导入：展示一天气温变化图，追问"时间与气温谁是主动变化的量"。
二、探究活动一：小组讨论变量对应关系，归纳函数定义。
三、探究活动二：列表、描点、连线画出 y=2x+1 与 y=-2x+1，比较倾斜方向。
四、例题讲解：已知两点求解析式（待定系数法）。
五、分层练习：基础题巩固解析式求法，提高题处理水费分段计费。
六、小结检测：梳理 k、b 的意义，完成 3 道随堂检测。"""

data = {
    "lesson": {
        "title": "一次函数的图象与性质",
        "subject": "初中数学",
        "grade": "八年级",
        "unit": "第十九章 一次函数",
        "teacherMode": "情境探究式讲授 + 小组合作",
    },
    "standards": STANDARDS,
    "lessonPlan": LESSON_PLAN,
    "segments": [{"name": n, "minutes": m, "key": bool(k)} for (n, m, k) in SEGMENTS],
    "itemsCsv": items_csv(),
    "respCsv": resp_csv(pre, time_pre),
    "postCsv": resp_csv(post, gen_time(post)),
    "interestCsv": interest_csv(),
    "confusionCsv": confusion_csv(),
    "fiasSeq": ",".join(str(x) for x in fias),
    "fiasSegments": [{"name": n, "size": c} for (n, c, _) in FIAS_PROFILE],
    "snsCsv": "from,to,weight\n" + "\n".join("%s,%s,%d" % e for e in sns_edges),
    "interestTopics": INTEREST_TOPICS,
    "nStudents": N,
}

js = "/* 演示数据集：全部为模拟数据，学号匿名化（S01…S30），不指向任何真实师生。\n"
js += " * 生成方式：tools/gen_sample.py，固定随机种子 20261005，可复现。 */\n"
js += "window.EP_SAMPLE = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n"

with io.open("/workspace/eduportrait/assets/data/sample.js", "w", encoding="utf-8") as f:
    f.write(js)

print("rows:", N, "items:", len(ITEMS), "edges:", len(sns_edges), "fias:", len(fias))
print("pre mean score:", round(sum(sum(r) for r in pre) / (N * len(ITEMS)), 3))
print("post mean score:", round(sum(sum(r) for r in post) / (N * len(ITEMS)), 3))
print("bytes:", len(js))
