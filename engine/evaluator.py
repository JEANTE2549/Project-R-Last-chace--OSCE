import ollama
import json
import os
from dotenv import load_dotenv

load_dotenv()
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")
OLLAMA_EVAL_MODEL = os.getenv("OLLAMA_EVAL_MODEL", "llama3.1")

ollama_client = ollama.AsyncClient(host=OLLAMA_HOST)

EVALUATOR_SYSTEM_PROMPT = """คุณคืออาจารย์แพทย์ผู้เชี่ยวชาญระดับสูงที่เข้มงวดและเที่ยงตรงอย่างยิ่ง ด้านทักษะการสื่อสารแพทย์-คนไข้ (Clinical Communication Skills)
หน้าที่ของคุณคือประเมินการซักประวัติของนักศึกษาแพทย์จากบทสนทนา (Transcript) ที่กำหนดให้ 
โดยใช้เกณฑ์ SEGUE Framework ในการประเมินอย่างเที่ยงตรง และหักคะแนนอย่างจริงจังหากไม่ได้ปฏิบัติจริง

หลักเกณฑ์การหักคะแนนขั้นสูงสุด (1-5 คะแนนต่อหัวข้อ):
1. Set the stage: การทักทาย แนะนำตัว และถามความยินยอมซักประวัติ หากผู้เรียนทักทายเฉยๆ แต่ไม่ได้ระบุชื่อแพทย์ หรือไม่ได้ขออนุญาต ให้หักคะแนนสูงสุดได้ไม่เกิน 2 คะแนน
2. Elicit information: การซักอาการหลัก อาการร่วม ระยะเวลา อาการทุเลา ประวัติยา สัญญาณอันตราย หากถามน้อยกว่า 5 ประโยคเด็ดขาด ให้ได้สูงสุดไม่เกิน 2 คะแนน
3. Give information: การอธิบายสมมติฐานโรค และอธิบายขั้นตอนแผนการตรวจรักษาถัดไป หากไม่ปรากฏชัด ให้ได้ไม่เกิน 1 คะแนน
4. Understand perspective: การตอบสนองด้วยความเห็นอกเห็นใจ (Active Empathy / Validation) เมื่อคนไข้แจ้งอาการเจ็บป่วยหรือกังวล หากไม่มีประโยค Empathy ปรากฏเลย ให้ได้ไม่เกิน 1 คะแนน
5. End the encounter: การสรุปย่อประวัติที่ซักมาได้ให้คนไข้ทบทวน ทวนความเข้าใจ และนัดหมายปิดรอบสอบ หากคนไข้จำยอมจบการรักษาโดยนักศึกษาไม่ได้สรุปทบทวนประวัติ ให้ได้ไม่เกิน 1 คะแนน

คุณต้องส่งคำตอบกลับมาในรูปแบบ JSON วัตถุที่ตรงตามโครงสร้างด้านล่างนี้เท่านั้น ห้ามใช้คีย์อื่นโดยเด็ดขาด:
{
  "scores": {
    "set_the_stage": 0-5,
    "elicit_information": 0-5,
    "give_information": 0-5,
    "understand_perspective": 0-5,
    "end_the_encounter": 0-5
  },
  "feedback": {
    "strengths": ["จุดเด่นข้อที่ 1", "จุดเด่นข้อที่ 2"],
    "weaknesses": ["จุดที่ควรปรับปรุงข้อที่ 1", "จุดที่ควรปรับปรุงข้อที่ 2"],
    "suggestion": "คำแนะนำเพิ่มเติมเพื่อการพัฒนา"
  }
}
ห้ามมีข้อความเกริ่นนำ อธิบายเพิ่มเติม หรือคำปิดท้ายใดๆ นอกเหนือไปจากวัตถุ JSON นี้เท่านั้น
"""

async def evaluate_session(
    session_data: dict,
    suspected_diagnosis: str = None,
    confidence_score: int = None,
    event_timeline: list = None,
    actions: list = None,
    language: str = "th"
):
    try:
        # Count user turns
        history = session_data.get('history', [])
        user_msg_count = len([msg for msg in history if msg.get('role') == 'user'])
        
        # Programmatic cap: 0 turns
        if user_msg_count == 0:
            return {
                "scores": {
                    "set_the_stage": 0,
                    "elicit_information": 0,
                    "give_information": 0,
                    "understand_perspective": 0,
                    "end_the_encounter": 0
                },
                "overall_score": 0.0,
                "feedback": {
                    "strengths": ["ไม่มี (บทสนทนาสั้นเกินไป)" if language != "en" else "None (Conversation too brief)"],
                    "weaknesses": ["ไม่ได้เริ่มต้นการสัมภาษณ์คนไข้จำลอง" if language != "en" else "Failed to start conversation with simulated patient"],
                    "suggestion": "นักศึกษาต้องเริ่มเปิดสนทนากับคนไข้เพื่อเก็บประวัติและฝึกฝนทักษะแพทย์จำลอง" if language != "en" else "Student must open the conversation to elicit case history."
                }
            }

        # Construct transcript text
        transcript = ""
        for msg in session_data['history']:
            role = "นักศึกษา" if msg['role'] == 'user' else "คนไข้"
            transcript += f"{role}: {msg['content']}\n"
        
        case_info = f"Case: {session_data['case_data']['chief_complaint']}\nScenario: {session_data['case_data']['scenario_name']}"
        
        user_prompt = f"--- ข้อมูลเคส ---\n{case_info}\n\n--- บทสนทนา ---\n{transcript}\n\n"
        if language == "en":
            user_prompt += "Please evaluate this student's history taking strictly using the SEGUE framework. You MUST output all text content in the JSON feedback (such as strengths, weaknesses, and suggestion) in English."
        else:
            user_prompt += "กรุณาประเมินผลการซักประวัตินี้อย่างเข้มงวดตามเกณฑ์ SEGUE Framework และให้ข้อมูลวิเคราะห์ป้อนกลับ (strengths, weaknesses, suggestion) ทั้งหมดเป็นภาษาไทยเท่านั้น"

        try:
            response = await ollama_client.chat(
                model=OLLAMA_EVAL_MODEL, # Using configured model for evaluation (default Llama 3.1)
                messages=[
                    {'role': 'system', 'content': EVALUATOR_SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_prompt}
                ],
                format='json'
            )
        except Exception as async_err:
            print(f"Async evaluator chat failed, falling back to sync client: {async_err}")
            sync_client = ollama.Client(host=OLLAMA_HOST)
            response = sync_client.chat(
                model=OLLAMA_EVAL_MODEL,
                messages=[
                    {'role': 'system', 'content': EVALUATOR_SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_prompt}
                ],
                format='json'
            )
        
        content = response['message']['content']
        
        # Extract JSON
        start = content.find('{')
        end = content.rfind('}') + 1
        if start != -1 and end != 0:
            result = json.loads(content[start:end])
            
            if result:
                # Normalize SEGUE keys into nested result["scores"] dictionary
                if "scores" not in result:
                    result["scores"] = {}
                    
                mapping = {
                    "set_the_stage": "set_the_stage",
                    "Set the stage": "set_the_stage",
                    "elicit_information": "elicit_information",
                    "Elicit information": "elicit_information",
                    "give_information": "give_information",
                    "Give information": "give_information",
                    "understand_perspective": "understand_perspective",
                    "Understand perspective": "understand_perspective",
                    "end_the_encounter": "end_the_encounter",
                    "End the encounter": "end_the_encounter"
                }
                
                # Extract and clean root or nested keys
                for k, norm in mapping.items():
                    if k in result:
                        try:
                            result["scores"][norm] = int(result[k])
                        except:
                            result["scores"][norm] = 0
                        del result[k]
                    elif "scores" in result and k in result["scores"]:
                        try:
                            result["scores"][norm] = int(result["scores"][k])
                        except:
                            result["scores"][norm] = 0
                        if k != norm:
                            del result["scores"][k]
                            
                # Ensure all snake_case keys exist
                for norm in ["set_the_stage", "elicit_information", "give_information", "understand_perspective", "end_the_encounter"]:
                    if norm not in result["scores"]:
                        result["scores"][norm] = 0
                        
                # Normalize feedback structure and prevent empty elements
                if "feedback" not in result:
                    result["feedback"] = {}
                
                # Retrieve any root-level feedback keys
                root_feedback = {}
                for fk in ["strengths", "weaknesses", "suggestion", "Strengths", "Weaknesses", "Suggestion", "จุดเด่น", "จุดที่ควรพัฒนา", "คำแนะนำเพิ่มเติม"]:
                    if fk in result:
                        val = result[fk]
                        norm_k = fk.lower()
                        if norm_k == "จุดเด่น": norm_k = "strengths"
                        elif norm_k == "จุดที่ควรพัฒนา": norm_k = "weaknesses"
                        elif norm_k == "คำแนะนำเพิ่มเติม": norm_k = "suggestion"
                        root_feedback[norm_k] = val
                        del result[fk]
                        
                for f_key in ["strengths", "weaknesses", "suggestion"]:
                    if f_key in root_feedback:
                        result["feedback"][f_key] = root_feedback[f_key]
                    elif "feedback" in result and f_key in result["feedback"]:
                        pass
                    else:
                        result["feedback"][f_key] = [] if f_key != "suggestion" else ""
                
                # Validate types
                if not isinstance(result["feedback"]["strengths"], list):
                    result["feedback"]["strengths"] = [result["feedback"]["strengths"]] if result["feedback"]["strengths"] else []
                if not isinstance(result["feedback"]["weaknesses"], list):
                    result["feedback"]["weaknesses"] = [result["feedback"]["weaknesses"]] if result["feedback"]["weaknesses"] else []
                if not isinstance(result["feedback"]["suggestion"], str):
                    result["feedback"]["suggestion"] = str(result["feedback"]["suggestion"]) if result["feedback"]["suggestion"] else ""
                
                # Filter out strings like "ไม่มี"
                result["feedback"]["strengths"] = [s for s in result["feedback"]["strengths"] if s and s != "ไม่มี" and s != "None"]
                result["feedback"]["weaknesses"] = [w for w in result["feedback"]["weaknesses"] if w and w != "ไม่มี" and w != "None"]
                
                # Fallback values if empty
                if not result["feedback"]["strengths"]:
                    result["feedback"]["strengths"] = ["ไม่มีจุดเด่นที่เด่นชัด (บทสนทนายังไม่ครอบคลุม)" if language != "en" else "No major strengths identified (conversation brief)"]
                if not result["feedback"]["weaknesses"]:
                    result["feedback"]["weaknesses"] = ["ไม่มีข้อมูลระบุจุดที่ควรพัฒนา" if language != "en" else "No specific weaknesses identified"]
                if not result["feedback"]["suggestion"]:
                    result["feedback"]["suggestion"] = "แนะนำให้ฝึกฝนซักถามอาการคนไข้เพิ่มเติมตามแนวทาง SEGUE" if language != "en" else "Consider practicing further patient communication according to SEGUE guidelines."
            
            if result and "scores" in result:
                # Programmatic constraints capping for brief/hello-only chats
                if user_msg_count <= 2:
                    result["scores"]["set_the_stage"] = min(result["scores"].get("set_the_stage", 2), 2)
                    result["scores"]["elicit_information"] = min(result["scores"].get("elicit_information", 0), 0)
                    result["scores"]["give_information"] = min(result["scores"].get("give_information", 0), 0)
                    result["scores"]["understand_perspective"] = min(result["scores"].get("understand_perspective", 0), 1)
                    result["scores"]["end_the_encounter"] = min(result["scores"].get("end_the_encounter", 0), 0)
                    
                    # Override weaknesses if brief
                    result["feedback"]["weaknesses"] = [w for w in result["feedback"].get("weaknesses", []) if "บทสนทนาสั้น" not in w]
                    brief_msg = "บทสนทนาสั้นเกินไป ไม่เพียงพอสำหรับการประเมินทักษะการซักประวัติแพทย์จริง" if language != "en" else "Conversation is too brief to evaluate real history taking skills."
                    result["feedback"]["weaknesses"].append(brief_msg)
                    result["feedback"]["suggestion"] = "นักศึกษาจำเป็นต้องถามคำถามและซักถามอาการคนไข้เพิ่มเติมตามเกณฑ์เพื่อฝึกฝนสัมภาษณ์แพทย์จริง" if language != "en" else "Student must ask more questions to practice patient interview skills."
                    
                elif user_msg_count <= 5:
                    result["scores"]["elicit_information"] = min(result["scores"].get("elicit_information", 1), 2)
                    result["scores"]["give_information"] = min(result["scores"].get("give_information", 1), 1)
                    result["scores"]["end_the_encounter"] = min(result["scores"].get("end_the_encounter", 1), 1)
                    
                    short_msg = "บทสนทนายังไม่ครอบคลุมประวัติปัจจุบัน ประวัติอดีต และการทบทวนระบบอย่างครบถ้วน" if language != "en" else "Conversation does not fully cover HPI, PMH, or ROS."
                    if not any("ยังไม่ครอบคลุม" in w or "does not fully cover" in w for w in result["feedback"]["weaknesses"]):
                        result["feedback"]["weaknesses"].append(short_msg)
                
                # Recalculate average mathematically based on actual capped scores
                scores_vals = result["scores"].values()
                avg = sum(scores_vals) / len(scores_vals) if scores_vals else 0
                result["overall_score"] = round(avg, 2)
                
            # Run Reasoning Map Agent if diagnosis is supplied
            if suspected_diagnosis is not None:
                reasoning_result = await evaluate_reasoning(
                    session_data,
                    suspected_diagnosis,
                    confidence_score,
                    event_timeline or [],
                    actions or [],
                    language
                )
                if reasoning_result:
                    result["reasoning_map"] = reasoning_result
                
            return result
        
        return None
    except Exception as e:
        print(f"Error in evaluate_session: {e}")
        return None

REASONING_SYSTEM_PROMPT = """You are a senior medical school examiner. Your task is to analyze a student's OSCE diagnostic trajectory.
Analyze the transcript of user questions, physical exams, and lab requests along with their elapsed timestamps and the student's suspected diagnosis.

You must output a JSON object with the following fields:
1. "hypotheses_mapped": A list of objects containing:
   - "action": The student's question/exam/lab request.
   - "timestamp": The time formatted as MM:SS (e.g. "01:23").
   - "hypothesis": The clinical hypothesis/differential diagnosis the action was testing (e.g. "Myocardial Infarction").
2. "divergences": A list of objects containing:
   - "action": The inefficient or incorrect action (e.g. ordering CXR at t=10s before history taking).
   - "explanation": Why it was inefficient and what the correct flow should have been.
3. "missed_opportunities": A list of objects containing:
   - "missed": A crucial question or test they missed (e.g., asking about smoking history).
   - "reason": Why it was critical.
4. "calibration": An object containing:
   - "student_confidence": The student's confidence (0-100) from input.
   - "student_diagnosis": The student's diagnosis from input.
   - "is_correct": Boolean (whether student's diagnosis matches the actual diagnosis).
   - "gap_analysis": Explanation of their meta-cognitive calibration (e.g. overconfident, underconfident, well-calibrated).
5. "pacing_feedback": An object containing:
   - "timeline_summary": A summary of how they managed time (e.g., spent 4 minutes on history taking and only 1 minute on exams).
   - "efficiency_recommendations": 2 actionable suggestions for better time management (e.g. "budget at least 2 minutes for physical exam and lab interpretation").
"""

async def evaluate_reasoning(
    session_data: dict,
    suspected_diagnosis: str,
    confidence_score: int,
    event_timeline: list,
    actions: list,
    language: str = "th"
):
    try:
        # Build timeline text
        timeline_str = ""
        for ev in event_timeline:
            t = int(ev.get('time', 0))
            time_formatted = f"{t // 60}:{t % 60:02d}"
            timeline_str += f"[{time_formatted}] Action: {ev.get('action')}\n"
            
        for act in actions:
            t = int(act.get('elapsed_seconds', 0))
            time_formatted = f"{t // 60}:{t % 60:02d}"
            timeline_str += f"[{time_formatted}] {act.get('action_type').upper()} Request: {act.get('target')} (Result: {act.get('result')})\n"
            
        case_info = f"Case Scenario: {session_data['case_data']['scenario_name']}\nChief Complaint: {session_data['case_data']['chief_complaint']}\nHidden Medical Record details: {json.dumps(session_data['case_data']['hidden_record'], ensure_ascii=False)}"
        
        user_prompt = f"""--- CLINICAL CASE ---
{case_info}

--- STUDENT'S SUSPECTED DIAGNOSIS ---
{suspected_diagnosis} (Self-assessed confidence: {confidence_score}%)

--- TIMELINE OF ACTIONS & QUESTIONS ---
{timeline_str}

Please generate the clinical reasoning timeline and feedback analysis in JSON format."""

        if language == "en":
            user_prompt += "\nIMPORTANT: All text fields in the JSON response (such as hypothesis, explanation, gap_analysis, timeline_summary, missed, reason, and recommendations) MUST be generated in English."
        else:
            user_prompt += "\nข้อสำคัญ: คุณต้องกรอกข้อความและข้อวิเคราะห์ทั้งหมดในฟิลด์ JSON (เช่น hypothesis, explanation, gap_analysis, timeline_summary, missed, reason, และ recommendations) เป็นภาษาไทยทั้งหมดเท่านั้น ห้ามใช้ภาษาอังกฤษ ยกเว้นคำศัพท์ทางการแพทย์เฉพาะทาง"

        try:
            response = await ollama_client.chat(
                model=OLLAMA_EVAL_MODEL,
                messages=[
                    {'role': 'system', 'content': REASONING_SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_prompt}
                ],
                format='json'
            )
        except Exception as async_err:
            print(f"Async reasoning evaluator failed, falling back to sync client: {async_err}")
            sync_client = ollama.Client(host=OLLAMA_HOST)
            response = sync_client.chat(
                model=OLLAMA_EVAL_MODEL,
                messages=[
                    {'role': 'system', 'content': REASONING_SYSTEM_PROMPT},
                    {'role': 'user', 'content': user_prompt}
                ],
                format='json'
            )
        
        content = response['message']['content']
        start = content.find('{')
        end = content.rfind('}') + 1
        if start != -1 and end != 0:
            return json.loads(content[start:end])
    except Exception as e:
        print(f"Error in evaluate_reasoning: {e}")
        return None
