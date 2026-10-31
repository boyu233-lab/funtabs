#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
weTab / iTab 备份 -> Xtab YAML 转换工具
=========================================

用途
----
把 WeTab（wetab.link，Chrome/Edge 新标签页扩展）导出的备份文件
转换成 Xtab 可直接「上传 YAML 写入 NAS」导入的数据文件。

支持的输入
----------
1. WeTab 导出的 JSON（可能是 .json / .txt，也可能是 {"data": ...} 包裹）
   —— 脚本会自动探测结构，无需你关心具体字段名
2. 标准浏览器书签 HTML（Netscape 格式，Chrome/Edge/Firefox 导出）
   —— 如果 WeTab 里的书签本来就是从浏览器导入的，直接导出浏览器书签更快

用法
----
    python wetab2xtab.py 备份文件.json                    # 输出 xtab-import.yaml
    python wetab2xtab.py 备份文件.json -o my.yaml
    python wetab2xtab.py 备份文件.json --append-to funtabs.yaml
        # 追加到已有的 Xtab 数据文件后面，而不是生成一份新的（避免覆盖现有书签）

依赖
----
零第三方依赖（本机无需 PyYAML）。标准库即可运行：python 3.6+
"""

import argparse
import io
import json
import os
import re
import sys
import time

# Xtab 卡片默认外观，与 src/module/data.jsx 的默认数据保持一致
DEFAULT_LAYOUT = {
    "model": "",
    "widthNum": 160,
    "heightNum": 64,
    "gridWidthNum": 1314,
    "radius": 12,
    "gap": 24,
    "cardStyle": "defaultCard",
    "tabsActiveKey": 0,
    "backgroundImage": "/images/wallpaper.JPG",
}

# 判定为"链接"的字段：值非空字符串即可
URL_KEYS = ("url", "link", "href", "src", "site", "web", "address")
# 判定为"标题"的字段
TITLE_KEYS = ("label", "title", "name", "text", "siteName", "nickname")
# 判定为"图标"的字段
ICON_KEYS = ("icon", "favicon", "ico", "logo", "img", "image")
# 判定为"子项"的字段（数组）
CHILD_KEYS = (
    "children", "child", "items", "list", "sites", "data",
    "subs", "sub", "content", "bookmarks", "links", "navs", "folders",
)


# ------------------------- YAML 序列化（无第三方依赖） -------------------------

_NEED_QUOTE = re.compile(r'[:#&{}\[\]"\'\\]|\s$|^\s')


def _is_plain_safe(s):
    """判断字符串能否不加引号直接写进 YAML"""
    if s == "" or _NEED_QUOTE.search(s):
        return False
    if re.match(r"^[-?|>!%@*`]", s):
        return False
    if re.match(r"^\d", s):
        return False
    return True


def yscalar(v):
    """把 Python 值转成 YAML 标量文本"""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    s = str(v)
    if _is_plain_safe(s):
        return s
    # JSON 双引号字符串语法是合法 YAML，可直接复用（自动处理转义）
    return json.dumps(s, ensure_ascii=False)


def dump_yaml(doc):
    """把 {version, updatedAt, layout, tabs} 序列化成 Xtab 的 YAML 文本"""
    out = []
    out.append("version: %s" % yscalar(doc["version"]))
    out.append("updatedAt: %s" % yscalar(doc["updatedAt"]))
    out.append("layout:")
    for k, v in doc["layout"].items():
        out.append("  %s: %s" % (k, yscalar(v)))
    out.append("tabs:")
    for tab in doc["tabs"]:
        out.append("  - key: %s" % yscalar(tab["key"]))
        for k, v in tab.items():
            if k in ("key", "items"):
                continue
            out.append("    %s: %s" % (k, yscalar(v)))
        items = tab.get("items") or []
        if items:
            out.append("    items:")
            for it in items:
                first = True
                for k, v in it.items():
                    prefix = "      - " if first else "        "
                    out.append("%s%s: %s" % (prefix, k, yscalar(v)))
                    first = False
        else:
            out.append("    items: []")
    return "\n".join(out) + "\n"


# ------------------------------- 结构探测 -----------------------------------

def load_input(path):
    """读入备份文件，返回 (python 对象, 'json'|'html')"""
    raw = io.open(path, encoding="utf-8", errors="replace").read()
    stripped = raw.lstrip()
    if stripped.startswith("<"):
        return raw, "html"
    try:
        return json.loads(raw), "json"
    except ValueError:
        pass
    # 有些导出会在 JSON 前后加说明文字，尝试截取第一个 {...} 或 [...]
    for opener, closer in (("{", "}"), ("[", "]")):
        i = raw.find(opener)
        j = raw.rfind(closer)
        if i != -1 and j > i:
            try:
                return json.loads(raw[i:j + 1]), "json"
            except ValueError:
                continue
    raise SystemExit("无法识别输入格式：既不是 JSON 也不是 HTML。\n"
                     "请确认导出的是 WeTab 的备份文件，或改用浏览器导出的书签 HTML。")


def node_url(node):
    """取出节点里的链接"""
    if not isinstance(node, dict):
        return ""
    for k in URL_KEYS:
        v = node.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def node_title(node, fallback=""):
    for k in TITLE_KEYS:
        v = node.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return fallback


def node_icon(node):
    for k in ICON_KEYS:
        v = node.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return None


# 这些字段既可能是列表，也可能是"包裹用的对象"（如 {"data": {...}}），
# 两种形态都要继续下钻，否则会在第一层就断掉
WRAPPER_KEYS = ("data", "content", "result", "payload", "body", "info")


def child_lists(node):
    """返回节点里所有看起来像子项集合的 (字段名, 可遍历对象)"""
    res = []
    if not isinstance(node, dict):
        return res
    for k in CHILD_KEYS:
        v = node.get(k)
        if isinstance(v, list):
            res.append((k, v))
        elif k in WRAPPER_KEYS and isinstance(v, dict):
            res.append((k, [v]))
    return res


def walk(node, category, buckets, depth=0):
    """
    递归遍历，把链接收进 buckets[分类名]。
    为了兼容未知结构，这里采用"尽力而为"的启发式规则：
      - 节点自身带链接 -> 归入当前分类
      - 节点不带链接但有子列表 -> 若它有名字，则开启新分类名继续下钻
    """
    if depth > 12:
        return
    if isinstance(node, list):
        for item in node:
            walk(item, category, buckets, depth + 1)
        return
    if not isinstance(node, dict):
        return

    url = node_url(node)
    if url:
        if not url.lower().startswith(("http://", "https://")):
            # 非网页地址（javascript:、chrome:// 等）跳过
            if not url.lower().startswith(("ftp://", "//")):
                return
        label = node_title(node, url)
        buckets.setdefault(category, []).append({
            "label": label,
            "link": url,
            "icon": node_icon(node),
        })
        # 带链接的节点也可能有子文件夹（少见），继续下钻
        for _k, lst in child_lists(node):
            walk(lst, category, buckets, depth + 1)
        return

    title = node_title(node, "")
    nxt = title if title else category
    subs = child_lists(node)
    if subs:
        for _k, lst in subs:
            walk(lst, nxt, buckets, depth + 1)
    else:
        # 叶子但没有链接：可能是被折叠的其他类型数据，忽略
        return


def parse_html(raw):
    """解析 Netscape 书签 HTML（浏览器导出的 bookmarks.html）"""
    buckets = {}
    # <DT><H3 ...>文件夹名</H3>  之后遇到的 <DT><A ...>标题</A> 都归入该文件夹
    folder = "导入的书签"
    pattern = re.compile(
        r"<DT>\s*(?:<H3[^>]*>(.*?)</H3>|<A[^>]*HREF=\"([^\"]*)\"[^>]*>(.*?)</A>)",
        re.I | re.S,
    )
    for m in pattern.finditer(raw):
        h3, href, atext = m.group(1), m.group(2), m.group(3)
        if h3 is not None:
            folder = re.sub(r"<[^>]+>", "", h3).strip() or folder
            buckets.setdefault(folder, [])
        elif href:
            if not href.lower().startswith(("http://", "https://")):
                continue
            label = re.sub(r"<[^>]+>", "", atext or "").strip() or href
            buckets.setdefault(folder, []).append({
                "label": label, "link": href, "icon": None,
            })
    return buckets


def dedup(buckets):
    """按规范化 URL 去重，保留首次出现"""
    seen = set()
    out = {}
    removed = 0
    for cat, items in buckets.items():
        kept = []
        for it in items:
            u = it["link"].strip().rstrip("/").lower()
            u = re.sub(r"^https?://", "", u)
            u = re.sub(r"^www\.", "", u)
            if u in seen:
                removed += 1
                continue
            seen.add(u)
            kept.append(it)
        if kept:
            out[cat] = kept
    return out, removed


# ------------------------------- 组装输出 -----------------------------------

def build_doc(buckets, start_key=0):
    tabs = []
    uid = 1
    for i, (cat, items) in enumerate(buckets.items()):
        tab_items = []
        for it in items:
            tab_items.append({
                "label": it["label"],
                "type": "link",
                "link": it["link"],
                "size": 11,
                "x": "80",
                "y": "20",
                # 图标留空，让 Xtab 后端按域名自动抓取，避免沿用失效的外链
                "icon": None,
                "backgroundColor": None,
                "id": uid,
            })
            uid += 1
        tabs.append({
            "key": start_key + i,
            "label": cat,
            "type": "folder",
            "items": tab_items,
        })
    return {
        "version": 1,
        "updatedAt": int(time.time() * 1000),
        "layout": dict(DEFAULT_LAYOUT),
        "tabs": tabs,
    }


def append_to(path, doc):
    """把生成的 tabs 追加到已有 Xtab YAML 文件末尾（保留原有数据）"""
    if not os.path.exists(path):
        raise SystemExit("找不到文件：%s" % path)
    text = io.open(path, encoding="utf-8").read()
    lines = text.splitlines()

    # 找到 tabs: 的位置与现有最大 key
    tabs_at = None
    max_key = -1
    for i, ln in enumerate(lines):
        if ln.rstrip() == "tabs:":
            tabs_at = i
        m = re.match(r"^\s*-?\s*key:\s*(-?\d+)\s*$", ln)
        if m:
            max_key = max(max_key, int(m.group(1)))
    start = max_key + 1 if max_key >= 0 else 0

    # 重新生成一份只含 tabs 的文档，再抽出 tabs 段落
    new_doc = build_doc(doc["_buckets"], start_key=start)
    block = dump_yaml(new_doc)
    blk_lines = block.splitlines()
    ti = next(i for i, ln in enumerate(blk_lines) if ln.rstrip() == "tabs:")
    section = blk_lines[ti + 1:]

    if tabs_at is None:
        lines.append("tabs:")
        lines.extend(section)
    else:
        # 插到 tabs 列表的末尾（而不是紧贴 tabs: 之后），保持原有分类在前
        end = len(lines)
        for i in range(tabs_at + 1, len(lines)):
            ln = lines[i]
            if not ln.strip() or ln.lstrip().startswith("#"):
                continue
            indent = len(ln) - len(ln.lstrip())
            # tabs 是顶层键（缩进 0），其列表项缩进为 2；
            # 只有缩进为 0 的非空行出现，才说明 tabs 段落结束
            if indent == 0:
                end = i
                break
        lines[end:end] = section
    io.open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    return start


def main():
    ap = argparse.ArgumentParser(
        description="把 WeTab 备份或浏览器书签 HTML 转成 Xtab 的 YAML")
    ap.add_argument("input", help="WeTab 备份文件（.json/.txt）或书签 HTML")
    ap.add_argument("-o", "--output", default="xtab-import.yaml",
                    help="输出文件，默认 xtab-import.yaml")
    ap.add_argument("--append-to", metavar="FUNTABS_YAML",
                    help="追加到已有的 Xtab 数据文件，而不是生成新文件")
    args = ap.parse_args()

    data, kind = load_input(args.input)
    if kind == "html":
        buckets = parse_html(data)
        src = "浏览器书签 HTML"
    else:
        buckets = {}
        walk(data, "导入的书签", buckets)
        src = "WeTab JSON"

    buckets, removed = dedup(buckets)
    total = sum(len(v) for v in buckets.values())

    if not buckets:
        raise SystemExit(
            "没有解析出任何书签。\n"
            "可能原因：备份文件结构超出自动识别范围，或文件里确实只有小组件配置。\n"
            "请把导出文件发给我，我按实际结构补一条专用解析规则。")

    print("来源：%s" % src)
    print("解析结果：%d 个分类，%d 条网址，去重 %d 条" % (len(buckets), total, removed))
    for cat, items in buckets.items():
        print("  - %s（%d 条）" % (cat, len(items)))

    if args.append_to:
        doc = build_doc(buckets)
        doc["_buckets"] = buckets
        start = append_to(args.append_to, doc)
        print("\n已追加到 %s（新分类 key 从 %d 开始），原数据保留。" % (args.append_to, start))
        print("把该文件用 Xtab 的「上传 YAML 写入 NAS」导入即可。")
        return

    doc = build_doc(buckets)
    io.open(args.output, "w", encoding="utf-8").write(dump_yaml(doc))
    print("\n已生成：%s" % os.path.abspath(args.output))
    print("下一步：Xtab → 顶栏「更多」→「备份恢复数据」→「上传 YAML 写入 NAS」。")
    print("提醒：上传会整体覆盖现有数据，建议先点「下载 YAML」备份一份。")


if __name__ == "__main__":
    main()
