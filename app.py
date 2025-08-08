import os
import pickle
import sqlite3
import base64
from functools import lru_cache
from flask import Flask, request, jsonify, session
from flask_cors import CORS
import numpy as np
import pandas as pd
from PIL import Image
import pdfplumber
import requests
import tensorflow as tf
from tensorflow.keras import backend as K

# ---------------- CONFIG ---------------- #
RF_MODEL_PATH = "rf_model.pkl"
SCALER_PATH = "scaler.pkl"
CNN_MODEL_PATH = "cnn_model.h5"

API_KEY = os.environ.get("API_KEY", "")
API_KEY2 = os.environ.get("API_KEY2", "")

class_labels = ['F0', 'F1', 'F2', 'F3', 'F4']
DB_PATH = "users.db"

app = Flask(__name__, static_folder='build', static_url_path='')
app.secret_key = os.environ.get("SECRET_KEY", "super-secret-key")
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# ---------------- DB INIT ---------------- #
def init_db():
    if not os.path.exists(DB_PATH):
        conn = sqlite3.connect(DB_PATH)
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
            )
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS doctor_patient (
                doctor_id INTEGER,
                patient_id INTEGER,
                PRIMARY KEY (doctor_id, patient_id),
                FOREIGN KEY (doctor_id) REFERENCES users(id),
                FOREIGN KEY (patient_id) REFERENCES patients(id)
            )
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
            ("erva.ergul", "123456"), ("busra.inan", "123456"), ("ege.kuzu", "123456"),
            ("kevser.semiz", "123456"), ("helin.ozalkan", "123456"), ("sumeyye.agir", "123456"),
            ("efe.kesler", "123456"), ("devran.sahin", "123456"), ("cengizhan.karaman", "123456"),
            ("enes.coban", "123456"), ("kerem.guney", "123456"),
        ]
        cursor.executemany("INSERT INTO users (username, password) VALUES (?, ?)", sample_users)
        conn.commit()
        conn.close()

# ---------------- MODEL LOADERS ---------------- #
def load_scaler():
    with open(SCALER_PATH, "rb") as f:
        return pickle.load(f)

def load_rf_model():
    with open(RF_MODEL_PATH, "rb") as f:
        return pickle.load(f)

def load_cnn_model():
    return tf.keras.models.load_model(CNN_MODEL_PATH)

# ---------------- HELPERS ---------------- #
def get_vlm_analysis(image_path):
    try:
        with open(image_path, "rb") as img_file:
            base64_image = base64.b64encode(img_file.read()).decode("utf-8")

        prompt = [
            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}},
            {"type": "text", "text": "Sen bir tıp uzmanısın. Ultrason görüntüsünü analiz et..."}
        ]

        headers = {
            "Authorization": f"Bearer {API_KEY2}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": "mistralai/mistral-small-3.2-24b-instruct:free",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
            "temperature": 0.7,
        }

        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            json=payload,
            headers=headers
        )

        if response.status_code == 200:
            return response.json()["choices"][0]["message"]["content"]
        else:
            return f"VLM response failed ({response.status_code})."

    except Exception as e:
        return f"VLM analysis error: {str(e)}"

# ---------------- ROUTES ---------------- #
@app.route("/")
def home():
    return "Liver Fibrosis Prediction API is running!"

@app.route("/predict", methods=["POST"])
def predict():
    try:
        data = request.form
        input_vals = [
            float(data["Total_Bilirubin"]), float(data["Direct_Bilirubin"]),
            float(data["ALP"]), float(data["ALT"]), float(data["AST"]),
            float(data["Proteins"]), float(data["Albumin"]), float(data["AG_Ratio"]),
        ]

        image = request.files.get("image", None)
        if image is None:
            return jsonify({"error": "Ultrasound image is required."}), 400

        image_path = "temp_image.jpg"
        image.save(image_path)

        # Clinical prediction
        df_input = pd.DataFrame([input_vals], columns=[
            'Total Bilirubin', 'Direct Bilirubin',
            'Alkphos Alkaline Phosphotase', 'Sgpt Alamine Aminotransferase',
            'Sgot Aspartate Aminotransferase', 'Total Protiens',
            'ALB Albumin', 'A/G Ratio Albumin and Globulin Ratio'
        ])

        scaler = load_scaler()
        rf_model = load_rf_model()
        scaled_input = scaler.transform(df_input)
        clinic_prediction = rf_model.predict(scaled_input)[0]

        # CNN prediction
        img = Image.open(image_path).convert("RGB").resize((128, 128))
        img_array = np.expand_dims(np.array(img) / 255.0, axis=0)
        cnn_model = load_cnn_model()
        predictions = cnn_model.predict(img_array)
        predicted_class = class_labels[np.argmax(predictions)]
        confidence = float(np.max(predictions) * 100)

        # Cleanup TensorFlow model
        del cnn_model
        K.clear_session()

        # LLM explanation
        llm_prompt = f"""
        ### Yapay Zeka Tahminleri:
        Klinik Model: {clinic_prediction}
        CNN Model: {predicted_class} ({confidence:.2f}% güven)
        """
        headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
        llm_payload = {"model": "openai/gpt-4o", "messages": [{"role": "user", "content": llm_prompt}], "max_tokens": 1000}
        llm_response = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=llm_payload)

        if llm_response.status_code == 200:
            llm_explanation = llm_response.json()["choices"][0]["message"]["content"]
        else:
            llm_explanation = "LLM request failed."

        vlm_explanation = get_vlm_analysis(image_path)

        os.remove(image_path)

        return jsonify({
            "clinic_result": int(clinic_prediction),
            "image_result": predicted_class,
            "confidence": round(confidence, 2),
            "llm_explanation": llm_explanation,
            "vlm_explanation": vlm_explanation
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ---------------- STATIC FILE HANDLING ---------------- #
@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve_react_app(path):
    if path != "" and os.path.exists(os.path.join(app.static_folder, path)):
        return app.send_static_file(path)
    else:
        return app.send_static_file("index.html")

# ---------------- ENTRY POINT ---------------- #
if __name__ == "__main__":
    print("Starting Liver Fibrosis Prediction API...")
    init_db()
    app.run(host="0.0.0.0", port=5000)
