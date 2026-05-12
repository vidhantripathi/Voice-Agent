# Target FAQ → OpenAI Realtime Voice Agent: Integration Guide

## What's in this package

| File | Purpose |
|---|---|
| `target_faq_knowledge_base.json` | 54 scraped Target FAQs, structured as Q&A pairs across 8 categories |
| `upload_to_openai_vectorstore.js` | Script to upload the FAQ data into an OpenAI Vector Store |
| `README.md` | This guide |

---

## Categories covered

- Price Match (11 FAQs)
- Returns & Exchanges (5 FAQs)
- Target Circle Deals (4 FAQs)
- Coupons & Deals (4 FAQs)
- Payment Options (3 FAQs)
- Taxes (5 FAQs)
- Registry & Wish List (5 FAQs)
- Protection Plans (2 FAQs)
- Tech Support (1 FAQ)
- Contact & Support (5 FAQs)

---

## Step 1: Upload to OpenAI Vector Store

```bash
# Install dependency
npm install openai

# Set your API key
export OPENAI_API_KEY=sk-...

# Run the uploader
node upload_to_openai_vectorstore.js
```

The script will print your `vector_store_id`. Save it — you'll need it below.

---

## Step 2: Option A — Use with Assistants API (recommended for RAG)

The Assistants API has native file_search (RAG) built in. Your Realtime agent
can call a backend that retrieves answers from the vector store and injects them
into the voice conversation.

```javascript
// Create assistant with file_search tool attached to your vector store
const assistant = await openai.beta.assistants.create({
  name: "Target FAQ Agent",
  model: "gpt-4o-mini",
  instructions: "Answer customer questions about Target policies using the knowledge base. Be concise — this is a voice agent, answer in 1-2 spoken sentences max.",
  tools: [{ type: "file_search" }],
  tool_resources: {
    file_search: {
      vector_store_ids: ["YOUR_VECTOR_STORE_ID"]
    }
  }
});
```

---

## Step 2: Option B — Inject FAQ context directly into Realtime system prompt

The OpenAI Realtime API (gpt-realtime-mini) does NOT support file_search natively.
The best workaround is a hybrid approach:

```
User voice query
      ↓
Your backend (Node/Python)
      ↓
  1. Convert speech-to-text (already done by Realtime API)
  2. Run a vector search against your store to retrieve the top 3 FAQ matches
  3. Inject those matches into the next Realtime API turn as a system message
      ↓
Realtime agent answers with grounded context
```

### Retrieval code (Node.js)

```javascript
import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function retrieveFAQContext(userQuestion, vectorStoreId) {
  // Create a temp thread and run file_search against the vector store
  const thread = await openai.beta.threads.create();
  await openai.beta.threads.messages.create(thread.id, {
    role: "user",
    content: userQuestion
  });

  const run = await openai.beta.threads.runs.createAndPoll(thread.id, {
    assistant_id: "YOUR_ASSISTANT_ID", // assistant with file_search enabled
    additional_instructions: "Return only the most relevant FAQ answer, in 1-2 sentences suitable for voice."
  });

  const messages = await openai.beta.threads.messages.list(thread.id);
  const answer = messages.data[0].content[0].text.value;

  // Clean up
  await openai.beta.threads.del(thread.id);
  return answer;
}
```

### Inject into Realtime session

```javascript
// In your Realtime session event handler:
realtimeSession.on("conversation.item.input_audio_transcription.completed", async (event) => {
  const userText = event.transcript;

  // Check if this looks like an FAQ-type question
  const faqKeywords = ["return", "refund", "price match", "coupon", "shipping", 
                        "order", "cancel", "tax", "registry", "gift card", "circle"];
  const isFAQ = faqKeywords.some(kw => userText.toLowerCase().includes(kw));

  if (isFAQ) {
    const context = await retrieveFAQContext(userText, "YOUR_VECTOR_STORE_ID");
    
    // Inject as a system message into the ongoing conversation
    realtimeSession.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "system",
        content: [{
          type: "input_text",
          text: `[FAQ CONTEXT - use this to answer the customer]: ${context}`
        }]
      }
    });
  }
});
```

---

## Step 3: Add this to your Realtime system prompt

Paste this block into the **System instructions** field in the OpenAI Realtime playground:

```
KNOWLEDGE BASE POLICY:
You have access to Target's official FAQ knowledge base. When a customer asks about:
- Returns, refunds, or exchanges
- Price matching
- Coupons, Target Circle deals, or promotions
- Shipping, delivery, or order tracking
- Taxes or tax exemption
- Gift cards or registries
- Protection plans or tech support

Answer ONLY using the provided FAQ context injected by the system. If no context is injected, say:
"For the most accurate answer on that, I'd recommend checking target.com/help or calling 1-800-591-3869."

Never make up policies. Always be concise — 1 to 2 sentences maximum. This is a voice conversation.
```

---

## Keeping the knowledge base fresh

Target's policies change periodically. To refresh:

1. Re-run the scraper (or re-fetch the pages manually)
2. Update `target_faq_knowledge_base.json`
3. Delete the old vector store: `await openai.beta.vectorStores.del("OLD_ID")`
4. Re-run `upload_to_openai_vectorstore.js`
5. Update the `vector_store_id` in your integration

Recommended refresh cadence: monthly, or whenever Target announces policy changes.

---

## Support contacts (embedded in knowledge base)

| Topic | Contact |
|---|---|
| General Guest Services | 1-800-591-3869 |
| Gift Registry & Wish List | 1-800-888-9333 |
| Tech Support (myTGTtech) | 1-877-698-4883 |
| Tax Exemption | tax.exempt@target.com |
| Online chat | target.com/help/contact-us |
