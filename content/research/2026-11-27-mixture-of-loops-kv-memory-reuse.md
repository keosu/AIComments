---
title: 循环 Transformer 新范式：KV 记忆跨循环复用与 U 形权衡
date: '2026-11-27'
summary: >-
  MoLT 通过 Mixture-of-Loops Attention 实现 KV 记忆在循环与层深间的选择性复用，U
  形变体分离记忆构建与预测读出，在预训练效率与推理延迟上实现对标非循环模型的 Pareto 最优。
tags:
  - 循环 Transformer
  - KV 缓存
  - 预训练效率
  - 推理加速
  - 架构创新
generated: true
model: 'nvidia/nemotron-3-ultra-550b-a55b:free'
sources:
  - 'n': 1
    title: Mixture-of-Loops Transformer
    url: 'https://arxiv.org/abs/2611.34923'
---

## 问题

循环 Transformer（Looped Transformer）通过在多个“循环”中复用同一组共享层，以参数量不变换取更大的有效深度，从而提升模型表达能力。这一思想可追溯至 Universal Transformer，近期在大模型预训练中再度受到关注。然而，其核心瓶颈始终是**效率**：每增加一次循环，都意味着一次完整的前向传播开销，导致训练与推理延迟随循环数线性增长。

现有循环机制通常在循环间传递残差流，或仅在循环边界进行简单的状态拼接。这带来两个根本矛盾：
1.  **表达性与并行度的对立**：残差流的跨循环依赖强制序列化计算，难以利用“循环强制”并行训练技巧。
2.  **记忆载体的低效**：残差流混合了位置相关的特征与全局状态，难以像键值（KV）缓存那样支持选择性检索与位置解耦。

Mixture-of-Loops Transformer (MoLT) <sup>[[1]](https://arxiv.org/abs/2611.34923)</sup> 直指这一核心机制：**循环之间究竟该传递什么？** 论文提出的答案是——以 KV 作为显式记忆，在循环与深度维度上选择性复用，并由此衍生出两种互补的循环范式（MoLT-R 与 MoLT-KV）及一种解耦记忆构建与预测读出的 U 形变体。

## 核心思路

MoLT 的核心贡献在于定义了 **Mixture-of-Loops Attention (MoLA)**，将注意力机制的 KV 矩阵视为可跨循环、跨层寻址的外部记忆库。这改变了循环 Transformer 的信息流向：

*   **MoLT-R（Loop Residual，侧重表达性）**：保留传统残差流跨循环传递，但在注意力层允许读取**当前循环**与**历史循环**的局部 KV。残差流提供稠密的高级语义传递，跨循环 KV 读取提供细粒度的位置感知记忆，二者叠加增强表达上限。
*   **MoLT-KV（Loop KV，侧重效率）**：**切断残差流跨循环传递**，每个循环从嵌入层重新开始（restart from embeddings），仅通过读取**前序循环在更早位置的 KV** 作为记忆。这消除了同位置的跨循环依赖，使得同一循环内的所有位置可并行计算，配合循环强制实现并行训练，并解锁了超越训练循环数的单遍历解码。

**U-MoLT** 进一步观察到：MoLT-KV 的后期循环主要在“写记忆”（构建 KV），而非“读记忆”（预测）。于是将模型拆分为**记忆构建阶段**（多循环，仅写 KV）与**预测读出阶段**（单循环，读 KV 产出 logits）。推理时可跳过未使用的解码器遍历，在不改变预测分布的前提下大幅降低延迟。

## 方法细节

### Mixture-of-Loops Attention (MoLA)

设第 $l$ 层、第 $t$ 循环的隐藏状态为 $\mathbf{H}^{(l,t)}$，对应的键值为 $\mathbf{K}^{(l,t)}, \mathbf{V}^{(l,t)}$。MoLA 在计算第 $t$ 循环第 $l$ 层注意力时，拼接三组 KV 源：

$$
\begin{aligned}
\mathbf{K}_{\text{mem}} &= \big[ \mathbf{K}^{(l,t)}_{\text{local}}; \mathbf{K}^{(<l, t)}_{\text{depth}}; \mathbf{K}^{(\le t, <\text{pos})}_{\text{loop}} \big] \\
\mathbf{V}_{\text{mem}} &= \big[ \mathbf{V}^{(l,t)}_{\text{local}}; \mathbf{V}^{(<l, t)}_{\text{depth}}; \mathbf{V}^{(\le t, <\text{pos})}_{\text{loop}} \big]
\end{aligned}
$$

其中：
*   $\text{local}$：当前层、当前循环、当前位置及之前的因果 KV（标准因果注意力）。
*   $\text{depth}$：当前循环内更浅层的 KV（跨深度复用，论文未详述具体层选择策略，如是否全层或步长采样）。
*   $\text{loop}$：历史循环在**更早位置**的 KV（跨循环复用，关键在于“更早位置”保证因果性）。

注意力计算为标准缩放点积：
$$ \text{Attn}(\mathbf{Q}, \mathbf{K}_{\text{mem}}, \mathbf{V}_{\text{mem}}) = \text{softmax}\left(\frac{\mathbf{Q}\mathbf{K}_{\text{mem}}^\top}{\sqrt{d}}\right)\mathbf{V}_{\text{mem}} $$

### 两种循环范式的数学区隔

**MoLT-R (Loop Residual)**：
$$ \mathbf{H}^{(l,t)} = \text{Block}^{(l)}\big(\mathbf{H}^{(l,t-1)} + \text{MoLA}(\mathbf{H}^{(l,t-1)})\big) $$
残差流 $\mathbf{H}^{(l,t-1)}$ 显式跨循环传递。MoLA 读取跨循环 KV 作为**补充记忆**，不改变残差流的主干地位。

**MoLT-KV (Loop KV)**：
$$ \mathbf{H}^{(0,t)} = \text{Embed}(\mathbf{X}) \quad (\forall t) $$
$$ \mathbf{H}^{(l,t)} = \text{Block}^{(l)}\big(\mathbf{H}^{(l-1,t)} + \text{MoLA}(\mathbf{H}^{(l-1,t)})\big) $$
**无残差流跨循环连接**。每个循环从嵌入层冷启动。MoLA 的 $\text{loop}$ 分量仅包含 $t' < t$ 且位置 $p' < p$ 的 KV。这使得第 $t$ 循环第 $l$ 层的所有位置 $p$ 仅依赖于 $(t, <l)$ 与 $(<t, <p)$ 的状态，**同位置跨循环依赖被消除**。

### 循环强制与并行训练

利用 MoLT-KV 的无同位置依赖特性，论文采用 **Loop Forcing**：在训练时将 $T$ 个循环的计算图在序列维度展开为等效的 $T \times L$ 层深度网络，一次前向传播完成所有循环。这将训练时间从 $O(T)$ 降为 $O(1)$（显存允许时），并保证了训练与推理的计算图一致性。论文未详述显存优化细节（如梯度检查点策略）。

### U-MoLT：记忆构建与预测读出解耦

设总循环数 $T = T_{\text{mem}} + T_{\text{pred}}$。
*   **记忆构建阶段** ($t=1 \dots T_{\text{mem}}$)：**仅执行 MoLA 的 KV 写入**（即前向传播至注意力输出 KV，不计算后续 FFN 与残差更新，或仅保留 KV 生成路径），构建丰富的跨循环 KV 库。
*   **预测读出阶段** ($t=T_{\text{mem}}+1 \dots T$)：标准前向传播，读取完整 KV 库产出预测。

论文指出：$T_{\text{pred}}=1$ 时预测分布不变（因最后一循环读取的 KV 库已包含所有历史信息），推理可直接跳过前 $T_{\text{mem}}$ 循环的解码器遍历。这实质上将循环 Transformer 转化为**“预填充 KV 的标准 Transformer”**进行推理。

### MoL-Hybrid 解码策略

论文提及 **MoL-Hybrid-2** 用于推理基准测试，推测为：前 $k$ 个 token 使用多循环构建记忆，后续 token 切换至单循环读取模式。具体切换条件与 $k$ 值论文未详述。

## 证据与结果

### 400B Token 预训练（从头训练）

基准为 **OLMo3** 同规模架构。U-MoLT 在三个规模上均超越基线 <sup>[[1]](https://arxiv.org/abs/2611.34923)</sup>：

| 规模 | 类型 | 验证 CE Token Efficiency | 备注 |
| :--- | :--- | :--- | :--- |
| 700M | Dense | **1.7x** | 显著提升 |
| 1.5B | Dense | 胜出 | 具体倍数论文未给出 |
| 3B | MoE | 胜出 | 10-domain ppl **↓0.75**，10-task acc **↑2.1 pp** |

“Token Efficiency”定义为达到相同验证交叉熵所需的 token 数之比。1.7x 意味着 U-MoLT-700M 仅需 OLMo3-700M 约 59% 的训练数据即可达到同等困惑度。

### 100B Token 持续预训练（适配现有模型）

基座模型：**Qwen3.5-0.8B-Base**。将其适配为 U-MoLT 结构继续训练 100B token <sup>[[1]](https://arxiv.org/abs/2611.34923)</sup>：
*   **11 个评测域全部降低 CE**。
*   平均 Token Efficiency **1.4x**。
*   这验证了 MoLT 机制可作为**插件式升级**植入预训练权重，无需从头训练即可获益。

### 推理延迟

在 **S-size (~113M 参数)** 模型上，对比非循环 OLMo3 <sup>[[1]](https://arxiv.org/abs/2611.34923)</sup>：
*   **U-MoLT (MoL-Hybrid-2)：** 996.6 ms
*   **OLMo3 (非循环)：** 1,000.6 ms
*   **结论**：U-MoLT 在引入循环机制的前提下，**基本消除了推理延迟劣势**，达到与标准 Transformer 相当的解码速度。

论文未提供大模型（700M+）推理延迟对比、显存占用对比、或不同序列长度下的扩展曲线。

## 我们的看法

### 1. 方法成立的关键前提

*   **KV 足以承载跨循环信息**：MoLT-KV 切断残差流，押注“历史循环在早期位置的 KV”包含了后续循环所需的全部上下文。这假设 Transformer 层的输出 KV 是对该层输入信息的**无损或近似无损压缩**。若高层语义抽象主要存在于残差流而非 KV 投影中，MoLT-KV 将丢失关键信息。
*   **循环强制的分布一致性**：并行训练要求展开后的深层网络与循环推理的分布完全一致。这隐含假设 LayerNorm、残差缩放等归一化机制对“循环深度”不敏感。论文未讨论是否需引入循环感知的缩放因子（如 $\frac{1}{\sqrt{T}}$）。
*   **U 形解耦的有效性边界**：U-MoLT 假设记忆构建阶段不需要“读取自己正在写入的 KV”参与预测。若任务需在记忆构建过程中即进行中间推理（如思维链的中间步骤），跳过前 $T_{\text{mem}}$ 循环的读出将改变行为。

### 2. 可能失效或收益递减的场景

*   **超长上下文与 KV 容量瓶颈**：MoLA 显式拼接历史循环 KV，KV 库规模随循环数 $T$ 线性增长。论文实验规模（~113M–3B）与序列长度（论文未详述，推测为标准 2k–4k）下 KV 开销可控，但在 128k+ 长上下文或大模型（70B+）下，跨循环 KV 的显存与带宽压力可能抵消算力收益。是否需引入 KV 压缩、滑动窗口或稀疏检索，论文未涉及。
*   **MoE 专家路由与循环的交互**：3B MoE 实验显示增益显著（ppl ↓0.75, acc ↑2.1pp），但专家路由是否跨循环共享、KV 是否按专家分片存储，论文未详述。若路由不稳定导致同一 token 落入不同专家，跨循环 KV 复用将失效。
*   **推理时的“冷启动”惩罚**：MoL-Hybrid-2 需前 $k$ 步多循环预热。对于短请求（如单轮问答、分类），预热开销可能吞噬全部收益。论文仅给出 S-size 平均延迟，未按序列长度或请求类型细分。

### 3. 与已有工作的关系定位

| 工作 | 核心机制 | MoLT 的差异化贡献 |
| :--- | :--- | :--- |
| **Universal Transformer** | 残差流跨步复用，ACT 自适应停止 | MoLT 显式引入 KV 记忆，解耦“状态传递”与“内容检索”，支持并行训练。 |
| **Recurrent Memory Transformer / Memorizing Transformers** | 固定大小记忆槽 / 缓存历史层 KV | MoLT 将记忆**结构化为循环维度**，并给出 U 形解耦与循环强制训练范式，工程化程度更高。 |
| **Ring Attention / Blockwise Parallelism** | 序列并行切分 KV | 正交维度：Ring Attention 解决长序列并行，MoLT 解决循环深度并行，可组合。 |
| **Linear Attention / RNN-Transformer 混合** | 用线性注意力近似 KV 复用 | MoLT 保留标准 Softmax Attention，通过架构重排而非近似换取效率，精度无损更可控。 |
| **Depth-Upscaling / Layer Fusion** | 训练浅层、推理深层 | MoLT 训练即深层（展开），推理可浅层（U 形跳过），方向相反且更符合 Scaling Law 直觉。 |

MoLT 可视为**“显式外部记忆 + 循环计算图重排”**的集大成者，将循环 Transformer 从“理论上有表达力、工程上难落地”推向“工程上 Pareto 最优”。

### 4. 值得追问的关键问题

1.  **Scaling Law 维度的新坐标**：引入循环数 $T$ 作为新的超参数后，最优计算分配律如何变化？固定 FLOPs 下，是加宽、加深、加循环、还是加 MoE 专家数？论文仅给出定点对比，未给出等计算量下的超参数扫描曲面。
2.  **循环数 $T$ 的泛化上限**：训练时循环强制展开为固定 $T$，推理时 MoL-Hybrid 允许动态循环。模型能否真正泛化到 $T_{\text{train}}$ 之外的推理循环数？论文提及“超越训练循环数的单遍历解码”，但未给出 $T_{\text{infer}} > T_{\text{train}}$ 时的性能曲线（如准确率随推理循环数饱和的速度）。
3.  **KV 记忆的“写入冲突”与“遗忘机制”**：多循环写入同一位置的 KV（不同层、不同循环）时，注意力权重如何分配？是否存在“后写入覆盖先写入”的灾难性遗忘？论文未分析注意力熵或 KV 相似度演变。
4.  **硬件感知的算子融合**：MoLA 的三源 KV 拼接在 FlashAttention/FlashInfer 等内核上如何高效实现？跨循环 KV 的非连续内存访问模式是否成为推理延迟的新瓶颈（尽管 S-size 实验持平，但大模型、长序列下显存带宽压力不同）？
5.  **对齐与 RLHF 的兼容性**：循环机制引入的隐式“思考步骤”是否有利于推理对齐？MoLT-R 保留残差流可能更适合 RLHF 中的奖励建模（梯度流更直接），而 MoLT-KV 的冷启动特性可能利于可解释性（每循环独立可视化）。论文未涉及后训练阶段实验。

---

**总评**：Mixture-of-Loops Transformer 不是简单的“加循环”，而是重新定义了循环 Transformer 的**记忆接口**（KV 而非残差流）、**计算图拓扑**（循环强制并行化）与**部署形态**（U 形解耦）。它在 400B/100B token 规模上对 OLMo3/Qwen3.5 的稳健超越，证明了这条路线在当前 Scaling Law 瓶颈期具有极强的工程落地潜力。下一步的关键在于：**长上下文下的 KV 管理策略、大规模 MoE 专家路由的循环一致性、以及推理端动态循环调度的自适应策略**。若这些工程问题得到解决，MoLT 及其变体极有可能成为下一代大模型基础架构的标准组件之一。
