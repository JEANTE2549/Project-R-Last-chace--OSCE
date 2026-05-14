from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import ollama
import json
import chromadb
import random
from engine.intent_router import classify_intent
from engine.session_manager import save_session, load_session
from engine.evaluator import evaluate_session

app = FastAPI(title="AI Patient Simulator API")

# Initialize Ollama client globally for better performance and reliability
ollama_client = ollama.AsyncClient(host='http://127.0.0.1:11434')

# --- 1. Database Connection ---
print("กำลังเชื่อมต่อกับ medical_db...")
try:
    db_client = chromadb.PersistentClient(path="./medical_db")
    collection = db_client.get_collection("sor_ror_wor_cases")
    all_cases = collection.get()
    print(f"โหลดข้อมูลสำเร็จ {len(all_cases['ids'])} เคส")
except Exception as e:
    print(f"ข้อผิดพลาดในการโหลด ChromaDB: {e}")
    all_cases = None

# --- 2. State Management ---
chat_sessions = {}

class ChatRequest(BaseModel):
    session_id: str
    student_text: str

def get_random_case():
    if not all_cases or not all_cases['ids']:
        return {
            "chief_complaint": "ปวดท้องมาก",
            "scenario_name": "Appendicitis",
            "hidden_record": {
                "symptom_detail": "ปวดตื้อๆ รอบสะดือ ย้ายมาปวดจี๊ดๆ ที่ท้องน้อยด้านขวา",
                "severity": "ปานกลางถึงมาก",
                "onset": "เริ่มเป็นเมื่อ 12 ชั่วโมงที่แล้ว",
                "associated_symptoms": "คลื่นไส้ อาเจียนไป 1 ครั้งเมื่อเช้า"
            }
        }
    
    idx = random.randint(0, len(all_cases['ids']) - 1)
    metadata = all_cases['metadatas'][idx]
    
    try:
        hidden_record = json.loads(metadata['hidden_record'])
    except:
        hidden_record = {}

    return {
        "chief_complaint": all_cases['documents'][idx],
        "scenario_name": metadata.get('scenario_name', ''),
        "hidden_record": hidden_record
    }

def construct_patient_prompt(case_data, revealed_info):
    revealed_text = "\n".join([f"- {k}: {v}" for k, v in revealed_info.items()])
    if not revealed_text:
        revealed_text = "(ยังไม่มีข้อมูลที่เปิดเผย)"

    prompt = f"""คุณคือคนไข้สมมติ อาการสำคัญ (Chief Complaint): {case_data['chief_complaint']}

ข้อมูลที่คุณ "จำได้" และสามารถตอบนักศึกษาได้ในขณะนี้:
{revealed_text}

กฎเหล็ก:
1. ให้ตอบสั้นๆ เหมือนคนป่วย มีความกังวล ใช้ภาษาไทยแบบคนทั่วไป
2. **ห้าม** บอกข้อมูลประวัติอื่นๆ ที่ไม่อยู่ในรายการ "ข้อมูลที่จำได้" ข้างต้นเด็ดขาด
3. หากนักศึกษาถามถึงสิ่งที่ไม่ได้อยู่ในรายการข้างต้น ให้ตอบแบบเลี่ยงๆ หรือบอกว่า "จำไม่ได้" หรือ "ไม่แน่ใจ"
4. ห้ามพูดชื่อโรค ({case_data['scenario_name']}) ออกมาเด็ดขาด
5. ตอบทีละคำถาม ไม่ต้องร่ายยาวรวบยอด"""
    return prompt

# --- 3. API Endpoints ---
@app.get("/")
async def get_index():
    with open("index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), status_code=200)

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            request_data = json.loads(data)
            session_id = request_data.get("session_id")
            student_text = request_data.get("student_text")
            
            if not session_id or not student_text:
                continue

            if session_id not in chat_sessions:
                case_data = get_random_case()
                chat_sessions[session_id] = {
                    'session_id': session_id,
                    'history': [],
                    'case_data': case_data,
                    'revealed_info': {},
                    'status': 'active'
                }
                save_session(session_id, chat_sessions[session_id])
                
            session_data = chat_sessions[session_id]
            
            # Check for termination signal
            if student_text == "__END_SESSION__":
                session_data['status'] = 'completed'
                save_session(session_id, session_data)
                await websocket.send_text("Session saved. You can now close this simulation.")
                await websocket.send_text("__END__")
                continue

            # --- Phase 2: Intent-Gated RAG Logic ---
            intent = await classify_intent(student_text)
            print(f"Detected Intent: {intent}")
            
            hidden_record = session_data['case_data']['hidden_record']
            if intent in hidden_record:
                session_data['revealed_info'][intent] = hidden_record[intent]

            system_prompt = construct_patient_prompt(session_data['case_data'], session_data['revealed_info'])
            
            messages_to_send = [{'role': 'system', 'content': system_prompt}]
            messages_to_send.extend(session_data['history'])
            messages_to_send.append({'role': 'user', 'content': student_text})
            
            session_data['history'].append({'role': 'user', 'content': student_text})
            
            response = await ollama_client.chat(model='llama3.1:latest', messages=messages_to_send, stream=True)
            
            full_reply = ""
            async for chunk in response:
                text = chunk['message']['content']
                full_reply += text
                await websocket.send_text(text)
                
            session_data['history'].append({'role': 'assistant', 'content': full_reply})
            
            # Auto-save after response
            save_session(session_id, session_data)
            await websocket.send_text("__END__")

    except WebSocketDisconnect:
        print(f"Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

@app.get("/api/evaluate/{session_id}")
async def get_evaluation(session_id: str):
    session_data = load_session(session_id)
    if not session_data:
        return {"error": "Session not found"}
    
    # If already evaluated, return it
    if 'evaluation' in session_data:
        return session_data['evaluation']
    
    # Run evaluation
    result = await evaluate_session(session_data)
    if result:
        session_data['evaluation'] = result
        save_session(session_id, session_data)
        return result
    
    return {"error": "Evaluation failed"}