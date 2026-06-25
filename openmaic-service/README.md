# OpenMAIC Service

Local OpenMAIC-compatible classroom generation service for the GMP learning apps.

It implements the endpoints already used by the two frontend projects:

- `POST /api/generate-classroom`
- `GET /api/generate-classroom/:jobId`
- `GET /health`

## Run

```bash
cd openmaic-service
npm run dev -- --port 3002
```

Or on Windows:

```bat
start-openmaic.cmd
```

The GMP apps should keep:

```env
OPENMAIC_URL=http://localhost:3002
```

## Request

```json
{
  "requirement": "T01 GMP认知与法规基础 教学PPT",
  "trainingId": "T01",
  "slideCount": 14,
  "teachingGoals": "理解GMP法规层级；识别高频检查缺陷；掌握CAPA闭环思路",
  "keyPoints": "法规四级体系；质量体系证据链；飞行检查缺陷数据；典型严重缺陷案例",
  "caseContext": "某企业批生产记录存在补录和偏差未关闭情形，要求学生判断是否支持放行。",
  "studentLevel": "高职/本科药学与制药类学生",
  "classHours": "2 学时",
  "enableWebSearch": false,
  "agentMode": "local"
}
```

## Response Flow

Create a job:

```bash
curl -X POST http://localhost:3002/api/generate-classroom ^
  -H "Content-Type: application/json" ^
  -d "{\"requirement\":\"GMP data integrity\"}"
```

Poll until `done` is `true`:

```bash
curl http://localhost:3002/api/generate-classroom/<jobId>
```

The final response includes:

- `result.url`
- `classroomUrl`
- `summaryUrl`
- `outlineUrl`
- `pptUrl`
- `pptFileName` such as `T01-GMP认知与法规基础-教学课件.pptx`

Generated classroom files are written to `public/classrooms/<jobId>/`.
