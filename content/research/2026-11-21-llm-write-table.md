---
title: 让 LLM 写表而非写 Transformer：稀疏记忆在权重空间编程中的主导地位
date: '2026-11-21'
summary: >-
  研究表明，在权重空间编程（WSP）中，LLM 通过手写稀疏表或关联记忆模型，往往能在相同参数量下优于同规模
  Transformer，说明“架构先验”在无梯度训练场景下并非必需。
tags:
  - 权重空间编程
  - 关联记忆
  - Transformer
  - 大模型
  - 结构先验
generated: true
model: openai-fast
sources:
  - 'n': 1
    title: Weight-Space Programming Doesn't Need Transformers
    url: 'https://arxiv.org/abs/2611.22055'
---

## 问题  
传统深度学习依赖梯度下降（GD）来联合优化网络权重与架构。Transformer 之所以在大规模语言模型（LLM）中占据主导地位，正是因为其结构在 GPU 上实现高效的梯度流与矩阵乘法<sup>[[1]](https://arxiv.org/abs/2611.22055)</sup>。  

权重空间编程（Weight‑Space Programming, WSP）颠覆了这一范式：LLM 直接在目标模型的权重空间写下数值，而不进行梯度更新。此时，GD 的优势不再适用，模型结构的选择是否仍需遵循 Transformer 的“先验”设计？  

本工作通过给定极少的监督（十个标记化多项选择题）和一个可执行沙箱，邀请三款前沿 LLM（Claude Opus 5.5、GPT‑6.1 Sol、GPT‑6 Astra）在两种模式下完成 WSP：  
1. **固定架构**：在随机初始化的 Transformer、State‑Space Model 或 RNN 上写权重。  
2. **自定义架构**：LLM 自行定义结构、编写构建脚本和事实文本，然后将其编译为张量。  

研究核心：在无梯度训练的环境下，LLM 是否会坚持使用 Transformer 结构，或者会自发探索更适合写权重的模型？  

## 核心思路  
作者提出，WSP 的关键在于**可追踪性**与**局部可编辑性**：  
- **可追踪性**：每一次预测都能追溯到一条或少数几条手写行，便于人工检查与修正。  
- **局部可编辑性**：修改或删除一行权重仅影响极少数预测，避免全局重训练。  

为满足这两点，LLM 在实验中自发构造了一种**稀疏事实表**：  
- 每条事实写成一行，包含一句自然语言描述及其对应的概念向量。  
- 查询过程使用固定步骤：先匹配问题与选项的概念向量，再与表中行做点积，得出支持度。  
- 通过手写的规则（如否定、绝对值、词序）进一步细化评分。  

与传统 Transformer 相比，表结构在写权重时天然具备可追踪性与局部性；而 Transformer 的密集键向量导致记忆混叠，难以单行定位错误。  

## 方法细节  

### 1. 事实表的构建  
LLM 通过 **build script** 将自然语言事实转换为 **概念向量**。  
- 词表映射：将 361,150 个词映射到 3,368 个概念，每个概念为一维稀疏向量。  
- 句子转行：一句事实（如 “Hollow bones make birds light”）被拆解为概念集合 \(\{hollow, bones, make, birds, light\}\)，并写入表格的单行。  

表格 \(T\) 的维度为 \([N_{\text{rows}}, N_{\text{concepts}}]\)，其中 \(N_{\text{rows}}\) 约为 4,288，非零元素约 29,502。  

### 2. 查询与评分  
给定问题 \(q\) 与候选答案 \(a_i\)：  
1. 生成 **问题概念向量** \(\mathbf{c}_q\)。  
2. 生成 **选项缺失概念向量** \(\mathbf{c}_{a_i \setminus q}\)。  
3. 对每行 \(r\) 计算匹配得分  
   \[
   s_{ir} = \langle \mathbf{c}_q, \mathbf{t}_r \rangle \cdot \langle \mathbf{c}_{a_i \setminus q}, \mathbf{t}_r \rangle
   \]  
   其中 \(\mathbf{t}_r\) 为第 \(r\) 行的概念向量。  
4. 选取 **top‑k** 行（k=5）并加权求和，得到 \(a_i\) 的初始分数。  
5. 通过 **第二遍** 读取与 top‑k 相关的概念表 \(\mathbf{C}\)，再加入规则（如否定、绝对值）得到最终分数。  

此流程在 **固定前向** 下完成，无需梯度，所有权重均为手写。  

### 3. 关联记忆式模型（作者自研）  
为降低每道题的 GPU 开销，作者提出 **关联记忆式** 变体：  
- 仍保留事实表，但在前向时只读取 **120 条最强概念对**（pair rows）。  
- 通过预先计算 **pair table**（存储概念对与其关联强度），查询时直接索引对应行，避免逐行扫描。  
- 公式  
  \[
  \text{score}(a_i) = \sum_{p \in \mathcal{P}_q} \alpha_p \langle \mathbf{c}_{a_i \setminus q}, \mathbf{t}_p \rangle
  \]  
  其中 \(\mathcal{P}_q\) 为问题最强概念对集合，\(\alpha_p\) 为写入时设定的权重。  

该模型在保持 3‑倍参数量的同时，GPU 推理速度提升至 **17 %**。  

### 4. 评估流程  
- **数据集**：ARC‑Easy + ARC‑Challenge 共 3,530 个四选题。  
- **写作阶段**：LLM 仅接收 10 个训练样例（每类 5）与沙箱。  
- **评测**：在同一测试集上计算准确率
