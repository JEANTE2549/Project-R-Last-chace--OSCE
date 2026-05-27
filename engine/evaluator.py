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

คำนวณคะแนน overall_score เป็นเกณฑ์เฉลี่ยทางคณิตศาสตร์จากคะแนน 5 ข้อข้างบนเท่านั้น (ทศนิยม 2 ตำแหน่ง) ห้ามให้คะแนนสูงลอยเด็ดขาด!
"""

async def evaluate_session(session_data: dict):
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
                    "strengths": ["ไม่มี"],
                    "weaknesses": ["ไม่ได้เริ่มต้นการสัมภาษณ์คนไข้จำลอง"],
                    "suggestion": "นักศึกษาต้องเริ่มเปิดสนทนากับคนไข้เพื่อเก็บประวัติและฝึกฝนทักษะแพทย์จำลอง"
                }
            }

        # Construct transcript text
        transcript = ""
        for msg in session_data['history']:
            role = "นักศึกษา" if msg['role'] == 'user' else "คนไข้"
            transcript += f"{role}: {msg['content']}\n"
        
        case_info = f"Case: {session_data['case_data']['chief_complaint']}\nScenario: {session_data['case_data']['scenario_name']}"
        user_prompt = f"--- ข้อมูลเคส ---\n{case_info}\n\n--- บทสนทนา ---\n{transcript}\n\nกรุณาประเมินผลการซักประวัตินี้อย่างเข้มงวด"

        response = await ollama_client.chat(
            model=OLLAMA_EVAL_MODEL, # Using configured model for evaluation (default Llama 3.1)
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
            
            if result and "scores" in result:
                # Programmatic constraints capping for brief/hello-only chats
                if user_msg_count <= 2:
                    result["scores"]["set_the_stage"] = min(result["scores"].get("set_the_stage", 2), 2)
                    result["scores"]["elicit_information"] = min(result["scores"].get("elicit_information", 0), 0)
                    result["scores"]["give_information"] = min(result["scores"].get("give_information", 0), 0)
                    result["scores"]["understand_perspective"] = min(result["scores"].get("understand_perspective", 0), 1)
                    result["scores"]["end_the_encounter"] = min(result["scores"].get("end_the_encounter", 0), 0)
                    
                    # Force feedback weaknesses
                    if "feedback" not in result:
                        result["feedback"] = {"strengths": [], "weaknesses": [], "suggestion": ""}
                    result["feedback"]["weaknesses"] = [w for w in result["feedback"].get("weaknesses", []) if w != "ไม่มี"]
                    if "บทสนทนาสั้นเกินไป ไม่เพียงพอสำหรับการประเมินทักษะการซักประวัติแพทย์จริง" not in result["feedback"]["weaknesses"]:
                        result["feedback"]["weaknesses"].append("บทสนทนาสั้นเกินไป ไม่เพียงพอสำหรับการประเมินทักษะการซักประวัติแพทย์จริง")
                    result["feedback"]["suggestion"] = "นักศึกษาจำเป็นต้องถามคำถามและซักถามอาการคนไข้เพิ่มเติมตามเกณฑ์เพื่อฝึกฝนสัมภาษณ์แพทย์จริง"
                    
                elif user_msg_count <= 5:
                    result["scores"]["elicit_information"] = min(result["scores"].get("elicit_information", 1), 2)
                    result["scores"]["give_information"] = min(result["scores"].get("give_information", 1), 1)
                    result["scores"]["end_the_encounter"] = min(result["scores"].get("end_the_encounter", 1), 1)
                    
                    if "feedback" not in result:
                        result["feedback"] = {"strengths": [], "weaknesses": [], "suggestion": ""}
                    result["feedback"]["weaknesses"] = [w for w in result["feedback"].get("weaknesses", []) if w != "ไม่มี"]
                    if "บทสนทนายังไม่ครอบคลุมประวัติปัจจุบัน ประวัติอดีต และการทบทวนระบบอย่างครบถ้วน" not in result["feedback"]["weaknesses"]:
                        result["feedback"]["weaknesses"].append("บทสนทนายังไม่ครอบคลุมประวัติปัจจุบัน ประวัติอดีต และการทบทวนระบบอย่างครบถ้วน")
                
                # Recalculate average mathematically based on actual capped scores
                scores_vals = result["scores"].values()
                avg = sum(scores_vals) / len(scores_vals) if scores_vals else 0
                result["overall_score"] = round(avg, 2)
                
            return result
        
        return None
    except Exception as e:
        print(f"Error in evaluate_session: {e}")
        return None
