import { createContext, useContext, useState } from "react";

const AuthContext = createContext(null);

const VALID_IDS = ["T01","T02","T03","T04","T05","T06","T07","T08","T09","T10","P01"];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("auth_user");
    try {
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      console.error("Failed to parse auth_user from localStorage", e);
      return null;
    }
  });

  const login = (id) => {
    const upperId = id.toUpperCase().trim();
    if (!VALID_IDS.includes(upperId)) return false;
    const userData = { id: upperId, role: upperId === "P01" ? "principal" : "teacher" };
    localStorage.setItem("auth_user", JSON.stringify(userData));
    setUser(userData);
    return true;
  };

  const logout = () => {
    localStorage.removeItem("auth_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
