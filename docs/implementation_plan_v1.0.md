# AI Patient Simulator: Implementation Plan (Local & Free Edition)

**Project Root:** `c:\Users\Jean\Documents\Project R Last chace- OSCE`

Based on the strategic constraints defined in `docs/Constraint.md`, this implementation plan prioritizes **low latency, zero-cost local execution, and structural simplicity** over heavy, latency-inducing multi-agent systems and advanced audio processing.

## 1. Gap Analysis & Constraint Mapping

| Target Architecture (PDF) | MVP Adaptation (Local & Free Constraint) |
| :--- | :--- |
| **Multi-Agent Swarm (Patient, Critic, Measurement)** | **[Postponed]** Critic Agent is postponed to avoid latency. We use a single **Patient Agent** with dynamic system prompts. |
| **3-Stage Reasoning RAG** | **[Simplified]** We use **Single-Step RAG / Intent Gating**. We analyze the student's intent and inject only the relevant part of the hidden record into the prompt. |
| **Full-Duplex & Barge-in Audio** | **[Postponed]** Advanced Acoustic Echo Cancellation and Barge-in are postponed. We use **Browser native Web Speech API (STT/TTS)** with optimized WebSocket streaming. |
| **PAD Emotional Model** | **[Simplified]** Complex mathematical tracking is skipped. Behavior is managed via **basic State/Prompt updates**. |
| **Automated Evaluation** | **[Focus]** Shifted to **Asynchronous Evaluation**. The LLM scores the student (SEGUE/Kalamazoo) after the simulation ends. |

---

## 2. Phased Implementation (Status: Completed for MVP 1.0)

### Phase 1: Real-time Communication & Streaming Refactor
- **Objective:** Reduce latency without heavy external audio APIs.
- **Implemented:** 
  - `main.py`: WebSocket (`/ws/chat`) integration.
  - `index.html`: WebSocket client with browser STT/TTS.

### Phase 2: Lightweight Intent-Gated RAG
- **Objective:** Prevent information leakage using classification.
- **Implemented:**
  - `engine/intent_router.py`: Intent classifier using `deepseek-r1:1.5b`.
  - `main.py`: Integration with the intent router for dynamic prompt construction.

### Phase 3: Session Persistence & State Management
- **Objective:** Save conversation logs locally.
- **Implemented:**
  - `engine/session_manager.py`: JSON-based persistence.
  - **Storage Location:** `./logs/sessions/`
  - `index.html`: Session lifecycle controls (Start/End/New Patient).

### Phase 4: Asynchronous Educational Evaluation
- **Objective:** Grade students using LLM-as-a-judge.
- **Implemented:**
  - `engine/evaluator.py`: SEGUE-based scoring.
  - `main.py`: `/api/evaluate/{session_id}` endpoint.
  - `index.html`: Evaluation Dashboard modal.

---

## 3. Current Directory Structure & Alignment

```text
Project R Last chace- OSCE/
├── main.py                 # Core FastAPI Application
├── index.html              # Modern Web UI
├── engine/                 # Intelligence & Logic Layer
│   ├── intent_router.py    # Intent Classification
│   ├── session_manager.py  # Local JSON Persistence
│   └── evaluator.py        # Educational Assessment
├── data/                   # Data Layer
│   └── medical_db/         # ChromaDB Vector Store
├── logs/                   # Persistence Layer
│   └── sessions/           # Saved JSON Transcripts
├── docs/                   # Documentation
│   ├── Constraint.md       # Project Constraints
│   ├── mvp_1_0_report.md   # Current Progress Report
│   └── doc/                # Source Requirements (PDFs)
└── archive_setup_v1/       # Legacy/Backup Files
```

---
*Plan Last Updated: 2026-05-14*
*Prepared by: Antigravity AI*
