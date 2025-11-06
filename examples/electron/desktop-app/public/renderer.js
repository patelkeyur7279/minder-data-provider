// Electron Desktop App - Renderer Process
// This file runs in the renderer process and handles UI interactions

// Check if electronAPI is available
if (!window.electronAPI) {
  console.error(
    "electronAPI is not available. Make sure preload script is loaded."
  );
}

// State
let currentView = "dashboard";
let currentFile = null;
let fileContent = "";

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  console.log("Renderer process initialized");

  // Set up navigation
  setupNavigation();

  // Set up window controls
  setupWindowControls();

  // Load dashboard data
  loadDashboardData();

  // Set up event handlers
  setupEventHandlers();

  // Display platform info
  displayPlatformInfo();
});

// Navigation
function setupNavigation() {
  const navItems = document.querySelectorAll(".nav-item");

  navItems.forEach((item) => {
    item.addEventListener("click", () => {
      const viewName = item.getAttribute("data-view");
      switchView(viewName);

      // Update active state
      navItems.forEach((nav) => nav.classList.remove("active"));
      item.classList.add("active");
    });
  });
}

function switchView(viewName) {
  // Hide all views
  const views = document.querySelectorAll(".view");
  views.forEach((view) => view.classList.remove("active"));

  // Show selected view
  const selectedView = document.getElementById(`${viewName}-view`);
  if (selectedView) {
    selectedView.classList.add("active");
    currentView = viewName;

    // Load data for the view
    loadViewData(viewName);
  }
}

function loadViewData(viewName) {
  switch (viewName) {
    case "dashboard":
      loadDashboardData();
      break;
    case "users":
      loadUsers();
      break;
    case "products":
      loadProducts();
      break;
    case "files":
      // Files view doesn't load data automatically
      break;
    case "settings":
      loadSettings();
      break;
  }
}

// Dashboard
async function loadDashboardData() {
  showLoading("Loading dashboard data...");

  try {
    // Load users count
    const usersResponse = await window.electronAPI.api.get("/users");
    const users = usersResponse.data || [];
    document.getElementById("users-count").textContent = users.length;

    // Load products count
    const productsResponse = await window.electronAPI.api.get("/products");
    const products = productsResponse.data || [];
    document.getElementById("products-count").textContent = products.length;

    // Load posts count
    const postsResponse = await window.electronAPI.api.get("/posts");
    const posts = postsResponse.data || [];
    document.getElementById("posts-count").textContent = posts.length;

    hideLoading();
    showToast("Dashboard data loaded successfully", "success");
  } catch (error) {
    console.error("Error loading dashboard data:", error);
    hideLoading();
    showToast("Error loading dashboard data: " + error.message, "error");
  }
}

// Users
async function loadUsers() {
  showLoading("Loading users...");

  try {
    const response = await window.electronAPI.api.get("/users");
    const users = response.data || [];

    const usersList = document.getElementById("users-list");

    if (users.length === 0) {
      usersList.innerHTML = '<p class="text-muted">No users found.</p>';
    } else {
      usersList.innerHTML = users
        .map(
          (user) => `
        <div class="data-item">
          <h3>${user.name || "Unknown User"}</h3>
          <p><strong>Email:</strong> ${user.email || "N/A"}</p>
          <p><strong>Username:</strong> ${user.username || "N/A"}</p>
          ${user.phone ? `<p><strong>Phone:</strong> ${user.phone}</p>` : ""}
          ${
            user.website
              ? `<p><strong>Website:</strong> ${user.website}</p>`
              : ""
          }
        </div>
      `
        )
        .join("");
    }

    hideLoading();
    showToast(`Loaded ${users.length} users`, "success");
  } catch (error) {
    console.error("Error loading users:", error);
    hideLoading();
    showToast("Error loading users: " + error.message, "error");
  }
}

// Products
async function loadProducts() {
  showLoading("Loading products...");

  try {
    const response = await window.electronAPI.api.get("/products");
    const products = response.data || [];

    const productsGrid = document.getElementById("products-grid");

    if (products.length === 0) {
      productsGrid.innerHTML = '<p class="text-muted">No products found.</p>';
    } else {
      productsGrid.innerHTML = products
        .map(
          (product) => `
        <div class="product-card">
          <img src="${
            product.image || "https://via.placeholder.com/250x180?text=No+Image"
          }" 
               alt="${product.title || "Product"}" 
               class="product-image"
               onerror="this.src='https://via.placeholder.com/250x180?text=No+Image'">
          <div class="product-info">
            <div class="product-title">${
              product.title || "Untitled Product"
            }</div>
            <div class="product-price">$${product.price || "0.00"}</div>
            <span class="product-category">${
              product.category || "Uncategorized"
            }</span>
          </div>
        </div>
      `
        )
        .join("");
    }

    hideLoading();
    showToast(`Loaded ${products.length} products`, "success");
  } catch (error) {
    console.error("Error loading products:", error);
    hideLoading();
    showToast("Error loading products: " + error.message, "error");
  }
}

// File Operations
async function openFile() {
  try {
    const result = await window.electronAPI.file.openDialog();

    if (result.canceled || !result.filePath) {
      return;
    }

    currentFile = result.filePath;

    showLoading("Reading file...");
    const content = await window.electronAPI.file.read(currentFile);
    fileContent = content;

    // Display file info
    document.getElementById("file-path").textContent = currentFile;
    document.getElementById("file-content").textContent = content;

    hideLoading();
    showToast("File opened successfully", "success");
  } catch (error) {
    console.error("Error opening file:", error);
    hideLoading();
    showToast("Error opening file: " + error.message, "error");
  }
}

async function saveFile() {
  try {
    const result = await window.electronAPI.file.saveDialog();

    if (result.canceled || !result.filePath) {
      return;
    }

    const content = document.getElementById("file-content").textContent;

    showLoading("Saving file...");
    await window.electronAPI.file.write(result.filePath, content);

    currentFile = result.filePath;
    document.getElementById("file-path").textContent = currentFile;

    hideLoading();
    showToast("File saved successfully", "success");
  } catch (error) {
    console.error("Error saving file:", error);
    hideLoading();
    showToast("Error saving file: " + error.message, "error");
  }
}

// Settings & Storage
async function loadSettings() {
  try {
    // Load API base URL from storage
    const apiUrl = await window.electronAPI.storage.get("apiBaseUrl");
    if (apiUrl) {
      document.getElementById("api-url").value = apiUrl;
    }

    // Get app info
    const appInfo = await window.electronAPI.app.getInfo();
    document.getElementById(
      "app-version-info"
    ).textContent = `v${appInfo.version} - ${appInfo.platform}`;
  } catch (error) {
    console.error("Error loading settings:", error);
  }
}

async function saveApiUrl() {
  const apiUrl = document.getElementById("api-url").value;

  if (!apiUrl) {
    showToast("Please enter an API URL", "error");
    return;
  }

  try {
    await window.electronAPI.storage.set("apiBaseUrl", apiUrl);
    showToast("API URL saved successfully", "success");
  } catch (error) {
    console.error("Error saving API URL:", error);
    showToast("Error saving API URL: " + error.message, "error");
  }
}

async function clearStorage() {
  if (!confirm("Are you sure you want to clear all stored data?")) {
    return;
  }

  try {
    await window.electronAPI.storage.clear();
    document.getElementById("api-url").value = "";
    showToast("Storage cleared successfully", "success");
  } catch (error) {
    console.error("Error clearing storage:", error);
    showToast("Error clearing storage: " + error.message, "error");
  }
}

// Platform Info
function displayPlatformInfo() {
  const platformInfo = document.getElementById("platform-info");
  if (platformInfo) {
    platformInfo.innerHTML = `
      <div><strong>Platform:</strong> ${window.electronAPI.platform}</div>
      <div><strong>Electron:</strong> ${window.electronAPI.versions.electron}</div>
      <div><strong>Chrome:</strong> ${window.electronAPI.versions.chrome}</div>
      <div><strong>Node:</strong> ${window.electronAPI.versions.node}</div>
    `;
  }
}

// Event Handlers
function setupEventHandlers() {
  // Dashboard actions
  const refreshDashboardBtn = document.getElementById("refresh-dashboard");
  if (refreshDashboardBtn) {
    refreshDashboardBtn.addEventListener("click", loadDashboardData);
  }

  const testApiBtn = document.getElementById("test-api");
  if (testApiBtn) {
    testApiBtn.addEventListener("click", testApiConnection);
  }

  // Users actions
  const refreshUsersBtn = document.getElementById("refresh-users");
  if (refreshUsersBtn) {
    refreshUsersBtn.addEventListener("click", loadUsers);
  }

  // Products actions
  const refreshProductsBtn = document.getElementById("refresh-products");
  if (refreshProductsBtn) {
    refreshProductsBtn.addEventListener("click", loadProducts);
  }

  // File actions
  const openFileBtn = document.getElementById("open-file");
  if (openFileBtn) {
    openFileBtn.addEventListener("click", openFile);
  }

  const saveFileBtn = document.getElementById("save-file");
  if (saveFileBtn) {
    saveFileBtn.addEventListener("click", saveFile);
  }

  // Settings actions
  const saveApiUrlBtn = document.getElementById("save-api-url");
  if (saveApiUrlBtn) {
    saveApiUrlBtn.addEventListener("click", saveApiUrl);
  }

  const clearStorageBtn = document.getElementById("clear-storage");
  if (clearStorageBtn) {
    clearStorageBtn.addEventListener("click", clearStorage);
  }
}

async function testApiConnection() {
  showLoading("Testing API connection...");

  try {
    const response = await window.electronAPI.api.get("/users?_limit=1");
    hideLoading();

    if (response.data) {
      showToast("API connection successful!", "success");
      await window.electronAPI.notification.show(
        "API Connected",
        "Successfully connected to the API"
      );
    } else {
      showToast("API returned no data", "info");
    }
  } catch (error) {
    console.error("Error testing API:", error);
    hideLoading();
    showToast("API connection failed: " + error.message, "error");
  }
}

// Window Controls
function setupWindowControls() {
  const minimizeBtn = document.getElementById("minimize-btn");
  const maximizeBtn = document.getElementById("maximize-btn");
  const closeBtn = document.getElementById("close-btn");

  if (minimizeBtn) {
    minimizeBtn.addEventListener("click", () => {
      window.electronAPI.window.minimize();
    });
  }

  if (maximizeBtn) {
    maximizeBtn.addEventListener("click", () => {
      window.electronAPI.window.maximize();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      window.electronAPI.window.close();
    });
  }
}

// Loading Overlay
function showLoading(message = "Loading...") {
  const overlay = document.getElementById("loading-overlay");
  const loadingMessage = document.getElementById("loading-message");

  if (overlay) {
    overlay.style.display = "flex";
  }

  if (loadingMessage) {
    loadingMessage.textContent = message;
  }
}

function hideLoading() {
  const overlay = document.getElementById("loading-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }
}

// Toast Notifications
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icon = type === "success" ? "✓" : type === "error" ? "✕" : "ℹ";

  toast.innerHTML = `
    <span style="font-size: 20px;">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  // Auto remove after 4 seconds
  setTimeout(() => {
    toast.style.animation = "slideOut 0.3s forwards";
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 4000);
}

// Add slideOut animation
const style = document.createElement("style");
style.textContent = `
  @keyframes slideOut {
    to { transform: translateX(400px); opacity: 0; }
  }
`;
document.head.appendChild(style);

// Global error handler
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
  showToast("An error occurred: " + event.error.message, "error");
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  showToast("An error occurred: " + event.reason, "error");
});

console.log("Renderer process ready");
