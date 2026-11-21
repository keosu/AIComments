---
title: 去掉价值网络之后：GRPO 与可验证奖励如何重塑推理训练
date: 2026-11-21
summary: GRPO 用“同题多答、组内比较”替代 PPO 的价值网络，配合规则可判定的奖励，让大规模推理强化学习变得便宜而稳定。它为什么有效、隐含了哪些偏差、后续工作又修正了什么，是理解推理模型训练的关键一课。
tags: [强化学习, 推理, GRPO, 后训练, RLVR]
generated: true
sources:
  - { n: 1, title: "DeepSeekMath: Pushing the Limits of Mathematical Reasoning in Open Language Models (2024)", url: "https://arxiv.org/abs/2402.03300" }
  - { n: 2, title: "DeepSeek-R1: Incentivizing Reasoning Capability in LLMs via Reinforcement Learning (2025)", url: "https://arxiv.org/abs/2501.12948" }
  - { n: 3, title: "Proximal Policy Optimization Algorithms (2017)", url: "https://arxiv.org/abs/1707.06347" }
  - { n: 4, title: "Back to Basics: Revisiting REINFORCE Style Optimization for Learning from Human Feedback in LLMs (2024)", url: "https://arxiv.org/abs/2402.14740" }
  - { n: 5, title: "Understanding R1-Zero-Like Training: A Critical Perspective (2025)", url: "https://arxiv.org/abs/2503.20783" }
  - { n: 6, title: "DAPO: An Open-Source LLM Reinforcement Learning System at Scale (2025)", url: "https://arxiv.org/abs/2503.14476" }
  - { n: 7, title: "Does Reinforcement Learning Really Incentivize Reasoning Capacity in LLMs Beyond the Base Model? (2025)", url: "https://arxiv.org/abs/2504.13837" }
---

GRPO（Group Relative Policy Optimization）最早出现在 2024 年的 DeepSeekMath 论文中 <sup>[[1]](https://arxiv.org/abs/2402.03300)</sup>，一年后因 DeepSeek-R1 而广为人知 <sup>[[2]](https://arxiv.org/abs/2501.12948)</sup>。它不是一个复杂的算法，恰恰相反，它的价值在于**做减法**：去掉了 PPO 中最昂贵、最难训好的部件，并证明在“奖励可验证”的条件下，这样做不仅可行，而且更好。

## 问题

用强化学习微调大模型时，经典选择是 PPO <sup>[[3]](https://arxiv.org/abs/1707.06347)</sup>。PPO 需要一个价值网络（critic）来估计每个状态的期望回报，用于计算优势函数、降低策略梯度的方差。在大模型场景下，这带来两个麻烦：

1. **成本。** 价值网络通常与策略模型规模相当，训练时显存和计算几乎翻倍。
2. **难训。** 对推理任务而言，奖励通常只在整段回答结束时给出（答案对或错）。让价值网络为中间每个 token 估计“未来能否答对”，是一个信号极其稀疏的回归问题，估计不准反而会引入偏差。

## 核心思路

GRPO 的想法很朴素：**对同一个问题采样一组回答，用组内的相对好坏作为优势估计**，从而不需要价值网络。

具体地，对问题 $q$，从旧策略采样 $G$ 个回答 $\{o_1, \dots, o_G\}$，得到奖励 $\{r_1, \dots, r_G\}$。每个回答的优势取组内标准化后的奖励：

$$
\hat{A}_{i} = \frac{r_i - \mathrm{mean}(r_1,\dots,r_G)}{\mathrm{std}(r_1,\dots,r_G)}
$$

这个优势被赋给回答 $o_i$ 中的每一个 token。直觉上：同一道题，答对的回答被推高，答错的被压低；如果整组都对或都错，优势为零，这道题不提供梯度。

## 方法细节

GRPO 的目标函数沿用了 PPO 的截断重要性采样，并把 KL 正则直接放进损失（而不是像 RLHF 常见做法那样并入奖励）<sup>[[1]](https://arxiv.org/abs/2402.03300)</sup>：

$$
\mathcal{J}(\theta)=\mathbb{E}\left[\frac{1}{G}\sum_{i=1}^{G}\frac{1}{|o_i|}\sum_{t=1}^{|o_i|}\Big(\min\big(\rho_{i,t}\hat{A}_{i},\ \mathrm{clip}(\rho_{i,t},1-\varepsilon,1+\varepsilon)\hat{A}_{i}\big)-\beta\, \mathbb{D}_{\mathrm{KL}}\big[\pi_\theta \,\|\, \pi_{\mathrm{ref}}\big]\Big)\right]
$$

其中 $\rho_{i,t} = \pi_\theta(o_{i,t}\mid q, o_{i,<t}) / \pi_{\theta_{\mathrm{old}}}(o_{i,t}\mid q, o_{i,<t})$ 是重要性比率。从统计角度看，组均值就是一个蒙特卡洛基线，GRPO 与 REINFORCE 加基线、RLOO 一类方法同属一族 <sup>[[4]](https://arxiv.org/abs/2402.14740)</sup>——后者早已指出，在语言模型微调中 PPO 的许多复杂部件并非必需。

一个训练步的骨架大致如下：

```python
for batch in prompts:
    groups = [policy_old.sample(q, n=G) for q in batch]          # 每题采样 G 个回答
    rewards = [[verify(q, o) for o in g] for q, g in zip(batch, groups)]  # 规则判分
    adv = [(r - mean(r)) / (std(r) + 1e-6) for r in rewards]     # 组内标准化
    loss = clipped_pg_loss(policy, policy_old, groups, adv) + beta * kl(policy, ref)
    loss.backward(); optimizer.step()
```

**可验证奖励是另一半关键。** DeepSeek-R1-Zero 直接从基座模型出发做强化学习，奖励只有两类：准确性奖励（数学答案与标准答案比对、代码用测试用例判定）和格式奖励（推理过程是否放在指定标签内）<sup>[[2]](https://arxiv.org/abs/2501.12948)</sup>。论文明确表示没有使用神经网络奖励模型，理由是大规模强化学习中它容易被“奖励投机”（reward hacking）利用，且重新训练奖励模型会让流程复杂化。

## 证据与结果

R1-Zero 的训练曲线展示了几个引人注目的现象 <sup>[[2]](https://arxiv.org/abs/2501.12948)</sup>：在 AIME 2024 上的 pass@1 从训练初期的 15.6% 提升到 71.0%；回答长度随训练稳步增加，模型自发出现了反思、验证和换路重试等行为，论文称之为“顿悟时刻”。但 R1-Zero 也有明显缺陷：可读性差、多语言混杂。

最终的 R1 因此采用了多阶段流程：先用少量长思维链数据做“冷启动”监督微调，再做面向推理的强化学习（加入语言一致性奖励），然后通过拒绝采样构造新的监督数据重新微调，最后再做一轮覆盖全场景的强化学习。论文还发现，把 R1 的推理能力**蒸馏**给较小的模型，效果优于直接在小模型上做同样的强化学习。

## 我们的看法

**GRPO 成立的前提，是奖励足够可靠且组内存在差异。** 这带来三个直接推论：

- 它天然适合可验证领域（数学、代码、形式化任务），在开放式任务上，组内比较的质量完全取决于奖励模型，原有的奖励投机问题会重新出现。
- 对模型来说太难（全错）或太简单（全对）的题目不产生梯度，浪费了采样计算。DAPO 的“动态采样”正是针对这一点：过滤掉零方差的组，保证每个批次都有有效梯度 <sup>[[6]](https://arxiv.org/abs/2503.14476)</sup>。
- 采样 $G$ 个回答意味着推理侧成本成为训练的主要开销，这也是为什么高效的推理引擎成了强化学习基础设施的核心。

**原始目标函数中藏着偏差。** 2025 年的一项分析指出 <sup>[[5]](https://arxiv.org/abs/2503.20783)</sup>，按回答长度 $1/|o_i|$ 归一化会让“错误且冗长”的回答在每个 token 上受到的惩罚更小，从而可能推动回答长度不必要地增长；按组内标准差归一化则会让过易或过难的题目获得更大的权重。作者提出的修正版本（Dr. GRPO）去掉了这两项归一化。DAPO 则从另一个角度做了改进：将截断上下界解耦（Clip-Higher）以避免策略熵过早坍缩，改用 token 级的损失聚合，并对超长回答做奖励整形 <sup>[[6]](https://arxiv.org/abs/2503.14476)</sup>。这些修正提醒我们：**“回答越来越长”并不一定是推理能力增强的证据，也可能是目标函数的副产品**。

**强化学习是在“创造”能力，还是在“筛选”能力？** 这是目前最值得追问的问题。有研究比较了基座模型与强化学习后的模型在大采样数下的 pass@k，发现当 k 足够大时，基座模型往往能追平甚至反超——这暗示可验证奖励的强化学习主要是在提高已有正确路径的采样概率，而非扩展模型的能力边界 <sup>[[7]](https://arxiv.org/abs/2504.13837)</sup>。Dr. GRPO 的作者也观察到，部分基座模型在强化学习之前就已展现出自我反思行为 <sup>[[5]](https://arxiv.org/abs/2503.20783)</sup>。如果这一结论在更大规模上依然成立，那么推理能力的上限仍由预训练决定，强化学习更像是一把“锐化”工具；反之，如果更长时间、更大规模的强化学习能持续扩展 pass@k 的边界，那将意味着另一条扩展曲线的存在。这个问题的答案，会直接影响未来算力在预训练与后训练之间如何分配。
