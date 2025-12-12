const participantSelect = document.getElementById("participantSelect");
const getAssignmentsBtn = document.getElementById("getAssignmentsBtn");
const resultDiv = document.getElementById("result");
const assignmentsList = document.getElementById("assignmentsList");
const errorDiv = document.getElementById("error");

// Admin elements
const adminTokenInput = document.getElementById("adminToken");
const adminResetBtn = document.getElementById("adminResetBtn");
const adminStatusDiv = document.getElementById("adminStatus");

const API_BASE = "";

// existing static middleware:
app.use(express.static(path.join(__dirname, "public")));

// ADD THIS RIGHT AFTER IT:
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// -----------------------------
//  On Page Load — Check Lock
// -----------------------------
window.addEventListener("DOMContentLoaded", () => {
  const lockedUser = localStorage.getItem("lockedUser");

  if (lockedUser) {
    participantSelect.value = lockedUser;
    participantSelect.disabled = true;
    participantSelect.classList.add("locked");
    getAssignmentsBtn.textContent = "View My Secret Santa Picks 🎁";

    // Auto-load their assignments
    fetchAssignments(lockedUser, false); // don't re-lock, just fetch
  }
});

// -----------------------------
//    Main Button Click
// -----------------------------
getAssignmentsBtn.addEventListener("click", () => {
  const participant = participantSelect.value;

  if (!participant) {
    showError("Please select your name first.");
    return;
  }

  const lockedUser = localStorage.getItem("lockedUser");
  if (lockedUser && lockedUser !== participant) {
    showError("You are locked to your original name.");
    participantSelect.value = lockedUser;
    return;
  }

  fetchAssignments(participant, true);
});

// -----------------------------
//      Fetch Assignments
// -----------------------------
async function fetchAssignments(participant, shouldLock) {
  clearError();
  hideResults();

  try {
    const response = await fetch(`${API_BASE}/api/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Error retrieving assignments");

    if (shouldLock) {
      localStorage.setItem("lockedUser", participant);
    }

    participantSelect.disabled = true;
    participantSelect.classList.add("locked");

    displayResults(data.assignments);
  } catch (err) {
    showError(err.message);
  }
}

// -----------------------------
//      UI Helper Functions
// -----------------------------
function displayResults(assignments) {
  assignmentsList.innerHTML = "";

  assignments.forEach((a) => {
    const li = document.createElement("li");
    li.textContent = `${a.recipient} – ${a.price_tier}`;
    assignmentsList.appendChild(li);
  });

  resultDiv.classList.remove("hidden");

  // Restart animation
  void resultDiv.offsetWidth;
  resultDiv.classList.add("visible");
}

function hideResults() {
  resultDiv.classList.add("hidden");
  resultDiv.classList.remove("visible");
}

function showError(msg) {
  errorDiv.textContent = msg;
  errorDiv.classList.remove("hidden");
}

function clearError() {
  errorDiv.textContent = "";
  errorDiv.classList.add("hidden");
}

// -----------------------------
//       Admin Reset Logic
// -----------------------------
if (adminResetBtn) {
  adminResetBtn.addEventListener("click", async () => {
    const token = adminTokenInput.value.trim();
    adminStatusDiv.textContent = "";
    adminStatusDiv.className = "admin-status";

    if (!token) {
      adminStatusDiv.textContent = "Please enter the admin password.";
      adminStatusDiv.classList.add("admin-status-error");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/admin/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reset assignments.");
      }

      // Clear local lock on this browser
      localStorage.removeItem("lockedUser");

      // Reset UI
      participantSelect.disabled = false;
      participantSelect.classList.remove("locked");
      participantSelect.value = "";
      hideResults();

      adminStatusDiv.textContent = "All assignments have been reset successfully.";
      adminStatusDiv.classList.add("admin-status-success");
      adminTokenInput.value = "";
    } catch (err) {
      adminStatusDiv.textContent = err.message;
      adminStatusDiv.classList.add("admin-status-error");
    }
  });
}

