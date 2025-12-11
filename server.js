// server.js

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();

// Use host-provided port (for Render, etc.) or 3000 locally
const PORT = process.env.PORT || 3000;

// Participants (also the only recipients)
const PARTICIPANTS = ["David", "Rocio", "Dana", "Gianna"];

// Fixed price tiers
const PRICE_TIERS = ["$50+", "$25", "$15"];

/**
 * BASE MASTER TEMPLATE (using "logical" people/tier labels).
 *
 * This is a *pattern* that satisfies all constraints:
 * - Each participant gives to the other 3 people, once at each price tier.
 * - Each recipient gets one of each price tier.
 * - No self-assignments.
 *
 * We'll RANDOMIZE a new round by:
 * - Randomly permuting the people labels (rename everyone).
 * - Randomly permuting the price tiers globally.
 * That gives us a new valid scheme each time we reset, while keeping rules intact.
 */
const BASE_MASTER = {
  David: [
    { recipient: "Rocio",  price_tier: "$50+" },
    { recipient: "Dana",   price_tier: "$25" },
    { recipient: "Gianna", price_tier: "$15" }
  ],
  Rocio: [
    { recipient: "Dana",   price_tier: "$50+" },
    { recipient: "Gianna", price_tier: "$25" },
    { recipient: "David",  price_tier: "$15" }
  ],
  Dana: [
    { recipient: "Gianna", price_tier: "$50+" },
    { recipient: "David",  price_tier: "$25" },
    { recipient: "Rocio",  price_tier: "$15" }
  ],
  Gianna: [
    { recipient: "David",  price_tier: "$50+" },
    { recipient: "Rocio",  price_tier: "$25" },
    { recipient: "Dana",   price_tier: "$15" }
  ]
};

// Simple admin reset token – change this to whatever you like
const ADMIN_RESET_TOKEN = "SECRETSANTA2024";

// ---------- Middleware ----------
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend (index.html, styles.css, script.js) from /public
app.use(express.static(path.join(__dirname, "public")));

// ---------- Database setup ----------
const db = new sqlite3.Database(path.join(__dirname, "secret_santa.db"));

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant TEXT NOT NULL,
      recipient TEXT NOT NULL,
      price_tier TEXT NOT NULL
    )
  `);
});

// ---------- Helper: shuffle array (Fisher–Yates) ----------
function shuffle(array) {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Generate a full randomized assignment set for the whole group.
 * Returns an array of 12 objects: { participant, recipient, price_tier }
 *
 * Logic:
 * - Start from BASE_MASTER (which is valid).
 * - Randomly permute participant names and recipient names with the same permutation.
 * - Randomly permute price tiers globally.
 * - This keeps all constraints intact but gives a different layout each round.
 */
function generateRandomAssignments() {
  const baseNames = PARTICIPANTS; // ["David", "Rocio", "Dana", "Gianna"]
  const baseTiers = PRICE_TIERS;  // ["$50+", "$25", "$15"]

  // Random permutation of participant/recipient labels
  const permutedNames = shuffle(baseNames);
  const nameMap = {};
  baseNames.forEach((name, idx) => {
    nameMap[name] = permutedNames[idx];
  });

  // Random permutation of price tiers
  const permutedTiers = shuffle(baseTiers);
  const tierMap = {};
  baseTiers.forEach((tier, idx) => {
    tierMap[tier] = permutedTiers[idx];
  });

  const allAssignments = [];

  baseNames.forEach((baseParticipant) => {
    const baseRows = BASE_MASTER[baseParticipant];
    baseRows.forEach((row) => {
      allAssignments.push({
        participant: nameMap[baseParticipant],
        recipient: nameMap[row.recipient],
        price_tier: tierMap[row.price_tier]
      });
    });
  });

  return allAssignments;
}

// ---------- API ROUTES ----------

// Get list of participants (optional, for dynamic dropdowns)
app.get("/api/participants", (req, res) => {
  res.json({ participants: PARTICIPANTS });
});

// Get or create assignments for a participant
app.post("/api/assign", (req, res) => {
  const participant = req.body.participant;

  if (!participant || !PARTICIPANTS.includes(participant)) {
    return res.status(400).json({ error: "Invalid or missing participant." });
  }

  // 1) Does this participant already have 3 assignments?
  db.all(
    "SELECT recipient, price_tier FROM assignments WHERE participant = ?",
    [participant],
    (err, rows) => {
      if (err) {
        console.error("DB error (lookup participant):", err);
        return res.status(500).json({ error: "Database error." });
      }

      if (rows && rows.length === 3) {
        // Already assigned earlier in this round – just return them.
        return res.json({
          participant,
          assignments: rows
        });
      }

      // 2) Participant not yet assigned – check if a round already exists.
      db.get(
        "SELECT COUNT(*) AS count FROM assignments",
        [],
        (err2, countRow) => {
          if (err2) {
            console.error("DB error (count assignments):", err2);
            return res.status(500).json({ error: "Database error." });
          }

          const totalCount = countRow.count;

          if (totalCount === 0) {
            // 3a) No assignments exist yet – generate a brand new RANDOM round.
            const allAssignments = generateRandomAssignments();

            const stmt = db.prepare(
              "INSERT INTO assignments (participant, recipient, price_tier) VALUES (?, ?, ?)"
            );

            db.serialize(() => {
              allAssignments.forEach((a) => {
                stmt.run([a.participant, a.recipient, a.price_tier]);
              });

              stmt.finalize((err3) => {
                if (err3) {
                  console.error("DB insert error:", err3);
                  return res
                    .status(500)
                    .json({ error: "Failed to save assignments." });
                }

                // Filter this participant's assignments from the newly created set
                const myAssignments = allAssignments.filter(
                  (a) => a.participant === participant
                );

                if (myAssignments.length !== 3) {
                  console.error(
                    "Logic error: participant assignments not found after insert."
                  );
                  return res
                    .status(500)
                    .json({ error: "Failed to retrieve assignments." });
                }

                return res.json({
                  participant,
                  assignments: myAssignments
                });
              });
            });
          } else {
            // 3b) A round already exists, but this participant somehow has no entries.
            // This should not normally happen, but we handle it safely.
            db.all(
              "SELECT recipient, price_tier FROM assignments WHERE participant = ?",
              [participant],
              (err3, newRows) => {
                if (err3) {
                  console.error(
                    "DB error (fetch existing round for participant):",
                    err3
                  );
                  return res.status(500).json({ error: "Database error." });
                }

                if (!newRows || newRows.length === 0) {
                  return res.status(409).json({
                    error:
                      "Assignments already exist for this round, but none were found for you. " +
                      "Admin may need to reset."
                  });
                }

                return res.json({
                  participant,
                  assignments: newRows
                });
              }
            );
          }
        }
      );
    }
  );
});

// Debug: get all assignments
app.get("/api/all-assignments", (req, res) => {
  db.all(
    "SELECT participant, recipient, price_tier FROM assignments ORDER BY participant, recipient",
    [],
    (err, rows) => {
      if (err) {
        console.error("DB error (all-assignments):", err);
        return res.status(500).json({ error: "Database error." });
      }
      res.json({ assignments: rows });
    }
  );
});

// Admin: reset all assignments
app.post("/api/admin/reset", (req, res) => {
  const { token } = req.body;

  if (!token || token !== ADMIN_RESET_TOKEN) {
    return res.status(403).json({ error: "Invalid admin token." });
  }

  db.run("DELETE FROM assignments", [], function (err) {
    if (err) {
      console.error("Reset error:", err);
      return res.status(500).json({ error: "Failed to reset assignments." });
    }

    console.log("All assignments deleted by admin reset.");
    res.json({ success: true, message: "All assignments have been reset." });
  });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
  console.log(`Secret Santa app listening on port ${PORT}`);
});
