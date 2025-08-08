"""
Memory-efficient, Render.com-ready Flask app for Liver Fibrosis Prediction.

Features & considerations included in this rewrite:
- All original endpoints preserved and ported.
- Models (scaler, RF, CNN) are loaded lazily and cached using lru_cache.
- No hard-coded API keys: use environment variables OPENROUTER_API_KEY and OPENROUTER_API_KEY2.
- Temporary files are handled via tempfile and removed promptly.
- SQLite DB is initialized once (if missing) on import; every request uses a short-lived connection.
- Static React build is served from `build/` if present.
- Suitable for Gunicorn (do NOT call app.run when deployed under Gunicorn).

Deployment notes (from user):
build command:
    pip install --no-cache-dir -r requirements.txt && npm ci --legacy-peer-deps && CI=false npm run build && rm -rf node_modules
start command:
    gunicorn app:app --bind 0.0.0.0:$PORT --workers 1 --threads 1 --timeout 120

"""

import os
import re
import base64
import tempfile
import sqlite3
import traceback
from functools import lru_cache
from typing import Optional

import numpy as np
import pandas as pd
import pickle
import requests
import tensorflow as tf
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from PIL import Image
import pdfplumber

# -------------------------
# Configurable paths & env
# -------------------------
RF_MODEL_PATH = os.environ.get("RF_MODEL_PATH", "rf_model.pkl")
SCALER_PATH = os.environ.get("SCALER_PATH", "scaler.pkl")
CNN_MODEL_PATH = os.environ.get("CNN_MODEL_PATH", "cnn_model.h5")
DB_PATH = os.environ.get("DB_PATH", "users.db")

# Secure: put your keys in environment variables on Render.com
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
OPENROUTER_API_KEY2 = os.environ.get("OPENROUTER_API_KEY2")

CLASS_LABELS = ['F0', 'F1', 'F2', 'F3', 'F4']

# -------------------------
# Flask app
# -------------------------
app = Flask(__name__, static_folder='build', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY', 'change-me-in-production')
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# -------------------------
# Helpers: DB
# -------------------------

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    # Create DB & tables if DB doesn't exist. Safe to call multiple times.
    if os.path.exists(DB_PATH):
        return
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lab_values (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tc TEXT NOT NULL,
            tarih DATETIME DEFAULT CURRENT_TIMESTAMP,
            AST REAL,
            ALT REAL,
            ALP REAL,
            Protein REAL,
            AG_Ratio REAL,
            Total_Bilirubin REAL,
            Direkt_Bilirubin REAL,
            Albumin REAL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tc TEXT UNIQUE NOT NULL,
            name TEXT,
            surname TEXT,
            age INTEGER,
            gender TEXT,
            evre TEXT
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS doctor_patient (
            doctor_id INTEGER,
            patient_id INTEGER,
            PRIMARY KEY (doctor_id, patient_id),
            FOREIGN KEY (doctor_id) REFERENCES users(id),
            FOREIGN KEY (patient_id) REFERENCES patients(id)
        );
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tc_no TEXT NOT NULL,
            report_name TEXT,
            prediction_result TEXT,
            evre TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    sample_users = [
        ("erva.ergul", "123456"),
        ("busra.inan", "123456"),
        ("ege.kuzu", "123456"),
        ("kevser.semiz", "123456"),
        ("helin.ozalkan", "123456"),
        ("sumeyye.agir", "123456"),
        ("efe.kesler", "123456"),
        ("devran.sahin", "123456"),
        ("cengizhan.karaman", "123456"),
        ("enes.coban", "123456"),
        ("kerem.guney", "123456"),
    ]
    cursor.executemany("INSERT INTO users (username, password) VALUES (?, ?)", sample_users)

    conn.commit()
    conn.close()

# Ensure DB exists at import time (Gunicorn will import app)
init_db()

# -------------------------
# Helpers: Models (lazily loaded)
# -------------------------
@lru_cache(maxsize=1)
def load_scaler():
    if not os.path.exists(SCALER_PATH):
        raise FileNotFoundError(f"Scaler file not found: {SCALER_PATH}")
    with open(SCALER_PATH, 'rb') as f:
        return pickle.load(f)

@lru_cache(maxsize=1)
def load_rf_model():
    if not os.path.exists(RF_MODEL_PATH):
        raise FileNotFoundError(f"RF model file not found: {RF_MODEL_PATH}")
    with open(RF_MODEL_PATH, 'rb') as f:
        return pickle.load(f)

@lru_cache(maxsize=1)
def load_cnn_model():
    if not os.path.exists(CNN_MODEL_PATH):
        raise FileNotFoundError(f"CNN model file not found: {CNN_MODEL_PATH}")
    # load without compiling to save memory
    return tf.keras.models.load_model(CNN_MODEL_PATH, compile=False)

# -------------------------
# Helpers: OpenRouter API calls (LLM and VLM)
# -------------------------

def call_openrouter_chat(api_key: str, payload: dict, endpoint: str = "https://openrouter.ai/api/v1/chat/completions") -> Optional[str]:
    if not api_key:
        return "API key not configured on server."
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    try:
        resp = requests.post(endpoint, json=payload, headers=headers, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            return data.get("choices", [])[0].get("message", {}).get("content")
        return f"OpenRouter API call failed with status {resp.status_code}: {resp.text}"
    except Exception as e:
        return f"OpenRouter API error: {str(e)}"


def get_vlm_analysis(image_path: str) -> str:
    try:
        with open(image_path, 'rb') as f:
            b64 = base64.b64encode(f.read()).decode('utf-8')

        prompt = [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
            {"type": "text", "text": "Sen bir tıp uzmanısın. Ultrason görüntüsünü analiz et ve detaylı klinik yorumunu yap. Kısa ve net ol."}
        ]
        payload = {"model": "mistralai/mistral-small-3.2-24b-instruct:free", "messages": [{"role": "user", "content": prompt}], "max_tokens": 512}
        return call_openrouter_chat(OPENROUTER_API_KEY2, payload)
    except Exception as e:
        return f"VLM analysis error: {str(e)}"

# -------------------------
# Routes (full parity with original)
# -------------------------
@app.route("/login", methods=["GET"])  # keep GET root from original intent
def probe():
    return "Liver Fibrosis Prediction API is running!"

@app.route("/add_report", methods=["POST"]) 
def add_report():
    try:
        data = request.get_json() or {}
        tc_no = data.get("tc_no")
        report_text = data.get("report_text")
        name = data.get("name")
        surname = data.get("surname")
        age = data.get("age")
        gender = data.get("gender")
        evre = data.get("evre")
        doctor_id = session.get("user_id")

        if not tc_no or not report_text or not doctor_id:
            return jsonify({"success": False, "message": "Eksik parametre veya giriş yapılmamış."}), 400

        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute("SELECT id FROM patients WHERE tc = ?", (tc_no,))
        patient = cursor.fetchone()

        if not patient:
            cursor.execute(
                "INSERT INTO patients (tc, name, surname, age, gender, evre) VALUES (?, ?, ?, ?, ?, ?)",
                (tc_no, name, surname, age, gender, evre)
            )
            patient_id = cursor.lastrowid
        else:
            patient_id = patient["id"]
            cursor.execute("UPDATE patients SET evre = ? WHERE id = ?", (evre, patient_id))

        cursor.execute("SELECT 1 FROM doctor_patient WHERE doctor_id = ? AND patient_id = ?", (doctor_id, patient_id))
        relation = cursor.fetchone()
        if not relation:
            cursor.execute("INSERT INTO doctor_patient (doctor_id, patient_id) VALUES (?, ?)", (doctor_id, patient_id))

        cursor.execute(
            "INSERT INTO reports (tc_no, report_name, prediction_result, evre) VALUES (?, ?, ?, ?)",
            (tc_no, "Otomatik Rapor", report_text, evre)
        )

        conn.commit()
        conn.close()
        return jsonify({"success": True, "message": "Rapor kaydedildi."})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route('/lab_values/<tc>', methods=['GET'])
def get_lab_values(tc):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM lab_values WHERE tc = ? ORDER BY tarih DESC", (tc,))
        rows = cursor.fetchall()
        conn.close()
        return jsonify({"lab_values": [dict(r) for r in rows]})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/lab_values", methods=["POST"]) 
def save_lab_values():
    try:
        data = request.get_json() or {}
        tc = data.get("tc")
        if not tc:
            return jsonify({"error": "tc zorunludur"}), 400

        fields = ("AST", "ALT", "ALP", "Protein", "AG_Ratio", "Total_Bilirubin", "Direkt_Bilirubin", "Albumin")
        vals = [data.get(k) for k in fields]

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO lab_values (tc, AST, ALT, ALP, Protein, AG_Ratio, Total_Bilirubin, Direkt_Bilirubin, Albumin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (tc, *vals)
        )
        conn.commit()
        conn.close()
        return jsonify({"message": "Lab değerleri kaydedildi"}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/patients/<tc>", methods=["GET"]) 
def get_patient(tc):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT name, surname, tc, evre FROM patients WHERE tc = ?", (tc,))
        row = cursor.fetchone()
        conn.close()
        if row:
            return jsonify({"name": row[0], "surname": row[1], "tc": row[2], "evre": row[3]})
        return jsonify({"error": "Hasta bulunamadı"}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/get_reports/<tc_no>", methods=["GET"]) 
def get_reports(tc_no):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT report_name, prediction_result, evre, created_at FROM reports WHERE tc_no = ?", (tc_no,))
        reports = cursor.fetchall()
        conn.close()
        report_list = [{"report_name": r[0], "prediction_result": r[1], "evre": r[2], "created_at": r[3]} for r in reports]
        return jsonify({"tc_no": tc_no, "reports": report_list})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/predict", methods=["POST"]) 
def predict():
    # Memory-efficient prediction:
    # - Validate and parse incoming small fields
    # - Save uploaded image to a secure temp file and delete it ASAP
    # - Load models lazily using lru_cache
    try:
        # parse form fields
        form = request.form
        required = ["Total_Bilirubin", "Direct_Bilirubin", "ALP", "ALT", "AST", "Proteins", "Albumin", "AG_Ratio"]
        for key in required:
            if key not in form:
                return jsonify({"error": f"Missing form field: {key}"}), 400

        input_vals = [float(form[k]) for k in required]

        image_file = request.files.get("image")
        if image_file is None:
            return jsonify({"error": "Ultrasound image is required."}), 400

        # save temp image securely
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".jpg")
        try:
            image_file.save(tmp.name)
            tmp.close()

            # Clinical RF prediction
            df_input = pd.DataFrame([input_vals], columns=[
                'Total Bilirubin', 'Direct Bilirubin',
                'Alkphos Alkaline Phosphotase', 'Sgpt Alamine Aminotransferase',
                'Sgot Aspartate Aminotransferase', 'Total Protiens',
                'ALB Albumin', 'A/G Ratio Albumin and Globulin Ratio'
            ])

            scaler = load_scaler()
            rf_model = load_rf_model()
            scaled_input = scaler.transform(df_input)
            clinic_prediction = int(rf_model.predict(scaled_input)[0])

            # CNN prediction
            img = Image.open(tmp.name).convert("RGB").resize((128, 128))
            img_array = np.expand_dims(np.array(img) / 255.0, axis=0)
            cnn_model = load_cnn_model()
            preds = cnn_model.predict(img_array)
            predicted_class = CLASS_LABELS[int(np.argmax(preds))]
            confidence = float(np.max(preds) * 100)

            # LLM explanation (clinical)
            llm_prompt = f"""
Sen tecrübeli bir hepatoloji uzmanı ve karaciğer hastalıkları üzerine çalışan bir yapay zeka destekli klinik danışmansın. Aşağıda bir hastaya ait biyokimya laboratuvar verileri ve yapay zeka tarafından tahmin edilen karaciğer fibroz evreleri verilmiştir.

Bu bilgilere dayanarak:
1. Hastanın mevcut karaciğer durumu hakkında detaylı klinik bir değerlendirme yap,
2. Fibroz evresinin anlamını açıklayarak karaciğerdeki yapısal değişiklikleri yorumla,
3. Bulgulara dayalı olası hastalık nedenlerini (etiyoloji) belirt,
4. Uygun tedavi önerileri sun,
5. Takip sıklığı, izlenmesi gereken parametreler ve ileri test gerekliliği hakkında tıbbi önerilerde bulun.

### Hastanın Laboratuvar Bulguları:
- Total Bilirubin: {input_vals[0]}
- Direkt Bilirubin: {input_vals[1]}
- ALP (Alkalen Fosfataz): {input_vals[2]}
- ALT (Alanin Aminotransferaz): {input_vals[3]}
- AST (Aspartat Aminotransferaz): {input_vals[4]}
- Total Protein: {input_vals[5]}
- Albümin: {input_vals[6]}
- A/G Oranı (Albumin/Globulin): {input_vals[7]}

### Yapay Zeka Tarafından Tahmin Edilen Fibroz Evresi: {predicted_class}
"""
            llm_payload = {"model": "openai/gpt-4o", "messages": [{"role": "user", "content": llm_prompt}], "max_tokens": 1000}
            llm_explanation = call_openrouter_chat(OPENROUTER_API_KEY, llm_payload)

            # VLM analysis (image explanation)
            vlm_explanation = get_vlm_analysis(tmp.name)

            return jsonify({
                "clinic_result": clinic_prediction,
                "image_result": predicted_class,
                "confidence": round(confidence, 2),
                "llm_explanation": llm_explanation,
                "vlm_explanation": vlm_explanation
            })

        finally:
            # always remove temporary file
            try:
                os.remove(tmp.name)
            except Exception:
                pass

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/patients", methods=["GET"]) 
def get_patients():
    doctor_id = session.get("user_id")
    if not doctor_id:
        return jsonify({"success": False, "message": "Giriş yapılmamış."}), 401
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT p.name, p.surname, p.tc, p.evre
            FROM patients p
            JOIN doctor_patient dp ON dp.patient_id = p.id
            WHERE dp.doctor_id = ?
        """, (doctor_id,))
        rows = cursor.fetchall()
        conn.close()
        patients = [{"ad": r[0], "soyad": r[1], "tc": r[2], "evre": r[3]} for r in rows]
        return jsonify(patients)
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


# CHAT endpoint
@app.route("/chat", methods=["POST"]) 
def chat():
    try:
        data = request.get_json() or {}
        user_message = data.get("message", "")
        if not user_message:
            return jsonify({"error": "Mesaj boş olamaz."}), 400

        prompt = f"""
Sen bir hepatoloji uzman yardımcısısın. Hastanın sorusuna açık, net ve profesyonel bir şekilde yanıt ver.

Hastanın sorusu: {user_message}
"""
        payload = {"model": "openai/gpt-4o", "messages": [{"role": "user", "content": prompt}], "max_tokens": 1000, "temperature": 0.7}
        answer = call_openrouter_chat(OPENROUTER_API_KEY, payload)
        if not answer:
            return jsonify({"error": "LLM API çağrısı başarısız."}), 500
        return jsonify({"response": answer})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/parse", methods=["POST"]) 
def parse_pdf():
    try:
        file = request.files.get("file")
        if not file:
            return jsonify({"error": "PDF dosyası yüklenmedi."}), 400

        text = ""
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                text += page.extract_text() or ""

        # use regex searches with flexible patterns
        def find(pattern):
            m = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
            return m.group(1) if m else None

        result = {
            "ast": find(r"Aspartat transaminaz.*?(\d+)\s*U/L"),
            "alt": find(r"Alanin aminotransferaz.*?(\d+)\s*U/L"),
            "alp": find(r"Alkalen fosfataz.*?\(ALP\).*?(\d+)\s*U/L"),
            "totalBilirubin": find(r"Bilirubin \(total\).*?(\d+\.?\d*)\s*mg/dL"),
            "directBilirubin": find(r"Bilirubin \(direkt\).*?(\d+\.?\d*)\s*mg/dL"),
            "albumin": find(r"Albümin.*?(\d+\.?\d*)\s*g/L"),
            "platelet": find(r"PLT.*?(\d+)\s*10[\u00B3\^]?/µL")
        }
        return jsonify(result)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/me", methods=["GET"]) 
def get_current_user():
    user_id = session.get("user_id")
    if user_id:
        return jsonify({"user_id": user_id})
    return jsonify({"message": "Giriş yapılmamış."}), 401


@app.route("/check-password", methods=["POST"]) 
def check_password():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"success": False, "message": "Giriş yapılmamış."}), 401
    data = request.get_json() or {}
    password = data.get("password")
    if not password:
        return jsonify({"success": False, "message": "Şifre gerekli."}), 400
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT password FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()
        if row and row[0] == password:
            return jsonify({"success": True}), 200
        return jsonify({"success": False, "message": "Şifre hatalı."}), 401
    except Exception as e:
        return jsonify({"success": False, "message": "Sunucu hatası."}), 500


@app.route("/register", methods=["POST"]) 
def register():
    try:
        data = request.get_json() or {}
        username = data.get("username")
        password = data.get("password")
        if not username or not password:
            return jsonify({"success": False, "message": "Kullanıcı adı veya şifre boş."}), 400
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "message": "Bu kullanıcı adı zaten kullanılıyor."}), 409
        cursor.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
        user_id = cursor.lastrowid
        conn.commit()
        conn.close()
        session["user_id"] = user_id
        return jsonify({"success": True, "message": "Kayıt başarılı. Giriş yapıldı."})
    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/login", methods=["POST"]) 
def login():
    try:
        data = request.get_json() or {}
        username = data.get("username")
        password = data.get("password")
        if not username or not password:
            return jsonify({"success": False, "message": "Kullanıcı adı veya şifre boş."}), 400
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ? AND password = ?", (username, password))
        user = cursor.fetchone()
        conn.close()
        if user:
            session["user_id"] = user[0]
            return jsonify({"success": True, "message": "Giriş başarılı"})
        return jsonify({"success": False, "message": "Kullanıcı adı veya şifre yanlış."}), 401
    except Exception as e:
        return jsonify({"success": False, "message": f"Hata: {str(e)}"}), 500


@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True, "message": "Çıkış yapıldı."})


# Serve React static files if build exists (keeps parity with original)
@app.route('/', defaults={"path": ""})
@app.route('/<path:path>')
def serve_react_app(path):
    if app.static_folder and path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    if app.static_folder and os.path.exists(os.path.join(app.static_folder, 'index.html')):
        return send_from_directory(app.static_folder, 'index.html')
    return jsonify({"message": "API running. No static build found."})


# If running locally for dev
if __name__ == '__main__':
    # Do not set debug=True in production. Use an env var if you want dev toggles.
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 5001)), debug=False, threaded=True)
