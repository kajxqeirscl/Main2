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
      step={type === "number" ? "1" : undefined}
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
        const response = await fetch(`${process.env.REACT_APP_API_URL}/predict`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error("VLM API çağrısı başarısız.");
        const result = await response.json();

        setVlmOutput(result.vlm_explanation || "VLM çıktısı boş.");
      } catch (error) {
        setVlmOutput("VLM hatası: " + error.message);
      } finally {
        setVlmLoading(false);
      }
    }
  };

  const handleKanDegeriUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      setKanDegeriDosyasi(file);
      const formData = new FormData();
      formData.append("file", file);

      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/parse`, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) throw new Error("PDF dosyası okunamadı.");
        const result = await response.json();

        console.log("Backend'den gelen sonuç:", result);

        setAst(result.ast || "");
        setAlt(result.alt || "");
        setAlp(result.alp || "");
        setTotalBilirubin(result.totalBilirubin || "");
        setDirectBilirubin(result.directBilirubin || "");
        setAlbumin(result.albumin || "");
      } catch (error) {
        console.error("PDF işlenemedi:", error);
        alert("PDF işlenemedi: " + error.message);
      }
    }
  };

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
      const labResponse = await fetch(`${process.env.REACT_APP_API_URL}/lab_values`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tc,
          tarih: new Date().toISOString(),
          AST: Number(ast) || null,
          ALT: Number(alt) || null,
          ALP: Number(alp) || null,
          Protein: Number(proteins) || null,
          AG_Ratio: Number(agRatio) || null,
          Total_Bilirubin: Number(totalBilirubin) || null,
          Direkt_Bilirubin: Number(directBilirubin) || null,
          Albumin: Number(albumin) || null
        }),
      });

      if (!labResponse.ok) throw new Error("Laboratuvar verisi kaydedilemedi.");

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

      const predictResponse = await fetch(`${process.env.REACT_APP_API_URL}/predict`, {
        method: "POST",
        body: formData,
      });

      if (!predictResponse.ok) throw new Error("Tahmin API çağrısı başarısız.");
      const result = await predictResponse.json();

      setLoading(false);

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
      alert("Tahmin sırasında bir hata oluştu: " + error.message);
    }
  };

  return (
    <div>
      <PersonalInfoBar onLogout={onLogout} />
      <Chatbot />
      <div className="formpage-container">
        {/* ...rest of your JSX remains unchanged */}
      </div>
    </div>
  );
};

export default FormPage;
