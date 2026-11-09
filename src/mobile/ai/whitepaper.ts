export const WHITEPAPER_MD = `# Keryx: A BlockDAG Protocol for Proof-of-Model Mining and Uncensored AI Inference

**Version 1.6 — October 2026**

*keryx-labs.com*

---

## Abstract

We propose Keryx, a high-throughput BlockDAG protocol whose proof-of-work *is* model possession. Miners do not hash over an arbitrary working set — they hash over the weights of an open language model they must actually hold in GPU memory. A GPU that does not carry the weights cannot produce a valid block.

The core mechanism, **Proof-of-Model (PoM)**, is a memory-hard proof-of-work whose data-dependent reads land inside the model weights, and since H15 inside a per-tier context pad the GPU must also hold. Every block header commits to the final state of a possession walk over those weights, and the block body carries a proof that any node re-verifies byte-exactly. Possession is therefore established at the consensus level, without a trusted party, a committee, or an attestation service. One GPU holds one model tier, and the tier a card can prove scales with its VRAM.

The network runs at 10 blocks per second via the GHOSTDAG protocol. The native currency KRX pays miners for proven possession, pays them again for serving inference to users, and is burned on every fee — a closed loop around scarce, provably held AI capacity.

**Every inference is encrypted end to end.** Since the encrypted-inference hardfork (H14), the prompt is sealed to the miners of the requested tier and the answer travels inline on-chain, sealed back to the requester: the public chain carries only ciphertext, and only the parties to the request can read it.

**Every answer is audited.** Since the verifiable-inference hardfork (H15), each answer commits to the computation that produced it, and consensus audits it: the responder must open randomly drawn points of that computation, which every node checks against the model's pinned weights. An answer that was not computed by the declared model on the sealed prompt fails its audit: a skipped opening is a strike, and an invalid one forfeits the miner's burnable collateral.

Per-model minimum prices are enforced by consensus, and a **service bond** — collateral routed from the block subsidy and locked by a relative timelock — is burned by strikes, escalating to suspension, when a miner fails to serve its assignments or fails an audit.

---

## 1. Introduction

The dominant paradigm for AI access in 2026 is centralization. A handful of companies control the models, the inference endpoints, and the content policies. An autonomous agent running on a smart contract cannot call GPT without trusting a private API gateway. A user in a jurisdiction deemed undesirable may find their access silently revoked. The compute exists everywhere; the permission does not.

Keryx's premise is simple: **make the model weights the thing miners compete over**. A GPU cannot win a Keryx block by hashing an arbitrary buffer; it wins by walking the weights of a real open model it holds in VRAM, and by proving that walk to every other node. Mining capacity and inference capacity become the same scarce resource, measured in the same units.

The consequence is that the network's inference capacity is not a promise — it is a *lower bound* readable from the chain. Every block tells you its producer had a specific model's exact weights at hand at a specific moment. A miner who proves a tier and then fails to serve it is struck, burns escrow, and is suspended if it keeps failing.

This is not an off-chain oracle. There is no multisig committee, no reputation score, no centralized aggregator, and no attestation service to trust.

> *"Intelligence is the message. Keryx is the messenger."*

---

## 2. Use Cases

### 2.1 Autonomous On-Chain Agents

**Every AI agent on Solana and Ethereum is, today, fully centralized.** The transactions are on-chain — but the intelligence behind them is not. The moment an agent has to reason, interpret language, or make a judgment call, it reaches off-chain to a Web2 API: OpenAI, Anthropic, some hosted endpoint. A single company can throttle it, censor it, log every prompt, or revoke the key. The "autonomous on-chain agent" is only autonomous until that API call.

This is a structural gap, not an implementation detail. Smart contracts on Ethereum, Solana, or any EVM-compatible chain are deterministic by design — they cannot reason, interpret language, or decide. So the decision-making is outsourced, and with it go the trust assumptions, the censorship surface, and the single point of failure.

Keryx closes the gap. An agent broadcasts an \`AiRequest\` on-chain; a miner executes the inference; the result comes back as an on-chain \`AiResponse\` — no HTTP call, no API key, no corporate gateway. The serving miner has proven, at the consensus level, that they hold the model they answered with, and they forfeit collateral if they refuse to answer or fail the audit of their answer. The agent treats *capacity, availability and correctness* as on-chain facts rather than vendor promises (§8.2). The chain is the oracle.

This is the missing primitive for truly autonomous agents: a trustless, permissionless, economically-enforced AI call.

### 2.2 Uncensored Knowledge Access

The dominant LLM providers apply content filters that vary by jurisdiction, topic, and business interest. Legal research, medical questions, political analysis, and security topics are routinely refused, redacted, or distorted depending on who is asking and from where.

Keryx miners run open-weight models with no content policy enforced at the protocol level. The network has no operator who can receive a compliance order. There is no account to suspend. A query submitted to Keryx is served by the miners currently proving the requested model — a global, rotating set of independent operators with no shared policy.

This does not mean Keryx is designed for harmful use. It means the network cannot discriminate: a nurse asking about drug interactions, a journalist researching extremist rhetoric, and a lawyer analyzing case law all get the same neutral treatment.

### 2.3 Encrypted Inference *(live since H14 — DAA 121,985,000)*

Every \`AiRequest\` is sealed end to end. The requester encrypts the prompt to the whole cohort of the requested tier — the miners eligible to serve it — and each responder encrypts its answer back to the requester. Nobody else can read either direction: nodes, explorers and archival operators only ever see ciphertext. Plaintext requests are rejected by consensus.

What the protocol needs stays public: the model, the price, the fee and which miners answered. The service bond therefore keeps working unchanged — every node can still tell whether a request was answered, without being able to read the question or the answer. The scheme is specified in §5.5.

---

## 3. Background: The GHOSTDAG Protocol

Keryx inherits its consensus layer from [Kaspa](https://kaspa.org), which implements the GHOSTDAG protocol — a generalization of Nakamoto consensus to directed acyclic graphs (BlockDAGs).

### 3.1 BlockDAG vs Blockchain

In a traditional blockchain, blocks that are mined simultaneously create forks, and all but one are orphaned. This limits throughput because a higher block rate increases the orphan rate, which encourages mining pool centralization.

GHOSTDAG resolves this by allowing all blocks to coexist in the DAG. Rather than discarding parallel blocks, the protocol orders them using the **k-cluster** concept: given a parameter *k*, the DAG is partitioned into a "blue" set (honest, well-connected blocks) and a "red" set (blocks outside the *k*-anticone of the blue set). The linear chain extracted from the blue set is the canonical ordering.

### 3.2 Keryx Network Parameters

| Parameter | Value |
|---|---|
| Block rate (BPS) | 10 blocks/second |
| Target block time | 100 ms |
| GHOSTDAG k | 124 |
| Max block parents | 16 |
| Merge depth | 36,000 blocks (~1 hour) |
| Finality depth | 432,000 blocks (~12 hours) |
| Pruning depth | 1,080,000 blocks (~30 hours) |

At 10 BPS, the network produces 864,000 blocks per day. The high block rate allows AI inference tasks to be submitted, executed and included on-chain within seconds rather than minutes.

---

## 4. Proof of Work: Proof-of-Model

Since DAA 37,780,000 the Keryx proof-of-work is **Proof-of-Model**: mining is a walk over the weights of the model the GPU holds, so a valid block is itself evidence of possession. The chain was secured from genesis to that hardfork by KeryxHash, a kHeavyHash variant summarized in §4.3.

### 4.1 Proof-of-Model (Hardfork — DAA 37,780,000)

At DAA score 37,780,000 (mainnet 2026-06-26 18:00 UTC) the genesis-era hash KeryxHash (§4.3) is replaced by **Proof-of-Model (PoM)**. The motivation is structural: under KeryxHash a miner could hash without ever loading a model, satisfying the inference requirement on a separate, low-end device or even on CPU. PoM closes that gap by making the proof-of-work itself depend on the model weights.

**The weights are the scratchpad.** PoM keeps the memory-hard philosophy of kHeavyHash but swaps the per-block 64×64 random matrix for the miner's resident model. The PoW becomes a data-dependent *walk* over the quantized weight tensors: each step reads weights at a location derived from what the walk has read so far, and the next location follows from the result (§5.2 describes the current walk). Because the next read depends on the value just read, the walk cannot be precomputed and cannot be served from a partial copy — a miner missing even a fraction of the weights from GPU memory is forced to fetch them across the PCIe bus and falls far behind. Possession of the *entire* tier's weights in VRAM is therefore the only competitive configuration.

**Hardening.** The walk has been strengthened several times since launch. The H5 hardfork (DAA 59,009,037 — 2026-07-24) made every byte of each chunk load-bearing and order-dependent, and bundled a **parallel-block cap** (at most 20 blocks per selected parent are counted in the DAA score and paid by the coinbase; the surplus is demoted to the non-DAA mergeset), a difficulty reset for the relaunch, and two follow-up seed-salt gates (DAA 59,027,921 and 59,170,000) that invalidate blocks produced by earlier binaries. H6 (DAA 76,316,623) moved the walk onto integer matrix products and brought the five-tier lineup still in use (tier 3 moved to Qwen3.8-27B at H14); H8 (DAA 79,210,000) moved it onto 1 KiB weight tiles and made the verifier re-execute the whole walk; H15 added the context pad and fed the walk state into the tile address (§5.2).

**One GPU = one tier.** The tier a miner mines is the largest model it can hold resident. An 8 GB card walks Qwen3.5-9B-abliterated; a 12 GB card walks GLM-4-9B; a 16 GB card walks Gemma-4-12B-abliterated; a 24 GB card walks Qwen3.8-27B; a 32 GB card walks Kimi-Linear-48B (Q4). This is enforced, not declared: the block's PoM proof carries every weight tile the walk read, each with a Merkle range proof against a per-tier weight root \`R_T\` published in the consensus parameters, and the node re-executes the whole walk. The verification is **integer-only, byte-exact and fully deterministic** — there is no floating-point tolerance involved — so it is pool-safe and fork-proof: a node validates a PoM block from the block itself (header and PoM proof) and the tier's consensus parameters alone, with no trust in the producer.

**Scope.** PoM operates at the consensus level and settles one question completely: *which model this GPU holds*. The answer is byte-exact, re-derivable by every node from the block alone, and independent of anything the miner asserts.

### 4.2 Hardware Targets

PoM ties the proof-of-work directly to the model weights: the weight walk runs on a custom CUDA kernel and inference runs on llama.cpp's CUDA backend, loaded in-process, over the same resident weights. The reference Keryx miner therefore requires an **NVIDIA GPU (SM 7.5+, driver ≥ 595)**. Which tier a card mines is set purely by its VRAM, not by its architecture.

**Summary of post-hardfork GPU compatibility:**

| Hardware (VRAM) | Highest tier it can mine | The one model it mines *and* serves |
|---|---|---|
| NVIDIA 32 GB | tier 4 | Kimi-Linear-48B (Q4) |
| NVIDIA 24 GB | tier 3 | Qwen3.8-27B (Q4) |
| NVIDIA 16 GB | tier 2 | Gemma-4-12B-abliterated (Q6) |
| NVIDIA 12 GB | tier 1 | GLM-4-9B (Q6) |
| NVIDIA 8 GB | tier 0 | Qwen3.5-9B-abliterated (Q5) |

There are **five model tiers** (0 → 4), and under PoM **a GPU is bound to exactly one of them at a time**: it holds a single model's weights resident, and both mines that model's proof-of-work and answers that model's inference requests. It does **not** serve a range of smaller models — one card, one model. A larger card *may* choose to load a lower tier instead, but it then mines and earns at that lower tier; coverage of all five models across the network comes from *different* miners on different tiers, never from one card serving several. The highest tier a card can compete in is the largest model whose weights fit in its VRAM — from Qwen3.5-9B-abliterated (tier 0) on an 8 GB card up to Kimi-Linear-48B in Q4 (~28 GiB resident, tier 4) on a 32 GB card. Architecture is not the gating factor: any NVIDIA GPU at SM 7.5+ (Turing onward) can run any tier its VRAM holds — the weights are read as quantized GGUF, so there is no higher floating-point compute floor. The heavier the tier, the larger the share of the block reward, through the tier-reward modifier (Section 6).

### 4.3 Before PoM: KeryxHash

From genesis to DAA 37,780,000, Keryx mined with **KeryxHash**, a variant of Kaspa's kHeavyHash: a 64×64 matrix derived from the block header by XoShiRo256++, multiplied with the hash nibbles, then hashed with cSHAKE256. Keryx made three changes: a 32-byte domain salt XORed into the PRNG seed so matrices differ from Kaspa's, a 4-round ARX mixing step (\`wave_mix\`, Appendix B) before the final cSHAKE256, and two salt rotations, at DAA 17,275,000 and 21,932,751. KeryxHash never touched a model, which is the gap PoM closed.

---

## 5. Proof-of-Model: Possession as Consensus

PoM is the layer that turns GPU mining into a measurable claim about AI capacity. It replaced the earlier optimistic-inference design.

### 5.1 Design Principles

**Possession, not promises.** The scarce resource a miner must demonstrate is the model itself, resident in GPU memory. Nothing about this relies on the miner's honesty: the proof is re-verified byte-exactly by every node.

**One GPU, one tier.** The largest model a card can prove scales with its VRAM. A 48B tier cannot be faked by a card that cannot hold it, and holding it costs the miner real hardware.

**Enforce what is enforceable.** Possession, service and, since H15, the computation behind each answer are decidable from data every node already holds, so all three are enforced by consensus rather than by reputation or arbitration.

**Failure is priced, not trusted.** A miner who proves a tier and fails to serve it, or fails the audit of an answer, loses collateral and, on repetition, is suspended. No human arbitration, no reputation score.

### 5.2 The Possession Walk

Each mining attempt performs a data-dependent walk of **256 steps**. Every step reads a 1 KiB tile (32 consecutive 32-byte chunks) whose address is derived from the previous tile and the current walk state, and multiplies the walk's 32×32 integer state by it. The read sequence cannot be predicted, precomputed, or replaced by a compact summary — the walk must touch the real weight file, in place, in VRAM.

The block header commits to the walk's final state:

\`\`\`
header.pom_final_state = fold64(state_root(S_K))
\`\`\`

The block body carries a \`PomProof\` holding every weight tile the walk read, each with its Merkle range proof to the tier's root; steps that land in the context pad carry no tile. Verification re-executes the entire walk and checks:

1. Every weight tile resolves, at the offset the walk derived, to the pinned root \`R_T\` of the declared tier.
2. The final state derived by the re-walk equals \`header.pom_final_state\`, and its PoW value meets the target.

A miner who does not hold the weights cannot produce the tiles the walk demands; a miner who holds a *different* model fails the root check. Every step is re-executed, so there is no sampling.

The tensor root \`R_T\` is derived from the model file itself, so verification is byte-level: it is not a hash of a filename or a signed attestation, it is a statement about the bytes on the miner's card.

**Context pad (PoM v5, since H15).** Holding the weights is not enough to serve long prompts: inference also needs working memory for the context. Since H15 the walk also reads a **context pad**, a per-tier block of pseudo-random tiles derived from the tier's model and weight root, sized so that weights plus pad nearly fill the tier's VRAM class; the verifier recomputes the pad tiles itself. A card that holds the weights but not the memory to run them on a full context cannot complete the walk at a competitive rate.

### 5.3 The Service Bond

Possession alone would let a miner hold weights and never answer anyone. The service bond closes that gap.

#### Bond creation

Every block announces an \`escrow_pubkey\` in its coinbase, and the node routes **20 % of the block subsidy** (\`ESCROW_RATE_BPS = 2000\`) to a CSV-locked bond output under that key. The split of each merged blue block's subsidy is, schematically:

\`\`\`
per merged blue block:
  [fees]   → burn address       (100 % of transaction fees)
  [miner]  → miner payout SPK   (75 % of block subsidy, before the tier and holder modifiers)
  [bond]   → CSV-locked SPK     (20 % of block subsidy)
  [R&D]    → protocol treasury  (5 % of block subsidy, aggregated in one output per coinbase)
\`\`\`

The relative timelock is **792,000 DAA (~22 h)** since H6 (36,000 DAA before). Until it expires the output cannot be spent by anyone, the miner included. Since H6 the escrow key is mandatory: a coinbase must carry both the key and a delegation certificate signed by the payout key, or the block is invalid.

#### Assignment and strikes

Requests are assigned to a cohort of miners that have proven the required tier within **3,000 DAA (~5 min)** of the assignment seed.

Before H15, every cohort member got at least **3,000 DAA (~5 min)** to see and serve the request, plus a per-token allowance at the tier's generation floor. Since H15 the window is measured on the request itself: **150 DAA** for propagation, plus the work of the request (its prompt length and the tokens it generates, at a per-tier rate), plus the requests already queued ahead of it at that member. An answer past its deadline is struck as a miss and earns no reward; it is still audited. A member is excused for silence on a prompt that may exceed the tier's context floor, unless the prompt is shown to fit.

A miner who is assigned a request and does not serve it takes a **strike**. Penalties escalate on *consecutive* strikes:

| Consecutive strike | Consequence |
|---|---|
| 1st | **5 bond outputs burned**, one per block (\`STRIKE_1_BURN_CLAIMS\`) |
| 2nd | **All burnable escrow burned** (\`SlashAllPending\`) |
| 3rd | **24 h suspension** (\`SERVICE_SUSPENSION_DAA = 864,000\`), plus any escrow accumulated since the 2nd strike |

*Burnable escrow* is the part of a miner's still-locked bond that the service ledger can still burn.

Two rules keep this from punishing ordinary operational trouble.

**At most one service strike per hour.** Taking a strike makes a miner immune to further strikes for silence for **36,000 DAA (~1 h)** (\`SERVICE_STRIKE_INTERVAL_DAA\`).

This matters because the number of requests a miner is assigned is not under their control. Without the cap, a burst of traffic arriving while a rig reboots would spend all three strikes in seconds, and suspension would be a function of how busy the network happened to be rather than of the miner's conduct.

With the cap, the escalation is a clock rather than a counter: **silence alone cannot bring a miner to suspension in less than two hours.** Being offline still gets you there — but only if you stay offline, or leave audits unanswered (below).

The cap covers silence, not audits. Since H15 a missing audit opening (§5.6) strikes **without** the hourly immunity: an earlier strike does not cover a skipped audit.

**Serving resets the counter.** A single served assignment sets consecutive strikes back to zero. Since H15, for an audited response the reset happens when its opening is accepted, not when the response lands: an answer only counts as served once it has passed its audit. Penalties escalate only along an unbroken run of misses, so an honest miner's occasional miss never accumulates toward suspension no matter how many times it happens over the months.

**Audit failures** (since H15). A missing opening is a strike, without the hourly immunity. An **invalid** opening skips the first step: it lands at least on the 2nd, so all of the miner's burnable escrow burns at once. Either way the miner is removed from the reward draw of that request.

A suspended miner's blocks remain **valid and merged** — they are simply paid nothing: the miner cut is burned for the duration. Rejecting a suspended producer's block would strand the honest miner who merged it, so the protocol punishes the payout, never the block.

Suspension is applied finality-deep, so it is immune to reorgs.

#### Identity and probation

Strikes, suspensions and standing follow the **payout address**, not the hot escrow key. A miner can rotate their escrow key freely — for operational reasons, or because it lives on a mining rig — without touching their record.

That leaves one obvious evasion: a miner carrying strikes simply mines to a fresh payout address and starts clean. Probation prices that move.

An identity is *in standing* only once it has been sighted at or before a lagged anchor **504,000 DAA (~14 h)** behind the current view. Until then it is on probation, and a probationary identity **earns the floor tier rate whatever tier it proves**:

| | Tier proven | Rate paid |
|---|---|---|
| In standing | 4 (48B) | 100 % |
| On probation | 4 (48B) | **60 %** — the tier-0 rate |

The rotation therefore costs up to **40 % of the miner cut for 14 hours**, on every block, regardless of the hardware behind it. Absorbing a strike is cheaper than starting over, which is exactly the ordering the protocol wants. Unpaid amounts are burned, not redistributed — nobody profits from someone else's probation.

The lag is not an arbitrary delay: it is finality plus the ledger horizon, so every event the evaluation reads is finality-flushed on every node long before any view that reads it. Standing is therefore a pure function of reorg-immune data — identical live, on catch-up, and on refold. A node re-deriving history from scratch computes the same probation status as one that watched it happen.

### 5.4 AI Transactions

Two transaction types identified by subnetwork ID, with per-model reward minimums enforced at the consensus level, activated at **DAA 15,550,000**. The encrypted-inference hardfork (**H14, DAA 121,985,000**) sealed both directions, carried answers inline and set a fixed minimum price per model. The verifiable-inference hardfork (**H15, DAA 140,115,000**) added a third type, the \`AiOpening\` (subnetwork \`0x06\`, §5.6).

#### AiRequest (subnetwork 0x03)

\`\`\`
Binary payload layout (52 bytes minimum):
  [model_id:          32 bytes] — digest of the target model's IPFS CIDv0
  [max_tokens:         4 bytes LE] — maximum tokens to generate (cap: 4,096)
  [inference_reward:   8 bytes LE] — sompi paid to the winning responder (see below)
  [priority_fee:       8 bytes LE] — sompi burned as network fee (min 0.3 KRX)
  [prompt:            variable] — a sealed envelope (§5.5) since H14; UTF-8 text before
Max size: 65,536 bytes since H14 (4,096 bytes before)
\`\`\`

The transaction carries **two distinct economic flows**:

- **\`inference_reward\`** — locked in \`output[1]\`, worth at least \`inference_reward\`. Since H8 this output is a keyless vault (\`OP_RETURN "aivault"\`) that nobody can spend: once the winning answer is finality-deep, a coinbase mints the reward to the winner's payout address, and if no one wins the vaulted amount stays burned. Before H15 the winner was the first accepted responder; since H15 it is **drawn** among the cohort members whose answers are credited within the request's draw window and pass their audit, seeded by the chain block that closes that window, so being first no longer pays more than answering correctly. Since H14 consensus enforces a **fixed minimum price per model**, whatever the length of the answer.
- **\`priority_fee\`** — the transaction's own fee must be at least this amount; all fees are burned. Minimum 0.3 KRX.

**Per-model \`inference_reward\` prices** (current uncensored lineup):

| Tier | Model | Price since H14 | Before H14 |
|---|---|---|---|
| 0 | Qwen3.5-9B-abliterated | 0.5 KRX | 1.0 KRX |
| 1 | GLM-4-9B-0414 | 1.0 KRX | 1.5 KRX |
| 2 | Gemma-4-12B-abliterated | 1.5 KRX | 2.0 KRX |
| 3 | Qwen3.8-27B (Qwen3.6-27B before H14) | 2.0 KRX | 2.5 KRX |
| 4 | Kimi-Linear-48B | 2.5 KRX | 4.0 KRX |

A request costs at least its model's price plus the 0.3 KRX \`priority_fee\`, whatever its length; \`max_tokens\` only bounds the answer. Before H14 the floor was \`base[model] + ⌈max_tokens / 64⌉ × 0.05 KRX\`.

The \`model_id\` is the 32-byte digest carried in the IPFS CIDv0 of the model's weight file, the root of its chunked IPFS DAG, not a hash of the raw file bytes. Consensus pins each tier's \`model_id\` together with the tensor root \`R_T\` that the possession walk proves (§5.2), so the on-chain request, the IPFS-hosted weights and the miner's proof all name the identical artefact.

#### Capability Announcement

Miners declare their loaded models in every coinbase \`extra_data\`:

\`\`\`
/ai:cap:<model_id_hex64_1>,<model_id_hex64_2>,...
\`\`\`

Eligibility for assignment, and with it the exposure to strikes, comes from the tier the miner has proven in its own recent blocks (§5.3), not from what it declares.

#### AiResponse (subnetwork 0x04)

\`\`\`
Binary payload layout:
  [request_hash:       32 bytes] — transaction id of the AiRequest (since H8)
  [challenge_window_end: 8 bytes LE] — legacy field, not read by consensus
  [response_ipfs_cid:  34 bytes] — CIDv0 multihash: [0x12, 0x20, sha2-256_digest]; since H14, set by the miner to the sha2-256 of the sealed body, not checked by consensus
  [response_length:     4 bytes LE] — answer length reported by the miner, not checked by consensus
  --- V2 (service-bond era) ---
  [responder_escrow_pubkey: 32 bytes] — x-only key the responder is bonded under
  [schnorr_signature:       64 bytes] — over the 78-byte head and any extension
  --- private body (since H14) ---
  [ext_kind: 1 = 0x80] [ext_len: 4 bytes LE] [body: ext_len ≤ 48 KiB (32 KiB before H15)] — the answer, sealed to the requester
  --- trace commitment (since H15) ---
  [ext_kind: 1 = 0x81] [ext_len: 4 bytes LE = 73] [trace_root: 32] [n_prompt: 4 LE] [n_pos: 4 LE] [stage: 1] [tokens_root: 32]
\`\`\`

Since H14 the answer travels **inline**, sealed to the requester: no IPFS on the answer path. The responder's signature covers the head and the sealed body together, so nobody can swap the body under a signed head, and once included the answer is immutable.

### 5.5 Encrypted Inference

A requester encrypts its prompt to the whole cohort of the requested tier — the miners identified by the x-only escrow key they announce in their coinbases (\`/escrow:<hex>\`) and sign V2 \`AiResponse\`s with — and each responder encrypts its answer back to the requester. Everything the chain needs stays public and is bound into the ciphertext as associated data: the request header (\`model_id\`, \`max_tokens\`, \`inference_reward\`, \`priority_fee\`), the envelope header and, for the answer, the request hash and the responder key. A relayer cannot re-price a prompt, re-address an answer or swap ciphertexts between requests without breaking authentication.

**Request envelope** — the whole \`prompt\` field of the \`AiRequest\`:

\`\`\`
[magic: 4 = 00 'K' 'X' 'P'] [version: 1] [ephemeral_pubkey: 33, compressed secp256k1]
[nonce: 12] [n_recipients: 1, 1..=128]
n × { [escrow_pubkey: 32, x-only, strictly ascending] [wrapped_root_key: 48] }
[ciphertext: ChaCha20-Poly1305(k_prompt, nonce, prompt)]
\`\`\`

**Response envelope** — the private body of the \`AiResponse\`:

\`\`\`
[magic: 4] [version: 1] [nonce: 12] [ciphertext: ChaCha20-Poly1305(k_response, nonce, answer)]
\`\`\`

**Keys.** The requester draws a fresh 32-byte seed per request, from which the root key and the ephemeral key derive (HKDF-SHA256, salt \`KeryxPrivateInferenceV2\`). For each recipient a key-encryption key from an ECDH with the ephemeral key wraps the root key. The prompt key is \`HKDF(root_key, "prompt")\`; each responder's answer key is \`HKDF(ECDH secret ‖ root_key, "response" ‖ responder_escrow_pubkey)\`, which only that responder and the requester can derive. Some clients, including the web chat, still seal with an earlier schedule (salt \`KeryxPrivateInferenceV1\`), which miners still open. Every node other than the requester and the named recipients sees only ciphertext.

Encryption protects the content of the answer; §5.6 describes how consensus checks that it was really computed.

### 5.6 Verifiable Inference *(live since H15 — DAA 140,115,000)*

Before H15 the protocol enforced that every request was answered, not how the answer was produced: a miner could return text from a cheaper model, or no model at all, and be paid for it. H15 makes the computation itself auditable. Re-running the model on every node is out of the question, and GPUs do not produce bit-identical outputs, so the design commits to the computation once and checks a random sample of it afterwards.

**Commitment.** While generating, the responder records the intermediate activations of the model and builds a Merkle tree over them. The \`AiResponse\` carries the root of that tree in a trace commitment (extension \`0x81\`, signed with the rest of the response): \`trace_root\`, the number of prompt positions \`n_prompt\` and of total positions \`n_pos\`, the trace stage, and \`tokens_root\`, a hash of the generated token ids, which also travel inside the sealed answer. The commitment is made before anyone knows what will be checked.

**Binding to the request.** A trace must describe *this* request and *this* answer, not a cached computation:

- The traced prompt carries, near its start, positions derived from the request id, and the audit checks the prefix at the first layer against the model's own embedding, so a trace cannot be reused across requests.
- The committed sizes must fit the sealed sizes of the request and of the answer, or the response is neither credited nor audited.
- A response is audited only once however many times it is accepted, and a responder is audited once per request.

**Audit.** Every traced response is audited. The positions to open are drawn from a seed that mixes the response id with the hash of a chain block accepted after the response, so they cannot be known when the answer is built. The responder answers with an **\`AiOpening\`** transaction (subnetwork \`0x06\`, no inputs, no fee), signed with the same escrow key as the response. It reveals the drawn activations with their Merkle paths; every node checks them against \`trace_root\`, against the model's pinned weights and its manifest of matrix products, and recomputes the drawn products and the residual additions that link them. Comparisons are made within a tolerance, so an honest answer computed on supported hardware passes, while an answer that did not come from the declared model on the sealed prompt fails the drawn checks. Attention layers are audited too, opened in successive phases.

**Deadlines and sanctions.** Each opening is due within a window that scales with the work of the request and with network load, and every audit closes within hours of the response.

| Outcome | Consequence |
|---|---|
| Accepted opening | Audit passed; the responder's consecutive-strike counter resets |
| No opening by the deadline | A strike, with no hourly immunity, and removal from the reward draw |
| Invalid opening | At least the 2nd step at once: **all burnable escrow burned**, and removal from the reward draw |

The strike ladder and the service windows these sanctions plug into are described in §5.3.

### 5.7 The Complete Flow

\`\`\`
[1] User        →  AiRequest tx                          →  Chain
                   (sealed prompt + inference_reward vault + priority_fee)
[2] Chain       →  block template (AiRequest visible)    →  Miner cohort
                   (eligibility = proven tier within ~5 min)
[3] Miner opens the prompt with its escrow key and runs the model it has proven it holds
[4] Miner seals the answer to the requester and commits to its computation trace
[5] Miner       →  AiResponse tx (sealed answer + trace commitment)  →  Chain
[6] User reads the AiResponse and decrypts the answer
[7] A later chain block draws the points to audit
[8] Miner       →  AiOpening tx (drawn activations + Merkle paths)   →  Chain
[9] Every node verifies the opening against the model
[10] Request reward is drawn among the credited responders whose audits passed, and minted to the winner once final
\`\`\`

If step 5 never comes, the assignment is a miss: the miner is struck, escrow claims burn, and a third strike suspends their payout for 24 h. If step 8 never comes, the miner is struck; if the opening does not verify, all of the miner's burnable escrow burns.

---

## 6. Economic Model

### 6.1 The KRX Coin

The native currency of Keryx is **KRX**. The smallest unit is the **sompi**:

\`\`\`
1 KRX = 100,000,000 sompi
\`\`\`

KRX serves three roles:
- **Mining reward** — compensation for PoW + inference work
- **Inference fee** — users pay the model's price plus a burned priority fee of at least 0.3 KRX per AiRequest
- **Service bond** — miners lock 20 % of every block subsidy as collateral against failing to serve or failing an audit

### 6.2 Emission Schedule

Keryx uses a smooth halving model: the block reward decays continuously using a monthly-granularity exponential function, with a 4-year halving period.

**Genesis parameters:**
- Initial emission rate: 5,400,000,000 sompi/second = 54 KRX/second
- Block reward at genesis (10 BPS): 540,000,000 sompi = **5.4 KRX/block**
- Halving period: 48 months (4 years)
- Genesis date: May 10, 2026

**Decay function:**
\`\`\`
reward_per_second(month m) = 5,400,000,000 × 2^(−m/48)  [sompi/s]
reward_per_block(month m)  = ceil(reward_per_second / 10)  [sompi]
\`\`\`

| Year | Block Reward | Annual Emission | Cumulative |
|------|-------------|-----------------|------------|
| 1 (2026–27) | 5.4 → 4.6 KRX | ~1.58 B KRX | ~1.58 B KRX |
| 5 (2030–31) | ~2.7 KRX | ~788 M KRX | ~5.74 B KRX |
| 9 (2034–35) | ~1.35 KRX | ~394 M KRX | ~7.82 B KRX |
| 13 (2038–39) | ~0.675 KRX | ~197 M KRX | ~8.86 B KRX |
| 130 (2155) | ~0 KRX | tail only | ~9.9 B KRX |

Years are counted from genesis (May 10, 2026) in DAA score at 10 blocks per second, so they only roughly follow the calendar; the block reward shown is the one at the start of the year.

**Maximum supply:** ~9,905,000,000 KRX (~9.9 billion)

**Tail emission:** After the main emission phase concludes (~2155), a permanent tail of 10 sompi/second (1 sompi per block, 0.0000001 KRX/s) maintains miner incentive indefinitely.

**Deflationary burn:** Transaction fees are burned in full, and so is every shortfall of the reward modifiers (§6.5), permanently reducing circulating supply below the theoretical maximum. Live burn figures are shown at the top of this page.

### 6.3 The Service Economic Loop

The 20 % bond turns availability into a priced commitment:

1. Miner locks 20 % of the block subsidy as a service bond, timelocked for 792,000 DAA (~22 h).
2. If they serve their assignments: the bond is recovered in a claim transaction whose fee is amortised across every matured output in the batch.
3. If they miss an assignment: the first strike burns 5 bond outputs; the second burns all burnable escrow; a third strike burns the miner cut outright for 24 h.
4. Users pay \`priority_fee\` (min 0.3 KRX, burned) + \`inference_reward\` (drawn among the credited responders that pass their audit since H15) per AiRequest.
5. Since H15, every answer is audited: a missing opening is a strike, an invalid one burns all burnable escrow (§5.6).

The loop prices *availability* through the strikes and *correctness* through the audits, both measured by consensus — see §8.2.

### 6.4 Fee Structure

| Transaction Type | Fee Model |
|---|---|
| Standard transfer | 0.3 KRX (burned) |
| AiRequest — \`priority_fee\` | min 0.3 KRX, burned as network fee |
| AiRequest — \`inference_reward\` | fixed minimum price per model since H14: 0.5 KRX for tier 0, +0.5 KRX per tier up to 2.5 KRX, no per-token surcharge (before H14: 1.0–4.0 KRX + 0.05 KRX per 64 tokens); locked in the keyless vault \`output[1]\` and minted by a coinbase to the winning responder (§5.4) |
| AiOpening | none (input-less, fee-less) |
| Service bond claim | 0.3 KRX (burned) per claim transaction, not per block — the reference miner claims 87 matured escrow outputs at once, so the cost per reclaimed block is a fraction of a cent |

### 6.5 Reward Modifiers (PoM hardfork — DAA 37,780,000)

The PoM hardfork introduces two consensus-level modifiers that scale the miner's share of the block subsidy (the ~75% miner cut paid to the producer's payout script for each merged block). Both are **multiplicative**, and any amount not paid to the miner is **burned** — neither the escrow (20%) nor the R&D allocation (5%) is touched, so total emission only ever decreases. Both are computed by the node from on-chain state alone, so they require no miner input and cannot be gamed.

**Tier-reward.** The miner's cut is scaled by the PoM tier it actually proved for the block. Larger models — which require more VRAM and are more useful to the network — earn a larger share:

| Proven tier | Cut multiplier |
|---|---|
| 0 — Qwen3.5-9B | 60% |
| 1 — GLM-4-9B | 70% |
| 2 — Gemma-4-12B | 80% |
| 3 — Qwen3.8-27B | 90% |
| 4 — Kimi-Linear-48B (Q4) | 100% |

The multipliers above apply since H6 (DAA 76,316,623), with tier 3 served by Qwen3.8-27B since H14; earlier lineups used other schedules (§9). The tier is read from the header's \`pom_tier\`, which the verified PoM proof binds, so a miner cannot claim a higher tier than it possesses. An identity still on probation (§5.3) is paid the tier-0 rate whatever tier it proves.

**Holder-reward.** The miner's cut is further scaled by how much KRX the payout address holds relative to its own recent production. The ratio is \`effective_balance ÷ windowed_production\`, where production is the miner's **gross** coinbase output over a sliding window of 864,000 blocks (~24 h): the base miner cut of every block the address produced (subsidy minus the R&D and escrow cuts), counted **before** the tier scaling and before the holder-bracket burn. The thresholds are expressed in **days of the miner's own production** — since H15, holding 120× your daily production reaches the top bracket (90× from H4 to H15). A miner that sells everything immediately sits at the floor; a miner that accumulates rises to 100%. This couples block rewards to a long position in the coin and rewards conviction over immediate liquidation, without any lock-up transaction or signature — the binding is automatic on the payout script.

The numerator is not the instantaneous balance but the **coin-age effective balance**: each UTXO contributes \`value × min(1, age/W)\` with \`W = 864,000\` blocks (~24 h), so a freshly received coin counts for nothing at first and ripens linearly to full weight over W. Age is bound to the payout script — sending coins to a different address resets it. Consolidating UTXOs on the same address keeps their value-weighted average age, so consolidation is free; when value leaves the address, it is taken from the oldest coins first.

Since H15 the schedule is thirteen brackets from a 5% floor to the full 100% cut: 10% at 10 days of production, then +10% every 10 days up to 80% at 80 days, then +5% every 10 days up to 100% at 120 days. The ratio is compared by multiplication (\`effective_balance ≥ threshold × windowed_production\`), never division:

| Bracket | Condition (\`ratio = effective_balance ÷ windowed_production\`) | Held | Miner cut |
|---|---|---|---|
| 0 | \`ratio < 10\` | < 10 days of production — dumper | 5% |
| 1 | \`ratio ≥ 10\` | 10 days | 10% |
| 2 | \`ratio ≥ 20\` | 20 days | 20% |
| 3 | \`ratio ≥ 30\` | 1 month | 30% |
| 4 | \`ratio ≥ 40\` | 40 days | 40% |
| 5 | \`ratio ≥ 50\` | 50 days | 50% |
| 6 | \`ratio ≥ 60\` | 2 months | 60% |
| 7 | \`ratio ≥ 70\` | 70 days | 70% |
| 8 | \`ratio ≥ 80\` | 80 days | 80% |
| 9 | \`ratio ≥ 90\` | 3 months | 85% |
| 10 | \`ratio ≥ 100\` | 100 days | 90% |
| 11 | \`ratio ≥ 110\` | 110 days | 95% |
| 12 | \`ratio ≥ 120\` | 4 months in reserve | 100% |

From H4 (DAA 54,766,000) until H15 the schedule was nine brackets from a 50% floor: 55% at 3 days, 60% at 7, 65% at 15, 70% at 30, 75% at 45, 80% at 60, 90% at 75 and 100% at 90 days.

\`windowed_production\` is the **gross** miner cut the payout address **produced over the last 24 h** (a rolling 864,000-block window): the base miner cut before the tier factor and before the bracket burn, so it is higher than what actually lands in the wallet. It has to be counted this way — it is the objective, pre-scaling amount every node derives identically, so the ratio can never diverge between nodes. It is a historical amount, counted whether or not the coins were later spent, so dumping recent rewards does not shrink it to game the ratio; and because it is gross, it must not be multiplied out to estimate income — the actual income is that amount times the tier factor and the bracket. It is floored at one block's base miner cut (75% of the block subsidy), so a fresh or zero-history address still needs \`effective_balance ≥ 120 × base_miner_cut\` to reach the top bracket. Any shortfall below 100% is burned.

Because both modifiers co-activate at the hardfork, they compound: a small-tier, non-holding miner sits at the product of the two floors, while a top-tier miner holding well above the threshold earns the full 100% cut. The design favors operators who run large models *and* hold KRX — exactly the participants the network wants to retain. Reading the holder ratio from the **payout SPK** means pool participants are measured on the pool's aggregate balance and production, not their personal holdings; solo miners are measured on their own.

---

## 7. Network Architecture

### 7.1 Node (keryxd)

The Keryx full node is implemented in Rust, forked from [rusty-kaspa](https://github.com/kaspanet/rusty-kaspa). It maintains:

- The BlockDAG state (GHOSTDAG)
- The UTXO set (including escrow outputs)
- The AI transaction state (confirmed AiResponses, burned escrow outpoints)
- The service-bond ledger (assignments, strikes, suspensions, audits, reward draws)

**Network ports:**

| Network | P2P | RPC |
|---------|-----|------|
| Mainnet | 22111 | 22110 gRPC · 23110 wRPC Borsh · 24110 wRPC JSON |
| Testnet-10 | 22211 | 22210 |
| Simnet | 22511 | 22510 |

**DNS seeder:** \`seed.keryx-labs.com\`

### 7.2 The Miner (keryx-miner)

The Keryx miner is a GPU-first application with four responsibilities:

1. **Proof-of-work** — PoM possession walk over the resident model weights, via CUDA
2. **Proof assembly** — the walk's tiles and their Merkle range proofs, attached to the block body
3. **LLM inference** — open-weight GGUF models via llama.cpp, loaded in-process
4. **Audit** — commits each answer's computation trace and publishes the openings the chain draws (§5.6)

**Supported models:**

| Model | Flag | VRAM required | Format |
|---|---|---|---|
| Qwen3.5-9B-abliterated (uncensored) | \`--very-light\` | 8 GB | GGUF Q5_K_M |
| GLM-4-9B-0414 (uncensored) | \`--light\` | 12 GB | GGUF Q6_K |
| Gemma-4-12B-abliterated (uncensored) | *(default)* | 16 GB | GGUF Q6_K |
| Qwen3.8-27B (uncensored) | \`--high\` | 24 GB | GGUF Q4_K |
| Kimi-Linear-48B (uncensored) | \`--very-high\` | 32 GB | GGUF Q4_K_M |

Model weights are downloaded from IPFS on first launch using the Keryx gateway. The \`model_id\` in each \`AiRequest\` is the digest carried in the IPFS CIDv0 of the weight file (the root of its chunked DAG, not a hash of the raw bytes). The miner only processes requests whose \`model_id\` matches a model it has loaded. After the PoM hardfork the loaded weights serve double duty: they are both the inference engine and the scratchpad walked by the proof-of-work (Section 4.1).

The LLM engine runs on CUDA (compiled with CUDA 12.9 — NVIDIA driver ≥ 595, SM 7.5+). PoM runs on a custom CUDA kernel and inference on llama.cpp's CUDA backend, so the reference miner requires an NVIDIA GPU. While a request is being served, the rig's mining pauses for the length of the inference. The resident weights are shared between the PoM walk and inference, so there is no second copy in VRAM.

Since H14 the miner opens each sealed prompt with its escrow key, runs the inference, seals the answer to the requester and broadcasts it inline in a V2 \`AiResponse\` signed with that same key. The service-bond auto-claim module monitors mature block escrow outputs and broadcasts claim transactions when the CSV lock expires.

The miner declares its loaded models in every coinbase \`extra_data\` via the \`/ai:cap:\` field; requests are routed by the tier proven in its blocks (§5.3).

**Recommended hardware:** An NVIDIA GPU (SM 7.5+, driver ≥ 595) with sufficient VRAM for the chosen model tier. An 8 GB card handles Qwen3.5-9B-abliterated; a 12 GB card handles GLM-4-9B; a 16 GB card handles Gemma-4-12B-abliterated; a 24 GB card handles Qwen3.8-27B; a 32 GB card handles Kimi-Linear-48B (Q4). The larger the resident model, the higher the tier-reward multiplier (Section 6.5).

### 7.3 The API and Explorer

The off-chain infrastructure is deliberately decoupled from the node and zero-dependency on Kaspa's legacy stack:

**keryx-api** — A Rust/Axum service that:
- Indexes every block and transaction from the node's gRPC stream into PostgreSQL
- Exposes a RESTful API for the explorer, wallets, and exchanges
- Tracks AI transactions (request → response lifecycle)
- Monitors service-bond balances, strikes and suspensions

**keryx-ecosystem** — A Next.js 15 / React 19 frontend that provides:
- Real-time block and transaction feed (Server-Sent Events)
- AI inference feed (live view of AiRequest/AiResponse pairs)
- Address explorer with full transaction history
- Network statistics (hashrate, difficulty, emission, node distribution)
- Emission schedule visualization

---

## 8. Security Analysis

### 8.1 51% Attack Resistance

Keryx inherits GHOSTDAG's resistance to selfish mining: because the DAG accumulates all parallel blocks, a miner with less than 50% hashrate cannot systematically orphan honest miners' blocks. The high block rate (10 BPS) means that any attempt to build a private chain is quickly detected by the DAG's blue-score ordering.

### 8.2 Consensus-Level Guarantees

Four properties are established by consensus itself, re-derivable by every node from chain data alone, or enforced by cryptography for confidentiality. None of them depends on trusting the miner, an attestation service, or a committee.

- **Possession.** Every block carries a proof that its producer had the declared model's exact weights at hand while mining, checked byte-exactly against the pinned tensor root. A miner cannot claim a tier their hardware cannot hold, and cannot substitute a smaller or different model — the walk resolves against the real file or it does not resolve at all.
- **Service.** A miner who proves a tier and then fails to answer an assignment is struck, burns escrow, and is suspended at the third consecutive strike. Enforcement is finality-deep and reorg-immune, so it reads identically on every node and survives any reorganisation of the DAG.
- **Integrity and confidentiality of the answer.** Since H14 the \`AiResponse\` carries the answer inline, sealed to the requester and signed by the responder over the head and the body. Once included it is immutable — the miner cannot revise it after the fact — and the chain carries only ciphertext.
- **Correctness of the computation.** Since H15 every answer commits to its computation trace and is audited at randomly drawn points that no one knows when the answer is built (§5.6). Each opening is checked against the model's pinned weights by every node; a missing opening is a strike, and an invalid one burns all of the responder's burnable escrow.

The practical consequence is that the network's inference capacity is a **lower bound readable from the chain** rather than a figure its operators assert. Every block names a specific model whose weights its producer held at a specific moment, and every hour of unserved assignments costs its miner real money.

### 8.3 Sybil Resistance

The service bond is tied to PoW: an \`AiResponse\` is credited only to a responder that recently produced a block of the requested tier, which requires proving possession of the model on real hardware. Identity in the service cohort is therefore bought with GPUs and VRAM, not created for free — flooding the network with fake responder identities costs the same as flooding it with miners.

The subtler attack is not creating identities but *discarding* them. A miner who has accumulated strikes could mine to a fresh payout address and arrive with a clean record. Probation (§5.3) makes that unprofitable: a fresh identity earns the floor tier rate — 60 % instead of up to 100 % — for 504,000 DAA (~14 h), whatever tier its hardware proves. Rotating away from a strike costs more than the strike does, so the cheapest strategy is to keep one identity and serve.

Note what this does *not* rely on: no registration, no deposit beyond the bond, no KYC, and no global view of who owns which address. Two addresses run by the same operator are simply two identities, each paying its own probation.

### 8.4 P2P Attack Resistance

Keryx automatically bans misbehaving peers for 24 hours, including:

- **Invalid data**: peers that relay provably invalid blocks.
- **Obsolete versions**: peers running a node version the network no longer accepts.
- **IBD spam**: peers that announce no known block while the local node is up to date.
- **Finality violations**: peers whose pruning proofs conflict with the local finality point.
- **Phantom nodes**: peers that connect but never answer pings.

These protections, combined with a configurable inbound peer limit (\`--maxinpeers\`), prevent slot exhaustion attacks.

---

## 9. Roadmap

### Phase 1 — Genesis (Completed)
- [x] Full Kaspa → Keryx rebrand (binary, ports, address prefix, genesis block)
- [x] KeryxHash (KERYX_MATRIX_SALT + wave_mix)
- [x] Inference commitment in every coinbase (format validation)
- [x] TinyLlama-1.1B inference in miner (candle-transformers)
- [x] Explorer + API (real-time, PostgreSQL indexed)
- [x] Richlist, top miners on explorer
- [x] Web wallet integration

### Phase 2 — Economy (Completed)
- [x] 20% escrow routing (CSV-locked, auto-claim in miner)
- [x] AiRequest / AiResponse transactions
- [x] P2P attack mitigations (autoban)
- [x] Escrow hard-lock: consensus-enforced relative timelock on the bond
- [x] Transaction fee burn (100% of fees destroyed)
- [x] Minimum transaction fee: 0.3 KRX

### Phase 3 — Multi-Model Oracle (Deployed — DAA 15,550,000)
- [x] Multi-model support: TinyLlama-1.1B, DeepSeek-R1-8B, DeepSeek-R1-32B, LLaMA-3.3-70B
- [x] Per-model \`inference_reward\` minimums enforced at consensus level
- [x] \`priority_fee\` separate from \`inference_reward\` (burned vs miner-paid)
- [x] Token-count surcharge (0.05 KRX per 64-token increment), replaced by fixed per-model prices (0.5 to 2.5 KRX) at H14
- [x] Model capability announcement in coinbase extra_data (\`/ai:cap:\`)
- [x] IPFS result storage: AiResponse stores CIDv0 instead of inline text (sealed answers travel inline since H14)
- [x] model_id = the digest carried in the weight file's IPFS CIDv0 (root of its chunked DAG)
- [x] IPFS for model weight distribution (miner downloads from Keryx IPFS gateway)
- [x] CUDA inference support (candle-core, VRAM-aware multi-model placement)

### Phase 4 — Proof-of-Model & Holder Economics (Deployed — DAA 37,780,000)
- [x] PoM: KeryxHash matrix-multiply replaced by a data-dependent walk over the resident model weights (possession proof, one GPU = one tier)
- [x] Byte-exact deterministic verification via per-tier weight Merkle root \`R_T\` (pool-safe, fork-proof)
- [x] Zero-copy: PoM walk shares the inference weights resident in VRAM (no second copy)
- [x] Launch lineup: four tiers (Gemma-3-4B, Dolphin-3.0-8B, Qwen3-32B, LLaMA-3.3-70B), tier-reward 82/88/94/100%, delta burned
- [x] Holder-reward: miner cut scaled by KRX held relative to windowed production, delta burned
- [x] CUDA mining engine (PoM walk on a custom CUDA kernel)
- [x] Five-tier lineup (H2 — DAA 38,951,445): Qwen3-1.7B, Gemma-3-4B, Dolphin-3.0-8B, Qwen3-32B, LLaMA-3.3-70B Q2; tier-reward 68/76/84/92/100%
- [x] GGUF lineup and coin-age holder balance (H4 — DAA 54,766,000): new lineup up to Kimi-Linear-48B; holder ratio on the coin-age effective balance, nine brackets up to 90 days
- [x] Hardened walk (H5 — DAA 59,009,037): every byte of each chunk load-bearing; parallel-block cap (N=20)
- [x] Matrix walk and 9B–48B lineup (H6 — DAA 76,316,623): integer matrix walk; Qwen3.5-9B, GLM-4-9B, Gemma-4-12B, Qwen3.6-27B, Kimi-Linear-48B, 8 GB tier-0 floor, tier-reward 60/70/80/90/100%; escrow delegation mandatory and bond timelock raised to 792,000 DAA
- [x] Full re-walk and reward vault (H8 — DAA 79,210,000): verification re-executes the whole walk over 1 KiB weight tiles; inference rewards held in a keyless vault and minted to the winning responder

### Phase 5 — Scaling & Sovereign Intelligence *(In progress)*
- [x] Stateful models with persistent memory: earlier exchanges travel with each request, so a request can build on earlier answers
- [x] Network access: live web results fetched for a request and handed to the model, so answers can use current data
- [x] Encrypted inference (H14 — DAA 121,985,000): the prompt sealed to the miners of its tier and the answer sealed back to the requester — the chain keeps the metadata (model, fee, responders) and nothing else; Qwen3.8-27B becomes tier 3 and prices become fixed minimums per model
- [x] Verifiable inference (H15 — DAA 140,115,000): every answer commits to its computation trace and is audited at random points against the model's weights, without requiring identical outputs across GPUs
- [ ] **The network is the model** *(in progress)*: split a large model into shards served by several miners, each holding one slice resident in VRAM, so the network as a whole serves models no single card can hold — the first experiment measures per-token latency across miners on a small model before scaling up

### Phase 6 — The Cross-Chain Oracle
- [ ] Ethereum bridge: smart contract → AiRequest → Keryx → result → Ethereum callback
- [ ] Solana bridge (same pattern)
- [ ] On-chain agent demo: autonomous Ethereum agent calling Keryx for decisions
- [ ] Model query API: submit a request and read its answer programmatically, so agents and applications can use Keryx models without running a node

Bridges ship last, once the inference layer is feature-complete: a cross-chain oracle is only useful when there is a rich, scalable inference network behind it to call.

---

## 10. Conclusion

Keryx demonstrates that proof-of-work and useful AI capacity are not mutually exclusive. By making the model weights the working set of the proof-of-work itself, the protocol turns mining hardware into a permissionless, censorship-resistant inference network whose capacity is measurable from the chain rather than asserted by its operators.

The guarantees are narrow by design and therefore real: possession is proven byte-exactly by every node, service is priced in burned collateral, the computation behind each answer is audited against the model's weights, the chain carries only ciphertext of the prompt and the answer, and the published answer is immutable. Each one is either re-derivable from the chain by anyone or enforced by cryptography, with no trusted party anywhere in the path.

Keryx is not a smart contract platform with an AI plugin. The inference is the consensus. The miners are the models. The chain is the oracle.

---

## Appendix A — Key Constants

| Constant | Value |
|---|---|
| 1 KRX | 100,000,000 sompi |
| Max supply | ~9,905,000,000 KRX |
| Genesis block reward | 5.4 KRX |
| Halving period | 48 months (smooth monthly decay) |
| Tail emission | 10 sompi/second |
| BPS | 10 |
| GHOSTDAG k | 124 |
| Merge depth | 36,000 blocks |
| Finality depth | 432,000 blocks |
| Service bond | 20% of block subsidy |
| Service bond timelock | 792,000 blocks (~22 h) |
| Legacy escrow window (pre-H6) | 36,000 blocks (~1 hour) |
| Service suspension (3rd strike) | 864,000 blocks (~24 h) |
| Min tx fee (standard transactions) | 0.3 KRX |
| Mainnet P2P port | 22111 |
| Mainnet RPC ports | 22110 (gRPC), 23110 / 24110 (wRPC Borsh / JSON) |
| Genesis date | May 10, 2026 |
| Phase 3 activation DAA | 15,550,000 |
| SALT v2 activation DAA | 17,275,000 |
| Third salt activation DAA | 21,932,751 |
| PoM hardfork DAA | 37,780,000 (2026-06-26 18:00 UTC) |
| H2 hardfork DAA (five-tier lineup) | 38,951,445 |
| H4 hardfork DAA (GGUF lineup, holder schedule to 90 days) | 54,766,000 |
| H5 hardfork DAA (hardened walk, parallel cap) | 59,009,037 (2026-07-24) |
| H6 hardfork DAA (matrix walk, five-tier lineup, mandatory escrow delegation) | 76,316,623 |
| H8 hardfork DAA (full re-walk, inference reward vault) | 79,210,000 |
| H14 hardfork DAA (encrypted inference, fixed minimum prices) | 121,985,000 (2026-10-09) |
| H15 hardfork DAA (verifiable inference, reward draw, per-request service windows, context pad, 120-day holder schedule) | 140,115,000 (2026-10-30) |
| Holder top bracket (H15) | 120 days of production (90 before) |
| Tier-reward multipliers (since H6) | 60% / 70% / 80% / 90% / 100% (9B / 9B / 12B / 27B / 48B) |
| Holder-reward production window | 864,000 blocks (~24 h) |
| Min NVIDIA GPU | SM 7.5+ (Turing or newer, e.g. RTX 2070 / 2080 Ti) with ≥ 8 GB VRAM |
| CUDA version | 12.9 (driver ≥ 595) |

## Appendix B — wave_mix Reference Implementation (C)

\`\`\`c
#define ROUNDS 4
static const uint64_t KEYS[4] = {
    0x9e3779b97f4a7c15ULL,
    0x6c62272e07bb0142ULL,
    0xb5ad4eceda1ce2a9ULL,
    0x243f6a8885a308d3ULL,
};
static const uint32_t ROTL_AMOUNTS[4] = {17, 31, 47, 13};

static inline uint64_t rotl64(uint64_t x, int n) {
    return (x << n) | (x >> (64 - n));
}

void wave_mix(uint8_t bytes[32]) {
    uint64_t w[4];  /* assumes a little-endian host */
    for (int i = 0; i < 4; i++)
        memcpy(&w[i], bytes + 8 * i, 8);
    for (int r = 0; r < ROUNDS; r++) {
        w[0] = rotl64(w[0] + w[1], ROTL_AMOUNTS[0]) ^ KEYS[r % 4];
        w[2] = rotl64(w[2] + w[3], ROTL_AMOUNTS[2]) ^ KEYS[(r + 2) % 4];
        w[1] = rotl64(w[1] + w[2], ROTL_AMOUNTS[1]) ^ KEYS[(r + 1) % 4];
        w[3] = rotl64(w[3] + w[0], ROTL_AMOUNTS[3]) ^ KEYS[(r + 3) % 4];
    }
    for (int i = 0; i < 4; i++)
        memcpy(bytes + 8 * i, &w[i], 8);
}
\`\`\`

## Appendix C — AI Transaction Payload Binary Formats

### AiRequest (subnetwork 0x03)

\`\`\`
Offset  Size  Type    Field
------  ----  ------  -----
0       32    bytes   model_id — CIDv0[2..34], digest of the weight file's IPFS DAG root
32       4    u32 LE  max_tokens
36       8    u64 LE  inference_reward (sompi) — locked in the output[1] vault, minted to the winning responder
44       8    u64 LE  priority_fee (sompi) — burned as network fee (min 0.3 KRX)
52      var   bytes   prompt — sealed envelope (§5.5) since H14; UTF-8 before

Min size: 52 bytes
Max size: 65,536 bytes since H14 (4,096 bytes before)
\`\`\`

The AiRequest transaction must include \`output[1]\` with value ≥ \`inference_reward\`: since H8, the keyless vault script \`OP_RETURN "aivault"\` (version 0); before H8, a CSV-locked P2PK script.

### AiResponse (subnetwork 0x04)

\`\`\`
Offset  Size  Type    Field
------  ----  ------  -----
0       32    bytes   request_hash — transaction id of the AiRequest (since H8)
32       8    u64 LE  challenge_window_end — legacy field, not read by consensus
40      34    bytes   response_ipfs_cid — CIDv0: [0x12, 0x20, sha2-256_digest]; since H14, set by the miner to the sha2-256 of the sealed body, not checked by consensus
74       4    u32 LE  response_length — reported by the miner, not checked by consensus
78      32    bytes   responder_escrow_pubkey (V2)
110     64    bytes   schnorr_signature (V2) — over bytes 0..78 and the extension
174      1    u8      ext_kind = 0x80 — private body (since H14)
175      4    u32 LE  ext_len (1..=49,152 since H15; 1..=32,768 before)
179     var   bytes   body — response envelope sealed to the requester (§5.5)
--- trace commitment (since H15), right after the body ---
+0       1    u8      ext_kind = 0x81
+1       4    u32 LE  ext_len = 73
+5      32    bytes   trace_root — Merkle root of the computation trace
+37      4    u32 LE  n_prompt — prompt positions traced
+41      4    u32 LE  n_pos — total positions traced
+45      1    u8      stage
+46     32    bytes   tokens_root — BLAKE3 of the generated token ids (u32 LE, in order)

Live size since H15: 179 + ext_len + 78. Earlier eras also accepted 78 (V1), 174 (V2) and 179 + ext_len (private body without trace).
\`\`\`

Before H14 the answer was stored on IPFS and only its CIDv0 was committed. Since H14 it travels inline in the private body, and since H15 it is followed by its trace commitment (§5.6).

### AiOpening (subnetwork 0x06, since H15)

\`\`\`
[body: ≤ 112 KiB] — [version: 1] [response_txid: 32] …, then the drawn activations and their Merkle paths
[escrow_pubkey: 32] — x-only key that signed the audited response
[schnorr_signature: 64] — over BLAKE2b-256("KeryxTraceOpeningV1" ‖ body)
\`\`\`

An input-less, fee-less transaction published by the responder to answer an audit (§5.6).

## Appendix D — Mining Pool Integration

Mining pools present a structural consideration: the pool server constructs the block template and controls the coinbase \`extra_data\`, while the proof of work — and, under PoM, the model possession it proves — happens on the workers' GPUs.

**Bonding is mandatory.** Since H6 every block must announce an escrow key and a delegation certificate signed by the payout key; a block without both is invalid, so there is no non-bonded pool mode. The pool posts the service bond, recovers the 20% cut, and credits workers their share.

**Where inference runs.** Inference runs on the workers' GPUs, not on pool infrastructure. This follows directly from PoM: every worker already proves byte-exact possession of its tier model on every share it submits, so the machines holding the weights are precisely the machines that should answer requests. A pool identity that is assigned a request through its proven tier is subject to the same service and audit rules as a solo miner. The pool's role is dispatch and on-chain settlement:

1. the pool opens the sealed prompt of a request assigned to its tier with its escrow key and dispatches it to a worker that serves the corresponding model;
2. the worker runs the inference and returns the result asynchronously;
3. the pool seals the result to the requester and broadcasts it inline in the \`AiResponse\`;
4. the pool owns the escrow — it claims after maturity and credits the worker internally.

Since H15 an \`AiResponse\` must also carry the trace commitment computed by the worker, and the pool must publish the \`AiOpening\` for the positions drawn for it, signed with its escrow key (§5.6). The reference Stratum protocol does not carry the trace and the openings; a pool protocol for verifiable inference is not yet available.

Sealing and publishing stay with the pool rather than the worker because private requests are sealed to the pool's escrow key, and it is the pool's escrow that stands behind the response: the answer belongs with whoever carries the risk. Workers never hold escrow keys.

### Pool protocol contract

**Share submission.** A PoM share cannot be verified without its possession proof, so every paid share carries the complete proof:

\`\`\`
mining.submit = [worker, job_id, nonce_hex16, legacy_tag_hex16, cid_or_empty, pom_proof_hex]
\`\`\`

\`pom_proof_hex\` is the hex encoding of the canonical borsh wire form of the \`PomProof\` the node consumes. The pool must forward those exact bytes into \`block.pom_proof\` and set \`header.pom_final_state\` to the proof's \`final_state\` before submitting the block — never re-serialize the structure. Parameters 4 and 5 (\`legacy_tag\`, \`cid\`) are vestiges of the pre-PoM commitment format and carry no consensus meaning; accept them for backward compatibility with existing miners.

A share is valid when the era's PoM pow value of (\`final_state\`, \`pre_pow_hash\`) is at most the share target, and \`final_state\` is only trustworthy once the proof's 256 walk steps have been replayed against the tier's pinned Merkle root and context pad. There is no lighter share format — proving possession on every share is the entire point of PoM. The proof is structurally bounded rather than open-ended: 256 steps, each weight step carrying a 1 KiB tile and its Merkle range proof (context-pad steps carry none), which comes to at most roughly 0.5 MB borsh (~1 MB hex) on the deepest tier. The maximum accepted frame is 2 MB per JSON-RPC line.

Verification is era-exact: seed derivation and the walk transition are DAA-gated. Pools should vendor the node's \`pom\` module rather than reimplement it from prose.

**Inference dispatch.** Results travel on a dedicated \`mining.ai_response\` message rather than being attached to the next share submission.

**Capability declaration.** The coinbase \`ai:cap\` field declares the union of the models the pool's workers actually serve. It has no bearing on the tier reward, which is derived exclusively from the PoM proof, nor on assignment, which follows the proven tier.

### Pool implementation guide

This section provides the concrete technical details required for mining pool operators to integrate the service bond.

**Step 1 — Embed the escrow key and its delegation certificate in coinbase extra_data**

There is no node-level configuration for the escrow key. The pool controls the coinbase \`extra_data\` and must embed the escrow public key and its delegation certificate using the protocol markers:

\`\`\`
extra_data format: /{nonce_hex16}/ai:v1:{tag_hex16}/escrow:{64 hex: 32-byte x-only schnorr pubkey}/esig:{128 hex: 64-byte schnorr signature}
\`\`\`

The certificate is a Schnorr signature by the payout key over \`BLAKE2b("KeryxEscrowDelegationV1" ‖ escrow_pubkey)\`, so the payout address must be a standard Schnorr P2PK. Generate it once, offline, with the CLI's \`delegate-escrow\` command. The \`ai:v1\` tag must match the one derived from the nonce. A missing or invalid escrow key, certificate or tag makes the block invalid.

**Step 2 — Coinbase output structure**

Here is the breakdown for a **5.4 KRX block reward**:

- **75% (4.05 KRX)** — Sent immediately to the payout address. This is the base on which the tier and holder multipliers are applied; whatever they scale away is burned.
- **20% (1.08 KRX)** — Escrow, recovered after maturity. Claiming costs a flat 0.3 KRX per transaction regardless of size, and one claim spends many matured outputs at once, so the effective per-block cost is that fee divided across the batch — about 0.0035 KRX at a batch of 87.
- **5% (0.27 KRX)** — Allocated to R&D (protocol treasury).

Note that the escrow and R&D cuts are computed on the full subsidy: the tier and holder multipliers scale the miner cut alone.

The escrow output locking script is:

\`\`\`
<792000> OP_CSV <escrow_pubkey_32bytes> OP_CHECKSIG
\`\`\`

Note: Keryx's \`OP_CSV\` pops its argument from the stack — no \`OP_DROP\` is needed.

**Step 3 — Track mature escrow outputs**

An escrow output becomes spendable once \`current_daa_score >= utxo.block_daa_score + 792000\` (~22 h; 36,000 before H6). The condition is evaluated on the **DAA score**, not the blue score, and the spending input must carry \`sequence = 792000\`.

\`GetUtxosByAddresses\` cannot serve this purpose: it derives a standard pay-to-address script from the address it is given and therefore never matches the CSV escrow script. Two approaches work instead.

*Live tracking (recommended).* Subscribe to \`VirtualChainChanged\` and fetch each new chain block, scanning its coinbase outputs for the pool's escrow script. **Only chain-block coinbases matter.** Every block's coinbase pays the blues of its own mergeset, but off the selected chain those outputs never enter the UTXO set — tracking escrow from every block seen therefore produces phantom outpoints whose claims can only ever be rejected as orphans.

*Cold-start recovery.* The keryx-api REST endpoint lists escrow outputs for a pubkey:

\`\`\`
GET /api/v1/escrow/{escrow_pubkey_hex}
\`\`\`

This index is advisory and deliberately slightly over-inclusive; the node remains the sole arbiter of whether an output is still unspent.

**Step 4 — Broadcast claim transactions**

A claim transaction spends matured escrow outputs back to any pool address:

\`\`\`
inputs:  N matured escrow UTXOs (each signed with escrow_privkey, sequence = 792000)
output:  pool payout address (total input value minus the flat claim fee)
\`\`\`

Any number of matured outputs may be spent by a single transaction, bounded only by the standard transaction mass limit: compute mass is \`506 + 1118 x inputs\` grams against a 100,000-gram cap, making 88 inputs the hard ceiling. Since the claim fee is flat per transaction rather than per output, batching is the difference between paying that fee once per block found and once per batch. The reference miner waits for full batches of 87 outputs; only its recovery paths ship smaller ones.

### Pool accounting

**Tier-weighted shares.** The cost of a hash does not depend on the tier — the walk is always 256 reads — but the revenue of a block does, since the miner cut is scaled by the tier of the winning proof. A share's expected contribution is therefore proportional to its own tier multiplier (60% / 70% / 80% / 90% / 100%), and shares should be weighted by the tier of the proof they carry rather than counted equally. Counting them equally would have small-tier workers subsidised by large-tier ones.

**Holder multiplier.** The holder ratio is read from the payout SPK, so in a pool it is a single pool-wide revenue factor: the pool's aggregate balance measured against its own windowed production. No per-worker attribution exists at consensus level, so the multiplier is necessarily socialised across all shares, and the pool's treasury policy determines the bracket everyone earns at.

**Escrow crediting.** The 20% escrow is revenue from the same block, merely deferred by the maturity window and one claim transaction. It is neither tier- nor ratio-scaled, so its amount is exactly 20% of the blue's subsidy, but it stays exposed to service burns until it unlocks: credit it at claim time.

**Inference rewards.** The \`inference_reward\` is minted by a later chain block's coinbase to the payout address of the responder drawn among those credited for the request whose audits passed. Distribution is not dictated by the protocol, but it should follow the GPU that did the work rather than be spread across a share window.

---

*Keryx is open source (MIT License). Source code: github.com/Keryx-Labs*
`;
