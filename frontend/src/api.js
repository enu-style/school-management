import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// Send the saved token with every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// An expired or invalid token sends the user back to the login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const onLogin = error.config?.url?.includes("/auth/login");
    if (
      error.response?.status === 401 &&
      !onLogin &&
      localStorage.getItem("token")
    ) {
      localStorage.clear();
      window.location.href = "/";
    }
    return Promise.reject(error);
  },
);

export default api;
