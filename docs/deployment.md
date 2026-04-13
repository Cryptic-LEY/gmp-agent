# 部署文档

## 本地开发环境

```bash
# 1. 安装依赖
pip install -r requirements.txt

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入真实的 API Key

# 3. 启动 Streamlit UI
streamlit run src/ui/app.py
```

## 生产环境（阿里云 ECS）

待补充（M1 阶段）
