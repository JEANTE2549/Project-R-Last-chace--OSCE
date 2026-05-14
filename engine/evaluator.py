import ollama
import json

ollama_client = ollama.AsyncClient(host='http://127.0.0.1:11434')

EVALUATOR_SYSTEM_PROMPT = """คุณคืออาจารย์แพทย์ผู้เชี่ยวชาญด้านทักษะการสื่อสาร (Communication Skills) 
หน้าที่ของคุณคือประเมินการซักประวัติของนักศึกษาแพทย์จากบทสนทนาที่กำหนดให้ 
โดยใช้เกณฑ์ SEGUE Framework ในการประเมิน

เกณฑ์การให้คะแนน (1-5 คะแนน):
1. Set the stage: การทักทาย แนะนำตัว และสร้างบรรยากาศที่ดี
2. Elicit information: การซักประวัติที่ครอบคลุม (ประวัติปัจจุบัน, อาการร่วม, ประวัติอดีต) 
3. Give information: การให้ข้อมูลเบื้องต้นแก่คนไข้ (ถ้ามี)
4. Understand perspective: การแสดงความเห็นอกเห็นใจ (Empathy) และรับฟังคนไข้
5. End the encounter: การสรุปข้อมูลและวางแผนเบื้องต้น

ให้ตอบกลับเป็น JSON format เท่านั้น โดยมีโครงสร้างดังนี้:
{
  "scores": {
    "set_the_stage": 0,
    "elicit_information": 0,
    "give_information": 0,
    "understand_perspective": 0,
    "end_the_encounter": 0
  },
  "overall_score": 0,
  "feedback": {
    "strengths": ["จุดเด่น 1", "จุดเด่น 2"],
    "weaknesses": ["จุดที่ควรพัฒนา 1", "จุดที่ควรพัฒนา 2"],
    "suggestion": "คำแนะนำสรุป"
  }
}
"""

async def evaluate_session(session_data: dict):
    try:
        # Construct transcript text
        transcript = ""
        for msg in session_data['history']:
            role = "นักศึกษา" if msg['role'] == 'user' else "คนไข้"
            transcript += f"{role}: {msg['content']}\n"
        
        case_info = f"Case: {session_data['case_data']['chief_complaint']}\nScenario: {session_data['case_data']['scenario_name']}"
        
        user_prompt = f"--- ข้อมูลเคส ---\n{case_info}\n\n--- บทสนทนา ---\n{transcript}\n\nกรุณาประเมินผลการซักประวัตินี้"

        response = await ollama_client.chat(
            model='llama3.1', # Using Llama 3.1 for evaluation as it's more stable for long context
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
            return json.loads(content[start:end])
        
        return None
    except Exception as e:
        print(f"Error in evaluate_session: {e}")
        return None
