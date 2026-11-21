---
title: 注意力与 KV Cache：从一行公式到一套推理系统
date: 2026-11-21
summary: 几乎所有大模型推理优化——GQA、MLA、FlashAttention、PagedAttention、前缀缓存、投机解码——都围绕同一个对象展开：注意力机制及其产生的 KV Cache。本文从公式出发，讲清它为什么成为推理的核心瓶颈，以及工程上如何逐层化解。
tags: [AI 基础设施, 注意力机制, KV Cache, 推理优化, Transformer]
generated: true
sources:
  - { n: 1, title: "Attention Is All You Need (2017)", url: "https://arxiv.org/abs/1706.03762" }
  - { n: 2, title: "Fast Transformer Decoding: One Write-Head is All You Need (MQA, 2019)", url: "https://arxiv.org/abs/1911.02150" }
  - { n: 3, title: "GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints (2023)", url: "https://arxiv.org/abs/2305.13245" }
  - { n: 4, title: "DeepSeek-V2: A Strong, Economical, and Efficient Mixture-of-Experts Language Model (MLA, 2024)", url: "https://arxiv.org/abs/2405.04434" }
  - { n: 5, title: "FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness (2022)", url: "https://arxiv.org/abs/2205.14135" }
  - { n: 6, title: "FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning (2023)", url: "https://arxiv.org/abs/2307.08691" }
  - { n: 7, title: "Efficient Memory Management for Large Language Model Serving with PagedAttention (vLLM, 2023)", url: "https://arxiv.org/abs/2309.06180" }
  - { n: 8, title: "SGLang: Efficient Execution of Structured Language Model Programs (RadixAttention, 2023)", url: "https://arxiv.org/abs/2312.07104" }
  - { n: 9, title: "RoFormer: Enhanced Transformer with Rotary Position Embedding (RoPE, 2021)", url: "https://arxiv.org/abs/2104.09864" }
  - { n: 10, title: "Efficient Streaming Language Models with Attention Sinks (2023)", url: "https://arxiv.org/abs/2309.17453" }
  - { n: 11, title: "Fast Inference from Transformers via Speculative Decoding (2022)", url: "https://arxiv.org/abs/2211.17192" }
---

如果只能挑一个概念来理解大模型推理系统，那就是 **KV Cache**。模型为什么越长越慢、为什么显存总是不够、为什么某些架构“推理便宜”、为什么推理引擎要像操作系统一样管理内存——这些问题追到最后，几乎都会回到注意力机制和它留下的缓存上。

这篇文章从公式出发，沿着“计算 → 缓存 → 压缩 → 加速 → 调度”的顺序，把这条主线完整走一遍。

## 缩放点积注意力：公式里的每一项

Transformer 的核心操作是缩放点积注意力 <sup>[[1]](https://arxiv.org/abs/1706.03762)</sup>：

$$
\mathrm{Attention}(Q, K, V) = \mathrm{softmax}\!\left(\frac{QK^\top}{\sqrt{d_k}} + M\right)V
$$

逐项拆开：

- $Q = XW_Q$、$K = XW_K$、$V = XW_V$ 是输入序列 $X \in \mathbb{R}^{n \times d}$ 的三个线性投影。可以把 $Q$ 理解为“我在找什么”，$K$ 是“我能提供什么的索引”，$V$ 是“我实际提供的内容”。
- $QK^\top \in \mathbb{R}^{n \times n}$ 计算每对位置之间的相关度，这正是注意力计算量与序列长度呈平方关系的来源。
- 除以 $\sqrt{d_k}$ 是为了控制方差：若 $q$、$k$ 的各分量独立、均值为 0、方差为 1，则点积的方差为 $d_k$。不做缩放，维度一大，softmax 的输入就会落入饱和区，梯度几乎消失。
- $M$ 是因果掩码：对未来位置填 $-\infty$，保证位置 $i$ 只能看到 $j \le i$ 的信息。自回归生成依赖这一点。

**多头注意力**把 $d$ 维拆成 $h$ 个头，每个头的维度为 $d_h = d/h$，各自独立计算注意力后再拼接，让模型能在不同子空间中关注不同类型的关系。

## 自回归解码与 KV Cache

大模型生成文本分为两个阶段：

1. **预填充（prefill）**：一次性处理整段提示词，所有位置并行计算。这一阶段是**计算密集**的，决定了首个 token 的延迟（TTFT）。
2. **解码（decode）**：每步只生成一个新 token，再把它接到序列末尾，循环往复。决定了每个后续 token 的延迟（TPOT）。

在解码第 $t$ 步时，新 token 的查询 $q_t$ 需要与之前**所有**位置的 $k_1, \dots, k_t$ 做点积，并对 $v_1, \dots, v_t$ 加权求和。而由于因果掩码，过去位置的 $k$、$v$ 不会因为新 token 的到来而改变。于是自然的优化是：**把它们存下来，每步只计算新 token 的 $k_t$、$v_t$ 并追加**。这就是 KV Cache。它把每步解码的计算量从“重算整个序列”降为“只算一个位置”。

代价是显存。每个 token 需要缓存的字节数为：

$$
\text{KV 字节数 / token} = 2 \times L \times n_{kv} \times d_h \times \text{每元素字节数}
$$

其中 2 对应 K 和 V，$L$ 是层数，$n_{kv}$ 是 KV 头数。以一个典型的 7B 级多头注意力模型为例（32 层、32 个头、$d_h = 128$、FP16）：

$$
2 \times 32 \times 32 \times 128 \times 2\ \text{B} = 512\ \text{KiB / token}
$$

一条 4K token 的序列需要 2 GiB 缓存；同时服务 16 条这样的请求，仅 KV Cache 就要 32 GiB——已经超过模型权重本身（约 13 GiB）。

**为什么解码慢？** 解码时每生成一个 token，都要把全部模型权重和该请求的整个 KV Cache 从显存读一遍，而对应的计算量很小。用“算术强度”（每读取 1 字节做多少次浮点运算）来衡量，批量为 1 的解码大约只有 1 FLOP/字节的量级，而现代 GPU 的算力与带宽之比在数百 FLOP/字节。结论是：**解码受限于显存带宽，而不是算力**。几乎所有推理优化都在想办法：少读一点（压缩 KV）、读得更聪明（更好的内核）、一次读服务更多请求（批处理），或者一次读多产出几个 token（投机解码）。

下面是一个带 KV Cache 与分组查询的最小实现（省略了位置编码；带缓存时假设每次只解码 1 个 token）：

```python
import torch
import torch.nn.functional as F

class CausalSelfAttention(torch.nn.Module):
    def __init__(self, d_model, n_heads, n_kv_heads):
        super().__init__()
        self.h, self.kv, self.dh = n_heads, n_kv_heads, d_model // n_heads
        self.wq = torch.nn.Linear(d_model, n_heads * self.dh, bias=False)
        self.wk = torch.nn.Linear(d_model, n_kv_heads * self.dh, bias=False)
        self.wv = torch.nn.Linear(d_model, n_kv_heads * self.dh, bias=False)
        self.wo = torch.nn.Linear(n_heads * self.dh, d_model, bias=False)

    def forward(self, x, cache=None):
        B, T, _ = x.shape
        q = self.wq(x).view(B, T, self.h, self.dh).transpose(1, 2)   # (B, h,  T, dh)
        k = self.wk(x).view(B, T, self.kv, self.dh).transpose(1, 2)  # (B, kv, T, dh)
        v = self.wv(x).view(B, T, self.kv, self.dh).transpose(1, 2)
        if cache is not None:                       # 解码：拼接历史 K/V
            k = torch.cat([cache[0], k], dim=2)
            v = torch.cat([cache[1], v], dim=2)
        new_cache = (k, v)                          # 缓存的是 kv 个头，而不是 h 个
        rep = self.h // self.kv                     # 每组 KV 被 rep 个查询头共享
        k = k.repeat_interleave(rep, dim=1)
        v = v.repeat_interleave(rep, dim=1)
        out = F.scaled_dot_product_attention(q, k, v, is_causal=cache is None)
        return self.wo(out.transpose(1, 2).reshape(B, T, -1)), new_cache
```

## 压缩 KV：MQA、GQA 与 MLA

既然 KV Cache 的大小正比于 $n_{kv}$，最直接的压缩就是减少 KV 头的数量。

**MQA（多查询注意力）** 让所有查询头共享同一组 K 和 V <sup>[[2]](https://arxiv.org/abs/1911.02150)</sup>，KV Cache 缩小为原来的 $1/h$，但表达能力的损失有时会影响质量。

**GQA（分组查询注意力）** 是折中方案 <sup>[[3]](https://arxiv.org/abs/2305.13245)</sup>：把查询头分成 $g$ 组，每组共享一对 KV 头。$g = 1$ 退化为 MQA，$g = h$ 即为标准多头注意力。论文还表明，已有的多头注意力模型只需约 5% 的原始预训练计算量做“增量训练”，就能转换为 GQA。上面代码中的 `n_kv_heads` 就是组数 $g$。以 8 个 KV 头为例，前面那个 7B 模型的每 token 缓存从 512 KiB 降到 128 KiB。GQA 因其简单有效，成为了开源模型的主流配置。

**MLA（多头潜在注意力）** 来自 DeepSeek-V2 <sup>[[4]](https://arxiv.org/abs/2405.04434)</sup>，思路更进一步：不减少头数，而是对 K 和 V 做**联合低秩压缩**，只缓存一个低维潜在向量：

$$
c_t^{KV} = W^{DKV} h_t, \qquad k_t^{C} = W^{UK} c_t^{KV}, \qquad v_t^{C} = W^{UV} c_t^{KV}
$$

推理时只需缓存 $c_t^{KV}$（维度 $d_c$ 远小于 $2 n_h d_h$）。更巧妙的是，由于矩阵乘法的结合律，$W^{UK}$ 可以被“吸收”进查询投影，$W^{UV}$ 可以被吸收进输出投影，因此推理时无需显式还原完整的 K 和 V。

一个麻烦来自位置编码：RoPE 在 $q$ 与 $k$ 上施加与位置相关的旋转，会夹在 $W^{UK}$ 与查询之间，破坏吸收。MLA 的解决办法是**解耦**：额外使用一小部分维度单独承载 RoPE，这部分 key 被所有头共享并单独缓存。论文报告，与 DeepSeek 67B 相比，DeepSeek-V2 的 KV Cache 减少了 93.3%，最大生成吞吐提升到 5.76 倍；其每 token 的缓存量相当于只有 2.25 组的 GQA，但效果优于标准多头注意力 <sup>[[4]](https://arxiv.org/abs/2405.04434)</sup>。

| 方案 | 每层每 token 缓存（元素数） | 质量 | 实现复杂度 |
| --- | --- | --- | --- |
| MHA | $2 n_h d_h$ | 基准 | 低 |
| MQA | $2 d_h$ | 可能下降 | 低 |
| GQA | $2 g d_h$ | 接近 MHA | 低 |
| MLA | $d_c + d_h^R$ | 论文报告优于 MHA | 高（需配合专用内核） |

## 让注意力跑得更快：FlashAttention

压缩解决了“存多少”，FlashAttention 解决的是“怎么算” <sup>[[5]](https://arxiv.org/abs/2205.14135)</sup>。

朴素实现会把 $n \times n$ 的注意力分数矩阵完整写入显存（HBM），再读出来做 softmax，再写回、再与 $V$ 相乘。对长序列而言，这些读写远比计算本身耗时。FlashAttention 的核心思想是 **IO 感知**：把 $Q$、$K$、$V$ 切成小块，在速度快得多的片上 SRAM 中完成一个块的全部计算，从不在 HBM 中物化完整的分数矩阵。

难点在于 softmax 需要整行的最大值和归一化因子。FlashAttention 使用**在线 softmax**：逐块处理时维护当前的行最大值 $m$ 和归一化累加量 $\ell$，每来一个新块 $S_j$ 就更新：

$$
m' = \max\big(m,\ \mathrm{rowmax}(S_j)\big), \quad
\ell' = e^{m - m'}\ell + \mathrm{rowsum}\big(e^{S_j - m'}\big), \quad
O' = e^{m - m'} O + e^{S_j - m'} V_j
$$

全部块处理完后，输出为 $O / \ell$。这个计算是**精确**的，不是近似——它只是重新安排了计算顺序。结果是显存占用从 $O(n^2)$ 降到 $O(n)$，速度也显著提升。FlashAttention-2 进一步优化了并行划分和非矩阵乘法运算的开销，速度约为第一版的两倍 <sup>[[6]](https://arxiv.org/abs/2307.08691)</sup>。如今它已是训练和推理框架的默认组件。

## 让显存用得更满：PagedAttention 与前缀缓存

即使单条请求的 KV Cache 被压缩了，服务大量并发请求时仍面临**内存碎片**问题。早期系统按“最大可能长度”为每条请求预留连续显存，而生成长度事先未知，导致大量显存被预留却从未使用。

vLLM 提出的 **PagedAttention** 借鉴了操作系统的虚拟内存分页 <sup>[[7]](https://arxiv.org/abs/2309.06180)</sup>：把 KV Cache 切成固定大小的块（例如每块 16 个 token），块在物理显存中不必连续，通过一张“块表”把逻辑位置映射到物理块。这样一来，显存按需分配，浪费降到很低（论文报告低于 4%）；不同请求还可以共享相同前缀的物理块（例如并行采样多个回答时共享提示词部分），用写时复制处理分叉。在相同延迟下，吞吐比当时的主流系统提升 2–4 倍。

**前缀缓存**把共享推向跨请求：多轮对话的历史、相同的系统提示词、少样本示例，都可以复用已经算好的 KV。SGLang 的 RadixAttention 用基数树组织所有缓存的前缀，新请求到来时自动匹配最长公共前缀，并用 LRU 策略淘汰 <sup>[[8]](https://arxiv.org/abs/2312.07104)</sup>。对智能体和多轮对话这类“长前缀、短增量”的负载，收益尤其明显。

配合**连续批处理**（请求可以在任意解码步加入或离开批次，而不必等整批结束），这三者构成了现代推理引擎的内存与调度基础。

## 长上下文：位置编码与注意力的边界

上下文越长，KV Cache 越大，位置编码的外推问题也越突出。

**RoPE（旋转位置编码）** 是目前的主流选择 <sup>[[9]](https://arxiv.org/abs/2104.09864)</sup>。它把 $q$、$k$ 的每两个维度视为一个二维平面，按位置 $m$ 旋转角度 $m\theta_i$，其中 $\theta_i = 10000^{-2i/d}$。旋转矩阵的性质保证：

$$
\langle R_m q,\ R_n k \rangle = \langle q,\ R_{n-m}\, k \rangle
$$

即注意力分数只依赖相对位置 $n - m$。RoPE 不引入额外参数，也便于通过调整频率（位置插值、NTK 缩放、YaRN 等方法）把模型扩展到训练时未见过的长度。

另一个有趣的发现是**注意力汇聚点**（attention sink）<sup>[[10]](https://arxiv.org/abs/2309.17453)</sup>：模型倾向于把大量注意力权重分配给序列开头的几个 token，无论其语义如何——因为 softmax 要求权重和为 1，模型需要一个“无处可去时的落脚点”。StreamingLLM 据此提出：在滑动窗口缓存之外，始终保留开头的少数几个 token，就能让模型在超长流式输入上保持稳定。这也提示了 KV Cache 淘汰策略的设计原则：不是所有历史 token 同等重要。

## 工程实践清单

把上面的原理落到实际部署中，有几条经验值得记住：

1. **先算账。** 部署前用“KV 字节数 / token × 最大上下文 × 并发数”估算缓存需求，并与“显存 − 权重 − 激活”对比。很多“显存不够”的问题在这一步就能看清。
2. **选型时关注 KV 头数，而不只是参数量。** 两个参数量相近的模型，KV 头数相差 4 倍，长上下文下的服务成本可能就相差数倍。
3. **KV Cache 量化通常是性价比最高的一步。** 把缓存从 FP16 降到 FP8 可以直接减半显存，质量影响一般较小；更激进的 INT4 需要针对任务验证。
4. **分别监控 TTFT 和 TPOT。** 预填充是计算瓶颈，解码是带宽瓶颈，两者的优化手段不同。长提示词场景可启用分块预填充，避免一个长请求阻塞其他请求的解码；规模更大时，可考虑把预填充与解码拆到不同机器上（如 DistServe、Mooncake 等系统的思路）。
5. **最大化前缀复用。** 把系统提示词、工具定义等固定内容放在提示词开头并保持字节级一致，前缀缓存命中率会显著提升。
6. **用投机解码换取低延迟。** 用一个小的草稿模型（或模型自带的多 token 预测头）一次提出多个候选 token，由大模型并行验证；通过拒绝采样可以保证输出分布与大模型完全一致 <sup>[[11]](https://arxiv.org/abs/2211.17192)</sup>。它本质上是在用闲置的算力换带宽。

## 延伸阅读路线

如果想沿这条线继续深入，建议的顺序是：

1. 先读 Transformer 原始论文的注意力部分 <sup>[[1]](https://arxiv.org/abs/1706.03762)</sup>，并亲手实现一个带 KV Cache 的解码循环。
2. 读 GQA <sup>[[3]](https://arxiv.org/abs/2305.13245)</sup> 和 DeepSeek-V2 的 MLA 章节 <sup>[[4]](https://arxiv.org/abs/2405.04434)</sup>，自己推导一遍 MLA 的权重吸收。
3. 读 FlashAttention <sup>[[5]](https://arxiv.org/abs/2205.14135)</sup>，重点理解在线 softmax 和 IO 复杂度分析。
4. 读 vLLM 论文 <sup>[[7]](https://arxiv.org/abs/2309.06180)</sup>，然后阅读一个推理引擎的调度器源码，观察请求如何进入、抢占和退出批次。
5. 最后读投机解码 <sup>[[11]](https://arxiv.org/abs/2211.17192)</sup>，理解为什么它能在不改变输出分布的前提下加速。

走完这条路线，你会发现推理系统的设计并不神秘：它始终是在**算力、显存容量和显存带宽**这三者之间寻找平衡，而 KV Cache 正是这场平衡的中心。
