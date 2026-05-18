# MVP Develop 1.0 Report: AI Patient Simulator (OSCE Edition)

## 1. Project Overview
The **AI Patient Simulator** is an advanced medical education tool designed to help medical students practice history-taking in a realistic, risk-free environment. It utilizes a state-of-the-art multi-agent architecture to simulate patient behavior, enforce information disclosure rules, and provide expert feedback.

**Project Root:** `c:\Users\Jean\Documents\Project R Last chace- OSCE`

## 2. Core Architecture (Event-Driven & Modular)
The system is built with a focus on "Local & Free" resource usage while maintaining high fidelity and low latency.

### A. Backend (FastAPI + WebSockets)
- **Real-time Communication:** Uses WebSockets (`/ws/chat`) for full-duplex, low-latency streaming of patient responses.
- **State Management:** Tracks chat history, case data, and "revealed information" per session using a memory-based dictionary backed by local JSON persistence.

### B. The Intelligence Engine (LLM Stack)
- **Patient Agent (llama3.1:latest):** Simulates the patient persona, providing brief, realistic responses in Thai.
- **Intent Router (deepseek-r1:1.5b):** A lightweight reasoning model that classifies student questions into medical categories (Symptom details, Severity, Onset, etc.) to trigger information release.
- **Judge Agent (llama3.1:latest):** Evaluates the final transcript based on medical communication standards (SEGUE Framework).

### C. Database (ChromaDB Vector Store)
- Stores **84 core medical cases** (ศรว 67 standard).
- **Location:** `./data/medical_db`
- Enables retrieval of case-specific chief complaints and hidden records for simulation startup.

## 3. Key Feature Highlights
- **Intent-Gated RAG:** Information is only disclosed if the student asks the "right" questions. This prevents the AI from "hallucinating" or leaking history prematurely.
- **Asynchronous Evaluation:** After ending a session, an AI-as-a-judge provides a detailed report based on the **SEGUE Framework**, scoring the student from 1-5 stars.
- **Seamless UX:** Integrated Speech-to-Text (STT) and Text-to-Speech (TTS) via the Browser Web Speech API, allowing hands-free interaction.
- **Local Persistence:** Every session is saved to `logs/sessions/{session_id}.json`, preserving data for offline review and performance tracking.

## 4. Technical Specifications
- **Framework:** FastAPI (Python 3.10+)
- **LLM Provider:** Ollama (Local)
- **Vector DB:** ChromaDB
- **Frontend:** Vanilla HTML5 / Modern CSS / Vanilla JS
- **Directory Structure:**
  - `engine/`: Core logic (intent routing, evaluation, session management).
  - `data/`: Databases and raw case data.
  - `logs/`: Session logs and history.
  - `docs/`: Documentation and requirements.
  - `archive_setup_v1/`: Legacy setup scripts and backups.

## 5. Status & Roadmap
- **Current Status:** MVP 1.0 Stable. All core phases (RAG, Persistence, Evaluation) are fully integrated.
- **Future Roadmap (Develop 1.1+):**
  - **Phase 5:** Multi-agent verification (Differential Diagnosis checking).
  - **Phase 6:** Integration with local image processing (Physical Exam findings).
  - **Phase 7:** Web Dashboard for instructors to review multiple student logs.

## 6. Conclusion
MVP 1.0 successfully transitions the project from a simple chatbot to a sophisticated clinical simulation environment. It satisfies the initial requirement for a local, cost-effective, and educational medical simulator that wows users with its responsiveness and depth.

---
*Report Updated on: 2026-05-14*
*Prepared by: Antigravity AI*
