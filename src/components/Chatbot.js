import React, { useState, useRef, useEffect } from "react";

const Chatbot = () => {
  const userName = localStorage.getItem("userName") || "guest";

  const generateNewChatKey = () => {
    const now = new Date();
    const dateStr = now.toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).replace(/[.: ]/g, "-");
    return `chatbotMessages_${userName}_${dateStr}`;
  };

  const [currentKey, setCurrentKey] = useState(generateNewChatKey());
  const [chatMessages, setChatMessages] = useState(() => {
    const existing = localStorage.getItem(currentKey);
    if (existing) return JSON.parse(existing);
    return [{ sender: "bot", text: "Merhaba! Size nasıl yardımcı olabilirim?", time: Date.now() }];
  });

  const [chatInput, setChatInput] = useState("");
  const [theme, setTheme] = useState("light");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(currentKey, JSON.stringify(chatMessages));
  }, [chatMessages, currentKey]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [chatMessages, isTyping]);

  const getAllUserChatKeys = () => {
    return Object.keys(localStorage)
      .filter(key => key.startsWith(`chatbotMessages_${userName}_`))
      .sort()
      .reverse();
  };

  const [chatHistoryKeys, setChatHistoryKeys] = useState(getAllUserChatKeys());

  const loadChat = (key) => {
    const messages = JSON.parse(localStorage.getItem(key)) || [];
    setChatMessages(messages);
    setCurrentKey(key);
  };

  const formatTime = (time) => {
    const d = new Date(time);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { sender: "user", text: chatInput, time: Date.now() };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setIsTyping(true);

    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage.text }),
      });

      const data = await response.json();
      const botMessage = {
        sender: "bot",
        text: data.error ? `Üzgünüm, cevap alınamadı: ${data.error}` : data.response,
        time: Date.now(),
      };

      setTimeout(() => {
        setChatMessages(prev => [...prev, botMessage]);
        setIsTyping(false);
      }, 1200);
    } catch (error) {
      setChatMessages(prev => [...prev, {
        sender: "bot",
        text: "Bir hata oluştu: " + error.message,
        time: Date.now(),
      }]);
      setIsTyping(false);
    }
  };

  const startNewChat = () => {
    const newKey = generateNewChatKey();
    setCurrentKey(newKey);
    setChatMessages([
      { sender: "bot", text: "Yeni sohbet başlatıldı. Size nasıl yardımcı olabilirim?", time: Date.now() }
    ]);
    setChatHistoryKeys(getAllUserChatKeys());
  };

  return (
    <>
      <button onClick={() => setIsChatOpen(true)} title="Chatbot"
        style={{
          position: "fixed", bottom: "32px", right: "32px", zIndex: 100,
          background: "#1e293b", color: "white", borderRadius: "50%",
          width: "74px", height: "74px", fontSize: "28px", border: "none",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.68)", cursor: "pointer"
        }}>
        <img src="/images/assistant.png" alt="Asistan"
          style={{ width: "40px", height: "40px", marginTop: "7px", marginLeft: "6px" }} />
      </button>

      {isChatOpen && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)",
          backdropFilter: "blur(4px)", zIndex: 101,
          display: "flex", justifyContent: "center", alignItems: "center",
        }}>
          <div style={{
            width: "800px", height: "600px",
            background: theme === "light" ? "#fff" : "#2f2f2f",
            color: theme === "light" ? "#000" : "#f0e6d2",
            borderRadius: "20px", display: "flex", overflow: "hidden",
            boxShadow: "0 10px 30px rgba(0,0,0,0.15)",
            border: theme === "dark" ? "1px solid #948979" : "none"
          }}>
            {/* Sol Panel */}
            <div style={{
              width: "200px",
              background: theme === "light" ? "#94B4C1" : "#948979",
              borderRight: theme === "dark" ? "1px solid #948979" : "1px solid #213448",
              padding: "0",
              overflowY: "auto"
            }}>
              <div style={{
                background: theme === "light" ? "#213448" : "#2a2a2a",
                color: "white",
                height: "36px",
                padding: "10px",
                fontWeight: "bold",
                fontSize: "14px",
                borderBottom: theme === "dark" ? "1px solid #948979" : "1px solid #444",
                textAlign: "center"
              }}>
                Sohbet Geçmişi
              </div>

              <div style={{ padding: "10px" }}>
                <button onClick={startNewChat} style={{
                  background: "#213448", color: "white", border: "none",
                  padding: "6px 12px", borderRadius: "8px", marginBottom: "10px",
                  cursor: "pointer", fontSize: "13px", width: "100%"
                }}>
                  + Yeni Sohbet
                </button>

                {chatHistoryKeys.map((key, idx) => (
                  <div key={idx} style={{
                    background: key === currentKey ? "#cbd5e1" : "#213448",
                    padding: "6px", marginBottom: "5px",
                    borderRadius: "6px", fontSize: "13px",
                    display: "flex", justifyContent: "space-between",
                    alignItems: "center", cursor: "pointer",
                    border: theme === "dark" ? "1px solid #948979" : "none"
                  }}>
                    <span onClick={() => loadChat(key)} style={{ flex: 1 }}>
                      {key.replace(`chatbotMessages_${userName}_`, "").replace(/-/g, ":")}
                    </span>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      localStorage.removeItem(key);
                      const updatedKeys = getAllUserChatKeys();
                      setChatHistoryKeys(updatedKeys);
                      if (key === currentKey) {
                        if (updatedKeys.length > 0) {
                          loadChat(updatedKeys[0]);
                        } else {
                          startNewChat();
                        }
                      }
                    }} style={{
                      background: "#213448",
                      color: "white",
                      border: "none",
                      borderRadius: "4px",
                      padding: "2px 6px",
                      fontSize: "12px",
                      marginLeft: "6px",
                      cursor: "pointer"
                    }}>
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Sağ Panel */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{
                padding: "14px",
                background: "#1e293b",
                color: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: theme === "dark" ? "1px solid #948979" : "none"
              }}>
                <span style={{ fontSize: "18px", fontWeight: "bold" }}>Sohbet Asistanı</span>
                <div>
                  <button onClick={() => setTheme(prev => prev === "light" ? "dark" : "light")}
                    style={{
                      background: theme === "light" ? "#94B4C1" : "#5a4a2e",
                      color: "white", border: "none", padding: "6px 10px",
                      borderRadius: "8px", marginRight: "10px", cursor: "pointer"
                    }}>
                    {theme === "light" ? "Karanlık Mod" : "Açık Mod"}
                  </button>
                  <button onClick={() => setIsChatOpen(false)}
                    style={{
                      background: "transparent", color: "#f9f4ec",
                      border: "none", fontSize: "20px", cursor: "pointer"
                    }}>✖</button>
                </div>
              </div>

              <div ref={messagesEndRef} style={{
                flex: 1, overflowY: "auto", padding: "16px",
                background: theme === "light" ? "#fff" : "#2c3e50"
              }}>
                {chatMessages.map((msg, idx) => (
                  <div key={idx} style={{
                    display: "flex",
                    flexDirection: msg.sender === "user" ? "row-reverse" : "row",
                    alignItems: "flex-start",
                    marginBottom: "12px",
                  }}>
                    <img
                      src={msg.sender === "user" ? "/images/doctor.png" : "/images/assistant.png"}
                      alt={msg.sender}
                      style={{
                        width: "36px", height: "36px", borderRadius: "50%",
                        marginLeft: msg.sender === "user" ? "12px" : "0",
                        marginRight: msg.sender === "user" ? "0" : "12px",
                      }}
                    />
                    <div style={{
                      backgroundColor: msg.sender === "user"
                        ? (theme === "light" ? "#94B4C1" : "#8b6f5c")
                        : (theme === "light" ? "#a6a6a8" : "#34495e"),
                      color: theme === "light" ? "#000" : "#f0e6d2",
                      padding: "10px 14px", borderRadius: "18px",
                      maxWidth: "75%", fontSize: "14px",
                      boxShadow: "0 1px 5px rgba(0,0,0,0.1)",
                      border: theme === "dark" ? "1px solid #948979" : "none"
                    }}>
                      {msg.text}
                      <div style={{ fontSize: "11px", textAlign: "right", marginTop: "4px", opacity: 0.6 }}>
                        {formatTime(msg.time)}
                      </div>
                    </div>
                  </div>
                ))}
                {isTyping && <div style={{ fontStyle: "italic", color: "#aaa", paddingLeft: "16px" }}>Asistan yazıyor...</div>}
              </div>

              <div style={{
                display: "flex",
                borderTop: theme === "dark" ? "1px solid #948979" : "1px solid #213448",
                padding: "12px",
                background: theme === "light" ? "#fff" : "#213448"
              }}>
                <input
                  type="text"
                  placeholder="Mesajınızı yazın..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSendMessage(); }}
                  style={{
                    flex: 1, padding: "10px", borderRadius: "10px",
                    border: theme === "dark" ? "1px solid #948979" : "1px solid #213448",
                    backgroundColor: "inherit",
                    color: "inherit", fontSize: "14px"
                  }}
                />
                <button onClick={handleSendMessage}
                  style={{
                    marginLeft: "8px", padding: "10px 14px",
                    background: theme === "light" ? "#1e293b" : "#5a4a2e",
                    color: "#fff", border: "none", borderRadius: "10px",
                    cursor: "pointer"
                  }}>
                  Gönder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;
