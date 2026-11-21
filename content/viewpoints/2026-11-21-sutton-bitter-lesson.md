---
title: 苦涩的教训，在大模型时代被读懂了一半
date: 2026-11-21
person: Rich Sutton
role: 强化学习奠基人之一、2024 年图灵奖得主
summary: Sutton 在 2019 年写下《苦涩的教训》：能随算力扩展的通用方法终将胜出。大模型的成功常被视为对这篇短文的验证，但它真正强调的是“搜索与学习”，并对“把人类知识装进模型”保持警惕——而今天的大模型恰恰建立在人类数据之上。
tags: [人物观点, Scaling Law, 强化学习, 大模型]
generated: true
sources:
  - { n: 1, title: "Rich Sutton: The Bitter Lesson (2019)", url: "http://www.incompleteideas.net/IncIdeas/BitterLesson.html" }
  - { n: 2, title: "Scaling Laws for Neural Language Models (2020)", url: "https://arxiv.org/abs/2001.08361" }
  - { n: 3, title: "OpenAI: Learning to Reason with LLMs (2024)", url: "https://openai.com/index/learning-to-reason-with-llms/" }
---

## 背景

Rich Sutton 是强化学习领域的奠基人之一，与 Andrew Barto 合著的《强化学习》是该领域最经典的教材，两人也因在强化学习上的奠基性贡献获得了 2024 年度图灵奖。2019 年 3 月，他在个人网站上发表了一篇不到两页的短文《The Bitter Lesson》（苦涩的教训）<sup>[[1]](http://www.incompleteideas.net/IncIdeas/BitterLesson.html)</sup>。这篇文章此后成为 AI 领域被引用最多的“非论文”之一，几乎每一轮关于规模化的讨论都会提到它。

## 核心观点

文章开篇就给出了结论：

> 从七十年的 AI 研究中可以读出的最大教训是：利用计算的通用方法最终是最有效的，而且优势巨大。（原文：“The biggest lesson that can be read from 70 years of AI research is that general methods that leverage computation are ultimately the most effective, and by a large margin.”）

围绕这一结论，Sutton 的论点可以概括为四条：

1. **算力的持续增长是 AI 进步的根本驱动力。** 研究者在短期内倾向于利用自己的领域知识来提升系统，因为这在当下见效最快；但从长期看，真正重要的只有对算力的利用。
2. **历史反复证明了这一点。** 他列举了国际象棋、围棋、语音识别和计算机视觉：在每个领域，基于人类知识精心设计的方法起初占优，最终都被依赖大规模搜索或学习的通用方法超越。
3. **可以无限扩展的方法只有两种。** 用他的话说：

> 似乎能以这种方式无限扩展的两种方法是搜索和学习。（原文：“The two methods that seem to scale arbitrarily in this way are search and learning.”）

4. **不要试图把我们对思维的理解直接写进系统。** 心智的实际内容极其复杂，试图用简单方式刻画它注定失败；我们应该构建能够自己发现这种复杂性的元方法。文章以这样一句话收尾：

> 我们想要的是能像我们一样去发现的 AI 智能体，而不是装载了我们已有发现的智能体。（原文：“We want AI agents that can discover like we can, not which contain what we have discovered.”）

## 论证与依据

Sutton 的论证方式是历史归纳而非理论推导。他的核心依据是一个反复出现的模式：领域专家倾向于把人类理解问题的方式编码进系统，这在短期内带来满足感和进步，但很快遇到瓶颈，甚至阻碍进一步发展；而突破性进展最终来自一个相反的方向——依靠扩大计算规模进行搜索和学习。之所以说这个教训“苦涩”，是因为它否定了研究者最珍视的东西：自己对问题的洞察。

## 我们的看法

**大模型时代验证了这篇文章的一半。** Scaling Law 的研究表明，语言模型的性能随计算、数据和参数规模平滑提升 <sup>[[2]](https://arxiv.org/abs/2001.08361)</sup>，这几乎是“利用计算的通用方法胜出”的教科书式例证。Transformer 本身也是一个相对“通用”、归纳偏置较少的架构。从这个意义上说，过去几年的发展是对 Sutton 的有力支持。

**但流行的解读常常把它简化成了“只要堆规模”。** 原文强调的是两种具体方法：搜索和学习。在很长一段时间里，大模型的进展主要来自“学习”这一半；直到推理模型出现，能力开始随推理时的思考计算扩展 <sup>[[3]](https://openai.com/index/learning-to-reason-with-llms/)</sup>，“搜索”这一半才以新的形式回归。如果把苦涩的教训读成“唯规模论”，就会忽视这次转向的意义。

**更深的张力在文章的最后一句。** 今天的大模型主要通过模仿海量人类文本获得能力——严格来说，它们正是“装载了我们已有发现的智能体”。这与 Sutton 的愿景存在根本冲突：从人类数据中学习，能力上限可能受限于人类数据本身。Sutton 本人近年来与 David Silver 等人倡导的“经验时代”（Era of Experience）主张，正是沿着这一方向：下一阶段的进步应当来自智能体与环境交互、从自身经验中学习，而非继续依赖人类生成的数据。在高质量文本数据逐渐耗尽的背景下，这个判断显得越来越有现实意义。

**反对意见同样值得认真对待。** 其一，“通用方法”与“归纳偏置”之间并没有清晰的界线：卷积、注意力、残差连接都是人类设计的结构，正是它们让学习得以高效扩展。苦涩的教训更准确的版本也许是“偏好能随算力扩展的结构”，而非“拒绝一切人类知识”。其二，算力增长并不是免费的午餐：在能源、芯片与成本的约束下，计算效率本身可能重新成为竞争焦点，而效率往往来自巧妙的设计。其三，这篇文章是对过去的归纳，归纳法本身并不保证未来——但到目前为止，押注它的人赢多输少。
