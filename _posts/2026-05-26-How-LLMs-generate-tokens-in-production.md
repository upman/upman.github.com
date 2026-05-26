---
layout: post
title: How LLMs Generate Tokens in Production
comments: true
description: A walkthrough of the path from prompt text to generated tokens, and why production LLM serving is really about scheduling and cache reuse.
image:
  feature: llm-inference-works.svg
---

<style>
.inference-map,
.variable-visual,
.phase-visual,
.batch-visual,
.moe-visual,
.moves-visual {
  --paper: #f0ebde;
  --ink: #1f2be0;
  --mint: #00a889;
  --gold: #f4c542;
  --pink: #f06a8a;
  background:
    linear-gradient(to right, rgba(31, 43, 224, .08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(31, 43, 224, .08) 1px, transparent 1px),
    var(--paper);
  background-size: 28px 28px;
  border: 2px solid var(--ink);
  border-radius: 6px;
  color: var(--ink);
  font-family: "Helvetica Neue", Arial, sans-serif;
  margin: 32px 0;
  padding: 22px;
}
.inference-map .flow {
  align-items: stretch;
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(6, 1fr);
}
.inference-map .node,
.variable-visual .length-card,
.variable-visual .llm-box,
.phase-visual .panel,
.moe-visual .moe-attn,
.moe-visual .moe-gate,
.moe-visual .moe-expert-band,
.moe-visual .moe-expert,
.moves-visual .move {
  background: rgba(255, 255, 255, .72);
  border: 2px solid var(--ink);
  border-radius: 5px;
  min-height: 122px;
  padding: 14px;
}
.inference-map .num,
.moves-visual .tag,
.batch-visual .label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.inference-map h4,
.phase-visual h4,
.moves-visual h4 {
  font-size: 20px;
  line-height: 1.1;
  margin: 8px 0;
  padding: 0;
}
.inference-map p,
.variable-visual p,
.phase-visual p,
.moves-visual p {
  font-size: 14px;
  line-height: 1.35;
  margin: 0;
}
.variable-visual .stage {
  align-items: center;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(0, 1fr) 42px 118px 42px minmax(0, 1fr);
}
.variable-visual .stack {
  display: grid;
  gap: 8px;
  grid-template-rows: auto 1fr;
  min-width: 0;
}
.variable-visual .label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.variable-visual .length-card {
  align-items: center;
  display: grid;
  min-height: 170px;
}
.variable-visual .length {
  font-size: 17px;
  font-weight: 700;
}
.variable-visual .question {
  font-size: 62px;
  font-weight: 700;
  line-height: .9;
}
.variable-visual .length-card p {
  max-width: 190px;
}
.variable-visual .llm-box {
  align-items: center;
  display: grid;
  font-size: 26px;
  font-weight: 700;
  justify-items: center;
  min-height: 96px;
}
.variable-visual .arrow {
  align-self: center;
  background: var(--ink);
  height: 4px;
  justify-self: stretch;
  position: relative;
  text-indent: -9999px;
}
.variable-visual .arrow::after {
  border-bottom: 11px solid transparent;
  border-left: 16px solid var(--ink);
  border-top: 11px solid transparent;
  content: "";
  position: absolute;
  right: -1px;
  top: 50%;
  transform: translateY(-50%);
}
.variable-visual .arrow.down {
  display: none;
}
.variable-visual .arrow-text {
  display: none;
}
.variable-visual .question-row {
  align-items: end;
  display: flex;
  gap: 12px;
}
.variable-visual .mini-bars {
  display: grid;
  gap: 5px;
  margin-bottom: 8px;
  width: min(92px, 38%);
}
.variable-visual .mini-bars span {
  background: rgba(0, 168, 137, .55);
  border: 2px solid var(--ink);
  height: 11px;
}
.variable-visual .mini-bars span:nth-child(1) {
  width: 44%;
}
.variable-visual .mini-bars span:nth-child(2) {
  width: 72%;
}
.variable-visual .mini-bars span:nth-child(3) {
  width: 100%;
}
.variable-visual .output-card .mini-bars span {
  background: rgba(240, 106, 138, .45);
}
.variable-visual .output-card .mini-bars span:nth-child(1) {
  width: 30%;
}
.variable-visual .output-card .mini-bars span:nth-child(2) {
  width: 56%;
}
.variable-visual .output-card .mini-bars span:nth-child(3) {
  width: 88%;
}
.variable-visual .output-card .mini-bars span:nth-child(4) {
  width: 100%;
}
.variable-visual .output-card .mini-bars span:nth-child(5) {
  width: 74%;
}
.variable-visual .output-card .mini-bars {
  grid-template-columns: none;
}
.variable-visual .output-card .mini-bars span:nth-child(n+4) {
  display: block;
}
.variable-visual .input-card .mini-bars span:nth-child(n+4) {
  display: none;
}
@media (min-width: 761px) {
  .variable-visual .output-card .mini-bars {
    grid-template-columns: none;
  }
}
.variable-visual .llm-box,
.variable-visual .length-card {
  overflow: hidden;
}
.variable-visual .llm-box {
  font-weight: 700;
}
.variable-visual .note {
  border-top: 2px solid var(--ink);
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  justify-content: space-between;
  margin-top: 18px;
  padding-top: 14px;
}
.variable-visual .note span {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.phase-visual {
  display: grid;
  gap: 18px;
  grid-template-columns: 1fr 1fr;
}
.phase-visual .panel {
  display: grid;
  gap: 12px;
}
.phase-visual .tag {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
  text-transform: uppercase;
}
.phase-visual .token-row,
.phase-visual .cache-row {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(6, minmax(0, 1fr));
}
.phase-visual .lane-label,
.phase-visual .decode-labels {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
}
.phase-visual .decode-labels {
  display: grid;
  gap: 8px;
  grid-template-columns: 70px 1fr;
}
.phase-visual .token,
.phase-visual .cache-cell {
  background: var(--gold);
  border: 2px solid var(--ink);
  font-size: 12px;
  font-weight: 700;
  min-height: 34px;
  padding: 7px 4px;
  text-align: center;
}
.phase-visual .cache-cell,
.phase-visual .decode-step .token {
  background: var(--mint);
}
.phase-visual .arrow-note {
  align-items: center;
  display: grid;
  font-size: 12px;
  font-weight: 700;
  grid-template-columns: 1fr auto 1fr;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.phase-visual .arrow-note::before,
.phase-visual .arrow-note::after {
  background: var(--ink);
  content: "";
  height: 3px;
}
.phase-visual .arrow-note span {
  padding: 0 10px;
}
.phase-visual .decode-steps {
  display: grid;
  gap: 8px;
}
.phase-visual .decode-step {
  align-items: center;
  display: grid;
  gap: 8px;
  grid-template-columns: 70px 1fr;
}
.phase-visual .decode-step .cache-row {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}
.phase-visual .decode-step:nth-child(1) .cache-cell:nth-child(n+3),
.phase-visual .decode-step:nth-child(2) .cache-cell:nth-child(n+4) {
  opacity: .2;
}
.moe-visual {
  display: grid;
  gap: 12px;
}
.moe-visual .moe-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
  text-align: center;
}
.moe-visual .moe-attn {
  background: rgba(0, 168, 137, .2);
  min-height: auto;
  text-align: center;
}
.moe-visual .moe-attn strong {
  display: block;
  font-size: 24px;
  line-height: 1.1;
}
.moe-visual .moe-attn span {
  display: block;
  font-size: 13px;
  font-weight: 700;
  margin-top: 4px;
  text-transform: uppercase;
}
.moe-visual .moe-expert-band {
  background: rgba(244, 197, 66, .24);
  display: grid;
  gap: 10px;
  min-height: auto;
}
.moe-visual .moe-gate {
  background: rgba(240, 106, 138, .22);
  font-size: 15px;
  font-weight: 700;
  min-height: auto;
  text-align: center;
}
.moe-visual .moe-experts {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(3, 1fr);
}
.moe-visual .moe-expert {
  align-items: center;
  display: grid;
  min-height: 104px;
  text-align: center;
}
.moe-visual .moe-expert.selected {
  background: #fff;
  box-shadow: inset 0 0 0 6px rgba(244, 197, 66, .9);
}
.moe-visual .name {
  font-size: 21px;
  font-weight: 700;
  line-height: 1.1;
}
.moe-visual .gpu {
  color: var(--pink);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .1em;
  margin-top: 5px;
  text-transform: uppercase;
}
.batch-visual {
  overflow-x: auto;
}
.batch-visual .grid {
  display: grid;
  gap: 4px;
  grid-template-columns: 72px repeat(8, minmax(54px, 1fr));
  min-width: 620px;
}
.batch-visual .slot {
  background: rgba(255, 255, 255, .7);
  border: 2px solid var(--ink);
  border-radius: 3px;
  font-size: 12px;
  font-weight: 700;
  min-height: 38px;
  padding: 9px 7px;
  text-align: center;
}
.batch-visual .prefill {
  background: var(--gold);
}
.batch-visual .decode {
  background: var(--mint);
}
.batch-visual .new {
  background: var(--pink);
}
.batch-visual .end {
  background: #fff;
  color: rgba(31, 43, 224, .5);
}
.batch-visual .annotation {
  border-top: 2px solid rgba(31, 43, 224, .3);
  display: grid;
  gap: 12px;
  margin-top: 14px;
  min-width: 620px;
  padding-top: 14px;
}
.batch-visual .color-key,
.batch-visual .term-key {
  display: grid;
  gap: 8px;
}
.batch-visual .color-key {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.batch-visual .term-key {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.batch-visual .annotation span {
  align-items: center;
  display: flex;
  font-size: 12px;
  gap: 7px;
  line-height: 1.3;
}
.batch-visual .annotation strong {
  font-weight: 700;
}
.batch-visual .swatch {
  border: 2px solid var(--ink);
  display: inline-block;
  flex: 0 0 18px;
  height: 18px;
}
.batch-visual .swatch.prefill {
  background: var(--gold);
}
.batch-visual .swatch.decode {
  background: var(--mint);
}
.batch-visual .swatch.new {
  background: var(--pink);
}
.batch-visual .swatch.end {
  background: #fff;
}
.batch-visual .annotation .term {
  display: block;
}
.moves-visual {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(4, 1fr);
}
@media (max-width: 760px) {
  .inference-map .flow,
  .variable-visual .stage,
  .phase-visual,
  .moe-visual .moe-experts,
  .moves-visual {
    grid-template-columns: 1fr;
  }
  .variable-visual .arrow {
    height: 34px;
    justify-self: center;
    width: 4px;
  }
  .variable-visual .arrow::after {
    border-left: 11px solid transparent;
    border-right: 11px solid transparent;
    border-top: 16px solid var(--ink);
    border-bottom: 0;
    left: 50%;
    right: auto;
    top: auto;
    bottom: -1px;
    transform: translateX(-50%);
  }
  .variable-visual .length-card {
    min-height: 150px;
  }
  .inference-map .node {
    min-height: auto;
  }
}
</style>

I started with a narrower question: how do Mixture-of-Experts models work in production? This [MoE infrastructure guide](https://introl.com/blog/mixture-of-experts-moe-infrastructure-scaling-sparse-models-guide) is a useful companion for that question. To make sense of it, I had to back up and understand the serving loop underneath: prefill, decode, KV cache, batching, and routing.

Most ML inference has a tidy shape. An image classifier gets one image and returns one label. A reranker gets a fixed list and returns scores. The input and output sizes are usually known before the request starts.

LLM inference is different because both sides are variable length.

<div class="variable-visual" aria-label="Variable input and output length diagram">
<div class="stage">
<div class="stack">
<div class="label">Input</div>
<div class="length-card input-card"><div><div class="length">Length:</div><div class="question-row"><div class="question">?</div><div class="mini-bars"><span></span><span></span><span></span></div></div><p>short question, long chat, uploaded docs</p></div></div>
</div>
<div class="arrow">-&gt;</div>
<div class="llm-box">LLM</div>
<div class="arrow">-&gt;</div>
<div class="stack">
<div class="label">Output</div>
<div class="length-card output-card"><div><div class="length">Length:</div><div class="question-row"><div class="question">?</div><div class="mini-bars"><span></span><span></span><span></span><span></span><span></span></div></div><p>one word, code block, long answer</p></div></div>
</div>
</div>
<div class="note"><span>Unlike fixed-shape inference</span><span>requests arrive and finish at different sizes</span></div>
</div>

The input can be a three-word question or a 200-page context window. The output can be one token or a long answer. The server does not know in advance how much work the request will take, and it has to keep producing tokens while other requests arrive, grow, and finish around it.

That variable-length shape is what makes LLM serving feel strange. The model is not just "called" once. It first reads the prompt, then writes the answer one token at a time, carrying forward a growing memory of the conversation.

Here is the path at a high level. The first three steps turn the prompt into model state. The later steps are about extending that state, reusing it, and serving many requests without wasting the GPU.

<div class="inference-map" aria-label="The LLM inference path">
<div class="flow">
<div class="node"><div class="num">01</div><h4>Tokenize</h4><p>Text becomes token IDs. Billing, latency, and context windows are counted in tokens, not words.</p></div>
<div class="node"><div class="num">02</div><h4>Embed</h4><p>Token IDs become vectors with position information, so the transformer can do math on text.</p></div>
<div class="node"><div class="num">03</div><h4>Prefill</h4><p>The model reads the prompt once. This is parallel over many tokens and tends to be compute-heavy.</p></div>
<div class="node"><div class="num">04</div><h4>Decode</h4><p>The model writes one new token, appends it, and repeats. This is serial and often memory-bandwidth-bound.</p></div>
<div class="node"><div class="num">05</div><h4>Reuse Cache</h4><p>Saved keys and values avoid recomputing old context. The cache grows as the conversation grows.</p></div>
<div class="node"><div class="num">06</div><h4>Batch</h4><p>Serve many users together. New requests join while finished ones leave.</p></div>
</div>
</div>

The rest of the post walks through those boxes in order, then comes back to the production-serving tricks that make the last two boxes work at scale.

## Text Becomes Tokens

The model never sees the string `"tokenization is weird"`. The front door turns text into token IDs, then token vectors.

```python
# prompt text
text = "tokenization is weird"

# cl100k_base tokens: ["token", "ization", " is", " weird"]
token_ids = tokenizer.encode(text)      # [5963, 2065, 374, 16682]
vectors = embedding[token_ids]          # [[0.12, ...], [0.08, ...], [0.44, ...], [0.19, ...]]

x = vectors + position_encoding         # shape: [4, d_model]
```

The exact split depends on the tokenizer; this example uses `tiktoken` with `cl100k_base`. `token_ids` are integer IDs from the tokenizer vocabulary. `embedding` is the learned lookup table that turns each ID into a vector. `position_encoding` tells the model where each token sits in the sequence; this [deep dive on RoPE positional encoding](https://shreyashkar-ml.github.io/posts/rope/) goes deeper. `d_model` is the width of each token vector: for example, if `d_model = 4096`, each token becomes a list of 4,096 numbers. `x` is the tensor the Transformer will operate on.

## Prefill Reads The Prompt

After tokenization, the model runs the prompt through the Transformer. This phase is called **prefill**. It is the big read: the model processes the input tokens and writes a KV cache that will be reused during generation.

```python
for layer in model.layers:
    input = x  # shape: [seq_len, d_model]

    # Self-attention projections. @ means matrix multiply.
    Q = input @ W_query  # shape: [seq_len, d_model]
    K = input @ W_key    # shape: [seq_len, d_model]
    V = input @ W_value  # shape: [seq_len, d_model]

    # .T means transpose; keys line up so every token can compare to every other token.
    scores = (Q @ K.T) / sqrt(d_model)  # shape: [seq_len, seq_len]
    attention_probabilities = softmax(scores)
    attention_output = attention_probabilities @ V

    x = attention_output  # shape: [seq_len, d_model]
    kv_cache[layer].store(K, V)

logits = to_vocab(x[-1])  # one score for every token in the vocabulary
# sample picks one token ID from those logits
first_token = sample(logits)
```

Attention is the model asking, for each token, which other tokens should influence this token right now, and by how much.

`W_query`, `W_key`, and `W_value` are learned weight matrices. During training they are adjusted so the model can extract useful patterns from token embeddings. They turn the input into `Q`, `K`, and `V`: queries ask what a token is looking for, keys describe what each token can offer, and values carry the information that gets mixed together.

`scores` measures how much each token should attend to every other token. The division by `sqrt(d_model)` keeps the dot products from getting too large before `softmax`; otherwise one or two huge scores can dominate too early. `softmax` turns those scores into probabilities between 0 and 1, and `attention_probabilities @ V` mixes the value vectors using those probabilities.

`kv_cache[layer]` stores the `K` and `V` tensors for this layer so decode can reuse them. `x[-1]` selects the last prompt position. `to_vocab` turns that vector into one score for every token in the vocabulary, and `sample` picks the first generated token from those scores.

Prefill is expensive, but it has useful shape. If the prompt has 8,000 tokens, the server can process many of those tokens in parallel. The work is wide.

This is why prefill is **compute-intensive**. The expensive part is doing large matrix multiplications over many prompt tokens at once. GPUs are good at that kind of dense parallel math, so prefill can use a lot of compute efficiently.

<p><small><em>Note: this is a simplified Transformer layer focused on self-attention and the KV cache. It leaves out multi-head attention and the feed-forward network.</em></small></p>

## Decode Writes The Answer

Decode is the narrow part. It produces one token, appends that token's keys and values to the cache, then repeats. Every step needs the layer weights and the old cache.

```python
token = first_token

while token != END:
    x = embed(token)  # shape: [1, d_model]

    for layer in model.layers:
        Q = x @ W_query  # shape: [1, d_model]
        K = x @ W_key    # shape: [1, d_model]
        V = x @ W_value  # shape: [1, d_model]

        cached_K, cached_V = kv_cache[layer].read_all()
        all_K = concat(cached_K, K)  # shape: [context_tokens, d_model]
        all_V = concat(cached_V, V)  # shape: [context_tokens, d_model]

        scores = (Q @ all_K.T) / sqrt(d_model)
        x = softmax(scores) @ all_V
        kv_cache[layer].append(K, V)

    logits = to_vocab(x[-1])  # one score for every token in the vocabulary
    # sample picks the next token ID from those logits
    token = sample(logits)
```

Most names are the same, but their shape has changed. `token` is now the single token being generated. `embed(token)` produces one vector, so `x` has shape `[1, d_model]` instead of `[seq_len, d_model]`. `cached_K` and `cached_V` are all the keys and values from earlier prompt and output tokens. `all_K` and `all_V` extend that attention context with the new token. `logits` are the raw scores for the next-token vocabulary before sampling.

That `while` loop is the hard part. You cannot fully parallelize "what is the next token?" before you know the current token. You can make each step fast. You can batch many users together. You can sometimes skip steps. But the basic shape remains serial.

This is why decode is usually **memory-bandwidth-intensive**. Each step only does math for one new token, so there is less parallel compute to hide the cost of moving data around. The model weights and KV cache usually live in GPU memory. For every decode step, chunks of those tensors are streamed from GPU memory into the GPU's compute units, used for the matrix multiplications, and then the new `K` and `V` for the generated token are written back to the cache. If the model is split across multiple GPUs, some activations or routed tensors also move across GPU-to-GPU links such as NVLink or PCIe. If the weights or KV cache do not fit in GPU memory, serving systems may offload some data to CPU RAM or even disk, then move it back when needed. That is much slower than keeping it on the GPU, so avoiding those transfers is a major part of production inference. As the context gets longer, more cache has to be read for each generated token. The bottleneck shifts from "how many multiplications can I do?" to "how fast can I move weights and cache through memory?"

The sizes get large quickly. A 7B parameter model in 16-bit precision is roughly 14 GB of weights. A 70B model is roughly 140 GB before quantization or serving overhead. The KV cache grows with the number of layers, the context length, and the vector width:

```python
kv_cache_bytes = layers * context_tokens * 2 * d_model * bytes_per_number
# 2 because the cache stores both K and V
```

For a 32-layer model with `d_model = 4096`, an 8,000-token context, and 16-bit cache values, that rough calculation is about 4 GB for one long request. Real systems have tricks to reduce this, but the shape is the important part: during decode, every active request carries memory that grows as the conversation grows.

<div class="phase-visual" aria-label="Prefill and decode are different workloads">
<div class="panel">
<div class="tag">Prefill</div>
<h4>One wide read</h4>
<p>Many prompt tokens move through the model together, then write the first cache.</p>
<div class="lane-label">Prompt tokens</div>
<div class="token-row" aria-label="Prompt tokens">
<div class="token">p1</div><div class="token">p2</div><div class="token">p3</div><div class="token">p4</div><div class="token">p5</div><div class="token">p6</div>
</div>
<div class="arrow-note"><span>parallel pass</span></div>
<div class="lane-label">KV cache written</div>
<div class="cache-row" aria-label="KV cache after prefill">
<div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div>
</div>
</div>
<div class="panel">
<div class="tag">Decode</div>
<h4>Many narrow steps</h4>
<p>One new token is produced at a time, while each step rereads the growing cache.</p>
<div class="decode-labels"><span>New token</span><span>Cache read this step</span></div>
<div class="decode-steps" aria-label="Decode steps read growing cache">
<div class="decode-step"><div class="token">out 1</div><div class="cache-row"><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div></div></div>
<div class="decode-step"><div class="token">out 2</div><div class="cache-row"><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div></div></div>
<div class="decode-step"><div class="token">out 3</div><div class="cache-row"><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div><div class="cache-cell">KV</div></div></div>
</div>
</div>
</div>

Now that the basic loop is in place, we can look at the tricks that make LLM serving efficient and scalable in production.

## Batching Has To Keep Moving

There is a natural question here: if the server already has a layer's weights ready, why run only one request through it? The expensive part is often moving those weights and cache through the GPU. Batching lets several requests use the same loaded weights at the same time, whether they are doing prefill work or decode work.

Batching is the basic serving trick: instead of running one request at a time, the server groups multiple requests together so the GPU has more work to do in parallel. This works especially well when the requests have the same shape.

LLMs make that harder. Requests have variable input length and variable output length. Some users finish early. Some keep generating. If the server treats a batch as one fixed group, empty slots waste GPU time.

It also creates head-of-line blocking: one slow request at the front of the queue can make everyone behind it wait. In an LLM batch, one long-running generation can keep shorter requests stuck even after they could have been served.

Continuous batching treats the batch as a moving set. At each prefill or decode tick, the active requests run through many Transformer layers. Then finished work leaves, and new work enters.

<div class="batch-visual" aria-label="Continuous batching timeline">
<div class="grid">
<div class="slot label"></div><div class="slot label">T1</div><div class="slot label">T2</div><div class="slot label">T3</div><div class="slot label">T4</div><div class="slot label">T5</div><div class="slot label">T6</div><div class="slot label">T7</div><div class="slot label">T8</div>
<div class="slot label">slot 1</div><div class="slot prefill">R1</div><div class="slot prefill">R1</div><div class="slot prefill">R1</div><div class="slot decode">R1</div><div class="slot decode">R1</div><div class="slot end">end</div><div class="slot new">R6</div><div class="slot new">R6</div>
<div class="slot label">slot 2</div><div class="slot prefill">R2</div><div class="slot prefill">R2</div><div class="slot decode">R2</div><div class="slot decode">R2</div><div class="slot decode">R2</div><div class="slot decode">R2</div><div class="slot decode">R2</div><div class="slot end">end</div>
<div class="slot label">slot 3</div><div class="slot prefill">R3</div><div class="slot prefill">R3</div><div class="slot prefill">R3</div><div class="slot decode">R3</div><div class="slot end">end</div><div class="slot new">R5</div><div class="slot new">R5</div><div class="slot decode">R5</div>
<div class="slot label">slot 4</div><div class="slot prefill">R4</div><div class="slot prefill">R4</div><div class="slot prefill">R4</div><div class="slot prefill">R4</div><div class="slot decode">R4</div><div class="slot decode">R4</div><div class="slot end">end</div><div class="slot new">R7</div>
</div>
<div class="annotation" aria-label="Batch visual terms">
<div class="color-key">
<span><i class="swatch prefill"></i><span class="term">prefill work or prefill chunk</span></span>
<span><i class="swatch decode"></i><span class="term">decode work</span></span>
<span><i class="swatch new"></i><span class="term">newly admitted request</span></span>
<span><i class="swatch end"></i><span class="term">request finished</span></span>
</div>
<div class="term-key">
<span><span class="term"><strong>T1-T8</strong>: scheduler ticks over time</span></span>
<span><span class="term"><strong>slot</strong>: one active lane in the GPU batch</span></span>
<span><span class="term"><strong>R1, R2, ...</strong>: different user requests</span></span>
</div>
</div>
</div>

This is one of the biggest differences from ordinary fixed-shape inference. The batch is not a single group that starts together and ends together. It is a changing set of active requests.

## The KV Cache Needs A Memory Manager

Continuous batching keeps many slots active at the same time. Each slot may belong to a different request, and each request carries a KV cache that grows with its context. Multiply that by long prompts, long answers, many layers, and large vector widths, and the amount of KV cache can explode.

That is why efficient KV-cache management matters. The cache reduces repeated attention work, but it also becomes a large and growing memory object for every active request.

The naive version is to reserve one long contiguous cache buffer per request. That wastes memory because requests end at different lengths, and it makes it hard to pack many active conversations into GPU memory. Production systems treat the KV cache more like virtual memory.

Paging is the big idea behind vLLM's [PagedAttention design](https://docs.vllm.ai/en/latest/design/paged_attention/#inputs). Instead of requiring one contiguous cache region, the cache is split into fixed-size blocks. A request keeps a table that says which cache blocks contain its tokens.

```python
for token in generated_tokens:
    block = kv_pool.block_for(request)
    block.append(K, V)

    request.block_table.append(block.id)
```

Now a request can grow by adding blocks, finish by returning blocks, and reuse memory without moving one giant cache tensor around. The important shift is that KV cache stops being "an array attached to a request" and becomes managed serving state.

Other techniques reduce how much cache has to be stored or moved:

- **Compression** stores fewer bytes per cached vector. Google's [TurboQuant post](https://research.google/blog/turboquant-redefining-ai-efficiency-with-extreme-compression/) is a good example of KV-cache compression aimed at reducing memory footprint while keeping attention scores useful.
- **Quantization** stores numbers with fewer bits. For weights or cache values, that means less memory to store and less data to move. This [quantization explainer](https://ngrok.com/blog/quantization) is a good ground-up walkthrough.

Paging, compression, and quantization are all aimed at the same bottleneck: decode is often waiting on memory, so production systems try to store less, move less, and reuse what is already nearby.

## Long Prompts Should Not Freeze Active Generations

The moving-batch picture still leaves one question: how big is one yellow prefill block?

If a prompt is short, prefill can fit neatly into a tick or two. If a prompt is 20,000 tokens, treating the whole prefill as one schedulable unit can still monopolize compute. The request has a slot, but that slot is occupied by a huge piece of work. Active decoders may pause while the long prompt is processed. Users feel that as stutter: tokens stop arriving even though generation already started.

Chunked prefill makes the yellow blocks smaller. It breaks a long prompt into bounded pieces, then lets decode work slip between those pieces.

```python
for chunk in chunks(long_prompt, size=256):
    prefill(chunk, req.kv_cache)

    # let active generations breathe
    if active_decoders:
        decode_step(active_decoders)
```

A scheduler can also protect decode first and spend leftover budget on waiting prefills.

```python
budget = GPU_TOKEN_BUDGET

decode_step(active_requests)
budget -= len(active_requests)

while budget >= CHUNK and waiting_prefills:
    req = waiting_prefills.pop()
    prefill(req.next_chunk(), req.kv_cache)
    budget -= CHUNK
```

That is a concrete serving policy: protect tokens already in flight. The user who is already watching tokens stream should not freeze because someone else arrived with a huge prompt.

The model has not changed. The math inside a token step has not changed. But the experience changes because the scheduler respects the shape of the work.

## Sometimes You Can Skip Decode Steps

Normal decode asks the big model to choose one token, append it, then choose the next token. That choice is serial because token 4 depends on token 3, token 3 depends on token 2, and so on.

Verification is easier because the candidate tokens are already known. If a smaller or cheaper draft path proposes four tokens, the target model can treat them like a short extension of the prompt. It reuses the KV cache for the existing prefix, runs a prefill-like pass over the draft chunk, computes the target model's next-token scores at each proposed position in parallel, and checks how many proposed tokens it can accept from left to right.

The target model still does work for each proposed token. The win is that it avoids four separate serial decode steps. Instead of "generate token 1, then token 2, then token 3, then token 4," verification asks "given these four proposed tokens, which prefix of them would the target model have accepted?" The draft chunk is known, so the target can process it as one block.

**Speculative decoding** uses that asymmetry. A draft path proposes several tokens. The target model verifies them. Accepted tokens move the output forward without paying one full target-model decode step per token.

There is no universal confidence threshold. If generation is greedy, verification can be as simple as "did the draft token match the target model's top token?" If generation is sampling, the usual acceptance rule is probabilistic: accept a proposed token with probability `min(1, target_prob / draft_prob)`. If the target model liked the token at least as much as the draft model did, it is accepted. If the draft model was more optimistic than the target model, it is accepted only some of the time.

For example, suppose the prompt is `"The capital of France is"` and the draft model proposes `[" Paris", ".", " It", " is"]`. If the draft model gave `" Paris"` probability `0.70`, and the target model gives that same proposed token probability `0.91`, then `accept_prob = min(1, 0.91 / 0.70) = 1.0`, so it is always accepted. If the draft model gave `"."` probability `0.60`, but the target model gives it probability `0.52`, then `accept_prob = min(1, 0.52 / 0.60) = 0.87`, so it is accepted 87% of the time.

```python
prefix = "The capital of France is"
draft_tokens, draft_dists = small_model.generate(prefix, k=4)
# draft_tokens: [" Paris", ".", " It", " is"]

# One target-model pass scores all proposed positions using the prefix KV cache.
logits = target.forward_with_cache(prefix_kv_cache, draft_tokens)
target_dists = softmax(logits)

accepted = []
for proposed, draft_dist, target_dist in zip(draft_tokens, draft_dists, target_dists):
    # Compare the two models' probabilities for this exact proposed token.
    accept_prob = min(1, target_dist[proposed] / draft_dist[proposed])

    if random() < accept_prob:
        accepted.append(proposed)
    else:
        replacement_dist = normalize_positive_part(target_dist - draft_dist)
        accepted.append(sample(replacement_dist))
        break

prefix += accepted
```

When a proposed token is not accepted, the target model samples a replacement token for that position. The server keeps the accepted prefix plus that replacement, discards the rest of the draft tokens, and continues generation from there. In other words, decode resumes from the first point where the draft stopped matching the target.

**Multi-token proposal, or [MTP](https://docs.vllm.ai/en/latest/features/speculative_decoding/mtp/?h=mtp)**, moves the draft path inside the model itself. An MTP-trained model has the normal next-token output plus extra prediction outputs trained to guess token `t+2`, `t+3`, and so on from the same hidden state. The normal output gives the token plain decoding would have produced. The extra outputs give a built-in draft for the next few positions, so there is no separate small model doing autoregressive drafting.

The loop has the same draft-then-verify shape:

```python
# One forward pass at position t.
next_token, draft_tokens, draft_dists = model.propose_multiple(prefix)
# next_token: the normal t+1 prediction
# draft_tokens: proposed t+2, t+3, ..., t+n

candidate = [next_token] + draft_tokens

# One verification pass over the proposed block.
logits = model.forward_with_cache(prefix_kv_cache, candidate)
target_dists = softmax(logits)

accepted = [next_token]
for proposed, draft_dist, target_dist in zip(draft_tokens, draft_dists, target_dists[1:]):
    accept_prob = min(1, target_dist[proposed] / draft_dist[proposed])

    if random() < accept_prob:
        accepted.append(proposed)
    else:
        replacement_dist = normalize_positive_part(target_dist - draft_dist)
        accepted.append(sample(replacement_dist))
        break

prefix += accepted
```

After verification, the model also has a fresh hidden state at the last accepted position. That fresh state can immediately produce the next group of proposal tokens. So after the first step, each iteration is roughly one proposal pass and one verification pass, instead of one full decode step per generated token.

This does not change what "correct" generation means. The target model still gets the final say. It changes how many serial target steps you spend to get there. The [vLLM speculative decoding post](https://vllm.ai/blog/2024-10-17-spec-decode) goes deeper on the serving details.

## Some Models Add Expert Routing

The intuition behind MoE is simple: you want the quality benefits of a very large model, but you do not want to run the whole model for every token. Instead of making every token pass through every feed-forward block, you create many specialized feed-forward blocks and use only a few of them per token.

That is the routing idea. In a dense model, every token flows through the same weights. In a Mixture-of-Experts model, a router picks a small number of expert MLPs for each token.

This is why MoE exists: it lets you scale total parameter count, which can help quality, without scaling the FLOPs spent on every token by the same amount, which helps cost and latency. The model may contain many experts, but each token only activates a few of them.

MoE also pairs naturally with multi-machine inference. Experts are parallel along the expert dimension, so sharding them across GPUs or machines is relatively clean: send tokens to the experts they selected, run those experts, then combine the outputs. The main tax is the routing communication, often an all-to-all exchange where tokens have to move to the machines that own their chosen experts.

<div class="moe-visual" aria-label="Mixture of Experts model layout diagram">
<div class="moe-title">LLM</div>
<div class="moe-attn">
<strong>Attention layer</strong>
<span>replicated across all GPUs</span>
</div>
<div class="moe-expert-band">
<div class="moe-gate">Gating network selects top-k experts</div>
<div class="moe-experts">
<div class="moe-expert selected"><div><div class="name">Expert 1</div><div class="gpu">GPU 1</div></div></div>
<div class="moe-expert"><div><div class="name">Expert 2</div><div class="gpu">GPU 2</div></div></div>
<div class="moe-expert"><div><div class="name">Expert 3</div><div class="gpu">GPU 3</div></div></div>
</div>
</div>
<div class="moe-attn">
<strong>Attention layer</strong>
<span>replicated across all GPUs</span>
</div>
</div>

```python
scores = router(hidden_states)
expert_ids = topk(scores, k=2)

buckets = group_by_expert(tokens, expert_ids)
expert_out = {}

for expert, toks in buckets.items():
    expert_out[expert] = experts[expert](toks)

y = combine_by_token(expert_out, scores)
```

`scores` are the router's preferences for each expert. `topk(scores, k=2)` chooses the two experts each token will use. `group_by_expert` turns token-level routing decisions into expert-level batches, because tiny scattered expert calls are bad for utilization. `combine_by_token` puts the expert outputs back into the original token order, weighted by the router scores.

That is the bargain: more parameters without running all of them, clean expert sharding across machines, and a communication bill you now have to manage.

There is another routing question: which worker should get the request? If multiple requests share a prefix, or if a user is continuing a conversation, the best worker may be the worker that already has the right cache.

```python
def score(worker, prompt):
    hit = worker.prefix_cache.match(prompt)
    wait = worker.queue_tokens
    return 3 * hit - wait

worker = best_worker(workers, prompt)

if worker.has_prefix(prompt):
    worker.continue_from_cache(prompt)
else:
    worker.prefill(prompt)
```

Cache locality can be worth more than sending the request to the emptiest queue. For agents, chat apps, structured output, and workloads with repeated system prompts, that matters a lot.

## The Serving Knobs

The tricks above are not an exhaustive map of production LLM serving, but they gave me four useful knobs to look for. They either keep batches full, reuse memory, schedule around the prefill/decode split, or reduce serial work.

<div class="moves-visual" aria-label="Four knobs for production LLM inference">
<div class="move"><div class="tag">Queue</div><h4>Continuous batching</h4><p>Add and remove requests at every decode step instead of waiting for a whole batch to finish.</p></div>
<div class="move"><div class="tag">State</div><h4>KV-cache management</h4><p>Page it, reuse it, compress it, evict it, or move it. The cache becomes the serving state.</p></div>
<div class="move"><div class="tag">Phase</div><h4>Scheduling</h4><p>Chunk prefill, prioritize decode, or split prefill and decode onto different GPU pools.</p></div>
<div class="move"><div class="tag">Loop</div><h4>Fewer serial steps</h4><p>Speculative decoding and multi-token proposals (MTP) try to produce more accepted tokens per expensive pass.</p></div>
</div>

This is also a useful way to think about serving engines:

- **vLLM** is the throughput workhorse in my head: continuous batching, PagedAttention-style KV memory management, prefix caching, and broad quantization support. It also has the broadest hardware story of the three, with serious support beyond NVIDIA.
- **SGLang** is strong when prompts share structure or prefixes: agents, RAG, chat templates, repeated system prompts, and structured generation. Its [RadixAttention work](https://www.lmsys.org/blog/2024-01-17-sglang/) is about more aggressive KV-cache reuse across related requests. I still need to understand that mechanism better. SGLang is also a serious runtime for large MoE models, where expert parallelism matters.
- **TensorRT-LLM** is the NVIDIA-heavy path. It compiles the model into an optimized TensorRT engine for a particular model shape, precision, parallelism setup, and serving configuration. That compilation step is the point: it gives the runtime more room to fuse kernels, tune memory layout, and squeeze throughput from NVIDIA GPUs. The tradeoff is workflow rigidity. If the model, quantization, max sequence length, or deployment shape changes, you may need to rebuild or retune the engine instead of just pointing a server at a checkpoint and iterating quickly.

All of these systems keep moving and the descriptions may not hold when you read it. But the questions above still help: how does the engine batch work, manage KV memory, reuse prefixes, handle MoE, fit your hardware, and support the models you need?

The core concepts are simple once the variable-length shape is visible. Prefill reads the prompt. Decode writes the answer one token at a time. The KV cache carries the conversation forward. The serving stack keeps the GPU busy while requests of different lengths enter, grow, and leave.

The next thing I want to do is tear down small versions of these systems and map the ideas above to actual code. Two good starting points are [GeeeekExplorer/nano-vllm](https://github.com/GeeeekExplorer/nano-vllm) and [sgl-project/mini-sglang](https://github.com/sgl-project/mini-sglang). They are small enough to read, but close enough to the real serving engines to make the abstractions concrete.
