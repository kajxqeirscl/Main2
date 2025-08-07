import React, { useState } from "react";
import { useNavigate } from "react-router-dom";


const LoginPage = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async () => {
    if (!username || !password) {
      setError("Lütfen kullanıcı adı ve şifreyi giriniz.");
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // Cookie veya oturum bilgisi gerekiyorsa
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setError("");
        localStorage.setItem("userName", username);
        onLogin(); // Kayıt sonrası login sayılırsa
        navigate("/");
      } else {
        setError(result.message || "Kayıt başarısız.");
      }
    } catch (error) {
      setError("Sunucuya bağlanılamadı.");
    }
  };


  const handleLogin = async () => {
    if (!username || !password) {
      setError("Lütfen kullanıcı adı ve şifreyi giriniz.");
      return;
    }

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",   // << bu satır eksik senin kodunda
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();

      if (result.success) {
        setError("");
        localStorage.setItem("userName", username);
        onLogin(); // Üst component'e haber ver
        navigate("/");
      } else {
        setError(result.message || "Giriş başarısız.");
      }
    } catch (error) {
      setError("Sunucuya bağlanılamadı.");
    }
  };
  

  return (
    <div style={styles.container}>
      <div
        style={{
          ...styles.card,
          ...(isHovered ? styles.cardHover : {}),
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <img src="/images/logo.png" alt="Logo" style={styles.logo} />
        <h3 style={styles.logoyazi}>FibroCheck</h3>
        <h2 style={styles.title}>"Bilim, Erken Teşhis ile Başlar!"</h2>
        <input
  type="text"
  placeholder="Kullanıcı Adı"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
  style={styles.input}
/>
<input
  type="password"
  placeholder="Şifre"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
  style={styles.input}
/>

{error && <div style={styles.errorText}>{error}</div>}

<div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
  <button onClick={handleLogin} style={styles.button}>
    Giriş Yap
  </button>
  <button onClick={handleRegister} style={styles.button}>
    Kayıt Ol
  </button>
</div>

<small style={styles.footerText}>© 2025 Fibrozis Tahmin Sistemi</small>

      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: "100vh",
    minWidth: "100%", 
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #e3d1b5ff 0%, #dce1e7 100%)",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
  },
  sideImage: {
    width: "300px",
    maxWidth: "90%",
    marginBottom: "30px",
    marginTop: "-30px",
  },
  card: {
    width: "100%",
    maxWidth: "450px",
    backgroundColor: "#edebebff", 
    padding: "40px",
    borderRadius: "25px",
    boxShadow: "0 12px 24pxrgba(91, 59, 7, 0.61)",
    border: "10px solid #A08963",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    transition: "transform 0.3s ease, box-shadow 0.3s ease",
    cursor: "default",
  },
  cardHover: {
    transform: "scale(1.05)",
    boxShadow: "0 15px 30px rgba(0, 0, 0, 0.2)",
    cursor: "pointer",
  },
  logo: {
    height: "85px",
    marginBottom: "-23px",
    border: "3px solid #A08963",
    borderRadius: "27px",
  },
  logoyazi: {
    marginBottom: "10px",
    color: "#213448",
    fontSize: "28px",
    fontWeight: "900",
  },
  title: {
    marginBottom: "25px",
    color: "#213448",
    fontSize: "24px",
    fontWeight: "540",
  },
  input: {
    width: "100%",
    padding: "12px",
    marginBottom: "15px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "14px",
    backgroundColor: "#f2f3f5",
    color: "#333",
    boxShadow: "inset 1px 1px 2px rgba(0,0,0,0.05)",
    transition: "border-color 0.3s ease",
  },
  button: {
    padding: "12px 20px",
    width: "100%",
    backgroundColor: "#213448",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontWeight: "700",
    cursor: "pointer",
    fontSize: "16px",
    marginTop: "10px",
    transition: "background-color 0.3s ease",
  },
  footerText: {
    marginTop: "20px",
    color: "#999",
    fontSize: "12px",
  },
  errorText: {
    color: "red",
    marginBottom: "10px",
    fontWeight: "bold",
    textAlign: "center",
    width: "100%",
  },
};

export default LoginPage; 