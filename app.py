from flask import Flask, request, jsonify,session
from flask_cors import CORS
import numpy as np
import pandas as pd
import pickle
import tensorflow as tf
from PIL import Image
import requests
import base64
import os
import pdfplumber
import sqlite3
from functools import lru_cache

# Model paths
RF_MODEL_PATH = "rf_model.pkl"
SCALER_PATH = "scaler.pkl"
CNN_MODEL_PATH = "cnn_model.h5"

API_KEY = "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"
API_KEY2 = "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"

class_labels = ['F0', 'F1', 'F2', 'F3', 'F4']

app = Flask(__name__, static_folder='build', static_url_path='')
app.secret_key = "sır-gibi-sakla-bunu"
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

@lru_cache(maxsize=1)
def get_scaler():
    with open(SCALER_PATH, "rb") as f:
        return pickle.load(f)

@lru_cache(maxsize=1)
def get_rf_model():
    with open(RF_MODEL_PATH, "rb") as f:
        return pickle.load(f)

@lru_cache(maxsize=1)
def get_cnn_model():
    return tf.keras.models.load_model(CNN_MODEL_PATH)

DB_PATH = "users.db"

# Veritabanı başlatma
def init_db():
    if not os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # users tablosu (login için)
        cursor.execute("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        """)
        #lab verileri tablosu
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


        # patients tablosu (hasta bilgileri)
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
        # reports tablosu: patient_id yerine tc_no tutulacak
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
        # Örnek kullanıcılar (login için)
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
        print("SQLite veritabanı ve kullanıcılar oluşturuldu.")

@app.route("/login")
def home():
    return "Liver Fibrosis Prediction API is running!"

def get_vlm_analysis(image_path):
    try:
        with open(image_path, "rb") as img_file:
            base64_image = base64.b64encode(img_file.read()).decode("utf-8")

        prompt = [
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:image/jpeg;base64,{base64_image}",
                },
            },
            {
                "type": "text",
                "text": "Sen bir tıp uzmanısın. Ultrason görüntüsünü analiz et ve detaylı klinik yorumunu yap. Görülebilen herhangi bir anormallik, olası karaciğer fibroz evreleri veya mevcutsa diğer önemli bulguları belirt. Kısa cevap ver. 5 cümlede anlat.",
            },
        ]

        headers = {
            "Authorization": f"Bearer {API_KEY2}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": "mistralai/mistral-small-3.2-24b-instruct:free",
            "messages": [
                {
                    "role": "user",
                    "content": prompt,
                }
            ],
            "max_tokens": 1024,
            "temperature": 0.7,
        }

        print("\nSending VLM request to OpenRouter API...")
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            json=payload,
            headers=headers
        )

        if response.status_code == 200:
            vlm_response = response.json()["choices"][0]["message"]["content"]
            return vlm_response
        else:
            return f"VLM response failed (status code {response.status_code})."

    except Exception as e:
        return f"VLM analysis error: {str(e)}"

@app.route("/add_report", methods=["POST"])
def add_report():
    try:
        data = request.get_json()
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

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Hasta var mı?
        cursor.execute("SELECT id FROM patients WHERE tc = ?", (tc_no,))
        patient = cursor.fetchone()

        if not patient:
            # Yeni hasta ekle
            cursor.execute(
                "INSERT INTO patients (tc, name, surname, age, gender, evre) VALUES (?, ?, ?, ?, ?, ?)",
                (tc_no, name, surname, age, gender, evre)
            )
            patient_id = cursor.lastrowid
        else:
            patient_id = patient[0]
            # Evre güncelle
            cursor.execute("UPDATE patients SET evre = ? WHERE id = ?", (evre, patient_id))

        # Doktor - hasta ilişki kontrolü
        cursor.execute("SELECT 1 FROM doctor_patient WHERE doctor_id = ? AND patient_id = ?", (doctor_id, patient_id))
        relation = cursor.fetchone()

        if not relation:
            cursor.execute("INSERT INTO doctor_patient (doctor_id, patient_id) VALUES (?, ?)", (doctor_id, patient_id))


        # Raporu ekle
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

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM lab_values WHERE tc = ? ORDER BY tarih DESC
    """, (tc,))
    rows = cursor.fetchall()
    conn.close()

    results = [dict(row) for row in rows]
    return jsonify({"lab_values": results})

# Örnek: POST ile yeni laboratuvar sonucu ekleme
@app.route("/lab_values", methods=["POST"])
def save_lab_values():
    data = request.get_json()
    tc = data.get("tc")
    AST = data.get("AST")
    ALT = data.get("ALT")
    ALP = data.get("ALP")
    Protein = data.get("Protein")
    AG_Ratio = data.get("AG_Ratio")
    Total_Bilirubin = data.get("Total_Bilirubin")
    Direkt_Bilirubin = data.get("Direkt_Bilirubin")
    Albumin = data.get("Albumin")

    if not tc:
        return jsonify({"error": "tc zorunludur"}), 400

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO lab_values (tc, AST, ALT, ALP, Protein, AG_Ratio, Total_Bilirubin, Direkt_Bilirubin, Albumin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (tc, AST, ALT, ALP, Protein, AG_Ratio, Total_Bilirubin, Direkt_Bilirubin, Albumin))
    conn.commit()
    conn.close()

    return jsonify({"message": "Lab değerleri kaydedildi"}), 201


@app.route("/patients/<tc>", methods=["GET"])
def get_patient(tc):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("SELECT name, surname, tc, evre FROM patients WHERE tc = ?", (tc,))
        row = cursor.fetchone()
        conn.close()

        if row:
            patient = {
                "name": row[0],
                "surname": row[1],
                "tc": row[2],
                "evre": row[3],
            }
            return jsonify(patient)
        else:
            return jsonify({"error": "Hasta bulunamadı"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/get_reports/<tc_no>", methods=["GET"])
def get_reports(tc_no):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        cursor.execute("SELECT report_name, prediction_result, evre, created_at FROM reports WHERE tc_no = ?", (tc_no,))

        reports = cursor.fetchall()
        conn.close()

        report_list = [
            {
                "report_name": r[0],
                "prediction_result": r[1],
                "evre": r[2],
                "created_at": r[3]
            }
            for r in reports
        ]


        return jsonify({"tc_no": tc_no, "reports": report_list})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500


@app.route("/predict", methods=["POST"])

def predict():

    try:

        data = request.form

        input_vals = [

            float(data["Total_Bilirubin"]),

            float(data["Direct_Bilirubin"]),

            float(data["ALP"]),

            float(data["ALT"]),

            float(data["AST"]),

            float(data["Proteins"]),

            float(data["Albumin"]),

            float(data["AG_Ratio"]),

        ]

 

        image = request.files.get("image", None)

        if image is None:

            return jsonify({"error": "Ultrasound image is required."}), 400

 

        image_path = "temp_image.jpg"

        image.save(image_path)

        print(f"\nSaved ultrasound image to: {image_path}")

 

        # Clinical prediction

        df_input = pd.DataFrame([input_vals], columns=[

            'Total Bilirubin', 'Direct Bilirubin',

            'Alkphos Alkaline Phosphotase', 'Sgpt Alamine Aminotransferase',

            'Sgot Aspartate Aminotransferase', 'Total Protiens',

            'ALB Albumin', 'A/G Ratio Albumin and Globulin Ratio'

        ])

        scaler = get_scaler()
        rf_model = get_rf_model()

        scaled_input = scaler.transform(df_input)
        clinic_prediction = rf_model.predict(scaled_input)[0]


        print(f"\nClinical prediction (RF model): {clinic_prediction}")

 

        # CNN prediction

        img = Image.open(image_path).convert("RGB").resize((128, 128))

        img_array = np.expand_dims(np.array(img) / 255.0, axis=0)

        cnn_model = get_cnn_model()
        predictions = cnn_model.predict(img_array)


        predicted_class = class_labels[np.argmax(predictions)]

        confidence = float(np.max(predictions) * 100)

        print(f"Image prediction (CNN model): {predicted_class} (Confidence: {confidence:.2f}%)")

 





        # LLM explanation

        llm_prompt = f"""

Sen tecrübeli bir hepatoloji uzmanı ve karaciğer hastalıkları üzerine çalışan bir yapay zeka destekli klinik danışmansın. Aşağıda bir hastaya ait biyokimya laboratuvar verileri ve yapay zeka tarafından tahmin edilen karaciğer fibroz evreleri verilmiştir.

 

Bu bilgilere dayanarak:

1. Hastanın mevcut karaciğer durumu hakkında detaylı klinik bir değerlendirme yap,

2. Fibroz evresinin anlamını açıklayarak karaciğerdeki yapısal değişiklikleri yorumla,

3. Bulgulara dayalı olası hastalık nedenlerini (etiyoloji) belirt (örneğin viral hepatit, alkole bağlı hasar, NAFLD/NASH vb.),

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

 

        headers = {

            "Authorization": f"Bearer {API_KEY}",

            "Content-Type": "application/json"

        }

 #LLM payload değiştiriyorum şu an

        llm_payload = {
    "model": "openai/gpt-4o",
    "messages": [{"role": "user", "content": llm_prompt}],
    "max_tokens": 1000
}
        print("\nSending LLM request to OpenRouter API...")

        llm_response = requests.post(

            "https://openrouter.ai/api/v1/chat/completions",

            headers=headers,

            json=llm_payload

        )

 #BURAYI DA DEĞİŞTİRİYORUM

        if llm_response.status_code == 200:
            llm_explanation = llm_response.json()["choices"][0]["message"]["content"]
            print("\nLLM Explanation Received")
        else:
            llm_explanation = "LLM response failed."
            print(f"\nLLM request failed with status code: {llm_response.status_code}")
            print("Status Code:", llm_response.status_code)
            print("Response Text:", llm_response.text)


        # VLM Explanation

        vlm_explanation = get_vlm_analysis(image_path)

        # Cleanup

        if os.path.exists(image_path):
            os.remove(image_path)
            print(f"\nRemoved temporary image: {image_path}")


        return jsonify({
            "clinic_result": int(clinic_prediction),
            "image_result": predicted_class,
            "confidence": round(confidence, 2),
            "llm_explanation": llm_explanation,
            "vlm_explanation": vlm_explanation
        })

    except Exception as e:
        print(f"\nError in predict endpoint: {str(e)}")
        return jsonify({"error": str(e)}), 500
    
    
    
@app.route("/patients", methods=["GET"])
def get_patients():
    doctor_id = session.get("user_id")
    if not doctor_id:
        return jsonify({"success": False, "message": "Giriş yapılmamış."}), 401

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT p.name, p.surname, p.tc, p.evre
        FROM patients p
        JOIN doctor_patient dp ON dp.patient_id = p.id
        WHERE dp.doctor_id = ?
    """, (doctor_id,))
    rows = cursor.fetchall()
    conn.close()

    patients = [{"ad": row[0], "soyad": row[1], "tc": row[2], "evre": row[3]} for row in rows]
    return jsonify(patients)





#CHAT
@app.route("/chat", methods=["POST"])
def chat():
    try:
        data = request.json
        user_message = data.get("message", "")
        if not user_message:
            return jsonify({"error": "Mesaj boş olamaz."}), 400

        prompt = f"""
Sen bir hepatoloji uzman yardımcısısın. Hastanın sorusuna açık, net ve profesyonel bir şekilde yanıt ver.

Hastanın sorusu: {user_message}
"""

        headers = {
            "Authorization": f"Bearer {API_KEY}",  # GPT-4o için aynı API_KEY'i kullanıyoruz
            "Content-Type": "application/json"
        }

        payload = {
            "model": "openai/gpt-4o",  # Modeli gpt-4o yaptık
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1000,
            "temperature": 0.7
        }

        llm_response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=payload
        )

        if llm_response.status_code == 200:
            answer = llm_response.json()["choices"][0]["message"]["content"]
        else:
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

        pdf_text = ""
        with pdfplumber.open(file) as pdf:
            for page in pdf.pages:
                pdf_text += page.extract_text() or ""

        import re
        result = {
            "ast": re.search(r"Aspartat transaminaz.*?(\d+)\s*U/L", pdf_text).group(1) if re.search(r"Aspartat transaminaz.*?(\d+)\s*U/L", pdf_text) else None,
            "alt": re.search(r"Alanin aminotransferaz.*?(\d+)\s*U/L", pdf_text).group(1) if re.search(r"Alanin aminotransferaz.*?(\d+)\s*U/L", pdf_text) else None,
            "alp": re.search(r"Alkalen fosfataz.*?\(ALP\).*?(\d+)\s*U/L", pdf_text).group(1) if re.search(r"Alkalen fosfataz.*?\(ALP\).*?(\d+)\s*U/L", pdf_text) else None,
            "totalBilirubin": re.search(r"Bilirubin \(total\).*?(\d+\.\d+)\s*mg/dL", pdf_text).group(1) if re.search(r"Bilirubin \(total\).*?(\d+\.\d+)\s*mg/dL", pdf_text) else None,
            "directBilirubin": re.search(r"Bilirubin \(direkt\).*?(\d+\.\d+)\s*mg/dL", pdf_text).group(1) if re.search(r"Bilirubin \(direkt\).*?(\d+\.\d+)\s*mg/dL", pdf_text) else None,
            "albumin": re.search(r"Albümin.*?(\d+\.\d+)\s*g/L", pdf_text).group(1) if re.search(r"Albümin.*?(\d+\.\d+)\s*g/L", pdf_text) else None,
            "platelet": re.search(r"PLT.*?(\d+)\s*10³/µL", pdf_text).group(1) if re.search(r"PLT.*?(\d+)\s*10³/µL", pdf_text) else None
        }

        return jsonify(result)

    except Exception as e:
        import traceback
        print("Hata:", traceback.format_exc())
        return jsonify({"error": str(e)}), 500
@app.route("/me", methods=["GET"])
def get_current_user():
    user_id = session.get("user_id")
    if user_id:
        return jsonify({"user_id": user_id})
    else:
        return jsonify({"message": "Giriş yapılmamış."}), 401

@app.route("/check-password", methods=["POST"])
def check_password():
    user_id = session.get("user_id")
    print(user_id)
    if not user_id:
        return jsonify({"success": False, "message": "Giriş yapılmamış."}), 401

    data = request.get_json()
    password = data.get("password")

    if not password:
        return jsonify({"success": False, "message": "Şifre gerekli."}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        # sadece giriş yapmış kişinin şifresi kontrol ediliyor
        cursor.execute("SELECT password FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        conn.close()

        if row and row[0] == password:
            return jsonify({"success": True}), 200
        else:
            return jsonify({"success": False, "message": "Şifre hatalı."}), 401

    except Exception as e:
        print("DB error:", e)
        return jsonify({"success": False, "message": "Sunucu hatası."}), 500

@app.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")

        if not username or not password:
            return jsonify({"success": False, "message": "Kullanıcı adı veya şifre boş."}), 400

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", (username,))
        if cursor.fetchone():
            conn.close()
            return jsonify({"success": False, "message": "Bu kullanıcı adı zaten kullanılıyor."}), 409

        cursor.execute("INSERT INTO users (username, password) VALUES (?, ?)", (username, password))
        user_id = cursor.lastrowid  # Eklenen kullanıcının ID'si
        conn.commit()
        conn.close()

        session["user_id"] = user_id  # Otomatik giriş işlemi

        return jsonify({"success": True, "message": "Kayıt başarılı. Giriş yapıldı."})

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500

    
@app.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json()
        username = data.get("username")
        password = data.get("password")

        if not username or not password:
            return jsonify({"success": False, "message": "Kullanıcı adı veya şifre boş."}), 400

        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ? AND password = ?", (username, password))
        user = cursor.fetchone()
        conn.close()

        if user:
            session["user_id"] = user[0]  
            return jsonify({"success": True, "message": "Giriş başarılı"})
        else:
            return jsonify({"success": False, "message": "Kullanıcı adı veya şifre yanlış."}), 401

    except Exception as e:
        return jsonify({"success": False, "message": f"Hata: {str(e)}"}), 500

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()  
    return jsonify({"success": True, "message": "Çıkış yapıldı."})


print("Starting Liver Fibrosis Prediction API...")
init_db()
app.run(debug=True, port=5001)

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react_app(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return app.send_static_file(path)
    else:
        return app.send_static_file("index.html")