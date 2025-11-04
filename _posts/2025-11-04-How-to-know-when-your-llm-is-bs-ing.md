---
layout: post
title: "Spotting AI Lies: How to Know When Your LLM is BS-ing"
date: 2025-11-04
categories: ai machine-learning uncertainty quantification
---

Hallucinations are the single biggest hurdle to trusting AI with high-stakes work in medicine or law. When an AI confidently invents facts, it's not just unhelpful, it's dangerous.

It could even be a brand reputation risk where your AI customer support agent makes up some company policy while talking to customers as [Cursor and Air Canada found out](https://arstechnica.com/ai/2025/04/cursor-ai-support-bot-invents-fake-policy-and-triggers-user-uproar/).

This is why the most effective AI systems are built on a "Human-in-the-Loop" (HITL) model. The AI acts as an assistant, but a human expert remains the final authority. For this to work efficiently, the human expert needs to know where to focus their attention. They need the AI to raise it's hand and say it's not sure.

This capability is called **Uncertainty Quantification (UQ)**, which gives you an indication when an AI answer can't be trusted.

## The Two Types of "Not Sure"

When an AI is "uncertain," it can be for two very different reasons. Knowing the difference helps us measure the right kind of uncertainty.

### Aleatoric Uncertainty (The "World is Messy" Problem)

This uncertainty comes from the question itself being inherently ambiguous, random, or noisy. For example, if you ask the AI to complete "I flipped a coin, it landed on ____," the answer is uncertain because the real world outcome is random. This type of uncertainty cannot be reduced, even if you give the AI more data.

### Epistemic Uncertainty (The "I Haven't Learned This" Problem)

This is uncertainty because the AI's "education" is limited or insufficient. It's a gap in the model's training or knowledge. If you ask an AI trained only on data up to 2021 about a legal case from 2024, it will be in "epistemic" uncertainty. This type of uncertainty can be reduced by giving the model more or newer data.

## How Do You Get an AI to "Raise Its Hand"?

UQ methods are generally categorized as **Supervised** (trained on specific mistakes) or **Unsupervised** (relying on internal logic or output consistency). They also differ based on how much of the AI's internal processing they can see (**White-box**) or if they only see the final text (**Black-box**). Checkout this [ACL tutorial](https://sites.google.com/view/acl2025-uncertainty-for-llms/) on this subject if you want to know more details. But I will broadly summarize these methods in plain english here.

### 1. Information-Theoretic Methods: Watching the Word Guessing Game [Unsupervised, White-box]

The AI writes its response token-by-token (word-part by word-part). For every token, it has a list of possible next tokens and a probability for each. Let's say you ask it "What is the capital of france?". If the LLM is highly sure (99% for "Paris"), it's confident. If it's torn (40% for "Paris" and 35% for "Lyon"), it's uncertain.

**The Drawback:** This "Token-Level Uncertainty" is noisy. For long paragraphs of output from an LLM, it's hard to combine the probabilities into one reliable confidence score.

**The Fix (Claim-Level UQ):** Instead of just getting a score for the whole paragraph (Sequence-level) or every single word (Token-level), advanced systems focus on Claim-level UQ. The output from the LLM is split into separate claims then checks the uncertainty for specific facts or claims within the text. For example, a customer support bot might cite a company policy and some facts about the customer or their transaction and offer a solution. Then each company policy cited is a claim and each of the facts about the customer and their transation is a claim.

### 2. Consistency Methods: The "Ask It Twice" Rule [Unsupervised, Black-box]

You ask the AI the same question multiple times. If you get five different answers, the model's understanding isn't stable, and the high variance is a big red flag.

**What it is:** This is known as a Consistency-based approach. By checking the semantic similarity (how close the meaning is) or lexical similarity (how close the words are) across different samples, we can gauge reliability.

**The Best Approach (Hybrid UQ):** Combining this consistency checking with the word-guessing confidence (Information-Theoretic methods) can give good results.

### 3. Introspective Methods: Checking the AI's "Brain" [Unsupervised, White-box]

Rather than just looking at the final words or their immediate probability scores, we look inside the model as it "thinks". We look at what the LLM is focusing on as it generates each word. Checkout this awesome [3blue1brown video](https://youtube.com/watch?v=9-Jl0dxWQs8&vl=en) to get an understanding of how an LLM might store and retrieve a fact. This provides a great intuition of what happens inside of an LLM.

The hidden states or attention weights of an LLM behave differently when an LLM is unsure. By analyzing these attention patterns, we can come up with an uncertainty score.

### 4. Supervised Methods: Training a Hallucination Detector [Supervised, White-box]

This is like building a second, specialized AI whose only job is to watch the main AI's internal thoughts and ring an alarm if it looks like it's about to make a mistake.

**The Trade-off:** To train this specialized detector, you first need a massive dataset of the main AI's past mistakes, all neatly labeled by human experts. Creating this labeled "ground truth" data is expensive and time-consuming. However, once trained, these Supervised UQ methods can drastically outperform other methods, when dealing with topics they were trained on. The major drawback is that they generalize poorly to new tasks (e.g., if you train it to find lies in Q&A, it might fail when used for machine translation).


### 5. Reflexive Methods: The "Just Ask It" and "LLM-as-a-Judge" Approaches [Unsupervised, Black-box]

These are the simple ways to check confidence. Either you just ask the AI directly how sure it is, or you ask a second AI (a "Judge") to grade the first one's work.

**What it is:**
- **Verbalized Uncertainty (Just Ask It):** You prompt the AI to report its confidence (e.g., "tell me your confidence on a scale of 1 to 10"). The AI can sometimes be trained to be surprisingly good at this for advanced models, but it generally relies on the AI's self-awareness and can be prone to overconfidence. If you have a labeled dataset of when an LLM is hallucinating / low confidence, you can also finetune the model to verbalize it's uncertainty in it's responses. This is what openAI did in [this paper](https://arxiv.org/abs/2205.14334).

- **LLM-as-a-Judge:** Here, instead of asking the same LLM to grade it's results, you use a different LLM model to grade the response, often instructing it to check for factual accuracy. This could be a separate smaller fine tuned LLM or a council of many different LLMs that vote on the outputs confidence level.

## Why This All Matters

An AI that can say "I don't know" is infinitely more useful than one that confidently fabricates answers.

UQ isn't just about detecting lies; it's becoming the AI's guidance system. UQ can be used to help complex reasoning systems by detecting an uncertain step and guiding the AI to backtrack and try a better path. It can also make AI agents more efficient by only calling expensive external tools or consulting a human when the internal confidence is low.