import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Markdown from "markdown-to-jsx";
import PersonalInfoBar2 from "../components/PersonalInfoBar2";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const HastaGecmisPage = () => {
  const location = useLocation();
  const { tc } = location.state || { tc: null };
  const [raporlar, setRaporlar] = useState([]);
  const [evreData, setEvreData] = useState([]);
  const [kanData, setKanData] = useState([]);
  const [expandedIndex, setExpandedIndex] = useState(null); // 👈 hangi rapor açık?
  const [hasta, setHasta] = useState(null); 

  const navigate = useNavigate();

  useEffect(() => {
  if (tc) {
    fetch(`${process.env.REACT_APP_API_URL}/patients/${tc}`)
      .then((res) => res.json())
      .then((data) => setHasta(data))
      .catch((err) => console.error("Hasta bilgisi çekme hatası:", err));

    fetch(`${process.env.REACT_APP_API_URL}/get_reports/${tc}`)
      .then((res) => res.json())
      .then((data) => {
        const reports = data.reports || [];
        setRaporlar(reports);
  fetch(`${process.env.REACT_APP_API_URL}/lab_values/${tc}`)
    .then((res) => res.json())
    .then((data) => {
      const labValues = data.lab_values || [];
      // Tarihe göre sıralama (eski → yeni)
      labValues.sort((a, b) => new Date(a.tarih) - new Date(b.tarih));

      // Backend verisini grafik formatına uygun hale getir
      const formattedLabValues = labValues.map(item => ({
        tarih: new Date(item.tarih).toLocaleString("tr-TR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }),
        AST: item.AST,
        ALT: item.ALT,
        ALP: item.ALP,
        Protein: item.Protein,
        "AG Oranı": item.AG_Ratio,
        "Total Bilirubin": item.Total_Bilirubin,
        "Direkt Bilirubin": item.Direkt_Bilirubin,
        Albumin: item.Albumin,
      }));

      setKanData(formattedLabValues);
    })
    .catch((err) => console.error("Kan değerleri çekilemedi:", err));

        // Evre verisini raporlardan çıkar ve sırala
        const evreNumeric = {
          F0: 0,
          F1: 1,
          F2: 2,
          F3: 3,
          F4: 4,
        };

        const evreItems = reports
          .filter((r) => r.evre && evreNumeric.hasOwnProperty(r.evre))
          .map((r) => ({
            tarih: new Date(r.created_at).toLocaleString("tr-TR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          }),
            evre: evreNumeric[r.evre],
          }))
          .sort((a, b) => new Date(a.tarih) - new Date(b.tarih));


        setEvreData(evreItems);
      })
      .catch((err) => console.error("Rapor getirme hatası:", err));
  }
}, [tc]);


  const toggleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };


  const evreLabels = {
    0: "F0",
    1: "F1",
    2: "F2",
    3: "F3",
    4: "F4",
  };

 

  const renkler = {
    AST: "#1f77b4",
    ALT: "#ff7f0e",
    ALP: "#2ca02c",
    Protein: "#d62728",
    "AG Oranı": "#9467bd",
    "Total Bilirubin": "#8c564b",
    "Direkt Bilirubin": "#e377c2",
    Albumin: "#7f7f7f",
  };

  return (
    <div style={styles.page}>
      <div style={styles.navbar}>
        <h2 style={styles.navTitle}>Doktor Paneli</h2>
      </div>

      <div style={styles.content}>
        <h2 style={styles.header}>Geçmiş Sonuçlar</h2>
        <h4 style={styles.subHeader}>Hasta TC: {tc || "TC bulunamadı"}</h4>
        <h4 style={styles.subHeader}>
          Ad Soyad: <span className="notranslate">{hasta ? `${hasta.name} ${hasta.surname}` : "Bilinmiyor"}</span>
        </h4>



        <div style={styles.chartsRow}>
          <div style={styles.chartBoxSmall}>
            <h3 style={styles.chartTitle}>Evre Değişimi</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={[...evreData].reverse()}>
                <CartesianGrid stroke="#ccc" horizontal vertical={false} />
                <XAxis dataKey="tarih" />
                <YAxis
                  type="number"
                  domain={[0, 4]}
                  ticks={[0, 1, 2, 3, 4]}
                  tickFormatter={(tick) => evreLabels[tick] || ""}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => evreLabels[value] || value}
                  labelFormatter={(label) => `Tarih: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="evre"
                  stroke="#007bff"
                  strokeWidth={3}
                  dot={{ r: 6 }}
                  activeDot={{ r: 8 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div style={styles.chartBoxLarge}>
            <h3 style={styles.chartTitle}>Kan Değerleri</h3>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={kanData}>
                <CartesianGrid stroke="#ccc" />
                <XAxis dataKey="tarih" />
                <YAxis />
                <Tooltip />
                <Legend verticalAlign="top" height={36} />
                {Object.keys(renkler).map((key) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={renkler[key]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.reportContainer}>
          {raporlar.length === 0 ? (
            <p>Bu hastaya ait geçmiş rapor bulunamadı.</p>
          ) : (
            raporlar.map((rapor, index) => {
              const isOpen = expandedIndex === index;
              return (
                <div
                  key={index}
                  style={{
                    ...styles.reportCard,
                    cursor: "pointer",
                    backgroundColor: isOpen ? "#eaf3fc" : "white",
                  }}
                  onClick={() => toggleExpand(index)}
                >
                  <p style={styles.timestamp}>
                    📅 {new Date(rapor.created_at).toLocaleString()}
                  </p>

                  {isOpen && (
                    <div style={styles.markdown}>
                      <p>
                        <strong>Rapor:</strong> {rapor.report_name}
                      </p>
                      <p>
                        <strong>Tahmin:</strong>
                      </p>
                      <Markdown options={{ forceBlock: true }}>
                        {rapor.prediction_result}
                      </Markdown>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    fontFamily: "sans-serif",
    backgroundColor: "#f4f6f8",
    minHeight: "100vh",
    width: "100vw",
    overflowX: "hidden",
  },
  navbar: {
    backgroundColor: "#213448",
    padding: "20px",
    color: "white",
    textAlign: "center",
  },
  navTitle: {
    margin: 0,
    fontSize: "26px",
  },
  content: {
    padding: "30px",
  },
  header: {
    fontSize: "22px",
    color: "#213448",
    marginBottom: "20px",
  },
  subHeader: {
    fontSize: "18px",
    color: "#555",
    marginBottom: "10px",
  },
  reportContainer: {
    marginTop: "20px",
  },
  reportCard: {
    borderRadius: "10px",
    padding: "15px",
    marginBottom: "15px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.1)",
    transition: "background-color 0.3s ease",
  },
  timestamp: {
    fontWeight: "bold",
    fontSize: "16px",
    color: "#213448",
    marginBottom: "5px",
  },
  markdown: {
    marginTop: "10px",
    color: "#333",
    fontSize: "15px",
    lineHeight: "1.6",
  },
  chartsRow: {
    display: "flex",
    gap: "30px",
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 40,
  },
  chartBoxSmall: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    height: 470,
    flex: "1 1 400px",
    minWidth: 300,
    display: "flex",
    flexDirection: "column",
    justifyContent: "flex-start",
  },
  chartBoxLarge: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 20,
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    height: 470,
    flex: "2 1 400px",
    minWidth: 400,
  },
  chartTitle: {
    color: "#213448",
    fontSize: 22,
    marginBottom: 16,
    textAlign: "center",
  },
  reportHeader: {
    fontSize: 22,
    color: "#213448",
    marginBottom: 20,
  },
  reportBox: {
    backgroundColor: "#ffffff",
    padding: 20,
    marginBottom: 20,
    borderRadius: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
  },
  reportTitle: {
    marginBottom: 10,
    fontSize: 18,
    color: "#2c3e50",
  },
};

export default HastaGecmisPage;