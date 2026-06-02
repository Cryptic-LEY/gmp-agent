import { NextRequest, NextResponse } from 'next/server'
import { verifyToken } from '@/lib/auth'
import { db } from '@/db'
import { learningPlans } from '@/db/schema'
import { buildPersonalizedScheme, safeParsePlan, type PlanItem } from '@/lib/personalized-plan'
import { eq, desc } from 'drizzle-orm'
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, Table, TableRow, TableCell,
  WidthType, ShadingType, convertInchesToTwip,
} from 'docx'

const PRIORITY_LABELS: Record<string, string> = {
  high: '重点强化',
  medium: '建议复习',
  low: '保持巩固',
}

// GET /api/onboarding/download-plan
// 返回当前用户最新前测结果生成的 .docx 学习方案
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const payload = verifyToken(token)
  if (!payload) return NextResponse.json({ error: 'Invalid token' }, { status: 401 })

  const { userId } = payload

  // 取最新一次前测结果
  const latest = (await db.select().from(learningPlans)
    .where(eq(learningPlans.userId, userId))
    .orderBy(desc(learningPlans.createdAt))
    .limit(1))[0]

  if (!latest) {
    return NextResponse.json({ error: '暂无前测记录' }, { status: 404 })
  }

  const plan = safeParsePlan(latest.planData)
  const score    = latest.score
  const eduLabel = latest.eduLevel === 'undergraduate' ? '本科' : '专科'
  const dateStr  = latest.createdAt.slice(0, 10)
  const scheme = buildPersonalizedScheme(plan, score)

  const levelLabel =
    score >= 80 ? '综合提升型' :
    score >= 60 ? '进阶应用型' : '系统学习型'

  // ── 生成 Word 文档 ────────────────────────────────────────────────────────

  // 按优先级排序
  const high   = plan.filter(p => p.priority === 'high')
  const medium = plan.filter(p => p.priority === 'medium')
  const low    = plan.filter(p => p.priority === 'low')

  function makeProjectRows(items: PlanItem[]) {
    return items.map(item =>
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: item.project_name, size: 20 })] })],
            width: { size: 40, type: WidthType.PERCENTAGE },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: PRIORITY_LABELS[item.priority], size: 20 })] })],
            width: { size: 18, type: WidthType.PERCENTAGE },
            shading: {
              type: ShadingType.CLEAR,
              fill: item.priority === 'high' ? 'FFE4E1' : item.priority === 'medium' ? 'FFF9E6' : 'E8F5E9',
              color: 'auto',
            },
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: item.reason, size: 20 })] })],
            width: { size: 42, type: WidthType.PERCENTAGE },
          }),
        ],
      })
    )
  }

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: convertInchesToTwip(1),
            right: convertInchesToTwip(1),
            bottom: convertInchesToTwip(1),
            left: convertInchesToTwip(1.2),
          },
        },
      },
      children: [
        // 标题
        new Paragraph({
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'GMP实施与管理 · 个性化学习方案', bold: true, size: 52, color: '183B4B' })],
          spacing: { after: 200 },
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: `学历层次：${eduLabel}　|　专业：${latest.major}　|　生成日期：${dateStr}`, size: 20, color: '6B8A98' })],
          spacing: { after: 400 },
        }),

        // 前测成绩
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '一、前测结果摘要', bold: true, size: 28, color: '1D6F78' })],
          spacing: { before: 300, after: 160 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '项目', bold: true, size: 22 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '结果', bold: true, size: 22 })] })] }),
              ],
            }),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '前测得分', size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${score} 分 / 100 分`, size: 20, bold: true, color: score >= 80 ? '16A34A' : score >= 60 ? 'D97706' : 'DC2626' })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '答题情况', size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `答对 ${Math.round(score / 5)} 题，答错 ${latest.wrongCount} 题（共20题）`, size: 20 })] })] }),
            ]}),
            new TableRow({ children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '学习层次判定', size: 20 })] })] }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: levelLabel, size: 20, bold: true })] })] }),
            ]}),
          ],
        }),

        // 智能导学建议
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '二、智能导学建议', bold: true, size: 28, color: '1D6F78' })],
          spacing: { before: 500, after: 160 },
        }),
        new Paragraph({
          children: [new TextRun({ text: scheme.summary, size: 20, color: '355564' })],
          spacing: { after: 160 },
        }),
        ...scheme.ai_focus.map(text =>
          new Paragraph({
            children: [new TextRun({ text: text, size: 20 })],
            spacing: { after: 100 },
            indent: { left: convertInchesToTwip(0.2) },
          })
        ),

        // 三类学习任务
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '三、每日练习、课程学习与实训仿真', bold: true, size: 28, color: '1D6F78' })],
          spacing: { before: 500, after: 160 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ['模块', '建议频次', '当前重点', '执行说明'].map(text => new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 22 })] })],
                shading: { type: ShadingType.CLEAR, fill: 'E8F4F5', color: 'auto' },
              })),
            }),
            ...[scheme.daily_practice, scheme.course_learning, scheme.simulation_training].map(action => new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: action.title, size: 20, bold: true })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: action.duration, size: 20 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: action.focus, size: 20 })] })] }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: action.detail, size: 20 })] })] }),
              ],
            })),
          ],
        }),

        // 学习方案
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '四、项目优先级', bold: true, size: 28, color: '1D6F78' })],
          spacing: { before: 500, after: 160 },
        }),
        new Paragraph({
          children: [new TextRun({ text: '根据前测结果，系统将各项目按照掌握情况划分为三个学习优先级，建议按优先级由高到低安排学习时间。', size: 20, color: '6B8A98' })],
          spacing: { after: 240 },
        }),

        // 表头
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: '项目名称', bold: true, size: 22 })] })],
                  width: { size: 40, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: 'E8F4F5', color: 'auto' },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: '优先级', bold: true, size: 22 })] })],
                  width: { size: 18, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: 'E8F4F5', color: 'auto' },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: '建议说明', bold: true, size: 22 })] })],
                  width: { size: 42, type: WidthType.PERCENTAGE },
                  shading: { type: ShadingType.CLEAR, fill: 'E8F4F5', color: 'auto' },
                }),
              ],
            }),
            ...makeProjectRows(high),
            ...makeProjectRows(medium),
            ...makeProjectRows(low),
          ],
        }),

        // 7 日计划
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '五、7日执行计划', bold: true, size: 28, color: '1D6F78' })],
          spacing: { before: 500, after: 200 },
        }),
        ...scheme.seven_day_plan.flatMap(item => [
          new Paragraph({
            children: [new TextRun({ text: `${item.day}｜${item.title}`, bold: true, size: 21, color: '183B4B' })],
            spacing: { after: 80 },
          }),
          new Paragraph({
            children: [new TextRun({ text: item.tasks.join('；'), size: 20, color: '355564' })],
            spacing: { after: 120 },
            indent: { left: convertInchesToTwip(0.2) },
          }),
        ]),

        // 学习建议
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: '六、通用学习建议', bold: true, size: 28, color: '1D6F78' })],
          spacing: { before: 500, after: 200 },
        }),
        ...[
          '1. 每日学习建议不少于 45 分钟，可拆分为「知识学习 20 分钟 + 练习巩固 20 分钟 + 错题复习 5 分钟」三段。',
          '2. 优先完成「重点强化」项目的课件学习和配套练习，再逐步推进「建议复习」项目。',
          '3. 答题过程中建议善用「错题本」功能，定期回顾错题并标记已掌握的内容。',
          '4. 完成某一项目学习后，可重新做该项目的专项练习，检验掌握情况。',
          '5. 如有疑问，可随时使用平台智能导学功能获取解析与延伸解读。',
        ].map(text =>
          new Paragraph({
            children: [new TextRun({ text, size: 20 })],
            spacing: { after: 120 },
            indent: { left: convertInchesToTwip(0.2) },
          })
        ),

        // 页脚
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: { top: { color: 'CCCCCC', size: 6, style: BorderStyle.SINGLE, space: 10 } },
          children: [new TextRun({ text: '本方案由 GMP 智能体助学平台自动生成 · 仅供参考', size: 18, color: 'AAAAAA', italics: true })],
          spacing: { before: 600 },
        }),
      ],
    }],
  })

  const nodeBuffer = await Packer.toBuffer(doc)
  // 将 Node.js Buffer 转为标准 ArrayBuffer 供 Web Response 使用
  const buffer: ArrayBuffer = nodeBuffer.buffer.slice(nodeBuffer.byteOffset, nodeBuffer.byteOffset + nodeBuffer.byteLength) as ArrayBuffer

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''GMP%E5%AD%A6%E4%B9%A0%E6%96%B9%E6%A1%88_${dateStr}.docx`,
    },
  })
}
