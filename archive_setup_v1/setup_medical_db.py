import os
import json
import chromadb
from chromadb.utils import embedding_functions

# Constants
DB_PATH = "./medical_db"
COLLECTION_NAME = "sor_ror_wor_cases"
JSON_FILENAME = "medical_cases_84.json"
PDF_FILENAME = "ศรว requirement  67.pdf"

def setup_database():
    """Initializes and returns the ChromaDB collection."""
    print("กำลังโหลด Embedding Model...")
    # โหลด Embedding Model ที่รองรับภาษาไทย
    embedding_func = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name="paraphrase-multilingual-MiniLM-L12-v2" 
    )

    print(f"กำลังเชื่อมต่อ Database ที่ {DB_PATH}...")
    client = chromadb.PersistentClient(path=DB_PATH)
    collection = client.get_or_create_collection(
        name=COLLECTION_NAME, 
        embedding_function=embedding_func
    )
    return collection

def load_cases_data():
    """Loads case data primarily from JSON, fallback to PDF stub."""
    if os.path.exists(JSON_FILENAME):
        print(f"พบไฟล์ {JSON_FILENAME} กำลังโหลดข้อมูล...")
        try:
            with open(JSON_FILENAME, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"เกิดข้อผิดพลาดในการอ่านไฟล์ JSON: {e}")
            return []
    
    if os.path.exists(PDF_FILENAME):
        print(f"พบไฟล์ {PDF_FILENAME} แต่ไม่พบไฟล์ JSON")
        print("หมายเหตุ: ไฟล์ PDF เป็นแบบสแกนรูปภาพ แนะนำให้ใช้ข้อมูลจากไฟล์ JSON ที่สร้างไว้แล้ว")
    
    return []

def populate_database(collection, medical_cases):
    """Upserts medical cases into the ChromaDB collection."""
    if not medical_cases:
        print("ไม่พบข้อมูลเคสสำหรับนำเข้า Database")
        return

    print(f"กำลังนำเข้าข้อมูลจำนวน {len(medical_cases)} เคส ลง Vector DB...")
    
    documents = []
    metadatas = []
    ids = []

    for case in medical_cases:
        # Check required fields
        if not all(k in case for k in ("id", "chief_complaint", "scenario_name", "hidden_record")):
            print(f"ข้ามเคสที่ข้อมูลไม่ครบ: {case.get('id', 'Unknown')}")
            continue
            
        documents.append(case["chief_complaint"])
        
        # ChromaDB metadata values must be strings, ints, or floats.
        # Use json.dumps to store dicts as valid JSON strings.
        hidden_record_str = json.dumps(case["hidden_record"], ensure_ascii=False)
        
        metadatas.append({
            "scenario_name": case["scenario_name"],
            "osce_checklist": case.get("osce_checklist", ""),
            "hidden_record": hidden_record_str
        })
        ids.append(case["id"])

    try:
        # Use upsert instead of add to prevent error if script is run multiple times
        collection.upsert(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        print(f"สร้าง/อัปเดตฐานข้อมูลเคส ศรว. จำนวน {len(ids)} เคส สำเร็จ!")
    except Exception as e:
        print(f"เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Vector DB: {e}")

def main():
    print("="*50)
    print(" เริ่มต้นกระบวนการ Setup Medical Database")
    print("="*50)
    
    collection = setup_database()
    cases = load_cases_data()
    populate_database(collection, cases)
    
    print("="*50)
    print(" เสร็จสิ้นกระบวนการ")
    print("="*50)

if __name__ == "__main__":
    main()