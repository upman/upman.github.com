---
layout: post
title: Growing your own software
comments: true
description: Bespoke software gets interesting when you can grow it around an expensive workload and have the data to prove it's good
image:
  feature: growing-software.webp
---

<style>
.article > .overlay { background: transparent; }
.article > .featured-image {
  background-color: #f8f0dc;
  background-size: contain;
  background-repeat: no-repeat;
}
</style>

The personal software zeitgeist is easy to like. Replit, Lovable, etc. Describe the thing you want, build it for yourself, change it when your needs change. Never care about the code. I've been wondering where the big economic wins are beyond having a tool exactly how you like it or automating a small business workflow.

The idea of a [dark software factory](https://addyosmani.com/blog/software-factories/#:~:text=Why%20we%20call%20it%20%E2%80%9Cdark%E2%80%9D) is also pretty seductive. But someone still has to decide what the product should do, and I'm not convinced agent loops alone can keep it maintainable. Where does completely vibed software have a clear enough target to keep improving on its own and you REAAALY don't have to look at the code while still having confidence to deploy it?

I stumbled on [VibeServe](https://arxiv.org/pdf/2605.06068v2), an approach to creating your own bespoke LLM serving stack for your specific workload, hardware, and model using coding agents. Agents propose optimizations, check correctness against a reference implementation, benchmark performance, and use the results to choose the next change.

Each LLM you come across seems to have cool new flavors of attention and tricks. Different GPUs have their own capabilities. And examples like [Jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev) and [scaledown.ai](https://scaledown.ai/) make me think about how many valuable workloads there are beyond chat.

So a bespoke serving stack starts to look interesting. You don't need to support everyone's model, hardware, and workload. Just yours. Even a short-lived optimization could pay for itself if enough expensive traffic passes through it.

Model serving is an interesting place to try this because you have a reference implementation to compare against and a workload to measure. You can vibe more fixes into it and find out whether they actually helped. The long term maintainability is still a question in my mind.

But I can imagine the playbook: release a model on a working stack, replay or shadow production traffic to vibed bespoke candidates, and keep the changes that preserve correctness while cutting cost. Loop till the performance is gangbusters. ??? Profit.

This approach almost feels like you start to **grow your own software** around the work it actually does. Maybe eventually without a single soul having to read every change. Someone still has to build an environment that can measure the correctness and performance.

My bet is that there are lots of places beyond model serving where this approach will pan out. Could be tuning database indexes and compression schemes for your specific workloads, CI runners, etc.

The more you spend doing the same thing and the more specialized your workload and hardware are, the more this makes sense. The valuable starting point is an environment that lets you measure confidently whether the software is better and still correct.
