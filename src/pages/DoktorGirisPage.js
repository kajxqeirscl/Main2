import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, LabelList } from "recharts";
import { useNavigate, useLocation } from "react-router-dom";
import PersonalInfoBar2 from "../components/PersonalInfoBar2";
import { FaTrash } from "react-icons/fa";

const DoktorGirisPage = () => {
  const [hastalar, setHastalar] = useState([]);
  const [tc, setTc] = useState("");
  const [notlar, setNotlar] = useState([]);

  const navigate = useNavigate();
  const location = useLocation();

  // Sayfa açılınca localStorage'dan notları yükle
  useEffect(() => {
    const kayitliNotlar = localStorage.getItem("notlar");
    if (kayitliNotlar) {
      setNotlar(JSON.parse(kayitliNotlar));
    }
  }, []);

  // Hastaları çek
  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/patients`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHastalar(data);
        } else {
          setHastalar([]);
          console.error("Beklenmeyen data formatı:", data);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  // Yeni not eklendiğinde location.state ile geldiyse ekle ve kaydet
  useEffect(() => {
    if (location.state?.yeniNot) {
      const yeni = location.state.yeniNot;
      const guncelNotlar = [yeni, ...notlar];
      setNotlar(guncelNotlar);
      localStorage.setItem("notlar", JSON.stringify(guncelNotlar));
      window.history.replaceState({}, document.title);
    }
  }, [location.state, notlar]);

  const handleSearch = () => {
    const hasta = hastalar.find((h) => h.tc === tc.trim());
    if (hasta) {
      navigate("/hasta-gecmis", {
        state: {
          tc: hasta.tc,
          adSoyad: `${hasta.ad} ${hasta.soyad}`,
        },
      });
    } else {
      alert("TC bulunamadı!");
    }
  };

  const evreler = ["F0", "F1", "F2", "F3", "F4"];
  const rawData = evreler
    .map((evre) => ({
      name: evre,
      value: hastalar.filter((h) => h.evre === evre).length,
    }))
    .filter((item) => item.value > 0);

  const total = rawData.reduce((sum, item) => sum + item.value, 0);
  const data = rawData.map((item) => ({
    ...item,
    percent: total === 0 ? 0 : ((item.value / total) * 100).toFixed(1),
  }));

  const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#AB47BC"];

  const renderOuterLabel = ({ cx, cy, midAngle, outerRadius, name, value }) => {
    const RADIAN = Math.PI / 180;
    const radius = outerRadius + 20;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text
        x={x}
        y={y}
        fill="#333"
        textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        style={{ fontSize: "13px" }}
      >
        {`${name} (${value})`}
      </text>
    );
  };

  const renderInnerPercentage = ({
    cx,
    cy,
    midAngle,
    innerRadius,
    outerRadius,
    percent,
  }) => {
    const RADIAN = Math.PI / 180;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);

    return (
      <text
        x={x}
        y={y}
        fill="white"
        textAnchor="middle"
        dominantBaseline="central"
        style={{ fontSize: "13px", fontWeight: "bold" }}
      >
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  // Not silme fonksiyonu
  const notSil = (index) => {
    const yeniNotlar = [...notlar];
    yeniNotlar.splice(index, 1);
    setNotlar(yeniNotlar);
    localStorage.setItem("notlar", JSON.stringify(yeniNotlar));
  };

  return (
    <div style={styles.page}>
      <PersonalInfoBar2 onLogout={() => navigate("/")} />
      {/* Hasta Arama: Üstte yatay ince kutu */}
      <div style={styles.hastaAramaBar}>
        <h2 style={{ color: "#213448", marginLeft: "650px", marginTop: "-30px" }}>
          🔍 Hasta Arama
        </h2>
        <div style={styles.centeredSearchBox}>
          <input
            type="text"
            placeholder="TC Kimlik Numarası"
            value={tc}
            onChange={(e) => setTc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            style={styles.tcInput}
          />
          <button onClick={handleSearch} style={styles.tcButton}>
            Ara
          </button>
        </div>
      </div>

      {/* 3 Ana Kutu */}
      <div style={styles.gridTop}>
        {/* Kayıtlı Hasta */}
        <div style={styles.squareCard}>
          <div style={styles.centeredContent}>
            <div style={styles.sayac}>{hastalar.length}</div>
            <h3 style={{ ...styles.centeredTitle, marginTop: "10px" }}>Kayıtlı Hasta</h3>
            <button
              style={styles.hastaButton}
              onClick={() => navigate("/hasta-listesi")}
            >
              Tüm Hastaları Gör
            </button>
          </div>
        </div>

        {/* Evrelere Göre Dağılım */}
        <div style={styles.squareCard}>
          <h3 style={styles.centeredTitle2}>Evrelere Göre Dağılım</h3>
          <div style={styles.graphContainer}>
            <PieChart width={300} height={250}>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={0}
                outerRadius={90}
                labelLine={false}
                label={renderOuterLabel}
                dataKey="value"
                onClick={(data) => {
                  navigate("/evre-detay", {
                    state: { evre: data.name },
                  });
                }}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}

                <LabelList content={renderInnerPercentage} />
              </Pie>
            </PieChart>

            <div style={styles.legendList}>
              {data.map((entry, index) => (
                <div key={index} style={styles.legendItem}>
                  <span
                    style={{
                      ...styles.legendColor,
                      backgroundColor: COLORS[index % COLORS.length],
                    }}
                  ></span>
                  {`${entry.name} (%${entry.percent})`}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notlar */}
        <div style={styles.squareCard}>
          <h3 style={styles.cardTitle}>📝 Notlar</h3>
          <div style={styles.notesContainer}>
            {notlar.length === 0 ? (
              <p style={{ color: "#666" }}>Henüz not eklenmemiş.</p>
            ) : (
              notlar.map((not, index) => (
                <div
                  key={index}
                  style={{
                    position: "relative",
                    marginBottom: "30px",
                    cursor: "pointer",
                    paddingRight: "25px",
                  }}
                  onClick={() => navigate("/not-detay", { state: { not } })}
                >
                  <strong>{not.baslik}</strong>
                  <div style={{ fontSize: "12px", color: "#777" }}>{not.tarih}</div>
                  <FaTrash
                    onClick={(e) => {
                      e.stopPropagation(); // tıklamanın not detayına gitmesini engelle
                      notSil(index);
                    }}
                    style={{
                      position: "absolute",
                      top: "5px",
                      right: "5px",
                      color: "#213448",
                      cursor: "pointer",
                    }}
                  />
                </div>
              ))
            )}
          </div>
          <button
            style={styles.buttonSmall}
            onClick={() => navigate("/not-ekle")}
          >
            + Yeni Not Ekle
          </button>
        </div>
      </div>
    </div>
  );
};

const styles = {
  page: {
    fontFamily: "sans-serif",
    background: "linear-gradient(135deg, #e3d1b5ff 0%, #dce1e7 100%)",
    minHeight: "100vh",
    width: "100vw",
    overflowX: "hidden",
  },
  hastaAramaBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#edebebff",
    borderRadius: "20px",
    border: "3px solid #A08963",
    padding: "45px 60px",
    margin: "30px",
    boxShadow: "0 12px 24px rgba(232, 224, 211, 0.3)",
    flexWrap: "wrap",
    marginLeft: "41px",
    marginRight: "41px",
  },
  centeredSearchBox: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginRight: "450px",
    marginLeft: "500px",
    marginTop: "10px",
  },
  tcInput: {
    padding: "10px",
    fontSize: "16px",
    border: "1.5px solid #A08963",
    borderRadius: "8px",
    width: "400px",
  },
  tcButton: {
    padding: "10px 20px",
    backgroundColor: "#213448",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
  },
  gridTop: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "20px",
    padding: "20px",
  },
  squareCard: {
    backgroundColor: "#edebebff",
    borderRadius: "20px",
    border: "3px solid #A08963",
    padding: "20px",
    boxShadow: "0 12px 24px rgba(230, 226, 219, 0.3)",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    marginLeft: "20px",
    marginRight: "20px",
  },
  cardTitle: {
    color: "#213448",
    fontSize: "25px",
    marginBottom: "12px",
  },
  notesContainer: {
    flex: 1,
    overflowY: "auto",
    maxHeight: "200px",
  },
  centeredTitle: {
    textAlign: "center",
    color: "#213448",
    fontSize: "25px",
    marginBottom: "12px",
    marginTop: "80px",
  },
  centeredTitle2: {
    textAlign: "center",
    color: "#213448",
    fontSize: "25px",
    marginBottom: "12px",
    marginTop: "20px",
  },
  centeredContent: {
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    flexDirection: "column",
  },
  sayac: {
    fontSize: "70px",
    fontWeight: "bold",
    color: "#213448",
  },
  hastaButton: {
    marginTop: "20px",
    padding: "10px 16px",
    backgroundColor: "#213448",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
  },
  buttonSmall: {
    marginTop: "20px",
    padding: "10px 20px",
    backgroundColor: "#A08963",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    width: "100%",
  },
  graphContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
    flexDirection: "row",
    height: "100%",
    textAlign: "left",
  },
  legendList: {
    display: "flex",
    flexDirection: "column",
  },
  legendItem: {
    display: "flex",
    alignItems: "center",
    fontSize: "14px",
    marginBottom: "6px",
  },
  legendColor: {
    width: "14px",
    height: "14px",
    marginRight: "8px",
    borderRadius: "3px",
    display: "inline-block",
  },
};

export default DoktorGirisPage;