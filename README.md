# AI 前沿评论 · Frontier Notes on AI

一个偏思考、偏深度的 AI 专业评论站点。GitHub Actions 每周两次自动采集信息源，由免费大模型筛选、撰写，再发布到 GitHub Pages。

- **深度评论**：每期 1 篇，给出有论证、可检验的判断
- **研究与方法**：每期至多 2 篇论文 / 方法解读
- **人物观点**：每期至多 1 篇，评述领域关键人物的第一手公开观点；“原文”引语必须能在材料中逐字找到，否则自动删除
- **原理与实践**：约每 4 周 1 篇系统性长文（选题队列见 `config/primer-topics.json`）
- **要闻速览**：一句话加原始链接

关注方向：大模型、世界模型、推理与强化学习、智能体、具身智能、可解释性、AI 基础设施（首页标签见 `site.config.json` 的 `focus`）。

站点特性：首页动态神经网络背景、按文章自动生成的科技风封面、栏目配色、横屏和竖屏自适应、浅色/深色/跟随系统三种主题、全屏阅读（按 F 键）、PWA（可安装、可离线阅读）、RSS、站内搜索、KaTeX 公式、代码高亮与一键复制。

## 部署

1. 把仓库推送到 GitHub（仓库名默认按 `AIComments` 处理，换别的名字也行，部署时会自动识别路径）。
2. **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
3. **Settings → Secrets and variables → Actions** 里至少配置一个大模型密钥（建议配两个，互为备用）：

   | Secret | 说明 | 申请地址 |
   | --- | --- | --- |
   | `GEMINI_API_KEY` | Google Gemini 免费层，默认首选 | https://aistudio.google.com/apikey |
   | `ZHIPU_API_KEY` | 智谱 GLM Flash 系列，长期免费，中文写作好 | https://open.bigmodel.cn |
   | `OPENROUTER_API_KEY` | `openrouter/free` 自动路由免费模型（每天 50 次） | https://openrouter.ai/keys |
   | `GROQ_API_KEY` | Groq 免费层，作为兜底 | https://console.groq.com/keys |
   | `TAVILY_API_KEY`（可选） | 联网搜索，用于补充评论背景（每月有免费额度） | https://tavily.com |

   也可以接入任意 OpenAI 兼容接口：Secret 填 `LLM_API_KEY`，Variables 填 `LLM_BASE_URL`、`LLM_MODEL`（可选 `LLM_MODEL_FAST`）。
4. 推送后，**Deploy site** 工作流会自动构建并发布初始内容。
5. 在 **Actions → Update content → Run workflow** 手动触发一次，生成第一期内容。之后会在每周二、周五北京时间 07:30 自动运行。

> GitHub Models 已于 2026 年 7 月停止服务，所以需要自行配置上面任一免费接口。各家免费模型名单会变动，失效时修改 `config/llm.json` 中的模型名即可，也可以用 `GEMINI_MODEL`、`ZHIPU_MODEL_FAST` 这类 Variables 覆盖。

## 工作原理

```
信息源（RSS / HF Daily Papers / Hacker News / 可选联网搜索）
   → 去重（data/seen.json）→ 打分排序
   → 主编选题（大模型，JSON）
   → 撰写：要闻 / 评论 / 研究解读 / 原理长文（分节撰写）
   → 引用校验：[n] 映射为原始链接，模型编造的链接自动移除
   → 写入 content/*.md → 提交 → 构建 → GitHub Pages
```

大模型按 `config/llm.json` 中的 `order` 依次尝试，遇到限流或报错时自动换下一家；各家的请求间隔按免费额度限制做了节流。

## 目录

```
config/
  editorial.md        编辑方针（所有写作提示词的系统提示，可直接修改文风）
  llm.json            大模型提供方、模型名、顺序、预算
  sources.json        信息源与权重
  primer-topics.json  原理长文选题队列
content/              文章（Markdown + frontmatter），可手写、修改、删除
data/                 运行状态与去重记录（自动维护）
scripts/              构建与更新脚本
src/                  样式、前端脚本、Service Worker
```

## 本地开发

```bash
npm install
npm run dev            # 构建并在 http://localhost:4321 预览
npm run collect        # 只采集候选条目，不调用大模型（检查信息源）
npm run update:dry     # 完整跑一遍但不写文件（需要设置密钥环境变量）
node scripts/update.mjs --only=essay            # 只生成评论
node scripts/update.mjs --force-primer --topic="混合专家模型"  # 指定主题写原理长文
```

## 手写文章

在 `content/essays|research|primers|viewpoints/` 下新建 `YYYY-MM-DD-slug.md`（人物观点额外填写 `person` 与 `role`）：

```markdown
---
title: 标题
date: 2026-11-21
summary: 一句话摘要
tags: [标签1, 标签2]
sources:
  - { n: 1, title: 参考资料标题, url: https://... }
---

正文，支持 $行内公式$ 与 $$块级公式$$。
```

不写 `generated: true`，文章末尾就不会显示“AI 辅助撰写”的提示。
