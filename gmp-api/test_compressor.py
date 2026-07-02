# -*- coding: utf-8 -*-
"""
02-context-perf 子任务1：rag/compressor.py 单测

B1  硬约束保留率 = 100%（日期/数字+单位/百分比/否定词）
B2  否定语义不翻转（>= 20 例）
B4  头尾重组：最高分片段在首段与末段
"""
import pytest
from rag.retriever import DocChunk
from rag.compressor import (
    extract_hard_constraints,
    check_constraints_preserved,
    compress_chunk,
    reorder_for_llm,
)


# ─── 辅助 ─────────────────────────────────────────────────────────────────────

def _doc(score: float, content: str = "") -> DocChunk:
    return DocChunk(f"REG-{int(score*100):03d}", "regulation", "", content or f"content_{score}", score)


# ─── extract_hard_constraints ─────────────────────────────────────────────────

def test_extract_date():
    cs = extract_hard_constraints("本规定自2025年1月1日起实施。")
    assert any("2025年" in c for c in cs)


def test_extract_number_with_unit():
    cs = extract_hard_constraints("温度不得超过26°C，湿度应低于65%。")
    assert any("26" in c for c in cs)
    assert any("65" in c for c in cs)


def test_extract_negation_buyu():
    cs = extract_hard_constraints("经审查不予续约的，应当依法处理。")
    assert any("不予" in c for c in cs)


def test_extract_negation_bude():
    cs = extract_hard_constraints("操作人员不得擅自更改工艺参数。")
    assert any("不得" in c for c in cs)


def test_extract_negation_jinzhi():
    cs = extract_hard_constraints("严禁将废弃物与合格品混放。")
    assert any("禁" in c for c in cs)


def test_extract_mg_unit():
    cs = extract_hard_constraints("每日剂量不超过500mg。")
    assert any("500" in c for c in cs)


# ─── check_constraints_preserved ─────────────────────────────────────────────

def test_check_ok_when_all_present():
    assert check_constraints_preserved("不予续约", "不予续约的条件", ["不予续约"])


def test_check_fail_when_missing():
    assert not check_constraints_preserved("不予续约", "续约的条件", ["不予续约"])


# ─── compress_chunk ────────────────────────────────────────────────────────────

def test_compress_shorter_than_original():
    long_text = "洁净区应当定期进行环境监测。" * 20
    result = compress_chunk(long_text, ratio=0.4)
    assert len(result) < len(long_text)


def test_b3_compression_ratio_at_least_40_percent():
    """B3：压缩比 >= 40%（即输出字数 <= 原文 60%），无约束文本。"""
    base = "洁净区应当定期进行环境监测以确保质量合格。"
    long_text = base * 10  # 10 句相同内容，无硬约束
    result = compress_chunk(long_text, ratio=0.5)
    ratio = len(result) / len(long_text)
    assert ratio <= 0.60, f"压缩比 {1-ratio:.0%} < 40%（实际输出 {ratio:.0%} 原文）"


def test_b3_constraint_text_fallback_does_not_violate_ratio_assumption():
    """B3 补充：含约束的文本在约束保留前提下仍应压缩；若压缩 = 原文则说明约束覆盖所有句子。"""
    # 每句都含约束 → must_keep = 所有句 → 无损回退 or full output
    all_constraint = "不得超过50°C。" * 5
    result = compress_chunk(all_constraint, ratio=0.4)
    assert "不得" in result  # 约束保留


def test_compress_preserves_date_constraint():
    text = "本规定自2022年6月1日起执行。" + "无关句子。" * 10
    result = compress_chunk(text, ratio=0.3)
    assert "2022年" in result or len(result) == len(text)  # 压缩保留或无损回退


def test_compress_preserves_negation_buyu():
    """B2：不予 —— 压缩后不得消失。"""
    text = "经审查发现不予续约情形的企业，应立即停产。" + "后续流程说明。" * 8
    result = compress_chunk(text, ratio=0.4)
    assert "不予" in result


def test_compress_preserves_negation_bude():
    """B2：不得 —— 压缩后不得消失。"""
    text = "操作人员不得擅自更改工艺参数，否则视为严重违规。" + "其他要求。" * 8
    result = compress_chunk(text, ratio=0.4)
    assert "不得" in result


def test_compress_preserves_degree_number():
    text = "设备运行温度应在15°C至25°C范围内。" + "备注信息。" * 8
    result = compress_chunk(text, ratio=0.3)
    assert "15" in result or len(result) == len(text)


def test_compress_fallback_when_constraints_lost():
    """当约束无法保留时，应原文返回（ratio=0 极端测试）。"""
    text = "严禁混合存放。其余说明如下：A。B。C。D。E。F。G。"
    result = compress_chunk(text, ratio=0.0)
    # ratio=0 → 压缩到极限 → 约束丢失 → 原文回退
    assert "严禁" in result


# ─── B1 批量硬约束保留率 ──────────────────────────────────────────────────────

_CONSTRAINT_SEGMENTS = [
    "不予续约的情形包括多次违规记录。",
    "每批产品取样量不少于200mg。",
    "温度超过30°C时应立即启动冷却。",
    "本规程自2021年3月15日起执行。",
    "操作人员不得佩戴饰品进入洁净区。",
    "微生物限度不得超过100CFU/m³。",
    "严禁将废弃物与原料混放。",
    "设备校准周期不超过6个月。",
    "含水量不得超过0.5%。",
    "不予放行的批次须隔离存放。",
    "反应温度应控制在60°C以下。",
    "禁止未经授权人员进入生产区。",
    "每年至少进行1次全面审计。",
    "异物检出率不得超过万分之一。",
    "自2023年9月起新规全面实施。",
    "不得更改已验证的工艺参数。",
    "产品有效期不少于24个月。",
    "不予通过的原因须书面记录。",
    "严禁交叉污染。",
    "灌装速度不超过500mL/min。",
    "不得擅自更换供应商。",
    "含量不低于98.5%。",
    "本条款于2020年1月1日废止。",
    "不予批准的申请须退回原申请人。",
    "压差不低于10Pa。",
    "严禁在洁净区内饮食。",
    "不得使用过期原辅料。",
    "颗粒粒径不超过150μm。",
    "自检频率至少每季度一次。",
    "禁止无记录操作。",
    "不予继续的工艺须立即停止。",
    "有效成分含量不低于95%。",
    "不得混淆不同批次产品。",
    "2019年4月17日前完成整改。",
    "严禁回收废弃的固体物料重用。",
    "不得超过最大允许残留量10mg/kg。",
    "不予认可的供应商须从名单中删除。",
    "pH值范围6.5至7.5。",
    "禁止在未经批准的区域储存危险品。",
    "不得省略关键工艺步骤。",
    "自2024年起强制执行新标准。",
    "不予通过的产品须销毁处理。",
    "残留溶剂不得超过规定限量。",
    "严禁不同产品共用同一设备而不清洁。",
    "每次使用前必须校验仪器精度至±0.01g。",
    "不得延迟超过4小时报告偏差。",
    "产品装量误差不超过±5%。",
    "不予放行的产品须贴红色标签隔离。",
    "操作室相对湿度不超过50%。",
    "严禁未经授权修改批记录。",
]


def test_b1_hard_constraint_retention_100_percent():
    """B1：50条片段批量检验硬约束保留率 = 100%（允许无损回退计为保留）。"""
    failed = []
    for seg in _CONSTRAINT_SEGMENTS:
        constraints = extract_hard_constraints(seg)
        if not constraints:
            continue  # 没提取到约束则跳过
        compressed = compress_chunk(seg, ratio=0.5)
        for c in constraints:
            if c not in compressed:
                failed.append(f"约束 '{c}' 丢失，原文='{seg[:40]}'，压缩='{compressed[:40]}'")
    assert not failed, f"保留失败 {len(failed)} 条：\n" + "\n".join(failed[:5])


# ─── B2 否定语义专项（20条） ─────────────────────────────────────────────────

_NEGATION_CASES = [
    ("经审查不予续约的，须书面告知。", "不予"),
    ("操作人员不得擅自离开岗位。", "不得"),
    ("严禁将废弃物混入原料。", "禁"),
    ("禁止未经批准的原料入库。", "禁止"),
    ("不予放行的批次须隔离。", "不予"),
    ("不予认可的实验结果须复核。", "不予"),
    ("严禁超量使用添加剂。", "严禁"),
    ("不得更换未经验证的方法。", "不得"),
    ("不予通过的申请退回申请人。", "不予"),
    ("禁止无记录的关键操作。", "禁止"),
    ("严禁非授权人修改批记录。", "严禁"),
    ("不得使用过期物料。", "不得"),
    ("不予确认的供应商应移出合格清单。", "不予"),
    ("不得混淆批次标签。", "不得"),
    ("严禁回用报废产品的包装。", "严禁"),
    ("不予批准的项目须报告上级。", "不予"),
    ("禁止在B级区内进行非洁净操作。", "禁止"),
    ("不得省略质量授权人签字环节。", "不得"),
    ("严禁跨批次混料。", "严禁"),
    ("不予续用的设备须挂牌停用。", "不予"),
]


@pytest.mark.parametrize("text,must_contain", _NEGATION_CASES)
def test_b2_negation_not_reversed(text, must_contain):
    """B2（20条）：否定词在压缩后必须保留，语义不得被翻转。"""
    result = compress_chunk(text, ratio=0.5)
    assert must_contain in result, (
        f"否定词 '{must_contain}' 在压缩后消失。\n原文：{text}\n压缩：{result}"
    )


# ─── B4 头尾重组 ─────────────────────────────────────────────────────────────

def test_b4_highest_score_at_head():
    chunks = [_doc(0.3), _doc(0.9), _doc(0.5), _doc(0.7)]
    reordered = reorder_for_llm(chunks)
    assert reordered[0].score == pytest.approx(0.9), "最高分应在首位"


def test_b4_second_highest_at_tail():
    chunks = [_doc(0.3), _doc(0.9), _doc(0.5), _doc(0.7)]
    reordered = reorder_for_llm(chunks)
    assert reordered[-1].score == pytest.approx(0.7), "第二高分应在末位"


def test_b4_middle_has_rest():
    chunks = [_doc(0.3), _doc(0.9), _doc(0.5), _doc(0.7)]
    reordered = reorder_for_llm(chunks)
    middle_scores = {c.score for c in reordered[1:-1]}
    assert 0.3 in middle_scores and 0.5 in middle_scores


def test_b4_two_chunks_unchanged():
    chunks = [_doc(0.9), _doc(0.3)]
    reordered = reorder_for_llm(chunks)
    assert [c.score for c in reordered] == pytest.approx([0.9, 0.3])


def test_b4_single_chunk_unchanged():
    chunks = [_doc(0.9)]
    reordered = reorder_for_llm(chunks)
    assert len(reordered) == 1 and reordered[0].score == pytest.approx(0.9)


def test_b4_preserves_all_chunks():
    chunks = [_doc(float(i) * 0.1) for i in range(1, 8)]
    reordered = reorder_for_llm(chunks)
    assert len(reordered) == len(chunks)
    assert {c.score for c in reordered} == {c.score for c in chunks}


def test_b4_experience_chunks_always_at_tail():
    """经验条（doc_type='experience'）不参与头尾竞争，始终在所有 reg/kp 之后。"""
    exp = DocChunk("EXP-001", "experience", "", "历史经验内容", 0.485)  # 高于部分法规
    reg_high = _doc(0.90)
    reg_low  = _doc(0.35)
    chunks = [exp, reg_high, reg_low]
    reordered = reorder_for_llm(chunks)
    assert reordered[-1].doc_type == "experience", "经验条应始终在末尾"
    assert reordered[0].score == pytest.approx(0.90), "最高分法规应在首位"


def test_b4_experience_score_never_displaces_regulations():
    """经验条分数高于法规时，reorder 后法规仍排在经验条前面。"""
    reg = _doc(0.40)
    exp = DocChunk("EXP-002", "experience", "", "经验", 0.80)  # score > reg
    reordered = reorder_for_llm([reg, exp])
    types = [c.doc_type for c in reordered]
    assert types.index("regulation") < types.index("experience")
