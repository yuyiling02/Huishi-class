<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 慧视课堂 | 多智能体 3D 教学演示系统

本项目是面向教学展示的 3D 交互教具系统，新增三智能体流程：

- 理解规划Agent：根据教学需求生成演示步骤。
- 演示执行Agent：把步骤转换成模型加载、旋转、缩放、自动拆解等工具调用。
- 学情评估Agent：根据演示过程生成课堂小结。

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set API keys in `.env.local`:
   `VITE_DEEPSEEK_API_KEY=your_deepseek_key`
   `VITE_DEEPSEEK_MODEL=deepseek-chat`
   Optional: `GEMINI_API_KEY=your_gemini_key`
3. Run the app:
   `npm run dev`
