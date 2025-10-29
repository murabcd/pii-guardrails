### Architecture Diagram

```mermaid
flowchart TD
    subgraph "Start and Retrieval"
        Start([User sends message with PII]) --> CheckFiles{Files selected?}
        CheckFiles -->|Yes| ExtractMessage[Extract user message content]
        CheckFiles -->|No| CheckPII[PII masking enabled?]
        ExtractMessage --> CreateVault{PII masking<br/>enabled?}
        CreateVault -->|Yes| InitVault[Create TokenVault<br/>Stores PII mappings for unmasking]
        CreateVault -->|No| RAGUnmasked
        InitVault --> RAGUnmasked[Send UNMASKED query to RAG<br/>PII visible for accurate search]
        RAGUnmasked --> RAGSearch[RAG similarity search<br/>Finds relevant document chunks]
    end

    subgraph "Input Guardrail: Masking"
        RAGSearch --> MaskMessage[1. Mask PII in user message<br/>Check TokenVault for existing value<br/><b>Reuse token (Deduplication)</b><br/>Store new PII and replace]
        MaskMessage --> MaskRAGContext{CRITICAL SECURITY:<br/>Mask PII in RAG context?}
        MaskRAGContext -->|Yes| MaskChunks[2. Mask PII in RAG context chunks<br/>Check TokenVault for existing value<br/><b>Reuse token (Deduplication)</b><br/>Store new PII and replace]
        MaskRAGContext -->|No| KeepChunksUnmasked[Keep RAG chunks unmasked]
    end

    subgraph "LLM Request Preparation"
        MaskChunks --> InjectContext[Inject MASKED RAG context]
        KeepChunksUnmasked --> InjectContext
        InjectContext --> BuildSystemPrompt{Has masked<br/>PII?}
        BuildSystemPrompt -->|Yes| EnhancedPrompt[Enhanced system prompt<br/>Instructs AI to match placeholders]
        BuildSystemPrompt -->|No| StandardPrompt[Standard system prompt]
    end
    
    subgraph "LLM Processing"
        EnhancedPrompt --> SendToAI[Send to AI:<br/>- Masked user message<br/>- Masked RAG context<br/>- Enhanced prompt<br/><b>ZERO PII is sent externally</b>]
        StandardPrompt --> SendToAI
        SendToAI --> AIProcess[AI processes request]
        AIProcess --> MatchPlaceholders[AI semantically matches placeholders<br/>in query and context]
        MatchPlaceholders --> GenerateResponse[Generate response with placeholders<br/>e.g., 'Contact <RUSSIAN_NAME_1> at <NUMBER_1>']
    end

    subgraph "Output Guardrail: Unmasking"
        GenerateResponse --> CheckVaultExists{TokenVault<br/>exists?}
        CheckVaultExists -->|Yes| UnmaskResponse[OUTPUT GUARDRAIL:<br/><b>Unmask response</b> using TokenVault<br/>Replace <TYPE_N> with original values<br/>Stream transformation with buffer]
        CheckVaultExists -->|No| ReturnMasked[Return response as-is]
        UnmaskResponse --> ReturnUnmasked([Return unmasked response to user<br/>Original PII visible only to the user])
        ReturnMasked --> ReturnUnmasked
    end

    style RAGUnmasked fill:#90EE90
    style MaskMessage fill:#FFB6C1
    style MaskChunks fill:#FF6B6B
    style SendToAI fill:#87CEEB
    style MatchPlaceholders fill:#FFD700
    style InitVault fill:#FFA500
    style UnmaskResponse fill:#32CD32
```

---

### Detailed Architecture Description

#### Flow Steps

1.  **User Input**: User sends a message containing Personally Identifiable Information (PII) like phone numbers, emails, or names.

2.  **TokenVault Creation** (if PII masking is enabled):
    *   A `TokenVault` instance is created for the lifecycle of the request.
    *   The `TokenVault` will store mappings: `<PLACEHOLDER_ID>` → `original_value`.
    *   This enables the unmasking of the output later.
    *   **The `TokenVault` lives for the entire request lifecycle (input → LLM → output).**

3.  **RAG Search** (if files are selected):
    *   The user's message text is extracted.
    *   An **UNMASKED** query is sent to the RAG system for maximum search accuracy.
    *   RAG performs a similarity search using the actual PII values to find relevant document chunks.
    *   ⚠️ **RAG operates on PII, but this happens internally within your infrastructure (data is not sent externally).**

4.  **Mask User Message** (INPUT GUARDRAIL):
    *   After the RAG search, PII in the original user message is masked.
    *   For each found PII, the `TokenVault` is checked:
        *   **If the value already exists, the existing placeholder is reused (Deduplication).**
        *   If not, a new unique placeholder is created: `<NUMBER_1>`, `<EMAIL_1>`, `<RUSSIAN_NAME_1>`.
    *   The mapping is stored in the `TokenVault`: `<NUMBER_1>` → `+79856004025`.

5.  **🔒 CRITICAL SECURITY: Mask RAG Context Chunks** (INPUT GUARDRAIL):
    *   **All PII in the retrieved RAG context chunks are masked before being sent to the AI.**
    *   The same **Deduplication** logic via the `TokenVault` is applied to each found PII.
    *   **This ensures that ZERO PII is sent to the external LLM (OpenAI, Google, etc.).**
    *   This is the most critical step for ensuring security.

6.  **Context Preparation**:
    *   The **MASKED** RAG context is injected into the prompt.
    *   An enhanced instruction is added, explaining to the model that the placeholders represent real values and should be matched.

7.  **AI Configuration**:
    *   Middleware is created with a reference to the `TokenVault`.
    *   An enhanced system prompt is built to instruct the AI on how to match the placeholders.

8.  **AI Processing**:
    *   The model receives the masked message and masked context.
    *   It semantically matches the placeholders (e.g., `<NUMBER_1>` in the query corresponds to `<NUMBER_1>` in the context).
    *   A response is generated that also contains placeholders: "Contact `<RUSSIAN_NAME_1>` at `<NUMBER_1>`".

9.  **🔓 OUTPUT GUARDRAIL: Unmask Response**:
    *   The system checks if a `TokenVault` exists for the request.
    *   If yes, **the response stream is transformed before being sent to the user**.
    *   All placeholders are replaced with their original values from the `TokenVault`.
        *   `<RUSSIAN_NAME_1>` → `Jamila Abdulkadyrova`
        *   `<NUMBER_1>` → `+79856004025`
    *   The stream transformation uses a buffer to correctly handle placeholders that are split across multiple data chunks.

10. **Response to User**:
    *   The user receives an accurate answer **with the original PII visible**.
    *   No PII was exposed to the external LLM during processing.

#### Key Security Principles

*   ✅ **PII Sent to RAG**: For accurate document retrieval (internal operation).
*   ✅ **PII NOT Sent to AI**: Both the user message and the RAG context are masked.
*   ✅ **Semantic Understanding Preserved**: The AI can provide accurate answers by matching placeholders.
*   ✅ **TokenVault Lifecycle**: Exists for the entire request (input → LLM → output).
*   ✅ **Token Deduplication**: The same PII value is always represented by the same placeholder, which is critical for matching.
*   ✅ **Stream Transformation**: The response is unmasked in real-time with protection against "split" tokens.
*   ✅ **Zero-Trust External Transmission**: We assume external LLMs cannot be trusted with PII and ensure security technically.
*   ✅ **User Experience Quality**: The user sees natural language with real data, not placeholders.

#### TokenVault Architecture (with Deduplication)

The `TokenVault` is a request-scoped, in-memory storage that bridges the input and output guardrails.

```typescript
// Pseudocode for TokenVault logic
class TokenVault {
  private valueToToken = new Map<string, string>();
  // ...

  store(type: string, value: string): string {
    // 1. CHECK FOR DUPLICATES
    if (this.valueToToken.has(value)) {
      // 2. REUSE EXISTING TOKEN
      return this.valueToToken.get(value)!;
    }

    // 3. CREATE NEW TOKEN
    const token = `<${type}_${this.counter++}>`;
    this.valueToToken.set(value, token);
    // ...
    return token;
  }
}
```

#### Streaming Unmasking Challenge

When the LLM streams its response, placeholders can arrive character-by-character, creating a critical challenge.

**Problem:** The LLM streams `"number <NUMBER_1>"` as:
```
"number <"      → Chunk 1
"NUMB"          → Chunk 2
"ER_1"          → Chunk 3
">"             → Chunk 4
```
Without a proper mechanism, the UI could display garbled, partial placeholders.

**Solution: Incomplete Placeholder Holdback**

The `TransformStream` must implement a buffer and a holdback mechanism:

```typescript
// Logic within the TransformStream
let buffer = '';

// On receiving a new chunk:
buffer += newChunk;

// Unmask the "safe" part of the buffer
const unmaskedPart = unmaskAndHoldback(buffer);

// Send the unmasked part to the user
controller.enqueue(unmaskedPart);

// Update the buffer to only contain the held-back part
buffer = heldBackPart;
```

This ensures that only complete, unmasked text is sent to the user, while any partial placeholder at the end of the buffer is retained until it is completed by the next chunk.

#### Example Flow (with Deduplication)

**User Query:** "Whose phone number is this? +79856004025"
**Retrieved RAG Context:** "...the contact phone for Jamila Abdulkadyrova is +79856004025..."

**After Input Masking (sent to LLM):**
```
User: "Whose phone number is this? <NUMBER_1>"
Context: "...the contact phone for <RUSSIAN_NAME_1> is <NUMBER_1>..."
```
*(Note: `+79856004025` is replaced by `<NUMBER_1>` in both places)*

**LLM Response (with placeholders):**
```
"This number, <NUMBER_1>, belongs to <RUSSIAN_NAME_1>."
```

**After Output Unmasking (shown to user):**
```
"This number, +79856004025, belongs to Jamila Abdulkadyrova."
```
✅ **Result:** The user sees a full, natural language response with real PII, but the LLM never processed any real PII values, only matching identical tokens.