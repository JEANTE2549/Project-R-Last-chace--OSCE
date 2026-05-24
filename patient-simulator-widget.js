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
        this.customPrompt = `คุณคือคนไข้สมมติ อาการสำคัญ (Chief Complaint): {chief_complaint}

ข้อมูลที่คุณ "จำได้" และสามารถตอบนักศึกษาได้ในขณะนี้:
{revealed_info}

กฎเหล็ก:
1. ให้ตอบสั้นๆ เหมือนคนป่วย มีความกังวล ใช้ภาษาไทยแบบคนทั่วไป
2. **ห้าม** บอกข้อมูลประวัติอื่นๆ ที่ไม่อยู่ในรายการ "ข้อมูลที่จำได้" ข้างต้นเด็ดขาด
3. หากนักศึกษาถามถึงสิ่งที่ไม่ได้อยู่ในรายการข้างต้น ให้ตอบแบบเลี่ยงๆ หรือบอกว่า "จำไม่ได้" หรือ "ไม่แน่ใจ"
4. ห้ามพูดชื่อโรค ออกมาเด็ดขาด
5. ตอบทีละคำถาม ไม่ต้องร่ายยาวรวบยอด`;
        
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
    }

    connectedCallback() {
        this.render();
        this.setupElements();
        this.checkAuthentication();
    }

    checkAuthentication() {
        const token = sessionStorage.getItem('osce_student_token');
        if (token === 'student_verified_token_xyz') {
            this.authGateScreen.style.display = 'none';
            // Normal routing
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

    async handleAuthSubmit() {
        const passcode = this.authPasscodeInput.value.trim();
        this.authErrorMsg.style.display = 'none';
        
        if (!passcode) {
            this.authErrorMsg.innerText = "กรุณากรอกรหัสผ่าน!";
            this.authErrorMsg.style.display = 'block';
            return;
        }
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'student', passcode: passcode })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                sessionStorage.setItem('osce_student_token', data.token);
                this.authPasscodeInput.value = '';
                this.checkAuthentication();
            } else {
                this.authErrorMsg.innerText = data.message || "รหัสผ่านไม่ถูกต้อง!";
                this.authErrorMsg.style.display = 'block';
            }
        } catch (err) {
            console.error("Auth validation failed:", err);
            // Local fallback validation if offline/error to help smooth presentation
            if (passcode === 'student123') {
                sessionStorage.setItem('osce_student_token', 'student_verified_token_xyz');
                this.authPasscodeInput.value = '';
                this.checkAuthentication();
            } else {
                this.authErrorMsg.innerText = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ตรวจรหัสผ่านได้!";
                this.authErrorMsg.style.display = 'block';
            }
        }
    }

    lockSimulator() {
        sessionStorage.removeItem('osce_student_token');
        this.closeConnections();
        this.checkAuthentication();
    }

    disconnectedCallback() {
        this.closeConnections();
    }

    static get observedAttributes() {
        return ['server-url', 'session-id', 'api-tier', 'mode'];
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
                    padding: 20px;
                    background-color: #f4f7f6;
                    border-radius: 15px;
                    box-sizing: border-box;
                    position: relative;
                    min-height: 520px;
                }
                .widget-container {
                    width: 100%;
                    position: relative;
                }
                h2 {
                    text-align: center;
                    color: #333;
                    margin-top: 0;
                    padding-right: 40px; /* Space for settings button */
                }
                
                /* Selection Portal Screen Styles */
                #portal-screen {
                    text-align: center;
                    padding: 20px 10px;
                }
                .portal-title {
                    font-size: 22px;
                    color: #1a1e29;
                    font-weight: bold;
                    margin-bottom: 25px;
                }
                .portal-btns-container {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                    max-width: 400px;
                    margin: 0 auto;
                }
                .portal-btn {
                    padding: 18px 24px;
                    font-size: 17px;
                    font-weight: bold;
                    border-radius: 12px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 10px;
                }
                
                /* Syndrome Case cards styles */
                #cases-grid-screen {
                    width: 100%;
                }
                .cases-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    border-bottom: 2px solid #ddd;
                    padding-bottom: 10px;
                }
                .back-btn {
                    background: transparent;
                    color: #0d6efd;
                    padding: 0;
                    font-size: 14px;
                    border: none;
                    cursor: pointer;
                    text-decoration: underline;
                }
                .cards-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
                    gap: 15px;
                    max-height: 420px;
                    overflow-y: auto;
                    padding: 5px;
                }
                .case-card {
                    background: white;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 15px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.04);
                    text-align: left;
                    box-sizing: border-box;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                }
                .case-card:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 6px 12px rgba(0,0,0,0.08);
                    border-color: #0d6efd;
                }
                .badge {
                    display: inline-block;
                    padding: 4px 8px;
                    font-size: 10px;
                    font-weight: bold;
                    border-radius: 12px;
                    margin-bottom: 8px;
                    text-transform: uppercase;
                    width: fit-content;
                }
                .badge-counseling { background-color: #cfe2ff; color: #0a58ca; }
                .badge-abdomen { background-color: #f8d7da; color: #b02a37; }
                .badge-general { background-color: #d1e7dd; color: #0f5132; }
                .badge-fallback { background-color: #e2e8f0; color: #475569; }
                
                .case-title {
                    font-size: 15px;
                    font-weight: bold;
                    color: #1e293b;
                    margin: 0 0 8px 0;
                    line-height: 1.3;
                }
                .case-desc {
                    font-size: 12px;
                    color: #64748b;
                    margin: 0;
                    line-height: 1.4;
                }

                #chat-box {
                    background: white;
                    border-radius: 10px;
                    height: 400px;
                    overflow-y: auto;
                    padding: 15px;
                    margin-bottom: 20px;
                    box-shadow: 0 4px 6px rgba(0,0,0,0.1);
                    box-sizing: border-box;
                }
                .msg {
                    margin-bottom: 15px;
                    padding: 10px;
                    border-radius: 10px;
                    max-width: 80%;
                    line-height: 1.4;
                    word-wrap: break-word;
                    box-sizing: border-box;
                }
                .user {
                    background-color: #d1e7dd;
                    color: #0f5132;
                    margin-left: auto;
                    text-align: right;
                }
                .patient {
                    background-color: #f8d7da;
                    color: #842029;
                    margin-right: auto;
                }
                .btn-container {
                    text-align: center;
                    gap: 10px;
                    display: flex;
                    justify-content: center;
                    flex-wrap: wrap;
                }
                button {
                    background-color: #0d6efd;
                    color: white;
                    border: none;
                    padding: 12px 24px;
                    font-size: 16px;
                    border-radius: 25px;
                    cursor: pointer;
                    transition: 0.3s;
                }
                button:hover {
                    opacity: 0.8;
                }
                button:disabled {
                    background-color: #cccccc !important;
                    cursor: not-allowed;
                    opacity: 1;
                }
                #status {
                    display: block;
                    text-align: center;
                    margin-top: 10px;
                    color: #6c757d;
                    font-size: 14px;
                    width: 100%;
                }
                
                /* Settings Button & Panel */
                #settings-btn {
                    position: absolute;
                    right: 0px;
                    top: 0px;
                    background: transparent;
                    color: #6c757d;
                    border: none;
                    padding: 5px;
                    font-size: 24px;
                    cursor: pointer;
                    transition: transform 0.3s;
                    border-radius: 50%;
                }
                #settings-btn:hover {
                    transform: rotate(45deg);
                    background-color: rgba(0, 0, 0, 0.05);
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
                    z-index: 1000;
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
            </style>
            
            <!-- Pre-Encounter Entry Portal -->
            <div id="portal-screen" style="display: none;">
                <div class="portal-title">🏥 แพลตฟอร์มจำลองคนไข้ซักประวัติ (OSCE)</div>
                <div class="portal-btns-container">
                    <button id="blind-osce-btn" class="portal-btn" style="background-color: #0d6efd;">
                        🎲 ซักประวัติสุ่มเคส (Blind Case)
                    </button>
                    <button id="select-syndrome-btn" class="portal-btn" style="background-color: #6c757d;">
                        🩺 เลือกเคสโรคจำลอง (Selective Category)
                    </button>
                </div>
            </div>

            <!-- Specific Syndrome case selection cards grid -->
            <div id="cases-grid-screen" style="display: none;">
                <div class="cases-header">
                    <h3 style="margin: 0; color: #333;">🩺 เลือกเคสคนไข้จำลอง</h3>
                    <button id="back-to-portal-btn" class="back-btn">ย้อนกลับ</button>
                </div>
                <div id="cases-loading" style="text-align: center; color: #64748b; padding: 40px 0; font-size: 14px;">
                    ⏳ กำลังประมวลผลดึงกลุ่มโรคเวกเตอร์...
                </div>
                <div id="cases-cards-container" class="cards-grid">
                    <!-- Syndromes list cards dynamically loaded here -->
                </div>
            </div>
            
            <div class="widget-container" style="display: none;">
                <button id="lock-simulator-btn" class="lock-btn" title="ออกจากระบบ / ล็อคแผงควบคุม">🔒</button>
                <button id="settings-btn" title="GGUF Local AI Config">⚙️</button>
                <h2>🩺 AI Patient Simulator</h2>
                <div id="chat-box"></div>
                <div class="btn-container">
                    <button id="mic-btn">🎤 คลิกเพื่อพูด</button>
                    <button id="end-btn" style="background-color: #6c757d;">🏁 จบการซักประวัติ</button>
                    <button id="new-btn" style="background-color: #198754; display: none;">🆕 เคสใหม่</button>
                    <button id="view-eval-btn" style="background-color: #ffc107; color: #000; display: none;">📊 ดูผลการประเมิน</button>
                    <span id="status">กำลังเชื่อมต่อ...</span>
                </div>

                <!-- GGUF Parameter settings-drawer -->
                <div id="settings-drawer">
                    <div class="drawer-header">
                        <h3 style="margin: 0; color: #333;">⚙️ ปรับจูนบอร์ด GGUF (Local AI)</h3>
                        <span id="close-drawer-btn" style="font-size: 24px; cursor: pointer; color: #aaa;">&times;</span>
                    </div>
                    <div class="form-group">
                        <label for="model-select">เลือกโมเดล (Ollama Model)</label>
                        <select id="model-select">
                            <option value="llama3.1:latest">Llama 3.1 8B (แนะนำ)</option>
                            <option value="deepseek-r1:1.5b">DeepSeek R1 1.5B (Intent)</option>
                            <option value="llama3:latest">Llama 3 8B</option>
                            <option value="custom">ระบุโมเดลอื่น ๆ...</option>
                        </select>
                        <input type="text" id="model-custom" placeholder="ระบุชื่อโมเดล เช่น qwen2.5:7b" style="margin-top: 8px; display: none;">
                    </div>
                    <!-- Multi-Tier Plan Selector -->
                    <div class="form-group" style="border-top: 1px solid #eee; padding-top: 8px; margin-top: 8px;">
                        <label for="tier-select">💎 ระดับความฉลาด (AI Inference Tier)</label>
                        <select id="tier-select">
                            <option value="free">แถมฟรี: รันโลคอล (Local Ollama CPU/GPU)</option>
                            <option value="paid">จ่ายเงิน: คลาวด์อัจฉริยะ (Typhoon / GPT-4o API)</option>
                        </select>
                        <span style="font-size: 11px; color: #888;">หมายเหตุ: แผนคลาวด์รองรับการตั้งค่า TYPHOON_API_KEY (แนะนำสำหรับภาษาไทย) หรือ OPENAI_API_KEY ในไฟล์ .env ของเซิร์ฟเวอร์หลัก</span>
                    </div>
                    <div class="form-group">
                        <label for="temp-slider">อุณหภูมิ (Temperature) <span id="temp-val" class="slider-val">0.7</span></label>
                        <input type="range" id="temp-slider" min="0.1" max="1.5" step="0.1" value="0.7">
                    </div>

                    <!-- Dynamic Emotional Persona Settings Drawer Pane -->
                    <div class="form-group" style="border-top: 1px solid #eee; padding-top: 12px; margin-top: 12px;">
                        <label for="preset-select">🎭 เลือกแม่แบบบุคลิก (Preset)</label>
                        <select id="preset-select">
                            <option value="cooperative">ให้ความร่วมมือดี / ใจเย็น (Cooperative)</option>
                            <option value="normal">ปกติ (Normal)</option>
                            <option value="anxious">วิตกกังวล / ตื่นตระหนก (Anxious)</option>
                            <option value="combative">โกรธ / ก้าวร้าวเหวี่ยงหมอ (Combative)</option>
                            <option value="depressed">ซึมเศร้า / ท้อแท้เหนื่อยล้า (Depressed)</option>
                            <option value="custom">ปรับแต่งอารมณ์เอง...</option>
                        </select>
                    </div>

                    <div class="form-group" id="emotion-sliders-group">
                        <label>🔥 ระดับอารมณ์ความรู้สึกคนไข้</label>
                        
                        <div style="margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #555;">ความโกรธ/ก้าวร้าว: <span id="anger-val" class="slider-val">0%</span></span>
                            <input type="range" id="anger-slider" min="0" max="100" step="5" value="0" style="width: 100%;">
                        </div>
                        
                        <div style="margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #555;">ความเศร้า/อ่อนแอ: <span id="sadness-val" class="slider-val">0%</span></span>
                            <input type="range" id="sadness-slider" min="0" max="100" step="5" value="0" style="width: 100%;">
                        </div>
                        
                        <div style="margin-bottom: 8px;">
                            <span style="font-size: 13px; color: #555;">ความสุข/สงบนิ่ง: <span id="happiness-val" class="slider-val">100%</span></span>
                            <input type="range" id="happiness-slider" min="0" max="100" step="5" value="100" style="width: 100%;">
                        </div>
                        
                        <div style="background: #e9ecef; padding: 8px; border-radius: 6px; font-size: 11px; color: #495057; margin-top: 10px;">
                            ℹ️ <b>PAD Model Vectors:</b> 
                            P: <span id="pad-p" style="font-weight: bold; color: #0d6efd;">1.00</span> | 
                            A: <span id="pad-a" style="font-weight: bold; color: #dc3545;">-0.50</span> | 
                            D: <span id="pad-d" style="font-weight: bold; color: #198754;">0.50</span>
                        </div>
                    </div>

                    <div class="form-group" style="border-top: 1px solid #eee; padding-top: 12px;">
                        <label for="prompt-textarea">System Prompt (บทยืนยันอาการคนไข้)</label>
                        <textarea id="prompt-textarea" placeholder="เขียนบทยืนยัน โดยมีคำว่า {revealed_info} เพื่อดึงอาการจาก RAG"></textarea>
                        <span style="font-size: 11px; color: #888;">หมายเหตุ: ใน Prompt ต้องมี {revealed_info} เพื่อให้ระบบแทนที่ข้อมูลเวชระเบียนที่ซักได้</span>
                    </div>
                    <div style="text-align: center; margin-top: 15px;">
                        <button id="save-settings-btn" style="background-color: #198754; width: 100%;">บันทึกการปรับจูน</button>
                    </div>
                </div>

                <!-- Local CORS Connection Setup Wizard -->
                <div id="setup-wizard">
                    <div class="wizard-icon">🔌</div>
                    <div class="wizard-title">ตรวจไม่พบการเชื่อมต่อกับ Local AI</div>
                    <p style="font-size: 13px; color: #555; margin-bottom: 20px;">
                        กรุณาตรวจสอบว่าเซิร์ฟเวอร์จำลองและ Ollama รันอยู่ในขณะนี้
                    </p>
                    
                    <div class="tab-container">
                        <button class="tab-btn active" id="tab-win">Windows</button>
                        <button class="tab-btn" id="tab-mac">Mac / Linux</button>
                    </div>
                    
                    <div id="instructions-win" style="display: block;">
                        <p style="font-size: 12px; text-align: left; margin: 5px 0;">1. เปิด PowerShell รันคำสั่งเปิด CORS สำหรับการเรียกใช้ในบราวเซอร์:</p>
                        <div class="code-block">
                            $env:OLLAMA_ORIGINS="*"; ollama serve
                            <button class="copy-btn" id="copy-win" data-code='$env:OLLAMA_ORIGINS="*"; ollama serve'>คัดลอก</button>
                        </div>
                        <p style="font-size: 12px; text-align: left; margin: 5px 0;">2. ในอีกหน้าต่าง ให้รันเซิร์ฟเวอร์ OSCE Backend:</p>
                        <div class="code-block">
                            .venv\\Scripts\\activate; uvicorn main:app --reload
                            <button class="copy-btn" id="copy-backend-win" data-code='.venv\\Scripts\\activate; uvicorn main:app --reload'>คัดลอก</button>
                        </div>
                    </div>
                    
                    <div id="instructions-mac" style="display: none;">
                        <p style="font-size: 12px; text-align: left; margin: 5px 0;">1. เปิด Terminal รันคำสั่งเปิด CORS สำหรับการเรียกใช้ในบราวเซอร์:</p>
                        <div class="code-block">
                            OLLAMA_ORIGINS="*" ollama serve
                            <button class="copy-btn" id="copy-mac" data-code='OLLAMA_ORIGINS="*" ollama serve'>คัดลอก</button>
                        </div>
                        <p style="font-size: 12px; text-align: left; margin: 5px 0;">2. ในอีกหน้าต่าง ให้รันเซิร์ฟเวอร์ OSCE Backend:</p>
                        <div class="code-block">
                            source .venv/bin/activate; uvicorn main:app --reload
                            <button class="copy-btn" id="copy-backend-mac" data-code='source .venv/bin/activate; uvicorn main:app --reload'>คัดลอก</button>
                        </div>
                    </div>
                    
                    <div style="margin-top: 25px;">
                        <button id="retry-conn-btn" style="background-color: #dc3545; width: 100%; padding: 12px; font-weight: bold;">🔌 เชื่อมต่อใหม่อีกครั้ง</button>
                    </div>
                </div>
            </div>

            <!-- Evaluation Modal -->
            <div id="eval-modal">
                <div class="modal-content">
                    <span class="close">&times;</span>
                    <h2 style="text-align: center;">📊 ผลการประเมินการซักประวัติ</h2>
                    <div id="eval-results">
                        <!-- Results will be injected here -->
                    </div>
                </div>
            </div>
            <!-- Access passcode gateway screen -->
            <div id="auth-gate-screen" class="auth-overlay" style="display: flex;">
                <div class="auth-card">
                    <div class="auth-icon">🏥</div>
                    <div class="auth-title">เข้าใช้งานในบทบาท "นักศึกษา"</div>
                    <div class="auth-desc">กรุณากรอกรหัสผ่านเพื่อปลดล็อคเครื่องมือซักประวัติแพทย์ (OSCE)<br><small style="color: #94a3b8;">(รหัสผ่านแนะนำ: student123)</small></div>
                    <input type="password" id="auth-passcode-input" class="form-control" placeholder="ป้อนรหัสผ่านซักประวัติ..." style="text-align: center; margin-bottom: 15px;">
                    <button id="auth-submit-btn" class="auth-submit-btn">🔓 ยืนยันสิทธิ์ใช้งาน</button>
                    <div id="auth-error-msg" class="auth-error">รหัสผ่านสำหรับสิทธิ์ใช้งานไม่ถูกต้อง!</div>
                </div>
            </div>
        `;
    }

    setupElements() {
        this.chatBox = this.shadowDOM.getElementById('chat-box');
        this.status = this.shadowDOM.getElementById('status');
        this.micBtn = this.shadowDOM.getElementById('mic-btn');
        this.endBtn = this.shadowDOM.getElementById('end-btn');
        this.newBtn = this.shadowDOM.getElementById('new-btn');
        this.viewEvalBtn = this.shadowDOM.getElementById('view-eval-btn');
        this.evalModal = this.shadowDOM.getElementById('eval-modal');
        this.closeBtn = this.shadowDOM.querySelector('.close');
        this.evalResults = this.shadowDOM.getElementById('eval-results');
        
        // Auth elements
        this.authGateScreen = this.shadowDOM.getElementById('auth-gate-screen');
        this.authPasscodeInput = this.shadowDOM.getElementById('auth-passcode-input');
        this.authSubmitBtn = this.shadowDOM.getElementById('auth-submit-btn');
        this.authErrorMsg = this.shadowDOM.getElementById('auth-error-msg');
        this.lockSimulatorBtn = this.shadowDOM.getElementById('lock-simulator-btn');
        this.tierSelect = this.shadowDOM.getElementById('tier-select');
        
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
        this.tabWin = this.shadowDOM.getElementById('tab-win');
        this.tabMac = this.shadowDOM.getElementById('tab-mac');
        this.instructionsWin = this.shadowDOM.getElementById('instructions-win');
        this.instructionsMac = this.shadowDOM.getElementById('instructions-mac');
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

        // Main Event listeners
        this.micBtn.addEventListener('click', () => this.toggleDictation());
        this.endBtn.addEventListener('click', () => this.endSimulation());
        this.newBtn.addEventListener('click', () => this.newSimulation());
        this.viewEvalBtn.addEventListener('click', () => this.showEvaluation());
        this.closeBtn.addEventListener('click', () => this.closeModal());
        
        // Auth Event listeners
        this.authSubmitBtn.addEventListener('click', () => this.handleAuthSubmit());
        this.authPasscodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAuthSubmit();
        });
        this.lockSimulatorBtn.addEventListener('click', () => this.lockSimulator());
        
        // Drawer toggle listeners
        this.settingsBtn.addEventListener('click', () => this.openDrawer());
        this.closeDrawerBtn.addEventListener('click', () => this.closeDrawer());
        this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
        
        // Portal Event listeners
        this.blindOsceBtn.addEventListener('click', () => this.startSimulationWithCase(null));
        this.selectSyndromeBtn.addEventListener('click', () => this.loadSyndromesList());
        this.backToPortalBtn.addEventListener('click', () => this.showScreen('portal'));
        
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
        
        // Wizard tab listeners
        this.tabWin.addEventListener('click', () => this.switchTab('win'));
        this.tabMac.addEventListener('click', () => this.switchTab('mac'));
        this.retryConnBtn.addEventListener('click', () => {
            this.setupWizard.style.display = 'none';
            this.connectWS();
        });
        
        // Bind copy buttons inside wizard
        this.shadowDOM.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const code = e.target.getAttribute('data-code');
                navigator.clipboard.writeText(code).then(() => {
                    const originalText = e.target.innerText;
                    e.target.innerText = "✓ สำเร็จ";
                    e.target.style.backgroundColor = "#198754";
                    setTimeout(() => {
                        e.target.innerText = originalText;
                        e.target.style.backgroundColor = "#6c757d";
                    }, 1500);
                });
            });
        });

        // Initialize default tier selector UI
        this.tierSelect.value = this.apiTier;
        this.tierSelect.addEventListener('change', (e) => {
            this.apiTier = e.target.value;
        });

        // Initialize Prompt text area & sliders value
        this.promptTextarea.value = this.customPrompt;
        this.applyPreset('cooperative'); // Default cooperative calm baseline
    }

    showScreen(screenName) {
        this.portalScreen.style.display = 'none';
        this.casesGridScreen.style.display = 'none';
        this.widgetContainer.style.display = 'none';
        
        if (screenName === 'portal') {
            this.portalScreen.style.display = 'block';
        } else if (screenName === 'selective') {
            this.casesGridScreen.style.display = 'block';
        } else if (screenName === 'chat') {
            this.widgetContainer.style.display = 'block';
        }
    }

    async loadSyndromesList() {
        this.showScreen('selective');
        this.casesLoading.style.display = 'block';
        this.casesCardsContainer.innerHTML = "";
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`);
            this.casesList = await response.json();
            
            this.casesLoading.style.display = 'none';
            
            if (this.casesList.length === 0) {
                this.casesCardsContainer.innerHTML = "<p style='text-align:center; grid-column: 1/-1;'>❌ ไม่พบเคสจำลองในฐานข้อมูล</p>";
                return;
            }
            
            this.casesList.forEach(c => {
                const card = document.createElement('div');
                card.className = 'case-card';
                card.addEventListener('click', () => this.startSimulationWithCase(c.id));
                
                // Color code category badges
                let badgeClass = 'badge-fallback';
                if (c.category.includes("Abdominal") || c.category.includes("ท้อง")) {
                    badgeClass = 'badge-abdomen';
                } else if (c.category.includes("Counseling") || c.category.includes("ปรึกษา")) {
                    badgeClass = 'badge-counseling';
                } else if (c.category.includes("General") || c.category.includes("ทั่วไป")) {
                    badgeClass = 'badge-general';
                }
                
                card.innerHTML = `
                    <div>
                        <span class="badge ${badgeClass}">${c.category}</span>
                        <h4 class="case-title">${c.scenario_name}</h4>
                    </div>
                    <p class="case-desc"><b>อาการสำคัญ:</b> ${c.chief_complaint}</p>
                `;
                this.casesCardsContainer.appendChild(card);
            });
        } catch (e) {
            console.error("Failed to load syndromes:", e);
            this.casesLoading.style.display = 'none';
            this.casesCardsContainer.innerHTML = "<p style='text-align:center; grid-column: 1/-1; color:red;'>❌ ดึงข้อมูลเคสผิดพลาด ตรวจสอบการเชื่อมต่อเซิร์ฟเวอร์</p>";
        }
    }

    startSimulationWithCase(caseId) {
        this.selectedCaseId = caseId;
        this.showScreen('chat');
        this.connectWS();
    }

    openDrawer() {
        this.settingsDrawer.style.display = 'block';
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
        
        switch (presetName) {
            case 'cooperative':
                anger = 0; sadness = 0; happiness = 100;
                break;
            case 'normal':
                anger = 0; sadness = 0; happiness = 50;
                break;
            case 'anxious':
                anger = 10; sadness = 70; happiness = 10;
                break;
            case 'combative':
                anger = 90; sadness = 10; happiness = 0;
                break;
            case 'depressed':
                anger = 0; sadness = 85; happiness = 0;
                break;
        }
        
        this.angerSlider.value = anger;
        this.angerVal.innerText = anger + "%";
        
        this.sadnessSlider.value = sadness;
        this.sadnessVal.innerText = sadness + "%";
        
        this.happinessSlider.value = happiness;
        this.happinessVal.innerText = happiness + "%";
        
        this.calculatePAD();
    }

    saveSettings() {
        const modelValue = this.modelSelect.value;
        if (modelValue === 'custom') {
            this.selectedModel = this.modelCustom.value.trim() || "llama3.1:latest";
        } else {
            this.selectedModel = modelValue;
        }
        
        this.temperature = parseFloat(this.tempSlider.value);
        this.customPrompt = this.promptTextarea.value;
        this.calculatePAD();
        
        this.closeDrawer();
        
        // Flash a status message briefly
        const originalStatus = this.status.innerText;
        this.status.innerText = "⚙️ ปรับจูนบุคลิกและระดับอารมณ์แล้ว!";
        this.status.style.color = "#198754";
        setTimeout(() => {
            this.status.innerText = originalStatus;
            this.status.style.color = "";
        }, 1500);
    }

    switchTab(os) {
        if (os === 'win') {
            this.tabWin.classList.add('active');
            this.tabMac.classList.remove('active');
            this.instructionsWin.style.display = 'block';
            this.instructionsMac.style.display = 'none';
        } else {
            this.tabWin.classList.remove('active');
            this.tabMac.classList.add('active');
            this.instructionsWin.style.display = 'none';
            this.instructionsMac.style.display = 'block';
        }
    }

    closeConnections() {
        if (this.socket) {
            this.socket.onclose = null; // Break the infinite reconnect loop!
            this.socket.close();
            this.socket = null;
        }
        window.speechSynthesis.cancel();
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

        this.status.innerText = "กำลังเชื่อมต่อกับเซิร์ฟเวอร์...";
        
        try {
            this.socket = new WebSocket(wsUrl);

            this.socket.onopen = () => {
                this.status.innerText = "✅ ระบบพร้อมทำงาน...";
                this.setupWizard.style.display = 'none';
            };

            this.socket.onmessage = (event) => {
                const text = event.data;
                
                if (text === "__END__") {
                    if (this.sentenceBuffer.trim()) {
                        this.enqueueTTS(this.sentenceBuffer.trim());
                        this.sentenceBuffer = "";
                    }
                    this.status.innerText = "✅ รอรับคำถามต่อไป...";
                    return;
                }

                // If receiving session closed notice
                if (text.startsWith("Session saved.")) {
                    this.status.innerText = "🏁 บันทึกประวัติเรียบร้อยแล้ว";
                    return;
                }

                if (!this.currentPatientMsgDiv) {
                    this.currentPatientMsgDiv = document.createElement('div');
                    this.currentPatientMsgDiv.className = 'msg patient';
                    this.currentPatientMsgDiv.innerText = "🤕 ผู้ป่วย: ";
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
                this.status.innerText = "🔌 ดำเนินการเชื่อมต่อท้องถิ่นขัดข้อง...";
                this.setupWizard.style.display = 'block';
            };
            
            this.socket.onerror = () => {
                this.status.innerText = "🔌 ดำเนินการเชื่อมต่อท้องถิ่นขัดข้อง...";
                this.setupWizard.style.display = 'block';
            };
        } catch (e) {
            console.error("WebSocket construction failed:", e);
            this.status.innerText = "❌ ไม่สามารถเชื่อมต่อได้";
            this.setupWizard.style.display = 'block';
        }
    }

    toggleDictation() {
        if (this.isRecording) {
            if (this.recognition) this.recognition.stop();
            return;
        }

        if (window.hasOwnProperty('webkitSpeechRecognition')) {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = "th-TH";

            let final_transcript = '';

            this.recognition.onstart = () => {
                this.isRecording = true;
                this.status.innerText = "🔴 กำลังฟัง... (พูดจบแล้วคลิกปุ่มอีกครั้งเพื่อส่ง)";
                this.micBtn.innerText = "🛑 คลิกเพื่อส่งคำถาม";
                this.micBtn.style.backgroundColor = "#dc3545";
                
                this.tempMsgDiv = document.createElement('div');
                this.tempMsgDiv.className = 'msg user';
                this.tempMsgDiv.innerText = "👨‍⚕️ คุณ: ...";
                this.chatBox.appendChild(this.tempMsgDiv);
                this.chatBox.scrollTop = this.chatBox.scrollHeight;
                this.currentPatientMsgDiv = null;
            };

            this.recognition.onresult = (e) => {
                let interim_transcript = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) final_transcript += e.results[i][0].transcript;
                    else interim_transcript += e.results[i][0].transcript;
                }
                if (this.tempMsgDiv) {
                    this.tempMsgDiv.innerText = "👨‍⚕️ คุณ: " + final_transcript + interim_transcript;
                }
            };

            this.recognition.onend = () => {
                this.isRecording = false;
                this.micBtn.innerText = "🎤 คลิกเพื่อพูด";
                this.micBtn.style.backgroundColor = "#0d6efd";

                if (final_transcript.trim() !== '') {
                    this.sendViaWS(final_transcript);
                } else if (this.tempMsgDiv) {
                    this.tempMsgDiv.remove();
                }
            };

            this.recognition.start();
        } else {
            alert("เว็บเบราว์เซอร์นี้ไม่สนับสนุนการแปลงเสียงพูดเป็นข้อความ (Speech Recognition) กรุณาใช้ Google Chrome");
        }
    }

    sendViaWS(text) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            // Package up the chat payload alongside dynamic GGUF & dynamic PAD vector parameters
            this.socket.send(JSON.stringify({ 
                session_id: this.sessionId, 
                student_text: text,
                case_id: this.selectedCaseId, // 👈 Dynamically bind selected case to session
                config: {
                    model: this.selectedModel,
                    temperature: this.temperature,
                    system_prompt_custom: this.customPrompt,
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

    endSimulation() {
        if (confirm("คุณแน่ใจหรือไม่ว่าต้องการจบการซักประวัติ?")) {
            this.sendViaWS("__END_SESSION__");
            this.micBtn.disabled = true;
            this.endBtn.style.display = 'none';
            this.newBtn.style.display = 'inline-block';
            this.viewEvalBtn.style.display = 'inline-block';
        }
    }

    newSimulation() {
        this.sessionId = "session_" + Math.random().toString(36).substring(7);
        this.chatBox.innerHTML = "";
        this.micBtn.disabled = false;
        this.endBtn.style.display = 'inline-block';
        this.newBtn.style.display = 'none';
        this.viewEvalBtn.style.display = 'none';
        this.currentPatientMsgDiv = null;
        this.ttsQueue = [];
        this.isSpeaking = false;
        window.speechSynthesis.cancel();
        
        // In selective mode, return to cards grid. In random, immediately reconnect
        if (this.mode === 'selective') {
            this.showScreen('portal');
        } else {
            this.startSimulationWithCase(null);
        }
    }

    async showEvaluation() {
        this.evalModal.style.display = 'block';
        this.evalResults.innerHTML = "<p style='text-align:center;'>⏳ กำลังประมวลผลการประเมินโดย AI... (อาจใช้เวลา 10-30 วินาที)</p>";

        try {
            // Adapt URL call depending on relative vs absolute server URL
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/evaluate/${this.sessionId}`);
            const data = await response.json();

            if (data.error) {
                this.evalResults.innerHTML = `<p style='color:red;'>❌ เกิดข้อผิดพลาด: ${data.error}</p>`;
                return;
            }

            let html = `<div style='text-align:center; font-size: 24px; margin-bottom: 20px;'>คะแนนรวม: <b>${data.overall_score}/5</b></div>`;
            
            for (const [key, score] of Object.entries(data.scores)) {
                const label = key.replace(/_/g, ' ').toUpperCase();
                html += `
                    <div class="score-row">
                        <span>${label}</span>
                        <span class="score-stars">${'⭐'.repeat(score)}</span>
                    </div>
                `;
            }

            html += `
                <div class="feedback-section">
                    <p class="strength">✅ จุดเด่น:</p>
                    <ul>${data.feedback.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
                    <p class="weakness">❌ จุดที่ควรพัฒนา:</p>
                    <ul>${data.feedback.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
                    <p>💡 <b>คำแนะนำเพิ่มเติม:</b> ${data.feedback.suggestion}</p>
                </div>
            `;
            this.evalResults.innerHTML = html;

        } catch (e) {
            console.error("Evaluation loading failed:", e);
            this.evalResults.innerHTML = `<p style='color:red;'>❌ ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์เพื่อดึงข้อมูลประเมินได้</p>`;
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

    processTTSQueue() {
        if (this.isSpeaking || this.ttsQueue.length === 0) return;
        this.isSpeaking = true;
        const text = this.ttsQueue.shift();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "th-TH";
        utterance.onend = () => { 
            this.isSpeaking = false; 
            this.processTTSQueue(); 
        };
        window.speechSynthesis.speak(utterance);
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
        const token = sessionStorage.getItem('osce_admin_token');
        if (token === 'admin_verified_token_xyz') {
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

    async handleAuthSubmit() {
        const passcode = this.authPasscodeInput.value.trim();
        this.authErrorMsg.style.display = 'none';
        
        if (!passcode) {
            this.authErrorMsg.innerText = "กรุณากรอกรหัสผ่าน!";
            this.authErrorMsg.style.display = 'block';
            return;
        }
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/auth`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: 'admin', passcode: passcode })
            });
            const data = await response.json();
            
            if (data.status === 'success') {
                sessionStorage.setItem('osce_admin_token', data.token);
                this.authPasscodeInput.value = '';
                this.checkAuthentication();
            } else {
                this.authErrorMsg.innerText = data.message || "รหัสผ่านไม่ถูกต้อง!";
                this.authErrorMsg.style.display = 'block';
            }
        } catch (err) {
            console.error("Auth validation failed:", err);
            // Local fallback validation if offline/error to help smooth presentation
            if (passcode === 'admin123') {
                sessionStorage.setItem('osce_admin_token', 'admin_verified_token_xyz');
                this.authPasscodeInput.value = '';
                this.checkAuthentication();
            } else {
                this.authErrorMsg.innerText = "ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ตรวจรหัสผ่านได้!";
                this.authErrorMsg.style.display = 'block';
            }
        }
    }

    lockAdmin() {
        sessionStorage.removeItem('osce_admin_token');
        this.checkAuthentication();
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
                    overflow: hidden;
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
                <div class="admin-navbar">
                    <div class="admin-logo">🏥 แผงควบคุมผู้ประเมิน OSCE AI</div>
                    <div class="admin-tabs" style="display: flex; align-items: center; gap: 8px;">
                        <button class="tab-link active" id="tab-cases">🩺 คลังเคสคนไข้สมมติ</button>
                        <button class="tab-link" id="tab-sessions">📊 ผลสัมฤทธิ์นักศึกษา</button>
                        <button class="lock-btn" id="lock-admin-btn" title="ออกจากระบบ / ล็อคแผงควบคุม" style="margin-left: 10px;">🔒 ล็อคแผง</button>
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
                            <div class="table-wrapper">
                                <table class="admin-table">
                                    <thead>
                                        <tr>
                                            <th>รหัสการสอบ</th>
                                            <th>กรณีศึกษา</th>
                                            <th>จำนวนรอบคำถาม</th>
                                            <th>คะแนน AI</th>
                                            <th>สถานะการสอบ</th>
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
                <div class="auth-card">
                    <div class="auth-icon">👨‍🏫</div>
                    <div class="auth-title">เข้าใช้งานในบทบาท "อาจารย์ผู้ประเมิน"</div>
                    <div class="auth-desc">กรุณากรอกรหัสผ่านเพื่อปลดล็อคคอนโซลวิเคราะห์และประเมินผล (Admin Console)<br><small style="color: #94a3b8;">(รหัสผ่านแนะนำ: admin123)</small></div>
                    <input type="password" id="auth-passcode-input" class="form-control" placeholder="ป้อนรหัสผ่านวิเคราะห์ผล..." style="text-align: center; margin-bottom: 15px;">
                    <button id="auth-submit-btn" class="auth-submit-btn">🔓 ปลดล็อคระบบ</button>
                    <div id="auth-error-msg" class="auth-error">รหัสผ่านสำหรับสิทธิ์ใช้งานไม่ถูกต้อง!</div>
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
        this.authPasscodeInput = this.shadowDOM.getElementById('auth-passcode-input');
        this.authSubmitBtn = this.shadowDOM.getElementById('auth-submit-btn');
        this.authErrorMsg = this.shadowDOM.getElementById('auth-error-msg');
        this.lockAdminBtn = this.shadowDOM.getElementById('lock-admin-btn');
        
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
        
        // Student sessions
        this.sessionsTableBody = this.shadowDOM.getElementById('sessions-table-body');
        this.sessionDetailPanel = this.shadowDOM.getElementById('session-detail-panel');
        this.btnCloseDetail = this.shadowDOM.getElementById('btn-close-detail');
        this.sessionDetailBody = this.shadowDOM.getElementById('session-detail-body');
        
        this.btnCloseDetail.addEventListener('click', () => {
            this.sessionDetailPanel.style.display = 'none';
        });

        // Auth Event listeners
        this.authSubmitBtn.addEventListener('click', () => this.handleAuthSubmit());
        this.authPasscodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAuthSubmit();
        });
        this.lockAdminBtn.addEventListener('click', () => this.lockAdmin());
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
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`);
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
                const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`);
                const all = await res.json();
                const matched = all.find(item => item.id === caseId);
                
                // Fetch detailed variables from ChromaDB via session fallback/mock loading
                // For simplicity, we decode ChromaDB metadata details directly
                if (matched) {
                    this.editCaseId.value = matched.id;
                    this.editScenarioName.value = matched.scenario_name;
                    this.editCategory.value = matched.category || "อายุรกรรม (Medicine)";
                    this.editChiefComplaint.value = matched.chief_complaint;
                    
                    // Pull detailed hidden record by executing a temporary session call or mock matching
                    // Let's resolve the hidden record from ChromaDB structure using session evaluations
                    // ChromaDB retrieves hidden records inside main.py helper get_case_by_id
                    // Let's call a fast endpoint or search locally
                    const sessionMockResponse = await fetch(`${fetchBase.replace(/\/$/, '')}/ws/chat`); // Dummy ws trigger to load
                    // Because we already saved cases in database, we fetch standard database details
                    // Let's parse hidden records if present in the matched item
                    let hiddenRec = {
                        "symptom_detail": "อาการไม่ระบุชัดเจน",
                        "severity": "เบาบาง",
                        "onset": "ระบุประวัติไม่ได้"
                    };
                    
                    // We also extend main.py to send details or fallback gracefully
                    // In main.py list_cases, we can return the entire model structure. Let's make sure it parses properly.
                    // We modify the javascript to parse matched element's custom hidden record variables
                    // Fetch from session evaluator if loaded or read default
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
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const response = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases`, {
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
        }
    }

    async deleteCase(caseId) {
        if (!confirm(`คุณต้องการลบรหัสเคส "${caseId}" ออกจากฐานข้อมูลและเวกเตอร์ถาวรใช่หรือไม่?`)) return;
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/cases/${caseId}`, {
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
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/sessions`);
            this.sessionsList = await res.json();
            this.renderSessionsList(this.sessionsList);
        } catch (err) {
            console.error("Error loading sessions:", err);
        }
    }

    renderSessionsList(sessions) {
        this.sessionsTableBody.innerHTML = '';
        if (sessions.length === 0) {
            this.sessionsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">ยังไม่มีประวัติการสอบประเมินของนักศึกษา</td></tr>`;
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
            `;
            
            row.addEventListener('click', () => this.viewSessionDetail(s.session_id));
            this.sessionsTableBody.appendChild(row);
        });
    }

    async viewSessionDetail(sessionId) {
        this.sessionDetailPanel.style.display = 'block';
        this.sessionDetailBody.innerHTML = `<div style="text-align:center; padding:40px 0;">⏳ กำลังเรียกประวัติและตรวจวิเคราะห์คำตอบจากคลาวด์...</div>`;
        
        try {
            const fetchBase = this.serverUrl.startsWith('http') ? this.serverUrl : window.location.origin;
            const res = await fetch(`${fetchBase.replace(/\/$/, '')}/api/sessions/${sessionId}`);
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

