# -*- coding: utf-8 -*-
"""把 index.html 及其引用的 CSS / JS 内联打包成单文件 HTML。

用法：
    python3 tools/build_standalone.py            # 输出 eduportrait-standalone.html
    python3 tools/build_standalone.py -o out.html

产物特点：零外部引用，双击（file:// 协议）即可离线运行，
适合发给没有网络条件的学校或随邮件分发。
"""
import argparse
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def build(output):
    html = io.open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()

    # 1) 内联样式
    links = re.findall(r'<link rel="stylesheet" href="([^"]+)">', html)
    for href in links:
        css = io.open(os.path.join(ROOT, href), encoding='utf-8').read()
        if '</style' in css.lower():
            raise SystemExit('样式中含 </style>，无法安全内联：%s' % href)
        html = html.replace('<link rel="stylesheet" href="%s">' % href,
                            '<style>\n%s\n</style>' % css)

    # 2) 按顺序内联脚本
    srcs = re.findall(r'<script src="([^"]+)"></script>', html)
    if not srcs:
        raise SystemExit('index.html 中未找到任何 <script src="...">，请检查加载顺序')
    for src in srcs:
        js = io.open(os.path.join(ROOT, src), encoding='utf-8').read()
        if '</script' in js.lower():
            raise SystemExit('脚本中含 </script>，无法安全内联：%s' % src)
        html = html.replace('<script src="%s"></script>' % src,
                            '<!-- %s -->\n<script>\n%s\n</script>' % (src, js))

    leftover = re.findall(r'(?:src|href)="((?:assets|tools)/[^"]+)"', html)
    if leftover:
        raise SystemExit('仍有未内联的外部引用：%s' % leftover)

    path = os.path.join(ROOT, output)
    io.open(path, 'w', encoding='utf-8').write(html)
    size = os.path.getsize(path)
    print('已生成 %s（%d 字节，内联 %d 个脚本 + %d 个样式）'
          % (output, size, len(srcs), len(links)))
    return 0


def main():
    ap = argparse.ArgumentParser(description='打包 EduPortrait 为单文件 HTML')
    ap.add_argument('-o', '--output', default='eduportrait-standalone.html',
                    help='输出文件名（默认 eduportrait-standalone.html）')
    args = ap.parse_args()
    return build(args.output)


if __name__ == '__main__':
    sys.exit(main())
