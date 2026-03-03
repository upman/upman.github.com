---
layout: post
title: LLM Benchmarks Are Flatlined. Task Horizons Are Not.
comments: true
image:
  feature: coding-agent.png
---

The headline accuracy numbers on standard benchmarks have stagnated. MMLU, TruthfulQA, HellaSwag: the top models have been within a few percentage points of each other for over 2 years, which is an eternity in this field. If you track single-turn question answering, you'd be forgiven for thinking progress has stopped.

{% include mmlu-chart.html %}

So naturally you would think that if an LLM can give an answer to a question correctly only 90% of the time, with a task that needs 10 serial actions, the errors would compound and you would end up with a very low accuracy.

{% include compound-accuracy-chart.html %}

We need something around 99% accuracy at single turn tasks to have hopes of having a 20-step agent succeed more than 8 times out of 10. And yet agents keep getting better at complex, multi-step tasks, fixing deep bugs in large codebases, implementing whole frameworks without hand-holding. The improvement is steep. How?

{% include metr-time-horizons.html %}

From 2020 to 2023, the frontier moved from "answer a question" to "find a fact on the web." By 2024, models crossed into tasks that take a human 6–60 minutes: training classifiers, writing multi-file code. By 2025, the frontier hit hour-scale work. The best models today are pushing into territory that would take a skilled engineer a full workday.

This is a different kind of progress than accuracy on single turn tasks. Models aren't getting smarter in the sense of knowing more facts. They're getting better at staying on track through long chains of steps.

## Why: RL post-training

The shift happened in how models are trained after the initial pre-training phase. Reinforcement learning is now a core part of that post-training. Models are run through many rollouts of multi-step tasks, and the training signal comes from how well they do across the whole sequence, not just on individual outputs. They learn to try things, observe what happens, and adjust.

Early versions of this used Outcome Reward Models (ORMs): the model got a reward signal only if the final answer was correct. Binary feedback at the end of the chain. If step 7 of 10 went wrong, the model had no way to know which step caused the failure.

Process Reward Models (PRMs) changed this. Instead of asking "did you get the right answer?", training now asks "was each step in your reasoning valid?" OpenAI's o1 and o3 families are the most visible examples. PRMs reward the model for each correct step, not just the final output.

The result is that models learn to self-correct mid-task. You can see this in any coding agent's thinking output. Phrases like "But wait..." or "Let me take a step back..." show up constantly. The model identifies a wrong assumption partway through and backtracks without crashing the whole reasoning chain. Tasks that previously failed from a single bad intermediate step can now recover.

This is why task horizon is growing even while single-turn benchmark accuracy is flat. Benchmarks test knowledge. Task horizon tests whether knowledge can be applied across many sequential steps without derailing.

## The harness is the leverage point

As task horizons extend, the environment the model runs in becomes load-bearing. A model in a bare prompt with no feedback loop is fundamentally limited. The same model inside a tight feedback loop can accomplish orders of magnitude more.


{% include harness-complexity-chart.html %}

The harness isn't just scaffolding. At high enough complexity, it becomes the thing that makes the task tractable at all.

## Concrete example: Cloudflare's vinext

Cloudflare demonstrated this with [vinext](https://blog.cloudflare.com/vinext/), a full Next.js reimplementation that runs on Cloudflare Workers. The goal was a complete rewrite of the Next.js API surface: routing, server rendering, React Server Components, server actions, caching, the whole thing.

The approach was straightforward in a way that makes you wonder why it isn't the default:

1. Port the existing Next.js test suite directly (1,700+ Vitest unit tests and 380 Playwright E2E tests)
2. Agent writes implementation, runs the tests, receives failure output
3. Agent iterates on the failures, hill-climbing toward passing
4. Merge on green, repeat

The model didn't need to understand the full Next.js spec from first principles. The test suite was the spec, and the test output was the grounding signal. A vague goal ("implement Next.js routing") became something the agent could close on its own.

One engineer, one week, 94% API coverage of Next.js 16, 4.4x faster builds, 57% smaller bundles, ~$1,100 in API tokens. Already running in production.

The caveat is worth sitting with. Hacktron [found 24 vulnerabilities in vinext](https://www.hacktron.ai/blog/hacking-cloudflare-vinext) by looking at the negative space: everything the tests didn't cover. Their framing is blunt — "the model's objective is not 'be secure,' it is 'pass the tests'." Which is exactly right. The test suite was the spec, and the spec didn't include adversarial security review. The agent did precisely what it was asked to do. That's not an argument against the approach. It's an argument for what the harness needs to include.

## The skill that compounds

The skill that compounds here isn't prompt engineering. It's harness design: writing the test suite before handing a task to an agent, wiring up the right feedback signals, structuring the loop so the agent can self-correct.

A capable model in a bad harness will underperform a weaker model in a tight one. The Cloudflare result wasn't about using a good model. It was about giving the model something it could fail against and recover from.

The frontier models are already capable enough for complex multi-step software work. The constraint is usually on our side: have you given them the tools to know when they're wrong? Checks that catch the model when it cheats or takes shortcuts?

Writing tests first has always been good practice. Now it's also how you unlock what these things can actually do.

## Can models build their own harnesses?

Maybe eventually. But a model designing its own harness is working in territory it has almost no training examples of — the world of well-engineered agent feedback loops barely exists yet at scale. It can make reasonable guesses about structure. It has no feedback from actually running them. We need lots of cycles of agent harnesses generating data for LLMs to train on.

This is the gap that humans have to fill right now. Not by writing better prompts, but by building the environment the agent runs in. And these environments can't be invented from scratch: they have to be engineered on top of what the models were actually trained to work within. The best clues for what that looks like come from the labs themselves. OpenAI has started publishing on [harness engineering](https://openai.com/index/harness-engineering/) and Anthropic on [effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents). The research they release, and the infrastructure they describe, is worth reading carefully. It's a signal of what the models have actually been trained to expect.

## How agents writing code will affect software engineering

If the harness is the load-bearing part, then everything that makes harnesses more honest, more precise, or cheaper to run becomes more valuable:

**1. Error messages get redesigned.** Tooling output is going to need to get denser. When a human reads a compiler error, a verbose stack trace is annoying but workable. When an agent reads it, every wasted token is noise competing with signal. Error messages were designed for human eyes. They weren't designed to be consumed a thousand times an hour by something with a context window.

**2. Strongly typed languages get their moment.** Static type systems are free harness steps. When an agent writes code in Rust or strict TypeScript, it finds out immediately if it has broken an interface — before running a single test. Python and TypeScript in loose mode give you nothing until runtime, which means longer debug loops. Rust's whole pitch is that if it compiles, a specific class of memory bugs is already ruled out. That property becomes more useful when the author is an agent running thousands of iterations. The strictness that frustrated human developers turns into signal density.

**3. Formal verification tips into the mainstream.** If tests are a harness signal, formal proofs are the densest harness signal possible. A passing proof doesn't just say "it worked on these inputs" — it says "it works on all inputs." It's still mostly confined to aerospace and cryptography because the tooling is hard and the ROI hasn't been there for most software. But the bottleneck isn't the math, it's writing the proof obligations. As models get better at that, the cost of formal verification drops and the coverage you get in return stays the same. The economics are going to tip.

**4. QA becomes the bottleneck.** If agents can produce working code faster than engineers can validate it, the constraint isn't output anymore. It's confidence. "How do we know this is right?" gets harder as volume increases. Teams with solid test infrastructure and harness design will be able to move. Teams without it will be sitting on code they can't vouch for.

**5. Search and retrieval get a hard look.** Retrieval is part of the harness. A context window filled with the wrong files is like a test suite that tests the wrong things — the agent is working against bad grounding and will fail in ways that are hard to diagnose. What you put in front of the model at each step matters as much as what the model does with it, and getting that right is harness design. Search and information retrieval — largely solved for humans — are nowhere near solved for agents operating across large, dynamic codebases. There's [a good case](https://hornet.dev/blog/the-case-for-a-new-retrieval-engine-for-agents) that agents need a fundamentally different retrieval engine than the ones we have.

**6. Observability gets rebuilt for agents.** Current observability tooling was designed for human SREs: queries that take a few seconds are fine, two weeks of log retention is enough, high-cardinality fields get dropped to control costs. None of those assumptions hold for agents. An agent investigating an incident might issue 20 queries in the time a human issues one. It needs months of history to distinguish a pattern from a one-off. It needs the high-cardinality fields — user IDs, request IDs, deployment hashes — that legacy platforms routinely throw away. [ClickHouse makes the case](https://clickhouse.com/blog/ai-sre-observability-architecture) that this isn't a model problem, it's a data infrastructure problem. The observability stack needs to be rebuilt around agent access patterns, not human ones.

**7. Shadow deployments for agents.** Canary releases already do something like this for humans: ship to a slice of traffic, watch the metrics, roll forward or back. The same loop works for agent-driven changes. You give the agent a goal, it proposes a change, the harness deploys to shadow traffic, real signals come back, it iterates. Some teams are probably doing pieces of this today. The tooling to close the full loop is not far off.

**8. Software development rituals get renegotiated.** Estimation, sprint planning, detailed bug tickets — these exist because building is expensive and wasted effort has to be rationed. When the cost of a wrong turn drops, so does the need for the apparatus designed to prevent wrong turns. The Cloudflare result — $1,100 in tokens to implement 94% of a major framework's API surface — is a preview of what happens when the build cost becomes trivially small relative to the cost of planning it. At some threshold, running the experiment gets cheaper than writing the spec. The "measure twice, cut once" posture made sense when cutting once took a sprint. When it takes an afternoon, the default shifts toward trying things and using the harness output as the answer.

**9. The software engineer role bifurcates.** The broad middle layer of software development — knowing a few frameworks, stitching together CRUD apps, implementing well-specified features — is exactly what agents are already good at. It's pattern-matching on heavily-trodden ground, and that's where most of the training data is. That layer compresses. What remains is work at the poles: going deep when something breaks in ways an agent can't diagnose, and going high to design the feedback environment the agent runs in. Both require genuine engineering. Depth means dropping below the framework into the system — reading what's actually happening in memory, network, or kernel when the abstraction fails. Harness design means understanding what makes a feedback loop honest: what signals to wire up, what failure modes to cover, how to prevent the agent from optimizing against the wrong thing, cheating or taking shortcuts. Both are hardcore engineering roles.

**10. It's gonna be lots of fun!** (I just wanted a round number of bullet points okay?)