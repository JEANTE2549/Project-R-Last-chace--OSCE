class AIPatientSimulator extends HTMLElement {
    constructor() {
        super();
        this.shadowDOM = this.attachShadow({ mode: 'open' });
        
        // State management
        this.sessionId = this.getAttribute('session-id') || "session_" + Math.random().toString(36).substring(7);
        this.serverUrl = this.getAttribute('server-url') || window.location.origin;
        this.apiTier = this.getAttribute('api-tier') || 'free';
        this.mode = this.getAttribute('mode') || 'selective'; // 'random' or 'selective'
        
        // Selective Mode States
        this.selectedCaseId = null;
        this.casesList = [];
        
        // Dynamic GGUF Customization State
        this.selectedModel = "llama3.1:latest";
        this.temperature = 0.7;
        this.customPrompt = "";
        
        // Dynamic Emotional States (PAD model)
        this.anger = 0;
        this.sadness = 0;
        this.happiness = 100;
        this.pad = { p: 1.0, a: -0.5, d: 0.5 };
        
        // Conversation & Speech states
        this.isRecording = false;
        this.recognition = null;
        this.tempMsgDiv = null;
        this.socket = null;
        this.currentPatientMsgDiv = null;
        this.ttsQueue = [];
        this.isSpeaking = false;
        this.sentenceBuffer = "";
        this.currentPatientGender = "female";
        this.backendSTTFailed = false;
        this.backendTTSFailed = false;
        this.currentLanguage = "th";
        this.translations = {
            th: {
                "portal-title": "ระบบจำลองสถานการณ์คนไข้ซักประวัติ (OSCE)",
                "force-offline-title": "⚙️ โหมดฝึกฝนออฟไลน์",
                "force-offline-desc": "หลีกเลี่ยงคลาวด์เพื่อทดสอบโดยใช้ระบบแปลเสียง สังเคราะห์เสียง และโมเดลในเครื่องทั้งหมด เพื่อประหยัดโควต้า",
                "persona-bank-title": "คลังข้อมูลบุคลิกและระดับอารมณ์คนไข้",
                "customize-persona-btn": "ปรับแต่งอารมณ์...",
                "delete-persona-btn": "ลบบุคลิก",
                "blind-osce-btn": "จำลองการสอบแบบสุ่มเคส",
                "select-syndrome-btn": "เลือกเคสโรคสำหรับฝึกฝน",
                "view-history-btn": "รายงานและประวัติการฝึกฝนย้อนหลัง",
                "select-case-title": "เลือกเคสคนไข้จำลอง",
                "back-btn": "ย้อนกลับ",
                "cases-loading": "กำลังประมวลผลดึงกลุ่มโรคเวกเตอร์...",
                "history-title": "ประวัติการสอบและการฝึกฝนของคุณ",
                "history-loading": "กำลังประมวลผลดึงประวัติการซักของคุณจากระบบ...",
                "pre-exam-title": "เตรียมความพร้อมก่อนเข้าตรวจ",
                "pre-exam-select-label": "เลือกคลังบุคลิกภาพสำหรับเคสสอบนี้:",
                "pre-exam-summary-label": "รายละเอียดบุคลิกภาพของคนไข้จำลอง:",
                "pre-exam-pain-label": "ระดับความเจ็บปวด:",
                "pre-exam-anxiety-label": "ระดับความตื่นตระหนก:",
                "pre-exam-anger-label": "ระดับความโกรธหรือขัดขืน:",
                "start-exam-btn": "เริ่มการสอบซักประวัติ",
                "cancel-exam-btn": "ย้อนกลับ",
                "widget-title": "ห้องสอบซักประวัติด้วย AI (OSCE)",
                "model-display-label": "🤖 โมเดลตอบสนองคนไข้:",
                "model-display-waiting": "(รอเริ่มต้นบทสนทนา...)",
                "cancel-portal-btn": "ยกเลิกการตรวจและกลับหน้าหลัก",
                "chat-send-btn": "ส่ง",
                "chat-input-placeholder": "พิมพ์คำถามซักประวัติที่นี่ หรือกดไมค์เพื่อพูด...",
                "end-btn": "เสร็จสิ้นการซักประวัติ",
                "new-btn": "เข้าตรวจคนไข้เคสใหม่",
                "view-eval-btn": "แสดงผลการประเมินความสามารถ",
                "portal-btn": "กลับสู่หน้าหลัก",
                "status-connecting": "กำลังเชื่อมต่อ...",
                "status-waiting": "รอรับคำถามต่อไป...",
                "status-recording": "กำลังบันทึกเสียงพูด...",
                "status-processing": "กำลังประมวลผล...",
                "status-transcribing": "กำลังถอดเสียงจากคลาวด์...",
                "eval-title": "ผลการประเมินการซักประวัติ",
                "eval-overall-score": "คะแนนรวม:",
                "eval-strengths": "จุดเด่น:",
                "eval-weaknesses": "จุดที่ควรพัฒนา:",
                "eval-suggestion": "คำแนะนำเพิ่มเติม:",
                "eval-loading": "กำลังประมวลผลการประเมินโดย AI... (อาจใช้เวลา 10-30 วินาที)",
                
                // Settings Drawer Translations
                "settings-drawer-title": "แผงตั้งค่าและจำลองการแสดงออกของคนไข้",
                "settings-difficulty-label": "ระดับความยากในการซักประวัติ",
                "settings-diff-easy": "ง่าย",
                "settings-diff-medium": "ปานกลาง",
                "settings-diff-hard": "ยาก",
                "settings-diff-desc": "• <b>ง่าย:</b> คนไข้ตอบตรงประเด็น ไม่นอกเรื่อง<br>• <b>ปานกลาง:</b> ตอบตามประวัติปกติ มีลีลาตามอารมณ์พอดี<br>• <b>ยาก:</b> คนไข้โยกโย้ บ่นกังวลสูง หรือเจ็บปวดมาก ต้องซักประวัติอย่างใส่ใจและใช้ความเข้าใจเห็นอกเห็นใจ",
                "settings-preset-label": "เลือกแม่แบบบุคลิกภาพ",
                "settings-emotion-title": "ระดับการตอบสนองด้านอารมณ์พื้นฐาน",
                "settings-emotion-anger": "ความโกรธ/ก้าวร้าว:",
                "settings-emotion-sadness": "ความเศร้า/อ่อนแอ:",
                "settings-emotion-happiness": "ความสุข/สงบนิ่ง:",
                "settings-pad-vectors": "ค่าเวกเตอร์อารมณ์ PAD:",
                "settings-extra-instructions": "ข้อกำหนดพฤติกรรมและการแสดงออกเพิ่มเติม",
                "settings-extra-placeholder": "ระบุพฤติกรรมเสริม เช่น 'คนไข้ปากเบี้ยวเล็กน้อยเวลากล่าว', 'อ่อนแรงครึ่งซีก', หรือ 'มีความอ่อนไหวง่าย ร้องไห้ง่ายมาก' เพื่อท้าทายทักษะการซักประวัติ",
                "settings-extra-note": "*หมายเหตุ: คำสั่งนี้จะส่งไปช่วยเสริมพฤติกรรมการแสดงออกของคนไข้สมมติ โดยไม่รบกวนบทยืนยันอาการหลักของเคสแพทย์จำลอง*",
                "settings-save-bank": "บันทึกการปรับจูนลงในคลังเก็บข้อมูลส่วนตัว",
                "settings-save-btn": "บันทึกการปรับจูน"
            },
            en: {
                "portal-title": "Simulated Patient OSCE Practice Room",
                "force-offline-title": "⚙️ Force Offline Local Mode",
                "force-offline-desc": "Bypass cloud APIs and force local model, STT, and TTS (Saves API Quota)",
                "persona-bank-title": "Patient Persona & Mood Bank",
                "customize-persona-btn": "Customize Mood...",
                "delete-persona-btn": "Delete Persona",
                "blind-osce-btn": "Blind OSCE Encounter (Random Case)",
                "select-syndrome-btn": "Practice by Case Categories (Selective)",
                "view-history-btn": "My Activity & Evaluation History",
                "select-case-title": "Select Simulated Case",
                "back-btn": "Back",
                "cases-loading": "Fetching case categories...",
                "history-title": "Your Practice & Exam History",
                "history-loading": "Fetching your practice history...",
                "pre-exam-title": "Encounter Preparation",
                "pre-exam-select-label": "Select Patient Persona for this Encounter:",
                "pre-exam-summary-label": "Patient Persona Summary:",
                "pre-exam-pain-label": "Physical Pain Level:",
                "pre-exam-anxiety-label": "Anxiety/Panic Level:",
                "pre-exam-anger-label": "Hostility/Anger Level:",
                "start-exam-btn": "Start Encounter",
                "cancel-exam-btn": "Back",
                "widget-title": "AI Patient Simulator (OSCE Encounter)",
                "model-display-label": "🤖 Active AI Model:",
                "model-display-waiting": "(Waiting to begin encounter...)",
                "cancel-portal-btn": "Cancel & Exit to Main Menu",
                "chat-send-btn": "Send",
                "chat-input-placeholder": "Type your question here or use the microphone...",
                "end-btn": "End Encounter",
                "new-btn": "Start New Encounter",
                "view-eval-btn": "Show Evaluation & Feedback",
                "portal-btn": "Exit to Portal",
                "status-connecting": "Connecting...",
                "status-waiting": "Waiting for your next question...",
                "status-recording": "Recording voice...",
                "status-processing": "Processing...",
                "status-transcribing": "Transcribing audio in cloud...",
                "eval-title": "OSCE Encounter Evaluation",
                "eval-overall-score": "Overall Score:",
                "eval-strengths": "Strengths:",
                "eval-weaknesses": "Areas for Improvement:",
                "eval-suggestion": "Additional Suggestions:",
                "eval-loading": "Processing AI Evaluation... (Takes 10-30 seconds)",
                
                // Settings Drawer Translations
                "settings-drawer-title": "Patient Expression & Settings Panel",
                "settings-difficulty-label": "Encounter Difficulty Level",
                "settings-diff-easy": "Easy",
                "settings-diff-medium": "Medium",
                "settings-diff-hard": "Hard",
                "settings-diff-desc": "• <b>Easy:</b> Patient answers directly to the point.<br>• <b>Medium:</b> Responds normally with realistic emotional cues.<br>• <b>Hard:</b> Responds evasively, highly anxious, or in severe pain; requires empathy.",
                "settings-preset-label": "Select Standard Preset",
                "settings-emotion-title": "Basic Emotional Response Levels",
                "settings-emotion-anger": "Hostility/Anger:",
                "settings-emotion-sadness": "Sadness/Weakness:",
                "settings-emotion-happiness": "Happiness/Calmness:",
                "settings-pad-vectors": "PAD Emotion Vectors:",
                "settings-extra-instructions": "Additional Behavior Instructions",
                "settings-extra-placeholder": "Specify extra behaviors, e.g., 'patient slurs slightly when speaking', 'half-body weakness', or 'cries easily'.",
                "settings-extra-note": "*Note: These instructions will enhance the patient's emotional behavior without overriding the main clinical case info.*",
                "settings-save-bank": "Save Configuration to Personal Bank",
                "settings-save-btn": "Save Settings"
            }
        };
    }

    connectedCallback() {
        this.render();
        this.setupElements();
        this.checkAuthentication();
        
        // Initialize Persona Bank in localStorage if empty
        if (!localStorage.getItem('osce_custom_personas')) {
            localStorage.setItem('osce_custom_personas', JSON.stringify([]));
        }
        this.loadPersonaBank();
        this.loadPreExamPersonaBank();
        this.updateLangUIState();
    }

    checkAuthentication() {
        this.studentId = this.getAttribute('student-id') || this.getAttribute('student_id');
        this.studentName = this.getAttribute('student-name') || this.getAttribute('student_name') || "Guest Student";
        this.studentToken = this.getAttribute('token');

        if (!this.studentId) {
            this.studentId = sessionStorage.getItem('osce_student_id') || localStorage.getItem('osce_student_id');
            this.studentName = sessionStorage.getItem('osce_student_name') || localStorage.getItem('osce_student_name') || "Guest Student";
            this.studentToken = sessionStorage.getItem('osce_student_token') || localStorage.getItem('osce_student_token');
        }

        if (this.studentId) {
            sessionStorage.setItem('osce_student_id', this.studentId);
            sessionStorage.setItem('osce_student_name', this.studentName);
            if (this.studentToken) sessionStorage.setItem('osce_student_token', this.studentToken);

            this.authGateScreen.style.display = 'none';
            if (this.mode === 'random') {
                this.startSimulationWithCase(null);
            } else {
                this.showScreen('portal');
            }
        } else {
            this.authGateScreen.style.display = 'flex';
            this.portalScreen.style.display = 'none';
            this.casesGridScreen.style.display = 'none';
            this.widgetContainer.style.display = 'none';
        }
    }

    disconnectedCallback() {
        this.closeConnections();
    }

    static get observedAttributes() {
        return ['server-url', 'session-id', 'api-tier', 'mode', 'student-id', 'student-name', 'token'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'server-url') {
            this.serverUrl = newValue;
            if (this.socket) this.connectWS();
        } else if (name === 'session-id') {
            this.sessionId = newValue;
        } else if (name === 'api-tier') {
            this.apiTier = newValue;
        } else if (name === 'mode') {
            this.mode = newValue;
        } else if (name === 'student-id' || name === 'student_id') {
            this.studentId = newValue;
            this.checkAuthentication();
        } else if (name === 'student-name' || name === 'student_name') {
            this.studentName = newValue;
        } else if (name === 'token') {
            this.studentToken = newValue;
            this.checkAuthentication();
        }
    }

    render() {
        this.shadowDOM.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    max-width: 600px;
                    width: 100%;
                    margin: 40px auto;
                    padding: 24px;
                    background-color: #f8fafc;
                    color: #1e293b;
                    border-radius: 16px;
                    box-sizing: border-box;
                    position: relative;
                    min-height: 520px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.02);
                }
                .widget-container {
                    width: 100%;
                    position: relative;
                }
                h2 {
                    text-align: center;
                    color: #1e3a8a;
                    margin-top: 0;
                    font-weight: 800;
                    padding-right: 40px; /* Space for settings button */
                }
                
                /* Selection Portal Screen Styles */
                #portal-screen {
                    text-align: center;
                    padding: 10px 5px;
                }
                .portal-title {
                    font-size: 20px;
                    color: #1e3a8a;
                    font-weight: 800;
                    margin-bottom: 25px;
                    letter-spacing: -0.5px;
                }
                .portal-btns-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    max-width: 400px;
                    margin: 0 auto;
                }
                .portal-btn {
                    padding: 16px 24px;
                    font-size: 15px;
                    font-weight: bold;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .portal-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.08);
                }
                .portal-btn:active {
                    transform: translateY(0);
                }
                
                /* Avatar Scroll Bar & Cards */
                .avatar-scroll-container {
                    display: flex;
                    gap: 15px;
                    overflow-x: auto;
                    padding: 10px 5px;
                    margin-bottom: 15px;
                    scrollbar-width: thin;
                    -webkit-overflow-scrolling: touch;
                }
                .avatar-card {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    cursor: pointer;
                    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 85px;
                    flex-shrink: 0;
                    position: relative;
                }
                .avatar-img-wrapper {
                    width: 65px;
                    height: 65px;
                    border-radius: 50%;
                    background: #ffffff;
                    padding: 3px;
                    border: 2px solid #e2e8f0;
                    transition: all 0.25s ease;
                    position: relative;
                }
                .avatar-img {
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                    border-radius: 50%;
                    display: block;
                }
                .avatar-card:hover .avatar-img-wrapper {
                    transform: translateY(-3px) scale(1.03);
                    border-color: #cbd5e1;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.05);
                }
                .avatar-card.active .avatar-img-wrapper {
                    transform: translateY(-3px) scale(1.05);
                    border-color: #ea580c;
                    box-shadow: 0 0 0 3px rgba(234, 88, 12, 0.25);
                }
                .avatar-label {
                    font-size: 11px;
                    font-weight: 700;
                    text-align: center;
                    color: #64748b;
                    margin-top: 6px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    transition: color 0.2s;
                }
                .avatar-card.active .avatar-label {
                    color: #ea580c;
                }
                .delete-avatar-badge {
                    position: absolute;
                    top: -2px;
                    right: -2px;
                    width: 18px;
                    height: 18px;
                    background: #ea580c;
                    color: white;
                    border-radius: 50%;
                    font-size: 11px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    border: 2px solid white;
                    cursor: pointer;
                    z-index: 5;
                    transition: background 0.2s;
                }
                .delete-avatar-badge:hover {
                    background: #c2410c;
                }
                
                /* Custom Persona Details Panel */
                .persona-details-panel {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 16px;
                    margin-bottom: 15px;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.01);
                    text-align: left;
                }
                .persona-name {
                    font-size: 14px;
                    font-weight: 800;
                    color: #1e3a8a;
                    margin-bottom: 4px;
                }
                .persona-desc {
                    font-size: 12px;
                    color: #475569;
                    line-height: 1.5;
                    margin-bottom: 12px;
                }
                .emotion-bars {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }
                .emotion-row {
                    display: flex;
                    align-items: center;
                    font-size: 11px;
                    font-weight: 700;
                    color: #64748b;
                }
                .emotion-label {
                    width: 75px;
                    flex-shrink: 0;
                }
                .emotion-bar-bg {
                    flex-grow: 1;
                    height: 6px;
                    background: #f1f5f9;
                    border-radius: 3px;
                    overflow: hidden;
                    position: relative;
                }
                .emotion-bar-fill {
                    height: 100%;
                    border-radius: 3px;
                    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
                }
                .emotion-bar-val {
                    width: 35px;
                    text-align: right;
                    flex-shrink: 0;
                    font-size: 11px;
                    font-weight: bold;
                    color: #475569;
                }
                .fill-happiness {
                    background: #2563eb;
                }
                .fill-sadness {
                    background: #94a3b8;
                }
                .fill-anger {
                    background: #ea580c;
                }
                
                /* Syndrome Case cards styles - Two Column List Layout */
                #cases-grid-screen {
                    width: 100%;
                }
                .cases-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 1px solid #e2e8f0;
                    padding-bottom: 12px;
                }
                .back-btn {
                    background: transparent;
                    color: #2563eb;
                    padding: 0;
                    font-size: 14px;
                    border: none;
                    cursor: pointer;
                    text-decoration: underline;
                    font-weight: bold;
                }
                .cards-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    max-height: 420px;
                    overflow-y: auto;
                    padding: 5px;
                }
                .case-card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 12px;
                    padding: 16px 20px;
                    cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    text-align: left;
                    box-sizing: border-box;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    width: 100%;
                    gap: 20px;
                }
                .case-card:hover {
                    border-color: #2563eb;
                    box-shadow: 0 4px 12px rgba(37, 99, 235, 0.05);
                    transform: translateY(-1px);
                }
                .case-card-left {
                    width: 140px;
                    flex-shrink: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .case-card-right {
                    flex-grow: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .badge {
                    display: inline-block;
                    padding: 4px 8px;
                    font-size: 9px;
                    font-weight: bold;
                    border-radius: 8px;
                    text-transform: uppercase;
                    width: fit-content;
                }
                .badge-counseling { background-color: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe; }
                .badge-abdomen { background-color: #fff7ed; color: #c2410c; border: 1px solid #ffedd5; }
                .badge-general { background-color: #f0fdf4; color: #166534; border: 1px solid #dcfce7; }
                .badge-fallback { background-color: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
                
                .case-title {
                    font-size: 14px;
                    font-weight: 800;
                    color: #1e293b;
                    margin: 0;
                    line-height: 1.3;
                }
                .case-desc {
                    font-size: 12px;
                    color: #475569;
                    margin: 0;
                    line-height: 1.5;
                }

                #chat-box {
                    background: #ffffff;
                    border-radius: 12px;
                    height: 400px;
                    overflow-y: auto;
                    padding: 20px;
                    margin-bottom: 20px;
                    box-shadow: inset 0 2px 4px rgba(0,0,0,0.01);
                    border: 1px solid #e2e8f0;
                    box-sizing: border-box;
                }
                .msg {
                    margin-bottom: 15px;
                    padding: 12px 16px;
                    border-radius: 14px;
                    max-width: 80%;
                    line-height: 1.5;
                    font-size: 14px;
                    word-wrap: break-word;
                    box-sizing: border-box;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.02);
                }
                .user {
                    background-color: #2563eb;
                    color: white;
                    margin-left: auto;
                    text-align: left;
                    border-bottom-right-radius: 2px;
                }
                .patient {
                    background-color: #f1f5f9;
                    color: #1e293b;
                    margin-right: auto;
                    border-bottom-left-radius: 2px;
                    border: 1px solid #e2e8f0;
                }
                
                /* Typing Indicator Styles */
                .typing-indicator-dots {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    height: 17px;
                    padding: 4px 0;
                }
                .typing-indicator-dot {
                    width: 6px;
                    height: 6px;
                    background-color: #64748b;
                    border-radius: 50%;
                    animation: bounce 1.3s linear infinite;
                }
                .typing-indicator-dot:nth-child(2) {
                    animation-delay: 0.15s;
                }
                .typing-indicator-dot:nth-child(3) {
                    animation-delay: 0.3s;
                }
                @keyframes bounce {
                    0%, 60%, 100% {
                        transform: translateY(0);
                    }
                    30% {
                        transform: translateY(-4px);
                    }
                }

                /* Segmented Difficulty Control */
                .difficulty-group {
                    display: flex;
                    background: #f1f5f9;
                    border-radius: 8px;
                    padding: 4px;
                    gap: 4px;
                    border: 1px solid #cbd5e1;
                    margin-bottom: 12px;
                }
                .difficulty-option {
                    flex: 1;
                    position: relative;
                }
                .difficulty-option input[type="radio"] {
                    position: absolute;
                    opacity: 0;
                    width: 0;
                    height: 0;
                }
                .difficulty-label {
                    display: block;
                    text-align: center;
                    padding: 8px 12px;
                    font-size: 13px;
                    font-weight: 700;
                    color: #64748b;
                    background: transparent;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    user-select: none;
                }
                .difficulty-option input[type="radio"]:checked + .difficulty-label {
                    background: #ffffff;
                    color: #2563eb;
                    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
                }
                .difficulty-option input[type="radio"]:checked[value="easy"] + .difficulty-label {
                    color: #166534;
                }
                .difficulty-option input[type="radio"]:checked[value="medium"] + .difficulty-label {
                    color: #2563eb;
                }
                .difficulty-option input[type="radio"]:checked[value="hard"] + .difficulty-label {
                    color: #ea580c;
                }
                .btn-container {
                    text-align: center;
                    gap: 10px;
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                button {
                    background-color: #2563eb;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 14px;
                    font-weight: bold;
                    border-radius: 25px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                button:hover {
                    opacity: 0.9;
                    transform: translateY(-1px);
                }
                button:active {
                    transform: translateY(0);
                }
                button:disabled {
                    background-color: #cbd5e1 !important;
                    cursor: not-allowed;
                    opacity: 1;
                    transform: none !important;
                }
                #status {
                    display: block;
                    text-align: center;
                    margin-top: 10px;
                    color: #64748b;
                    font-size: 13px;
                    width: 100%;
                }
                
                /* Settings Button & Panel */
                #settings-btn {
                    display: none !important;
                }
                
                #settings-drawer {
                    display: none;
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 100%;
                    height: 100%;
                    background: white;
                    border-radius: 15px;
                    box-shadow: -4px 0 10px rgba(0,0,0,0.1);
                    z-index: 35000;
                    padding: 20px;
                    box-sizing: border-box;
                    overflow-y: auto;
                }
                .drawer-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #eee;
                    padding-bottom: 10px;
                    margin-bottom: 15px;
                }
                .form-group {
                    margin-bottom: 15px;
                }
                .form-group label {
                    display: block;
                    font-weight: bold;
                    margin-bottom: 5px;
                    font-size: 14px;
                    color: #444;
                }
                .form-group input[type="text"], .form-group select, .form-group textarea {
                    width: 100%;
                    padding: 8px 12px;
                    border: 1px solid #ccc;
                    border-radius: 6px;
                    font-size: 14px;
                    box-sizing: border-box;
                }
                .form-group textarea {
                    height: 100px;
                    font-family: inherit;
                    resize: vertical;
                    font-size: 12px;
                    line-height: 1.4;
                }
                .slider-val {
                    float: right;
                    font-weight: bold;
                    color: #0d6efd;
                }
                
                /* Local CORS Setup Wizard */
                #setup-wizard {
                    display: none;
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(255, 255, 255, 0.98);
                    border-radius: 15px;
                    z-index: 999;
                    padding: 20px;
                    box-sizing: border-box;
                    overflow-y: auto;
                    text-align: center;
                    color: #333;
                }
                .wizard-icon {
                    font-size: 40px;
                    margin-bottom: 5px;
                }
                .wizard-title {
                    font-size: 18px;
                    font-weight: bold;
                    margin-bottom: 10px;
                    color: #dc3545;
                }
                .code-block {
                    background: #212529;
                    color: #f8f9fa;
                    padding: 10px 15px;
                    border-radius: 6px;
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    text-align: left;
                    word-break: break-all;
                    margin: 8px 0;
                    position: relative;
                }
                .copy-btn {
                    position: absolute;
                    right: 8px;
                    top: 6px;
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 2px 6px;
                    font-size: 10px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .copy-btn:active {
                    background: #198754;
                }
                .tab-container {
                    display: flex;
                    justify-content: center;
                    margin-bottom: 15px;
                    gap: 5px;
                }
                .tab-btn {
                    background: #e9ecef;
                    color: #495057;
                    border: none;
                    padding: 6px 12px;
                    font-size: 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .tab-btn.active {
                    background: #dc3545;
                    color: white;
                }

                /* Modal Styles */
                #eval-modal {
                    display: none;
                    position: fixed;
                    z-index: 10000;
                    left: 0;
                    top: 0;
                    width: 100%;
                    height: 100%;
                    overflow: auto;
                    background-color: rgba(0,0,0,0.5);
                }
                .modal-content {
                    background-color: #fefefe;
                    color: #1e293b; /* Prevent white text leakage */
                    margin: 5% auto;
                    padding: 30px;
                    border-radius: 15px;
                    width: 80%;
                    max-width: 600px;
                    box-shadow: 0 5px 15px rgba(0,0,0,0.3);
                    box-sizing: border-box;
                    position: relative;
                }
                .close {
                    color: #aaa;
                    position: absolute;
                    right: 20px;
                    top: 15px;
                    font-size: 28px;
                    font-weight: bold;
                    cursor: pointer;
                }
                .close:hover {
                    color: black;
                }
                .score-row {
                    display: flex;
                    justify-content: space-between;
                    color: #1e293b; /* Prevent white text leakage */
                    margin-bottom: 10px;
                    padding: 10px;
                    background: #f8f9fa;
                    border-radius: 8px;
                }
                .score-stars {
                    color: #ffc107;
                    font-size: 18px;
                }
                .feedback-section {
                    margin-top: 20px;
                }
                .feedback-item {
                    margin-bottom: 10px;
                }
                .strength {
                    color: #198754;
                    font-weight: bold;
                }
                .weakness {
                    color: #dc3545;
                    font-weight: bold;
                }
                
                /* Glassmorphic Auth Gateway Overlay */
                .auth-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(circle at center, rgba(15, 23, 42, 0.94) 0%, rgba(9, 15, 30, 0.98) 100%);
                    backdrop-filter: blur(16px) saturate(180%);
                    -webkit-backdrop-filter: blur(16px) saturate(180%);
                    z-index: 20000;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    box-sizing: border-box;
                    border-radius: 15px;
                    color: #f8fafc;
                    text-align: center;
                    transition: opacity 0.3s ease;
                }
                .auth-card {
                    background: rgba(30, 41, 59, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    padding: 35px 30px;
                    width: 100%;
                    max-width: 380px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    text-align: center;
                    box-sizing: border-box;
                    animation: slideUp 0.4s ease-out;
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .auth-icon {
                    font-size: 56px;
                    margin-bottom: 16px;
                    filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.3));
                    display: inline-block;
                    animation: float 3s ease-in-out infinite;
                }
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                .auth-title {
                    font-size: 22px;
                    font-weight: 800;
                    margin-bottom: 12px;
                    background: linear-gradient(135deg, #60a5fa, #3b82f6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    letter-spacing: -0.5px;
                }
                .auth-desc {
                    font-size: 14px;
                    color: #94a3b8;
                    margin-bottom: 24px;
                    line-height: 1.6;
                }
                .auth-error {
                    color: #f87171;
                    font-size: 13px;
                    margin-top: 12px;
                    display: none;
                    font-weight: 600;
                    background: rgba(239, 68, 68, 0.1);
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .auth-submit-btn {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    color: white;
                    width: 100%;
                    padding: 14px;
                    font-size: 15px;
                    font-weight: 700;
                    border-radius: 10px;
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
                    transition: all 0.25s ease;
                }
                .auth-submit-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
                    opacity: 0.95;
                }
                .auth-submit-btn:active {
                    transform: translateY(0);
                }
                .lock-btn {
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    font-size: 18px;
                    cursor: pointer;
                    padding: 5px 8px;
                    border-radius: 50%;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    position: absolute;
                    left: 10px;
                    top: 10px;
                    transition: all 0.2s;
                }
                .lock-btn:hover {
                    color: #ef4444;
                    background-color: rgba(239, 68, 68, 0.15);
                }
                .form-control {
                    width: 100%;
                    padding: 10px 14px;
                    background-color: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 8px;
                    color: #f8fafc;
                    font-size: 14px;
                    box-sizing: border-box;
                    margin-bottom: 12px;
                    transition: border-color 0.2s;
                }
                .form-control:focus {
                    border-color: #3b82f6;
                    outline: none;
                }
                #quota-tracker-bar {
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 8px 12px;
                    font-size: 13px;
                    color: #475569;
                    margin-bottom: 12px;
                    display: none !important;
                    align-items: center;
                    gap: 8px;
                    font-weight: 500;
                    box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);
                }
            </style>
            
            <!-- Pre-Encounter Entry Portal -->
            <div id="portal-screen" style="display: none; position: relative;">
                <div style="position: relative; margin-bottom: 25px; min-height: 40px; padding-right: 150px; box-sizing: border-box; text-align: left; display: block;">
                    <div class="portal-title" data-i18n="portal-title" style="margin: 0; line-height: 1.2;">ระบบจำลองสถานการณ์คนไข้ซักประวัติ (OSCE)</div>
                    <div style="position: absolute; top: 0; right: 0; display: flex; gap: 4px; z-index: 10;">
                        <button class="lang-btn" data-lang="th" style="padding: 5px 10px; font-size: 11.5px; font-weight: bold; border-radius: 6px; cursor: pointer; border: 1.5px solid #cbd5e1; transition: 0.2s; background-color: #ea580c; color: white;">ภาษาไทย</button>
                        <button class="lang-btn" data-lang="en" style="padding: 5px 10px; font-size: 11.5px; font-weight: bold; border-radius: 6px; cursor: pointer; border: 1.5px solid #cbd5e1; transition: 0.2s; background-color: #ffffff; color: #475569;">English</button>
                    </div>
                </div>
                
                <!-- Premium Model Inference Selector inside Portal -->
                <div class="portal-card" style="display: none; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0,0,0,0.04); text-align: left; max-width: 400px; margin-left: auto; margin-right: auto; box-sizing: border-box;">
                    <label for="portal-tier-select" style="font-weight: bold; color: #1e293b; font-size: 14px; display: block; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                        ระบบประมวลผลปัญญาประดิษฐ์
                    </label>
                    <select id="portal-tier-select" style="width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; font-family: inherit; background-color: #f8fafc; cursor: pointer; color: #1e293b; font-weight: 600; margin-bottom: 10px;">
                        <option value="free">ระบบประมวลผลในเครื่อง - ออฟไลน์ / ส่วนตัว</option>
                        <option value="paid">ระบบประมวลผลคลาวด์ภาษาไทย - ความแม่นยำสูง</option>
                    </select>
                    <span style="font-size: 11px; color: #64748b; display: block; margin-top: 8px; line-height: 1.4;">
                        *หมายเหตุ: คลาวด์ มีการจำกัดโควต้าคำถามสูงสุด 30 ข้อต่อรอบ และ 50 ข้อต่อวันต่อคน
                    </span>
                </div>

                <!-- Force Offline Toggle Card -->
                <div class="portal-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 18px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); text-align: left; max-width: 400px; margin-left: auto; margin-right: auto; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <div>
                        <span data-i18n="force-offline-title" style="font-weight: bold; color: #1e3a8a; font-size: 13.5px; display: block;">⚙️ โหมดฝึกฝนออฟไลน์</span>
                        <span data-i18n="force-offline-desc" style="font-size: 11.5px; color: #64748b; display: block; margin-top: 3px;">หลีกเลี่ยงคลาวด์เพื่อทดสอบโดยใช้ระบบแปลเสียง สังเคราะห์เสียง และโมเดลในเครื่องทั้งหมด เพื่อประหยัดโควต้า</span>
                    </div>
                    <input type="checkbox" id="force-offline-toggle" style="width: 22px; height: 22px; cursor: pointer; accent-color: #ea580c; flex-shrink: 0;">
                </div>

                <!-- Patient Persona Bank Card directly in student Portal screen -->
                <div class="portal-card" id="persona-bank-card" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); text-align: left; max-width: 400px; margin-left: auto; margin-right: auto; box-sizing: border-box;">
                    <label data-i18n="persona-bank-title" style="font-weight: 800; color: #1e3a8a; font-size: 14px; display: block; margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
                        คลังข้อมูลบุคลิกและระดับอารมณ์คนไข้
                    </label>
                    <select id="persona-preset-select" style="display: none;">
                        <!-- Options populated dynamically by JS -->
                    </select>
                    
                    <!-- Horizontal scroll container of Patient Cards / Avatars -->
                    <div id="persona-avatars-list" class="avatar-scroll-container"></div>
                    
                    <!-- Dynamic summary panel showing descriptions and progress bars -->
                    <div id="persona-details-panel" class="persona-details-panel">
                        กำลังโหลดข้อมูลบุคลิก...
                    </div>

                    <div style="display: flex; gap: 10px;">
                        <button id="customize-persona-btn" data-i18n="customize-persona-btn" style="background-color: #2563eb; color: white; flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
                            ปรับแต่งอารมณ์...
                        </button>
                        <button id="delete-persona-btn" data-i18n="delete-persona-btn" style="background-color: #ea580c; color: white; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; border: none; cursor: pointer; display: none; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
                            ลบบุคลิก
                        </button>
                    </div>
                </div>

                <div class="portal-btns-container">
                    <button id="blind-osce-btn" data-i18n="blind-osce-btn" class="portal-btn" style="background: linear-gradient(135deg, #f97316, #ea580c); color: white; border: none; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);">
                        จำลองการสอบแบบสุ่มเคส (Blind Case Encounter)
                    </button>
                    <button id="select-syndrome-btn" data-i18n="select-syndrome-btn" class="portal-btn" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; border: none; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                        เลือกเคสโรคสำหรับฝึกฝน (Selective Categories)
                    </button>
                    <button id="view-history-btn" data-i18n="view-history-btn" class="portal-btn" style="background: #ffffff; color: #2563eb; border: 1.5px solid #cbd5e1; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        รายงานและประวัติการฝึกฝนย้อนหลัง (My Activity History)
                    </button>
                </div>
            </div>

            <!-- Student History Screen -->
            <div id="history-screen" style="display: none; padding: 10px;">
                <div class="cases-header">
                    <h3 data-i18n="history-title" style="margin: 0; color: #333;">ประวัติการสอบและการฝึกฝนของคุณ</h3>
                    <button id="history-back-btn" data-i18n="back-btn" class="back-btn">ย้อนกลับ</button>
                </div>
                <div id="history-loading" data-i18n="history-loading" style="text-align: center; color: #64748b; padding: 40px 0; font-size: 14px;">
                    กำลังประมวลผลดึงประวัติการซักของคุณจากระบบ...
                </div>
                <div id="history-list-container" class="cards-grid" style="grid-template-columns: 1fr; max-height: 400px; overflow-y: auto;">
                    <!-- Historical rows will be loaded dynamically here -->
                </div>
            </div>

            <!-- Pre-Exam Configuration Gate Modal -->
            <div id="pre-exam-modal" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); z-index: 29000; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; border-radius: 15px; text-align: center;">
                <div class="auth-card" style="border: 1px solid #e2e8f0; background: #ffffff; max-width: 420px; text-align: left; color: #1e293b; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);">
                    <div class="auth-title" data-i18n="pre-exam-title" style="background: linear-gradient(135deg, #f97316, #ea580c); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 20px; font-weight: 800; margin-bottom: 16px; text-align: center;">เตรียมความพร้อมก่อนเข้าตรวจ</div>
                    
                    <div style="margin-bottom: 15px;">
                        <label data-i18n="pre-exam-select-label" style="font-weight: bold; color: #1e293b; font-size: 14px; display: block; margin-bottom: 8px;">
                            เลือกคลังบุคลิกภาพสำหรับเคสสอบนี้:
                        </label>
                        <select id="pre-exam-preset-select" style="display: none;">
                            <!-- Options populated dynamically by JS -->
                        </select>
                        
                        <!-- Pre-exam scrollable avatars -->
                        <div id="pre-exam-avatars-list" class="avatar-scroll-container"></div>
                        
                        <!-- Pre-exam details panel -->
                        <div id="pre-exam-details-panel" data-i18n="cases-loading" class="persona-details-panel" style="background: #f8fafc; border-color: #e2e8f0; color: #1e293b; margin-bottom: 15px;">
                            กำลังโหลดรายละเอียดบุคลิกภาพ...
                        </div>

                        <div style="display: flex; gap: 10px;">
                            <button id="pre-exam-customize-btn" data-i18n="customize-persona-btn" style="background-color: #2563eb; color: white; flex: 1; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
                                ปรับแต่งอารมณ์...
                            </button>
                            <button id="pre-exam-delete-persona-btn" data-i18n="delete-persona-btn" style="background-color: #ea580c; color: white; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: bold; border: none; cursor: pointer; display: none; align-items: center; justify-content: center; gap: 6px; transition: 0.2s;">
                                ลบบุคลิก
                            </button>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-top: 20px;">
                        <button id="pre-exam-cancel-btn" data-i18n="cancel-exam-btn" style="background: #64748b; color: white; flex: 1; padding: 12px; font-weight: bold; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; text-align: center; transition: background-color 0.2s;">ย้อนกลับ</button>
                        <button id="pre-exam-start-btn" data-i18n="start-exam-btn" style="background: linear-gradient(135deg, #f97316, #ea580c); color: white; flex: 1; padding: 12px; font-weight: bold; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; text-align: center; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.3); transition: transform 0.2s;">เริ่มสอบซักประวัติ</button>
                    </div>
                </div>
            </div>

            <!-- GGUF Parameter settings-drawer -->
            <div id="settings-drawer">
                <div class="drawer-header">
                    <h3 data-i18n="settings-drawer-title" style="margin: 0; color: #333;">แผงตั้งค่าและจำลองการแสดงออกของคนไข้</h3>
                    <span id="close-drawer-btn" style="font-size: 24px; cursor: pointer; color: #aaa;">&times;</span>
                </div>
                
                <!-- Hidden selectors to keep existing JS code fully functional without null pointer exceptions -->
                <div class="form-group" style="display: none;">
                    <label for="model-select">เลือกโมเดล (Ollama Model)</label>
                    <select id="model-select">
                        <option value="llama3.1:latest">Llama 3.1 8B (แนะนำ)</option>
                        <option value="deepseek-r1:1.5b">DeepSeek R1 1.5B (Intent)</option>
                        <option value="llama3:latest">Llama 3 8B</option>
                        <option value="custom" selected>ระบุโมเดลอื่น ๆ...</option>
                    </select>
                    <input type="text" id="model-custom" value="llama3.1:latest" style="margin-top: 8px; display: none;">
                </div>
                <div class="form-group" style="display: none;">
                    <label for="tier-select">เลือกโมเดลประมวลผล (AI Model Select)</label>
                    <select id="tier-select">
                        <option value="free">ระบบประมวลผลในเครื่อง (Local Ollama)</option>
                        <option value="paid">ระบบประมวลผลคลาวด์ภาษาไทย (Typhoon AI)</option>
                    </select>
                </div>
                <div class="form-group" style="display: none;">
                    <label for="temp-slider">อุณหภูมิ (Temperature) <span id="temp-val" class="slider-val">0.7</span></label>
                    <input type="range" id="temp-slider" min="0.1" max="1.5" step="0.1" value="0.7">
                </div>

                <!-- Difficulty Level Preset -->
                <div class="form-group" style="border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px;">
                    <label data-i18n="settings-difficulty-label" style="font-weight: bold; margin-bottom: 5px; font-size: 14px; color: #444;">ระดับความยากในการซักประวัติ</label>
                    <div class="difficulty-group">
                        <div class="difficulty-option">
                            <input type="radio" name="difficulty" id="diff-easy" value="easy">
                            <label for="diff-easy" data-i18n="settings-diff-easy" class="difficulty-label">ง่าย</label>
                        </div>
                        <div class="difficulty-option">
                            <input type="radio" name="difficulty" id="diff-medium" value="medium" checked>
                            <label for="diff-medium" data-i18n="settings-diff-medium" class="difficulty-label">ปานกลาง</label>
                        </div>
                        <div class="difficulty-option">
                            <input type="radio" name="difficulty" id="diff-hard" value="hard">
                            <label for="diff-hard" data-i18n="settings-diff-hard" class="difficulty-label">ยาก</label>
                        </div>
                    </div>
                    <span id="settings-diff-desc-span" data-i18n="settings-diff-desc" style="font-size: 11px; color: #64748b; display: block; margin-top: 4px; line-height: 1.4;">
                        • <b>ง่าย:</b> คนไข้ตอบตรงประเด็น ไม่นอกเรื่อง<br>
                        • <b>ปานกลาง:</b> ตอบตามประวัติปกติ มีลีลาตามอารมณ์พอดี<br>
                        • <b>ยาก:</b> คนไข้โยกโย้ บ่นกังวลสูง หรือเจ็บปวดมาก ต้องซักประวัติอย่างใส่ใจและใช้ความเข้าใจเห็นอกเห็นใจ
                    </span>
                </div>

                <!-- Dynamic Emotional Persona Settings Drawer Pane -->
                <div class="form-group" style="border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px;">
                    <label for="preset-select" data-i18n="settings-preset-label">เลือกแม่แบบบุคลิกภาพ</label>
                    <select id="preset-select">
                        <!-- Options populated dynamically by translateUI -->
                    </select>
                </div>

                <div class="form-group" id="emotion-sliders-group">
                    <label data-i18n="settings-emotion-title">ระดับการตอบสนองด้านอารมณ์พื้นฐาน</label>
                    
                    <div style="margin-bottom: 8px;">
                        <span style="font-size: 13px; color: #555;"><span data-i18n="settings-emotion-anger">ความโกรธ/ก้าวร้าว:</span> <span id="anger-val" class="slider-val">0%</span></span>
                        <input type="range" id="anger-slider" min="0" max="100" step="5" value="0" style="width: 100%;">
                    </div>
                    
                    <div style="margin-bottom: 8px;">
                        <span style="font-size: 13px; color: #555;"><span data-i18n="settings-emotion-sadness">ความเศร้า/อ่อนแอ:</span> <span id="sadness-val" class="slider-val">0%</span></span>
                        <input type="range" id="sadness-slider" min="0" max="100" step="5" value="0" style="width: 100%;">
                    </div>
                    
                    <div style="margin-bottom: 8px;">
                        <span style="font-size: 13px; color: #555;"><span data-i18n="settings-emotion-happiness">ความสุข/สงบนิ่ง:</span> <span id="happiness-val" class="slider-val">100%</span></span>
                        <input type="range" id="happiness-slider" min="0" max="100" step="5" value="100" style="width: 100%;">
                    </div>
                    
                    <div style="background: #e9ecef; padding: 8px; border-radius: 6px; font-size: 11px; color: #495057; margin-top: 10px;">
                        <b data-i18n="settings-pad-vectors">ค่าเวกเตอร์อารมณ์ PAD:</b> 
                        P: <span id="pad-p" style="font-weight: bold; color: #0d6efd;">1.00</span> | 
                        A: <span id="pad-a" style="font-weight: bold; color: #dc3545;">-0.50</span> | 
                        D: <span id="pad-d" style="font-weight: bold; color: #198754;">0.50</span>
                    </div>
                </div>

                <div class="form-group" style="border-top: 1px solid #eee; padding-top: 12px;">
                    <label for="prompt-textarea" data-i18n="settings-extra-instructions">ข้อกำหนดพฤติกรรมและการแสดงออกเพิ่มเติม</label>
                    <textarea id="prompt-textarea" data-i18n="settings-extra-placeholder" placeholder="ระบุพฤติกรรมเสริม เช่น 'คนไข้ปากเบี้ยวเล็กน้อยเวลากล่าว', 'อ่อนแรงครึ่งซีก', หรือ 'มีความอ่อนไหวง่าย ร้องไห้ง่ายมาก' เพื่อท้าทายทักษะการซักประวัติ"></textarea>
                    <span id="settings-extra-note-span" data-i18n="settings-extra-note" style="font-size: 11px; color: #888;">*หมายเหตุ: คำสั่งนี้จะส่งไปช่วยเสริมพฤติกรรมการแสดงออกของคนไข้สมมติ โดยไม่รบกวนบทยืนยันอาการหลักของเคสแพทย์จำลอง*</span>
                </div>

                <!-- Save to Bank Box -->
                <div class="form-group" style="border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-weight: bold; color: #334155;">
                        <input type="checkbox" id="save-to-bank-checkbox"> <span data-i18n="settings-save-bank">บันทึกการปรับจูนลงในคลังเก็บข้อมูลส่วนตัว</span>
                    </label>
                    
                    <div id="bank-input-group" style="display: none; margin-top: 10px; background: #f1f5f9; padding: 12px; border-radius: 8px; border: 1px solid #cbd5e1;">
                        <label for="bank-persona-name" style="font-size: 13px; font-weight: bold; margin-bottom: 6px; display: block; color: #334155;">ชื่อบุคลิกภาพจำลองที่ต้องการบันทึก:</label>
                        <input type="text" id="bank-persona-name" class="form-control" placeholder="เช่น หงุดหงิดเจ็บแผลรุนแรง..." style="margin-bottom: 10px; background-color: white; border: 1px solid #cbd5e1; color: #334155; width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 6px;">
                        
                        <div id="bank-replace-section" style="display: none; margin-top: 10px;">
                            <span style="font-size: 12px; color: #e11d48; font-weight: bold; display: block; margin-bottom: 6px;">[คำเตือน] คลังเต็มแล้ว (จำกัดสูงสุด 5 บุคลิก) กรุณาเลือกบุคลิกที่จะถูกเขียนทับแทนที่:</span>
                            <div id="bank-replace-radios" style="display: flex; flex-direction: column; gap: 6px;">
                                <!-- Dynamically generated radio buttons -->
                            </div>
                        </div>
                    </div>
                </div>

                <div style="text-align: center; margin-top: 15px;">
                    <button id="save-settings-btn" data-i18n="settings-save-btn" style="background-color: #198754; width: 100%;">บันทึกการปรับจูน</button>
                </div>
            </div>

            <!-- Disclaimer Warning Modal -->
            <div id="disclaimer-modal" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(8px); z-index: 30000; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; border-radius: 15px; text-align: center;">
                <div class="auth-card" style="border: 1px solid #e2e8f0; background: #ffffff; max-width: 360px; color: #1e293b; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);">
                    <div class="auth-title" style="background: linear-gradient(135deg, #f59e0b, #d97706); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 18px; font-weight: 800;">ข้อตกลงและโควต้าการใช้งานระบบคลาวด์ (Cloud AI Quota)</div>
                    <div class="auth-desc" style="font-size: 13px; color: #475569; line-height: 1.5; margin-bottom: 20px;">
                        คุณกำลังสลับไปเปิดใช้งานโมเดลภาษาไทยอัจฉริยะในคลาวด์ ซึ่งมีข้อจำกัดด้านโควต้าทรัพยากร:<br>
                        • จำกัดคำถามสูงสุด <b>30 ข้อความต่อหนึ่งรอบสอบ</b><br>
                        • จำกัดคำถามสูงสุด <b>50 ข้อความต่อคนต่อวัน</b><br>
                        <small style="color: #ea580c; display: block; margin-top: 8px; font-weight: 600;">*หากใช้เต็มโควต้าระบบจะปรับสลับเป็นโมเดลโลคอล Ollama รันฟรีอัตโนมัติ</small>
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button id="disclaimer-cancel-btn" style="background: #64748b; color: white; flex: 1; padding: 12px; font-weight: bold; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; transition: 0.2s;">กลับไปใช้โลคอล</button>
                        <button id="disclaimer-accept-btn" style="background: linear-gradient(135deg, #fbbf24, #f59e0b); color: white; flex: 1; padding: 12px; font-weight: bold; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3); transition: 0.2s;">ยอมรับโควต้า</button>
                    </div>
                </div>
            </div>

            <!-- Specific Syndrome case selection cards grid -->
            <div id="cases-grid-screen" style="display: none;">
                <div class="cases-header">
                    <h3 data-i18n="select-case-title" style="margin: 0; color: #333;">เลือกเคสคนไข้จำลอง</h3>
                    <button id="back-to-portal-btn" data-i18n="back-btn" class="back-btn">ย้อนกลับ</button>
                </div>
                <div id="cases-loading" data-i18n="cases-loading" style="text-align: center; color: #64748b; padding: 40px 0; font-size: 14px;">
                    กำลังประมวลผลดึงกลุ่มโรคเวกเตอร์...
                </div>
                <div id="cases-cards-container" class="cards-grid">
                    <!-- Syndromes list cards dynamically loaded here -->
                </div>
            </div>
            
            <button id="settings-btn" title="ตั้งค่าอาการและอารมณ์คนไข้จำลอง" style="display: block; font-size: 14px; font-weight: bold; background-color: #334155; border-radius: 6px; padding: 6px 12px; border: none; color: white;">ตั้งค่าอารมณ์</button>
            <div class="widget-container" style="display: none;">
                <div style="position: relative; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px; min-height: 40px; padding-right: 150px; box-sizing: border-box; text-align: left; display: block;">
                    <h2 data-i18n="widget-title" style="margin: 0; color: #1e3a8a; font-weight: 800; font-size: 20px; line-height: 1.2;">ห้องสอบซักประวัติด้วย AI (OSCE)</h2>
                    <div style="position: absolute; top: 0; right: 0; display: flex; gap: 4px; z-index: 10;">
                        <button class="lang-btn" data-lang="th" style="padding: 5px 10px; font-size: 11.5px; font-weight: bold; border-radius: 6px; cursor: pointer; border: 1.5px solid #cbd5e1; transition: 0.2s; background-color: #ea580c; color: white;">ภาษาไทย</button>
                        <button class="lang-btn" data-lang="en" style="padding: 5px 10px; font-size: 11.5px; font-weight: bold; border-radius: 6px; cursor: pointer; border: 1.5px solid #cbd5e1; transition: 0.2s; background-color: #ffffff; color: #475569;">English</button>
                    </div>
                </div>
                <div id="quota-tracker-bar">☁️ กำลังตรวจสอบโควต้าประมวลผล...</div>
                <div id="chat-box"></div>
                
                <!-- Model Display Info below Chat Box -->
                <div id="model-display-info" style="font-size: 12px; color: #475569; margin-top: 6px; margin-bottom: 8px; font-weight: 500; text-align: left; display: flex; align-items: center; gap: 6px; padding: 6px 10px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                    <span data-i18n="model-display-label">🤖 โมเดลตอบสนองคนไข้:</span>
                    <span id="active-model-name" data-i18n="model-display-waiting" style="color: #2563eb; font-weight: 700;">(รอเริ่มต้นบทสนทนา...)</span>
                </div>

                <!-- Physical Exam & Lab Request Panel -->
                <div id="exam-labs-panel" style="margin-top: 5px; margin-bottom: 12px; border: 1.5px solid #cbd5e1; border-radius: 8px; overflow: hidden; background-color: #ffffff; font-family: inherit;">
                    <div class="tabs-header" style="display: flex; background-color: #f8fafc; border-bottom: 1.5px solid #cbd5e1;">
                        <button type="button" id="tab-btn-pe" style="flex: 1; padding: 10px; border: none; background-color: #ffffff; font-weight: bold; cursor: pointer; font-size: 13px; color: #1e3a8a; border-right: 1px solid #e2e8f0; outline: none; transition: 0.2s;" data-i18n="tab-pe">🩺 ตรวจร่างกาย (Physical Exam)</button>
                        <button type="button" id="tab-btn-labs" style="flex: 1; padding: 10px; border: none; background-color: #f8fafc; font-weight: bold; cursor: pointer; font-size: 13px; color: #64748b; outline: none; transition: 0.2s;" data-i18n="tab-labs">🔬 ส่งตรวจแล็บ (Lab & Imaging)</button>
                    </div>
                    
                    <!-- Tab content for PE -->
                    <div id="tab-content-pe" style="padding: 12px; display: block; text-align: left;">
                        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;" data-i18n="pe-instruction">เลือกตำแหน่งอวัยวะเพื่อเริ่มการตรวจร่างกายจำลอง:</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                            <button type="button" class="pe-action-btn" data-target="General Appearance" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">General</button>
                            <button type="button" class="pe-action-btn" data-target="Chest & Lungs" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">Lungs</button>
                            <button type="button" class="pe-action-btn" data-target="Heart" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">Heart</button>
                            <button type="button" class="pe-action-btn" data-target="Abdomen" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">Abdomen</button>
                            <button type="button" class="pe-action-btn" data-target="Neurological" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">Neuro</button>
                            <button type="button" class="pe-action-btn" data-target="HEENT" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">HEENT</button>
                        </div>
                    </div>
                    
                    <!-- Tab content for Labs -->
                    <div id="tab-content-labs" style="padding: 12px; display: none; text-align: left;">
                        <div style="font-size: 11px; color: #64748b; margin-bottom: 8px;" data-i18n="labs-instruction">เลือกผลแล็บหรือฟิล์มตรวจเพิ่มเติมจำลอง:</div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                            <button type="button" class="lab-action-btn" data-target="CBC" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">CBC</button>
                            <button type="button" class="lab-action-btn" data-target="EKG" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">EKG</button>
                            <button type="button" class="lab-action-btn" data-target="Chest X-Ray" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">CXR</button>
                            <button type="button" class="lab-action-btn" data-target="Urinalysis" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">UA</button>
                            <button type="button" class="lab-action-btn" data-target="Liver Function Test" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">LFT</button>
                            <button type="button" class="lab-action-btn" data-target="Electrolytes" style="padding: 8px; font-size: 11px; border-radius: 6px; border: 1px solid #cbd5e1; background-color: #f8fafc; font-weight: bold; cursor: pointer; color: #334155; transition: 0.2s;">Electrolyte</button>
                        </div>
                    </div>
                </div>
                
                <!-- Chat Input Row: Text field + Send Button + Mic Button -->
                <div id="chat-input-row" style="display: flex; gap: 8px; align-items: center; width: 100%; box-sizing: border-box; margin-bottom: 12px;">
                    <input type="text" id="chat-text-input" data-i18n="chat-input-placeholder" placeholder="พิมพ์คำถามซักประวัติที่นี่ หรือกดไมค์เพื่อพูด..." style="flex: 1; padding: 12px 14px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; transition: border-color 0.2s; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); font-family: inherit; color: #1e293b;">
                    <button id="chat-send-btn" data-i18n="chat-send-btn" style="background-color: #2563eb; color: white; border: none; border-radius: 8px; padding: 12px 18px; font-size: 14px; font-weight: bold; cursor: pointer; transition: background-color 0.2s; white-space: nowrap; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.15); margin: 0;">ส่ง</button>
                    <button id="mic-btn" style="background-color: #f1f5f9; color: #475569; border: 1.5px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; transition: all 0.2s; flex-shrink: 0; margin: 0; white-space: nowrap;">🎤 คลิกเพื่อพูด</button>
                </div>
                
                <div class="btn-container">
                    <button id="cancel-portal-btn" data-i18n="cancel-portal-btn" style="background-color: #dc3545; display: none;">ยกเลิกการตรวจและกลับหน้าหลัก</button>
                    <button id="end-btn" data-i18n="end-btn" style="background-color: #6c757d;">เสร็จสิ้นการซักประวัติ (End Encounter)</button>
                    <button id="new-btn" data-i18n="new-btn" style="background-color: #198754; display: none;">เข้าตรวจคนไข้เคสใหม่</button>
                    <button id="view-eval-btn" data-i18n="view-eval-btn" style="background-color: #ffc107; color: #000; display: none;">แสดงผลการประเมินความสามารถ (Show Evaluation)</button>
                    <button id="portal-btn" data-i18n="portal-btn" style="background-color: #0d6efd; display: none;">กลับสู่หน้าหลัก</button>
                    <span id="status" data-i18n="status-connecting">กำลังเชื่อมต่อ...</span>
                </div>

                <!-- Generic Connection Error Screen -->
                <div id="setup-wizard">
                    <div class="wizard-title">ตรวจไม่พบการเชื่อมต่อกับเซิร์ฟเวอร์หลังบ้าน</div>
                    <p style="font-size: 13px; color: #555; margin-bottom: 20px;">
                        ไม่สามารถติดต่อเซิร์ฟเวอร์ระบบได้ กรุณาติดต่อผู้ดูแลระบบหรืออาจารย์ผู้คุมสอบ
                    </p>
                    <div style="margin-top: 25px;">
                        <button id="retry-conn-btn" style="background-color: #dc3545; width: 100%; padding: 12px; font-weight: bold;">พยายามเชื่อมต่อใหม่อีกครั้ง</button>
                    </div>
                </div>
            </div>

            <!-- Confidence Calibration Modal -->
            <div id="confidence-modal" class="auth-overlay" style="display: none; align-items: center; justify-content: center; z-index: 1000; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.5);">
                <div style="background: white; border-radius: 12px; padding: 25px; max-width: 400px; width: 90%; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.15); box-sizing: border-box;">
                    <h3 style="margin-top: 0; color: #1e3a8a;" data-i18n="conf-modal-title">วิเคราะห์วินิจฉัยและประเมินระดับความมั่นใจ</h3>
                    <p style="font-size: 12px; color: #64748b; margin-bottom: 15px;" data-i18n="conf-modal-desc">ระบุวินิจฉัยและประเมินระดับความมั่นใจของคุณก่อนส่งตรวจประเมิน:</p>
                    
                    <div style="margin-bottom: 15px; text-align: left;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;" data-i18n="conf-diagnosis-label">ผลวินิจฉัยโรคของคุณ (Suspected Diagnosis):</label>
                        <input type="text" id="conf-diagnosis-input" placeholder="ตัวอย่าง: Appendicitis" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 6px; font-size: 13px; margin-top: 4px; box-sizing: border-box; font-family: inherit;">
                    </div>
                    
                    <div style="margin-bottom: 20px; text-align: left;">
                        <label style="font-size: 12px; font-weight: bold; color: #475569;" data-i18n="conf-score-label">ระดับความมั่นใจ (Confidence Score):</label>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 6px;">
                            <input type="range" id="conf-score-input" min="0" max="100" value="80" style="flex: 1; cursor: pointer;">
                            <span id="conf-score-val" style="font-weight: bold; font-size: 14px; color: #2563eb; min-width: 40px; text-align: right;">80%</span>
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px;">
                        <button type="button" id="conf-cancel-btn" style="flex: 1; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; background-color: #f1f5f9; color: #475569; font-weight: bold; cursor: pointer; font-size: 13px; font-family: inherit;" data-i18n="conf-btn-cancel">กลับไปแชทต่อ</button>
                        <button type="button" id="conf-submit-btn" style="flex: 1; padding: 10px; border: none; border-radius: 6px; background-color: #2563eb; color: white; font-weight: bold; cursor: pointer; font-size: 13px; font-family: inherit;" data-i18n="conf-btn-submit">ยืนยันผลสอบ</button>
                    </div>
                </div>
            </div>

            <!-- Evaluation Modal -->
            <div id="eval-modal">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2 data-i18n="eval-title" style="text-align: center;">รายงานและประเมินผลการซักประวัติคนไข้</h2>
                    <div id="eval-results">
                        <!-- Results will be injected here -->
                    </div>
                </div>
            </div>
            <!-- Access passcode gateway screen -->
            <div id="auth-gate-screen" class="auth-overlay" style="display: flex;">
                <div class="auth-card" style="border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(15, 23, 42, 0.95);">
                    <div class="auth-title" style="background: linear-gradient(135deg, #f87171, #ef4444); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 20px; font-weight: 800; margin-bottom: 12px;">กรุณาเข้าสู่ระบบผ่านเว็บไซต์หลัก</div>
                    <div class="auth-desc" style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                        ระบบตรวจไม่พบสิทธิ์และรหัสประจำตัวนักศึกษาของคุณ<br>
                        กรุณาล็อกอินเข้าสู่เว็บไซต์หลักของสถาบันเพื่อเรียกใช้งานเครื่องมือซักประวัติแพทย์จำลอง (OSCE)
                    </div>
                </div>
            </div>
        `;
    }
    setupElements() {
        this.chatBox = this.shadowDOM.getElementById('chat-box');
        this.quotaTrackerBar = this.shadowDOM.getElementById('quota-tracker-bar');
        this.activeModelName = this.shadowDOM.getElementById('active-model-name');
        this.status = this.shadowDOM.getElementById('status');
        this.micBtn = this.shadowDOM.getElementById('mic-btn');
        this.endBtn = this.shadowDOM.getElementById('end-btn');
        this.newBtn = this.shadowDOM.getElementById('new-btn');
        this.viewEvalBtn = this.shadowDOM.getElementById('view-eval-btn');
        this.portalBtn = this.shadowDOM.getElementById('portal-btn');
        this.evalModal = this.shadowDOM.getElementById('eval-modal');
        this.closeBtn = this.shadowDOM.querySelector('.close');
        this.evalResults = this.shadowDOM.getElementById('eval-results');
        
        // Auth elements
        this.authGateScreen = this.shadowDOM.getElementById('auth-gate-screen');
        
        // Models dropdowns
        this.tierSelect = this.shadowDOM.getElementById('tier-select');
        this.portalTierSelect = this.shadowDOM.getElementById('portal-tier-select');
        this.forceOfflineToggle = this.shadowDOM.getElementById('force-offline-toggle');
        
        // Settings elements
        this.settingsBtn = this.shadowDOM.getElementById('settings-btn');
        this.settingsDrawer = this.shadowDOM.getElementById('settings-drawer');
        this.closeDrawerBtn = this.shadowDOM.getElementById('close-drawer-btn');
        this.modelSelect = this.shadowDOM.getElementById('model-select');
        this.modelCustom = this.shadowDOM.getElementById('model-custom');
        this.tempSlider = this.shadowDOM.getElementById('temp-slider');
        this.tempVal = this.shadowDOM.getElementById('temp-val');
        this.promptTextarea = this.shadowDOM.getElementById('prompt-textarea');
        this.saveSettingsBtn = this.shadowDOM.getElementById('save-settings-btn');
        
        // Difficulty preset radio elements
        this.diffEasyRadio = this.shadowDOM.getElementById('diff-easy');
        this.diffMediumRadio = this.shadowDOM.getElementById('diff-medium');
        this.diffHardRadio = this.shadowDOM.getElementById('diff-hard');
        
        // Emotion panel elements
        this.presetSelect = this.shadowDOM.getElementById('preset-select');
        this.angerSlider = this.shadowDOM.getElementById('anger-slider');
        this.angerVal = this.shadowDOM.getElementById('anger-val');
        this.sadnessSlider = this.shadowDOM.getElementById('sadness-slider');
        this.sadnessVal = this.shadowDOM.getElementById('sadness-val');
        this.happinessSlider = this.shadowDOM.getElementById('happiness-slider');
        this.happinessVal = this.shadowDOM.getElementById('happiness-val');
        this.padPText = this.shadowDOM.getElementById('pad-p');
        this.padAText = this.shadowDOM.getElementById('pad-a');
        this.padDText = this.shadowDOM.getElementById('pad-d');
        
        // Wizard elements
        this.setupWizard = this.shadowDOM.getElementById('setup-wizard');
        this.retryConnBtn = this.shadowDOM.getElementById('retry-conn-btn');
        
        // Pre-Encounter Portal elements
        this.portalScreen = this.shadowDOM.getElementById('portal-screen');
        this.casesGridScreen = this.shadowDOM.getElementById('cases-grid-screen');
        this.casesCardsContainer = this.shadowDOM.getElementById('cases-cards-container');
        this.casesLoading = this.shadowDOM.getElementById('cases-loading');
        this.blindOsceBtn = this.shadowDOM.getElementById('blind-osce-btn');
        this.selectSyndromeBtn = this.shadowDOM.getElementById('select-syndrome-btn');
        this.backToPortalBtn = this.shadowDOM.getElementById('back-to-portal-btn');
        this.widgetContainer = this.shadowDOM.querySelector('.widget-container');

        // History elements
        this.viewHistoryBtn = this.shadowDOM.getElementById('view-history-btn');
        this.historyScreen = this.shadowDOM.getElementById('history-screen');
        this.historyBackBtn = this.shadowDOM.getElementById('history-back-btn');
        this.historyListContainer = this.shadowDOM.getElementById('history-list-container');
        this.historyLoading = this.shadowDOM.getElementById('history-loading');
        
        // Disclaimer elements
        this.disclaimerModal = this.shadowDOM.getElementById('disclaimer-modal');
        this.disclaimerAcceptBtn = this.shadowDOM.getElementById('disclaimer-accept-btn');
        this.disclaimerCancelBtn = this.shadowDOM.getElementById('disclaimer-cancel-btn');

        // NEW: Phase 4.2 Elements
        this.cancelPortalBtn = this.shadowDOM.getElementById('cancel-portal-btn');
        this.portalPresetSelect = this.shadowDOM.getElementById('persona-preset-select');
        this.customizePersonaBtn = this.shadowDOM.getElementById('customize-persona-btn');
        this.saveToBankCheckbox = this.shadowDOM.getElementById('save-to-bank-checkbox');
        this.bankInputGroup = this.shadowDOM.getElementById('bank-input-group');
        this.bankPersonaName = this.shadowDOM.getElementById('bank-persona-name');
        this.bankReplaceSection = this.shadowDOM.getElementById('bank-replace-section');
        this.bankReplaceRadios = this.shadowDOM.getElementById('bank-replace-radios');

        // Pre-Exam Modal elements
        this.preExamModal = this.shadowDOM.getElementById('pre-exam-modal');
        this.preExamPresetSelect = this.shadowDOM.getElementById('pre-exam-preset-select');
        this.preExamSummaryBadge = this.shadowDOM.getElementById('pre-exam-summary-badge');
        this.preExamCustomizeBtn = this.shadowDOM.getElementById('pre-exam-customize-btn');
        this.preExamCancelBtn = this.shadowDOM.getElementById('pre-exam-cancel-btn');
        this.preExamStartBtn = this.shadowDOM.getElementById('pre-exam-start-btn');
        this.deletePersonaBtn = this.shadowDOM.getElementById('delete-persona-btn');
        this.preExamDeletePersonaBtn = this.shadowDOM.getElementById('pre-exam-delete-persona-btn');

        this.disclaimerCancelBtn = this.shadowDOM.getElementById('disclaimer-cancel-btn');

        // Text input & send button setup
        this.chatTextInput = this.shadowDOM.getElementById('chat-text-input');
        this.chatSendBtn = this.shadowDOM.getElementById('chat-send-btn');

        if (this.chatSendBtn) {
            this.chatSendBtn.addEventListener('click', () => this.sendTextMessage());
        }
        if (this.chatTextInput) {
            this.chatTextInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    this.sendTextMessage();
                }
            });
        }

        // Resolve pivoted Phase 4 elements
        this.tabBtnPe = this.shadowDOM.getElementById('tab-btn-pe');
        this.tabBtnLabs = this.shadowDOM.getElementById('tab-btn-labs');
        this.tabContentPe = this.shadowDOM.getElementById('tab-content-pe');
        this.tabContentLabs = this.shadowDOM.getElementById('tab-content-labs');

        this.confidenceModal = this.shadowDOM.getElementById('confidence-modal');
        this.confDiagnosisInput = this.shadowDOM.getElementById('conf-diagnosis-input');
        this.confScoreInput = this.shadowDOM.getElementById('conf-score-input');
        this.confScoreVal = this.shadowDOM.getElementById('conf-score-val');
        this.confCancelBtn = this.shadowDOM.getElementById('conf-cancel-btn');
        this.confSubmitBtn = this.shadowDOM.getElementById('conf-submit-btn');

        // Tab switching listeners
        if (this.tabBtnPe && this.tabBtnLabs) {
            this.tabBtnPe.addEventListener('click', () => {
                this.tabContentPe.style.display = 'block';
                this.tabContentLabs.style.display = 'none';
                this.tabBtnPe.style.backgroundColor = '#ffffff';
                this.tabBtnPe.style.color = '#1e3a8a';
                this.tabBtnLabs.style.backgroundColor = '#f8fafc';
                this.tabBtnLabs.style.color = '#64748b';
            });
            this.tabBtnLabs.addEventListener('click', () => {
                this.tabContentPe.style.display = 'none';
                this.tabContentLabs.style.display = 'block';
                this.tabBtnPe.style.backgroundColor = '#f8fafc';
                this.tabBtnPe.style.color = '#64748b';
                this.tabBtnLabs.style.backgroundColor = '#ffffff';
                this.tabBtnLabs.style.color = '#1e3a8a';
            });
        }

        // Calibration slider event listener
        if (this.confScoreInput) {
            this.confScoreInput.addEventListener('input', (e) => {
                this.confScoreVal.innerText = e.target.value + '%';
            });
        }

        // Calibration modal buttons
        if (this.confCancelBtn) {
            this.confCancelBtn.addEventListener('click', () => {
                this.confidenceModal.style.display = 'none';
            });
        }
        if (this.confSubmitBtn) {
            this.confSubmitBtn.addEventListener('click', () => {
                const diagnosis = this.confDiagnosisInput.value.trim();
                const confidence = this.confScoreInput.value;
                this.confidenceModal.style.display = 'none';
                this.sendViaWS("__END_SESSION__");
                this.showSessionEndedState();
                this.submitEvaluation(diagnosis, confidence);
            });
        }

        // Physical Exam action buttons
        const peBtns = this.shadowDOM.querySelectorAll('.pe-action-btn');
        peBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-target');
                this.performEncounterAction('physical_exam', target);
            });
        });

        // Lab action buttons
        const labBtns = this.shadowDOM.querySelectorAll('.lab-action-btn');
        labBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-target');
                this.performEncounterAction('lab_test', target);
            });
        });

        // Language toggle listeners
        const langBtns = this.shadowDOM.querySelectorAll('.lang-btn');
        langBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const newLang = e.currentTarget.getAttribute('data-lang');
                this.currentLanguage = newLang;
                this.updateLangUIState();
            });
        });

        // Main Event listeners
        this.micBtn.addEventListener('click', () => this.toggleDictation());
        this.micBtn.style.backgroundColor = "#f1f5f9";
        this.micBtn.style.color = "#475569";
        this.micBtn.innerText = "🎤 คลิกเพื่อพูด";
        this.endBtn.addEventListener('click', () => this.endSimulation());
        this.newBtn.addEventListener('click', () => this.newSimulation());
        this.viewEvalBtn.addEventListener('click', () => this.showEvaluation());
        this.portalBtn.addEventListener('click', () => {
            this.closeConnections();
            this.showScreen('portal');
        });
        this.closeBtn.addEventListener('click', () => this.closeModal());
        
        // Drawer toggle listeners
        this.settingsBtn.addEventListener('click', () => this.openDrawer());
        this.closeDrawerBtn.addEventListener('click', () => this.closeDrawer());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        

        
        // Portal Event listeners
        this.blindOsceBtn.addEventListener('click', () => this.startSimulationWithCase(null));
        this.selectSyndromeBtn.addEventListener('click', () => this.loadSyndromesList());
        this.backToPortalBtn.addEventListener('click', () => this.showScreen('portal'));
        
        // Student History listeners
        this.viewHistoryBtn.addEventListener('click', () => this.loadStudentHistory());
        this.historyBackBtn.addEventListener('click', () => this.showScreen('portal'));
        
        // NEW: Phase 4.2 Event listeners
        this.cancelPortalBtn.addEventListener('click', () => {
            this.closeConnections();
            this.showScreen('portal');
        });
        this.portalPresetSelect.addEventListener('change', () => this.handlePersonaChange());
        this.customizePersonaBtn.addEventListener('click', () => this.openDrawer());
        this.saveToBankCheckbox.addEventListener('change', (e) => this.toggleBankInputGroup(e.target.checked));

        // Pre-Exam Modal listeners
        this.preExamPresetSelect.addEventListener('change', () => this.handlePreExamPersonaChange());
        this.preExamCustomizeBtn.addEventListener('click', () => this.openDrawer());
        this.preExamCancelBtn.addEventListener('click', () => {
            this.preExamModal.style.display = 'none';
        });
        this.preExamStartBtn.addEventListener('click', () => {
            this.preExamModal.style.display = 'none';
            this.launchSimulationRoom(this.selectedCaseId);
        });
        this.deletePersonaBtn.addEventListener('click', () => this.deleteSelectedPersona());
        this.preExamDeletePersonaBtn.addEventListener('click', () => this.deleteSelectedPersona());

        // Update temp text value
        this.tempSlider.addEventListener('input', (e) => {
            this.tempVal.innerText = e.target.value;
        });
        
        // Toggle custom model input field
        this.modelSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                this.modelCustom.style.display = 'block';
            } else {
                this.modelCustom.style.display = 'none';
            }
        });
        
        // Emotion Presets listener
        this.presetSelect.addEventListener('change', (e) => this.applyPreset(e.target.value));
        
        // Manual emotion sliders listener
        const updatePAD = () => {
            this.presetSelect.value = 'custom';
            this.calculatePAD();
        };
        this.angerSlider.addEventListener('input', (e) => {
            this.angerVal.innerText = e.target.value + "%";
            updatePAD();
        });
        this.sadnessSlider.addEventListener('input', (e) => {
            this.sadnessVal.innerText = e.target.value + "%";
            updatePAD();
        });
        this.happinessSlider.addEventListener('input', (e) => {
            this.happinessVal.innerText = e.target.value + "%";
            updatePAD();
        });
        
        // Wizard tab listeners removed
        this.retryConnBtn.addEventListener('click', () => {
            this.setupWizard.style.display = 'none';
            this.connectWS();
        });
        
        // Bind copy buttons inside wizard and guidebook
        this.shadowDOM.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = btn.getAttribute('data-code');
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = btn.innerText;
                    btn.innerText = "✓ สำเร็จ";
                    btn.style.backgroundColor = "#198754";
                    setTimeout(() => {
                        btn.innerText = originalText;
                        btn.style.backgroundColor = "";
                    }, 1500);
                });
            });
        });

        // Initialize default tier selectors UI & listeners
        const handleTierChange = (newVal, selectElement) => {
            if (newVal === 'paid') {
                this.disclaimerModal.style.display = 'flex';
                this.pendingSelect = selectElement;
            } else {
                this.apiTier = 'free';
                this.tierSelect.value = 'free';
                this.portalTierSelect.value = 'free';
            }
        };

        this.portalTierSelect.value = this.apiTier;
        this.tierSelect.value = this.apiTier;

        this.portalTierSelect.addEventListener('change', (e) => {
            handleTierChange(e.target.value, this.portalTierSelect);
        });

        this.tierSelect.addEventListener('change', (e) => {
            handleTierChange(e.target.value, this.tierSelect);
        });

        this.disclaimerAcceptBtn.addEventListener('click', () => {
            this.apiTier = 'paid';
            this.tierSelect.value = 'paid';
            this.portalTierSelect.value = 'paid';
            this.disclaimerModal.style.display = 'none';
        });

        this.disclaimerCancelBtn.addEventListener('click', () => {
            this.tierSelect.value = 'free';
            this.portalTierSelect.value = 'free';
            this.apiTier = 'free';
            this.disclaimerModal.style.display = 'none';
        });

        // Initialize Prompt text area & sliders value
        this.promptTextarea.value = this.customPrompt;
        this.applyPreset('cooperative'); // Default cooperative calm baseline
    }

    showScreen(screenName) {
        this.portalScreen.style.display = 'none';
        this.casesGridScreen.style.display = 'none';
        this.widgetContainer.style.display = 'none';
        this.historyScreen.style.display = 'none';
        
        if (screenName === 'portal') {
            this.portalScreen.style.display = 'block';
            this.settingsBtn.style.display = 'block';
        } else if (screenName === 'selective') {
            this.casesGridScreen.style.display = 'block';
            this.settingsBtn.style.display = 'block';
        } else if (screenName === 'chat') {
            this.widgetContainer.style.display = 'block';
            this.settingsBtn.style.display = 'none'; // strictly hide settings cog in exam room
        } else if (screenName === 'history') {
            this.historyScreen.style.display = 'block';
            this.settingsBtn.style.display = 'none';
        }
    }

    async loadSyndromesList() {
        this.showScreen('selective');
        this.casesLoading.style.display = 'block';
        this.casesCardsContainer.innerHTML = "";
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`, { headers: { 'ngrok-skip-browser-warning': '1' } });
            this.casesList = await response.json();
            
            this.casesLoading.style.display = 'none';
            
            if (this.casesList.length === 0) {
                this.casesCardsContainer.innerHTML = this.currentLanguage === 'en'
                    ? "<p style='text-align:center; grid-column: 1/-1;'>❌ No cases found in database</p>"
                    : "<p style='text-align:center; grid-column: 1/-1;'>❌ ไม่พบเคสจำลองในฐานข้อมูล</p>";
                return;
            }
            
            this.renderCasesList();
        } catch (e) {
            console.error("Failed to load syndromes:", e);
            this.casesLoading.style.display = 'none';
            this.casesCardsContainer.innerHTML = this.currentLanguage === 'en'
                ? "<p style='text-align:center; grid-column: 1/-1; color:red;'>❌ Failed to fetch cases, check server connection</p>"
                : "<p style='text-align:center; grid-column: 1/-1; color:red;'>❌ ดึงข้อมูลเคสผิดพลาด ตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์</p>";
        }
    }

    renderCasesList() {
        if (!this.casesCardsContainer || !this.casesList) return;
        this.casesCardsContainer.innerHTML = "";
        
        const lang = this.currentLanguage || 'th';
        
        this.casesList.forEach(c => {
            const localizedCase = this.translateCaseContent(c, lang);
            
            const card = document.createElement('div');
            card.className = 'case-card';
            card.addEventListener('click', () => this.startSimulationWithCase(localizedCase.id));
            
            // Color code category badges
            let badgeClass = 'badge-fallback';
            const originalCat = c.category || '';
            if (originalCat.includes("Abdominal") || originalCat.includes("ท้อง")) {
                badgeClass = 'badge-abdomen';
            } else if (originalCat.includes("Counseling") || originalCat.includes("ปรึกษา")) {
                badgeClass = 'badge-counseling';
            } else if (originalCat.includes("General") || originalCat.includes("ทั่วไป")) {
                badgeClass = 'badge-general';
            }
            
            const chiefComplaintLabel = lang === 'en' ? 'Chief Complaint:' : 'อาการสำคัญ:';
            
            card.innerHTML = `
                <div class="case-card-left">
                    <span class="badge ${badgeClass}">${localizedCase.category}</span>
                    <h4 class="case-title">${localizedCase.scenario_name}</h4>
                </div>
                <div class="case-card-right">
                    <p class="case-desc"><b>${chiefComplaintLabel}</b> ${localizedCase.chief_complaint}</p>
                </div>
            `;
            this.casesCardsContainer.appendChild(card);
        });
    }

    translateCaseContent(c, lang) {
        const caseCopy = { ...c };
        
        // 1. Localize Category
        let category = caseCopy.category || '';
        const staticCategories = {
            'th': {
                'เคสทั่วไป (GENERAL MEDICINE)': 'เคสทั่วไป',
                'GENERAL MEDICINE': 'เคสทั่วไป',
                'General Medicine': 'เคสทั่วไป',
                'General': 'เคสทั่วไป',
                'counseling': 'การให้คำปรึกษา',
                'Counseling': 'การให้คำปรึกษา',
                'Abdomen': 'ระบบทางเดินอาหาร',
                'abdomen': 'ระบบทางเดินอาหาร',
                'ทั่วไป': 'เคสทั่วไป',
                'ปรึกษา': 'การให้คำปรึกษา',
                'ท้อง': 'ระบบทางเดินอาหาร'
            },
            'en': {
                'เคสทั่วไป (GENERAL MEDICINE)': 'General Medicine',
                'GENERAL MEDICINE': 'General Medicine',
                'General Medicine': 'General Medicine',
                'General': 'General Medicine',
                'counseling': 'Counseling',
                'Counseling': 'Counseling',
                'Abdomen': 'Abdominal',
                'abdomen': 'Abdominal',
                'ทั่วไป': 'General Medicine',
                'ปรึกษา': 'Counseling',
                'ท้อง': 'Abdominal',
                'เคสทั่วไป': 'General Medicine',
                'การให้คำปรึกษา': 'Counseling',
                'ระบบทางเดินอาหาร': 'Abdominal'
            }
        };
        
        if (staticCategories[lang] && staticCategories[lang][category]) {
            caseCopy.category = staticCategories[lang][category];
        } else {
            caseCopy.category = this.cleanOrExtractLanguage(category, lang);
        }
        
        // 2. Localize Scenario Name
        let name = caseCopy.scenario_name || '';
        const staticScenarios = {
            'th': {
                'Atrial Fibrillation': 'ภาวะหัวใจห้องบนสั่นพลิ้ว',
                'Essential hypertension': 'โรคความดันโลหิตสูงปฐมภูมิ',
                'Physiological jaundice หรือ ABO incompatibility': 'ภาวะตัวเหลืองตามธรรมชาติ หรือกลุ่มเลือดเข้ากันไม่ได้'
            },
            'en': {
                'โรคไตหรือโรคหัวใจ': 'Kidney or Heart Disease',
                'ภาวะน้ำตาลในเลือดต่ำ หรือหัวใจเต้นผิดจังหวะ': 'Hypoglycemia or Arrhythmia',
                'ฝากครรภ์ปกติ': 'Normal Antenatal Care',
                'ความเครียด หรือซึมเศร้า': 'Stress or Depression',
                'ลำไส้อุดตัน หรือท้องผูกเรื้อรัง': 'Bowel Obstruction or Chronic Constipation',
                'ให้คำปรึกษายาคุมกำเนิด': 'Contraceptive Counseling',
                'ขี้หูอุดตัน หรือประสาทหูเสื่อม': 'Earwax Impaction or Sensorineural Hearing Loss',
                'ปลายประสาทอักเสบ หรือหมอนรองกระดูกทับประสาท': 'Peripheral Neuropathy or Herniated Disc',
                'ให้คำปรึกษาวัคซีนเด็ก/ผู้ใหญ่': 'Childhood/Adult Vaccine Counseling',
                'ให้คำปรึกษาเลิกสูบบุหรี่': 'Smoking Cessation Counseling',
                'สงสัยโรคมะเร็งหรือไทรอยด์เป็นพิษ': 'Suspected Cancer or Hyperthyroidism',
                'ริดสีดวงทวาร หรือเลือดออกในลำไส้': 'Hemorrhoids or Intestinal Bleeding',
                'ความดันโลหิตสูงหรือภูมิแพ้จมูก': 'Hypertension or Allergic Rhinitis',
                'ไทรอยด์เป็นพิษ หรือ Essential tremor': 'Hyperthyroidism or Essential Tremor',
                'เชื้อราที่เล็บ หรือคลับบิงฟิงเกอร์': 'Nail Fungus or Clubbing Fingers',
                'กินยาพาราเซตามอลเกินขนาด': 'Paracetamol Overdose',
                'ไข้หวัดใหญ่ หรือออฟฟิศซินโดรม': 'Influenza or Office Syndrome',
                'กล้ามเนื้ออักเสบ หรือหมอนรองกระดูกทับประสาท': 'Myositis or Herniated Disc',
                'ไทรอยด์เป็นพิษ หรือหัวใจเต้นผิดจังหวะ': 'Hyperthyroidism or Arrhythmia',
                'น้ำตาลในเลือดต่ำ หรือติดเชื้อในกระแสเลือด': 'Hypoglycemia or Sepsis',
                'ยารักษาโรค หรือตับแข็ง': 'Medication side effects or Cirrhosis',
                'Physiological jaundice หรือ ABO incompatibility': 'Physiological Jaundice or ABO Incompatibility',
                'เลือดออกในทางเดินอาหารหรือโลหิตจาง': 'Gastrointestinal Bleeding or Anemia',
                'ออทิสติก หรือขาดการกระตุ้น': 'Autism or Lack of Stimulation'
            }
        };
        
        if (staticScenarios[lang] && staticScenarios[lang][name]) {
            caseCopy.scenario_name = staticScenarios[lang][name];
        } else {
            caseCopy.scenario_name = this.cleanOrExtractLanguage(name, lang);
        }
        
        // 3. Localize Chief Complaint
        let cc = caseCopy.chief_complaint || '';
        caseCopy.chief_complaint = this.cleanOrExtractLanguage(cc, lang);
        
        return caseCopy;
    }

    cleanOrExtractLanguage(text, lang) {
        if (!text) return '';
        const match = text.match(/\(([^)]*[A-Za-z][^)]*)\)/);
        
        if (lang === 'en') {
            if (match) {
                return match[1].trim();
            }
            return text;
        } else {
            return text.replace(/\s*\([^)]*[A-Za-z][^)]*\)/g, '').trim();
        }
    }

    startSimulationWithCase(caseId) {
        this.selectedCaseId = caseId;
        
        // Synchronize and load pre-exam persona dropdown and details
        this.loadPreExamPersonaBank();
        this.preExamPresetSelect.value = this.portalPresetSelect.value;
        this.updatePreExamPersonaSummary();
        
        // Show Pre-Exam Modal
        this.preExamModal.style.display = 'flex';
    }

    launchSimulationRoom(caseId) {
        this.selectedCaseId = caseId;
        
        if (this.forceOfflineToggle && this.forceOfflineToggle.checked) {
            this.apiTier = 'free';
            this.backendSTTFailed = true;
            this.backendTTSFailed = true;
        } else {
            this.apiTier = 'paid';
            this.backendSTTFailed = false;
            this.backendTTSFailed = false;
        }
        
        // Fully reset session states
        this.sessionId = "session_" + Math.random().toString(36).substring(7);
        this.chatBox.innerHTML = "";
        if (this.activeModelName) this.activeModelName.innerText = "(รอเริ่มต้นบทสนทนา...)";
        
        // Reset timeline variables for clinical reasoning map
        this.startTime = Date.now();
        this.eventTimeline = [];
        this.lastEvaluationData = null;
        
        // Reset voice speech parameters
        this.currentPatientMsgDiv = null;
        this.ttsQueue = [];
        this.isSpeaking = false;
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        
        // Ensure settings drawer is closed/hidden to secure exam UI
        this.closeDrawer();
        
        // Restore buttons state to active encounter
        this.micBtn.style.display = 'inline-block';
        this.micBtn.disabled = false;
        this.micBtn.style.backgroundColor = "#f1f5f9";
        this.micBtn.style.color = "#475569";
        
        // Show cancel button at 0 turns (simulation start)
        if (this.cancelPortalBtn) {
            this.cancelPortalBtn.style.display = 'inline-block';
        }
        
        this.endBtn.style.display = 'inline-block';
        
        this.newBtn.style.display = 'none';
        this.viewEvalBtn.style.display = 'none';
        if (this.portalBtn) this.portalBtn.style.display = 'none';
        
        this.showScreen('chat');
        this.updateLangUIState();
        this.connectWS();
    }

    openDrawer() {
        this.settingsDrawer.style.display = 'block';
        // Initialize difficulty selection from current temperature state
        if (this.temperature <= 0.4) {
            if (this.diffEasyRadio) this.diffEasyRadio.checked = true;
        } else if (this.temperature <= 0.7) {
            if (this.diffMediumRadio) this.diffMediumRadio.checked = true;
        } else {
            if (this.diffHardRadio) this.diffHardRadio.checked = true;
        }
    }

    closeDrawer() {
        this.settingsDrawer.style.display = 'none';
    }

    calculatePAD() {
        this.anger = parseInt(this.angerSlider.value);
        this.sadness = parseInt(this.sadnessSlider.value);
        this.happiness = parseInt(this.happinessSlider.value);
        
        // PAD Mathematical translation
        const p = (this.happiness - (this.anger * 0.6) - (this.sadness * 0.8)) / 100;
        const a = ((this.anger * 0.9) + (this.sadness * 0.3) - (this.happiness * 0.5)) / 100;
        const d = ((this.anger * 0.7) + (this.happiness * 0.5) - (this.sadness * 0.8)) / 100;
        
        this.pad = {
            p: Math.max(-1.0, Math.min(1.0, p)),
            a: Math.max(-1.0, Math.min(1.0, a)),
            d: Math.max(-1.0, Math.min(1.0, d))
        };
        
        this.padPText.innerText = this.pad.p.toFixed(2);
        this.padAText.innerText = this.pad.a.toFixed(2);
        this.padDText.innerText = this.pad.d.toFixed(2);
    }

    applyPreset(presetName) {
        if (presetName === 'custom') return;
        
        let anger = 0, sadness = 0, happiness = 100;
        let diff = 'medium'; // default
        
        switch (presetName) {
            case 'cooperative':
                anger = 0; sadness = 0; happiness = 100;
                diff = 'easy';
                break;
            case 'normal':
                anger = 0; sadness = 0; happiness = 50;
                diff = 'medium';
                break;
            case 'anxious':
                anger = 10; sadness = 70; happiness = 10;
                diff = 'hard';
                break;
            case 'severe_pain':
                anger = 25; sadness = 75; happiness = 0;
                diff = 'hard';
                break;
            case 'combative':
                anger = 90; sadness = 10; happiness = 0;
                diff = 'hard';
                break;
            case 'depressed':
                anger = 0; sadness = 85; happiness = 0;
                diff = 'hard';
                break;
        }
        
        this.angerSlider.value = anger;
        this.angerVal.innerText = anger + "%";
        
        this.sadnessSlider.value = sadness;
        this.sadnessVal.innerText = sadness + "%";
        
        this.happinessSlider.value = happiness;
        this.happinessVal.innerText = happiness + "%";
        
        // Select corresponding difficulty radio
        if (diff === 'easy') {
            if (this.diffEasyRadio) this.diffEasyRadio.checked = true;
            this.temperature = 0.3;
        } else if (diff === 'medium') {
            if (this.diffMediumRadio) this.diffMediumRadio.checked = true;
            this.temperature = 0.6;
        } else if (diff === 'hard') {
            if (this.diffHardRadio) this.diffHardRadio.checked = true;
            this.temperature = 0.9;
        }
        
        // sync tempSlider value
        if (this.tempSlider) {
            this.tempSlider.value = this.temperature;
        }
        if (this.tempVal) {
            this.tempVal.innerText = this.temperature;
        }
        
        this.calculatePAD();
    }

    saveSettings() {
        const modelValue = this.modelSelect.value;
        if (modelValue === 'custom') {
            this.selectedModel = this.modelCustom.value.trim() || "llama3.1:latest";
        } else {
            this.selectedModel = modelValue;
        }
        
        // Read selected difficulty level preset and map to backend temperature
        const selectedDifficulty = this.shadowDOM.querySelector('input[name="difficulty"]:checked')?.value || 'medium';
        if (selectedDifficulty === 'easy') {
            this.temperature = 0.3;
        } else if (selectedDifficulty === 'medium') {
            this.temperature = 0.6;
        } else if (selectedDifficulty === 'hard') {
            this.temperature = 0.9;
        }
        
        // Sync tempSlider values just in case
        if (this.tempSlider) {
            this.tempSlider.value = this.temperature;
        }
        if (this.tempVal) {
            this.tempVal.innerText = this.temperature;
        }
        
        this.customPrompt = this.promptTextarea.value;
        this.calculatePAD();
        
        // Handle Persona Bank Saving Logic (Phase 4.2)
        if (this.saveToBankCheckbox.checked) {
            const nameInput = this.bankPersonaName.value.trim();
            if (!nameInput) {
                alert("กรุณาระบุชื่อบุคลิกภาพจำลองที่ต้องการบันทึกด้วย!");
                return;
            }
            
            let list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
            
            const newPersona = {
                id: "persona_" + Date.now(),
                name: nameInput,
                anger: this.anger,
                sadness: this.sadness,
                happiness: this.happiness,
                additional_instructions: this.promptTextarea.value,
                student_id: this.studentId || 'guest'
            };
            
            if (list.length < 5) {
                list.push(newPersona);
                localStorage.setItem('osce_custom_personas', JSON.stringify(list));
                alert("บันทึกบุคลิกคนไข้ลงคลังสำเร็จ!");
            } else {
                // Find which existing persona to replace/overwrite
                const selectedRadio = this.shadowDOM.querySelector('input[name="replace-persona"]:checked');
                if (!selectedRadio) {
                    alert("คลังเต็มแล้ว! กรุณาเลือกบุคลิกเดิมที่จะให้เขียนทับแทนที่");
                    return;
                }
                const targetId = selectedRadio.value;
                const idx = list.findIndex(p => p.id === targetId);
                if (idx !== -1) {
                    newPersona.id = targetId; // keep original ID
                    list[idx] = newPersona;
                    localStorage.setItem('osce_custom_personas', JSON.stringify(list));
                    alert("เขียนทับทดแทนบุคลิกเดิมเสร็จสิ้น!");
                }
            }
            
            this.loadPersonaBank();
            this.loadPreExamPersonaBank();
            this.portalPresetSelect.value = "custom_" + newPersona.id;
            this.preExamPresetSelect.value = "custom_" + newPersona.id;
            this.updatePersonaSummary();
            this.updatePreExamPersonaSummary();
        }
        
        this.closeDrawer();
        
        // Flash a status message briefly
        const originalStatus = this.status.innerText;
        this.status.innerText = (this.currentLanguage === 'en' ? "Adjusted patient configuration successfully" : "ปรับจูนบุคลิกและระดับอารมณ์เรียบร้อยแล้ว");
        this.status.style.color = "#198754";
        setTimeout(() => {
            this.status.innerText = originalStatus;
            this.status.style.color = "";
        }, 1500);
    }

    // --- Dynamic Persona Bank & LocalStorage Handlers ---
    loadPersonaBank() {
        const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
        const isEn = this.currentLanguage === 'en';
        
        let selectHtml = isEn ? `
            <option value="cooperative">Cooperative / Calm</option>
            <option value="normal">Normal</option>
            <option value="anxious">Highly Anxious</option>
            <option value="severe_pain">Severe Pain</option>
            <option value="combative">Combative / Irritable</option>
            <option value="depressed">Depressed / Fatigued</option>
        ` : `
            <option value="cooperative">แม่แบบมาตรฐานคนไข้</option>
            <option value="normal">ปกติ</option>
            <option value="anxious">คนไข้วิตกกังวลสูง</option>
            <option value="severe_pain">คนไข้ปวดเกร็งรุนแรง</option>
            <option value="combative">คนไข้หงุดหงิดห้วน</option>
            <option value="depressed">คนไข้ซึมเศร้าเหนื่อยล้า</option>
        `;
        
        if (list.length > 0) {
            list.forEach(p => {
                selectHtml += `<option value="custom_${p.id}">${p.name}</option>`;
            });
        }
        selectHtml += `<option value="create_new">${isEn ? 'Customize Mood...' : 'ปรับแต่งระดับอารมณ์ใหม่...'}</option>`;
        this.portalPresetSelect.innerHTML = selectHtml;
        
        const container = this.shadowDOM.getElementById('persona-avatars-list');
        if (!container) return;
        
        const currentVal = this.portalPresetSelect.value;
        container.innerHTML = "";
        
        const standardAvatars = isEn ? [
            { val: 'cooperative', label: 'Calm', img: 'images/patient_normal.png' },
            { val: 'anxious', label: 'Anxious', img: 'images/patient_anxious.png' },
            { val: 'severe_pain', label: 'Severe Pain', img: 'images/patient_pain.png' },
            { val: 'combative', label: 'Irritable', img: 'images/patient_angry.png' },
            { val: 'depressed', label: 'Depressed', img: 'images/patient_depressed.png' }
        ] : [
            { val: 'cooperative', label: 'ปกติ / ใจเย็น', img: 'images/patient_normal.png' },
            { val: 'anxious', label: 'วิตกกังวลสูง', img: 'images/patient_anxious.png' },
            { val: 'severe_pain', label: 'ปวดรุนแรง', img: 'images/patient_pain.png' },
            { val: 'combative', label: 'หงุดหงิดก้าวร้าว', img: 'images/patient_angry.png' },
            { val: 'depressed', label: 'ซึมเศร้าท้อแท้', img: 'images/patient_depressed.png' }
        ];
        
        standardAvatars.forEach(av => {
            const card = document.createElement('div');
            card.className = `avatar-card${currentVal === av.val ? ' active' : ''}`;
            card.innerHTML = `
                <div class="avatar-img-wrapper">
                    <img class="avatar-img" src="${av.img}" alt="${av.label}">
                </div>
                <div class="avatar-label">${av.label}</div>
            `;
            card.addEventListener('click', () => {
                this.portalPresetSelect.value = av.val;
                this.handlePersonaChange();
            });
            container.appendChild(card);
        });
        
        list.forEach(p => {
            const card = document.createElement('div');
            card.className = `avatar-card${currentVal === 'custom_' + p.id ? ' active' : ''}`;
            card.innerHTML = `
                <div class="avatar-img-wrapper">
                    <img class="avatar-img" src="images/patient_custom.png" alt="${p.name}">
                    ${(!p.student_id || p.student_id === this.studentId) ? `<div class="delete-avatar-badge" title="ลบบุคลิกนี้">&times;</div>` : ''}
                </div>
                <div class="avatar-label">${p.name}</div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-avatar-badge')) {
                    e.stopPropagation();
                    this.deleteSelectedPersona(p.id);
                    return;
                }
                this.portalPresetSelect.value = 'custom_' + p.id;
                this.handlePersonaChange();
            });
            container.appendChild(card);
        });
        
        const addCard = document.createElement('div');
        addCard.className = 'avatar-card add-avatar-card';
        addCard.innerHTML = `
            <div class="avatar-img-wrapper" style="border-style: dashed; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #94a3b8; font-weight: 300;">
                +
            </div>
            <div class="avatar-label">${isEn ? 'Customize Mood' : 'ปรับแต่งอารมณ์'}</div>
        `;
        addCard.addEventListener('click', () => {
            this.portalPresetSelect.value = 'create_new';
            this.handlePersonaChange();
        });
        container.appendChild(addCard);
        
        this.updatePersonaSummary();
    }

    handlePersonaChange() {
        const val = this.portalPresetSelect.value;
        if (val === 'create_new') {
            this.presetSelect.value = 'cooperative';
            this.applyPreset('cooperative');
            this.promptTextarea.value = "";
            this.saveToBankCheckbox.checked = true;
            this.toggleBankInputGroup(true);
            this.bankPersonaName.value = "";
            this.portalPresetSelect.value = 'cooperative';
            this.loadPersonaBank();
            this.openDrawer();
            setTimeout(() => this.bankPersonaName.focus(), 100);
        } else if (val.startsWith('custom_')) {
            const id = val.replace('custom_', '');
            const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
            const p = list.find(item => item.id === id);
            if (p) {
                this.anger = p.anger;
                this.sadness = p.sadness;
                this.happiness = p.happiness;
                this.customPrompt = p.additional_instructions || "";
                this.angerSlider.value = p.anger;
                this.angerVal.innerText = p.anger + "%";
                this.sadnessSlider.value = p.sadness;
                this.sadnessVal.innerText = p.sadness + "%";
                this.happinessSlider.value = p.happiness;
                this.happinessVal.innerText = p.happiness + "%";
                this.promptTextarea.value = p.additional_instructions || "";
                this.presetSelect.value = 'custom';
                this.calculatePAD();
                
                // Update CSS classes active state
                const container = this.shadowDOM.getElementById('persona-avatars-list');
                if (container) {
                    container.querySelectorAll('.avatar-card').forEach(card => card.classList.remove('active'));
                    const cards = container.querySelectorAll('.avatar-card');
                    const idx = list.findIndex(item => item.id === id);
                    if (idx !== -1 && cards[5 + idx]) {
                        cards[5 + idx].classList.add('active');
                    }
                }
                
                this.updatePersonaSummary();

                if (this.preExamPresetSelect) {
                    this.preExamPresetSelect.value = val;
                    this.loadPreExamPersonaBank();
                }
            }
        } else {
            this.applyPreset(val);
            this.customPrompt = "";
            this.promptTextarea.value = "";
            this.presetSelect.value = val;
            
            // Update CSS classes active state
            const container = this.shadowDOM.getElementById('persona-avatars-list');
            if (container) {
                container.querySelectorAll('.avatar-card').forEach(card => card.classList.remove('active'));
                const standardAvatars = ['cooperative', 'anxious', 'severe_pain', 'combative', 'depressed'];
                const idx = standardAvatars.indexOf(val);
                const cards = container.querySelectorAll('.avatar-card');
                if (idx !== -1 && cards[idx]) {
                    cards[idx].classList.add('active');
                }
            }
            
            this.updatePersonaSummary();

            if (this.preExamPresetSelect) {
                this.preExamPresetSelect.value = val;
                this.loadPreExamPersonaBank();
            }
        }
    }

    loadPreExamPersonaBank() {
        const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
        const isEn = this.currentLanguage === 'en';
        
        let selectHtml = isEn ? `
            <option value="cooperative">Cooperative / Calm</option>
            <option value="normal">Normal</option>
            <option value="anxious">Highly Anxious</option>
            <option value="severe_pain">Severe Pain</option>
            <option value="combative">Combative / Irritable</option>
            <option value="depressed">Depressed / Fatigued</option>
        ` : `
            <option value="cooperative">แม่แบบมาตรฐานคนไข้</option>
            <option value="normal">ปกติ</option>
            <option value="anxious">คนไข้วิตกกังวลสูง</option>
            <option value="severe_pain">คนไข้ปวดเกร็งรุนแรง</option>
            <option value="combative">คนไข้หงุดหงิดห้วน</option>
            <option value="depressed">คนไข้ซึมเศร้าเหนื่อยล้า</option>
        `;
        
        if (list.length > 0) {
            list.forEach(p => {
                selectHtml += `<option value="custom_${p.id}">${p.name}</option>`;
            });
        }
        selectHtml += `<option value="create_new">${isEn ? 'Customize Mood...' : 'ปรับแต่งระดับอารมณ์ใหม่...'}</option>`;
        
        if (this.preExamPresetSelect) {
            this.preExamPresetSelect.innerHTML = selectHtml;
        }
        
        const container = this.shadowDOM.getElementById('pre-exam-avatars-list');
        if (!container) return;
        
        const currentVal = this.preExamPresetSelect.value;
        container.innerHTML = "";
        
        const standardAvatars = isEn ? [
            { val: 'cooperative', label: 'Calm', img: 'images/patient_normal.png' },
            { val: 'anxious', label: 'Anxious', img: 'images/patient_anxious.png' },
            { val: 'severe_pain', label: 'Severe Pain', img: 'images/patient_pain.png' },
            { val: 'combative', label: 'Irritable', img: 'images/patient_angry.png' },
            { val: 'depressed', label: 'Depressed', img: 'images/patient_depressed.png' }
        ] : [
            { val: 'cooperative', label: 'ปกติ / ใจเย็น', img: 'images/patient_normal.png' },
            { val: 'anxious', label: 'วิตกกังวลสูง', img: 'images/patient_anxious.png' },
            { val: 'severe_pain', label: 'ปวดรุนแรง', img: 'images/patient_pain.png' },
            { val: 'combative', label: 'หงุดหงิดก้าวร้าว', img: 'images/patient_angry.png' },
            { val: 'depressed', label: 'ซึมเศร้าท้อแท้', img: 'images/patient_depressed.png' }
        ];
        
        standardAvatars.forEach(av => {
            const card = document.createElement('div');
            card.className = `avatar-card${currentVal === av.val ? ' active' : ''}`;
            card.innerHTML = `
                <div class="avatar-img-wrapper">
                    <img class="avatar-img" src="${av.img}" alt="${av.label}">
                </div>
                <div class="avatar-label">${av.label}</div>
            `;
            card.addEventListener('click', () => {
                this.preExamPresetSelect.value = av.val;
                this.handlePreExamPersonaChange();
            });
            container.appendChild(card);
        });
        
        list.forEach(p => {
            const card = document.createElement('div');
            card.className = `avatar-card${currentVal === 'custom_' + p.id ? ' active' : ''}`;
            card.innerHTML = `
                <div class="avatar-img-wrapper">
                    <img class="avatar-img" src="images/patient_custom.png" alt="${p.name}">
                    ${(!p.student_id || p.student_id === this.studentId) ? `<div class="delete-avatar-badge" title="ลบบุคลิกนี้">&times;</div>` : ''}
                </div>
                <div class="avatar-label">${p.name}</div>
            `;
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-avatar-badge')) {
                    e.stopPropagation();
                    this.deleteSelectedPersona(p.id);
                    return;
                }
                this.preExamPresetSelect.value = 'custom_' + p.id;
                this.handlePreExamPersonaChange();
            });
            container.appendChild(card);
        });
        
        const addCard = document.createElement('div');
        addCard.className = 'avatar-card add-avatar-card';
        addCard.innerHTML = `
            <div class="avatar-img-wrapper" style="border-style: dashed; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #94a3b8; font-weight: 300;">
                +
            </div>
            <div class="avatar-label">${isEn ? 'Customize Mood' : 'ปรับแต่งอารมณ์'}</div>
        `;
        addCard.addEventListener('click', () => {
            this.preExamPresetSelect.value = 'create_new';
            this.handlePreExamPersonaChange();
        });
        container.appendChild(addCard);
        
        this.updatePreExamPersonaSummary();
    }

    handlePreExamPersonaChange() {
        const val = this.preExamPresetSelect.value;
        if (val === 'create_new') {
            this.presetSelect.value = 'cooperative';
            this.applyPreset('cooperative');
            this.promptTextarea.value = "";
            this.saveToBankCheckbox.checked = true;
            this.toggleBankInputGroup(true);
            this.bankPersonaName.value = "";
            this.preExamPresetSelect.value = 'cooperative';
            this.loadPreExamPersonaBank();
            this.openDrawer();
            setTimeout(() => this.bankPersonaName.focus(), 100);
        } else if (val.startsWith('custom_')) {
            const id = val.replace('custom_', '');
            const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
            const p = list.find(item => item.id === id);
            if (p) {
                this.anger = p.anger;
                this.sadness = p.sadness;
                this.happiness = p.happiness;
                this.customPrompt = p.additional_instructions || "";
                this.angerSlider.value = p.anger;
                this.angerVal.innerText = p.anger + "%";
                this.sadnessSlider.value = p.sadness;
                this.sadnessVal.innerText = p.sadness + "%";
                this.happinessSlider.value = p.happiness;
                this.happinessVal.innerText = p.happiness + "%";
                this.promptTextarea.value = p.additional_instructions || "";
                this.presetSelect.value = 'custom';
                this.calculatePAD();
                
                // Update CSS classes active state
                const container = this.shadowDOM.getElementById('pre-exam-avatars-list');
                if (container) {
                    container.querySelectorAll('.avatar-card').forEach(card => card.classList.remove('active'));
                    const cards = container.querySelectorAll('.avatar-card');
                    const idx = list.findIndex(item => item.id === id);
                    if (idx !== -1 && cards[5 + idx]) {
                        cards[5 + idx].classList.add('active');
                    }
                }
                
                this.updatePreExamPersonaSummary();
                
                this.portalPresetSelect.value = val;
                this.loadPersonaBank();
            }
        } else {
            this.applyPreset(val);
            this.customPrompt = "";
            this.promptTextarea.value = "";
            this.presetSelect.value = val;
            
            // Update CSS classes active state
            const container = this.shadowDOM.getElementById('pre-exam-avatars-list');
            if (container) {
                container.querySelectorAll('.avatar-card').forEach(card => card.classList.remove('active'));
                const standardAvatars = ['cooperative', 'anxious', 'severe_pain', 'combative', 'depressed'];
                const idx = standardAvatars.indexOf(val);
                const cards = container.querySelectorAll('.avatar-card');
                if (idx !== -1 && cards[idx]) {
                    cards[idx].classList.add('active');
                }
            }
            
            this.updatePreExamPersonaSummary();
            
            this.portalPresetSelect.value = val;
            this.loadPersonaBank();
        }
    }

    updatePreExamPersonaSummary() {
        const selectedVal = this.preExamPresetSelect.value;
        const detailsPanel = this.shadowDOM.getElementById('pre-exam-details-panel');
        if (!detailsPanel) return;
        
        // Show/hide delete button depending on whether selected persona is custom and owned by current student
        const deleteBtn = this.shadowDOM.getElementById('pre-exam-delete-persona-btn');
        if (deleteBtn) {
            if (selectedVal && selectedVal.startsWith('custom_')) {
                const id = selectedVal.replace('custom_', '');
                const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
                const p = list.find(item => item.id === id);
                if (p && (!p.student_id || p.student_id === this.studentId)) {
                    deleteBtn.style.display = 'flex';
                } else {
                    deleteBtn.style.display = 'none';
                }
            } else {
                deleteBtn.style.display = 'none';
            }
        }
        
        let title = "";
        let desc = "";
        let anger = 0, sadness = 0, happiness = 100;
        let extra = "";
        
        const isEn = this.currentLanguage === 'en';
        
        if (selectedVal === 'cooperative') {
            title = isEn ? "Cooperative / Calm" : "แม่แบบมาตรฐานคนไข้";
            desc = isEn ? "Patient presentation: Polite, cooperative, and responds normally during history taking." : "ลักษณะคนไข้: สุภาพ เรียบร้อย ให้ความร่วมมือในการซักประวัติอย่างปกติ";
            anger = 0; sadness = 0; happiness = 100;
        } else if (selectedVal === 'normal') {
            title = isEn ? "Normal Patient" : "คนไข้บุคลิกทั่วไป";
            desc = isEn ? "Patient presentation: General profile, responds with alternating short and long answers." : "ลักษณะคนไข้: บุคลิกปานกลางทั่วไป ตอบตามคำถามสั้นยาวสลับกัน";
            anger = 0; sadness = 0; happiness = 50;
        } else if (selectedVal === 'anxious') {
            title = isEn ? "Highly Anxious" : "คนไข้วิตกกังวลสูง";
            desc = isEn ? "Patient presentation: Highly anxious and panicked, voice trembles, constantly complains of fear." : "ลักษณะคนไข้: กังวลและตื่นตระหนกสูง พูดจาสั่นเครือ บ่นกลัวตลอดเวลา";
            anger = 10; sadness = 70; happiness = 10;
        } else if (selectedVal === 'severe_pain') {
            title = isEn ? "Severe Pain" : "คนไข้ปวดเกร็งรุนแรง";
            desc = isEn ? "Patient presentation: Experiencing severe physical pain, frequently groaning or crying out." : "ลักษณะคนไข้: มีอาการเจ็บปวดอย่างรุนแรง ร้องโอดโอยทางร่างกายปนคำพูดบ่อยๆ";
            anger = 25; sadness = 75; happiness = 0;
        } else if (selectedVal === 'combative') {
            title = isEn ? "Combative / Irritable" : "คนไข้หงุดหงิดห้วน";
            desc = isEn ? "Patient presentation: Irritable, easily angered, answers abruptly, hostile or resistant." : "ลักษณะคนไข้: หงุดหงิด โมโหง่าย ตอบห้วน กระด้าง ไร้หางเสียง หรือต่อต้าน";
            anger = 90; sadness = 10; happiness = 0;
        } else if (selectedVal === 'depressed') {
            title = isEn ? "Depressed / Fatigued" : "คนไข้ซึมเศร้าเหนื่อยล้า";
            desc = isEn ? "Patient presentation: Depressed, discouraged, fatigued, slow to respond." : "ลักษณะคนไข้: ซึมเศร้า ท้อแท้ อ่อนเพลียไร้เรี่ยวแรง ตอบช้ามาก";
            anger = 0; sadness = 85; happiness = 0;
        } else if (selectedVal.startsWith('custom_')) {
            const id = selectedVal.replace('custom_', '');
            const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
            const p = list.find(item => item.id === id);
            if (p) {
                title = (isEn ? "Custom Mood: " : "บุคลิกคลังส่วนตัว: ") + p.name;
                desc = isEn ? "Patient presentation: Custom emotions and special behavioral instructions." : "ลักษณะคนไข้: ปรับแต่งคุณสมบัติอารมณ์และคำสั่งพฤทีพฤติกรรมเสริมพิเศษส่วนตัว";
                anger = p.anger;
                sadness = p.sadness;
                happiness = p.happiness;
                if (p.additional_instructions) {
                    extra = `<div style="font-size: 11px; margin-top: 10px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #ea580c; border-radius: 4px; color: #475569;"><b>${isEn ? 'Extra Instructions:' : 'คำสั่งเสริม:'}</b> "${p.additional_instructions}"</div>`;
                }
            } else {
                title = isEn ? "Persona configuration not found" : "ไม่พบข้อมูลบุคลิกจำลองนี้";
            }
        }
        
        detailsPanel.innerHTML = `
            <div class="persona-name" style="color: #1e3a8a;">${title}</div>
            <div class="persona-desc" style="color: #475569;">${desc}</div>
            <div class="emotion-bars">
                <div class="emotion-row">
                    <span class="emotion-label" style="color: #64748b;">${isEn ? 'Happiness / Calmness' : 'ความสุข / สงบ'}</span>
                    <div class="emotion-bar-bg" style="background: #f1f5f9;">
                        <div class="emotion-bar-fill fill-happiness" style="width: ${happiness}%"></div>
                    </div>
                    <span class="emotion-bar-val" style="color: #475569;">${happiness}%</span>
                </div>
                <div class="emotion-row">
                    <span class="emotion-label" style="color: #64748b;">${isEn ? 'Sadness / Sensitivity' : 'ความเศร้า / อ่อนไหว'}</span>
                    <div class="emotion-bar-bg" style="background: #f1f5f9;">
                        <div class="emotion-bar-fill fill-sadness" style="width: ${sadness}%"></div>
                    </div>
                    <span class="emotion-bar-val" style="color: #475569;">${sadness}%</span>
                </div>
                <div class="emotion-row">
                    <span class="emotion-label" style="color: #64748b;">${isEn ? 'Hostility / Anger' : 'ความโกรธ / ก้าวร้าว'}</span>
                    <div class="emotion-bar-bg" style="background: #f1f5f9;">
                        <div class="emotion-bar-fill fill-anger" style="width: ${anger}%"></div>
                    </div>
                    <span class="emotion-bar-val" style="color: #475569;">${anger}%</span>
                </div>
            </div>
            ${extra}
        `;
    }

    deleteSelectedPersona(personaId) {
        let val = personaId ? ("custom_" + personaId) : this.portalPresetSelect.value; 
        if (!personaId && this.preExamModal && this.preExamModal.style.display === 'flex') {
            val = this.preExamPresetSelect.value;
        }
        if (!val || !val.startsWith('custom_')) return;
        
        const id = val.replace('custom_', '');
        let list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
        const persona = list.find(p => p.id === id);
        
        if (!persona) return;
        
        if (persona.student_id && persona.student_id !== this.studentId) {
            alert("คุณไม่มีสิทธิ์ลบบุคลิกภาพนี้ เนื่องจากคุณไม่ได้เป็นผู้สร้าง!");
            return;
        }
        
        if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบบุคลิก "${persona.name}" ออกจากคลังถาวร?`)) {
            list = list.filter(p => p.id !== id);
            localStorage.setItem('osce_custom_personas', JSON.stringify(list));
            alert("ลบบุคลิกภาพออกจากคลังสำเร็จ!");
            
            // Sync dropdown lists
            this.loadPersonaBank();
            this.loadPreExamPersonaBank();
            
            // Revert back to cooperative calm default if deleted was selected
            if (this.portalPresetSelect.value === val) {
                this.portalPresetSelect.value = 'cooperative';
                this.handlePersonaChange();
            }
            if (this.preExamPresetSelect && this.preExamPresetSelect.value === val) {
                this.preExamPresetSelect.value = 'cooperative';
                this.handlePreExamPersonaChange();
            }
        }
    }

    toggleBankInputGroup(checked) {
        if (checked) {
            this.bankInputGroup.style.display = 'block';
            const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
            if (list.length >= 5) {
                this.bankReplaceSection.style.display = 'block';
                let radiosHtml = "";
                list.forEach((p, idx) => {
                    const checkedAttr = idx === 0 ? "checked" : "";
                    radiosHtml += `
                        <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #475569; cursor: pointer; margin-top: 4px;">
                            <input type="radio" name="replace-persona" value="${p.id}" ${checkedAttr}>
                            แทนที่: <b>${p.name}</b>
                        </label>
                    `;
                });
                this.bankReplaceRadios.innerHTML = radiosHtml;
            } else {
                this.bankReplaceSection.style.display = 'none';
            }
        } else {
            this.bankInputGroup.style.display = 'none';
        }
    }

    updatePersonaSummary() {
        const selectedVal = this.portalPresetSelect.value;
        const detailsPanel = this.shadowDOM.getElementById('persona-details-panel');
        if (!detailsPanel) return;
        
        // Show/hide delete button depending on whether selected persona is custom and owned by current student
        const deleteBtn = this.shadowDOM.getElementById('delete-persona-btn');
        if (deleteBtn) {
            if (selectedVal && selectedVal.startsWith('custom_')) {
                const id = selectedVal.replace('custom_', '');
                const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
                const p = list.find(item => item.id === id);
                if (p && (!p.student_id || p.student_id === this.studentId)) {
                    deleteBtn.style.display = 'flex';
                } else {
                    deleteBtn.style.display = 'none';
                }
            } else {
                deleteBtn.style.display = 'none';
            }
        }
        
        let title = "";
        let desc = "";
        let anger = 0, sadness = 0, happiness = 100;
        let extra = "";
        
        const isEn = this.currentLanguage === 'en';
        
        if (selectedVal === 'cooperative') {
            title = isEn ? "Cooperative / Calm" : "แม่แบบมาตรฐานคนไข้";
            desc = isEn ? "Patient presentation: Polite, cooperative, and responds normally during history taking." : "ลักษณะคนไข้: สุภาพ เรียบร้อย ให้ความร่วมมือในการซักประวัติอย่างปกติ";
            anger = 0; sadness = 0; happiness = 100;
        } else if (selectedVal === 'normal') {
            title = isEn ? "Normal Patient" : "คนไข้บุคลิกทั่วไป";
            desc = isEn ? "Patient presentation: General profile, responds with alternating short and long answers." : "ลักษณะคนไข้: บุคลิกปานกลางทั่วไป ตอบตามคำถามสั้นยาวสลับกัน";
            anger = 0; sadness = 0; happiness = 50;
        } else if (selectedVal === 'anxious') {
            title = isEn ? "Highly Anxious" : "คนไข้วิตกกังวลสูง";
            desc = isEn ? "Patient presentation: Highly anxious and panicked, voice trembles, constantly complains of fear." : "ลักษณะคนไข้: กังวลและตื่นตระหนกสูง พูดจาสั่นเครือ บ่นกลัวตลอดเวลา";
            anger = 10; sadness = 70; happiness = 10;
        } else if (selectedVal === 'severe_pain') {
            title = isEn ? "Severe Pain" : "คนไข้ปวดเกร็งรุนแรง";
            desc = isEn ? "Patient presentation: Experiencing severe physical pain, frequently groaning or crying out." : "ลักษณะคนไข้: มีอาการเจ็บปวดอย่างรุนแรง ร้องโอดโอยทางร่างกายปนคำพูดบ่อยๆ";
            anger = 25; sadness = 75; happiness = 0;
        } else if (selectedVal === 'combative') {
            title = isEn ? "Combative / Irritable" : "คนไข้หงุดหงิดห้วน";
            desc = isEn ? "Patient presentation: Irritable, easily angered, answers abruptly, hostile or resistant." : "ลักษณะคนไข้: หงุดหงิด โมโหง่าย ตอบห้วน กระด้าง ไร้หางเสียง หรือต่อต้าน";
            anger = 90; sadness = 10; happiness = 0;
        } else if (selectedVal === 'depressed') {
            title = isEn ? "Depressed / Fatigued" : "คนไข้ซึมเศร้าเหนื่อยล้า";
            desc = isEn ? "Patient presentation: Depressed, discouraged, fatigued, slow to respond." : "ลักษณะคนไข้: ซึมเศร้า ท้อแท้ อ่อนเพลียไร้เรี่ยวแรง ตอบช้ามาก";
            anger = 0; sadness = 85; happiness = 0;
        } else if (selectedVal.startsWith('custom_')) {
            const id = selectedVal.replace('custom_', '');
            const list = JSON.parse(localStorage.getItem('osce_custom_personas') || '[]');
            const p = list.find(item => item.id === id);
            if (p) {
                title = (isEn ? "Custom Mood: " : "บุคลิกคลังส่วนตัว: ") + p.name;
                desc = isEn ? "Patient presentation: Custom emotions and special behavioral instructions." : "ลักษณะคนไข้: ปรับแต่งคุณสมบัติอารมณ์และคำสั่งพฤติกรรมเสริมพิเศษส่วนตัว";
                anger = p.anger;
                sadness = p.sadness;
                happiness = p.happiness;
                if (p.additional_instructions) {
                    extra = `<div style="font-size: 11px; margin-top: 10px; padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-left: 3px solid #ea580c; border-radius: 4px; color: #475569;"><b>${isEn ? 'Extra Instructions:' : 'คำสั่งเสริม:'}</b> "${p.additional_instructions}"</div>`;
                }
            } else {
                title = isEn ? "Persona configuration not found" : "ไม่พบข้อมูลบุคลิกจำลองนี้";
            }
        }
        
        detailsPanel.innerHTML = `
            <div class="persona-name" style="color: #1e3a8a;">${title}</div>
            <div class="persona-desc" style="color: #475569;">${desc}</div>
            <div class="emotion-bars">
                <div class="emotion-row">
                    <span class="emotion-label" style="color: #64748b;">${isEn ? 'Happiness / Calmness' : 'ความสุข / สงบ'}</span>
                    <div class="emotion-bar-bg" style="background: #f1f5f9;">
                        <div class="emotion-bar-fill fill-happiness" style="width: ${happiness}%"></div>
                    </div>
                    <span class="emotion-bar-val" style="color: #475569;">${happiness}%</span>
                </div>
                <div class="emotion-row">
                    <span class="emotion-label" style="color: #64748b;">${isEn ? 'Sadness / Sensitivity' : 'ความเศร้า / อ่อนไหว'}</span>
                    <div class="emotion-bar-bg" style="background: #f1f5f9;">
                        <div class="emotion-bar-fill fill-sadness" style="width: ${sadness}%"></div>
                    </div>
                    <span class="emotion-bar-val" style="color: #475569;">${sadness}%</span>
                </div>
                <div class="emotion-row">
                    <span class="emotion-label" style="color: #64748b;">${isEn ? 'Hostility / Anger' : 'ความโกรธ / ก้าวร้าว'}</span>
                    <div class="emotion-bar-bg" style="background: #f1f5f9;">
                        <div class="emotion-bar-fill fill-anger" style="width: ${anger}%"></div>
                    </div>
                    <span class="emotion-bar-val" style="color: #475569;">${anger}%</span>
                </div>
            </div>
            ${extra}
        `;
    }



    closeConnections() {
        if (this.socket) {
            this.socket.onclose = null; // Break the infinite reconnect loop!
            this.socket.close();
            this.socket = null;
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
    }

    connectWS() {
        this.closeConnections();
        
        let wsUrl = this.serverUrl;
        
        // Clean URL protocol for WS connection
        if (wsUrl.startsWith('http://')) {
            wsUrl = wsUrl.replace('http://', 'ws://');
        } else if (wsUrl.startsWith('https://')) {
            wsUrl = wsUrl.replace('https://', 'wss://');
        } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
            // Default to local/relative matching
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/ws/chat`;
        }

        // Add WS route path if not present
        if (!wsUrl.endsWith('/ws/chat')) {
            wsUrl = wsUrl.replace(/\/$/, '') + '/ws/chat';
        }

        this.status.innerText = (this.currentLanguage === 'en' ? "Connecting to server..." : "กำลังเชื่อมต่อกับเซิร์ฟเวอร์...");
        
        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                this.status.innerText = (this.currentLanguage === 'en' ? "System ready..." : "ระบบพร้อมทำงาน...");
                this.setupWizard.style.display = 'none';
                
                // Silent initialize session in SQLite DB immediately
                const initPayload = {
                    session_id: this.sessionId,
                    student_text: "__INIT_SESSION__",
                    case_id: this.selectedCaseId,
                    student_id: this.studentId || "guest_student",
                    student_name: this.studentName || "Guest Student"
                };
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(initPayload));
                }
            };

            this.socket.onmessage = (event) => {
                const text = event.data;
                
                // Check if message is a JSON metadata object
                if (text.trim().startsWith('{')) {
                    try {
                        const payload = JSON.parse(text);
                        if (payload.type === 'metadata') {
                            if (payload.gender) {
                                this.currentPatientGender = payload.gender;
                            }
                            if (payload.quota_remaining !== undefined && payload.quota_limit !== undefined) {
                                this.quotaTrackerBar.innerHTML = `☁️ โควต้าคลาวด์วันนี้คงเหลือ: ${payload.quota_remaining} / ${payload.quota_limit} ข้อความ`;
                            }
                            return;
                        }
                        if (payload.type === 'model_info') {
                            if (this.activeModelName) {
                                this.activeModelName.innerText = payload.model;
                            }
                            return;
                        }
                    } catch (e) {
                        console.error("Error parsing JSON message:", e);
                    }
                }
                
                if (text === "__END__") {
                    if (this.sentenceBuffer.trim()) {
                        this.enqueueTTS(this.sentenceBuffer.trim());
                        this.sentenceBuffer = "";
                    }
                    this.status.innerText = (this.currentLanguage === 'en' ? "Waiting for your next question..." : "รอรับคำถามต่อไป...");
                    return;
                }

                // If receiving session closed notice
                if (text.startsWith("Session saved.")) {
                    this.status.innerText = (this.currentLanguage === 'en' ? "Session saved successfully." : "บันทึกประวัติเรียบร้อยแล้ว");
                    return;
                }

                if (text.includes("ครบข้อจำกัด 30 คำถามสำหรับรอบประเมินนี้แล้ว")) {
                    this.showSessionEndedState();
                }

                // Hide typing indicator before rendering patient response
                this.hideTypingIndicator();

                if (!this.currentPatientMsgDiv) {
                    this.currentPatientMsgDiv = document.createElement('div');
                    this.currentPatientMsgDiv.className = 'msg patient';
                    this.currentPatientMsgDiv.innerText = (this.currentLanguage === 'en' ? "Patient: " : "คนไข้: ");
                    this.chatBox.appendChild(this.currentPatientMsgDiv);
                }

                this.currentPatientMsgDiv.innerText += text;
                this.chatBox.scrollTop = this.chatBox.scrollHeight;

                this.sentenceBuffer += text;
                const endChars = /[.!?。！？\n]/;
                if (endChars.test(text)) {
                    this.enqueueTTS(this.sentenceBuffer.trim());
                    this.sentenceBuffer = "";
                }
            };

            this.socket.onclose = () => {
                this.hideTypingIndicator();
                this.status.innerText = (this.currentLanguage === 'en' ? "Server connection lost..." : "ดำเนินการเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง...");
                this.setupWizard.style.display = 'block';
            };
            
            this.socket.onerror = () => {
                this.hideTypingIndicator();
                this.status.innerText = (this.currentLanguage === 'en' ? "Server connection lost..." : "ดำเนินการเชื่อมต่อเซิร์ฟเวอร์ขัดข้อง...");
                this.setupWizard.style.display = 'block';
            };
        } catch (e) {
            console.error("WebSocket construction failed:", e);
            this.status.innerText = (this.currentLanguage === 'en' ? "Unable to connect" : "ไม่สามารถเชื่อมต่อได้");
            this.setupWizard.style.display = 'block';
        }
    }

    async toggleDictation() {
        if (this.isRecording) {
            if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
                this.mediaRecorder.stop();
            } else if (this.recognition) {
                this.recognition.stop();
            }
            return;
        }

        // Check if we should use browser-native recognition directly
        if (this.backendSTTFailed || !navigator.mediaDevices || !window.MediaRecorder) {
            this.runLocalSpeechRecognition();
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.audioChunks = [];
            this.mediaRecorder = new MediaRecorder(stream);
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstart = () => {
                this.isRecording = true;
                this.status.innerText = (this.currentLanguage === 'en' ? "Recording voice... Click mic again to stop." : "กำลังบันทึกเสียงพูดของคุณ (คลิกอีกครั้งเพื่อหยุด)...");
                this.micBtn.innerText = (this.currentLanguage === 'en' ? "⏹️ Stop" : "⏹️ หยุดบันทึก");
                this.micBtn.style.backgroundColor = "#dc3545";
                this.micBtn.style.color = "white";
                
                if (this.cancelPortalBtn) {
                    this.cancelPortalBtn.style.display = 'none';
                }
                
                this.chatTextInput.value = "";
                this.currentPatientMsgDiv = null;
            };

            this.mediaRecorder.onstop = async () => {
                this.isRecording = false;
                this.micBtn.innerText = (this.currentLanguage === 'en' ? "🎤 Speak" : "🎤 คลิกเพื่อพูด");
                this.micBtn.style.backgroundColor = "#f1f5f9";
                this.micBtn.style.color = "#475569";
                
                // Stop all tracks to release microphone
                stream.getTracks().forEach(track => track.stop());

                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                
                if (audioBlob.size < 1000) { // Too short/empty
                    if (this.cancelPortalBtn) this.cancelPortalBtn.style.display = 'inline-block';
                    return;
                }

                this.status.innerText = (this.currentLanguage === 'en' ? "Transcribing voice..." : "กำลังแปลงเสียงเป็นข้อความ...");

                try {
                    const formData = new FormData();
                    formData.append("file", audioBlob, "voice_query.webm");
                    formData.append("language", this.currentLanguage);

                    const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
                    const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/stt`, {
                        method: "POST",
                        body: formData,
                        headers: {
                            'ngrok-skip-browser-warning': '1'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        const text = data.text ? data.text.trim() : "";
                        if (text) {
                            this.chatTextInput.value = text;
                            this.chatTextInput.focus();
                            this.status.innerText = (this.currentLanguage === 'en' ? "Transcribed! You can edit or click Send." : "ถอดความสำเร็จ! สามารถแก้ไขหรือกดส่งได้");
                        } else {
                            throw new Error("Empty transcription returned");
                        }
                    } else {
                        throw new Error(`HTTP error ${response.status}`);
                    }
                } catch (err) {
                    console.warn("Backend STT failed, falling back to client-side browser STT:", err);
                    this.backendSTTFailed = true;
                    this.status.innerText = (this.currentLanguage === 'en' ? "Switching to browser STT..." : "ระบบสลับไปใช้ระบบแปลเสียงในตัวเบราว์เซอร์...");
                    this.runLocalSpeechRecognition();
                }
            };

            this.mediaRecorder.start();

        } catch (e) {
            console.warn("Failed to start MediaRecorder, falling back to local speech recognition:", e);
            this.backendSTTFailed = true;
            this.runLocalSpeechRecognition();
        }
    }

    runLocalSpeechRecognition() {
        if (window.hasOwnProperty('webkitSpeechRecognition')) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = this.currentLanguage === 'en' ? 'en-US' : 'th-TH';

            let final_transcript = '';

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.status.innerText = (this.currentLanguage === 'en' ? "Recording voice... Click Stop when finished." : "ระบบกำลังรับเสียงซักประวัติ (คลิกหยุดเมื่อพูดเสร็จ)...");
                this.micBtn.innerText = (this.currentLanguage === 'en' ? "⏹️ Stop" : "⏹️ หยุดบันทึก");
                this.micBtn.style.backgroundColor = "#dc3545";
                this.micBtn.style.color = "white";
                
                if (this.cancelPortalBtn) {
                    this.cancelPortalBtn.style.display = 'none';
                }
                
                this.chatTextInput.value = "";
                this.currentPatientMsgDiv = null;
            };

            this.recognition.onresult = (e) => {
                let interim_transcript = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) final_transcript += e.results[i][0].transcript;
                    else interim_transcript += e.results[i][0].transcript;
                }
                this.chatTextInput.value = final_transcript + interim_transcript;
            };

            this.recognition.onend = () => {
                this.isRecording = false;
                this.micBtn.innerText = (this.currentLanguage === 'en' ? "🎤 Speak" : "🎤 คลิกเพื่อพูด");
                this.micBtn.style.backgroundColor = "#f1f5f9";
                this.micBtn.style.color = "#475569";

                if (this.cancelPortalBtn) {
                    this.cancelPortalBtn.style.display = 'inline-block';
                }
                this.chatTextInput.focus();
                this.status.innerText = (this.currentLanguage === 'en' ? "Transcribed! You can edit or click Send." : "ถอดความสำเร็จ! สามารถแก้ไขหรือกดส่งได้");
            };

            this.recognition.start();
        } else {
            alert(this.currentLanguage === 'en' 
                ? "This browser does not support Speech Recognition. Please use Google Chrome."
                : "เว็บเบราว์เซอร์นี้ไม่สนับสนุนการแปลงเสียงพูดเป็นข้อความ (Speech Recognition) กรุณาใช้ Google Chrome");
        }
    }

    sendTextMessage() {
        if (!this.chatTextInput) return;
        const text = this.chatTextInput.value.trim();
        if (!text) return;

        // Record event in timeline for clinical reasoning map
        if (!this.eventTimeline) this.eventTimeline = [];
        const elapsedSeconds = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        this.eventTimeline.push({
            action: (this.currentLanguage === 'en' ? "Question: " : "คำถาม: ") + text,
            time: elapsedSeconds
        });

        // Clear the input field
        this.chatTextInput.value = "";

        // Append user's text message to chat box
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'msg user';
        userMsgDiv.innerText = (this.currentLanguage === 'en' ? "Doctor: " : "แพทย์: ") + text;
        this.chatBox.appendChild(userMsgDiv);
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
        this.currentPatientMsgDiv = null;

        // Send via WebSocket
        this.sendViaWS(text);
    }

    sendViaWS(text) {
        // Enforce hiding cancel button permanently upon sending the first query
        if (this.cancelPortalBtn) {
            this.cancelPortalBtn.style.display = 'none';
        }
        
        if (text !== "__END_SESSION__") {
            this.showTypingIndicator();
        }
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            // Package up the chat payload alongside GGUF & PAD parameters
            this.socket.send(JSON.stringify({ 
                session_id: this.sessionId, 
                student_text: text,
                case_id: this.selectedCaseId, // 👈 Dynamically bind selected case to session
                student_id: this.studentId, // 👈 Send student details to WS for SQLite logs & limits
                student_name: this.studentName,
                config: {
                    model: this.selectedModel,
                    temperature: this.temperature,
                    api_tier: this.apiTier, // 👈 Send current tier (free or paid/Typhoon)
                    system_prompt_custom: "", // 👈 Students no longer override custom system prompt templates!
                    additional_instructions: this.customPrompt, // 👈 Send additional behavior instructions!
                    language: this.currentLanguage, // 👈 Send selected language
                    emotions: {
                        anger: this.anger,
                        sadness: this.sadness,
                        happiness: this.happiness,
                        pad: this.pad
                    }
                }
            }));
        }
    }

    updateLangUIState() {
        const langBtns = this.shadowDOM.querySelectorAll('.lang-btn');
        langBtns.forEach(btn => {
            const btnLang = btn.getAttribute('data-lang');
            if (btnLang === this.currentLanguage) {
                btn.style.backgroundColor = '#ea580c';
                btn.style.color = 'white';
            } else {
                btn.style.backgroundColor = '#ffffff';
                btn.style.color = '#475569';
            }
        });
        
        // Also translate UI
        this.translateUI();
    }

    translateUI() {
        const lang = this.currentLanguage || 'th';
        const t = this.translations[lang];
        if (!t) return;
        
        // Translate elements with data-i18n attribute
        const elements = this.shadowDOM.querySelectorAll('[data-i18n]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (t[key]) {
                if (el.tagName === 'INPUT' && el.type === 'text') {
                    el.placeholder = t[key];
                } else if (el.tagName === 'INPUT' && el.type === 'checkbox') {
                    // Skip
                } else if (el.tagName === 'SPAN' && (el.id === 'settings-diff-desc-span' || el.id === 'settings-extra-note-span')) {
                    el.innerHTML = t[key];
                } else {
                    el.innerText = el.getAttribute('data-prefix') 
                        ? el.getAttribute('data-prefix') + t[key]
                        : t[key];
                }
            }
        });

        // Translate settings drawer preset dropdown
        const presetSelect = this.shadowDOM.getElementById('preset-select');
        if (presetSelect) {
            const currentVal = presetSelect.value;
            presetSelect.innerHTML = lang === 'en' ? `
                <option value="cooperative">Cooperative / Calm</option>
                <option value="normal">Normal</option>
                <option value="anxious">Highly Anxious</option>
                <option value="severe_pain">Severe Pain</option>
                <option value="combative">Combative / Irritable</option>
                <option value="depressed">Depressed / Fatigued</option>
                <option value="custom">Customize Mood...</option>
            ` : `
                <option value="cooperative">ให้ความร่วมมือดี / ใจเย็น</option>
                <option value="normal">ปกติ</option>
                <option value="anxious">วิตกกังวล / ตื่นตระหนก</option>
                <option value="severe_pain">เจ็บปวดรุนแรง</option>
                <option value="combative">โกรธ / ก้าวร้าวเหวี่ยงหมอ</option>
                <option value="depressed">ซึมเศร้า / ท้อแท้เหนื่อยล้า</option>
                <option value="custom">ปรับแต่งอารมณ์เอง...</option>
            `;
            presetSelect.value = currentVal;
        }

        // Translate textarea placeholder
        const promptTextarea = this.shadowDOM.getElementById('prompt-textarea');
        if (promptTextarea && t['settings-extra-placeholder']) {
            promptTextarea.placeholder = t['settings-extra-placeholder'];
        }
        
        // Adjust standard mic button text based on language if not currently recording
        if (this.micBtn && !this.isRecording) {
            this.micBtn.innerText = lang === 'en' ? "🎤 Speak" : "🎤 คลิกเพื่อพูด";
        }
        
        // Dynamic status mapping helper
        if (this.status) {
            const currentStatus = this.status.innerText;
            if (lang === 'en') {
                if (currentStatus === 'กำลังเชื่อมต่อ...' || currentStatus === 'กำลังเชื่อมต่อกับเซิร์ฟเวอร์...') this.status.innerText = t['status-connecting'];
                else if (currentStatus === 'รอเริ่มต้นบทสนทนา...') this.status.innerText = t['model-display-waiting'];
                else if (currentStatus === 'รอรับคำถามต่อไป...') this.status.innerText = t['status-waiting'];
                else if (currentStatus === 'กำลังบันทึกเสียงพูด...') this.status.innerText = t['status-recording'];
                else if (currentStatus === 'กำลังประมวลผล...') this.status.innerText = t['status-processing'];
                else if (currentStatus === 'กำลังถอดเสียงจากคลาวด์...') this.status.innerText = t['status-transcribing'];
            } else {
                if (currentStatus === 'Connecting...' || currentStatus === 'Connecting to server...') this.status.innerText = t['status-connecting'];
                else if (currentStatus === '(Waiting to begin encounter...)') this.status.innerText = t['model-display-waiting'];
                else if (currentStatus === 'Waiting for your next question...') this.status.innerText = t['status-waiting'];
                else if (currentStatus === 'Recording voice...') this.status.innerText = t['status-recording'];
                else if (currentStatus === 'Processing...') this.status.innerText = t['status-processing'];
                else if (currentStatus === 'Transcribing audio in cloud...') this.status.innerText = t['status-transcribing'];
            }
        }

        // Rebuild persona lists and summaries with new language (disable recursion by calling raw internal logic directly)
        this.rebuildPersonaDropdownsAndAvatars();
        
        // Dynamically translate and re-render the cases grid list
        if (this.casesList && this.casesList.length > 0) {
            this.renderCasesList();
        }
    }

    rebuildPersonaDropdownsAndAvatars() {
        this.loadPersonaBank();
        this.loadPreExamPersonaBank();
    }

    showTypingIndicator() {
        this.hideTypingIndicator();
        
        const indicatorDiv = document.createElement('div');
        indicatorDiv.className = 'msg patient typing-indicator';
        const label = this.currentLanguage === 'en' ? "Patient: " : "คนไข้: ";
        indicatorDiv.innerHTML = `
            <span>${label}</span>
            <div class="typing-indicator-dots" style="display: inline-flex; align-items: center; gap: 4px; vertical-align: middle;">
                <div class="typing-indicator-dot"></div>
                <div class="typing-indicator-dot"></div>
                <div class="typing-indicator-dot"></div>
            </div>
        `;
        this.chatBox.appendChild(indicatorDiv);
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    }

    hideTypingIndicator() {
        const indicators = this.shadowDOM.querySelectorAll('.typing-indicator');
        indicators.forEach(ind => ind.remove());
    }

    showSessionEndedState() {
        this.micBtn.style.display = 'none';
        this.endBtn.style.display = 'none';
        this.newBtn.style.display = 'inline-block';
        this.viewEvalBtn.style.display = 'inline-block';
        if (this.portalBtn) this.portalBtn.style.display = 'inline-block';
    }

    endSimulation() {
        const lang = this.currentLanguage || 'th';
        const confirmMsg = lang === 'en' 
            ? "Are you sure you want to end the encounter?" 
            : "คุณแน่ใจหรือไม่ว่าต้องการจบการซักประวัติ?";
            
        if (confirm(confirmMsg)) {
            // Reset input values inside calibration gate
            if (this.confDiagnosisInput) this.confDiagnosisInput.value = "";
            if (this.confScoreInput) {
                this.confScoreInput.value = "80";
                if (this.confScoreVal) this.confScoreVal.innerText = "80%";
            }
            // Display calibration modal
            if (this.confidenceModal) {
                this.confidenceModal.style.display = 'flex';
            } else {
                // Fallback if modal elements failed to load
                this.sendViaWS("__END_SESSION__");
                this.showSessionEndedState();
                this.showEvaluation();
            }
        }
    }

    async submitEvaluation(suspectedDiagnosis, confidenceScore) {
        this.evalModal.style.display = 'block';
        this.evalResults.innerHTML = (this.currentLanguage === 'en')
            ? "<p style='text-align:center;'>Processing clinical evaluation by AI... (May take 10-30 seconds)</p>"
            : "<p style='text-align:center;'>กำลังประมวลผลการประเมินโดย AI... (อาจใช้เวลา 10-30 วินาที)</p>";

        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const payload = {
                suspected_diagnosis: suspectedDiagnosis,
                confidence_score: parseInt(confidenceScore) || 0,
                event_timeline: this.eventTimeline || [],
                language: this.currentLanguage || 'th'
            };
            
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/evaluate/${this.sessionId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': '1'
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();

            if (data.error) {
                this.evalResults.innerHTML = `<p style='color:red;'>Error: ${data.error}</p>`;
                return;
            }

            this.lastEvaluationData = data;
            this.evalResults.innerHTML = this.renderEvaluationHTML(data);
        } catch (e) {
            console.error("Evaluation submission failed:", e);
            this.evalResults.innerHTML = (this.currentLanguage === 'en')
                ? `<p style='color:red;'>Failed to connect to server for evaluation.</p>`
                : `<p style='color:red;'>ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อประเมินได้</p>`;
        }
    }

    async performEncounterAction(actionType, target) {
        if (!this.sessionId) return;
        
        // Append a temporary loading or notice in the chat
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'msg patient';
        loadingDiv.innerHTML = this.currentLanguage === 'en' 
            ? `<i>Performing ${actionType === 'physical_exam' ? 'Physical Exam' : 'Lab Test'}: ${target}...</i>`
            : `<i>กำลังทำการตรวจ/ส่งแล็บ: ${target}...</i>`;
        this.chatBox.appendChild(loadingDiv);
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
        
        // Track relative elapsed seconds
        const elapsedSeconds = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        
        // Store in eventTimeline for reasoning map timeline
        if (!this.eventTimeline) this.eventTimeline = [];
        this.eventTimeline.push({
            action: (actionType === 'physical_exam' ? 'Physical Exam: ' : 'Lab Request: ') + target,
            time: elapsedSeconds
        });
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const payload = {
                session_id: this.sessionId,
                action_type: actionType,
                target: target,
                elapsed_seconds: elapsedSeconds,
                language: this.currentLanguage || 'th',
                case_id: this.selectedCaseId || ""
            };
            
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/encounter/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': '1'
                },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                loadingDiv.className = 'msg patient'; // display as patient/system bubble
                let formattedResult = data.result;
                if (formattedResult.includes('|')) {
                    formattedResult = this.parseMarkdownTable(formattedResult);
                    loadingDiv.innerHTML = `<b>[${actionType === 'physical_exam' ? 'Physical Exam' : 'Lab Result'}: ${target}]</b><br>${formattedResult}`;
                } else {
                    loadingDiv.innerHTML = `<b>[${actionType === 'physical_exam' ? 'Physical Exam' : 'Lab Result'}: ${target}]</b><br>${formattedResult}`;
                }
            } else {
                loadingDiv.innerText = `❌ Error: ${data.message || 'Failed to execute action'}`;
            }
        } catch (e) {
            console.error("Encounter action failed:", e);
            loadingDiv.innerText = `❌ Error: Connection failed`;
        }
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    }

    parseMarkdownTable(md) {
        const lines = md.trim().split('\n');
        let html = '<table style="width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 11.5px; text-align: left; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">';
        let rowCount = 0;
        for (const line of lines) {
            if (!line.includes('|')) continue;
            if (line.includes('---')) continue; // Skip header divider
            
            const cells = line.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
            html += '<tr style="' + (rowCount === 0 ? 'background-color: #f1f5f9; font-weight: bold; border-bottom: 2px solid #cbd5e1;' : 'border-bottom: 1px solid #e2e8f0;') + '">';
            for (const cell of cells) {
                html += `<td style="padding: 6px 8px;">${cell}</td>`;
            }
            html += '</tr>';
            rowCount++;
        }
        html += '</table>';
        return html;
    }

    newSimulation() {
        this.closeConnections();
        this.closeDrawer(); // Ensure settings drawer is closed
        this.sessionId = "session_" + Math.random().toString(36).substring(7);
        this.chatBox.innerHTML = "";
        if (this.activeModelName) this.activeModelName.innerText = "(รอเริ่มต้นบทสนทนา...)";
        this.currentPatientMsgDiv = null;
        this.ttsQueue = [];
        this.isSpeaking = false;
        this.lastEvaluationData = null;
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        
        if (this.mode === 'selective') {
            this.showScreen('portal');
        } else {
            this.startSimulationWithCase(null);
        }
    }

    renderEvaluationHTML(data) {
        const lang = this.currentLanguage || 'th';
        const rawScore = data.overall_score || data.total_score || 0;
        const totalLabel = lang === 'en' ? 'Checklist Score:' : 'คะแนนรวม:';
        let html = `<div style='text-align:center; font-size: 24px; margin-bottom: 20px;'>${totalLabel} <b>${rawScore}/5</b></div>`;
        
        const scores = data.scores || {};
        for (const [key, score] of Object.entries(scores)) {
            const label = key.replace(/_/g, ' ').toUpperCase();
            html += `
                <div class="score-row">
                    <span>${label}</span>
                    <span class="score-stars">${'⭐'.repeat(score)}</span>
                </div>
            `;
        }

        const feedback = data.feedback || {};
        const strengths = feedback.strengths || [];
        const weaknesses = feedback.weaknesses || [];
        const suggestion = feedback.suggestion || "";

        const strengthsLabel = lang === 'en' ? 'Strengths:' : 'จุดเด่น:';
        const weaknessesLabel = lang === 'en' ? 'Areas for Improvement:' : 'จุดที่ควรพัฒนา:';
        const suggestionLabel = lang === 'en' ? 'Recommendations:' : 'คำแนะนำเพิ่มเติม:';

        html += `
            <div class="feedback-section">
                <p class="strength">${strengthsLabel}</p>
                <ul>${strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                <p class="weakness">${weaknessesLabel}</p>
                <ul>${weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
                <p><b>${suggestionLabel}</b> ${suggestion}</p>
            </div>
        `;

        // Render pivoted Clinical Reasoning Map and Metacognitive Calibration
        if (data.reasoning_map) {
            const mapData = data.reasoning_map;
            const calibration = mapData.calibration || {};
            const pacing = mapData.pacing_feedback || {};
            const hypotheses = mapData.hypotheses_mapped || [];
            const divergences = mapData.divergences || [];
            const missed = mapData.missed_opportunities || [];
            
            const actualPercent = Math.round(rawScore * 20);
            
            const titleText = lang === 'en' ? '🔍 Clinical Reasoning Mirror' : '🔍 วิเคราะห์การตัดสินใจและเหตุผลการวินิจฉัย';
            const metaTitle = lang === 'en' ? 'Metacognitive Calibration' : 'Metacognitive Calibration (การสอบทานการรับรู้)';
            const diagLabel = lang === 'en' ? 'Suspected Diagnosis:' : 'วินิจฉัยของคุณ:';
            
            let statusText = '';
            if (calibration.is_correct) {
                statusText = lang === 'en' ? '<span style="color:green; font-weight:bold;">Correct / สอดคล้อง</span>' : '<span style="color:green; font-weight:bold;">ถูกต้อง / สอดคล้อง</span>';
            } else {
                statusText = lang === 'en' ? '<span style="color:red; font-weight:bold;">Discrepant / ไม่สอดคล้อง</span>' : '<span style="color:red; font-weight:bold;">ยังไม่สอดคล้อง / ต้องสอบทานเพิ่มเติม</span>';
            }
            
            const confLabel = lang === 'en' ? 'Your Confidence:' : 'ความมั่นใจของคุณ:';
            const perfLabel = lang === 'en' ? 'Checklist Performance:' : 'คะแนนทักษะจริง:';
            const pacingTitle = lang === 'en' ? 'Pacing & Time Management' : 'Pacing & Time Management (การบริหารเวลา)';
            const timelineTitle = lang === 'en' ? 'Reasoning & Hypothesis Timeline' : 'เส้นทางความคิดและสมมติฐานการซักประวัติ';
            const hypothesisLabel = lang === 'en' ? 'Hypothesis tested:' : 'สมมติฐานที่ตรวจหา:';
            const divergenceTitle = lang === 'en' ? '⚠️ Divergence Points (จุดที่ออกนอกเส้นทางเป้าหมาย)' : '⚠️ Divergence Points (จุดที่ออกนอกเส้นทางเป้าหมาย)';
            const missedTitle = lang === 'en' ? '❌ Missed Opportunities (จุดที่ขาดความรอบคอบ)' : '❌ Missed Opportunities (จุดที่ขาดความรอบคอบ)';
            
            const actionHeader = lang === 'en' ? 'Action:' : 'การกระทำ:';
            const reasonHeader = lang === 'en' ? 'Explanation:' : 'เหตุผล:';
            const missedHeader = lang === 'en' ? 'What was missed:' : 'สิ่งที่ขาดไป:';
            const sigHeader = lang === 'en' ? 'Clinical significance:' : 'ความสำคัญ:';

            const diagAccuracyPercent = calibration.is_correct ? 100 : 0;
            const diagAccuracyLabel = lang === 'en' ? 'Diagnostic Accuracy:' : 'ความถูกต้องของการวินิจฉัย:';
            const diagAccuracyColor = calibration.is_correct ? '#10b981' : '#ef4444';
            
            html += `
                <div class="reasoning-map-container" style="margin-top: 25px; border-top: 2px solid #e2e8f0; padding-top: 20px; text-align: left; font-family: inherit;">
                    <h3 style="color: #1e3a8a; font-size: 16px; margin-top: 0; font-weight: 800; border-bottom: 2px solid #2563eb; padding-bottom: 6px; display: inline-block;">${titleText}</h3>
                    
                    <!-- Calibration Bar -->
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 15px; margin-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #334155; font-weight: bold;">${metaTitle}</h4>
                        <div style="font-size: 12px; color: #475569; margin-bottom: 5px;">
                            ${diagLabel} <b style="color: #1e3a8a;">${calibration.student_diagnosis || 'N/A'}</b> 
                            (${statusText})
                        </div>
                        
                        <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 10px;">
                            <div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 2px;">
                                    <span>${diagAccuracyLabel}</span>
                                    <b>${diagAccuracyPercent}%</b>
                                </div>
                                <div style="width: 100%; background-color: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
                                    <div style="width: ${diagAccuracyPercent}%; background-color: ${diagAccuracyColor}; height: 100%;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 2px;">
                                    <span>${perfLabel}</span>
                                    <b>${actualPercent}%</b>
                                </div>
                                <div style="width: 100%; background-color: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
                                    <div style="width: ${actualPercent}%; background-color: #3b82f6; height: 100%;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; margin-bottom: 2px;">
                                    <span>${confLabel}</span>
                                    <b>${calibration.student_confidence || 0}%</b>
                                </div>
                                <div style="width: 100%; background-color: #e2e8f0; height: 10px; border-radius: 5px; overflow: hidden;">
                                    <div style="width: ${calibration.student_confidence || 0}%; background-color: #f59e0b; height: 100%;"></div>
                                </div>
                            </div>
                        </div>
                        <div style="font-size: 12px; color: #1e40af; font-weight: bold; margin-top: 12px; line-height: 1.4; padding: 8px 10px; background-color: #eff6ff; border-radius: 6px;">
                            💡 ${calibration.gap_analysis || ''}
                        </div>
                    </div>
                    
                    <!-- Pacing Feedback -->
                    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; font-size: 13px; color: #334155; font-weight: bold;">${pacingTitle}</h4>
                        <div style="font-size: 12px; color: #475569; line-height: 1.4; margin-bottom: 10px;">⏱️ ${pacing.timeline_summary || ''}</div>
                        <ul style="margin: 0; padding-left: 20px; font-size: 12px; color: #475569; line-height: 1.5;">
                            ${(pacing.efficiency_recommendations || []).map(r => `<li>${r}</li>`).join('')}
                        </ul>
                    </div>

                    <!-- Timeline Reasoning Map -->
                    <h4 style="margin: 20px 0 12px 0; font-size: 13px; color: #334155; font-weight: bold;">${timelineTitle}</h4>
                    <div style="position: relative; border-left: 2px dashed #cbd5e1; padding-left: 15px; margin-left: 10px; margin-bottom: 20px; text-align: left;">
                        ${hypotheses.map(h => `
                            <div style="position: relative; margin-bottom: 15px;">
                                <div style="position: absolute; left: -21px; top: 4px; width: 10px; height: 10px; border-radius: 50%; background-color: #3b82f6; border: 2px solid #ffffff;"></div>
                                <div style="font-size: 11px; color: #64748b; font-weight: bold;">[${h.timestamp}]</div>
                                <div style="font-size: 13px; font-weight: bold; color: #1e293b; margin-top: 2px;">${h.action}</div>
                                <div style="font-size: 12px; color: #2563eb; margin-top: 1px;">${hypothesisLabel} <b>${h.hypothesis}</b></div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- Divergences -->
                    ${divergences.length > 0 ? `
                        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 15px; margin-bottom: 15px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #d97706; display: flex; align-items: center; gap: 5px; font-weight: bold;">${divergenceTitle}</h4>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${divergences.map(d => `
                                    <div style="font-size: 12px; line-height: 1.4; color: #475569;">
                                        <b>${actionHeader}</b> ${d.action}<br>
                                        <span style="color: #b45309;"><b>${reasonHeader}</b> ${d.explanation}</span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}

                    <!-- Missed Opportunities -->
                    ${missed.length > 0 ? `
                        <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 15px;">
                            <h4 style="margin: 0 0 8px 0; font-size: 13px; color: #dc2626; display: flex; align-items: center; gap: 5px; font-weight: bold;">${missedTitle}</h4>
                            <div style="display: flex; flex-direction: column; gap: 10px;">
                                ${missed.map(m => `
                                    <div style="font-size: 12px; line-height: 1.4; color: #475569;">
                                        <b>${missedHeader}</b> <span style="color:#b91c1c; font-weight:bold;">${m.missed}</span><br>
                                        <b>${sigHeader}</b> ${m.reason}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        return html;
    }

    async showEvaluation() {
        this.evalModal.style.display = 'block';
        if (this.lastEvaluationData) {
            this.evalResults.innerHTML = this.renderEvaluationHTML(this.lastEvaluationData);
            return;
        }
        
        this.evalResults.innerHTML = this.currentLanguage === 'en'
            ? "<p style='text-align:center;'>Loading clinical evaluation... (Please wait)</p>"
            : "<p style='text-align:center;'>กำลังประมวลผลการประเมินโดย AI... (อาจใช้เวลา 10-30 วินาที)</p>";

        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/evaluate/${this.sessionId}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
            const data = await response.json();

            if (data.error) {
                this.evalResults.innerHTML = `<p style='color:red;'>เกิดข้อผิดพลาด: ${data.error}</p>`;
                return;
            }

            this.evalResults.innerHTML = this.renderEvaluationHTML(data);
        } catch (e) {
            console.error("Evaluation loading failed:", e);
            this.evalResults.innerHTML = `<p style='color:red;'>ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อดึงข้อมูลประเมินได้</p>`;
        }
    }

    showEvaluationDetail(evaluation, scenarioName, sessionId) {
        this.evalModal.style.display = 'block';
        const lang = this.currentLanguage || 'th';
        const localizedName = this.translateCaseContent({ scenario_name: scenarioName, category: '', chief_complaint: '' }, lang).scenario_name;
        const encounterLabel = lang === 'en' ? 'Encounter Case:' : 'เคสการรักษา:';
        const idLabel = lang === 'en' ? 'Evaluation ID:' : 'รหัสประเมิน:';
        
        this.evalResults.innerHTML = `
            <h3 style="text-align: center; margin-top: 0; color: #1a1e29;">${encounterLabel} ${localizedName}</h3>
            <div style="font-size: 11px; text-align: center; color: #64748b; margin-bottom: 15px;">${idLabel} ${sessionId}</div>
            ${this.renderEvaluationHTML(evaluation)}
        `;
    }

    async loadStudentHistory() {
        this.showScreen('history');
        this.historyLoading.style.display = 'block';
        this.historyListContainer.innerHTML = "";
        
        const lang = this.currentLanguage || 'th';
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const studentId = this.studentId || "guest_student";
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/history/${studentId}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
            const historyList = await response.json();
            
            this.historyLoading.style.display = 'none';
            
            if (!historyList || historyList.length === 0) {
                this.historyListContainer.innerHTML = lang === 'en'
                    ? "<p style='text-align:center; padding: 40px 0; color: #64748b;'>No exam or practice history found in the system.</p>"
                    : "<p style='text-align:center; padding: 40px 0; color: #64748b;'>ยังไม่มีประวัติการสอบประเมินของคุณในระบบ</p>";
                return;
            }
            
            historyList.forEach(s => {
                const card = document.createElement('div');
                card.className = 'case-card';
                card.style.flexDirection = 'row';
                card.style.justifyContent = 'space-between';
                card.style.alignItems = 'center';
                
                const localizedScenarioName = this.translateCaseContent({ scenario_name: s.scenario_name, category: '', chief_complaint: '' }, lang).scenario_name;
                
                const timestamp = s.updated_at ? new Date(s.updated_at).toLocaleString(lang === 'en' ? 'en-US' : 'th-TH', { hour12: false }) : 'N/A';
                const scoreText = s.score 
                    ? (lang === 'en' ? `Score: ${s.score}/5` : `คะแนน ${s.score}/5`) 
                    : (lang === 'en' ? 'Pending' : 'รอดำเนินการ');
                const statusClass = s.status === 'completed' ? 'badge-general' : 'badge-abdomen';
                const statusText = s.status === 'completed' 
                    ? (lang === 'en' ? 'Completed' : 'เสร็จสิ้นการซัก') 
                    : (lang === 'en' ? 'In Progress' : 'ยังไม่จบการซัก');
                
                const caseLabel = lang === 'en' ? 'Case:' : 'เคส:';
                const examDateText = lang === 'en'
                    ? `📅 Date: ${timestamp} | 💬 ${s.turns} turns`
                    : `📅 สอบเมื่อ: ${timestamp} | 💬 คุยไป ${s.turns} ประโยค`;
                
                card.innerHTML = `
                    <div style="flex: 1; text-align: left;">
                        <span class="badge ${statusClass}">${statusText}</span>
                        <h4 class="case-title" style="margin-top: 5px;">${caseLabel} ${localizedScenarioName}</h4>
                        <div style="font-size: 12px; color: #64748b; margin-top: 4px;">${examDateText}</div>
                    </div>
                    <div style="text-align: right; min-width: 100px;">
                        <b style="color: #f59e0b; font-size: 16px;">${scoreText}</b>
                    </div>
                `;
                
                if (s.evaluation) {
                    card.addEventListener('click', () => {
                        this.showEvaluationDetail(s.evaluation, s.scenario_name, s.session_id);
                    });
                }
                
                this.historyListContainer.appendChild(card);
            });
        } catch (e) {
            console.error("Failed to load student history:", e);
            this.historyLoading.style.display = 'none';
            this.historyListContainer.innerHTML = lang === 'en'
                ? "<p style='text-align:center; padding: 40px 0; color: red;'>❌ Failed to load history, check server connection</p>"
                : "<p style='text-align:center; padding: 40px 0; color: red;'>❌ ดึงประวัติผิดพลาด ตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์</p>";
        }
    }

    closeModal() {
        this.evalModal.style.display = 'none';
    }

    // --- TTS Queue Logic ---
    enqueueTTS(text) {
        if (!text.trim()) return;
        this.ttsQueue.push(text);
        this.processTTSQueue();
    }

    async processTTSQueue() {
        if (this.isSpeaking || this.ttsQueue.length === 0) return;
        this.isSpeaking = true;
        const text = this.ttsQueue.shift();

        // 1. Quota Saver: Bypass backend for very short sentences (saves ElevenLabs characters)
        const isVeryShort = text.length < 15;
        
        if (!isVeryShort && !this.backendTTSFailed) {
            try {
                const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
                const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/tts`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        'ngrok-skip-browser-warning': '1'
                    },
                    body: JSON.stringify({
                        text: text,
                        gender: this.currentPatientGender || "female",
                        pleasure: this.pad ? parseFloat(this.pad.p || 0.0) : 0.0,
                        arousal: this.pad ? parseFloat(this.pad.a || 0.0) : 0.0,
                        dominance: this.pad ? parseFloat(this.pad.d || 0.0) : 0.0,
                        language: this.currentLanguage || "th"
                    })
                });

                if (response.ok) {
                    const audioBlob = await response.blob();
                    const audioUrl = URL.createObjectURL(audioBlob);
                    const audio = new Audio(audioUrl);
                    
                    // Modulate speed based on PAD coordinates
                    let rate = 1.0;
                    if (this.pad) {
                        const p = parseFloat(this.pad.p || 0.0);
                        const a = parseFloat(this.pad.a || 0.0);
                        if (p < -0.3) {
                            rate = 0.85; // Slow down under severe pain
                        } else if (a > 0.4 && p < 0.0) {
                            rate = 1.15; // Speed up under high arousal anxiety/panic
                        }
                    }
                    audio.playbackRate = rate;

                    audio.onended = () => {
                        this.isSpeaking = false;
                        URL.revokeObjectURL(audioUrl);
                        this.processTTSQueue();
                    };
                    audio.onerror = (e) => {
                        console.error("Audio playback error, falling back:", e);
                        this.isSpeaking = false;
                        this.backendTTSFailed = true;
                        // Retry this sentence using browser TTS
                        this.ttsQueue.unshift(text);
                        this.processTTSQueue();
                    };
                    
                    audio.play();
                    return;
                } else {
                    if (response.status === 501) {
                        console.info("Backend TTS not configured, using browser voice.");
                    } else {
                        console.warn(`Backend TTS returned status ${response.status}`);
                    }
                    this.backendTTSFailed = true;
                }
            } catch (err) {
                console.warn("Backend TTS connection failed, falling back:", err);
                this.backendTTSFailed = true;
            }
        }

        // 2. Fallback / Quota-saved: Use native Web Speech API speechSynthesis
        if (typeof SpeechSynthesisUtterance !== 'undefined' && window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(text);
            const isEn = this.currentLanguage === 'en';
            utterance.lang = isEn ? "en-US" : "th-TH";
            
            // Adjust rate for native voice based on PAD
            let rate = 1.0;
            if (this.pad) {
                const p = parseFloat(this.pad.p || 0.0);
                const a = parseFloat(this.pad.a || 0.0);
                if (p < -0.3) {
                    rate = 0.85;
                } else if (a > 0.4 && p < 0.0) {
                    rate = 1.15;
                }
            }
            utterance.rate = rate;

            try {
                const voices = window.speechSynthesis.getVoices();
                if (isEn) {
                    const enVoices = voices.filter(v => v.lang === 'en-US' || v.lang.replace('_', '-').startsWith('en-'));
                    if (enVoices.length > 0) {
                        const gender = (this.currentPatientGender || 'female').toLowerCase();
                        let matchedVoice = null;
                        if (gender === 'male' || gender === 'elderly_male') {
                            matchedVoice = enVoices.find(v => 
                                v.name.toLowerCase().includes('david') || 
                                v.name.toLowerCase().includes('male') || 
                                v.name.toLowerCase().includes('man') ||
                                v.name.toLowerCase().includes('microsoft')
                            );
                        } else {
                            matchedVoice = enVoices.find(v => 
                                v.name.toLowerCase().includes('zira') || 
                                v.name.toLowerCase().includes('female') || 
                                v.name.toLowerCase().includes('woman') || 
                                v.name.toLowerCase().includes('google')
                            );
                        }
                        if (!matchedVoice) {
                            matchedVoice = enVoices[0];
                        }
                        utterance.voice = matchedVoice;
                    }
                } else {
                    const thVoices = voices.filter(v => v.lang === 'th-TH' || v.lang.replace('_', '-').startsWith('th-'));
                    if (thVoices.length > 0) {
                        const gender = (this.currentPatientGender || 'female').toLowerCase();
                        let matchedVoice = null;
                        if (gender === 'male' || gender === 'elderly_male') {
                            matchedVoice = thVoices.find(v => 
                                v.name.toLowerCase().includes('niwat') || 
                                v.name.toLowerCase().includes('male') || 
                                v.name.toLowerCase().includes('man') ||
                                v.name.toLowerCase().includes('pattara')
                            );
                        } else {
                            matchedVoice = thVoices.find(v => 
                                v.name.toLowerCase().includes('premwadee') || 
                                v.name.toLowerCase().includes('achara') || 
                                v.name.toLowerCase().includes('female') || 
                                v.name.toLowerCase().includes('woman') || 
                                v.name.toLowerCase().includes('google')
                            );
                        }
                        if (!matchedVoice) {
                            matchedVoice = thVoices[0];
                        }
                        utterance.voice = matchedVoice;
                    }
                }
            } catch (e) {
                console.error("Error setting speech voice:", e);
            }

            utterance.onend = () => { 
                this.isSpeaking = false; 
                this.processTTSQueue(); 
            };
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn("Web SpeechSynthesis is not supported on this device.");
            this.isSpeaking = false;
            this.processTTSQueue();
        }
    }
}

customElements.define('ai-patient-simulator', AIPatientSimulator);

// ============================================================================
// AI PATIENT INSTRUCTOR ADMIN PANEL WEB COMPONENT
// ============================================================================
class AIPatientAdmin extends HTMLElement {
    constructor() {
        super();
        this.shadowDOM = this.attachShadow({ mode: 'open' });
        
        // Configuration & State
        this.serverUrl = this.getAttribute('server-url') || window.location.origin;
        this.activeTab = 'cases'; // 'cases' or 'sessions'
        this.casesList = [];
        this.sessionsList = [];
        this.editingCaseId = null; // null = create mode, string = edit mode
    }

    connectedCallback() {
        this.render();
        this.setupElements();
        this.checkAuthentication();
    }

    checkAuthentication() {
        this.instructorId = this.getAttribute('instructor-id') || this.getAttribute('instructor_id');
        this.role = this.getAttribute('role');

        if (!this.instructorId) {
            this.instructorId = sessionStorage.getItem('osce_instructor_id') || localStorage.getItem('osce_instructor_id');
            this.role = sessionStorage.getItem('osce_admin_role') || localStorage.getItem('osce_admin_role');
        }

        const isAuthorized = this.instructorId || this.role === 'admin' || sessionStorage.getItem('osce_admin_token') === 'admin_verified_token_xyz';

        if (isAuthorized) {
            if (this.instructorId) {
                sessionStorage.setItem('osce_instructor_id', this.instructorId);
                if (this.role) sessionStorage.setItem('osce_admin_role', this.role);
            }
            this.authGateScreen.style.display = 'none';
            this.paneCases.classList.add('active');
            // Load tables
            this.loadCases();
            this.loadSessions();
        } else {
            this.authGateScreen.style.display = 'flex';
            this.paneCases.classList.remove('active');
            this.paneSessions.classList.remove('active');
        }
    }

    static get observedAttributes() {
        return ['server-url', 'instructor-id', 'instructor_id', 'role'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'server-url') {
            this.serverUrl = newValue;
        } else if (name === 'instructor-id' || name === 'instructor_id') {
            this.instructorId = newValue;
            this.checkAuthentication();
        } else if (name === 'role') {
            this.role = newValue;
            this.checkAuthentication();
        }
    }

    render() {
        this.shadowDOM.innerHTML = `
            <style>
                :host {
                    display: block;
                    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                    max-width: 1000px;
                    width: 100%;
                    margin: 20px auto;
                    background-color: #0f172a; /* Premium Dark Slate-900 background */
                    color: #f8fafc;
                    border-radius: 16px;
                    border: 1px solid #1e293b;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
                    box-sizing: border-box;
                    overflow: hidden;
                    position: relative;
                    min-height: 520px;
                }
                .admin-container {
                    width: 100%;
                    display: flex;
                    flex-direction: column;
                }
                
                /* Navbar / Header Styling */
                .admin-navbar {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background-color: #1e293b; /* Slate-800 */
                    padding: 15px 24px;
                    border-bottom: 1px solid #334155;
                }
                .admin-logo {
                    font-size: 18px;
                    font-weight: 700;
                    color: #3b82f6; /* Modern Blue */
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                .admin-tabs {
                    display: flex;
                    gap: 8px;
                }
                .tab-link {
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    padding: 8px 16px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    border-radius: 8px;
                    transition: all 0.25s ease;
                }
                .tab-link:hover {
                    color: #f8fafc;
                    background-color: rgba(255, 255, 255, 0.05);
                }
                .tab-link.active {
                    color: #f8fafc;
                    background-color: #3b82f6;
                }

                /* Layout Panes */
                .tab-pane {
                    display: none;
                    padding: 24px;
                    box-sizing: border-box;
                }
                .tab-pane.active {
                    display: block;
                }
                
                .content-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .content-header h3 {
                    margin: 0;
                    font-size: 20px;
                    font-weight: 600;
                    color: #f8fafc;
                }

                /* Modern Button Utilities */
                .btn {
                    padding: 10px 18px;
                    font-size: 14px;
                    font-weight: 600;
                    border-radius: 8px;
                    border: none;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                }
                .btn-primary {
                    background-color: #3b82f6;
                    color: white;
                }
                .btn-primary:hover {
                    background-color: #2563eb;
                }
                .btn-secondary {
                    background-color: #475569;
                    color: #f8fafc;
                }
                .btn-secondary:hover {
                    background-color: #334155;
                }
                .btn-success {
                    background-color: #10b981;
                    color: white;
                }
                .btn-success:hover {
                    background-color: #059669;
                }
                .btn-danger {
                    background-color: #ef4444;
                    color: white;
                    padding: 6px 12px;
                    font-size: 12px;
                }
                .btn-danger:hover {
                    background-color: #dc2626;
                }
                .btn-edit {
                    background-color: #f59e0b;
                    color: white;
                    padding: 6px 12px;
                    font-size: 12px;
                }
                .btn-edit:hover {
                    background-color: #d97706;
                }
                .btn-close {
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    font-size: 20px;
                    cursor: pointer;
                }
                .btn-close:hover {
                    color: #f8fafc;
                }

                /* Forms & Inputs styling */
                .form-control {
                    width: 100%;
                    padding: 10px 14px;
                    background-color: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 8px;
                    color: #f8fafc;
                    font-size: 14px;
                    box-sizing: border-box;
                    margin-bottom: 12px;
                    transition: border-color 0.2s;
                }
                .form-control:focus {
                    border-color: #3b82f6;
                    outline: none;
                }
                textarea.form-control {
                    min-height: 100px;
                    font-family: inherit;
                    resize: vertical;
                }
                .form-group label {
                    display: block;
                    margin-bottom: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #94a3b8;
                }
                .validation-msg {
                    font-size: 11px;
                    color: #10b981;
                    display: block;
                    margin-top: -8px;
                    margin-bottom: 12px;
                }
                .validation-msg.invalid {
                    color: #ef4444;
                }

                /* Tables layouts styling */
                .table-wrapper {
                    background-color: #1e293b;
                    border-radius: 12px;
                    border: 1px solid #334155;
                    max-height: 520px;
                    overflow-y: auto;
                    margin-bottom: 15px;
                }
                .admin-table {
                    width: 100%;
                    border-collapse: collapse;
                    text-align: left;
                    font-size: 14px;
                }
                .admin-table th {
                    background-color: #334155;
                    color: #94a3b8;
                    padding: 12px 16px;
                    font-weight: 600;
                    border-bottom: 1px solid #475569;
                }
                .admin-table td {
                    padding: 14px 16px;
                    border-bottom: 1px solid #334155;
                    color: #e2e8f0;
                }
                .admin-table tbody tr:hover {
                    background-color: rgba(255, 255, 255, 0.02);
                }
                .actions-cell {
                    display: flex;
                    gap: 8px;
                }

                /* Two Column Master-Detail Layouts */
                .crud-layout, .analytics-layout {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 24px;
                }
                @media (min-width: 768px) {
                    .crud-layout, .analytics-layout {
                        grid-template-columns: 1.2fr 0.8fr;
                    }
                }
                
                .editor-column, .session-viewer-column {
                    background-color: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 12px;
                    padding: 20px;
                    box-sizing: border-box;
                    height: fit-content;
                    max-height: 700px;
                    overflow-y: auto;
                    position: sticky;
                    top: 24px;
                    align-self: start;
                }
                .editor-header, .detail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px solid #334155;
                    padding-bottom: 12px;
                    margin-bottom: 18px;
                }
                .editor-header h4, .detail-header h4 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 700;
                    color: #3b82f6;
                }
                
                .form-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 15px;
                }

                /* Badges Styling */
                .badge {
                    display: inline-block;
                    padding: 3px 8px;
                    font-size: 11px;
                    font-weight: 600;
                    border-radius: 20px;
                }
                .badge-completed { background-color: rgba(16, 185, 129, 0.15); color: #10b981; }
                .badge-active { background-color: rgba(59, 130, 246, 0.15); color: #3b82f6; }
                .badge-category { background-color: #334155; color: #94a3b8; }
                
                /* Detailed Evaluation Viewer Cards */
                .eval-summary-card {
                    background: #0f172a;
                    border-radius: 10px;
                    padding: 16px;
                    text-align: center;
                    margin-bottom: 20px;
                    border: 1px solid #334155;
                }
                .eval-score {
                    font-size: 28px;
                    font-weight: 700;
                    color: #f59e0b;
                    margin-bottom: 5px;
                }
                .eval-criteria-title {
                    font-size: 14px;
                    font-weight: bold;
                    color: #94a3b8;
                    margin: 15px 0 8px 0;
                    border-left: 3px solid #3b82f6;
                    padding-left: 8px;
                }
                .strength-title { color: #10b981; font-weight: bold; margin-bottom: 6px; font-size: 13px; }
                .weakness-title { color: #ef4444; font-weight: bold; margin-bottom: 6px; font-size: 13px; }
                
                /* Parameter Checklist Visualizer */
                .param-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 15px;
                }
                .param-item {
                    display: flex;
                    justify-content: space-between;
                    background: #0f172a;
                    padding: 10px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    border: 1px solid #1e293b;
                }
                .param-revealed {
                    color: #10b981;
                    font-weight: bold;
                }
                .param-hidden {
                    color: #64748b;
                }

                /* Dialogue History Visualizer inside Instructor Viewer */
                .transcript-container {
                    background-color: #0f172a;
                    border-radius: 10px;
                    padding: 15px;
                    max-height: 250px;
                    overflow-y: auto;
                    border: 1px solid #334155;
                    margin-bottom: 20px;
                }
                .chat-bubble {
                    margin-bottom: 10px;
                    padding: 8px 12px;
                    border-radius: 8px;
                    font-size: 13px;
                    line-height: 1.4;
                    max-width: 85%;
                    word-wrap: break-word;
                }
                .chat-bubble.stu {
                    background-color: #064e3b;
                    color: #d1e7dd;
                    margin-left: auto;
                    text-align: right;
                }
                .chat-bubble.pat {
                    background-color: #7f1d1d;
                    color: #f8d7da;
                    margin-right: auto;
                }

                /* Custom Scrollbar */
                ::-webkit-scrollbar {
                    width: 6px;
                }
                ::-webkit-scrollbar-track {
                    background: #0f172a;
                }
                ::-webkit-scrollbar-thumb {
                    background: #334155;
                    border-radius: 3px;
                }
                /* Glassmorphic Auth Gateway Overlay */
                .auth-overlay {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: radial-gradient(circle at center, rgba(15, 23, 42, 0.94) 0%, rgba(9, 15, 30, 0.98) 100%);
                    backdrop-filter: blur(16px) saturate(180%);
                    -webkit-backdrop-filter: blur(16px) saturate(180%);
                    z-index: 20000;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    box-sizing: border-box;
                    color: #f8fafc;
                    text-align: center;
                    transition: opacity 0.3s ease;
                }
                .auth-card {
                    background: rgba(30, 41, 59, 0.7);
                    border: 1px solid rgba(255, 255, 255, 0.08);
                    border-radius: 16px;
                    padding: 35px 30px;
                    width: 100%;
                    max-width: 380px;
                    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1);
                    text-align: center;
                    box-sizing: border-box;
                    animation: slideUp 0.4s ease-out;
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .auth-icon {
                    font-size: 56px;
                    margin-bottom: 16px;
                    filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.3));
                    display: inline-block;
                    animation: float 3s ease-in-out infinite;
                }
                @keyframes float {
                    0% { transform: translateY(0px); }
                    50% { transform: translateY(-10px); }
                    100% { transform: translateY(0px); }
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                .auth-title {
                    font-size: 22px;
                    font-weight: 800;
                    margin-bottom: 12px;
                    background: linear-gradient(135deg, #60a5fa, #3b82f6);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    letter-spacing: -0.5px;
                }
                .auth-desc {
                    font-size: 14px;
                    color: #94a3b8;
                    margin-bottom: 24px;
                    line-height: 1.6;
                }
                .auth-error {
                    color: #f87171;
                    font-size: 13px;
                    margin-top: 12px;
                    display: none;
                    font-weight: 600;
                    background: rgba(239, 68, 68, 0.1);
                    padding: 8px 12px;
                    border-radius: 6px;
                    border: 1px solid rgba(239, 68, 68, 0.2);
                }
                .auth-submit-btn {
                    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                    color: white;
                    width: 100%;
                    padding: 14px;
                    font-size: 15px;
                    font-weight: 700;
                    border-radius: 10px;
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(37, 99, 235, 0.4);
                    transition: all 0.25s ease;
                }
                .auth-submit-btn:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
                    opacity: 0.95;
                }
                .auth-submit-btn:active {
                    transform: translateY(0);
                }
                .lock-btn {
                    background: transparent;
                    color: #94a3b8;
                    border: none;
                    font-size: 14px;
                    font-weight: bold;
                    cursor: pointer;
                    padding: 8px 12px;
                    border-radius: 8px;
                    transition: all 0.2s;
                }
                .lock-btn:hover {
                    color: #ef4444;
                    background-color: rgba(239, 68, 68, 0.15);
                }
                .form-control {
                    width: 100%;
                    padding: 10px 14px;
                    background-color: #1e293b;
                    border: 1px solid #334155;
                    border-radius: 8px;
                    color: #f8fafc;
                    font-size: 14px;
                    box-sizing: border-box;
                    margin-bottom: 12px;
                    transition: border-color 0.2s;
                }
                .form-control:focus {
                    border-color: #3b82f6;
                    outline: none;
                }
            </style>
            
            <div class="admin-container">
                <!-- Admin Loading Overlay -->
                <div id="admin-loading-overlay" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); z-index: 40000; align-items: center; justify-content: center; flex-direction: column; color: white; border-radius: 16px;">
                    <div class="auth-icon" style="font-size: 48px; margin-bottom: 15px; animation: spin 2s linear infinite; display: inline-block;">⏳</div>
                    <div style="font-size: 16px; font-weight: bold; color: #3b82f6; margin-bottom: 8px;">กำลังบันทึกและปรับปรุงเวกเตอร์ (Vectorizing Case)...</div>
                    <div style="font-size: 12px; color: #94a3b8;">ระบบกำลังคำนวณเวกเตอร์ของประวัติย้อนหลังด้วย AI อาจใช้เวลาสักครู่...</div>
                </div>
                <div class="admin-navbar">
                    <div class="admin-logo">🏥 แผงควบคุมผู้ประเมิน OSCE AI</div>
                    <div class="admin-tabs" style="display: flex; align-items: center; gap: 8px;">
                        <button class="tab-link active" id="tab-cases">🩺 คลังเคสคนไข้สมมติ</button>
                        <button class="tab-link" id="tab-sessions">📊 ผลสัมฤทธิ์นักศึกษา</button>
                    </div>
                </div>
                
                <!-- Tab 1: Case Library Manager -->
                <div id="pane-cases" class="tab-pane active">
                    <div class="content-header">
                        <h3>🩺 รายการเคสคนไข้จำลองทั้งหมด</h3>
                        <button class="btn btn-primary" id="btn-add-case">+ สร้างเคสใหม่</button>
                    </div>
                    
                    <div class="crud-layout">
                        <div class="cases-table-column">
                            <input type="text" id="case-search" class="form-control" placeholder="🔍 พิมพ์เพื่อค้นหาชื่อโรค หรือ อาการสำคัญ...">
                            <div class="table-wrapper">
                                <table class="admin-table">
                                    <thead>
                                        <tr>
                                            <th>รหัสเคส</th>
                                            <th>กรณีศึกษา / อาการ</th>
                                            <th>หมวดหมู่</th>
                                            <th>การจัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody id="cases-table-body">
                                        <!-- Dynamically generated rows -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Case Creation & Editing Panel -->
                        <div class="editor-column" id="case-editor-panel" style="display: none;">
                            <div class="editor-header">
                                <h4 id="editor-title">📝 สร้างเคสคนไข้ใหม่</h4>
                                <button class="btn-close" id="btn-close-editor">&times;</button>
                            </div>
                            <div class="editor-body">
                                <div class="form-group">
                                    <label for="edit-case-id">รหัสเคส (Case ID - ห้ามซ้ำ)</label>
                                    <input type="text" id="edit-case-id" class="form-control" placeholder="เช่น test_hypoglycemia_01">
                                </div>
                                <div class="form-group">
                                    <label for="edit-scenario-name">ชื่อสถานการณ์จำลอง (Scenario Name)</label>
                                    <input type="text" id="edit-scenario-name" class="form-control" placeholder="เช่น Hypoglycemia (ภาวะน้ำตาลต่ำ)">
                                </div>
                                <div class="form-group">
                                    <label for="edit-category">หมวดหมู่ระบบอวัยวะ (Category)</label>
                                    <select id="edit-category" class="form-control">
                                        <option value="อายุรกรรม (Medicine)">อายุรกรรม (Medicine)</option>
                                        <option value="ศัลยกรรม (Surgery)">ศัลยกรรม (Surgery)</option>
                                        <option value="อาการปวดท้อง (Abdominal Pain)">อาการปวดท้อง (Abdominal Pain)</option>
                                        <option value="การให้คำปรึกษา (Counseling)">การให้คำปรึกษา (Counseling)</option>
                                        <option value="เคสทั่วไป (General Medicine)">เคสทั่วไป (General Medicine)</option>
                                    </select>
                                </div>
                                <div class="form-group">
                                    <label for="edit-chief-complaint">อาการสำคัญ (Chief Complaint)</label>
                                    <textarea id="edit-chief-complaint" class="form-control" placeholder="มีอาการเหงื่อออกท่วมตัว อ่อนเพลีย ใจสั่นกะทันหัน..."></textarea>
                                </div>
                                <div class="form-group">
                                    <label for="edit-hidden-record">ข้อมูลประวัติลับเวชระเบียน (Hidden Record - JSON Object)</label>
                                    <textarea id="edit-hidden-record" class="form-control" style="height: 180px; font-family: monospace; font-size: 12px; line-height: 1.4;"></textarea>
                                    <span id="json-validity" class="validation-msg">✓ โครงสร้าง JSON ถูกต้อง</span>
                                </div>
                                <div class="form-actions">
                                    <button class="btn btn-secondary" id="btn-cancel-save">ยกเลิก</button>
                                    <button class="btn btn-success" id="btn-save-case">💾 บันทึกและปรับปรุงเวกเตอร์</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Tab 2: Analytics & Session Reviews -->
                <div id="pane-sessions" class="tab-pane">
                    <div class="analytics-layout">
                        <!-- Student Session Table -->
                        <div class="sessions-list-column">
                            <h3>📊 บันทึกการเข้าสอบซักประวัติของนักศึกษา</h3>
                            <input type="text" id="session-search" class="form-control" placeholder="🔍 ค้นหารหัสนักศึกษา ชื่อเคส หรือรหัสการสอบ...">
                            <div class="table-wrapper">
                                <table class="admin-table">
                                    <thead>
                                        <tr>
                                            <th>รหัสการสอบ</th>
                                            <th>กรณีศึกษา</th>
                                            <th>จำนวนรอบคำถาม</th>
                                            <th>คะแนน AI</th>
                                            <th>สถานะการสอบ</th>
                                            <th>การจัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody id="sessions-table-body">
                                        <!-- Dynamically generated sessions -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        
                        <!-- Dialogue & AI score viewer column -->
                        <div class="session-viewer-column" id="session-detail-panel" style="display: none;">
                            <div class="detail-header">
                                <h4>🔍 ผลการประเมินประวัติการซักโดยละเอียด</h4>
                                <button class="btn-close" id="btn-close-detail">&times;</button>
                            </div>
                            <div class="detail-body" id="session-detail-body">
                                <!-- Loads dynamically -->
                            </div>
                        </div>
                    </div>
                </div>
            <!-- Access passcode gateway screen -->
            <div id="auth-gate-screen" class="auth-overlay" style="display: flex;">
                <div class="auth-card" style="border: 1px solid rgba(59, 130, 246, 0.3); background: rgba(15, 23, 42, 0.95); max-width: 380px;">
                    <div class="auth-icon" style="font-size: 56px; margin-bottom: 16px; filter: drop-shadow(0 4px 12px rgba(59, 130, 246, 0.3)); display: inline-block;">👨‍🏫</div>
                    <div class="auth-title" style="background: linear-gradient(135deg, #60a5fa, #3b82f6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-size: 20px; font-weight: 800; margin-bottom: 12px;">กรุณาเข้าสู่ระบบด้วยสิทธิ์ผู้ประเมิน</div>
                    <div class="auth-desc" style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
                        ระบบตรวจไม่พบสิทธิ์ของอาจารย์ผู้ประเมินในขณะนี้<br>
                        กรุณาเข้าสู่ระบบผ่านเว็บไซต์หลักของสถาบัน เพื่อจัดการข้อสอบและเข้าดูผลการประเมินการซักประวัติของนักศึกษา
                    </div>
                </div>
            </div>
        </div>
        `;
    }

    setupElements() {
        // Tab switching
        this.tabCases = this.shadowDOM.getElementById('tab-cases');
        this.tabSessions = this.shadowDOM.getElementById('tab-sessions');
        this.paneCases = this.shadowDOM.getElementById('pane-cases');
        this.paneSessions = this.shadowDOM.getElementById('pane-sessions');
        
        this.tabCases.addEventListener('click', () => this.switchTab('cases'));
        this.tabSessions.addEventListener('click', () => this.switchTab('sessions'));
        
        // Auth elements
        this.authGateScreen = this.shadowDOM.getElementById('auth-gate-screen');
        
        // Cases search & lists
        this.caseSearch = this.shadowDOM.getElementById('case-search');
        this.casesTableBody = this.shadowDOM.getElementById('cases-table-body');
        this.caseSearch.addEventListener('input', () => this.filterCases());
        
        // Editor panel
        this.btnNewCase = this.shadowDOM.getElementById('btn-add-case');
        this.caseEditorPanel = this.shadowDOM.getElementById('case-editor-panel');
        this.btnCloseEditor = this.shadowDOM.getElementById('btn-close-editor');
        this.btnCancelSave = this.shadowDOM.getElementById('btn-cancel-save');
        this.btnSaveCase = this.shadowDOM.getElementById('btn-save-case');
        
        this.editCaseId = this.shadowDOM.getElementById('edit-case-id');
        this.editScenarioName = this.shadowDOM.getElementById('edit-scenario-name');
        this.editCategory = this.shadowDOM.getElementById('edit-category');
        this.editChiefComplaint = this.shadowDOM.getElementById('edit-chief-complaint');
        this.editHiddenRecord = this.shadowDOM.getElementById('edit-hidden-record');
        this.jsonValidity = this.shadowDOM.getElementById('json-validity');
        this.editorTitle = this.shadowDOM.getElementById('editor-title');
        
        this.btnNewCase.addEventListener('click', () => this.openEditor(null));
        this.btnCloseEditor.addEventListener('click', () => this.closeEditor());
        this.btnCancelSave.addEventListener('click', () => this.closeEditor());
        this.btnSaveCase.addEventListener('click', () => this.saveCase());
        
        // Live JSON validator
        this.editHiddenRecord.addEventListener('input', () => this.validateJSON());
        
        // Student sessions search & details
        this.sessionSearch = this.shadowDOM.getElementById('session-search');
        this.sessionSearch.addEventListener('input', () => this.filterSessions());
        
        this.sessionsTableBody = this.shadowDOM.getElementById('sessions-table-body');
        this.sessionDetailPanel = this.shadowDOM.getElementById('session-detail-panel');
        this.btnCloseDetail = this.shadowDOM.getElementById('btn-close-detail');
        this.sessionDetailBody = this.shadowDOM.getElementById('session-detail-body');
        
        this.btnCloseDetail.addEventListener('click', () => {
            this.sessionDetailPanel.style.display = 'none';
        });
        this.adminLoadingOverlay = this.shadowDOM.getElementById('admin-loading-overlay');
    }

    switchTab(tabName) {
        this.activeTab = tabName;
        this.tabCases.classList.remove('active');
        this.tabSessions.classList.remove('active');
        this.paneCases.classList.remove('active');
        this.paneSessions.classList.remove('active');
        
        if (tabName === 'cases') {
            this.tabCases.classList.add('active');
            this.paneCases.classList.add('active');
            this.loadCases();
        } else {
            this.tabSessions.classList.add('active');
            this.paneSessions.classList.add('active');
            this.loadSessions();
        }
    }

    // --- CASE LIBRARY CONTROLLERS ---
    async loadCases() {
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`, { headers: { 'ngrok-skip-browser-warning': '1' } });
            this.casesList = await res.json();
            this.renderCasesList(this.casesList);
        } catch (err) {
            console.error("Error fetching cases list:", err);
        }
    }

    renderCasesList(cases) {
        this.casesTableBody.innerHTML = '';
        if (cases.length === 0) {
            this.casesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">ไม่พบข้อมูลเคสในระบบ</td></tr>`;
            return;
        }
        
        cases.forEach(c => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td><code style="color:#60a5fa;">${c.id}</code></td>
                <td>
                    <div style="font-weight:bold; color:#f8fafc;">${c.scenario_name}</div>
                    <div style="font-size:12px; color:#94a3b8; margin-top:4px;">${c.chief_complaint}</div>
                </td>
                <td><span class="badge badge-category">${c.category || 'เคสทั่วไป'}</span></td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-edit" data-id="${c.id}">แก้ไข</button>
                        <button class="btn btn-danger" data-id="${c.id}">ลบ</button>
                    </div>
                </td>
            `;
            
            // Wire action buttons
            row.querySelector('.btn-edit').addEventListener('click', () => this.openEditor(c.id));
            row.querySelector('.btn-danger').addEventListener('click', () => this.deleteCase(c.id));
            
            this.casesTableBody.appendChild(row);
        });
    }

    filterCases() {
        const query = this.caseSearch.value.toLowerCase().trim();
        const filtered = this.casesList.filter(c => 
            c.id.toLowerCase().includes(query) || 
            c.scenario_name.toLowerCase().includes(query) || 
            c.chief_complaint.toLowerCase().includes(query) ||
            (c.category && c.category.toLowerCase().includes(query))
        );
        this.renderCasesList(filtered);
    }

    async openEditor(caseId = null) {
        this.editingCaseId = caseId;
        this.caseEditorPanel.style.display = 'block';
        
        if (caseId === null) {
            // Creation mode
            this.editorTitle.innerText = "📝 สร้างเคสคนไข้จำลองใหม่";
            this.editCaseId.disabled = false;
            
            this.editCaseId.value = "case_" + Math.random().toString(36).substring(7);
            this.editScenarioName.value = "";
            this.editCategory.value = "อายุรกรรม (Medicine)";
            this.editChiefComplaint.value = "";
            
            const sampleRecord = {
                "gender": "female",
                "symptom_detail": "ระบุอาการละเอียด",
                "severity": "ปานกลาง",
                "onset": "เริ่มเป็นเมื่อไร",
                "associated_symptoms": "อาการร่วมอื่นๆ"
            };
            this.editHiddenRecord.value = JSON.stringify(sampleRecord, null, 4);
        } else {
            // Edit mode
            this.editorTitle.innerText = "📝 แก้ไขข้อมูลประวัติเคส";
            this.editCaseId.disabled = true; // Key cannot be edited
            
            try {
                // Fetch full data dynamically
                const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
                const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`, { headers: { 'ngrok-skip-browser-warning': '1' } });
                const all = await res.json();
                const matched = all.find(item => item.id === caseId);
                
                if (matched) {
                    this.editCaseId.value = matched.id;
                    this.editScenarioName.value = matched.scenario_name;
                    this.editCategory.value = matched.category || "อายุรกรรม (Medicine)";
                    this.editChiefComplaint.value = matched.chief_complaint;
                    
                    let hiddenRec = {
                        "symptom_detail": "อาการไม่ระบุชัดเจน",
                        "severity": "เบาบาง",
                        "onset": "ระบุประวัติไม่ได้"
                    };
                    
                    this.editHiddenRecord.value = JSON.stringify(matched.hidden_record || hiddenRec, null, 4);
                }
            } catch (err) {
                console.error("Error loading case editor details:", err);
            }
        }
        this.validateJSON();
    }

    closeEditor() {
        this.caseEditorPanel.style.display = 'none';
        this.editingCaseId = null;
    }

    validateJSON() {
        try {
            const raw = this.editHiddenRecord.value.trim();
            if (!raw) {
                this.jsonValidity.innerText = "❌ JSON ห้ามว่าง";
                this.jsonValidity.classList.add('invalid');
                return false;
            }
            JSON.parse(raw);
            this.jsonValidity.innerText = "✓ โครงสร้าง JSON ถูกต้อง";
            this.jsonValidity.classList.remove('invalid');
            return true;
        } catch (e) {
            this.jsonValidity.innerText = "❌ รูปแบบ JSON ไม่ถูกต้อง (ตรวจปุ่มวงเล็บปีกกา/ฟันหนู)";
            this.jsonValidity.classList.add('invalid');
            return false;
        }
    }

    async saveCase() {
        if (!this.validateJSON()) {
            alert("กรุณาแก้ไขโครงสร้างข้อมูลประวัติลับ JSON ให้ถูกต้องก่อนบันทึก!");
            return;
        }
        
        const payload = {
            id: this.editCaseId.value.trim(),
            scenario_name: this.editScenarioName.value.trim(),
            chief_complaint: this.editChiefComplaint.value.trim(),
            category: this.editCategory.value,
            hidden_record: JSON.parse(this.editHiddenRecord.value.trim())
        };
        
        if (!payload.id || !payload.scenario_name || !payload.chief_complaint) {
            alert("กรุณากรอกข้อมูลจำลองให้ครบถ้วนทุกช่อง!");
            return;
        }
        
        // Show loading status overlay
        if (this.adminLoadingOverlay) {
            this.adminLoadingOverlay.style.display = 'flex';
        }
        this.btnSaveCase.disabled = true;
        this.btnCancelSave.disabled = true;
        this.btnCloseEditor.disabled = true;
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`, { headers: { 'ngrok-skip-browser-warning': '1' },
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const resData = await response.json();
            
            if (resData.status === 'success') {
                alert("บันทึกข้อมูลเคสและอัปเดตเวกเตอร์เสร็จสมบูรณ์!");
                this.closeEditor();
                this.loadCases();
            } else {
                alert("บันทึกข้อมูลล้มเหลว: " + resData.message);
            }
        } catch (err) {
            console.error("Error saving clinical case:", err);
            alert("ไม่สามารถบันทึกเคสได้ ตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์หลัก");
        } finally {
            // Hide loading overlay
            if (this.adminLoadingOverlay) {
                this.adminLoadingOverlay.style.display = 'none';
            }
            this.btnSaveCase.disabled = false;
            this.btnCancelSave.disabled = false;
            this.btnCloseEditor.disabled = false;
        }
    }

    async deleteCase(caseId) {
        if (!confirm(`คุณต้องการลบรหัสเคส "${caseId}" ออกจากฐานข้อมูลและเวกเตอร์ถาวรใช่หรือไม่?`)) return;
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases/${caseId}`, { headers: { 'ngrok-skip-browser-warning': '1' },
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert("ลบข้อมูลเคสสำเร็จ!");
                this.loadCases();
            } else {
                alert("ไม่สามารถลบข้อมูลได้: " + data.message);
            }
        } catch (err) {
            console.error("Error deleting case:", err);
        }
    }

    // --- STUDENT ANALYTICS CONTROLLERS ---
    async loadSessions() {
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/sessions`, { headers: { 'ngrok-skip-browser-warning': '1' } });
            this.sessionsList = await res.json();
            this.renderSessionsList(this.sessionsList);
        } catch (err) {
            console.error("Error loading sessions:", err);
        }
    }

    renderSessionsList(sessions) {
        this.sessionsTableBody.innerHTML = '';
        if (sessions.length === 0) {
            this.sessionsTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">ยังไม่มีประวัติการสอบประเมินของนักศึกษา</td></tr>`;
            return;
        }
        
        sessions.forEach(s => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            
            const timestamp = s.updated_at ? new Date(s.updated_at).toLocaleString('th-TH', { hour12: false }) : 'ไม่ระบุ';
            const scoreText = s.score ? `⭐ ${s.score}/5` : '⏳ รอตรวจ';
            const statusClass = s.status === 'completed' ? 'badge-completed' : 'badge-active';
            const statusText = s.status === 'completed' ? 'เสร็จสิ้นการซัก' : 'กำลังซักประวัติ';
            
            row.innerHTML = `
                <td>
                    <div style="font-weight:bold; color:#60a5fa;">${s.session_id}</div>
                    <div style="font-size:11px; color:#64748b; margin-top:4px;">${timestamp}</div>
                </td>
                <td><span style="font-weight:500;">${s.scenario_name}</span></td>
                <td style="text-align:center;">${s.turns} Turns</td>
                <td><b style="color:#f59e0b;">${scoreText}</b></td>
                <td><span class="badge ${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-danger btn-delete-session" data-id="${s.session_id}">ลบ</button>
                </td>
            `;
            
            row.addEventListener('click', () => this.viewSessionDetail(s.session_id));
            
            // Wire delete session button with stopPropagation to prevent opening details
            const deleteBtn = row.querySelector('.btn-delete-session');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteSession(s.session_id);
            });
            
            this.sessionsTableBody.appendChild(row);
        });
    }

    filterSessions() {
        const query = this.sessionSearch.value.toLowerCase().trim();
        const filtered = this.sessionsList.filter(s => 
            s.session_id.toLowerCase().includes(query) || 
            s.scenario_name.toLowerCase().includes(query) ||
            (s.student_id && s.student_id.toLowerCase().includes(query)) ||
            (s.student_name && s.student_name.toLowerCase().includes(query))
        );
        this.renderSessionsList(filtered);
    }

    async deleteSession(sessionId) {
        if (!confirm(`คุณต้องการลบประวัติการสอบรหัส "${sessionId}" และบทสนทนาทั้งหมดถาวรใช่หรือไม่?`)) return;
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/sessions/${sessionId}`, { headers: { 'ngrok-skip-browser-warning': '1' },
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.status === 'success') {
                alert("ลบประวัติการสอบสำเร็จ!");
                this.loadSessions();
                this.sessionDetailPanel.style.display = 'none';
            } else {
                alert("ไม่สามารถลบข้อมูลได้: " + data.message);
            }
        } catch (err) {
            console.error("Error deleting session:", err);
            alert("เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์เพื่อลบข้อมูล");
        }
    }

    async viewSessionDetail(sessionId) {
        this.sessionDetailPanel.style.display = 'block';
        this.sessionDetailBody.innerHTML = `<div style="text-align:center; padding:40px 0;">⏳ กำลังเรียกประวัติและตรวจวิเคราะห์คำตอบจากคลาวด์...</div>`;
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/sessions/${sessionId}`, { headers: { 'ngrok-skip-browser-warning': '1' } });
            const data = await res.json();
            
            if (!data || data.status === 'error') {
                this.sessionDetailBody.innerHTML = `<p style="color:red; text-align:center;">❌ ไม่พบประวัติข้อมูลรอบการประเมินนี้</p>`;
                return;
            }
            
            // Build the dynamic scorecard HTML
            let html = '';
            
            // 1. Session Information Summary
            const turns = data.history ? lenMsgTurns(data.history) : 0;
            html += `
                <div class="eval-summary-card">
                    <div style="font-size: 13px; color: #94a3b8; margin-bottom: 5px;">รหัสรอบสอบ: ${sessionId}</div>
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 12px;">เคสจำลอง: ${data.case_data?.scenario_name || 'สุ่มเคส'}</div>
                    ${data.evaluation ? `
                        <div class="eval-score">⭐ ${data.evaluation.overall_score || data.evaluation.total_score || 0}/5 คะแนน</div>
                        <div style="font-size:12px; color:#10b981; font-weight:600;">ตรวจวิเคราะห์เกณฑ์ SEGUE ประเมินผ่านระบบ AI</div>
                    ` : `
                        <div style="font-size:16px; color:#ef4444; font-weight:bold; margin: 10px 0;">ยังไม่ได้รับการกดสรุปประเมินโดยนักศึกษา</div>
                        <div style="font-size:11px; color:#94a3b8;">ประวัตินี้คือบันทึกข้อความแบบเรียลไทม์เท่านั้น</div>
                    `}
                </div>
            `;
            
            // Helper function to count student inputs
            function lenMsgTurns(hist) {
                return hist.filter(m => m.role === 'user').length;
            }

            // 2. Parameters Uncovered Visualizer (Pioneering pedagogical feature)
            const hiddenRec = data.case_data?.hidden_record || {};
            const revealedInfo = data.revealed_info || {};
            if (Object.keys(hiddenRec).length > 0) {
                html += `
                    <div class="eval-criteria-title">🎯 ประวัติที่นักศึกษาซักได้สำเร็จ (Parameters Uncovered)</div>
                    <div class="param-grid">
                `;
                
                for (const [key, val] of Object.entries(hiddenRec)) {
                    const wasRevealed = key in revealedInfo;
                    const checkMark = wasRevealed ? '✓' : '✗';
                    const checkClass = wasRevealed ? 'param-revealed' : 'param-hidden';
                    const keyFriendly = key.toUpperCase().replace(/_/g, ' ');
                    
                    html += `
                        <div class="param-item">
                            <span class="${checkClass}">[${checkMark}] ${keyFriendly}</span>
                            <span style="color:#94a3b8; font-size:11px; text-align:right; max-width:60%;">${val}</span>
                        </div>
                    `;
                }
                
                html += `</div>`;
            }

            // 3. Transcript Log bubbles
            if (data.history && data.history.length > 0) {
                html += `
                    <div class="eval-criteria-title">💬 บันทึกการสนทนาย้อนหลัง (Dialogue Transcript)</div>
                    <div class="transcript-container">
                `;
                
                data.history.forEach(msg => {
                    if (msg.content.startsWith("__") || msg.content.includes("Session saved")) return;
                    const roleClass = msg.role === 'user' ? 'stu' : 'pat';
                    const roleLabel = msg.role === 'user' ? 'นักศึกษา' : 'คนไข้';
                    html += `
                        <div class="chat-bubble ${roleClass}">
                            <div style="font-size:10px; font-weight:bold; opacity:0.75; margin-bottom:4px;">${roleLabel}</div>
                            <div>${msg.content}</div>
                        </div>
                    `;
                });
                
                html += `</div>`;
            }

            // 4. SEGUE Framework AI Ratings Breakdown
            if (data.evaluation) {
                html += `<div class="eval-criteria-title">📈 รายละเอียดทักษะรายด้าน (SEGUE Checklist)</div>`;
                
                const scores = data.evaluation.scores || {};
                for (const [criteria, score] of Object.entries(scores)) {
                    const label = criteria.replace(/_/g, ' ').toUpperCase();
                    html += `
                        <div class="score-row" style="display:flex; justify-content:space-between; font-size:12px; background:#0f172a; padding:8px 12px; border-radius:6px; margin-bottom:8px; border:1px solid #1e293b;">
                            <span style="font-weight:600; color:#e2e8f0;">${label}</span>
                            <span style="color:#f59e0b;">${'⭐'.repeat(score)}</span>
                        </div>
                    `;
                }
                
                const feedback = data.evaluation.feedback || {};
                html += `
                    <div class="eval-criteria-title">📝 ข้อเสนอแนะเชิงลึก (Clinical Feedback)</div>
                    <div style="background:#0f172a; padding:15px; border-radius:10px; border:1px solid #334155; font-size:13px; line-height:1.5;">
                        <p class="strength-title">✅ จุดเด่นการตรวจ:</p>
                        <ul style="margin: 0 0 15px 0; padding-left: 20px; color:#e2e8f0;">
                            ${feedback.strengths ? feedback.strengths.map(s => `<li>${s}</li>`).join('') : '<li>ไม่มีข้อมูล</li>'}
                        </ul>
                        
                        <p class="weakness-title">❌ จุดบกพร่องที่ต้องปรับปรุง:</p>
                        <ul style="margin: 0 0 15px 0; padding-left: 20px; color:#e2e8f0;">
                            ${feedback.weaknesses ? feedback.weaknesses.map(w => `<li>${w}</li>`).join('') : '<li>ไม่มีข้อมูล</li>'}
                        </ul>
                        
                        <p style="margin:0; font-weight:600;">💡 ข้อเสนอแนะจากระบบจำลอง: <span style="font-weight:normal; color:#cbd5e1;">${feedback.suggestion || 'ไม่มีข้อเสนอแนะเพิ่มเติม'}</span></p>
                    </div>
                `;
            }

            this.sessionDetailBody.innerHTML = html;
        } catch (err) {
            console.error("Error viewing session evaluation details:", err);
            this.sessionDetailBody.innerHTML = `<p style="color:red; text-align:center;">❌ เกิดข้อผิดพลาดทางเทคนิคในการโหลดวิเคราะห์ผล</p>`;
        }
    }
}

customElements.define('ai-patient-admin', AIPatientAdmin);
