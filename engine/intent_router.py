import ollama
import json

# Use the same global client pattern as main.py
ollama_client = ollama.AsyncClient(host='http://127.0.0.1:11434')

INTENT_SYSTEM_PROMPT = """คุณคือผู้ช่วยอาจารย์แพทย์ ทำหน้าที่วิเคราะห์คำถามของนักศึกษาแพทย์
ให้ระบุว่านักศึกษากำลังซักประวัติในหมวดหมู่ใดจากตัวเลือกต่อไปนี้:
1. "symptom_detail" (ถามลักษณะอาการ, ตำแหน่งที่ปวด, ปวดร้าวไปไหน)
2. "severity" (ถามความรุนแรง, คะแนนความปวด)
3. "onset" (เริ่มเป็นเมื่อไหร่, ระยะเวลาที่เป็น)
4. "associated_symptoms" (อาการร่วมอื่นๆ เช่น ไข้ คลื่นไส้ อาเจียน)
5. "other" (คำแนะนำ, คำทักทาย, หรือคำถามอื่นๆ ที่ไม่เกี่ยวกับประวัติข้างต้น)

ตอบกลับเป็น JSON format เท่านั้น โดยมี key ชื่อ "category"
ตัวอย่าง: {"category": "onset"}
"""

async def classify_intent(student_text: str) -> str:
    try:
        response = await ollama_client.chat(
            model='deepseek-r1:1.5b',
            messages=[
                {'role': 'system', 'content': INTENT_SYSTEM_PROMPT},
                {'role': 'user', 'content': student_text}
            ],
            format='json'
        )
        
        content = response['message']['content']
        # DeepSeek R1 might include thinking process in <think> tags, but with format='json' 
        # Ollama usually handles it or we might need to parse.
        # To be safe, we'll try to find the first '{' and last '}'
        
        start = content.find('{')
        end = content.rfind('}') + 1
        if start != -1 and end != 0:
            json_str = content[start:end]
            data = json.loads(json_str)
            return data.get("category", "other")
        
        return "other"
    except Exception as e:
        print(f"Error in classify_intent: {e}")
        return "other"
