const participantSelect = document.getElementById("participantSelect");
const getAssignmentsBtn = document.getElementById("getAssignmentsBtn");
const resultDiv = document.getElementById("result");
const assignmentsList = document.getElementById("assignmentsList");
const errorDiv = document.getElementById("error");

// Admin elements
const adminTokenInput = document.getElementById("adminToken");
const adminResetBtn = document.getElementById("adminResetBtn");
const adminStatusDiv = document.getElementById("adminStatus");

// -----------------------------
// Page Load – Lock check
// -----------------------------
window.addEventListener("DOMContentLoaded", () => {
  const lockedUser = localStorage.getItem("lockedUser");
  if (lockedUser) {
    participantSelect.value = lockedUser;
    participantSelect.disabled = true;
    getAssignmentsBtn.textContent = "View My Secret Santa Picks 🎁";
    fetchAssignments(lockedUser);
  }
});

// -----------------------------
// Main button click
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

  fetchAssignments(participant);
});

// -----------------------------
// Fetch assignments
// -----------------------------
async function fetchAssignments(participant) {
  clearError();
  hideResults();

  try {
    const response = await fetch("/api/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to fetch assignments");

    localStorage.setItem("lockedUser", participant);
    participantSelect.disabled = true;

    displayResults(data.assignments);
  } catch (err) {
    showError(err.message);
  }
}

// -----------------------------
// Display helpers
// -----------------------------
function displayResults(assignments) {
  assignmentsList.innerHTML = "";

  assignments.forEach(a => {
    const li = document.createElement("li");
    li.textContent = `${a.recipient} – ${a.price_tier}`;
    assignmentsList.appendChild(li);
  });

  resultDiv.classList.remove("hidden");
  void resultDiv.offsetWidth; // restart animation
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
// Admin reset
// -----------------------------
if (adminResetBtn) {
  adminResetBtn.addEventListener("click", async () => {
    const token = adminTokenInput.value.trim();
    adminStatusDiv.textContent = "";

    if (!token) {
      adminStatusDiv.textContent = "Enter admin password.";
      return;
    }

    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Reset failed");

      localStorage.removeItem("lockedUser");
      participantSelect.disabled = false;
      participantSelect.value = "";
      hideResults();

      adminStatusDiv.textContent = "Assignments reset successfully.";
      adminTokenInput.value = "";
    } catch (err) {
      adminStatusDiv.textContent = err.message;
    }
  });
}
