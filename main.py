import os
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
import ollama
import json
import chromadb
import random
from engine.intent_router import classify_intent
from engine.session_manager import save_session, load_session, list_sessions
from engine.evaluator import evaluate_session

# Load secure environment configurations
load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
TYPHOON_API_KEY = os.getenv("TYPHOON_API_KEY")

app = FastAPI(title="AI Patient Simulator API")

# Initialize Ollama client globally for better performance and reliability
ollama_client = ollama.AsyncClient(host='http://127.0.0.1:11434')

# --- 1. Database Connection ---
print("กำลังเชื่อมต่อกับ medical_db...")
try:
    db_client = chromadb.PersistentClient(path="./data/medical_db")
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

class CaseCreateRequest(BaseModel):
    id: str
    scenario_name: str
    chief_complaint: str
    category: str
    hidden_record: dict

class AuthRequest(BaseModel):
    role: str
    passcode: str

def get_random_case():
    if not all_cases or not all_cases['ids']:
        return {
            "chief_complaint": "ปวดท้องมาก",
            "scenario_name": "Appendicitis (ไส้ติ่งอักเสบเฉียบพลัน)",
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

def get_case_by_id(case_id: str):
    if not all_cases or not all_cases['ids']:
        return get_random_case()
    try:
        idx = all_cases['ids'].index(case_id)
        metadata = all_cases['metadatas'][idx]
        try:
            hidden_record = json.loads(metadata['hidden_record'])
        except:
            hidden_record = {}
        return {
            "chief_complaint": all_cases['documents'][idx],
            "scenario_name": metadata.get('scenario_name', 'Unknown Case'),
            "hidden_record": hidden_record
        }
    except Exception as e:
        print(f"Error fetching case {case_id}: {e}")
        return get_random_case()

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

@app.get("/admin")
async def get_admin():
    with open("admin.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read(), status_code=200)

@app.get("/patient-simulator-widget.js")
async def get_widget_js():
    with open("patient-simulator-widget.js", "r", encoding="utf-8") as f:
        return Response(content=f.read(), media_type="application/javascript")

@app.post("/api/auth")
async def authenticate_user(auth_req: AuthRequest):
    role = auth_req.role
    passcode = auth_req.passcode
    
    if role == "student" and passcode == "student123":
        return {"status": "success", "token": "student_verified_token_xyz"}
    elif role == "admin" and passcode == "admin123":
        return {"status": "success", "token": "admin_verified_token_xyz"}
    else:
        return {"status": "error", "message": "รหัสผ่านสำหรับสิทธิ์ใช้งานไม่ถูกต้อง!"}

@app.post("/api/cases")
async def create_case(case_data: CaseCreateRequest):
    global all_cases
    try:
        if collection is None:
            return {"status": "error", "message": "Database not initialized"}
        
        # ChromaDB metadata values must be strings, ints, or floats.
        hidden_record_str = json.dumps(case_data.hidden_record, ensure_ascii=False)
        metadata = {
            "scenario_name": case_data.scenario_name,
            "category": case_data.category,
            "hidden_record": hidden_record_str
        }
        
        collection.upsert(
            documents=[case_data.chief_complaint],
            metadatas=[metadata],
            ids=[case_data.id]
        )
        
        # Reload global cache
        all_cases = collection.get()
        return {"status": "success", "message": f"Case {case_data.id} saved successfully."}
    except Exception as e:
        print(f"Error saving case: {e}")
        return {"status": "error", "message": str(e)}

@app.delete("/api/cases/{case_id}")
async def delete_case(case_id: str):
    global all_cases
    try:
        if collection is None:
            return {"status": "error", "message": "Database not initialized"}
            
        collection.delete(ids=[case_id])
        
        # Reload global cache
        all_cases = collection.get()
        return {"status": "success", "message": f"Case {case_id} deleted successfully."}
    except Exception as e:
        print(f"Error deleting case: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/sessions")
async def get_sessions():
    try:
        session_ids = list_sessions()
        sessions_list = []
        for s_id in session_ids:
            data = load_session(s_id)
            if data:
                history = data.get('history', [])
                user_turns = len([msg for msg in history if msg.get('role') == 'user'])
                
                eval_data = data.get('evaluation', {})
                score = eval_data.get('total_score') if isinstance(eval_data, dict) else None
                
                sessions_list.append({
                    "session_id": s_id,
                    "created_at": data.get('created_at', ''),
                    "updated_at": data.get('updated_at', ''),
                    "scenario_name": data.get('case_data', {}).get('scenario_name', 'Unknown'),
                    "turns": user_turns,
                    "status": data.get('status', 'active'),
                    "score": score
                })
        sessions_list.sort(key=lambda x: x.get('updated_at', ''), reverse=True)
        return sessions_list
    except Exception as e:
        print(f"Error listing sessions: {e}")
        return []

@app.get("/api/sessions/{session_id}")
async def get_session_detail(session_id: str):
    data = load_session(session_id)
    if not data:
        return {"status": "error", "message": "Session not found"}
    return data

@app.get("/api/cases")
async def list_cases():
    """Lists all syndrome cases loaded in local database grouped by category."""
    if not all_cases or not all_cases['ids']:
        return [{
            "id": "fallback_appendicitis",
            "chief_complaint": "ปวดท้องมาก",
            "scenario_name": "Appendicitis (ไส้ติ่งอักเสบ)",
            "category": "ศัลยกรรม (Surgery)"
        }]
    
    cases_list = []
    for idx in range(len(all_cases['ids'])):
        metadata = all_cases['metadatas'][idx]
        
        # Determine category / grouping tags dynamically
        category = metadata.get('category') or metadata.get('group')
        if not category:
            scenario = metadata.get('scenario_name', '').lower()
            if 'เลิก' in scenario or 'บุหรี่' in scenario or 'สุรา' in scenario:
                category = "การให้คำปรึกษา (Counseling)"
            elif 'ปวด' in scenario or 'ท้อง' in scenario:
                category = "อาการปวดท้อง (Abdominal Pain)"
            else:
                category = "เคสทั่วไป (General Medicine)"
                
        cases_list.append({
            "id": all_cases['ids'][idx],
            "chief_complaint": all_cases['documents'][idx],
            "scenario_name": metadata.get('scenario_name', 'อาการจำลอง'),
            "category": category
        })
    return cases_list

@app.websocket("/ws/chat")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    try:
        while True:
            data = await websocket.receive_text()
            request_data = json.loads(data)
            session_id = request_data.get("session_id")
            student_text = request_data.get("student_text")
            client_config = request_data.get("config", {})
            
            if not session_id or not student_text:
                continue

            if session_id not in chat_sessions:
                # Retrieve selected case ID parameter if sent by Selective Mode
                selected_case_id = request_data.get("case_id")
                if selected_case_id:
                    case_data = get_case_by_id(selected_case_id)
                else:
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
            
            # --- Type Guard Hardening ---
            # Coerces list/dict hallucinations returned by local DeepSeek back to clear string keys
            if isinstance(intent, list):
                intent = intent[0] if (intent and isinstance(intent[0], str)) else "other"
            elif isinstance(intent, dict):
                intent = intent.get("category") or intent.get("response") or "other"
                if not isinstance(intent, str):
                    intent = "other"
            elif not isinstance(intent, str):
                intent = "other"
            
            hidden_record = session_data['case_data']['hidden_record']
            if intent in hidden_record:
                session_data['revealed_info'][intent] = hidden_record[intent]

            # Construct patient prompt
            system_prompt = construct_patient_prompt(session_data['case_data'], session_data['revealed_info'])
            
            # Override custom prompt templates if supplied by client (GGUF customization)
            custom_template = client_config.get("system_prompt_custom")
            if custom_template:
                # Replace the revealed history key
                revealed_text = "\n".join([f"- {k}: {v}" for k, v in session_data['revealed_info'].items()])
                if not revealed_text:
                    revealed_text = "(ยังไม่มีข้อมูลที่เปิดเผย)"
                system_prompt = custom_template.replace("{revealed_info}", revealed_text)

            # --- PAD Emotional Prompt Compiler (Phase 3) ---
            # Dynamically parses Pleasure, Arousal, Dominance coordinates to inject Thai speech controls
            emotions = client_config.get("emotions", {})
            pad = emotions.get("pad", {})
            if pad:
                p = float(pad.get("p", 0.0))
                a = float(pad.get("a", 0.0))
                d = float(pad.get("d", 0.0))
                
                directives = []
                # Arousal (Energy, speed, stress levels)
                if a > 0.4:
                    directives.append("คุณกังวลและตื่นตระหนกสูงมาก พูดจาสั่นเครือ ใช้ประโยคสั้นๆ พูดเร็วปนหอบ ร้องขอการรับประกันหรือบ่นกลัว")
                elif a < -0.4:
                    directives.append("คุณเหนื่อยล้าอย่างรุนแรง พูดช้ามาก ลากเสียงยาว หรือทิ้งระยะเวลาตอบ นิ่งเงียบ และบอกปัดว่าไม่มีแรงบ่อยๆ")

                # Pleasure (Pain, distress, well-being)
                if p < -0.3:
                    directives.append("บ่นว่าปวดหรือทรมานทางร่างกายอย่างมาก สอดแทรกคำแสดงความปวดถี่ๆ (เช่น โอ๊ย... เจ็บเหลือเกินครับ/ค่ะ, ไม่ไหวแล้ว)")
                elif p > 0.4:
                    directives.append("คุณรู้สึกสงบ ปลอดภัย และอารมณ์ดี ให้ความร่วมมือค่อนข้างสุภาพเรียบร้อย")

                # Dominance (Posture, confidence, defiance)
                if d < -0.3:
                    directives.append("รู้สึกอ่อนแอช่วยเหลือตัวเองไม่ได้อย่างมาก มีความอ่อนน้อมและร้องขอวิงวอนแพทย์ช่วยชีวิต")
                elif d > 0.4:
                    if p < 0.0:
                        directives.append("คุณมีอารมณ์โฉบเฉี่ยว โกรธและไม่พอใจแพทย์อย่างยิ่ง ห้วน กระด้าง ไร้หางเสียง แสดงท่าทีต่อต้านและบ่นการบริการ")
                    else:
                        directives.append("คุณเชื่อมั่นในตัวเองสูง พร้อมสอบถามกลับถึงความรู้แพทย์อย่างตรงไปตรงมา")

                if directives:
                    directives_str = "\n".join([f"- {text}" for text in directives])
                    system_prompt += f"\n\n[ข้อบังคับทางอารมณ์และพฤติกรรมในขณะนี้]\n{directives_str}"

            messages_to_send = [{'role': 'system', 'content': system_prompt}]
            
            # --- Sliding Context Window (Pruning active chat history) ---
            # To keep local notebook execution extremely snappy, we limit the active context 
            # to the last 6 messages (3 turns), but keep preserving full history for final evaluations.
            active_history = session_data['history'][-6:] if len(session_data['history']) > 6 else session_data['history']
            messages_to_send.extend(active_history)
            messages_to_send.append({'role': 'user', 'content': student_text})
            
            session_data['history'].append({'role': 'user', 'content': student_text})
            
            # Retrieve GGUF custom model & parameters
            selected_model = client_config.get("model", "llama3.1:latest")
            temperature = float(client_config.get("temperature", 0.7))
            
            # --- Multi-Tier API Routing (Free vs. Paid) ---
            api_tier = client_config.get("api_tier") or client_config.get("apiTier") or "free"
            
            if api_tier == "paid":
                # Determine which Cloud provider key is active
                has_typhoon = TYPHOON_API_KEY and TYPHOON_API_KEY != "your_typhoon_api_key_here"
                has_openai = OPENAI_API_KEY and OPENAI_API_KEY != "your_openai_api_key_here"
                
                if not has_typhoon and not has_openai:
                    err_msg = "🤕 (ระบบคลาวด์ขัดข้อง: ไม่พบการตั้งค่า TYPHOON_API_KEY หรือ OPENAI_API_KEY ในไฟล์ .env ของเซิร์ฟเวอร์ กรุณาตรวจสอบ)"
                    await websocket.send_text(err_msg)
                    session_data['history'].append({'role': 'assistant', 'content': err_msg})
                else:
                    try:
                        import httpx
                        
                        if has_typhoon:
                            # Route to Opentyphoon API
                            url = "https://api.opentyphoon.ai/v1/chat/completions"
                            headers = {
                                "Authorization": f"Bearer {TYPHOON_API_KEY}",
                                "Content-Type": "application/json"
                            }
                            payload = {
                                "model": "typhoon-v1.5-instruct", # Optimized high-intelligence Thai model
                                "messages": messages_to_send,
                                "temperature": temperature,
                                "stream": True
                            }
                            provider_name = "Typhoon"
                        else:
                            # Route to OpenAI API
                            url = "https://api.openai.com/v1/chat/completions"
                            headers = {
                                "Authorization": f"Bearer {OPENAI_API_KEY}",
                                "Content-Type": "application/json"
                            }
                            payload = {
                                "model": "gpt-4o-mini",
                                "messages": messages_to_send,
                                "temperature": temperature,
                                "stream": True
                            }
                            provider_name = "OpenAI"
                            
                        async with httpx.AsyncClient() as client:
                            async with client.stream("POST", url, headers=headers, json=payload, timeout=30.0) as response:
                                if response.status_code != 200:
                                    resp_content = await response.aread()
                                    raise Exception(f"{provider_name} API status {response.status_code}: {resp_content.decode(errors='ignore')}")
                                    
                                full_reply = ""
                                async for line in response.aiter_lines():
                                    if line.startswith("data: "):
                                        data_str = line[6:].strip()
                                        if data_str == "[DONE]":
                                            break
                                        try:
                                            chunk_json = json.loads(data_str)
                                            delta = chunk_json['choices'][0]['delta']
                                            if 'content' in delta:
                                                text = delta['content']
                                                full_reply += text
                                                await websocket.send_text(text)
                                        except Exception:
                                            continue
                                            
                                session_data['history'].append({'role': 'assistant', 'content': full_reply})
                    except Exception as cloud_err:
                        print(f"Cloud API execution error: {cloud_err}")
                        err_msg = f"🤕 (ระบบคลาวด์ขัดข้อง: ไม่สามารถเชื่อมต่อกับบริการ AI คลาวด์ได้: {cloud_err})"
                        await websocket.send_text(err_msg)
                        session_data['history'].append({'role': 'assistant', 'content': err_msg})
            else:
                # Free Plan: Ollama local execution
                try:
                    response = await ollama_client.chat(
                        model=selected_model,
                        messages=messages_to_send,
                        stream=True,
                        options={
                            'temperature': temperature
                        }
                    )
                    
                    full_reply = ""
                    async for chunk in response:
                        text = chunk['message']['content']
                        full_reply += text
                        await websocket.send_text(text)
                        
                    session_data['history'].append({'role': 'assistant', 'content': full_reply})
                except Exception as ollama_err:
                    print(f"Ollama execution error: {ollama_err}")
                    err_msg = f"🤕 (ระบบท้องถิ่นขัดข้อง: ไม่สามารถประมวลผลโมเดล {selected_model} ได้ กรุณาตรวจสอบการตั้งค่า Ollama)"
                    await websocket.send_text(err_msg)
                    session_data['history'].append({'role': 'assistant', 'content': err_msg})
            
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