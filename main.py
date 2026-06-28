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
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:latest")

from sqlalchemy import create_engine, Column, String, Integer, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime

DATABASE_URL = "sqlite:///./data/osce_platform.db"
os.makedirs("./data", exist_ok=True)
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# --- SQLite Relational Models ---
class DB_Case(Base):
    __tablename__ = "cases"
    id = Column(String, primary_key=True, index=True)
    scenario_name = Column(String)
    chief_complaint = Column(Text)
    category = Column(String)
    hidden_record = Column(Text) # JSON serialized string

class DB_Session(Base):
    __tablename__ = "sessions"
    session_id = Column(String, primary_key=True, index=True)
    student_id = Column(String, index=True)
    student_name = Column(String)
    scenario_name = Column(String)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
    turns = Column(Integer, default=0)
    status = Column(String, default="active")
    score = Column(Integer)
    evaluation_json = Column(Text) # JSON serialized feedback

class DB_Dialogue(Base):
    __tablename__ = "dialogues"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    session_id = Column(String, index=True)
    role = Column(String) # "user" or "assistant"
    content = Column(Text)
    created_at = Column(DateTime)

class DB_QuotaUsage(Base):
    __tablename__ = "quota_usage"
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    student_id = Column(String, index=True)
    date_str = Column(String, index=True) # YYYY-MM-DD
    count = Column(Integer, default=0)

Base.metadata.create_all(bind=engine)

from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="AI Patient Simulator API")

# Enable CORS for external client applications (e.g., hosted on GitHub Pages)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/images", StaticFiles(directory="images"), name="images")

# Initialize Ollama client globally for better performance and reliability
ollama_client = ollama.AsyncClient(host=OLLAMA_HOST)

# --- 1. Database Connection ---
print("กำลังเชื่อมต่อกับ medical_db (ChromaDB)...")
try:
    db_client = chromadb.PersistentClient(path="./data/medical_db")
    collection = db_client.get_collection("sor_ror_wor_cases")
    all_cases = collection.get()
    print(f"โหลดข้อมูลจาก ChromaDB สำเร็จ {len(all_cases['ids'])} เคส")
except Exception as e:
    print(f"ข้อผิดพลาดในการโหลด ChromaDB: {e}")
    all_cases = None

# Auto-seed SQLite Database from ChromaDB
def seed_sqlite_database():
    db = SessionLocal()
    try:
        if db.query(DB_Case).count() == 0 and all_cases and all_cases['ids']:
            print("⏳ กำลังย้ายข้อมูลเคสจาก ChromaDB ลง SQLite (Production Grade Migration)...")
            for idx in range(len(all_cases['ids'])):
                case_id = all_cases['ids'][idx]
                chief_complaint = all_cases['documents'][idx]
                metadata = all_cases['metadatas'][idx]
                
                category = metadata.get('category') or metadata.get('group') or "เคสทั่วไป (General Medicine)"
                scenario_name = metadata.get('scenario_name', 'Unknown')
                hidden_record = metadata.get('hidden_record', '{}')
                
                db_case = DB_Case(
                    id=case_id,
                    scenario_name=scenario_name,
                    chief_complaint=chief_complaint,
                    category=category,
                    hidden_record=hidden_record
                )
                db.add(db_case)
            db.commit()
            print("✅ ย้ายข้อมูลเคสลง SQLite สำเร็จ!")
    except Exception as e:
        print(f"เกิดข้อผิดพลาดในการย้ายข้อมูลเคส: {e}")
    finally:
        db.close()

seed_sqlite_database()

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
            "id": case_id,
            "chief_complaint": all_cases['documents'][idx],
            "scenario_name": metadata.get('scenario_name', 'Unknown Case'),
            "hidden_record": hidden_record
        }
    except Exception as e:
        print(f"Error fetching case {case_id}: {e}")
        return get_random_case()

def determine_case_gender(case_data) -> str:
    # 1. Look in hidden_record for 'gender'
    hidden_record = case_data.get('hidden_record', {})
    if 'gender' in hidden_record and hidden_record['gender']:
        return str(hidden_record['gender']).strip().lower()
    
    # 2. Look in chief_complaint or scenario_name for gendered keywords
    text = (case_data.get('chief_complaint', '') + ' ' + case_data.get('scenario_name', '')).lower()
    if any(k in text for k in ["หญิง", "ครรภ์", "ท้อง", "คลอด", "มดลูก", "รังไข่", "น.ส.", "นาง"]):
        return "female"
    if any(k in text for k in ["ชาย", "ต่อมลูกหมาก", "นาย", "ด.ช."]):
        return "male"
        
    # 3. Deterministic fallback using hash of scenario_name or chief_complaint
    fallback_seed = str(case_data.get('scenario_name', '')) or str(case_data.get('chief_complaint', '')) or "default_case"
    case_hash = sum(ord(c) for c in fallback_seed)
    return "female" if case_hash % 2 == 0 else "male"

def construct_patient_prompt(case_data, revealed_info, pad=None):
    revealed_text = "\n".join([f"- {k}: {v}" for k, v in revealed_info.items()])
    if not revealed_text:
        revealed_text = "(ยังไม่มีข้อมูลที่เปิดเผย)"

    gender = determine_case_gender(case_data)
    
    # Base gender directives
    gender_directives = ""
    if gender == "female":
        gender_directives = "คุณเป็นเพศหญิง แทนตัวเองว่า 'ฉัน' หรือ 'หนู' (ห้ามหลุดแทนตัวเองด้วยคำของผู้ชาย เช่น ครับ/ผม)"
    elif gender == "male":
        gender_directives = "คุณเป็นเพศชาย แทนตัวเองว่า 'ผม' (ห้ามหลุดแทนตัวเองด้วยคำของผู้หญิง เช่น ค่ะ/คะ)"
    elif gender == "elderly_female":
        gender_directives = "คุณเป็นหญิงสูงอายุ แทนตัวเองว่า 'ยาย' หรือ 'ป้า' (ห้ามหลุดแทนตัวเองด้วยคำของผู้ชาย เช่น ครับ/ผม)"
    elif gender == "elderly_male":
        gender_directives = "คุณเป็นชายสูงอายุ แทนตัวเองว่า 'ตา' หรือ 'ลุง' (ห้ามหลุดแทนตัวเองด้วยคำของผู้หญิง เช่น ค่ะ/คะ)"
    else:
        gender_directives = "คุณเป็นเพศหญิง แทนตัวเองว่า 'ฉัน' หรือ 'หนู' (ห้ามหลุดแทนตัวเองด้วยคำของผู้ชาย เช่น ครับ/ผม)"
        
    # Adaptive politeness logic based on PAD
    politeness_directives = ""
    if pad:
        p = float(pad.get("p", 0.0))
        a = float(pad.get("a", 0.0))
        d = float(pad.get("d", 0.0))
        
        # Severe pain (Pleasure < -0.3) or Combative Anger (Arousal > 0.4 and Dominance > 0.4)
        if p < -0.3 or (a > 0.4 and d > 0.4):
            if p < -0.3:
                politeness_directives = "คุณกำลังเจ็บปวดทางร่างกายอย่างรุนแรง ทรมานมาก ไม่จำเป็นต้องสุภาพ ให้ตัดคำลงท้ายสุภาพออกทั้งหมด (ไม่ต้องใช้คำว่า 'ค่ะ', 'คะ' หรือ 'ครับ') พูดสั้นห้วนปนเสียงร้องแสดงความเจ็บปวด"
            else:
                politeness_directives = "คุณกำลังรู้สึกโกรธ ขัดเคืองใจ หรือไม่พอใจมาก ไม่จำเป็นต้องสุภาพ ให้ละเว้นหรือตัดคำลงท้ายสุภาพออกทั้งหมด (ไม่ต้องใช้คำว่า 'ค่ะ', 'คะ' หรือ 'ครับ') ตอบห้วนกระด้าง ไร้หางเสียง แสดงความไม่พอใจอย่างชัดเจน"
        else:
            # Polite baseline
            if gender in ["female", "elderly_female"]:
                politeness_directives = "คุณมีอารมณ์สุภาพ/ปกติ ให้พูดลงท้ายสุภาพด้วยคำว่า 'ค่ะ/คะ' เสมอ"
            else:
                politeness_directives = "คุณมีอารมณ์สุภาพ/ปกติ ให้พูดลงท้ายสุภาพด้วยคำว่า 'ครับ' เสมอ"
    else:
        # Default fallback to polite based on gender
        if gender in ["female", "elderly_female"]:
            politeness_directives = "ให้พูดลงท้ายสุภาพด้วยคำว่า 'ค่ะ/คะ' เสมอ"
        else:
            politeness_directives = "ให้พูดลงท้ายสุภาพด้วยคำว่า 'ครับ' เสมอ"

    prompt = f"""คุณคือคนไข้สมมติ อาการสำคัญ (Chief Complaint): {case_data['chief_complaint']}

ข้อมูลอัตลักษณ์บุคคลของคุณ:
- {gender_directives}
- {politeness_directives}

ข้อมูลที่คุณ "จำได้" และสามารถตอบนักศึกษาได้ในขณะนี้:
{revealed_text}

กฎเหล็ก:
1. ให้ตอบสั้นๆ เหมือนคนป่วย มีความกังวล ใช้ภาษาไทยแบบคนทั่วไป
2. **ห้าม** บอกข้อมูลประวัติอื่นๆ ที่ไม่อยู่ในรายการ "ข้อมูลที่จำได้" ข้างต้นเด็ดขาด
3. หากนักศึกษาถามถึงสิ่งที่ไม่ได้อยู่ในรายการข้างต้น ให้ตอบแบบเลี่ยงๆ หรือบอกว่า "จำไม่ได้" หรือ "ไม่แน่ใจ"
4. ห้ามพูดชื่อโรค ({case_data['scenario_name']}) ออกมาเด็ดขาด
5. ตอบทีละคำถาม ไม่ต้องร่ายยาวรวบยอด"""
    return prompt

# --- SQLite Helper Utilities ---
def save_session_to_sqlite(session_data: dict):
    db = SessionLocal()
    try:
        session_id = session_data['session_id']
        case_data = session_data.get('case_data', {})
        
        db_sess = db.query(DB_Session).filter(DB_Session.session_id == session_id).first()
        if not db_sess:
            db_sess = DB_Session(session_id=session_id)
            db.add(db_sess)
            
        db_sess.student_id = session_data.get('student_id') or "guest_student"
        db_sess.student_name = session_data.get('student_name') or "Guest Student"
        db_sess.scenario_name = case_data.get('scenario_name') or "สุ่มเคส"
        db_sess.status = session_data.get('status') or "active"
        
        created_str = session_data.get('created_at')
        if created_str:
            try:
                db_sess.created_at = datetime.fromisoformat(created_str)
            except:
                db_sess.created_at = datetime.now()
        else:
            db_sess.created_at = datetime.now()
            
        db_sess.updated_at = datetime.now()
        
        history = session_data.get('history', [])
        user_turns = len([msg for msg in history if msg.get('role') == 'user'])
        db_sess.turns = user_turns
        
        evaluation = session_data.get('evaluation')
        if evaluation:
            db_sess.score = evaluation.get('overall_score') or evaluation.get('total_score')
            db_sess.evaluation_json = json.dumps(evaluation, ensure_ascii=False)
            
        db.commit()
        
        db.query(DB_Dialogue).filter(DB_Dialogue.session_id == session_id).delete()
        for msg in history:
            db_diag = DB_Dialogue(
                session_id=session_id,
                role=msg.get('role'),
                content=msg.get('content'),
                created_at=datetime.now()
            )
            db.add(db_diag)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error saving session {session_id} to SQLite: {e}")
    finally:
        db.close()

def load_session_from_sqlite(session_id: str):
    db = SessionLocal()
    try:
        db_sess = db.query(DB_Session).filter(DB_Session.session_id == session_id).first()
        if not db_sess:
            return None
            
        db_diags = db.query(DB_Dialogue).filter(DB_Dialogue.session_id == session_id).order_by(DB_Dialogue.id.asc()).all()
        history = [{'role': d.role, 'content': d.content} for d in db_diags]
        
        db_case = db.query(DB_Case).filter(DB_Case.scenario_name == db_sess.scenario_name).first()
        if db_case:
            case_data = {
                "chief_complaint": db_case.chief_complaint,
                "scenario_name": db_case.scenario_name,
                "hidden_record": json.loads(db_case.hidden_record) if db_case.hidden_record else {}
            }
        else:
            case_data = {
                "chief_complaint": "ปวดท้องมาก",
                "scenario_name": db_sess.scenario_name,
                "hidden_record": {}
            }
            
        evaluation = json.loads(db_sess.evaluation_json) if db_sess.evaluation_json else None
        
        session_data = {
            "session_id": db_sess.session_id,
            "student_id": db_sess.student_id,
            "student_name": db_sess.student_name,
            "case_data": case_data,
            "history": history,
            "status": db_sess.status,
            "created_at": db_sess.created_at.isoformat() if db_sess.created_at else None,
            "updated_at": db_sess.updated_at.isoformat() if db_sess.updated_at else None
        }
        
        if evaluation:
            session_data['evaluation'] = evaluation
            
        return session_data
    except Exception as e:
        print(f"Error loading session {session_id} from SQLite: {e}")
        return None
    finally:
        db.close()

def check_and_increment_quota(student_id: str, max_limit: int = 50) -> bool:
    db = SessionLocal()
    try:
        today_str = datetime.now().strftime("%Y-%m-%d")
        usage = db.query(DB_QuotaUsage).filter(
            DB_QuotaUsage.student_id == student_id,
            DB_QuotaUsage.date_str == today_str
        ).first()
        
        if not usage:
            usage = DB_QuotaUsage(student_id=student_id, date_str=today_str, count=0)
            db.add(usage)
            db.commit()
            
        if usage.count >= max_limit:
            return False
            
        usage.count += 1
        db.commit()
        return True
    except Exception as e:
        print(f"Error checking quota for student {student_id}: {e}")
        return True
    finally:
        db.close()

def get_student_quota_usage(student_id: str) -> int:
    db = SessionLocal()
    try:
        today_str = datetime.now().strftime("%Y-%m-%d")
        usage = db.query(DB_QuotaUsage).filter(
            DB_QuotaUsage.student_id == student_id,
            DB_QuotaUsage.date_str == today_str
        ).first()
        return usage.count if usage else 0
    except Exception as e:
        print(f"Error getting usage for student {student_id}: {e}")
        return 0
    finally:
        db.close()

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
        
        db = SessionLocal()
        try:
            db_case = db.query(DB_Case).filter(DB_Case.id == case_data.id).first()
            if not db_case:
                db_case = DB_Case(id=case_data.id)
                db.add(db_case)
            db_case.scenario_name = case_data.scenario_name
            db_case.chief_complaint = case_data.chief_complaint
            db_case.category = case_data.category
            db_case.hidden_record = hidden_record_str
            db.commit()
        except Exception as db_err:
            db.rollback()
            print(f"Error syncing to SQLite DB in create_case: {db_err}")
        finally:
            db.close()
        
        all_cases = collection.get()
        return {"status": "success", "message": f"Case {case_data.id} saved successfully."}
    except Exception as e:
        print(f"Error saving case: {e}")
        return {"status": "error", "message": str(e)}

@app.delete("/api/cases/{case_id}")
async def delete_case(case_id: str):
    global all_cases
    try:
        if collection is not None:
            try:
                collection.delete(ids=[case_id])
            except Exception as e:
                print(f"ChromaDB delete error for case {case_id}: {e}")
                
        db = SessionLocal()
        try:
            db.query(DB_Case).filter(DB_Case.id == case_id).delete()
            db.commit()
        except Exception as db_err:
            db.rollback()
            print(f"SQLite delete error for case {case_id}: {db_err}")
        finally:
            db.close()
            
        all_cases = collection.get()
        return {"status": "success", "message": f"Case {case_id} deleted successfully."}
    except Exception as e:
        print(f"Error deleting case: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/history/{student_id}")
async def get_student_history(student_id: str):
    db = SessionLocal()
    try:
        sessions = db.query(DB_Session).filter(
            DB_Session.student_id == student_id
        ).order_by(DB_Session.updated_at.desc()).all()
        
        history_list = []
        for s in sessions:
            eval_data = json.loads(s.evaluation_json) if s.evaluation_json else None
            history_list.append({
                "session_id": s.session_id,
                "scenario_name": s.scenario_name,
                "turns": s.turns,
                "score": s.score,
                "status": s.status,
                "created_at": s.created_at.isoformat() if s.created_at else '',
                "updated_at": s.updated_at.isoformat() if s.updated_at else '',
                "evaluation": eval_data
            })
        return history_list
    except Exception as e:
        print(f"Error fetching history for {student_id}: {e}")
        return []
    finally:
        db.close()

@app.get("/api/cases")
async def list_cases():
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

            student_id = request_data.get("student_id") or "guest_student"
            student_name = request_data.get("student_name") or "Guest Student"

            if session_id not in chat_sessions:
                loaded_sess = load_session_from_sqlite(session_id)
                if loaded_sess:
                    chat_sessions[session_id] = loaded_sess
                    chat_sessions[session_id]['student_id'] = student_id
                    chat_sessions[session_id]['student_name'] = student_name
                else:
                    selected_case_id = request_data.get("case_id")
                    if selected_case_id:
                        case_data = get_case_by_id(selected_case_id)
                    else:
                        case_data = get_random_case()

                    chat_sessions[session_id] = {
                        'session_id': session_id,
                        'student_id': student_id,
                        'student_name': student_name,
                        'history': [],
                        'case_data': case_data,
                        'revealed_info': {},
                        'status': 'active',
                        'created_at': datetime.now().isoformat()
                    }
                    save_session_to_sqlite(chat_sessions[session_id])
                
            session_data = chat_sessions[session_id]
            
            # Send metadata immediately (gender and cloud daily quota)
            gender = determine_case_gender(session_data['case_data'])
            quota_remaining = max(0, 50 - get_student_quota_usage(student_id))
            await websocket.send_text(json.dumps({
                "type": "metadata",
                "gender": gender,
                "quota_remaining": quota_remaining,
                "quota_limit": 50
            }))
            
            # --- Session-Level Rate Limiter (Max 30 user queries) ---
            user_msg_count = len([msg for msg in session_data['history'] if msg.get('role') == 'user'])
            if user_msg_count >= 30:
                await websocket.send_text("⚠️ (คำเตือน: คุณถึงขีดจำกัดสูงสุด 30 ข้อความแล้ว ระบบจะบันทึกสถานะการสนทนาและปิดการโต้ตอบอัตโนมัติ เพื่อให้เข้าสู่ขั้นตอนประเมิน)")
                await websocket.send_text("__END__")
                continue

            # Calculate warning text if reaching limit
            warning_suffix = ""
            if user_msg_count == 24: # This is the 25th query
                warning_suffix = "\n\n⚠️ (คำเตือน: คุณใช้ข้อความไปแล้ว 25 ข้อความ เหลืออีก 5 ข้อความก่อนถึงขีดจำกัดสูงสุด)"
            elif user_msg_count == 29: # This is the 30th query
                warning_suffix = "\n\n⚠️ (คำเตือน: คุณใช้ข้อความไปแล้ว 30 ข้อความ การสนทนาจะถูกปิดอัตโนมัติหลังจากนี้)"
            
            # Check for termination signal
            if student_text == "__END_SESSION__":
                session_data['status'] = 'completed'
                save_session(session_id, session_data)
                await websocket.send_text("Session saved. You can now close this simulation.")
                await websocket.send_text("__END__")
                continue

            # --- Phase 2: Intent-Gated RAG Logic ---
            intent = await classify_intent(student_text)
            
            # --- Type Guard Hardening ---
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

            # --- PAD Emotional Prompt Compiler (Phase 3) ---
            emotions = client_config.get("emotions", {})
            pad = emotions.get("pad", {})
            system_prompt = construct_patient_prompt(session_data['case_data'], session_data['revealed_info'], pad=pad)
            
            custom_template = client_config.get("system_prompt_custom")
            if custom_template:
                revealed_text = "\n".join([f"- {k}: {v}" for k, v in session_data['revealed_info'].items()])
                if not revealed_text:
                    revealed_text = "(ยังไม่มีการเปิดเผยข้อมูล)"
                system_prompt = custom_template.replace("{revealed_info}", revealed_text)

            if pad:
                p = float(pad.get("p", 0.0))
                a = float(pad.get("a", 0.0))
                d = float(pad.get("d", 0.0))
                directives = []
                if a > 0.4:
                    directives.append("คุณกังวลและตื่นตระหนกสูงมาก พูดจาสั่นเครือ ใช้ประโยคสั้นๆ พูดเร็วปนหอบ ร้องขอการรับประกันหรือบ่นกลัว")
                elif a < -0.4:
                    directives.append("คุณเหนื่อยล้าอย่างรุนแรง พูดช้ามาก ลากเสียงยาว หรือทิ้งระยะเวลาตอบ นิ่งเงียบ และบอกปัดว่าไม่มีแรงบ่อยๆ")
                if p < -0.3:
                    directives.append("บ่นว่าปวดหรือทรมานทางร่างกายอย่างมาก สอดแทรกคำแสดงความปวดถี่ๆ (เช่น โอ๊ย... เจ็บเหลือเกินครับ/ค่ะ, ไม่ไหวแล้ว)")
                elif p > 0.4:
                    directives.append("คุณรู้สึกสงบ ปลอดภัย และอารมณ์ดี ให้ความร่วมมือค่อนข้างสุภาพเรียบร้อย")
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

            # Append student's custom clinical behavioral booster instructions if present
            additional_instructions = client_config.get("additional_instructions")
            if additional_instructions:
                system_prompt += f"\n\n[คำสั่งและพฤติกรรมเสริมคนไข้เพิ่มเติม]:\n- {additional_instructions}"

            messages_to_send = [{'role': 'system', 'content': system_prompt}]
            
            # --- Sliding Context Window (Pruning active chat history) ---
            active_history = session_data['history'][-6:] if len(session_data['history']) > 6 else session_data['history']
            messages_to_send.extend(active_history)
            messages_to_send.append({'role': 'user', 'content': student_text})
            
            session_data['history'].append({'role': 'user', 'content': student_text})
            
            # Retrieve GGUF custom model & parameters
            selected_model = client_config.get("model") or OLLAMA_MODEL
            temperature = float(client_config.get("temperature", 0.7))
            
            # --- Multi-Tier API Routing (Free vs. Paid) ---
            api_tier = client_config.get("api_tier") or client_config.get("apiTier") or "free"
            
            starting_tier = 1 # Paid cloud (Typhoon)
            if api_tier != "paid":
                starting_tier = 3 # Local Ollama 8B
            else:
                has_quota = check_and_increment_quota(student_id, max_limit=50)
                if not has_quota:
                    await websocket.send_text("⚠️ (ระบบคลาวด์ระงับ: โควต้าใช้งาน Typhoon รายวันของคุณเต็มแล้ว (50 ข้อความ/วัน) ระบบจึงปรับเข้าสู่การรันโลคอล Ollama แทนโดยอัตโนมัติ)\n\n")
                    starting_tier = 3

            success = False
            full_reply = ""
            current_tier = starting_tier
            
            while not success and current_tier <= 4:
                try:
                    if current_tier <= 2:
                        # Cloud Tiers
                        has_typhoon = TYPHOON_API_KEY and TYPHOON_API_KEY != "your_typhoon_api_key_here"
                        has_openai = OPENAI_API_KEY and OPENAI_API_KEY != "your_openai_api_key_here"
                        
                        if current_tier == 1 and (has_typhoon or has_openai):
                            provider = "typhoon" if has_typhoon else "openai"
                            url = "https://api.opentyphoon.ai/v1/chat/completions" if provider == "typhoon" else "https://api.openai.com/v1/chat/completions"
                            key = TYPHOON_API_KEY if provider == "typhoon" else OPENAI_API_KEY
                            model = "typhoon-v2.5-30b-a3b-instruct" if provider == "typhoon" else "gpt-4o-mini"
                            
                            import httpx
                            async with httpx.AsyncClient() as client:
                                async with client.stream("POST", url, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"}, json={"model": model, "messages": messages_to_send, "temperature": temperature, "stream": True}, timeout=30.0) as response:
                                    async for line in response.aiter_lines():
                                        if line.startswith("data: "):
                                            data_str = line[6:].strip()
                                            if data_str == "[DONE]": break
                                            chunk = json.loads(data_str)
                                            text = chunk['choices'][0]['delta'].get('content', '')
                                            full_reply += text
                                            await websocket.send_text(text)
                            success = True
                        elif current_tier == 2:
                            # Gemini Tier
                            has_gemini = GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here"
                            if not has_gemini:
                                current_tier += 1
                                continue
                            import httpx
                            async with httpx.AsyncClient() as client:
                                async with client.stream("POST", "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", headers={"Authorization": f"Bearer {GEMINI_API_KEY}", "Content-Type": "application/json"}, json={"model": "gemini-1.5-flash", "messages": messages_to_send, "temperature": temperature, "stream": True}, timeout=30.0) as response:
                                    async for line in response.aiter_lines():
                                        if line.startswith("data: "):
                                            data_str = line[6:].strip()
                                            if data_str == "[DONE]": break
                                            chunk = json.loads(data_str)
                                            text = chunk['choices'][0]['delta'].get('content', '')
                                            full_reply += text
                                            await websocket.send_text(text)
                            success = True
                        else:
                            current_tier += 1
                    else:
                        # Ollama Tiers
                        m = selected_model if current_tier == 3 else os.getenv("OLLAMA_LIGHT_MODEL", "qwen2.5:1.5b")
                        response = await ollama_client.chat(model=m, messages=messages_to_send, stream=True, options={'temperature': temperature})
                        async for chunk in response:
                            text = chunk['message']['content']
                            full_reply += text
                            await websocket.send_text(text)
                        success = True
                except Exception as e:
                    print(f"Tier {current_tier} failed: {e}")
                    current_tier += 1
            
            if not success:
                err_msg = "🤕 (ระบบทั้งหมดขัดข้อง: ไม่สามารถติดต่อทั้งระบบคลาวด์และโลคอล Ollama ได้ในขณะนี้ กรุณาติดต่อผู้ดูแลระบบ)"
                await websocket.send_text(err_msg)
                full_reply = err_msg
            
            if warning_suffix:
                await websocket.send_text(warning_suffix)
                full_reply += warning_suffix
                
            session_data['history'].append({'role': 'assistant', 'content': full_reply})
            save_session_to_sqlite(session_data)
            await websocket.send_text("__END__")

    except WebSocketDisconnect:
        print(f"Client disconnected")
    except Exception as e:
        print(f"WebSocket error: {e}")

@app.get("/api/evaluate/{session_id}")
async def get_evaluation(session_id: str):
    session_data = load_session_from_sqlite(session_id)
    if not session_data:
        return {"error": "Session not found"}
    
    if 'evaluation' in session_data:
        return session_data['evaluation']
    
    result = await evaluate_session(session_data)
    if result:
        session_data['evaluation'] = result
        save_session_to_sqlite(session_data)
        return result
    
    return {"error": "Evaluation failed"}