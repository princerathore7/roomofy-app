const API_BASE = "http://localhost:5000/api";

// ----- Login / Signup form toggle -----
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const showLoginBtn = document.getElementById("show-login");
const showSignupBtn = document.getElementById("show-signup");

showLoginBtn.addEventListener("click", () => {
  loginForm.classList.remove("hidden");
  signupForm.classList.add("hidden");
  clearMessages();
});
showSignupBtn.addEventListener("click", () => {
  signupForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  clearMessages();
});

function clearMessages() {
  document.getElementById("login-error").innerText = "";
  document.getElementById("signup-error").innerText = "";
}

// ----- Signup handler -----
signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mobile = document.getElementById("signup-mobile").value.trim();
  const password = document.getElementById("signup-password").value.trim();
  const errorEl = document.getElementById("signup-error");

  try {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Signup failed");

    // Store token and redirect to dashboard
    localStorage.setItem("token", data.token);
    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.innerText = err.message;
  }
});

// ----- Login handler -----
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const mobile = document.getElementById("login-mobile").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const errorEl = document.getElementById("login-error");

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Login failed");

    localStorage.setItem("token", data.token);
    localStorage.setItem("isAdmin", data.isAdmin);
    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.innerText = err.message;
  }
});
// ----- Dashboard logic -----
if (window.location.pathname.endsWith("dashboard.html")) {
  const token = localStorage.getItem("token");
  const isAdmin = localStorage.getItem("isAdmin") === "true";

  if (!token) {
    alert("Please login first!");
    window.location.href = "index.html";
  }

  const logoutBtn = document.getElementById("logout-btn");
  const roomsList = document.getElementById("rooms-list");
  const adminPanel = document.getElementById("admin-panel");
  const roomForm = document.getElementById("room-form");
  const roomError = document.getElementById("room-error");
  const roomSuccess = document.getElementById("room-success");

  // Show admin panel only for admins
  if (isAdmin) {
    adminPanel.classList.remove("hidden");
  }

  logoutBtn.addEventListener("click", () => {
    localStorage.clear();
    window.location.href = "index.html";
  });

  // Fetch rooms and display
  async function loadRooms() {
    try {
      const res = await fetch(`${API_BASE}/rooms`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch rooms");

      roomsList.innerHTML = "";
      if (data.rooms.length === 0) {
        roomsList.innerHTML = "<p>No rooms available.</p>";
        return;
      }
      data.rooms.forEach(room => {
        const roomDiv = document.createElement("div");
        roomDiv.className = "room-card";
        roomDiv.innerHTML = `
          <div class="room-title">${room.title}</div>
          <div>Location: ${room.location}</div>
          <div>Price: ₹${room.price}</div>
          <div>Description: ${room.description || "N/A"}</div>
        `;
        roomsList.appendChild(roomDiv);
      });
    } catch (err) {
      roomsList.innerHTML = `<p class="error-msg">${err.message}</p>`;
    }
  }

  loadRooms();

  // Admin add room form submit
  if (isAdmin) {
    roomForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      roomError.innerText = "";
      roomSuccess.innerText = "";

      const title = document.getElementById("room-title").value.trim();
      const location = document.getElementById("room-location").value.trim();
      const price = Number(document.getElementById("room-price").value);
      const description = document.getElementById("room-description").value.trim();

      if (!title || !location || !price) {
        roomError.innerText = "Title, location and price are required.";
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/rooms`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ title, location, price, description }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to add room");

        roomSuccess.innerText = "Room added successfully!";
        roomForm.reset();
        loadRooms();
      } catch (err) {
        roomError.innerText = err.message;
      }
    });
  }
}
