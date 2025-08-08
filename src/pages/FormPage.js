// KVKK uyumlu form dosyası (FormPage.js)
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import PersonalInfoBar from "../components/PersonalInfoBar";
import "./FormPage.css";
import Chatbot from "../components/Chatbot";
import LoadingSpinner from "../components/LoadingSpinner";
import { data } from "./data";

// TC Kimlik No doğrulama fonksiyonu
const isValidTC = (tc) => {
  if (!/^\d{11}$/.test(tc)) return false;
  if (tc[0] === "0") return false;

  const digits = tc.split("").map(Number);
  const sumOdd = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const sumEven = digits[1] + digits[3] + digits[5] + digits[7];
  const digit10 = ((sumOdd * 7) - sumEven) % 10;
  if (digit10 !== digits[9]) return false;

  const total = digits.slice(0, 10).reduce((a, b) => a + b, 0);
  const digit11 = total % 10;
  if (digit11 !== digits[10]) return false;

  return true;
};

// Ortak Field bileşeni
const Field = ({ label, value, onChange, type = "text" }) => (
  <div style={{ display: "flex", flexDirection: "column", minWidth: "150px" }}>
    <label
      style={{
        marginBottom: "5px",
        fontWeight: "bold",
        fontSize: "15px",
        color: "#547792",
        fontFamily: "'Poppins', sans-serif",
      }}
    >
      {label}
    </label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: "8px",
        borderRadius: "4px",
        border: "none",
        boxShadow: "5px 5px 5px rgba(33, 52, 72, 0.51)",
        fontSize: "14px",
        width: "150px",
        outline: "none",
      }}
      placeholder={`${label} giriniz`}
      step={type === "number" ? "any" : undefined}
      inputMode={type === "number" ? "numeric" : undefined}
      pattern={type === "number" ? "\\d*" : undefined}
    />
  </div>
);

const FormPage = ({ onLogout, onFormSubmit }) => {
  const navigate = useNavigate();

  const [tc, setTc] = useState("");
  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");

  const [ast, setAst] = useState("");
  const [alt, setAlt] = useState("");
  const [alp, setAlp] = useState("");
  const [totalBilirubin, setTotalBilirubin] = useState("");
  const [directBilirubin, setDirectBilirubin] = useState("");
  const [albumin, setAlbumin] = useState("");
  const [agRatio, setAgRatio] = useState("");
  const [proteins, setProteins] = useState("");

  const [ultrasoundFile, setUltrasoundFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [kanDegeriDosyasi, setKanDegeriDosyasi] = useState(null);
  const [loading, setLoading] = useState(false);

  const [vlmOutput, setVlmOutput] = useState("");
  const [vlmLoading, setVlmLoading] = useState(false);

  // Use env var for base API URL; fallback to localhost for development if not set.
  const API_URL = (process.env.REACT_APP_API_URL || "http://localhost:5001").replace(/\/$/, "");

  // Görsel yüklendiğinde VLM ön-analizi çağrısı
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setUltrasoundFile(file);
      setSelectedImage(URL.createObjectURL(file));

      const formData = new FormData();
      formData.append("Total_Bilirubin", totalBilirubin || "0");
      formData.append("Direct_Bilirubin", directBilirubin || "0");
      formData.append("ALP", alp || "0");
      formData.append("ALT", alt || "0");
      formData.append("AST", ast || "0");
      formData.append("Albumin", albumin || "0");
      formData.append("AG_Ratio", agRatio || "0");
      formData.append("Proteins", proteins || "0");
      formData.append("image", file);

      try {
        setVlmLoading(true);
        const response = await fetch(`${API_URL}/predict`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const text = await response.text().catch(() => null);
          throw new Error(text || "VLM API çağrısı başarısız.");
        }

        const result = await response.json();
        setVlmOutput(result.vlm_explanation || "VLM çıktısı boş.");
      } catch (error) {
        setVlmOutput("VLM hatası: " + (error.message || error));
      } finally {
        setVlmLoading(false);
      }
    }
  };

  // PDF yüklendiğinde laboratuvar verilerini parse eden backend çağrısı
  const handleKanDegeriUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setKanDegeriDosyasi(file);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`${API_URL}/parse`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => null);
        throw new Error(text || "PDF dosyası okunamadı.");
      }

      const result = await response.json();

      console.log("Backend'den gelen sonuç:", result);

      // Backend hangi alanları dönerse ona göre atama yap
      setAst(result.ast ?? result.AST ?? "");
      setAlt(result.alt ?? result.ALT ?? "");
      setAlp(result.alp ?? result.ALP ?? "");
      setTotalBilirubin(result.totalBilirubin ?? result.Total_Bilirubin ?? "");
      setDirectBilirubin(result.directBilirubin ?? result.Direkt_Bilirubin ?? "");
      setAlbumin(result.albumin ?? result.Albumin ?? "");
      setProteins(result.proteins ?? result.Protein ?? "");
      setAgRatio(result.agRatio ?? result.AG_Ratio ?? "");

      // Debug
      console.log("AST:", result.ast ?? result.AST);
      console.log("ALT:", result.alt ?? result.ALT);
      console.log("ALP:", result.alp ?? result.ALP);
      console.log("Total Bilirubin:", result.totalBilirubin ?? result.Total_Bilirubin);
      console.log("Direct Bilirubin:", result.directBilirubin ?? result.Direkt_Bilirubin);
      console.log("Albumin:", result.albumin ?? result.Albumin);
    } catch (error) {
      console.error("PDF işlenemedi:", error);
      alert("PDF işlenemedi: " + (error.message || error));
    }
  };

  // Form submit: önce lab_values kaydı sonra predict çağrısı
  const handleSubmit = async () => {
    if (!isValidTC(tc)) {
      alert("Geçerli bir T.C. Kimlik numarası giriniz.");
      return;
    }

    if (!ultrasoundFile) {
      alert("Lütfen bir ultrason görüntüsü yükleyin.");
      return;
    }

    setLoading(true);

    try {
      // Kaydetme (lab_values)
      const labResponse = await fetch(`${API_URL}/lab_values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tc,
          tarih: new Date().toISOString(),
          AST: ast ? Number(ast) : null,
          ALT: alt ? Number(alt) : null,
          ALP: alp ? Number(alp) : null,
          Protein: proteins ? Number(proteins) : null,
          AG_Ratio: agRatio ? Number(agRatio) : null,
          Total_Bilirubin: totalBilirubin ? Number(totalBilirubin) : null,
          Direkt_Bilirubin: directBilirubin ? Number(directBilirubin) : null,
          Albumin: albumin ? Number(albumin) : null,
        }),
      });

      if (!labResponse.ok) {
        const text = await labResponse.text().catch(() => null);
        throw new Error(text || "Laboratuvar verisi kaydedilemedi.");
      }

      // Predict çağrısı (tam form)
      const formData = new FormData();
      formData.append("Total_Bilirubin", totalBilirubin || "0");
      formData.append("Direct_Bilirubin", directBilirubin || "0");
      formData.append("ALP", alp || "0");
      formData.append("ALT", alt || "0");
      formData.append("AST", ast || "0");
      formData.append("Proteins", proteins || "0");
      formData.append("Albumin", albumin || "0");
      formData.append("AG_Ratio", agRatio || "0");
      formData.append("image", ultrasoundFile);

      const predictResponse = await fetch(`${API_URL}/predict`, {
        method: "POST",
        body: formData,
      });

      if (!predictResponse.ok) {
        const text = await predictResponse.text().catch(() => null);
        throw new Error(text || "Tahmin API çağrısı başarısız.");
      }

      const result = await predictResponse.json();

      setLoading(false);

      // Yönlendir ve state ilet
      navigate("/result", {
        state: {
          tc,
          name,
          surname,
          age,
          gender,
          labValues: {
            Total_Bilirubin: totalBilirubin,
            Direct_Bilirubin: directBilirubin,
            ALP: alp,
            ALT: alt,
            AST: ast,
            Proteins: proteins,
            Albumin: albumin,
            AG_Ratio: agRatio,
          },
          ultrasoundImage: selectedImage,
          prediction: result.clinic_result,
          imagePrediction: result.image_result,
          confidence: result.confidence,
          llmExplanation: result.llm_explanation,
        },
      });
    } catch (error) {
      setLoading(false);
      console.error(error);
      alert("Tahmin sırasında bir hata oluştu: " + (error.message || error));
    }
  };

  return (
    <div>
      <PersonalInfoBar onLogout={onLogout} />
      <Chatbot />
      <div className="formpage-container">
        <div className="formpage-image-section">
          <h2 className="formpage-title">Ultrason Görüntüsü</h2>
          <div
            className="formpage-image-box clickable-image-box"
            onClick={() => document.getElementById("imageUpload").click()}
          >
            {selectedImage ? (
              <img src={selectedImage} alt="Ultrason" className="formpage-ultrasound-img" />
            ) : (
              <img src="/images/image.png" alt="img" style={{ width: "100px", height: "100px" }} />
            )}
          </div>
          <input
            id="imageUpload"
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            style={{ display: "none" }}
            disabled={loading}
          />

          <h2 className="formpage-title">Ultrason Ön Yorumu</h2>
          <div
            className="vlmcikti"
            style={{
              marginTop: "28px",
              width: "100%",
              maxWidth: "570px",
              padding: "16px",
              backgroundColor: "#f9f4ec",
              border: "2px solid #c6b08c",
              borderRadius: "10px",
              boxShadow: "0 4px 12px #A08963",
              fontFamily: "Poppins, sans-serif",
              color: "#213448",
              textAlign: "left",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "flex-start",
              overflow: "hidden",
              margin: "0 0 20px 30px",
              transition: "transform 0.3s ease, box-shadow 0.3s ease",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {vlmLoading ? "🔄 Görsel analiz ediliyor, lütfen bekleyin..." : (vlmOutput || "Henüz çıktı alınmadı.")}
          </div>
        </div>

        <div className="formpage-info-section">
          <h2 className="formpage-title">Hasta Bilgileri</h2>
          <div className="patient-info-container">
            <div className="formpage-fields-row">
              <Field
                label="T.C."
                value={tc}
                onChange={(val) => {
                  if (/^\d*$/.test(val)) setTc(val);
                }}
              />
              <Field
                label="İsim"
                value={name}
                onChange={(val) => {
                  if (/^[a-zA-ZçÇğĞıİöÖşŞüÜ\s]*$/.test(val)) setName(val);
                }}
              />
              <Field
                label="Soyisim"
                value={surname}
                onChange={(val) => {
                  if (/^[a-zA-ZçÇğĞıİöÖşŞüÜ\s]*$/.test(val)) setSurname(val);
                }}
              />
              <Field
                label="Yaş"
                value={age}
                onChange={(val) => {
                  if (/^\d*$/.test(val)) setAge(val);
                }}
                type="number"
              />

              <div style={{ display: "flex", flexDirection: "column", minWidth: "150px" }}>
                <label
                  style={{
                    marginBottom: "5px",
                    fontWeight: "bold",
                    fontSize: "15px",
                    color: "#547792",
                    fontFamily: "Poppins, sans-serif",
                  }}
                >
                  Cinsiyet
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  style={{
                    padding: "8px",
                    borderRadius: "4px",
                    border: "none",
                    boxShadow: "5px 5px 5px rgba(33, 52, 72, 0.51)",
                    fontSize: "14px",
                    width: "150px",
                    outline: "none",
                    fontFamily: "Poppins, sans-serif",
                  }}
                  disabled={loading}
                >
                  <option value="">Seçiniz</option>
                  <option value="Kadın">Kadın</option>
                  <option value="Erkek">Erkek</option>
                  <option value="Diğer">Diğer</option>
                </select>
              </div>
            </div>
          </div>

          <h2 className="formpage-title">Kan Değerleri</h2>
          <div className="lab-values-container">
            <div style={{ marginBottom: "15px" }}>
              <button
                style={{
                  backgroundColor: "#213448",
                  color: "white",
                  padding: "0px 15px",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "16px",
                  fontWeight: "400",
                  boxShadow: "0 4px 8px rgba(33, 52, 72, 0.3)",
                  transition: "all 0.3s ease",
                }}
                onClick={() => document.getElementById("kanDegeriUpload").click()}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "#304a6e";
                  e.currentTarget.style.transform = "scale(1.05)";
                  e.currentTarget.style.boxShadow = "0 6px 12px rgba(33, 52, 72, 0.5)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#213448";
                  e.currentTarget.style.transform = "scale(1)";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(33, 52, 72, 0.3)";
                }}
                disabled={loading}
              >
                <img
                  src="/images/pdf.png"
                  alt="PDF"
                  style={{ width: "30px", height: "30px", marginRight: "5px", marginTop: "15px" }}
                />
                PDF Olarak Yükle
              </button>

              <input
                id="kanDegeriUpload"
                type="file"
                accept="application/pdf"
                style={{ display: "none" }}
                onChange={handleKanDegeriUpload}
                disabled={loading}
              />

              {kanDegeriDosyasi && (
                <span style={{ marginLeft: 10, fontSize: "14px" }}>{kanDegeriDosyasi.name}</span>
              )}

              <p style={{ color: "#913025ff", fontSize: "13px", marginTop: "8px", fontFamily: "Poppins, sans-serif" }}>
                *Kan değerlerini içeren PDF dosyasını yüklerseniz, manuel veri girişine gerek kalmaz. Sistem otomatik olarak değerleri algılar.
              </p>
            </div>

            <div className="formpage-fields-row">
              <Field label="AST" value={ast} onChange={setAst} type="number" />
              <Field label="ALT" value={alt} onChange={setAlt} type="number" />
              <Field label="ALP" value={alp} onChange={setAlp} type="number" />
              <Field label="Protein" value={proteins} onChange={setProteins} type="number" />
              <Field label="AG Oranı" value={agRatio} onChange={setAgRatio} type="number" />
              <Field label="Total Bilirubin" value={totalBilirubin} onChange={setTotalBilirubin} type="number" />
              <Field label="Direkt Bilirubin" value={directBilirubin} onChange={setDirectBilirubin} type="number" />
              <Field label="Albumin" value={albumin} onChange={setAlbumin} type="number" />
            </div>
          </div>

          <button onClick={handleSubmit} className="formpage-submit-btn" disabled={loading}>
            Tahmin Et
          </button>

          {loading && <LoadingSpinner />}
        </div>
      </div>
    </div>
  );
};

export default FormPage;
