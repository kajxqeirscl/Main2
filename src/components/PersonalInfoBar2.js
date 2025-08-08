import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiLogOut } from "react-icons/fi";
import { FaChevronDown, FaChevronUp } from "react-icons/fa";
import SystemInfoModal from "./SystemInfoModal";

const PersonalInfoBar2 = ({ onLogout }) => {
  const [userName, setUserName] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordPopup, setPasswordPopup] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();

  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const storedName = localStorage.getItem("userName");
    if (storedName) {
      setUserName(storedName);
    }
    const modalKey = `hasSeenSystemInfoModal_${storedName || "guest"}`;
    const hasSeenModal = localStorage.getItem(modalKey);
    if (!hasSeenModal) {
      setShowModal(true);
      localStorage.setItem(modalKey, "true");
    }

    // Add event listener for window resize
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener("resize", handleResize);

    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const firstLetter = userName?.charAt(0).toUpperCase();

  const handleCheckPassword = () => {
    if (password === "1234") {
      setPasswordPopup(false);
      setPassword("");
      setError("");
      // Corrected logic: user needs to be redirected to /doktor-giris after successful password check
      // However, it seems the current context is already DoktorGirisPage.
      // If this popup is for an *action* within DoktorGirisPage, you might not navigate away.
      // If it's for *entering* DoktorGirisPage from a different page, then this navigation is correct.
      // Assuming it's for an internal action, removing navigate for now.
      // If it's intended to navigate *back* to DoktorGirisPage after a password check from somewhere else, keep it.
      // For this component, it's likely part of the main app flow, so we'll keep it as a placeholder.
      navigate("/doktor-giris"); // Keeping original navigation for consistency with the provided code
    } else {
      setError("Şifre hatalı. Lütfen tekrar deneyin.");
    }
  };

  // Determine if it's a small screen
  const isSmallScreen = windowWidth <= 768; // You can adjust this breakpoint

  const handleLogout = () => {
    fetch(`${process.env.REACT_APP_API_URL}/logout`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          localStorage.removeItem("isLoggedIn");
          localStorage.removeItem("userName");
          setMenuOpen(false);
          onLogout();  // App.js'deki state'i güncelle
          navigate("/login");
        } else {
          alert("Çıkış yapılamadı, tekrar deneyin.");
        }
      })
      .catch(() => alert("Sunucu hatası, çıkış yapılamadı."));
  };

  return (
    <div
      style={{
        backgroundColor: "#213448",
        padding: isSmallScreen ? "10px 15px" : "10px 30px", // Less padding on small screens
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%", // Use 100% instead of 100vw for better responsiveness
        minHeight: "60px", // Use min-height, let it grow if content wraps
        boxSizing: "border-box",
        position: "relative",
        flexWrap: isSmallScreen ? "wrap" : "nowrap", // Allow items to wrap on small screens
        gap: isSmallScreen ? "10px" : "0", // Add gap between wrapped items
      }}
    >
      <img
        src="/images/istun.logo.white.png"
        alt="İstun Logo"
        style={{
          height: isSmallScreen ? "25px" : "35px", // Smaller logo on small screens
          transform: isSmallScreen ? "scale(1.5)" : "scale(1.8)",
          transformOrigin: "left center",
        }}
      />
      <div
        style={{
          flex: isSmallScreen ? "1 1 100%" : "0.35", // Takes full width on small screens
          textAlign: "center",
          fontStyle: "italic",
          fontSize: isSmallScreen ? "20px" : "35px", // Smaller font on small screens
          color: "#ffffffff",
          order: isSmallScreen ? 3 : "unset", // Move to bottom on small screens if wrapped
          marginTop: isSmallScreen ? "10px" : "0", // Add margin if wrapped
        }}
      >
        FibroCheck
      </div>
      <div
        style={{
          flex: isSmallScreen ? "1 1 100%" : "1", // Takes full width on small screens
          textAlign: "center",
          fontSize: isSmallScreen ? "16px" : "30px", // Smaller font on small screens
          color: "#ffffffff",
          order: isSmallScreen ? 4 : "unset", // Move to bottom on small screens if wrapped
          marginTop: isSmallScreen ? "5px" : "0", // Add margin if wrapped
        }}
      >
        Doktor Paneli
      </div>

      {/* Sağ: Kullanıcı menüsü */}
      <div
        style={{
          position: "relative",
          marginLeft: isSmallScreen ? "auto" : "0", // Push to right on small screens
          order: isSmallScreen ? 2 : "unset", // Order second on small screens (after logo)
        }}
      >
        <div
          onClick={() => setMenuOpen(!menuOpen)}
          style={{
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            backgroundColor: "#ffffff33",
            borderRadius: "20px",
            padding: "5px 10px",
          }}
        >
          <div
            style={{
              width: "30px",
              height: "30px",
              borderRadius: "50%",
              backgroundColor: "white",
              color: "#213448",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: "bold",
              fontSize: "14px",
              marginRight: "8px",
            }}
          >
            {firstLetter}
          </div>
          <div style={{ fontWeight: "bold", color: "white", marginRight: "5px" }}>
            {userName}
          </div>
          {menuOpen ? <FaChevronUp color="white" /> : <FaChevronDown color="white" />}
        </div>

        {menuOpen && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "100%",
              marginTop: "8px",
              backgroundColor: "white",
              color: "#213448",
              borderRadius: "8px",
              boxShadow: "0px 4px 12px rgba(0,0,0,0.15)",
              zIndex: 999,
              overflow: "hidden",
              minWidth: "170px",
            }}
          >
            <div
              style={menuItemStyle}
              onClick={() => {
                setMenuOpen(false); // Close menu after click
                navigate("/form");
              }}
            >
              👨‍⚕️ Ana Sayfa
            </div>
            <div
              style={menuItemStyle}
              onClick={() =>setShowModal(true)}
            >
           ❓ Yardım
            </div>
            <div
              style={{ ...menuItemStyle, color: "#c0392b", fontWeight: "bold" }}
              onClick={() => {
                setMenuOpen(false); 
                localStorage.removeItem("userName");
                onLogout();
                navigate("/login");
              }}
            >
              <FiLogOut style={{ marginRight: "6px" }} />
              Çıkış Yap
            </div>
          </div>
        )}
      </div>

      {/* Şifre Giriş Kutusu */}
      {passwordPopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px", // Add padding for small screens
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "30px",
              borderRadius: "10px",
              boxShadow: "0px 4px 12px rgba(0,0,0,0.2)",
              width: isSmallScreen ? "90%" : "300px", // Adjust width for small screens
              maxWidth: "300px", // Ensure it doesn't get too wide
              textAlign: "center",
              position: "relative",
            }}
          >
            {/* Çarpı butonu */}
            <button
              onClick={() => {
                setPassword("");
                setPasswordPopup(false);
                setError("");
              }}
              style={{
                position: "absolute",
                top: "10px",
                right: "10px",
                background: "transparent",
                border: "none",
                fontSize: "18px",
                cursor: "pointer",
                fontWeight: "bold",
                color: "#213448",
                lineHeight: 1,
              }}
              aria-label="Kapat"
            >
              ×
            </button>

            {/* Başlık */}
            <h3
              style={{
                marginBottom: "25px",
                fontWeight: "bold",
                fontSize: isSmallScreen ? "18px" : "20px", // Smaller font
                color: "#213448",
              }}
            >
              Lütfen şifrenizi giriniz
            </h3>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 4px",
                borderRadius: "8px",
                border: "1.5px solid #ccc",
                boxShadow: "0 2px 5px rgba(0, 0, 0, 0.1)",
                fontSize: "16px",
                fontWeight: "500",
                outline: "none",
                transition: "border-color 0.3s ease, box-shadow 0.3s ease",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#213448";
                e.target.style.boxShadow = "0 0 8px rgba(33, 52, 72, 0.6)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "#ccc";
                e.target.style.boxShadow = "0 2px 5px rgba(0, 0, 0, 0.1)";
              }}
            />

            {error && (
              <div style={{ color: "red", marginTop: "8px", fontSize: "14px" }}>
                {error}
              </div>
            )}
            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={handleCheckPassword}
                style={{
                  padding: "8px 16px",
                  borderRadius: "5px",
                  border: "none",
                  backgroundColor: "#213448",
                  color: "white",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Devam
              </button>
            </div>
          </div>
        </div>
      )}
      {showModal && <SystemInfoModal onClose={() => setShowModal(false)} />}
    </div>
  );
};

const menuItemStyle = {
  padding: "10px 16px",
  cursor: "pointer",
  borderBottom: "1px solid #eee",
  display: "flex",
  alignItems: "center",
  // Hover effect for menu items
  transition: "background-color 0.2s ease",
  "&:hover": {
    backgroundColor: "#f0f0f0", // Light grey on hover
  },
};

export default PersonalInfoBar2;