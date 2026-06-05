import os
import re
import json
import httpx
import ollama
from dotenv import load_dotenv

load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
TYPHOON_API_KEY = os.getenv("TYPHOON_API_KEY")
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434")

# Initialize Ollama client globally using configured host
ollama_client = ollama.AsyncClient(host=OLLAMA_HOST)

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

def classify_intent_rules(text: str) -> str:
    text = text.lower().strip()
    
    # 1. Onset keywords
    if any(k in text for k in ["เมื่อไหร่", "กี่วัน", "กี่ชั่วโมง", "ตั้งแต่ตอนไหน", "เริ่มเป็น", "นานแค่ไหน", "กี่เดือน", "เริ่มปวด", "เป็นมานาน", "เป็นตั้งแต่"]):
        return "onset"
        
    # 2. Severity keywords
    if any(k in text for k in ["รุนแรง", "แค่ไหน", "กี่คะแนน", "คะแนน", "เต็มสิบ", "ระดับความปวด", "ระดับไหน", "มากไหม", "ปวดมากแค่ไหน", "ปวดกี่คะแนน"]):
        return "severity"
        
    # 3. Associated symptoms
    if any(k in text for k in ["อาการร่วม", "อาการอื่น", "ร่วมด้วย", "ไข้", "อาเจียน", "คลื่นไส้", "เบื่ออาหาร", "น้ำหนักลด", "ปัสสาวะ", "อุจจาระ", "ท้องเสีย", "ท้องผูก", "หนาวสั่น", "ตาเหลือง", "ตัวเหลือง"]):
        return "associated_symptoms"
        
    # 4. Symptom detail
    if any(k in text for k in ["ลักษณะ", "ปวดแบบไหน", "ปวดอย่างไร", "ปวดร้าว", "ร้าวไป", "ตรงไหน", "บริเวณไหน", "ปวดตื้อ", "ปวดจี๊ด", "ปวดบิด", "เจ็บหน้าอกแบบไหน"]):
        return "symptom_detail"
        
    return "other"

async def classify_intent(student_text: str) -> str:
    # 1. Fast Rule-Based Classifier
    rule_intent = classify_intent_rules(student_text)
    if rule_intent != "other":
        return rule_intent

    # 2. Tier 2: Cloud Gemini Classifier (Fast & Free)
    if GEMINI_API_KEY and GEMINI_API_KEY != "your_gemini_api_key_here":
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "contents": [{
                    "role": "user",
                    "parts": [
                        {"text": INTENT_SYSTEM_PROMPT},
                        {"text": f"ข้อความจากนักศึกษา: \"{student_text}\"\nหมวดหมู่คืออะไร?"}
                    ]
                }],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, timeout=5.0)
                if response.status_code == 200:
                    res_data = response.json()
                    text_resp = res_data['candidates'][0]['content']['parts'][0]['text']
                    data = json.loads(text_resp.strip())
                    category = data.get("category", "other")
                    if category in ["symptom_detail", "severity", "onset", "associated_symptoms", "other"]:
                        return category
        except Exception as gemini_err:
            print(f"Gemini Intent Router error: {gemini_err}")

    # 3. Tier 3: Cloud Typhoon Classifier
    if TYPHOON_API_KEY and TYPHOON_API_KEY != "your_typhoon_api_key_here":
        try:
            url = "https://api.opentyphoon.ai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {TYPHOON_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "typhoon-v2.5-30b-a3b-instruct",
                "messages": [
                    {"role": "system", "content": INTENT_SYSTEM_PROMPT},
                    {"role": "user", "content": student_text}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0.1
            }
            async with httpx.AsyncClient() as client:
                response = await client.post(url, headers=headers, json=payload, timeout=5.0)
                if response.status_code == 200:
                    res_data = response.json()
                    content = res_data['choices'][0]['message']['content']
                    data = json.loads(content)
                    category = data.get("category", "other")
                    if category in ["symptom_detail", "severity", "onset", "associated_symptoms", "other"]:
                        return category
        except Exception as typhoon_err:
            print(f"Typhoon Intent Router error: {typhoon_err}")

    # 4. Tier 4: Local Ollama (DeepSeek R1 or default model)
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
        start = content.find('{')
        end = content.rfind('}') + 1
        if start != -1 and end != 0:
            data = json.loads(content[start:end])
            return data.get("category", "other")
    except Exception as ollama_err:
        print(f"Ollama Intent Router error: {ollama_err}")

    return "other"
