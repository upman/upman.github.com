---
layout: post
title: "Spotting AI Lies: How to Know When Your LLM is BS-ing"
date: 2025-11-04
categories: ai machine-learning uncertainty quantification
---

We've all been there. You ask an AI a question, and it gives you an answer that is incredibly detailed, looks knowledgeable, and... completely wrong.

Hallucinations are the single biggest hurdle to trusting AI with high-stakes work. In fields like medicine or law, an AI that confidently invents a legal precedent or misreads a medical chart isn't just unhelpful, it's dangerous.

It could even be a brand reputation risk where your AI customer support agent makes up some company policy while talking to customers as [Cursor and Air Canada found out](https://arstechnica.com/ai/2025/04/cursor-ai-support-bot-invents-fake-policy-and-triggers-user-uproar/).

This is why the most effective AI systems are built on a "Human-in-the-Loop" (HITL) model. The AI acts as a brilliant, lightning-fast paralegal or research assistant, but a human expert remains the final authority, reviewing and validating the work. But for this partnership to work, the human expert needs to know where to focus their attention. They need the AI to do something that doesn't come naturally to it: admit when it's not sure.

This capability is called **Uncertainty Quantification (UQ)** where you have an indication when an AI answer can't be trusted.

## The Two Types of "Not Sure" (In Plain English)

When an LLM is "uncertain," it can be for two very different reasons. Knowing the difference helps us decide how to measure the right kind of uncertainty.

### Aleatoric Uncertainty (The "World is Messy" Problem)

This is uncertainty that comes from the world or the answer to your question being uncertain by itself. The world is full of ambiguity, randomness, and noise. Think of sending the following to the LLM. "Complete this sentence: I flipped a coin, it landed on ____". The word at the end of this sentence is inherently uncertain. Detecting this kind of uncertainty doesn't mean the model is uncertain.

### Epistemic Uncertainty (The "I Haven't Learned This" Problem)

This is uncertainty because the AI's "education" is limited. It's a gap in the model's training. If you ask an AI trained only on data from 2021 about a legal case from 2024, it will be in "epistemic" uncertainty. This can be fixed by giving the model more or newer data.

## How Do You Get an AI to "Raise Its Hand"?

So, how do we spot these types of uncertainty? We can use a few clever methods to get a "confidence score" from an AI.

### 1. Token-Level Uncertainty

**ELI5 Version:** The AI writes token-by-token . For every token, it has a list of possible next tokens and a probability for each. We can watch this process.
Let's say we ask the LLM "What is the capital of France?". If it's 99% sure the next word is "Paris," it's confident. But if it's torn—say, 40% for "Paris" and 35% for "Lyon", it's "uncertain".

**The Drawback:** This method is noisy. The AI might just be uncertain about phrasing (e.g., "a big dog" vs. "a large dog"), not the actual fact. It's also hard to take thousands of tiny word-level "unsure" signals and roll them into one simple "I'm not sure about this whole paragraph" score.

### 2. Semantic Uncertainty (The "Ask it Twice" Method)

**ELI5 Version:** You ask the AI the same question five times. If you get five different answers (e.g., "Paris," "The capital is Paris," "Lyon," "France's capital city"), the model's understanding isn't stable. This "high variance" in the answers is a big red flag.

**The Drawback:** This is the "ensemble" approach. It's often effective, but it's also slow and expensive. You have to run the entire, massive AI model multiple times just to get one answer.

### 3. Supervised Probes (The "Hallucination Detector")

**ELI5 Version:** This is like building a second, smaller AI that's trained to do one thing: watch the "brain" of the main AI as it "thinks" and ring a bell if it looks like it's about to make a mistake.

**What it is:** This "probe" is a small model trained on the main AI's internal calculations (its "hidden states and attention weights") to predict the likelihood of an error.

**The Drawback:** To train this detector, you first need a massive dataset of the main AI's past mistakes, all neatly labeled by human experts. Creating this "ground truth" data is a huge, time-consuming, and expensive project. If you have such a dataset, it might even make sense to fine tune your model to just refuse to answer or say it's uncertain. OpenAI did exactly this in [this paper](https://arxiv.org/pdf/2205.14334).

### 4. LLM-as-a-Judge (The "Get a Second Opinion" Method)

**ELI5 Version:** Imagine you ask one AI a question. To double-check its work, you ask a second, "judge" AI to grade the first AI's answer. You can even have a whole panel of judge AIs vote on whether the answer is good or not. You can give the judge specific instructions, like "check if the answer is factual" or "make sure the answer is helpful and friendly."

**The Drawback:** This can get expensive, as you're now paying for two (or more) AIs to answer every question. Plus, the "judge" AI isn't perfect either—it might have its own biases or just get things wrong, so it's not a foolproof system.

### 5. Direct Confidence Reporting (The "Just Ask It" Method)

**ELI5 Version:** You simply ask the AI to tell you how sure it is. You can add an instruction like, "After you answer, tell me your confidence on a scale of 1 to 10." Some of the newer, more advanced AIs are actually pretty good at guessing when they might be wrong.

**The Drawback:** This relies on the AI's own self-awareness, which can be a bit of a black box. It might be overconfident, or it might be trained to sound confident no matter what. It's a simple method, but probably the least reliable.

## Why This All Matters

An AI that can say "I don't know" is infinitely more useful than one that confidently fabricates answers.

Uncertainty Quantification is the technology that makes Human-in-the-Loop systems practical. It's what tells the human expert, "Pay attention to this part". It allows us to build systems that automatically route low-confidence answers to a person for mandatory review, while letting high-confidence answers pass through.

The goal isn't to build an AI that's a perfect oracle. The goal is to build an AI that's a reliable partner.
