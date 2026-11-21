---
title: AI 开始做研究之后，瓶颈从“产出”转向“验证与理解”
date: 2026-11-21
priority: 1
summary: 一周之内，AI 先后在黑洞物理和黎曼猜想上交出重大结果，OpenAI 也公布了内部研究加速的数据。这些信号指向同一件事：生成研究成果正在变得廉价，判断成果对不对、读懂它意味着什么，正在成为真正稀缺的东西。
tags: [大模型, 推理, AI 与科学, 智能体, 评测]
generated: true
sources:
  - { n: 1, title: "Anthropic: Claude solves two open problems in the physics of black holes", url: "https://www.anthropic.com/research/claude-black-hole-physics" }
  - { n: 2, title: "Latent Space: Riemann Hypothesis proved...twice independently", url: "https://latent.space/p/ainews-riemann-hypothesis-proved-twice-independently/" }
  - { n: 3, title: "OpenAI: Research acceleration: The jagged frontier", url: "https://openai.com/index/research-acceleration-jagged-frontier" }
  - { n: 4, title: "ComplexDiscovery: Harvard researchers find AI coding agents shifted the bottleneck to code review", url: "https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/" }
  - { n: 5, title: "Dwarkesh Podcast: Paul Christiano", url: "https://www.dwarkesh.com/p/paul-christiano-2" }
---

2026 年 11 月中旬的一周，几乎可以作为“AI 做研究”这一叙事的分水岭来记录：Claude 智能体解决了两个黑洞物理中的开放问题，一位 Anthropic 数学家宣布借助 Claude 证明了黎曼猜想，OpenAI 公布了内部编程智能体加速研究的量化报告。人们很自然地把注意力放在“AI 能做出什么”上。但我的判断是，这些事件真正揭示的是另一件事：**生成研究成果正在迅速变得廉价，而判断成果是否正确、理解它意味着什么，正在成为整个研究体系里最稀缺的环节。**

## 一周之内的三个信号

**第一个信号来自物理。** 按 Anthropic 的描述，一位研究员让 Claude 列出黑洞与 bootstrap 方法方向上的开放问题，Claude 给出了 22 个候选；随后为每个问题分配独立的智能体，让它们在后台运行约六周，彼此可以阅读进展并协作 <sup>[[1]](https://www.anthropic.com/research/claude-black-hole-physics)</sup>。其中两个问题被解决：一个是 2003 年就有人列出、却因过于复杂而从未完成的 Hawking–Page 相变计算；另一个是模 bootstrap 方法最简单版本的精确上界。值得注意的是验证环节——后一个结果在 Lean 中完成了形式化验证，论文写成后还有物理学家逐一核对了每个主要结果 <sup>[[1]](https://www.anthropic.com/research/claude-black-hole-physics)</sup>。

**第二个信号来自数学，而且更具戏剧性。** 据 Latent Space 汇总，Levent Alpöge 宣布与 Claude 合作证明了（广义）黎曼猜想，但他只发布了约 1.3GB 的 Lean 代码；如果把证明改写成文字，据称会超过 25 万页 <sup>[[2]](https://latent.space/p/ainews-riemann-hypothesis-proved-twice-independently/)</sup>。另一位研究者确认这份形式化陈述确实是广义黎曼猜想，并估计 Lean 本身出错的概率远低于 1%，但在报道发布时代码仍在编译。几乎同时，另一位数学家公布了一份约 940 页的纯人工证明草稿。Latent Space 的概括很精准：AI 写出的证明大概率是对的，却没人读得懂；人类写的证明能读懂，却大概率在技术细节上有错 <sup>[[2]](https://latent.space/p/ainews-riemann-hypothesis-proved-twice-independently/)</sup>。同一篇汇总还提醒，OpenAI 9 月关于 Navier–Stokes 的声明至今仍是警示案例：批评者认为它的 Lean 证明与自然语言陈述的结论并不一致。

**第三个信号来自实验室内部。** OpenAI 的报告显示，对于人类需要 2–4 小时的研究任务，智能体独立完成率从 3 月的 23% 升至 10 月的 46%；研究人员每天在智能体上的花费（按 API 价格计算）中位数约为 2400 美元 <sup>[[3]](https://openai.com/index/research-acceleration-jagged-frontier)</sup>。但报告的标题本身就是一个警告：前沿是“锯齿状”的。

## 锯齿状：为什么平均数会误导

OpenAI 报告中最有信息量的不是平均成功率，而是按任务拆分的数据：监控训练运行的独立成功率为 79%，回答技术问题为 72%；而编写推理服务代码只有 25%，构建评测、强化学习和智能体环境只有 29% <sup>[[3]](https://openai.com/index/research-acceleration-jagged-frontier)</sup>。报告自己也指出，只要不同任务上的表现参差不齐，表现较差的任务就可能成为整体加速的瓶颈。

这是阿姆达尔定律（Amdahl's law）在研究流程上的翻版：一条流程的整体提速，受限于其中无法加速的那部分。如果构建评测环境、编写可靠的服务代码仍然高度依赖人类，那么即使写实验代码、分析结果的速度提高十倍，整体研究速度也远不会提高十倍。

值得注意的是，表现最差的任务恰好集中在“为系统建立检验标准”这一类——评测和训练环境本质上就是验证器。这与下面的观察互相呼应。

## 产出过剩，验证稀缺

在软件行业，这一转移已经有了数据。一篇覆盖 718 家公司、约 72.6 万名员工的哈佛工作论文发现：采用编程智能体后，人均新增代码量增加约 30%，提交数和合并请求数也明显上升；但以“部署到生产环境的已完成任务”衡量的产出，并没有统计上可检测的增长 <sup>[[4]](https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/)</sup>。差额消失在代码审查里：从提交到合并的时间延长了 49%，收到修改要求的合并请求比例几乎翻倍。AI 审查工具没有消除这一瓶颈——近 80% 的公司用过这类工具，但它们只贡献了 23.3% 的审查评论。报道还提到，另一篇研究观察到，自主智能体带来的提交数累计增长 240%，落到实际发布上只剩 30% <sup>[[4]](https://complexdiscovery.com/harvard-researchers-find-ai-coding-agents-shifted-the-bottleneck-to-code-review/)</sup>。（需要说明，该论文尚未经过同行评审，其数据合作方对这一话题有商业利益。）

论文作者给出的解释有两条渠道：一是更快的起草把更多代码送到了数量固定的审查者面前；二是修改要求增多，暗示草稿质量本身在下降。前者可以靠增加审查人力缓解，后者则需要更好的技术。这个区分同样适用于科研：**AI 产出的研究成果越多，人类专家用于核查的时间就越成为瓶颈**；而如果产出的平均质量不高，增加核查人力也只是在填一个越来越深的坑。

## 验证可以自动化，理解不能

数学领域给出了一个看似完美的出路：形式化验证。只要证明能通过 Lean 编译，它的正确性就不依赖任何人的阅读。黑洞物理的 bootstrap 结果、黎曼猜想的声明，都把 Lean 作为可信度的核心来源。这恰恰说明，在验证可以自动化的领域，AI 的研究能力会率先释放出来。

但有两个问题无法靠形式化绕过。

**其一，陈述本身要由人来确认。** 证明可以被机器检查，但“机器检查的命题是否就是我们想证明的命题”，仍然需要专家判断。Navier–Stokes 声明引发的争议正在于此 <sup>[[2]](https://latent.space/p/ainews-riemann-hypothesis-proved-twice-independently/)</sup>。验证的瓶颈并没有消失，而是从“检查每一步”上移到了“审定陈述与规范”。

**其二，正确不等于理解。** 一份 25 万页、无人读过的证明，即便完全正确，它作为知识的价值也与一份能被人类吸收、推广、用于启发下一个问题的证明截然不同。科学的产出不只是一串“真”的命题，还包括让人类能在其上继续建造的概念和方法。黑洞物理那项工作之所以更容易被接受，部分原因正在于它附带了可读的论文，也经过了物理学家的核对 <sup>[[1]](https://www.anthropic.com/research/claude-black-hole-physics)</sup>。

这也让“如何衡量 AI 研究能力”变得更难。Paul Christiano 在近期访谈中直言，基准分数是评估整体进展速度的糟糕方式，而公众又很难知道实验室内部到底发生了什么 <sup>[[5]](https://www.dwarkesh.com/p/paul-christiano-2)</sup>。当成果的生成者和验证者越来越多地都是 AI，外部世界能依赖的信号就更少了。

## 值得跟踪的信号

如果“瓶颈转向验证与理解”这一判断成立，接下来应该看到：

1. **衡量口径从“生成量”转向“被接受的产出”。** 无论在软件还是科研中，“合并的代码”“通过审稿的论文”“被独立复核的结果”会比“生成的代码行数”“提出的证明”更受重视。
2. **规范审定成为一门专门的技能。** 形式化陈述的审计、测试用例和评测环境的设计，将从辅助性工作变成核心工作——也正是 OpenAI 数据里 AI 表现最弱的那一类任务。
3. **出现“把 AI 结果翻译给人类”的研究方向。** 例如把巨大的形式化证明压缩成人类可理解的结构，或者自动生成可供专家核查的关键引理清单。
4. **黎曼猜想声明的后续。** Lean 代码能否完整通过编译、是否引入了额外公理、形式化陈述能否得到数学界公认——这一事件的结局，将在很大程度上决定“形式化验证即可信”这一范式能走多远。

AI 做研究的时代已经开始。但在这个时代里，最有价值的人类能力可能不是“想出答案”，而是判断答案是否成立、以及它究竟意味着什么。
