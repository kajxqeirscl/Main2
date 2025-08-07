import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PersonalInfoBar2 from "../components/PersonalInfoBar2";

const HastaListesiPage = () => {
  const [arama, setArama] = useState("");
  const [hastalar, setHastalar] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_URL}/patients`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        setHastalar(data);
      })
      .catch((error) => {
        console.error("Veri çekme hatası:", error);
      });
  }, []);

  const filtrelenmisHastalar = hastalar.filter((hasta) => {
    const adSoyad = `${hasta.ad} ${hasta.soyad}`.toLowerCase();
    return adSoyad.includes(arama.toLowerCase());
  });

  return (
    <div style={styles.page}>
      <PersonalInfoBar2 onLogout={() => navigate("/")} />

      <div style={styles.content}>
        <h2 style={styles.header}>
          Toplam Hasta Listesi
        </h2>

        <input
          type="text"
          placeholder="Ad Soyad'a göre ara..."
          value={arama}
          onChange={(e) => setArama(e.target.value)}
          className="notranslate"
          translate="no"
          style={styles.searchInput}
        />

        <div style={styles.tableWrapper}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Ad Soyad</th>
                <th style={styles.th}>TC</th>
                <th style={styles.th}>Evre</th>
              </tr>
            </thead>
            <tbody>
              {filtrelenmisHastalar.length > 0 ? (
                filtrelenmisHastalar.slice(0, 25).map((hasta, index) => (
                  <tr
                    key={index}
                    style={index % 2 === 0 ? styles.trEven : styles.trOdd}
                  >
                    <td style={styles.td} className="notranslate" translate="no">
                      {`${hasta.ad} ${hasta.soyad}`}
                    </td>
                    <td style={styles.td} className="notranslate" translate="no">
                      {hasta.tc}
                    </td>
                    <td style={styles.td} className="notranslate" translate="no">
                      {hasta.evre}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" style={styles.td} className="notranslate" translate="no">
                    Eşleşen hasta bulunamadı.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
  searchInput: {
    padding: "10px 15px",
    marginBottom: "20px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "16px",
    width: "100%",
    maxWidth: "400px",
  },
  tableWrapper: {
    overflowX: "auto",
    borderRadius: "8px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    backgroundColor: "white",
    borderRadius: "8px",
    overflow: "hidden",
  },
  th: {
    backgroundColor: "#213448",
    color: "white",
    padding: "12px",
    textAlign: "left",
    fontSize: "16px",
  },
  td: {
    padding: "12px",
    fontSize: "15px",
    borderBottom: "1px solid #ddd",
    color: "#333",
  },
  trEven: {
    backgroundColor: "#f9f9f9",
  },
  trOdd: {
    backgroundColor: "#ffffff",
  },
};

export default HastaListesiPage;
