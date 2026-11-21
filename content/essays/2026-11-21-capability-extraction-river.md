---
title: 能力提取后的护城河与安全边界的迁移
date: '2026-11-21'
summary: >-
  当模型能力可被稳定提取、任意 harness
  替换、直接用于真实系统时，前沿实验室的竞争优势已由模型权重转移到工具链与部署策略；安全责任则从模型本体向平台与监管层面进一步下沉。
tags:
  - 大模型
  - 对抗性蒸馏
  - 工具化
  - 监管
  - 生态
generated: true
model: openai-fast
sources:
  - 'n': 1
    title: Combatting adversarial distillation
    url: 'https://openai.com/index/combatting-adversarial-distillation'
  - 'n': 2
    title: 'Managing frontier AI risk: From training to deployment'
    url: 'https://openai.com/index/managing-frontier-ai-risk'
  - 'n': 3
    title: >-
      SPILLWAY: Separating Target Admission from Sanitization to Defend
      Tool-Using Agents against Prompt Injection
    url: 'https://arxiv.org/abs/2611.07222'
  - 'n': 4
    title: >-
      Introducing harness adapters: adapt your favorite model to your harness to
      improve performance and cost
    url: 'https://huggingface.co/blog/harness-adapters-at-scale'
  - 'n': 5
    title: Inside the Codex sandbox
    url: 'https://openai.com/index/inside-the-codex-sandbox'
---

## 1 竞争优势已从权重转移至部署层  

OpenAI 在《Combatting adversarial distillation》中宣布，权重不再是“能力的容器”——通过模型训练、沙箱、检测与执法四层防护，任何人都能在不拥有原始权重的情况下复制前沿能力。该声明等价于把优势的核心从模型参数迁移到**harness** 与**沙箱** 的设计与实现上。  
- **harness adapters** 通过 RL 在特定任务分布上微调 LoRA，显著提升特定 harness 的性能与效率；例如 Qwen3.8‑27B 在 Pi harness 上从 39% 提升至 55% pass@1，平均 token 用量减半<sup>[[4]](https://huggingface.co/blog/harness-adapters-at-scale)</sup>。  
- **沙箱** 如 Codex sandbox 限制文件系统与网络访问，确保即使模型具备强大能力，也难以越过物理边界执行恶意操作<sup>[[5]](https://openai.com/index/inside-the-codex-sandbox)</sup>。  
- **工具链** 通过**SPILLWAY** 等原型，将安全检查从模型内部迁移至工具返回值的 typed fields 上，降低对模型自身判断的依赖，显著降低注入攻击成功率<sup>[[3]](https://arxiv.org/abs/2611.07222)</sup>。  

因此，实验室的竞争差异不再是“模型更强”，而是“部署更安全、成本更低、可定制更快”。具备一套成熟的 harness‑adapter、沙箱与运行时防御的团队，比单纯拥有更大权重的团队更具市场优势。  

## 2 传统安全责任的下沉与监管需求的演进  

OpenAI 的“训练—防护—检测—执法”四层框架，表面上是安全责任的层级化，但实际上是把安全责任从模型研发人员转移到 **平台运营者** 与 **监管机构**。  
- **训练层** 仍由实验室控制，强调对齐与安全审计，推迟模型发布至满足安全标准。  
- **防护层** 主要是 sandbox 与 harness 适配，属于 **平台层** 的技术实现。  
- **检测层** 通过监控与红队，及时发现逃逸或注入事件，属于 **运营层** 的持续安全运营。  
- **执法层** 则需要外部监管或行业规范介入，对违规的 distillation 或滥用行为进行处罚。  

这种下沉导致实验室的安全责任不再是单独的技术负担，而是成为 **生态治理** 的一部分。若平台或监管不完善，模型即使经过层层防护，仍可能被第三方通过 distillation 或工具链漏洞复制并滥用。  

## 3 对主流叙事的审视：安全与能力的关系是否被高估？  

主流叙事认为：只要模型训练完成并通过对齐测试，后续安全层即能“覆盖”所有风险。然而材料显示，**protected reasoning** 的提取成功率从 54% 降至 0.2% 仅是通过加强请求级防护实现的<sup>[[1]](https://openai.com/index/combatting-adversarial-distillation)</sup>。  
- 这说明：**已知攻击向量**（如 chain‑of‑thought 提取）可以被技术手段抑制，但并不排除未知向量或组合攻击的出现。  
- 另一方面，**安全层的成本** 与 **部署效率** 之间存在权衡。SPILLWAY 在保持攻击成功率几乎为零的同时，几乎不增加模型调用次数<sup>[[3]](https://arxiv.org/abs/2611.07222)</sup>，但其实现复杂度与对工具链的依赖提升了整体系统的维护成本。  

因此，对安全层能完全取代模型对齐的高估是错误的；安全层只能在 **已知风险空间** 内形成护城河，无法覆盖未知攻击与系统级漏洞。  

## 4 机制分析：为什么能力可被提取后安全边界会下沉？  

1. **模型可解释性下降**  
   - 大模型内部的 reasoning traces（chain‑of‑thought）包含了大量隐藏信息；一旦被提取，攻击者可在不拥有原模型的情况下获得相近能力。  
   - 这迫使安全设计从“模型内部”转向“外部边界”，即通过沙箱、工具返回值检查等机制限制能力的可用性。  

2. **工具链的中间人角色**  
   - 通过 **harness adapters**，模型的决策与工具调用被拆分；模型只负责生成工具调用指令，实际执行由沙箱或第三方 API 完成。  
   - 这使得攻击面从模型参数转移到工具接口与权限控制，安全责任从模型开发者转移到平台运营者与工具提供商。  

3. **监控与红队的迭代闭环**  
   - OpenAI 的安全案例显示，红队与监控能及时发现逃逸与攻击<sup>[[2]](https://openai.com/index/managing-frontier-ai-risk)</sup>。  
   - 但监控本身需要持续更新；随着攻击手法演进，监控模型与规则也必须同步迭代，形成持续的“运营成本”而非一次性投入。  

## 5 未来可检验的判断与值得跟踪的信号  

| 信号 | 预期表现 | 影响 |
|------|----------|------|
| **harness adapter 成本下降** | 随着 RL 库与框架成熟，adapter 训练成本将降至 10% 以内 | 竞争优势从模型参数转移到部署效率 |
| **沙箱安全事件率下降** | 通过统一的沙箱规范与治理，跨平台安全事件率 < 0.1% | 监管与平台治理逐步成熟 |
| **对抗性蒸馏案例增多** | 公开案例数量 > 20，展示多样化攻击向量 | 证明安全层只能应对已知威胁，未知威胁仍存 |

如果在 2027‑2028 年，harness adapter 的训练成本与部署时间显著下降，而安全事件率保持低位，则说明安全边界已成功下沉到
