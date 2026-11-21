---
title: 把神经元拆成概念：稀疏自编码器与“叠加”假说
date: 2026-11-21
summary: 单个神经元往往同时响应多个无关概念，这让“读懂”模型变得困难。稀疏自编码器试图把激活分解为大量稀疏、可解释的特征方向。它带来了迄今最直观的可解释性成果，也暴露出重建误差、特征划分任意性与下游实用性等根本问题。
tags: [可解释性, 稀疏自编码器, 叠加, 安全]
generated: true
sources:
  - { n: 1, title: "Toy Models of Superposition (Anthropic, 2022)", url: "https://transformer-circuits.pub/2022/toy_model/" }
  - { n: 2, title: "Towards Monosemanticity: Decomposing Language Models With Dictionary Learning (Anthropic, 2023)", url: "https://transformer-circuits.pub/2023/monosemantic-features/" }
  - { n: 3, title: "Scaling Monosemanticity: Extracting Interpretable Features from Claude 3 Sonnet (Anthropic, 2024)", url: "https://transformer-circuits.pub/2024/scaling-monosemanticity/" }
  - { n: 4, title: "Scaling and evaluating sparse autoencoders (OpenAI, 2024)", url: "https://arxiv.org/abs/2406.04093" }
  - { n: 5, title: "Gemma Scope: Open Sparse Autoencoders Everywhere All At Once on Gemma 2 (2024)", url: "https://arxiv.org/abs/2408.05147" }
  - { n: 6, title: "On the Biology of a Large Language Model (Anthropic, 2025)", url: "https://transformer-circuits.pub/2025/attribution-graphs/biology.html" }
---

如果想知道一个大模型“在想什么”，最直接的办法是看它的神经元。问题是，单个神经元往往是**多义的**（polysemantic）：同一个神经元可能同时对学术引用、韩文文本和 HTTP 请求做出响应。稀疏自编码器（Sparse Autoencoder, SAE）是近几年机制可解释性领域最受关注的方法，它试图回答一个问题：如果神经元不是理解模型的正确单位，那什么才是？

## 问题

2022 年的《Toy Models of Superposition》给出了一个有影响力的解释：**叠加**（superposition）<sup>[[1]](https://transformer-circuits.pub/2022/toy_model/)</sup>。模型需要表示的特征数量远多于它拥有的维度。当这些特征是稀疏的（任一时刻只有少数特征被激活），模型可以把它们编码到彼此近似正交的方向上，代价是少量干扰。于是，单个神经元（一个坐标轴方向）上会混杂多个特征的投影，看起来就是多义的。

如果叠加假说成立，那么可解释性的正确单位就不是神经元，而是激活空间中的**特征方向**。任务就变成了：如何从模型激活中把这些方向找出来。

## 核心思路

SAE 把这个问题表述为字典学习：用一个远大于原始维度的“字典”来重建激活，并要求每次只有少数字典元素被使用。

给定模型某层的激活 $x \in \mathbb{R}^d$，SAE 的编码器与解码器为：

$$
f(x) = \mathrm{ReLU}\big(W_{\mathrm{enc}}(x - b_{\mathrm{dec}}) + b_{\mathrm{enc}}\big), \qquad \hat{x} = W_{\mathrm{dec}}\, f(x) + b_{\mathrm{dec}}
$$

其中 $f(x) \in \mathbb{R}^m$ 且 $m \gg d$。训练目标是在重建误差与稀疏性之间取得平衡：

$$
\mathcal{L} = \lVert x - \hat{x} \rVert_2^2 + \lambda \lVert f(x) \rVert_1
$$

训练完成后，$W_{\mathrm{dec}}$ 的每一列就是一个候选“特征方向”，$f(x)$ 的每个分量表示该特征在当前输入上的激活强度。研究者再通过查看最强烈激活某个特征的文本样本、以及干预该特征后模型行为的变化，来判断它是否对应一个可解释的概念。

## 方法细节

**从玩具模型到前沿模型。** Anthropic 在 2023 年的《Towards Monosemanticity》中，在一个单层 Transformer 的 MLP 激活上训练 SAE，发现提取出的特征比神经元单义得多，例如专门响应 DNA 序列、阿拉伯文字或 Base64 编码的特征 <sup>[[2]](https://transformer-circuits.pub/2023/monosemantic-features/)</sup>。随着字典规模增大，特征会出现“分裂”：一个粗粒度的特征分化为多个更细的子特征。

2024 年的《Scaling Monosemanticity》把方法扩展到 Claude 3 Sonnet 的中间层残差流，训练了约 100 万、400 万和 3400 万个特征的 SAE <sup>[[3]](https://transformer-circuits.pub/2024/scaling-monosemanticity/)</sup>。提取出的特征高度抽象，并且跨语言、跨模态（同一个特征同时响应某个概念的文字描述与图像）。其中最出名的是一个与“金门大桥”相关的特征——把它的激活人为钳制到高值，模型会在各种无关话题中把自己和金门大桥联系起来。研究还找到了与欺骗、谄媚、偏见和危险内容相关的特征，这让 SAE 被寄予了安全监测的期望。

**工程改进。** OpenAI 在同年提出用 TopK 激活直接控制稀疏度，替代 L1 惩罚 <sup>[[4]](https://arxiv.org/abs/2406.04093)</sup>。L1 惩罚有一个副作用：它会把所有激活值整体往零压缩（shrinkage），损害重建质量；TopK 只保留最大的 k 个激活，稀疏度成为一个可直接设定的超参数。该工作还系统研究了 SAE 的扩展规律，并在 GPT-4 的激活上训练了 1600 万个隐变量的 SAE。Google DeepMind 则发布了 Gemma Scope，在 Gemma 2 的各层上开源了一整套 SAE（采用 JumpReLU 激活），大幅降低了学术界的研究门槛 <sup>[[5]](https://arxiv.org/abs/2408.05147)</sup>。

## 证据与结果

SAE 最有说服力的证据来自**因果干预**，而不仅仅是相关性：放大或抑制某个特征，模型的输出会以符合该特征语义的方式改变 <sup>[[3]](https://transformer-circuits.pub/2024/scaling-monosemanticity/)</sup>。这说明这些方向不只是统计上的巧合，而在模型的计算中确实发挥作用。

在此基础上，2025 年 Anthropic 的工作更进一步：用“跨层转码器”（cross-layer transcoder）替换模型的 MLP，构建归因图（attribution graph），追踪从输入到输出的特征级计算路径 <sup>[[6]](https://transformer-circuits.pub/2025/attribution-graphs/biology.html)</sup>。他们在 Claude 3.5 Haiku 上观察到了多步推理的中间表示（例如先激活“达拉斯在得克萨斯州”，再得出“首府是奥斯汀”），以及写押韵诗时提前规划韵脚的迹象。这是从“找到特征”走向“读懂回路”的重要一步。

## 我们的看法

SAE 让可解释性第一次有了可规模化的工具，但有几个根本问题仍未解决，而且它们不是工程细节：

**重建误差意味着我们只解释了一部分。** 把模型激活替换为 SAE 的重建结果后，模型的语言建模损失通常会明显上升。没有被重建的那部分残差——有人称之为“暗物质”——可能恰恰包含了重要的计算。用一个只能部分重建的模型去解释原模型，结论的外推需要格外谨慎。

**特征的划分有任意性。** 字典大小不同，得到的特征集合也不同：小字典中的一个特征，在大字典里会分裂成若干个。还存在“特征吸收”现象：一个本应通用的特征在某些子情形下被更具体的特征替代，导致它的激活出现难以预料的缺口。这让人怀疑：SAE 找到的是模型“真实”的计算单元，还是我们施加的稀疏先验所诱导出的一种方便的分解？

**下游实用性尚未得到充分证明。** 可解释性研究最终要回答“它能帮我们做什么”。2025 年，Google DeepMind 的可解释性团队公开报告了一组负面结果：在检测有害意图等下游任务上，基于 SAE 特征的方法并没有优于简单的线性探针，他们因此调整了研究优先级。这不是对 SAE 的否定，而是提醒我们，“看起来可解释”与“在实际任务上有用”之间仍有距离。

**我们的判断是：** SAE 更可能成为一种“显微镜”，而不是“说明书”。它适合用来发现假设——模型可能在用什么概念、什么回路——然后再用更有针对性的因果实验去验证。可解释性领域接下来的关键进展，可能不在于更大的字典，而在于两件事：一是能够忠实替代原模型计算的分解方法（让“暗物质”变小）；二是在真实安全任务上证明其相对于简单基线的优势。
