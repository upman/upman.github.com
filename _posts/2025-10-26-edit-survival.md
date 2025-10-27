---
layout: post
comments: true
description: Edit Survival - Quality metrics for AI coding agents
image:
    feature: edit-survival.jpg
---


---

The [VSCode Copilot Chat Extension](https://github.com/microsoft/vscode-copilot-chat) was recently open sourced, offering a fantastic opportunity to look under the hood. With AI Evals being a hot topic, I was particularly interested in how the system tracks metrics. My curiosity led me down a rabbit hole into a clever system called "Edit Survival", and I am sharing what I learned here.

Edit Survival is a quality metric system that tracks how much of AI generated code change survives over time after a user accepts it. The core question it answers is: "Did the AI suggest good code that the user kept, or did the user quickly undo or rewrite it?"

## The Core Concept of Edit Survival
When Copilot applies code edits to a file, the system begins to track several key pieces of information. It records the original code before the AI edits, the specific changes the AI generated, and all subsequent user edits to that same file. The goal is to measure how much of the AI's code is still present at specific time intervals.

The tracking process, [managed by the EditSurvivalReporter](https://github.com/microsoft/vscode-copilot-chat/blob/cba52770f582212fc166b8e6abf29958871475c3/src/platform/editSurvivalTracking/common/editSurvivalReporter.ts#L32), starts the moment AI edits are applied and it measures the following metrics.

### 1. No-Revert Score
When Copilot makes edits to the code, they are optimistically applied to the underlying files so that other operations like running tests etc. can pickup those changes. But the changes are shown as diffs in the UI that the user can either accept or revert.

The noRevert score specifically measures whether a user reverted the code back to its original state before the AI's intervention. A score of 1.0 indicates the user did not revert any of the changed regions. Conversely, a score of 0.0 means the user completely reverted the code to its pre-AI edit state.

### 2. Four-Gram Similarity
This metric measures how much of the AI generated text is still present in the document. It works by using sequences of four characters, known as 4-grams, to compare the similarity between the AI's suggestion and the current code. A score of 1.0 means all the AI edits survived perfectly, while a score of 0.0 means none of the edits remain. ([compute4GramTextSimilarity](https://github.com/microsoft/vscode-copilot-chat/blob/e02c3296ae8c6ad1c7b5e9983fc4f4ce05d064fc/src/platform/editSurvivalTracking/common/editSurvivalTracker.ts#L86))

### 3. Accepted and Retained Characters
This metric is about volume. How much sheer code is the coding agent generating and how much of it is the user keeping. More, the better. ([ArcTracker](https://github.com/microsoft/vscode-copilot-chat/blob/e02c3296ae8c6ad1c7b5e9983fc4f4ce05d064fc/src/platform/editSurvivalTracking/common/arcTracker.ts#L13))

### 4. Screenshot Worthiness Index
This vital metric measures how often an AI's suggestion is so profoundly weird that the developer is compelled to screenshot it and share it with colleagues on Slack. (This is not a real metric. But I would track it just for the giggles!)

### Additional Considerations
[It also flags when a user switches git branches](https://github.com/microsoft/vscode-copilot-chat/blob/e02c3296ae8c6ad1c7b5e9983fc4f4ce05d064fc/src/platform/editSurvivalTracking/common/editSurvivalReporter.ts#L106-L107), as the survival metric might not be meaningful in that context.

The EditSurvivalReporter starts tracking when AI edits are applied and measures survival [at 30 secs, 2 mins, 5 mins, 10 mins and 15 mins](https://github.com/microsoft/vscode-copilot-chat/blob/e02c3296ae8c6ad1c7b5e9983fc4f4ce05d064fc/src/platform/editSurvivalTracking/common/editSurvivalReporter.ts#L77) after the code is accepted.

How could these metrics be used?
- **Quality of AI suggestions** - Are they good enough that users keep them? Do users immediately edit AI code, or does it work as-is?
- **Model performance** - Which models/approaches produce more durable edits?
- **UI effectiveness** - Different contexts (panel chat vs inline chat) may have different survival patterns
- **Feature improvements** - Compare "fast edit" vs "full rewrite" vs "patch" approaches

These are some pretty interesting metrics for probably any human in the loop agent, not just for coding agents.





